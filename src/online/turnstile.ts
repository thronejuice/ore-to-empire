/** Cloudflare Turnstile (optional bot check when creating accounts). */
interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; theme?: string }): string;
  remove(id: string): void;
}

let loading: Promise<TurnstileApi> | null = null;

function load(): Promise<TurnstileApi> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** renders the widget into `el`; returns a cleanup function */
export function mountTurnstile(el: HTMLElement, siteKey: string, onToken: (token: string | null) => void): () => void {
  let id: string | null = null;
  let gone = false;
  load()
    .then((api) => {
      if (gone) return;
      id = api.render(el, { sitekey: siteKey, theme: 'dark', callback: (t) => onToken(t), 'expired-callback': () => onToken(null) });
    })
    .catch(() => onToken(null));
  return () => {
    gone = true;
    const w = window as unknown as { turnstile?: TurnstileApi };
    if (id && w.turnstile) w.turnstile.remove(id);
  };
}
