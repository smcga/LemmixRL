/// <reference types="vite/client" />
/** Lemmix in the browser: the TypeScript engine (engine/) with a Phaser front-end. */
import * as Phaser from 'phaser';
import { BootScene } from './scenes/boot.ts';
import { DosScene } from './scenes/dos.ts';
import { PlayerScene } from './scenes/player.ts';
import { RunScene } from './scenes/run.ts';
import { initTouchDetection, pixelRatio } from './touch.ts';

initTouchDetection();

/**
 * The canvas has the resolution of the device (CSS size times devicePixelRatio), so the game is scaled by whole device
 * pixels, like Lemmix scales by whole screen pixels. Phones have 2 or 3 device pixels per CSS pixel.
 */
const host = document.getElementById('game')!;
const deviceSize = () => ({
  width: Math.max(1, Math.floor(host.clientWidth * pixelRatio())),
  height: Math.max(1, Math.floor(host.clientHeight * pixelRatio())),
});
const start = deviceSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.NONE, width: start.width, height: start.height, zoom: 1 / pixelRatio() },
  disableContextMenu: true,
  audio: { noAudio: true },
  banner: false,
  scene: [BootScene, DosScene, PlayerScene, RunScene],
});

/** the canvas follows the window (and the pixel ratio: browser zoom, another monitor) */
function fit(): void {
  const zoom = 1 / pixelRatio();
  if (game.scale.zoom !== zoom) game.scale.setZoom(zoom);
  const s = deviceSize();
  if (s.width !== game.scale.width || s.height !== game.scale.height) game.scale.resize(s.width, s.height);
}
window.addEventListener('resize', fit);
window.visualViewport?.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 100));

// for debugging and browser tests
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).phaserGame = game;
