import { Assets, type Texture } from 'pixi.js';
import { format, setDefaultNotation } from '../../src/core/num';
import { GameLoop } from '../../src/core/loop';
import { SaveManager } from '../../src/core/save';
import { KitApp, setPortraitBase } from '../../src/ui/app';
import { audio } from '../../src/ui/audio';
import { DebugPanel } from '../../src/ui/hud';
import { GameMenu } from '../../src/ui/menu';
import { settings } from '../../src/ui/settings';
import { setTheme } from '../../src/ui/theme';
import { Toasts, Tooltip } from '../../src/ui/widgets';
import { AlbumScene } from './album-scene';
import { buildSeriesArt } from './art';
import { COLORS, SERIES } from './content';
import { PORTRAIT_BASE, type GameContext } from './context';
import { createGame } from './game';
import { detectLang, localizeContent, setLang, t } from './i18n';
import { MainScene } from './main-scene';
import { portal } from './portal';
import { defineSfx } from './sfx';
import { TreeScene } from './tree-scene';
import { Tutorial } from './tutorial';
import { TutorialOverlay } from './tutorial-view';

interface ManifestEntry {
  id: string;
  file: string;
  ready: boolean;
  loadInGame?: boolean;
}

/** Carrega do manifest só os assets marcados como prontos; o resto vira placeholder. */
async function loadAssets(): Promise<Record<string, Texture>> {
  const out: Record<string, Texture> = {};
  try {
    const res = await fetch('assets/manifest.json');
    if (!res.ok) return out;
    const manifest = (await res.json()) as { assets: ManifestEntry[] };
    const wanted = manifest.assets.filter((a) => a.ready && a.loadInGame !== false);
    await Promise.all(
      wanted.map(async (a) => {
        try {
          out[a.id] = await Assets.load<Texture>(`assets/${a.file}`);
        } catch (e) {
          console.warn(`Asset ${a.id} não carregou; usando placeholder.`, e);
        }
      }),
    );
  } catch {
    /* sem manifest: tudo placeholder */
  }
  return out;
}

async function main() {
  await portal.init();
  setLang(detectLang());
  setTheme({ background: 0x15122a, panel: 0x211c3b, panelBorder: 0x3b3466, accent: COLORS.accent, nodeAffordable: COLORS.accent, edgeActive: COLORS.accent });
  defineSfx();
  setPortraitBase(PORTRAIT_BASE.w, PORTRAIT_BASE.h);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const kit = await KitApp.create({ canvas });
  const game = createGame();
  const { engine, collection } = game;
  localizeContent(engine);
  if (import.meta.env.DEV) (globalThis as any).game = game;

  const textures = await loadAssets();
  const arts = SERIES.map((s, i) => buildSeriesArt(kit.app.renderer, i, textures[s.asset]));

  const saves = new SaveManager(engine);
  const offline = saves.load();
  const offlinePacks = collection.takeOfflineCount();
  const tutorial = new Tutorial(game);
  tutorial.start();
  if (import.meta.env.DEV) (globalThis as any).tutorial = tutorial;

  const loop = new GameLoop(engine, { tickRate: 30 });
  const tooltip = new Tooltip(() => kit.app.screen);
  const toasts = new Toasts(() => kit.app.screen);
  const tutorialOverlay = new TutorialOverlay(kit, tutorial);
  kit.overlayLayer.addChild(tutorialOverlay, toasts, tooltip);
  kit.onFrame((dt) => tutorialOverlay.update(dt));

  if (import.meta.env.DEV) {
    const debug = new DebugPanel(engine, loop, saves);
    kit.overlayLayer.addChild(debug);
    kit.onResize((w) => debug.position.set(w - 276, 16));
  }

  setDefaultNotation(settings.values.notation);
  settings.onChange((v) => setDefaultNotation(v.notation));
  const menu = new GameMenu({
    kit,
    engine,
    saves,
    extraStats: () => {
      const st = collection.state;
      return [
        [t('stat.packs'), format(st.packs)],
        [t('stat.auto'), format(st.autoPacks)],
        [t('stat.cards'), format(st.cards)],
        [t('stat.dupes'), format(st.dupes)],
        [t('stat.new'), format(st.newPieces)],
      ];
    },
  });

  let scenes: Record<'main' | 'album' | 'tree', MainScene | AlbumScene | TreeScene>;
  const ctx: GameContext = {
    game,
    kit,
    loop,
    saves,
    tooltip,
    toasts,
    menu,
    arts,
    tutorial,
    textures,
    go: (name) => {
      if (name === 'main') {
        portal.gameplayStart();
        // Interstitial só num ponto de pausa natural (voltando do álbum ou das melhorias), nunca na abertura.
        if (kit.scene !== scenes.main) void portal.commercialBreak();
      } else portal.gameplayStop();
      kit.setScene(scenes[name]);
    },
  };
  scenes = { main: new MainScene(ctx), album: new AlbumScene(ctx), tree: new TreeScene(ctx) };

  engine.events.on('achievement', ({ id }) => {
    const a = engine.def.achievements?.find((x) => x.id === id);
    if (a) toasts.push(t('toastAchievement', a.name), a.description);
    audio.play('achievement');
  });
  engine.events.on('unlock', ({ id }) => {
    const i = SERIES.findIndex((s) => s.id === id);
    if (i < 0) return;
    toasts.push(t('toastSeries', t(`series.${id}`)), i < SERIES.length - 1 ? t('toastNextSeries') : '', COLORS.coins);
    if (i === 0) toasts.push(t('toastAuto'), t('toastAutoBody'), COLORS.accent);
  });

  kit.setScene(scenes.main);
  loop.start();
  portal.loadingFinished();
  portal.gameplayStart();
  audio.startMusic();

  if (offline && offline.seconds > 60 && (offlinePacks > 0 || offline.gains.coins)) {
    toasts.push(t('toastOffline'), t('toastOfflineBody', offlinePacks, format(offline.gains.coins ?? 0)), COLORS.coins);
  }

  const persist = () => {
    saves.save();
    void portal.cloudSave.save(saves.toString());
  };
  setInterval(persist, 10_000);
  window.addEventListener('beforeunload', () => saves.save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persist();
      portal.gameplayStop();
    } else if (kit.scene === scenes.main) portal.gameplayStart();
  });
}

main();
