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

export const DEPOSIT_COLORS = {
  iron_ore: { fill: 0x2b323d, fleck: 0x9fb0c4 },
  copper_ore: { fill: 0x3a2a22, fleck: 0xe08a52 },
  coal: { fill: 0x16181c, fleck: 0x4a4f58 },
  sand: { fill: 0x3a3424, fleck: 0xe6cf8f },
  uranium_ore: { fill: 0x1c2e20, fleck: 0x7fe36b },
} as const;

export const TILE = 40;
