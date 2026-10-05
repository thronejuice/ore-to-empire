import { Application, Container, Graphics, Text } from 'pixi.js';
import { BALANCE, BUILDINGS, ITEMS, beltSpeed, type BuildingType, type ItemId } from '../config/balance';
import { canPlace } from '../core/actions';
import { pointAt } from '../core/pathfind';
import { getBuilding, hqPosition, idx, isUnlocked } from '../core/state';
import type { Belt, Building } from '../core/types';
import type { Game } from '../game';
import { fmtMoney } from '../i18n';
import { C, DEPOSIT_COLORS, TILE } from './theme';

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
    this.world.position.set(this.cam.x, this.cam.y);
    this.world.scale.set(this.cam.scale);

    const key = `${this.game.state.settings.lang}`;
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
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const px = x * TILE;
        const py = y * TILE;
        if (!isUnlocked(s, x, y)) {
          g.rect(px, py, TILE, TILE).fill(C.locked);
          if ((x + y) % 2 === 0) g.moveTo(px, py + TILE).lineTo(px + TILE, py).stroke({ width: 1, color: C.lockedHatch });
          continue;
        }
        g.rect(px, py, TILE, TILE).fill((x + y) % 2 ? C.ground : C.groundAlt);
        g.rect(px, py, TILE, TILE).stroke({ width: 1, color: C.gridLine, alpha: 0.6 });
      }
    }
    // deposits
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = s.world.deposits[idx(s, x, y)];
        if (!d) continue;
        const col = DEPOSIT_COLORS[d];
        const px = x * TILE;
        const py = y * TILE;
        const locked = !isUnlocked(s, x, y);
        g.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 6).fill({ color: col.fill, alpha: locked ? 0.45 : 1 });
        // deterministic flecks
        let h = (x * 73856093) ^ (y * 19349663);
        for (let i = 0; i < 6; i++) {
          h = (h * 1103515245 + 12345) & 0x7fffffff;
          const fx = px + 7 + (h % 26);
          h = (h * 1103515245 + 12345) & 0x7fffffff;
          const fy = py + 7 + (h % 26);
          g.poly([fx, fy - 3, fx + 3, fy, fx, fy + 3, fx - 3, fy]).fill({ color: col.fleck, alpha: locked ? 0.3 : 0.9 });
        }
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
  }

  private drawBelts() {
    const g = this.belts.clear();
    for (const belt of this.game.state.belts) {
      const pts = belt.points.flatMap(([x, y]) => [x * TILE, y * TILE]);
      this.strokePath(g, pts, TILE * 0.5, C.beltEdge);
      this.strokePath(g, pts, TILE * 0.38, C.beltBody);
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
      case 'depot':
        g.roundRect(cx - 12, cy - 10, 24, 20, 3).fill(0x1f3a32).stroke({ width: 1.5, color: 0x2fbf8f });
        {
          const t = new Text({ text: '$', style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: '700', fill: 0x2fbf8f }, resolution: 3 });
          t.anchor.set(0.5);
          t.position.set(cx, cy);
          this.labels.addChild(t);
        }
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
    for (const belt of s.belts) {
      for (let d = offset; d < belt.length; d += 1) this.chevron(g, belt, d);
    }

    // items
    for (const belt of s.belts) {
      let prev = Infinity;
      for (let i = 0; i < belt.items.length; i++) {
        const it = belt.items[i];
        const limit = i === 0 ? belt.length : prev - BALANCE.beltSpacing;
        const pos = Math.max(it.pos, Math.min(it.pos + lead, limit));
        prev = pos;
        const [px, py] = pointAt(belt.points, pos);
        this.item(g, it.item, px * TILE, py * TILE, 6.5);
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
      } else if (b.type === 'warehouse') {
        let total = 0;
        for (const k in b.input) total += b.input[k as ItemId] ?? 0;
        const cap = BALANCE.warehouseCapacity * Math.pow(BALANCE.warehouseCapacityPerLevel, b.level - 1);
        const f = Math.min(1, total / cap);
        g.rect(b.x * TILE + 7, b.y * TILE + TILE - 8, (TILE - 14) * f, 3).fill(f > 0.95 ? C.red : C.amber);
      }
      if (b.type !== 'hq' && b.type !== 'depot') {
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
    switch (item) {
      case 'iron_bar':
      case 'copper_bar':
        g.roundRect(x - r, y - r * 0.55, r * 2, r * 1.1, 2).fill(col).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        break;
      case 'machine_part':
        g.star(x, y, 6, r, r * 0.7).fill(col).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
        break;
      case 'wire':
        g.circle(x, y, r * 0.85).stroke({ width: 2.5, color: col });
        g.circle(x, y, r * 0.35).fill(col);
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

    const mode = ui.mode;
    if (mode.kind === 'build') {
      if (mode.type === 'miner') {
        // highlight usable deposits
        for (let y = 0; y < s.world.size; y++)
          for (let x = 0; x < s.world.size; x++) {
            if (!s.world.deposits[idx(s, x, y)] || !isUnlocked(s, x, y)) continue;
            if (!canPlace(s, 'miner', x, y).ok && s.money >= BUILDINGS.miner.cost) continue;
            g.roundRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4, 6).stroke({ width: 2, color: C.amber, alpha: 0.35 + 0.5 * pulse });
          }
      }
      if (ui.hover) this.ghost(g, mode.type, ui.hover[0], ui.hover[1]);
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
