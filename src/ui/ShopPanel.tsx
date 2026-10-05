import { useGame, useT } from './hooks';
import { GemItems } from './MetaPanels';
import { GemIcon } from './nav';
import { Modal } from './Panels';

/** Gem shop. Phase 4 (online) adds gem packs and sign-in; guests spend free daily gems. */
export function ShopPanel() {
  const game = useGame();
  const t = useT();
  if (game.ui.panel !== 'shop') return null;
  return (
    <Modal
      title={t('ui.shop')}
      onClose={() => game.openPanel('none')}
      head={
        <span className="pill mono">
          <GemIcon /> {game.state.gems}
        </span>
      }
    >
      <GemItems />
      <p className="small dim">{t('ui.gemsFree')}</p>
    </Modal>
  );
}
