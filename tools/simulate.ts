/**
 * Simula o Puzzle Packs com perfis de jogador e mede o tempo de cada série
 * e quantos pacotes foram abertos.
 * Uso: npm run sim -- [minutos] [perfil]   (padrão: 1500 min; SEEDS=n muda o número de sementes da mediana)
 * Com um perfil (optimal, human, casual), imprime também o relatório
 * completo dele, compra a compra.
 */
import { SERIES, type PackId } from '../games/puzzle-packs/content';
import { createGame, type Game } from '../games/puzzle-packs/game';
import { buyCheapestUpgrade, formatProfileTable, formatReport, simulateProfiles, type SimPolicy, type SimProfile } from '../src/sim/simulator';

const maxMinutes = Number(process.argv[2] ?? 1500);
const detail = process.argv[3];

/**
 * Perfis do Puzzle Packs (não há prestígio no MVP):
 * - optimal: abre o próximo pacote assim que a animação acaba.
 * - human: leva 1,5 s entre um pacote e outro e só abre 80% do tempo.
 * - casual: abre um pacote de vez em quando (35% do tempo) e deixa o auto-abridor trabalhar.
 */
export const PROFILES: SimProfile[] = [
  { id: 'optimal', name: 'Bot ótimo', effort: 1, idleSeconds: 0.3, prestige: false },
  { id: 'human', name: 'Humano', effort: 0.8, idleSeconds: 1.5, prestige: false },
  { id: 'casual', name: 'Casual', effort: 0.35, idleSeconds: 3, prestige: false },
];

const games = new Map<string, Game>();

function policyFor(profile: SimProfile, seed = 42): SimPolicy {
  const game = createGame(seed);
  games.set(profile.id, game);
  const { engine, collection } = game;
  let busy = 0;
  let pause = 0;
  const news: string[] = [];
  const record = (r: ReturnType<typeof collection.openNext>) => {
    for (const c of r.cards) if (c.isNew) {
      news.push(`new:${SERIES[c.series].id}`);
    }
    for (const i of r.completed) news.push(`S${i + 1}`);
  };
  return {
    step(dt) {
      engine.tick(dt);
      for (const r of collection.drainAuto()) record(r);
      if (busy > 0) {
        busy -= dt;
        return;
      }
      if (pause > 0) {
        pause -= dt;
        return;
      }
      // Esforço menor que 1: às vezes o jogador fica um tempo sem abrir.
      if (collection.allComplete()) return;
      record(collection.openNext('manual'));
      busy = collection.openTime();
      pause = profile.idleSeconds + (1 / profile.effort - 1) * collection.openTime();
    },
    shop() {
      const n = news.shift();
      if (n) return n;
      const up = buyCheapestUpgrade(engine, ['main']);
      if (up) return up;
      // Com a fila vazia, gasta em pacotes: premium quando só faltam raras, senão o da série.
      if (collection.state.queue.length === 0 && !collection.allComplete()) {
        const cur = collection.currentSeries();
        const onlyRares = collection.missing(cur).every((p) => SERIES[cur].rare.includes(p));
        // Só faltam raras: junta moedas para o premium (5× mais chance de rara).
        const want: PackId = onlyRares ? 'premium' : 'series';
        if (collection.canBuy(want) && collection.buyPack(want)) return `buy:${want}`;
      }
      return null;
    },
    done: () => collection.allComplete(),
  };
}

const profiles = detail ? PROFILES.filter((p) => p.id === detail) : PROFILES;
if (!profiles.length) throw new Error(`Perfil desconhecido: ${detail}. Use ${PROFILES.map((p) => p.id).join(', ')}.`);
const results = simulateProfiles(policyFor, { maxSeconds: maxMinutes * 60, dt: 1 / 10, wallSeconds: 180 }, profiles);

// Compras de pacote não contam como progresso para as paredes.
for (const { result } of results) {
  const progress = result.events.filter((e) => !e.action.startsWith('buy:'));
  result.walls = [];
  let last = 0;
  for (const e of progress) {
    if (e.t - last > 180) result.walls.push({ from: last, to: e.t });
    last = e.t;
  }
  if (!result.finished && result.seconds - last > 180) result.walls.push({ from: last, to: result.seconds });
}

console.log(
  formatProfileTable(results, [
    { id: 'collector', label: '1º upgrade' },
    { id: 'S1', label: 'Série 1' },
    { id: 'auto', label: 'Auto+' },
    ...SERIES.slice(1).map((_, i) => ({ id: `S${i + 2}`, label: `Série ${i + 2}` })),
  ]),
);
console.log('');
for (const { profile } of results) {
  const { engine, collection } = games.get(profile.id)!;
  const st = collection.state;
  const t = SERIES.map((s) => st.completedAt[s.id]);
  const by = Object.entries(st.packsByType).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(
    `${profile.name}: ${st.packs} pacotes (${by}; ${st.autoPacks} pelo auto-abridor) | ${st.cards} cartas, ${st.dupes} repetidas | ` +
      `${Math.round(engine.state.lifetime.coins.toNumber())} moedas | séries em ${t.map((x) => (x === undefined ? '-' : `${(x / 60).toFixed(1)}min`)).join(' / ')}`,
  );
}

// Uma semente só engana: a sorte com as raras muda muito o ritmo. Mediana de várias sementes.
const SEEDS = Number(process.env.SEEDS ?? 25);
console.log(`\nMediana e faixa (p10 a p90) de ${SEEDS} sementes, em minutos:`);
const median = (xs: number[], q = 0.5) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};
for (const profile of profiles) {
  const times: number[][] = SERIES.map(() => []);
  const packs: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const p = policyFor(profile, seed);
    let t = 0;
    while (t < maxMinutes * 60 && !p.done()) {
      p.step(0.1, t);
      t += 0.1;
      while (p.shop!(t)) {}
    }
    const { collection } = games.get(profile.id)!;
    SERIES.forEach((s, i) => times[i].push((collection.state.completedAt[s.id] ?? Infinity) / 60));
    packs.push(collection.state.packs);
  }
  const cell = (xs: number[]) => `${median(xs).toFixed(1)} (${median(xs, 0.1).toFixed(1)}-${median(xs, 0.9).toFixed(1)})`;
  console.log(`  ${profile.name.padEnd(10)} ${times.map((x, i) => `série ${i + 1} ${cell(x)}`).join(' | ')} | pacotes ${median(packs)}`);
}

if (detail) {
  const { engine } = games.get(detail)!;
  const names = (id: string) => {
    try {
      return `${id} (nível ${engine.upgradeLevel(id)})`;
    } catch {
      return id;
    }
  };
  console.log('\n' + formatReport(results[0].result, names));
}
