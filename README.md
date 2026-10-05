# Ore to Empire

Factory-management game for adults: mine → belt → smelt → assemble → sell → upgrade.
TypeScript · React (HUD) · PixiJS (map) · Vite. Runs in the browser on desktop and mobile.

**Status: Phase 1** — core loop playable end to end.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # simulation tests (vitest)
npm run build          # production build → dist/
npm run build:single   # one self-contained HTML file → dist-single/index.html
```

Requires Node 20+.

## How to play

1. **Build → Mining Drill**, tap an ore deposit (grey = iron, orange = copper, black = coal).
2. Tap the drill → **Connect belt** → tap the destination. The belt routes itself.
3. Anything delivered to the **HQ** (or a Trade Depot) is sold.
4. Smelt ore in a **Furnace** (2 ore → 1 bar) and turn bars into parts in an **Assembler**.
5. Watch the **power meter**. The HQ gives 6 MW; past that, every machine slows down.
   Build a **Coal Power Plant** (+20 MW) and belt coal into it.
6. Tap a machine to change recipe, upgrade (+30 % speed per level) or demolish (50 % refund).

Controls: drag to pan · pinch / scroll to zoom · Esc cancels.
The factory keeps producing while the game is closed (up to 8 hours).

## Project layout

```
src/
  config/balance.ts   ← every number: prices, costs, speeds, power, recipes. Tune here.
  core/               ← pure game logic, no DOM (unit-tested)
    state.ts          world generation, occupancy, helpers
    sim.ts            fixed-step simulation: machines, belts, power, selling
    pathfind.ts       belt routing (Dijkstra; avoids deposits, can bridge belts)
    actions.ts        player actions: place, link, upgrade, recipe, demolish
    offline.ts        offline progress (sample + extrapolate, capped)
    quests.ts         tutorial + guided quests, building unlocks
    save.ts           local save + migrations (SaveStore interface for cloud save later)
  game.ts             controller: game loop, input modes, toasts, autosave
  render/             PixiJS renderer, camera, touch/mouse input
  ui/                 React HUD: top bar, quest card, build drawer, inspector, panels
  i18n/               Thai + English strings
tests/                vitest simulation tests
```

The simulation is deterministic and independent of rendering (`core/` never touches the
DOM), so the same code can later run on a server to validate saves.

## Roadmap

- **Phase 1 (done):** grid, drills, belts, furnace, assembler, warehouse, coal power,
  HQ/depot selling, upgrades, save, offline progress, tutorial + quests, TH/EN.
- **Phase 2:** multiple markets with demand-driven prices, trucks/trains/ships,
  buying land plots, research tree, tier 3–5 products (steel, motors, circuits, robots, EVs),
  solar / batteries / nuclear.
- **Phase 3:** prestige ("sell the company" for investor shares), contracts, daily missions,
  sound effects, balancing, mobile polish.
- **Phase 4:** Supabase accounts (guest → email / Google / LINE), cloud save, server time
  for offline progress, Omise gem store (convenience & time-skip only).
