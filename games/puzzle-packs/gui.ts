import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { KitApp } from '../../src/ui/app';
import { setSkin } from '../../src/ui/skin';

/**
 * Pele da interface (kit GUI Pro-FantasyHero do acervo do Renato). As
 * peças são brancas e recebem a cor de cada botão/painel como tint.
 * Se alguma textura não estiver no manifest, a interface continua com o
 * visual desenhado do kit.
 */
const DARK = 0x1a1433;

export function applyGuiSkin(tx: Record<string, Texture>): void {
  const b = tx['gui-button-bg'];
  const bb = tx['gui-button-border'];
  if (b && bb) {
    setSkin({
      button: [
        // Sombra embaixo, para o botão parecer saltado.
        { texture: b, slice: [12, 12, 12, 12], tint: 0x000000, alpha: 0.35, inset: [0, 3, 0, -3] },
        { texture: b, slice: [12, 12, 12, 12] },
        { texture: bb, slice: [12, 12, 12, 12], tint: DARK },
      ],
      buttonText: 0xffffff,
      buttonStroke: DARK,
    });
  }
  const pb = tx['gui-panel-bg'];
  const pr = tx['gui-panel-border'];
  const pi = tx['gui-panel-inner'];
  if (pb && pr && pi) {
    setSkin({
      panel: [
        { texture: pb, slice: [32, 32, 32, 34], scale: 0.5 },
        { texture: pr, slice: [32, 32, 32, 34], scale: 0.5, tint: DARK },
        { texture: pi, slice: [28, 28, 28, 28], scale: 0.5, alpha: 0.6, inset: [2, 2, 2, 4] },
      ],
    });
  }
  const rb = tx['gui-bar-bg'];
  const rr = tx['gui-bar-border'];
  const rf = tx['gui-bar-fill'];
  if (rb && rr && rf) {
    setSkin({
      bar: {
        back: [
          { texture: rb, slice: [8, 8, 8, 8], scale: 0.5, tint: 0x0e0b1f, alpha: 0.85 },
          { texture: rr, slice: [8, 8, 8, 8], scale: 0.5, tint: DARK },
        ],
        fill: { texture: rf, slice: [4, 6, 4, 6], scale: 0.4 },
      },
    });
  }
}

/** Fundo ilustrado atrás de todas as cenas, cobrindo a tela, com um véu escuro para o HUD ler bem. */
export function addBackground(kit: KitApp, tex: Texture | undefined): void {
  if (!tex) return;
  const root = new Container();
  const img = new Sprite(tex);
  img.anchor.set(0.5);
  const veil = new Graphics();
  root.addChild(img, veil);
  root.eventMode = 'none';
  kit.app.stage.addChildAt(root, 0);
  kit.onResize((w, h) => {
    const k = Math.max(w / tex.width, h / tex.height);
    img.scale.set(k);
    img.position.set(w / 2, h / 2);
    veil.clear().rect(0, 0, w, h).fill({ color: 0x120e26, alpha: 0.5 });
  });
}
