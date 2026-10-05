/**
 * Online features switch on only when the Supabase env vars are present
 * (see .env.example). Without them the game runs fully offline as a guest —
 * that's how the single-file / artifact build works.
 */
export const ONLINE = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  omisePublicKey: import.meta.env.VITE_OMISE_PUBLIC_KEY ?? '',
  lineChannelId: import.meta.env.VITE_LINE_CHANNEL_ID ?? '',
};

export const onlineConfigured = !!(ONLINE.supabaseUrl && ONLINE.supabaseAnonKey);
export const paymentsConfigured = onlineConfigured && !!ONLINE.omisePublicKey;
export const lineConfigured = onlineConfigured && !!ONLINE.lineChannelId;

/** is there a stored Supabase session? (sync check so the game can wait for server time) */
export function hasStoredSession(): boolean {
  if (!onlineConfigured) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {
    /* storage blocked */
  }
  return false;
}

export function siteUrl(): string {
  return location.origin + location.pathname;
}
