import { Container, Graphics, Rectangle } from 'pixi.js';
import { uiScale, type KitApp } from '../../src/ui/app';
import { audio } from '../../src/ui/audio';
import { theme } from '../../src/ui/theme';
import { ease, Tweens } from '../../src/ui/tween';
import { Button, label, Panel } from '../../src/ui/widgets';
import { COLORS } from './content';
import { t } from './i18n';
import type { Tutorial, TutorialStep, TutorialTarget, TutorialUi } from './tutorial';

/** O que uma cena precisa expor para o tutorial guiá-la. */
export interface TutorialHost {
  tutorialUi(): TutorialUi;
  /** Retângulo do alvo em coordenadas de tela, ou null se não está visível. */
  tutorialTarget(target: TutorialTarget): Rectangle | null;
}

export function isTutorialHost(s: unknown): s is TutorialHost {
  return !!s && typeof (s as TutorialHost).tutorialUi === 'function';
}

const BUBBLE_W = 340;
const PAD = 16;

/**
 * Overlay do tutorial: escurece a tela em volta do alvo, contorna o alvo
 * com um anel pulsando, aponta com uma seta e mostra um balão com o texto
 * do passo. O escurecido não bloqueia cliques: o jogador sempre pode
 * tocar no que está destacado (ou em qualquer outra coisa).
 */
export class TutorialOverlay extends Container {
  private dim = new Graphics();
  private ring = new Graphics();
  private arrow = new Graphics();
  private bubble = new Container();
  private panel = new Panel({ width: BUBBLE_W, height: 120, alpha: 0.98, border: COLORS.accent, radius: 12 });
  private counter = label('', 12, COLORS.accent, { fontWeight: '700' });
  private body = label('', 16, theme.text, { wordWrap: true, wordWrapWidth: BUBBLE_W - PAD * 2, lineHeight: 22 });
  private ok: Button;
  private skip: Button;
  private help: Button;

  private step: TutorialStep | null = null;
  private rect: Rectangle | null = null;
  private screenKey = '';
  private time = 0;
  private arrowAngle = 0;
  private arrowAt = { x: 0, y: 0 };

  constructor(private kit: KitApp, private tutorial: Tutorial) {
    super();
    this.dim.eventMode = 'none';
    this.ring.eventMode = 'none';
    this.arrow.eventMode = 'none';
    this.ok = new Button({ text: t('tut.ok'), width: 96, height: 36, size: 14, color: COLORS.accent, onClick: () => this.step && this.tutorial.ack(this.step.id) });
    this.skip = new Button({ text: t('tut.skip'), width: 130, height: 36, size: 13, color: theme.textDim, onClick: () => this.tutorial.skip() });
    this.help = new Button({
      text: '?',
      width: 44,
      height: 44,
      size: 20,
      color: COLORS.accent,
      onClick: () => {
        this.tutorial.reset();
        audio.play('achievement');
      },
    });
    this.counter.position.set(PAD, 12);
    this.body.position.set(PAD, 32);
    this.bubble.eventMode = 'static';
    this.bubble.addChild(this.panel, this.counter, this.body, this.ok, this.skip);
    this.bubble.visible = false;
    this.addChild(this.dim, this.ring, this.arrow, this.bubble, this.help);
    this.drawArrow();
  }

  update(dt: number): void {
    this.time += dt;
    const host = isTutorialHost(this.kit.scene) ? this.kit.scene : null;
    const ui = host?.tutorialUi() ?? null;
    const step = ui ? this.tutorial.active(ui) : null;
    const { width: w, height: h } = this.kit.app.screen;
    const k = uiScale(w, h);

    // Botão de ajuda: só na tela principal, no canto de cima à direita.
    this.help.visible = ui?.scene === 'main' && !ui.blocked;
    this.help.scale.set(k);
    this.help.position.set(w - (16 + 22) * k, (14 + 22) * k);

    if (step !== this.step) this.setStep(step);
    if (!step || !host) return;

    const rect = step.target ? host.tutorialTarget(step.target) : null;
    const key = `${w}x${h}`;
    if (!sameRect(rect, this.rect) || key !== this.screenKey) {
      this.rect = rect ? rect.clone() : null;
      this.screenKey = key;
      this.redraw(w, h, k);
    }

    // Anel pulsando e seta balançando.
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    this.ring.alpha = 0.55 + 0.45 * pulse;
    const bob = (Math.sin(this.time * 6) - 1) * 4 * k;
    this.arrow.position.set(this.arrowAt.x - Math.sin(this.arrowAngle) * bob, this.arrowAt.y + Math.cos(this.arrowAngle) * bob);
  }

  private setStep(step: TutorialStep | null): void {
    this.step = step;
    this.rect = null;
    this.screenKey = '';
    const on = !!step;
    this.bubble.visible = this.dim.visible = this.ring.visible = this.arrow.visible = on;
    if (!step) return;
    const p = this.tutorial.progress();
    this.counter.text = t('tut.counter', p.done + 1, p.total);
    this.body.text = t(`tut.${step.id}`);
    const textBottom = 32 + this.body.height + 14;
    this.ok.visible = !!step.ack;
    // Nas duas primeiras dicas não há "Pular": no playtest, 7% pulava já na primeira.
    this.skip.visible = p.done >= 2;
    this.ok.place(BUBBLE_W - PAD - 96, textBottom);
    this.skip.place(PAD - 8, textBottom);
    // Sem botões (primeiras dicas de ação), o balão fecha logo abaixo do texto.
    const buttons = this.ok.visible || this.skip.visible;
    this.panel.setSize(BUBBLE_W, buttons ? textBottom + 36 + PAD : textBottom + PAD - 14);
    // Entrada com um "pop".
    const b = this.bubble;
    Tweens.to(0.3, 0, 1, (v) => !b.destroyed && (b.alpha = v), ease.outCubic);
    audio.play('click', { pitch: 1.3 });
  }

  private redraw(w: number, h: number, k: number): void {
    const r = this.rect;
    const bw = BUBBLE_W * k;
    const bh = this.panel.panelHeight * k;
    this.bubble.scale.set(k);
    this.dim.clear();
    this.ring.clear();
    this.arrow.visible = !!r;

    if (!r) {
      // Sem alvo (ex.: a árvore inteira): só o balão, embaixo, sem escurecer.
      this.bubble.position.set((w - bw) / 2, h - bh - 20 * k);
      return;
    }

    const m = 8 * k;
    const hole = new Rectangle(r.x - m, r.y - m, r.width + m * 2, r.height + m * 2);
    this.dim.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.5 });
    this.dim.roundRect(hole.x, hole.y, hole.width, hole.height, 12 * k).cut();
    this.ring.roundRect(hole.x, hole.y, hole.width, hole.height, 12 * k).stroke({ width: 3 * k, color: COLORS.accent });

    // Balão abaixo do alvo se couber; senão acima; senão ao lado; senão dentro do alvo, embaixo.
    const gap = 34 * k;
    const edge = 8 * k;
    const cx = hole.x + hole.width / 2;
    const cy = hole.y + hole.height / 2;
    const clampX = (x: number) => Math.max(edge, Math.min(w - bw - edge, x));
    const clampY = (y: number) => Math.max(edge, Math.min(h - bh - edge, y));
    let bx: number;
    let by: number;
    if (h - hole.bottom >= bh + gap + edge) {
      bx = clampX(cx - bw / 2);
      by = hole.bottom + gap;
      this.pointArrow(Math.max(bx + 20 * k, Math.min(bx + bw - 20 * k, cx)), hole.bottom + 4 * k, Math.PI, k);
    } else if (hole.y >= bh + gap + edge) {
      bx = clampX(cx - bw / 2);
      by = hole.y - gap - bh;
      this.pointArrow(Math.max(bx + 20 * k, Math.min(bx + bw - 20 * k, cx)), hole.y - 4 * k, 0, k);
    } else if (w - hole.right >= bw + gap + edge) {
      bx = hole.right + gap;
      by = clampY(cy - bh / 2);
      this.pointArrow(hole.right + 4 * k, Math.max(by + 20 * k, Math.min(by + bh - 20 * k, cy)), Math.PI / 2, k);
    } else if (hole.x >= bw + gap + edge) {
      bx = hole.x - gap - bw;
      by = clampY(cy - bh / 2);
      this.pointArrow(hole.x - 4 * k, Math.max(by + 20 * k, Math.min(by + bh - 20 * k, cy)), -Math.PI / 2, k);
    } else {
      // Alvo grande (o palco inteiro): balão na parte de baixo dele, sem seta.
      bx = clampX(cx - bw / 2);
      by = clampY(hole.bottom - bh - 16 * k);
      this.arrow.visible = false;
    }
    this.bubble.position.set(bx, by);
  }

  /** Põe a ponta da seta em (x, y); `angle` 0 aponta para baixo, PI para cima, PI/2 para a esquerda. */
  private pointArrow(x: number, y: number, angle: number, k: number): void {
    this.arrowAt = { x, y };
    this.arrowAngle = angle;
    this.arrow.rotation = angle;
    this.arrow.scale.set(k);
  }

  /** Seta apontando para baixo, com a ponta na origem. */
  private drawArrow(): void {
    this.arrow
      .clear()
      .poly([0, 0, -14, -18, -5, -18, -5, -30, 5, -30, 5, -18, 14, -18])
      .fill({ color: COLORS.accent })
      .stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
  }
}

function sameRect(a: Rectangle | null, b: Rectangle | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
