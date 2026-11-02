import { describe, expect, it } from 'vitest';
import { createGame } from '../games/node-breaker/game';
import { buyCheapestUpgrade, formatProfileTable, simulate, simulateProfiles, type SimProfile } from '../src/sim/simulator';

describe('Node Breaker (jogo de exemplo)', () => {
  it('a árvore só aponta para pais existentes e toda run dá Bits', () => {
    const { engine, runs, arena } = createGame(1);
    runs.start();
    for (let i = 0; i < 60 * 10 && runs.active; i++) {
      const n = arena.nodes[0];
      if (n) Object.assign(arena.cursor, { x: n.x, y: n.y, inside: true });
      engine.tick(1 / 60);
      arena.drainEvents();
    }
    expect(runs.active).toBe(false);
    expect(runs.last!.collected.bits.gt(0)).toBe(true);
  });

  it('um bot compra os primeiros upgrades em poucos minutos', () => {
    const { engine, runs, arena } = createGame(7);
    for (let t = 0; t < 5 * 60 * 30; t++) {
      if (!runs.active) {
        while (buyCheapestUpgrade(engine)) {}
        runs.start();
      }
      const n = arena.nodes[0];
      if (n) Object.assign(arena.cursor, { x: n.x, y: n.y, inside: true });
      engine.tick(1 / 30);
      arena.drainEvents();
    }
    expect(engine.upgradeLevel('core')).toBe(1);
    expect(Object.keys(engine.state.upgrades).length).toBeGreaterThan(5);
  });

  it('o bot que poupa não gasta o recurso guardado', () => {
    const { engine } = createGame(3);
    engine.add('bits', 1e6);
    expect(buyCheapestUpgrade(engine, ['main'], ['bits'])).toBeNull();
    expect(buyCheapestUpgrade(engine, ['main'])).toBe('core');
  });

  it('roda um perfil por jogo e marca a parede final de quem para de comprar', () => {
    const profiles: SimProfile[] = [
      { id: 'a', name: 'A', effort: 1, idleSeconds: 1, prestige: true },
      { id: 'b', name: 'B', effort: 0.5, idleSeconds: 6, prestige: false },
    ];
    const seen: string[] = [];
    const results = simulateProfiles(
      (p) => {
        seen.push(p.id);
        let bought = false;
        return { step() {}, shop: () => (bought ? null : ((bought = true), 'x')), done: () => false };
      },
      { maxSeconds: 400, dt: 1, wallSeconds: 180 },
      profiles,
    );
    expect(seen).toEqual(['a', 'b']);
    expect(results[0].result.walls).toEqual([{ from: 1, to: 400 }]);
    expect(formatProfileTable(results, [{ id: 'x', label: 'X' }])).toContain('0m01s');
    expect(simulate({ step() {}, done: () => true }, { maxSeconds: 10, dt: 1 }).walls).toEqual([]);
  });
});
