// Server-side price list. Mirrors src/config/meta.ts (PACKS) — THIS copy is the
// one that decides what a customer pays and receives. Keep both in sync.

export interface Pack {
  gems: number; // total gems credited (bonus included)
  satang: number; // price in satang (฿1 = 100)
  boostHours: number;
  oncePerAccount: boolean;
}

export const PACKS: Record<string, Pack> = {
  starter: { gems: 500, satang: 9900, boostHours: 24, oncePerAccount: true },
  pack_s: { gems: 100, satang: 3500, boostHours: 0, oncePerAccount: false },
  pack_m: { gems: 550, satang: 17900, boostHours: 0, oncePerAccount: false },
  pack_l: { gems: 1200, satang: 34900, boostHours: 0, oncePerAccount: false },
  pack_xl: { gems: 3250, satang: 89900, boostHours: 0, oncePerAccount: false },
};
