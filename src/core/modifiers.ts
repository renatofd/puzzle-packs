import { D, Decimal, ONE, ZERO } from './num';
import type { GameState, ModOp } from './types';

export interface ModifierEntry {
  stat: string;
  op: ModOp;
  value: (state: GameState) => Decimal;
  /** De onde vem o efeito (ex.: "upgrade:dano-1"), útil para tooltips e debug. */
  source?: string;
}

/**
 * Pilha de modificadores. Junta efeitos de upgrades, conquistas, módulos e
 * buffs, e calcula (base + Σ add) × Π mult ^ Π pow para cada atributo.
 * Os valores ficam em cache até o próximo invalidate().
 */
export class ModifierStack {
  private collector: () => ModifierEntry[] = () => [];
  private byStat: Map<string, ModifierEntry[]> | null = null;
  private cache = new Map<string, Decimal>();

  setCollector(fn: () => ModifierEntry[]): void {
    this.collector = fn;
    this.invalidate();
  }

  invalidate(): void {
    this.byStat = null;
    this.cache.clear();
  }

  entriesFor(stat: string): ModifierEntry[] {
    if (!this.byStat) {
      this.byStat = new Map();
      for (const e of this.collector()) {
        let list = this.byStat.get(e.stat);
        if (!list) this.byStat.set(e.stat, (list = []));
        list.push(e);
      }
    }
    return this.byStat.get(stat) ?? [];
  }

  compute(stat: string, base: Decimal, state: GameState): Decimal {
    const key = `${stat}|${base.toString()}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    let add = ZERO;
    let mult = ONE;
    let pow = ONE;
    for (const e of this.entriesFor(stat)) {
      const v = D(e.value(state));
      if (e.op === 'add') add = add.add(v);
      else if (e.op === 'mult') mult = mult.mul(v);
      else pow = pow.mul(v);
    }
    let result = base.add(add).mul(mult);
    if (!pow.eq(1)) result = result.pow(pow);
    this.cache.set(key, result);
    return result;
  }
}
