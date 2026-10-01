/** Loads the Lemmix data and starts the menu. */
import * as Phaser from 'phaser';
import { MiscOption } from '../../../engine/src/index.ts';
import { LemmixApp } from '../app.ts';
import { loadLemmixData } from '../data.ts';
import { ScreenType } from '../screens/base.ts';
import { WebSoundManager } from '../sound.ts';
import { voice } from '../voice.ts';
import { gotoScreen, setApp } from './shared.ts';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const text = this.add.text(16, 16, 'Loading Lemmix data...', { fontFamily: 'monospace', fontSize: '16px', color: '#a0a0ff' });
    void (async () => {
      try {
        const data = await loadLemmixData((done, total) => text.setText(`Loading Lemmix data... ${done}/${total}`));
        const sound = await WebSoundManager.create(data.sounds);
        // browsers only start audio after a user gesture
        const unlock = () => sound.resume();
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
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
