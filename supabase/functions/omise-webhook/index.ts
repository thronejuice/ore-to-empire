// Omise posts events here (set the URL in the Omise dashboard → Webhooks).
// We never trust the payload: for charge.complete we re-fetch the charge from
// Omise with our secret key and only then credit gems (idempotently).
//
// Deploy with:  supabase functions deploy omise-webhook --no-verify-jwt
// (Omise can't send a Supabase JWT; security comes from re-fetching the charge.)

import { admin, json, omise } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let event: { key?: string; data?: { id?: string; object?: string } };
  try {
    event = await req.json();
  } catch {
    return json({ ok: true }); // ignore junk
  }
  const chargeId = event.data?.object === 'charge' ? event.data.id : undefined;
  if (!chargeId || !/^chrg_[A-Za-z0-9_]+$/.test(chargeId)) return json({ ok: true, ignored: event.key });

  let charge;
  try {
    charge = await omise(`/charges/${chargeId}`);
  } catch (e) {
    // 5xx → Omise retries later
    return json({ error: String(e) }, 502);
  }

  const purchaseId: string | undefined = charge.metadata?.purchase_id;
  if (!purchaseId) return json({ ok: true, ignored: 'no purchase id' });

  const db = admin();
  if (charge.status === 'successful' && charge.paid) {
    const { error } = await db.rpc('credit_purchase', { p_purchase: purchaseId, p_charge: charge.id });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, credited: purchaseId });
  }
  if (charge.status === 'failed' || charge.status === 'expired') {
    await db
      .from('purchases')
      .update({ status: charge.status, failure: charge.failure_message ?? null })
      .eq('id', purchaseId)
      .eq('status', 'pending');
  }
  return json({ ok: true, status: charge.status });
});
