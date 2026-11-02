import { describe, expect, it } from 'vitest';
import { SaveManager, memoryStorage } from '../src/core/save';
import { PACKS, SERIES, pieceCount, pieceRarity } from '../games/puzzle-packs/content';
import { createGame } from '../games/puzzle-packs/game';

const completeSeries = (game: ReturnType<typeof createGame>, i: number) => {
  game.collection.state.owned[SERIES[i].id] = new Array(pieceCount(SERIES[i])).fill(1);
  game.engine.checkProgress();
};

describe('Puzzle Packs: dados', () => {
  it('séries com grades 3x3, 4x4 e 5x5 e 1 ou 2 raras cada', () => {
    expect(SERIES.map((s) => s.grid)).toEqual([3, 4, 5]);
    for (const s of SERIES) {
      expect(s.rare.length).toBeGreaterThanOrEqual(1);
      expect(s.rare.length).toBeLessThanOrEqual(2);
      for (const r of s.rare) expect(r).toBeLessThan(pieceCount(s));
    }
  });

  it('borda é comum, centro incomum e as listadas são raras', () => {
    const s2 = SERIES[1];
    expect(pieceRarity(s2, 0)).toBe('common');
    expect(pieceRarity(s2, 3)).toBe('common');
    expect(pieceRarity(s2, 6)).toBe('uncommon');
    expect(pieceRarity(s2, 5)).toBe('rare');
  });

  it('pacotes têm de 3 a 5 cartas', () => {
    for (const p of PACKS) {
      expect(p.cards).toBeGreaterThanOrEqual(3);
      expect(p.cards).toBeLessThanOrEqual(5);
    }
  });
});

describe('Puzzle Packs: economia', () => {
  it('pacote básico é grátis e revela as cartas; repetida vira moeda', () => {
    const { engine, collection } = createGame(1);
    const r = collection.openNext();
    expect(r.pack).toBe('basic');
    expect(r.cards).toHaveLength(3);
    expect(r.cards[0].isNew).toBe(true);
    let coins = r.coins;
    for (let i = 0; i < 30; i++) coins += collection.openNext().coins;
    expect(coins).toBeGreaterThan(0);
    expect(engine.amount('coins').toNumber()).toBeCloseTo(coins, 5);
    expect(collection.state.dupes).toBeGreaterThan(0);
  });

  it('pity garante peça nova depois de N pacotes sem novidade', () => {
    const { engine, collection } = createGame(5);
    const n = engine.statNumber('pity.packs');
    // Só falta uma peça comum: o pity tem que entregá-la em até N pacotes.
    const owned = collection.state.owned.s1;
    owned.fill(1);
    owned[0] = 0;
    collection.state.dry = 0;
    let got = -1;
    for (let i = 0; i < n; i++) {
      if (collection.openNext().cards.some((c) => c.isNew)) {
        got = i;
        break;
      }
    }
    expect(got).toBeGreaterThanOrEqual(0);
  });

  it('pity de rara tem limite próprio por série', () => {
    const { collection } = createGame(9);
    const owned = collection.state.owned.s1;
    owned.fill(1);
    owned[SERIES[0].rare[0]] = 0;
    expect(collection.pityThreshold()).toBe(SERIES[0].rarePity);
    let opened = 0;
    while (!collection.isComplete(0) && opened < 100) {
      collection.openNext();
      opened++;
    }
    expect(opened).toBeLessThanOrEqual(SERIES[0].rarePity);
  });

  it('completar a série 1 libera a série 2 e o auto-abridor', () => {
    const { engine, collection } = createGame(2);
    expect(collection.isSeriesUnlocked(1)).toBe(false);
    expect(collection.autoUnlocked()).toBe(false);
    engine.tick(60);
    expect(collection.state.packs).toBe(0);
    completeSeries({ engine, collection }, 0);
    expect(collection.isSeriesUnlocked(1)).toBe(true);
    expect(collection.currentSeries()).toBe(1);
    expect(collection.autoUnlocked()).toBe(true);
    const interval = collection.autoInterval();
    engine.tick(interval * 3 + 0.01);
    expect(collection.state.autoPacks).toBe(3);
    expect(collection.drainAuto()).toHaveLength(3);
  });

  it('loja: pacote pago desconta moedas, entra na fila e custa mais nas séries seguintes', () => {
    const { engine, collection } = createGame(3);
    const c1 = collection.packCost('series');
    expect(collection.buyPack('series')).toBe(false);
    engine.add('coins', c1);
    expect(collection.buyPack('series')).toBe(true);
    expect(engine.amount('coins').toNumber()).toBe(0);
    expect(collection.nextPack()).toBe('series');
    const r = collection.openNext();
    expect(r.pack).toBe('series');
    expect(r.cards.every((c) => c.series === 0)).toBe(true);
    completeSeries({ engine, collection }, 0);
    expect(collection.packCost('series')).toBeGreaterThan(c1);
  });

  it('upgrades mudam cartas por pacote, desconto e velocidade', () => {
    const { engine, collection } = createGame(4);
    engine.add('coins', 1e9);
    const cost = collection.packCost('premium');
    const time = collection.openTime();
    for (const id of ['collector', 'cards', 'cards', 'value', 'discount', 'speed']) expect(engine.buyUpgrade(id)).toBe(true);
    expect(collection.cardsIn('basic')).toBe(5);
    expect(collection.packCost('premium')).toBeLessThan(cost);
    expect(collection.openTime()).toBeLessThan(time);
  });

  it('as 3 séries completas liberam a vitória', () => {
    const game = createGame(6);
    for (let i = 0; i < SERIES.length; i++) completeSeries(game, i);
    expect(game.collection.allComplete()).toBe(true);
    expect(game.engine.isUnlocked('victory')).toBe(true);
  });

  it('offline: o auto-abridor trabalha com o jogo fechado, até o teto', () => {
    const game = createGame(8);
    completeSeries(game, 0);
    const storage = memoryStorage();
    let now = 1_000_000;
    const saves = new SaveManager(game.engine, { storage, now: () => now });
    saves.save();
    const again = createGame(8);
    const saves2 = new SaveManager(again.engine, { storage, now: () => now });
    now += 10 * 3600 * 1000; // 10 h fora; o teto é 3 h
    const report = saves2.load()!;
    expect(report.seconds).toBe(3 * 3600);
    const expected = Math.floor((3 * 3600) / again.collection.autoInterval());
    expect(again.collection.takeOfflineCount()).toBeGreaterThanOrEqual(expected - 1);
    expect(report.gains.coins?.gt(0)).toBe(true);
  });
});

describe('Puzzle Packs: localização', () => {
  it('EN, RU, PT, ES e TR têm as mesmas chaves, sem textos vazios', async () => {
    const { LANGS } = await import('../games/puzzle-packs/i18n');
    const base = LANGS.pt as unknown as Record<string, unknown>;
    for (const [id, dict] of Object.entries(LANGS) as Array<[string, Record<string, unknown>]>) {
      expect(Object.keys(dict).sort(), id).toEqual(Object.keys(base).sort());
      expect(Object.keys(dict.kit as object).sort(), id).toEqual(Object.keys(base.kit as object).sort());
      for (const [k, v] of Object.entries(dict)) if (typeof v === 'string') expect(v.length, `${id}.${k}`).toBeGreaterThan(0);
    }
  });

  it('todo upgrade, conquista, pacote e série tem texto', async () => {
    const { LANGS } = await import('../games/puzzle-packs/i18n');
    const { definition } = await import('../games/puzzle-packs/content');
    const keys = [
      ...(definition.upgrades ?? []).flatMap((u) => [`up.${u.id}`, `up.${u.id}.desc`]),
      ...(definition.achievements ?? []).flatMap((a) => [`ach.${a.id}`, `ach.${a.id}.desc`]),
      ...PACKS.flatMap((p) => [`pack.${p.id}`, `pack.${p.id}.desc`]),
      ...SERIES.map((s) => `series.${s.id}`),
    ];
    for (const dict of Object.values(LANGS) as Array<Record<string, unknown>>) for (const k of keys) expect(dict[k], k).toBeTruthy();
  });
});
