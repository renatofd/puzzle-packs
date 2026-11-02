import type { Engine } from '../../src/core/engine';
import { fill, setKitText } from '../../src/ui/strings';
import en from './i18n/en.json';
import es from './i18n/es.json';
import pt from './i18n/pt.json';
import ru from './i18n/ru.json';
import tr from './i18n/tr.json';

/** Localização: EN, RU, PT, ES, TR. Cada idioma é um JSON em `i18n/` com as mesmas chaves. */

export const LANGS = { en, ru, pt, es, tr } as const;
export type Lang = keyof typeof LANGS;
export const LANG_ORDER: Lang[] = ['en', 'ru', 'pt', 'es', 'tr'];
type Dict = typeof pt;
export type TextKey = Exclude<keyof Dict, 'kit'>;

const STORAGE_KEY = 'puzzle-packs:lang';
let current: Lang = 'en';

export function lang(): Lang {
  return current;
}

/** Idioma salvo, ou o do navegador, ou inglês. */
export function detectLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved && saved in LANGS) return saved as Lang;
  } catch {
    /* sem localStorage */
  }
  const nav = (globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase();
  return (nav in LANGS ? nav : 'en') as Lang;
}

export function saveLang(l: Lang): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, l);
  } catch {
    /* sem localStorage */
  }
}

export function setLang(l: Lang): void {
  current = l;
  setKitText((LANGS[l] as Dict).kit);
}

export function t(key: TextKey | string, ...args: Array<string | number>): string {
  const dict = LANGS[current] as unknown as Record<string, string>;
  const text = dict[key] ?? (pt as unknown as Record<string, string>)[key] ?? key;
  return args.length ? fill(text, ...args) : text;
}

/** Põe nomes e descrições do idioma atual na definição do jogo (upgrades, conquistas, recursos). */
export function localizeContent(engine: Engine): void {
  for (const u of engine.def.upgrades ?? []) {
    u.name = t(`up.${u.id}`);
    u.description = t(`up.${u.id}.desc`);
  }
  for (const a of engine.def.achievements ?? []) {
    a.name = t(`ach.${a.id}`);
    a.description = t(`ach.${a.id}.desc`);
  }
  for (const r of engine.def.resources) r.name = t(r.id);
}
