import { Engine } from '../../src/core/engine';
import { CollectionModule } from './collection';
import { definition } from './content';

/** Monta o motor do jogo sem nada de tela, para o navegador, os testes e o simulador. */
export function createGame(seed?: number) {
  const collection = new CollectionModule(seed);
  const engine = new Engine(definition, { modules: [collection] });
  return { engine, collection };
}

export type Game = ReturnType<typeof createGame>;
