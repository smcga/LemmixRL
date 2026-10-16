/**
 * The colony at home: every lemming of it walking about a little Lemmings level of three floors. They turn round now
 * and then, walk off the ends of the upper floors and fall (a floater opens its umbrella), climb the side walls (the
 * climbers), and some go out by the exit at the bottom and come back in by the trapdoor at the top. A lemming under the
 * pointer (or tapped) says who it is.
 */
import * as Phaser from 'phaser';
import type { LemmingCard } from '../state.ts';
import { type LemmingAnim, lemmingSprite } from './assets.ts';
import { COLORS, label } from './widgets.ts';

export interface HabitatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Mode = 'walk' | 'fall' | 'float' | 'climb' | 'exit' | 'gone';

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

export class Habitat {
  private readonly walkers: Walker[] = [];
  private readonly floors: Floor[];
  private readonly left: number;
  private readonly right: number;
  private readonly entrance: { x: number; y: number };
  private readonly exit: { x: number; y: number };

  constructor(
    private readonly scene: Phaser.Scene,
    area: HabitatRect,
    cards: LemmingCard[],
    /** a game object made here: the caller keeps it (and destroys it) */
    private readonly add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    tints: Record<string, number>,
    onPick: (card: LemmingCard, x: number, y: number) => void,
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
    this.entrance = { x: x + 150, y: y + 18 };
    this.exit = { x: x + w - 120, y: fy(2) };
    this.drawLevel(area);

    for (const card of cards) {
      const floor = Phaser.Math.Between(0, 2);
      const piece = Phaser.Utils.Array.GetRandom(this.floors[floor].pieces);
      const wx = Phaser.Math.FloatBetween(piece[0] + 6, piece[1] - 6);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const sprite = this.add(lemmingSprite(scene, wx, this.floors[floor].y, dir > 0 ? 'walk' : 'walkLeft', 2));
      sprite.setOrigin(0.5, 1);
      const tint = card.edition !== 'plain' ? tints[card.edition] : card.insured ? 0xffd0a0 : null;
      if (tint) sprite.setTint(tint);
      // (the animations start at different frames: a crowd does not walk in step)
      sprite.anims.setProgress(Math.random());
      sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
      sprite.on('pointerup', () => onPick(card, sprite.x, sprite.y));
      sprite.on('pointerover', () => onPick(card, sprite.x, sprite.y));
      this.walkers.push({ card, sprite, x: wx, y: this.floors[floor].y, dir, floor, mode: 'walk', speed: WALK_SPEED * Phaser.Math.FloatBetween(0.85, 1.15), timer: Math.random() * 4, fallFrom: 0 });
    }
    scene.events.on('update', this.update, this);
  }

  destroy(): void {
    this.scene.events.off('update', this.update, this);
  }

  /** the level they live in: the floors (earth with grass), the side walls, the trapdoor and the exit */
  private drawLevel(area: HabitatRect): void {
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(area.x, area.y, area.w, area.h, 10);
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
    const key = 'rl-lem-' + anim;
    if (w.sprite.anims.currentAnim?.key !== key) w.sprite.play(key);
    w.sprite.setFlipX(flip);
  }

  /** the piece of a floor under x, if any */
  private pieceAt(floor: number, x: number): [number, number] | null {
    return this.floors[floor]?.pieces.find(([a, b]) => x >= a && x <= b) ?? null;
  }

  private update(_t: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    for (const w of this.walkers) {
      if (!w.sprite.active) continue;
      w.timer -= dt;
      switch (w.mode) {
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
      w.sprite.setPosition(Math.round(w.x), Math.round(w.y));
    }
  }
}
