/**
 * Player names and recovery codes. The same rules run on the server
 * (supabase/migrations/…_player_names.sql and functions/player-account).
 */

export const NAME_MIN = 3;
export const NAME_MAX = 16;
const NAME_RE = /^[A-Za-z0-9_ก-๙]+$/;
const RESERVED = ['admin', 'administrator', 'system', 'support', 'moderator', 'staff', 'oretoempire', 'ore_to_empire'];

export type NameProblem = 'short' | 'long' | 'chars' | 'reserved';

/** null when the name is fine */
export function nameProblem(raw: string): NameProblem | null {
  const name = raw.trim();
  if ([...name].length < NAME_MIN) return 'short';
  if ([...name].length > NAME_MAX) return 'long';
  if (!NAME_RE.test(name)) return 'chars';
  if (RESERVED.includes(name.toLowerCase())) return 'reserved';
  return null;
}

/** "ore abcd efgh ijkl mnpq" / "ABCDEFGHIJKLMNPQ" → "ORE-ABCD-EFGH-IJKL-MNPQ"; null if it can't be a code */
export function normaliseCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ORE/, '');
  if (s.length !== 16) return null;
  return `ORE-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

/** "ORE-ABCD-••••-••••-MNPQ" */
export function maskCode(code: string): string {
  const p = code.split('-');
  return p.length === 5 ? `${p[0]}-${p[1]}-••••-••••-${p[4]}` : '••••';
}
