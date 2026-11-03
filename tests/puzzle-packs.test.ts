import { describe, expect, it } from 'vitest';
import { SaveManager, memoryStorage } from '../src/core/save';
import { PACKS, SERIES, SERIES_COST_MULT, pieceCount, pieceRarity } from '../games/puzzle-packs/content';
import { createGame } from '../games/puzzle-packs/game';

const completeSeries = (game: ReturnType<typeof createGame>, i: number) => {
  game.collection.state.owned[SERIES[i].id] = new Array(pieceCount(SERIES[i])).fill(1);
  game.engine.checkProgress();
};

describe('Puzzle Packs: dados', () => {
  it('26 séries de 3x3 a 10x10, com raras no miolo e cada vez mais caras', () => {
    expect(SERIES).toHaveLength(26);
    expect(SERIES.slice(0, 6).map((s) => s.grid)).toEqual([3, 4, 5, 6, 7, 8]);
    SERIES.forEach((s, i) => i > 0 && expect(s.grid).toBeGreaterThanOrEqual(SERIES[i - 1].grid));
    expect(SERIES[SERIES.length - 1].grid).toBe(10);
    expect(new Set(SERIES.map((s) => s.id)).size).toBe(SERIES.length);
    expect(SERIES_COST_MULT.length).toBeGreaterThanOrEqual(SERIES.length);
    SERIES.forEach((s, i) => {
      expect(s.rare.length).toBeGreaterThanOrEqual(1);
      expect(s.rare.length).toBeLessThanOrEqual(Math.max(2, s.grid - 3));
      for (const r of s.rare) {
        expect(r).toBeLessThan(pieceCount(s));
        // Rara nunca fica na borda (a borda é das comuns).
        const x = r % s.grid;
        const y = Math.floor(r / s.grid);
        expect(x > 0 && y > 0 && x < s.grid - 1 && y < s.grid - 1, `${s.id} #${r}`).toBe(true);
      }
      if (i > 0) {
        expect(s.coinMult).toBeGreaterThan(SERIES[i - 1].coinMult);
        expect(SERIES_COST_MULT[i]).toBeGreaterThan(SERIES_COST_MULT[i - 1]);
      }
    });
  });

  it('toda série tem entrada de arte no manifest', async () => {
    const manifest = (await import('../public/assets/manifest.json')).default as { assets: Array<{ id: string }> };
    const ids = manifest.assets.map((a) => a.id);
    for (const s of SERIES) expect(ids, s.asset).toContain(s.asset);
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

  it('série 1 fecha rápido: no máximo uns 15 pacotes básicos na maioria das sementes', () => {
    const packs: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { collection } = createGame(seed);
      let n = 0;
      while (!collection.isComplete(0) && n < 200) {
        collection.openNext();
        n++;
      }
      packs.push(n);
    }
    packs.sort((a, b) => a - b);
    expect(packs[Math.floor(packs.length * 0.9)]).toBeLessThanOrEqual(15);
  });

  it('na série 2, o pacote básico traz sempre uma carta da série atual', () => {
    const { engine, collection } = createGame(4);
    completeSeries({ engine, collection }, 0);
    expect(collection.currentSeries()).toBe(1);
    for (let i = 0; i < 30; i++) {
      const r = collection.openNext();
      expect(r.cards.filter((c) => c.series === 1).length).toBeGreaterThanOrEqual(1);
    }
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

  it('só a última série completa libera a vitória', () => {
    const game = createGame(6);
    for (let i = 0; i < SERIES.length - 1; i++) completeSeries(game, i);
    expect(game.engine.isUnlocked('victory')).toBe(false);
    expect(game.collection.currentSeries()).toBe(SERIES.length - 1);
    completeSeries(game, SERIES.length - 1);
    expect(game.collection.allComplete()).toBe(true);
    expect(game.engine.isUnlocked('victory')).toBe(true);
  });

  it('save v2 (6 séries, vitória já vista) continua na Série 7', () => {
    const old = createGame(10);
    for (let i = 0; i < 6; i++) completeSeries(old, i);
    const st = old.collection.state;
    for (const s of SERIES.slice(6)) delete st.owned[s.id];
    old.engine.state.unlocks.victory = true;
    old.engine.state.flags.endSeen = true;
    const storage = memoryStorage();
    const file = JSON.parse(new SaveManager(old.engine, { storage, key: 'k', now: () => 0 }).toString());
    file.v = 2;
    storage.write('k', JSON.stringify(file));

    const game = createGame(10);
    new SaveManager(game.engine, { storage, key: 'k', now: () => 0 }).load();
    expect(game.engine.isUnlocked('victory')).toBe(false);
    expect(game.engine.state.flags.endSeen).toBeFalsy();
    expect(game.collection.currentSeries()).toBe(6);
    expect(game.collection.owned(6)).toEqual(new Array(pieceCount(SERIES[6])).fill(0));
  });

  it('save v1 (3 séries, vitória já vista) continua na Série 4', () => {
    const old = createGame(9);
    for (let i = 0; i < 3; i++) completeSeries(old, i);
    // Como era o save antigo: só 3 séries, vitória liberada e fim já visto.
    const st = old.collection.state;
    for (const s of SERIES.slice(3)) delete st.owned[s.id];
    old.engine.state.unlocks.victory = true;
    old.engine.state.flags.endSeen = true;
    const storage = memoryStorage();
    const saves = new SaveManager(old.engine, { storage, key: 'k', now: () => 0 });
    const file = JSON.parse(saves.toString());
    file.v = 1;
    storage.write('k', JSON.stringify(file));

    const game = createGame(9);
    new SaveManager(game.engine, { storage, key: 'k', now: () => 0 }).load();
    expect(game.engine.isUnlocked('victory')).toBe(false);
    expect(game.engine.state.flags.endSeen).toBeFalsy();
    expect(game.collection.isComplete(2)).toBe(true);
    expect(game.collection.currentSeries()).toBe(3);
    expect(game.collection.owned(3)).toEqual(new Array(36).fill(0));
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
