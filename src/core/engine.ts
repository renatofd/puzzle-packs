import { D, Decimal, ZERO, type NumLike } from './num';
import { EventBus } from './events';
import { ModifierStack, type ModifierEntry } from './modifiers';
import type {
  Condition,
  CostDef,
  EffectDef,
  GameDefinition,
  GameState,
  GeneratorDef,
  UpgradeDef,
  UpgradeStatus,
} from './types';

export interface EngineEvents extends Record<string, unknown> {
  tick: { dt: number; offline: boolean };
  gain: { resource: string; amount: Decimal; source?: string };
  upgradeBought: { id: string; level: number };
  upgradesRefunded: { tree: string };
  generatorBought: { id: string; amount: number; owned: number };
  achievement: { id: string };
  unlock: { id: string };
  reset: { layer: string };
  loaded: { offlineSeconds: number };
}

export interface TickContext {
  offline: boolean;
}

/** Um módulo opcional pluga comportamento no motor (prestígio, runs, automação...). */
export interface GameModule {
  id: string;
  defaultState?(): unknown;
  init?(engine: Engine): void;
  tick?(engine: Engine, dt: number, ctx: TickContext): void;
  modifiers?(engine: Engine): ModifierEntry[];
  onReset?(engine: Engine, layer: string): void;
}

export interface ResetOptions {
  layer: string;
  /** Recursos que não voltam ao valor inicial. */
  keepResources?: string[];
  /** Árvores de upgrades preservadas (ex.: a árvore de prestígio). */
  keepTrees?: string[];
  keepGenerators?: boolean;
}

export interface OfflineReport {
  seconds: number;
  gains: Record<string, Decimal>;
}

export interface EngineOptions {
  modules?: GameModule[];
}

/**
 * O motor guarda o estado, calcula atributos, produz recursos a cada tick e
 * responde a compras. Não conhece tela: a interface lê o estado e escuta
 * os eventos.
 */
export class Engine {
  readonly def: GameDefinition;
  readonly events = new EventBus<EngineEvents>();
  readonly modules: GameModule[];
  state: GameState;

  private upgradesById = new Map<string, UpgradeDef>();
  private generatorsById = new Map<string, GeneratorDef>();
  private children = new Map<string, string[]>();
  private modifiers = new ModifierStack();
  private externalSources: Array<() => ModifierEntry[]> = [];

  constructor(def: GameDefinition, options: EngineOptions = {}) {
    this.def = def;
    this.modules = options.modules ?? [];
    for (const u of def.upgrades ?? []) {
      if (this.upgradesById.has(u.id)) throw new Error(`Upgrade duplicado: ${u.id}`);
      this.upgradesById.set(u.id, u);
      for (const p of u.parents ?? []) {
        if (!this.children.has(p)) this.children.set(p, []);
        this.children.get(p)!.push(u.id);
      }
    }
    for (const u of def.upgrades ?? []) {
      for (const p of u.parents ?? []) {
        if (!this.upgradesById.has(p)) throw new Error(`Upgrade ${u.id} aponta para pai inexistente: ${p}`);
      }
    }
    for (const g of def.generators ?? []) this.generatorsById.set(g.id, g);
    this.state = this.freshState();
    this.modifiers.setCollector(() => this.collectModifiers());
    for (const m of this.modules) m.init?.(this);
  }

  // ---------------------------------------------------------------- estado

  freshState(): GameState {
    const s: GameState = {
      resources: {},
      earned: {},
      lifetime: {},
      generators: {},
      upgrades: {},
      achievements: {},
      unlocks: {},
      flags: {},
      modules: {},
      time: { played: 0, sinceReset: 0 },
    };
    for (const r of this.def.resources) {
      s.resources[r.id] = D(r.start ?? 0);
      s.earned[r.id] = ZERO;
      s.lifetime[r.id] = ZERO;
    }
    for (const g of this.def.generators ?? []) s.generators[g.id] = 0;
    for (const m of this.modules) if (m.defaultState) s.modules[m.id] = m.defaultState();
    return s;
  }

  /** Troca o estado inteiro (usado ao carregar um save). */
  setState(state: GameState): void {
    this.state = state;
    this.invalidate();
  }

  /** Avisa que algo mudou e os atributos precisam ser recalculados. */
  invalidate(): void {
    this.modifiers.invalidate();
  }

  getModuleState<T>(id: string): T {
    return this.state.modules[id] as T;
  }

  // ------------------------------------------------------------- atributos

  /** Adiciona uma fonte de modificadores externa ao jogo (ex.: buffs temporários). */
  addModifierSource(source: () => ModifierEntry[]): () => void {
    this.externalSources.push(source);
    this.invalidate();
    return () => {
      this.externalSources = this.externalSources.filter((s) => s !== source);
      this.invalidate();
    };
  }

  /** Valor final de um atributo: base do jogo (ou a passada) com todos os modificadores. */
  stat(key: string, base?: NumLike): Decimal {
    const b = base !== undefined ? D(base) : D(this.def.stats?.[key] ?? 0);
    return this.modifiers.compute(key, b, this.state);
  }

  /** Atributo como número JS, para física, tempos e posições. */
  statNumber(key: string, base?: NumLike): number {
    return this.stat(key, base).toNumber();
  }

  private collectModifiers(): ModifierEntry[] {
    const out: ModifierEntry[] = [];
    for (const [id, level] of Object.entries(this.state.upgrades)) {
      if (level <= 0) continue;
      const u = this.upgradesById.get(id);
      if (u) for (const e of u.effects) out.push(effectToEntry(e, level, `upgrade:${id}`));
    }
    for (const a of this.def.achievements ?? []) {
      if (this.state.achievements[a.id] && a.effects) {
        for (const e of a.effects) out.push(effectToEntry(e, 1, `achievement:${a.id}`));
      }
    }
    for (const m of this.modules) if (m.modifiers) out.push(...m.modifiers(this));
    for (const s of this.externalSources) out.push(...s());
    return out;
  }

  // -------------------------------------------------------------- recursos

  amount(resource: string): Decimal {
    return this.state.resources[resource] ?? ZERO;
  }

  /** Soma um valor bruto ao recurso, sem multiplicadores. */
  add(resource: string, amount: NumLike, source?: string): void {
    const a = D(amount);
    if (a.lte(0)) return;
    this.state.resources[resource] = this.amount(resource).add(a);
    this.state.earned[resource] = (this.state.earned[resource] ?? ZERO).add(a);
    this.state.lifetime[resource] = (this.state.lifetime[resource] ?? ZERO).add(a);
    this.events.emit('gain', { resource, amount: a, source });
  }

  /** Ganho "de jogo": aplica o atributo `<recurso>.gain` antes de somar. Retorna o ganho final. */
  gain(resource: string, amount: NumLike, source?: string): Decimal {
    const final = D(amount).mul(this.stat(`${resource}.gain`, 1));
    this.add(resource, final, source);
    return final;
  }

  canAfford(costs: Array<{ resource: string; amount: Decimal }>): boolean {
    return costs.every((c) => this.amount(c.resource).gte(c.amount));
  }

  spend(costs: Array<{ resource: string; amount: Decimal }>): boolean {
    if (!this.canAfford(costs)) return false;
    for (const c of costs) this.state.resources[c.resource] = this.amount(c.resource).sub(c.amount);
    return true;
  }

  // ------------------------------------------------------------- condições

  check(cond: Condition | undefined): boolean {
    if (!cond) return true;
    if (typeof cond === 'function') return cond(this.state);
    const s = this.state;
    if ('all' in cond) return cond.all.every((c) => this.check(c));
    if ('any' in cond) return cond.any.some((c) => this.check(c));
    if ('not' in cond) return !this.check(cond.not);
    if ('resource' in cond) return this.amount(cond.resource).gte(cond.gte);
    if ('earned' in cond) return (s.earned[cond.earned] ?? ZERO).gte(cond.gte);
    if ('lifetime' in cond) return (s.lifetime[cond.lifetime] ?? ZERO).gte(cond.gte);
    if ('upgrade' in cond) return (s.upgrades[cond.upgrade] ?? 0) >= (cond.level ?? 1);
    if ('generator' in cond) return (s.generators[cond.generator] ?? 0) >= cond.owned;
    if ('achievement' in cond) return !!s.achievements[cond.achievement];
    if ('unlock' in cond) return !!s.unlocks[cond.unlock];
    if ('flag' in cond) return 'equals' in cond ? s.flags[cond.flag] === cond.equals : !!s.flags[cond.flag];
    if ('stat' in cond) return this.stat(cond.stat).gte(cond.gte);
    return false;
  }

  isUnlocked(id: string): boolean {
    return !!this.state.unlocks[id];
  }

  // -------------------------------------------------------------- upgrades

  upgrade(id: string): UpgradeDef {
    const u = this.upgradesById.get(id);
    if (!u) throw new Error(`Upgrade desconhecido: ${id}`);
    return u;
  }

  upgradesInTree(tree = 'main'): UpgradeDef[] {
    return (this.def.upgrades ?? []).filter((u) => (u.tree ?? 'main') === tree);
  }

  childrenOf(id: string): string[] {
    return this.children.get(id) ?? [];
  }

  upgradeLevel(id: string): number {
    return this.state.upgrades[id] ?? 0;
  }

  upgradeCost(id: string, level = this.upgradeLevel(id)): Array<{ resource: string; amount: Decimal }> {
    return costsAt(this.upgrade(id).cost, level);
  }

  upgradeStatus(id: string): UpgradeStatus {
    const u = this.upgrade(id);
    const level = this.upgradeLevel(id);
    if (level >= (u.maxLevel ?? 1)) return 'maxed';
    const parents = u.parents ?? [];
    const parentBought = parents.length === 0 || parents.some((p) => this.upgradeLevel(p) > 0);
    if (!parentBought && level === 0) return 'hidden';
    if (!this.check(u.requires)) return 'locked';
    return this.canAfford(this.upgradeCost(id)) ? 'affordable' : 'available';
  }

  buyUpgrade(id: string): boolean {
    const status = this.upgradeStatus(id);
    if (status !== 'affordable') return false;
    if (!this.spend(this.upgradeCost(id))) return false;
    const level = this.upgradeLevel(id) + 1;
    this.state.upgrades[id] = level;
    this.invalidate();
    this.events.emit('upgradeBought', { id, level });
    this.checkProgress();
    return true;
  }

  /** Total gasto em um upgrade até o nível atual. */
  upgradeSpent(id: string): Record<string, Decimal> {
    const spent: Record<string, Decimal> = {};
    const level = this.upgradeLevel(id);
    for (let l = 0; l < level; l++) {
      for (const c of this.upgradeCost(id, l)) spent[c.resource] = (spent[c.resource] ?? ZERO).add(c.amount);
    }
    return spent;
  }

  /** Respec: devolve tudo o que foi gasto na árvore e zera seus níveis. */
  refundTree(tree = 'main'): void {
    for (const u of this.upgradesInTree(tree)) {
      const spent = this.upgradeSpent(u.id);
      for (const [res, amt] of Object.entries(spent)) {
        this.state.resources[res] = this.amount(res).add(amt);
      }
      delete this.state.upgrades[u.id];
    }
    this.invalidate();
    this.events.emit('upgradesRefunded', { tree });
  }

  // ------------------------------------------------------------ geradores

  generator(id: string): GeneratorDef {
    const g = this.generatorsById.get(id);
    if (!g) throw new Error(`Gerador desconhecido: ${id}`);
    return g;
  }

  generatorsOwned(id: string): number {
    return this.state.generators[id] ?? 0;
  }

  /** Custo de comprar `amount` unidades a partir da quantidade atual (soma geométrica). */
  generatorCost(id: string, amount = 1): Array<{ resource: string; amount: Decimal }> {
    const owned = this.generatorsOwned(id);
    return asArray(this.generator(id).cost).map((c) => ({
      resource: c.resource,
      amount: bulkCost(c, owned, amount),
    }));
  }

  /** Quantas unidades cabem no orçamento atual. */
  generatorMaxAffordable(id: string): number {
    const owned = this.generatorsOwned(id);
    let best = Infinity;
    for (const c of asArray(this.generator(id).cost)) {
      best = Math.min(best, maxAffordable(c, owned, this.amount(c.resource)));
    }
    return Number.isFinite(best) ? best : 0;
  }

  isGeneratorUnlocked(id: string): boolean {
    return this.check(this.generator(id).unlockWhen);
  }

  buyGenerator(id: string, amount: number | 'max' = 1): number {
    if (!this.isGeneratorUnlocked(id)) return 0;
    const n = amount === 'max' ? this.generatorMaxAffordable(id) : amount;
    if (n <= 0) return 0;
    if (!this.spend(this.generatorCost(id, n))) return 0;
    this.state.generators[id] = this.generatorsOwned(id) + n;
    this.invalidate();
    this.events.emit('generatorBought', { id, amount: n, owned: this.state.generators[id] });
    this.checkProgress();
    return n;
  }

  /** Produção por segundo de um gerador, com modificadores `gen.<id>.prod`. */
  generatorProduction(id: string): Decimal {
    const g = this.generator(id);
    const owned = this.generatorsOwned(id);
    if (owned <= 0) return ZERO;
    return this.stat(`gen.${id}.prod`, D(g.baseProduction).mul(owned)).mul(this.stat(`${g.produces}.gain`, 1));
  }

  /** Produção total por segundo de um recurso vinda de geradores. */
  productionPerSecond(resource: string): Decimal {
    let total = ZERO;
    for (const g of this.def.generators ?? []) {
      if (g.produces === resource) total = total.add(this.generatorProduction(g.id));
    }
    return total;
  }

  // ------------------------------------------------------------------ tick

  tick(dt: number, ctx: TickContext = { offline: false }): void {
    if (dt <= 0) return;
    this.state.time.played += dt;
    this.state.time.sinceReset += dt;
    this.modifiers.invalidate();
    for (const g of this.def.generators ?? []) {
      const prod = this.generatorProduction(g.id);
      if (prod.gt(0)) this.add(g.produces, prod.mul(dt), `gen:${g.id}`);
    }
    for (const m of this.modules) m.tick?.(this, dt, ctx);
    this.checkProgress();
    this.events.emit('tick', { dt, offline: ctx.offline });
  }

  /** Avalia desbloqueios e conquistas. Ambos são permanentes depois de alcançados. */
  checkProgress(): void {
    for (const u of this.def.unlocks ?? []) {
      if (!this.state.unlocks[u.id] && this.check(u.when)) {
        this.state.unlocks[u.id] = true;
        this.events.emit('unlock', { id: u.id });
      }
    }
    for (const a of this.def.achievements ?? []) {
      if (!this.state.achievements[a.id] && this.check(a.when)) {
        this.state.achievements[a.id] = true;
        this.invalidate();
        this.events.emit('achievement', { id: a.id });
      }
    }
  }

  /**
   * Avança o tempo em blocos (progresso offline ou aceleração de testes).
   * Retorna quanto de cada recurso foi ganho.
   */
  simulate(seconds: number, maxSteps = 2000, ctx: TickContext = { offline: true }): OfflineReport {
    const before = { ...this.state.lifetime };
    if (seconds > 0) {
      const steps = Math.max(1, Math.min(maxSteps, Math.ceil(seconds)));
      const dt = seconds / steps;
      for (let i = 0; i < steps; i++) this.tick(dt, ctx);
    }
    const gains: Record<string, Decimal> = {};
    for (const [res, total] of Object.entries(this.state.lifetime)) {
      const diff = total.sub(before[res] ?? ZERO);
      if (diff.gt(0)) gains[res] = diff;
    }
    return { seconds, gains };
  }

  // ----------------------------------------------------------------- reset

  /** Reset de prestígio: volta recursos, geradores e upgrades ao início, exceto o que for preservado. */
  reset(opts: ResetOptions): void {
    const fresh = this.freshState();
    const keepRes = new Set(opts.keepResources ?? []);
    const keepTrees = new Set(opts.keepTrees ?? []);
    for (const r of this.def.resources) {
      if (!keepRes.has(r.id)) {
        this.state.resources[r.id] = fresh.resources[r.id];
        this.state.earned[r.id] = ZERO;
      }
    }
    if (!opts.keepGenerators) this.state.generators = fresh.generators;
    for (const id of Object.keys(this.state.upgrades)) {
      const u = this.upgradesById.get(id);
      if (!u || !keepTrees.has(u.tree ?? 'main')) delete this.state.upgrades[id];
    }
    this.state.time.sinceReset = 0;
    for (const m of this.modules) m.onReset?.(this, opts.layer);
    this.invalidate();
    this.events.emit('reset', { layer: opts.layer });
  }
}

// ---------------------------------------------------------------- helpers

/**
 * Há algum upgrade comprável agora numa das árvores? Serve para o selo "!"
 * nos botões que levam até a árvore.
 */
export function hasAffordable(engine: Engine, trees: string | string[] = 'main'): boolean {
  return asArray(trees).some((tree) => engine.upgradesInTree(tree).some((u) => engine.upgradeStatus(u.id) === 'affordable'));
}

export function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

export function costsAt(cost: CostDef | CostDef[], level: number): Array<{ resource: string; amount: Decimal }> {
  return asArray(cost).map((c) => ({
    resource: c.resource,
    amount: D(c.base).mul(Decimal.pow(D(c.growth ?? 1), level)),
  }));
}

/** Soma de base × g^owned + ... + base × g^(owned+n-1). */
export function bulkCost(c: CostDef, owned: number, n: number): Decimal {
  const base = D(c.base);
  const g = D(c.growth ?? 1);
  if (g.eq(1)) return base.mul(n);
  return base.mul(g.pow(owned)).mul(g.pow(n).sub(1)).div(g.sub(1));
}

/** Maior n tal que bulkCost(owned, n) <= budget. */
export function maxAffordable(c: CostDef, owned: number, budget: Decimal): number {
  const base = D(c.base);
  const g = D(c.growth ?? 1);
  if (budget.lt(base.mul(g.pow(owned)))) return 0;
  if (g.eq(1)) return budget.div(base).floor().toNumber();
  // n = floor(log_g(budget × (g − 1) / (base × g^owned) + 1))
  const n = budget.mul(g.sub(1)).div(base.mul(g.pow(owned))).add(1).log(g).floor().toNumber();
  // Corrige erro de ponto flutuante na borda.
  let k = Math.max(0, n);
  while (k > 0 && bulkCost(c, owned, k).gt(budget)) k--;
  while (bulkCost(c, owned, k + 1).lte(budget)) k++;
  return k;
}

export function effectToEntry(e: EffectDef, level: number, source: string): ModifierEntry {
  return {
    stat: e.stat,
    op: e.op,
    source,
    value: (state) => {
      if (typeof e.value === 'function') return D(e.value(level, state));
      const v = D(e.value);
      return e.op === 'add' ? v.mul(level) : v.pow(level);
    },
  };
}

