/**
 * Simula o Node Breaker com três perfis de jogador (ótimo, "humano" e sem
 * prestígio) e imprime uma tabela de marcos e paredes por perfil.
 * Uso: npm run sim -- [minutos] [perfil]
 * Com um perfil (optimal, human, no-prestige), imprime também o relatório
 * completo dele, compra a compra.
 */
import { ARENA_H, ARENA_W } from '../games/node-breaker/arena';
import { createGame } from '../games/node-breaker/game';
import {
  buyCheapestUpgrade,
  DEFAULT_PROFILES,
  formatProfileTable,
  formatReport,
  simulateProfiles,
  type SimPolicy,
  type SimProfile,
} from '../src/sim/simulator';

const maxMinutes = Number(process.argv[2] ?? 120);
const detail = process.argv[3];

type Game = ReturnType<typeof createGame>;
const games = new Map<string, Game>();

function policyFor(profile: SimProfile): SimPolicy {
  const game = createGame(42);
  games.set(profile.id, game);
  const { engine, runs, arena, prestige } = game;
  let waiting = 0;
  let retarget = 0;
  let best = { x: ARENA_W / 2, y: ARENA_H / 2 };
  return {
    step(dt) {
      if (!runs.active) {
        waiting += dt;
        if (waiting >= profile.idleSeconds) {
          waiting = 0;
          runs.start();
        }
        engine.tick(dt);
        return;
      }
      // Bot: mira no nó com mais vizinhos dentro do raio (aproxima um jogador
      // atento). Com menos esforço, troca de alvo menos vezes e mexe o mouse
      // mais devagar.
      retarget -= dt * profile.effort;
      if (retarget <= 0) {
        retarget = 1 / 30;
        const radius = engine.statNumber('cursor.radius');
        let score = -1;
        for (const n of arena.nodes) {
          let s = n.kind === 'boss' ? 5 : n.kind === 'gold' ? 3 : 1;
          for (const o of arena.nodes) if (o !== n && (o.x - n.x) ** 2 + (o.y - n.y) ** 2 < radius * radius) s++;
          if (s > score) (score = s), (best = { x: n.x, y: n.y });
        }
      }
      // Movimento limitado: o mouse não teleporta.
      const speed = 1400 * profile.effort * dt;
      const dx = best.x - arena.cursor.x;
      const dy = best.y - arena.cursor.y;
      const d = Math.hypot(dx, dy);
      if (d > speed) {
        arena.cursor.x += (dx / d) * speed;
        arena.cursor.y += (dy / d) * speed;
      } else {
        arena.cursor.x = best.x;
        arena.cursor.y = best.y;
      }
      arena.cursor.inside = true;
      engine.tick(dt);
      arena.drainEvents();
    },
    shop() {
      if (runs.active) return null;
      const up = buyCheapestUpgrade(engine, ['main', 'reboot']);
      if (up) return up;
      if (engine.isGeneratorUnlocked('miner') && engine.buyGenerator('miner') > 0) return 'miner';
      // Reboot quando o ganho de prismas dobraria o total atual.
      if (profile.prestige && prestige.canPrestige(engine, 'reboot')) {
        const gain = prestige.gain(engine, 'reboot');
        if (gain.gte(engine.amount('prisms').add(engine.state.lifetime.prisms ?? 0).max(3))) {
          prestige.prestige(engine, 'reboot');
          return 'REBOOT';
        }
      }
      return null;
    },
    done: () => engine.isUnlocked('victory'),
  };
}

const profiles = detail ? DEFAULT_PROFILES.filter((p) => p.id === detail) : DEFAULT_PROFILES;
if (!profiles.length) throw new Error(`Perfil desconhecido: ${detail}. Use ${DEFAULT_PROFILES.map((p) => p.id).join(', ')}.`);
const results = simulateProfiles(policyFor, { maxSeconds: maxMinutes * 60, dt: 1 / 30, wallSeconds: 180 }, profiles);

console.log(
  formatProfileTable(results, [
    { id: 'core', label: '1ª compra' },
    { id: 'boss', label: 'Chefe' },
    { id: 'mining', label: 'Mineração' },
    { id: 'REBOOT', label: '1º Reboot' },
    { id: 'p-auto', label: 'Auto' },
  ]),
);
console.log('');
for (const { profile } of results) {
  const { runs, prestige, engine } = games.get(profile.id)!;
  console.log(`${profile.name}: ${runs.count} runs | ${prestige.count(engine, 'reboot')} reboots | ${engine.state.flags.kills} nós destruídos`);
}

if (detail) {
  const { engine } = games.get(detail)!;
  const names = (id: string) => {
    if (id === 'miner') return 'Minerador';
    if (id === 'REBOOT') return '>>> REBOOT';
    try {
      return engine.upgrade(id).name + ` (${id})`;
    } catch {
      return id;
    }
  };
  console.log('\n' + formatReport(results[0].result, names));
}
