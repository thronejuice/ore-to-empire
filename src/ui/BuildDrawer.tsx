import { BUILDINGS, BUILD_MENU_ORDER, POWER } from '../config/balance';
import { isBuildingUnlocked } from '../core/quests';
import { researchState } from '../core/research';
import { fmtMoney, fmtNum } from '../i18n';
import { useGame, useHighlight, useT } from './hooks';
import { BuildingIcon } from './icons';
import type { BuildingType } from '../config/balance';

const ZONE_BUILDINGS = new Set<BuildingType>(BUILD_MENU_ORDER.slice(BUILD_MENU_ORDER.indexOf('dock') + 1));

function BuildCard({ type }: { type: BuildingType }) {
  const game = useGame();
  const t = useT();
  const def = BUILDINGS[type];
  const unlocked = isBuildingUnlocked(game.state, type);
  const afford = game.state.money >= def.cost;
  const hi = useHighlight(`build-${type}`);
  const mw = type === 'solar' ? POWER.solar : type === 'nuclear_plant' ? POWER.nuclear : type === 'geothermal' ? POWER.geothermal : POWER.coalPlant;
  const desc = t(`bd.${type}`, { mw });
  const needs = def.research && !game.state.research.done.includes(def.research) ? def.research : null;
  if (needs && !game.state.research.done.length && type !== 'dock') return null; // keep the menu short early on
  if (needs && ZONE_BUILDINGS.has(type) && researchState(game.state, needs) === 'locked') return null; // zone gear shows up once it's in reach
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
            {(type === 'coal_plant' || type === 'solar' || type === 'nuclear_plant' || type === 'geothermal') && <span className="good">+{mw} MW</span>}
            {(def.w > 1 || def.h > 1) && (
              <span>
                {def.w}×{def.h}
              </span>
            )}
          </span>
          <span className="bc-desc">{desc}</span>
        </>
      ) : (
        <span className="bc-desc">🔒 {needs ? t('ui.researchLocked', { name: t(`r.${needs}.t`) }) : t('ui.unlocksAt')}</span>
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
