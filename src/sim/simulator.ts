import type { Engine } from '../core/engine';
import { format } from '../core/num';

export interface SimEvent {
  t: number;
  action: string;
}

export interface SimResult {
  seconds: number;
  events: SimEvent[];
  /** Segundo em que cada upgrade foi comprado pela primeira vez. */
  firstBuy: Record<string, number>;
  /** Intervalos longos sem nenhuma compra (possíveis paredes). */
  walls: Array<{ from: number; to: number }>;
  finished: boolean;
}

export interface SimPolicy {
  /** Avança o jogo `dt` segundos (o jogo decide o que o "jogador" faz). */
  step(dt: number, t: number): void;
  /** Chamado quando há chance de gastar recursos. Retorna o nome do que comprou, ou null. */
  shop?(t: number): string | null;
  /** O jogo terminou? */
  done(): boolean;
}

/**
 * Simulador headless: roda o jogo com um bot e mede quanto tempo leva cada
 * desbloqueio. Serve para achar paredes (longos trechos sem compra) e
 * trechos rápidos demais antes de alguém jogar.
 */
export function simulate(policy: SimPolicy, opts: { maxSeconds: number; dt: number; wallSeconds?: number }): SimResult {
  const events: SimEvent[] = [];
  const firstBuy: Record<string, number> = {};
  let t = 0;
  let lastBuy = 0;
  const walls: SimResult['walls'] = [];
  const wallSeconds = opts.wallSeconds ?? 180;
  while (t < opts.maxSeconds && !policy.done()) {
    policy.step(opts.dt, t);
    t += opts.dt;
    if (policy.shop) {
      let bought: string | null;
      while ((bought = policy.shop(t))) {
        events.push({ t, action: bought });
        if (firstBuy[bought] === undefined) firstBuy[bought] = t;
        if (t - lastBuy > wallSeconds) walls.push({ from: lastBuy, to: t });
        lastBuy = t;
      }
    }
  }
  // Parou de comprar e o tempo acabou: o trecho final também é parede.
  const finished = policy.done();
  if (!finished && t - lastBuy > wallSeconds) walls.push({ from: lastBuy, to: t });
  return { seconds: t, events, firstBuy, walls, finished };
}

/**
 * Compra o upgrade mais barato disponível (por custo no primeiro recurso).
 * `avoid` lista recursos que o bot está guardando para outra compra.
 */
export function buyCheapestUpgrade(engine: Engine, trees: string[] = ['main'], avoid: string[] = []): string | null {
  let best: { id: string; cost: number } | null = null;
  for (const tree of trees) {
    for (const u of engine.upgradesInTree(tree)) {
      if (engine.upgradeStatus(u.id) !== 'affordable') continue;
      if (avoid.length && engine.upgradeCost(u.id).some((c) => avoid.includes(c.resource))) continue;
      const c = engine.upgradeCost(u.id)[0]?.amount.toNumber() ?? 0;
      if (!best || c < best.cost) best = { id: u.id, cost: c };
    }
  }
  if (best && engine.buyUpgrade(best.id)) return best.id;
  return null;
}

export function formatReport(r: SimResult, names: (id: string) => string): string {
  const lines: string[] = [];
  const mm = (s: number) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
  lines.push(`Tempo simulado: ${mm(r.seconds)} | terminou: ${r.finished ? 'sim' : 'não'}`);
  lines.push('');
  lines.push('Primeira compra de cada item:');
  for (const [id, t] of Object.entries(r.firstBuy).sort((a, b) => a[1] - b[1])) {
    lines.push(`  ${mm(t).padStart(7)}  ${names(id)}`);
  }
  lines.push('');
  lines.push(r.walls.length ? 'Paredes (sem compras por muito tempo):' : 'Nenhuma parede encontrada.');
  for (const w of r.walls) lines.push(`  ${mm(w.from)} até ${mm(w.to)} (${format(w.to - w.from)}s)`);
  return lines.join('\n');
}

/**
 * Jeito de jogar que o bot imita. O simulador não sabe o que é um clique
 * no jogo: a política de cada jogo lê estes números e age de acordo.
 */
export interface SimProfile {
  id: string;
  name: string;
  /** Fração das ações de um jogador perfeito (1 = todos os cliques, 0.5 = metade). */
  effort: number;
  /** Segundos parado no hub entre uma run e outra. */
  idleSeconds: number;
  /** Faz prestígio? Sem prestígio as paredes devem aparecer. */
  prestige: boolean;
}

/** Os três perfis padrão: ótimo, "humano" e sem prestígio. */
export const DEFAULT_PROFILES: SimProfile[] = [
  { id: 'optimal', name: 'Bot ótimo', effort: 1, idleSeconds: 1, prestige: true },
  { id: 'human', name: 'Humano', effort: 0.5, idleSeconds: 6, prestige: true },
  { id: 'no-prestige', name: 'Sem prestígio', effort: 1, idleSeconds: 1, prestige: false },
];

export interface ProfileResult {
  profile: SimProfile;
  result: SimResult;
}

/**
 * Roda `simulate` uma vez por perfil. `policyFor` monta um jogo novo e a
 * política daquele perfil (cada perfil começa do zero).
 */
export function simulateProfiles(
  policyFor: (profile: SimProfile) => SimPolicy,
  opts: { maxSeconds: number; dt: number; wallSeconds?: number },
  profiles: SimProfile[] = DEFAULT_PROFILES,
): ProfileResult[] {
  return profiles.map((profile) => ({ profile, result: simulate(policyFor(profile), opts) }));
}

/** Marco da tabela: a primeira vez que a ação `id` aparece no resultado. */
export interface SimMilestone {
  id: string;
  label: string;
}

const mmss = (s: number) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;

/** Tabela com o tempo de cada marco por perfil, o fim do jogo e as paredes. */
export function formatProfileTable(results: ProfileResult[], milestones: SimMilestone[]): string {
  const header = ['Perfil', ...milestones.map((m) => m.label), 'Fim', 'Paredes'];
  const rows = results.map(({ profile, result }) => [
    profile.name,
    ...milestones.map((m) => (result.firstBuy[m.id] === undefined ? '-' : mmss(result.firstBuy[m.id]))),
    result.finished ? mmss(result.seconds) : `não (${mmss(result.seconds)})`,
    String(result.walls.length),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ');
  const out = [line(header), widths.map((w) => '-'.repeat(w)).join('-|-'), ...rows.map(line)];
  for (const { profile, result } of results) {
    if (!result.walls.length) continue;
    out.push('', `Paredes de "${profile.name}":`);
    for (const w of result.walls) out.push(`  ${mmss(w.from)} até ${mmss(w.to)} (${Math.round(w.to - w.from)}s sem compra)`);
  }
  return out.join('\n');
}
