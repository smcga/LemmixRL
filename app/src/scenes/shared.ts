/** The application object shared by the scenes, and the screen flow of Form.Main. */
import type * as Phaser from 'phaser';
import type { LemmixApp } from '../app.ts';
import { ScreenType } from '../screens/base.ts';

let theApp: LemmixApp | null = null;
const appWaiters: ((app: LemmixApp) => void)[] = [];

export function setApp(app: LemmixApp): void {
  theApp = app;
  for (const fn of appWaiters.splice(0)) fn(app);
}

/** calls fn with the application once it is there (the data loaded) */
export function whenApp(fn: (app: LemmixApp) => void): void {
  if (theApp) fn(theApp);
  else appWaiters.push(fn);
}

export function getApp(): LemmixApp {
  if (!theApp) throw new Error('app not initialized');
  return theApp;
}

/** TFormMain: shows the next screen. */
export function gotoScreen(scene: Phaser.Scene, next: ScreenType): void {
  // LemmixRL: the music of the menus stops as a level starts (main.ts turns it on and off with the screens, a frame
  // later; this is at once)
  if (next === ScreenType.Play) theApp?.sound.setMenuMusic(false);
  // LemmixRL: the level before it is played in a run has its own screen
  if (next === ScreenType.Preview && getApp().inRun) scene.scene.start('runpreview');
  else if (next === ScreenType.Play) scene.scene.start('player');
  else if (next === ScreenType.Run) scene.scene.start('run');
  else if (next === ScreenType.Title) scene.scene.start('title');
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
