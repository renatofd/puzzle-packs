import { describe, expect, it } from 'vitest';
import { Analytics, milestone } from '../games/puzzle-packs/analytics';
import { createGame } from '../games/puzzle-packs/game';
import { Portal, cleanMeasure, type PokiSDKApi } from '../games/puzzle-packs/portal';
import { Tutorial, type TutorialUi } from '../games/puzzle-packs/tutorial';

/** PokiSDK falso: registra as chamadas e deixa o teste controlar os anúncios. */
function fakeSdk(opts: { initFails?: boolean; rewardOk?: boolean } = {}) {
  const calls: string[] = [];
  let finishAd: (() => void) | null = null;
  const sdk: PokiSDKApi = {
    init: () => (opts.initFails ? Promise.reject(new Error('adblock')) : Promise.resolve()),
    gameLoadingFinished: () => void calls.push('gameLoadingFinished'),
    gameplayStart: () => void calls.push('gameplayStart'),
    gameplayStop: () => void calls.push('gameplayStop'),
    commercialBreak: (before) => {
      calls.push('commercialBreak');
      before?.();
      return new Promise<void>((r) => (finishAd = r));
    },
    rewardedBreak: (before) => {
      calls.push('rewardedBreak');
      before?.();
      return new Promise<boolean>((r) => (finishAd = () => r(opts.rewardOk ?? true)));
    },
    measure: (c, w, a) => void calls.push(`measure:${c}/${w}/${a}`),
  };
  return { sdk, calls, finish: () => finishAd?.() };
}

async function setup(opts?: Parameters<typeof fakeSdk>[0]) {
  const f = fakeSdk(opts);
  const portal = new Portal();
  await portal.init(f.sdk);
  return { ...f, portal };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Puzzle Packs: PokiSDK', () => {
  it('gameplayStart só sai depois do carregamento e do primeiro toque', async () => {
    const { portal, calls } = await setup();
    portal.gameplayStart();
    expect(calls).toEqual([]);
    portal.loadingFinished();
    expect(calls).toEqual(['gameLoadingFinished']);
    portal.firstInput();
    expect(calls).toEqual(['gameLoadingFinished', 'gameplayStart']);
  });

  it('nunca repete gameplayStart ou gameplayStop seguidos', async () => {
    const { portal, calls } = await setup();
    portal.loadingFinished();
    portal.firstInput();
    portal.gameplayStart();
    portal.gameplayStart();
    portal.gameplayStop();
    portal.gameplayStop();
    portal.setHidden(true);
    portal.gameplayStart(); // aba escondida: continua parado
    portal.setHidden(false);
    expect(calls.filter((c) => c.startsWith('gameplay'))).toEqual(['gameplayStart', 'gameplayStop', 'gameplayStart']);
  });

  it('commercialBreak: gameplayStop → anúncio → gameplayStart, sem eventos durante o anúncio', async () => {
    const { portal, calls, finish } = await setup();
    let muted = false;
    portal.hooks = { onAdStart: () => (muted = true), onAdEnd: () => (muted = false) };
    portal.loadingFinished();
    portal.firstInput();
    portal.gameplayStart();
    const ad = portal.commercialBreak();
    expect(muted).toBe(true);
    expect(portal.isAdActive).toBe(true);
    // Nada sai para o SDK durante o anúncio.
    const during = calls.length;
    portal.gameplayStop();
    portal.gameplayStart();
    portal.measure('pack', 'basic', 'open');
    portal.setHidden(true);
    portal.setHidden(false);
    expect(calls.length).toBe(during);
    finish();
    await ad;
    expect(muted).toBe(false);
    expect(calls).toEqual(['gameLoadingFinished', 'gameplayStart', 'gameplayStop', 'commercialBreak', 'gameplayStart', 'measure:pack/basic/open']);
  });

  it('rewardedBreak paga só quando o anúncio termina com sucesso', async () => {
    const ok = await setup({ rewardOk: true });
    ok.portal.loadingFinished();
    const p = ok.portal.rewarded();
    await tick();
    ok.finish();
    expect(await p).toBe(true);

    const no = await setup({ rewardOk: false });
    no.portal.loadingFinished();
    const q = no.portal.rewarded();
    await tick();
    no.finish();
    expect(await q).toBe(false);
  });

  it('com bloqueador de anúncio o jogo segue e não oferece rewarded', async () => {
    const { portal } = await setup({ initFails: true });
    expect(portal.id).toBe('poki');
    expect(portal.sdkReady).toBe(false);
    expect(portal.rewardedAvailable()).toBe(false);
  });

  it('measure limpa / e ^ e espera o carregamento', async () => {
    const { portal, calls } = await setup();
    portal.measure('a/b', 'c^d', 'start');
    expect(calls).toEqual([]);
    portal.loadingFinished();
    expect(calls).toContain('measure:a-b/c-d/start');
    expect(cleanMeasure(12)).toBe('12');
  });
});

describe('Puzzle Packs: game events', () => {
  const idle: TutorialUi = { scene: 'main', idle: true, blocked: false };

  function setupGame() {
    const game = createGame(3);
    const tutorial = new Tutorial(game);
    tutorial.start();
    const events: string[] = [];
    const analytics = new Analytics((c, w, a) => events.push(`${c}/${w}/${a}`));
    analytics.attach(game, tutorial);
    return { game, tutorial, analytics, events };
  }

  it('jogador novo: sessão, série 1 e tutorial começam', () => {
    const { events } = setupGame();
    expect(events).toEqual(['session/new/start', 'series/1/start', 'tutorial/all/start']);
  });

  it('pacotes, peças, loja, melhorias e série completa', () => {
    const { game, events } = setupGame();
    const { collection, engine } = game;
    collection.openNext();
    expect(events).toContain('pack/basic/open');
    expect(events).toContain('packs/1/reached');
    expect(events.some((e) => /^piece\/\w+\/placed$/.test(e))).toBe(true);
    engine.gain('coins', 1e6);
    collection.buyPack('series');
    expect(events).toContain('shop/series/buy');
    // Fecha a série 1 abrindo pacotes até completar.
    for (let i = 0; i < 2000 && !collection.isComplete(0); i++) collection.openNext();
    expect(events).toContain('series/1/complete');
    expect(events).toContain('series/2/start');
    expect(events).toContain('achievement/first-pack/unlocked');
    expect(events).toContain('auto/opener/unlocked');
    const up = (engine.def.upgrades ?? []).find((u) => engine.upgradeStatus(u.id) === 'affordable');
    if (up) {
      engine.buyUpgrade(up.id);
      expect(events).toContain(`upgrade/${up.id}-1/buy`);
    }
    // Auto-abridor.
    engine.simulate(60, 60, { offline: false });
    expect(events).toContain('pack/basic/open-auto');
  });

  it('cada evento sai uma vez por sessão e marcos não repetem', () => {
    const { game, events } = setupGame();
    for (let i = 0; i < 12; i++) game.collection.openNext();
    expect(events.filter((e) => e === 'pack/basic/open')).toHaveLength(1);
    expect(events.filter((e) => e.startsWith('packs/'))).toEqual(['packs/1/reached', 'packs/5/reached', 'packs/10/reached']);
    expect(milestone(0)).toBe(0);
    expect(milestone(260)).toBe(250);
  });

  it('tutorial: start ao aparecer, complete ao concluir, skip', () => {
    const { tutorial, events } = setupGame();
    expect(tutorial.active(idle)?.id).toBe('rip');
    tutorial.active(idle);
    expect(events.filter((e) => e === 'tutorial/rip/start')).toHaveLength(1);
    tutorial.notify('rip');
    expect(events).toContain('tutorial/rip/complete');
    tutorial.skip();
    expect(events).toContain('tutorial/all/skip');
  });

  it('marcos de tempo com a aba visível saem uma vez cada', () => {
    const events: string[] = [];
    const a = new Analytics((c, w, x) => events.push(`${c}/${w}/${x}`));
    for (let s = 1; s <= 70; s++) a.elapsed(s);
    a.elapsed(70);
    expect(events).toEqual(['time/15s/reached', 'time/30s/reached', 'time/60s/reached']);
  });

  it('jogador que volta: sessão returning e progresso atual', () => {
    const game = createGame(3);
    game.collection.openNext();
    const tutorial = new Tutorial(game);
    tutorial.start();
    const events: string[] = [];
    new Analytics((c, w, a) => events.push(`${c}/${w}/${a}`)).attach(game, tutorial);
    expect(events).toEqual(['session/returning/start', 'progress/series-1/resume', 'progress/packs-1/resume']);
  });
});
