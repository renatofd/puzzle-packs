import { BitmapText, Container, FederatedPointerEvent, Graphics } from 'pixi.js';
import { hasAffordable } from '../../src/core/engine';
import { D, format } from '../../src/core/num';
import type { RunSummary } from '../../src/modules/runs';
import { audio } from '../../src/ui/audio';
import { Scene, uiScale } from '../../src/ui/app';
import { FloatingText, Particles, ScreenShake } from '../../src/ui/fx';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, numberLabel, Panel, ProgressBar } from '../../src/ui/widgets';
import { ARENA_H, ARENA_W, type ArenaNode } from './arena';
import { COLORS } from './content';
import type { GameContext } from './context';

const NODE_COLOR: Record<ArenaNode['kind'], number> = {
  normal: 0x4cc9f0,
  big: 0x7b8cff,
  gold: COLORS.cores,
  boss: 0xf25f5c,
};

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  color: number;
  jagged: boolean;
}

/** A arena da run: desenha o estado da ArenaModule e transforma eventos em efeitos. */
export class RunScene extends Scene {
  private arenaRoot = new Container();
  private grid = new Graphics();
  private nodesGfx = new Graphics();
  private fxGfx = new Graphics();
  private cursorGfx = new Graphics();
  private particles!: Particles;
  private floaters = new FloatingText(20);
  private shake = new ScreenShake();
  private lines: Line[] = [];
  private attackFlash = 0;
  private timerBar = new ProgressBar(400, 10, theme.accent);
  private timerText = numberLabel('', 18, theme.text, true);
  private bitsText: BitmapText;
  private coresText: BitmapText;
  private hint = label('ESC encerra a run', 12, theme.textDim);
  private summary: Panel | null = null;
  private autoTimer = -1;
  private unsubs: Array<() => void> = [];
  private arenaScale = 1;
  private hud = new Container();

  constructor(private ctx: GameContext) {
    super();
    this.bitsText = numberLabel('0', 22, COLORS.bits, true);
    this.coresText = numberLabel('', 22, COLORS.cores, true);
    this.particles = new Particles(ctx.kit.app.renderer);
    this.arenaRoot.addChild(this.grid, this.nodesGfx, this.fxGfx, this.particles, this.floaters, this.cursorGfx);
    this.hud.addChild(this.timerBar, this.timerText, this.bitsText, this.coresText, this.hint);
    this.root.addChild(this.arenaRoot, this.hud);
    this.drawGrid();
  }

  onEnter(): void {
    const { runs } = this.ctx.game;
    const stage = this.kit.app.stage;
    const move = (e: FederatedPointerEvent) => this.setCursor(e.global.x, e.global.y);
    stage.on('globalpointermove', move);
    this.unsubs.push(() => stage.off('globalpointermove', move));
    const key = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') return this.ctx.menu.toggle();
      if (this.ctx.menu.isOpen) return;
      if (e.key === 'Escape' && runs.active) runs.end('quit');
      if ((e.key === ' ' || e.key === 'Enter') && this.summary) this.startNext();
    };
    window.addEventListener('keydown', key);
    this.unsubs.push(() => window.removeEventListener('keydown', key));
    this.unsubs.push(runs.events.on('end', (s) => (audio.play('runEnd'), this.showSummary(s))));
    this.unsubs.push(runs.events.on('start', () => audio.play('runStart')));
    this.closeSummary();
    this.particles.clear();
    this.lines = [];
    if (!runs.active) runs.start();
  }

  onExit(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.closeSummary();
  }

  resize(w: number, h: number): void {
    const k = uiScale(w, h);
    const W = w / k;
    const H = h / k;
    this.hud.scale.set(k);
    // Em tela estreita o timer desce para uma segunda linha do HUD.
    const narrow = W < 760;
    const top = (narrow ? 96 : 70) * k;
    const scale = Math.min((w - 32) / ARENA_W, (h - top - 16) / ARENA_H);
    this.arenaScale = scale;
    this.arenaRoot.scale.set(scale);
    this.arenaRoot.position.set((w - ARENA_W * scale) / 2, top + (h - top - 16 - ARENA_H * scale) / 2);
    const barW = narrow ? W - 48 - 70 : Math.min(500, W - 340);
    const barX = narrow ? 24 : (W - barW) / 2;
    const barY = narrow ? 80 : 30;
    this.timerBar.resizeBar(barW);
    this.timerBar.position.set(barX, barY);
    this.timerText.position.set(barX + barW + 12, barY - 8);
    this.bitsText.position.set(24, 20);
    this.coresText.position.set(24, 44);
    this.hint.position.set(W - this.hint.width - 20, 24);
    if (this.summary) this.summary.position.set((W - this.summary.panelWidth) / 2, (H - this.summary.panelHeight) / 2);
  }

  private setCursor(sx: number, sy: number): void {
    const p = this.arenaRoot.toLocal({ x: sx, y: sy });
    const a = this.ctx.game.arena;
    a.cursor.x = p.x;
    a.cursor.y = p.y;
    a.cursor.inside = p.x >= 0 && p.y >= 0 && p.x <= ARENA_W && p.y <= ARENA_H && !this.summary;
  }

  update(dt: number): void {
    const { arena, runs, engine } = this.ctx.game;
    this.consumeEvents();
    this.shake.update(dt);
    this.arenaRoot.pivot.set(-this.shake.x / this.arenaScale, -this.shake.y / this.arenaScale);
    this.particles.update(dt);
    this.floaters.update(dt);
    this.timerBar.update(dt);
    if (runs.active) {
      const left = runs.timeLeft();
      this.timerBar.setValue(left / runs.duration());
      this.timerBar.setColor(left < 3 ? theme.bad : theme.accent);
      this.timerText.text = `${left.toFixed(1)}s`;
      this.bitsText.text = `+${format(runs.collected('bits'))} Bits`;
      const c = runs.collected('cores');
      this.coresText.text = c.gt(0) ? `+${format(c)} Núcleos` : '';
    }
    this.drawNodes();
    this.drawEffects(dt);
    this.drawCursor(dt, engine.statNumber('cursor.radius'), arena.cursor.inside && runs.active);
    if (this.autoTimer > 0) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) this.startNext();
    }
  }

  private consumeEvents(): void {
    for (const e of this.ctx.game.arena.drainEvents()) {
      switch (e.type) {
        case 'attack':
          this.attackFlash = 1;
          break;
        case 'hit':
          audio.play('hit', { volume: 0.6 });
          if (e.crit) this.floaters.spawn('CRIT', e.node.x, e.node.y - e.node.r - 8, theme.warning, 0.8);
          break;
        case 'kill': {
          const color = NODE_COLOR[e.node.kind];
          const big = e.node.kind !== 'normal';
          audio.play(big ? 'bigKill' : 'kill', { pitch: big ? 1 : 0.9 + Math.random() * 0.3 });
          this.particles.burst(e.node.x, e.node.y, color, big ? 40 : 14, big ? 380 : 240, big ? 0.6 : 0.4);
          this.floaters.spawn(`+${format(D(e.bits))}`, e.node.x, e.node.y, COLORS.bits);
          if (e.cores > 0) this.floaters.spawn(`+${format(D(e.cores))} Núcleo`, e.node.x, e.node.y - 24, COLORS.cores, 1.1);
          if (e.node.kind === 'boss') this.shake.add(1);
          else if (big) this.shake.add(0.25);
          break;
        }
        case 'chain':
          audio.play('zap');
          this.lines.push({ x1: e.fromX, y1: e.fromY, x2: e.toX, y2: e.toY, life: 0.25, color: 0xc9f2ff, jagged: true });
          break;
        case 'shot':
          this.lines.push({ x1: e.fromX, y1: e.fromY, x2: e.toX, y2: e.toY, life: 0.12, color: 0x9fffb0, jagged: false });
          break;
      }
    }
  }

  private drawGrid(): void {
    const g = this.grid;
    g.rect(0, 0, ARENA_W, ARENA_H).fill({ color: 0x0f1420 }).stroke({ width: 2, color: theme.panelBorder });
    for (let x = 80; x < ARENA_W; x += 80) g.moveTo(x, 0).lineTo(x, ARENA_H);
    for (let y = 80; y < ARENA_H; y += 80) g.moveTo(0, y).lineTo(ARENA_W, y);
    g.stroke({ width: 1, color: 0x1a2232 });
  }

  private drawNodes(): void {
    const g = this.nodesGfx.clear();
    for (const n of this.ctx.game.arena.nodes) {
      const color = NODE_COLOR[n.kind];
      const sides = n.kind === 'boss' ? 8 : n.kind === 'big' ? 6 : 4;
      const pts: number[] = [];
      for (let i = 0; i < sides; i++) {
        const a = n.angle + (i / sides) * Math.PI * 2;
        pts.push(n.x + Math.cos(a) * n.r, n.y + Math.sin(a) * n.r);
      }
      const frac = Math.max(0, n.hp / n.maxHp);
      g.poly(pts).fill({ color, alpha: 0.15 + 0.25 * frac }).stroke({ width: 2, color });
      if (frac < 1) {
        g.moveTo(n.x, n.y - n.r - 6)
          .arc(n.x, n.y, n.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
          .stroke({ width: 3, color: theme.text, alpha: 0.7 });
      }
    }
    for (const d of this.ctx.game.arena.drones) g.circle(d.x, d.y, 6).fill({ color: 0x9fffb0 });
  }

  private drawEffects(dt: number): void {
    const g = this.fxGfx.clear();
    let w = 0;
    for (const l of this.lines) {
      l.life -= dt;
      if (l.life <= 0) continue;
      if (l.jagged) {
        g.moveTo(l.x1, l.y1);
        const segs = 6;
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          g.lineTo(l.x1 + (l.x2 - l.x1) * t + (Math.random() - 0.5) * 18, l.y1 + (l.y2 - l.y1) * t + (Math.random() - 0.5) * 18);
        }
        g.lineTo(l.x2, l.y2).stroke({ width: 3, color: l.color, alpha: Math.min(1, l.life * 6) });
      } else {
        g.moveTo(l.x1, l.y1).lineTo(l.x2, l.y2).stroke({ width: 2, color: l.color, alpha: Math.min(1, l.life * 10) });
      }
      this.lines[w++] = l;
    }
    this.lines.length = w;
  }

  private drawCursor(dt: number, radius: number, visible: boolean): void {
    const g = this.cursorGfx.clear();
    this.attackFlash = Math.max(0, this.attackFlash - dt * 6);
    if (!visible) return;
    const { x, y } = this.ctx.game.arena.cursor;
    g.circle(x, y, radius).fill({ color: theme.accent, alpha: 0.05 + 0.18 * this.attackFlash });
    g.circle(x, y, radius + this.attackFlash * 4).stroke({ width: 2, color: theme.accent, alpha: 0.6 + 0.4 * this.attackFlash });
    g.circle(x, y, 3).fill({ color: theme.text });
  }

  private showSummary(s: RunSummary): void {
    const { engine } = this.ctx.game;
    this.ctx.saves.save();
    const p = new Panel({ width: 360, height: 250 });
    const title = label(s.reason === 'quit' ? 'Run encerrada' : 'Tempo esgotado', 22, theme.text, { fontWeight: '700' });
    title.position.set(24, 20);
    const bits = label(`+${format(s.collected.bits ?? 0)} Bits`, 20, COLORS.bits, { fontWeight: '700' });
    bits.position.set(24, 62);
    p.addChild(title, bits);
    let y = 92;
    if (s.collected.cores?.gt(0)) {
      const c = label(`+${format(s.collected.cores)} Núcleos`, 18, COLORS.cores, { fontWeight: '700' });
      c.position.set(24, y);
      p.addChild(c);
      y += 28;
    }
    const total = label(`Total: ${format(engine.amount('bits'))} Bits`, 14, theme.textDim);
    total.position.set(24, y + 4);
    p.addChild(total);
    const auto = engine.statNumber('auto.run') > 0;
    const back = new Button({ text: 'Árvore', width: 150, badge: hasAffordable(engine, ['main', 'reboot']), onClick: () => this.ctx.goToHub() }).place(24, 180);
    const again = new Button({ text: auto ? 'Nova run (auto)' : 'Nova run', width: 150, color: theme.good, onClick: () => this.startNext() }).place(186, 180);
    p.addChild(back, again);
    this.summary = p;
    this.hud.addChild(p);
    this.resize(this.kit.width, this.kit.height);
    Tweens.to(0.3, 0, 1, (v) => !p.destroyed && ((p.alpha = v), p.scale.set(1, 0.9 + 0.1 * v)), ease.outBack);
    this.autoTimer = auto ? 2 : -1;
  }

  private closeSummary(): void {
    this.summary?.destroy({ children: true });
    this.summary = null;
    this.autoTimer = -1;
  }

  private startNext(): void {
    this.closeSummary();
    this.ctx.game.runs.start();
  }
}
