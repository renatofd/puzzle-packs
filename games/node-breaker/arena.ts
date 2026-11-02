import type { Engine, GameModule, TickContext } from '../../src/core/engine';
import type { RunModule } from '../../src/modules/runs';

/**
 * Lógica da arena, sem nenhuma dependência de desenho. A cena só lê
 * `nodes` e consome `events`; o simulador de balanceamento roda esta
 * mesma lógica com um bot no lugar do mouse.
 */

export type NodeKind = 'normal' | 'big' | 'gold' | 'boss';

export interface ArenaNode {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  angle: number;
  spin: number;
}

export type ArenaEvent =
  | { type: 'spawn'; node: ArenaNode }
  | { type: 'hit'; node: ArenaNode; damage: number; crit: boolean }
  | { type: 'kill'; node: ArenaNode; bits: number; cores: number }
  | { type: 'chain'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'shot'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'attack'; x: number; y: number; radius: number };

export const ARENA_W = 1280;
export const ARENA_H = 720;

/** Gerador pseudoaleatório com semente, para runs reproduzíveis no simulador. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KIND = {
  normal: { hp: 1, value: 1, r: 18 },
  big: { hp: 5, value: 6, r: 30 },
  gold: { hp: 3, value: 2, r: 20 },
  boss: { hp: 80, value: 40, r: 56 },
} as const;

export class ArenaModule implements GameModule {
  readonly id = 'arena';
  nodes: ArenaNode[] = [];
  events: ArenaEvent[] = [];
  cursor = { x: ARENA_W / 2, y: ARENA_H / 2, inside: false };
  /** Posições dos drones ao redor do cursor (para desenhar). */
  drones: Array<{ x: number; y: number }> = [];
  private nextId = 1;
  private spawnTimer = 0;
  private attackTimer = 0;
  private droneTimers: number[] = [];
  private bossSpawned = false;
  private time = 0;
  rng: () => number;

  constructor(private runs: RunModule, seed = Date.now()) {
    this.rng = mulberry32(seed);
  }

  init(engine: Engine): void {
    this.runs.events.on('start', () => this.resetArena(engine));
    this.runs.events.on('end', () => {
      this.nodes = [];
      this.drones = [];
    });
  }

  private resetArena(engine: Engine): void {
    this.nodes = [];
    this.events = [];
    this.spawnTimer = 0;
    this.attackTimer = 0;
    this.bossSpawned = false;
    this.droneTimers = [];
    // Começa com alguns nós para a run não abrir vazia.
    const initial = Math.min(6, engine.statNumber('spawn.max'));
    for (let i = 0; i < initial; i++) this.spawn(engine, 'normal');
  }

  tick(engine: Engine, dt: number, ctx: TickContext): void {
    if (!this.runs.active || ctx.offline) return;
    this.time += dt;
    this.updateSpawns(engine, dt);
    this.moveNodes(dt);
    this.updateCursor(engine, dt);
    this.updateDrones(engine, dt);
  }

  private updateSpawns(engine: Engine, dt: number): void {
    const max = engine.statNumber('spawn.max');
    this.spawnTimer += dt * engine.statNumber('spawn.rate');
    while (this.spawnTimer >= 1) {
      this.spawnTimer -= 1;
      if (this.nodes.filter((n) => n.kind !== 'boss').length >= max) continue;
      const r = this.rng();
      const gold = engine.statNumber('gold.chance');
      const big = engine.statNumber('big.chance');
      this.spawn(engine, r < gold ? 'gold' : r < gold + big ? 'big' : 'normal');
    }
    if (!this.bossSpawned && engine.statNumber('boss.enabled') > 0 && this.runs.elapsed >= this.runs.duration() / 2) {
      this.bossSpawned = true;
      this.spawn(engine, 'boss');
    }
  }

  private spawn(engine: Engine, kind: NodeKind): ArenaNode {
    const k = KIND[kind];
    const hp = engine.statNumber('node.hp') * k.hp;
    const margin = 60;
    const n: ArenaNode = {
      id: this.nextId++,
      kind,
      x: margin + this.rng() * (ARENA_W - margin * 2),
      y: margin + this.rng() * (ARENA_H - margin * 2),
      vx: (this.rng() - 0.5) * 40,
      vy: (this.rng() - 0.5) * 40,
      r: k.r,
      hp,
      maxHp: hp,
      angle: this.rng() * Math.PI,
      spin: (this.rng() - 0.5) * 2,
    };
    if (kind === 'boss') {
      n.x = ARENA_W / 2;
      n.y = ARENA_H / 2;
      n.vx = n.vy = 0;
    }
    this.nodes.push(n);
    this.events.push({ type: 'spawn', node: n });
    return n;
  }

  private moveNodes(dt: number): void {
    for (const n of this.nodes) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.angle += n.spin * dt;
      if (n.x < n.r || n.x > ARENA_W - n.r) n.vx *= -1;
      if (n.y < n.r || n.y > ARENA_H - n.r) n.vy *= -1;
      n.x = Math.max(n.r, Math.min(ARENA_W - n.r, n.x));
      n.y = Math.max(n.r, Math.min(ARENA_H - n.r, n.y));
    }
  }

  private updateCursor(engine: Engine, dt: number): void {
    this.attackTimer += dt * engine.statNumber('cursor.rate');
    if (this.attackTimer < 1) return;
    this.attackTimer -= Math.floor(this.attackTimer);
    if (!this.cursor.inside) return;
    const radius = engine.statNumber('cursor.radius');
    const damage = engine.statNumber('cursor.damage');
    const critChance = engine.statNumber('crit.chance');
    const critMult = engine.statNumber('crit.mult');
    this.events.push({ type: 'attack', x: this.cursor.x, y: this.cursor.y, radius });
    for (const n of [...this.nodes]) {
      const dx = n.x - this.cursor.x;
      const dy = n.y - this.cursor.y;
      if (dx * dx + dy * dy > (radius + n.r) * (radius + n.r)) continue;
      const crit = this.rng() < critChance;
      this.damage(engine, n, crit ? damage * critMult : damage, crit);
    }
  }

  private updateDrones(engine: Engine, dt: number): void {
    const count = Math.floor(engine.statNumber('drones'));
    this.drones.length = count;
    for (let i = 0; i < count; i++) {
      const a = this.time * 1.5 + (i / count) * Math.PI * 2;
      this.drones[i] = { x: this.cursor.x + Math.cos(a) * 70, y: this.cursor.y + Math.sin(a) * 70 };
      this.droneTimers[i] = (this.droneTimers[i] ?? this.rng()) + dt * engine.statNumber('drone.rate');
      if (this.droneTimers[i] < 1 || this.nodes.length === 0) continue;
      this.droneTimers[i] -= 1;
      const target = this.nodes[Math.floor(this.rng() * this.nodes.length)];
      const d = this.drones[i];
      this.events.push({ type: 'shot', fromX: d.x, fromY: d.y, toX: target.x, toY: target.y });
      this.damage(engine, target, engine.statNumber('cursor.damage') * engine.statNumber('drone.damage'), false);
    }
  }

  private damage(engine: Engine, n: ArenaNode, amount: number, crit: boolean, depth = 0): void {
    if (n.hp <= 0) return;
    n.hp -= amount;
    this.events.push({ type: 'hit', node: n, damage: amount, crit });
    if (n.hp > 0) return;
    this.nodes = this.nodes.filter((x) => x !== n);
    const k = KIND[n.kind];
    const bits = engine.gain('bits', engine.stat('node.value').mul(k.value), 'arena').toNumber();
    let cores = 0;
    if (n.kind === 'gold') cores = engine.gain('cores', 1, 'arena').toNumber();
    if (n.kind === 'boss') {
      cores = engine.gain('cores', engine.stat('boss.reward').mul(3), 'arena').toNumber();
      engine.state.flags.bossKilled = true;
    }
    engine.state.flags.kills = Number(engine.state.flags.kills ?? 0) + 1;
    this.events.push({ type: 'kill', node: n, bits, cores });
    // Raio em corrente para o nó mais próximo.
    if (depth < 4 && this.rng() < engine.statNumber('chain.chance')) {
      let best: ArenaNode | null = null;
      let bestD = 200 * 200;
      for (const o of this.nodes) {
        const d = (o.x - n.x) ** 2 + (o.y - n.y) ** 2;
        if (d < bestD) (bestD = d), (best = o);
      }
      if (best) {
        this.events.push({ type: 'chain', fromX: n.x, fromY: n.y, toX: best.x, toY: best.y });
        this.damage(engine, best, engine.statNumber('cursor.damage') * engine.statNumber('chain.damage'), false, depth + 1);
      }
    }
  }

  /** A cena chama isto a cada frame para desenhar e limpar os eventos. */
  drainEvents(): ArenaEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
