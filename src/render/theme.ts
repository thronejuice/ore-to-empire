import type { DepositId, ZoneId } from '../config/balance';

/** Modern-industrial palette: graphite, safety orange, signal blue. */
export const C = {
  bg: 0x0f1318,
  ground: 0x1a1f27,
  groundAlt: 0x1c222b,
  gridLine: 0x252c37,
  locked: 0x0c0f13,
  lockedHatch: 0x161a20,
  plotEdge: 0x343d4a,

  beltEdge: 0x3b4553,
  beltBody: 0x262d38,
  beltChevron: 0x4a5566,
  beltSelected: 0xff8a3d,

  panel: 0x232a35,
  panelEdge: 0x3a4454,
  text: 0xe8edf3,
  textDim: 0x8a96a8,

  orange: 0xff8a3d,
  blue: 0x4fb3ff,
  green: 0x3ddc97,
  amber: 0xffc94a,
  red: 0xff5a5a,

  ok: 0x3ddc97,
  bad: 0xff5a5a,
};

export const DEPOSIT_COLORS: Record<DepositId, { fill: number; fleck: number }> = {
  iron_ore: { fill: 0x2b323d, fleck: 0x9fb0c4 },
  copper_ore: { fill: 0x3a2a22, fleck: 0xe08a52 },
  coal: { fill: 0x16181c, fleck: 0x4a4f58 },
  sand: { fill: 0x3a3424, fleck: 0xe6cf8f },
  uranium_ore: { fill: 0x1c2e20, fleck: 0x7fe36b },
  clay: { fill: 0x44382e, fleck: 0xb89a7a },
  wood: { fill: 0x1d3322, fleck: 0x3f8a4c },
  flower: { fill: 0x24331f, fleck: 0xf07ab8 },
  crude_oil: { fill: 0x14111a, fleck: 0x6a5a8a },
  gold_ore: { fill: 0x3a3220, fleck: 0xffd34a },
  sulfur: { fill: 0x2f341a, fleck: 0xd4ec4a },
  obsidian: { fill: 0x1c1826, fleck: 0x9a86d0 },
};

/** ground colours per zone: [tile, alternate tile, locked] */
export const ZONE_GROUND: Record<ZoneId, [number, number, number]> = {
  home: [0x1a1f27, 0x1c222b, 0x0c0f13],
  forest: [0x17241b, 0x19271d, 0x0b120d],
  river: [0x1a2622, 0x1c2925, 0x0c1311],
  sea: [0x2a2a22, 0x2d2c24, 0x13130f],
  desert: [0x2e2719, 0x31291b, 0x15120b],
  volcano: [0x261a1a, 0x291c1b, 0x130c0c],
};

export const WATER = {
  river: 0x1f4a6e,
  riverWave: 0x3f7fae,
  sea: 0x173a5e,
  seaWave: 0x2f6a9e,
  lockedRiver: 0x0f2232,
  lockedSea: 0x0b1a2a,
  vent: 0x2a1410,
  ventGlow: 0xff6a2a,
};

export const TILE = 40;
