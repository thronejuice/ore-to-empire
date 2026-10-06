// Device accounts: a player name + a random password kept on the device + a recovery code.
//
// POST { action: 'create', name, captcha? }
//   → { email, password, code }   new account; the client signs in with email+password
//                                  and keeps both on the device. `code` is shown once.
// POST { action: 'recover', name, code }
//   → { email, password }          correct name + recovery code: issues a NEW device password
// POST { action: 'new-code' }      (signed in) → { code }   replaces the recovery code
//
// Deploy with:  supabase functions deploy player-account --no-verify-jwt
// Secrets:      PLAYER_EMAIL_DOMAIN (optional), TURNSTILE_SECRET (optional, enables captcha)

import { admin, cors, json, requestUser } from '../_shared/util.ts';

// Account emails are never mailed; they only give Supabase a unique login.
const EMAIL_DOMAIN = Deno.env.get('PLAYER_EMAIL_DOMAIN') ?? 'players.ore-to-empire.local';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET');

const NAME_RE = /^[A-Za-z0-9_ก-๙]{3,16}$/;
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I

function randomCode(): string {
  // 16 symbols × 5 bits = 80 bits, shown as ORE-XXXX-XXXX-XXXX-XXXX
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('');
  return `ORE-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

function normaliseCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ORE/, '');
  return raw.length === 16 ? `ORE-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}` : code.toUpperCase();
}

async function captchaOk(token: string | undefined, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true; // captcha not configured
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return data.success === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { action?: string; name?: string; code?: string; captcha?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const db = admin();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

  // ------------------------------------------------------------ create
  if (body.action === 'create') {
    const name = (body.name ?? '').trim();
    if (!NAME_RE.test(name)) return json({ error: 'bad_name' }, 400);
    if (!(await captchaOk(body.captcha, ip))) return json({ error: 'captcha' }, 400);
    const { data: free } = await db.rpc('username_available', { p_name: name });
    if (!free) return json({ error: 'name_taken' }, 409);
    const { data: allowed } = await db.rpc('note_signup', { p_ip: ip });
    if (!allowed) return json({ error: 'too_many' }, 429);

    const email = `p-${crypto.randomUUID()}@${EMAIL_DOMAIN}`;
    const password = randomPassword();
    const code = randomCode();
    const created = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: name, provider: 'player' },
    });
    if (created.error || !created.data.user) return json({ error: 'create_failed', detail: created.error?.message }, 500);
    const uid = created.data.user.id;
    const claimed = await db.rpc('claim_player_name', { p_user: uid, p_name: name, p_code: code });
    if (claimed.error) {
      // lost a race for the name: undo the account
      await db.auth.admin.deleteUser(uid);
      return json({ error: claimed.error.message.includes('name_taken') ? 'name_taken' : 'create_failed' }, 409);
    }
    return json({ email, password, code });
  }

  // ------------------------------------------------------------ recover
  if (body.action === 'recover') {
    const name = (body.name ?? '').trim();
    const code = normaliseCode(body.code ?? '');
    if (!NAME_RE.test(name) || code.length < 8) return json({ error: 'bad_code' }, 400);
    const { data: uid, error } = await db.rpc('check_recovery', { p_name: name, p_code: code });
    if (error) return json({ error: error.message.includes('locked') ? 'locked' : 'bad_code' }, 429);
    if (!uid) return json({ error: 'bad_code' }, 401);
    const user = await db.auth.admin.getUserById(uid);
    if (user.error || !user.data.user?.email) return json({ error: 'recover_failed' }, 500);
    const password = randomPassword(); // a fresh device password for the new device
    const upd = await db.auth.admin.updateUserById(uid, { password });
    if (upd.error) return json({ error: 'recover_failed' }, 500);
    return json({ email: user.data.user.email, password });
  }

  // ------------------------------------------------------------ new-code (signed in)
  if (body.action === 'new-code') {
    const user = await requestUser(req);
    if (!user) return json({ error: 'not_signed_in' }, 401);
    const code = randomCode();
    const r = await db.rpc('set_recovery_code', { p_user: user.id, p_code: code });
    if (r.error) return json({ error: 'failed' }, 500);
    return json({ code });
  }

  return json({ error: 'unknown_action' }, 400);
});
