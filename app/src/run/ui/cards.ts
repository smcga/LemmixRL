/**
 * The cards of the run screens, handled the way Balatro handles them on a phone (and, with the mouse, like its
 * desktop version): a tap selects a card, which shows what it is and the buttons of what can be done with it (buy,
 * sell, use); a card that is dragged shows the areas it can be dropped on, and dropping it there does the same.
 */
import * as Phaser from 'phaser';
import { touch } from '../../touch.ts';
import { type LemmingAnim, lemmingSprite, SKILL_ICONS } from './assets.ts';
import { Button, COLORS, label, shade, type TipContent, type Tooltip } from './widgets.ts';
import type { PowerCardDesign } from '../power-cards/schema.ts';
import type { PowerEdition } from '../content.ts';
import { powerCardSprite } from '../power-cards/phaser.ts';
import { getApp } from '../../scenes/shared.ts';

export type Art = { anim: LemmingAnim; tint?: number } | { icon: string } | { text: string; color: number } | { design: PowerCardDesign };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** the size of a card: the proportions of a card of Balatro on a 960 x 540 screen */
export const CARD_W = 66;
export const CARD_H = 88;

export interface CardFace {
  color: number;
  art?: Art;
  /** the price tag above a card of the shop */
  price?: string;
  /** a pile of cards, face down (the colony) */
  pile?: boolean;
  /** a pack: a foil wrapper, crimped at both ends, with its name on a band */
  pack?: string;
  /** the edition of a Power Card: a sheen (Shiny), a glow (Glowing), a rainbow edge (Rainbow), see-through (Ghost) */
  edition?: PowerEdition;
}

/** a little random sign: Balatro's juice goes one way or the other */
const sign = () => (Math.random() > 0.5 ? 1 : -1);

/**
 * A card: a cream edge around a field in the colour of its kind, with its picture. Its position is its middle.
 *
 * It moves as a card of Balatro does: it is never quite still (a slow sway), it squashes and wobbles when something
 * happens to it (its juice), it leans the way it is dragged, it tilts a little under the pointer with a sheen that
 * follows it, and its shadow goes further away as it is lifted (hovered, selected, dragged). A pack has a foil glint
 * that sweeps across it now and then. Its scale and rotation are worked out from all of these every frame.
 */
export class CardView extends Phaser.GameObjects.Container {
  homeX: number;
  homeY: number;
  /** what moves it besides its position */
  private readonly m = { scale: 1, flip: 1, sway: 0, lean: 0, tilt: 0, juiceS: 0, juiceR: 0, lift: 0, sheen: 0, sheenX: 0 };
  private readonly sway: Phaser.Tweens.Tween;
  private readonly shadow: Phaser.GameObjects.Graphics;
  private readonly sheen: Phaser.GameObjects.Graphics;
  /** a white face over it: a card that materialises comes out of white, one that dissolves goes into it */
  private readonly white: Phaser.GameObjects.Graphics;
  private juiceTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly face: CardFace,
    readonly cw = CARD_W,
    readonly ch = CARD_H,
  ) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;
    const l = -cw / 2;
    const t = -ch / 2;
    // the shadow: its own shape, moved further away the higher the card is
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.32);
    if (face.pack) this.shadow.fillRect(l, t + 4, cw, ch - 8);
    else this.shadow.fillRoundedRect(l, t, cw, ch, 6);
    this.add(this.shadow);
    const g = scene.add.graphics();
    if (face.pile)
      for (let i = 3; i >= 1; i--) {
        g.fillStyle(shade(COLORS.cream, 0.55 + i * 0.08), 1);
        g.fillRoundedRect(l + i * 2, t + i * 2, cw, ch, 6);
      }
    if (face.pack) this.drawPack(g, face.color, l, t, cw, ch);
    else if (!face.art || !('design' in face.art)) {
      g.fillStyle(COLORS.cream, 1);
      g.fillRoundedRect(l, t, cw, ch, 6);
      g.fillStyle(shade(face.color, 0.4), 1);
      g.fillRoundedRect(l + 4, t + 4, cw - 8, ch - 8, 4);
      g.lineStyle(2, face.color, 1);
      g.strokeRoundedRect(l + 5, t + 5, cw - 10, ch - 10, 3);
      // the light from above: the top of the field a little lighter
      g.fillStyle(0xffffff, 0.05);
      g.fillRoundedRect(l + 6, t + 6, cw - 12, (ch - 12) / 2, 3);
    }
    this.add(g);
    const art = face.art;
    if (art) {
      if ('design' in art) {
        this.add(powerCardSprite(scene, art.design, getApp().data.provider, cw, ch));
      } else if ('anim' in art) {
        const sp = lemmingSprite(scene, 0, 0, art.anim, 3);
        if (art.tint) sp.setTint(art.tint);
        this.add(sp);
      } else if ('icon' in art) this.add(scene.add.image(0, 0, SKILL_ICONS, art.icon).setScale(2));
      else {
        const text = label(scene, 0, 0, art.text, { size: 32, big: true, color: art.color, originX: 0.5, originY: 0.5 });
        if (text.width > cw - 14) text.setScale((cw - 14) / text.width);
        this.add(text);
      }
    }
    if (face.edition) this.drawEdition(face.edition, l, t, cw, ch);
    if (face.pack) {
      const name = label(scene, 0, t + ch - 22, face.pack, { color: COLORS.ink, originX: 0.5, originY: 0.5 });
      name.setDropShadow(0, 0, 0, 0);
      if (name.width > cw - 10) name.setScale((cw - 10) / name.width);
      this.add(name);
      for (const o of this.list) if (o !== g && o !== name && o !== this.shadow && 'setY' in o) (o as unknown as { y: number }).y -= 10;
      this.glint(l, t, cw, ch);
    }
    this.sheen = scene.add.graphics();
    this.add(this.sheen);
    this.white = scene.add.graphics();
    this.white.fillStyle(0xffffff, 1);
    if (face.pack) this.white.fillRect(l, t + 6, cw, ch - 12);
    else this.white.fillRoundedRect(l, t, cw, ch, 6);
    this.white.setAlpha(0);
    this.add(this.white);
    if (face.price) {
      const price = label(scene, 0, t - 11, face.price, { color: COLORS.gold, originX: 0.5, originY: 0.5 });
      const w = price.width + 14;
      const tag = scene.add.graphics();
      tag.fillStyle(COLORS.panel, 1);
      tag.fillRoundedRect(-w / 2, t - 22, w, 26, 6);
      tag.fillStyle(COLORS.dark, 1);
      tag.fillRoundedRect(-w / 2 + 3, t - 19, w - 6, 16, 4);
      this.addAt(tag, 0);
      this.add(price);
    }
    this.setSize(cw, ch);
    this.setInteractive();
    // a card is never quite still
    this.sway = scene.tweens.add({
      targets: this.m,
      sway: { from: -0.02, to: 0.02 },
      duration: 1700 + Math.random() * 900,
      delay: Math.random() * 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // under the pointer: it tilts towards it, and a sheen follows it
    this.on('pointermove', (p: Phaser.Input.Pointer) => {
      const px = Math.max(-0.5, Math.min(0.5, (p.worldX - this.x) / (cw * this.scaleY)));
      this.m.tilt = -px * 0.05;
      this.m.sheenX = -px;
      this.m.sheen = 1;
    });
    this.on('pointerout', () => {
      scene.tweens.add({ targets: this.m, tilt: 0, sheen: 0, duration: 220 });
    });
    scene.events.on('update', this.tick, this);
    this.once('destroy', () => {
      scene.events.off('update', this.tick, this);
      // (everything that moves it goes with it: a tween left behind would reach for a card that is gone)
      this.juiceTween?.remove();
      scene.tweens.killTweensOf([this, this.m, this.white]);
    });
    this.tick();
    scene.add.existing(this);
  }

  /** every frame: its scale and rotation from what moves it, its shadow from how high it is, its sheen */
  private tick(): void {
    if (!this.active) return;
    const m = this.m;
    const s = m.scale * (1 + m.juiceS);
    this.setScale(s * m.flip, s);
    this.setRotation(m.sway + m.lean + m.tilt + m.juiceR);
    // (Balatro: the shadow moves away and gets smaller as the card goes up)
    this.shadow.setPosition(2 + 6 * m.lift, 4 + 12 * m.lift);
    this.shadow.setScale(1 - 0.08 * m.lift);
    this.shadow.setAlpha(1 - 0.35 * m.lift);
    const sh = this.sheen;
    sh.clear();
    if (m.sheen > 0.01) {
      const l = -this.cw / 2;
      const x = m.sheenX * this.cw * 0.6;
      const top = -this.ch / 2 + (this.face.pack ? 8 : 4);
      const h = this.ch - (this.face.pack ? 16 : 8);
      for (const [dx, w, a] of [
        [-9, 6, 0.05],
        [-3, 6, 0.1],
        [3, 6, 0.05],
      ] as const) {
        const x0 = Math.max(l + 4, x + dx);
        const x1 = Math.min(l + this.cw - 4, x + dx + w);
        if (x1 > x0) {
          sh.fillStyle(0xffffff, a * m.sheen);
          sh.fillRect(x0, top, x1 - x0, h);
        }
      }
    }
  }

  /** a pack: a foil wrapper with its shine and a crease or two, crimped and sealed at both ends, its name on a band */
  private drawPack(g: Phaser.GameObjects.Graphics, color: number, l: number, t: number, cw: number, ch: number): void {
    g.fillStyle(shade(color, 0.75), 1);
    g.fillRect(l, t + 6, cw, ch - 12);
    g.fillStyle(color, 1);
    g.fillRect(l + 3, t + 9, cw - 6, ch - 18);
    // the foil: lighter at the top, a shine down one side, creases
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(l + 3, t + 9, cw - 6, (ch - 18) * 0.4);
    g.fillStyle(0xffffff, 0.2);
    g.fillRect(l + 8, t + 9, 6, ch - 18);
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(l + cw * 0.64, t + 9, 2, ch - 18);
    g.fillStyle(0x000000, 0.12);
    g.fillRect(l + cw * 0.64 + 2, t + 9, 2, ch - 18);
    g.fillRect(l + 3, t + 9 + (ch - 18) * 0.55, cw - 6, 1);
    const crimps = Math.max(1, Math.round(cw / 6));
    const crimpWidth = cw / crimps;
    for (let i = 0; i < crimps; i++) {
      const x = i * crimpWidth;
      g.fillStyle(shade(color, 0.55), 1);
      g.fillTriangle(l + x, t + 6, l + x + crimpWidth, t + 6, l + x + crimpWidth / 2, t);
      g.fillTriangle(l + x, t + ch - 6, l + x + crimpWidth, t + ch - 6, l + x + crimpWidth / 2, t + ch);
    }
    // the seals: a darker strip under each crimp
    g.fillStyle(shade(color, 0.6), 1);
    g.fillRect(l, t + 6, cw, 3);
    g.fillRect(l, t + ch - 9, cw, 3);
    g.fillStyle(COLORS.cream, 1);
    g.fillRect(l + 3, t + ch - 30, cw - 6, 16);
  }

  /** a glint that sweeps across the foil of a pack now and then (Balatro's booster shader) */
  private glint(l: number, t: number, cw: number, ch: number): void {
    const scene = this.scene;
    const gl = scene.add.graphics();
    this.add(gl);
    const top = t + 9;
    const h = ch - 18;
    const slant = 0.5;
    const band = 10;
    const p = { v: 0 };
    const draw = () => {
      if (!gl.active) return;
      gl.clear();
      if (p.v <= 0 || p.v >= 1) return;
      // a slanted band, cut to the foil row by row
      const a = l - h * slant - band + p.v * (cw + h * slant + 2 * band);
      gl.fillStyle(0xffffff, 0.35);
      for (let y = 0; y < h; y += 3) {
        const x0 = Math.max(l + 3, a + y * slant);
        const x1 = Math.min(l + cw - 3, a + y * slant + band);
        if (x1 > x0) gl.fillRect(x0, top + y, x1 - x0, Math.min(3, h - y));
      }
    };
    const sweep = () => {
      if (!this.active) return;
      p.v = 0;
      scene.tweens.add({ targets: p, v: 1, duration: 700, ease: 'Sine.easeInOut', onUpdate: draw, onComplete: draw });
      scene.time.delayedCall(2600 + Math.random() * 1600, sweep);
    };
    scene.time.delayedCall(400 + Math.random() * 1800, sweep);
  }

  /** the look of a Power Card edition, over its picture */
  private drawEdition(edition: PowerEdition, l: number, t: number, cw: number, ch: number): void {
    const scene = this.scene;
    const g = scene.add.graphics();
    switch (edition) {
      case 'shiny':
        // a silver edge and diagonal sheen
        g.lineStyle(2, 0xe8eef8, 0.9);
        g.strokeRoundedRect(l + 1, t + 1, cw - 2, ch - 2, 6);
        g.fillStyle(0xffffff, 0.16);
        for (const o of [6, 22, 30]) g.fillTriangle(l + o, t + 4, l + o + 10, t + 4, l + o - 18, t + ch - 4);
        break;
      case 'glowing': {
        g.lineStyle(3, 0x5bf0e0, 1);
        g.strokeRoundedRect(l - 1, t - 1, cw + 2, ch + 2, 7);
        scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.35 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        break;
      }
      case 'rainbow': {
        const colors = [0xe03030, 0xf08820, 0xf0e040, 0x3fae4f, 0x3070f0, 0xa040e0];
        const n = 24;
        const perimeter = 2 * (cw + ch);
        const at = (d: number): [number, number] => {
          d = ((d % perimeter) + perimeter) % perimeter;
          if (d < cw) return [l + d, t];
          if (d < cw + ch) return [l + cw, t + d - cw];
          if (d < 2 * cw + ch) return [l + cw - (d - cw - ch), t + ch];
          return [l, t + ch - (d - 2 * cw - ch)];
        };
        let phase = 0;
        const paint = () => {
          g.clear();
          for (let i = 0; i < n; i++) {
            const [x0, y0] = at(phase + (i * perimeter) / n);
            const [x1, y1] = at(phase + ((i + 1) * perimeter) / n);
            g.lineStyle(3, colors[i % colors.length], 1);
            g.lineBetween(x0, y0, x1, y1);
          }
        };
        paint();
        const timer = scene.time.addEvent({ delay: 80, loop: true, callback: () => ((phase += 3), paint()) });
        this.once('destroy', () => timer.remove());
        break;
      }
      case 'ghost':
        // see-through, dark as a negative
        g.fillStyle(0x201030, 0.4);
        g.fillRoundedRect(l, t, cw, ch, 6);
        this.setAlpha(0.8);
        break;
    }
    this.add(g);
  }

  /** the card as it lies: its rectangle on the screen */
  get rect(): Rect {
    return { x: this.homeX - this.cw / 2, y: this.homeY - this.ch / 2, w: this.cw, h: this.ch };
  }

  /** back to its place, raised a little when it is selected */
  settle(lift = 0, ms = 140): void {
    this.scene.tweens.add({ targets: this, x: this.homeX, y: this.homeY - lift, duration: ms, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: this.m, scale: 1, lean: 0, lift: lift > 0 ? 0.6 : 0, duration: ms, ease: 'Cubic.easeOut' });
    if (this.sway.isPaused()) this.sway.resume();
  }

  /** bigger (hovered: up off the table a little) or back to its size */
  grow(scale: number): void {
    this.scene.tweens.add({ targets: this.m, scale, lift: scale > 1 ? 0.4 : 0, duration: 90 });
  }

  /** picked up: it follows the pointer, leaning the way it moves, high above the table */
  pickUp(): void {
    this.sway.pause();
    this.scene.tweens.add({ targets: this.m, scale: 1.12, lift: 1, duration: 90 });
    this.juice(0.06, 0.06);
  }

  follow(x: number, y: number): void {
    const lean = Math.max(-0.3, Math.min(0.3, (x - this.x) * 0.03));
    this.m.lean += (lean - this.m.lean) * 0.35;
    this.setPosition(x, y);
  }

  /**
   * Balatro's juice: the card squashes and springs back with a wobble, both dying away in 0.4 seconds (the scale as
   * sin(50.8 t) times (1 - t)^3, the rotation as sin(40.8 t) times (1 - t)^2).
   */
  juice(scale = 0.11, rot = 0.16 * sign()): void {
    if (!this.active) return;
    this.juiceTween?.remove();
    const p = { t: 0 };
    this.juiceTween = this.scene.tweens.add({
      targets: p,
      t: 1,
      duration: 400,
      onUpdate: () => {
        const s = p.t * 0.4;
        this.m.juiceS = scale * Math.sin(50.8 * s) * (1 - p.t) ** 3;
        this.m.juiceR = rot * Math.sin(40.8 * s) * (1 - p.t) ** 2;
      },
      onComplete: () => {
        this.m.juiceS = 0;
        this.m.juiceR = 0;
      },
    });
  }

  /** the shake of a pack about to burst, growing with how far it is (0 to 1) */
  shake(amount: number): void {
    if (!this.active) return;
    const t = this.scene.time.now / 1000;
    this.m.juiceR = 0.065 * (Math.sin(5 * t) + Math.cos(0.33 + 41.15 * t) + Math.cos(67.12 * t)) * amount;
    this.m.juiceS = 0.15 * amount;
  }

  /** It comes out of white, growing from small (Balatro's materialize). */
  materialize(delay = 0, ms = 450): void {
    if (!this.active) return;
    this.m.scale = 0.35;
    this.white.setAlpha(1);
    this.scene.tweens.add({ targets: this.m, scale: 1, duration: ms, delay, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: this.white,
      alpha: 0,
      duration: ms,
      delay: delay + ms * 0.3,
      ease: 'Quad.easeIn',
      onComplete: () => this.juice(),
    });
  }

  /** It goes into white and away, smaller and smaller (Balatro's dissolve). The caller destroys it. */
  dissolve(ms = 320, delay = 0): void {
    if (!this.active) return;
    this.sway.pause();
    this.disableInteractive();
    this.juice(0.06);
    this.scene.tweens.add({ targets: this.white, alpha: 0.9, duration: ms * 0.6, delay });
    this.scene.tweens.add({ targets: this.m, scale: 0.6, duration: ms, delay, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: this, alpha: 0, duration: ms * 0.5, delay: delay + ms * 0.5 });
  }

  /** turned over: its width from nothing (0) to all of it (1) */
  set turn(v: number) {
    this.m.flip = v;
  }

  get turn(): number {
    return this.m.flip;
  }
}

export interface CardButton {
  label: string;
  /** a second line: the price */
  sub?: string;
  color: number;
  /** under the card, or sticking out of its side */
  side: 'below' | 'right';
  enabled?: boolean;
  run: () => void;
}

/** An area a dragged card can be dropped on. */
export interface DropTarget {
  rect: Rect;
  color: number;
  lines: string[];
  /** it can be dropped there now (else the area is grey and the card goes back) */
  active: boolean;
  release: () => void;
  /** dropped on it while it is not active */
  refused?: () => void;
}

export interface CardBehaviour {
  /** what the card is, for its popup */
  tip?: () => Omit<TipContent, 'x' | 'y' | 'center' | 'above'>;
  /** the buttons of a selected card */
  buttons?: () => CardButton[];
  /** the areas shown while the card is dragged */
  targets?: () => DropTarget[];
  /** dropped inside this area, on no target: its place among the cards of the area changes */
  reorder?: { area: Rect; drop: (x: number) => void };
  /** a tap does this instead of selecting the card */
  tap?: () => void;
  /** while selected, a press elsewhere does not put it back (only another card, or a tap on it) */
  sticky?: () => boolean;
}

interface ShownTarget {
  spec: DropTarget;
  draw: (over: boolean) => void;
  over: boolean;
  objs: Phaser.GameObjects.GameObject[];
}

/** how far a pointer moves (in pixels of the screen, about a third of a millimetre each) before a tap is a drag */
const DRAG_DISTANCE = 6;
/** a card that is held this long (ms) shows where it can be dropped */
const HOLD_MS = 180;
const DEPTH_SELECTED = 20;
const DEPTH_BUTTONS = 650;
const DEPTH_TARGETS = 700;
const DEPTH_DRAGGED = 800;

/** The cards on the screen and what the pointer is doing with them. */
export class CardTable {
  private readonly cards = new Map<CardView, CardBehaviour>();
  private press: { card: CardView; id: number; x: number; y: number; dx: number; dy: number; moved: boolean; held: boolean; timer: Phaser.Time.TimerEvent | null } | null = null;
  private selected: CardView | null = null;
  private selectedObjs: Phaser.GameObjects.GameObject[] = [];
  private targets: ShownTarget[] = [];
  private hovered: CardView | null = null;
  /** told whenever the selected card changes (null: none) */
  onSelect: ((card: CardView | null) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tip: Tooltip,
    /** the middle of a button of the selected card, by its label (for the tests) */
    private readonly spot: (name: string, x: number, y: number) => void,
  ) {
    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    scene.events.once('shutdown', () => {
      input.off('pointerdown', this.onDown, this);
      input.off('pointermove', this.onMove, this);
      input.off('pointerup', this.onUp, this);
      input.off('pointerupoutside', this.onUp, this);
    });
  }

  /** a card is being dragged (or held) */
  get busy(): boolean {
    return !!this.press;
  }

  add(card: CardView, b: CardBehaviour): CardView {
    this.cards.set(card, b);
    card.on('pointerdown', (p: Phaser.Input.Pointer) => this.onCardDown(card, p));
    card.on('pointerover', () => {
      if (touch.active || this.press) return;
      this.hovered = card;
      // (Balatro: a little juice as the pointer comes over a card)
      card.juice(0.05, 0.03 * (Math.random() > 0.5 ? 1 : -1));
      if (card !== this.selected) card.grow(1.06);
      this.showTip(card);
    });
    card.on('pointerout', () => {
      if (touch.active || this.press) return;
      if (this.hovered === card) this.hovered = null;
      if (card !== this.selected) card.grow(1);
      if (this.selected) this.showTip(this.selected);
      else this.tip.hide();
    });
    return card;
  }

  /** a point of the world is on a button of the selected card */
  overButton(x: number, y: number): boolean {
    return this.selectedObjs.some((o) => o instanceof Button && o.active && x >= o.x && x < o.x + o.bw && y >= o.y && y < o.y + o.bh + 3);
  }

  /** Shows the popup again (what it says has changed): the hovered card's, else the selected one's. */
  refreshTip(): void {
    const card = this.hovered?.active ? this.hovered : this.selected;
    if (card?.active) this.showTip(card);
  }

  /** Forgets every card (they are destroyed by whoever made them). */
  clear(): void {
    this.press?.timer?.remove();
    this.press = null;
    this.hideTargets();
    for (const o of this.selectedObjs) o.destroy();
    this.selectedObjs = [];
    this.selected = null;
    this.hovered = null;
    this.cards.clear();
  }

  /* -------------------------------------------------------------------------------------------- the popup */

  private showTip(card: CardView): void {
    const b = this.cards.get(card);
    if (!b?.tip) return;
    // below the cards along the top of the screen, above the ones further down
    const below = card.homeY < 150;
    const buttonsBelow = card === this.selected && (b.buttons?.() ?? []).some((x) => x.side === 'below');
    const r = card.rect;
    this.tip.show(
      {
        ...b.tip(),
        center: true,
        above: !below,
        x: card.homeX,
        y: below ? r.y + r.h + (buttonsBelow ? 44 : 10) : r.y - (card.face.price ? 34 : 12),
      },
      card,
    );
  }

  /* -------------------------------------------------------------------------------------------- selecting */

  select(card: CardView | null): void {
    const old = this.selected;
    for (const o of this.selectedObjs) o.destroy();
    this.selectedObjs = [];
    this.selected = null;
    if (old?.active) {
      old.setDepth(0);
      old.settle();
    }
    if (!card) {
      this.onSelect?.(null);
      if (this.hovered?.active) this.showTip(this.hovered);
      else this.tip.hide();
      return;
    }
    this.selected = card;
    this.onSelect?.(card);
    card.setDepth(DEPTH_SELECTED);
    card.settle(10);
    const r = card.rect;
    for (const b of this.cards.get(card)?.buttons?.() ?? []) {
      const below = b.side === 'below';
      const w = below ? Math.max(card.cw + 8, 10 + 8 * b.label.length) : 58;
      const h = below ? (b.sub ? 40 : 26) : 40;
      // a button on the side goes to the left when there is no room on the right
      let x = below ? card.homeX - w / 2 : r.x + r.w - 6;
      if (!below && x + w > 956) x = r.x - w + 6;
      const y = below ? r.y + r.h - 6 : card.homeY - h / 2 - 10;
      const btn = new Button(this.scene, x, y, w, h, b.label, b.color, b.run, { enabled: b.enabled ?? true, sub: b.sub });
      btn.setDepth(below ? DEPTH_BUTTONS : DEPTH_SELECTED - 1);
      this.selectedObjs.push(btn);
      this.spot('card:' + b.label, x + w / 2, y + h / 2);
    }
    this.showTip(card);
  }

  /* -------------------------------------------------------------------------------------------- the pointer */

  private onCardDown(card: CardView, p: Phaser.Input.Pointer): void {
    if (this.press) return;
    this.press = { card, id: p.id, x: p.worldX, y: p.worldY, dx: card.x - p.worldX, dy: card.y - p.worldY, moved: false, held: false, timer: null };
    const b = this.cards.get(card);
    if (b?.targets || b?.reorder) this.press.timer = this.scene.time.delayedCall(HOLD_MS, () => this.pickUp());
  }

  /** a press on anything but the selected card and its buttons puts the card back */
  private onDown(_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const sel = this.selected;
    if (!sel) return;
    if (over.some((o) => o === sel || this.selectedObjs.includes(o))) return;
    // (another card that is pressed takes its place when the pointer comes up)
    if (this.cards.get(sel)?.sticky?.() && !over.some((o) => o instanceof CardView && this.cards.has(o))) return;
    // (the card that is pressed now is selected when the pointer comes up)
    this.select(null);
  }

  private pickUp(): void {
    const press = this.press;
    if (!press || press.held) return;
    const b = this.cards.get(press.card);
    if (!b || (!b.targets && !b.reorder)) return;
    press.held = true;
    press.timer?.remove();
    if (this.selected) this.select(null);
    this.tip.hide();
    this.hovered = null;
    press.card.setDepth(DEPTH_DRAGGED);
    press.card.pickUp();
    this.showTargets(b.targets?.() ?? []);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || p.id !== press.id) return;
    if (!press.moved) {
      const zoom = this.scene.cameras.main.zoom || 1;
      if (Math.hypot(p.worldX - press.x, p.worldY - press.y) * zoom < DRAG_DISTANCE * Math.max(1, window.devicePixelRatio || 1)) return;
      press.moved = true;
      this.pickUp();
    }
    if (!press.held) return;
    press.card.follow(p.worldX + press.dx, p.worldY + press.dy);
    for (const t of this.targets) {
      const over = inRect(t.spec.rect, p.worldX, p.worldY);
      if (over !== t.over) t.draw(over);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || p.id !== press.id) return;
    this.press = null;
    press.timer?.remove();
    const card = press.card;
    const b = this.cards.get(card);
    if (!press.moved) {
      // a tap (also a card that was held and put back where it was)
      if (press.held) {
        this.hideTargets();
        card.setDepth(0);
        card.settle();
      }
      if (!b) return;
      if (b.tap) b.tap();
      else this.select(this.selected === card ? null : card);
      return;
    }
    if (!press.held || !b) return;
    const target = this.targets.find((t) => inRect(t.spec.rect, p.worldX, p.worldY));
    this.hideTargets();
    if (target?.spec.active) target.spec.release();
    else if (target) target.spec.refused?.();
    else if (b.reorder && inRect(b.reorder.area, p.worldX, p.worldY)) b.reorder.drop(card.x);
    // (what was done may have rebuilt the screen, without this card)
    if (card.active) {
      card.setDepth(0);
      card.settle(0, 200);
    }
  }

  /* -------------------------------------------------------------------------------------------- drop areas */

  private showTargets(specs: DropTarget[]): void {
    const s = this.scene;
    for (const spec of specs) {
      const { x, y, w, h } = spec.rect;
      const g = s.add.graphics().setDepth(DEPTH_TARGETS);
      const ring = s.add.graphics().setDepth(DEPTH_TARGETS);
      const big = w >= 180;
      const texts = spec.lines.map((line) => label(s, x + w / 2, 0, line, { big: true, size: big ? 32 : 16, originX: 0.5, originY: 0.5 }).setDepth(DEPTH_TARGETS + 1));
      const step = big ? 36 : 20;
      texts.forEach((t, i) => {
        t.setY(y + h / 2 + (i - (texts.length - 1) / 2) * step);
        if (t.width > w - 10) t.setScale((w - 10) / t.width);
        if (!spec.active) t.setAlpha(0.5);
      });
      const shown: ShownTarget = {
        spec,
        over: false,
        objs: [g, ring, ...texts],
        draw: (over) => {
          shown.over = over;
          g.clear();
          g.fillStyle(spec.active ? (over ? shade(spec.color, 1.25) : spec.color) : COLORS.panelLight, 0.9);
          g.fillRoundedRect(x, y, w, h, 10);
        },
      };
      shown.draw(false);
      if (spec.active) {
        // the edge of an area that takes the card pulses
        ring.lineStyle(3, 0xffffff, 1);
        ring.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 10);
        s.tweens.add({ targets: ring, alpha: { from: 1, to: 0.15 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      this.targets.push(shown);
    }
  }

  private hideTargets(): void {
    for (const t of this.targets)
      for (const o of t.objs) {
        this.scene.tweens.killTweensOf(o);
        o.destroy();
      }
    this.targets = [];
  }
}
