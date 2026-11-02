import { Container, Graphics, Text } from 'pixi.js';
import type { Engine } from '../core/engine';
import { format, formatTime, type Notation } from '../core/num';
import type { SaveManager } from '../core/save';
import type { KitApp } from './app';
import { audio } from './audio';
import { settings } from './settings';
import { theme } from './theme';
import { ease, Tweens } from './tween';
import { fill, kitText as T } from './strings';
import { Button, label, Panel, Slider } from './widgets';

export type MenuTab = 'options' | 'stats' | 'achievements' | 'save';

export interface GameMenuOptions {
  kit: KitApp;
  engine: Engine;
  saves: SaveManager;
  /** Linhas extras de estatística do jogo (ex.: nós destruídos, runs). */
  extraStats?: (engine: Engine) => Array<[string, string]>;
}

const TABS: Array<{ id: MenuTab; name: () => string }> = [
  { id: 'options', name: () => T.tabOptions },
  { id: 'stats', name: () => T.tabStats },
  { id: 'achievements', name: () => T.tabAchievements },
  { id: 'save', name: () => T.tabSave },
];

const NOTATIONS: Array<{ id: Notation; name: () => string }> = [
  { id: 'short', name: () => T.notationShort },
  { id: 'scientific', name: () => T.notationScientific },
  { id: 'engineering', name: () => T.notationEngineering },
];

/**
 * Menu do jogo desenhado no canvas: opções (volume, efeitos, notação),
 * estatísticas, conquistas e save (exportar, importar, apagar).
 * Serve para qualquer jogo do kit; o jogo só passa estatísticas extras.
 */
export class GameMenu extends Container {
  private backdrop = new Graphics();
  private panel: Panel;
  private tabButtons = new Map<MenuTab, Button>();
  private body = new Container();
  private bodyMask = new Graphics();
  private scrollY = 0;
  private tab: MenuTab = 'options';
  private refresh = 0;
  private wipeArmed = false;
  private status: Text | null = null;
  private readonly w = 640;
  private readonly h = 500;

  constructor(private opts: GameMenuOptions) {
    super();
    this.visible = false;
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => this.close());
    this.panel = new Panel({ width: this.w, height: this.h, alpha: 1 });
    this.panel.eventMode = 'static';
    const title = label(T.menu, 20, theme.text, { fontWeight: '700' });
    title.position.set(24, 18);
    const close = new Button({ text: T.close, width: 90, height: 32, size: 13, color: theme.textDim, onClick: () => this.close() }).place(this.w - 114, 16);
    this.panel.addChild(title, close);
    TABS.forEach((t, i) => {
      const b = new Button({ text: t.name(), width: 138, height: 34, size: 14, onClick: () => this.show(t.id) }).place(24 + i * 148, 62);
      this.tabButtons.set(t.id, b);
      this.panel.addChild(b);
    });
    this.body.position.set(24, 116);
    this.bodyMask.rect(0, 112, this.w, this.h - 124).fill({ color: 0xffffff });
    this.panel.addChild(this.body, this.bodyMask);
    this.body.mask = this.bodyMask;
    this.panel.on('wheel', (e) => {
      const max = Math.max(0, this.body.height - (this.h - 140));
      this.scrollY = Math.max(0, Math.min(max, this.scrollY + e.deltaY * 0.5));
      this.body.y = 116 - this.scrollY;
    });
    this.addChild(this.backdrop, this.panel);
    opts.kit.overlayLayer.addChild(this);
    opts.kit.onResize((w, h) => this.layout(w, h));
    opts.kit.onFrame((dt) => this.update(dt));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        e.stopImmediatePropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.visible;
  }

  open(tab: MenuTab = this.tab): void {
    this.visible = true;
    this.show(tab);
    Tweens.to(0.2, 0.96, 1, (v) => !this.panel.destroyed && this.panel.scale.set(v), ease.outBack);
    Tweens.to(0.2, 0, 1, (v) => (this.alpha = v), ease.outQuad);
  }

  close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.wipeArmed = false;
  }

  toggle(): void {
    if (this.visible) this.close();
    else this.open();
  }

  private layout(w: number, h: number): void {
    this.backdrop.clear().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    const scale = Math.min(1, (w - 32) / this.w, (h - 32) / this.h);
    this.panel.pivot.set(this.w / 2, this.h / 2);
    this.panel.position.set(w / 2, h / 2);
    this.panel.scale.set(scale);
  }

  private update(dt: number): void {
    if (!this.visible || (this.tab !== 'stats' && this.tab !== 'achievements')) return;
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 1;
      this.render();
    }
  }

  private show(tab: MenuTab): void {
    this.tab = tab;
    this.wipeArmed = false;
    this.scrollY = 0;
    this.body.y = 116;
    for (const [id, b] of this.tabButtons) b.setColor(id === tab ? theme.accent : theme.nodeAvailable);
    this.render();
  }

  private render(): void {
    this.body.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.status = null;
    if (this.tab === 'options') this.renderOptions();
    else if (this.tab === 'stats') this.renderStats();
    else if (this.tab === 'achievements') this.renderAchievements();
    else this.renderSave();
  }

  private renderOptions(): void {
    const s = settings.values;
    let y = 8;
    const slider = (name: string, value: number, set: (v: number) => void) => {
      const l = label(name, 15, theme.text);
      l.position.set(0, y);
      const pct = label(`${Math.round(value * 100)}%`, 14, theme.textDim);
      pct.position.set(560, y + 1);
      const sl = new Slider(300, value, (v) => {
        set(v);
        pct.text = `${Math.round(v * 100)}%`;
      });
      sl.position.set(240, y + 10);
      this.body.addChild(l, sl, pct);
      y += 46;
    };
    slider(T.masterVolume, s.masterVolume, (v) => settings.set('masterVolume', v));
    slider(T.sfxVolume, s.sfxVolume, (v) => {
      settings.set('sfxVolume', v);
      audio.play('click');
    });
    slider(T.musicVolume, s.musicVolume, (v) => settings.set('musicVolume', v));
    slider(T.effects, s.effects, (v) => settings.set('effects', v));

    const shake = new Button({
      text: s.screenShake ? T.screenShakeOn : T.screenShakeOff,
      width: 300,
      height: 36,
      size: 14,
      onClick: () => {
        settings.set('screenShake', !settings.values.screenShake);
        this.render();
      },
    }).place(0, y + 6);
    y += 52;
    const idx = NOTATIONS.findIndex((n) => n.id === s.notation);
    const notation = new Button({
      text: fill(T.notation, NOTATIONS[idx].name()),
      width: 300,
      height: 36,
      size: 14,
      onClick: () => {
        settings.set('notation', NOTATIONS[(idx + 1) % NOTATIONS.length].id);
        this.render();
      },
    }).place(0, y + 6);
    const example = label(fill(T.example, `${format(1.5e6)}, ${format(2.34e15)}`), 13, theme.textDim);
    example.position.set(316, y + 16);
    this.body.addChild(shake, notation, example);
  }

  private renderStats(): void {
    const e = this.opts.engine;
    const rows: Array<[string, string]> = [
      [T.playTime, formatTime(e.state.time.played)],
      [T.sinceReset, formatTime(e.state.time.sinceReset)],
    ];
    for (const r of e.def.resources) {
      const life = e.state.lifetime[r.id];
      if (!life || life.lte(0)) continue;
      rows.push([fill(T.totalEarned, r.name), format(life)]);
    }
    const ups = e.def.upgrades ?? [];
    rows.push([T.upgradesBought, fill(T.xOfY, ups.filter((u) => e.upgradeLevel(u.id) > 0).length, ups.length)]);
    const ach = e.def.achievements ?? [];
    rows.push([T.achievements, fill(T.xOfY, ach.filter((a) => e.state.achievements[a.id]).length, ach.length)]);
    rows.push(...(this.opts.extraStats?.(e) ?? []));
    rows.forEach(([k, v], i) => {
      const y = i * 32;
      if (i % 2 === 0) {
        const band = new Graphics().rect(-8, y - 6, this.w - 32, 30).fill({ color: theme.panelBorder, alpha: 0.35 });
        this.body.addChild(band);
      }
      const kl = label(k, 15, theme.textDim);
      kl.position.set(0, y);
      const vl = label(v, 15, theme.text, { fontWeight: '600' });
      vl.anchor.set(1, 0);
      vl.position.set(this.w - 56, y);
      this.body.addChild(kl, vl);
    });
  }

  private renderAchievements(): void {
    const e = this.opts.engine;
    const cardW = 288;
    const cardH = 64;
    (e.def.achievements ?? []).forEach((a, i) => {
      const got = !!e.state.achievements[a.id];
      const secret = a.hidden && !got;
      const c = new Container();
      c.position.set((i % 2) * (cardW + 16), Math.floor(i / 2) * (cardH + 12));
      const color = got ? theme.warning : theme.nodeLocked;
      const bg = new Graphics()
        .roundRect(0, 0, cardW, cardH, 8)
        .fill({ color: got ? theme.warning : theme.panel, alpha: got ? 0.1 : 1 })
        .stroke({ width: got ? 2 : 1, color });
      const n = label(secret ? '???' : a.name, 15, got ? theme.text : theme.textDim, { fontWeight: '700' });
      n.position.set(12, 10);
      const d = label(secret ? T.secretAchievement : a.description, 12, theme.textDim, { wordWrap: true, wordWrapWidth: cardW - 24 });
      d.position.set(12, 34);
      c.addChild(bg, n, d);
      this.body.addChild(c);
    });
  }

  private renderSave(): void {
    const { saves } = this.opts;
    const info = label(T.saveInfo, 14, theme.textDim);
    info.position.set(0, 4);
    this.status = label('', 14, theme.good);
    this.status.position.set(0, 250);
    const say = (text: string, ok = true) => {
      if (!this.status) return;
      this.status.text = text;
      this.status.style.fill = ok ? theme.good : theme.bad;
    };
    const saveNow = new Button({ text: T.saveNow, width: 280, height: 40, size: 14, onClick: () => (saves.save(), say(T.saved)) }).place(0, 40);
    const exp = new Button({
      text: T.exportSave,
      width: 280,
      height: 40,
      size: 14,
      onClick: () => {
        const code = saves.export();
        navigator.clipboard
          ?.writeText(code)
          .then(() => say(T.exported))
          .catch(() => say(T.exportFailed, false));
      },
    }).place(0, 92);
    const imp = new Button({
      text: T.importSave,
      width: 280,
      height: 40,
      size: 14,
      onClick: () => {
        if (!navigator.clipboard?.readText) return say(T.importUnsupported, false);
        navigator.clipboard
          .readText()
          .then((code) => {
            saves.import(code);
            say(T.imported);
          })
          .catch(() => say(T.importFailed, false));
      },
    }).place(0, 144);
    const wipe = new Button({
      text: this.wipeArmed ? T.wipeConfirm : T.wipeSave,
      width: 280,
      height: 40,
      size: 14,
      color: theme.bad,
      onClick: () => {
        if (!this.wipeArmed) {
          this.wipeArmed = true;
          this.render();
          return;
        }
        saves.wipe();
        location.reload();
      },
    }).place(0, 196);
    this.body.addChild(info, saveNow, exp, imp, wipe, this.status);
  }
}
