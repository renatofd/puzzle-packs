import type { Engine, GameModule, TickContext } from '../../src/core/engine';
import { D } from '../../src/core/num';
import {
  PACKS,
  RARITIES,
  SERIES,
  SERIES_COST_MULT,
  isSeriesComplete,
  pieceCount,
  pieceRarity,
  type PackDef,
  type PackId,
  type Rarity,
} from './content';
import { makeRng } from './rng';

/**
 * Economia do Puzzle Packs, sem nada de tela: abrir pacotes, sortear
 * peças, pity, repetidas virando moeda, loja e auto-abridor. Roda igual
 * no navegador, nos testes e no simulador.
 */

export interface CardResult {
  series: number;
  piece: number;
  rarity: Rarity;
  isNew: boolean;
  /** Moedas ganhas se a carta é repetida (0 se é nova). */
  coins: number;
  /** Veio do pity (peça nova garantida). */
  pity: boolean;
}

export interface PackResult {
  pack: PackId;
  source: 'manual' | 'auto';
  cards: CardResult[];
  /** Séries completadas por este pacote (índices). */
  completed: number[];
  coins: number;
}

export interface CollectionState {
  /** Quantas cópias de cada peça, por série. */
  owned: Record<string, number[]>;
  packs: number;
  autoPacks: number;
  cards: number;
  dupes: number;
  newPieces: number;
  packsByType: Record<string, number>;
  /** Pacotes seguidos sem peça nova (contador do pity). */
  dry: number;
  autoTimer: number;
  /** Pacotes comprados que ainda não foram abertos. */
  queue: PackId[];
  /** Tempo de jogo (s) em que cada série foi completada. */
  completedAt: Record<string, number>;
  coinsFromDupes: number;
  /** Segundos restantes do bônus de 2× moedas (rewarded). */
  doubleLeft: number;
  /** Segundos até o próximo rewarded poder ser oferecido. */
  rewardCooldown: number;
}

export type RewardKind = 'pack' | 'double';

/** Duração do 2× moedas e intervalo mínimo entre rewardeds, em segundos. */
export const REWARD = { doubleSeconds: 120, cooldown: 150 };

export class CollectionModule implements GameModule {
  readonly id = 'collection';
  private engine!: Engine;
  private rng: () => number;
  /** Pacotes abertos pelo auto-abridor com o jogo aberto, para a tela animar. */
  private pending: PackResult[] = [];
  /** Pacotes abertos offline desde o último `takeOfflineCount`. */
  private offlinePacks = 0;

  constructor(seed?: number) {
    this.rng = makeRng(seed);
  }

  defaultState(): CollectionState {
    const owned: Record<string, number[]> = {};
    for (const s of SERIES) owned[s.id] = new Array(pieceCount(s)).fill(0);
    return {
      owned,
      packs: 0,
      autoPacks: 0,
      cards: 0,
      dupes: 0,
      newPieces: 0,
      packsByType: {},
      dry: 0,
      autoTimer: 0,
      queue: [],
      completedAt: {},
      coinsFromDupes: 0,
      doubleLeft: 0,
      rewardCooldown: 60,
    };
  }

  init(engine: Engine): void {
    this.engine = engine;
  }

  get state(): CollectionState {
    const st = this.engine.getModuleState<CollectionState>(this.id);
    // Saves antigos ou séries novas: garante um vetor do tamanho certo.
    for (const s of SERIES) {
      const arr = st.owned[s.id];
      if (!arr || arr.length !== pieceCount(s)) st.owned[s.id] = Array.from({ length: pieceCount(s) }, (_, i) => arr?.[i] ?? 0);
    }
    return st;
  }

  // ------------------------------------------------------------- consultas

  isComplete(i: number): boolean {
    return isSeriesComplete(this.engine.state, i);
  }

  isSeriesUnlocked(i: number): boolean {
    return i === 0 || this.engine.isUnlocked(SERIES[i - 1].id);
  }

  unlockedSeries(): number[] {
    return SERIES.map((_, i) => i).filter((i) => this.isSeriesUnlocked(i));
  }

  /** A série que o jogador está montando: a primeira liberada e incompleta (ou a última). */
  currentSeries(): number {
    for (let i = 0; i < SERIES.length; i++) {
      if (this.isSeriesUnlocked(i) && !this.isComplete(i)) return i;
    }
    return SERIES.length - 1;
  }

  allComplete(): boolean {
    return SERIES.every((_, i) => this.isComplete(i));
  }

  owned(i: number): number[] {
    return this.state.owned[SERIES[i].id];
  }

  /** Fração de peças da série que já saíram (0 a 1). */
  progress(i: number): number {
    const o = this.owned(i);
    return o.filter((c) => c > 0).length / o.length;
  }

  missing(i: number): number[] {
    return this.owned(i).flatMap((c, p) => (c > 0 ? [] : [p]));
  }

  autoUnlocked(): boolean {
    return this.engine.isUnlocked(SERIES[0].id);
  }

  autoInterval(): number {
    return Math.max(0.5, this.engine.statNumber('auto.interval'));
  }

  /** Tempo de uma abertura manual (rasgar + virar as cartas), em segundos. */
  openTime(): number {
    return Math.max(0.6, this.engine.statNumber('open.time'));
  }

  pack(id: PackId): PackDef {
    const p = PACKS.find((x) => x.id === id);
    if (!p) throw new Error(`Pacote desconhecido: ${id}`);
    return p;
  }

  cardsIn(id: PackId): number {
    return this.pack(id).cards + Math.floor(this.engine.statNumber('pack.cards'));
  }

  packCost(id: PackId): number {
    const base = this.pack(id).cost;
    if (base <= 0) return 0;
    const mult = SERIES_COST_MULT[this.currentSeries()] ?? 1;
    return Math.ceil(base * mult * this.engine.statNumber('pack.cost'));
  }

  canBuy(id: PackId): boolean {
    return this.engine.amount('coins').gte(this.packCost(id));
  }

  pityThreshold(): number {
    const cur = this.currentSeries();
    const missing = this.missing(cur);
    const onlyRares = missing.length > 0 && missing.every((p) => pieceRarity(SERIES[cur], p) === 'rare');
    return onlyRares ? SERIES[cur].rarePity : Math.max(1, Math.round(this.engine.statNumber('pity.packs')));
  }

  /** O próximo pacote a abrir: o primeiro comprado da fila, ou o básico grátis. */
  nextPack(): PackId {
    return this.state.queue[0] ?? 'basic';
  }

  // --------------------------------------------------------------- ações

  /** Compra um pacote e põe na fila. */
  buyPack(id: PackId): boolean {
    const cost = this.packCost(id);
    if (!this.engine.spend([{ resource: 'coins', amount: D(cost) }])) return false;
    this.state.queue.push(id);
    this.engine.events.emit('packBought', { id, cost });
    this.engine.checkProgress();
    return true;
  }

  /** Abre o próximo pacote da fila (ou um básico). */
  openNext(source: 'manual' | 'auto' = 'manual'): PackResult {
    const id = this.state.queue.shift() ?? 'basic';
    return this.openPack(id, source);
  }

  /** Abre um pacote já pago: sorteia as cartas e aplica tudo no estado. */
  openPack(id: PackId, source: 'manual' | 'auto' = 'manual'): PackResult {
    const st = this.state;
    const pack = this.pack(id);
    const cur = this.currentSeries();
    // Séries já completas: as cartas que não saem da atual vêm delas e viram moeda.
    const others = this.unlockedSeries().filter((i) => i !== cur && this.isComplete(i));
    const share = others.length ? pack.currentShare : 1;
    const rareMult = pack.rareMult * this.engine.statNumber('rare.mult');
    const n = this.cardsIn(id);
    const wasComplete = SERIES.map((_, i) => this.isComplete(i));
    const cards: CardResult[] = [];
    // O pity só vale para pacotes focados na série atual.
    const pityPack = share >= 0.5 && !this.isComplete(cur);
    const forcePity = pityPack && st.dry + 1 >= this.pityThreshold();

    for (let k = 0; k < n; k++) {
      let series = cur;
      let piece: number;
      let pity = false;
      if (k === 0 && forcePity) {
        piece = this.pick(cur, rareMult, 1, this.missing(cur));
        pity = true;
      } else {
        if (others.length && this.rng() >= share) series = others[Math.floor(this.rng() * others.length)];
        piece = this.pick(series, rareMult, series === cur ? pack.missingBoost : 1);
      }
      cards.push(this.apply(series, piece, pity));
    }

    const gotNew = cards.some((c) => c.isNew);
    if (gotNew) st.dry = 0;
    else if (pityPack) st.dry++;
    st.packs++;
    if (source === 'auto') st.autoPacks++;
    st.packsByType[id] = (st.packsByType[id] ?? 0) + 1;
    const completed: number[] = [];
    SERIES.forEach((s, i) => {
      if (!wasComplete[i] && this.isComplete(i)) {
        completed.push(i);
        st.completedAt[s.id] = this.engine.state.time.played;
      }
    });
    const result: PackResult = { pack: id, source, cards, completed, coins: cards.reduce((a, c) => a + c.coins, 0) };
    this.engine.events.emit('packOpened', result);
    this.engine.checkProgress();
    return result;
  }

  /** Sorteia uma peça da série, com peso por raridade (e `missingBoost` nas que faltam). `only` limita às peças listadas. */
  private pick(series: number, rareMult: number, missingBoost = 1, only?: number[]): number {
    const s = SERIES[series];
    const pool = only && only.length ? only : Array.from({ length: pieceCount(s) }, (_, i) => i);
    const weights = pool.map((p) => {
      const r = pieceRarity(s, p);
      const boost = missingBoost !== 1 && this.owned(series)[p] === 0 ? missingBoost : 1;
      return RARITIES[r].weight * (r === 'rare' ? rareMult : 1) * boost;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let x = this.rng() * total;
    for (let i = 0; i < pool.length; i++) {
      x -= weights[i];
      if (x < 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  private apply(series: number, piece: number, pity: boolean): CardResult {
    const st = this.state;
    const s = SERIES[series];
    const rarity = pieceRarity(s, piece);
    const owned = st.owned[s.id];
    const isNew = owned[piece] === 0;
    owned[piece]++;
    st.cards++;
    let coins = 0;
    if (isNew) {
      st.newPieces++;
      if (rarity === 'rare') this.engine.state.flags.rareFound = true;
    } else {
      st.dupes++;
      const raw = RARITIES[rarity].dupeValue * s.coinMult * this.engine.statNumber('dupe.value');
      coins = this.engine.gain('coins', raw, 'dupe').toNumber();
      st.coinsFromDupes += coins;
    }
    return { series, piece, rarity, isNew, coins, pity };
  }

  // ------------------------------------------------------------ automação

  // ------------------------------------------------------------ rewarded

  canReward(): boolean {
    return this.state.rewardCooldown <= 0 && this.state.packs >= 3;
  }

  /** Aplica a recompensa de um anúncio assistido até o fim. */
  grantReward(kind: RewardKind): void {
    const st = this.state;
    if (kind === 'pack') st.queue.unshift('series');
    else {
      st.doubleLeft = REWARD.doubleSeconds;
      this.engine.invalidate();
    }
    st.rewardCooldown = REWARD.cooldown;
    this.engine.events.emit('rewardGranted', { kind });
  }

  modifiers() {
    if (!(this.state.doubleLeft > 0)) return [];
    return [{ stat: 'coins.gain', op: 'mult' as const, value: () => D(2), source: 'reward:double' }];
  }

  tick(_engine: Engine, dt: number, ctx: TickContext): void {
    const st = this.state;
    if (st.doubleLeft > 0) {
      st.doubleLeft = Math.max(0, st.doubleLeft - dt);
      if (st.doubleLeft === 0) this.engine.invalidate();
    }
    if (st.rewardCooldown > 0) st.rewardCooldown = Math.max(0, st.rewardCooldown - dt);
    if (!this.autoUnlocked()) return;
    st.autoTimer += dt;
    const interval = this.autoInterval();
    while (st.autoTimer >= interval) {
      st.autoTimer -= interval;
      const useSeries = this.engine.statNumber('auto.series') > 0 && this.canBuy('series');
      if (useSeries) this.engine.spend([{ resource: 'coins', amount: D(this.packCost('series')) }]);
      const r = this.openPack(useSeries ? 'series' : 'basic', 'auto');
      if (ctx.offline) this.offlinePacks++;
      else {
        this.pending.push(r);
        if (this.pending.length > 20) this.pending.shift();
      }
    }
  }

  /** Pacotes abertos pelo auto-abridor desde a última chamada (a tela anima). */
  drainAuto(): PackResult[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  takeOfflineCount(): number {
    const n = this.offlinePacks;
    this.offlinePacks = 0;
    return n;
  }
}
