import type { AchievementDef, Condition, GameDefinition, GameState, UpgradeDef } from '../../src/core/types';
import packsJson from './data/packs.json';
import rarityJson from './data/rarity.json';
import seriesJson from './data/series.json';
import upgradesJson from './data/upgrades.json';

/**
 * Conteúdo do Puzzle Packs. Os números ficam nos JSON de `data/` (séries,
 * raridades, pacotes e upgrades); este arquivo só os transforma no formato
 * do motor. Nomes e descrições vêm da localização (`i18n/`).
 */

export type Rarity = 'common' | 'uncommon' | 'rare';
export type PackId = 'basic' | 'series' | 'premium';

export interface SeriesDef {
  id: string;
  grid: number;
  rare: number[];
  coinMult: number;
  /** Pacotes seguidos sem novidade até o pity dar uma rara (quando só faltam raras). */
  rarePity: number;
  asset: string;
  palette: number[];
}

export interface PackDef {
  id: PackId;
  cards: number;
  cost: number;
  rareMult: number;
  /** Fração das cartas que sai da série atual (o resto vem de séries já liberadas). */
  currentShare: number;
  /** Peso extra das peças que faltam na série atual (suaviza o fim da coleção). */
  missingBoost: number;
  color: number;
}

export interface RarityDef {
  weight: number;
  dupeValue: number;
  color: number;
}

export const SERIES: SeriesDef[] = seriesJson.series;
export const PACKS: PackDef[] = packsJson.packs as PackDef[];
export const SERIES_COST_MULT: number[] = packsJson.seriesCostMult;
export const RARITIES = rarityJson.rarities as Record<Rarity, RarityDef>;
export const PITY = rarityJson.pity;

export const COLORS = {
  coins: 0xf5c249,
  rare: RARITIES.rare.color,
  uncommon: RARITIES.uncommon.color,
  common: RARITIES.common.color,
  accent: 0x6fd3ff,
};

export function pieceCount(s: SeriesDef): number {
  return s.grid * s.grid;
}

/** Peças de borda são comuns, as do centro incomuns e as listadas em `rare` são raras. */
export function pieceRarity(s: SeriesDef, piece: number): Rarity {
  if (s.rare.includes(piece)) return 'rare';
  const n = s.grid;
  const x = piece % n;
  const y = Math.floor(piece / n);
  return x === 0 || y === 0 || x === n - 1 || y === n - 1 ? 'common' : 'uncommon';
}

const upgrades: UpgradeDef[] = upgradesJson.upgrades.map((u: any) => ({
  id: u.id,
  // O nome e a descrição reais vêm da localização; estes são o fallback.
  name: u.id,
  description: u.id,
  icon: u.icon,
  pos: u.pos,
  parents: u.parents,
  maxLevel: u.maxLevel,
  requires: u.requires as Condition | undefined,
  cost: { resource: 'coins', base: u.cost.base, growth: u.cost.growth },
  effects: u.effects,
}));

/** Lê o estado salvo do módulo de coleção: todas as peças da série `i` já saíram? */
export function isSeriesComplete(state: GameState, i: number): boolean {
  const owned: number[] | undefined = state.modules.collection?.owned?.[SERIES[i].id];
  return !!owned && owned.length === pieceCount(SERIES[i]) && owned.every((c) => c > 0);
}

const seriesDone = (i: number): Condition => ({ unlock: SERIES[i].id });

const achievements: AchievementDef[] = [
  { id: 'first-pack', name: 'first-pack', description: '', when: (s) => (s.modules.collection?.packs ?? 0) >= 1 },
  { id: 'packs-100', name: 'packs-100', description: '', when: (s) => (s.modules.collection?.packs ?? 0) >= 100 },
  { id: 'first-rare', name: 'first-rare', description: '', when: { flag: 'rareFound' }, effects: [{ stat: 'dupe.value', op: 'mult', value: 1.1 }] },
  { id: 'dupes-200', name: 'dupes-200', description: '', when: (s) => (s.modules.collection?.dupes ?? 0) >= 200, effects: [{ stat: 'dupe.value', op: 'mult', value: 1.1 }] },
  ...SERIES.map((_, i): AchievementDef => ({ id: `series-${i + 1}`, name: `series-${i + 1}`, description: '', when: seriesDone(i) })),
];

/**
 * v1 → v2: as séries 4 a 6 entraram. Quem tinha fechado a coleção de 3
 * séries perde a vitória (e o aviso de fim já visto) até completar a última.
 * As peças das séries novas nascem zeradas no `CollectionModule.state`.
 */
function migrateV1(raw: any): any {
  const last = SERIES[SERIES.length - 1].id;
  if (raw?.unlocks && !raw.unlocks[last]) {
    delete raw.unlocks.victory;
    if (raw.flags) delete raw.flags.endSeen;
  }
  return raw;
}

export const definition: GameDefinition = {
  id: 'puzzle-packs',
  version: 2,
  migrations: [(raw) => raw, migrateV1],
  resources: [{ id: 'coins', name: 'coins', color: COLORS.coins, start: 0 }],
  stats: { ...upgradesJson.stats, 'pity.packs': PITY.packs },
  upgrades,
  achievements,
  // s1..s6: série completa (libera a próxima e, na primeira, o auto-abridor).
  unlocks: [
    ...SERIES.map((s, i) => ({ id: s.id, when: (st: GameState) => isSeriesComplete(st, i) })),
    { id: 'victory', when: seriesDone(SERIES.length - 1) },
  ],
  offline: { maxSeconds: 3 * 3600, efficiency: 1 },
};
