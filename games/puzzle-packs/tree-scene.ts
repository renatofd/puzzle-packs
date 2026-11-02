import { Container } from 'pixi.js';
import { format } from '../../src/core/num';
import { Scene } from '../../src/ui/app';
import { Particles } from '../../src/ui/fx';
import { theme } from '../../src/ui/theme';
import { TreeView } from '../../src/ui/tree-view';
import { Button, label } from '../../src/ui/widgets';
import { layoutOf, type GameContext } from './context';
import { t } from './i18n';
import { CoinCounter } from './views';
import type { TutorialUi } from './tutorial';
import type { TutorialHost } from './tutorial-view';

/** Árvore de melhorias do template, paga com moedas. */
export class TreeScene extends Scene implements TutorialHost {
  private tree: TreeView;
  private particles: Particles;
  private hud = new Container();
  private coins: CoinCounter;
  private back: Button;
  private title = label('', 22, theme.text, { fontWeight: '800' });
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Backspace') this.ctx.go('main');
  };

  constructor(private ctx: GameContext) {
    super();
    const { engine } = ctx.game;
    this.coins = new CoinCounter(26, ctx.textures['icon-coin']);
    this.particles = new Particles(ctx.kit.app.renderer);
    this.tree = new TreeView(engine, ctx.tooltip, {
      tree: 'main',
      particles: this.particles,
      extraTooltip: (u) => {
        const stat = u.effects[0]?.stat;
        if (!stat) return [];
        const v = engine.stat(stat).toNumber();
        return [{ text: t('current', v < 10 ? v.toFixed(2) : format(v)), color: theme.accent, size: 13 }];
      },
    });
    this.title.text = t('upgrades');
    this.back = new Button({ text: t('back'), width: 120, height: 44, size: 15, color: theme.textDim, onClick: () => ctx.go('main') });
    this.hud.addChild(this.coins, this.title, this.back);
    this.root.addChild(this.tree, this.hud);
  }

  onEnter(): void {
    window.addEventListener('keydown', this.keyHandler);
    this.tree.refresh(true);
    this.tree.focus();
    this.ctx.tutorial.notify('enterTree');
  }

  tutorialUi(): TutorialUi {
    return { scene: 'tree', idle: true, blocked: this.ctx.menu.isOpen };
  }

  /** A árvore inteira é o alvo: o balão fica embaixo, sem escurecer. */
  tutorialTarget(): null {
    return null;
  }

  onExit(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.ctx.tooltip.hide();
  }

  resize(w: number, h: number): void {
    const { k, W } = layoutOf(w, h);
    this.hud.scale.set(k);
    this.coins.position.set(20, 18);
    this.title.anchor.set(0.5, 0);
    this.title.position.set(W / 2, 20);
    this.back.place(W - 144, 16);
    this.tree.setViewport(w, h, { top: 80 * k, bottom: 20 * k });
    this.tree.focus();
  }

  update(dt: number): void {
    this.tree.update(dt);
    this.particles.update(dt);
    this.coins.update(dt, this.ctx.game.engine.amount('coins').toNumber(), (n) => format(Math.floor(n)));
  }
}
