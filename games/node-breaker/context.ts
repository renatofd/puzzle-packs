import type { GameLoop } from '../../src/core/loop';
import type { SaveManager } from '../../src/core/save';
import type { KitApp } from '../../src/ui/app';
import type { GameMenu } from '../../src/ui/menu';
import type { Toasts, Tooltip } from '../../src/ui/widgets';
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
  goToHub(): void;
  goToRun(): void;
}
