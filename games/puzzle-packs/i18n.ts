import type { Engine } from '../../src/core/engine';
import { fill, setKitText } from '../../src/ui/strings';
import de from './i18n/de.json';
import en from './i18n/en.json';
import es from './i18n/es.json';
import fr from './i18n/fr.json';
import id from './i18n/id.json';
import it from './i18n/it.json';
import ja from './i18n/ja.json';
import ko from './i18n/ko.json';
import nl from './i18n/nl.json';
import pl from './i18n/pl.json';
import pt from './i18n/pt.json';
import ru from './i18n/ru.json';
import tr from './i18n/tr.json';
import vi from './i18n/vi.json';

/**
 * Localização: 14 idiomas. Cada um é um JSON em `i18n/` com as mesmas chaves
 * (o teste de localização confere). Os 9 últimos entraram para os mercados
 * grandes da Poki que ainda faltavam.
 */

export const LANGS = { en, ru, pt, es, tr, de, fr, it, nl, pl, id, vi, ja, ko } as const;
export type Lang = keyof typeof LANGS;
export const LANG_ORDER: Lang[] = ['en', 'pt', 'es', 'ru', 'tr', 'de', 'fr', 'it', 'nl', 'pl', 'id', 'vi', 'ja', 'ko'];
type Dict = typeof pt;
export type TextKey = Exclude<keyof Dict, 'kit'>;

const STORAGE_KEY = 'puzzle-packs:lang';
let current: Lang = 'en';

export function lang(): Lang {
  return current;
}

/**
 * Idioma salvo; senão o que o portal informa (`portal`, ex. `pt-BR` do
 * CrazyGames, que pede inglês quando o dele não existe no jogo); senão o do
 * navegador; senão inglês.
 */
export function detectLang(portal?: string | null): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved && saved in LANGS) return saved as Lang;
  } catch {
    /* sem localStorage */
  }
  const code = (portal ?? globalThis.navigator?.language ?? 'en').slice(0, 2).toLowerCase();
  return (code in LANGS ? code : 'en') as Lang;
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
