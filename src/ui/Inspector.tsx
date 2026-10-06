import { useEffect, useState } from 'react';
import {
  BALANCE,
  BUILDINGS,
  POWER,
  RECIPES,
  allRecipesFor,
  levelPower,
  levelSpeed,
  storageCapacity,
  upgradeCost,
  type ItemId,
} from '../config/balance';
import { globalSpeed, powerMult, recipeUnlocked } from '../core/economy';
import { tileMult } from '../core/veins';
import { OreInfo } from './TileSheet';
import { freeMoveLeft, isUpgradable, linkCarriesIn, moveFee, totalInvested } from '../core/actions';
import { getBuilding, invTotal } from '../core/state';
import { fmtClock, fmtMoney, fmtNum } from '../i18n';
import { useGame, useHighlight, useT } from './hooks';
import { BuildingIcon, Inv, ItemIcon } from './icons';

export function Inspector() {
  const game = useGame();
  const t = useT();
  const b = game.selectedBuilding();
  const [confirm, setConfirm] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const linkHi = useHighlight('link-btn');
  useEffect(() => {
    setConfirm(false);
    setShowRecipes(false);
  }, [b?.id]);
  if (!b || game.ui.mode.kind !== 'select') return null;

  const s = game.state;
  const def = BUILDINGS[b.type];
  const outs = s.belts.filter((x) => x.from === b.id);
  const ins = s.belts.filter((x) => x.to === b.id);
  const sm = levelSpeed(b.level) * globalSpeed(s);
  const nextCost = upgradeCost(b.type, b.level);
  const canUp = isUpgradable(b) && b.level < BALANCE.maxBuildingLevel;
  const refund = Math.floor(totalInvested(b) * BALANCE.refundRate);
  const mvFee = moveFee(s, b);
  const freeLeft = freeMoveLeft(s, b);
  const statusClass = b.status === 'working' ? 'good' : b.status === 'output_full' || b.status === 'no_fuel' ? 'bad' : 'warn';

  let body: React.ReactNode = null;
  if (b.type === 'miner') {
    const dep = s.world.deposits[b.y * s.world.size + b.x] as ItemId | null;
    body = (
      <div className="kv">
        <span>{t('ui.extracts')}</span>
        <span>
          {dep && <ItemIcon item={dep} />} {dep ? t(`item.${dep}`) : '-'} ·{' '}
          <span className="mono">{fmtNum((60 / BALANCE.minerTime) * sm * tileMult(s, b.x, b.y))}/min</span>
        </span>
        <span>{t('ui.output')}</span>
        <Inv inv={b.output} empty={t('ui.empty')} />
      </div>
    );
    body = (
      <>
        {body}
        <OreInfo x={b.x} y={b.y} />
      </>
    );
  } else if (b.type === 'furnace' || b.type === 'assembler' || b.type === 'fabricator') {
    const r = b.recipe ? RECIPES[b.recipe] : null;
    body = (
      <>
        <div className="section-label">{t('ui.recipe')}</div>
        <div className="recipes">
          {allRecipesFor(b.type)
            .filter((rid) => showRecipes || !b.recipe || rid === b.recipe)
            .map((rid) => {
            const rr = RECIPES[rid];
            const open = recipeUnlocked(s, rid);
            const out = Object.keys(rr.outputs)[0] as ItemId;
            return (
              <button
                key={rid}
                className={`recipe ${b.recipe === rid ? 'active' : ''} ${open ? '' : 'locked'}`}
                disabled={!open}
                title={open ? '' : t('ui.researchLocked', { name: t(`r.${rr.research}.t`) })}
                onClick={() => {
                  if (rid === b.recipe) setShowRecipes(!showRecipes);
                  else {
                    game.setRecipe(b.id, rid);
                    setShowRecipes(false);
                  }
                }}
              >
                <span className="recipe-out">
                  <ItemIcon item={out} size={20} />
                  <strong>{t(`item.${out}`)}</strong>
                  {(rr.outputs[out] ?? 1) > 1 && <span className="mono dim">×{rr.outputs[out]}</span>}
                  <span className="recipe-time mono dim">{fmtNum(rr.time)}s</span>
                </span>
                {open ? (
                  <span className="recipe-in">
                    {(Object.keys(rr.inputs) as ItemId[]).map((i) => (
                      <span key={i} className="ing">
                        <ItemIcon item={i} size={16} />
                        {t(`item.${i}`)} <span className="mono">×{rr.inputs[i]}</span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="recipe-in warn">🔒 {t(`r.${rr.research}.t`)}</span>
                )}
              </button>
            );
          })}
          {allRecipesFor(b.type).length > 1 && (
            <button className="link-btn recipe-toggle" onClick={() => setShowRecipes(!showRecipes)}>
              {showRecipes ? t('ui.hideRecipes') : t('ui.changeRecipe', { n: allRecipesFor(b.type).length })}
            </button>
          )}
        </div>
        {r && (
          <>
            <div className="section-label">{t('ui.input')}</div>
            <div className="needs">
              {(Object.keys(r.inputs) as ItemId[]).map((i) => {
                const have = Math.floor(b.input[i] ?? 0);
                const need = r.inputs[i] ?? 0;
                const short = have < need && !b.crafting;
                return (
                  <span key={i} className={`need ${short ? 'short' : ''}`}>
                    <ItemIcon item={i} size={18} />
                    <span className="need-name">{t(`item.${i}`)}</span>
                    <span className="mono">
                      {have}/{need}
                    </span>
                  </span>
                );
              })}
            </div>
          </>
        )}
        <div className="kv">
          {!r && (
            <>
              <span>{t('ui.input')}</span>
              <Inv inv={b.input} empty={t('ui.empty')} />
            </>
          )}
          <span>{t('ui.output')}</span>
          <Inv inv={b.output} empty={t('ui.empty')} />
          {r && (
            <>
              <span>{t('ui.speed')}</span>
              <span className="mono">
                {fmtNum((60 / r.time) * sm * invTotal(r.outputs as Record<string, number>))}/min
              </span>
            </>
          )}
        </div>
        <div className="progress">
          <span className="fill" style={{ width: `${Math.min(100, b.progress * 100)}%` }} />
        </div>
      </>
    );
  } else if (b.type === 'warehouse' || b.type === 'dock') {
    const cap = storageCapacity(b.type, b.level);
    const total = invTotal(b.input);
    body = (
      <div className="kv">
        <span>{t('ui.capacity')}</span>
        <span className="mono">
          {total} / {cap}
        </span>
        <span>{t('ui.stored')}</span>
        <Inv inv={b.input} empty={t('ui.empty')} />
      </div>
    );
  } else if (b.type === 'coal_plant' || b.type === 'nuclear_plant') {
    const mw = b.type === 'coal_plant' ? POWER.coalPlant : POWER.nuclear;
    body = (
      <div className="kv">
        <span>{t('ui.fuel')}</span>
        <Inv inv={b.input} empty={t('ui.empty')} />
        <span>{t('ui.generates')}</span>
        <span className={`mono ${b.burn > 0 ? 'good' : 'bad'}`}>{b.burn > 0 ? `+${mw}` : '0'} MW</span>
      </div>
    );
  } else if (b.type === 'solar') {
    body = (
      <div className="kv">
        <span>{t('ui.generates')}</span>
        <span className="mono good">+{POWER.solar} MW</span>
      </div>
    );
  } else if (b.type === 'battery') {
    const f = (b.charge ?? 0) / POWER.batteryCapacity;
    body = (
      <div className="kv">
        <span>{t('ui.battery')}</span>
        <span className="mono">
          {Math.round(b.charge ?? 0)} / {POWER.batteryCapacity} MJ
        </span>
        <span />
        <span className="meter">
          <span className="fill" style={{ width: `${f * 100}%` }} />
        </span>
      </div>
    );
  } else {
    body = <p className="dim small">{t(`bd.${b.type}`, { mw: POWER.hq })}</p>;
  }

  const beltRow = (beltId: number, otherId: number, dir: 'out' | 'in') => {
    const other = getBuilding(s, otherId);
    if (!other) return null;
    const src = dir === 'out' ? b : other;
    const dst = dir === 'out' ? other : b;
    const carries = linkCarriesIn(s, src, dst);
    return (
      <li key={beltId}>
        <span className="belt-dir">{dir === 'out' ? '→' : '←'}</span>
        <button className="belt-target" onClick={() => game.select(other.id)}>
          {t(`b.${other.type}`)}
        </button>
        <span className="belt-carries">
          {carries.length ? carries.slice(0, 3).map((i) => <ItemIcon key={i} item={i} />) : <span className="bad small">✕</span>}
        </span>
        <button className="icon-btn small" onClick={() => game.removeBelt(beltId)} aria-label={t('ui.removeBelt')} title={t('ui.removeBelt')}>
          ✕
        </button>
      </li>
    );
  };

  return (
    <aside className="sheet inspector" role="dialog">
      <div className="sheet-head">
        <BuildingIcon type={b.type} size={40} />
        <div className="insp-title">
          <h2>
            {t(`b.${b.type}`)} {isUpgradable(b) && <span className="lv mono">{t('ui.level', { n: b.level })}</span>}
          </h2>
          {b.type !== 'hq' && b.type !== 'depot' && b.type !== 'solar' && <span className={`status ${statusClass}`}>● {t(`status.${b.status}`)}</span>}
        </div>
        <button className="icon-btn" onClick={() => game.select(null)} aria-label={t('ui.close')}>
          ✕
        </button>
      </div>

      <div className="sheet-body">
        {body}
        {def.power > 0 && (
          <div className="kv">
            <span>{t('ui.powerUse')}</span>
            <span className="mono">⚡ {fmtNum(levelPower(b.type, b.level) * powerMult(s))} MW</span>
          </div>
        )}

        {(outs.length > 0 || ins.length > 0) && (
          <>
            <div className="section-label">
              {t('ui.belts')} · {t('ui.incoming')} {ins.length}/{def.maxIn} · {t('ui.outgoing')} {outs.length}/{def.maxOut}
            </div>
            <ul className="belt-list">
              {outs.map((x) => beltRow(x.id, x.to, 'out'))}
              {ins.map((x) => beltRow(x.id, x.from, 'in'))}
            </ul>
          </>
        )}
      </div>

      <div className="sheet-actions">
        {def.maxOut > 0 && (
          <button className={`btn primary ${linkHi ? 'tut-pulse' : ''}`} onClick={() => game.startLink(b.id)} data-tut="link-btn">
            ⇢ {t('ui.link')}
          </button>
        )}
        <button className="btn" disabled={s.money < mvFee} onClick={() => game.startMove(b.id)} title={t('ui.moveTip')}>
          ✥ {t('ui.move')}{' '}
          {freeLeft > 0 ? <span className="mono good">{t('ui.moveFree', { time: fmtClock(freeLeft) })}</span> : <span className="mono">{fmtMoney(mvFee)}</span>}
        </button>
        {isUpgradable(b) && (
          <button className="btn" disabled={!canUp || s.money < nextCost} onClick={() => game.upgrade(b.id)}>
            {canUp ? (
              <>
                ⇪ {t('ui.upgradeTo', { n: b.level + 1 })} <span className="mono">{fmtMoney(nextCost)}</span>
              </>
            ) : (
              t('ui.max')
            )}
          </button>
        )}
        {b.type !== 'hq' && (
          <button
            className={`btn danger ${confirm ? 'armed' : ''}`}
            onClick={() => (confirm ? game.demolish(b.id) : setConfirm(true))}
          >
            {confirm ? t('ui.removeConfirm', { refund }) : `🗑 ${t('ui.remove')}`}
          </button>
        )}
      </div>
    </aside>
  );
}
