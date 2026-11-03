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
import { Analytics } from './analytics';
import { ArtStore } from './art';
import { COLORS, SERIES } from './content';
import { PORTRAIT_BASE, type GameContext } from './context';
import { createGame } from './game';
import { detectLang, localizeContent, setLang, t } from './i18n';
import { MainScene } from './main-scene';
import { portal } from './portal';
import { addBackground, applyGuiSkin } from './gui';
import { defineSfx, loadSounds, type SoundEntry } from './sfx';
import { TreeScene } from './tree-scene';
import { Tutorial } from './tutorial';
import { TutorialOverlay } from './tutorial-view';

interface ManifestEntry {
  id: string;
  file: string;
  ready: boolean;
  loadInGame?: boolean;
}

/** Ids dos assets que são ilustração de série: carregam sob demanda pelo `ArtStore`. */
const SERIES_ASSETS = new Set(SERIES.map((s) => s.asset));

/**
 * Carrega do manifest só os assets marcados como prontos; o resto vira placeholder.
 * As ilustrações das séries não entram aqui: `seriesFiles` guarda o caminho de cada uma.
 */
async function loadAssets(seriesFiles: Record<string, string>): Promise<Record<string, Texture>> {
  const out: Record<string, Texture> = {};
  try {
    const res = await fetch('assets/manifest.json');
    if (!res.ok) return out;
    const manifest = (await res.json()) as { assets: ManifestEntry[]; sounds?: SoundEntry[] };
    loadSounds(manifest.sounds);
    const ready = manifest.assets.filter((a) => a.ready && a.loadInGame !== false);
    for (const a of ready) if (SERIES_ASSETS.has(a.id)) seriesFiles[a.id] = a.file;
    const wanted = ready.filter((a) => !SERIES_ASSETS.has(a.id));
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

/**
 * Regras de página dos portais: setas, espaço e roda do mouse não podem
 * rolar a página de fora (o jogo roda num iframe), sem menu de contexto
 * no canvas, e nada de teclado do jogo durante um anúncio.
 */
function guardPage(canvas: HTMLCanvasElement): void {
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End']);
  window.addEventListener(
    'keydown',
    (e) => {
      if (portal.isAdActive) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
    },
    true,
  );
  window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

async function main() {
  await portal.init();
  setLang(detectLang());
  setTheme({ background: 0x15122a, panel: 0x211c3b, panelBorder: 0x3b3466, accent: COLORS.accent, nodeAffordable: COLORS.accent, edgeActive: COLORS.accent });
  defineSfx();
  setPortraitBase(PORTRAIT_BASE.w, PORTRAIT_BASE.h);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  guardPage(canvas);
  const kit = await KitApp.create({ canvas });
  const game = createGame();
  const { engine, collection } = game;
  localizeContent(engine);
  if (import.meta.env.DEV) (globalThis as any).game = game;

  const seriesFiles: Record<string, string> = {};
  const textures = await loadAssets(seriesFiles);
  applyGuiSkin(textures);
  addBackground(kit, textures['gui-background']);
  const arts = new ArtStore(kit.app.renderer, seriesFiles);

  const saves = new SaveManager(engine);
  const offline = saves.load();
  const offlinePacks = collection.takeOfflineCount();
  // Baixa já as ilustrações das séries liberadas e da próxima; as outras vêm sob demanda.
  await arts.loadMany([...collection.unlockedSeries(), collection.currentSeries() + 1]);
  const tutorial = new Tutorial(game);
  tutorial.start();
  if (import.meta.env.DEV) (globalThis as any).tutorial = tutorial;
  const analytics = new Analytics((c, w, a) => portal.measure(c, w, a));
  analytics.attach(game, tutorial);
  if (import.meta.env.DEV) (globalThis as any).portal = portal;

  const loop = new GameLoop(engine, { tickRate: 30 });
  // Anúncio na tela: som mudo e jogo parado; tudo volta quando ele acaba.
  portal.hooks = {
    onAdStart: () => {
      audio.silence(true);
      loop.stop();
    },
    onAdEnd: () => {
      audio.silence(false);
      loop.start();
    },
  };
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
  let scenes: Record<'main' | 'album' | 'tree', MainScene | AlbumScene | TreeScene>;
  /** Voltar da pausa para a tela principal: gameplayStop → commercialBreak → gameplayStart. */
  let resuming = false;
  const resumeMain = (enter: boolean) => {
    if (resuming) return;
    resuming = true;
    void portal.commercialBreak().finally(() => {
      resuming = false;
      if (enter) kit.setScene(scenes.main);
      if (kit.scene === scenes.main && !menu.isOpen) portal.gameplayStart();
    });
  };
  const menu: GameMenu = new GameMenu({
    onToggle: (open) => {
      if (open) {
        portal.gameplayStop();
        analytics.screen('menu');
      } else if (kit.scene === scenes.main) resumeMain(false);
    },
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
    analytics,
    textures,
    go: (name) => {
      if (name === 'main') {
        // Interstitial só num ponto de pausa natural (voltando do álbum ou das melhorias), nunca na abertura.
        if (kit.scene !== scenes.main) resumeMain(true);
        return;
      }
      if (resuming) return;
      portal.gameplayStop();
      analytics.screen(name === 'tree' ? 'upgrades' : name);
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
    // A série i + 1 virou a atual (já carregada); adianta a seguinte.
    void arts.load(i + 2);
  });

  kit.setScene(scenes.main);
  loop.start();
  portal.loadingFinished();
  // Só vira gameplayStart no SDK no primeiro toque ou tecla do jogador.
  portal.gameplayStart();
  audio.startMusic();

  if (offline && offline.seconds > 60 && (offlinePacks > 0 || offline.gains.coins)) {
    toasts.push(t('toastOffline'), t('toastOfflineBody', offlinePacks, format(offline.gains.coins ?? 0)), COLORS.coins);
    analytics.offlineReturn(offlinePacks);
  }

  const persist = () => {
    saves.save();
    void portal.cloudSave.save(saves.toString());
  };
  setInterval(persist, 10_000);
  window.addEventListener('beforeunload', () => saves.save());
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    if (hidden) persist();
    portal.setHidden(hidden);
  });
}

main();
