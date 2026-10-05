import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PACKS, type GemItemId, type PackId } from '../config/meta';
import { migrate } from '../core/save';
import type { GameState } from '../core/types';
import type { Game, OnlineBridge } from '../game';
import { ONLINE, lineConfigured, siteUrl } from './config';
import { openOmiseCard } from './omise';

export interface SaveSummary {
  earned: number;
  money: number;
  prestige: number;
  buildings: number;
  savedAt: number;
}

export interface OnlineUi {
  user: { id: string; email: string; name: string; provider: string } | null;
  ready: boolean;
  lastCloudSave: number | null;
  emailSentTo: string | null;
  conflict: { local: SaveSummary; cloud: SaveSummary } | null;
  payment: { purchaseId: string; pack: PackId; qr: string | null; status: 'pending' | 'paid' | 'failed' | 'expired'; failure?: string } | null;
}

const ERRORS: Record<string, string> = {
  not_enough_gems: 'err.noGems',
  max_level: 'err.maxLevel',
  already_claimed: 'err.alreadyClaimed',
  daily_cap: 'err.dailyCap',
  bad_day: 'err.badDay',
  not_signed_in: 'err.signInRequired',
};

function errKey(message: string | undefined): string {
  for (const k in ERRORS) if (message?.includes(k)) return ERRORS[k];
  return 'err.network';
}

function summary(s: GameState, savedAt: number): SaveSummary {
  return {
    earned: s.prestige.lifetimeEarned,
    money: s.money,
    prestige: s.prestige.count,
    buildings: s.buildings.length,
    savedAt,
  };
}

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Supabase-backed accounts, cloud saves (stamped with server time), server-side
 * gems and Omise purchases. Created only when the env vars are configured.
 */
export class Online implements OnlineBridge {
  ui: OnlineUi = { user: null, ready: false, lastCloudSave: null, emailSentTo: null, conflict: null, payment: null };
  private user: User | null = null;
  private saving = false;
  private pendingCloud: { state: GameState; serverNow: number; savedAt: number } | null = null;
  private pollTimer = 0;

  private constructor(
    private sb: SupabaseClient,
    private game: Game,
  ) {}

  static async create(game: Game): Promise<Online> {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(ONLINE.supabaseUrl, ONLINE.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    });
    const o = new Online(sb, game);
    game.online = o;
    await o.init();
    return o;
  }

  signedIn(): boolean {
    return !!this.user;
  }

  private changed() {
    this.game.emit();
  }

  private setUser(u: User | null) {
    this.user = u;
    this.ui.user = u
      ? {
          id: u.id,
          email: u.email ?? '',
          name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? u.email ?? '',
          provider: (u.user_metadata?.provider as string) ?? (u.app_metadata?.provider as string) ?? 'email',
        }
      : null;
  }

  // ------------------------------------------------------------------ startup

  private async init() {
    await this.finishLineSignIn();
    const { data } = await this.sb.auth.getSession();
    this.setUser(data.session?.user ?? null);

    this.sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      const changedUser = (u?.id ?? null) !== (this.user?.id ?? null);
      this.setUser(u);
      if (changedUser && u) void this.afterSignIn();
      this.changed();
    });

    if (this.user) await this.afterSignIn();
    else this.game.applyDeferredCatchUp();

    this.resumePaymentFromUrl();
    window.setInterval(() => void this.cloudSave(), 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.cloudSave();
    });
    this.ui.ready = true;
    this.changed();
  }

  /**
   * Picks between the cloud save and this device's save, using SERVER time for
   * offline progress (a player can't fast-forward by changing the device clock).
   */
  private async afterSignIn() {
    await this.refreshProfile();
    const { data, error } = await this.sb.rpc('load_game');
    if (error) {
      this.game.applyDeferredCatchUp();
      this.game.toast(this.game.t('err.network'), 'error');
      return;
    }
    const row = (data as { data: GameState | null; saved_at: string | null; server_now: string }[])?.[0];
    const serverNow = Date.parse(row?.server_now ?? new Date().toISOString());
    const local = this.game.state;

    if (!row?.data) {
      // first sign-in on this account: the guest save becomes the cloud save
      this.game.applyDeferredCatchUp();
      await this.cloudSave(true);
      return;
    }
    const cloud = migrate(row.data);
    if (!cloud) {
      this.game.applyDeferredCatchUp();
      return;
    }
    const savedAt = Date.parse(row.saved_at!);
    const awayCloud = Math.max(0, (serverNow - savedAt) / 1000);
    const sameRun = cloud.seed === local.seed && cloud.prestige.count === local.prestige.count;
    const localIsFresh = local.prestige.lifetimeEarned < 500 && local.prestige.count === 0;

    if (localIsFresh || (sameRun && cloud.time >= local.time - 1)) {
      this.useCloud(cloud, awayCloud);
    } else if (sameRun) {
      // same run, this device got further (closed before the last cloud sync)
      this.game.applyDeferredCatchUp(Math.max(0, awayCloud - (local.time - cloud.time)));
      await this.cloudSave(true);
    } else {
      // two different games: let the player choose
      this.pendingCloud = { state: cloud, serverNow, savedAt };
      this.ui.conflict = { local: summary(local, local.lastSaved), cloud: summary(cloud, savedAt) };
      this.changed();
    }
  }

  private useCloud(cloud: GameState, awaySeconds: number) {
    cloud.settings = { ...this.game.state.settings, ...cloud.settings };
    cloud.gems = this.game.state.gems; // server balance, already fetched
    cloud.boostUntil = Math.max(cloud.boostUntil, this.game.state.boostUntil);
    this.game.replaceState(cloud, awaySeconds);
    this.game.clearDeferredCatchUp();
  }

  resolveConflict(choice: 'cloud' | 'local') {
    const p = this.pendingCloud;
    this.ui.conflict = null;
    this.pendingCloud = null;
    if (!p) return;
    if (choice === 'cloud') this.useCloud(p.state, Math.max(0, (p.serverNow - p.savedAt) / 1000));
    else this.game.applyDeferredCatchUp();
    void this.cloudSave(true);
    this.changed();
  }

  // ------------------------------------------------------------------ profile, saves

  async refreshProfile() {
    if (!this.user) return;
    const { data } = await this.sb.from('profiles').select('gems, boost_until').eq('id', this.user.id).single();
    if (data) {
      this.game.state.gems = data.gems;
      if (data.boost_until) this.game.state.boostUntil = Math.max(this.game.state.boostUntil, Date.parse(data.boost_until));
      this.changed();
    }
  }

  async cloudSave(force = false) {
    if (!this.user || this.saving || this.ui.conflict) return;
    if (!force && document.visibilityState === 'hidden' && this.ui.lastCloudSave && Date.now() - this.ui.lastCloudSave < 5000) return;
    this.saving = true;
    try {
      const { error } = await this.sb.rpc('save_game', { p_data: this.game.state });
      if (!error) this.ui.lastCloudSave = Date.now();
    } finally {
      this.saving = false;
    }
  }

  saveNow() {
    void this.cloudSave(true);
  }

  // ------------------------------------------------------------------ auth

  async signInEmail(email: string): Promise<string | null> {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: siteUrl() } });
    if (error) return error.message;
    this.ui.emailSentTo = email;
    this.changed();
    return null;
  }

  async signInGoogle() {
    await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } });
  }

  signInLine() {
    if (!lineConfigured) return;
    const state = 'line.' + randomId();
    const nonce = randomId();
    sessionStorage.setItem('ote.line_state', JSON.stringify({ state, nonce }));
    const redirect = new URL('line-callback.html', siteUrl()).href;
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: ONLINE.lineChannelId,
      redirect_uri: redirect,
      state,
      scope: 'openid profile email',
      nonce,
    });
    location.href = `https://access.line.me/oauth2/v2.1/authorize?${q}`;
  }

  /** LINE sent the player back (via line-callback.html): finish sign-in */
  private async finishLineSignIn() {
    let cb: { code: string | null; state: string | null; error: string | null } | null = null;
    let saved: { state: string; nonce: string } | null = null;
    try {
      cb = JSON.parse(sessionStorage.getItem('ote.line_cb') ?? 'null');
      saved = JSON.parse(sessionStorage.getItem('ote.line_state') ?? 'null');
      sessionStorage.removeItem('ote.line_cb');
      sessionStorage.removeItem('ote.line_state');
    } catch {
      return;
    }
    if (!cb) return;
    if (cb.error || !cb.code || !saved || cb.state !== saved.state) {
      this.game.toast(this.game.t('err.signInFailed'), 'error');
      return;
    }
    const { data, error } = await this.sb.functions.invoke('line-auth', {
      body: { code: cb.code, redirect_uri: new URL('line-callback.html', siteUrl()).href, nonce: saved.nonce },
    });
    if (error || !data?.token_hash) {
      this.game.toast(this.game.t('err.signInFailed'), 'error');
      return;
    }
    await this.sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  }

  async signOut() {
    await this.cloudSave(true);
    await this.sb.auth.signOut();
    this.setUser(null);
    this.game.state.gems = 0; // gems belong to the account
    this.changed();
  }

  // ------------------------------------------------------------------ gems (OnlineBridge)

  async spendGems(item: GemItemId) {
    const { data, error } = await this.sb.rpc('spend_gems', { p_item: item });
    if (error) return { ok: false as const, reason: errKey(error.message) };
    await this.cloudSave(true);
    return { ok: true as const, gems: data as number };
  }

  async claimDaily(day: string, key: string) {
    const { data, error } = await this.sb.rpc('claim_daily_gems', { p_day: day, p_key: key });
    if (error) return { ok: false as const, reason: errKey(error.message) };
    return { ok: true as const, gems: data as number };
  }

  // ------------------------------------------------------------------ purchases

  async buyPack(pack: PackId) {
    if (!this.user) {
      this.game.openPanel('account');
      return;
    }
    const def = PACKS[pack];
    await openOmiseCard({
      amount: def.priceThb * 100,
      frameLabel: 'Ore to Empire',
      submitLabel: this.game.t('ui.pay'),
      onToken: (nonce) => void this.charge(pack, nonce),
    });
  }

  private async charge(pack: PackId, nonce: string) {
    this.game.ui.busy = true;
    this.changed();
    const { data, error } = await this.sb.functions.invoke('create-charge', { body: { pack, nonce, return_uri: siteUrl() } });
    this.game.ui.busy = false;
    if (error || !data?.purchase_id) {
      const msg = (data as { error?: string })?.error === 'already_bought' ? 'err.alreadyBought' : 'err.paymentFailed';
      this.game.toast(this.game.t(msg), 'error');
      this.changed();
      return;
    }
    if (data.status === 'failed') {
      this.game.toast(`${this.game.t('err.paymentFailed')} ${data.failure ?? ''}`, 'error');
      return;
    }
    if (data.authorize_uri) {
      // 3-D Secure or TrueMoney: Omise sends the player back with ?purchase=<id>
      location.href = data.authorize_uri;
      return;
    }
    this.ui.payment = { purchaseId: data.purchase_id, pack, qr: data.qr_uri ?? null, status: 'pending' };
    this.pollPurchase();
    this.changed();
  }

  private resumePaymentFromUrl() {
    const url = new URL(location.href);
    const id = url.searchParams.get('purchase');
    if (!id || !this.user) return;
    url.searchParams.delete('purchase');
    history.replaceState(null, '', url.toString());
    this.ui.payment = { purchaseId: id, pack: 'pack_s', qr: null, status: 'pending' };
    this.pollPurchase();
  }

  private pollPurchase() {
    window.clearInterval(this.pollTimer);
    const started = Date.now();
    this.pollTimer = window.setInterval(async () => {
      const p = this.ui.payment;
      if (!p || Date.now() - started > 15 * 60_000) {
        window.clearInterval(this.pollTimer);
        return;
      }
      const { data } = await this.sb.from('purchases').select('status, pack, failure').eq('id', p.purchaseId).single();
      if (!data || data.status === 'pending') return;
      window.clearInterval(this.pollTimer);
      this.ui.payment = { ...p, pack: data.pack as PackId, status: data.status, failure: data.failure ?? undefined };
      if (data.status === 'paid') {
        await this.refreshProfile();
        this.game.play('coins');
        this.game.toast(this.game.t('ui.paymentDone', { gems: PACKS[data.pack as PackId]?.gems ?? 0 }), 'success');
        await this.cloudSave(true);
      }
      this.changed();
    }, 3000);
  }

  closePayment() {
    if (this.ui.payment?.status !== 'pending') window.clearInterval(this.pollTimer);
    this.ui.payment = null;
    this.changed();
  }
}
