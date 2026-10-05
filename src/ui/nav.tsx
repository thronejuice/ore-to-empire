import { PRESTIGE } from '../config/meta';
import { dailyClaimableCount } from '../core/daily';
import { metaUnlocked } from '../core/quests';
import type { GameState } from '../core/types';
import type { Panel } from '../game';

export interface NavEntry {
  panel: Panel;
  label: string;
  visible: (s: GameState) => boolean;
  badge?: (s: GameState) => number | boolean;
}

export const NAV: NavEntry[] = [
  { panel: 'research', label: 'ui.research', visible: metaUnlocked, badge: (s) => !s.research.active && s.money > 2000 },
  { panel: 'markets', label: 'ui.markets', visible: metaUnlocked },
  { panel: 'fleet', label: 'ui.fleet', visible: (s) => s.research.done.includes('r_trucks') },
  { panel: 'contracts', label: 'ui.contracts', visible: metaUnlocked, badge: (s) => s.contracts.active.length === 0 },
  { panel: 'daily', label: 'ui.daily', visible: metaUnlocked, badge: (s) => dailyClaimableCount(s) },
  {
    panel: 'prestige',
    label: 'ui.prestige',
    visible: (s) => s.prestige.count > 0 || s.stats.totalEarned >= PRESTIGE.minRunEarned / 4,
    badge: (s) => s.stats.totalEarned >= PRESTIGE.minRunEarned,
  },
  { panel: 'shop', label: 'ui.shop', visible: () => true },
  { panel: 'upgrades', label: 'ui.upgrades', visible: () => true },
  { panel: 'stats', label: 'ui.stats', visible: () => true },
  { panel: 'settings', label: 'ui.settings', visible: () => true },
];

const P: Partial<Record<Panel, string>> = {
  research: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9',
  markets: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  fleet: 'M2 7h11v9H2zM13 10h4l3 3v3h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  contracts: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  daily: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  prestige: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  shop: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l3 18M15 3l-3 18',
  upgrades: 'M12 3l7 8h-4v7H9v-7H5zM5 21h14',
  stats: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};

export function NavIcon({ panel, size = 20 }: { panel: Panel; size?: number }) {
  return (
    <svg className="icon nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[panel] ?? ''} />
    </svg>
  );
}

export function GemIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3h12l4 6-10 12L2 9z" fill="#59d2ff" stroke="#bdf0ff" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M2 9h20M9 3l3 18M15 3l-3 18" stroke="#1d8fb3" strokeWidth="1" />
    </svg>
  );
}
