import {
  BALANCE,
  ITEMS,
  RECIPES,
  beltSpeed,
  powerDraw,
  speedMult,
  warehouseCapacity,
  type ItemId,
} from '../config/balance';
import { invTotal } from './state';
import type { Belt, Building, GameState, Inventory } from './types';

export interface SimEvent {
  type: 'sold';
  buildingId: number;
  item: ItemId;
  amount: number;
}

const add = (inv: Inventory, item: ItemId, n: number) => {
  inv[item] = (inv[item] ?? 0) + n;
};
const take = (inv: Inventory, item: ItemId, n: number) => {
  const v = (inv[item] ?? 0) - n;
  if (v <= 0) delete inv[item];
  else inv[item] = v;
};

/** Can this building ever accept this item type (ignoring how full it is)? */
export function acceptsType(b: Building, item: ItemId): boolean {
  switch (b.type) {
    case 'hq':
    case 'depot':
      return ITEMS[item].price > 0;
    case 'warehouse':
      return true;
    case 'coal_plant':
      return item === 'coal';
    case 'furnace':
    case 'assembler':
      return !!b.recipe && (RECIPES[b.recipe].inputs[item] ?? 0) > 0;
    default:
      return false;
  }
}

/** Does it have room for one more of this item right now? */
export function canAccept(b: Building, item: ItemId): boolean {
  if (!acceptsType(b, item)) return false;
  switch (b.type) {
    case 'hq':
    case 'depot':
      return true;
    case 'warehouse':
      return invTotal(b.input) < warehouseCapacity(b.level);
    case 'coal_plant':
      return (b.input.coal ?? 0) < BALANCE.coalPlantBuffer;
    default:
      return (b.input[item] ?? 0) < BALANCE.inputBufferPerItem;
  }
}

/** Items a building can send out on its belts. Warehouses send what they store. */
export function outbox(b: Building): Inventory {
  return b.type === 'warehouse' ? b.input : b.output;
}

export function sellPrice(item: ItemId): number {
  return ITEMS[item].price;
}

function deliver(state: GameState, b: Building, item: ItemId, events?: SimEvent[]) {
  if (b.type === 'hq' || b.type === 'depot') {
    const price = sellPrice(item);
    state.money += price;
    state.stats.totalEarned += price;
    add(state.stats.sold, item, 1);
    state.stats.incomeBuckets[state.stats.incomeBuckets.length - 1] += price;
    events?.push({ type: 'sold', buildingId: b.id, item, amount: price });
  } else {
    add(b.input, item, 1);
  }
}

function wantsPower(b: Building): boolean {
  return b.status === 'working' || b.status === 'no_power';
}

export function updatePower(state: GameState) {
  let gen = BALANCE.hqPower;
  let demand = 0;
  for (const b of state.buildings) {
    if (b.type === 'coal_plant' && b.burn > 0) gen += BALANCE.coalPlantPower;
    if (wantsPower(b)) demand += powerDraw(b.type, b.level);
  }
  state.power.gen = gen;
  state.power.demand = demand;
  state.power.satisfaction = demand <= 0 ? 1 : Math.min(1, gen / demand);
}

function updateBuilding(state: GameState, b: Building, dt: number) {
  const sat = state.power.satisfaction;
  const outTotal = invTotal(b.output);

  if (b.type === 'miner') {
    const dep = state.world.deposits[b.y * state.world.size + b.x];
    if (!dep) {
      b.status = 'idle';
      return;
    }
    if (outTotal >= BALANCE.outputBufferTotal) {
      b.status = 'output_full';
      return;
    }
    b.status = 'working';
    b.progress += (dt * sat * speedMult(b.level)) / BALANCE.minerTime;
    while (b.progress >= 1) {
      if (invTotal(b.output) >= BALANCE.outputBufferTotal) {
        b.progress = 1;
        b.status = 'output_full';
        break;
      }
      b.progress -= 1;
      add(b.output, dep, 1);
      add(state.stats.produced, dep, 1);
    }
    return;
  }

  if (b.type === 'furnace' || b.type === 'assembler') {
    if (!b.recipe) {
      b.status = 'idle';
      return;
    }
    const r = RECIPES[b.recipe];
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
    b.progress += (dt * sat * speedMult(b.level)) / r.time;
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

  if (b.type === 'coal_plant') {
    let t = dt;
    while (t > 0) {
      if (b.burn <= 0) {
        if ((b.input.coal ?? 0) <= 0) {
          b.burn = 0;
          b.status = 'no_fuel';
          return;
        }
        take(b.input, 'coal', 1);
        b.burn += BALANCE.coalBurnTime;
      }
      const used = Math.min(t, b.burn);
      b.burn -= used;
      t -= used;
    }
    b.status = 'working';
    // keep burning flag on for the next power calculation if we just emptied it but have coal
    if (b.burn <= 0 && (b.input.coal ?? 0) > 0) {
      take(b.input, 'coal', 1);
      b.burn += BALANCE.coalBurnTime;
    }
    return;
  }

  b.status = 'idle';
}

function moveBelt(state: GameState, belt: Belt, dst: Building | undefined, dt: number, speed: number, events?: SimEvent[]) {
  const items = belt.items;
  const spacing = BALANCE.beltSpacing;
  // deliver / advance front-to-back
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    const limit = i === 0 ? belt.length : items[i - 1].pos - spacing;
    it.pos = Math.min(it.pos + speed * dt, limit);
    if (i === 0 && it.pos >= belt.length - 1e-9 && dst && canAccept(dst, it.item)) {
      deliver(state, dst, it.item, events);
      items.shift();
      continue; // the next item becomes the new front this same tick
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
    // rotate the item choice too, so warehouses don't starve one product
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

export function tick(state: GameState, dt: number, events?: SimEvent[]) {
  state.time += dt;
  updatePower(state);

  for (const b of state.buildings) updateBuilding(state, b, dt);

  const byId = new Map<number, Building>();
  for (const b of state.buildings) byId.set(b.id, b);
  const outs = new Map<number, Belt[]>();
  const speed = beltSpeed(state.beltLevel);
  for (const belt of state.belts) {
    moveBelt(state, belt, byId.get(belt.to), dt, speed, events);
    let list = outs.get(belt.from);
    if (!list) outs.set(belt.from, (list = []));
    list.push(belt);
  }
  for (const b of state.buildings) {
    const list = outs.get(b.id);
    if (list) pushOutputs(b, list, byId);
  }

  // rolling one-minute income buckets
  const st = state.stats;
  st.bucketTime += dt;
  while (st.bucketTime >= 1) {
    st.bucketTime -= 1;
    st.incomeBuckets.shift();
    st.incomeBuckets.push(0);
  }
}

export function incomePerMinute(state: GameState): number {
  return state.stats.incomeBuckets.reduce((a, b) => a + b, 0);
}
