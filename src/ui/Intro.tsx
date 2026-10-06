import { useEffect, useRef, useState } from 'react';
import type { BuildingType, ItemId } from '../config/balance';
import { QUESTS } from '../core/quests';
import { onlineConfigured } from '../online/config';
import type { Online } from '../online/online';
import type { Game } from '../game';
import { useGame, useT } from './hooks';
import { BuildingIcon, ItemIcon } from './icons';

type Step = { item: ItemId } | { building: BuildingType };

const SLIDES: { id: string; chain: Step[] }[] = [
  { id: 'goal', chain: [{ item: 'iron_ore' }, { item: 'iron_bar' }, { item: 'motor' }, { item: 'electric_vehicle' }] },
  { id: 'mine', chain: [{ item: 'iron_ore' }, { building: 'miner' }, { building: 'hq' }] },
  { id: 'smelt', chain: [{ building: 'miner' }, { building: 'furnace' }, { building: 'hq' }] },
  { id: 'quests', chain: [] },
];

/** the name step, offline earnings and a cloud-save conflict are all out of the way */
export function startupPopupsDone(game: Game): boolean {
  if (game.ui.offline) return false;
  if (!onlineConfigured) return !!game.state.player;
  const online = game.online as Online | null;
  return !!online && online.ui.ready && !!online.ui.username && !online.ui.onboarding && !online.ui.conflict;
}

/** a brand-new save sees the intro once */
function firstRunReady(game: Game): boolean {
  return game.state.quests.introSeen === false && startupPopupsDone(game);
}

/** Intro slides shown before the first play (and from Settings → How to play). */
export function Intro() {
  const game = useGame();
  if (!game.ui.intro && !firstRunReady(game)) return null;
  return <IntroSlides />;
}

function IntroSlides() {
  const game = useGame();
  const t = useT();
  const [i, setI] = useState(0);
  const swipeX = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;
  const go = (n: number) => setI(Math.max(0, Math.min(SLIDES.length - 1, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(SLIDES.length - 1, n + 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slide = SLIDES[i];
  return (
    <div className="modal-backdrop intro-backdrop">
      <div
        className="modal intro"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onPointerDown={(e) => (swipeX.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipeX.current === null) return;
          const dx = e.clientX - swipeX.current;
          swipeX.current = null;
          if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
        }}
      >
        <button className="link-btn intro-skip" onClick={() => game.closeIntro()}>
          {t('intro.skip')}
        </button>
        <div className="intro-art" key={slide.id}>
          {slide.chain.length > 0 ? (
            slide.chain.map((s, n) => (
              <span key={n} className="intro-step">
                {n > 0 && <span className="intro-arrow">→</span>}
                {'item' in s ? <ItemIcon item={s.item} size={34} /> : <BuildingIcon type={s.building} size={44} />}
              </span>
            ))
          ) : (
            <div className="quest-card tutorial intro-quest">
              <span className="quest-kind">{t('ui.tutorial')} 1/{QUESTS.filter((q) => q.tutorial).length}</span>
              <div className="quest-title">{t('q.tut_miner.t')}</div>
            </div>
          )}
        </div>
        <h2 id="intro-title">{t(`intro.${slide.id}.t`)}</h2>
        <p className="dim">{t(`intro.${slide.id}.d`)}</p>
        <div className="intro-dots" aria-hidden>
          {SLIDES.map((s, n) => (
            <button key={s.id} className={n === i ? 'active' : ''} tabIndex={-1} onClick={() => go(n)} />
          ))}
        </div>
        <div className="intro-nav">
          <button className="btn ghost" disabled={i === 0} onClick={() => go(i - 1)}>
            ← {t('intro.back')}
          </button>
          {last ? (
            <button className="btn primary" onClick={() => game.closeIntro()}>
              {t('intro.start')}
            </button>
          ) : (
            <button className="btn primary" onClick={() => go(i + 1)}>
              {t('intro.next')} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
