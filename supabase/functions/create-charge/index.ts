// POST { pack, nonce, return_uri }
//   nonce: a card token (tokn_…) or a payment source (src_…) from OmiseCard / Omise.js
// Creates a pending purchase and an Omise charge. Gems are NOT credited here —
// only the omise-webhook function credits them, after re-checking the charge.
//
// Returns { purchase_id, status, authorize_uri?, qr_uri? }
//   authorize_uri → redirect the player (3-D Secure, TrueMoney)
//   qr_uri        → show the PromptPay QR and poll the purchase

import { PACKS } from '../_shared/packs.ts';
import { admin, cors, json, omise, requestUser } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const user = await requestUser(req);
  if (!user) return json({ error: 'not_signed_in' }, 401);

  let body: { pack?: string; nonce?: string; return_uri?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const pack = body.pack ? PACKS[body.pack] : undefined;
  const nonce = body.nonce ?? '';
  if (!pack) return json({ error: 'unknown_pack' }, 400);
  if (!/^(tokn|src)_[A-Za-z0-9_]+$/.test(nonce)) return json({ error: 'bad_nonce' }, 400);

  // only return to our own site
  const site = Deno.env.get('SITE_URL');
  let returnUri = body.return_uri ?? site ?? '';
  if (site && !returnUri.startsWith(site)) returnUri = site;

  const db = admin();
  if (pack.oncePerAccount) {
    const { data: prof } = await db.from('profiles').select('starter_bought').eq('id', user.id).single();
    if (prof?.starter_bought) return json({ error: 'already_bought' }, 409);
  }

  const { data: purchase, error } = await db
    .from('purchases')
    .insert({ user_id: user.id, pack: body.pack, gems: pack.gems, boost_hours: pack.boostHours, amount_satang: pack.satang })
    .select('id')
    .single();
  if (error || !purchase) return json({ error: 'db_error' }, 500);

  const sep = returnUri.includes('?') ? '&' : '?';
  const params: Record<string, string> = {
    amount: String(pack.satang),
    currency: 'thb',
    return_uri: `${returnUri}${sep}purchase=${purchase.id}`,
    'metadata[purchase_id]': purchase.id,
    'metadata[user_id]': user.id,
    'metadata[pack]': body.pack!,
    description: `Ore to Empire ${body.pack}`,
  };
  if (nonce.startsWith('tokn_')) params.card = nonce;
  else params.source = nonce;

  try {
    const charge = await omise('/charges', params);
    const qr = charge.source?.scannable_code?.image?.download_uri ?? null;
    const failed = charge.status === 'failed';
    await db
      .from('purchases')
      .update({
        charge_id: charge.id,
        qr_uri: qr,
        authorize_uri: charge.authorize_uri ?? null,
        status: failed ? 'failed' : 'pending',
        failure: failed ? `${charge.failure_code}: ${charge.failure_message}` : null,
      })
      .eq('id', purchase.id);
    return json({
      purchase_id: purchase.id,
      status: failed ? 'failed' : charge.status,
      authorize_uri: charge.authorize_uri ?? null,
      qr_uri: qr,
      failure: failed ? charge.failure_message : null,
    });
  } catch (e) {
    await db.from('purchases').update({ status: 'failed', failure: String(e) }).eq('id', purchase.id);
    return json({ error: 'charge_failed', detail: String(e) }, 502);
  }
});
