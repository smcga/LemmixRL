/** The application object shared by the scenes, and the screen flow of Form.Main. */
import type * as Phaser from 'phaser';
import type { LemmixApp } from '../app.ts';
import { ScreenType } from '../screens/base.ts';

let theApp: LemmixApp | null = null;

export function setApp(app: LemmixApp): void {
  theApp = app;
}

export function getApp(): LemmixApp {
  if (!theApp) throw new Error('app not initialized');
  return theApp;
}

/** TFormMain: shows the next screen. */
export function gotoScreen(scene: Phaser.Scene, next: ScreenType): void {
  if (next === ScreenType.Play) scene.scene.start('player');
  else scene.scene.start('dos', { type: next });
}

export interface KeyMods {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export function keyMods(e: KeyboardEvent | MouseEvent): KeyMods {
  return { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey };
}

/** keys the browser should not handle itself while the game has the focus */
export function isGameKey(e: KeyboardEvent): boolean {
  return /^(F\d+|Pause|Escape|Enter|Backspace|Tab|ArrowLeft|ArrowRight|ArrowUp|ArrowDown| )$/.test(e.key) || (e.key.length === 1 && !e.ctrlKey && !e.metaKey);
}

/** Adds DOM listeners that are removed when the scene shuts down. */
export function listen<K extends keyof WindowEventMap>(scene: Phaser.Scene, type: K, fn: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window): void {
  const h = fn as EventListener;
  target.addEventListener(type, h);
  scene.events.once('shutdown', () => target.removeEventListener(type, h));
}
