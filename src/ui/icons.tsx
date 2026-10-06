import { BUILDINGS, ITEMS, type BuildingType, type ItemId } from '../config/balance';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function ItemIcon({ item, size = 16, label }: { item: ItemId; size?: number; label?: string }) {
  const c = hex(ITEMS[item].color);
  const k = 'rgba(0,0,0,.45)';
  const dark = '#141920';
  let shape;
  switch (item) {
    case 'iron_bar':
    case 'copper_bar':
      // ingot: trapezoid with a top highlight
      shape = (
        <g>
          <polygon points="1.5,12 3.5,5 12.5,5 14.5,12" fill={c} stroke={k} />
          <line x1="4.5" y1="6.6" x2="11.5" y2="6.6" stroke="#fff" strokeOpacity=".45" />
        </g>
      );
      break;
    case 'steel':
      // stacked plates
      shape = (
        <g>
          <rect x="1.5" y="3" width="13" height="4" rx="1" fill={c} stroke={k} />
          <rect x="1.5" y="9" width="13" height="4" rx="1" fill={c} stroke={k} />
          <line x1="3" y1="4.5" x2="13" y2="4.5" stroke="#fff" strokeOpacity=".35" />
          <line x1="3" y1="10.5" x2="13" y2="10.5" stroke="#fff" strokeOpacity=".35" />
        </g>
      );
      break;
    case 'glass':
      // translucent pane with a shine
      shape = (
        <g>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill={c} fillOpacity=".45" stroke={c} strokeWidth="1.3" />
          <line x1="5" y1="11" x2="11" y2="5" stroke="#fff" strokeWidth="1.4" strokeOpacity=".85" />
        </g>
      );
      break;
    case 'machine_part':
      shape = <polygon points="8,1.5 10,5.5 14.5,5.5 11,8.5 12.5,13.5 8,10.5 3.5,13.5 5,8.5 1.5,5.5 6,5.5" fill={c} stroke={k} />;
      break;
    case 'wire':
      // coiled wire
      shape = <path d="M1.5 11c1.5-7 3.5-7 3.5 0s2.5 7 3.5 0 2.5-7 3.5 0 1.5 4 2.5 1" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />;
      break;
    case 'gear':
      shape = (
        <g>
          <polygon points="8,1 9.4,4 12.9,3.1 12,6.6 15,8 12,9.4 12.9,12.9 9.4,12 8,15 6.6,12 3.1,12.9 4,9.4 1,8 4,6.6 3.1,3.1 6.6,4" fill={c} stroke={k} />
          <circle cx="8" cy="8" r="2" fill={dark} />
        </g>
      );
      break;
    case 'steel_beam':
      shape = <path d="M1 4h14v2.2H9.2v3.6H15V12H1V9.8h5.8V6.2H1z" fill={c} />;
      break;
    case 'fuel_rod':
      shape = <rect x="5" y="1" width="6" height="14" rx="3" fill={c} stroke={k} />;
      break;
    case 'motor':
      // body with cooling fins and a shaft
      shape = (
        <g>
          <rect x="1.5" y="3.5" width="10" height="9" rx="2" fill={c} stroke={k} />
          <line x1="4.5" y1="4" x2="4.5" y2="12" stroke={dark} strokeOpacity=".6" />
          <line x1="7.5" y1="4" x2="7.5" y2="12" stroke={dark} strokeOpacity=".6" />
          <rect x="11.5" y="7" width="3.5" height="2" fill="#b0bccb" />
        </g>
      );
      break;
    case 'circuit':
      shape = (
        <g>
          <rect x="2" y="2" width="12" height="12" fill={c} stroke={k} />
          <rect x="6" y="6" width="4" height="4" fill="#10251e" />
        </g>
      );
      break;
    case 'battery_cell':
      shape = (
        <g>
          <rect x="4.5" y="3" width="7" height="12" rx="1.5" fill={c} stroke={k} />
          <rect x="6.5" y="1.5" width="3" height="1.5" fill={c} />
        </g>
      );
      break;
    case 'engine':
      shape = <polygon points="8,1 14,4.5 14,11.5 8,15 2,11.5 2,4.5" fill={c} stroke={k} />;
      break;
    case 'robot_arm':
      shape = <polygon points="8,1 15,8 8,15 1,8" fill={c} stroke={k} />;
      break;
    case 'computer':
      shape = (
        <g>
          <rect x="1.5" y="3" width="13" height="9" rx="1" fill={c} stroke={k} />
          <rect x="3.5" y="4.8" width="9" height="5.4" fill="#0e2630" />
        </g>
      );
      break;
    case 'electric_vehicle':
      shape = (
        <g>
          <rect x="1" y="5" width="14" height="6" rx="3" fill={c} stroke={k} />
          <circle cx="4.5" cy="11.5" r="1.8" fill={dark} />
          <circle cx="11.5" cy="11.5" r="1.8" fill={dark} />
        </g>
      );
      break;
    default:
      shape = <polygon points="2,7 6,2 13,4 14,10 9,14 3,12" fill={c} stroke={k} />;
  }
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined}>
      {label && <title>{label}</title>}
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
    case 'fabricator':
      inner = (
        <g>
          <rect x="7" y="11" width="26" height="22" rx="3" fill="#2a2440" stroke="#9d6bff" />
          <polygon points="16,14 17.5,17 21,16.5 20,20 23,21.5 20,23 21,26.5 17.5,26 16,29 14.5,26 11,26.5 12,23 9,21.5 12,20 11,16.5 14.5,17" fill="#3a2f5c" stroke="#9d6bff" />
          <circle cx="26" cy="25" r="4" fill="#3a2f5c" stroke="#c4a8ff" />
        </g>
      );
      break;
    case 'dock':
      inner = (
        <g>
          <rect x="7" y="25" width="26" height="7" fill="#1b3a40" />
          <rect x="9" y="19" width="6" height="6" fill="#23b5c9" />
          <rect x="16" y="21" width="6" height="4" fill="#ff8a3d" />
          <path d="M28 32V12H17v5" stroke="#ffc94a" strokeWidth="2" fill="none" />
        </g>
      );
      break;
    case 'solar':
      inner = (
        <g>
          <rect x="9" y="12" width="22" height="18" fill="#123a5c" stroke="#3fa9f5" />
          <path d="M20 12v18M9 21h22" stroke="#3fa9f5" opacity=".7" />
        </g>
      );
      break;
    case 'battery':
      inner = (
        <g>
          <rect x="13" y="12" width="14" height="20" rx="2" fill="none" stroke="#a0e050" strokeWidth="2" />
          <rect x="17" y="9.5" width="6" height="2.5" fill="#a0e050" />
          <rect x="16" y="20" width="8" height="9" fill="#a0e050" opacity=".85" />
        </g>
      );
      break;
    case 'nuclear_plant':
      inner = (
        <g>
          <path d="M8 33l3-20h9l3 20z" fill="#2c3a33" stroke="#5fe08a" />
          <path d="M21 33l2.5-15h7.5l2.5 15z" fill="#2c3a33" stroke="#5fe08a" />
          <circle cx="15.5" cy="25" r="3" fill="#5fe08a" opacity=".7" />
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
