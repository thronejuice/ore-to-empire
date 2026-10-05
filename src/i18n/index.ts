import { en, type Dict } from './en';
import { th } from './th';

export type Lang = 'th' | 'en';
export type TKey = keyof Dict;

const dicts: Record<Lang, Dict> = { th, en };

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const dict = dicts[lang] as Record<string, string>;
  let s = dict[key] ?? (en as Record<string, string>)[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.floor(abs).toLocaleString('en-US')}`;
}

export function fmtNum(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

/** compact countdown: 45s · 3:07 · 1:02:09 */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  if (m) return `${m}:${String(r).padStart(2, '0')}`;
  return `${r}s`;
}

export function fmtDuration(lang: Lang, seconds: number): string {
  if (seconds < 60) return translate(lang, 'ui.seconds', { n: Math.round(seconds) });
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (h) parts.push(translate(lang, 'ui.hours', { n: h }));
  if (m || !h) parts.push(translate(lang, 'ui.minutes', { n: m }));
  return parts.join(' ');
}
