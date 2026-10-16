/**
 * Installing the game as an app (LemmixRL): it is a web app with a manifest (full screen, landscape, an icon), so a
 * browser can install it. Chrome, Edge and Android browsers offer that with an event the page can keep and trigger
 * with a click (one-click install); Safari on an iPhone or an iPad installs it with Share > Add to Home Screen; other
 * browsers say how in their menu. Installed, the game starts full screen, without the browser around it.
 */

/** the browser's install prompt (Chromium), kept for a click on Install */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function changed(): void {
  for (const l of listeners) l();
}

/** Listens for the browser's install prompt; call once at start (the event comes early). */
export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // (keep it for the Install button instead of the browser's own little banner)
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    changed();
  });
}

/** Called when what can be installed changes; returns a function that removes the listener. */
export function onInstallChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** the game runs as an installed app (or full screen from the home screen of an iPhone) */
export function isInstalled(): boolean {
  if (installed) return true;
  try {
    if (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    // no media queries
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** the browser can install it with one click */
export function canInstallNow(): boolean {
  return !!deferred;
}

/** Shows the browser's install dialog; true when the player installed it. */
export async function installNow(): Promise<boolean> {
  const d = deferred;
  if (!d) return false;
  deferred = null;
  await d.prompt();
  const choice = await d.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  if (choice.outcome === 'accepted') installed = true;
  changed();
  return choice.outcome === 'accepted';
}

export type InstallPlatform = 'ios' | 'android' | 'firefox' | 'desktop';

export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // (an iPad says it is a Mac, but has a touch screen)
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'firefox';
  return 'desktop';
}

/** How to install it on this platform, step by step (when the browser offers no one-click install). */
export function installSteps(p: InstallPlatform = installPlatform()): string[] {
  switch (p) {
    case 'ios':
      return ['In Safari, tap the Share button (the square with an arrow).', 'Choose "Add to Home Screen", then "Add".', 'Start Lematro from its icon: full screen, sideways.'];
    case 'android':
      return ['Open the menu of the browser (the three dots).', 'Choose "Install app" or "Add to Home screen".', 'Start Lematro from its icon: full screen, sideways.'];
    case 'firefox':
      return ['Firefox on a computer does not install web apps.', 'Open this page in Chrome or Edge, and install it from there.', 'Or play on: it works in the browser too.'];
    case 'desktop':
      return ['Click the install icon at the right of the address bar,', 'or open the menu of the browser and choose "Install Lematro".', 'It opens in its own window, without the browser around it.'];
  }
}
