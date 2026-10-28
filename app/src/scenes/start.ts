/**
 * The first screen of Lematro (LemmixRL): the logo over the swirl and "Tap to start". Browsers only play sound after
 * a touch, a click or a key, so this screen asks for one before the title (where the music begins at once). On a
 * phone or a tablet it also offers to install the game as an app, when it is not one yet: one tap where the browser
 * can install it, else how to. Laid out on a 960 x 540 screen that is scaled to the window, like the title.
 */
import * as Phaser from 'phaser';
import { SoundEffect } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { canInstallNow, installNow, installPlatform, installSteps, isInstalled, onInstallChange } from '../install.ts';
import { ScreenType } from '../screens/base.ts';
import { ensureRunAssets, lemmingSprite } from '../run/ui/assets.ts';
import { lematroLogo } from '../run/ui/logo.ts';
import { Swirl, SWIRLS } from '../run/ui/swirl.ts';
import { Button, COLORS, label, panel } from '../run/ui/widgets.ts';
import { safeAreaInsets, touch } from '../touch.ts';
import { getApp, gotoScreen, listen } from './shared.ts';

const W = 960;
const H = 540;

/** a phone or a tablet: where installing the game is worth it (on a computer the browser is fine) */
export function installWorthIt(): boolean {
  const p = installPlatform();
  return p === 'ios' || p === 'android';
}

export class StartScene extends Phaser.Scene {
  private app!: LemmixApp;
  private swirl!: Swirl;
  private started = false;
  /** the install button, and the steps of installing when they are shown */
  private install: Phaser.GameObjects.GameObject[] = [];
  private steps: Phaser.GameObjects.GameObject[] = [];
  /** where the buttons are, by name (for the tests) */
  private spots: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('start');
  }

  create(): void {
    this.app = getApp();
    this.started = false;
    this.install = [];
    this.steps = [];
    this.spots = {};
    ensureRunAssets(this, this.app);
    this.swirl = new Swirl(this, SWIRLS.title);

    lematroLogo(this, W / 2, 176, 96);
    label(this, W / 2, 272, 'a Lemmings roguelike', { size: 32, color: COLORS.gold, originX: 0.5, originY: 0.5 }).setDepth(5);
    // a lemming walks across, under the words
    for (let i = 0; i < 3; i++) {
      const sp = lemmingSprite(this, -30 - i * 260, 456, 'walk', 2).setDepth(4);
      this.tweens.add({ targets: sp, x: W + 40, duration: 20000, repeat: -1, delay: i * 1200, ease: 'Linear' });
    }
    // Tap to start, breathing
    const prompt = label(this, W / 2, 380, touch.active || installWorthIt() ? 'Tap to start' : 'Click to start', { size: 48, big: true, originX: 0.5, originY: 0.5 }).setDepth(5);
    this.spots.start = { x: W / 2, y: 380 };
    this.tweens.add({ targets: prompt, alpha: { from: 1, to: 0.35 }, scale: { from: 1, to: 0.96 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.installButton();
    const offInstall = onInstallChange(() => this.installButton());
    this.events.once('shutdown', offInstall);

    // a tap or a click anywhere (but on the install button and its steps) starts, and so does a key
    this.input.on('pointerup', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.steps.length) return;
      if (over.some((o) => this.install.includes(o))) return;
      this.go();
    });
    listen(this, 'keydown', (e) => {
      if (e.key === 'Escape' && this.steps.length) this.closeSteps();
      else if (!this.steps.length && !e.repeat) this.go();
    });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  private layout(): void {
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

  /** on to the title (the touch or the key has let the sound in: the music begins there) */
  private go(): void {
    if (this.started) return;
    this.started = true;
    this.app.sound.resume();
    this.app.sound.playMenuSound(SoundEffect.LetsGo);
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => gotoScreen(this, ScreenType.Title));
  }

  /** Install, at the top: on a phone or a tablet that does not have it as an app yet */
  private installButton(): void {
    this.tweens.killTweensOf(this.install);
    for (const o of this.install) o.destroy();
    this.install = [];
    if (!installWorthIt() || isInstalled()) return;
    const now = canInstallNow();
    this.spots.install = { x: W / 2, y: 46 };
    const b = new Button(this, W / 2 - 130, 20, 260, 52, now ? 'Install Lematro' : 'Install as an app', COLORS.green, () => this.installApp(), { size: 24 }).setDepth(11);
    const sub = label(this, W / 2, 86, 'full screen, from your home screen', { color: COLORS.cream, originX: 0.5, originY: 0.5 }).setDepth(11);
    this.install = [b, sub];
    this.tweens.add({ targets: b, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private installApp(): void {
    if (canInstallNow()) {
      void installNow().then(() => this.installButton());
      return;
    }
    // how to install it on this platform
    this.closeSteps();
    const o = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
      this.steps.push(g);
      (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(100);
      return g;
    };
    o(this.add.rectangle(-W, -H, 3 * W, 3 * H, 0x000000, 0.6).setOrigin(0, 0).setInteractive());
    o(panel(this, 230, 110, 500, 320, COLORS.panel, COLORS.green, 14));
    o(label(this, W / 2, 144, 'Install Lematro', { size: 48, originX: 0.5, originY: 0.5 }));
    o(label(this, W / 2, 184, 'As an app it starts full screen, without the browser around it.', { color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    installSteps(installPlatform()).forEach((step, i) => {
      const y = 222 + i * 48;
      const g = o(this.add.graphics());
      g.fillStyle(COLORS.green, 1);
      g.fillCircle(272, y + 10, 13);
      o(label(this, 272, y + 10, String(i + 1), { originX: 0.5, originY: 0.5 }));
      o(label(this, 296, y, step, { color: COLORS.text, maxWidth: 410 }));
    });
    this.spots['install:back'] = { x: 480, y: 400 };
    // (a moment later: the touch that opened the steps must not close them as it comes up)
    this.time.delayedCall(50, () => o(new Button(this, 380, 382, 200, 36, 'Back', COLORS.orange, () => this.time.delayedCall(0, () => this.closeSteps()))));
  }

  private closeSteps(): void {
    for (const o of this.steps) o.destroy();
    this.steps = [];
  }
}
