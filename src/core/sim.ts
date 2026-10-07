import {
  BALANCE,
  EXTRACTORS,
  ITEMS,
  POWER,
  RECIPES,
  beltSpeed,
  levelPower,
  levelSpeed,
  storageCapacity,
  type BuildingType,
  type ItemId,
  type ResearchId,
} from '../config/balance';
import { tickContracts } from './contracts';
import { globalSpeed, hasResearch, incomePerMinute, powerMult } from './economy';
import { tickFleet } from './fleet';
import { sell, tickMarkets } from './market';
import { tickResearch } from './research';
import { invTotal } from './state';
import { mineFromVein, tickVeins, tileMult, type VeinEvent } from './veins';
import type { Belt, Building, Contract, GameState, Inventory } from './types';
import { extractedItem } from './zones';

export type SimEvent =
  | { type: 'sold'; buildingId: number; item: ItemId; amount: number }
  | { type: 'research'; id: ResearchId }
  | { type: 'contract_done'; contract: Contract }
  | { type: 'contract_expired'; contract: Contract }
  | VeinEvent;

export { incomePerMinute };

const add = (inv: Inventory, item: ItemId, n: number) => {
  inv[item] = (inv[item] ?? 0) + n;
};
const take = (inv: Inventory, item: ItemId, n: number) => {
  const v = (inv[item] ?? 0) - n;
  if (v <= 0) delete inv[item];
  else inv[item] = v;
};

const FUEL: Partial<Record<BuildingType, { items: ItemId[]; burn: number; buffer: number; mw: number }>> = {
  coal_plant: { items: ['coal', 'charcoal'], burn: POWER.coalBurnTime, buffer: POWER.coalBuffer, mw: POWER.coalPlant },
  nuclear_plant: { items: ['fuel_rod'], burn: POWER.nuclearBurnTime, buffer: POWER.nuclearBuffer, mw: POWER.nuclear },
};

/** first fuel in stock, or null */
function nextFuel(b: Building, items: ItemId[]): ItemId | null {
  for (const i of items) if ((b.input[i] ?? 0) > 0) return i;
  return null;
}

export const isCrafter = (t: BuildingType) => t === 'furnace' || t === 'assembler' || t === 'fabricator' || t === 'refinery';
const isStorage = (t: BuildingType) => t === 'warehouse' || t === 'dock';
const isSeller = (t: BuildingType) => t === 'hq' || t === 'depot';

/** Can this building ever accept this item type (ignoring how full it is)? */
export function acceptsType(b: Building, item: ItemId): boolean {
  if (isSeller(b.type) || isStorage(b.type)) return ITEMS[item].price > 0;
  const fuel = FUEL[b.type];
  if (fuel) return fuel.items.includes(item);
  if (isCrafter(b.type)) return !!b.recipe && (RECIPES[b.recipe].inputs[item] ?? 0) > 0;
  return false;
}

/** Does it have room for one more of this item right now? */
export function canAccept(b: Building, item: ItemId): boolean {
  if (!acceptsType(b, item)) return false;
  if (isSeller(b.type)) return true;
  if (isStorage(b.type)) return invTotal(b.input) < storageCapacity(b.type, b.level);
  const fuel = FUEL[b.type];
  if (fuel) return invTotal(b.input) < fuel.buffer;
  return (b.input[item] ?? 0) < Math.max(BALANCE.inputBufferPerItem, (RECIPES[b.recipe!].inputs[item] ?? 0) * 3);
}

/** Items a building can send out on its belts. Warehouses send what they store. */
export function outbox(b: Building): Inventory {
  return b.type === 'warehouse' ? b.input : b.output;
}

function deliver(state: GameState, b: Building, item: ItemId, events?: SimEvent[]) {
  if (isSeller(b.type)) {
    const amount = sell(state, 'local', item, 1);
    events?.push({ type: 'sold', buildingId: b.id, item, amount });
  } else {
    add(b.input, item, 1);
    if (isStorage(b.type)) b.recv = (b.recv ?? 0) + 1;
  }
}

function wantsPower(b: Building): boolean {
  return b.status === 'working' || b.status === 'no_power';
}

export function updatePower(state: GameState, dt: number) {
  let gen = POWER.hq;
  let demand = 0;
  const batteries: Building[] = [];
  const pm = powerMult(state);
  for (const b of state.buildings) {
    const fuel = FUEL[b.type];
    if (fuel && b.burn > 0) gen += fuel.mw;
    if (b.type === 'solar') gen += POWER.solar;
    if (b.type === 'geothermal') gen += POWER.geothermal;
    if (b.type === 'battery') batteries.push(b);
    if (wantsPower(b)) demand += levelPower(b.type, b.level) * pm;
  }

  let supplied = gen;
  if (batteries.length) {
    if (gen >= demand) {
      // charge with the surplus
      let surplus = (gen - demand) * dt;
      for (const bat of batteries) {
        const room = POWER.batteryCapacity - (bat.charge ?? 0);
        const put = Math.min(room, surplus, POWER.batteryRate * dt);
        bat.charge = (bat.charge ?? 0) + put;
        surplus -= put;
        bat.status = put > 0 ? 'working' : 'idle';
      }
    } else {
      // discharge to cover the deficit
      let need = (demand - gen) * dt;
      for (const bat of batteries) {
        const out = Math.min(bat.charge ?? 0, need, POWER.batteryRate * dt);
        bat.charge = (bat.charge ?? 0) - out;
        need -= out;
        supplied += out / Math.max(dt, 1e-9);
        bat.status = out > 0 ? 'working' : 'no_fuel';
      }
    }
  }

  state.power.gen = gen;
  state.power.demand = demand;
  state.power.satisfaction = demand <= 0 ? 1 : Math.min(1, supplied / demand);
  state.power.battery = batteries.reduce((a, b) => a + (b.charge ?? 0), 0);
  state.power.batteryMax = batteries.length * POWER.batteryCapacity;
}

function updateBuilding(state: GameState, b: Building, dt: number, speed: number, events?: SimEvent[]) {
  const sat = state.power.satisfaction;

  const ex = EXTRACTORS[b.type];
  if (ex) {
    const item = extractedItem(state, b);
    if (!item) {
      b.status = 'idle';
      return;
    }
    if (item === 'uranium_ore' && !hasResearch(state, 'r_nuclear')) {
      b.status = 'locked';
      return;
    }
    if (invTotal(b.output) >= BALANCE.outputBufferTotal) {
      b.status = 'output_full';
      return;
    }
    b.status = 'working';
    const tile = ex.deposits ? tileMult(state, b.x, b.y) : 1; // water has no grade
    b.progress += (dt * sat * speed * levelSpeed(b.level) * tile) / ex.time;
    while (b.progress >= 1) {
      if (invTotal(b.output) >= BALANCE.outputBufferTotal) {
        b.progress = 1;
        b.status = 'output_full';
        break;
      }
      b.progress -= 1;
      add(b.output, item, 1);
      add(state.stats.produced, item, 1);
      if (ex.deposits) mineFromVein(state, b.x, b.y, events as VeinEvent[] | undefined);
    }
    return;
  }

  if (isCrafter(b.type)) {
    if (!b.recipe) {
      b.status = 'idle';
      return;
    }
    const r = RECIPES[b.recipe];
    if (!hasResearch(state, r.research)) {
      b.status = 'locked';
      return;
    }
    const outQty = invTotal(r.outputs as Inventory);
    const hasInputs = () => (Object.keys(r.inputs) as ItemId[]).every((i) => (b.input[i] ?? 0) >= (r.inputs[i] ?? 0));
    const tryStart = () => {
      if (b.crafting) return true;
      if (!hasInputs()) {
        b.status = 'no_input';
        return false;
      }
      for (const i of Object.keys(r.inputs) as ItemId[]) take(b.input, i, r.inputs[i] ?? 0);
      b.crafting = true;
      return true;
    };
    if (!tryStart()) return;
    b.status = 'working';
    b.progress += (dt * sat * speed * levelSpeed(b.level)) / r.time;
    while (b.progress >= 1) {
      if (invTotal(b.output) + outQty > BALANCE.outputBufferTotal) {
        b.progress = 1;
        b.status = 'output_full';
        return;
      }
      b.progress -= 1;
      b.crafting = false;
      for (const o of Object.keys(r.outputs) as ItemId[]) {
        add(b.output, o, r.outputs[o] ?? 0);
        add(state.stats.produced, o, r.outputs[o] ?? 0);
      }
      if (!tryStart()) {
        b.progress = 0;
        return;
      }
    }
    return;
  }

  const fuel = FUEL[b.type];
  if (fuel) {
    let t = dt;
    while (t > 0) {
      if (b.burn <= 0) {
        const f = nextFuel(b, fuel.items);
        if (!f) {
          b.burn = 0;
          b.status = 'no_fuel';
          return;
        }
        take(b.input, f, 1);
        b.burn += fuel.burn;
      }
      const used = Math.min(t, b.burn);
      b.burn -= used;
      t -= used;
    }
    b.status = 'working';
    const f = b.burn <= 0 ? nextFuel(b, fuel.items) : null;
    if (f) {
      take(b.input, f, 1);
      b.burn += fuel.burn;
    }
    return;
  }

  if (b.type === 'solar' || b.type === 'geothermal') {
    b.status = 'working';
    return;
  }
  if (b.type === 'battery') return; // status set by updatePower
  b.status = 'idle';
}

function moveBelt(state: GameState, belt: Belt, dst: Building | undefined, dt: number, speed: number, events?: SimEvent[]) {
  const items = belt.items;
  const spacing = BALANCE.beltSpacing;
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const limit = i === 0 ? belt.length : items[i - 1].pos - spacing;
    it.pos = Math.min(it.pos + speed * dt, limit);
    if (i === 0 && it.pos >= belt.length - 1e-9 && dst && canAccept(dst, it.item)) {
      deliver(state, dst, it.item, events);
      items.shift();
      continue;
    }
    i++;
  }
}

function pushOutputs(b: Building, outs: Belt[], buildingsById: Map<number, Building>) {
  if (!outs.length) return;
  const box = outbox(b);
  if (invTotal(box) <= 0) return;
  const n = outs.length;
  for (let k = 0; k < n; k++) {
    const belt = outs[(b.rr + k) % n];
    const last = belt.items[belt.items.length - 1];
    if (last && last.pos < BALANCE.beltSpacing) continue;
    const dst = buildingsById.get(belt.to);
    if (!dst) continue;
    const keys = Object.keys(box) as ItemId[];
    if (!keys.length) break;
    const start = (b.rr + k) % keys.length;
    for (let j = 0; j < keys.length; j++) {
      const item = keys[(start + j) % keys.length];
      if ((box[item] ?? 0) > 0 && acceptsType(dst, item)) {
        take(box, item, 1);
        belt.items.push({ item, pos: 0 });
        break;
      }
    }
  }
  b.rr = (b.rr + 1) % 1024;
}

/** Everything that isn't the factory floor: markets, fleet, research, contracts. Cheap; also used by offline catch-up. */
export function tickMacro(state: GameState, dt: number, events?: SimEvent[]) {
  tickMarkets(state, dt);
  tickFleet(state, dt);
  const done = tickResearch(state, dt);
  if (done) events?.push({ type: 'research', id: done });
  const c = tickContracts(state);
  for (const contract of c.completed) events?.push({ type: 'contract_done', contract });
  for (const contract of c.expired) events?.push({ type: 'contract_expired', contract });
}

export function tick(state: GameState, dt: number, events?: SimEvent[]) {
  state.time += dt;
  updatePower(state, dt);

  const speed = globalSpeed(state);
  for (const b of state.buildings) updateBuilding(state, b, dt, speed, events);

  const byId = new Map<number, Building>();
  for (const b of state.buildings) byId.set(b.id, b);
  const outs = new Map<number, Belt[]>();
  const bs = beltSpeed(state.beltLevel);
  for (const belt of state.belts) {
    moveBelt(state, belt, byId.get(belt.to), dt, bs, events);
    let list = outs.get(belt.from);
    if (!list) outs.set(belt.from, (list = []));
    list.push(belt);
  }
  for (const b of state.buildings) {
    const list = outs.get(b.id);
    if (list) pushOutputs(b, list, byId);
  }

  tickMacro(state, dt, events);
  tickVeins(state, dt, events as VeinEvent[] | undefined);

  const st = state.stats;
  st.bucketTime += dt;
  while (st.bucketTime >= 1) {
    st.bucketTime -= 1;
    st.incomeBuckets.shift();
    st.incomeBuckets.push(0);
  }
}
