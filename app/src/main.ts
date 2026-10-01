/// <reference types="vite/client" />
/** Lemmix in the browser: the TypeScript engine (engine/) with a Phaser front-end. */
import * as Phaser from 'phaser';
import { BootScene } from './scenes/boot.ts';
import { DosScene } from './scenes/dos.ts';
import { PlayerScene } from './scenes/player.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  disableContextMenu: true,
  audio: { noAudio: true },
  banner: false,
  scene: [BootScene, DosScene, PlayerScene],
});
