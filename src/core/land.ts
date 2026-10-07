import { BALANCE, landPrice, zoneLandPrice } from '../config/balance';
import { PERK_VALUES } from '../config/meta';
import { perk } from './economy';
import { plotsPerRow } from './state';
import type { GameState } from './types';
import { zoneLicensed, zoneOfPlot } from './zones';

export function plotOf(x: number, y: number): [number, number] {
  return [Math.floor(x / BALANCE.plotSize), Math.floor(y / BALANCE.plotSize)];
}

export function plotOwned(s: GameState, px: number, py: number): boolean {
  const n = plotsPerRow(s);
  return px >= 0 && py >= 0 && px < n && py < n && s.world.plots[py * n + px];
}

/** next to land you own (the zone may still need a licence) */
export function plotAdjacent(s: GameState, px: number, py: number): boolean {
  const n = plotsPerRow(s);
  if (px < 0 || py < 0 || px >= n || py >= n || plotOwned(s, px, py)) return false;
  return plotOwned(s, px - 1, py) || plotOwned(s, px + 1, py) || plotOwned(s, px, py - 1) || plotOwned(s, px, py + 1);
}

export function plotForSale(s: GameState, px: number, py: number): boolean {
  return plotAdjacent(s, px, py) && zoneLicensed(s, zoneOfPlot(px, py));
}

function ownedIn(s: GameState, zone: ReturnType<typeof zoneOfPlot>): number {
  const n = plotsPerRow(s);
  let c = 0;
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) if (s.world.plots[py * n + px] && zoneOfPlot(px, py) === zone) c++;
  return c;
}

/** price of a plot: the home zone keeps the original curve, outer zones have their own */
export function plotPrice(s: GameState, px: number, py: number): number {
  const zone = zoneOfPlot(px, py);
  const base = zone === 'home' ? landPrice(ownedIn(s, 'home') - BALANCE.startPlots.length) : zoneLandPrice(zone, ownedIn(s, zone));
  return Math.round(base * Math.max(0, 1 - perk(s, 'p_land_discount') * PERK_VALUES.landDiscountPerLevel));
}

export function buyPlot(s: GameState, px: number, py: number): string | null {
  if (!plotAdjacent(s, px, py)) return 'err.plotNotForSale';
  if (!zoneLicensed(s, zoneOfPlot(px, py))) return 'err.needLicence';
  const cost = plotPrice(s, px, py);
  if (s.money < cost) return 'err.noMoney';
  s.money -= cost;
  s.world.plots[py * plotsPerRow(s) + px] = true;
  return null;
}
