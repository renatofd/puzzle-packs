import { Container, Graphics, Sprite } from 'pixi.js';
import { format, formatTime } from '../../src/core/num';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, Panel } from '../../src/ui/widgets';
import { SERIES } from './content';
import type { GameContext } from './context';
import { t } from './i18n';

/** Tela de conclusão: todas as ilustrações e as estatísticas da coleção. */
export class EndPanel extends Container {
  private backdrop = new Graphics();
  private panel: Panel;
  private readonly w = 520;
  private readonly h: number;

  constructor(ctx: GameContext, onClose: () => void) {
    super();
    const { engine, collection } = ctx.game;
    const st = collection.state;
    this.backdrop.eventMode = 'static';
    // Miniaturas em grade (até 9 por linha); a altura do painel acompanha o número de séries.
    const n = SERIES.length;
    const gap = 8;
    const perRow = Math.min(n, 9);
    const gridRows = Math.ceil(n / perRow);
    const size = Math.min(130, Math.floor((this.w - 40 - gap * (perRow - 1)) / perRow));
    const rowsY = 104 + gridRows * (size + gap) + 16;
    const rowH = 26;
    this.h = rowsY + 5 * rowH + 86;
    this.panel = new Panel({ width: this.w, height: this.h, alpha: 1, border: theme.warning });
    this.panel.eventMode = 'static';
    const title = label(t('end.title'), 30, theme.warning, { fontWeight: '800' });
    title.anchor.set(0.5, 0);
    title.position.set(this.w / 2, 20);
    const body = label(t('end.body', n), 15, theme.textDim, { align: 'center', wordWrap: true, wordWrapWidth: this.w - 60 });
    body.anchor.set(0.5, 0);
    body.position.set(this.w / 2, 64);
    this.panel.addChild(title, body);

    // As ilustrações completas.
    SERIES.forEach((_, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, n - row * perRow);
      const total = inRow * size + (inRow - 1) * gap;
      const sp = new Sprite(ctx.arts.get(i).full);
      sp.width = sp.height = size;
      sp.position.set((this.w - total) / 2 + (i % perRow) * (size + gap), 104 + row * (size + gap));
      const frame = new Graphics().roundRect(sp.x - 3, sp.y - 3, size + 6, size + 6, 6).stroke({ width: 2, color: theme.warning, alpha: 0.7 });
      this.panel.addChild(sp, frame);
    });

    const rows: Array<[string, string]> = [
      [t('end.time'), formatTime(engine.state.time.played)],
      [t('end.packs'), `${st.packs}  (${t('stat.auto')}: ${st.autoPacks})`],
      [t('end.cards'), format(st.cards)],
      [t('end.dupes'), format(st.dupes)],
      [t('end.coins'), format(engine.state.lifetime.coins ?? 0)],
    ];
    rows.forEach(([k, v], i) => {
      const y = rowsY + i * rowH;
      const kl = label(k, 15, theme.textDim);
      kl.position.set(40, y);
      const vl = label(v, 15, theme.text, { fontWeight: '700' });
      vl.anchor.set(1, 0);
      vl.position.set(this.w - 40, y);
      this.panel.addChild(kl, vl);
    });
    const close = new Button({ text: t('end.continue'), width: 240, height: 46, size: 16, color: theme.good, onClick: onClose });
    close.place(this.w / 2 - 120, this.h - 66);
    this.panel.addChild(close);
    this.addChild(this.backdrop, this.panel);
    Tweens.to(0.5, 0, 1, (v) => !this.destroyed && (this.alpha = v), ease.outCubic);
    Tweens.to(0.6, 0.8, 1, (v) => !this.panel.destroyed && this.panel.scale.set(v), ease.outBack);
  }

  layout(W: number, H: number): void {
    this.backdrop.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.6 });
    const s = Math.min(1, (W - 24) / this.w, (H - 24) / this.h);
    this.panel.pivot.set(this.w / 2, this.h / 2);
    this.panel.position.set(W / 2, H / 2);
    this.panel.scale.set(s);
  }
}
