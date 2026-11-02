import { Container, FederatedPointerEvent, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { TutorialTarget, TutorialUi } from './tutorial';
import type { TutorialHost } from './tutorial-view';
import { hasAffordable } from '../../src/core/engine';
import { format } from '../../src/core/num';
import { Scene } from '../../src/ui/app';
import { audio } from '../../src/ui/audio';
import { FloatingText, Particles, ScreenShake } from '../../src/ui/fx';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, Panel, ProgressBar } from '../../src/ui/widgets';
import { CardView, BoardView, CoinCounter, PackView, CARD_H, CARD_W, PACK_H, PACK_W } from './views';
import { COLORS, PACKS, RARITIES, SERIES, type PackId } from './content';
import type { PackResult } from './collection';
import { layoutOf, type GameContext } from './context';
import { LANGS, lang, saveLang, t } from './i18n';
import { portal } from './portal';
import { EndPanel } from './end-panel';
import { flagTexture, LangPopup } from './lang-popup';

type StageState = 'idle' | 'revealing' | 'collecting';

const BASE_OPEN_TIME = 4.5;

/** Tela principal: rasgar pacotes, revelar cartas, loja, auto-abridor e tabuleiro da série atual. */
export class MainScene extends Scene implements TutorialHost {
  private hud = new Container();
  private stage = new Container();
  private stageHit = new Graphics();
  private stageRect = new Rectangle(0, 0, 400, 400);
  private pack: PackView;
  private cards: CardView[] = [];
  private state: StageState = 'idle';
  private current: PackResult | null = null;
  private hidden = new Set<number>();
  private timers: Array<{ t: number; fn: () => void }> = [];
  private drag: { x: number; progress: number; ticks: number } | null = null;

  private coins: CoinCounter;
  private seriesTitle = label('', 18, theme.text, { fontWeight: '700' });
  private seriesBar = new ProgressBar(260, 10, COLORS.accent);
  private seriesCount = label('', 14, theme.textDim);
  private boardHolder = new Container();
  private board: BoardView | null = null;
  private boardSeries = -1;
  private hint = label('', 15, theme.textDim, { align: 'center' });

  private shopTitle = label('', 16, theme.text, { fontWeight: '700' });
  private shopButtons = new Map<PackId, Button>();
  private queueLabel = label('', 13, theme.textDim);

  private autoPanel = new Panel({ width: 260, height: 74 });
  private autoTitle = label('', 15, theme.text, { fontWeight: '700' });
  private autoInfo = label('', 13, theme.textDim);
  private autoBar = new ProgressBar(232, 8, theme.good);

  private rewardPack: Button;
  private rewardDouble: Button;
  private doubleLabel = label('', 14, COLORS.coins, { fontWeight: '700' });
  private rewardBusy = false;

  private albumButton: Button;
  private treeButton: Button;
  private menuButton: Button;
  private langButton: Button;

  private particles: Particles;
  private floats = new FloatingText(22);
  private shake = new ScreenShake();
  private endPanel: EndPanel | null = null;
  private langPopup: LangPopup | null = null;
  private layout = layoutOf(800, 600);
  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'm' || e.key === 'M') return this.ctx.menu.toggle();
    if (this.ctx.menu.isOpen || this.endPanel || this.langPopup) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.advance();
    }
  };

  constructor(private ctx: GameContext) {
    super();
    const { collection } = ctx.game;
    this.coins = new CoinCounter(28, ctx.textures['icon-coin']);
    this.particles = new Particles(ctx.kit.app.renderer, 1500);
    this.particles.gravity = 500;
    this.pack = new PackView(ctx.textures);
    this.stageHit.eventMode = 'static';
    this.stageHit.cursor = 'pointer';
    this.stageHit.on('pointertap', () => this.advance());
    this.stage.addChild(this.stageHit, this.pack);
    this.setupPackInput();

    this.seriesTitle.anchor.set(0.5, 0);
    this.seriesCount.anchor.set(0.5, 0);
    this.hint.anchor.set(0.5, 0);

    // Loja
    for (const p of PACKS) {
      const b = new Button({
        text: '',
        width: 260,
        height: 56,
        size: 14,
        color: p.color,
        icon: ctx.textures[`icon-pack-${p.id}`],
        onClick: () => {
          if (collection.buyPack(p.id)) {
            audio.play('buy');
            this.ctx.tutorial.notify('buy');
            this.ctx.saves.save();
            if (this.state === 'idle') this.showNextPack();
          }
        },
      });
      b.on('pointerover', (e: FederatedPointerEvent) => ctx.tooltip.show([{ text: t(`pack.${p.id}`), bold: true }, { text: t(`pack.${p.id}.desc`), color: theme.textDim }], e.global.x, e.global.y));
      b.on('pointerout', () => ctx.tooltip.hide());
      this.shopButtons.set(p.id, b);
    }
    this.shopTitle.text = t('shop');

    // Auto-abridor
    this.autoTitle.text = t('auto');
    this.autoTitle.position.set(14, 10);
    this.autoInfo.position.set(14, 34);
    this.autoBar.position.set(14, 56);
    this.autoPanel.addChild(this.autoTitle, this.autoInfo, this.autoBar);

    // Rewarded (opcional, nunca durante a abertura)
    const watch = (kind: 'pack' | 'double') => {
      if (this.rewardBusy || !collection.canReward()) return;
      this.rewardBusy = true;
      portal
        .rewarded()
        .then((ok) => {
          if (!ok) return;
          collection.grantReward(kind);
          audio.play('achievement');
          if (kind === 'pack' && this.state === 'idle') this.showNextPack();
          ctx.saves.save();
        })
        .finally(() => (this.rewardBusy = false));
    };
    this.rewardPack = new Button({ text: '', width: 260, height: 38, size: 13, color: theme.warning, onClick: () => watch('pack') });
    this.rewardDouble = new Button({ text: '', width: 260, height: 38, size: 13, color: theme.warning, onClick: () => watch('double') });

    // Navegação
    this.albumButton = new Button({ text: t('album'), width: 130, height: 44, size: 15, icon: ctx.textures['icon-album'], onClick: () => ctx.go('album') });
    this.treeButton = new Button({ text: t('upgrades'), width: 130, height: 44, size: 15, color: theme.good, icon: ctx.textures['icon-upgrades'], onClick: () => ctx.go('tree') });
    this.menuButton = new Button({ text: t('menu'), width: 100, height: 44, size: 15, color: theme.textDim, icon: ctx.textures['icon-menu'], onClick: () => ctx.menu.toggle() });
    this.langButton = new Button({
      text: '',
      width: 60,
      height: 44,
      size: 15,
      color: theme.textDim,
      icon: flagTexture(ctx.kit.app.renderer, lang()),
      onClick: () => this.showLang(),
    });
    this.langButton.on('pointerover', (e: FederatedPointerEvent) => ctx.tooltip.show([{ text: t('language', LANGS[lang()].langName) }], e.global.x, e.global.y));
    this.langButton.on('pointerout', () => ctx.tooltip.hide());

    this.hud.addChild(
      this.stage,
      this.boardHolder,
      this.coins,
      this.seriesTitle,
      this.seriesBar,
      this.seriesCount,
      this.hint,
      this.shopTitle,
      ...this.shopButtons.values(),
      this.queueLabel,
      this.autoPanel,
      this.rewardPack,
      this.rewardDouble,
      this.doubleLabel,
      this.albumButton,
      this.treeButton,
      this.menuButton,
      this.langButton,
      this.particles,
      this.floats,
    );
    this.root.addChild(this.hud);
    this.refreshBoard(true);
    this.showNextPack(false);
  }

  onEnter(): void {
    window.addEventListener('keydown', this.keyHandler);
    this.ctx.game.collection.drainAuto();
    this.refreshBoard(true);
    portal.gameplayStart();
  }

  onExit(): void {
    window.removeEventListener('keydown', this.keyHandler);
    this.ctx.tooltip.hide();
    // Um pacote no meio da revelação é concluído na hora (o estado já foi aplicado).
    if (this.state !== 'idle') this.finishInstantly();
  }

  // ------------------------------------------------------------- layout

  resize(w: number, h: number): void {
    const L = (this.layout = layoutOf(w, h));
    const { W, H, portrait } = L;
    this.hud.scale.set(L.k);
    this.coins.position.set(20, 18);
    let stageX: number, stageY: number, stageW: number, stageH: number;
    if (!portrait) {
      // Paisagem: tabuleiro e auto à esquerda, loja à direita, palco no meio.
      const colW = 260;
      this.seriesTitle.position.set(W / 2, 14);
      this.seriesBar.resizeBar(260);
      this.seriesBar.position.set(W / 2 - 130, 42);
      this.seriesCount.position.set(W / 2, 56);
      const boardSize = Math.min(220, H - 360);
      this.placeBoard(20 + (colW - boardSize) / 2, 90, boardSize);
      this.autoPanel.position.set(20, 90 + boardSize + 24);
      const rx = W - colW - 20;
      this.shopTitle.position.set(rx, 76);
      let y = 104;
      for (const [id, b] of this.shopButtons) {
        if (id === 'basic') continue;
        b.place(rx, y);
        y += 64;
      }
      this.queueLabel.position.set(rx, y);
      y += 30;
      this.rewardPack.place(rx, y);
      this.rewardDouble.place(rx, y + 46);
      this.doubleLabel.position.set(rx, y + 96);
      stageX = colW + 40;
      stageY = 80;
      stageW = W - 2 * (colW + 40);
      stageH = H - 80 - 80;
      this.albumButton.place(20, H - 64);
      this.treeButton.place(160, H - 64);
      this.menuButton.place(W - 190, H - 64);
      this.langButton.place(W - 80, H - 64);
    } else {
      // Retrato: palco em cima, tabuleiro + auto no meio, loja embaixo.
      this.seriesTitle.position.set(W / 2, 64);
      this.seriesBar.resizeBar(W - 160);
      this.seriesBar.position.set(80, 92);
      this.seriesCount.position.set(W / 2, 106);
      stageX = 16;
      stageY = 130;
      stageW = W - 32;
      stageH = Math.max(320, H - 130 - 470);
      const midY = stageY + stageH + 10;
      const boardSize = Math.min(170, W / 2 - 40);
      this.placeBoard(26, midY + 6, boardSize);
      const ax = W / 2 + 4;
      this.autoPanel.position.set(ax, midY);
      this.rewardPack.place(ax, midY + 84);
      this.rewardDouble.place(ax, midY + 128);
      this.doubleLabel.position.set(ax, midY + 172);
      const shopY = midY + boardSize + 24;
      this.shopTitle.position.set(20, shopY);
      const bw = (W - 40 - 8) / 2;
      let x = 20;
      for (const [id, b] of this.shopButtons) {
        if (id === 'basic') continue;
        b.scale.set(bw / 260, 1);
        b.place(x + (bw - 260) / 2, shopY + 26);
        x += bw + 8;
      }
      this.queueLabel.position.set(W - 160, shopY);
      this.albumButton.place(16, H - 60);
      this.treeButton.place(154, H - 60);
      this.menuButton.place(W - 180, H - 60);
      this.langButton.place(W - 74, H - 60);
    }
    if (!portrait) for (const b of this.shopButtons.values()) b.scale.set(1);
    this.autoPanel.setSize(260, 74);
    if (portrait) this.autoPanel.setSize(W / 2 - 24, 74), this.autoBar.resizeBar(W / 2 - 52);
    else this.autoBar.resizeBar(232);
    for (const b of [this.rewardPack, this.rewardDouble]) b.scale.set(portrait ? (W / 2 - 24) / 260 : 1, 1);
    if (portrait) {
      this.rewardPack.x = W / 2 + 4 + (W / 2 - 24) / 2;
      this.rewardDouble.x = this.rewardPack.x;
    }

    this.stageRect = new Rectangle(stageX, stageY, stageW, stageH);
    this.stageHit.clear().rect(stageX, stageY, stageW, stageH).fill({ color: 0x000000, alpha: 0.001 });
    this.hint.position.set(stageX + stageW / 2, stageY + stageH - 44);
    this.layoutStage();
    this.endPanel?.layout(W, H);
    this.langPopup?.layout(W, H);
  }

  private placeBoard(x: number, y: number, size: number): void {
    this.boardHolder.position.set(x, y);
    if (this.board && this.board.size !== size) this.refreshBoard(true, size);
  }

  private boardSize(): number {
    return this.board?.size ?? 200;
  }

  /** Posiciona o pacote e as cartas dentro do palco. */
  private layoutStage(): void {
    const r = this.stageRect;
    const s = Math.min(1, (r.height - 60) / (PACK_H + 40));
    if (this.state === 'idle') {
      this.pack.position.set(r.x + r.width / 2, r.y + r.height / 2 - 10);
      this.pack.scale.set(s);
    }
    this.cards.forEach((c, i) => {
      const p = this.cardSlot(i, this.cards.length);
      c.position.set(p.x, p.y);
      c.scale.set(p.s);
    });
  }

  private cardSlot(i: number, n: number): { x: number; y: number; s: number } {
    const r = this.stageRect;
    const gap = 14;
    // Até 5 cartas: uma fileira; se não couber, duas.
    const oneRowS = Math.min(1.2, (r.width - 20) / (n * CARD_W + (n - 1) * gap), (r.height - 60) / CARD_H);
    if (oneRowS >= 0.72 || n <= 3) {
      const s = oneRowS;
      const total = n * CARD_W * s + (n - 1) * gap;
      return { x: r.x + (r.width - total) / 2 + (i + 0.5) * CARD_W * s + i * gap, y: r.y + r.height / 2 - 14, s };
    }
    const top = Math.ceil(n / 2);
    const row = i < top ? 0 : 1;
    const inRow = row === 0 ? top : n - top;
    const j = row === 0 ? i : i - top;
    const s = Math.min(1.1, (r.width - 20) / (top * CARD_W + (top - 1) * gap), (r.height - 70) / (2 * CARD_H + gap));
    const total = inRow * CARD_W * s + (inRow - 1) * gap;
    return {
      x: r.x + (r.width - total) / 2 + (j + 0.5) * CARD_W * s + j * gap,
      y: r.y + r.height / 2 - 14 + (row - 0.5) * (CARD_H * s + gap),
      s,
    };
  }

  // -------------------------------------------------------------- update

  update(dt: number): void {
    const { engine, collection } = this.ctx.game;
    // Timers da sequência de revelação.
    if (this.timers.length) {
      const due: Array<() => void> = [];
      for (const tm of this.timers) {
        tm.t -= dt;
        if (tm.t <= 0) due.push(tm.fn);
      }
      this.timers = this.timers.filter((tm) => tm.t > 0);
      for (const fn of due) fn();
    }
    this.particles.update(dt);
    this.floats.update(dt);
    this.shake.update(dt, 8);
    this.stage.position.set(this.shake.x, this.shake.y);
    this.coins.update(dt, engine.amount('coins').toNumber(), (n) => format(Math.floor(n)));

    // Auto-abridor: pacotes abertos sozinhos.
    for (const r of collection.drainAuto()) this.showAutoPack(r);

    // Durante a revelação o topo mostra a série do tabuleiro (a que está sendo montada).
    const cur = this.state === 'idle' || this.boardSeries < 0 ? collection.currentSeries() : this.boardSeries;
    const s = SERIES[cur];
    this.seriesTitle.text = `${t('seriesN', cur + 1)} · ${t(`series.${s.id}`)}`;
    const owned = collection.owned(cur);
    const have = owned.filter((c, p) => c > 0 && !(this.boardSeries === cur && this.hidden.has(p))).length;
    this.seriesBar.setValue(have / owned.length);
    this.seriesBar.update(dt);
    this.seriesCount.text = collection.isComplete(cur) && have === owned.length ? t('complete') : t('pieces', have, owned.length);
    if (this.state === 'idle' && this.boardSeries !== cur) this.refreshBoard(true);

    // Loja
    for (const [id, b] of this.shopButtons) {
      const cost = collection.packCost(id);
      b.setText(`${t(`pack.${id}`)}\n${cost > 0 ? t('price', format(cost)) : t('free')}  ·  ${t('cards', collection.cardsIn(id))}`);
      b.enabled = cost <= 0 ? false : collection.canBuy(id);
      b.visible = id !== 'basic';
    }
    const q = collection.state.queue.length;
    this.queueLabel.text = q ? t('queued', q) : '';
    this.shopTitle.visible = true;

    // Auto
    if (collection.autoUnlocked()) {
      const iv = collection.autoInterval();
      this.autoInfo.text = t('autoEvery', iv < 10 ? iv.toFixed(1) : Math.round(iv));
      this.autoBar.setValue(collection.state.autoTimer / iv, true);
      this.autoBar.visible = true;
      this.autoPanel.alpha = 1;
    } else {
      this.autoInfo.text = t('autoLocked');
      this.autoBar.visible = false;
      this.autoPanel.alpha = 0.6;
    }

    // Rewarded: só fora da abertura e quando o cooldown acabou.
    const canReward = collection.canReward() && !this.rewardBusy;
    this.rewardPack.visible = this.rewardDouble.visible = canReward;
    this.rewardPack.enabled = this.rewardDouble.enabled = this.state === 'idle';
    this.rewardPack.setText(`${t('reward.watch')}: ${t('reward.pack')}`);
    this.rewardDouble.setText(`${t('reward.watch')}: ${t('reward.double')}`);
    const dl = collection.state.doubleLeft;
    this.doubleLabel.text = dl > 0 ? t('reward.active', Math.ceil(dl)) : '';

    this.treeButton.badge = hasAffordable(engine, 'main');

    this.hint.text =
      this.state === 'idle' ? `${t('swipeToRip')}\n${t('tapToRip')}` : this.state === 'revealing' && collection.state.packs <= 3 ? t('tapToFlip') : '';

    if (this.state === 'idle' && engine.isUnlocked('victory') && !engine.state.flags.endSeen && !this.endPanel) this.showEnd();
  }

  // ------------------------------------------------------------ tabuleiro

  private refreshBoard(rebuild = false, size = this.boardSize()): void {
    const { collection } = this.ctx.game;
    const cur = collection.currentSeries();
    if (rebuild || !this.board || this.boardSeries !== cur) {
      this.board?.destroy({ children: true });
      this.board = new BoardView(this.ctx.arts.get(cur), size);
      this.boardHolder.addChild(this.board);
      this.boardSeries = cur;
    }
    this.board.refresh(collection.owned(cur), this.hidden);
  }

  // ---------------------------------------------------------------- pacote

  private setupPackInput(): void {
    const pack = this.pack;
    pack.eventMode = 'static';
    pack.cursor = 'grab';
    pack.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.state !== 'idle') return;
      e.stopPropagation();
      this.drag = { x: e.global.x, progress: 0, ticks: 0 };
    });
    pack.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.drag || this.state !== 'idle') return;
      const dx = Math.abs(e.global.x - this.drag.x) / (this.layout.k * pack.scale.x);
      const progress = dx / (PACK_W * 0.75);
      if (Math.floor(progress * 6) > this.drag.ticks) {
        this.drag.ticks = Math.floor(progress * 6);
        audio.play('tear', { pitch: 0.8 + progress * 0.6 });
      }
      this.drag.progress = progress;
      pack.setTear(progress);
      if (progress >= 1) {
        this.drag = null;
        this.rip();
      }
    });
    const release = () => {
      if (!this.drag) return;
      const p = this.drag.progress;
      this.drag = null;
      // Toque sem arrastar também abre (acessível no mouse e no toque).
      if (p < 0.15) this.rip();
      else pack.setTear(0);
    };
    pack.on('pointerup', release);
    pack.on('pointerupoutside', release);
  }

  private showNextPack(animated = true): void {
    const { collection } = this.ctx.game;
    const id = collection.nextPack();
    this.pack.setPack(id);
    this.pack.setSubtitle(t('cards', collection.cardsIn(id)));
    this.pack.visible = true;
    this.layoutStage();
    if (animated) {
      const y = this.pack.y;
      const s = this.pack.scale.x;
      Tweens.to(0.35, y + 140, y, (v) => !this.pack.destroyed && (this.pack.y = v), ease.outBack);
      Tweens.to(0.35, 0, 1, (v) => (this.pack.alpha = v));
      Tweens.add(0.45, (k) => this.pack.scale.set(s * (1 + Math.sin(k * Math.PI) * 0.08), s * (1 - Math.sin(k * Math.PI) * 0.06)));
    }
  }

  private speed(): number {
    return this.ctx.game.collection.openTime() / BASE_OPEN_TIME;
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({ t: seconds, fn });
  }

  /** Toque/espaço: abre o pacote, vira a próxima carta ou adianta a coleta. */
  private advance(): void {
    if (this.endPanel) return;
    if (this.state === 'idle') return this.rip();
    if (this.state === 'revealing') {
      const next = this.cards.find((c) => !c.flipped);
      if (next) this.flipCard(next);
    }
  }

  private rip(): void {
    if (this.state !== 'idle') return;
    const { collection } = this.ctx.game;
    this.state = 'revealing';
    this.ctx.tooltip.hide();
    const f = this.speed();
    const pack = this.pack;
    audio.play('rip');
    const s = pack.scale.x;
    // Squash e tira voando.
    Tweens.add(0.3 * f + 0.05, (k) => pack.scale.set(s * (1 + Math.sin(k * Math.PI) * 0.12), s * (1 - Math.sin(k * Math.PI) * 0.1)), ease.outQuad);
    const sx = pack.strip.x;
    Tweens.add(0.45 * f + 0.1, (k) => {
      pack.strip.position.set(sx + k * 160, -k * 120 + k * k * 60);
      pack.strip.rotation = k * 1.2;
      pack.strip.alpha = 1 - k;
    });
    const top = this.hud.toLocal(pack.toGlobal({ x: PACK_W / 2, y: 40 }));
    this.particles.burst(top.x, top.y, PACKS.find((p) => p.id === pack.id)?.color ?? 0xffffff, 26, 380, 0.4, 0.7);
    this.particles.burst(top.x, top.y, 0xffffff, 12, 300, 0.25, 0.5);
    this.shake.add(0.25);

    this.ctx.tutorial.notify('rip');
    const result = collection.openNext('manual');
    this.current = result;
    // Peças novas da série do tabuleiro ficam escondidas até a coleta.
    this.hidden = new Set(result.cards.filter((c) => c.isNew && c.series === this.boardSeries).map((c) => c.piece));
    this.board?.refresh(collection.owned(this.boardSeries), this.hidden);

    this.after(0.3 * f, () => this.deal(result));
  }

  private deal(result: PackResult): void {
    const f = this.speed();
    const from = { x: this.pack.x, y: this.pack.y };
    // O pacote desce e some enquanto as cartas saem dele.
    const py = this.pack.y;
    Tweens.to(0.3 * f + 0.05, 0, 1, (k) => {
      this.pack.y = py + k * 120;
      this.pack.alpha = 1 - k;
    }, ease.outQuad, () => (this.pack.visible = false));
    this.cards = result.cards.map((c) => new CardView(c, this.ctx.arts.get(c.series), this.ctx.textures));
    this.cards.forEach((card, i) => {
      const slot = this.cardSlot(i, this.cards.length);
      card.position.set(from.x, from.y);
      card.scale.set(slot.s * 0.4);
      card.rotation = (Math.random() - 0.5) * 0.6;
      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.on('pointertap', (e: FederatedPointerEvent) => {
        e.stopPropagation();
        if (!card.flipped && this.state === 'revealing') this.flipCard(card);
        else this.advance();
      });
      this.stage.addChild(card);
      const delay = i * 0.06 * f;
      this.after(delay, () => {
        audio.play('deal', { pitch: 0.9 + i * 0.08 });
        Tweens.add(0.32 * f + 0.08, (k) => {
          if (card.destroyed || card.flipped) return;
          card.position.set(from.x + (slot.x - from.x) * k, from.y + (slot.y - from.y) * k);
          card.scale.set(slot.s * (0.4 + 0.6 * k));
          card.rotation *= 1 - k;
        }, ease.outCubic, () => !card.destroyed && ((card.rotation = 0), card.position.set(slot.x, slot.y), card.scale.set(slot.s)));
      });
    });
    // Viradas automáticas, uma a uma; tocar adianta.
    const n = this.cards.length;
    const gap = Math.max(0.12, ((BASE_OPEN_TIME - 0.35 - 0.45 - 0.5 - 0.6) / n) * f);
    const start = 0.4 * f + n * 0.06 * f;
    this.cards.forEach((card, i) => this.after(start + gap * (i + 0.5), () => this.flipCard(card)));
  }

  private flipCard(card: CardView): void {
    if (card.flipped || card.destroyed) return;
    const f = this.speed();
    card.flip(0.26 * Math.max(0.6, f), () => this.onRevealed(card));
    audio.play('flip');
  }

  private onRevealed(card: CardView): void {
    const r = card.result;
    const p = this.hud.toLocal(card.toGlobal({ x: CARD_W / 2, y: CARD_H / 2 }));
    const color = RARITIES[r.rarity].color;
    if (r.isNew) {
      audio.play(r.rarity === 'rare' ? 'rare' : 'new');
      this.particles.burst(p.x, p.y, color, r.rarity === 'rare' ? 60 : 24, r.rarity === 'rare' ? 520 : 320, 0.4, 0.8);
      if (r.rarity === 'rare') this.shake.add(0.6);
      const s = card.scale.x;
      Tweens.to(0.3, s * 1.15, s, (v) => !card.destroyed && card.scale.set(v), ease.outBack);
    } else {
      audio.play('coin', { pitch: 0.9 + Math.random() * 0.3 });
      this.particles.burst(p.x, p.y, COLORS.coins, 10, 220, 0.3, 0.5);
    }
    if (this.cards.every((c) => c.flipped) && this.state === 'revealing') {
      this.state = 'collecting';
      this.ctx.tutorial.notify('revealed');
      this.after(0.5 * this.speed() + 0.1, () => this.collect());
    }
  }

  /** Peças novas voam para o tabuleiro; repetidas viram moedas. */
  private collect(): void {
    const f = this.speed();
    const result = this.current;
    const coinPos = this.coins.position;
    let pending = 0;
    for (const card of this.cards) {
      const r = card.result;
      const from = this.hud.toLocal(card.toGlobal({ x: CARD_W / 2, y: CARD_H / 2 }));
      if (r.isNew && r.series === this.boardSeries && this.board) {
        pending++;
        const art = this.ctx.arts.get(r.series);
        const fly = new Sprite(art.piece(r.piece));
        fly.anchor.set(0.5);
        const startS = ((CARD_W - 16) / (art.cell + art.pad * 2)) * card.scale.x;
        fly.scale.set(startS);
        fly.position.set(from.x, from.y);
        this.hud.addChild(fly);
        const c = this.board.pieceCenter(r.piece);
        const to = { x: this.boardHolder.x + c.x, y: this.boardHolder.y + c.y };
        const endS = this.board.scaleK;
        Tweens.add(0.45 * f + 0.15, (k) => {
          fly.position.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 60);
          fly.scale.set(startS + (endS - startS) * k);
          fly.rotation = Math.sin(k * Math.PI) * 0.4;
        }, ease.inOutQuad, () => {
          fly.destroy();
          this.hidden.delete(r.piece);
          this.board?.snap(r.piece);
          audio.play('snap');
          this.particles.burst(to.x, to.y, RARITIES[r.rarity].color, 14, 200, 0.3, 0.5);
          if (--pending === 0) this.afterCollect(result);
        });
      } else if (!r.isNew) {
        this.floats.spawn(`+${format(r.coins)}`, from.x, from.y - 40, COLORS.coins, 1.1);
        // Moedinhas indo para o contador.
        for (let i = 0; i < 4; i++) {
          const dot = new Graphics().circle(0, 0, 7).fill({ color: COLORS.coins }).stroke({ width: 1.5, color: 0x8a6416 });
          dot.position.set(from.x, from.y);
          this.hud.addChild(dot);
          const tx = coinPos.x + 14;
          const ty = coinPos.y + 14;
          const ox = (Math.random() - 0.5) * 120;
          Tweens.add(0.5 * f + 0.15 + i * 0.05, (k) => {
            dot.position.set(from.x + (tx - from.x) * k + ox * Math.sin(k * Math.PI), from.y + (ty - from.y) * k);
          }, ease.inOutQuad, () => {
            dot.destroy();
            if (i === 0) this.coins.bump();
          });
        }
      }
      // A carta some.
      const s = card.scale.x;
      Tweens.to(0.25 * f + 0.05, 1, 0, (k) => {
        if (card.destroyed) return;
        card.alpha = k;
        card.scale.set(s * (0.8 + 0.2 * k));
      }, ease.linear, () => card.destroy({ children: true }));
    }
    this.cards = [];
    if (pending === 0) this.after(0.3 * f, () => this.afterCollect(result));
  }

  private afterCollect(result: PackResult | null): void {
    if (this.state !== 'collecting') return;
    this.state = 'idle';
    this.hidden.clear();
    this.current = null;
    if (result?.completed.length) {
      audio.play('complete');
      this.shake.add(0.5);
      const c = this.boardHolder.position;
      const size = this.boardSize();
      for (let i = 0; i < 4; i++) this.after(i * 0.12, () => this.particles.burst(c.x + size / 2, c.y + size / 2, [COLORS.coins, COLORS.rare, COLORS.uncommon, 0xffffff][i], 40, 420, 0.4, 0.9));
    }
    this.refreshBoard();
    this.showNextPack();
    this.ctx.saves.save();
  }

  /** Sai da tela no meio de uma abertura: termina tudo sem animação. */
  private finishInstantly(): void {
    this.timers = [];
    for (const c of this.cards) c.destroy({ children: true });
    this.cards = [];
    this.state = 'idle';
    this.hidden.clear();
    this.current = null;
    this.refreshBoard();
    this.showNextPack(false);
  }

  // ------------------------------------------------------------ auto

  private showAutoPack(r: PackResult): void {
    const p = this.autoPanel.position;
    const w = this.autoPanel.panelWidth;
    const mini = new Graphics().roundRect(-14, -20, 28, 40, 4).fill({ color: PACKS.find((x) => x.id === r.pack)?.color ?? COLORS.accent }).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    mini.position.set(p.x + w - 30, p.y + 30);
    this.hud.addChild(mini);
    Tweens.add(0.6, (k) => {
      mini.scale.set(1 + Math.sin(k * Math.PI) * 0.4);
      mini.alpha = 1 - k * k;
      mini.y = p.y + 30 - k * 20;
    }, ease.outQuad, () => mini.destroy());
    if (r.coins > 0) this.floats.spawn(`+${format(r.coins)}`, this.coins.x + 60, this.coins.y + 50, COLORS.coins, 0.9);
    for (const c of r.cards) {
      if (c.isNew && c.series === this.boardSeries && !this.hidden.has(c.piece)) {
        this.board?.snap(c.piece);
        audio.play('snap');
      }
    }
    if (r.completed.length && this.state === 'idle') this.afterAutoComplete();
  }

  private afterAutoComplete(): void {
    audio.play('complete');
    this.refreshBoard(true);
  }

  // ------------------------------------------------------------ idioma

  private showLang(): void {
    if (this.langPopup) return;
    this.ctx.tooltip.hide();
    const close = () => {
      this.langPopup?.destroy({ children: true });
      this.langPopup = null;
    };
    this.langPopup = new LangPopup(
      this.ctx.kit.app.renderer,
      (l) => {
        saveLang(l);
        this.ctx.saves.save();
        location.reload();
      },
      close,
    );
    this.hud.addChild(this.langPopup);
    this.langPopup.layout(this.layout.W, this.layout.H);
  }

  // ------------------------------------------------------------ tutorial

  tutorialUi(): TutorialUi {
    return {
      scene: 'main',
      idle: this.state === 'idle',
      revealing: this.state === 'revealing',
      blocked: this.ctx.menu.isOpen || !!this.endPanel || !!this.langPopup,
    };
  }

  tutorialTarget(target: TutorialTarget): Rectangle | null {
    const of = (c: Container) => (c.visible ? c.getBounds().rectangle : null);
    switch (target) {
      case 'pack':
        return of(this.pack);
      case 'stage': {
        const r = this.stageRect;
        const k = this.layout.k;
        return new Rectangle(r.x * k, r.y * k, r.width * k, r.height * k);
      }
      case 'board':
        return of(this.boardHolder);
      case 'coins':
        return of(this.coins);
      case 'shop':
        return this.shopButtons.has('series') ? of(this.shopButtons.get('series')!) : null;
      case 'treeButton':
        return of(this.treeButton);
      case 'albumButton':
        return of(this.albumButton);
      case 'auto':
        return of(this.autoPanel);
      default:
        return null;
    }
  }

  // ------------------------------------------------------------- final

  private showEnd(): void {
    const { engine } = this.ctx.game;
    engine.state.flags.endSeen = true;
    this.ctx.saves.save();
    portal.gameplayStop();
    this.endPanel = new EndPanel(this.ctx, () => {
      this.endPanel?.destroy({ children: true });
      this.endPanel = null;
      portal.gameplayStart();
    });
    this.hud.addChild(this.endPanel);
    this.endPanel.layout(this.layout.W, this.layout.H);
    for (let i = 0; i < 8; i++)
      this.after(i * 0.15, () => this.particles.burst(Math.random() * this.layout.W, Math.random() * this.layout.H * 0.6, [COLORS.coins, COLORS.rare, COLORS.uncommon][i % 3], 50, 450, 0.45, 1));
    audio.play('prestige');
  }
}
