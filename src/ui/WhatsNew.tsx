import { startupPopupsDone } from './Intro';
import { useGame, useT } from './hooks';

/**
 * Patch notes with the version that introduced them. A player sees every note
 * newer than the version they last closed this popup on, so skipping a release
 * doesn't hide its news. Drop old entries once nobody can still be behind them.
 */
const NOTES: { key: string; version: string }[] = [
  { key: 'news.1', version: '1.2.0' },
  { key: 'news.2', version: '1.2.0' },
  { key: 'news.3', version: '1.2.0' },
  { key: 'news.4', version: '1.2.0' },
  { key: 'news.5', version: '1.2.1' },
];

function newer(a: string, b: string | undefined): boolean {
  if (!b) return true;
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

export function notesFor(seenVersion: string | undefined): string[] {
  return NOTES.filter((n) => newer(n.version, seenVersion)).map((n) => n.key);
}

/** Patch notes, shown once to returning players after the game updates. */
export function WhatsNew() {
  const game = useGame();
  const t = useT();
  const s = game.state;
  if (game.ui.intro || s.quests.introSeen === false || s.settings.seenVersion === __APP_VERSION__) return null;
  if (!startupPopupsDone(game)) return null;
  const notes = notesFor(s.settings.seenVersion);
  if (!notes.length) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal whats-new" role="dialog" aria-modal="true" aria-labelledby="news-title">
        <span className="whats-new-tag mono">v{__APP_VERSION__}</span>
        <h2 id="news-title">{t('news.title')}</h2>
        <ul>
          {notes.map((k) => (
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
