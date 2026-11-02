import { Decimal, ZERO } from '../core/num';
import { EventBus } from '../core/events';
import type { Engine, GameModule, TickContext } from '../core/engine';

export type RunEndReason = 'time' | 'death' | 'quit' | 'boss';

export interface RunSummary {
  number: number;
  seconds: number;
  reason: RunEndReason;
  collected: Record<string, Decimal>;
}

interface RunState {
  active: boolean;
  elapsed: number;
  count: number;
  collected: Record<string, Decimal>;
  best: Record<string, Decimal>;
  last: RunSummary | null;
}

export interface RunEvents extends Record<string, unknown> {
  start: { number: number };
  end: RunSummary;
}

export interface RunModuleOptions {
  /** Atributo com a duração da run em segundos. */
  durationStat?: string;
}

/**
 * Runs curtas no estilo Nodebuster/Shelldiver: a rodada dura um tempo
 * (atributo upgradável), tudo que for ganho durante ela é somado, e ao
 * fim o jogador volta para a árvore. A lógica de combate fica no jogo.
 */
export class RunModule implements GameModule {
  readonly id = 'runs';
  readonly events = new EventBus<RunEvents>();
  private durationStat: string;
  private engine!: Engine;

  constructor(opts: RunModuleOptions = {}) {
    this.durationStat = opts.durationStat ?? 'run.duration';
  }

  defaultState(): RunState {
    return { active: false, elapsed: 0, count: 0, collected: {}, best: {}, last: null };
  }

  private st(): RunState {
    return this.engine.getModuleState<RunState>(this.id);
  }

  init(engine: Engine): void {
    this.engine = engine;
    engine.events.on('gain', ({ resource, amount }) => {
      const s = this.st();
      if (!s?.active) return;
      s.collected[resource] = (s.collected[resource] ?? ZERO).add(amount);
    });
  }

  get active(): boolean {
    return this.st().active;
  }

  get elapsed(): number {
    return this.st().elapsed;
  }

  get count(): number {
    return this.st().count;
  }

  get last(): RunSummary | null {
    return this.st().last;
  }

  duration(): number {
    return this.engine.statNumber(this.durationStat);
  }

  timeLeft(): number {
    return Math.max(0, this.duration() - this.st().elapsed);
  }

  collected(resource: string): Decimal {
    return this.st().collected[resource] ?? ZERO;
  }

  start(): void {
    const s = this.st();
    if (s.active) return;
    s.active = true;
    s.elapsed = 0;
    s.collected = {};
    s.count += 1;
    this.events.emit('start', { number: s.count });
  }

  end(reason: RunEndReason): RunSummary | null {
    const s = this.st();
    if (!s.active) return null;
    s.active = false;
    for (const [res, amt] of Object.entries(s.collected)) {
      if (!s.best[res] || amt.gt(s.best[res])) s.best[res] = amt;
    }
    const summary: RunSummary = { number: s.count, seconds: s.elapsed, reason, collected: { ...s.collected } };
    s.last = summary;
    this.events.emit('end', summary);
    return summary;
  }

  /** Enquanto devolver true, o tempo da run não corre (ex.: tutorial esperando um toque). */
  hold: () => boolean = () => false;

  tick(_engine: Engine, dt: number, ctx: TickContext): void {
    const s = this.st();
    if (!s.active || ctx.offline || this.hold()) return;
    s.elapsed += dt;
    if (s.elapsed >= this.duration()) this.end('time');
  }

  onReset(): void {
    const s = this.st();
    s.active = false;
    s.collected = {};
  }
}
