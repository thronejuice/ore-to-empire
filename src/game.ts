import { BALANCE, BUILDINGS, type BuildingType, type RecipeId } from './config/balance';
import {
  createLink,
  placeBuilding,
  planLink,
  removeBuilding,
  removeLink,
  setRecipe,
  upgradeBelts,
  upgradeBuilding,
  type ActionResult,
  type LinkPlan,
} from './core/actions';
import { applyOffline, type OfflineReport } from './core/offline';
import { checkQuests, isBuildingUnlocked, skipTutorial, type QuestDef } from './core/quests';
import { localSave, type SaveStore } from './core/save';
import { tick, type SimEvent } from './core/sim';
import { buildingAt, getBuilding, newGame } from './core/state';
import type { GameState } from './core/types';
import { translate, type Lang } from './i18n';

export type Mode = { kind: 'select' } | { kind: 'build'; type: BuildingType } | { kind: 'link'; from: number | null };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface UiState {
  mode: Mode;
  selected: number | null;
  hover: [number, number] | null;
  linkPreview: { to: number; plan: ActionResult<LinkPlan> } | null;
  toasts: Toast[];
  offline: OfflineReport | null;
  questDone: QuestDef | null;
  panel: 'none' | 'build' | 'upgrades' | 'settings' | 'stats';
}

type Listener = () => void;

/**
 * Owns the GameState, runs the fixed-step simulation, and exposes every player
 * action. React subscribes for HUD updates; the Pixi renderer reads state directly
 * every frame.
 */
export class Game {
  state: GameState;
  ui: UiState = {
    mode: { kind: 'select' },
    selected: null,
    hover: null,
    linkPreview: null,
    toasts: [],
    offline: null,
    questDone: null,
    panel: 'none',
  };
  /** sim events since the renderer last drained them (sales → floating text) */
  events: SimEvent[] = [];
  /** bumps whenever something structural changes (renderer redraws static layers) */
  structureVersion = 0;

  private listeners = new Set<Listener>();
  private version = 0;
  private acc = 0;
  private lastFrame = 0;
  private lastEmit = 0;
  private lastSave = 0;
  private questTimer = 0;
  private raf = 0;
  private toastId = 0;

  constructor(private store: SaveStore = localSave) {
    const loaded = store.load();
    this.state = loaded ?? newGame();
    if (loaded) {
      const away = (Date.now() - loaded.lastSaved) / 1000;
      this.catchUp(away);
    }
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
      // the tab was throttled / asleep — treat as offline time
      this.catchUp(elapsed);
      elapsed = 0;
    }
    this.acc += Math.min(elapsed, 0.25);
    const dt = BALANCE.tickSeconds;
    while (this.acc >= dt) {
      tick(this.state, dt, this.events);
      this.acc -= dt;
    }
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);

    this.questTimer += elapsed;
    if (this.questTimer > 0.4) {
      this.questTimer = 0;
      this.runQuestCheck();
    }
    if (now - this.lastSave > BALANCE.autosaveSeconds * 1000) {
      this.lastSave = now;
      this.save();
    }
    if (now - this.lastEmit > 200) this.emit();
  }

  /** fraction of the way to the next sim tick — used to interpolate belt items */
  get alpha() {
    return this.acc / BALANCE.tickSeconds;
  }

  private onVisibility = () => {
    // When the tab comes back, step() sees the long gap and calls catchUp().
    if (document.visibilityState === 'hidden') this.save();
  };

  private onHide = () => this.save();

  /** credits real time that passed while the game wasn't running */
  private catchUp(away: number) {
    if (!(away > 0)) return; // clock moved backwards → no credit
    if (away < BALANCE.offlineMinSeconds) {
      // short gap: just simulate it normally
      const dt = BALANCE.tickSeconds;
      for (let t = 0; t < away; t += dt) tick(this.state, dt);
      return;
    }
    const report = applyOffline(this.state, away);
    if (report && report.earned > 0) this.ui.offline = report;
    this.structureChanged();
  }

  save() {
    this.state.lastSaved = Date.now();
    this.store.save(this.state);
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

  toast(text: string, kind: Toast['kind'] = 'info') {
    const id = ++this.toastId;
    this.ui.toasts = [...this.ui.toasts.slice(-2), { id, text, kind }];
    this.emit();
    setTimeout(() => {
      this.ui.toasts = this.ui.toasts.filter((t) => t.id !== id);
      this.emit();
    }, 2600);
  }

  private result<T>(r: ActionResult<T>): r is { ok: true; value: T } {
    if (!r.ok) this.toast(this.t(r.reason), 'error');
    return r.ok;
  }

  private runQuestCheck() {
    const q = checkQuests(this.state);
    if (q) {
      this.ui.questDone = q;
      this.emit();
      setTimeout(() => {
        if (this.ui.questDone === q) {
          this.ui.questDone = null;
          this.emit();
        }
      }, 3500);
      this.structureChanged(); // may unlock buildings
      this.runQuestCheck(); // several may complete at once
    }
  }

  // ---------------------------------------------------------------- modes

  setMode(mode: Mode) {
    this.ui.mode = mode;
    this.ui.linkPreview = null;
    if (mode.kind === 'build') this.ui.selected = null;
    this.emit();
  }

  openPanel(panel: UiState['panel']) {
    this.ui.panel = this.ui.panel === panel ? 'none' : panel;
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

  select(id: number | null) {
    this.ui.selected = id;
    this.emit();
  }

  /** a tap/click on the map, in tile coordinates */
  tapTile(x: number, y: number) {
    const mode = this.ui.mode;
    const hit = buildingAt(this.state, x, y);

    if (mode.kind === 'build') {
      const r = placeBuilding(this.state, mode.type, x, y);
      if (this.result(r)) {
        this.ui.selected = null;
        this.structureChanged();
        // keep building the same type until cancelled, unless it's unaffordable now
        if (this.state.money < BUILDINGS[mode.type].cost) this.setMode({ kind: 'select' });
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
        this.setMode({ kind: 'select' });
        this.structureChanged();
      }
      return;
    }

    this.select(hit ? hit.id : null);
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

  // ---------------------------------------------------------------- inspector actions

  upgrade(id: number) {
    if (this.result(upgradeBuilding(this.state, id))) this.structureChanged();
  }

  demolish(id: number) {
    const r = removeBuilding(this.state, id);
    if (this.result(r)) {
      this.ui.selected = null;
      this.structureChanged();
    }
  }

  setRecipe(id: number, recipe: RecipeId) {
    if (this.result(setRecipe(this.state, id, recipe))) this.structureChanged();
  }

  removeBelt(id: number) {
    if (this.result(removeLink(this.state, id))) this.structureChanged();
  }

  upgradeBelts() {
    if (this.result(upgradeBelts(this.state))) this.structureChanged();
  }

  skipTutorial() {
    skipTutorial(this.state);
    this.structureChanged();
  }

  dismissOffline() {
    this.ui.offline = null;
    this.emit();
  }

  setLang(lang: Lang) {
    this.state.settings.lang = lang;
    document.documentElement.lang = lang;
    this.structureChanged();
  }

  reset() {
    this.store.clear();
    this.state = newGame();
    this.ui = { ...this.ui, mode: { kind: 'select' }, selected: null, panel: 'none', offline: null };
    this.structureChanged();
    this.save();
  }

  selectedBuilding() {
    return this.ui.selected !== null ? getBuilding(this.state, this.ui.selected) : undefined;
  }
}
