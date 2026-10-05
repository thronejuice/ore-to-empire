import { BALANCE, BUILDINGS, BUILD_MENU_ORDER } from '../config/balance';
import { isBuildingUnlocked } from '../core/quests';
import { fmtMoney, fmtNum } from '../i18n';
import { useGame, useHighlight, useT } from './hooks';
import { BuildingIcon } from './icons';
import type { BuildingType } from '../config/balance';

function BuildCard({ type }: { type: BuildingType }) {
  const game = useGame();
  const t = useT();
  const def = BUILDINGS[type];
  const unlocked = isBuildingUnlocked(game.state, type);
  const afford = game.state.money >= def.cost;
  const hi = useHighlight(`build-${type}`);
  const desc = t(`bd.${type}`, { mw: type === 'hq' ? BALANCE.hqPower : BALANCE.coalPlantPower });
  return (
    <button
      className={`build-card ${!unlocked ? 'locked' : ''} ${!afford ? 'poor' : ''} ${hi ? 'tut-pulse' : ''}`}
      disabled={!unlocked}
      onClick={() => game.chooseBuild(type)}
      data-tut={`build-${type}`}
    >
      <BuildingIcon type={type} size={44} />
      <span className="bc-name">{t(`b.${type}`)}</span>
      {unlocked ? (
        <>
          <span className="bc-cost mono">{fmtMoney(def.cost)}</span>
          <span className="bc-meta">
            {def.power > 0 && <span>⚡{fmtNum(def.power)} MW</span>}
            {type === 'coal_plant' && <span className="good">+{BALANCE.coalPlantPower} MW</span>}
            {(def.w > 1 || def.h > 1) && (
              <span>
                {def.w}×{def.h}
              </span>
            )}
          </span>
          <span className="bc-desc">{desc}</span>
        </>
      ) : (
        <span className="bc-desc">🔒 {t('ui.unlocksAt')}</span>
      )}
    </button>
  );
}

export function BuildDrawer() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'build') return null;
  return (
    <div className="sheet build-sheet" role="dialog">
      <div className="sheet-head">
        <h2>{t('ui.build')}</h2>
        <button className="icon-btn" onClick={() => game.openPanel('none')} aria-label={t('ui.close')}>
          ✕
        </button>
      </div>
      <div className="build-grid">
        {BUILD_MENU_ORDER.map((type) => (
          <BuildCard key={type} type={type} />
        ))}
      </div>
    </div>
  );
}
