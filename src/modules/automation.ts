import type { Engine, GameModule } from '../core/engine';
import type { Condition } from '../core/types';

export interface AutobuyerDef {
  id: string;
  name: string;
  /** O que comprar: um gerador, um upgrade específico ou o mais barato de uma árvore. */
  target: { generator: string } | { upgrade: string } | { tree: string };
  unlockWhen: Condition;
  /** Segundos entre tentativas. Pode ser um atributo upgradável. */
  interval: number | { stat: string };
}

interface AutomationState {
  enabled: Record<string, boolean>;
  timers: Record<string, number>;
}

/**
 * Compradores automáticos que o jogador desbloqueia: ações manuais viram
 * automáticas como recompensa de progresso.
 */
export class AutomationModule implements GameModule {
  readonly id = 'automation';

  constructor(readonly buyers: AutobuyerDef[]) {}

  defaultState(): AutomationState {
    return { enabled: {}, timers: {} };
  }

  private st(engine: Engine): AutomationState {
    return engine.getModuleState<AutomationState>(this.id);
  }

  isUnlocked(engine: Engine, id: string): boolean {
    const b = this.buyers.find((x) => x.id === id);
    return !!b && engine.check(b.unlockWhen);
  }

  isEnabled(engine: Engine, id: string): boolean {
    return this.st(engine).enabled[id] ?? true;
  }

  toggle(engine: Engine, id: string, on?: boolean): void {
    const s = this.st(engine);
    s.enabled[id] = on ?? !this.isEnabled(engine, id);
  }

  tick(engine: Engine, dt: number): void {
    const s = this.st(engine);
    for (const b of this.buyers) {
      if (!this.isEnabled(engine, b.id) || !engine.check(b.unlockWhen)) continue;
      const interval = typeof b.interval === 'number' ? b.interval : engine.statNumber(b.interval.stat);
      s.timers[b.id] = (s.timers[b.id] ?? 0) + dt;
      if (s.timers[b.id] < interval) continue;
      s.timers[b.id] = 0;
      const t = b.target;
      if ('generator' in t) engine.buyGenerator(t.generator, 'max');
      else if ('upgrade' in t) engine.buyUpgrade(t.upgrade);
      else {
        const cheapest = engine
          .upgradesInTree(t.tree)
          .filter((u) => engine.upgradeStatus(u.id) === 'affordable')
          .sort((a, c) => engine.upgradeCost(a.id)[0].amount.cmp(engine.upgradeCost(c.id)[0].amount))[0];
        if (cheapest) engine.buyUpgrade(cheapest.id);
      }
    }
  }
}
