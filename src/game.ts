import { BALANCE, BUILDINGS, TERRAIN, type BuildingType, type CityId, type ItemId, type RecipeId, type ResearchId, type VehicleType, type ZoneId } from './config/balance';
import type { GemItemId, PerkId } from './config/meta';
import {
  createLink,
  moveBuilding,
  placeBuilding,
  planLink,
  removeBuilding,
  removeLink,
  setBeltFilter,
  setRecipe,
  stepReserve,
  upgradeBelts,
  upgradeBuilding,
  type ActionResult,
  type LinkPlan,
} from './core/actions';
import { abandonContract, acceptContract, rerollOffers } from './core/contracts';
import { claimBonus, claimMission, ensureDaily } from './core/daily';
import { buyVehicle, sellVehicle, setRoute } from './core/fleet';
import { applyGemItem, gemItemAvailable, spendLocalGems } from './core/gems';
import { buyPlot, plotOf } from './core/land';
import { applyOffline, type OfflineReport } from './core/offline';
import { buyPerk } from './core/prestige';
import { checkQuests, isBuildingUnlocked, skipTutorial, type QuestDef } from './core/quests';
import { cancelResearch, startResearch } from './core/research';
import { localSave, type SaveStore } from './core/save';
import { tick, type SimEvent } from './core/sim';
import { buildingAt, getBuilding, isUnlocked, newGame } from './core/state';
import type { BeltView, GameState } from './core/types';
import { applyTidy, planTidy, type TidyPlan } from './core/tidy';
import { buyLicence, terrainAt } from './core/zones';
import { translate, type Lang } from './i18n';
import { backgroundAlerts } from './core/alerts';
import { cancelScheduled, notifyPermission, requestNotify, scheduleWhileHidden } from './notify';
import { sfx, setSoundEnabled, type Sfx } from './audio';

export type Mode =
  | { kind: 'select' }
  | { kind: 'build'; type: BuildingType }
  | { kind: 'link'; from: number | null }
  | { kind: 'move'; id: number };

/** cards that stay on screen until closed */
export type NoticeInput = { kind: 'research'; research: ResearchId } | { kind: 'contract'; item: ItemId; reward: number };
export type Notice = NoticeInput & { id: number };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export type Panel =
  | 'none'
  | 'build'
  | 'menu'
  | 'upgrades'
  | 'settings'
  | 'stats'
  | 'research'
  | 'markets'
  | 'fleet'
  | 'contracts'
  | 'daily'
  | 'prestige'
  | 'shop'
  | 'account';

export interface UiState {
  mode: Mode;
  selected: number | null;
  plot: [number, number] | null;
  hover: [number, number] | null;
  linkPreview: { to: number; plan: ActionResult<LinkPlan> } | null;
  toasts: Toast[];
  offline: OfflineReport | null;
  questDone: QuestDef | null;
  panel: Panel;
  busy: boolean; // waiting on the server
  /** a plain map tile the player tapped (deposit info / build here) */
  tile: [number, number] | null;
  /** ask the renderer to centre the camera on a tile */
  focus: [number, number] | null;
  /** a proposed belt layout waiting for the player to accept */
  tidy: TidyPlan | null;
  /** the intro slides were reopened from Settings */
  intro: boolean;
  notices: Notice[];
  /** offer browser notifications (after the first research is started) */
  askNotify: boolean;
}

/**
 * Optional online layer (Phase 4). When present and signed in, gems live on the
 * server: spending and daily-gem claims go through it. Guests use local gems.
 */
export interface OnlineBridge {
  signedIn(): boolean;
  spendGems(item: GemItemId): Promise<{ ok: true; gems: number } | { ok: false; reason: string }>;
  claimDaily(day: string, key: string, gems: number): Promise<{ ok: true; gems: number } | { ok: false; reason: string }>;
  /** persists immediately (used after big changes) */
  saveNow?(state: GameState): void;
  /** number of players currently online, or null if not yet connected */
  onlineCount?: number | null;
}

type Listener = () => void;

/**
 * Owns the GameState, runs the fixed-step simulation, and exposes every player
 * action. React subscribes for HUD updates; the Pixi renderer reads state directly.
 */
export class Game {
  state: GameState;
  ui: UiState = {
    mode: { kind: 'select' },
    selected: null,
    plot: null,
    hover: null,
    linkPreview: null,
    toasts: [],
    offline: null,
    questDone: null,
    panel: 'none',
    busy: false,
    tile: null,
    focus: null,
    tidy: null,
    intro: false,
    notices: [],
    askNotify: false,
  };
  events: SimEvent[] = [];
  structureVersion = 0;
  online: OnlineBridge | null = null;

  private listeners = new Set<Listener>();
  private version = 0;
  private acc = 0;
  private lastFrame = 0;
  private lastEmit = 0;
  private lastSave = 0;
  private questTimer = 0;
  private raf = 0;
  private toastId = 0;

  /** offline time waiting for the server's clock (signed-in players) */
  private pendingAway: number | null = null;

  constructor(
    private store: SaveStore = localSave,
    opts: { deferCatchUp?: boolean } = {},
  ) {
    const loaded = store.load();
    this.state = loaded ?? newGame();
    setSoundEnabled(this.state.settings.sound);
    if (loaded) {
      const away = this.awaySince(loaded.lastSaved);
      if (opts.deferCatchUp) this.pendingAway = away;
      else this.catchUp(away);
    }
    ensureDaily(this.state);
  }

  /** Apply offline progress held back at startup (device clock unless the server says otherwise). */
  applyDeferredCatchUp(away?: number) {
    if (this.catchUpResolved) return; // only once, even if the network fallback fired first
    this.catchUpResolved = true;
    const a = away ?? this.pendingAway;
    this.pendingAway = null;
    if (a && a > 0) this.catchUp(a);
  }

  clearDeferredCatchUp() {
    this.catchUpResolved = true;
    this.pendingAway = null;
  }

  private catchUpResolved = false;

  /** seconds since `since`, refusing credit if the clock went backwards */
  awaySince(since: number, now = Date.now()): number {
    if (now < this.state.maxSeenTime - 60_000) return 0; // clock moved back: no credit
    return (now - since) / 1000;
  }

  // ---------------------------------------------------------------- loop

  start() {
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      this.step(now);
    };
    this.raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onHide);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onHide);
  }

  private step(now: number) {
    let elapsed = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (elapsed > 5) {
      this.catchUp(elapsed);
      elapsed = 0;
    }
    this.acc += Math.min(elapsed, 0.25);
    const dt = BALANCE.tickSeconds;
    const first = this.events.length;
    while (this.acc >= dt) {
      tick(this.state, dt, this.events);
      this.acc -= dt;
    }
    this.handleEvents(first);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);

    this.questTimer += elapsed;
    if (this.questTimer > 0.4) {
      this.questTimer = 0;
      this.runQuestCheck();
      if (ensureDaily(this.state)) this.emit();
    }
    if (now - this.lastSave > BALANCE.autosaveSeconds * 1000) {
      this.lastSave = now;
      this.save();
    }
    if (now - this.lastEmit > 200) this.emit();
  }

  private handleEvents(from: number) {
    let sold = false;
    for (let i = from; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.type === 'sold') sold = true;
      else if (e.type === 'research') {
        this.notice({ kind: 'research', research: e.id });
        this.play('research');
        this.structureChanged();
      } else if (e.type === 'contract_done') {
        this.notice({ kind: 'contract', item: e.contract.item, reward: e.contract.reward });
        this.play('quest');
      } else if (e.type === 'vein_spawn') {
        this.toast(this.t('ui.veinFound', { ore: this.t(`item.${e.vein.type}`), n: e.vein.total.toLocaleString() }), 'success');
        this.play('research');
      } else if (e.type === 'vein_low') {
        this.toast(this.t('ui.veinLow', { ore: this.t(`item.${e.vein.type}`) }), 'info');
      } else if (e.type === 'vein_depleted') {
        this.toast(this.t('ui.veinDepleted', { ore: this.t(`item.${e.vein.type}`) }), 'info');
        this.emit();
      } else if (e.type === 'vein_expired') {
        this.toast(this.t('ui.veinExpired', { ore: this.t(`item.${e.vein.type}`) }), 'info');
      } else if (e.type === 'contract_expired') {
        this.toast(this.t('ui.contractExpired', { item: this.t(`item.${e.contract.item}`) }), 'error');
      }
    }
    if (sold) this.play('sell');
  }

  get alpha() {
    return this.acc / BALANCE.tickSeconds;
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.save();
      this.scheduleBackgroundAlerts();
    } else cancelScheduled();
  };

  /** the game pauses in a background tab: queue tab-title changes and notifications for what we know will happen */
  private scheduleBackgroundAlerts() {
    const notify = this.state.settings.notify === 'on' && notifyPermission() === 'granted';
    scheduleWhileHidden(
      backgroundAlerts(this.state).map((a) =>
        a.kind === 'research'
          ? {
              delayMs: a.delayMs,
              tag: a.tag,
              title: this.t('notify.researchTitle'),
              body: this.t('notify.researchBody', { name: this.t(`r.${a.research}.t`) }),
              tab: this.t('notify.researchTab'),
              notify,
            }
          : {
              delayMs: a.delayMs,
              tag: a.tag,
              title: this.t('notify.contractTitle'),
              body: this.t('notify.contractBody', { item: this.t(`item.${a.item}`), n: a.left ?? 0 }),
              tab: this.t('notify.contractTab'),
              notify,
            },
      ),
    );
  }

  /** a card that stays until closed; a newer research card replaces the older one */
  notice(n: NoticeInput) {
    const id = ++this.toastId;
    const keep = this.ui.notices.filter((x) => !(n.kind === 'research' && x.kind === 'research'));
    this.ui.notices = [...keep, { ...n, id }].slice(-3);
    this.emit();
  }

  dismissNotice(id: number) {
    this.ui.notices = this.ui.notices.filter((n) => n.id !== id);
    this.emit();
  }

  /** answer to "notify me when research finishes?" */
  async answerNotify(yes: boolean) {
    this.ui.askNotify = false;
    this.state.settings.notify = yes && (await requestNotify()) ? 'on' : 'off';
    if (yes && this.state.settings.notify === 'off') this.toast(this.t('notify.blocked'), 'error');
    this.save();
    this.emit();
  }

  async setNotify(on: boolean) {
    await this.answerNotify(on);
  }

  private onHide = () => this.save();

  /** credits real time that passed while the game wasn't running */
  catchUp(away: number) {
    if (!(away > 0)) return;
    if (away < BALANCE.offlineMinSeconds) {
      const dt = BALANCE.tickSeconds;
      for (let t = 0; t < away; t += dt) tick(this.state, dt, this.events);
      return;
    }
    const report = applyOffline(this.state, away);
    if (report && (report.earned > 0 || report.researchDone.length)) this.ui.offline = report;
    const lastDone = report?.researchDone[report.researchDone.length - 1];
    if (lastDone) this.notice({ kind: 'research', research: lastDone as ResearchId });
    this.structureChanged();
  }

  save() {
    const now = Date.now();
    this.state.lastSaved = now;
    this.state.maxSeenTime = Math.max(this.state.maxSeenTime ?? 0, now);
    this.store.save(this.state);
  }

  /** swap in a different state (cloud save, new game) */
  replaceState(state: GameState, awaySeconds = 0) {
    this.state = state;
    this.ui = { ...this.ui, mode: { kind: 'select' }, selected: null, plot: null, linkPreview: null };
    setSoundEnabled(state.settings.sound);
    if (awaySeconds > 0) this.catchUp(awaySeconds);
    ensureDaily(this.state);
    this.structureChanged();
    this.save();
  }

  // ---------------------------------------------------------------- subscription

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getVersion = () => this.version;

  emit() {
    this.lastEmit = performance.now();
    this.version++;
    for (const l of this.listeners) l();
  }

  structureChanged() {
    this.structureVersion++;
    this.emit();
  }

  t(key: string, params?: Record<string, string | number>) {
    return translate(this.state.settings.lang, key, params);
  }

  play(name: Sfx) {
    sfx(name);
  }

  toast(text: string, kind: Toast['kind'] = 'info') {
    const id = ++this.toastId;
    this.ui.toasts = [...this.ui.toasts.slice(-2), { id, text, kind }];
    if (kind === 'error') this.play('error');
    this.emit();
    setTimeout(() => {
      this.ui.toasts = this.ui.toasts.filter((t) => t.id !== id);
      this.emit();
    }, Math.min(7000, Math.max(2800, text.length * 70)));
  }

  private result<T>(r: ActionResult<T>): r is { ok: true; value: T } {
    if (!r.ok) this.toast(this.t(r.reason), 'error');
    return r.ok;
  }

  /** for core functions that return an error key or null */
  private check(err: string | null): boolean {
    if (err) this.toast(this.t(err), 'error');
    return !err;
  }

  private runQuestCheck() {
    const q = checkQuests(this.state);
    if (q) {
      this.ui.questDone = q;
      this.play('quest');
      this.emit();
      setTimeout(() => {
        if (this.ui.questDone === q) {
          this.ui.questDone = null;
          this.emit();
        }
      }, 3500);
      this.structureChanged();
      this.runQuestCheck();
    }
  }

  // ---------------------------------------------------------------- modes

  setMode(mode: Mode) {
    if (mode.kind !== 'select') this.ui.tidy = null;
    this.ui.mode = mode;
    this.ui.linkPreview = null;
    if (mode.kind !== 'select') {
      this.ui.selected = null;
      this.ui.plot = null;
      this.ui.tile = null;
    }
    this.emit();
  }

  openPanel(panel: Panel) {
    this.ui.panel = this.ui.panel === panel ? 'none' : panel;
    if (this.ui.panel !== 'none' && this.ui.panel !== 'build') {
      this.ui.selected = null;
      this.ui.plot = null;
    }
    this.emit();
  }

  chooseBuild(type: BuildingType) {
    if (!isBuildingUnlocked(this.state, type)) return;
    this.ui.panel = 'none';
    this.setMode({ kind: 'build', type });
  }

  startLink(from: number) {
    this.setMode({ kind: 'link', from });
  }

  startMove(id: number) {
    this.setMode({ kind: 'move', id });
  }

  select(id: number | null) {
    this.ui.selected = id;
    this.ui.plot = null;
    this.ui.tile = null;
    this.emit();
  }

  /** centre the map on a rich vein (cycles through them) and show its info */
  focusVein() {
    const vs = this.state.veins;
    if (!vs.length) return;
    this.veinCursor = (this.veinCursor + 1) % vs.length;
    const v = vs[this.veinCursor];
    this.ui.panel = 'none';
    this.ui.focus = [v.x, v.y];
    const b = buildingAt(this.state, v.x, v.y);
    if (b) this.select(b.id);
    else {
      this.select(null);
      this.ui.tile = [v.x, v.y];
    }
    this.emit();
  }

  private veinCursor = -1;

  /** build an extractor (drill, lumber camp, fishing dock…) on the tile shown in the tile sheet */
  buildAtTile(type: BuildingType) {
    const tile = this.ui.tile;
    if (!tile || !isBuildingUnlocked(this.state, type)) return;
    const r = placeBuilding(this.state, type, tile[0], tile[1]);
    if (this.result(r)) {
      this.play('place');
      this.ui.tile = null;
      this.select(r.value.id);
      this.structureChanged();
    }
  }

  tapTile(x: number, y: number) {
    const mode = this.ui.mode;
    const hit = buildingAt(this.state, x, y);

    if (mode.kind === 'build') {
      const r = placeBuilding(this.state, mode.type, x, y);
      if (this.result(r)) {
        this.play('place');
        this.structureChanged();
        if (this.state.money < BUILDINGS[mode.type].cost) this.setMode({ kind: 'select' });
      }
      return;
    }

    if (mode.kind === 'move') {
      if (hit?.id === mode.id) {
        // tapping the building itself cancels
        this.setMode({ kind: 'select' });
        this.select(mode.id);
        return;
      }
      const r = moveBuilding(this.state, mode.id, x, y);
      if (this.result(r)) {
        this.play('place');
        this.setMode({ kind: 'select' });
        this.select(mode.id);
        this.structureChanged();
      }
      return;
    }

    if (mode.kind === 'link') {
      if (!hit) {
        this.setMode({ kind: 'select' });
        return;
      }
      if (mode.from === null) {
        this.setMode({ kind: 'link', from: hit.id });
        return;
      }
      if (hit.id === mode.from) {
        this.setMode({ kind: 'select' });
        return;
      }
      const r = createLink(this.state, mode.from, hit.id);
      if (this.result(r)) {
        if (!r.value.carries.length) this.toast(this.t('ui.linkCarriesNothing'), 'error');
        else this.play('link');
        this.setMode({ kind: 'select' });
        this.structureChanged();
      }
      return;
    }

    if (!hit && x >= 0 && y >= 0 && x < this.state.world.size && y < this.state.world.size && !isUnlocked(this.state, x, y)) {
      this.ui.selected = null;
      this.ui.plot = plotOf(x, y);
      this.emit();
      return;
    }
    this.select(hit ? hit.id : null);
    const inside = x >= 0 && y >= 0 && x < this.state.world.size && y < this.state.world.size;
    if (!hit && inside && (this.state.world.deposits[y * this.state.world.size + x] || terrainAt(this.state, x, y) !== TERRAIN.land)) {
      this.ui.tile = [x, y];
      this.emit();
    }
  }

  hoverTile(tile: [number, number] | null) {
    const prev = this.ui.hover;
    if (prev && tile && prev[0] === tile[0] && prev[1] === tile[1]) return;
    this.ui.hover = tile;
    const mode = this.ui.mode;
    if (mode.kind === 'link' && mode.from !== null && tile) {
      const hit = buildingAt(this.state, tile[0], tile[1]);
      this.ui.linkPreview = hit && hit.id !== mode.from ? { to: hit.id, plan: planLink(this.state, mode.from, hit.id) } : null;
    } else this.ui.linkPreview = null;
  }

  // ---------------------------------------------------------------- inspector

  upgrade(id: number) {
    if (this.result(upgradeBuilding(this.state, id))) {
      this.play('upgrade');
      this.structureChanged();
    }
  }

  demolish(id: number) {
    const r = removeBuilding(this.state, id);
    if (this.result(r)) {
      this.ui.selected = null;
      this.play('remove');
      this.structureChanged();
    }
  }

  setRecipe(id: number, recipe: RecipeId) {
    if (this.result(setRecipe(this.state, id, recipe))) this.structureChanged();
  }

  setBeltFilter(beltId: number, item: ItemId | null) {
    if (this.result(setBeltFilter(this.state, beltId, item))) this.structureChanged();
  }

  stepReserve(buildingId: number, item: ItemId, dir: 1 | -1) {
    if (this.result(stepReserve(this.state, buildingId, item, dir))) this.emit();
  }

  removeBelt(id: number) {
    if (this.result(removeLink(this.state, id))) this.structureChanged();
  }

  upgradeBelts() {
    if (this.result(upgradeBelts(this.state))) {
      this.play('upgrade');
      this.structureChanged();
    }
  }

  // ---------------------------------------------------------------- belts: tidy & view

  /** plan a tidier layout (all belts, or one building's) and show it for approval */
  previewTidy(buildingId?: number) {
    if (this.ui.busy) return;
    this.ui.busy = true;
    this.ui.panel = 'none';
    this.emit();
    // let the UI paint "working…" before the (up to ~0.5 s) search
    setTimeout(() => {
      const ids = buildingId !== undefined ? this.state.belts.filter((b) => b.from === buildingId || b.to === buildingId).map((b) => b.id) : undefined;
      const plan = this.state.belts.length ? planTidy(this.state, ids) : null;
      this.ui.busy = false;
      if (!plan) {
        this.toast(this.t('ui.tidyNothing'), 'info');
        this.emit();
        return;
      }
      this.ui.tidy = plan;
      this.ui.selected = null;
      this.ui.tile = null;
      this.ui.plot = null;
      this.setMode({ kind: 'select' });
    }, 30);
  }

  acceptTidy() {
    const plan = this.ui.tidy;
    if (!plan) return;
    this.ui.tidy = null;
    if (this.check(applyTidy(this.state, plan))) {
      this.play('link');
      this.toast(this.t('ui.tidyDone'), 'success');
    }
    this.structureChanged();
  }

  cancelTidy() {
    this.ui.tidy = null;
    this.emit();
  }

  get beltView(): BeltView {
    return this.state.settings.beltView ?? 'all';
  }

  cycleBeltView() {
    const order: BeltView[] = ['all', 'dim', 'selected'];
    this.state.settings.beltView = order[(order.indexOf(this.beltView) + 1) % order.length];
    this.toast(this.t(`ui.beltView.${this.beltView}`), 'info');
    this.structureChanged();
  }

  // ---------------------------------------------------------------- phase 2

  buyPlot() {
    const p = this.ui.plot;
    if (!p) return;
    if (this.check(buyPlot(this.state, p[0], p[1]))) {
      this.ui.plot = null;
      this.play('upgrade');
      this.structureChanged();
    }
  }

  research(id: ResearchId) {
    if (this.check(startResearch(this.state, id))) {
      this.play('click');
      this.ui.notices = this.ui.notices.filter((n) => n.kind !== 'research');
      if (this.state.settings.notify === undefined && notifyPermission() !== 'unsupported' && notifyPermission() !== 'denied') this.ui.askNotify = true;
      this.emit();
    }
  }

  cancelResearch() {
    cancelResearch(this.state);
    this.emit();
  }

  buyVehicle(type: VehicleType) {
    if (this.check(buyVehicle(this.state, type))) {
      this.play('place');
      this.emit();
    }
  }

  sellVehicle(id: number) {
    sellVehicle(this.state, id);
    this.emit();
  }

  setRoute(id: number, city: CityId, filter: ItemId | 'auto') {
    this.check(setRoute(this.state, id, city, filter));
    this.emit();
  }

  // ---------------------------------------------------------------- phase 3

  acceptContract(id: number) {
    if (this.check(acceptContract(this.state, id))) {
      this.play('click');
      this.emit();
    }
  }

  abandonContract(id: number) {
    abandonContract(this.state, id);
    this.emit();
  }

  rerollContracts() {
    this.check(rerollOffers(this.state));
    this.emit();
  }

  async claimDaily(id: string) {
    const isBonus = id === '__bonus';
    const gems = isBonus ? claimBonus(this.state) : claimMission(this.state, id);
    if (!gems) return;
    if (this.online?.signedIn()) {
      this.ui.busy = true;
      this.emit();
      const r = await this.online.claimDaily(this.state.daily.day, id, gems);
      this.ui.busy = false;
      if (r.ok) this.state.gems = r.gems;
      else this.toast(this.t(r.reason), 'error');
    } else {
      this.state.gems += gems;
    }
    this.toast(`+${gems} ${this.t('ui.gems')}`, 'success');
    this.play('quest');
    this.save();
    this.emit();
  }

  buyPerk(id: PerkId) {
    if (this.check(buyPerk(this.state, id))) {
      this.play('upgrade');
      this.save();
      this.emit();
    }
  }

  buyLicence(zone: ZoneId) {
    if (this.check(buyLicence(this.state, zone))) {
      this.play('prestige');
      this.toast(this.t('ui.licenceDone', { zone: this.t(`zone.${zone}`) }), 'success');
      this.save();
      this.online?.saveNow?.(this.state);
      this.structureChanged();
    }
  }

  // ---------------------------------------------------------------- gems

  async useGemItem(id: GemItemId) {
    if (!gemItemAvailable(this.state, id)) return;
    if (this.online?.signedIn()) {
      this.ui.busy = true;
      this.emit();
      const r = await this.online.spendGems(id);
      this.ui.busy = false;
      if (!r.ok) {
        this.toast(this.t(r.reason), 'error');
        this.emit();
        return;
      }
      this.state.gems = r.gems;
    } else if (!this.check(spendLocalGems(this.state, id))) return;

    const report = applyGemItem(this.state, id);
    if (report) this.ui.offline = { ...report, awaySeconds: report.seconds };
    this.play('upgrade');
    this.toast(this.t(`gem.${id}.done`), 'success');
    this.save();
    this.structureChanged();
  }

  // ---------------------------------------------------------------- misc

  skipTutorial() {
    skipTutorial(this.state);
    this.structureChanged();
  }

  openIntro() {
    this.ui = { ...this.ui, panel: 'none', intro: true };
    this.emit();
  }

  closeIntro() {
    this.ui.intro = false;
    if (this.state.quests.introSeen === false) {
      // a new player starts on this version: no "what's new" for it
      this.state.quests.introSeen = true;
      this.state.settings.seenVersion = __APP_VERSION__;
      this.save();
    }
    this.emit();
  }

  dismissWhatsNew() {
    this.state.settings.seenVersion = __APP_VERSION__;
    this.save();
    this.emit();
  }

  dismissOffline() {
    this.ui.offline = null;
    this.play('coins');
    this.emit();
  }

  setLang(lang: Lang) {
    this.state.settings.lang = lang;
    document.documentElement.lang = lang;
    this.structureChanged();
  }

  setPlayerName(name: string) {
    this.state.player = { name };
    this.save();
    this.emit();
  }

  setSound(on: boolean) {
    this.state.settings.sound = on;
    setSoundEnabled(on);
    if (on) this.play('click');
    this.emit();
  }

  reset() {
    this.store.clear();
    const fresh = newGame();
    fresh.settings = { ...this.state.settings };
    fresh.player = this.state.player; // the name belongs to the player, not the factory
    this.ui = { ...this.ui, panel: 'none', offline: null };
    this.replaceState(fresh);
  }

  selectedBuilding() {
    return this.ui.selected !== null ? getBuilding(this.state, this.ui.selected) : undefined;
  }
}
