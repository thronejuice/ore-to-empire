import { BUILDINGS, ITEMS, type BuildingType, type ItemId } from '../config/balance';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function ItemIcon({ item, size = 16 }: { item: ItemId; size?: number }) {
  const c = hex(ITEMS[item].color);
  const stroke = 'rgba(0,0,0,.45)';
  let shape;
  switch (item) {
    case 'iron_bar':
    case 'copper_bar':
      shape = <rect x="2" y="5" width="12" height="6" rx="1.5" fill={c} stroke={stroke} />;
      break;
    case 'machine_part':
      shape = <polygon points="8,1.5 10,5.5 14.5,5.5 11,8.5 12.5,13.5 8,10.5 3.5,13.5 5,8.5 1.5,5.5 6,5.5" fill={c} stroke={stroke} />;
      break;
    case 'wire':
      shape = (
        <g>
          <circle cx="8" cy="8" r="5" fill="none" stroke={c} strokeWidth="2.5" />
          <circle cx="8" cy="8" r="2" fill={c} />
        </g>
      );
      break;
    default:
      shape = <polygon points="2,7 6,2 13,4 14,10 9,14 3,12" fill={c} stroke={stroke} />;
  }
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {shape}
    </svg>
  );
}

export function BuildingIcon({ type, size = 36 }: { type: BuildingType; size?: number }) {
  const c = hex(BUILDINGS[type].color);
  let inner;
  switch (type) {
    case 'miner':
      inner = (
        <g>
          <circle cx="20" cy="21" r="9" fill="#2c3440" stroke="#5d6b7d" strokeWidth="1.5" />
          <polygon points="20,21 29,21 26,26" fill="#9fb0c4" />
          <polygon points="20,21 15.5,13.2 13,19" fill="#9fb0c4" />
          <polygon points="20,21 15.5,28.8 21,29" fill="#9fb0c4" />
          <circle cx="20" cy="21" r="2.5" fill="#ff8a3d" />
        </g>
      );
      break;
    case 'furnace':
      inner = (
        <g>
          <rect x="11" y="13" width="18" height="15" rx="2" fill="#3a2620" stroke="#6a3a2c" />
          <rect x="14" y="18" width="12" height="7" rx="1.5" fill="#ff6a2a" opacity=".8" />
        </g>
      );
      break;
    case 'assembler':
      inner = (
        <g>
          <polygon
            points="20,10 22,14 26.5,12.5 26,17 30,19 26.5,22 28,26.5 23.5,26 21.5,30 19,26.5 14.5,28 15,23.5 11,21.5 14.5,18.5 13,14 17.5,14.5"
            fill="#2c4a70"
            stroke="#4fb3ff"
            strokeWidth="1.3"
          />
          <circle cx="20.5" cy="20" r="3.5" fill="#232a35" />
        </g>
      );
      break;
    case 'warehouse':
      inner = (
        <g stroke="#8c7a5b" strokeWidth="1.5">
          <rect x="11" y="12" width="18" height="16" fill="#3a3326" />
          <line x1="11" y1="12" x2="29" y2="28" />
          <line x1="29" y1="12" x2="11" y2="28" />
        </g>
      );
      break;
    case 'coal_plant':
      inner = (
        <g>
          <rect x="8" y="18" width="24" height="12" rx="2" fill="#2a2640" stroke="#6f5ae0" />
          <rect x="11" y="9" width="5" height="10" fill="#3a3550" />
          <rect x="23" y="7" width="5" height="12" fill="#3a3550" />
          <polygon points="19,20 22,20 20.5,23 23,23 19,28 20,24.5 18,24.5" fill="#ffc94a" />
        </g>
      );
      break;
    case 'depot':
      inner = (
        <g>
          <rect x="11" y="12" width="18" height="16" rx="2" fill="#1f3a32" stroke="#2fbf8f" />
          <text x="20" y="24.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#2fbf8f" fontFamily="JetBrains Mono, monospace">
            $
          </text>
        </g>
      );
      break;
    default:
      inner = (
        <text x="20" y="25" textAnchor="middle" fontSize="11" fontWeight="700" fill="#ff8a3d" fontFamily="JetBrains Mono, monospace">
          HQ
        </text>
      );
  }
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="3" y="3" width="34" height="34" rx="7" fill="#232a35" stroke={c} strokeWidth="2" />
      <rect x="6" y="6" width="28" height="3" rx="1.5" fill={c} />
      {inner}
    </svg>
  );
}

export function Inv({ inv, empty }: { inv: Partial<Record<ItemId, number>>; empty: string }) {
  const keys = (Object.keys(inv) as ItemId[]).filter((k) => (inv[k] ?? 0) > 0);
  if (!keys.length) return <span className="dim">{empty}</span>;
  return (
    <span className="inv">
      {keys.map((k) => (
        <span key={k} className="inv-item">
          <ItemIcon item={k} size={14} />
          {Math.floor(inv[k] ?? 0)}
        </span>
      ))}
    </span>
  );
}
