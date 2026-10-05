import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Restrict to your site in production via the ALLOWED_ORIGIN secret.
const ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

export const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/** service-role client: bypasses RLS — server code only */
export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** the signed-in user making this request, or null */
export async function requestUser(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

const OMISE_API = 'https://api.omise.co';

/** call the Omise REST API with the secret key (form-encoded, like their docs) */
export async function omise(path: string, params?: Record<string, string>, method = params ? 'POST' : 'GET') {
  const key = Deno.env.get('OMISE_SECRET_KEY');
  if (!key) throw new Error('OMISE_SECRET_KEY is not set');
  const res = await fetch(`${OMISE_API}${path}`, {
    method,
    headers: {
      Authorization: 'Basic ' + btoa(key + ':'),
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok || data.object === 'error') throw new Error(`omise ${data.code ?? res.status}: ${data.message ?? ''}`);
  return data;
}
