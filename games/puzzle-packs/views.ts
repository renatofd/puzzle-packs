import { BitmapText, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { label } from '../../src/ui/widgets';
import { ART_SIZE, piecePath, type SeriesArt } from './art';
import { COLORS, PACKS, RARITIES, SERIES, pieceCount, type PackId } from './content';
import type { CardResult } from './collection';
import { t } from './i18n';

/** Componentes visuais do Puzzle Packs: pacote, carta e tabuleiro do quebra-cabeça. */

export const CARD_W = 120;
export const CARD_H = 180;
export const PACK_W = 200;
export const PACK_H = 280;

const packColor = (id: PackId) => PACKS.find((p) => p.id === id)?.color ?? COLORS.accent;

/** Pacote lacrado. A tira de cima é separada para o rasgo. */
export class PackView extends Container {
  readonly body = new Container();
  readonly strip = new Container();
  private bodyG = new Graphics();
  private stripG = new Graphics();
  private tear = new Graphics();
  private shine = new Graphics();
  private title = label('', 22, 0xffffff, { fontWeight: '800', align: 'center', wordWrap: true, wordWrapWidth: PACK_W - 30, stroke: { color: 0x000000, width: 4, alpha: 0.4 } });
  private sub = label('', 14, 0xffffff, { fontWeight: '600' });
  private art: Sprite | null = null;
  id: PackId = 'basic';

  constructor(private textures: Record<string, Texture>) {
    super();
    this.title.anchor.set(0.5);
    this.sub.anchor.set(0.5);
    this.body.addChild(this.bodyG, this.shine, this.title, this.sub);
    this.strip.addChild(this.stripG);
    this.addChild(this.body, this.strip, this.tear);
    // O pivô fica no centro para o squash.
    this.pivot.set(PACK_W / 2, PACK_H / 2);
  }

  setPack(id: PackId): void {
    this.id = id;
    const c = packColor(id);
    const W = PACK_W;
    const H = PACK_H;
    const zig = (g: Graphics, y: number) => {
      for (let x = 0; x <= W; x += 10) g.lineTo(x, y + (x / 10) % 2 * 6);
    };
    // Corpo: do zigue-zague para baixo.
    this.bodyG.clear().moveTo(0, 46);
    zig(this.bodyG, 46);
    this.bodyG.lineTo(W, H - 8).lineTo(W - 8, H).lineTo(8, H).lineTo(0, H - 8).closePath().fill({ color: c }).stroke({ width: 3, color: 0xffffff, alpha: 0.35 });
    this.bodyG.roundRect(14, 70, W - 28, H - 100, 12).fill({ color: 0x000000, alpha: 0.18 });
    // Tira de cima.
    this.stripG.clear().moveTo(8, 0).lineTo(W - 8, 0).lineTo(W, 8).lineTo(W, 46);
    for (let x = W; x >= 0; x -= 10) this.stripG.lineTo(x, 46 + (x / 10) % 2 * 6);
    this.stripG.lineTo(0, 8).closePath().fill({ color: c }).stroke({ width: 3, color: 0xffffff, alpha: 0.35 });
    this.stripG.rect(0, 20, W, 8).fill({ color: 0xffffff, alpha: 0.25 });
    this.shine.clear().poly([W * 0.15, 60, W * 0.35, 60, W * 0.1, H - 20, -W * 0.1 + 20, H - 20]).fill({ color: 0xffffff, alpha: 0.12 });
    this.title.text = t(`pack.${id}`);
    this.title.position.set(W / 2, H * 0.48);
    this.sub.position.set(W / 2, H * 0.72);
    this.art?.destroy();
    this.art = null;
    const tex = this.textures[`pack-${id}`];
    if (tex) {
      this.art = new Sprite(tex);
      this.art.width = W;
      this.art.height = H;
      this.body.addChildAt(this.art, 1);
    }
    this.reset();
  }

  setSubtitle(text: string): void {
    this.sub.text = text;
  }

  /** Linha do rasgo seguindo o dedo (0 a 1). */
  setTear(progress: number): void {
    this.tear.clear();
    if (progress <= 0) return;
    const w = PACK_W * Math.min(1, progress);
    this.tear.moveTo(0, 48);
    for (let x = 0; x <= w; x += 10) this.tear.lineTo(x, 48 + (x / 10) % 2 * 6);
    this.tear.stroke({ width: 4, color: 0xffffff, alpha: 0.9 });
    this.strip.rotation = -0.05 * progress;
  }

  reset(): void {
    this.strip.position.set(0, 0);
    this.strip.rotation = 0;
    this.strip.alpha = 1;
    this.body.alpha = 1;
    this.body.position.set(0, 0);
    this.scale.set(1);
    this.alpha = 1;
    this.setTear(0);
  }
}

/** Carta virada para baixo que revela uma peça. */
export class CardView extends Container {
  private back = new Container();
  private front = new Container();
  flipped = false;
  readonly result: CardResult;

  constructor(result: CardResult, art: SeriesArt, textures: Record<string, Texture>) {
    super();
    this.result = result;
    const r = RARITIES[result.rarity];
    const W = CARD_W;
    const H = CARD_H;
    // Verso
    const backTex = textures['card-back'];
    if (backTex) {
      const s = new Sprite(backTex);
      s.width = W;
      s.height = H;
      this.back.addChild(s);
    } else {
      const g = new Graphics().roundRect(0, 0, W, H, 12).fill({ color: 0x2b2450 }).stroke({ width: 3, color: 0xffffff, alpha: 0.5 });
      for (let i = 0; i < 6; i++) g.circle(W / 2, H / 2, 10 + i * 9).stroke({ width: 2, color: 0x6fd3ff, alpha: 0.15 + i * 0.05 });
      const q = label('?', 48, 0xffffff, { fontWeight: '900' });
      q.anchor.set(0.5);
      q.position.set(W / 2, H / 2);
      this.back.addChild(g, q);
    }
    // Frente
    const fg = new Graphics()
      .roundRect(0, 0, W, H, 12)
      .fill({ color: 0x15122a })
      .stroke({ width: result.rarity === 'rare' ? 5 : 3, color: r.color });
    fg.roundRect(8, 8, W - 16, W - 16, 8).fill({ color: 0x000000, alpha: 0.35 });
    const piece = new Sprite(art.pieces[result.piece]);
    const box = W - 16;
    const size = art.cell + art.pad * 2;
    piece.scale.set(box / size);
    piece.position.set(8, 8);
    const name = label(t(result.rarity), 13, r.color, { fontWeight: '800' });
    name.anchor.set(0.5, 0);
    name.position.set(W / 2, W - 4);
    const sn = SERIES[result.series];
    const num = label(`${t(`series.${sn.id}`)} #${result.piece + 1}`, 11, theme.textDim);
    num.anchor.set(0.5, 0);
    num.position.set(W / 2, W + 13);
    this.front.addChild(fg, piece, name, num);
    if (result.rarity === 'rare') {
      const glow = new Graphics().roundRect(-6, -6, W + 12, H + 12, 16).stroke({ width: 6, color: r.color, alpha: 0.5 });
      this.front.addChildAt(glow, 0);
      glow.onRender = () => (glow.alpha = 0.5 + 0.5 * Math.sin(performance.now() / 140));
    }
    const tag = label(result.isNew ? t('new') : `+${Math.round(result.coins)}`, result.isNew ? 18 : 16, result.isNew ? theme.good : COLORS.coins, {
      fontWeight: '900',
      stroke: { color: 0x000000, width: 5 },
    });
    tag.anchor.set(0.5);
    tag.position.set(W / 2, H - 16);
    this.front.addChild(tag);
    if (result.pity) {
      const p = label(t('pity'), 11, theme.warning, { fontWeight: '700', stroke: { color: 0x000000, width: 3 } });
      p.anchor.set(1, 0);
      p.position.set(W - 10, 10);
      this.front.addChild(p);
    }
    this.front.visible = false;
    this.addChild(this.back, this.front);
    this.pivot.set(W / 2, H / 2);
  }

  /** Vira a carta (squash no eixo x). */
  flip(duration = 0.28, done?: () => void): void {
    if (this.flipped) return;
    this.flipped = true;
    const sy = this.scale.y;
    Tweens.add(
      duration,
      (k) => {
        if (this.destroyed) return;
        const half = k < 0.5;
        this.back.visible = half;
        this.front.visible = !half;
        this.scale.x = sy * Math.abs(Math.cos(k * Math.PI));
        this.scale.y = sy * (1 + Math.sin(k * Math.PI) * 0.12);
      },
      ease.inOutQuad,
      () => {
        if (this.destroyed) return;
        this.scale.set(sy);
        done?.();
      },
    );
  }
}

/** Tabuleiro de uma série: peças que já saíram e buracos no formato das que faltam. */
export class BoardView extends Container {
  private holes = new Graphics();
  private sprites: Sprite[] = [];
  private frame = new Graphics();
  readonly scaleK: number;

  constructor(readonly art: SeriesArt, readonly size: number) {
    super();
    this.scaleK = size / ART_SIZE;
    const s = SERIES[art.series];
    this.frame.roundRect(-6, -6, size + 12, size + 12, 10).fill({ color: 0x000000, alpha: 0.35 }).stroke({ width: 2, color: 0xffffff, alpha: 0.15 });
    this.addChild(this.frame, this.holes);
    for (let p = 0; p < pieceCount(s); p++) {
      const sp = new Sprite(art.pieces[p]);
      sp.anchor.set(0.5);
      sp.scale.set(this.scaleK);
      const c = this.pieceCenter(p);
      sp.position.set(c.x, c.y);
      sp.visible = false;
      this.sprites.push(sp);
      this.addChild(sp);
    }
  }

  /** Centro da peça em coordenadas do tabuleiro. */
  pieceCenter(p: number): { x: number; y: number } {
    const n = SERIES[this.art.series].grid;
    const cell = this.art.cell * this.scaleK;
    return { x: (p % n + 0.5) * cell, y: (Math.floor(p / n) + 0.5) * cell };
  }

  /** Mostra as peças com pelo menos 1 cópia, exceto as de `hidden` (ainda sendo reveladas). */
  refresh(owned: number[], hidden: Set<number> = new Set()): void {
    const n = SERIES[this.art.series].grid;
    const cell = this.art.cell * this.scaleK;
    this.holes.clear();
    owned.forEach((c, p) => {
      const show = c > 0 && !hidden.has(p);
      this.sprites[p].visible = show;
      if (!show) {
        const dx = (p % n) * cell;
        const dy = Math.floor(p / n) * cell;
        this.holes.translateTransform(dx, dy);
        piecePath(this.holes, this.art.series, p, cell);
        this.holes.fill({ color: 0x0c0a18, alpha: 0.85 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.18 });
        this.holes.translateTransform(-dx, -dy);
      }
    });
  }

  /** Encaixe animado: a peça cai no lugar com um "pop". */
  snap(p: number): void {
    const sp = this.sprites[p];
    sp.visible = true;
    const k = this.scaleK;
    Tweens.to(0.35, 1.6, 1, (v) => !sp.destroyed && sp.scale.set(k * v), ease.outBack);
    Tweens.to(0.2, 0, 1, (v) => !sp.destroyed && (sp.alpha = v));
  }
}

/** Contador de moedas que sobe suave (BitmapText, muda todo frame). */
export class CoinCounter extends Container {
  readonly value: BitmapText;
  private shown = 0;
  private icon = new Graphics();

  constructor(size = 26) {
    super();
    this.icon.circle(size / 2, size / 2, size / 2).fill({ color: COLORS.coins }).stroke({ width: 2, color: 0x8a6416 });
    this.icon.circle(size / 2, size / 2, size / 3.4).stroke({ width: 2, color: 0x8a6416, alpha: 0.6 });
    this.value = new BitmapText({ text: '0', style: { fontFamily: theme.fontFamily, fontSize: size, fill: 0xffffff, fontWeight: 'bold' } });
    this.value.position.set(size + 10, -2);
    this.addChild(this.icon, this.value);
  }

  update(dt: number, target: number, fmt: (n: number) => string): void {
    if (Math.abs(target - this.shown) < 0.5) this.shown = target;
    else this.shown += (target - this.shown) * Math.min(1, dt * 10);
    const txt = fmt(this.shown);
    if (this.value.text !== txt) this.value.text = txt;
  }

  bump(): void {
    Tweens.to(0.25, 1.25, 1, (v) => !this.destroyed && this.scale.set(v), ease.outBack);
  }
}
