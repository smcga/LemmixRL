/**
 * The colony at home on the screen (see home.ts): the game's picture of the home at twice its size, the marks of the
 * special lemmings over it (as in a level), the lemmings selected, and the tools: Pick (a click picks a lemming, a drag
 * picks every lemming in a box) and the eight skills (a click gives the lemming under it the skill, for nothing).
 */
import * as Phaser from 'phaser';
import { Bitmap32, type Lemming } from '../../../../engine/src/index.ts';
import { ColonyHome, HOME_H, HOME_W, homePicture } from '../home.ts';
import { type Skill, SKILL_NAMES, SKILLS } from '../skills.ts';
import type { LemmingCard } from '../state.ts';
import { markerColor } from './art.ts';
import { SKILL_ICONS } from './assets.ts';
import { COLORS, label, shade } from './widgets.ts';

export type HomeTool = 'pick' | Skill;

export interface HomeViewOptions {
  /** a click on a lemming with the Pick tool (or on nothing: null) */
  onPick: (card: LemmingCard | null) => void;
  /** a box drawn with the Pick tool: the lemmings in it */
  onBox: (cards: LemmingCard[]) => void;
  /** the pointer over a lemming (and off every lemming: null) */
  onHover?: (card: LemmingCard | null, x: number, y: number) => void;
  /** where things are, for the tests: every lemming by its index in the colony, and the tools */
  spot?: (name: string, x: number, y: number) => void;
  /** the colony, in its order (the indexes of the spots) */
  colony: () => LemmingCard[];
}

/** frames of the game in a second */
const FPS = 17;
const SCALE = 2;
let views = 0;

export class HomeView {
  tool: HomeTool = 'pick';
  /** the lemmings shown as selected (gold corners) */
  readonly marked = new Set<number>();
  /** the lemming picked last (its corners bob) */
  focus: number | null = null;
  private readonly key: string;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly picture = new Bitmap32();
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly pips: Phaser.GameObjects.Rectangle[] = [];
  private readonly tools = new Map<HomeTool, Phaser.GameObjects.Graphics>();
  private box: { x: number; y: number; x1: number; y1: number } | null = null;
  private clock = 0;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly home: ColonyHome,
    /** the top left of the picture */
    private readonly x: number,
    private readonly y: number,
    /** a game object made here: the caller keeps it (and destroys it) */
    private readonly add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    private readonly opts: HomeViewOptions,
  ) {
    this.key = `rl-home-${++views}`;
    this.texture = scene.textures.createCanvas(this.key, HOME_W, HOME_H)!;
    const bg = add(scene.add.graphics());
    bg.fillStyle(0x000000, 1);
    bg.fillRect(x, y, HOME_W * SCALE, HOME_H * SCALE);
    const img = add(scene.add.image(x, y, this.key).setOrigin(0, 0).setScale(SCALE));
    img.setInteractive({ useHandCursor: true });
    img.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    img.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    img.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
    img.on('pointerout', () => opts.onHover?.(null, 0, 0));
    this.overlay = add(scene.add.graphics());
    this.draw();
    scene.events.on('update', this.update, this);
  }

  destroy(): void {
    this.scene.events.off('update', this.update, this);
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }

  /** The tools: Pick and the eight skills, as buttons in a row from x, y. */
  toolbar(x: number, y: number): void {
    this.toolX = x;
    this.toolY = y;
    const scene = this.scene;
    const all: HomeTool[] = ['pick', ...SKILLS];
    all.forEach((t, i) => {
      const bx = x + i * 48;
      const g = this.add(scene.add.graphics());
      this.tools.set(t, g);
      if (t === 'pick') this.add(label(scene, bx + 21, y + 20, 'Pick', { originX: 0.5, originY: 0.5 }));
      else this.add(scene.add.image(bx + 21, y + 20, SKILL_ICONS, t).setScale(1.4));
      const zone = this.add(scene.add.zone(bx, y, 42, 40).setOrigin(0, 0).setInteractive({ useHandCursor: true }));
      zone.on('pointerup', () => {
        this.tool = t;
        this.drawTools();
      });
      this.opts.spot?.(`tool:${t}`, bx + 21, y + 20);
      zone.setData('tip', t === 'pick' ? 'Pick' : SKILL_NAMES[t]);
    });
    this.drawTools();
  }

  private drawTools(): void {
    for (const [t, g] of this.tools) {
      const i = ['pick', ...SKILLS].indexOf(t);
      const bx = this.toolX + i * 48;
      const on = this.tool === t;
      g.clear();
      g.fillStyle(shade(on ? COLORS.gold : COLORS.panelLight, 0.6), 1);
      g.fillRoundedRect(bx, this.toolY + 2, 42, 40, 6);
      g.fillStyle(on ? COLORS.gold : COLORS.panelLight, 1);
      g.fillRoundedRect(bx, this.toolY, 42, 40, 6);
    }
  }

  /** where the toolbar is */
  private toolX = 0;
  private toolY = 0;

  /* ------------------------------------------------------------------------------------------------- input */

  private world(p: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: (p.worldX - this.x) / SCALE, y: (p.worldY - this.y) / SCALE };
  }

  /** the lemming under a point of the home (the nearest, its body above its feet) */
  lemmingAt(x: number, y: number): Lemming | null {
    let best: Lemming | null = null;
    let bestD = Infinity;
    for (const l of this.home.lemmings()) {
      const dx = Math.abs(l.xPos - x);
      const dy = l.yPos - 5 - y;
      if (dx > 6 || dy < -7 || dy > 8) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  private down(p: Phaser.Input.Pointer): void {
    const w = this.world(p);
    if (this.tool !== 'pick') {
      this.home.assign(this.tool, Math.round(w.x), Math.round(w.y));
      return;
    }
    this.box = { x: w.x, y: w.y, x1: w.x, y1: w.y };
  }

  private move(p: Phaser.Input.Pointer): void {
    const w = this.world(p);
    if (this.box && p.isDown) {
      this.box.x1 = w.x;
      this.box.y1 = w.y;
      return;
    }
    const l = this.lemmingAt(w.x, w.y);
    const card = l ? this.home.card(l) : undefined;
    this.opts.onHover?.(card ?? null, this.x + (l?.xPos ?? 0) * SCALE, this.y + (l?.yPos ?? 0) * SCALE);
  }

  private up(_p: Phaser.Input.Pointer): void {
    const b = this.box;
    this.box = null;
    if (!b) return;
    // a small move is a click: the lemming under it; else a box
    if (Math.abs(b.x1 - b.x) < 4 && Math.abs(b.y1 - b.y) < 4) {
      const l = this.lemmingAt(b.x, b.y);
      this.opts.onPick((l && this.home.card(l)) ?? null);
      return;
    }
    const [x0, x1] = [Math.min(b.x, b.x1), Math.max(b.x, b.x1)];
    const [y0, y1] = [Math.min(b.y, b.y1), Math.max(b.y, b.y1)];
    const cards: LemmingCard[] = [];
    for (const l of this.home.lemmings()) {
      if (l.xPos < x0 || l.xPos > x1 || l.yPos - 5 < y0 || l.yPos - 5 > y1) continue;
      const c = this.home.card(l);
      if (c && !cards.includes(c)) cards.push(c);
    }
    this.opts.onBox(cards);
  }

  /* ------------------------------------------------------------------------------------------------- frames */

  private update(_t: number, delta: number): void {
    this.time += delta / 1000;
    this.clock += delta;
    let steps = 0;
    while (this.clock >= 1000 / FPS && steps < 4) {
      this.clock -= 1000 / FPS;
      this.home.update();
      steps++;
    }
    if (steps === 4) this.clock = 0;
    this.draw();
  }

  /** the picture of the home, and over it the marks, the selection and the box */
  private draw(): void {
    homePicture(this.home, this.picture);
    const ctx = this.texture.getContext();
    const img = ctx.createImageData(HOME_W, HOME_H);
    const d = img.data;
    const bits = this.picture.bits;
    for (let i = 0; i < bits.length; i++) {
      const px = bits[i];
      if (!px) continue;
      d[i * 4] = (px >>> 16) & 255;
      d[i * 4 + 1] = (px >>> 8) & 255;
      d[i * 4 + 2] = px & 255;
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.texture.refresh();

    const g = this.overlay;
    g.clear();
    const lemmings = this.home.lemmings();
    let n = 0;
    const colony = this.opts.colony();
    for (const l of lemmings) {
      const c = this.home.card(l);
      if (!c) continue;
      const sx = this.x + l.xPos * SCALE;
      const sy = this.y + l.yPos * SCALE;
      // the mark of a special lemming, as in a level
      const color = markerColor(c);
      if (color !== null) {
        let pip = this.pips[n];
        if (!pip) this.pips.push((pip = this.add(this.scene.add.rectangle(0, 0, 3 * SCALE, 3 * SCALE, color).setStrokeStyle(SCALE, 0x000000))));
        pip.setPosition(sx + 1, sy - 13 * SCALE).setFillStyle(color).setVisible(true);
        n++;
      }
      // preferred: a green line under its feet; avoided: a red one
      if (c.pref) {
        g.fillStyle(c.pref === 'prefer' ? 0x40d050 : 0xe84040, 1);
        g.fillRect(sx - 6, sy + 2, 14, 2);
      }
      if (this.marked.has(c.id)) this.corners(g, sx, sy, c.id === this.focus);
      this.opts.spot?.(`colony:${colony.indexOf(c)}`, sx, sy - 10);
    }
    for (let i = n; i < this.pips.length; i++) this.pips[i].setVisible(false);
    for (const p of this.pips) this.scene.children.bringToTop(p);
    this.scene.children.bringToTop(g);
    if (this.box) {
      const b = this.box;
      g.lineStyle(2, COLORS.gold, 1);
      g.strokeRect(this.x + Math.min(b.x, b.x1) * SCALE, this.y + Math.min(b.y, b.y1) * SCALE, Math.abs(b.x1 - b.x) * SCALE, Math.abs(b.y1 - b.y) * SCALE);
    }
  }

  /** the corners of a box around a lemming (like the cursor of Lemmings); the one picked last bobs */
  private corners(g: Phaser.GameObjects.Graphics, sx: number, sy: number, focus: boolean): void {
    const b = focus ? Math.round(Math.sin(this.time * 6)) : 0;
    const x0 = sx - 11 - b;
    const x1 = sx + 13 + b;
    const y0 = sy - 24 - b;
    const y1 = sy + 3 + b;
    g.lineStyle(2, focus ? COLORS.gold : 0xf0d080, 1);
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ]) {
      g.lineBetween(cx, cy, cx + 6 * dx, cy);
      g.lineBetween(cx, cy, cx, cy + 6 * dy);
    }
  }
}
