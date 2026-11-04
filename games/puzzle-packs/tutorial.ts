import { hasAffordable } from '../../src/core/engine';
import type { Game } from './game';

/**
 * Tutorial guiado, sem nada de tela: quais passos existem, quando cada um
 * aparece e o que conta como concluído. A cena só informa o que está
 * acontecendo (`TutorialUi`) e as ações do jogador (`notify`); o overlay
 * em `tutorial-view.ts` desenha o destaque e o balão.
 *
 * O progresso fica em `engine.state.flags` (`tut.<id>`), então não muda a
 * estrutura do save.
 */

export type TutorialScene = 'main' | 'album' | 'tree';

/** O que o tutorial pode destacar. Cada cena devolve o retângulo de cada alvo. */
export type TutorialTarget = 'pack' | 'stage' | 'board' | 'coins' | 'shop' | 'treeButton' | 'auto' | 'albumButton' | 'albumView' | 'tree';

/** Ações do jogador que concluem passos. */
export type TutorialEvent = 'rip' | 'revealed' | 'buy' | 'upgrade' | 'enterTree' | 'enterAlbum' | 'viewImage';

/** Retrato da tela num frame, fornecido pela cena ativa. */
export interface TutorialUi {
  scene: TutorialScene;
  /** Na tela principal: sem pacote sendo aberto. */
  idle: boolean;
  /** Algo cobre a tela (menu, painel final, visualizador): o tutorial espera. */
  blocked: boolean;
  /** Cartas na mesa sendo viradas. */
  revealing?: boolean;
}

export interface TutorialStep {
  id: string;
  scene: TutorialScene;
  target?: TutorialTarget;
  /** Só destaque e seta, sem balão de texto (os gestos dos primeiros segundos). */
  quiet?: boolean;
  /** Passo informativo: termina no botão OK (ou na ação de `on`, se houver). */
  ack?: boolean;
  /**
   * Escurece a tela em volta do alvo. Só nas dicas de toque, em que o
   * jogador precisa achar um botão: sem o escurecido, no 3º playtest do Poki
   * a abertura das Melhorias caiu de 58% para 40% dos jogadores.
   */
  dim?: boolean;
  /** Ação que conclui o passo (passos sem `ack`). */
  on?: TutorialEvent[];
  /** O passo pode aparecer agora? */
  when(game: Game, ui: TutorialUi): boolean;
}

const state = (g: Game) => g.collection.state;

/** Os passos, na ordem em que o jogador costuma encontrá-los. */
export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'rip', scene: 'main', target: 'pack', quiet: true, on: ['rip'], when: (_g, ui) => ui.idle },
  { id: 'flip', scene: 'main', target: 'stage', quiet: true, on: ['revealed'], when: (_g, ui) => !!ui.revealing },
  { id: 'board', scene: 'main', target: 'board', ack: true, on: ['rip'], when: (g, ui) => ui.idle && g.collection.state.newPieces > 0 },
  { id: 'dupes', scene: 'main', target: 'coins', ack: true, on: ['rip'], when: (g, ui) => ui.idle && state(g).dupes > 0 },
  { id: 'shop', scene: 'main', target: 'shop', dim: true, on: ['buy'], when: (g, ui) => ui.idle && g.collection.canBuy('series') },
  { id: 'upgrades', scene: 'main', target: 'treeButton', dim: true, on: ['enterTree', 'upgrade'], when: (g, ui) => ui.idle && hasAffordable(g.engine, 'main') },
  { id: 'tree', scene: 'tree', target: 'tree', on: ['upgrade'], when: (g) => hasAffordable(g.engine, 'main') },
  { id: 'auto', scene: 'main', target: 'auto', ack: true, on: ['rip'], when: (g, ui) => ui.idle && g.collection.autoUnlocked() },
  { id: 'album', scene: 'main', target: 'albumButton', dim: true, on: ['enterAlbum'], when: (g, ui) => ui.idle && g.collection.isComplete(0) },
  { id: 'albumView', scene: 'album', target: 'albumView', ack: true, on: ['viewImage'], when: (g) => g.collection.isComplete(0) },
];

const KEY = (id: string) => `tut.${id}`;
const STARTED = 'tut.started';
const SKIPPED = 'tut.skipped';

export class Tutorial {
  readonly steps = TUTORIAL_STEPS;
  /** Passo mostrado no último `active`, para `notify` saber o que concluir. */
  private shown: TutorialStep | null = null;
  /** Passos já anunciados nesta sessão (para o `start` sair uma vez só). */
  private announced = new Set<string>();
  /** Aviso de progresso do tutorial (game events). */
  onStep?: (id: string, action: 'start' | 'complete' | 'skip' | 'restart') => void;

  constructor(private game: Game) {
    game.engine.events.on('upgradeBought', () => this.notify('upgrade'));
  }

  private get flags() {
    return this.game.engine.state.flags;
  }

  /**
   * Chamado depois de carregar o save. Um save que já jogou antes do
   * tutorial existir (tem pacotes abertos e nunca viu o tutorial) começa
   * com ele concluído; o botão de ajuda o reinicia.
   */
  start(): void {
    if (this.flags[STARTED]) return;
    this.flags[STARTED] = true;
    if (state(this.game).packs > 0) this.flags[SKIPPED] = true;
  }

  get skipped(): boolean {
    return !!this.flags[SKIPPED];
  }

  isDone(id: string): boolean {
    return this.skipped || !!this.flags[KEY(id)];
  }

  get finished(): boolean {
    return this.steps.every((s) => this.isDone(s.id));
  }

  /** Quantos passos já foram concluídos (para o "2/10" do balão). */
  progress(): { done: number; total: number } {
    return { done: this.steps.filter((s) => this.isDone(s.id)).length, total: this.steps.length };
  }

  /** O passo a mostrar agora: o primeiro não concluído desta cena cuja condição vale. */
  active(ui: TutorialUi): TutorialStep | null {
    this.shown = null;
    if (this.skipped || ui.blocked) return null;
    for (const s of this.steps) {
      if (this.isDone(s.id) || s.scene !== ui.scene) continue;
      if (s.when(this.game, ui)) {
        if (!this.announced.has(s.id)) {
          this.announced.add(s.id);
          this.onStep?.(s.id, 'start');
        }
        return (this.shown = s);
      }
    }
    return null;
  }

  /** O jogador fez algo; conclui o passo mostrado se for a ação dele. */
  notify(ev: TutorialEvent): void {
    const s = this.shown;
    if (s && !this.isDone(s.id) && s.on?.includes(ev)) this.complete(s.id);
  }

  /** Botão OK de um passo informativo. */
  ack(id: string): void {
    this.complete(id);
  }

  complete(id: string): void {
    if (!this.flags[KEY(id)] && !this.skipped) this.onStep?.(id, 'complete');
    this.flags[KEY(id)] = true;
    if (this.shown?.id === id) this.shown = null;
  }

  skip(): void {
    if (!this.skipped) this.onStep?.(this.shown?.id ?? 'all', 'skip');
    this.flags[SKIPPED] = true;
    this.shown = null;
  }

  /** Recomeça do zero (botão de ajuda). */
  reset(): void {
    for (const s of this.steps) delete this.flags[KEY(s.id)];
    delete this.flags[SKIPPED];
    this.flags[STARTED] = true;
    this.shown = null;
    this.announced.clear();
    this.onStep?.('all', 'restart');
  }
}
