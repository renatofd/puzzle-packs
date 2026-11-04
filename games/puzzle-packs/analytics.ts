import { SERIES } from './content';
import type { PackResult, RewardKind } from './collection';
import type { Game } from './game';
import type { Tutorial } from './tutorial';

/**
 * Game events do Poki (https://developers.poki.com/guide/game-events), sem
 * nada de tela: ouve os eventos do motor, da coleção e do tutorial e manda
 * `measure(category, what, action)` para o portal.
 *
 * Cada trio sai no máximo uma vez por sessão: o Poki mede a porcentagem de
 * gameplays que chegou a cada evento, então repetir não acrescenta nada.
 * Contagens viram marcos (`packs / 100 / reached`).
 *
 * Funis de progresso (`start` → `complete`):
 * - `tutorial / <passo>`: cada passo do tutorial guiado;
 * - `series / <n>`: cada série do álbum (1 a 26).
 *
 * Interação (`visible` → `interact`): `button / reward-pack` e
 * `button / reward-double` (os botões de anúncio; o resultado do anúncio o
 * Poki já mede sozinho).
 *
 * A lista completa está em `docs/poki-events.md`.
 */

export type MeasureSink = (category: string, what: string, action: string) => void;

/** Marcos de contagem (pacotes abertos, peças novas, repetidas). */
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

/** Marcos de tempo com a aba visível, em segundos (`time / 60s / reached`). */
export const TIME_MARKS = [15, 30, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800];

/** Maior marco atingido por `n` (0 se nenhum). */
export function milestone(n: number): number {
  let m = 0;
  for (const x of MILESTONES) if (n >= x) m = x;
  return m;
}

export class Analytics {
  private sent = new Set<string>();

  constructor(private sink: MeasureSink) {}

  /** Manda o evento se ele ainda não saiu nesta sessão. */
  track(category: string, what: string | number, action: string): void {
    const key = `${category}^${what}^${action}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.sink(category, String(what), action);
  }

  /** Marco de contagem: manda cada marco cruzado entre `before` e `after`. */
  count(category: string, before: number, after: number): void {
    for (const m of MILESTONES) if (before < m && after >= m) this.track(category, m, 'reached');
  }

  /** Liga tudo ao jogo. Chame depois de carregar o save e antes do primeiro tick. */
  attach(game: Game, tutorial: Tutorial): void {
    const { engine, collection } = game;
    const st = () => collection.state;
    const newPlayer = st().packs === 0;
    this.track('session', newPlayer ? 'new' : 'returning', 'start');
    if (newPlayer) this.track('series', 1, 'start');
    else {
      this.track('progress', `series-${collection.currentSeries() + 1}`, 'resume');
      this.track('progress', `packs-${milestone(st().packs)}`, 'resume');
    }

    // Tutorial
    tutorial.onStep = (id, action) => this.track('tutorial', id, action);
    if (newPlayer) this.track('tutorial', 'all', 'start');
    let tutorialDone = tutorial.finished;

    // Pacotes abertos e peças
    let packs = st().packs;
    let pieces = st().newPieces;
    let dupes = st().dupes;
    engine.events.on('packOpened', (payload) => {
      const r = payload as PackResult;
      this.track('pack', r.pack, r.source === 'auto' ? 'open-auto' : 'open');
      const s = st();
      this.count('packs', packs, s.packs);
      this.count('pieces', pieces, s.newPieces);
      this.count('dupes', dupes, s.dupes);
      packs = s.packs;
      pieces = s.newPieces;
      dupes = s.dupes;
      for (const c of r.cards) {
        if (c.isNew) this.track('piece', c.rarity, 'placed');
        if (c.pity) this.track('piece', 'pity', 'placed');
      }
      for (const i of r.completed) {
        this.track('series', i + 1, 'complete');
        if (i + 1 < SERIES.length) this.track('series', i + 2, 'start');
        else this.track('game', 'collection', 'complete');
      }
      if (!tutorialDone && tutorial.finished) {
        tutorialDone = true;
        if (!tutorial.skipped) this.track('tutorial', 'all', 'complete');
      }
    });

    // Loja e melhorias
    engine.events.on('packBought', (payload) => {
      const { id } = payload as { id: string };
      this.track('shop', id, 'buy');
    });
    const autoWas = { on: collection.autoUnlocked() };
    engine.events.on('upgradeBought', ({ id, level }) => {
      this.track('upgrade', `${id}-${level}`, 'buy');
      if (!autoWas.on && collection.autoUnlocked()) {
        autoWas.on = true;
        this.track('auto', 'opener', 'unlocked');
      }
      if (!tutorialDone && tutorial.finished) {
        tutorialDone = true;
        if (!tutorial.skipped) this.track('tutorial', 'all', 'complete');
      }
    });
    engine.events.on('unlock', ({ id }) => {
      if (!autoWas.on && collection.autoUnlocked()) {
        autoWas.on = true;
        this.track('auto', 'opener', 'unlocked');
      }
      if (id === 'victory') this.track('game', 'victory', 'reached');
    });

    engine.events.on('achievement', ({ id }) => this.track('achievement', id, 'unlocked'));
    engine.events.on('rewardGranted', (payload) => {
      const { kind } = payload as { kind: RewardKind };
      this.track('reward', kind, 'granted');
    });
  }

  // ---------------------------------------------------------- chamadas da tela

  /** Segundos com a aba visível desde que a página abriu: manda cada marco de `TIME_MARKS` cruzado. */
  elapsed(seconds: number): void {
    for (const m of TIME_MARKS) if (seconds >= m) this.track('time', `${m}s`, 'reached');
  }

  /** Troca de tela (`album`, `upgrades`, `menu`, `language`, `image`). */
  screen(name: string): void {
    this.track('screen', name, 'open');
  }

  /** Botão de rewarded apareceu (`visible`) ou foi tocado (`interact`). */
  rewardButton(kind: RewardKind, action: 'visible' | 'interact'): void {
    this.track('button', `reward-${kind}`, action);
  }

  language(code: string): void {
    this.track('language', code, 'selected');
  }

  offlineReturn(packs: number): void {
    this.track('session', 'offline', 'return');
    if (packs > 0) this.track('auto', 'offline', 'opened');
  }
}
