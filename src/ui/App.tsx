import { useEffect, useRef, useState } from 'react';
import { Game } from '../game';
import { Renderer } from '../render/renderer';
import { BuildDrawer } from './BuildDrawer';
import { GameContext } from './hooks';
import { BottomBar, QuestCard, QuestDoneBanner, Toasts, TopBar } from './Hud';
import { Inspector } from './Inspector';
import { OfflineModal, SettingsPanel, StatsPanel, UpgradesPanel } from './Panels';
import { ContractsPanel, DailyPanel, FleetPanel, MarketsPanel, MenuSheet, PlotSheet, PrestigePanel, ResearchPanel } from './MetaPanels';
import { ShopPanel } from './ShopPanel';

export function App() {
  const [game] = useState(() => new Game());
  const canvasHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.lang = game.state.settings.lang;
    (window as unknown as { __game: Game }).__game = game; // handy for debugging in the console
    game.start();
    const renderer = new Renderer(game);
    (window as unknown as { __renderer: Renderer }).__renderer = renderer;
    if (canvasHost.current) void renderer.mount(canvasHost.current);
    const onKey = (e: KeyboardEvent) => {
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
        <PrestigePanel />
        <ShopPanel />
        <MenuSheet />
        <OfflineModal />
      </div>
    </GameContext.Provider>
  );
}
