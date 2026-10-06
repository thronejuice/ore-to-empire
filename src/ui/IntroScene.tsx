import { useEffect, useState } from 'react';
import { BUILDINGS, ITEMS, type BuildingType, type ItemId } from '../config/balance';
import { fmtMoney } from '../i18n';
import { C, DEPOSIT_COLORS } from '../render/theme';
import { useT } from './hooks';
import { BuildingIcon } from './icons';

/**
 * Animated how-to for the intro slides: a tap marker walks through the real
 * controls (Build → drill → ore, building → Connect belt → target), then
 * items flow along the new belts. Drawn in the map's palette; loops.
 */

export type SceneId = 'mine' | 'smelt';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
/** 0 → 1 while t goes from a to b */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

type Key = [t: number, x: number, y: number];
type Bottom = { kind: 'bar' } | { kind: 'build' } | { kind: 'sheet'; type: BuildingType } | { kind: 'hint'; key: string };
type Belt = { x1: number; x2: number; y: number; item: ItemId; built: number };

interface Scene {
  length: number;
  /** frame shown when the player prefers reduced motion */
  still: number;
  finger: Key[];
  presses: number[];
  fingerFade: [inStart: number, inEnd: number, outStart: number, outEnd: number];
  steps: { from: number; key: string }[];
  bottom: (t: number) => Bottom;
  draw: (t: number) => React.ReactNode;
}

// ---------------------------------------------------------------- layout

const W = 320;
const H = 190;
const T = 32; // tile
const BAR = { x: 8, y: 134, w: 304, h: 48 };
const BTN_BUILD = { x: 16, y: 141, w: 136, h: 34 };
const BTN_LINK = { x: 160, y: 141, w: 144, h: 34 };
const center = (r: { x: number; y: number; w: number; h: number }): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];
const box = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

// ---------------------------------------------------------------- pieces

function Ground() {
  const lines = [];
  for (let x = T; x < W; x += T) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} />);
  for (let y = T; y < H; y += T) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} />);
  return (
    <>
      <rect width={W} height={H} fill={hex(C.ground)} />
      <g stroke={hex(C.gridLine)} strokeWidth={1}>
        {lines}
      </g>
    </>
  );
}

function OreTile({ x, y, glow }: { x: number; y: number; glow: number }) {
  const col = DEPOSIT_COLORS.iron_ore;
  const flecks: [number, number, number][] = [
    [9, 10, 2.6],
    [22, 8, 2],
    [15, 19, 3],
    [25, 24, 2.4],
    [7, 25, 2],
  ];
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={T} height={T} fill={hex(col.fill)} />
      {flecks.map(([fx, fy, s], i) => (
        <polygon key={i} points={`${fx},${fy - s} ${fx + s},${fy} ${fx},${fy + s} ${fx - s},${fy}`} fill={hex(col.fleck)} opacity={0.85} />
      ))}
      {glow > 0 && <rect x={2} y={2} width={T - 4} height={T - 4} rx={5} fill="none" stroke={hex(C.orange)} strokeWidth={2} opacity={glow} />}
    </g>
  );
}

function Building({ type, cx, cy, scale = 1, selected = false, working = 0 }: { type: BuildingType; cx: number; cy: number; scale?: number; selected?: boolean; working?: number }) {
  if (scale <= 0) return null;
  const size = BUILDINGS[type].w * T;
  return (
    <g transform={`translate(${cx},${cy}) scale(${scale}) translate(${-size / 2},${-size / 2})`}>
      {working > 0 && <rect x={-3} y={-3} width={size + 6} height={size + 6} rx={9} fill={hex(C.amber)} opacity={0.18 * working} />}
      <BuildingIcon type={type} size={size} />
      {selected && <rect x={-2} y={-2} width={size + 4} height={size + 4} rx={8} fill="none" stroke={hex(C.orange)} strokeWidth={2.5} />}
    </g>
  );
}

function Item({ item, x, y }: { item: ItemId; x: number; y: number }) {
  const c = hex(ITEMS[item].color);
  const edge = { stroke: 'rgba(0,0,0,.45)', strokeWidth: 1 };
  if (item === 'iron_bar')
    return <polygon points={`${x - 6},${y + 3.5} ${x - 4},${y - 3.5} ${x + 4},${y - 3.5} ${x + 6},${y + 3.5}`} fill={c} {...edge} />;
  return <polygon points={`${x},${y - 5.5} ${x + 5},${y - 1.5} ${x + 3.5},${y + 4.5} ${x - 3.5},${y + 4.5} ${x - 5},${y - 1.5}`} fill={c} {...edge} />;
}

function BeltLine({ belt, t }: { belt: Belt; t: number }) {
  const p = ease(ramp(t, belt.built, belt.built + 0.35));
  if (p <= 0) return null;
  const x2 = belt.x1 + (belt.x2 - belt.x1) * p;
  const chevrons = [];
  if (p >= 1)
    for (let x = belt.x1 + 10 + ((t * 18) % 16); x < belt.x2 - 6; x += 16)
      chevrons.push(<polyline key={x} points={`${x - 4},${belt.y - 4} ${x},${belt.y} ${x - 4},${belt.y + 4}`} />);
  return (
    <g strokeLinecap="round" fill="none">
      <line x1={belt.x1} y1={belt.y} x2={x2} y2={belt.y} stroke={hex(ITEMS[belt.item].color)} strokeOpacity={0.75} strokeWidth={T * 0.5} />
      <line x1={belt.x1} y1={belt.y} x2={x2} y2={belt.y} stroke={hex(C.beltBody)} strokeWidth={T * 0.36} />
      <g stroke={hex(C.beltChevron)} strokeWidth={2} opacity={0.8} strokeLinejoin="round">
        {chevrons}
      </g>
    </g>
  );
}

/** items riding a belt: one leaves every `every` s from `from` until `until`, at `speed` px/s */
function flow(belt: Belt, t: number, from: number, until: number, every: number, speed: number) {
  const len = belt.x2 - belt.x1;
  const items: { x: number }[] = [];
  const arrivals: number[] = [];
  for (let s = from; s <= until; s += every) {
    const arrive = s + len / speed;
    arrivals.push(arrive);
    if (t >= s && t < arrive) items.push({ x: belt.x1 + (t - s) * speed });
  }
  return { items, arrivals };
}

function MoneyPops({ arrivals, t, x, y, amount }: { arrivals: number[]; t: number; x: number; y: number; amount: number }) {
  return (
    <>
      {arrivals
        .filter((a) => t >= a && t < a + 0.9)
        .map((a) => {
          const k = (t - a) / 0.9;
          return (
            <text key={a} x={x} y={y - k * 16} textAnchor="middle" fontSize={12} fontWeight={700} fill={hex(C.green)} opacity={1 - k} className="mono">
              +{fmtMoney(amount)}
            </text>
          );
        })}
    </>
  );
}

function PreviewLine({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hex(C.orange)} strokeWidth={2} strokeDasharray="5 5" opacity={0.8} />;
}

// ---------------------------------------------------------------- scenes

const MINE = (() => {
  const ore: [number, number][] = [
    [32, 32],
    [64, 32],
    [32, 64],
    [64, 64],
  ];
  const miner: [number, number] = [80, 48];
  const hq: [number, number] = [256, 64];
  const belt: Belt = { x1: 96, x2: 224, y: 48, item: 'iron_ore', built: 4.6 };
  const build = center(BTN_BUILD);
  const pick: [number, number] = [56, 158];
  const link = center(BTN_LINK);
  const scene: Scene = {
    length: 9.5,
    still: 7.2,
    finger: [
      [0, 170, 110],
      [0.6, ...build],
      [1.2, ...build],
      [1.5, ...pick],
      [1.8, ...pick],
      [2.3, ...miner],
      [3.0, ...miner],
      [3.6, ...link],
      [3.9, ...link],
      [4.5, hq[0] - 10, hq[1] - 10],
      [6, hq[0] - 10, hq[1] - 10],
    ],
    presses: [0.8, 1.6, 2.4, 3.1, 3.8, 4.6],
    fingerFade: [0, 0.3, 4.9, 5.3],
    steps: [
      { from: 0, key: 'intro.mine.s1' },
      { from: 1.7, key: 'intro.mine.s2' },
      { from: 2.6, key: 'intro.mine.s3' },
      { from: 3.9, key: 'intro.mine.s4' },
      { from: 5.0, key: 'intro.mine.s5' },
    ],
    bottom: (t) =>
      t >= 0.9 && t < 1.7
        ? { kind: 'build' }
        : t >= 1.7 && t < 2.5
          ? { kind: 'hint', key: 'ui.placeMinerHint' }
          : t >= 3.2 && t < 3.9
            ? { kind: 'sheet', type: 'miner' }
            : t >= 3.9 && t < 4.7
              ? { kind: 'hint', key: 'ui.linkPickTarget' }
              : { kind: 'bar' },
    draw: (t) => {
      const placed = ramp(t, 2.45, 2.7);
      const glow = t >= 1.7 && t < 2.5 ? 0.55 + 0.45 * Math.sin(t * 12) : 0;
      const { items, arrivals } = flow(belt, t, 5.0, 8.4, 0.7, 70);
      const finger = fingerAt(scene, t);
      return (
        <>
          {ore.map(([x, y]) => (
            <OreTile key={`${x},${y}`} x={x} y={y} glow={glow} />
          ))}
          <BeltLine belt={belt} t={t} />
          {t >= 3.9 && t < 4.6 && <PreviewLine x1={belt.x1} y1={belt.y} x2={finger[0]} y2={finger[1]} />}
          <Building type="miner" cx={miner[0]} cy={miner[1]} scale={placed < 1 ? ease(placed) * 1.1 : 1} selected={t >= 3.2 && t < 4.7} />
          <Building type="hq" cx={hq[0]} cy={hq[1]} />
          {items.map((it, i) => (
            <Item key={i} item="iron_ore" x={it.x} y={belt.y} />
          ))}
          <MoneyPops arrivals={arrivals} t={t} x={hq[0]} y={hq[1] - 36} amount={ITEMS.iron_ore.price} />
        </>
      );
    },
  };
  return scene;
})();

const SMELT = (() => {
  const ore: [number, number][] = [
    [16, 48],
    [16, 80],
  ];
  const miner: [number, number] = [32, 64];
  const furnace: [number, number] = [144, 64];
  const hq: [number, number] = [272, 64];
  const belt1: Belt = { x1: 48, x2: 128, y: 64, item: 'iron_ore', built: 2.2 };
  const belt2: Belt = { x1: 160, x2: 240, y: 64, item: 'iron_bar', built: 4.3 };
  const link = center(BTN_LINK);
  const oreEvery = 0.6;
  const speed = 60;
  // the furnace turns every 2 ores into a bar; bars wait for the second belt
  const ore1 = flow(belt1, 0, 2.6, 10, oreEvery, speed).arrivals;
  const barStarts: number[] = [];
  for (let i = 1; i < ore1.length; i += 2) {
    const s = Math.max(4.7, ore1[i] + 0.5, (barStarts[barStarts.length - 1] ?? 0) + 0.5);
    if (s < 10) barStarts.push(s);
  }
  const scene: Scene = {
    length: 11,
    still: 8.6,
    finger: [
      [0, 120, 120],
      [0.6, ...miner],
      [0.9, ...miner],
      [1.3, ...link],
      [1.6, ...link],
      [2.1, ...furnace],
      [2.4, ...furnace],
      [2.6, furnace[0] + 10, furnace[1] + 18],
      [2.8, ...furnace],
      [3.1, ...furnace],
      [3.5, ...link],
      [3.7, ...link],
      [4.2, hq[0] - 8, hq[1] - 6],
      [6, hq[0] - 8, hq[1] - 6],
    ],
    presses: [0.8, 1.5, 2.2, 2.9, 3.6, 4.3],
    fingerFade: [0, 0.3, 4.6, 5.0],
    steps: [
      { from: 0, key: 'intro.smelt.s1' },
      { from: 1.6, key: 'intro.smelt.s2' },
      { from: 2.5, key: 'intro.smelt.s3' },
      { from: 3.7, key: 'intro.smelt.s4' },
      { from: 4.6, key: 'intro.smelt.s5' },
    ],
    bottom: (t) =>
      t >= 0.9 && t < 1.6
        ? { kind: 'sheet', type: 'miner' }
        : t >= 1.6 && t < 2.3
          ? { kind: 'hint', key: 'ui.linkPickTarget' }
          : t >= 3.0 && t < 3.7
            ? { kind: 'sheet', type: 'furnace' }
            : t >= 3.7 && t < 4.4
              ? { kind: 'hint', key: 'ui.linkPickTarget' }
              : { kind: 'bar' },
    draw: (t) => {
      const ores = flow(belt1, t, 2.6, 10, oreEvery, speed);
      const len2 = belt2.x2 - belt2.x1;
      const bars = barStarts.filter((s) => t >= s && t < s + len2 / speed).map((s) => belt2.x1 + (t - s) * speed);
      const barArrivals = barStarts.map((s) => s + len2 / speed);
      const working = ores.arrivals.some((a) => t >= a && t < a + 1.2) ? 0.6 + 0.4 * Math.sin(t * 10) : 0;
      const finger = fingerAt(scene, t);
      return (
        <>
          {ore.map(([x, y]) => (
            <OreTile key={`${x},${y}`} x={x} y={y} glow={0} />
          ))}
          <BeltLine belt={belt1} t={t} />
          <BeltLine belt={belt2} t={t} />
          {t >= 1.6 && t < 2.2 && <PreviewLine x1={belt1.x1} y1={belt1.y} x2={finger[0]} y2={finger[1]} />}
          {t >= 3.7 && t < 4.3 && <PreviewLine x1={belt2.x1} y1={belt2.y} x2={finger[0]} y2={finger[1]} />}
          <Building type="miner" cx={miner[0]} cy={miner[1]} selected={t >= 0.9 && t < 2.3} />
          <Building type="furnace" cx={furnace[0]} cy={furnace[1]} selected={t >= 3.0 && t < 4.4} working={working} />
          <Building type="hq" cx={hq[0]} cy={hq[1]} />
          {ores.items.map((it, i) => (
            <Item key={`o${i}`} item="iron_ore" x={it.x} y={belt1.y} />
          ))}
          {bars.map((x, i) => (
            <Item key={`b${i}`} item="iron_bar" x={x} y={belt2.y} />
          ))}
          <MoneyPops arrivals={barArrivals} t={t} x={hq[0]} y={hq[1] - 38} amount={ITEMS.iron_bar.price} />
        </>
      );
    },
  };
  return scene;
})();

const SCENES: Record<SceneId, Scene> = { mine: MINE, smelt: SMELT };

function fingerAt(scene: Scene, t: number): [number, number] {
  const k = scene.finger;
  if (t <= k[0][0]) return [k[0][1], k[0][2]];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, x0, y0] = k[i - 1];
      const [t1, x1, y1] = k[i];
      const p = ease((t - t0) / (t1 - t0));
      return [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p];
    }
  }
  const last = k[k.length - 1];
  return [last[1], last[2]];
}

// ---------------------------------------------------------------- bottom UI mock

function BottomUi({ ui, t }: { ui: Bottom; t: (key: string) => string }) {
  const label = { fontSize: 12.5, fontWeight: 600 } as const;
  return (
    <g>
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={11} fill={hex(C.panel)} stroke={hex(C.panelEdge)} />
      {ui.kind === 'bar' && (
        <>
          <rect {...box(BTN_BUILD)} rx={9} fill={hex(C.orange)} />
          <text x={center(BTN_BUILD)[0]} y={center(BTN_BUILD)[1] + 4.5} textAnchor="middle" fill="#1b0f05" {...label}>
            ⊕ {t('ui.build')}
          </text>
          <rect {...box(BTN_LINK)} rx={9} fill={hex(C.ground)} stroke={hex(C.panelEdge)} />
          <text x={center(BTN_LINK)[0]} y={center(BTN_LINK)[1] + 4.5} textAnchor="middle" fill={hex(C.text)} {...label}>
            ⇢ {t('ui.link')}
          </text>
        </>
      )}
      {ui.kind === 'build' && (
        <>
          <rect x={16} y={140} width={150} height={36} rx={8} fill={hex(C.ground)} stroke={hex(C.orange)} strokeWidth={1.5} />
          <g transform="translate(22,144)">
            <BuildingIcon type="miner" size={28} />
          </g>
          <text x={56} y={156} fill={hex(C.text)} {...label}>
            {t('b.miner')}
          </text>
          <text x={56} y={170} fill={hex(C.textDim)} fontSize={11} className="mono">
            {fmtMoney(BUILDINGS.miner.cost)}
          </text>
        </>
      )}
      {ui.kind === 'sheet' && (
        <>
          <g transform="translate(18,144)">
            <BuildingIcon type={ui.type} size={28} />
          </g>
          <text x={54} y={162} fill={hex(C.text)} {...label}>
            {t(`b.${ui.type}`)}
          </text>
          <rect {...box(BTN_LINK)} rx={9} fill={hex(C.orange)} />
          <text x={center(BTN_LINK)[0]} y={center(BTN_LINK)[1] + 4.5} textAnchor="middle" fill="#1b0f05" {...label}>
            ⇢ {t('ui.link')}
          </text>
        </>
      )}
      {ui.kind === 'hint' && (
        <text x={W / 2} y={BAR.y + BAR.h / 2 + 4.5} textAnchor="middle" fill={hex(C.text)} {...label}>
          {t(ui.key)}
        </text>
      )}
    </g>
  );
}

function Finger({ scene, t }: { scene: Scene; t: number }) {
  const [a, b, c, d] = scene.fingerFade;
  const opacity = Math.min(ramp(t, a, b), 1 - ramp(t, c, d));
  if (opacity <= 0) return null;
  const [x, y] = fingerAt(scene, t);
  const press = scene.presses.find((p) => t >= p - 0.08 && t < p + 0.45);
  const down = press !== undefined && t < press + 0.12;
  const ripple = press !== undefined ? ramp(t, press, press + 0.45) : 0;
  return (
    <g opacity={opacity} pointerEvents="none">
      {ripple > 0 && ripple < 1 && <circle cx={x} cy={y} r={8 + ripple * 16} fill="none" stroke="#fff" strokeWidth={2} opacity={1 - ripple} />}
      <circle cx={x} cy={y} r={down ? 8 : 10} fill="#fff" fillOpacity={0.35} stroke="#fff" strokeWidth={2} />
    </g>
  );
}

// ---------------------------------------------------------------- component

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function IntroScene({ id }: { id: SceneId }) {
  const t = useT();
  const scene = SCENES[id];
  const [still] = useState(prefersReducedMotion);
  const [time, setTime] = useState(still ? scene.still : 0);

  useEffect(() => {
    if (still) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setTime(((now - start) / 1000) % scene.length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, still]);

  const step = [...scene.steps].reverse().find((s) => time >= s.from) ?? scene.steps[0];
  return (
    <div className="intro-scene">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={scene.steps.map((s) => t(s.key)).join(' ')}>
        <Ground />
        {scene.draw(time)}
        <BottomUi ui={still ? { kind: 'bar' } : scene.bottom(time)} t={t} />
        {!still && <Finger scene={scene} t={time} />}
      </svg>
      {still ? (
        <ol className="intro-steps">
          {scene.steps.map((s) => (
            <li key={s.key}>{t(s.key)}</li>
          ))}
        </ol>
      ) : (
        <p className="intro-step-caption" aria-live="off">
          {t(step.key)}
        </p>
      )}
    </div>
  );
}
