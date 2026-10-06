// LINE Login → Supabase session.
//
// POST { code, redirect_uri, nonce }
// 1. Exchange the LINE authorization code for tokens.
// 2. Verify the ID token with LINE (checks signature, audience, expiry and our nonce).
// 3. If the request is signed in, link this LINE account to that player and stop.
//    Otherwise find the player linked to this LINE account (identity_links), or
//    create a new user for it.
// 4. Mint a one-time magic-link token; the browser exchanges it with
//    supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) for a normal session.
//
// Deploy with:  supabase functions deploy line-auth --no-verify-jwt
// Secrets: LINE_CHANNEL_ID, LINE_CHANNEL_SECRET, SITE_URL

import { admin, cors, json, requestUser } from '../_shared/util.ts';

const CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID') ?? '';
const CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';
// LINE only shares an email if your channel has the email permission. Players
// without one get a stable placeholder address that is never mailed.
const PLACEHOLDER_DOMAIN = Deno.env.get('LINE_PLACEHOLDER_EMAIL_DOMAIN') ?? 'line-users.example.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!CHANNEL_ID || !CHANNEL_SECRET) return json({ error: 'line_not_configured' }, 500);

  let body: { code?: string; redirect_uri?: string; nonce?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const { code, redirect_uri, nonce } = body;
  if (!code || !redirect_uri || !nonce) return json({ error: 'missing_params' }, 400);
  const site = Deno.env.get('SITE_URL');
  if (site && !redirect_uri.startsWith(site)) return json({ error: 'bad_redirect' }, 400);

  // 1. code → tokens
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri, client_id: CHANNEL_ID, client_secret: CHANNEL_SECRET }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.id_token) return json({ error: 'line_token_failed', detail: tokens.error_description ?? tokens.error }, 400);

  // 2. verify the ID token (LINE checks signature/expiry/audience/nonce for us)
  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokens.id_token, client_id: CHANNEL_ID, nonce }),
  });
  const claims = await verifyRes.json();
  if (!verifyRes.ok || !claims.sub) return json({ error: 'line_verify_failed', detail: claims.error_description ?? claims.error }, 400);

  const lineSub: string = claims.sub;
  const db = admin();

  // 3a. linking LINE to the signed-in player (account panel → "link LINE")
  const current = await requestUser(req);
  if (current) {
    const { data: existing } = await db.from('identity_links').select('user_id').eq('provider', 'line').eq('subject', lineSub).maybeSingle();
    if (existing && existing.user_id !== current.id) return json({ error: 'line_in_use' }, 409);
    if (!existing) {
      const ins = await db.from('identity_links').insert({ provider: 'line', subject: lineSub, user_id: current.id });
      if (ins.error) return json({ error: 'link_failed', detail: ins.error.message }, 500);
    }
    return json({ linked: true });
  }

  // 3b. signing in with LINE: a linked player first
  let email: string | undefined;
  const { data: linked } = await db.from('identity_links').select('user_id').eq('provider', 'line').eq('subject', lineSub).maybeSingle();
  if (linked) {
    const u = await db.auth.admin.getUserById(linked.user_id);
    email = u.data.user?.email ?? undefined;
  }
  if (!email) {
    email = (claims.email as string | undefined)?.toLowerCase() ?? `${lineSub.toLowerCase()}@${PLACEHOLDER_DOMAIN}`;
    const created = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: claims.name ?? 'LINE user', avatar_url: claims.picture ?? null, provider: 'line' },
      app_metadata: { line_sub: lineSub },
    });
    // "already registered" is fine — the magic link below signs into the existing account
    if (created.error && !/already|exists|registered/i.test(created.error.message)) {
      return json({ error: 'create_user_failed', detail: created.error.message }, 500);
    }
  }

  // 4. one-time token for the browser
  const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data.properties?.hashed_token) return json({ error: 'link_failed', detail: link.error?.message }, 500);
  if (!linked && link.data.user) {
    await db.from('identity_links').upsert({ provider: 'line', subject: lineSub, user_id: link.data.user.id }, { onConflict: 'provider,subject', ignoreDuplicates: true });
  }
  return json({ token_hash: link.data.properties.hashed_token });
});
