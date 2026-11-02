import type { Decimal, NumLike } from './num';

/**
 * Tudo o que um jogo declara mora nestes tipos. Um jogo novo é, na maior
 * parte, um objeto GameDefinition com recursos, upgrades e conquistas.
 */

export interface GameState {
  /** Quantidade atual de cada recurso. */
  resources: Record<string, Decimal>;
  /** Total ganho desde o último reset (prestígio zera). */
  earned: Record<string, Decimal>;
  /** Total ganho em toda a vida do save (nunca zera). */
  lifetime: Record<string, Decimal>;
  generators: Record<string, number>;
  upgrades: Record<string, number>;
  achievements: Record<string, true>;
  unlocks: Record<string, true>;
  /** Valores livres que o jogo quiser guardar. */
  flags: Record<string, unknown>;
  /** Estado de cada módulo, indexado pelo id do módulo. */
  modules: Record<string, any>;
  time: { played: number; sinceReset: number };
}

/** Um custo: base × crescimento^nível. Sem crescimento, o custo é fixo. */
export interface CostDef {
  resource: string;
  base: NumLike;
  growth?: NumLike;
}

/**
 * Condições declarativas usadas em desbloqueios, requisitos de upgrades e
 * conquistas. Para casos especiais, uma função também é aceita.
 */
export type Condition =
  | { resource: string; gte: NumLike }
  | { earned: string; gte: NumLike }
  | { lifetime: string; gte: NumLike }
  | { upgrade: string; level?: number }
  | { generator: string; owned: number }
  | { achievement: string }
  | { unlock: string }
  | { flag: string; equals?: unknown }
  | { stat: string; gte: NumLike }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | ((state: GameState) => boolean);

/**
 * Como um efeito altera um atributo. O valor final de um atributo é
 * (base + Σ add) × Π mult, elevado a Π pow.
 */
export type ModOp = 'add' | 'mult' | 'pow';

/**
 * Efeito de um upgrade ou conquista. Com valor numérico, o efeito escala
 * com o nível: add soma valor × nível; mult e pow usam valor^nível.
 * Com uma função, o jogo calcula o valor que quiser.
 */
export interface EffectDef {
  stat: string;
  op: ModOp;
  value: NumLike | ((level: number, state: GameState) => NumLike);
}

export interface ResourceDef {
  id: string;
  name: string;
  start?: NumLike;
  /** Cor usada pela interface (texto, ícones, partículas). */
  color?: number;
}

export interface GeneratorDef {
  id: string;
  name: string;
  produces: string;
  /** Produção por segundo de cada unidade, antes de modificadores. */
  baseProduction: NumLike;
  cost: CostDef | CostDef[];
  unlockWhen?: Condition;
  description?: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string | ((level: number, state: GameState) => string);
  cost: CostDef | CostDef[];
  /** Padrão 1. Use Infinity para upgrades sem limite. */
  maxLevel?: number;
  /** Árvore a que o nó pertence; permite várias árvores (ex.: uma de prestígio). */
  tree?: string;
  /** Posição do nó na árvore, em unidades de grade. */
  pos?: { x: number; y: number };
  /**
   * Nós pais. O nó aparece quando algum pai foi comprado e pode ser
   * comprado quando algum pai foi comprado. Sem pais, é uma raiz.
   */
  parents?: string[];
  /** Requisito extra além dos pais. */
  requires?: Condition;
  effects: EffectDef[];
  icon?: string;
  tags?: string[];
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  when: Condition;
  effects?: EffectDef[];
  hidden?: boolean;
}

export interface UnlockDef {
  id: string;
  when: Condition;
}

export type Migration = (raw: any) => any;

export interface GameDefinition {
  id: string;
  /** Versão do formato do save. Suba ao mudar a estrutura e adicione uma migração. */
  version: number;
  resources: ResourceDef[];
  generators?: GeneratorDef[];
  upgrades?: UpgradeDef[];
  achievements?: AchievementDef[];
  unlocks?: UnlockDef[];
  /** Valores base de atributos que o jogo usa (dano, duração da run...). */
  stats?: Record<string, NumLike>;
  /** migrations[i] converte um save da versão i para i + 1. */
  migrations?: Migration[];
  offline?: { maxSeconds?: number; efficiency?: number };
}

export type UpgradeStatus = 'hidden' | 'locked' | 'available' | 'affordable' | 'maxed';
