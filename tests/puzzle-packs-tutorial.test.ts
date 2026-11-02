import { describe, expect, it } from 'vitest';
import { SERIES, pieceCount } from '../games/puzzle-packs/content';
import { createGame } from '../games/puzzle-packs/game';
import { TUTORIAL_STEPS, Tutorial, type TutorialUi } from '../games/puzzle-packs/tutorial';
import en from '../games/puzzle-packs/i18n/en.json';

const idle: TutorialUi = { scene: 'main', idle: true, blocked: false };
const revealing: TutorialUi = { scene: 'main', idle: false, revealing: true, blocked: false };

function setup(seed = 1) {
  const game = createGame(seed);
  const tutorial = new Tutorial(game);
  tutorial.start();
  return { game, tutorial };
}

describe('Puzzle Packs: tutorial guiado', () => {
  it('jogador novo: rasgar, virar, tabuleiro, moedas, loja, melhorias e árvore em ordem', () => {
    const { game, tutorial } = setup();
    const { collection, engine } = game;
    expect(tutorial.active(idle)?.id).toBe('rip');
    // Ação errada não conclui o passo.
    tutorial.notify('buy');
    expect(tutorial.active(idle)?.id).toBe('rip');
    tutorial.notify('rip');
    collection.openNext();
    expect(tutorial.active(revealing)?.id).toBe('flip');
    tutorial.notify('revealed');
    expect(tutorial.active(idle)?.id).toBe('board');
    tutorial.ack('board');
    // Abre até sair uma repetida.
    while (collection.state.dupes === 0) collection.openNext();
    expect(tutorial.active(idle)?.id).toBe('dupes');
    tutorial.ack('dupes');
    engine.add('coins', collection.packCost('series'));
    expect(tutorial.active(idle)?.id).toBe('shop');
    expect(collection.buyPack('series')).toBe(true);
    tutorial.notify('buy');
    engine.add('coins', 1e6);
    expect(tutorial.active(idle)?.id).toBe('upgrades');
    tutorial.notify('enterTree');
    expect(tutorial.active({ scene: 'tree', idle: true, blocked: false })?.id).toBe('tree');
    expect(engine.buyUpgrade('collector')).toBe(true);
    expect(tutorial.isDone('tree')).toBe(true);
  });

  it('auto-abridor e álbum aparecem quando a série 1 fica completa', () => {
    const { game, tutorial } = setup();
    for (const s of TUTORIAL_STEPS) if (!['auto', 'album', 'albumView'].includes(s.id)) tutorial.complete(s.id);
    expect(tutorial.active(idle)).toBeNull();
    game.collection.state.owned[SERIES[0].id] = new Array(pieceCount(SERIES[0])).fill(1);
    game.engine.checkProgress();
    expect(tutorial.active(idle)?.id).toBe('auto');
    tutorial.ack('auto');
    expect(tutorial.active(idle)?.id).toBe('album');
    tutorial.notify('enterAlbum');
    expect(tutorial.active({ scene: 'album', idle: true, blocked: false })?.id).toBe('albumView');
    tutorial.notify('viewImage');
    expect(tutorial.finished).toBe(true);
  });

  it('nada aparece com o menu aberto ou durante a coleta', () => {
    const { tutorial } = setup();
    expect(tutorial.active({ ...idle, blocked: true })).toBeNull();
    expect(tutorial.active({ scene: 'main', idle: false, blocked: false })).toBeNull();
  });

  it('pular conclui tudo; reiniciar volta ao começo; fica salvo nos flags', () => {
    const { game, tutorial } = setup();
    tutorial.skip();
    expect(tutorial.finished).toBe(true);
    expect(tutorial.active(idle)).toBeNull();
    tutorial.reset();
    expect(tutorial.active(idle)?.id).toBe('rip');
    tutorial.notify('rip');
    expect(game.engine.state.flags['tut.rip']).toBe(true);
  });

  it('save antigo, de antes do tutorial, começa com ele concluído', () => {
    const game = createGame(3);
    game.collection.openNext();
    const tutorial = new Tutorial(game);
    tutorial.start();
    expect(tutorial.finished).toBe(true);
  });

  it('todo passo tem texto', () => {
    for (const s of TUTORIAL_STEPS) expect((en as Record<string, unknown>)[`tut.${s.id}`]).toBeTruthy();
  });
});
