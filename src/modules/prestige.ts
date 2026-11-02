import { D, Decimal, ZERO } from '../core/num';
import type { Engine, GameModule } from '../core/engine';
import type { Condition } from '../core/types';

export interface PrestigeLayerDef {
  id: string;
  /** Recurso permanente ganho no reset. Deve existir em GameDefinition.resources. */
  currency: string;
  /** Recurso cujo total ganho desde o último reset gera a moeda. */
  basedOn: string;
  /** Ganho = floor((ganho / threshold) ^ exponent). Padrão: raiz quadrada. */
  threshold: number;
  exponent?: number;
  /** Fórmula própria, se a padrão não servir. */
  formula?: (earned: Decimal, engine: Engine) => Decimal;
  unlockWhen?: Condition;
  /** Recursos preservados além da própria moeda e das moedas das camadas acima. */
  keepResources?: string[];
  /** Árvores preservadas. A árvore com o id da camada sempre é preservada. */
  keepTrees?: string[];
  keepGenerators?: boolean;
}

interface PrestigeState {
  counts: Record<string, number>;
}

/**
 * Prestígio em camadas. Cada camada zera o progresso abaixo dela em troca
 * de uma moeda permanente, que normalmente compra nós de uma árvore própria.
 * Camadas são declaradas da mais baixa para a mais alta.
 */
export class PrestigeModule implements GameModule {
  readonly id = 'prestige';

  constructor(readonly layers: PrestigeLayerDef[]) {}

  defaultState(): PrestigeState {
    return { counts: Object.fromEntries(this.layers.map((l) => [l.id, 0])) };
  }

  private layer(id: string): PrestigeLayerDef {
    const l = this.layers.find((x) => x.id === id);
    if (!l) throw new Error(`Camada de prestígio desconhecida: ${id}`);
    return l;
  }

  count(engine: Engine, layerId: string): number {
    return engine.getModuleState<PrestigeState>(this.id).counts[layerId] ?? 0;
  }

  isUnlocked(engine: Engine, layerId: string): boolean {
    const l = this.layer(layerId);
    return this.count(engine, layerId) > 0 || engine.check(l.unlockWhen);
  }

  /** Quanto da moeda o jogador ganharia resetando agora. */
  gain(engine: Engine, layerId: string): Decimal {
    const l = this.layer(layerId);
    const earned = engine.state.earned[l.basedOn] ?? ZERO;
    const raw = l.formula
      ? l.formula(earned, engine)
      : earned.div(l.threshold).pow(l.exponent ?? 0.5).floor();
    return D(raw).mul(engine.stat(`${l.currency}.gain`, 1)).floor().max(0);
  }

  /** Quanto falta de `basedOn` para ganhar mais 1 da moeda (só para a fórmula padrão). */
  nextAt(engine: Engine, layerId: string): Decimal | null {
    const l = this.layer(layerId);
    if (l.formula) return null;
    const next = this.gain(engine, layerId).add(1).div(engine.stat(`${l.currency}.gain`, 1));
    return next.pow(1 / (l.exponent ?? 0.5)).mul(l.threshold);
  }

  canPrestige(engine: Engine, layerId: string): boolean {
    return this.isUnlocked(engine, layerId) && this.gain(engine, layerId).gte(1);
  }

  prestige(engine: Engine, layerId: string): Decimal {
    if (!this.canPrestige(engine, layerId)) return ZERO;
    const l = this.layer(layerId);
    const amount = this.gain(engine, layerId);
    const idx = this.layers.indexOf(l);
    const higher = this.layers.slice(idx);
    engine.reset({
      layer: l.id,
      keepResources: [...higher.map((h) => h.currency), ...(l.keepResources ?? [])],
      keepTrees: [...higher.map((h) => h.id), ...(l.keepTrees ?? [])],
      keepGenerators: l.keepGenerators,
    });
    engine.add(l.currency, amount, `prestige:${l.id}`);
    const st = engine.getModuleState<PrestigeState>(this.id);
    st.counts[l.id] = (st.counts[l.id] ?? 0) + 1;
    return amount;
  }
}
