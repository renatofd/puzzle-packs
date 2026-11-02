import { setDefaultNotation, type Notation } from '../core/num';

/** Preferências do jogador, separadas do save do jogo (sobrevivem a "Apagar save"). */
export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** Intensidade de partículas e efeitos, de 0 a 1. */
  effects: number;
  screenShake: boolean;
  notation: Notation;
}

const DEFAULTS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.7,
  musicVolume: 0.4,
  effects: 1,
  screenShake: true,
  notation: 'short',
};

const KEY = 'incremental-kit:settings';
type Listener = (s: Settings) => void;

class SettingsStore {
  readonly values: Settings = { ...DEFAULTS };
  private listeners: Listener[] = [];

  constructor() {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch {
      /* sem armazenamento: usa os padrões */
    }
    setDefaultNotation(this.values.notation);
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.values[key] = value;
    if (key === 'notation') setDefaultNotation(value as Notation);
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      /* idem */
    }
    for (const l of this.listeners) l(this.values);
  }

  onChange(l: Listener): () => void {
    this.listeners.push(l);
    return () => (this.listeners = this.listeners.filter((x) => x !== l));
  }

  reset(): void {
    for (const k of Object.keys(DEFAULTS) as Array<keyof Settings>) this.set(k, DEFAULTS[k] as never);
  }
}

export const settings = new SettingsStore();
