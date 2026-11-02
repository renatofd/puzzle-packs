import { Engine } from '../../src/core/engine';
import { PrestigeModule } from '../../src/modules/prestige';
import { RunModule } from '../../src/modules/runs';
import { ArenaModule } from './arena';
import { definition, prestigeLayers } from './content';

/** Monta o motor do jogo sem nada de tela, para o navegador e para o simulador. */
export function createGame(seed?: number) {
  const runs = new RunModule({ durationStat: 'run.duration' });
  const arena = new ArenaModule(runs, seed);
  const prestige = new PrestigeModule(prestigeLayers);
  const engine = new Engine(definition, { modules: [arena, runs, prestige] });
  return { engine, runs, arena, prestige };
}

export type Game = ReturnType<typeof createGame>;
