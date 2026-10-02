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

/**
 * A double tap on one target (a button): two completed taps on the same target, the second one starting within ms
 * of the first. A tap is completed when the finger comes up on the target it went down on, without moving away from
 * it; a cancelled touch, a drag or a tap on another target starts over.
 */
export class DoubleTap<T> {
  /** the last completed tap */
  private last: { target: T; time: number } | null = null;
  /** the tap going on */
  private current: { target: T; time: number; x: number; y: number; valid: boolean } | null = null;

  constructor(
    private readonly ms: number,
    /** how far the finger may move during a tap */
    private readonly slop: number,
  ) {}

  down(target: T, time: number, x: number, y: number): void {
    this.current = { target, time, x, y, valid: true };
  }

  move(target: T, x: number, y: number): void {
    const c = this.current;
    if (c && (target !== c.target || Math.hypot(x - c.x, y - c.y) > this.slop)) c.valid = false;
  }

  /** The finger came up: returns the target of a completed double tap (then the next tap starts over), else null. */
  up(): T | null {
    const c = this.current;
    this.current = null;
    if (!c || !c.valid) {
      this.last = null;
      return null;
    }
    const last = this.last;
    if (last && last.target === c.target && c.time - last.time < this.ms) {
      this.last = null;
      return c.target;
    }
    this.last = { target: c.target, time: c.time };
    return null;
  }

  cancel(): void {
    this.current = null;
    this.last = null;
  }
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

/** What the browser answered to the last requests for full screen and a sideways screen (shown by ?diag). */
export const deviceStatus = { fullscreen: '-', orientationLock: '-' };

export function errorName(e: unknown): string {
  return e instanceof Error ? e.name : String(e);
}

/**
 * Full screen on or off; on, a phone is also turned sideways where the browser allows it (Android, not an iPhone).
 * Needs a tap or a key. When the browser refuses, nothing changes on the screen (the button is not lit).
 */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().then(
      () => (deviceStatus.fullscreen = 'exited'),
      (e: unknown) => (deviceStatus.fullscreen = `exit refused: ${errorName(e)}`),
    );
    return;
  }
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(
    () => {
      deviceStatus.fullscreen = 'on';
      const orientation = screen.orientation as ScreenOrientation | undefined;
      if (!orientation || typeof orientation.lock !== 'function') {
        deviceStatus.orientationLock = 'unavailable';
        return;
      }
      orientation.lock('landscape').then(
        () => (deviceStatus.orientationLock = 'landscape'),
        (e: unknown) => (deviceStatus.orientationLock = `refused: ${errorName(e)}`),
      );
    },
    (e: unknown) => (deviceStatus.fullscreen = `refused: ${errorName(e)}`),
  );
}
