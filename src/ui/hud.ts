import { BitmapText, Container, Graphics } from 'pixi.js';
import type { Engine } from '../core/engine';
import type { GameLoop } from '../core/loop';
import { D, format } from '../core/num';
import type { SaveManager } from '../core/save';
import { theme } from './theme';
import { Button, label, Panel } from './widgets';

interface ResourceRow {
  id: string;
  root: Container;
  value: BitmapText;
  rate: BitmapText;
  shown: number;
}

/**
 * Barra de recursos: quantidade de cada recurso (com contagem suave) e,
 * se houver geradores, a produção por segundo. Recursos aparecem quando
 * o jogador ganha o primeiro.
 */
export class ResourceBar extends Container {
  private rows: ResourceRow[] = [];

  constructor(private engine: Engine, ids?: string[]) {
    super();
    for (const r of engine.def.resources) {
      if (ids && !ids.includes(r.id)) continue;
      const root = new Container();
      const dot = new Graphics().circle(7, 11, 6).fill({ color: r.color ?? theme.accent });
      const name = label(r.name, 13, theme.textDim);
      name.position.set(20, 3);
      const value = new BitmapText({ text: '0', style: { fontFamily: theme.fontFamily, fontSize: 20, fill: theme.text, fontWeight: 'bold' } });
      value.position.set(20, 20);
      const rate = new BitmapText({ text: '', style: { fontFamily: theme.fontFamily, fontSize: 12, fill: theme.good } });
      rate.position.set(20, 44);
      root.addChild(dot, name, value, rate);
      this.addChild(root);
      this.rows.push({ id: r.id, root, value, rate, shown: 0 });
    }
  }

  update(dt: number): void {
    let x = 0;
    for (const row of this.rows) {
      const amount = this.engine.amount(row.id);
      const seen = this.engine.state.lifetime[row.id]?.gt(0) || amount.gt(0);
      row.root.visible = !!seen;
      if (!seen) continue;
      // Contagem suave para números pequenos; acima de 1e15 mostra direto.
      const target = amount.toNumber();
      if (Number.isFinite(target) && target < 1e15) {
        row.shown += (target - row.shown) * Math.min(1, dt * 10);
        if (Math.abs(target - row.shown) < 0.5) row.shown = target;
        row.value.text = format(D(Math.floor(row.shown)));
      } else {
        row.value.text = format(amount);
      }
      const rate = this.engine.productionPerSecond(row.id);
      row.rate.text = rate.gt(0) ? `+${format(rate)}/s` : '';
      row.root.x = x;
      x += Math.max(110, row.value.width + 40);
    }
  }
}

/**
 * Painel de debug desenhado no canvas (F1 ou ` para abrir): dar recursos,
 * acelerar o tempo, pular tempo e apagar o save. Só para desenvolvimento.
 */
export class DebugPanel extends Panel {
  private speedButton: Button;

  constructor(engine: Engine, private loop: GameLoop, saves: SaveManager) {
    super({ width: 260, height: 100 });
    const title = label('Debug', 15, theme.warning, { fontWeight: '700' });
    title.position.set(14, 10);
    this.addChild(title);
    let y = 40;
    for (const r of engine.def.resources) {
      const b = new Button({
        text: `${r.name} ×10 (+100)`,
        width: 232,
        height: 30,
        size: 13,
        color: r.color ?? theme.accent,
        onClick: () => {
          const amt = engine.amount(r.id).mul(9).max(100);
          engine.add(r.id, amt, 'debug');
        },
      }).place(14, y);
      this.addChild(b);
      y += 36;
    }
    this.speedButton = new Button({ text: 'Velocidade ×1', width: 232, height: 30, size: 13, onClick: () => this.cycleSpeed() }).place(14, y);
    y += 36;
    const skip = new Button({ text: 'Pular 1 hora', width: 232, height: 30, size: 13, onClick: () => engine.simulate(3600) }).place(14, y);
    y += 36;
    const wipe = new Button({
      text: 'Apagar save',
      width: 232,
      height: 30,
      size: 13,
      color: theme.bad,
      onClick: () => {
        saves.wipe();
        location.reload();
      },
    }).place(14, y);
    y += 44;
    this.addChild(this.speedButton, skip, wipe);
    this.setSize(260, y);
    this.visible = false;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1' || e.key === '`') {
        e.preventDefault();
        this.visible = !this.visible;
      }
    });
  }

  private cycleSpeed(): void {
    const speeds = [1, 5, 20, 100];
    const next = speeds[(speeds.indexOf(this.loop.speed) + 1) % speeds.length];
    this.loop.speed = next;
    this.speedButton.setText(`Velocidade ×${next}`);
  }
}
