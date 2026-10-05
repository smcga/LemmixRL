/** A small UI toolkit for the run screens: labels in the DOS font, panels, buttons, cards and tooltips. */
import * as Phaser from 'phaser';
import { touch } from '../../touch.ts';
import { FONT, FONT_BIG, FONT_PURPLE } from './assets.ts';

export const COLORS = {
  text: 0xeeeeff,
  dim: 0x9090b8,
  dark: 0x0c0c18,
  panel: 0x15152a,
  panelLight: 0x22223e,
  border: 0x3c3c6c,
  blue: 0x3a7bd5,
  orange: 0xe8892b,
  red: 0xd8443c,
  green: 0x3fb56b,
  gold: 0xf5c542,
  purple: 0x9b59d0,
  teal: 0x2bb3a8,
  gray: 0x55556a,
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
    this.text = label(scene, bw / 2, o.sub ? bh / 2 - 9 : bh / 2 - 2, caption, { size: o.size ?? 16, big: o.big, originX: 0.5, originY: 0.5 });
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

/** A tooltip: a title and some lines, shown next to a game object while the pointer is over it. */
export class Tooltip {
  private container: Phaser.GameObjects.Container | null = null;
  /** what the tooltip is about (a tap on the same thing again hides it) */
  owner: object | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  show(x: number, y: number, title: string, titleColor: number, lines: string[], width = 300, owner: object | null = null): void {
    this.hide();
    this.owner = owner;
    const s = this.scene;
    const c = s.add.container(0, 0).setDepth(1000);
    const t = label(s, 12, 10, title, { color: titleColor });
    const body = label(s, 12, 32, lines.join('\n'), { maxWidth: width - 24, color: COLORS.text });
    const h = 32 + body.height + 12;
    const bg = panel(s, 0, 0, width, h, COLORS.dark, titleColor, 6);
    c.add([bg, t, body]);
    // keep it on the screen (960 x 540)
    const px = Math.max(4, Math.min(960 - width - 4, x));
    const py = y + h > 536 ? Math.max(4, y - h - 8) : y;
    c.setPosition(px, py);
    this.container = c;
  }

  hide(): void {
    this.container?.destroy();
    this.container = null;
    this.owner = null;
  }
}

export type TipContent = { title: string; color: number; lines: string[]; x: number; y: number; width?: number };

export function showTip(tip: Tooltip, c: TipContent, owner: object | null = null): void {
  tip.show(c.x, c.y, c.title, c.color, c.lines, c.width, owner);
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
