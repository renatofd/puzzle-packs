import Decimal from 'break_eternity.js';

/**
 * Números grandes. Usamos break_eternity.js (vai muito além de 1e308) e
 * centralizamos aqui para trocar de biblioteca sem mexer no resto do código.
 */
export { Decimal };
export type Num = Decimal;
export type NumLike = Decimal | number | string;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export function D(value: NumLike): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export type Notation = 'short' | 'scientific' | 'engineering';

const SHORT_SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

let defaultNotation: Notation = 'short';

/** Notação usada quando format() é chamado sem uma (o menu de opções muda isto). */
export function setDefaultNotation(n: Notation): void {
  defaultNotation = n;
}

/** Formata um número para exibição: 1.234, 12,3K, 4,56e78. */
export function format(value: NumLike, notation: Notation = defaultNotation, digits = 2): string {
  const n = D(value);
  if (n.sign < 0) return '-' + format(n.neg(), notation, digits);
  if (n.lt(1000)) {
    const v = n.toNumber();
    if (v >= 10 || Number.isInteger(v)) return Math.floor(v).toString();
    return trimFixed(v, digits);
  }
  const exp = n.log10().floor().toNumber();
  if (!Number.isFinite(exp)) return 'Infinito';
  if (notation === 'short' && exp < SHORT_SUFFIXES.length * 3) {
    const tier = Math.floor(exp / 3);
    const mantissa = n.div(Decimal.pow(10, tier * 3)).toNumber();
    return trimFixed(mantissa, digits) + SHORT_SUFFIXES[tier];
  }
  if (notation === 'engineering') {
    const e3 = Math.floor(exp / 3) * 3;
    const mantissa = n.div(Decimal.pow(10, e3)).toNumber();
    return `${trimFixed(mantissa, digits)}e${e3}`;
  }
  if (exp >= 1e6) return n.toString();
  const mantissa = n.div(Decimal.pow(10, exp)).toNumber();
  return `${trimFixed(mantissa, digits)}e${exp}`;
}

function trimFixed(v: number, digits: number): string {
  const s = v.toFixed(v >= 100 ? 0 : v >= 10 ? Math.max(0, digits - 1) : digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Formata segundos como 1h 02m, 3m 05s ou 12s. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '∞';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
