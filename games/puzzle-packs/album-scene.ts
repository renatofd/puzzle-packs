import { Container, Graphics, Sprite } from 'pixi.js';
import { Scene } from '../../src/ui/app';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, ProgressBar } from '../../src/ui/widgets';
import { SERIES } from './content';
import { layoutOf, type GameContext } from './context';
import { t } from './i18n';
import { BoardView } from './views';

interface SeriesCard {
  root: Container;
  board: BoardView;
  title: ReturnType<typeof label>;
  status: ReturnType<typeof label>;
  bar: ProgressBar;
  view: Button;
}

/** Séries por página do álbum. */
const PER_PAGE = 3;

/** Álbum: as ilustrações (completas e em progresso), % por série e a imagem inteira, 3 séries por página. */
export class AlbumScene extends Scene {
  private hud = new Container();
  private header = label('', 26, theme.text, { fontWeight: '800' });
  private back: Button;
  private prev: Button;
  private nextPage: Button;
  private pageLabel = label('', 15, theme.textDim);
  private page = 0;
  private cards: SeriesCard[] = [];
  private viewer: Container | null = null;
  private size = 220;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      if (this.viewer) this.closeViewer();
      else this.ctx.go('main');
    } else if (!this.viewer && e.key === 'ArrowLeft') this.setPage(this.page - 1);
    else if (!this.viewer && e.key === 'ArrowRight') this.setPage(this.page + 1);
  };

  constructor(private ctx: GameContext) {
    super();
    this.header.text = t('album');
    this.back = new Button({ text: t('back'), width: 120, height: 44, size: 15, color: theme.textDim, onClick: () => ctx.go('main') });
    this.prev = new Button({ text: '‹', width: 52, height: 44, size: 22, onClick: () => this.setPage(this.page - 1) });
    this.nextPage = new Button({ text: '›', width: 52, height: 44, size: 22, onClick: () => this.setPage(this.page + 1) });
    this.pageLabel.anchor.set(0.5, 0.5);
    this.hud.addChild(this.header, this.back, this.prev, this.nextPage, this.pageLabel);
    this.root.addChild(this.hud);
    this.build();
  }

  private build(): void {
    for (const c of this.cards) c.root.destroy({ children: true });
    this.cards = SERIES.map((_, i) => {
      const root = new Container();
      const board = new BoardView(this.ctx.arts[i], this.size);
      board.position.set(0, 34);
      const title = label('', 17, theme.text, { fontWeight: '700' });
      const status = label('', 14, theme.textDim);
      status.position.set(0, this.size + 64);
      const bar = new ProgressBar(this.size, 8, theme.good);
      bar.position.set(0, this.size + 48);
      const view = new Button({ text: t('viewImage'), width: this.size, height: 36, size: 14, onClick: () => this.openViewer(i) });
      view.place(0, this.size + 90);
      root.addChild(board, title, bar, status, view);
      this.hud.addChild(root);
      return { root, board, title, status, bar, view };
    });
  }

  private get pages(): number {
    return Math.ceil(SERIES.length / PER_PAGE);
  }

  private setPage(p: number): void {
    this.page = Math.max(0, Math.min(this.pages - 1, p));
    this.resize(this.kit.width, this.kit.height);
  }

  onEnter(): void {
    window.addEventListener('keydown', this.keyHandler);
    // Abre na página da série que o jogador está montando.
    this.page = Math.floor(this.ctx.game.collection.currentSeries() / PER_PAGE);
    this.refresh();
    this.resize(this.kit.width, this.kit.height);
  }

  onExit(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.closeViewer();
  }

  private refresh(): void {
    const { collection } = this.ctx.game;
    this.cards.forEach((c, i) => {
      const s = SERIES[i];
      const unlocked = collection.isSeriesUnlocked(i);
      const owned = collection.owned(i);
      const have = owned.filter((x) => x > 0).length;
      c.title.text = `${t('seriesN', i + 1)} · ${t(`series.${s.id}`)}`;
      c.board.refresh(owned);
      c.board.alpha = unlocked ? 1 : 0.35;
      c.bar.setValue(have / owned.length, true);
      c.status.text = !unlocked
        ? t('locked')
        : collection.isComplete(i)
          ? `${t('complete')}  100%`
          : `${t('pieces', have, owned.length)}  ·  ${Math.round((have / owned.length) * 100)}%`;
      c.view.enabled = unlocked;
    });
  }

  resize(w: number, h: number): void {
    const { k, W, H, portrait } = layoutOf(w, h);
    this.hud.scale.set(k);
    this.header.position.set(24, 18);
    this.back.place(W - 144, 16);
    // Espaço de baixo reservado para a navegação entre páginas.
    const size = portrait ? Math.min(220, (H - 180) / PER_PAGE - 140) : Math.min(260, (W - 120) / PER_PAGE, H - 320);
    const cardH = size + 130;
    if (Math.abs(size - this.size) > 1) {
      this.size = Math.max(90, size);
      this.build();
      this.refresh();
    }
    const multi = this.pages > 1;
    for (const b of [this.prev, this.nextPage]) b.visible = multi;
    this.pageLabel.visible = multi;
    this.prev.enabled = this.page > 0;
    this.nextPage.enabled = this.page < this.pages - 1;
    this.pageLabel.text = `${this.page + 1} / ${this.pages}`;
    this.prev.place(W / 2 - 120, H - 64);
    this.nextPage.place(W / 2 + 68, H - 64);
    this.pageLabel.position.set(W / 2, H - 42);
    this.cards.forEach((card, idx) => {
      card.root.visible = Math.floor(idx / PER_PAGE) === this.page;
    });
    this.cards.forEach((c, idx) => {
      const i = idx % PER_PAGE;
      if (portrait) {
        // Retrato: tabuleiro à esquerda, informações à direita, uma série por linha.
        const rowH = (H - 150) / PER_PAGE;
        c.root.position.set(24, 80 + i * rowH);
        c.board.position.set(0, 28);
        c.title.position.set(0, 0);
        const ix = this.size + 24;
        c.bar.position.set(ix, 60);
        c.status.position.set(ix, 76);
        c.view.place(ix, 108);
      } else {
        const total = PER_PAGE * this.size + (PER_PAGE - 1) * 40;
        c.root.position.set((W - total) / 2 + i * (this.size + 40), Math.max(80, (H - 60 - cardH) / 2));
        c.title.position.set(0, 0);
        c.board.position.set(0, 34);
        c.bar.position.set(0, this.size + 48);
        c.status.position.set(0, this.size + 64);
        c.view.place(0, this.size + 90);
      }
    });
    if (this.viewer) this.layoutViewer(W, H);
  }

  update(): void {}

  private openViewer(i: number): void {
    const { collection } = this.ctx.game;
    this.closeViewer();
    const v = new Container();
    const bg = new Graphics();
    bg.eventMode = 'static';
    bg.cursor = 'pointer';
    bg.on('pointertap', () => this.closeViewer());
    v.addChild(bg);
    // Completa: a imagem inteira. Incompleta: o tabuleiro grande com os buracos.
    const content = collection.isComplete(i) ? new Sprite(this.ctx.arts[i].full) : new BoardView(this.ctx.arts[i], 600);
    if (content instanceof BoardView) content.refresh(collection.owned(i));
    v.addChild(content);
    const hint = label(t('tapToContinue'), 14, theme.textDim);
    hint.anchor.set(0.5, 0);
    v.addChild(hint);
    this.viewer = v;
    this.hud.addChild(v);
    const { W, H } = layoutOf(this.kit.width, this.kit.height);
    this.layoutViewer(W, H);
    Tweens.to(0.3, 0, 1, (a) => !v.destroyed && (v.alpha = a), ease.outCubic);
  }

  private layoutViewer(W: number, H: number): void {
    const v = this.viewer!;
    const [bg, content, hint] = v.children as [Graphics, Container, Container];
    bg.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.85 });
    const s = Math.min(W - 40, H - 100) / 600;
    content.scale.set(s);
    content.position.set((W - 600 * s) / 2, (H - 600 * s) / 2 - 10);
    hint.position.set(W / 2, H - 40);
  }

  private closeViewer(): void {
    this.viewer?.destroy({ children: true });
    this.viewer = null;
  }
}
