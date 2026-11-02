import { Decimal } from './num';
import type { Engine, OfflineReport } from './engine';
import type { GameState } from './types';

/** Onde o save é guardado. No navegador, localStorage; na Steam, um arquivo. */
export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export const localStorageAdapter: StorageAdapter = {
  read: (k) => {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  write: (k, v) => {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* armazenamento indisponível: o jogo segue sem salvar */
    }
  },
  remove: (k) => {
    try {
      globalThis.localStorage?.removeItem(k);
    } catch {
      /* idem */
    }
  },
};

export function memoryStorage(): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: (k) => data.get(k) ?? null,
    write: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

interface SaveFile {
  game: string;
  v: number;
  savedAt: number;
  state: unknown;
}

/** JSON que preserva Decimals como {"$d": "1e500"}. */
export function serialize(value: unknown): string {
  return JSON.stringify(value, function (key, v) {
    const raw = (this as Record<string, unknown>)[key];
    if (raw instanceof Decimal) return { $d: raw.toString() };
    return v;
  });
}

export function deserialize<T = unknown>(text: string): T {
  return JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.$d === 'string' && Object.keys(v).length === 1) {
      return new Decimal(v.$d);
    }
    return v;
  });
}

export interface SaveManagerOptions {
  storage?: StorageAdapter;
  key?: string;
  now?: () => number;
}

/**
 * Salva, carrega, migra versões antigas e calcula o progresso offline.
 */
export class SaveManager {
  private storage: StorageAdapter;
  private key: string;
  private now: () => number;
  /** Desligado, `save()` não grava nada (modo de teste que não deve tocar no save). */
  enabled = true;

  constructor(private engine: Engine, opts: SaveManagerOptions = {}) {
    this.storage = opts.storage ?? localStorageAdapter;
    this.key = opts.key ?? `incremental-kit:${engine.def.id}`;
    this.now = opts.now ?? (() => Date.now());
  }

  toString(): string {
    const file: SaveFile = {
      game: this.engine.def.id,
      v: this.engine.def.version,
      savedAt: this.now(),
      state: this.engine.state,
    };
    return serialize(file);
  }

  save(): void {
    if (!this.enabled) return;
    this.storage.write(this.key, this.toString());
  }

  hasSave(): boolean {
    return this.storage.read(this.key) !== null;
  }

  /** Carrega o save (se houver) e aplica o progresso offline. */
  load(): OfflineReport | null {
    const text = this.storage.read(this.key);
    if (!text) return null;
    return this.loadFromString(text);
  }

  loadFromString(text: string): OfflineReport {
    const file = deserialize<SaveFile>(text);
    if (file.game !== this.engine.def.id) throw new Error(`Save de outro jogo: ${file.game}`);
    const state = this.migrate(file.state, file.v);
    this.engine.setState(mergeState(this.engine.freshState(), state));
    const offline = this.engine.def.offline ?? {};
    const maxSeconds = offline.maxSeconds ?? 8 * 3600;
    const elapsed = Math.min(maxSeconds, Math.max(0, (this.now() - file.savedAt) / 1000));
    const seconds = elapsed * (offline.efficiency ?? 1);
    const report = this.engine.simulate(seconds);
    this.engine.events.emit('loaded', { offlineSeconds: seconds });
    return report;
  }

  private migrate(state: any, fromVersion: number): GameState {
    const migrations = this.engine.def.migrations ?? [];
    let s = state;
    for (let v = fromVersion; v < this.engine.def.version; v++) {
      const m = migrations[v];
      if (m) s = m(s);
    }
    return s;
  }

  /** Texto para o jogador copiar como backup. */
  export(): string {
    return btoa(unescape(encodeURIComponent(this.toString())));
  }

  import(code: string): OfflineReport {
    const text = decodeURIComponent(escape(atob(code.trim())));
    const report = this.loadFromString(text);
    this.save();
    return report;
  }

  wipe(): void {
    this.storage.remove(this.key);
    this.engine.setState(this.engine.freshState());
  }
}

/**
 * Junta o save com um estado novo: recursos, geradores e módulos que
 * entraram numa atualização ganham seus valores iniciais.
 */
function mergeState(fresh: GameState, loaded: Partial<GameState>): GameState {
  const out = fresh;
  for (const key of ['resources', 'earned', 'lifetime', 'generators', 'upgrades', 'achievements', 'unlocks', 'flags'] as const) {
    Object.assign(out[key], loaded[key] ?? {});
  }
  for (const [id, mod] of Object.entries(loaded.modules ?? {})) {
    out.modules[id] =
      mod && typeof mod === 'object' && !Array.isArray(mod) ? { ...(out.modules[id] ?? {}), ...mod } : mod;
  }
  Object.assign(out.time, loaded.time ?? {});
  return out;
}
