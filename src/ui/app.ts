import { Application, Container } from 'pixi.js';
import { theme } from './theme';
import { Tweens } from './tween';

/**
 * Uma cena é uma tela do jogo (árvore, arena, menu). Tudo é desenhado em
 * canvas pelo PixiJS: não há elementos DOM além do próprio <canvas>.
 */
export abstract class Scene {
  readonly root = new Container();
  protected kit!: KitApp;

  attach(kit: KitApp): void {
    this.kit = kit;
  }

  onEnter(): void {}
  onExit(): void {}
  update(_dt: number): void {}
  resize(_width: number, _height: number): void {}
}

/**
 * Escala da interface para o tamanho da tela. As cenas desenham o HUD num
 * Container com essa escala e fazem o layout em `width / escala`, então os
 * painéis encolhem em telas pequenas e crescem em telas grandes.
 */
export function uiScale(width: number, height: number, baseW = 1100, baseH = 680, min = 0.55, max = 1.6): number {
  return Math.max(min, Math.min(max, width / baseW, height / baseH));
}

export interface KitAppOptions {
  canvas: HTMLCanvasElement;
  background?: number;
  /** 'webgpu' é mais rápido onde existe; o Pixi cai para WebGL quando não há suporte. */
  preference?: 'webgl' | 'webgpu';
}

/**
 * Aplicação do kit: inicializa o PixiJS, organiza camadas e troca de cenas.
 * Camadas: cena atual, interface fixa (HUD), overlay (tooltips e toasts).
 */
export class KitApp {
  readonly app = new Application();
  readonly sceneLayer = new Container();
  readonly hudLayer = new Container();
  readonly overlayLayer = new Container();
  private current: Scene | null = null;
  private resizeHandlers: Array<(w: number, h: number) => void> = [];
  private frameHandlers: Array<(dt: number) => void> = [];

  static async create(opts: KitAppOptions): Promise<KitApp> {
    const kit = new KitApp();
    await kit.app.init({
      canvas: opts.canvas,
      resizeTo: window,
      background: opts.background ?? theme.background,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: opts.preference ?? 'webgl',
    });
    const stage = kit.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = kit.app.screen;
    stage.addChild(kit.sceneLayer, kit.hudLayer, kit.overlayLayer);
    kit.app.ticker.add((ticker) => {
      const dt = Math.min(ticker.deltaMS / 1000, 0.1);
      Tweens.update(dt);
      kit.current?.update(dt);
      for (const h of kit.frameHandlers) h(dt);
    });
    kit.app.renderer.on('resize', (w: number, h: number) => kit.handleResize(w, h));
    return kit;
  }

  get width(): number {
    return this.app.screen.width;
  }

  get height(): number {
    return this.app.screen.height;
  }

  get scene(): Scene | null {
    return this.current;
  }

  onResize(handler: (w: number, h: number) => void): void {
    this.resizeHandlers.push(handler);
    handler(this.width, this.height);
  }

  onFrame(handler: (dt: number) => void): void {
    this.frameHandlers.push(handler);
  }

  setScene(scene: Scene): void {
    if (this.current) {
      this.current.onExit();
      this.sceneLayer.removeChild(this.current.root);
    }
    this.current = scene;
    scene.attach(this);
    this.sceneLayer.addChild(scene.root);
    scene.resize(this.width, this.height);
    scene.onEnter();
  }

  private handleResize(w: number, h: number): void {
    this.app.stage.hitArea = this.app.screen;
    this.current?.resize(w, h);
    for (const r of this.resizeHandlers) r(w, h);
  }
}
