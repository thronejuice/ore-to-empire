/**
 * Browser notifications and the tab title while the game sits in a background
 * tab. Uses a tiny service worker when there is one (Android Chrome only shows
 * notifications through a service worker); plain `Notification` otherwise.
 */

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;
}

export function notifyPermission(): NotificationPermission | 'unsupported' {
  return notifySupported() ? Notification.permission : 'unsupported';
}

let reg: Promise<ServiceWorkerRegistration | null> | null = null;
function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!reg) {
    reg =
      'serviceWorker' in navigator && location.protocol.startsWith('http')
        ? navigator.serviceWorker.register('/notify-sw.js').then(
            () => navigator.serviceWorker.ready,
            () => null,
          )
        : Promise.resolve(null);
  }
  return reg;
}

/** asks the browser; true when allowed */
export async function requestNotify(): Promise<boolean> {
  if (!notifySupported()) return false;
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (p === 'granted') void registration();
  return p === 'granted';
}

export async function showNotification(title: string, body: string, tag: string) {
  if (notifyPermission() !== 'granted') return;
  const opts: NotificationOptions = { body, tag };
  const r = await registration();
  if (r) {
    await r.showNotification(title, opts);
    return;
  }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* this browser only allows notifications from a service worker */
  }
}

// ---------------------------------------------------------------- scheduling while hidden

let timers: number[] = [];
let baseTitle: string | null = null;

export interface Scheduled {
  delayMs: number;
  title: string;
  body: string;
  tag: string;
  /** short text for the tab title, e.g. "✓ Research done" */
  tab: string;
  /** also show a browser notification */
  notify: boolean;
}

export function scheduleWhileHidden(list: Scheduled[]) {
  cancelScheduled();
  baseTitle = document.title;
  for (const a of list) {
    timers.push(
      window.setTimeout(() => {
        document.title = `${a.tab} · ${baseTitle}`;
        if (a.notify) void showNotification(a.title, a.body, a.tag);
      }, a.delayMs),
    );
  }
}

export function cancelScheduled() {
  for (const t of timers) clearTimeout(t);
  timers = [];
  if (baseTitle !== null) document.title = baseTitle;
  baseTitle = null;
}
