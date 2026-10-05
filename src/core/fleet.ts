import { CITIES, ITEMS, MARKET, VEHICLES, type CityId, type ItemId, type VehicleType } from '../config/balance';
import { cityUnlocked, hasResearch, vehicleCapacity } from './economy';
import { price, sell } from './market';
import { invTotal } from './state';
import type { Building, GameState, Inventory, Vehicle } from './types';

/**
 * Export logistics. Belts feed goods into Loading Docks; trucks, trains and ships
 * load from all docks, drive to a city, sell there (prices react to supply) and
 * come back.
 */

export function docks(s: GameState): Building[] {
  return s.buildings.filter((b) => b.type === 'dock');
}

export function dockStock(s: GameState): Inventory {
  const out: Inventory = {};
  for (const d of docks(s)) for (const k in d.input) out[k as ItemId] = (out[k as ItemId] ?? 0) + (d.input[k as ItemId] ?? 0);
  return out;
}

export function vehicleCost(s: GameState, type: VehicleType): number {
  const owned = s.vehicles.filter((v) => v.type === type).length;
  return Math.round(VEHICLES[type].cost * Math.pow(1.15, owned));
}

export function travelTime(v: Pick<Vehicle, 'type' | 'city'>): number {
  return CITIES[v.city].travel / VEHICLES[v.type].speed;
}

export function canServe(s: GameState, type: VehicleType, city: CityId): boolean {
  return CITIES[city].vehicles.includes(type) && cityUnlocked(s, city);
}

export function defaultCity(s: GameState, type: VehicleType): CityId | null {
  return (Object.keys(CITIES) as CityId[]).find((c) => canServe(s, type, c)) ?? null;
}

export function buyVehicle(s: GameState, type: VehicleType): string | null {
  if (!hasResearch(s, VEHICLES[type].research)) return 'err.needResearch';
  const city = defaultCity(s, type);
  if (!city) return 'err.noRoute';
  const cost = vehicleCost(s, type);
  if (s.money < cost) return 'err.noMoney';
  s.money -= cost;
  s.vehicles.push({ id: s.nextId++, type, city, cargoFilter: 'auto', phase: 'loading', t: 0, cargo: {}, lastTrip: 0 });
  return null;
}

export function sellVehicle(s: GameState, id: number): number {
  const v = s.vehicles.find((x) => x.id === id);
  if (!v) return 0;
  s.vehicles = s.vehicles.filter((x) => x.id !== id);
  const refund = Math.round(VEHICLES[v.type].cost * 0.5);
  s.money += refund;
  return refund;
}

export function setRoute(s: GameState, id: number, city: CityId, filter: ItemId | 'auto'): string | null {
  const v = s.vehicles.find((x) => x.id === id);
  if (!v) return 'err.notFound';
  if (!canServe(s, v.type, city)) return 'err.noRoute';
  v.city = city;
  v.cargoFilter = filter;
  return null;
}

function take(s: GameState, item: ItemId, n: number): number {
  let got = 0;
  for (const d of docks(s)) {
    if (got >= n) break;
    const have = d.input[item] ?? 0;
    const t = Math.min(have, n - got);
    if (t <= 0) continue;
    const left = have - t;
    if (left > 0) d.input[item] = left;
    else delete d.input[item];
    got += t;
  }
  return got;
}

function load(s: GameState, v: Vehicle) {
  const cap = vehicleCapacity(s, v.type);
  let room = cap - invTotal(v.cargo);
  if (room <= 0) return;
  const stock = dockStock(s);
  let items = (Object.keys(stock) as ItemId[]).filter((i) => (stock[i] ?? 0) > 0);
  if (v.cargoFilter !== 'auto') items = items.filter((i) => i === v.cargoFilter);
  // most valuable at the destination first
  items.sort((a, b) => price(s, v.city, b) - price(s, v.city, a));
  for (const i of items) {
    if (room <= 0) break;
    const got = take(s, i, room);
    if (got > 0) {
      v.cargo[i] = (v.cargo[i] ?? 0) + got;
      room -= got;
    }
  }
}

export function tickFleet(s: GameState, dt: number) {
  for (const v of s.vehicles) {
    v.t += dt;
    if (v.phase === 'loading') {
      load(s, v);
      const full = invTotal(v.cargo) >= vehicleCapacity(s, v.type);
      if (full || (invTotal(v.cargo) > 0 && v.t >= MARKET.vehicleMaxWait)) {
        v.phase = 'out';
        v.t = 0;
      }
    } else if (v.phase === 'out') {
      if (v.t >= travelTime(v)) {
        let earned = 0;
        for (const i of Object.keys(v.cargo) as ItemId[]) earned += sell(s, v.city, i, v.cargo[i] ?? 0);
        v.cargo = {};
        v.lastTrip = earned;
        s.stats.trips++;
        v.phase = 'back';
        v.t = 0;
      }
    } else if (v.t >= travelTime(v)) {
      v.phase = 'loading';
      v.t = 0;
    }
  }
}

/** rough $/min a vehicle would earn on its route if always full — for the UI */
export function routeValuePerMin(s: GameState, v: Vehicle): number {
  const cap = vehicleCapacity(s, v.type);
  const stock = dockStock(s);
  const items = (Object.keys(stock) as ItemId[]).filter((i) => v.cargoFilter === 'auto' || i === v.cargoFilter);
  const best = items.length ? Math.max(...items.map((i) => price(s, v.city, i))) : 0;
  const cycle = travelTime(v) * 2 + 5;
  return (best * cap * 60) / cycle;
}

export const ALL_ITEMS = Object.keys(ITEMS) as ItemId[];
