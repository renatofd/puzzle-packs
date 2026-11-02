import { Container, Graphics, type Renderer, type Texture } from 'pixi.js';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, Panel } from '../../src/ui/widgets';
import { LANG_ORDER, LANGS, lang, t, type Lang } from './i18n';

/** Bandeiras desenhadas em código (60 × 40), uma textura por idioma, criadas uma vez. */
const flagCache = new Map<Lang, Texture>();

function star(g: Graphics, x: number, y: number, r: number, color: number, rot = -Math.PI / 2): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill({ color });
}

function drawFlag(l: Lang): Graphics {
  const W = 60;
  const H = 40;
  const g = new Graphics();
  switch (l) {
    case 'en': {
      // Estados Unidos: 13 listras e o cantão azul com estrelas.
      const s = H / 13;
      for (let i = 0; i < 13; i++) g.rect(0, i * s, W, s + 0.5).fill({ color: i % 2 ? 0xffffff : 0xb22234 });
      g.rect(0, 0, W * 0.42, s * 7).fill({ color: 0x3c3b6e });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) star(g, 3 + c * 4.6 + (r % 2) * 2.3, 2.8 + r * 4.8, 1.5, 0xffffff);
      break;
    }
    case 'ru':
      g.rect(0, 0, W, H / 3).fill({ color: 0xffffff });
      g.rect(0, H / 3, W, H / 3).fill({ color: 0x0039a6 });
      g.rect(0, (2 * H) / 3, W, H / 3 + 0.5).fill({ color: 0xd52b1e });
      break;
    case 'pt':
      // Brasil: verde, losango amarelo, círculo azul e a faixa branca.
      g.rect(0, 0, W, H).fill({ color: 0x009c3b });
      g.poly([W / 2, 4, W - 5, H / 2, W / 2, H - 4, 5, H / 2]).fill({ color: 0xffdf00 });
      g.circle(W / 2, H / 2, 9).fill({ color: 0x002776 });
      g.moveTo(W / 2 - 9, H / 2 - 1).quadraticCurveTo(W / 2, H / 2 - 5, W / 2 + 9, H / 2 + 2).stroke({ width: 1.8, color: 0xffffff });
      for (const [x, y] of [[-3, 3], [2, 4], [4, 1], [-1, 6], [-5, 1]]) g.circle(W / 2 + x, H / 2 + y, 0.7).fill({ color: 0xffffff });
      break;
    case 'es':
      g.rect(0, 0, W, H).fill({ color: 0xaa151b });
      g.rect(0, H / 4, W, H / 2).fill({ color: 0xf1bf00 });
      g.roundRect(13, 14, 7, 10, 2).fill({ color: 0xaa151b }).stroke({ width: 1, color: 0x8a6a00 });
      break;
    case 'tr':
      // Turquia: crescente e estrela brancos.
      g.rect(0, 0, W, H).fill({ color: 0xe30a17 });
      g.circle(22, H / 2, 10).fill({ color: 0xffffff });
      g.circle(25, H / 2, 8).fill({ color: 0xe30a17 });
      star(g, 35, H / 2, 4.5, 0xffffff, Math.PI);
      break;
  }
  // Moldura e brilho leve, como uma plaquinha.
  g.rect(0, 0, W, H / 2).fill({ color: 0xffffff, alpha: 0.12 });
  g.rect(0, 0, W, H).stroke({ width: 2, color: 0x1a1433, alignment: 1 });
  return g;
}

export function flagTexture(renderer: Renderer, l: Lang): Texture {
  let tex = flagCache.get(l);
  if (!tex) {
    const g = drawFlag(l);
    tex = renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    flagCache.set(l, tex);
  }
  return tex;
}

/**
 * Popup de idioma: grade de botões com bandeira e nome nativo; o atual
 * fica em destaque. Escolher outro salva e recarrega o jogo.
 */
export class LangPopup extends Container {
  private backdrop = new Graphics();
  private panel: Panel;
  private readonly w = 520;
  private readonly h: number;

  constructor(renderer: Renderer, onPick: (l: Lang) => void, onClose: () => void) {
    super();
    const cols = 2;
    const bw = 220;
    const bh = 52;
    const gap = 14;
    const rows = Math.ceil(LANG_ORDER.length / cols);
    const top = 78;
    this.h = top + rows * (bh + gap) + 80;
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', onClose);
    this.panel = new Panel({ width: this.w, height: this.h, alpha: 1 });
    this.panel.eventMode = 'static';
    const title = label(t('langTitle'), 26, theme.text, { fontWeight: '800', stroke: { color: 0x1a1433, width: 5 } });
    title.anchor.set(0.5, 0);
    title.position.set(this.w / 2, 22);
    this.panel.addChild(title);
    const x0 = (this.w - (cols * bw + (cols - 1) * gap)) / 2;
    LANG_ORDER.forEach((l, i) => {
      const current = l === lang();
      const b = new Button({
        text: LANGS[l].langName,
        width: bw,
        height: bh,
        size: 17,
        color: current ? theme.good : 0x7a6fc4,
        icon: flagTexture(renderer, l),
        onClick: () => (current ? onClose() : onPick(l)),
      });
      b.place(x0 + (i % cols) * (bw + gap), top + Math.floor(i / cols) * (bh + gap));
      this.panel.addChild(b);
    });
    const close = new Button({ text: t('close'), width: 200, height: 48, size: 17, color: theme.good, onClick: onClose });
    close.place(this.w / 2 - 100, this.h - 66);
    this.panel.addChild(close);
    this.addChild(this.backdrop, this.panel);
    Tweens.to(0.25, 0, 1, (v) => !this.destroyed && (this.alpha = v), ease.outCubic);
    Tweens.to(0.35, 0.85, 1, (v) => !this.panel.destroyed && this.panel.scale.set(v * this.fit), ease.outBack);
  }

  private fit = 1;

  layout(W: number, H: number): void {
    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });
    this.fit = Math.min(1, (W - 24) / this.w, (H - 24) / this.h);
    this.panel.pivot.set(this.w / 2, this.h / 2);
    this.panel.position.set(W / 2, H / 2);
    this.panel.scale.set(this.fit);
  }
}
