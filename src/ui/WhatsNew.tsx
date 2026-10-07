import { startupPopupsDone } from './Intro';
import { useGame, useT } from './hooks';

/** i18n keys of this version's notes — replace them on every release that players should hear about */
const NOTES = ['news.1', 'news.2', 'news.3', 'news.4'];

/** Patch notes, shown once to returning players after the game updates. */
export function WhatsNew() {
  const game = useGame();
  const t = useT();
  const s = game.state;
  if (game.ui.intro || s.quests.introSeen === false || s.settings.seenVersion === __APP_VERSION__) return null;
  if (!startupPopupsDone(game)) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal whats-new" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <span className="whats-new-tag mono">v{__APP_VERSION__}</span>
        <h2 id="news-title">{t('news.title')}</h2>
        <ul>
          {NOTES.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
        <div className="intro-nav">
          <button
            className="btn ghost"
            onClick={() => {
              game.dismissWhatsNew();
              game.openIntro();
            }}
          >
            {t('news.howToPlay')}
          </button>
          <button className="btn primary" onClick={() => game.dismissWhatsNew()}>
            {t('news.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
