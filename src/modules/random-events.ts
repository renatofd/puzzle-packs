import type { Engine, GameModule, TickContext } from '../core/engine';
import type { ModifierEntry } from '../core/modifiers';
import { D } from '../core/num';
import type { Condition, EffectDef } from '../core/types';
import { EventBus } from '../core/events';

export interface RandomEventDef {
  id: string;
  name: string;
  /** Peso relativo no sorteio. */
  weight?: number;
  unlockWhen?: Condition;
  /** Segundos que o evento fica na tela esperando o clique. */
  lifetime: number;
  /** Buff aplicado ao clicar, por `duration` segundos. */
  buff?: { effects: EffectDef[]; duration: number };
  /** Ação instantânea ao clicar (ex.: dar recursos). */
  onClaim?: (engine: Engine) => void;
}

interface ActiveBuff {
  id: string;
  left: number;
}

interface RandomEventsState {
  timer: number;
  nextIn: number;
  buffs: ActiveBuff[];
  claimed: number;
}

export interface RandomEventsEvents extends Record<string, unknown> {
  spawn: { id: string; lifetime: number };
  claim: { id: string };
}

/**
 * Eventos aleatórios no estilo golden cookie: algo aparece por poucos
 * segundos e, se clicado, dá um bônus. A interface decide onde desenhar.
 */
export class RandomEventsModule implements GameModule {
  readonly id = 'randomEvents';
  readonly events = new EventBus<RandomEventsEvents>();

  constructor(
    readonly defs: RandomEventDef[],
    readonly interval: { min: number; max: number } = { min: 60, max: 180 },
    private rng: () => number = Math.random,
  ) {}

  defaultState(): RandomEventsState {
    return { timer: 0, nextIn: this.roll(), buffs: [], claimed: 0 };
  }

  private roll(): number {
    return this.interval.min + this.rng() * (this.interval.max - this.interval.min);
  }

  private st(engine: Engine): RandomEventsState {
    return engine.getModuleState<RandomEventsState>(this.id);
  }

  tick(engine: Engine, dt: number, ctx: TickContext): void {
    const s = this.st(engine);
    const before = s.buffs.length;
    for (const b of s.buffs) b.left -= dt;
    s.buffs = s.buffs.filter((b) => b.left > 0);
    if (s.buffs.length !== before) engine.invalidate();
    if (ctx.offline) return;
    s.timer += dt;
    if (s.timer < s.nextIn) return;
    s.timer = 0;
    s.nextIn = this.roll();
    const pool = this.defs.filter((d) => engine.check(d.unlockWhen));
    const total = pool.reduce((a, d) => a + (d.weight ?? 1), 0);
    let r = this.rng() * total;
    for (const d of pool) {
      r -= d.weight ?? 1;
      if (r <= 0) {
        this.events.emit('spawn', { id: d.id, lifetime: d.lifetime });
        break;
      }
    }
  }

  /** A interface chama isto quando o jogador clica no evento. */
  claim(engine: Engine, id: string): void {
    const d = this.defs.find((x) => x.id === id);
    if (!d) return;
    const s = this.st(engine);
    s.claimed += 1;
    d.onClaim?.(engine);
    if (d.buff) {
      s.buffs.push({ id, left: d.buff.duration });
      engine.invalidate();
    }
    this.events.emit('claim', { id });
  }

  activeBuffs(engine: Engine): ActiveBuff[] {
    return this.st(engine).buffs;
  }

  modifiers(engine: Engine): ModifierEntry[] {
    const out: ModifierEntry[] = [];
    for (const b of this.st(engine)?.buffs ?? []) {
      const d = this.defs.find((x) => x.id === b.id);
      for (const e of d?.buff?.effects ?? []) {
        out.push({
          stat: e.stat,
          op: e.op,
          source: `event:${b.id}`,
          value: (state) => D(typeof e.value === 'function' ? e.value(1, state) : e.value),
        });
      }
    }
    return out;
  }
}
