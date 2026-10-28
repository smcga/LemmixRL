/**
 * "Debug tools" (LemmixRL, a setting of the title): things for testing the game, not for playing it. With it on, a
 * level of a run can be passed at once with every lemming saved (Pass level on the screen before it, or the 5 key in
 * it), the title links to the card designer, and the music panel is shown. Remembered in the browser; `?debug=1` in
 * the address turns it on, `?debug=0` off.
 */
import { urlSwitch } from './diagnostics.ts';

const KEY = 'lemmix.debug';
const listeners = new Set<() => void>();
/** (read the first time it is asked: the address and the storage of the browser are there by then) */
let on: boolean | null = null;

export function debugOn(): boolean {
  on ??= urlSwitch('debug');
  return on;
}

export function setDebug(value: boolean): void {
  on = value;
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // not remembered
  }
  for (const l of listeners) l();
}

/** Called when it is turned on or off; returns a function that removes the listener. */
export function onDebugChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
