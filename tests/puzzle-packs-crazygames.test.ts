import { beforeEach, describe, expect, it } from 'vitest';
import { detectLang } from '../games/puzzle-packs/i18n';
import { Portal, type CrazyAdCallbacks, type CrazyGamesSDKApi, type CrazySettings } from '../games/puzzle-packs/portal';

interface FakeOpts {
  env?: string;
  /** Todo pedido de anúncio falha na hora com este código (ex.: `adsDisabled` no Basic Launch). */
  adError?: string;
  adblock?: boolean;
  muted?: boolean;
  locale?: string;
  dataFails?: boolean;
  initFails?: boolean;
}

/** SDK v3 do CrazyGames falso: registra as chamadas e deixa o teste conduzir os anúncios. */
function fakeCrazy(opts: FakeOpts = {}) {
  const calls: string[] = [];
  const store = new Map<string, string>();
  let listener: ((s: CrazySettings) => void) | null = null;
  let pending: CrazyAdCallbacks | null = null;
  const sdk: CrazyGamesSDKApi = {
    init: () => (opts.initFails ? Promise.reject(new Error('disabled')) : Promise.resolve()),
    environment: opts.env ?? 'crazygames',
    game: {
      loadingStart: () => void calls.push('loadingStart'),
      loadingStop: () => void calls.push('loadingStop'),
      gameplayStart: () => void calls.push('gameplayStart'),
      gameplayStop: () => void calls.push('gameplayStop'),
      happytime: () => void calls.push('happytime'),
      settings: { muteAudio: !!opts.muted },
      addSettingsChangeListener: (l) => void (listener = l),
    },
    ad: {
      requestAd: (type, cb) => {
        calls.push(`requestAd:${type}`);
        if (opts.adError) cb?.adError?.({ code: opts.adError, message: 'fake' });
        else pending = cb ?? null;
      },
      hasAdblock: () => Promise.resolve(!!opts.adblock),
    },
    data: {
      getItem: (k) => {
        if (opts.dataFails) throw new Error('dataModuleDisabled');
        return store.get(k) ?? null;
      },
      setItem: (k, v) => {
        if (opts.dataFails) throw new Error('dataModuleDisabled');
        store.set(k, v);
      },
      removeItem: (k) => void store.delete(k),
    },
    user: { systemInfo: { locale: opts.locale ?? 'pt-BR', countryCode: 'BR' } },
  };
  const take = () => {
    const p = pending;
    pending = null;
    return p;
  };
  return {
    sdk,
    calls,
    store,
    start: () => pending?.adStarted?.(),
    finish: () => take()?.adFinished?.(),
    fail: (code: string) => take()?.adError?.({ code }),
    setMuted: (m: boolean) => {
      sdk.game.settings = { muteAudio: m };
      listener?.({ muteAudio: m });
    },
  };
}

async function setup(opts?: FakeOpts) {
  const f = fakeCrazy(opts);
  const portal = new Portal();
  await portal.init(f.sdk);
  return { ...f, portal };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Puzzle Packs: SDK do CrazyGames', () => {
  // O portal lembra no aparelho se já viu anúncio; cada teste começa sem memória.
  beforeEach(() => {
    try {
      globalThis.localStorage?.removeItem('puzzle-packs:ads');
    } catch {
      /* Node sem localStorage */
    }
  });

  it('loadingStart no init, loadingStop no fim do carregamento, gameplayStart no primeiro toque', async () => {
    const { portal, calls } = await setup();
    expect(portal.id).toBe('crazygames');
    expect(portal.sdkReady).toBe(true);
    expect(calls).toEqual(['loadingStart']);
    portal.gameplayStart();
    portal.loadingFinished();
    expect(calls).toEqual(['loadingStart', 'loadingStop']);
    portal.firstInput();
    portal.gameplayStart();
    portal.gameplayStop();
    portal.gameplayStop();
    expect(calls).toEqual(['loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop']);
  });

  it('interstitial só na série completa, nunca ao voltar de uma pausa', async () => {
    const { portal, calls, start, finish } = await setup();
    const log: string[] = [];
    portal.hooks = {
      onAdRequest: () => log.push('lock'),
      onAdStart: () => log.push('mute'),
      onAdEnd: () => log.push('unlock'),
    };
    portal.loadingFinished();
    portal.firstInput();
    portal.gameplayStart();
    expect(portal.breaksAt('resume')).toBe(false);
    await portal.commercialBreak('resume');
    expect(calls.filter((c) => c.startsWith('requestAd'))).toEqual([]);

    const ad = portal.commercialBreak('milestone');
    // Trava os toques no pedido, mas só silencia quando o anúncio começa de fato.
    expect(log).toEqual(['lock']);
    expect(calls.slice(-2)).toEqual(['gameplayStop', 'requestAd:midgame']);
    start();
    expect(log).toEqual(['lock', 'mute']);
    portal.happytime(); // nada sai durante o anúncio
    finish();
    await ad;
    expect(log).toEqual(['lock', 'mute', 'unlock']);
    expect(calls.slice(-1)).toEqual(['gameplayStart']);
    expect(calls).not.toContain('happytime');
  });

  it('Basic Launch (anúncios desligados): sem botão de rewarded e uma só pergunta por sessão', async () => {
    const { portal, calls } = await setup({ adError: 'adsDisabled' });
    portal.loadingFinished();
    expect(portal.rewardedAvailable()).toBe(false);
    await portal.commercialBreak('milestone');
    expect(portal.rewardedAvailable()).toBe(false);
    expect(portal.breaksAt('milestone')).toBe(false);
    await portal.commercialBreak('milestone');
    expect(calls.filter((c) => c === 'requestAd:midgame')).toHaveLength(1);
  });

  it('o botão de rewarded aparece quando o SDK mostra que há anúncio', async () => {
    const shown = await setup();
    shown.portal.loadingFinished();
    expect(shown.portal.rewardedAvailable()).toBe(false);
    const ad = shown.portal.commercialBreak('milestone');
    shown.start();
    shown.finish();
    await ad;
    expect(shown.portal.rewardedAvailable()).toBe(true);

    // Intervalo de 3 min ou sem anúncio agora: há anúncio na conta, só não neste momento.
    for (const code of ['adCooldown', 'unfilled']) {
      const s = await setup({ adError: code });
      s.portal.loadingFinished();
      await s.portal.commercialBreak('milestone');
      expect(s.portal.rewardedAvailable()).toBe(true);
      expect(s.portal.breaksAt('milestone')).toBe(true);
    }
  });

  it('rewarded paga só no adFinished; erro não paga e fica registrado para o aviso', async () => {
    const { portal, start, finish, fail } = await setup();
    portal.loadingFinished();
    const brk = portal.commercialBreak('milestone');
    start();
    finish();
    await brk;

    const ok = portal.rewarded();
    await tick();
    start();
    finish();
    expect(await ok).toBe(true);
    expect(portal.lastAdError).toBeNull();

    const no = portal.rewarded();
    await tick();
    fail('unfilled');
    expect(await no).toBe(false);
    expect(portal.lastAdError).toBe('unfilled');
  });

  it('com bloqueador de anúncio: sem rewarded e sem interstitial', async () => {
    const { portal } = await setup({ adblock: true });
    await tick();
    portal.loadingFinished();
    expect(portal.rewardedAvailable()).toBe(false);
    expect(portal.breaksAt('milestone')).toBe(false);
  });

  it('som desligado no site manda no áudio do jogo', async () => {
    const { portal, setMuted } = await setup({ muted: true });
    expect(portal.muted).toBe(true);
    const seen: boolean[] = [];
    portal.hooks = { onMute: (m) => seen.push(m) };
    setMuted(false);
    setMuted(false);
    setMuted(true);
    expect(seen).toEqual([false, true]);
  });

  it('idioma vem do systemInfo do SDK, com inglês quando o jogo não tem o dele', async () => {
    const { portal } = await setup({ locale: 'pt-BR' });
    expect(portal.lang()).toBe('pt-BR');
    expect(detectLang(portal.lang())).toBe('pt');
    expect(detectLang('ar-EG')).toBe('en');
    expect(detectLang('ja')).toBe('ja');
  });

  it('save vai pelo módulo Data; com o módulo desligado, cai no localStorage sem quebrar', async () => {
    const { portal, store } = await setup();
    const storage = portal.saveStorage()!;
    storage.write('save', '{"a":1}');
    expect(store.get('save')).toBe('{"a":1}');
    expect(storage.read('save')).toBe('{"a":1}');
    storage.remove('save');
    expect(store.has('save')).toBe(false);

    const off = await setup({ dataFails: true });
    const fallback = off.portal.saveStorage()!;
    expect(() => fallback.write('save', 'x')).not.toThrow();
    expect(() => fallback.read('save')).not.toThrow();
  });

  it('fora do CrazyGames (ambiente disabled ou init falhou) o jogo segue sem SDK', async () => {
    for (const opts of [{ env: 'disabled' }, { initFails: true }]) {
      const { portal, calls } = await setup(opts);
      portal.loadingFinished();
      portal.firstInput();
      portal.gameplayStart();
      portal.happytime();
      expect(portal.sdkReady).toBe(false);
      expect(portal.saveStorage()).toBeNull();
      expect(portal.rewardedAvailable()).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it('happytime sai fora de anúncio e só no CrazyGames', async () => {
    const { portal, calls } = await setup();
    portal.loadingFinished();
    portal.happytime();
    expect(calls).toContain('happytime');
    const none = new Portal();
    await none.init();
    none.happytime();
    expect(none.log).not.toContain('happytime');
  });
});
