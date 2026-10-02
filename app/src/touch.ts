/**
 * Touch screens (LemmixRL, not in Lemmix): whether the player is using touch, and the size of the screen in device
 * pixels. The game switches to touch controls on the first touch and back to the mouse on the first mouse click, so
 * hybrid devices work both ways. Mouse play stays exactly as it was.
 */
type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();

function coarsePointer(): boolean {
  try {
    return navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export const touch = {
  /** the last input was a finger (or a pen) */
  active: coarsePointer(),
};

function setActive(active: boolean): void {
  if (touch.active === active) return;
  touch.active = active;
  for (const l of listeners) l(active);
}

/** Follows the kind of input; call once at start. */
export function initTouchDetection(): void {
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') setActive(true);
      else if (e.pointerType === 'mouse') setActive(false);
    },
    true,
  );
}

/** Called when the input switches between touch and mouse; returns a function that removes the listener. */
export function onTouchChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** the device pixels per CSS pixel */
export function pixelRatio(): number {
  return Math.max(1, window.devicePixelRatio || 1);
}

/** a size in CSS pixels as device pixels (for things on the canvas that should look the same size on every screen) */
export function cssPx(n: number): number {
  return Math.round(n * pixelRatio());
}

/** The client position of an event as canvas pixels (the canvas has the device resolution). */
export function canvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const kx = rect.width > 0 ? canvas.width / rect.width : 1;
  const ky = rect.height > 0 ? canvas.height / rect.height : 1;
  return { x: (clientX - rect.left) * kx, y: (clientY - rect.top) * ky };
}

let probe: HTMLDivElement | null = null;

/** The safe area of the screen (notches, rounded corners, home indicator) in device pixels. */
export function safeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  const px = (v: string) => Math.round((Number.parseFloat(v) || 0) * pixelRatio());
  return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
}

/** Full screen is there in Android browsers (an iPhone has it only for the game added to the home screen). */
export function canFullscreen(): boolean {
  return !!document.fullscreenEnabled;
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Full screen on or off; on, a phone is also held sideways where the browser allows it. Needs a tap or a key. */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock('landscape'))
    .catch(() => {});
}

let wakeLock: WakeLockSentinel | null = null;
let wantAwake = false;
let wakeListening = false;

/**
 * Keeps the screen on (or lets it sleep again): a phone dims its screen when it is not touched for a while, and in
 * Lemmings one often waits for the lemmings to walk.
 */
export function keepScreenOn(on: boolean): void {
  wantAwake = on;
  if (!wakeListening) {
    wakeListening = true;
    // the browser releases the lock when the page is hidden
    document.addEventListener('visibilitychange', () => void acquireWakeLock());
  }
  if (on) void acquireWakeLock();
  else if (wakeLock) {
    const l = wakeLock;
    wakeLock = null;
    l.release().catch(() => {});
  }
}

async function acquireWakeLock(): Promise<void> {
  if (!wantAwake || wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    const l = await navigator.wakeLock.request('screen');
    if (!wantAwake || wakeLock) {
      l.release().catch(() => {});
      return;
    }
    wakeLock = l;
    l.addEventListener('release', () => {
      if (wakeLock === l) wakeLock = null;
    });
  } catch {
    // not allowed (a battery saver, an iframe): the screen sleeps as usual
  }
}
