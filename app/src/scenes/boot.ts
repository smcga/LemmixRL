/** Loads the Lemmix data and starts the menu. */
import * as Phaser from 'phaser';
import { MiscOption } from '../../../engine/src/index.ts';
import { LemmixApp } from '../app.ts';
import { loadLemmixData } from '../data.ts';
import { ScreenType } from '../screens/base.ts';
import { WebSoundManager } from '../sound.ts';
import { voice } from '../voice.ts';
import { cssPx } from '../touch.ts';
import { gotoScreen, setApp } from './shared.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const text = this.add.text(cssPx(16), cssPx(16), 'Loading Lemmix data...', { fontFamily: 'monospace', fontSize: `${cssPx(16)}px`, color: '#a0a0ff' });
    void (async () => {
      try {
        const data = await loadLemmixData((done, total) => text.setText(`Loading Lemmix data... ${done}/${total}`));
        const sound = await WebSoundManager.create(data.sounds);
        // browsers only start audio after a user gesture (for a finger that is the end of a touch, not the start)
        const unlock = () => sound.resume();
        for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(type, unlock);
        const app = new LemmixApp(data, sound);
        voice.enabled = app.config.miscOptions.has(MiscOption.Voice);
        setApp(app);
        // for debugging and browser tests
        if (import.meta.env.DEV) (globalThis as Record<string, unknown>).lemmix = app;
        gotoScreen(this, ScreenType.Menu);
      } catch (e) {
        text.setText('Error: ' + String((e as Error).message ?? e));
        console.error(e);
      }
    })();
  }
}
