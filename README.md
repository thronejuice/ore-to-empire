# Ore to Empire

Factory-management game for adults: mine → belt → smelt → assemble → export → research → sell the company.
TypeScript · React (HUD) · PixiJS (map) · Vite · Supabase + Omise (optional online layer).
Runs in the browser on desktop and mobile; Thai and English.

## Run

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # simulation tests (vitest)
npm run build          # production build → dist/
npm run build:single   # one self-contained HTML file → dist-single/index.html (offline/guest only)
```

Requires Node 20+. With no `.env` the game runs fully offline as a guest.
To turn on accounts, cloud saves and the gem store, follow **[docs/SETUP-PHASE4.md](docs/SETUP-PHASE4.md)** (Thai).

## What's in the game

- **Production:** 21 items over 5 tiers (ore → bars/steel/glass → parts → motors/circuits/engines → robot arms, computers, EVs). Drills, furnaces, assemblers, 2×2 fabricators.
- **Logistics:** tap-to-connect belts with auto-routing, one-tap "tidy belts" (global re-route with preview), belt view modes, cargo-coloured belts and bridges, move any building (free for 1 min after building, then 10% of its value; belts re-route and keep their cargo), warehouses, loading docks; trucks, trains and ships to 5 markets with demand-driven prices and news events.
- **Power:** HQ grid, coal, solar, batteries, nuclear. Shortage slows every machine.
- **Ore:** every deposit tile has a grade (low ×0.6 / normal / high ×1.5). Rich veins (×3, limited amount, low-ore warning) appear while you play and pause while you're away.
- **Land:** buy adjacent plots; sand and uranium only exist on bought land.
- **Research:** 23 timed projects in 5 tiers (keeps running offline).
- **Meta:** tutorial + guided quests, contracts, 3 daily missions (gems), prestige ("sell the company" for shares and perks), gem items (time skip, income ×2, offline cap).
- **Offline progress:** up to 8 h (more with perks/gems); server clock for signed-in players.
- **Accounts (v1.0.0):** pick a unique player name before playing; the server creates the account with a random password kept on the device (no login next time) and a one-time recovery code for new devices. Email, Google and LINE can be linked as backups.

## Project layout

```
src/
  config/balance.ts     every production/economy number (items, recipes, research, cities, power)
  config/meta.ts        prestige, contracts, daily missions, gem items & packs
  core/                 pure game logic, no DOM (unit-tested)
    sim.ts              fixed-step simulation: machines, belts, power, batteries
    market.ts fleet.ts  prices/saturation/events · vehicles and docks
    research.ts land.ts contracts.ts daily.ts prestige.ts gems.ts
    offline.ts          offline progress (sample, measure, macro-simulate)
    save.ts             local save + migrations (v1 Phase-1 saves load fine)
  game.ts               controller: loop, input modes, actions, toasts, autosave
  audio.ts              synthesized sound effects (Web Audio, no files)
  render/               PixiJS renderer, camera, touch/mouse input
  ui/                   React HUD and panels
  online/               Supabase client, cloud save, server gems, Omise checkout
  i18n/                 Thai + English
supabase/
  migrations/           schema, RLS, gem/save functions
  functions/            player-account, create-charge, omise-webhook, line-auth (Deno)
public/line-callback.html
tests/                  vitest simulation tests
docs/SETUP-PHASE4.md    online setup guide (Thai)
```

## Tuning

All numbers are in `src/config/balance.ts` and `src/config/meta.ts`.
Gem prices also live on the server (`supabase/functions/_shared/packs.ts`, `spend_gems` in the migration) — the server copy decides what players pay.

## Versions & releases

- `CHANGELOG.md` — what changed in every version (Thai).
- `releases/v<x.y.z>/` — one folder per version: `index.html` (play that version, its own save slot),
  `CHANGES.md` (summary + changed files) and `update-from-v<prev>.patch`.
- Every version is a git tag: `git checkout v0.5.0` gives that exact source.

Releasing a new version:

```bash
# 1. bump "version" in package.json and add a "## [x.y.z] - date" section to CHANGELOG.md
git commit -am "vX.Y.Z: ..."
git tag -a vX.Y.Z -m "vX.Y.Z ..."
npm run release -- X.Y.Z        # builds releases/vX.Y.Z and updates releases/README.md
git add releases && git commit -m "release vX.Y.Z"
```
