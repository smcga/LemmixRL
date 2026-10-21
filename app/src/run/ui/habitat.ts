/**
 * The colony at home: every lemming of it walking about a little Lemmings level of three floors. They turn round now
 * and then, walk off the ends of the upper floors and fall (a floater opens its umbrella), climb the side walls (the
 * climbers), and some go out by the exit at the bottom and come back in by the trapdoor at the top.
 *
 * A click (or tap) on a lemming picks it: the colony view marks it and says who it is. With a boost, the lemmings
 * selected for it are lifted into a patch of sky at the top, where they wriggle (as Balatro lifts the cards selected
 * from a hand); selected again, a lemming drops back down.
 */
import * as Phaser from 'phaser';
import type { LemmingCard } from '../state.ts';
import { type LemmingAnim, lemmingAnimKey, lemmingSprite } from './assets.ts';
import { COLORS, label } from './widgets.ts';

export interface HabitatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HabitatOptions {
  /** the pointer over a lemming (and off it) */
  onHover?: (card: LemmingCard, x: number, y: number) => void;
  onOut?: (card: LemmingCard) => void;
  /** a click or a tap on a lemming */
  onPick?: (card: LemmingCard) => void;
  /** the patch of sky at the top for the lemmings lifted (a boost): how many fit in it */
  sky?: number;
  /** where every lemming is, every frame, by its index in the cards (for the tests) */
  spot?: (index: number, x: number, y: number) => void;
}

type Mode = 'walk' | 'fall' | 'float' | 'climb' | 'exit' | 'gone' | 'lifted';

interface Walker {
  card: LemmingCard;
  sprite: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  /** +1 right, -1 left */
  dir: number;
  floor: number;
  mode: Mode;
  speed: number;
  /** seconds until something can change (a turn, coming back) */
  timer: number;
  /** where a fall started (a floater opens its umbrella after a while) */
  fallFrom: number;
  /** lifted: its place in the sky, and a phase of its wriggle */
  slot: number;
  phase: number;
}

/** a floor: where its walkers stand, and its pieces (from x to x) */
interface Floor {
  y: number;
  pieces: [number, number][];
}

const WALK_SPEED = 26;
const FALL_SPEED = 150;
const FLOAT_SPEED = 38;
const CLIMB_SPEED = 22;
const LIFT_SPEED = 420;
/** the room of a lemming in the sky */
const SKY_PITCH = 44;

export class Habitat {
  private readonly walkers: Walker[] = [];
  private readonly floors: Floor[];
  private readonly left: number;
  private readonly right: number;
  private readonly entrance: { x: number; y: number };
  private readonly exit: { x: number; y: number };
  private readonly skyArea: HabitatRect | null = null;
  /** the mark around the lemming picked */
  private readonly marker: Phaser.GameObjects.Graphics;
  private marked: number | null = null;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    area: HabitatRect,
    cards: LemmingCard[],
    /** a game object made here: the caller keeps it (and destroys it) */
    private readonly add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    private readonly opts: HabitatOptions = {},
  ) {
    const { x, y, w, h } = area;
    this.left = x + 14;
    this.right = x + w - 14;
    const fy = (k: number) => Math.round(y + h * (0.3 + 0.32 * k));
    // the top floor has a gap in the middle, the middle one stops short of the walls, the bottom one is whole
    const mid = x + w / 2;
    this.floors = [
      { y: fy(0), pieces: [[this.left, mid - 50], [mid + 50, this.right]] },
      { y: fy(1), pieces: [[x + 90, x + w - 90]] },
      { y: fy(2), pieces: [[this.left, this.right]] },
    ];
    this.entrance = { x: x + 70, y: y + 18 };
    this.exit = { x: x + w - 90, y: fy(2) };
    if (opts.sky) {
      const sw = Math.min(w - 180, Math.max(220, opts.sky * SKY_PITCH + 40));
      this.skyArea = { x: mid - sw / 2, y: y + 8, w: sw, h: Math.round(h * 0.3) - 28 };
    }
    this.drawLevel(area);

    cards.forEach((card, index) => {
      const floor = Phaser.Math.Between(0, 2);
      const piece = Phaser.Utils.Array.GetRandom(this.floors[floor].pieces);
      const wx = Phaser.Math.FloatBetween(piece[0] + 6, piece[1] - 6);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const sprite = this.add(lemmingSprite(scene, wx, this.floors[floor].y, dir > 0 ? 'walk' : 'walkLeft', 2, card));
      sprite.setOrigin(0.5, 1);
      // (the skin of a special lemming is in the colour of its edition: see lemmingPalette)
      if (card.edition === 'plain' && card.insured) sprite.setTint(0xffd0a0);
      // (the animations start at different frames: a crowd does not walk in step)
      sprite.anims.setProgress(Math.random());
      sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
      sprite.on('pointerup', () => opts.onPick?.(card));
      sprite.on('pointerover', () => opts.onHover?.(card, sprite.x, sprite.y));
      sprite.on('pointerout', () => opts.onOut?.(card));
      this.walkers.push({
        card,
        sprite,
        x: wx,
        y: this.floors[floor].y,
        dir,
        floor,
        mode: 'walk',
        speed: WALK_SPEED * Phaser.Math.FloatBetween(0.85, 1.15),
        timer: Math.random() * 4,
        fallFrom: 0,
        slot: -1,
        phase: Math.random() * Math.PI * 2,
      });
      opts.spot?.(index, wx, this.floors[floor].y - 10);
    });
    this.marker = this.add(scene.add.graphics());
    scene.events.on('update', this.update, this);
  }

  destroy(): void {
    this.scene.events.off('update', this.update, this);
  }

  /** marks a lemming (the one picked), or none */
  mark(id: number | null): void {
    this.marked = id;
  }

  /** lifts a lemming into the sky (for a boost) */
  lift(id: number): void {
    const w = this.walkers.find((k) => k.card.id === id);
    if (!w || w.mode === 'lifted') return;
    const used = new Set(this.walkers.filter((k) => k.mode === 'lifted').map((k) => k.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    w.slot = slot;
    w.mode = 'lifted';
    w.sprite.setVisible(true);
    w.sprite.setFlipX(false);
    this.play(w, 'fall');
    this.restack();
  }

  /** drops a lifted lemming back down (a floater opens its umbrella) */
  drop(id: number): void {
    const w = this.walkers.find((k) => k.card.id === id);
    if (!w || w.mode !== 'lifted') return;
    w.mode = 'fall';
    w.slot = -1;
    w.fallFrom = w.y;
    w.dir = Math.random() < 0.5 ? -1 : 1;
    this.play(w, 'fall');
    this.restack();
  }

  /** the lifted lemmings close up, in the order they were lifted */
  private restack(): void {
    this.walkers
      .filter((k) => k.mode === 'lifted')
      .sort((a, b) => a.slot - b.slot)
      .forEach((k, i) => (k.slot = i));
  }

  /** where a lifted lemming wriggles */
  private skySpot(w: Walker): { x: number; y: number } {
    const sky = this.skyArea!;
    const n = this.walkers.filter((k) => k.mode === 'lifted').length;
    const x0 = sky.x + sky.w / 2 - ((n - 1) * SKY_PITCH) / 2;
    return { x: x0 + w.slot * SKY_PITCH, y: sky.y + sky.h - 10 };
  }

  /** the level they live in: the floors (earth with grass), the side walls, the trapdoor, the exit, the sky */
  private drawLevel(area: HabitatRect): void {
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(area.x, area.y, area.w, area.h, 10);
    if (this.skyArea) {
      // a patch of sky with two little clouds
      const s = this.skyArea;
      g.fillStyle(0x3a6ea8, 0.9);
      g.fillRoundedRect(s.x, s.y, s.w, s.h, 10);
      g.lineStyle(2, 0x9cc8f0, 1);
      g.strokeRoundedRect(s.x, s.y, s.w, s.h, 10);
      g.fillStyle(0xe8f2ff, 0.85);
      for (const [cx, cy] of [
        [s.x + 30, s.y + 14],
        [s.x + s.w - 44, s.y + 22],
      ]) {
        g.fillRect(cx, cy, 22, 5);
        g.fillRect(cx + 5, cy - 4, 12, 4);
      }
    }
    const earth = 0x8a4f2a;
    const dark = 0x5a3018;
    for (const f of this.floors)
      for (const [a, b] of f.pieces) {
        g.fillStyle(dark, 1);
        g.fillRect(a - 4, f.y, b - a + 8, 14);
        g.fillStyle(earth, 1);
        g.fillRect(a - 4, f.y, b - a + 8, 10);
        g.fillStyle(0x4caf50, 1);
        g.fillRect(a - 4, f.y, b - a + 8, 3);
      }
    // the walls the climbers go up
    g.fillStyle(dark, 1);
    g.fillRect(area.x + 2, area.y + 30, 10, area.h - 30);
    g.fillRect(area.x + area.w - 12, area.y + 30, 10, area.h - 30);
    // the trapdoor
    const e = this.entrance;
    g.fillStyle(0x6a4a2a, 1);
    g.fillRect(e.x - 26, e.y - 10, 52, 14);
    g.fillStyle(0x2a1a0a, 1);
    g.fillRect(e.x - 18, e.y + 4, 36, 4);
    // the exit: an arch with a dark door, and torches
    const x = this.exit;
    g.fillStyle(0x9a8a7a, 1);
    g.fillRect(x.x - 20, x.y - 40, 40, 40);
    g.fillStyle(0x101018, 1);
    g.fillRect(x.x - 10, x.y - 26, 20, 26);
    g.fillStyle(0xffa020, 1);
    g.fillRect(x.x - 24, x.y - 48, 4, 8);
    g.fillRect(x.x + 20, x.y - 48, 4, 8);
    this.add(label(this.scene, x.x, x.y - 52, 'EXIT', { color: COLORS.gold, originX: 0.5, originY: 1 }));
  }

  private play(w: Walker, anim: LemmingAnim, flip = false): void {
    const key = lemmingAnimKey(this.scene, anim, w.card);
    if (w.sprite.anims.currentAnim?.key !== key) w.sprite.play(key);
    w.sprite.setFlipX(flip);
  }

  /** the piece of a floor under x, if any */
  private pieceAt(floor: number, x: number): [number, number] | null {
    return this.floors[floor]?.pieces.find(([a, b]) => x >= a && x <= b) ?? null;
  }

  private update(_t: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    this.time += dt;
    this.walkers.forEach((w, index) => {
      if (!w.sprite.active) return;
      this.move(w, dt);
      w.sprite.setPosition(Math.round(w.x), Math.round(w.y));
      this.opts.spot?.(index, w.x, w.y - 10);
    });
    // the mark: the corners of a box around the lemming picked (like the cursor of Lemmings), bobbing a little
    const g = this.marker;
    g.clear();
    const m = this.marked === null ? null : this.walkers.find((w) => w.card.id === this.marked);
    if (m && m.sprite.visible) {
      const b = Math.round(Math.sin(this.time * 6));
      const x0 = m.x - 12 - b;
      const x1 = m.x + 12 + b;
      const y0 = m.y - 26 - b;
      const y1 = m.y + 2 + b;
      g.lineStyle(2, COLORS.gold, 1);
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

  private move(w: Walker, dt: number): void {
    w.timer -= dt;
    switch (w.mode) {
      case 'lifted': {
        // up to its place in the sky, then a wriggle there
        const to = this.skySpot(w);
        const wx = to.x + Math.sin(this.time * 3 + w.phase) * 2;
        const wy = to.y + Math.sin(this.time * 5 + w.phase) * 3;
        const dx = wx - w.x;
        const dy = wy - w.y;
        const d = Math.hypot(dx, dy);
        const step = LIFT_SPEED * dt;
        if (d <= step || d < 4) {
          w.x = wx;
          w.y = wy;
        } else {
          w.x += (dx / d) * step;
          w.y += (dy / d) * step;
        }
        break;
      }
      case 'walk': {
        w.x += w.dir * w.speed * dt;
        // a turn now and then
        if (w.timer <= 0) {
          w.timer = Phaser.Math.FloatBetween(3, 9);
          if (Math.random() < 0.35) w.dir = -w.dir;
        }
        // the exit at the bottom: some go out
        if (w.floor === 2 && Math.abs(w.x - this.exit.x) < 1.5 && Math.random() < 0.15) {
          w.mode = 'exit';
          w.timer = 0.7;
          this.play(w, 'exit');
          break;
        }
        const piece = this.pieceAt(w.floor, w.x);
        if (!piece) {
          // walked off the end of a floor: down it goes
          if (w.floor < 2) {
            w.mode = 'fall';
            w.fallFrom = w.y;
            this.play(w, 'fall');
          } else w.dir = -w.dir;
          break;
        }
        // the walls: a climber goes up, the others turn round
        if (w.x <= this.left + 2 || w.x >= this.right - 2) {
          if (w.card.climber && w.floor === 2) {
            w.mode = 'climb';
            w.x = w.x < (this.left + this.right) / 2 ? this.left - 4 : this.right + 4;
            this.play(w, 'climb', w.x < (this.left + this.right) / 2);
          } else {
            w.dir = w.x < (this.left + this.right) / 2 ? 1 : -1;
            w.x = Phaser.Math.Clamp(w.x, this.left + 3, this.right - 3);
          }
          break;
        }
        this.play(w, w.dir > 0 ? 'walk' : 'walkLeft');
        break;
      }
      case 'fall':
      case 'float': {
        const floater = w.card.floater && w.y - w.fallFrom > 30;
        if (floater && w.mode !== 'float') {
          w.mode = 'float';
          this.play(w, 'float');
        }
        const before = w.y;
        w.y += (w.mode === 'float' ? FLOAT_SPEED : FALL_SPEED) * dt;
        // the first floor passed on the way down (from the top: the trapdoor drops onto the top floor)
        const below = this.floors.findIndex((f, k) => f.y > before && f.y <= w.y && this.pieceAt(k, w.x));
        if (below >= 0) {
          w.floor = below;
          w.y = this.floors[below].y;
          w.mode = 'walk';
          w.timer = Phaser.Math.FloatBetween(1, 5);
          this.play(w, w.dir > 0 ? 'walk' : 'walkLeft');
        }
        break;
      }
      case 'climb': {
        w.y -= CLIMB_SPEED * dt;
        if (w.y <= this.floors[0].y) {
          // over the top: onto the top floor, walking away from the wall
          w.y = this.floors[0].y;
          w.floor = 0;
          w.dir = w.x < (this.left + this.right) / 2 ? 1 : -1;
          w.x = w.dir > 0 ? this.left + 4 : this.right - 4;
          w.mode = 'walk';
          this.play(w, w.dir > 0 ? 'walk' : 'walkLeft');
        }
        break;
      }
      case 'exit':
        if (w.timer <= 0) {
          w.mode = 'gone';
          w.sprite.setVisible(false);
          w.timer = Phaser.Math.FloatBetween(1, 6);
        }
        break;
      case 'gone':
        if (w.timer <= 0) {
          // back in by the trapdoor
          w.x = this.entrance.x + Phaser.Math.FloatBetween(-8, 8);
          w.y = this.entrance.y + 8;
          w.fallFrom = w.y;
          w.dir = Math.random() < 0.5 ? -1 : 1;
          w.mode = 'fall';
          w.sprite.setVisible(true);
          this.play(w, 'fall');
        }
        break;
    }
  }
}
