import type { Engine } from './engine';

export interface LoopOptions {
  /** Ticks de lógica por segundo. */
  tickRate?: number;
  /** Lacunas maiores que isto (aba em segundo plano) viram simulação em blocos. */
  maxCatchUpSeconds?: number;
  /** Chamado a cada frame com o tempo desde o último frame, para a interface. */
  onFrame?: (dt: number) => void;
}

/**
 * Loop com passo fixo: a lógica avança em ticks iguais, independente do
 * FPS, então o jogo dá o mesmo resultado em qualquer máquina.
 */
export class GameLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  readonly step: number;
  private maxCatchUp: number;
  /** Multiplicador de tempo (painel de debug). */
  speed = 1;

  constructor(private engine: Engine, private opts: LoopOptions = {}) {
    this.step = 1 / (opts.tickRate ?? 20);
    this.maxCatchUp = opts.maxCatchUpSeconds ?? 5;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (t: number) => {
      if (!this.running) return;
      const dt = ((t - this.last) / 1000) * this.speed;
      this.last = t;
      this.advance(dt);
      this.opts.onFrame?.(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  advance(dt: number): void {
    if (dt > this.maxCatchUp) {
      this.engine.simulate(dt, 500, { offline: false });
      return;
    }
    this.acc += dt;
    while (this.acc >= this.step) {
      this.engine.tick(this.step);
      this.acc -= this.step;
    }
  }
}
