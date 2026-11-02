import { NineSliceSprite, type Texture } from 'pixi.js';

/**
 * Pele opcional dos componentes. Sem pele, `Button`, `Panel` e
 * `ProgressBar` desenham com `Graphics` (o visual padrão do kit). Com pele,
 * usam texturas 9-slice. As texturas devem ser brancas (ou claras): a cor
 * do componente entra como `tint`, então uma peça serve para todas as cores.
 */
export interface SlicedLayer {
  texture: Texture;
  /** Bordas que não esticam: esquerda, topo, direita, baixo (pixels da textura). */
  slice: [number, number, number, number];
  /** Cor fixa da camada; sem ela, a camada recebe a cor do componente. */
  tint?: number;
  alpha?: number;
  /** Escala da textura (0.5 desenha a borda com metade da espessura). */
  scale?: number;
  /** Recuo da camada em relação à caixa do componente (esquerda, topo, direita, baixo); negativo transborda. */
  inset?: [number, number, number, number];
}

export interface Skin {
  /** Camadas do botão, de baixo para cima. */
  button?: SlicedLayer[];
  /** Camadas dos painéis, de baixo para cima. */
  panel?: SlicedLayer[];
  /** Barra de progresso: fundo e preenchimento (o preenchimento recebe a cor). */
  bar?: { back: SlicedLayer[]; fill: SlicedLayer };
  /** Cor do texto dos botões com pele. */
  buttonText?: number;
  /** Contorno do texto dos botões com pele. */
  buttonStroke?: number;
}

export const skin: Skin = {};

export function setSkin(s: Skin): void {
  Object.assign(skin, s);
}

/** Cria as camadas 9-slice de uma pele. */
export function makeLayers(layers: SlicedLayer[]): NineSliceSprite[] {
  return layers.map((l) => {
    const [leftWidth, topHeight, rightWidth, bottomHeight] = l.slice;
    const s = new NineSliceSprite({ texture: l.texture, leftWidth, topHeight, rightWidth, bottomHeight });
    if (l.tint !== undefined) s.tint = l.tint;
    if (l.alpha !== undefined) s.alpha = l.alpha;
    return s;
  });
}

/** Ajusta o tamanho das camadas, respeitando a escala de cada uma. */
export function sizeLayers(sprites: NineSliceSprite[], layers: SlicedLayer[], w: number, h: number, x = 0, y = 0): void {
  sprites.forEach((s, i) => {
    const k = layers[i].scale ?? 1;
    const [l, t, r, b] = layers[i].inset ?? [0, 0, 0, 0];
    s.scale.set(k);
    s.width = Math.max(1, w - l - r) / k;
    s.height = Math.max(1, h - t - b) / k;
    s.position.set(x + l, y + t);
  });
}

/** Mistura uma cor com preto (k < 1) ou branco (k > 1). */
export function shade(color: number, k: number): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (c: number) => Math.round(k <= 1 ? c * k : c + (255 - c) * (k - 1));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
