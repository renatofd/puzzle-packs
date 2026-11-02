import { BitmapText, Container, Graphics, Particle, ParticleContainer, Texture, type Renderer } from 'pixi.js';
import { settings } from './settings';
import { theme } from './theme';

interface LiveParticle {
  p: Particle;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

/**
 * Partículas baratas com ParticleContainer (milhares por frame). Use
 * burst() para explosões ao destruir algo ou comprar um upgrade.
 */
export class Particles extends Container {
  private pc: ParticleContainer;
  private texture: Texture;
  private live: LiveParticle[] = [];
  private free: LiveParticle[] = [];
  gravity = 0;
  drag = 2.5;

  constructor(renderer: Renderer, private maxParticles = 4000) {
    super();
    const g = new Graphics().circle(8, 8, 8).fill({ color: 0xffffff });
    this.texture = renderer.generateTexture(g);
    g.destroy();
    this.pc = new ParticleContainer({
      dynamicProperties: { position: true, scale: true, color: true, rotation: false, uvs: false },
    });
    this.addChild(this.pc);
    this.eventMode = 'none';
  }

  burst(x: number, y: number, color: number, count = 12, speed = 220, size = 0.35, life = 0.6): void {
    // A intensidade de efeitos do menu de opções reduz a quantidade de partículas.
    const n = Math.round(count * settings.values.effects);
    for (let i = 0; i < n; i++) {
      if (this.live.length >= this.maxParticles) return;
      let lp = this.free.pop();
      if (!lp) {
        const p = new Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 });
        lp = { p, vx: 0, vy: 0, life: 0, maxLife: 1, size, active: false };
      }
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      lp.vx = Math.cos(a) * s;
      lp.vy = Math.sin(a) * s;
      lp.maxLife = lp.life = life * (0.6 + Math.random() * 0.4);
      lp.size = size * (0.5 + Math.random() * 0.8);
      lp.p.x = x;
      lp.p.y = y;
      lp.p.tint = color;
      lp.p.alpha = 1;
      lp.p.scaleX = lp.p.scaleY = lp.size;
      this.pc.addParticle(lp.p);
      this.live.push(lp);
    }
  }

  update(dt: number): void {
    if (this.live.length === 0) return;
    const k = Math.exp(-this.drag * dt);
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const lp = this.live[i];
      lp.life -= dt;
      if (lp.life <= 0) {
        this.pc.removeParticle(lp.p);
        this.free.push(lp);
        continue;
      }
      lp.vx *= k;
      lp.vy = lp.vy * k + this.gravity * dt;
      lp.p.x += lp.vx * dt;
      lp.p.y += lp.vy * dt;
      const t = lp.life / lp.maxLife;
      lp.p.alpha = t;
      lp.p.scaleX = lp.p.scaleY = lp.size * (0.4 + 0.6 * t);
      this.live[w++] = lp;
    }
    this.live.length = w;
  }

  clear(): void {
    for (const lp of this.live) {
      this.pc.removeParticle(lp.p);
      this.free.push(lp);
    }
    this.live.length = 0;
  }
}

interface Floater {
  t: BitmapText;
  vy: number;
  life: number;
  maxLife: number;
}

/** Números que sobem e somem ("+12", "CRIT!"), com pool para não criar lixo. */
export class FloatingText extends Container {
  private live: Floater[] = [];
  private pool: BitmapText[] = [];

  constructor(private size = 18) {
    super();
    this.eventMode = 'none';
  }

  spawn(text: string, x: number, y: number, color = theme.text, scale = 1): void {
    if (this.live.length > 200) return;
    let t = this.pool.pop();
    if (!t) {
      t = new BitmapText({ text, style: { fontFamily: theme.fontFamily, fontSize: this.size, fill: 0xffffff, fontWeight: 'bold' } });
      t.anchor.set(0.5);
    }
    t.text = text;
    t.tint = color;
    t.alpha = 1;
    t.scale.set(scale);
    t.position.set(x + (Math.random() - 0.5) * 12, y);
    this.addChild(t);
    this.live.push({ t, vy: -60 - Math.random() * 30, life: 0.9, maxLife: 0.9 });
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const f = this.live[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.removeChild(f.t);
        this.pool.push(f.t);
        continue;
      }
      f.t.y += f.vy * dt;
      f.vy *= Math.exp(-3 * dt);
      f.t.alpha = Math.min(1, (f.life / f.maxLife) * 2);
      this.live[w++] = f;
    }
    this.live.length = w;
  }
}

/** Tremida de tela simples: aplique o offset ao container do mundo. */
export class ScreenShake {
  private trauma = 0;
  x = 0;
  y = 0;

  add(amount: number): void {
    if (!settings.values.screenShake) return;
    this.trauma = Math.min(1, this.trauma + amount * settings.values.effects);
  }

  update(dt: number, maxOffset = 10): void {
    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const s = this.trauma * this.trauma * maxOffset;
    this.x = (Math.random() * 2 - 1) * s;
    this.y = (Math.random() * 2 - 1) * s;
  }
}
