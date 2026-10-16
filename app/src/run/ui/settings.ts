/**
 * The volumes of the sounds and of the music, as two sliders (the settings of the title, the options of a run). A
 * volume of 0 turns its sound option of Lemmix off, so a level does not start its music at all; F3 in the menu of
 * Classic Lemmings turns them on and off as before, and they come back at the volume they had.
 */
import type * as Phaser from 'phaser';
import { SoundEffect, SoundOption } from '../../../../engine/src/index.ts';
import type { LemmixApp } from '../../app.ts';
import { COLORS, Slider } from './widgets.ts';

export function soundSliders(scene: Phaser.Scene, app: LemmixApp, x: number, y: number, w: number): Slider[] {
  const cfg = app.config;
  const opts = cfg.soundOptions;
  const apply = () => app.sound.setVolumes(opts.has(SoundOption.Sound) ? cfg.sfxVolume : 0, opts.has(SoundOption.Music) ? cfg.musicVolume : 0);
  apply();
  const slider = (dy: number, caption: string, option: SoundOption, get: () => number, set: (v: number) => void, color: number) =>
    new Slider(scene, x, y + dy, w, caption, opts.has(option) ? get() : 0, color, (v, done) => {
      if (v > 0) {
        set(v);
        opts.add(option);
      } else opts.delete(option);
      apply();
      if (!done) return;
      cfg.save();
      // a sample of the sounds at the new volume
      if (option === SoundOption.Sound && v > 0) app.sound.playSound(SoundEffect.Yippee);
    });
  return [
    slider(0, 'Sound effects', SoundOption.Sound, () => cfg.sfxVolume, (v) => (cfg.sfxVolume = v), COLORS.blue),
    slider(56, 'Music', SoundOption.Music, () => cfg.musicVolume, (v) => (cfg.musicVolume = v), COLORS.purple),
  ];
}
