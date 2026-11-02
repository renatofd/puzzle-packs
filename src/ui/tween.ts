export type Easing = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

interface Tween {
  t: number;
  duration: number;
  easing: Easing;
  update: (v: number) => void;
  done?: () => void;
}

/**
 * Tweens mínimos, sem dependência. O kit chama Tweens.update(dt) a cada frame.
 * Para animar uma propriedade: tween(0.3, v => (sprite.scale = 1 + v * 0.2)).
 */
class TweenManager {
  private list: Tween[] = [];

  add(duration: number, update: (v: number) => void, easing: Easing = ease.outQuad, done?: () => void): () => void {
    const tw: Tween = { t: 0, duration, easing, update, done };
    this.list.push(tw);
    update(easing(0));
    return () => {
      this.list = this.list.filter((x) => x !== tw);
    };
  }

  /** Interpola de `from` até `to` chamando `set` com o valor. */
  to(duration: number, from: number, to: number, set: (v: number) => void, easing: Easing = ease.outQuad, done?: () => void) {
    return this.add(duration, (k) => set(from + (to - from) * k), easing, done);
  }

  update(dt: number): void {
    if (this.list.length === 0) return;
    const finished: Tween[] = [];
    for (const tw of this.list) {
      tw.t = Math.min(tw.duration, tw.t + dt);
      tw.update(tw.easing(tw.duration === 0 ? 1 : tw.t / tw.duration));
      if (tw.t >= tw.duration) finished.push(tw);
    }
    if (finished.length) {
      this.list = this.list.filter((x) => !finished.includes(x));
      for (const tw of finished) tw.done?.();
    }
  }
}

export const Tweens = new TweenManager();
