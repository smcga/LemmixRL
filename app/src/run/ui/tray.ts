/**
 * The tray of the lemmings selected in the colony (for a Boost, or to be swapped out of the squad): a numbered slot
 * for each lemming it takes, with the lemming in its own colours, its name and a button to put it back, and a button
 * to put them all back. The numbers are the ones over the heads of the lemmings in the colony.
 */
import * as Phaser from 'phaser';
import type { LemmingCard } from '../state.ts';
import { lemmingSprite } from './assets.ts';
import { Button, COLORS, label, shade } from './widgets.ts';

export interface TrayOptions {
  /** how many lemmings it takes (it can change: Swaps get used) */
  slots: () => number;
  /** the colour of the tray, its numbers and the tags over the heads */
  color: number;
  /** a word under the name of each slot (a pair: who changes, who is copied); else what the lemming is */
  captions?: string[];
  /** what a lemming is, in a few words (its edition, its abilities) */
  describe: (c: LemmingCard) => string;
  /** the colour of a lemming's name */
  nameColor: (c: LemmingCard) => number;
  onRemove: (c: LemmingCard) => void;
  onClear: () => void;
  /** drawn over what (an overlay of the run screens is at 600) */
  depth?: number;
  /** where the buttons are, for the tests */
  spot?: (name: string, x: number, y: number) => void;
}

export class SelectionTray {
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    private readonly opts: TrayOptions,
  ) {}

  /** Draws the tray with these lemmings in its slots, in order. */
  set(cards: LemmingCard[]): void {
    this.destroy();
    const { scene, x, y, w, h, opts } = this;
    const k = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objs.push(o);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(opts.depth ?? 0);
      return o;
    };
    // the box: a dark well with an edge in the colour of what it is for
    const g = k(scene.add.graphics());
    g.fillStyle(COLORS.dark, 1);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(2, opts.color, 1);
    g.strokeRoundedRect(x, y, w, h, 10);

    const clearW = 58;
    const gap = 6;
    const n = Math.max(1, opts.slots());
    const sw = Math.floor((w - 12 - clearW - gap * n) / n);
    for (let i = 0; i < n; i++) {
      const sx = x + 6 + i * (sw + gap);
      const sy = y + 5;
      const sh = h - 10;
      const c = cards[i];
      const s = k(scene.add.graphics());
      if (c) {
        s.fillStyle(shade(opts.color, 0.45), 1);
        s.fillRoundedRect(sx, sy, sw, sh, 7);
      } else {
        // an empty slot: a dashed outline
        s.lineStyle(1, COLORS.border, 1);
        for (let d = 0; d < sw - 8; d += 8) {
          s.lineBetween(sx + 4 + d, sy, sx + 4 + Math.min(d + 4, sw - 8), sy);
          s.lineBetween(sx + 4 + d, sy + sh, sx + 4 + Math.min(d + 4, sw - 8), sy + sh);
        }
        for (let d = 0; d < sh - 8; d += 8) {
          s.lineBetween(sx, sy + 4 + d, sx, sy + 4 + Math.min(d + 4, sh - 8));
          s.lineBetween(sx + sw, sy + 4 + d, sx + sw, sy + 4 + Math.min(d + 4, sh - 8));
        }
      }
      // its number, as over the head of the lemming
      s.fillStyle(c ? opts.color : COLORS.border, 1);
      s.fillCircle(sx + 12, sy + 12, 9);
      k(label(scene, sx + 12, sy + 12, String(i + 1), { originX: 0.5, originY: 0.5, color: c ? COLORS.text : COLORS.dark }));
      const caption = opts.captions?.[i];
      if (!c) {
        k(label(scene, sx + 28, sy + sh / 2 - (caption ? 7 : 0), 'Empty', { color: COLORS.dim, originY: 0.5 }));
        if (caption) k(label(scene, sx + 28, sy + sh / 2 + 9, caption, { color: COLORS.border, originY: 0.5, size: 12 }));
        continue;
      }
      k(lemmingSprite(scene, sx + 34, sy + sh / 2 + 2, 'walk', 2, c));
      const name = k(label(scene, sx + 48, sy + sh / 2 - 7, c.name, { color: opts.nameColor(c), originY: 0.5 }));
      const room = sw - 48 - 26;
      if (name.width > room) name.setScale(room / name.width);
      const sub = k(label(scene, sx + 48, sy + sh / 2 + 9, caption ?? opts.describe(c), { color: COLORS.dim, originY: 0.5, size: 12 }));
      if (sub.width > room) sub.setScale(room / sub.width);
      // put back
      const bx = sx + sw - 22;
      const by = sy + sh / 2 - 10;
      opts.spot?.(`trayRemove:${i}`, bx + 10, by + 10);
      k(new Button(scene, bx, by, 20, 20, 'x', COLORS.red, () => opts.onRemove(c), { size: 12 }));
    }
    const cx = x + w - 6 - clearW;
    opts.spot?.('trayClear', cx + clearW / 2, y + h / 2);
    k(new Button(scene, cx, y + h / 2 - 14, clearW, 28, 'Clear', COLORS.gray, () => opts.onClear(), { enabled: cards.length > 0 }));
  }

  destroy(): void {
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }
}
