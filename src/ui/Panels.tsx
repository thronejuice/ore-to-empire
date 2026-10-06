import { useState } from 'react';
import { BALANCE, ITEMS, beltSpeed, beltUpgradeCost, type ItemId } from '../config/balance';
import { beltMaxLevel } from '../core/economy';
import { fmtDuration, fmtMoney, fmtNum } from '../i18n';
import { useGame, useHighlight, useT } from './hooks';
import { Inv, ItemIcon } from './icons';

export function Modal({
  title,
  children,
  onClose,
  wide,
  head,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  head?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {head}
          <button className="icon-btn" onClick={onClose} aria-label={t('ui.close')}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function UpgradesPanel() {
  const game = useGame();
  const t = useT();
  const hi = useHighlight('upgrades-btn');
  if (game.ui.panel !== 'upgrades') return null;
  const s = game.state;
  const lvl = s.beltLevel;
  const max = lvl >= beltMaxLevel(s);
  const cost = beltUpgradeCost(lvl);
  const rate = (l: number) => fmtNum(beltSpeed(l) / BALANCE.beltSpacing);
  return (
    <Modal title={t('ui.upgrades')} onClose={() => game.openPanel('none')}>
      <div className="upgrade-row">
        <div>
          <div className="up-name">
            {t('ui.beltSpeed')} <span className="lv mono">{t('ui.level', { n: lvl })}</span>
          </div>
          <div className="dim small">{max ? t('ui.max') : t('ui.beltSpeedDesc', { now: rate(lvl), next: rate(lvl + 1) })}</div>
        </div>
        <button className={`btn primary ${hi && !max ? 'tut-pulse' : ''}`} disabled={max || s.money < cost} onClick={() => game.upgradeBelts()}>
          {max ? t('ui.max') : fmtMoney(cost)}
        </button>
      </div>
    </Modal>
  );
}

export function StatsPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'stats') return null;
  const s = game.state;
  const rows = (Object.keys(ITEMS) as ItemId[]).filter((k) => (s.stats.sold[k] ?? 0) > 0 || (s.stats.produced[k] ?? 0) > 0);
  return (
    <Modal title={t('ui.stats')} onClose={() => game.openPanel('none')}>
      <div className="kv">
        <span>{t('ui.totalEarned')}</span>
        <span className="mono">{fmtMoney(s.stats.totalEarned)}</span>
      </div>
      <table className="stats-table">
        <thead>
          <tr>
            <th />
            <th>{t('ui.produced')}</th>
            <th>{t('ui.sold')}</th>
            <th>$</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k}>
              <td>
                <ItemIcon item={k} /> {t(`item.${k}`)}
              </td>
              <td className="mono">{Math.floor(s.stats.produced[k] ?? 0).toLocaleString()}</td>
              <td className="mono">{Math.floor(s.stats.sold[k] ?? 0).toLocaleString()}</td>
              <td className="mono dim">{fmtNum(ITEMS[k].price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export function SettingsPanel() {
  const game = useGame();
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  if (game.ui.panel !== 'settings') return null;
  const lang = game.state.settings.lang;
  return (
    <Modal title={t('ui.settings')} onClose={() => game.openPanel('none')}>
      <div className="setting">
        <span>{t('ui.language')}</span>
        <div className="seg">
          <button className={lang === 'th' ? 'active' : ''} onClick={() => game.setLang('th')}>
            ไทย
          </button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => game.setLang('en')}>
            English
          </button>
        </div>
      </div>
      <div className="setting">
        <span>{t('ui.sound')}</span>
        <div className="seg">
          <button className={game.state.settings.sound ? 'active' : ''} onClick={() => game.setSound(true)}>
            {t('ui.on')}
          </button>
          <button className={!game.state.settings.sound ? 'active' : ''} onClick={() => game.setSound(false)}>
            {t('ui.off')}
          </button>
        </div>
      </div>
      <div className="setting">
        <span>{t('intro.howToPlay')}</span>
        <button className="btn small" onClick={() => game.openIntro()}>
          {t('intro.open')}
        </button>
      </div>
      <div className="setting">
        <span className="dim small">{t('ui.zoomHint')}</span>
      </div>
      <div className="setting">
        <button className={`btn danger ${confirm ? 'armed' : ''}`} onClick={() => (confirm ? game.reset() : setConfirm(true))}>
          {confirm ? t('ui.resetConfirm') : t('ui.resetGame')}
        </button>
      </div>
      <p className="dim small version">
        {game.state.player && <>{game.state.player.name} · </>}Ore to Empire · v{__APP_VERSION__}
      </p>
    </Modal>
  );
}

export function OfflineModal() {
  const game = useGame();
  const t = useT();
  const r = game.ui.offline;
  if (!r) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal welcome" role="dialog">
        <h2>{t('ui.welcomeBack')}</h2>
        <p className="dim">{t('ui.awayFor', { time: fmtDuration(game.state.settings.lang, r.awaySeconds) })}</p>
        {r.capped && <p className="dim small">{t('ui.awayCapped', { h: BALANCE.offlineCapHours })}</p>}
        <div className="welcome-amount">
          <span className="dim small">{t('ui.factoryEarned')}</span>
          <span className="mono big">+{fmtMoney(r.earned)}</span>
        </div>
        <div className="welcome-items">
          <Inv inv={r.sold} empty="" />
        </div>
        {r.researchDone.length > 0 && (
          <p className="small good">{t('ui.offlineResearch', { list: r.researchDone.map((id) => t(`r.${id}.t`)).join(', ') })}</p>
        )}
        <button className="btn primary big" onClick={() => game.dismissOffline()}>
          {t('ui.collect')}
        </button>
      </div>
    </div>
  );
}
