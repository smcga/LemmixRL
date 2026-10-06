/**
 * Buttons for touch screens (LemmixRL): what Lemmix does with the keyboard, for a phone. Shown next to the game in
 * landscape and below it in portrait, only while the player uses touch. Buttons that end something (restart, end the
 * level) want a second tap.
 */
import * as Phaser from 'phaser';
import { PANEL_FONT } from '../run/ui/assets.ts';
import { cssPx } from '../touch.ts';

export interface TouchButtonDef {
  label: string;
  action: () => void;
  /** highlighted while true (pause, fast forward) */
  active?: () => boolean;
  /** asks for a second tap within 2 seconds */
  confirm?: boolean;
}

interface TouchButton {
  def: TouchButtonDef;
  g: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.BitmapText;
  zone: Phaser.GameObjects.Zone;
  x: number;
  y: number;
  w: number;
  h: number;
  pressed: boolean;
  active: boolean;
  confirmUntil: number;
}

const CONFIRM_MS = 2000;

export class TouchBar {
  private readonly buttons: TouchButton[] = [];
  private visible = true;

  get size(): number {
    return this.buttons.length;
  }

  constructor(
    private readonly scene: Phaser.Scene,
    defs: TouchButtonDef[],
    /** cameras that must not show the bar */
    hideFrom: Phaser.Cameras.Scene2D.Camera[],
  ) {
    for (const def of defs) {
      const g = scene.add.graphics();
      const text = scene.add.bitmapText(0, 0, PANEL_FONT, def.label, 16).setOrigin(0.5, 0.5);
      const zone = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive();
      const b: TouchButton = { def, g, text, zone, x: 0, y: 0, w: 1, h: 1, pressed: false, active: false, confirmUntil: 0 };
      zone.on('pointerdown', () => {
        b.pressed = true;
        this.draw(b);
      });
      zone.on('pointerout', () => {
        b.pressed = false;
        this.draw(b);
      });
      zone.on('pointerup', () => {
        if (!b.pressed) return;
        b.pressed = false;
        const now = performance.now();
        if (def.confirm && now > b.confirmUntil) {
          b.confirmUntil = now + CONFIRM_MS;
          text.setText('SURE?');
        } else {
          b.confirmUntil = 0;
          text.setText(def.label);
          def.action();
        }
        this.draw(b);
      });
      for (const cam of hideFrom) cam.ignore([g, text, zone]);
      this.buttons.push(b);
    }
  }

  /**
   * Places the buttons in a column (vertical) or a row, inside the given area. A confirmation that was asked for is
   * cancelled: the buttons moved (a rotation), so the second tap would not be on the button that asked.
   */
  layout(x: number, y: number, w: number, h: number, vertical: boolean): void {
    const n = this.buttons.length;
    const gap = cssPx(8);
    const bw = vertical ? w : Math.floor((w - gap * (n - 1)) / n);
    const bh = vertical ? Math.floor((h - gap * (n - 1)) / n) : h;
    this.buttons.forEach((b, i) => {
      b.pressed = false;
      b.confirmUntil = 0;
      b.x = vertical ? x : x + i * (bw + gap);
      b.y = vertical ? y + i * (bh + gap) : y;
      b.w = bw;
      b.h = bh;
      b.zone.setPosition(b.x, b.y).setSize(bw, bh);
      b.zone.input?.hitArea.setTo(0, 0, bw, bh);
      // the text: 16 CSS pixels high (a whole number of device pixels per font pixel where possible), smaller when the
      // button is too narrow for it
      let size = 16 * Math.max(1, Math.round(cssPx(16) / 16));
      b.text.setText(b.def.label).setFontSize(size);
      if (b.text.width > bw * 0.86) size = Math.max(8, Math.floor((size * bw * 0.86) / b.text.width));
      b.text.setFontSize(size).setPosition(b.x + bw / 2, b.y + bh / 2);
      this.draw(b);
    });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    for (const b of this.buttons) {
      if (!v && b.confirmUntil) {
        b.confirmUntil = 0;
        b.text.setText(b.def.label);
      }
      b.pressed = false;
      b.g.setVisible(v);
      b.text.setVisible(v);
      b.zone.setVisible(v);
      if (b.zone.input) b.zone.input.enabled = v;
    }
  }

  /** every frame: highlights and expired confirmations */
  update(): void {
    if (!this.visible) return;
    const now = performance.now();
    for (const b of this.buttons) {
      const active = b.def.active?.() ?? false;
      let changed = active !== b.active;
      b.active = active;
      if (b.confirmUntil && now > b.confirmUntil) {
        b.confirmUntil = 0;
        b.text.setText(b.def.label);
        changed = true;
      }
      if (changed) this.draw(b);
    }
  }

  private draw(b: TouchButton): void {
    const g = b.g;
    const r = cssPx(8);
    g.clear();
    const fill = b.confirmUntil ? 0x8a2a24 : b.active ? 0x2a7a3a : 0x1c1c34;
    g.fillStyle(b.pressed ? 0x4a4a80 : fill, 0.85);
    g.fillRoundedRect(b.x, b.y, b.w, b.h, r);
    g.lineStyle(Math.max(1, cssPx(1.5)), b.active ? 0x60e080 : 0x6060a0, 1);
    g.strokeRoundedRect(b.x, b.y, b.w, b.h, r);
    b.text.setTint(b.active ? 0xffffff : 0xd0d0f0);
  }
}
