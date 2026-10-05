import { BUILDINGS } from '../config/balance';
import { QUESTS, currentQuest, currentQuestIndex } from '../core/quests';
import { incomePerMinute } from '../core/sim';
import { fmtMoney, fmtNum } from '../i18n';
import { useGame, useHighlight, useT } from './hooks';

export function TopBar() {
  const game = useGame();
  const t = useT();
  const s = game.state;
  const { gen, demand, satisfaction } = s.power;
  const load = gen > 0 ? demand / gen : 0;
  const low = satisfaction < 0.999;
  const upgradesHi = useHighlight('upgrades-btn');
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
      </div>
      <div className="top-actions">
        <button className={`icon-btn ${upgradesHi ? 'tut-pulse' : ''}`} onClick={() => game.openPanel('upgrades')} aria-label={t('ui.upgrades')} data-tut="upgrades-btn">
          ⇪
        </button>
        <button className="icon-btn" onClick={() => game.openPanel('stats')} aria-label={t('ui.stats')}>
          ▤
        </button>
        <button className="icon-btn" onClick={() => game.openPanel('settings')} aria-label={t('ui.settings')}>
          ⚙
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

  if (mode.kind !== 'select') {
    let hint = '';
    if (mode.kind === 'build') {
      hint =
        mode.type === 'miner'
          ? t('ui.placeMinerHint')
          : t('ui.placeHint', { name: t(`b.${mode.type}`) });
      hint += ` · ${fmtMoney(BUILDINGS[mode.type].cost)}`;
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

  if (game.ui.selected !== null) return null; // the inspector takes the bottom on mobile

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
