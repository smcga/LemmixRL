/**
 * The Lematro logo: the letters of LEMATRO in the pixel font, LEM in the green of the Lemmings logo and ATRO in the red
 * of Balatro's, each with a light edge and a deep shadow, bobbing one after the other. A lemming walks along the top.
 */
import * as Phaser from 'phaser';
import { lemmingSprite } from './assets.ts';
import { FONT } from './assets.ts';

const LETTERS = 'LEMATRO';
const FILL = [0x5ad65a, 0x5ad65a, 0x5ad65a, 0xfe5f55, 0xfe5f55, 0xfe5f55, 0xfe5f55];
const EDGE = 0xf4f1e6;
const SHADOW = 0x1a1030;

/**
 * Adds the logo with its middle at (x, y); `size` is the size of the font (16 is the size of the text). Returns the
 * container (for moving it as a whole).
 */
export function lematroLogo(scene: Phaser.Scene, x: number, y: number, size: number, walker = true): Phaser.GameObjects.Container {
  const logo = scene.add.container(x, y);
  const px = size / 16; // a pixel of the font
  const edge = Math.max(1, Math.round(px));
  const letters = [...LETTERS].map((ch, i) => {
    const c = scene.add.container(0, 0);
    const text = (dx: number, dy: number, tint: number) => scene.add.bitmapText(dx, dy, FONT, ch, size).setOrigin(0.5, 0.5).setTint(tint);
    // the deep shadow, the light edge all around, and the letter
    c.add(text(edge * 2, edge * 3, SHADOW));
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ])
      c.add(text(dx * edge, dy * edge, EDGE));
    c.add(text(0, 0, FILL[i]));
    return c;
  });
  // the letters next to each other (as wide as they are), the whole in the middle
  const widths = letters.map((c) => (c.list[c.list.length - 1] as Phaser.GameObjects.BitmapText).width);
  const gap = px * 2;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (letters.length - 1);
  let lx = -total / 2;
  letters.forEach((c, i) => {
    c.x = lx + widths[i] / 2;
    lx += widths[i] + gap;
    logo.add(c);
    // one after the other, a little up and a little turned
    scene.tweens.add({ targets: c, y: -px * 2.5, angle: i % 2 ? 2.5 : -2.5, duration: 900, delay: i * 110, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  });
  if (walker) {
    // a lemming walking to and fro along the top of the letters
    const top = -size * 0.36 - px;
    const lem = lemmingSprite(scene, -total / 2 + 10, top - 10, 'walk', Math.max(1, Math.round(px / 2)));
    lem.setOrigin(0.5, 1);
    lem.y = top;
    logo.add(lem);
    const walk = (right: boolean) => {
      if (!lem.active) return; // (the logo is gone)
      lem.play(right ? 'rl-lem-walk' : 'rl-lem-walkLeft');
      scene.tweens.add({ targets: lem, x: right ? total / 2 - 10 : -total / 2 + 10, duration: 9000, ease: 'Linear', onComplete: () => walk(!right) });
    };
    walk(true);
  }
  const parts = [logo, ...logo.list];
  logo.once('destroy', () => scene.tweens.killTweensOf(parts));
  return logo;
}
