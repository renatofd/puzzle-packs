import { Container } from 'pixi.js';
import { hasAffordable } from '../../src/core/engine';
import { format } from '../../src/core/num';
import { Scene, uiScale } from '../../src/ui/app';
import { audio } from '../../src/ui/audio';
import { Particles } from '../../src/ui/fx';
import { ResourceBar } from '../../src/ui/hud';
import { theme } from '../../src/ui/theme';
import { TreeView } from '../../src/ui/tree-view';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, Panel } from '../../src/ui/widgets';
import { COLORS } from './content';
import type { GameContext } from './context';

/** Tela entre runs: árvore de upgrades, mineradores, reboot e o botão de iniciar. */
export class HubScene extends Scene {
  private resources: ResourceBar;
  private mainTree: TreeView;
  private rebootTree: TreeView;
  private particles: Particles;
  private rebootParticles: Particles;
  private showingReboot = false;
  private startButton: Button;
  private tabMain: Button;
  private tabReboot: Button;
  private menuButton: Button;
  private side = new Container();
  /** HUD por cima da árvore, escalado conforme o tamanho da tela. */
  private hud = new Container();
  private minerPanel: Panel;
  private minerInfo = label('', 13, theme.textDim);
  private minerButton: Button;
  private rebootPanel: Panel;
  private rebootInfo = label('', 13, theme.textDim, { wordWrap: true, wordWrapWidth: 212 });
  private rebootButton: Button;
  private hint = label('', 15, theme.textDim);
  private victory: Panel | null = null;
  private sideWasOpen = false;
  private tabsWereOpen = false;
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'm' || e.key === 'M') return this.ctx.menu.toggle();
    if (this.ctx.menu.isOpen) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.ctx.goToRun();
    }
  };

  constructor(private ctx: GameContext) {
    super();
    const { engine, prestige } = ctx.game;
    this.resources = new ResourceBar(engine);
    this.particles = new Particles(ctx.kit.app.renderer);
    this.rebootParticles = new Particles(ctx.kit.app.renderer);
    this.mainTree = new TreeView(engine, ctx.tooltip, {
      tree: 'main',
      particles: this.particles,
      extraTooltip: (u) => this.statLine(u.effects[0]?.stat),
    });
    this.rebootTree = new TreeView(engine, ctx.tooltip, {
      tree: 'reboot',
      particles: this.rebootParticles,
      colorFor: () => COLORS.prisms,
      extraTooltip: (u) => this.statLine(u.effects[0]?.stat),
    });
    this.rebootTree.visible = false;

    this.startButton = new Button({ text: 'INICIAR RUN  (espaço)', width: 280, height: 56, size: 18, color: theme.good, onClick: () => ctx.goToRun() });
    this.tabMain = new Button({ text: 'Rede', width: 110, height: 34, size: 14, onClick: () => this.showTree(false) });
    this.menuButton = new Button({ text: 'Menu (M)', width: 110, height: 34, size: 14, color: theme.textDim, onClick: () => ctx.menu.toggle() });
    this.tabReboot = new Button({ text: 'Reboot', width: 110, height: 34, size: 14, color: COLORS.prisms, onClick: () => this.showTree(true) });

    // Painel de mineradores (gerador com progresso offline).
    this.minerPanel = new Panel({ width: 240, height: 128 });
    const mTitle = label('Mineradores', 16, COLORS.bits, { fontWeight: '700' });
    mTitle.position.set(14, 12);
    this.minerInfo.position.set(14, 38);
    this.minerButton = new Button({ text: '', width: 212, height: 34, size: 13, color: COLORS.cores, onClick: () => engine.buyGenerator('miner') }).place(14, 80);
    this.minerPanel.addChild(mTitle, this.minerInfo, this.minerButton);

    // Painel de reboot (prestígio).
    this.rebootPanel = new Panel({ width: 240, height: 150 });
    const rTitle = label('Reboot', 16, COLORS.prisms, { fontWeight: '700' });
    rTitle.position.set(14, 12);
    this.rebootInfo.position.set(14, 38);
    this.rebootButton = new Button({
      text: '',
      width: 212,
      height: 36,
      size: 13,
      color: COLORS.prisms,
      onClick: () => {
        const gained = prestige.prestige(engine, 'reboot');
        if (gained.gt(0)) {
          audio.play('prestige');
          ctx.toasts.push(`Reboot! +${format(gained)} Prismas`, 'Gaste na aba Reboot.', COLORS.prisms);
          this.mainTree.focus(true);
          ctx.saves.save();
        }
      },
    }).place(14, 102);
    this.rebootPanel.addChild(rTitle, this.rebootInfo, this.rebootButton);
    this.side.addChild(this.minerPanel, this.rebootPanel);

    this.hud.addChild(this.resources, this.side, this.tabMain, this.tabReboot, this.menuButton, this.startButton, this.hint);
    this.root.addChild(this.mainTree, this.rebootTree, this.hud);
  }

  onEnter(): void {
    window.addEventListener('keydown', this.keyHandler);
    this.mainTree.refresh(true);
    this.rebootTree.refresh(true);
    this.mainTree.focus();
    this.rebootTree.focus();
  }

  onExit(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.ctx.tooltip.hide();
  }

  resize(w: number, h: number): void {
    // A árvore ocupa a tela inteira; o HUD fica por cima, numa escala que
    // acompanha o tamanho da janela. O layout do HUD usa unidades lógicas.
    const k = uiScale(w, h);
    const W = w / k;
    const H = h / k;
    this.hud.scale.set(k);
    const top = 80;
    const bottom = this.tabMain.visible && W < 820 ? 150 : 90;
    const sideW = 256;
    const sideOpen = this.minerPanel.visible || this.rebootPanel.visible;
    this.tabsWereOpen = this.tabMain.visible;
    for (const t of [this.mainTree, this.rebootTree]) {
      t.position.set(0, 0);
      t.setViewport(w, h, { top: top * k, bottom: bottom * k, right: sideOpen ? sideW * k : 0, left: 0 });
    }
    this.resources.position.set(24, 16);
    const centerW = sideOpen ? W - sideW : W;
    const startW = 280;
    // Em janelas estreitas o botão de iniciar sobe acima das abas.
    let startX = (centerW - startW) / 2;
    const tabsEnd = this.tabMain.visible ? 260 : 0;
    const crowded = startX < tabsEnd;
    if (crowded) startX = (W - startW) / 2;
    this.startButton.place(startX, crowded ? H - 132 : H - 74);
    this.tabMain.place(24, H - 62);
    this.tabReboot.place(142, H - 62);
    // Em janelas estreitas o botão de menu sobe para não cobrir o de iniciar.
    const menuX = W - 126;
    const overlaps = !crowded && menuX < startX + startW + 8;
    this.menuButton.place(menuX, overlaps ? 16 : H - 62);
    this.side.position.set(W - sideW, top);
    this.hint.position.set(24, top + 8);
    this.hint.style.wordWrap = true;
    this.hint.style.wordWrapWidth = Math.max(200, centerW - 48);
    if (this.victory) this.victory.position.set((W - this.victory.panelWidth) / 2, (H - this.victory.panelHeight) / 2);
    this.sideWasOpen = sideOpen;
  }

  update(dt: number): void {
    const { engine, prestige } = this.ctx.game;
    this.resources.update(dt);
    (this.showingReboot ? this.rebootTree : this.mainTree).update(dt);
    this.particles.update(dt);
    this.rebootParticles.update(dt);

    const rebootOpen = engine.isUnlocked('reboot');
    this.tabMain.visible = this.tabReboot.visible = rebootOpen;
    if (!rebootOpen && this.showingReboot) this.showTree(false);
    // "!" na aba da outra árvore quando ela tem upgrade comprável.
    this.tabMain.badge = this.showingReboot && hasAffordable(engine, 'main');
    this.tabReboot.badge = !this.showingReboot && hasAffordable(engine, 'reboot');

    // Mineradores
    const minersOpen = engine.isGeneratorUnlocked('miner');
    this.minerPanel.visible = minersOpen;
    if (minersOpen) {
      const owned = engine.generatorsOwned('miner');
      this.minerInfo.text = `${owned} ativos\n+${format(engine.generatorProduction('miner'))} Bits/s, mesmo offline`;
      const cost = engine.generatorCost('miner')[0];
      this.minerButton.setText(`Comprar (${format(cost.amount)} Núcleos)`);
      this.minerButton.enabled = engine.amount('cores').gte(cost.amount);
    }

    // Reboot
    this.rebootPanel.visible = rebootOpen;
    this.rebootPanel.y = minersOpen ? 144 : 0;
    if (rebootOpen) {
      const gain = prestige.gain(engine, 'reboot');
      const next = prestige.nextAt(engine, 'reboot');
      this.rebootInfo.text = gain.gte(1)
        ? `Zera Bits, Núcleos e a Rede. Ganha ${format(gain)} Prismas.`
        : `Ganhe ${format(next ?? 0)} Bits nesta rede para o primeiro Prisma.`;
      this.rebootButton.setText(`Reboot (+${format(gain)})`);
      this.rebootButton.enabled = prestige.canPrestige(engine, 'reboot');
    }

    this.hint.text =
      engine.state.lifetime.bits?.lte(0) ?? true
        ? 'Inicie uma run e passe o mouse sobre os nós para destruí-los.'
        : engine.upgradeLevel('core') === 0
          ? 'Clique no Núcleo para comprar seu primeiro upgrade.'
          : '';

    if (this.minerPanel.visible || this.rebootPanel.visible) {
      if (!this.sideWasOpen) this.resize(this.kit.width, this.kit.height);
    } else if (this.sideWasOpen) this.resize(this.kit.width, this.kit.height);
    if (this.tabMain.visible !== this.tabsWereOpen) this.resize(this.kit.width, this.kit.height);

    if (engine.isUnlocked('victory') && !engine.state.flags.victorySeen) this.showVictory();
  }

  private showTree(reboot: boolean): void {
    this.showingReboot = reboot;
    this.mainTree.visible = !reboot;
    this.rebootTree.visible = reboot;
    this.ctx.tooltip.hide();
    (reboot ? this.rebootTree : this.mainTree).focus();
  }

  private statLine(stat?: string) {
    if (!stat) return [];
    const v = this.ctx.game.engine.stat(stat);
    return [{ text: `Atual: ${format(v)}`, color: theme.accent, size: 13 }];
  }

  private showVictory(): void {
    const { engine, runs, prestige } = this.ctx.game;
    engine.state.flags.victorySeen = true;
    const p = new Panel({ width: 420, height: 230 });
    const t = label('Singularidade alcançada', 24, theme.warning, { fontWeight: '700' });
    t.position.set(24, 22);
    const minutes = Math.round(engine.state.time.played / 60);
    const body = label(
      `Você terminou em ${minutes} min, com ${runs.count} runs e ${prestige.count(engine, 'reboot')} reboots.\nObrigado por jogar o exemplo do incremental-kit.`,
      15,
      theme.textDim,
      { wordWrap: true, wordWrapWidth: 372 },
    );
    body.position.set(24, 70);
    const close = new Button({ text: 'Continuar', width: 160, onClick: () => (p.destroy({ children: true }), (this.victory = null)) }).place(24, 160);
    p.addChild(t, body, close);
    this.victory = p;
    this.hud.addChild(p);
    this.resize(this.kit.width, this.kit.height);
    Tweens.to(0.5, 0, 1, (v) => (p.alpha = v), ease.outCubic);
    this.ctx.saves.save();
  }
}
