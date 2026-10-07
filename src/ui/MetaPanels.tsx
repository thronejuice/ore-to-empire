import { useState } from 'react';
import {
  BALANCE,
  CITIES,
  CITY_ORDER,
  ITEMS,
  RESEARCH,
  VEHICLES,
  ZONES,
  ZONE_ORDER,
  storageCapacity,
  type CityId,
  type ItemId,
  type ResearchId,
  type VehicleType,
  type ZoneId,
} from '../config/balance';
import { CONTRACTS, GEM_ITEMS, GEM_ITEM_ORDER, PERK_ORDER, PERKS, PRESTIGE } from '../config/meta';
import { rerollCost } from '../core/contracts';
import { missionProgress, bonusClaimable } from '../core/daily';
import { boostActive, cityUnlocked, hasResearch, vehicleCapacity } from '../core/economy';
import { canServe, dockStock, docks, travelTime, vehicleCost } from '../core/fleet';
import { gemItemAvailable } from '../core/gems';
import { plotAdjacent, plotForSale, plotPrice } from '../core/land';
import { listPrice, price } from '../core/market';
import { perkCost } from '../core/prestige';
import { researchState } from '../core/research';
import { idx, invTotal } from '../core/state';
import { licenceState, zoneLicensed, zoneOfPlot } from '../core/zones';
import type { DailyMission } from '../core/types';
import { fmtClock, fmtDuration, fmtMoney, fmtNum } from '../i18n';
import { useGame, useT } from './hooks';
import { Inv, ItemIcon } from './icons';
import { GemIcon, NAV, NavIcon } from './nav';
import { Modal } from './Panels';

const TIERS = ['ui.tierA', 'ui.tierB', 'ui.tierC', 'ui.tierD', 'ui.tierE', 'ui.tierF'];

// ============================================================================ research

export function ResearchPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'research') return null;
  const s = game.state;
  const ids = Object.keys(RESEARCH) as ResearchId[];
  const active = s.research.active;
  return (
    <Modal title={t('ui.research')} onClose={() => game.openPanel('none')} wide>
      {active && (
        <div className="research-active">
          <div>
            <span className="dim small">{t('ui.researching')}</span>
            <strong>{t(`r.${active.id}.t`)}</strong>
          </div>
          <span className="mono">{fmtClock(active.remaining)}</span>
          <span className="meter grow">
            <span className="fill" style={{ width: `${(1 - active.remaining / RESEARCH[active.id].time) * 100}%` }} />
          </span>
          <button className="btn ghost small" onClick={() => game.cancelResearch()}>
            {t('ui.cancelResearch')}
          </button>
        </div>
      )}
      <div className="tree">
        {TIERS.map((label, tier) => (
          <section key={label} className="tree-col">
            <h3 className="section-label">{t(label)}</h3>
            {ids
              .filter((id) => RESEARCH[id].tier === tier)
              .map((id) => {
                const def = RESEARCH[id];
                const st = researchState(s, id);
                const effects: string[] = [];
                if (def.speed) effects.push(t('ui.effectSpeed', { pct: Math.round(def.speed * 100) }));
                if (def.powerSave) effects.push(t('ui.effectPower', { pct: Math.round(def.powerSave * 100) }));
                if (def.beltMax) effects.push(t('ui.effectBelt', { n: def.beltMax }));
                if (def.capacity) effects.push(t('ui.effectCapacity', { pct: Math.round(def.capacity * 100) }));
                if (def.moveDiscount) effects.push(t('ui.effectMove', { pct: Math.round(def.moveDiscount * 100) }));
                const missing = def.requires.filter((r) => !s.research.done.includes(r));
                return (
                  <div key={id} className={`node ${st}`}>
                    <div className="node-head">
                      <strong>{t(`r.${id}.t`)}</strong>
                      {st === 'done' && <span className="good">✓</span>}
                    </div>
                    <p className="small dim">{t(`r.${id}.d`)}</p>
                    {effects.length > 0 && <p className="small good">{effects.join(' · ')}</p>}
                    {st === 'locked' && <p className="small warn">{t('ui.researchLocked', { name: missing.map((m) => t(`r.${m}.t`)).join(', ') })}</p>}
                    {st === 'available' && (
                      <button className="btn small primary" disabled={!!active || s.money < def.cost} onClick={() => game.research(id)}>
                        <span className="mono">{fmtMoney(def.cost)}</span> · {fmtDuration(s.settings.lang, def.time)}
                      </button>
                    )}
                    {st === 'active' && active && (
                      <span className="meter">
                        <span className="fill" style={{ width: `${(1 - active.remaining / def.time) * 100}%` }} />
                      </span>
                    )}
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </Modal>
  );
}

// ============================================================================ markets

export function MarketsPanel() {
  const game = useGame();
  const t = useT();
  const [city, setCity] = useState<CityId>('local');
  if (game.ui.panel !== 'markets') return null;
  const s = game.state;
  const unlocked = cityUnlocked(s, city);
  const items = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.stats.produced[i] ?? 0) > 0 || ITEMS[i].tier === 1 && i !== 'uranium_ore' && i !== 'sand');
  const events = s.events.filter((e) => e.until > s.time);
  return (
    <Modal title={t('ui.markets')} onClose={() => game.openPanel('none')} wide>
      <div className="news">
        <div className="section-label">{t('ui.news')}</div>
        {events.length === 0 && <p className="small dim">{t('ui.noNews')}</p>}
        {events.map((e, i) => (
          <p key={i} className="small news-item">
            <ItemIcon item={e.item} />{' '}
            {t('ui.newsItem', { item: t(`item.${e.item}`), city: t(`city.${e.city}`), mult: fmtNum(e.mult) })}{' '}
            <span className="dim mono">{fmtClock(e.until - s.time)}</span>
          </p>
        ))}
      </div>
      <div className="tabs" role="tablist">
        {CITY_ORDER.map((c) => (
          <button key={c} role="tab" className={`tab ${c === city ? 'active' : ''} ${cityUnlocked(s, c) ? '' : 'locked'}`} onClick={() => setCity(c)}>
            {t(`city.${c}`)}
          </button>
        ))}
      </div>
      <p className="small dim">
        {city === 'local'
          ? t('ui.instant')
          : `${t('ui.travel', { time: fmtDuration(s.settings.lang, CITIES[city].travel) })} · ${CITIES[city].vehicles.map((v) => t(`veh.${v}`)).join(', ')}`}
      </p>
      {!unlocked && <p className="warn small">{t('ui.cityLocked', { name: t(`r.${CITIES[city].research}.t`) })}</p>}
      <div className="table-wrap">
        <table className="stats-table market-table">
          <thead>
            <tr>
              <th />
              <th>{t('ui.price')}</th>
              <th>{t('ui.demand')}</th>
              <th>{t('ui.trend')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const m = s.markets[city];
              const sat = m?.sat[i] ?? 1;
              const trend = m?.trend[i] ?? 1;
              const p = price(s, city, i);
              const boom = events.some((e) => e.city === city && e.item === i);
              return (
                <tr key={i} className={boom ? 'boom' : ''}>
                  <td>
                    <ItemIcon item={i} /> {t(`item.${i}`)}
                  </td>
                  <td className="mono">${fmtNum(p, p < 10 ? 2 : 0)}</td>
                  <td>
                    <span className="meter mini">
                      <span className={`fill ${sat < 0.5 ? 'low' : ''}`} style={{ width: `${sat * 100}%` }} />
                    </span>
                  </td>
                  <td className={`mono ${trend > 1.05 ? 'good' : trend < 0.95 ? 'bad' : 'dim'}`}>
                    {trend > 1.05 ? '▲' : trend < 0.95 ? '▼' : '–'} {Math.round(trend * 100)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ============================================================================ fleet

export function FleetPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'fleet') return null;
  const s = game.state;
  const ds = docks(s);
  const stock = dockStock(s);
  const cap = ds.reduce((a, d) => a + storageCapacity('dock', d.level), 0);
  const stockItems = (Object.keys(ITEMS) as ItemId[]).filter((i) => (s.stats.produced[i] ?? 0) > 0);
  return (
    <Modal title={t('ui.fleet')} onClose={() => game.openPanel('none')} wide>
      <div className="section-label">
        {t('ui.docks')} · {ds.length} · <span className="mono">{invTotal(stock)}/{cap}</span>
      </div>
      {ds.length ? <Inv inv={stock} empty={t('ui.empty')} /> : <p className="small dim">{t('ui.noDocks')}</p>}

      <div className="section-label">{t('ui.buy')}</div>
      <div className="vehicle-shop">
        {(Object.keys(VEHICLES) as VehicleType[]).map((v) => {
          const def = VEHICLES[v];
          const ok = hasResearch(s, def.research);
          const cost = vehicleCost(s, v);
          return (
            <div key={v} className={`vcard ${ok ? '' : 'locked'}`}>
              <strong>{t(`veh.${v}`)}</strong>
              <span className="small dim">
                {t('ui.capacityN', { n: vehicleCapacity(s, v) })} · ×{fmtNum(def.speed)}
              </span>
              {ok ? (
                <button className="btn small primary" disabled={s.money < cost} onClick={() => game.buyVehicle(v)}>
                  {fmtMoney(cost)}
                </button>
              ) : (
                <span className="small warn">{t('ui.researchLocked', { name: t(`r.${def.research}.t`) })}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-label">
        {t('ui.vehicles')} · {s.vehicles.length}
      </div>
      {s.vehicles.length === 0 && <p className="small dim">{t('ui.noVehicles')}</p>}
      <ul className="vehicle-list">
        {s.vehicles.map((v, n) => {
          const tt = travelTime(v);
          const prog = v.phase === 'loading' ? invTotal(v.cargo) / vehicleCapacity(s, v.type) : Math.min(1, v.t / tt);
          const status =
            v.phase === 'loading' ? t('ui.phase.loading') : v.phase === 'out' ? t('ui.phase.out', { city: t(`city.${v.city}`) }) : t('ui.phase.back');
          return (
            <li key={v.id}>
              <div className="v-row">
                <strong>
                  {t(`veh.${v.type}`)} #{n + 1}
                </strong>
                <span className="small dim">{status}</span>
                <span className="mono small">{v.lastTrip > 0 ? `${t('ui.lastTrip')} ${fmtMoney(v.lastTrip)}` : ''}</span>
              </div>
              <span className="meter">
                <span className={`fill ${v.phase === 'back' ? 'dimfill' : ''}`} style={{ width: `${prog * 100}%` }} />
              </span>
              <div className="v-row">
                <label className="small">
                  {t('ui.destination')}{' '}
                  <select id={`v-city-${v.id}`} value={v.city} onChange={(e) => game.setRoute(v.id, e.target.value as CityId, v.cargoFilter)}>
                    {CITY_ORDER.filter((c) => canServe(s, v.type, c)).map((c) => (
                      <option key={c} value={c}>
                        {t(`city.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="small">
                  {t('ui.cargo')}{' '}
                  <select id={`v-cargo-${v.id}`} value={v.cargoFilter} onChange={(e) => game.setRoute(v.id, v.city, e.target.value as ItemId | 'auto')}>
                    <option value="auto">{t('ui.auto')}</option>
                    {stockItems.map((i) => (
                      <option key={i} value={i}>
                        {t(`item.${i}`)} (${fmtNum(listPrice(s, v.city, i), 1)})
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn small ghost" onClick={() => game.sellVehicle(v.id)}>
                  {t('ui.sell')} +{fmtMoney(VEHICLES[v.type].cost * 0.5)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

// ============================================================================ contracts

export function ContractsPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'contracts') return null;
  const s = game.state;
  const lang = s.settings.lang;
  return (
    <Modal title={t('ui.contracts')} onClose={() => game.openPanel('none')}>
      <p className="small dim">{t('ui.contractsIntro')}</p>
      <div className="section-label">
        {t('ui.active')} · {s.contracts.active.length}/{CONTRACTS.maxActive}
      </div>
      {s.contracts.active.length === 0 && <p className="small dim">{t('ui.noActive')}</p>}
      {s.contracts.active.map((c) => (
        <div key={c.id} className="contract active">
          <div className="c-row">
            <ItemIcon item={c.item} size={20} />
            <strong>{t('ui.deliver', { qty: c.qty, item: t(`item.${c.item}`) })}</strong>
            <span className="mono reward">+{fmtMoney(c.reward)}</span>
          </div>
          <div className="c-row">
            <span className="meter grow">
              <span className="fill" style={{ width: `${(c.progress / c.qty) * 100}%` }} />
            </span>
            <span className="mono small">
              {c.progress}/{c.qty}
            </span>
          </div>
          <div className="c-row small dim">
            <span>{t('ui.timeLeft', { time: fmtClock(c.expiresAt - s.time) })}</span>
            <button className="link-btn" onClick={() => game.abandonContract(c.id)}>
              {t('ui.abandon')}
            </button>
          </div>
        </div>
      ))}
      <div className="section-label row-between">
        <span>{t('ui.offers')}</span>
        <span className="small dim">{t('ui.newOffersIn', { time: fmtClock(s.contracts.refreshAt - s.time) })}</span>
      </div>
      {s.contracts.offers.map((c) => (
        <div key={c.id} className="contract">
          <div className="c-row">
            <ItemIcon item={c.item} size={20} />
            <strong>{t('ui.deliver', { qty: c.qty, item: t(`item.${c.item}`) })}</strong>
            <span className="mono reward">+{fmtMoney(c.reward)}</span>
          </div>
          <div className="c-row small dim">
            <span>
              {t('ui.within', { time: fmtDuration(lang, c.duration) })} · ≈{fmtMoney(c.qty * ITEMS[c.item].price)}
            </span>
            <button className="btn small primary" disabled={s.contracts.active.length >= CONTRACTS.maxActive} onClick={() => game.acceptContract(c.id)}>
              {t('ui.accept')}
            </button>
          </div>
        </div>
      ))}
      <button className="btn ghost full" disabled={s.money < rerollCost(s)} onClick={() => game.rerollContracts()}>
        {t('ui.reroll')} · {fmtMoney(rerollCost(s))}
      </button>
    </Modal>
  );
}

// ============================================================================ daily

function missionText(t: (k: string, p?: Record<string, string | number>) => string, m: DailyMission) {
  const n = m.kind === 'earn' ? m.target.toLocaleString() : m.target;
  return t(`dm.${m.kind}`, { n, item: m.item ? t(`item.${m.item}`) : '' });
}

function untilMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (next.getTime() - now.getTime()) / 1000;
}

export function DailyPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'daily') return null;
  const s = game.state;
  return (
    <Modal title={t('ui.daily')} onClose={() => game.openPanel('none')}>
      <p className="small dim">{t('ui.dailyIntro')}</p>
      {s.daily.missions.map((m) => {
        const p = missionProgress(s, m);
        const done = p >= m.target;
        return (
          <div key={m.id} className="contract">
            <div className="c-row">
              {m.item && <ItemIcon item={m.item} size={18} />}
              <strong>{missionText(t, m)}</strong>
              <span className="reward small">
                +5 <GemIcon />
              </span>
            </div>
            <div className="c-row">
              <span className="meter grow">
                <span className="fill" style={{ width: `${(p / m.target) * 100}%` }} />
              </span>
              <span className="mono small">
                {Math.floor(p).toLocaleString()}/{m.target.toLocaleString()}
              </span>
              <button className="btn small primary" disabled={!done || m.claimed || game.ui.busy} onClick={() => void game.claimDaily(m.id)}>
                {m.claimed ? t('ui.claimed') : t('ui.claim')}
              </button>
            </div>
          </div>
        );
      })}
      <div className="contract bonus">
        <div className="c-row">
          <strong>{t('ui.bonus')}</strong>
          <span className="reward small">
            +10 <GemIcon />
          </span>
          <button className="btn small primary" disabled={!bonusClaimable(s) || game.ui.busy} onClick={() => void game.claimDaily('__bonus')}>
            {s.daily.bonusClaimed ? t('ui.claimed') : t('ui.claim')}
          </button>
        </div>
      </div>
      <p className="small dim center">{t('ui.resetsIn', { time: fmtClock(untilMidnight()) })}</p>
    </Modal>
  );
}

// ============================================================================ expansion (zone licences + investor perks)

function LicenceRow({ zone }: { zone: ZoneId }) {
  const game = useGame();
  const t = useT();
  const s = game.state;
  const def = ZONES[zone];
  const st = licenceState(s, zone);
  return (
    <div className={`perk licence ${st}`}>
      <div>
        <strong>{t(`zone.${zone}`)}</strong> <span className="pill mono small">+{def.shares} {t('ui.shares')}</span>
        <p className="small dim">{t(`zone.${zone}.d`)}</p>
        {st === 'research' && def.research && <p className="small warn">🔒 {t('ui.researchLocked', { name: t(`r.${def.research}.t`) })}</p>}
      </div>
      {st === 'owned' ? (
        <span className="good small">✓ {t('ui.licenceOwned')}</span>
      ) : (
        <button className="btn small primary" disabled={st !== 'available' || s.money < def.licence} onClick={() => game.buyLicence(zone)}>
          {t('ui.buyLicence')} <span className="mono">{fmtMoney(def.licence)}</span>
        </button>
      )}
    </div>
  );
}

export function ExpansionPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'prestige') return null;
  const s = game.state;
  return (
    <Modal
      title={t('ui.expansion')}
      onClose={() => game.openPanel('none')}
      head={
        <span className="pill mono">
          {s.prestige.shares} {t('ui.shares')}
        </span>
      }
    >
      <p className="small">{t('ui.expansionIntro')}</p>
      <div className="section-label">{t('ui.licences')}</div>
      <div className="perks">
        {ZONE_ORDER.map((z) => (
          <LicenceRow key={z} zone={z} />
        ))}
      </div>

      <div className="section-label">{t('ui.perks')}</div>
      <p className="small dim">{t('ui.sharesRule', { pct: Math.round(PRESTIGE.incomePerShare * 100) })}</p>
      <div className="perks">
        {PERK_ORDER.map((id) => {
          const lvl = s.prestige.perks[id] ?? 0;
          const cost = perkCost(s, id);
          return (
            <div key={id} className="perk">
              <div>
                <strong>{t(`perk.${id}.t`)}</strong> <span className="lv mono">{t('ui.level2', { n: lvl, max: PERKS[id].max })}</span>
                <p className="small dim">{t(`perk.${id}.d`)}</p>
              </div>
              <button className="btn small" disabled={cost === null || s.prestige.shares < cost} onClick={() => game.buyPerk(id)}>
                {cost === null ? t('ui.max') : `${cost} ${t('ui.shares')}`}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ============================================================================ gem shop (guest part; Phase 4 adds packs)

export function GemItems() {
  const game = useGame();
  const t = useT();
  const s = game.state;
  const now = Date.now();
  return (
    <div className="gem-items">
      {GEM_ITEM_ORDER.map((id) => {
        const def = GEM_ITEMS[id];
        const avail = gemItemAvailable(s, id);
        return (
          <div key={id} className="perk">
            <div>
              <strong>{t(`gem.${id}.t`)}</strong>
              <p className="small dim">{t(`gem.${id}.d`)}</p>
              {id === 'boost_4h' && boostActive(s, now) && <p className="small good">{t('ui.boostActive', { time: fmtClock((s.boostUntil - now) / 1000) })}</p>}
              {id === 'offline_plus4' && s.offlineBonusHours > 0 && <p className="small good">+{s.offlineBonusHours} h</p>}
            </div>
            <button className="btn small" disabled={!avail || s.gems < def.gems || game.ui.busy} onClick={() => void game.useGemItem(id)}>
              {avail ? (
                <>
                  {def.gems} <GemIcon />
                </>
              ) : (
                t('ui.max')
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================ land

export function PlotSheet() {
  const game = useGame();
  const t = useT();
  const p = game.ui.plot;
  if (!p || game.ui.mode.kind !== 'select') return null;
  const s = game.state;
  const [px, py] = p;
  const zone = zoneOfPlot(px, py);
  const licensed = zoneLicensed(s, zone);
  const forSale = plotForSale(s, px, py);
  const price = plotPrice(s, px, py);
  const lic = licenceState(s, zone);
  const counts: Partial<Record<ItemId, number>> = {};
  const P = BALANCE.plotSize;
  for (let y = py * P; y < (py + 1) * P; y++)
    for (let x = px * P; x < (px + 1) * P; x++) {
      const d = s.world.deposits[idx(s, x, y)];
      if (d) counts[d] = (counts[d] ?? 0) + 1;
    }
  const status = forSale ? t('ui.landForSale') : !licensed ? t('ui.needLicenceShort') : t('ui.landNotForSale');
  return (
    <aside className="sheet inspector" role="dialog">
      <div className="sheet-head">
        <div className="insp-title">
          <h2>
            {t('ui.land')} · {t(`zone.${zone}`)}
          </h2>
          <span className={`status ${forSale ? 'good' : 'warn'}`}>{status}</span>
        </div>
        <button className="icon-btn" onClick={() => game.select(null)} aria-label={t('ui.close')}>
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <div className="kv">
          <span>{t('ui.deposits')}</span>
          <Inv inv={counts} empty={t('ui.none')} />
        </div>
        {zone !== 'home' && <p className="small dim">{t(`zone.${zone}.d`)}</p>}
        {!licensed && (
          <p className="small warn">
            {lic === 'research' && ZONES[zone].research
              ? t('ui.licenceNeedsResearch', { name: t(`r.${ZONES[zone].research}.t`) })
              : t('ui.licenceNeeded', { zone: t(`zone.${zone}`), money: fmtMoney(ZONES[zone].licence) })}
          </p>
        )}
        {licensed && !forSale && !plotAdjacent(s, px, py) && <p className="small dim">{t('ui.landHint')}</p>}
      </div>
      {!licensed && lic === 'available' && (
        <div className="sheet-actions">
          <button className="btn primary" disabled={s.money < ZONES[zone].licence} onClick={() => game.buyLicence(zone)}>
            {t('ui.buyLicence')} <span className="mono">{fmtMoney(ZONES[zone].licence)}</span>
          </button>
        </div>
      )}
      {forSale && (
        <div className="sheet-actions">
          <button className="btn primary" disabled={s.money < price} onClick={() => game.buyPlot()}>
            {t('ui.buyLand')} <span className="mono">{fmtMoney(price)}</span>
          </button>
        </div>
      )}
    </aside>
  );
}

// ============================================================================ mobile menu

export function MenuSheet() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'menu') return null;
  const s = game.state;
  return (
    <div className="modal-backdrop" onClick={() => game.openPanel('none')}>
      <div className="modal menu" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="menu-grid">
          {NAV.filter((n) => n.visible(s)).map((n) => {
            const badge = n.badge?.(s);
            return (
              <button key={n.panel} className="menu-item" onClick={() => game.openPanel(n.panel)}>
                <NavIcon panel={n.panel} size={24} />
                <span>{t(n.label)}</span>
                {badge ? <span className="badge">{typeof badge === 'number' ? badge : ''}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
