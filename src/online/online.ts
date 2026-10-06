import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PACKS, type GemItemId, type PackId } from '../config/meta';
import { migrate } from '../core/save';
import type { GameState } from '../core/types';
import type { Game, OnlineBridge } from '../game';
import { normaliseCode } from '../core/player';
import { ONLINE, lineConfigured, siteUrl } from './config';
import { clearDevice, loadDevice, saveDevice, type DeviceLogin } from './device';
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
  /** the player's unique name (null until picked) */
  username: string | null;
  /** number of players currently online (null = not connected yet) */
  onlineCount: number | null;
  /**
   * The step shown before play:
   *  name     — pick a name (creates the account)
   *  code     — show the new recovery code once
   *  recover  — "I already have an account": name + recovery code, or email/Google/LINE
   *  set-name — signed in some other way, but no name yet
   */
  onboarding: null | 'name' | 'code' | 'recover' | 'set-name';
  /** i18n key explaining why the onboarding step is showing */
  onboardingNote: string | null;
  /** name to pre-fill in the recover form */
  recoverName: string;
  /** a recovery code to show (once after creating, or after asking for a new one) */
  newCode: string | null;
  /** "confirm your email" link sent while adding an email to the account */
  linkSentTo: string | null;
}

/** does this account still use the generated login only (no real email)? */
function isDeviceEmail(email: string | undefined): boolean {
  return !!email && /^p-[0-9a-f-]{36}@/.test(email);
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
  ui: OnlineUi = {
    user: null,
    ready: false,
    lastCloudSave: null,
    emailSentTo: null,
    conflict: null,
    payment: null,
    username: null,
    onboarding: null,
    onboardingNote: null,
    recoverName: '',
    newCode: null,
    linkSentTo: null,
    onlineCount: null,
  };
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

  get onlineCount(): number | null {
    return this.ui.onlineCount;
  }

  private changed() {
    this.game.emit();
  }

  private setUser(u: User | null) {
    this.user = u;
    this.ui.user = u
      ? {
          id: u.id,
          email: isDeviceEmail(u.email) ? '' : (u.email ?? ''),
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
      // outside the callback: supabase-js holds a lock while notifying
      if (changedUser && u) window.setTimeout(() => void this.afterSignIn(), 0);
      this.changed();
    });

    if (this.user) await this.afterSignIn();
    else {
      const device = loadDevice();
      if (device?.email && device.password) {
        await this.deviceSignIn(device); // signed in → afterSignIn runs from the auth event
      } else {
        this.game.applyDeferredCatchUp();
        if (device?.pending) void this.createPending(device);
        else this.showOnboarding('name');
      }
    }

    this.resumePaymentFromUrl();
    window.setInterval(() => void this.cloudSave(), 30_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.cloudSave();
    });
    this.trackPresence();
    this.ui.ready = true;
    this.changed();
  }

  private trackPresence() {
    const channel = this.sb.channel('online-players', { config: { presence: { key: this.user?.id ?? 'guest' } } });
    channel.on('presence', { event: 'sync' }, () => {
      this.ui.onlineCount = Object.keys(channel.presenceState()).length;
      this.changed();
    });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ t: Date.now() });
    });
  }

  /**
   * Picks between the cloud save and this device's save, using SERVER time for
   * offline progress (a player can't fast-forward by changing the device clock).
   */
  private async afterSignIn() {
    await this.refreshProfile(true);
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
    if (this.ui.username) cloud.player = { name: this.ui.username };
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

  async refreshProfile(checkName = false) {
    if (!this.user) return;
    const { data } = await this.sb.from('profiles').select('gems, boost_until, username').eq('id', this.user.id).single();
    if (data) {
      this.game.state.gems = data.gems;
      if (data.boost_until) this.game.state.boostUntil = Math.max(this.game.state.boostUntil, Date.parse(data.boost_until));
      this.ui.username = data.username ?? null;
      if (data.username) {
        if (this.game.state.player?.name !== data.username) this.game.setPlayerName(data.username);
        if (this.ui.onboarding === 'set-name' || this.ui.onboarding === 'name' || this.ui.onboarding === 'recover') this.showOnboarding(null);
      } else if (checkName) {
        // signed in with email / Google / LINE before names existed (or before picking one)
        this.ui.recoverName = this.game.state.player?.name ?? '';
        this.showOnboarding('set-name');
      }
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

  // ------------------------------------------------------------------ player accounts (name + device key)

  showOnboarding(step: OnlineUi['onboarding'], note: string | null = null) {
    this.ui.onboarding = step;
    this.ui.onboardingNote = note;
    this.changed();
  }

  /** call an edge function; returns its JSON, or the error code from its body ('network' if none) */
  private async fn<T>(name: string, body: Record<string, unknown>): Promise<{ data: T; error: null } | { data: null; error: string }> {
    const { data, error } = await this.sb.functions.invoke(name, { body });
    if (!error) return { data: data as T, error: null };
    let code = 'network';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') code = ((await ctx.json()) as { error?: string })?.error ?? code;
    } catch {
      /* not JSON */
    }
    return { data: null, error: code };
  }

  /** true / false, or null when we can't tell (offline) */
  async nameAvailable(name: string): Promise<boolean | null> {
    const { data, error } = await this.sb.rpc('username_available', { p_name: name.trim() });
    return error ? null : !!data;
  }

  /**
   * Creates the player's account: the server generates a password (kept on this
   * device) and a recovery code (shown once). Returns an error code or null.
   */
  async createAccount(rawName: string, captcha?: string): Promise<string | null> {
    const name = rawName.trim();
    const r = await this.fn<{ email: string; password: string; code: string }>('player-account', { action: 'create', name, captcha });
    if (r.error !== null) return r.error;
    const { email, password, code } = r.data;
    saveDevice({ name, email, password, code });
    this.game.setPlayerName(name);
    this.ui.username = name;
    this.ui.newCode = code;
    this.showOnboarding('code');
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) this.game.toast(this.game.t('err.network'), 'error'); // the key is saved: next start signs in
    return null;
  }

  /** no connection when picking a name: play now, create the account later */
  playOfflineAs(rawName: string) {
    const name = rawName.trim();
    saveDevice({ name, pending: true });
    this.game.setPlayerName(name);
    this.showOnboarding(null);
  }

  private async createPending(d: DeviceLogin) {
    const err = await this.createAccount(d.name);
    if (err === 'name_taken' || err === 'bad_name') {
      this.ui.recoverName = d.name;
      this.showOnboarding('name', 'acct.takenNow');
    }
    // other errors (still offline…): keep the pending name and try next time
  }

  private async deviceSignIn(d: DeviceLogin) {
    const { error } = await this.sb.auth.signInWithPassword({ email: d.email!, password: d.password! });
    if (!error) return;
    this.game.applyDeferredCatchUp();
    if (error.status === 400) {
      // the key was replaced (account recovered on another device)
      this.ui.recoverName = d.name;
      this.showOnboarding('recover', 'acct.keyReplaced');
    } else {
      this.game.toast(this.game.t('err.network'), 'error');
    }
  }

  /** restore an account on this device with its name + recovery code */
  async recover(rawName: string, rawCode: string): Promise<string | null> {
    const name = rawName.trim();
    const code = normaliseCode(rawCode);
    if (!code) return 'bad_code';
    const r = await this.fn<{ email: string; password: string }>('player-account', { action: 'recover', name, code });
    if (r.error !== null) return r.error;
    saveDevice({ name, email: r.data.email, password: r.data.password, code });
    const { error } = await this.sb.auth.signInWithPassword({ email: r.data.email, password: r.data.password });
    if (error) return 'network';
    this.showOnboarding(null);
    return null;
  }

  /** name for an account that signed in with email / Google / LINE */
  async setUsername(rawName: string): Promise<string | null> {
    const name = rawName.trim();
    const { error } = await this.sb.rpc('set_username', { p_name: name });
    if (error) {
      for (const c of ['name_taken', 'bad_name', 'name_already_set']) if (error.message.includes(c)) return c;
      return 'network';
    }
    this.ui.username = name;
    this.game.setPlayerName(name);
    this.showOnboarding(null);
    await this.cloudSave(true);
    return null;
  }

  /** replaces the recovery code (the old one stops working) */
  async newRecoveryCode(): Promise<string | null> {
    const r = await this.fn<{ code: string }>('player-account', { action: 'new-code' });
    if (r.error !== null) return r.error;
    const d = loadDevice();
    if (d && d.name.toLowerCase() === (this.ui.username ?? '').toLowerCase()) saveDevice({ ...d, code: r.data.code });
    this.ui.newCode = r.data.code;
    this.showOnboarding('code');
    return null;
  }

  /** recovery code kept on this device (for the signed-in player) */
  deviceCode(): string | null {
    const d = loadDevice();
    return d?.code && d.name.toLowerCase() === (this.ui.username ?? '').toLowerCase() ? d.code : null;
  }

  savedCode() {
    this.ui.newCode = null;
    this.showOnboarding(null);
  }

  // backup sign-ins added to the current account

  async linkEmail(email: string): Promise<string | null> {
    const { error } = await this.sb.auth.updateUser({ email }, { emailRedirectTo: siteUrl() });
    if (error) return error.message;
    this.ui.linkSentTo = email;
    this.changed();
    return null;
  }

  async linkGoogle() {
    const { error } = await this.sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: siteUrl() } });
    if (error) this.game.toast(this.game.t('err.signInFailed'), 'error');
  }

  linkedProviders(): string[] {
    return (this.user?.identities ?? []).map((i) => i.provider).filter((p) => p !== 'email' || !!this.ui.user?.email);
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

  /** LINE sign-in, or (mode 'link') adding LINE to the signed-in account */
  signInLine(mode: 'signin' | 'link' = 'signin') {
    if (!lineConfigured) return;
    const state = `line.${mode}.` + randomId();
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
    const r = await this.fn<{ token_hash?: string; linked?: boolean }>('line-auth', {
      code: cb.code,
      redirect_uri: new URL('line-callback.html', siteUrl()).href,
      nonce: saved.nonce,
    });
    if (r.data?.linked) {
      this.game.toast(this.game.t('acct.lineLinked'), 'success');
      return;
    }
    if (r.error !== null || !r.data.token_hash) {
      this.game.toast(this.game.t(r.error === 'line_in_use' ? 'acct.err.line_in_use' : 'err.signInFailed'), 'error');
      return;
    }
    const data = r.data;
    await this.sb.auth.verifyOtp({ token_hash: data.token_hash!, type: 'magiclink' });
  }

  /** signs out and forgets this device's key (the recovery code brings it back) */
  async signOut() {
    await this.cloudSave(true);
    await this.sb.auth.signOut();
    clearDevice();
    this.setUser(null);
    this.ui.username = null;
    this.game.state.gems = 0; // gems belong to the account
    this.showOnboarding('name');
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
