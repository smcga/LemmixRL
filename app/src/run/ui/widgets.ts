/** A small UI toolkit for the run screens: labels in the DOS font, panels, buttons, cards and tooltips. */
import * as Phaser from 'phaser';
import { touch } from '../../touch.ts';
import { FONT, FONT_BIG, FONT_PURPLE } from './assets.ts';

/** The colours of Balatro's interface (its G.C table), for the panels, buttons and texts of the run screens. */
export const COLORS = {
  text: 0xffffff,
  dim: 0xa9b8ba,
  dark: 0x232e30,
  panel: 0x374244,
  panelLight: 0x4f6367,
  border: 0x5f7377,
  blue: 0x009dff,
  orange: 0xfda200,
  red: 0xfe5f55,
  green: 0x4bc292,
  gold: 0xf3b958,
  purple: 0x8867a5,
  teal: 0x39c5bb,
  gray: 0x666e70,
  /** the text of a description box */
  ink: 0x4f6367,
  cream: 0xf4f1e6,
} as const;

export interface LabelOptions {
  size?: number;
  /** the big purple font (white, tinted) */
  big?: boolean;
  color?: number;
  /** the original purple colours of the font */
  purple?: boolean;
  originX?: number;
  originY?: number;
  maxWidth?: number;
  align?: 0 | 1 | 2;
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, o: LabelOptions = {}): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(x, y, o.purple ? FONT_PURPLE : o.big ? FONT_BIG : FONT, text, o.size ?? 16, o.align ?? 0);
  if (o.maxWidth) t.setMaxWidth(o.maxWidth);
  t.setOrigin(o.originX ?? 0, o.originY ?? 0);
  if (!o.purple) t.setTint(o.color ?? COLORS.text);
  return t;
}

/** darker or lighter version of a colour */
export function shade(color: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return Phaser.Display.Color.GetColor(m(c.red), m(c.green), m(c.blue));
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill: number = COLORS.panel, border: number = COLORS.border, radius = 8): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(x + 2, y + 3, w, h, radius);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(2, border, 1);
  g.strokeRoundedRect(x, y, w, h, radius);
  return g;
}

export interface ButtonOptions {
  size?: number;
  /** the caption in the big font */
  big?: boolean;
  enabled?: boolean;
  /** a second line in a smaller size */
  sub?: string;
}

/**
 * The hit area of a container whose children are drawn from (0, 0) to (w, h). Phaser tests a container's hit area
 * around its middle (its origin is fixed at 0.5), so the rectangle is moved by half the size to cover what is drawn.
 */
export function containerHitArea(w: number, h: number): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(w / 2, h / 2, w, h);
}

/** A Balatro-ish button: a coloured slab with a darker edge that goes down when it is pressed. */
export class Button extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.BitmapText;
  private readonly subText: Phaser.GameObjects.BitmapText | null = null;
  private enabled: boolean;
  private hover = false;
  private down = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly bw: number,
    readonly bh: number,
    caption: string,
    private color: number,
    private readonly onClick: () => void,
    o: ButtonOptions = {},
  ) {
    super(scene, x, y);
    this.enabled = o.enabled ?? true;
    this.g = scene.add.graphics();
    this.add(this.g);
    this.text = label(scene, bw / 2, o.sub ? bh / 2 - 9 : bh / 2 - 2, caption, { size: o.size ?? 16, big: o.big, originX: 0.5, originY: 0.5, align: 1 });
    this.add(this.text);
    if (o.sub) {
      this.subText = label(scene, bw / 2, bh / 2 + 9, o.sub, { originX: 0.5, originY: 0.5 });
      this.add(this.subText);
    }
    this.setSize(bw, bh);
    this.setInteractive(containerHitArea(bw, bh), Phaser.Geom.Rectangle.Contains);
    this.on('pointerover', () => {
      this.hover = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.hover = false;
      this.down = false;
      this.redraw();
    });
    this.on('pointerdown', () => {
      this.down = true;
      this.redraw();
    });
    this.on('pointerup', () => {
      const click = this.down;
      this.down = false;
      this.redraw();
      if (click && this.enabled) this.onClick();
    });
    scene.add.existing(this);
    this.redraw();
  }

  setEnabled(e: boolean): this {
    this.enabled = e;
    this.redraw();
    return this;
  }

  setCaption(s: string): this {
    this.text.setText(s);
    return this;
  }

  setColor(c: number): this {
    this.color = c;
    this.redraw();
    return this;
  }

  private redraw(): void {
    const g = this.g;
    const c = this.enabled ? this.color : COLORS.gray;
    const lift = this.enabled && this.down ? 3 : 0;
    g.clear();
    g.fillStyle(shade(c, 0.55), 1);
    g.fillRoundedRect(0, 3, this.bw, this.bh, 6);
    g.fillStyle(this.enabled && this.hover && !this.down ? shade(c, 1.15) : c, 1);
    g.fillRoundedRect(0, lift, this.bw, this.bh, 6);
    this.text.setY((this.subText ? this.bh / 2 - 9 : this.bh / 2 - 2) + lift);
    this.subText?.setY(this.bh / 2 + 9 + lift);
    this.text.setTint(this.enabled ? COLORS.text : 0xb0b0c0);
  }
}

/**
 * What a popup says: a title, some lines in a white box and, for a card, a badge with its kind below them (like the
 * description of a card in Balatro). x and y are its top left corner, unless `center` (x is its middle) or `above`
 * (y is its bottom edge) say otherwise.
 */
export type TipContent = {
  title: string;
  color: number;
  lines: string[];
  x: number;
  y: number;
  width?: number;
  badge?: { text: string; color: number };
  center?: boolean;
  above?: boolean;
};

/** A popup with a description, shown next to a game object while the pointer is over it (or after a tap on it). */
export class Tooltip {
  private container: Phaser.GameObjects.Container | null = null;
  /** what the tooltip is about (a tap on the same thing again hides it) */
  owner: object | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  show(c: TipContent, owner: object | null = null): void {
    this.hide();
    this.owner = owner;
    const s = this.scene;
    const width = c.width ?? 250;
    const box = s.add.container(0, 0).setDepth(1000);
    const title = label(s, width / 2, 8, c.title, { originX: 0.5, maxWidth: width - 16, align: 1 });
    const text = c.lines.join('\n');
    const body = label(s, width / 2, 0, text, { maxWidth: width - 28, color: COLORS.ink, originX: 0.5, align: 1 });
    const boxY = title.y + title.height + 6;
    const boxH = text ? body.height + 12 : 0;
    body.setY(boxY + 6);
    body.setVisible(!!text);
    let h = boxY + boxH + (text ? 8 : 2);
    const g = s.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [g, title, body];
    let badge: { y: number; w: number } | null = null;
    if (c.badge) {
      const b = label(s, width / 2, h + 9, c.badge.text, { originX: 0.5, originY: 0.5 });
      badge = { y: h, w: b.width + 20 };
      parts.push(b);
      h += 26;
    }
    // the box: a light edge, a title on slate, the description on white
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(2, 4, width, h, 8);
    g.fillStyle(COLORS.panelLight, 1);
    g.fillRoundedRect(0, 0, width, h, 8);
    g.lineStyle(2, 0xdfe7e9, 1);
    g.strokeRoundedRect(0, 0, width, h, 8);
    if (text) {
      g.fillStyle(COLORS.cream, 1);
      g.fillRoundedRect(8, boxY, width - 16, boxH, 6);
    }
    if (badge && c.badge) {
      g.fillStyle(shade(c.badge.color, 0.6), 1);
      g.fillRoundedRect(width / 2 - badge.w / 2, badge.y + 2, badge.w, 18, 6);
      g.fillStyle(c.badge.color, 1);
      g.fillRoundedRect(width / 2 - badge.w / 2, badge.y, badge.w, 18, 6);
    } else {
      // no badge: a line in the colour of what it is about
      g.fillStyle(c.color, 1);
      g.fillRect(12, title.y + title.height + 1, width - 24, 2);
    }
    box.add(parts);
    // keep it on the screen (960 x 540)
    const x = c.center ? c.x - width / 2 : c.x;
    const y = c.above ? c.y - h : c.y;
    const px = Math.max(4, Math.min(960 - width - 4, x));
    const py = !c.above && y + h > 536 ? Math.max(4, y - h - 8) : Math.max(4, y);
    box.setPosition(Math.round(px), Math.round(py));
    this.container = box;
  }

  hide(): void {
    this.container?.destroy();
    this.container = null;
    this.owner = null;
  }
}

export function showTip(tip: Tooltip, c: TipContent, owner: object | null = null): void {
  tip.show(c, owner);
}

/**
 * A tooltip while the mouse is over an object. With touch there is no hovering: a tap shows the tooltip (and a second
 * tap hides it) unless touchTap is false (the object does something when it is tapped, and shows the tip itself).
 */
export function hoverTip(obj: Phaser.GameObjects.GameObject & { x: number; y: number }, tip: Tooltip, content: () => TipContent, touchTap = true): void {
  obj.on('pointerover', () => {
    if (!touch.active) showTip(tip, content());
  });
  obj.on('pointerout', () => {
    if (!touch.active) tip.hide();
  });
  if (touchTap)
    obj.on('pointerup', () => {
      if (!touch.active) return;
      if (tip.owner === obj) tip.hide();
      else showTip(tip, content(), obj);
    });
}
