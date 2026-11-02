import { Container, FillGradient, Graphics, Rectangle, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import { SERIES, pieceCount, type SeriesDef } from './content';

/**
 * Arte das séries. Cada série é UMA imagem quadrada; as peças de jigsaw
 * são cortadas aqui, em código, para trocar a ilustração sem retrabalho.
 * Sem imagem (assets/manifest.json com "ready": false), desenha um
 * placeholder com gradiente, formas e números.
 */

export const ART_SIZE = 600;

export interface SeriesArt {
  series: number;
  /** Ilustração inteira, ART_SIZE × ART_SIZE. */
  full: Texture;
  /** Lado de uma célula da grade, em pixels da ilustração. */
  cell: number;
  /** Margem em volta da célula para os encaixes (tabs) da peça. */
  pad: number;
  /** Peça já recortada no formato de jigsaw, com `pad` em volta. */
  pieces: Texture[];
}

// ------------------------------------------------------------ jigsaw

/** Direção do encaixe numa borda interna: 1 ou -1, fixo por série. */
function edgeSign(series: number, kind: 'h' | 'v', x: number, y: number): number {
  let h = (series + 1) * 374761393 + x * 668265263 + y * 2147483647 + (kind === 'h' ? 1442695041 : 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h & 1 ? 1 : -1;
}

/**
 * Encaixe de cada lado da peça: 1 = para fora, -1 = para dentro, 0 = reto (borda).
 * Ordem: cima, direita, baixo, esquerda.
 */
export function pieceTabs(series: number, piece: number): [number, number, number, number] {
  const n = SERIES[series].grid;
  const x = piece % n;
  const y = Math.floor(piece / n);
  const right = x < n - 1 ? edgeSign(series, 'v', x, y) : 0;
  const left = x > 0 ? -edgeSign(series, 'v', x - 1, y) : 0;
  const bottom = y < n - 1 ? edgeSign(series, 'h', x, y) : 0;
  const top = y > 0 ? -edgeSign(series, 'h', x, y - 1) : 0;
  return [top, right, bottom, left];
}

/** Desenha o contorno da peça (sem preencher) em coordenadas locais da célula 0..c. */
export function piecePath(g: Graphics, series: number, piece: number, c: number): Graphics {
  const [top, right, bottom, left] = pieceTabs(series, piece);
  const corners: Array<[number, number]> = [
    [0, 0],
    [c, 0],
    [c, c],
    [0, c],
  ];
  // Normal para fora de cada lado.
  const normals: Array<[number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const tabs = [top, right, bottom, left];
  g.moveTo(0, 0);
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 4];
    const t = tabs[i];
    if (t === 0) {
      g.lineTo(x1, y1);
      continue;
    }
    const [nx, ny] = normals[i];
    const at = (u: number, v: number): [number, number] => [x0 + (x1 - x0) * u + nx * v * c * t, y0 + (y1 - y0) * u + ny * v * c * t];
    g.lineTo(...at(0.38, 0));
    g.bezierCurveTo(...at(0.44, 0.02), ...at(0.3, 0.24), ...at(0.5, 0.24));
    g.bezierCurveTo(...at(0.7, 0.24), ...at(0.56, 0.02), ...at(0.62, 0));
    g.lineTo(x1, y1);
  }
  return g.closePath();
}

// ------------------------------------------------------- placeholders

function gradient(top: number, mid: number, bottom: number): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: top },
      { offset: 0.55, color: mid },
      { offset: 1, color: bottom },
    ],
    textureSpace: 'local',
  });
}

function rand(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** Placeholder: cena simples por série (aurora, floresta, oceano) com números grandes. */
function paintPlaceholder(series: number): Container {
  const S = ART_SIZE;
  const c = new Container();
  const g = new Graphics();
  const r = rand(series * 99 + 7);
  if (series === 0) {
    g.rect(0, 0, S, S).fill(gradient(0x241a4f, 0xc1467a, 0xffb36b));
    for (let i = 0; i < 60; i++) g.circle(r() * S, r() * S * 0.5, 1 + r() * 2).fill({ color: 0xffffff, alpha: 0.4 + r() * 0.5 });
    g.circle(S * 0.5, S * 0.58, S * 0.18).fill({ color: 0xffe28a });
    g.circle(S * 0.5, S * 0.58, S * 0.24).fill({ color: 0xffe28a, alpha: 0.25 });
    g.poly([0, S, 0, S * 0.7, S * 0.22, S * 0.5, S * 0.42, S * 0.72, S * 0.6, S * 0.55, S * 0.82, S * 0.75, S, S * 0.6, S, S]).fill({ color: 0x3b2259 });
    g.poly([0, S, 0, S * 0.85, S * 0.3, S * 0.72, S * 0.55, S * 0.86, S * 0.8, S * 0.76, S, S * 0.88, S, S]).fill({ color: 0x1d1236 });
  } else if (series === 1) {
    g.rect(0, 0, S, S).fill(gradient(0x0e3b43, 0x2f8f6a, 0xbfe39a));
    g.circle(S * 0.78, S * 0.2, S * 0.08).fill({ color: 0xfdf6c3 });
    g.ellipse(S * 0.3, S * 0.95, S * 0.6, S * 0.3).fill({ color: 0x1f5c3a });
    g.ellipse(S * 0.85, S * 1.0, S * 0.5, S * 0.3).fill({ color: 0x174a2f });
    for (let i = 0; i < 26; i++) {
      const x = r() * S;
      const base = S * (0.62 + r() * 0.35);
      const h = S * (0.12 + r() * 0.2);
      const w = h * 0.45;
      g.rect(x - 3, base - 4, 6, 14).fill({ color: 0x4a2f1f });
      g.poly([x, base - h, x - w, base, x + w, base]).fill({ color: [0x2e7d4f, 0x3f9d5a, 0x1f6b44][i % 3] });
    }
  } else {
    g.rect(0, 0, S, S).fill(gradient(0x7fd3ff, 0x2a7fd4, 0x0b2a66));
    g.circle(S * 0.25, S * 0.22, S * 0.09).fill({ color: 0xfff1a8 });
    for (let k = 0; k < 7; k++) {
      const y = S * (0.42 + k * 0.085);
      g.moveTo(0, y);
      for (let x = 0; x <= S; x += S / 8) g.quadraticCurveTo(x + S / 16, y - 14, x + S / 8, y);
      g.lineTo(S, S).lineTo(0, S).closePath().fill({ color: [0x3d9be0, 0x2f86cf, 0x2471bd, 0x1d5fa8, 0x174d94, 0x123f80, 0x0d316b][k], alpha: 0.85 });
    }
    // Barco
    g.poly([S * 0.55, S * 0.4, S * 0.78, S * 0.4, S * 0.73, S * 0.46, S * 0.6, S * 0.46]).fill({ color: 0x6b3b1f });
    g.poly([S * 0.66, S * 0.22, S * 0.66, S * 0.39, S * 0.77, S * 0.39]).fill({ color: 0xffffff });
    for (let i = 0; i < 8; i++) {
      const x = S * (0.1 + r() * 0.8);
      const y = S * (0.6 + r() * 0.35);
      g.ellipse(x, y, 16, 8).fill({ color: [0xffa94d, 0xff6b6b, 0xffd43b][i % 3] });
      g.poly([x - 14, y, x - 26, y - 8, x - 26, y + 8]).fill({ color: [0xffa94d, 0xff6b6b, 0xffd43b][i % 3] });
    }
  }
  c.addChild(g);
  // Número de cada peça bem visível: é o placeholder "numerado".
  const s = SERIES[series];
  const cell = S / s.grid;
  for (let p = 0; p < pieceCount(s); p++) {
    const t = new Text({
      text: String(p + 1),
      style: { fontFamily: 'system-ui, sans-serif', fontSize: cell * 0.32, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 4, alpha: 0.35 } },
    });
    t.alpha = 0.55;
    t.anchor.set(0.5);
    t.position.set((p % s.grid + 0.5) * cell, (Math.floor(p / s.grid) + 0.5) * cell);
    c.addChild(t);
  }
  return c;
}

// --------------------------------------------------------------- corte

/** Monta a arte de uma série: a imagem (ou placeholder) e as peças recortadas. */
export function buildSeriesArt(renderer: Renderer, series: number, image?: Texture): SeriesArt {
  const s: SeriesDef = SERIES[series];
  const S = ART_SIZE;
  const source = image ? Object.assign(new Sprite(image), { width: S, height: S }) : paintPlaceholder(series);
  const full = renderer.generateTexture({ target: source, frame: new Rectangle(0, 0, S, S) });
  source.destroy({ children: true });

  const cell = S / s.grid;
  const pad = Math.ceil(cell * 0.26);
  const pieces: Texture[] = [];
  for (let p = 0; p < pieceCount(s); p++) {
    const x = p % s.grid;
    const y = Math.floor(p / s.grid);
    const holder = new Container();
    const img = new Sprite(full);
    img.position.set(-x * cell, -y * cell);
    const mask = piecePath(new Graphics(), series, p, cell).fill({ color: 0xffffff });
    img.mask = mask;
    const outline = piecePath(new Graphics(), series, p, cell).stroke({ width: 3, color: 0xffffff, alpha: 0.55 });
    holder.addChild(img, mask, outline);
    pieces.push(renderer.generateTexture({ target: holder, frame: new Rectangle(-pad, -pad, cell + pad * 2, cell + pad * 2) }));
    holder.destroy({ children: true });
  }
  return { series, full, cell, pad, pieces };
}
