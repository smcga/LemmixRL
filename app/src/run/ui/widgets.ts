/** A small UI toolkit for the run screens: labels in the DOS font, panels, buttons, cards and tooltips. */
import * as Phaser from 'phaser';
import { touch } from '../../touch.ts';
import { keywordsOf } from '../content.ts';
import { drawnIndexes, parseRich, plainText } from '../rich.ts';
import { FONT, FONT_PURPLE } from './assets.ts';

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
  /** the names of the levels */
  lilac: 0xcbb8ff,
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
  // large text is the pixel font of the run screens, half as big again (as Balatro has its pixel font everywhere); the
  // purple DOS font of Lemmings is left for a title of its own (48 pixels or more)
  const original = !!o.purple && (o.size ?? 16) >= 48;
  const size = original ? (o.size ?? 16) : o.big ? Math.round((o.size ?? 16) * 1.5) : o.purple ? 24 : (o.size ?? 16);
  // (the colours of a description: see rich.ts)
  const rich = parseRich(text);
  const t = scene.add.bitmapText(x, y, original ? FONT_PURPLE : FONT, rich.plain, size, o.align ?? 0);
  if (o.maxWidth) t.setMaxWidth(o.maxWidth);
  t.setOrigin(o.originX ?? 0, o.originY ?? 0);
  if (!original) t.setTint(o.purple ? COLORS.lilac : (o.color ?? COLORS.text));
  if (rich.spans.length) {
    // (the colours go by the characters Phaser draws: see drawnIndexes)
    const wrapped = (o.maxWidth ? t.getTextBounds(false).wrappedText : '') || rich.plain;
    const chars = t.fontData.chars as Record<number, unknown>;
    const at = drawnIndexes(rich.plain, wrapped, (code) => !!chars[code]);
    for (const sp of rich.spans)
      for (let k = sp.start; k < sp.start + sp.length; k++) if (at[k] >= 0) t.setCharacterTint(at[k], 1, Phaser.TintModes.MULTIPLY, sp.color);
  }
  // a shadow under every text, as in Balatro: it keeps the letters apart from what is behind them (not under the dark
  // text of a description, which is on white)
  if (o.color !== COLORS.ink) t.setDropShadow(size / 16, size / 16, 0x000000, 0.55);
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
  /** the sound of every button that is pressed (a scene sets it) */
  static clickSound: (() => void) | null = null;

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
      if (click && this.enabled) {
        Button.clickSound?.();
        this.onClick();
      }
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
  /** several badges in a row (a lemming: its edition, its abilities), after the badge */
  badges?: { text: string; color: number }[];
  center?: boolean;
  above?: boolean;
  /** the boxes of the keywords next to it (by default the keywords its lines use: see KEYWORDS) */
  keywords?: { title: string; text: string }[];
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
    // the badges: pills in rows, centred
    const pills = [...(c.badge ? [c.badge] : []), ...(c.badges ?? [])];
    const placed: { x: number; y: number; w: number; color: number }[] = [];
    if (pills.length) {
      const texts = pills.map((p) => label(s, 0, 0, p.text, { originX: 0.5, originY: 0.5 }));
      const rows: number[][] = [[]];
      let rowW = 0;
      texts.forEach((t, i) => {
        const w = t.width + 20 + 6;
        if (rowW + w > width - 12 && rows[rows.length - 1].length) {
          rows.push([]);
          rowW = 0;
        }
        rows[rows.length - 1].push(i);
        rowW += w;
      });
      for (const row of rows) {
        const total = row.reduce((n, i) => n + texts[i].width + 20, 0) + 6 * (row.length - 1);
        let x = width / 2 - total / 2;
        for (const i of row) {
          const w = texts[i].width + 20;
          texts[i].setPosition(Math.round(x + w / 2), h + 9);
          placed.push({ x, y: h, w, color: pills[i].color });
          x += w + 6;
        }
        h += 24;
      }
      h += 2;
      parts.push(...texts);
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
    if (placed.length) {
      for (const p of placed) {
        g.fillStyle(shade(p.color, 0.6), 1);
        g.fillRoundedRect(p.x, p.y + 2, p.w, 18, 6);
        g.fillStyle(p.color, 1);
        g.fillRoundedRect(p.x, p.y, p.w, 18, 6);
      }
    } else {
      // no badge: a line in the colour of what it is about
      g.fillStyle(c.color, 1);
      g.fillRect(12, title.y + title.height + 1, width - 24, 2);
    }
    box.add(parts);
    // the keywords: small boxes beside it, as in Balatro (on the side with room)
    const keywords = c.keywords ?? keywordsOf(plainText(c.lines.join(' ')));
    const kw = 170;
    const x = c.center ? c.x - width / 2 : c.x;
    const y = c.above ? c.y - h : c.y;
    let px = Math.max(4, Math.min(960 - width - 4, x));
    const left = keywords.length > 0 && px + width + 6 + kw > 956;
    if (left) px = Math.max(kw + 10, px);
    let ky = 0;
    for (const k of keywords) {
      const kt = label(s, kw / 2, 6, k.title, { originX: 0.5, maxWidth: kw - 12, align: 1 });
      const kb = label(s, kw / 2, kt.y + kt.height + 8, k.text, { maxWidth: kw - 22, color: COLORS.ink, originX: 0.5, align: 1 });
      const kh = kb.y + kb.height + 10;
      const kg = s.add.graphics();
      kg.fillStyle(0x000000, 0.35);
      kg.fillRoundedRect(2, 4, kw, kh, 8);
      kg.fillStyle(COLORS.panelLight, 1);
      kg.fillRoundedRect(0, 0, kw, kh, 8);
      kg.lineStyle(2, 0xdfe7e9, 1);
      kg.strokeRoundedRect(0, 0, kw, kh, 8);
      kg.fillStyle(COLORS.cream, 1);
      kg.fillRoundedRect(6, kb.y - 4, kw - 12, kb.height + 8, 6);
      const kc = s.add.container(left ? -kw - 6 : width + 6, ky, [kg, kt, kb]);
      box.add(kc);
      ky += kh + 6;
    }
    // keep it on the screen (960 x 540)
    const fullH = Math.max(h, ky - 6);
    const py = !c.above && y + fullH > 536 ? Math.max(4, Math.min(y - h - 8, 536 - fullH)) : Math.max(4, Math.min(y, 536 - fullH));
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

/**
 * A slider, as in the settings of Balatro: a caption, a bar that fills in its colour, and the value in percent. Tap or
 * drag along the bar. onChange is called while it moves (done false) and once more when the pointer comes up.
 */
export class Slider extends Phaser.GameObjects.Container {
  private value: number;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly percent: Phaser.GameObjects.BitmapText;
  private dragging = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly sw: number,
    caption: string,
    value: number,
    private readonly color: number,
    private readonly onChange: (value: number, done: boolean) => void,
  ) {
    super(scene, x, y);
    this.value = value;
    this.add(label(scene, 0, 0, caption));
    this.percent = label(scene, sw, 0, '', { originX: 1, color: COLORS.gold });
    this.add(this.percent);
    this.g = scene.add.graphics();
    this.add(this.g);
    const zone = scene.add.zone(0, 14, sw, 34).setOrigin(0, 0).setInteractive();
    this.add(zone);
    const at = (p: Phaser.Input.Pointer) => Math.round(Math.max(0, Math.min(1, (p.worldX - this.x) / this.sw)) * 20) / 20;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.set(at(p), false);
    });
    const move = (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.set(at(p), false);
    };
    const up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.onChange(this.value, true);
    };
    scene.input.on('pointermove', move);
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
    this.once('destroy', () => {
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
      scene.input.off('pointerupoutside', up);
    });
    scene.add.existing(this);
    this.redraw();
  }

  private set(v: number, done: boolean): void {
    if (v === this.value && !done) return;
    this.value = v;
    this.redraw();
    this.onChange(v, done);
  }

  private redraw(): void {
    const g = this.g;
    const w = this.sw;
    g.clear();
    g.fillStyle(COLORS.dark, 1);
    g.fillRoundedRect(0, 20, w, 22, 6);
    if (this.value > 0) {
      g.fillStyle(shade(this.color, 0.6), 1);
      g.fillRoundedRect(0, 23, Math.max(12, w * this.value), 19, 6);
      g.fillStyle(this.color, 1);
      g.fillRoundedRect(0, 20, Math.max(12, w * this.value), 19, 6);
    }
    // the knob
    const kx = Math.max(0, Math.min(w - 10, w * this.value - 5));
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(kx + 1, 17, 10, 30, 3);
    g.fillStyle(COLORS.cream, 1);
    g.fillRoundedRect(kx, 15, 10, 30, 3);
    this.percent.setText(this.value > 0 ? `${Math.round(this.value * 100)}%` : 'Off');
  }
}
