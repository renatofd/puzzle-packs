import type { Texture } from 'pixi.js';
import type { GameLoop } from '../../src/core/loop';
import type { SaveManager } from '../../src/core/save';
import { isPortrait, uiScale, type KitApp } from '../../src/ui/app';
import type { GameMenu } from '../../src/ui/menu';
import type { Toasts, Tooltip } from '../../src/ui/widgets';
import type { SeriesArt } from './art';
import type { Game } from './game';

/** O que as cenas do jogo compartilham. */
export interface GameContext {
  game: Game;
  kit: KitApp;
  loop: GameLoop;
  saves: SaveManager;
  tooltip: Tooltip;
  toasts: Toasts;
  menu: GameMenu;
  arts: SeriesArt[];
  /** Texturas opcionais do manifest (pacotes, verso da carta). */
  textures: Record<string, Texture>;
  go(scene: 'main' | 'album' | 'tree'): void;
}

/**
 * Layout responsivo: escala da interface e tamanho lógico da tela.
 * Retrato usa uma base estreita e alta; paisagem, a base larga do kit.
 */
export const PORTRAIT_BASE = { w: 560, h: 960 };

export function layoutOf(w: number, h: number) {
  const k = uiScale(w, h);
  return { k, W: w / k, H: h / k, portrait: isPortrait(w, h) };
}
