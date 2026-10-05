import { BALANCE, landPrice } from '../config/balance';
import { ownedPlots, plotsPerRow } from './state';
import type { GameState } from './types';

export function plotOf(x: number, y: number): [number, number] {
  return [Math.floor(x / BALANCE.plotSize), Math.floor(y / BALANCE.plotSize)];
}

export function plotOwned(s: GameState, px: number, py: number): boolean {
  const n = plotsPerRow(s);
  return px >= 0 && py >= 0 && px < n && py < n && s.world.plots[py * n + px];
}

export function plotForSale(s: GameState, px: number, py: number): boolean {
  const n = plotsPerRow(s);
  if (px < 0 || py < 0 || px >= n || py >= n || plotOwned(s, px, py)) return false;
  return plotOwned(s, px - 1, py) || plotOwned(s, px + 1, py) || plotOwned(s, px, py - 1) || plotOwned(s, px, py + 1);
}

export function nextPlotPrice(s: GameState): number {
  return landPrice(ownedPlots(s) - BALANCE.startPlots.length);
}

export function buyPlot(s: GameState, px: number, py: number): string | null {
  if (!plotForSale(s, px, py)) return 'err.plotNotForSale';
  const cost = nextPlotPrice(s);
  if (s.money < cost) return 'err.noMoney';
  s.money -= cost;
  s.world.plots[py * plotsPerRow(s) + px] = true;
  return null;
}

/** cheapest-to-reach plots for the prestige land perk: those for sale, nearest the centre */
export function grantFreePlots(s: GameState, n: number) {
  const c = plotsPerRow(s) / 2 - 0.5;
  for (let i = 0; i < n; i++) {
    const options: [number, number][] = [];
    for (let py = 0; py < plotsPerRow(s); py++) for (let px = 0; px < plotsPerRow(s); px++) if (plotForSale(s, px, py)) options.push([px, py]);
    if (!options.length) return;
    options.sort((a, b) => Math.hypot(a[0] - c, a[1] - c) - Math.hypot(b[0] - c, b[1] - c) || a[1] - b[1] || a[0] - b[0]);
    const [px, py] = options[0];
    s.world.plots[py * plotsPerRow(s) + px] = true;
  }
}
