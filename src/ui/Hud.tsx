import { BUILDINGS } from '../config/balance';
import { QUESTS, currentQuest, currentQuestIndex, metaUnlocked } from '../core/quests';
import { availableResearchCount, unlocksOf, type Unlock } from '../core/alerts';
import { researchEffects } from './MetaPanels';
import type { Notice } from '../game';
import { incomePerMinute } from '../core/sim';
import { boostActive } from '../core/economy';
import { moveFee } from '../core/actions';
import { fmtClock, fmtMoney, fmtNum } from '../i18n';
import { GemIcon, NAV, NavIcon } from './nav';
import { useGame, useHighlight, useT } from './hooks';

export function TopBar() {
  const game = useGame();
  const t = useT();
  const s = game.state;
  const { gen, demand, satisfaction, battery, batteryMax } = s.power;
  const load = gen > 0 ? demand / gen : 0;
  const low = satisfaction < 0.999;
  const upgradesHi = useHighlight('upgrades-btn');
  const now = Date.now();
  const nav = NAV.filter((n) => n.visible(s));
  const anyBadge = nav.some((n) => n.badge?.(s));
  return (
    <header className="topbar">
      <div className="stat money">
        <span className="label">{t('ui.money')}</span>
        <span className="value mono">{fmtMoney(s.money)}</span>
        <span className="sub mono">
          +{fmtMoney(incomePerMinute(s))}
          {t('ui.perMin')}
        </span>
      </div>
      <div className={`stat power ${low ? 'low' : ''}`} title={low ? t('ui.powerLow', { pct: Math.round(satisfaction * 100) }) : ''}>
        <span className="label">⚡ {t('ui.power')}</span>
        <span className="value mono">
          {fmtNum(demand)} / {fmtNum(gen)} <small>MW</small>
          {low && <small className="pct"> {Math.round(satisfaction * 100)}%</small>}
        </span>
        <span className="meter">
          <span className="fill" style={{ width: `${Math.min(100, load * 100)}%` }} />
        </span>
        {batteryMax > 0 && (
          <span className="meter battery">
            <span className="fill" style={{ width: `${(battery / batteryMax) * 100}%` }} />
          </span>
        )}
      </div>
      <div className="chips">
        <button className="chip gems mono" onClick={() => game.openPanel('shop')} aria-label={t('ui.gems')}>
          <GemIcon /> {s.gems}
        </button>
        {(game.online?.onlineCount ?? 0) > 0 && (
          <span className="chip online-count" title={t('ui.onlineCount', { n: game.online!.onlineCount! })}>
            <span className="online-dot" />
            {game.online!.onlineCount}
          </span>
        )}
        {s.research.active ? (
          <button className="chip mono" onClick={() => game.openPanel('research')}>
            <NavIcon panel="research" size={14} /> {fmtClock(s.research.active.remaining)}
          </button>
        ) : (
          metaUnlocked(s) &&
          availableResearchCount(s) > 0 && (
            <button className="chip research-idle" onClick={() => game.openPanel('research')} title={t('notice.labIdle')}>
              <NavIcon panel="research" size={14} /> ✓ {t('notice.researchNextShort')}
            </button>
          )
        )}
        {s.veins.length > 0 && (
          <button className="chip vein" onClick={() => game.focusVein()} title={t('ui.richVein')}>
            ✦ {s.veins.length}
          </button>
        )}
        {boostActive(s, now) && <span className="chip boost mono">×2 · {fmtClock((s.boostUntil - now) / 1000)}</span>}
      </div>
      <nav className="top-actions desktop-nav">
        {nav.map((n) => {
          const badge = n.badge?.(s);
          const hi = (n.panel === 'upgrades' && upgradesHi) || currentQuest(s)?.highlight === `nav-${n.panel}`;
          return (
            <button
              key={n.panel}
              className={`icon-btn ${game.ui.panel === n.panel ? 'active' : ''} ${hi ? 'tut-pulse' : ''}`}
              onClick={() => game.openPanel(n.panel)}
              aria-label={t(n.label)}
              title={t(n.label)}
              data-tut={n.panel === 'upgrades' ? 'upgrades-btn' : undefined}
            >
              <NavIcon panel={n.panel} />
              {badge ? <span className="badge">{typeof badge === 'number' ? badge : ''}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="top-actions mobile-nav">
        <button
          className={`icon-btn ${upgradesHi || currentQuest(s)?.highlight?.startsWith('nav-') ? 'tut-pulse' : ''}`}
          onClick={() => game.openPanel('menu')}
          aria-label={t('ui.menu')}
        >
          <NavIcon panel="menu" />
          {anyBadge ? <span className="badge" /> : null}
        </button>
      </div>
      {low && <div className="power-warning">{t('ui.powerLow', { pct: Math.round(satisfaction * 100) })}</div>}
    </header>
  );
}

export function QuestCard() {
  const game = useGame();
  const t = useT();
  const q = currentQuest(game.state);
  if (!q) return <div className="quest-card done">{t('ui.allQuestsDone')}</div>;
  const i = currentQuestIndex(game.state);
  const tutTotal = QUESTS.filter((x) => x.tutorial).length;
  const prog = q.progress?.(game.state);
  return (
    <div className={`quest-card ${q.tutorial ? 'tutorial' : ''}`}>
      <div className="quest-head">
        <span className="quest-kind">{q.tutorial ? `${t('ui.tutorial')} ${i + 1}/${tutTotal}` : t('ui.quest')}</span>
        {q.reward > 0 && (
          <span className="quest-reward mono">
            {t('ui.reward')} {fmtMoney(q.reward)}
          </span>
        )}
      </div>
      <div className="quest-title">{t(`q.${q.id}.t`)}</div>
      <div className="quest-desc">{t(`q.${q.id}.d`)}</div>
      {prog && (
        <div className="quest-progress">
          <span className="meter">
            <span className="fill" style={{ width: `${Math.min(100, (prog[0] / prog[1]) * 100)}%` }} />
          </span>
          <span className="mono">
            {Math.min(prog[0], prog[1]).toLocaleString()}/{prog[1].toLocaleString()}
          </span>
        </div>
      )}
      {q.tutorial && (
        <button className="link-btn" onClick={() => game.skipTutorial()}>
          {t('ui.skipTutorial')}
        </button>
      )}
    </div>
  );
}

export function QuestDoneBanner() {
  const game = useGame();
  const t = useT();
  const q = game.ui.questDone;
  if (!q) return null;
  return (
    <div className="quest-done" key={q.id}>
      <span>✓ {t('ui.questDone')}</span>
      <strong>{t(`q.${q.id}.t`)}</strong>
      {q.reward > 0 && <span className="mono reward">+{fmtMoney(q.reward)}</span>}
    </div>
  );
}

export function Toasts() {
  const game = useGame();
  return (
    <div className="toasts">
      {game.ui.toasts.map((x) => (
        <div key={x.id} className={`toast ${x.kind}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

/** Bottom controls: Build / Connect, or the active-mode hint with Cancel. */
export function BottomBar() {
  const game = useGame();
  const t = useT();
  const mode = game.ui.mode;
  const buildHi = useHighlight('build-btn');
  const linkHi = useHighlight('link-btn');

  const plan = game.ui.tidy;
  if (plan) {
    const b = plan.before;
    const a = plan.after;
    return (
      <div className="bottombar mode tidy-bar">
        <div className="tidy-stats">
          <strong>{t('ui.tidyPreview')}</strong>
          <span className="small">
            {t('ui.tidyCrossings')} <span className="mono">{b.crossings} → </span>
            <span className={`mono ${a.crossings < b.crossings ? 'good' : ''}`}>{a.crossings}</span> · {t('ui.tidyLength')}{' '}
            <span className="mono">{b.tiles} → </span>
            <span className={`mono ${a.tiles < b.tiles ? 'good' : ''}`}>{a.tiles}</span>
          </span>
          <span className="small dim">{plan.cost > 0 ? `${t('ui.cost')} ${fmtMoney(plan.cost)}` : t('ui.free')}</span>
        </div>
        <div className="tidy-actions">
          <button className="btn ghost" onClick={() => game.cancelTidy()}>
            {t('ui.cancel')}
          </button>
          <button className="btn primary" disabled={game.state.money < plan.cost} onClick={() => game.acceptTidy()}>
            {t('ui.tidyApply')}
          </button>
        </div>
      </div>
    );
  }

  if (mode.kind !== 'select') {
    let hint = '';
    if (mode.kind === 'build') {
      hint =
        mode.type === 'miner'
          ? t('ui.placeMinerHint')
          : t('ui.placeHint', { name: t(`b.${mode.type}`) });
      hint += ` · ${fmtMoney(BUILDINGS[mode.type].cost)}`;
    } else if (mode.kind === 'move') {
      const mb = game.state.buildings.find((x) => x.id === mode.id);
      hint = t('ui.moveHint', { name: mb ? t(`b.${mb.type}`) : '' });
      if (mb) {
        const fee = moveFee(game.state, mb);
        hint += ` · ${fee > 0 ? fmtMoney(fee) : t('ui.free')}`;
      }
    } else {
      hint = mode.from === null ? t('ui.linkPickSource') : t('ui.linkPickTarget');
      const p = game.ui.linkPreview;
      if (p) {
        hint = p.plan.ok
          ? `${t('ui.linkCost', { tiles: p.plan.value.path.length, cost: p.plan.value.cost })}`
          : t(p.plan.reason);
      }
    }
    return (
      <div className="bottombar mode">
        <span className="mode-hint">{hint}</span>
        <button className="btn ghost" onClick={() => game.setMode({ kind: 'select' })}>
          {t('ui.cancel')}
        </button>
      </div>
    );
  }

  if (game.ui.selected !== null || game.ui.plot || game.ui.tile) return null; // the inspector takes the bottom on mobile

  return (
    <div className="bottombar">
      <button className={`btn primary big ${buildHi ? 'tut-pulse' : ''}`} onClick={() => game.openPanel('build')} data-tut="build-btn">
        ⊕ {t('ui.build')}
      </button>
      <button className={`btn big ${linkHi ? 'tut-pulse' : ''}`} onClick={() => game.setMode({ kind: 'link', from: null })} data-tut="link-btn">
        ⇢ {t('ui.link')}
      </button>
    </div>
  );
}

/** floating map tools: belt view mode and tidy belts */
export function MapTools() {
  const game = useGame();
  const t = useT();
  if (game.ui.tidy || game.ui.mode.kind !== 'select' || !game.state.belts.length) return null;
  const sheetOpen = game.ui.selected !== null || game.ui.plot || game.ui.tile;
  const view = game.beltView;
  return (
    <div className={`map-tools ${sheetOpen ? 'sheet-open' : ''}`}>
      <button className="tool-btn" onClick={() => game.cycleBeltView()} title={t(`ui.beltView.${view}`)} aria-label={t(`ui.beltView.${view}`)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M3 7h18M3 12h18M3 17h18" opacity={view === 'all' ? 1 : 0.35} />
          {view !== 'all' && <path d="M3 12h18" />}
        </svg>
        <span>{t(`ui.beltViewShort.${view}`)}</span>
      </button>
      <button className="tool-btn" disabled={game.ui.busy} onClick={() => game.previewTidy()} title={t('ui.tidyTip')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 6h6l4 6h6M4 18h6l4-6" />
          <path d="M17 9l3 3-3 3" />
        </svg>
        <span>{game.ui.busy ? t('ui.working') : t('ui.tidy')}</span>
      </button>
    </div>
  );
}

/** cards that stay until closed: research done, contract done, and the notification offer */
export function Notices() {
  const game = useGame();
  const t = useT();
  const { notices, askNotify } = game.ui;
  if (!notices.length && !askNotify) return null;
  const s = game.state;
  const unlockLabel = (u: Unlock) =>
    u.kind === 'building'
      ? t(`b.${u.id}`)
      : u.kind === 'item'
        ? t(`item.${u.id}`)
        : u.kind === 'zone'
          ? t('notice.zoneLicence', { zone: t(`zone.${u.id}`) })
          : u.kind === 'city'
            ? t(`city.${u.id}`)
            : t(`veh.${u.id}`);
  const card = (n: Notice) => {
    const close = (
      <button className="icon-btn small" onClick={() => game.dismissNotice(n.id)} aria-label={t('ui.close')}>
        ✕
      </button>
    );
    if (n.kind === 'research') {
      const opens = [...unlocksOf(n.research).map(unlockLabel), ...researchEffects(n.research, t)];
      const avail = availableResearchCount(s);
      return (
        <div key={n.id} className="notice research" role="status">
          <div className="notice-head">
            <NavIcon panel="research" size={16} />
            <span className="notice-kind">{t('notice.researchDone')}</span>
            {close}
          </div>
          <strong className="notice-title">{t(`r.${n.research}.t`)}</strong>
          {opens.length > 0 && (
            <p className="small">
              <span className="dim">{t('notice.unlocked')}</span> {opens.join(' · ')}
            </p>
          )}
          <div className="notice-actions">
            <button
              className="btn small primary"
              onClick={() => {
                game.dismissNotice(n.id);
                if (game.ui.panel !== 'research') game.openPanel('research');
              }}
            >
              {avail > 0 ? t('notice.researchNext') : t('notice.openResearch')} →
            </button>
            {avail > 0 && <span className="small dim">{t('notice.availableN', { n: avail })}</span>}
          </div>
        </div>
      );
    }
    return (
      <div key={n.id} className="notice contract" role="status">
        <div className="notice-head">
          <NavIcon panel="contracts" size={16} />
          <span className="notice-kind">{t('notice.contractDone')}</span>
          {close}
        </div>
        <strong className="notice-title">
          {t(`item.${n.item}`)} · <span className="mono good">+{fmtMoney(n.reward)}</span>
        </strong>
        <div className="notice-actions">
          <button
            className="btn small"
            onClick={() => {
              game.dismissNotice(n.id);
              if (game.ui.panel !== 'contracts') game.openPanel('contracts');
            }}
          >
            {t('notice.newContracts')} →
          </button>
        </div>
      </div>
    );
  };
  return (
    <div className="notices">
      {askNotify && (
        <div className="notice ask" role="dialog">
          <p className="small">{t('notify.ask')}</p>
          <div className="notice-actions">
            <button className="btn small primary" onClick={() => void game.answerNotify(true)}>
              {t('notify.yes')}
            </button>
            <button className="btn small ghost" onClick={() => void game.answerNotify(false)}>
              {t('notify.no')}
            </button>
          </div>
        </div>
      )}
      {notices.map(card)}
    </div>
  );
}
