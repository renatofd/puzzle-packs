import { format, setDefaultNotation } from '../../src/core/num';
import { GameLoop } from '../../src/core/loop';
import { SaveManager } from '../../src/core/save';
import { KitApp } from '../../src/ui/app';
import { audio } from '../../src/ui/audio';
import { DebugPanel } from '../../src/ui/hud';
import { GameMenu } from '../../src/ui/menu';
import { settings } from '../../src/ui/settings';
import { Toasts, Tooltip } from '../../src/ui/widgets';
import { COLORS } from './content';
import type { GameContext } from './context';
import { createGame } from './game';
import { HubScene } from './hub-scene';
import { RunScene } from './run-scene';

async function main() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const kit = await KitApp.create({ canvas });
  const game = createGame();
  const { engine, runs } = game;
  // Acesso pelo console do navegador durante o desenvolvimento.
  if (import.meta.env.DEV) (globalThis as any).game = game;

  const saves = new SaveManager(engine);
  const offline = saves.load();
  // Uma run interrompida (aba fechada) não continua: volta para a árvore.
  if (runs.active) runs.end('quit');

  const loop = new GameLoop(engine, { tickRate: 60 });
  const tooltip = new Tooltip(() => kit.app.screen);
  const toasts = new Toasts(() => kit.app.screen);
  kit.overlayLayer.addChild(toasts, tooltip);

  const debug = new DebugPanel(engine, loop, saves);
  kit.overlayLayer.addChild(debug);
  kit.onResize((w) => debug.position.set(w - 276, 16));

  setDefaultNotation(settings.values.notation);
  settings.onChange((v) => setDefaultNotation(v.notation));
  const menu = new GameMenu({
    kit,
    engine,
    saves,
    extraStats: (e) => [
      ['Runs feitas', String(runs.count)],
      ['Reboots', String(game.prestige.count(e, 'reboot'))],
      ['Nós destruídos', format(Number(e.state.flags.kills ?? 0))],
    ],
  });
  audio.startMusic();

  let hub: HubScene;
  let run: RunScene;
  const ctx: GameContext = {
    game,
    kit,
    loop,
    saves,
    tooltip,
    toasts,
    menu,
    goToHub: () => {
      if (runs.active) runs.end('quit');
      kit.setScene(hub);
    },
    goToRun: () => kit.setScene(run),
  };
  hub = new HubScene(ctx);
  run = new RunScene(ctx);

  engine.events.on('achievement', ({ id }) => {
    const a = engine.def.achievements?.find((x) => x.id === id);
    if (a) toasts.push(`Conquista: ${a.name}`, a.description);
    audio.play('achievement');
  });
  engine.events.on('unlock', ({ id }) => {
    if (id === 'reboot') toasts.push('Reboot liberado', 'Recomece do zero em troca de Prismas permanentes.', COLORS.prisms);
    if (id === 'miners') toasts.push('Mineradores liberados', 'Eles geram Bits até com o jogo fechado.', COLORS.bits);
  });

  kit.setScene(hub);
  loop.start();

  if (offline && offline.seconds > 60) {
    const parts = Object.entries(offline.gains).map(([res, amt]) => `+${format(amt)} ${engine.def.resources.find((r) => r.id === res)?.name ?? res}`);
    if (parts.length) toasts.push(`Enquanto você estava fora (${Math.round(offline.seconds / 60)} min)`, parts.join(', '), COLORS.bits);
  }

  setInterval(() => saves.save(), 10_000);
  window.addEventListener('beforeunload', () => saves.save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saves.save();
  });
}

main();
