import { BUILDINGS, GRADE_MULT, VEINS, type ItemId } from '../config/balance';
import { veinAt, gradeAt } from '../core/veins';
import { fmtClock, fmtMoney } from '../i18n';
import { useGame, useT } from './hooks';
import { ItemIcon } from './icons';

export const GRADE_KEYS = ['ui.gradeLow', 'ui.gradeNormal', 'ui.gradeHigh'];

/** grade + rich-vein lines, shared by the tile sheet and the drill inspector */
export function OreInfo({ x, y }: { x: number; y: number }) {
  const game = useGame();
  const t = useT();
  const s = game.state;
  const g = gradeAt(s, x, y);
  const v = veinAt(s, x, y);
  const frac = v ? v.amount / v.total : 0;
  const low = frac <= VEINS.lowFraction;
  return (
    <>
      <div className="kv">
        <span>{t('ui.grade')}</span>
        <span className={`grade g${g}`}>
          {t(GRADE_KEYS[g])} <span className="mono">×{GRADE_MULT[g]}</span>
        </span>
      </div>
      {v && (
        <div className={`vein-box ${low ? 'low' : ''}`}>
          <div className="row-between">
            <strong>✦ {t('ui.richVein')}</strong>
            <span className="mono">×{VEINS.mult}</span>
          </div>
          <span className="meter">
            <span className="fill" style={{ width: `${frac * 100}%` }} />
          </span>
          <div className="row-between small">
            <span className="mono">
              {Math.max(0, Math.floor(v.amount)).toLocaleString()} / {v.total.toLocaleString()}
            </span>
            <span className={low ? 'bad' : 'dim'}>{low ? t('ui.veinRunningLow') : t('ui.veinLeft', { pct: Math.round(frac * 100) })}</span>
          </div>
          {!s.buildings.some((b) => b.type === 'miner' && b.x === x && b.y === y) && (
            <p className="small warn">{t('ui.veinFades', { time: fmtClock(v.ttl) })}</p>
          )}
        </div>
      )}
    </>
  );
}

export function TileSheet() {
  const game = useGame();
  const t = useT();
  const tile = game.ui.tile;
  if (!tile || game.ui.mode.kind !== 'select') return null;
  const s = game.state;
  const [x, y] = tile;
  const dep = s.world.deposits[y * s.world.size + x] as ItemId | null;
  if (!dep) return null;
  const cost = BUILDINGS.miner.cost;
  return (
    <aside className="sheet inspector" role="dialog">
      <div className="sheet-head">
        <ItemIcon item={dep} size={32} />
        <div className="insp-title">
          <h2>{t(`item.${dep}`)}</h2>
          {veinAt(s, x, y) && <span className="status warn">✦ {t('ui.richVein')}</span>}
        </div>
        <button className="icon-btn" onClick={() => game.select(null)} aria-label={t('ui.close')}>
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <OreInfo x={x} y={y} />
        <p className="small dim">{t('ui.gradeHint')}</p>
      </div>
      <div className="sheet-actions">
        <button className="btn primary" disabled={s.money < cost} onClick={() => game.buildMinerAtTile()}>
          {t('ui.buildDrillHere')} <span className="mono">{fmtMoney(cost)}</span>
        </button>
      </div>
    </aside>
  );
}
