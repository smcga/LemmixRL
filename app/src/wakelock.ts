/**
 * Keeps the screen on while a level is played (LemmixRL, for phones): a phone dims its screen when it is not touched
 * for a while, and in Lemmings one often waits for the lemmings to walk.
 *
 * The browser can release the lock at any time (the page is hidden, a battery saver, the system), or refuse it. While
 * the lock is wanted it is asked for again: when the page shows again, a few times after a release or a refusal (with
 * growing delays), and at a touch or a key (at most every few seconds). So a power policy that refuses it never makes
 * a loop of requests.
 */
import { errorName } from './touch.ts';

export interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

/** what the lock needs from the browser (the tests give it a fake one) */
export interface WakeLockEnv {
  /** navigator.wakeLock.request('screen'); null when the browser has no wake lock */
  request: (() => Promise<WakeLockSentinelLike>) | null;
  visible: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

/** the delays before asking again after a release or a refusal; after the last one only a touch, a key or the page showing again ask */
export const WAKE_RETRY_MS = [1000, 5000, 15000, 60000];
/** a touch or a key asks again at most this often */
export const WAKE_INTERACTION_MS = 5000;
/** a lock held this long counts as working: the delays start over at its release */
const WAKE_HELD_OK_MS = 60000;

export class ScreenWakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private heldSince = 0;
  private pending = false;
  private wanted = false;
  private failures = 0;
  private timer: unknown = null;
  private lastAttempt = -Infinity;
  /** what happened last (shown by ?diag) */
  status = 'off';

  constructor(private readonly env: WakeLockEnv) {}

  get held(): boolean {
    return this.sentinel !== null;
  }

  /** the lock is wanted (a level is played) or not */
  set(on: boolean): void {
    if (on === this.wanted) return;
    this.wanted = on;
    this.failures = 0;
    if (on) {
      this.acquire();
      return;
    }
    this.clearRetry();
    this.status = 'off';
    const s = this.sentinel;
    this.sentinel = null;
    s?.release().catch(() => {});
  }

  /** the page was hidden or shown (a hidden page loses its lock) */
  visibilityChanged(): void {
    if (!this.env.visible()) {
      this.clearRetry();
      return;
    }
    this.failures = 0;
    this.acquire();
  }

  /** a touch or a key (some browsers grant the lock only after one) */
  interaction(): void {
    if (this.env.now() - this.lastAttempt >= WAKE_INTERACTION_MS) this.acquire();
  }

  private acquire(): void {
    if (!this.wanted || this.sentinel || this.pending || !this.env.visible()) return;
    const request = this.env.request;
    if (!request) {
      this.status = 'unavailable';
      return;
    }
    this.clearRetry();
    this.pending = true;
    this.lastAttempt = this.env.now();
    request().then(
      (s) => {
        this.pending = false;
        if (!this.wanted || !this.env.visible()) {
          s.release().catch(() => {});
          return;
        }
        this.sentinel = s;
        this.heldSince = this.env.now();
        this.status = 'on';
        s.addEventListener('release', () => {
          if (this.sentinel !== s) return;
          this.sentinel = null;
          this.status = 'released';
          if (this.env.now() - this.heldSince >= WAKE_HELD_OK_MS) this.failures = 0;
          this.retryLater();
        });
      },
      (e: unknown) => {
        this.pending = false;
        this.status = `refused: ${errorName(e)}`;
        this.retryLater();
      },
    );
  }

  private retryLater(): void {
    this.clearRetry();
    if (!this.wanted || !this.env.visible() || this.failures >= WAKE_RETRY_MS.length) return;
    const ms = WAKE_RETRY_MS[this.failures++];
    this.timer = this.env.setTimer(() => {
      this.timer = null;
      this.acquire();
    }, ms);
  }

  private clearRetry(): void {
    if (this.timer === null) return;
    this.env.clearTimer(this.timer);
    this.timer = null;
  }
}

let screenLock: ScreenWakeLock | null = null;

function browserLock(): ScreenWakeLock {
  if (screenLock) return screenLock;
  const lock = new ScreenWakeLock({
    request: 'wakeLock' in navigator ? () => navigator.wakeLock.request('screen') : null,
    visible: () => document.visibilityState === 'visible',
    now: () => performance.now(),
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (t) => window.clearTimeout(t as number),
  });
  document.addEventListener('visibilitychange', () => lock.visibilityChanged());
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, () => lock.interaction(), true);
  screenLock = lock;
  return lock;
}

/** Keeps the screen on (while a level is played with touch) or lets it sleep again. */
export function keepScreenOn(on: boolean): void {
  if (on || screenLock) browserLock().set(on);
}

export function wakeLockStatus(): string {
  return screenLock?.status ?? 'off';
}
