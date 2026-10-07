import { useEffect, useRef, useState } from 'react';
import { Game } from '../game';
import { hasStoredSession, onlineConfigured } from '../online/config';
import { Renderer } from '../render/renderer';
import { BuildDrawer } from './BuildDrawer';
import { GameContext } from './hooks';
import { BottomBar, MapTools, QuestCard, QuestDoneBanner, Toasts, TopBar } from './Hud';
import { Inspector } from './Inspector';
import { OfflineModal, SettingsPanel, StatsPanel, UpgradesPanel } from './Panels';
import { ContractsPanel, DailyPanel, FleetPanel, MarketsPanel, MenuSheet, PlotSheet, ExpansionPanel, ResearchPanel } from './MetaPanels';
import { ShopPanel } from './ShopPanel';
import { TileSheet } from './TileSheet';
import { AccountPanel, ConflictModal, PaymentModal } from './OnlinePanels';
import { Onboarding } from './Onboarding';
import { Intro } from './Intro';
import { WhatsNew } from './WhatsNew';

export function App() {
  const [game] = useState(() => new Game(undefined, { deferCatchUp: hasStoredSession() }));
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.lang = game.state.settings.lang;
    (window as unknown as { __game: Game }).__game = game; // handy for debugging in the console
    game.start();
    if (onlineConfigured) {
      // a stuck network must not hold back offline progress forever
      const fallback = window.setTimeout(() => game.applyDeferredCatchUp(), 8000);
      void import('../online/online')
        .then(({ Online }) => Online.create(game))
        .catch(() => game.applyDeferredCatchUp())
        .finally(() => window.clearTimeout(fallback));
    }
    const renderer = new Renderer(game);
    (window as unknown as { __renderer: Renderer }).__renderer = renderer;
    if (canvasHost.current) void renderer.mount(canvasHost.current);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'm' || e.key === 'M') && game.ui.mode.kind === 'select' && game.ui.selected !== null) {
        game.startMove(game.ui.selected);
        return;
      }
      if (e.key === 'Escape') {
        if (game.ui.mode.kind !== 'select') game.setMode({ kind: 'select' });
        else if (game.ui.panel !== 'none') game.openPanel('none');
        else game.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      game.save();
      game.stop();
      renderer.destroy();
    };
  }, [game]);

  return (
    <GameContext.Provider value={game}>
      <div className="app">
        <div className="canvas-host" ref={canvasHost} />
        <TopBar />
        <div className="left-stack">
          <QuestCard />
        </div>
        <QuestDoneBanner />
        <Toasts />
        <Inspector />
        <PlotSheet />
        <TileSheet />
        <MapTools />
        <BottomBar />
        <BuildDrawer />
        <UpgradesPanel />
        <StatsPanel />
        <SettingsPanel />
        <ResearchPanel />
        <MarketsPanel />
        <FleetPanel />
        <ContractsPanel />
        <DailyPanel />
        <ExpansionPanel />
        <ShopPanel />
        <MenuSheet />
        <AccountPanel />
        <PaymentModal />
        <ConflictModal />
        <OfflineModal />
        <Onboarding />
        <Intro />
        <WhatsNew />
      </div>
    </GameContext.Provider>
  );
}
