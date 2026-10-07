import { Application, Container, Graphics, Text } from 'pixi.js';
import {
  BALANCE,
  BUILDINGS,
  EXTRACTORS,
  ITEMS,
  POWER,
  TERRAIN,
  VEINS,
  ZONES,
  ZONE_ORDER,
  beltSpeed,
  storageCapacity,
  type BuildingType,
  type DepositId,
  type ItemId,
} from '../config/balance';
import { plotForSale, plotPrice } from '../core/land';
import { extractAt, isExtractor, zoneLicensed, zoneOfPlot, zoneOfTile } from '../core/zones';
import { plotsPerRow } from '../core/state';
import { gradeAt } from '../core/veins';
import { beltCarries, canPlace } from '../core/actions';
import { pointAt } from '../core/pathfind';
import { getBuilding, hqPosition, idx, isUnlocked } from '../core/state';
import type { Belt, Building } from '../core/types';
import type { Game } from '../game';
import { fmtMoney } from '../i18n';
import { C, DEPOSIT_COLORS, TILE, WATER, ZONE_GROUND } from './theme';

interface Floater {
  text: Text;
  life: number;
}

const STATUS_COLOR: Record<string, number> = {
  working: C.green,
  idle: C.textDim,
  no_input: C.amber,
  output_full: C.red,
  no_power: C.amber,
  no_fuel: C.red,
  locked: C.textDim,
};

/**
 * Draws the factory with PixiJS and turns pointer input into game taps.
 * Static layers (ground, belts, buildings) redraw only when the structure changes;
 * items, animations and overlays redraw every frame.
 */
export class Renderer {
  app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private belts = new Graphics();
  private buildings = new Graphics();
  private labels = new Container();
  private dynamic = new Graphics();
  private overlay = new Graphics();
  private fx = new Container();

  private cam = { x: 0, y: 0, scale: 1 };
  private drawnVersion = -1;
  private drawnKey = '';
  private floaters: Floater[] = [];
  private saleAcc = new Map<number, number>();
  private saleTimer = 0;
  private time = 0;
  private destroyed = false;

  // pointer state
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; camX: number; camY: number } | null = null;
  private pinch: { dist: number; scale: number; mid: { x: number; y: number } } | null = null;
  private moved = false;

  constructor(private game: Game) {}

  async mount(el: HTMLElement) {
    await this.app.init({
      resizeTo: el,
      background: C.bg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    el.appendChild(this.app.canvas);
    this.app.canvas.style.touchAction = 'none';
    this.world.addChild(this.ground, this.belts, this.buildings, this.dynamic, this.labels, this.overlay, this.fx);
    this.app.stage.addChild(this.world);
    this.fitStart();
    this.bindInput();
    this.app.ticker.add((t) => this.frame(t.deltaMS / 1000));
  }

  destroy() {
    this.destroyed = true;
    try {
      this.app.destroy(true, { children: true });
    } catch {
      /* not initialised yet */
    }
  }

  // ------------------------------------------------------------------ camera

  private fitStart() {
    const s = this.game.state;
    const hq = hqPosition(s.world.size);
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    // show the 16×16 starting land with a little margin
    const span = 17 * TILE;
    this.cam.scale = Math.max(0.35, Math.min(1.6, Math.min(w, h - 120) / span));
    this.centerOn((hq.x + 1) * TILE, (hq.y + 1) * TILE);
    // on wide screens the quest card sits top-left: nudge the map right so it doesn't cover the land
    if (w > 900) {
      this.cam.x += 150;
      this.clampCam();
    }
  }

  /** screen position (CSS px) of a tile centre — used by tests and tutorials */
  tileToScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.cam.x + (x + 0.5) * TILE * this.cam.scale, y: this.cam.y + (y + 0.5) * TILE * this.cam.scale };
  }

  private centerOn(wx: number, wy: number) {
    this.cam.x = this.app.screen.width / 2 - wx * this.cam.scale;
    this.cam.y = this.app.screen.height / 2 - wy * this.cam.scale;
    this.clampCam();
  }

  private clampCam() {
    const size = this.game.state.world.size * TILE * this.cam.scale;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const m = 120;
    this.cam.x = Math.min(m + w / 2, Math.max(w / 2 - size - m, this.cam.x));
    this.cam.y = Math.min(m + h / 2, Math.max(h / 2 - size - m, this.cam.y));
  }

  private zoomAt(sx: number, sy: number, factor: number) {
    const ns = Math.max(0.3, Math.min(2.5, this.cam.scale * factor));
    const wx = (sx - this.cam.x) / this.cam.scale;
    const wy = (sy - this.cam.y) / this.cam.scale;
    this.cam.scale = ns;
    this.cam.x = sx - wx * ns;
    this.cam.y = sy - wy * ns;
    this.clampCam();
  }

  private screenToTile(sx: number, sy: number): [number, number] {
    return [Math.floor((sx - this.cam.x) / this.cam.scale / TILE), Math.floor((sy - this.cam.y) / this.cam.scale / TILE)];
  }

  // ------------------------------------------------------------------ input

  private bindInput() {
    const c = this.app.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) {
        this.dragStart = { x: p.x, y: p.y, camX: this.cam.x, camY: this.cam.y };
        this.moved = false;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.cam.scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        this.moved = true;
      }
    });

    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (e.pointerType === 'mouse') this.game.hoverTile(this.screenToTile(p.x, p.y));
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, p);
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = this.pinch.scale * (d / this.pinch.dist);
        this.zoomAt(this.pinch.mid.x, this.pinch.mid.y, target / this.cam.scale);
        return;
      }
      if (this.dragStart) {
        const dx = p.x - this.dragStart.x;
        const dy = p.y - this.dragStart.y;
        if (!this.moved && Math.hypot(dx, dy) > 8) this.moved = true;
        if (this.moved) {
          this.cam.x = this.dragStart.camX + dx;
          this.cam.y = this.dragStart.camY + dy;
          this.clampCam();
        }
      }
    });

    const end = (e: PointerEvent) => {
      const p = local(e);
      const wasTap = this.pointers.size === 1 && !this.moved && this.dragStart;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 0) this.dragStart = null;
      if (wasTap && e.type === 'pointerup') {
        const tile = this.screenToTile(p.x, p.y);
        if (e.pointerType !== 'mouse') this.game.hoverTile(tile); // so touch gets the link preview too
        this.game.tapTile(tile[0], tile[1]);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.game.hoverTile(null);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e);
        this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  // ------------------------------------------------------------------ frame

  private frame(dt: number) {
    this.time += dt;
    const focus = this.game.ui.focus;
    if (focus) {
      this.game.ui.focus = null;
      this.cam.scale = Math.max(this.cam.scale, 0.9);
      // on phones the info sheet covers the lower half: aim at the upper third instead
      const shift = this.app.screen.width <= 720 ? (this.app.screen.height * 0.2) / this.cam.scale : 0;
      this.centerOn((focus[0] + 0.5) * TILE, (focus[1] + 0.5) * TILE + shift);
    }
    this.world.position.set(this.cam.x, this.cam.y);
    this.world.scale.set(this.cam.scale);

    const zoomBucket = this.cam.scale < 0.55 ? 'far' : 'near';
    const ui = this.game.ui;
    const key = `${this.game.state.settings.lang}|${this.game.beltView}|${ui.selected}|${zoomBucket}|${ui.tidy ? 'tidy' : ''}`;
    if (this.drawnVersion !== this.game.structureVersion || this.drawnKey !== key) {
      this.drawnVersion = this.game.structureVersion;
      this.drawnKey = key;
      this.drawGround();
      this.drawBelts();
      this.drawBuildings();
    }
    this.drawDynamic();
    this.drawOverlay();
    this.updateFx(dt);
  }

  // ------------------------------------------------------------------ static layers

  private drawGround() {
    const s = this.game.state;
    const g = this.ground.clear();
    const n = s.world.size;
    const terrain = s.world.terrain;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x * TILE;
        const py = y * TILE;
        const locked = !isUnlocked(s, x, y);
        const t = terrain?.[idx(s, x, y)] ?? TERRAIN.land;
        if (t === TERRAIN.river || t === TERRAIN.sea) {
          this.water(g, x, y, t === TERRAIN.river, locked);
          continue;
        }
        const zg = ZONE_GROUND[zoneOfTile(x, y)];
        if (locked) {
          g.rect(px, py, TILE, TILE).fill(zg[2]);
          if ((x + y) % 2 === 0) g.moveTo(px, py + TILE).lineTo(px + TILE, py).stroke({ width: 1, color: C.lockedHatch, alpha: 0.7 });
        } else {
          g.rect(px, py, TILE, TILE).fill((x + y) % 2 ? zg[0] : zg[1]);
          g.rect(px, py, TILE, TILE).stroke({ width: 1, color: C.gridLine, alpha: 0.6 });
        }
        if (t === TERRAIN.vent) {
          const cx = px + TILE / 2;
          const cy = py + TILE / 2;
          g.circle(cx, cy, 13).fill({ color: WATER.vent, alpha: locked ? 0.6 : 1 });
          g.circle(cx, cy, 7).fill({ color: WATER.ventGlow, alpha: locked ? 0.25 : 0.55 });
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + 0.4;
            g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8).lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15);
          }
          g.stroke({ width: 1.5, color: WATER.ventGlow, alpha: locked ? 0.2 : 0.45 });
        }
      }
    }
    // deposits
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = s.world.deposits[idx(s, x, y)];
        if (!d) continue;
        this.deposit(g, d, x, y, !isUnlocked(s, x, y));
      }
    }
    // plot borders of the owned land
    const p = BALANCE.plotSize;
    const plots = n / p;
    for (let py = 0; py < plots; py++)
      for (let px = 0; px < plots; px++) {
        if (!s.world.plots[py * plots + px]) continue;
        const own = (qx: number, qy: number) => qx >= 0 && qy >= 0 && qx < plots && qy < plots && s.world.plots[qy * plots + qx];
        const x0 = px * p * TILE;
        const y0 = py * p * TILE;
        const L = p * TILE;
        const st = { width: 3, color: C.orange, alpha: 0.55 };
        if (!own(px, py - 1)) g.moveTo(x0, y0).lineTo(x0 + L, y0).stroke(st);
        if (!own(px, py + 1)) g.moveTo(x0, y0 + L).lineTo(x0 + L, y0 + L).stroke(st);
        if (!own(px - 1, py)) g.moveTo(x0, y0).lineTo(x0, y0 + L).stroke(st);
        if (!own(px + 1, py)) g.moveTo(x0 + L, y0).lineTo(x0 + L, y0 + L).stroke(st);
      }
    // zone edges (dashed), so the five regions read at a glance
    for (let py = 0; py < plots; py++)
      for (let px = 0; px < plots; px++) {
        const z = zoneOfPlot(px, py);
        const x0 = px * p * TILE;
        const y0 = py * p * TILE;
        const L = p * TILE;
        const dash = (ax: number, ay: number, bx: number, by: number) => {
          for (let d = 0; d < L; d += 16) {
            const t0 = d / L;
            const t1 = Math.min(1, (d + 8) / L);
            g.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0).lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
          }
        };
        if (px + 1 < plots && zoneOfPlot(px + 1, py) !== z) dash(x0 + L, y0, x0 + L, y0 + L);
        if (py + 1 < plots && zoneOfPlot(px, py + 1) !== z) dash(x0, y0 + L, x0 + L, y0 + L);
      }
    g.stroke({ width: 2, color: 0xc9d1dc, alpha: 0.18 });
  }

  private water(g: Graphics, x: number, y: number, river: boolean, locked: boolean) {
    const px = x * TILE;
    const py = y * TILE;
    g.rect(px, py, TILE, TILE).fill(locked ? (river ? WATER.lockedRiver : WATER.lockedSea) : river ? WATER.river : WATER.sea);
    // two little wave strokes per tile, offset by position so the surface doesn't look tiled
    let h = (x * 73856093) ^ (y * 19349663);
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const wx = px + 6 + (h % 14);
    const wy = py + 10 + ((h >> 4) % 18);
    const col = river ? WATER.riverWave : WATER.seaWave;
    g.moveTo(wx, wy).bezierCurveTo(wx + 4, wy - 3, wx + 8, wy + 3, wx + 12, wy).stroke({ width: 1.5, color: col, alpha: locked ? 0.25 : 0.6 });
    g.moveTo(wx + 8, wy + 12).bezierCurveTo(wx + 12, wy + 9, wx + 16, wy + 15, wx + 20, wy + 12).stroke({ width: 1.5, color: col, alpha: locked ? 0.2 : 0.45 });
  }

  private deposit(g: Graphics, d: DepositId, x: number, y: number, locked: boolean) {
    const col = DEPOSIT_COLORS[d];
    const px = x * TILE;
    const py = y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const a = locked ? 0.45 : 1;
    let h = (x * 73856093) ^ (y * 19349663);
    const rnd = () => {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      return h;
    };
    if (d === 'wood') {
      // a little grove: three overlapping canopies with a trunk
      g.rect(cx - 2, cy + 4, 4, 9).fill({ color: 0x5a3d22, alpha: a });
      const offs = [
        [-6, 0, 9],
        [6, -2, 9],
        [0, -8, 10],
      ];
      for (const [ox, oy, r] of offs) g.circle(cx + ox + (rnd() % 3) - 1, cy + oy, r).fill({ color: col.fill, alpha: a });
      for (const [ox, oy, r] of offs) g.circle(cx + ox - 2, cy + oy - 2, r * 0.55).fill({ color: col.fleck, alpha: a * 0.8 });
      return;
    }
    if (d === 'flower') {
      g.roundRect(px + 3, py + 3, TILE - 6, TILE - 6, 8).fill({ color: col.fill, alpha: a });
      for (let i = 0; i < 4; i++) {
        const fx = px + 9 + (rnd() % 22);
        const fy = py + 9 + (rnd() % 22);
        const colr = [0xf07ab8, 0xffd34a, 0xffffff, 0xb58aff][rnd() % 4];
        for (let k = 0; k < 5; k++) {
          const ang = (k * Math.PI * 2) / 5;
          g.circle(fx + Math.cos(ang) * 2.6, fy + Math.sin(ang) * 2.6, 2).fill({ color: colr, alpha: a });
        }
        g.circle(fx, fy, 1.4).fill({ color: 0xffc94a, alpha: a });
      }
      return;
    }
    if (d === 'crude_oil') {
      g.ellipse(cx, cy + 2, 15, 11).fill({ color: col.fill, alpha: a });
      g.ellipse(cx - 4, cy - 1, 6, 3).fill({ color: col.fleck, alpha: a * 0.6 });
      g.ellipse(cx + 5, cy + 5, 3, 1.5).fill({ color: 0xffffff, alpha: a * 0.18 });
      return;
    }
    g.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 6).fill({ color: col.fill, alpha: a });
    // deterministic flecks: richer ore = more, bigger flecks
    const grade = gradeAt(this.game.state, x, y);
    const count = [3, 6, 10][grade];
    const size = [2.4, 3, 3.4][grade];
    const fa = locked ? 0.3 : grade === 0 ? 0.6 : 0.9;
    for (let i = 0; i < count; i++) {
      const fx = px + 7 + (rnd() % 26);
      const fy = py + 7 + (rnd() % 26);
      if (d === 'clay') g.circle(fx, fy, size * 1.1).fill({ color: col.fleck, alpha: fa }); // soft lumps
      else if (d === 'sulfur') g.poly([fx, fy - size * 1.2, fx + size, fy + size * 0.8, fx - size, fy + size * 0.8]).fill({ color: col.fleck, alpha: fa }); // crystals
      else if (d === 'obsidian') g.poly([fx, fy - size * 1.5, fx + size * 0.6, fy, fx, fy + size * 1.5, fx - size * 0.6, fy]).fill({ color: col.fleck, alpha: fa }); // shards
      else g.poly([fx, fy - size, fx + size, fy, fx, fy + size, fx - size, fy]).fill({ color: col.fleck, alpha: fa });
    }
    if (grade === 2 && !locked) g.roundRect(px + 3, py + 3, TILE - 6, TILE - 6, 5).stroke({ width: 1.5, color: col.fleck, alpha: 0.55 });
  }

  /** 0..1 visibility of a belt under the current view mode */
  beltAlpha(belt: Belt): number {
    const ui = this.game.ui;
    if (ui.tidy) return 0.25; // the preview is drawn on top
    const sel = ui.selected;
    const mine = sel !== null && (belt.from === sel || belt.to === sel);
    switch (this.game.beltView) {
      case 'dim':
        return mine ? 1 : 0.3;
      case 'selected':
        return mine ? 1 : sel === null ? 0.12 : 0;
      default:
        return 1;
    }
  }

  /** colour of what a belt carries (its first accepted item), for the belt's edge */
  private cargoColor(belt: Belt): number {
    const s = this.game.state;
    const from = getBuilding(s, belt.from);
    const to = getBuilding(s, belt.to);
    if (!from || !to) return C.beltEdge;
    const carries = beltCarries(s, belt);
    if (!carries.length) return C.bad;
    if (from.type === 'warehouse' && carries.length > 3) return C.beltEdge; // mixed cargo
    return ITEMS[carries[0]].color;
  }

  private drawBelts() {
    const g = this.belts.clear();
    const s = this.game.state;
    const thin = this.cam.scale < 0.55 ? 0.6 : 1;
    const wEdge = TILE * 0.5 * thin;
    const wBody = TILE * 0.36 * thin;
    const colors = new Map(s.belts.map((b) => [b.id, this.cargoColor(b)]));

    for (const belt of s.belts) {
      const a = this.beltAlpha(belt);
      if (a <= 0) continue;
      const pts = belt.points.flatMap(([x, y]) => [x * TILE, y * TILE]);
      this.strokePath(g, pts, wEdge, colors.get(belt.id)!, a * 0.75);
      this.strokePath(g, pts, wBody, C.beltBody, a);
    }

    // bridges: where a belt runs over cells an earlier belt already uses, draw it raised
    const seen = new Set<number>();
    for (const belt of s.belts) {
      const a = this.beltAlpha(belt);
      for (let i = 0; i < belt.path.length; i++) {
        const [x, y] = belt.path[i];
        const k = idx(s, x, y);
        if (!seen.has(k)) {
          seen.add(k);
          continue;
        }
        if (a <= 0) continue;
        const prev = i > 0 ? belt.path[i - 1] : null;
        const next = i < belt.path.length - 1 ? belt.path[i + 1] : null;
        const [dx, dy] = next ? [next[0] - x, next[1] - y] : prev ? [x - prev[0], y - prev[1]] : [1, 0];
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        const half = TILE * 0.5;
        const seg = [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half];
        g.moveTo(seg[0] + 2, seg[1] + 3).lineTo(seg[2] + 2, seg[3] + 3).stroke({ width: wEdge + 4, color: 0x000000, alpha: 0.45 * a });
        this.strokePath(g, seg, wEdge + 2, colors.get(belt.id)!, a);
        this.strokePath(g, seg, wBody, 0x323b48, a);
        // rails
        const nx = -dy * (wEdge / 2 + 0.5);
        const ny = dx * (wEdge / 2 + 0.5);
        g.moveTo(seg[0] + nx, seg[1] + ny).lineTo(seg[2] + nx, seg[3] + ny).moveTo(seg[0] - nx, seg[1] - ny).lineTo(seg[2] - nx, seg[3] - ny).stroke({ width: 1.5, color: 0xdfe6ee, alpha: 0.5 * a });
      }
    }

    // tidy preview: the proposed routes, bright, over the faded current ones
    const plan = this.game.ui.tidy;
    if (plan) {
      for (const belt of s.belts) {
        const r = plan.routes.get(belt.id);
        const points = r ? r.points : belt.points;
        const pts = points.flatMap(([x, y]) => [x * TILE, y * TILE]);
        this.strokePath(g, pts, wEdge, r ? C.ok : colors.get(belt.id)!, r ? 0.9 : 0.6);
        this.strokePath(g, pts, wBody, C.beltBody, 0.9);
      }
    }
  }

  private strokePath(g: Graphics, pts: number[], width: number, color: number, alpha = 1) {
    if (pts.length < 4) return;
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }

  private drawBuildings() {
    const g = this.buildings.clear();
    for (const c of this.labels.removeChildren()) c.destroy();
    for (const b of this.game.state.buildings) this.drawBuilding(g, b);
    this.drawPlotTags();
  }

  private drawPlotTags() {
    const s = this.game.state;
    const n = plotsPerRow(s);
    const P = BALANCE.plotSize * TILE;
    const style = { fontFamily: 'IBM Plex Sans Thai, sans-serif', fontSize: 15, fontWeight: '600' as const, fill: 0xc9d1dc, align: 'center' as const, lineHeight: 20 };
    for (let py = 0; py < n; py++)
      for (let px = 0; px < n; px++) {
        if (!plotForSale(s, px, py)) continue;
        const t = new Text({ text: `${this.game.t('ui.landForSale')}\n${fmtMoney(plotPrice(s, px, py))}`, style, resolution: 3 });
        t.anchor.set(0.5);
        t.alpha = 0.75;
        t.position.set(px * P + P / 2, py * P + P / 2);
        this.labels.addChild(t);
      }
    // one big name + licence price over each zone that isn't licensed yet
    for (const zone of ZONE_ORDER) {
      if (zoneLicensed(s, zone)) continue;
      let sx = 0;
      let sy = 0;
      let c = 0;
      for (let py = 0; py < n; py++)
        for (let px = 0; px < n; px++)
          if (zoneOfPlot(px, py) === zone) {
            sx += px;
            sy += py;
            c++;
          }
      if (!c) continue;
      const t = new Text({
        text: `${this.game.t(`zone.${zone}`)}\n${this.game.t('ui.licenceTag', { money: fmtMoney(ZONES[zone].licence) })}`,
        style: { ...style, fontSize: 30, fontWeight: '700', lineHeight: 38 },
        resolution: 2,
      });
      t.anchor.set(0.5);
      t.alpha = 0.45;
      t.position.set((sx / c + 0.5) * P, (sy / c + 0.5) * P);
      this.labels.addChild(t);
    }
  }

  private drawBuilding(g: Graphics, b: Building) {
    const def = BUILDINGS[b.type];
    const x = b.x * TILE;
    const y = b.y * TILE;
    const w = def.w * TILE;
    const h = def.h * TILE;
    const pad = 3;
    // shadow + body
    g.roundRect(x + pad + 2, y + pad + 3, w - pad * 2, h - pad * 2, 7).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, 7).fill(C.panel).stroke({ width: 2, color: def.color });
    // header stripe
    g.roundRect(x + pad + 3, y + pad + 3, w - pad * 2 - 6, 4, 2).fill({ color: def.color, alpha: 0.9 });

    const cx = x + w / 2;
    const cy = y + h / 2 + 2;
    switch (b.type) {
      case 'hq': {
        g.roundRect(cx - 22, cy - 14, 44, 30, 4).fill(0x2c3440).stroke({ width: 2, color: C.orange });
        for (let i = 0; i < 3; i++) g.rect(cx - 16 + i * 12, cy - 8, 8, 8).fill({ color: C.amber, alpha: 0.75 });
        g.rect(cx - 5, cy + 4, 10, 12).fill(C.orange);
        const t = new Text({ text: 'HQ', style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: '700', fill: C.orange }, resolution: 3 });
        t.anchor.set(0.5);
        t.position.set(cx, y + 18);
        this.labels.addChild(t);
        break;
      }
      case 'furnace':
        g.roundRect(cx - 11, cy - 9, 22, 18, 3).fill(0x3a2620).stroke({ width: 1.5, color: 0x6a3a2c });
        break;
      case 'warehouse':
        g.rect(cx - 12, cy - 10, 24, 20).fill(0x3a3326).stroke({ width: 1.5, color: 0x8c7a5b });
        g.moveTo(cx - 12, cy - 10).lineTo(cx + 12, cy + 10).stroke({ width: 1.5, color: 0x8c7a5b });
        g.moveTo(cx + 12, cy - 10).lineTo(cx - 12, cy + 10).stroke({ width: 1.5, color: 0x8c7a5b });
        break;
      case 'coal_plant':
        g.roundRect(cx - 24, cy - 6, 48, 24, 4).fill(0x2a2640).stroke({ width: 1.5, color: 0x6f5ae0 });
        g.rect(cx - 18, cy - 22, 9, 18).fill(0x3a3550);
        g.rect(cx + 8, cy - 26, 9, 22).fill(0x3a3550);
        g.poly([cx - 4, cy + 1, cx + 2, cy + 1, cx - 1, cy + 7, cx + 4, cy + 7, cx - 4, cy + 16, cx - 1, cy + 9, cx - 5, cy + 9]).fill(C.amber);
        break;
      case 'fabricator':
        g.roundRect(cx - 28, cy - 22, 56, 44, 6).fill(0x2a2440).stroke({ width: 1.5, color: 0x9d6bff });
        break;
      case 'dock':
        g.rect(cx - 30, cy + 4, 60, 16).fill(0x1b3a40);
        for (let i = 0; i < 3; i++) g.rect(cx - 26 + i * 18, cy - 8 + (i % 2) * 4, 14, 12).fill([0x23b5c9, 0xff8a3d, 0x9fb0c4][i]);
        g.moveTo(cx + 22, cy + 18).lineTo(cx + 22, cy - 26).lineTo(cx - 8, cy - 26).stroke({ width: 3, color: 0xffc94a });
        g.moveTo(cx - 6, cy - 26).lineTo(cx - 6, cy - 14).stroke({ width: 1.5, color: 0xffc94a });
        break;
      case 'solar':
        g.rect(cx - 13, cy - 11, 26, 20).fill(0x123a5c).stroke({ width: 1.5, color: 0x3fa9f5 });
        g.moveTo(cx, cy - 11).lineTo(cx, cy + 9).moveTo(cx - 13, cy - 1).lineTo(cx + 13, cy - 1).stroke({ width: 1, color: 0x3fa9f5, alpha: 0.7 });
        break;
      case 'battery':
        g.roundRect(cx - 9, cy - 12, 18, 24, 3).stroke({ width: 2, color: 0xa0e050 });
        g.rect(cx - 4, cy - 15, 8, 3).fill(0xa0e050);
        break;
      case 'nuclear_plant':
        g.poly([cx - 34, cy + 36, cx - 28, cy - 18, cx - 6, cy - 18, cx, cy + 36]).fill(0x2c3a33).stroke({ width: 2, color: 0x5fe08a });
        g.poly([cx + 4, cy + 36, cx + 10, cy - 6, cx + 30, cy - 6, cx + 36, cy + 36]).fill(0x2c3a33).stroke({ width: 2, color: 0x5fe08a });
        g.circle(cx - 17, cy + 14, 7).stroke({ width: 2, color: 0x5fe08a, alpha: 0.6 });
        break;
      case 'depot':
        g.roundRect(cx - 12, cy - 10, 24, 20, 3).fill(0x1f3a32).stroke({ width: 1.5, color: 0x2fbf8f });
        {
          const t = new Text({ text: '$', style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: '700', fill: 0x2fbf8f }, resolution: 3 });
          t.anchor.set(0.5);
          t.position.set(cx, cy);
          this.labels.addChild(t);
        }
        break;
      case 'fishing_dock':
        g.rect(cx - 14, cy + 2, 28, 6).fill(0x5a3d22);
        g.rect(cx - 11, cy + 8, 3, 8).rect(cx + 8, cy + 8, 3, 8).fill(0x3d2a16);
        g.moveTo(cx + 6, cy + 2).lineTo(cx + 14, cy - 14).stroke({ width: 2, color: 0x9a6b3f });
        break;
      case 'seaweed_farm':
        g.rect(cx - 14, cy - 12, 28, 26).stroke({ width: 1.5, color: 0x3f9a5c, alpha: 0.8 });
        g.moveTo(cx - 14, cy).lineTo(cx + 14, cy).stroke({ width: 1, color: 0x3f9a5c, alpha: 0.6 });
        break;
      case 'clay_pit':
        g.ellipse(cx, cy + 3, 13, 9).fill(0x4a2e22).stroke({ width: 1.5, color: 0xb87a56 });
        break;
      case 'lumber_camp':
        g.rect(cx - 13, cy + 4, 26, 8).fill(0x5a3d22);
        g.circle(cx - 8, cy + 8, 4).circle(cx + 8, cy + 8, 4).fill(0x9a6b3f);
        break;
      case 'flower_garden':
        g.roundRect(cx - 13, cy - 11, 26, 24, 4).fill(0x24331f).stroke({ width: 1.5, color: 0xf07ab8, alpha: 0.7 });
        break;
      case 'oil_pump':
        g.poly([cx - 12, cy + 14, cx - 4, cy - 6, cx + 4, cy + 14]).stroke({ width: 2, color: 0x8a7a9a });
        g.rect(cx + 6, cy + 6, 8, 8).fill(0x2b2530).stroke({ width: 1, color: 0x8a7a9a });
        break;
      case 'refinery':
        g.roundRect(cx - 28, cy - 4, 30, 24, 4).fill(0x3a2a1c).stroke({ width: 1.5, color: 0xd98a3f });
        g.rect(cx + 8, cy - 26, 10, 46).fill(0x4a3a2a).stroke({ width: 1.5, color: 0xd98a3f });
        g.circle(cx - 18, cy - 14, 9).fill(0x4a3a2a).stroke({ width: 1.5, color: 0xd98a3f });
        g.circle(cx - 2, cy - 16, 7).fill(0x4a3a2a).stroke({ width: 1.5, color: 0xd98a3f });
        break;
      case 'geothermal':
        g.roundRect(cx - 28, cy - 2, 56, 22, 4).fill(0x3a1c18).stroke({ width: 1.5, color: 0xff5a3d });
        g.poly([cx - 22, cy - 2, cx - 16, cy - 24, cx - 4, cy - 24, cx + 2, cy - 2]).fill(0x4a2a24).stroke({ width: 1.5, color: 0xff5a3d });
        g.rect(cx + 10, cy - 18, 8, 16).fill(0x4a2a24);
        break;
      default:
        break;
    }
    if (b.level > 1) {
      const t = new Text({
        text: String(b.level),
        style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: '700', fill: 0x0f1318 },
        resolution: 4,
      });
      g.roundRect(x + w - 15, y + h - 14, 12, 11, 3).fill(C.amber);
      t.anchor.set(0.5);
      t.position.set(x + w - 9, y + h - 8.5);
      this.labels.addChild(t);
    }
  }

  // ------------------------------------------------------------------ per-frame

  private drawDynamic() {
    const s = this.game.state;
    const g = this.dynamic.clear();
    const speed = beltSpeed(s.beltLevel);
    const lead = this.game.alpha * BALANCE.tickSeconds * speed;

    // belt chevrons, scrolling at belt speed
    const offset = (this.time * speed) % 1;
    const showMoving = !this.game.ui.tidy;
    for (const belt of s.belts) {
      if (!showMoving || this.beltAlpha(belt) < 0.5) continue;
      for (let d = offset; d < belt.length; d += 1) this.chevron(g, belt, d);
    }

    // items
    for (const belt of s.belts) {
      if (!showMoving || this.beltAlpha(belt) <= 0.15) continue;
      const faded = this.beltAlpha(belt) < 1;
      let prev = Infinity;
      for (let i = 0; i < belt.items.length; i++) {
        const it = belt.items[i];
        const limit = i === 0 ? belt.length : prev - BALANCE.beltSpacing;
        const pos = Math.max(it.pos, Math.min(it.pos + lead, limit));
        prev = pos;
        const [px, py] = pointAt(belt.points, pos);
        this.item(g, it.item, px * TILE, py * TILE, faded ? 4.5 : 6.5);
      }
    }

    // rich veins: golden pulse, remaining-amount bar, fade timer when unclaimed
    for (const v of s.veins) {
      const px = v.x * TILE;
      const py = v.y * TILE;
      const glow = 0.45 + 0.4 * Math.sin(this.time * 4 + v.id);
      const frac = v.amount / v.total;
      const low = frac <= VEINS.lowFraction;
      g.roundRect(px - 1, py - 1, TILE + 2, TILE + 2, 8).stroke({ width: 3, color: low ? C.red : C.amber, alpha: glow });
      for (let k = 0; k < 3; k++) {
        const a = this.time * 1.4 + (k * Math.PI * 2) / 3 + v.id;
        const sx = px + TILE / 2 + Math.cos(a) * 15;
        const sy = py + TILE / 2 + Math.sin(a) * 15;
        g.star(sx, sy, 4, 3.2, 1.2, a).fill({ color: 0xfff1b8, alpha: 0.85 });
      }
      g.rect(px + 4, py + TILE + 2, TILE - 8, 4).fill({ color: 0x000000, alpha: 0.6 });
      g.rect(px + 4, py + TILE + 2, (TILE - 8) * frac, 4).fill(low ? C.red : C.amber);
      const claimed = s.buildings.some((b) => b.type === 'miner' && b.x === v.x && b.y === v.y);
      if (!claimed) {
        const t = Math.max(0, v.ttl / VEINS.unclaimedTtl);
        g.moveTo(px + TILE / 2, py - 8).arc(px + TILE / 2, py - 8, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t).stroke({ width: 2, color: 0xfff1b8, alpha: 0.9 });
      }
    }

    // machine animations + status lights
    for (const b of s.buildings) {
      const def = BUILDINGS[b.type];
      const cx = (b.x + def.w / 2) * TILE;
      const cy = (b.y + def.h / 2) * TILE + 2;
      const working = b.status === 'working';
      const rate = working ? s.power.satisfaction : 0;
      const spin = this.time * 3 * rate * (1 + (b.level - 1) * 0.3);
      if (b.type === 'miner') {
        g.circle(cx, cy, 12).fill(0x2c3440).stroke({ width: 1.5, color: 0x5d6b7d });
        for (let k = 0; k < 3; k++) {
          const a = spin + (k * Math.PI * 2) / 3;
          g.poly([cx, cy, cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, cx + Math.cos(a + 0.6) * 8, cy + Math.sin(a + 0.6) * 8]).fill(0x9fb0c4);
        }
        g.circle(cx, cy, 3).fill(C.orange);
      } else if (b.type === 'assembler') {
        g.star(cx, cy, 8, 12, 9, spin * 0.6).fill(0x2c4a70).stroke({ width: 1.5, color: C.blue });
        g.circle(cx, cy, 4).fill(C.panel);
      } else if (b.type === 'furnace') {
        const glow = working ? 0.55 + 0.35 * Math.sin(this.time * 6 + b.id) : 0.12;
        g.roundRect(cx - 8, cy - 5, 16, 10, 2).fill({ color: 0xff6a2a, alpha: glow });
      } else if (b.type === 'coal_plant' && b.burn > 0) {
        for (let k = 0; k < 3; k++) {
          const t = (this.time * 0.6 + k / 3) % 1;
          const sx = cx + 12.5 + Math.sin(t * 6 + k) * 3;
          g.circle(sx, cy - 28 - t * 22, 4 + t * 6).fill({ color: 0x8a96a8, alpha: 0.35 * (1 - t) });
        }
      } else if (b.type === 'warehouse' || b.type === 'dock') {
        let total = 0;
        for (const k in b.input) total += b.input[k as ItemId] ?? 0;
        const f = Math.min(1, total / storageCapacity(b.type, b.level));
        const w = def.w * TILE - 14;
        g.rect(b.x * TILE + 7, (b.y + def.h) * TILE - 8, w * f, 3).fill(f > 0.95 ? C.red : C.amber);
      } else if (b.type === 'fabricator') {
        g.star(cx - 11, cy, 8, 13, 9.5, spin * 0.5).fill(0x3a2f5c).stroke({ width: 1.5, color: 0x9d6bff });
        g.star(cx + 12, cy + 6, 6, 9, 6.5, -spin * 0.7 + 0.4).fill(0x3a2f5c).stroke({ width: 1.5, color: 0xc4a8ff });
        g.circle(cx - 11, cy, 4).fill(C.panel);
      } else if (b.type === 'battery') {
        const f = (b.charge ?? 0) / POWER.batteryCapacity;
        g.rect(cx - 6, cy + 9 - 19 * f, 12, 19 * f).fill({ color: 0xa0e050, alpha: 0.85 });
      } else if (b.type === 'nuclear_plant' && b.burn > 0) {
        const glow = 0.4 + 0.3 * Math.sin(this.time * 3);
        g.circle(cx - 17, cy + 14, 5).fill({ color: 0x5fe08a, alpha: glow });
        for (let k = 0; k < 3; k++) {
          const t = (this.time * 0.35 + k / 3) % 1;
          g.circle(cx - 17 + Math.sin(t * 5 + k) * 4, cy - 22 - t * 34, 7 + t * 10).fill({ color: 0xdfe6ee, alpha: 0.28 * (1 - t) });
        }
      } else if (b.type === 'solar') {
        const sh = (this.time * 0.25 + b.id * 0.13) % 1;
        g.rect(cx - 13 + sh * 22, cy - 11, 4, 20).fill({ color: 0xffffff, alpha: 0.12 });
      } else if (b.type === 'fishing_dock') {
        const bob = working ? Math.sin(this.time * 3 + b.id) * 2 : 0;
        g.moveTo(cx + 14, cy - 14).lineTo(cx + 15, cy + 6 + bob).stroke({ width: 1, color: 0xdfe6ee, alpha: 0.7 });
        g.circle(cx + 15, cy + 7 + bob, 2.5).fill(C.red);
      } else if (b.type === 'seaweed_farm') {
        for (let k = 0; k < 4; k++) {
          const sx = cx - 10 + k * 7;
          const sway = Math.sin(this.time * 2 * (working ? 1 : 0.2) + k) * 3;
          g.moveTo(sx, cy + 12).bezierCurveTo(sx + sway, cy + 4, sx - sway, cy - 2, sx + sway, cy - 9).stroke({ width: 2.5, color: 0x5fc07a, cap: 'round' });
        }
      } else if (b.type === 'clay_pit') {
        const dig = working ? Math.sin(spin * 2) * 4 : 0;
        g.moveTo(cx - 2, cy - 12 + dig).lineTo(cx + 4, cy + 2 + dig).stroke({ width: 2.5, color: 0x9fb0c4, cap: 'round' });
        g.ellipse(cx + 4, cy + 3 + dig, 4, 2.5).fill(0xb87a56);
      } else if (b.type === 'lumber_camp') {
        g.star(cx, cy - 4, 10, 11, 8, spin).fill(0x9fb0c4).stroke({ width: 1, color: 0x5d6b7d });
        g.circle(cx, cy - 4, 3).fill(0x2c3440);
      } else if (b.type === 'flower_garden') {
        for (let k = 0; k < 3; k++) {
          const fx = cx - 7 + k * 7;
          const fy = cy - 2 + (k % 2) * 6;
          const bloom = 2 + (working ? 0.8 * Math.sin(this.time * 2 + k + b.id) : 0);
          for (let j = 0; j < 5; j++) {
            const ang = (j * Math.PI * 2) / 5 + spin * 0.2;
            g.circle(fx + Math.cos(ang) * bloom, fy + Math.sin(ang) * bloom, 1.8).fill([0xf07ab8, 0xffd34a, 0xb58aff][k]);
          }
          g.circle(fx, fy, 1.2).fill(0xffc94a);
        }
      } else if (b.type === 'oil_pump') {
        const rock = working ? Math.sin(this.time * 2.5 + b.id) * 0.35 : 0;
        const hx = cx - 4;
        const hy = cy - 6;
        const ex = Math.cos(rock) * 14;
        const ey = Math.sin(rock) * 14;
        g.moveTo(hx - ex, hy - ey).lineTo(hx + ex, hy + ey).stroke({ width: 3, color: 0xc4b8d8, cap: 'round' });
        g.circle(hx - ex, hy - ey + 2, 3.5).fill(0x8a7a9a);
        g.circle(hx, hy, 2).fill(C.orange);
      } else if (b.type === 'refinery' && working) {
        const fl = 0.6 + 0.4 * Math.sin(this.time * 9 + b.id);
        g.poly([cx + 13, cy - 26, cx + 10, cy - 34 - fl * 6, cx + 13, cy - 31, cx + 16, cy - 36 - fl * 5]).fill({ color: 0xffa23d, alpha: 0.9 });
      } else if (b.type === 'geothermal') {
        for (let k = 0; k < 3; k++) {
          const t = (this.time * 0.5 + k / 3) % 1;
          g.circle(cx - 10 + Math.sin(t * 5 + k) * 3, cy - 26 - t * 26, 5 + t * 8).fill({ color: 0xdfe6ee, alpha: 0.3 * (1 - t) });
        }
        g.circle(cx + 14, cy - 10, 3).fill({ color: WATER.ventGlow, alpha: 0.5 + 0.3 * Math.sin(this.time * 4) });
      }
      if (b.type !== 'hq' && b.type !== 'depot' && b.type !== 'solar' && b.type !== 'geothermal') {
        const col = STATUS_COLOR[b.status] ?? C.textDim;
        const pulse = b.status === 'output_full' || b.status === 'no_fuel' ? 0.5 + 0.5 * Math.sin(this.time * 8) : 1;
        g.circle(b.x * TILE + 9, b.y * TILE + 13, 3).fill({ color: col, alpha: pulse });
      }
    }
  }

  private chevron(g: Graphics, belt: Belt, d: number) {
    const [ax, ay] = pointAt(belt.points, d);
    const [bx, by] = pointAt(belt.points, Math.min(belt.length, d + 0.05));
    const ang = Math.atan2(by - ay, bx - ax);
    const x = ax * TILE;
    const y = ay * TILE;
    const s = 5;
    const c = Math.cos(ang);
    const n = Math.sin(ang);
    g.moveTo(x - c * s - n * s, y - n * s + c * s)
      .lineTo(x, y)
      .lineTo(x - c * s + n * s, y - n * s - c * s)
      .stroke({ width: 2, color: C.beltChevron, alpha: 0.8 });
  }

  private item(g: Graphics, item: ItemId, x: number, y: number, r: number) {
    const col = ITEMS[item].color;
    const edge = { width: 1, color: 0x000000, alpha: 0.4 };
    switch (item) {
      case 'iron_bar':
      case 'copper_bar':
        g.poly([x - r, y + r * 0.55, x - r * 0.7, y - r * 0.55, x + r * 0.7, y - r * 0.55, x + r, y + r * 0.55]).fill(col).stroke(edge);
        break;
      case 'steel':
        g.roundRect(x - r, y - r * 0.8, r * 2, r * 0.65, 1).roundRect(x - r, y + r * 0.15, r * 2, r * 0.65, 1).fill(col).stroke(edge);
        break;
      case 'glass':
        g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6).fill({ color: col, alpha: 0.5 }).stroke({ width: 1.2, color: col });
        g.moveTo(x - r * 0.4, y + r * 0.4).lineTo(x + r * 0.4, y - r * 0.4).stroke({ width: 1.3, color: 0xffffff, alpha: 0.85 });
        break;
      case 'machine_part':
        g.star(x, y, 6, r, r * 0.7).fill(col).stroke(edge);
        break;
      case 'gear':
        g.star(x, y, 8, r, r * 0.72).fill(col).stroke(edge);
        g.circle(x, y, r * 0.3).fill(0x1a1f27);
        break;
      case 'steel_beam':
        g.rect(x - r * 1.2, y - r * 0.6, r * 2.4, r * 0.35).rect(x - r * 1.2, y + r * 0.25, r * 2.4, r * 0.35).rect(x - r * 0.18, y - r * 0.6, r * 0.36, r * 1.2).fill(col);
        break;
      case 'fuel_rod':
        g.roundRect(x - r * 0.45, y - r, r * 0.9, r * 2, r * 0.45).fill(col).stroke(edge);
        break;
      case 'motor':
        g.roundRect(x - r, y - r * 0.75, r * 1.5, r * 1.5, 2).fill(col).stroke(edge);
        g.rect(x + r * 0.5, y - r * 0.15, r * 0.5, r * 0.3).fill(0xb0bccb);
        break;
      case 'circuit':
        g.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8).fill(col).stroke(edge);
        g.rect(x - r * 0.35, y - r * 0.35, r * 0.7, r * 0.7).fill(0x10251e);
        break;
      case 'battery_cell':
        g.roundRect(x - r * 0.55, y - r * 0.9, r * 1.1, r * 1.8, 2).fill(col).stroke(edge);
        g.rect(x - r * 0.25, y - r * 1.15, r * 0.5, r * 0.25).fill(col);
        break;
      case 'engine':
        g.regularPoly(x, y, r * 1.1, 6).fill(col).stroke(edge);
        break;
      case 'robot_arm':
        g.poly([x, y - r * 1.2, x + r * 1.1, y, x, y + r * 1.2, x - r * 1.1, y]).fill(col).stroke(edge);
        break;
      case 'computer':
        g.roundRect(x - r * 1.1, y - r * 0.8, r * 2.2, r * 1.4, 2).fill(col).stroke(edge);
        g.rect(x - r * 0.8, y - r * 0.55, r * 1.6, r * 0.9).fill(0x0e2630);
        break;
      case 'electric_vehicle':
        g.roundRect(x - r * 1.3, y - r * 0.55, r * 2.6, r * 1.1, r * 0.5).fill(col).stroke(edge);
        g.circle(x - r * 0.7, y + r * 0.55, r * 0.3).circle(x + r * 0.7, y + r * 0.55, r * 0.3).fill(0x10141a);
        break;
      case 'fish':
      case 'sea_fish':
        g.ellipse(x - r * 0.15, y, r, r * 0.55).fill(col).stroke(edge);
        g.poly([x + r * 0.7, y, x + r * 1.25, y - r * 0.55, x + r * 1.25, y + r * 0.55]).fill(col);
        g.circle(x - r * 0.6, y - r * 0.12, r * 0.14).fill(0x10141a);
        break;
      case 'wood':
        g.roundRect(x - r * 1.1, y - r * 0.45, r * 2.2, r * 0.9, r * 0.45).fill(col).stroke(edge);
        g.circle(x + r * 0.75, y, r * 0.32).fill(0xd9b07a);
        break;
      case 'flower':
      case 'perfume':
        if (item === 'perfume') {
          g.roundRect(x - r * 0.6, y - r * 0.3, r * 1.2, r * 1.2, 2).fill(col).stroke(edge);
          g.rect(x - r * 0.25, y - r * 0.75, r * 0.5, r * 0.45).fill(0xffd34a);
        } else {
          for (let k = 0; k < 5; k++) {
            const a = (k * Math.PI * 2) / 5;
            g.circle(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.42).fill(col);
          }
          g.circle(x, y, r * 0.3).fill(0xffc94a);
        }
        break;
      case 'gold_bar':
        g.poly([x - r, y + r * 0.55, x - r * 0.7, y - r * 0.55, x + r * 0.7, y - r * 0.55, x + r, y + r * 0.55]).fill(col).stroke(edge);
        break;
      case 'brick':
        g.rect(x - r, y - r * 0.5, r * 2, r).fill(col).stroke(edge);
        break;
      case 'plastic':
        g.circle(x - r * 0.4, y - r * 0.2, r * 0.5).circle(x + r * 0.4, y + r * 0.1, r * 0.5).circle(x - r * 0.05, y + r * 0.5, r * 0.45).fill(col).stroke(edge);
        break;
      case 'lens':
        g.circle(x, y, r * 0.9).fill({ color: col, alpha: 0.6 }).stroke({ width: 1.5, color: col });
        g.moveTo(x - r * 0.4, y - r * 0.1).lineTo(x - r * 0.1, y - r * 0.45).stroke({ width: 1.2, color: 0xffffff, alpha: 0.85 });
        break;
      case 'rocket_fuel':
      case 'canned_food':
        g.roundRect(x - r * 0.65, y - r * 0.85, r * 1.3, r * 1.7, 2).fill(col).stroke(edge);
        g.rect(x - r * 0.65, y - r * 0.2, r * 1.3, r * 0.4).fill(item === 'canned_food' ? 0xff8a3d : 0xffd34a);
        break;
      case 'jewelry':
        g.circle(x, y + r * 0.2, r * 0.75).stroke({ width: 2, color: col });
        g.poly([x, y - r * 1.1, x + r * 0.4, y - r * 0.55, x, y - r * 0.2, x - r * 0.4, y - r * 0.55]).fill(0x7fe3ff);
        break;
      case 'adv_chip':
        g.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8).fill(col).stroke(edge);
        g.rect(x - r * 0.4, y - r * 0.4, r * 0.8, r * 0.8).fill(0xffd34a);
        break;
      case 'satellite':
        g.rect(x - r * 0.35, y - r * 0.45, r * 0.7, r * 0.9).fill(col).stroke(edge);
        g.rect(x - r * 1.3, y - r * 0.3, r * 0.8, r * 0.6).rect(x + r * 0.5, y - r * 0.3, r * 0.8, r * 0.6).fill(0x2f6aae);
        break;
      case 'rocket':
        g.poly([x, y - r * 1.3, x + r * 0.45, y - r * 0.5, x + r * 0.45, y + r * 0.7, x - r * 0.45, y + r * 0.7, x - r * 0.45, y - r * 0.5]).fill(col).stroke(edge);
        g.poly([x - r * 0.45, y + r * 0.2, x - r * 0.9, y + r * 0.9, x - r * 0.45, y + r * 0.7]).poly([x + r * 0.45, y + r * 0.2, x + r * 0.9, y + r * 0.9, x + r * 0.45, y + r * 0.7]).fill(C.red);
        break;
      case 'wire':
        g.moveTo(x - r, y + r * 0.4)
          .bezierCurveTo(x - r * 0.7, y - r, x - r * 0.3, y - r, x - r * 0.25, y + r * 0.4)
          .bezierCurveTo(x - r * 0.1, y + r, x + r * 0.35, y + r, x + r * 0.4, y - r * 0.2)
          .bezierCurveTo(x + r * 0.5, y - r, x + r, y - r * 0.6, x + r, y + r * 0.3)
          .stroke({ width: 2.2, color: col, cap: 'round' });
        break;
      default:
        g.poly([x - r, y - r * 0.2, x - r * 0.3, y - r, x + r * 0.8, y - r * 0.6, x + r, y + r * 0.4, x + r * 0.1, y + r, x - r * 0.8, y + r * 0.6])
          .fill(col)
          .stroke({ width: 1, color: 0x000000, alpha: 0.45 });
    }
  }

  private drawOverlay() {
    const s = this.game.state;
    const ui = this.game.ui;
    const g = this.overlay.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);

    // selection
    const sel = ui.selected !== null ? getBuilding(s, ui.selected) : undefined;
    if (sel) {
      for (const belt of s.belts) {
        if (belt.from !== sel.id && belt.to !== sel.id) continue;
        const pts = belt.points.flatMap(([x, y]) => [x * TILE, y * TILE]);
        this.strokePath(g, pts, TILE * 0.5, belt.from === sel.id ? C.orange : C.blue, 0.35);
      }
      this.outline(g, sel, C.orange, 0.6 + 0.4 * pulse);
    }

    if (ui.plot) {
      const P = BALANCE.plotSize * TILE;
      g.rect(ui.plot[0] * P + 2, ui.plot[1] * P + 2, P - 4, P - 4).stroke({ width: 3, color: C.amber, alpha: 0.6 + 0.4 * pulse });
    }

    const mode = ui.mode;
    if (mode.kind === 'build') {
      if (isExtractor(mode.type) || mode.type === 'geothermal') {
        // highlight the tiles this building can go on
        const afford = s.money >= BUILDINGS[mode.type].cost;
        for (let y = 0; y < s.world.size; y++)
          for (let x = 0; x < s.world.size; x++) {
            if (!this.spotFor(mode.type, x, y) || !isUnlocked(s, x, y)) continue;
            if (afford && !canPlace(s, mode.type, x, y).ok) continue;
            g.roundRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4, 6).stroke({ width: 2, color: C.amber, alpha: 0.35 + 0.5 * pulse });
          }
      }
      if (ui.hover) this.ghost(g, mode.type, ui.hover[0], ui.hover[1]);
    }

    if (mode.kind === 'move') {
      const mb = getBuilding(s, mode.id);
      if (mb) {
        this.outline(g, mb, C.orange, 0.5 + 0.5 * pulse);
        if (isExtractor(mb.type)) {
          // extractors can only go onto their resource: show the free spots
          for (let y = 0; y < s.world.size; y++)
            for (let x = 0; x < s.world.size; x++) {
              if (!this.spotFor(mb.type, x, y) || (x === mb.x && y === mb.y)) continue;
              if (!canPlace(s, mb.type, x, y, mb).ok) continue;
              g.roundRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4, 6).stroke({ width: 2, color: C.amber, alpha: 0.35 + 0.5 * pulse });
            }
        }
        if (ui.hover && (ui.hover[0] !== mb.x || ui.hover[1] !== mb.y)) {
          const def = BUILDINGS[mb.type];
          const ok = canPlace(s, mb.type, ui.hover[0], ui.hover[1], mb).ok;
          const [hx, hy] = ui.hover;
          g.roundRect(hx * TILE + 3, hy * TILE + 3, def.w * TILE - 6, def.h * TILE - 6, 7)
            .fill({ color: ok ? C.ok : C.bad, alpha: 0.18 })
            .stroke({ width: 2, color: ok ? C.ok : C.bad, alpha: 0.9 });
          // dashed hint from the old spot to the new one
          const ax = (mb.x + def.w / 2) * TILE;
          const ay = (mb.y + def.h / 2) * TILE;
          const bx = (hx + def.w / 2) * TILE;
          const by = (hy + def.h / 2) * TILE;
          const len = Math.hypot(bx - ax, by - ay);
          for (let d = 0; d < len; d += 14) {
            const t0 = d / len;
            const t1 = Math.min(1, (d + 7) / len);
            g.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0).lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
          }
          g.stroke({ width: 2, color: ok ? C.ok : C.bad, alpha: 0.6 });
        }
      }
    }

    if (mode.kind === 'link') {
      const from = mode.from !== null ? getBuilding(s, mode.from) : undefined;
      // every building that can receive glows softly
      for (const b of s.buildings) {
        if (b.id === mode.from) continue;
        const ok = from ? BUILDINGS[b.type].maxIn > 0 : BUILDINGS[b.type].maxOut > 0;
        if (ok) this.outline(g, b, from ? C.blue : C.orange, 0.25 + 0.35 * pulse);
      }
      if (from) this.outline(g, from, C.orange, 1);
      const prev = ui.linkPreview;
      if (from && prev) {
        const to = getBuilding(s, prev.to);
        if (to) {
          if (prev.plan.ok) {
            const path = prev.plan.value.path;
            const pts: number[] = [(from.x + BUILDINGS[from.type].w / 2) * TILE, (from.y + BUILDINGS[from.type].h / 2) * TILE];
            for (const [x, y] of path) pts.push((x + 0.5) * TILE, (y + 0.5) * TILE);
            pts.push((to.x + BUILDINGS[to.type].w / 2) * TILE, (to.y + BUILDINGS[to.type].h / 2) * TILE);
            this.strokePath(g, pts, TILE * 0.3, prev.plan.value.carries.length ? C.ok : C.amber, 0.7);
          }
          this.outline(g, to, prev.plan.ok ? C.ok : C.bad, 1);
        }
      }
    }
  }

  /** is x,y the kind of tile this building needs (ignoring whether it's free)? */
  private spotFor(type: BuildingType, x: number, y: number): boolean {
    const s = this.game.state;
    if (type === 'geothermal') return s.world.terrain?.[idx(s, x, y)] === TERRAIN.vent;
    if (!EXTRACTORS[type]) return false;
    return extractAt(s, type, x, y) !== null;
  }

  private outline(g: Graphics, b: Building, color: number, alpha: number) {
    const def = BUILDINGS[b.type];
    g.roundRect(b.x * TILE, b.y * TILE, def.w * TILE, def.h * TILE, 9).stroke({ width: 3, color, alpha });
  }

  private ghost(g: Graphics, type: BuildingType, x: number, y: number) {
    const def = BUILDINGS[type];
    const ok = canPlace(this.game.state, type, x, y).ok;
    g.roundRect(x * TILE + 3, y * TILE + 3, def.w * TILE - 6, def.h * TILE - 6, 7)
      .fill({ color: ok ? C.ok : C.bad, alpha: 0.18 })
      .stroke({ width: 2, color: ok ? C.ok : C.bad, alpha: 0.9 });
  }

  // ------------------------------------------------------------------ floating "+$" texts

  private updateFx(dt: number) {
    for (const e of this.game.events.splice(0)) {
      if (e.type === 'sold') this.saleAcc.set(e.buildingId, (this.saleAcc.get(e.buildingId) ?? 0) + e.amount);
    }
    this.saleTimer += dt;
    if (this.saleTimer > 0.8) {
      this.saleTimer = 0;
      for (const [id, amount] of this.saleAcc) {
        const b = getBuilding(this.game.state, id);
        if (!b || amount <= 0) continue;
        const def = BUILDINGS[b.type];
        const t = new Text({
          text: `+${fmtMoney(amount)}`,
          style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: '700', fill: C.green, stroke: { color: 0x0f1318, width: 3 } },
          resolution: 3,
        });
        t.anchor.set(0.5);
        t.position.set((b.x + def.w / 2) * TILE + (Math.random() - 0.5) * 10, b.y * TILE);
        this.fx.addChild(t);
        this.floaters.push({ text: t, life: 1.2 });
      }
      this.saleAcc.clear();
    }
    for (const f of this.floaters) {
      f.life -= dt;
      f.text.y -= dt * 22;
      f.text.alpha = Math.max(0, Math.min(1, f.life / 0.5));
    }
    const dead = this.floaters.filter((f) => f.life <= 0);
    for (const f of dead) f.text.destroy();
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}
