import { uiScale } from './app';
import { audio } from './audio';
import { BitmapText, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { theme } from './theme';
import { ease, Tweens } from './tween';

export function textStyle(size = 16, color = theme.text, extra: Partial<TextStyleOptions> = {}): TextStyleOptions {
  return { fontFamily: theme.fontFamily, fontSize: size, fill: color, ...extra };
}

/** Texto estático ou que muda pouco (títulos, descrições). */
export function label(text: string, size = 16, color = theme.text, extra: Partial<TextStyleOptions> = {}): Text {
  return new Text({ text, style: textStyle(size, color, extra), resolution: 2 });
}

/**
 * Texto que muda todo frame (contadores, números flutuantes). BitmapText
 * reaproveita um atlas de glifos e é muito mais barato que Text.
 */
export function numberLabel(text: string, size = 16, color = theme.text, bold = false): BitmapText {
  return new BitmapText({
    text,
    style: { fontFamily: theme.fontFamily, fontSize: size, fill: color, fontWeight: bold ? 'bold' : 'normal' },
  });
}

export interface PanelOptions {
  width: number;
  height: number;
  radius?: number;
  fill?: number;
  alpha?: number;
  border?: number;
}

export class Panel extends Container {
  readonly bg = new Graphics();
  private opts: Required<PanelOptions>;

  constructor(opts: PanelOptions) {
    super();
    this.opts = { radius: 10, fill: theme.panel, alpha: 0.95, border: theme.panelBorder, ...opts };
    this.addChild(this.bg);
    this.redraw();
  }

  setSize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    this.redraw();
  }

  get panelWidth(): number {
    return this.opts.width;
  }

  get panelHeight(): number {
    return this.opts.height;
  }

  private redraw(): void {
    const o = this.opts;
    this.bg
      .clear()
      .roundRect(0, 0, o.width, o.height, o.radius)
      .fill({ color: o.fill, alpha: o.alpha })
      .stroke({ width: 1, color: o.border, alpha: 1 });
  }
}

export interface ButtonOptions {
  /** Nome do efeito em `audio` tocado no clique (padrão 'click'; `null` desliga). */
  sound?: string | null;
  text: string;
  width?: number;
  height?: number;
  size?: number;
  color?: number;
  onClick?: () => void;
  /** Começa com o selo "!" no canto (ver `Button.badge`). */
  badge?: boolean;
}

/** Botão com estados de hover, pressionado e desabilitado, e um "pop" ao clicar. */
export class Button extends Container {
  private bg = new Graphics();
  readonly text: Text;
  private hovered = false;
  private pressed = false;
  private _enabled = true;
  private w: number;
  private h: number;
  private color: number;
  private badgeView: Badge | null = null;
  onClick?: () => void;
  /** Som do clique; `null` silencia. */
  sound: string | null;

  constructor(opts: ButtonOptions) {
    super();
    this.sound = opts.sound === undefined ? 'click' : opts.sound;
    this.w = opts.width ?? 160;
    this.h = opts.height ?? 44;
    this.color = opts.color ?? theme.accent;
    this.onClick = opts.onClick;
    this.text = label(opts.text, opts.size ?? 16, theme.text, { fontWeight: '600' });
    this.text.anchor.set(0.5);
    this.text.position.set(this.w / 2, this.h / 2);
    this.pivot.set(this.w / 2, this.h / 2);
    this.addChild(this.bg, this.text);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => ((this.hovered = true), this.redraw()));
    this.on('pointerout', () => ((this.hovered = false), (this.pressed = false), this.redraw()));
    this.on('pointerdown', () => ((this.pressed = true), this.redraw()));
    this.on('pointerup', () => ((this.pressed = false), this.redraw()));
    this.on('pointertap', () => {
      if (!this._enabled) return audio.play('deny');
      if (this.sound) audio.play(this.sound);
      Tweens.to(0.25, 0.9, 1, (v) => !this.destroyed && this.scale.set(v), ease.outBack);
      this.onClick?.();
    });
    this.redraw();
    if (opts.badge) this.badge = true;
  }

  /** Selo "!" pulsando no canto de cima, à direita (ex.: há upgrade para comprar). */
  set badge(on: boolean) {
    if (!on && !this.badgeView) return;
    if (!this.badgeView) {
      this.badgeView = new Badge();
      this.badgeView.position.set(this.w - 6, 2);
      this.addChild(this.badgeView);
    }
    this.badgeView.visible = on;
  }

  get badge(): boolean {
    return this.badgeView?.visible ?? false;
  }

  /** Posiciona pelo canto superior esquerdo (o pivô fica no centro para o "pop"). */
  place(x: number, y: number): this {
    this.position.set(x + this.w / 2, y + this.h / 2);
    return this;
  }

  get buttonWidth(): number {
    return this.w;
  }

  get buttonHeight(): number {
    return this.h;
  }

  set enabled(v: boolean) {
    if (v === this._enabled) return;
    this._enabled = v;
    this.cursor = v ? 'pointer' : 'default';
    this.redraw();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setText(t: string): void {
    if (this.text.text !== t) this.text.text = t;
  }

  setColor(c: number): void {
    this.color = c;
    this.redraw();
  }

  private redraw(): void {
    const c = this._enabled ? this.color : theme.nodeLocked;
    const fillAlpha = !this._enabled ? 0.15 : this.pressed ? 0.45 : this.hovered ? 0.32 : 0.2;
    this.bg
      .clear()
      .roundRect(0, 0, this.w, this.h, 8)
      .fill({ color: c, alpha: fillAlpha })
      .stroke({ width: 1.5, color: c, alpha: this._enabled ? 1 : 0.5 });
    this.text.alpha = this._enabled ? 1 : 0.5;
  }
}

/**
 * Selo "!" pulsando, para avisar que há algo para comprar ou ver. Use
 * `Button.badge` nos botões; para outros alvos, adicione um Badge solto.
 */
export class Badge extends Container {
  readonly text: Text;

  constructor(text = '!', size = 26, color = theme.warning) {
    super();
    this.text = label(text, size, color, { fontWeight: '700', stroke: { color: 0x000000, width: 5 } });
    this.text.anchor.set(0.5);
    this.addChild(this.text);
    this.eventMode = 'none';
    this.visible = false;
    this.onRender = () => this.text.scale.set(1 + Math.sin(performance.now() / 160) * 0.15);
  }
}

/** Barra de progresso com preenchimento suavizado. */
export class ProgressBar extends Container {
  private bg = new Graphics();
  private fg = new Graphics();
  private shown = 0;
  private target = 0;

  constructor(private w: number, private h: number, private color = theme.accent) {
    super();
    this.addChild(this.bg, this.fg);
    this.bg.roundRect(0, 0, w, h, h / 2).fill({ color: theme.panelBorder });
  }

  setValue(v: number, instant = false): void {
    this.target = Math.max(0, Math.min(1, v));
    if (instant) this.shown = this.target;
    this.draw();
  }

  setColor(c: number): void {
    this.color = c;
    this.draw();
  }

  resizeBar(w: number): void {
    this.w = w;
    this.bg.clear().roundRect(0, 0, w, this.h, this.h / 2).fill({ color: theme.panelBorder });
    this.draw();
  }

  update(dt: number): void {
    if (Math.abs(this.shown - this.target) < 0.001) return;
    this.shown += (this.target - this.shown) * Math.min(1, dt * 12);
    this.draw();
  }

  private draw(): void {
    this.fg.clear();
    const w = this.w * this.shown;
    if (w > 0.5) this.fg.roundRect(0, 0, Math.max(this.h, w), this.h, this.h / 2).fill({ color: this.color });
  }
}

export interface TooltipLine {
  text: string;
  color?: number;
  size?: number;
  bold?: boolean;
}

/**
 * Tooltip único, desenhado na camada overlay. Mostre com show() passando
 * linhas e uma posição; ele se ajusta para não sair da tela.
 */
export class Tooltip extends Container {
  private bg = new Graphics();
  private lines = new Container();
  /** Fundo e linhas, girando em torno do centro na tremida de `wobble()`. */
  private body = new Container();
  private pool: Text[] = [];
  private stopWobble: (() => void) | null = null;

  constructor(private screen: () => { width: number; height: number }) {
    super();
    this.body.addChild(this.bg, this.lines);
    this.addChild(this.body);
    this.visible = false;
    this.eventMode = 'none';
  }

  show(content: TooltipLine[], x: number, y: number, maxWidth = 280): void {
    this.lines.removeChildren();
    let cy = 10;
    let w = 0;
    content.forEach((l, i) => {
      let t = this.pool[i];
      if (!t) this.pool.push((t = label('', 14)));
      t.style = textStyle(l.size ?? 14, l.color ?? theme.text, {
        fontWeight: l.bold ? '700' : '400',
        wordWrap: true,
        wordWrapWidth: maxWidth,
      });
      t.text = l.text;
      t.position.set(12, cy);
      this.lines.addChild(t);
      cy += t.height + 4;
      w = Math.max(w, t.width);
    });
    const width = w + 24;
    const height = cy + 6;
    this.bg
      .clear()
      .roundRect(0, 0, width, height, 8)
      .fill({ color: theme.panel, alpha: 0.97 })
      .stroke({ width: 1, color: theme.panelBorder });
    this.body.pivot.set(width / 2, height / 2);
    this.body.position.set(width / 2, height / 2);
    // Trabalha em unidades lógicas e escala junto com o resto do HUD.
    const s = this.screen();
    const k = uiScale(s.width, s.height);
    const W = s.width / k;
    const H = s.height / k;
    x /= k;
    y /= k;
    let px = x + 18;
    let py = y + 18;
    if (px + width > W - 8) px = x - width - 18;
    if (py + height > H - 8) py = H - height - 8;
    this.scale.set(k);
    this.position.set(Math.max(8, px) * k, Math.max(8, py) * k);
    this.visible = true;
  }

  /** Tremida rápida no ângulo, para quando o painel abre. */
  wobble(strength = 0.08): void {
    this.stopWobble?.();
    this.stopWobble = Tweens.add(
      0.4,
      (k) => (this.body.rotation = Math.sin(k * Math.PI * 5) * strength * (1 - k)),
      ease.linear,
      () => ((this.body.rotation = 0), (this.stopWobble = null)),
    );
  }

  hide(): void {
    this.visible = false;
  }
}

/** Notificações curtas empilhadas no canto (conquistas, desbloqueios). */
export class Toasts extends Container {
  private items: Container[] = [];

  constructor(private screen: () => { width: number; height: number }) {
    super();
    this.eventMode = 'none';
  }

  push(title: string, body = '', color = theme.warning): void {
    const c = new Container();
    const t = label(title, 15, color, { fontWeight: '700' });
    const b = label(body, 13, theme.textDim, { wordWrap: true, wordWrapWidth: 260 });
    t.position.set(14, 10);
    b.position.set(14, 32);
    const w = Math.max(t.width, b.width) + 28;
    const h = body ? b.y + b.height + 10 : 40;
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 8)
      .fill({ color: theme.panel, alpha: 0.97 })
      .stroke({ width: 1.5, color });
    c.addChild(bg, t);
    if (body) c.addChild(b);
    this.addChild(c);
    this.items.unshift(c);
    // Muitas conquistas juntas não podem cobrir a tela inteira.
    for (const old of this.items.splice(5)) old.destroy({ children: true });
    this.layout();
    const s = this.screen();
    const k = uiScale(s.width, s.height);
    this.scale.set(k);
    const W = s.width / k;
    Tweens.to(0.35, W + 10, W - w - 16, (v) => !c.destroyed && (c.x = v), ease.outCubic);
    setTimeout(() => {
      if (c.destroyed) return;
      Tweens.to(0.3, 1, 0, (v) => !c.destroyed && (c.alpha = v), ease.linear, () => {
        this.items = this.items.filter((x) => x !== c);
        if (!c.destroyed) c.destroy({ children: true });
        this.layout();
      });
    }, 3500);
  }

  private layout(): void {
    let y = 16;
    for (const c of this.items) {
      c.y = y;
      y += c.height + 8;
    }
  }
}

/** Controle deslizante de 0 a 1, arrastável com mouse ou toque. */
export class Slider extends Container {
  private track = new Graphics();
  private fill = new Graphics();
  private knob = new Graphics();
  private dragging = false;
  private _value: number;

  constructor(private w: number, value: number, private onChange: (v: number) => void, private color = theme.accent) {
    super();
    this._value = value;
    this.addChild(this.track, this.fill, this.knob);
    this.track.roundRect(0, -3, w, 6, 3).fill({ color: theme.panelBorder });
    this.knob.circle(0, 0, 9).fill({ color: theme.text }).stroke({ width: 2, color });
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = { contains: (x: number, y: number) => x >= -10 && x <= w + 10 && y >= -14 && y <= 14 };
    const set = (gx: number) => {
      const local = this.toLocal({ x: gx, y: 0 });
      this.value = Math.max(0, Math.min(1, local.x / this.w));
      this.onChange(this._value);
    };
    this.on('pointerdown', (e) => {
      this.dragging = true;
      set(e.global.x);
    });
    this.on('globalpointermove', (e) => this.dragging && set(e.global.x));
    this.on('pointerup', () => (this.dragging = false));
    this.on('pointerupoutside', () => (this.dragging = false));
    this.draw();
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this._value = v;
    this.draw();
  }

  private draw(): void {
    const x = this._value * this.w;
    this.fill.clear();
    if (x > 0) this.fill.roundRect(0, -3, x, 6, 3).fill({ color: this.color });
    this.knob.x = x;
  }
}
