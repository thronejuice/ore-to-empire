import { BUILDINGS, EXTRACTORS, GRADE_MULT, POWER, TERRAIN, VEINS, type DepositId, type ItemId } from '../config/balance';
import { isBuildingUnlocked } from '../core/quests';
import { isUnlocked } from '../core/state';
import { extractorsFor, terrainAt, waterAt } from '../core/zones';
import { veinAt, gradeAt } from '../core/veins';
import { fmtClock, fmtMoney } from '../i18n';
import { useGame, useT } from './hooks';
import { BuildingIcon, ItemIcon } from './icons';

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
  const water = waterAt(s, x, y);
  const vent = terrainAt(s, x, y) === TERRAIN.vent;
  if (!dep && !water && !vent) return null;
  const builders = extractorsFor(s, x, y);
  const title = dep ? t(`item.${dep}`) : water ? t(`terrain.${water}`) : t('terrain.vent');
  const isOre = !!dep && !!EXTRACTORS.miner?.deposits?.includes(dep as DepositId);
  return (
    <aside className="sheet inspector" role="dialog">
      <div className="sheet-head">
        {dep ? <ItemIcon item={dep} size={32} /> : builders[0] ? <BuildingIcon type={builders[0]} size={32} /> : null}
        <div className="insp-title">
          <h2>{title}</h2>
          {veinAt(s, x, y) && <span className="status warn">✦ {t('ui.richVein')}</span>}
        </div>
        <button className="icon-btn" onClick={() => game.select(null)} aria-label={t('ui.close')}>
          ✕
        </button>
      </div>
      <div className="sheet-body">
        {dep && <OreInfo x={x} y={y} />}
        {isOre && <p className="small dim">{t('ui.gradeHint')}</p>}
        {water && (
          <p className="small dim">
            {t('ui.waterHint', {
              items: builders
                .map((b) => EXTRACTORS[b]?.water?.[water])
                .filter((i): i is ItemId => !!i)
                .map((i) => t(`item.${i}`))
                .join(', '),
            })}
          </p>
        )}
        {vent && <p className="small dim">{t('ui.ventHint', { mw: POWER.geothermal })}</p>}
      </div>
      {builders.length > 0 && (
        <div className="sheet-actions">
          {builders.map((type) => {
            const unlocked = isBuildingUnlocked(s, type);
            const need = BUILDINGS[type].research;
            const cost = BUILDINGS[type].cost;
            return (
              <button
                key={type}
                className="btn primary"
                disabled={!unlocked || s.money < cost || !isUnlocked(s, x, y)}
                title={!unlocked && need ? t('ui.researchLocked', { name: t(`r.${need}.t`) }) : ''}
                onClick={() => game.buildAtTile(type)}
              >
                {unlocked ? (
                  <>
                    {t('ui.buildHere', { name: t(`b.${type}`) })} <span className="mono">{fmtMoney(cost)}</span>
                  </>
                ) : (
                  <>🔒 {t(`b.${type}`)}</>
                )}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
