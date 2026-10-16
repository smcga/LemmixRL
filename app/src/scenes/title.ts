/**
 * The title screen of Lematro (LemmixRL): the logo over the swirl, and three buttons: Play (the roguelike run, the game
 * of this program), Settings, and Classic Lemmings (the menu of Lemmix, the original game as it was). Laid out on a
 * 960 x 540 screen that is scaled to the window, like the run screens.
 */
import * as Phaser from 'phaser';
import { SoundEffect, SoundOption } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { editConfig } from '../dialogs.ts';
import { ScreenType } from '../screens/base.ts';
import { ensureRunAssets, lemmingSprite } from '../run/ui/assets.ts';
import { CardView } from '../run/ui/cards.ts';
import { lematroLogo } from '../run/ui/logo.ts';
import { Swirl, SWIRLS } from '../run/ui/swirl.ts';
import { Button, COLORS, label, panel } from '../run/ui/widgets.ts';
import { canFullscreen, isFullscreen, safeAreaInsets, toggleFullscreen } from '../touch.ts';
import { getApp, gotoScreen, listen } from './shared.ts';

const W = 960;
const H = 540;

export class TitleScene extends Phaser.Scene {
  private app!: LemmixApp;
  private swirl!: Swirl;
  private settings: Phaser.GameObjects.GameObject[] = [];
  private closed = false;
  /** where the buttons are, by name (for the tests) */
  private spots: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('title');
  }

  create(): void {
    this.app = getApp();
    this.closed = false;
    this.settings = [];
    this.spots = {};
    ensureRunAssets(this, this.app);
    // (a run is played in the original style; the title is not a part of it)
    this.app.leaveRunMode();
    Button.clickSound = () => this.app.sound.playSound(SoundEffect.SkillButtonSelect);
    this.swirl = new Swirl(this, SWIRLS.title);

    // the logo, with a card at each side and lemmings about
    const logo = lematroLogo(this, W / 2, 156, 96);
    const tagline = label(this, W / 2, 252, 'a Lemmings roguelike', { size: 32, color: COLORS.gold, originX: 0.5, originY: 0.5 });
    tagline.setDepth(5);
    const left = new CardView(this, 150, 190, { color: COLORS.green, art: { anim: 'build' } }, 92, 123).setAngle(-14);
    const right = new CardView(this, 810, 190, { color: COLORS.purple, art: { anim: 'float' } }, 92, 123).setAngle(14);
    for (const [c, d] of [
      [left, 0],
      [right, 700],
    ] as const)
      this.tweens.add({ targets: c, y: c.y - 10, duration: 1800, delay: d, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 5; i++) {
      const goRight = i % 2 === 0;
      const sp = lemmingSprite(this, goRight ? -20 - i * 180 : W + 20 + i * 140, 366, goRight ? 'walk' : 'walkLeft', 2).setDepth(4);
      this.tweens.add({ targets: sp, x: goRight ? W + 40 : -40, duration: 22000 + i * 1500, repeat: -1, ease: 'Linear' });
    }
    const floater = lemmingSprite(this, 620, -30, 'float', 2).setDepth(4);
    this.tweens.add({ targets: floater, y: H + 40, x: 560, duration: 16000, repeat: -1, ease: 'Linear', delay: 2000 });

    // the buttons, on a bar as in Balatro
    panel(this, 190, 392, 580, 96, COLORS.panel, COLORS.panelLight, 14).setDepth(10);
    this.button('settings', 206, 410, 160, 60, 'Settings', COLORS.orange, () => this.showSettings());
    this.button('play', 380, 402, 200, 76, 'Play', COLORS.blue, () => this.play(), 48);
    this.button('classic', 594, 410, 160, 60, 'Classic\nLemmings', COLORS.green, () => this.classic());
    label(this, W / 2, 520, 'Lemmings by DMA Design  ·  Lemmix by Eric Langedijk  ·  in the spirit of Balatro', { color: COLORS.dim, originX: 0.5, originY: 0.5 }).setDepth(10);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    listen(this, 'keydown', (e) => {
      if (this.closed) return;
      if (e.key === 'Escape' && this.settings.length) this.closeSettings();
      else if (e.key === 'Enter' || e.key === 'F6' || e.key === ' ') this.play();
      else if (e.key === 'F5') this.showSettings();
      else if (e.key === 'c' || e.key === 'C') this.classic();
    });
  }

  private button(name: string, x: number, y: number, w: number, h: number, caption: string, color: number, fn: () => void, size = 24): Button {
    this.spots[name] = { x: x + w / 2, y: y + h / 2 };
    return new Button(this, x, y, w, h, caption, color, fn, { size }).setDepth(11);
  }

  private layout(): void {
    // the 960 x 540 screen fills the safe area of the window (not under a notch or a rounded corner)
    const ins = safeAreaInsets();
    const w = this.scale.width - ins.left - ins.right;
    const h = this.scale.height - ins.top - ins.bottom;
    const f = Math.min(w / W, h / H);
    const cam = this.cameras.main;
    cam.setViewport(ins.left, ins.top, w, h);
    cam.setZoom(f);
    cam.centerOn(W / 2, H / 2);
    this.swirl.cover(W / 2 - w / f / 2, H / 2 - h / f / 2, w / f, h / f);
  }

  private play(): void {
    if (this.closed) return;
    this.closed = true;
    gotoScreen(this, ScreenType.Run);
  }

  private classic(): void {
    if (this.closed) return;
    this.closed = true;
    gotoScreen(this, ScreenType.Menu);
  }

  /* -------------------------------------------------------------------------------------------- settings */

  private closeSettings(): void {
    for (const o of this.settings) o.destroy();
    this.settings = [];
  }

  private showSettings(): void {
    this.closeSettings();
    const o = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
      this.settings.push(g);
      (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(100);
      return g;
    };
    o(this.add.rectangle(-W, -H, 3 * W, 3 * H, 0x000000, 0.6).setOrigin(0, 0).setInteractive());
    o(panel(this, 300, 110, 360, 330, COLORS.panel, COLORS.panelLight, 14));
    o(label(this, W / 2, 140, 'Settings', { size: 48, originX: 0.5, originY: 0.5 }));
    const opts = this.app.config.soundOptions;
    const soundName = () => (opts.has(SoundOption.Music) ? 'Music and sound' : opts.has(SoundOption.Sound) ? 'Sound only' : 'No sound');
    const sound = o(
      new Button(this, 330, 180, 300, 40, `Sound: ${soundName()}`, COLORS.blue, () => {
        // as F3 in the menu of Lemmix: sound, sound and music, nothing
        if (opts.size === 0) opts.add(SoundOption.Sound);
        else if (opts.size === 1 && opts.has(SoundOption.Sound)) opts.add(SoundOption.Music);
        else opts.clear();
        this.app.config.save();
        sound.setCaption(`Sound: ${soundName()}`);
      }),
    );
    this.spots['settings:sound'] = { x: 480, y: 200 };
    let y = 232;
    if (canFullscreen()) {
      const fs = o(
        new Button(this, 330, y, 300, 40, isFullscreen() ? 'Full screen: on' : 'Full screen: off', COLORS.blue, () => {
          toggleFullscreen();
          setTimeout(() => fs.active && fs.setCaption(isFullscreen() ? 'Full screen: on' : 'Full screen: off'), 300);
        }),
      );
      y += 52;
    }
    o(new Button(this, 330, y, 300, 40, 'Game options...', COLORS.blue, () => void editConfig(this.app.config)));
    o(label(this, W / 2, y + 56, 'Lemmix options: game speed, the mechanics of the original, the voice', { color: COLORS.dim, originX: 0.5, maxWidth: 320, align: 1 }));
    this.spots['settings:back'] = { x: 480, y: 410 };
    o(new Button(this, 330, 392, 300, 36, 'Back', COLORS.orange, () => this.closeSettings()));
  }
}
