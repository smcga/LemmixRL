/**
 * The colony at home (Lematro): a little level of its own where every lemming of the colony lives, played by the real
 * game. All the skills can be used there, as often as you like and for nothing: build bridges, dig and bash through the
 * ground, put blockers in the way, to keep lemmings in groups. The ground and where every lemming is are kept with the
 * run, so the home is as it was left the next time it is opened.
 *
 * Nothing is lost at home: a lemming that falls out, splats, explodes or goes out by the exit comes back in by the
 * trapdoor a moment later. The lemmings that join the colony come in by the trapdoor too.
 */
import { deflateSync, inflateSync } from 'fflate';
import {
  ALPHA_TERRAIN,
  Bitmap32,
  createSessionFromInfo,
  type DataProvider,
  InteractiveObject,
  type Lemming,
  LemmingAction,
  type LemmingGame,
  type LevelLoadingInformation,
  type Session,
  type SessionOptions,
} from '../../../engine/src/index.ts';
import { recolouredBitmap } from './level-rules.ts';
import { SKILL_ACTIONS, SKILLS, setSkills } from './skills.ts';
import type { LemmingCard } from './state.ts';

/** the level whose graphic set (Dirt) the home is made of */
export const HOME_LEVEL = 'Orig-1-01';

/** the home: the left of the game's world, this wide (and as high as a level) */
export const HOME_W = 310;
export const HOME_H = 160;

/** the floors of the home (x from, x to, the top of the ground), from the top */
export const HOME_FLOORS: readonly [number, number, number][] = [
  [8, 150, 44],
  [130, 301, 78],
  [8, 200, 112],
  [8, 301, 146],
];

/** the objects of a DOS graphic set: 0 the exit, 1 the trapdoor, 7 (Dirt) the flames of the exit */
const ENTRANCE = { left: 30, top: 6 };
const EXIT = { left: 236, top: 146 - 17 };

/** what is kept of a home between visits */
export interface HomeState {
  v: 1;
  /** the ground: the pixels of the home, deflated, in base64 */
  terrain: string;
  /** where every lemming is (feet), its way and whether it blocks */
  lemmings: { id: number; x: number; y: number; dir: 1 | -1; blocker?: true }[];
}

/** a lemming that is not there yet: it comes in by the trapdoor */
interface Arrival {
  id: number;
  at: number;
}

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class ColonyHome {
  readonly session: Session;
  readonly game: LemmingGame;
  /** the card of every lemming of the home */
  private readonly cardOf = new Map<Lemming, number>();
  private arrivals: Arrival[] = [];
  /** the frame the last lemming came in by the trapdoor */
  private lastArrival = -99;
  /** the lemmings gone (dead, out by the exit): when they come back */
  private readonly away = new Map<Lemming, number>();

  constructor(
    data: DataProvider,
    /** a level of the Dirt graphic set (its style, its music are not used) */
    base: LevelLoadingInformation,
    private readonly cards: () => LemmingCard[],
    saved: HomeState | undefined,
    options: SessionOptions = {},
  ) {
    const view = options.view ?? { bitmapToControl: (x: number, y: number) => ({ x, y }), renderLowResText: (t: string) => new Bitmap32(t.length * 7, 14) };
    this.session = createSessionFromInfo(data, base, { ...options, view }, (level) => {
      level.clearLevel();
      const i = level.info;
      i.lemmingsCount = 0;
      i.rescueCount = 0;
      i.releaseRate = 1;
      i.timeLimit = 99;
      i.screenPosition = 0;
      setSkills(i, { climber: 99, floater: 99, bomber: 99, blocker: 99, builder: 99, basher: 99, miner: 99, digger: 99 });
      const obj = (identifier: number, left: number, top: number) => {
        const o = new InteractiveObject();
        o.identifier = identifier;
        o.left = left;
        o.top = top;
        level.interactiveObjects.push(o);
      };
      obj(1, ENTRANCE.left, ENTRANCE.top);
      obj(0, EXIT.left, EXIT.top);
      obj(7, EXIT.left, EXIT.top - 8);
    });
    const game = (this.game = this.session.game);
    game.lemmingBitmap = (l, bitmap) => {
      const card = this.card(l);
      return card ? recolouredBitmap(card, bitmap) : bitmap;
    };
    game.onIteration = () => this.iteration();
    game.start(false);
    // the ground: as it was left, or new
    if (!saved || !this.restoreTerrain(saved.terrain)) this.buildTerrain();
    // the lemmings: where they were; the others are placed on the floors (the first time) or come in by the trapdoor
    const placed = new Set<number>();
    const ids = new Set(cards().map((c) => c.id));
    for (const s of saved?.lemmings ?? []) {
      if (!ids.has(s.id) || placed.has(s.id) || this.solid(s.x, s.y - 4)) continue;
      const l = this.spawn(s.id, s.x, s.y, s.dir);
      if (s.blocker) game.transition(l, LemmingAction.Blocking);
      placed.add(s.id);
    }
    const rest = cards().filter((c) => !placed.has(c.id));
    if (!saved) rest.forEach((c, k) => this.spawnOnFloor(c.id, k));
    else this.arrivals = rest.map((c, k) => ({ id: c.id, at: 40 + 4 * k }));
  }

  /** the card of a lemming of the home */
  card(l: Lemming): LemmingCard | undefined {
    const id = this.cardOf.get(l);
    return id === undefined ? undefined : this.cards().find((c) => c.id === id);
  }

  /** the lemmings that are at home now */
  lemmings(): Lemming[] {
    return this.game.lemmingList.filter((l) => !l.isRemoved && this.cardOf.has(l));
  }

  /** how many lemmings live here: the ones at home, and the ones on their way back in by the trapdoor */
  population(): number {
    return this.lemmings().length + this.away.size + this.arrivals.length;
  }

  /** One frame of the game. */
  update(): void {
    this.game.update();
  }

  /** Uses a skill on the lemming at x, y (of the home), for nothing. Returns whether a lemming took it. */
  assign(skill: (typeof SKILLS)[number], x: number, y: number): boolean {
    const game = this.game;
    const hit = game.prioritizedHitTest({ x, y }, false);
    if (!hit.lemming1) return false;
    return !!game.assignSkill(hit.lemming1, hit.lemming2, SKILL_ACTIONS[skill]);
  }

  /** What is kept of the home. */
  save(): HomeState {
    const lemmings: HomeState['lemmings'] = [];
    const seen = new Set<number>();
    for (const l of this.lemmings()) {
      const id = this.cardOf.get(l)!;
      if (seen.has(id) || l.action === LemmingAction.Exiting) continue;
      seen.add(id);
      lemmings.push({ id, x: l.xPos, y: l.yPos, dir: l.xDelta > 0 ? 1 : -1, ...(l.action === LemmingAction.Blocking ? { blocker: true as const } : {}) });
    }
    return { v: 1, terrain: this.saveTerrain(), lemmings };
  }

  /* ------------------------------------------------------------------------------------------------- inside */

  private spawn(id: number, x: number, y: number, dir: 1 | -1): Lemming {
    const l = this.game.spawnLemming(x, y, dir);
    this.cardOf.set(l, id);
    const c = this.cards().find((k) => k.id === id);
    if (c && (c.climber || c.floater)) this.game.grantPermanentAbilities(l, c.climber, c.floater);
    return l;
  }

  /** a lemming put down on a floor (spread over the floors by its number) */
  private spawnOnFloor(id: number, k: number): void {
    const [x0, x1, y] = HOME_FLOORS[k % HOME_FLOORS.length];
    const n = Math.floor(k / HOME_FLOORS.length);
    let x = x0 + 6 + ((n * 37) % (x1 - x0 - 12));
    // (not in the door of the exit: it would go out at once)
    if (y === EXIT.top + 17 && x >= EXIT.left + 14 && x <= EXIT.left + 38) x = EXIT.left + 4;
    this.spawn(id, x, y, k % 2 ? 1 : -1);
  }

  private iteration(): void {
    const game = this.game;
    const it = game.currentIteration;
    // (a home has no clock, and its skills never run out)
    game.minutes = 99;
    if (it % 17 === 0) for (const sk of SKILLS) game.setSkillCount(SKILL_ACTIONS[sk], 99);
    // (and it never ends: nothing counts as saved or lost)
    game.lemmingsSaved = 0;
    game.lemmingsRemoved = 0;
    // the lemmings gone come back by the trapdoor a moment later
    const ids = new Set(this.cards().map((c) => c.id));
    for (const l of game.lemmingList) if (l.isRemoved && this.cardOf.has(l) && !this.away.has(l)) this.away.set(l, it + 34);
    for (const [l, at] of this.away)
      if (at <= it) {
        const id = this.cardOf.get(l)!;
        this.cardOf.delete(l);
        this.away.delete(l);
        if (ids.has(id)) this.arrivals.push({ id, at: it });
      }
    // the ones to come in: one every 4 frames, once the trapdoor is open
    this.arrivals = this.arrivals.filter((a) => ids.has(a.id));
    const next = this.arrivals.findIndex((a) => a.at <= it);
    if (next >= 0 && it >= 36 && it - this.lastArrival >= 4) {
      const p = game.entrancePoint(0);
      if (p) this.spawn(this.arrivals[next].id, p.x, p.y, 1);
      this.arrivals.splice(next, 1);
      this.lastArrival = it;
    }
  }

  private solid(x: number, y: number): boolean {
    return this.game.hasPixelAt(x, y);
  }

  /** The ground at first: a cave of Dirt (walls, a ceiling, four floors), drawn with a piece of the Dirt set. */
  private buildTerrain(): void {
    const game = this.game;
    const gs = this.session.graphicSet;
    // the texture of the ground: the piece of the set with the most earth in it (a piece is transparent where it is
    // black); where it has none, the earth before it in its row
    const opaque = (b: Bitmap32) => b.bits.reduce((n, px) => n + ((px & 0xffffff) !== 0 ? 1 : 0), 0);
    const tex = gs.terrainBitmaps.filter((b) => b.width >= 16 && b.height >= 16).reduce((a, b) => (opaque(b) > opaque(a) ? b : a));
    const texel = (x: number, y: number) => {
      const row = (y % tex.height) * tex.width;
      for (let k = 0; k < tex.width; k++) {
        const px = tex.bits[row + ((x + tex.width - k) % tex.width)] & 0xffffff;
        if (px) return (px | ALPHA_TERRAIN) >>> 0;
      }
      return (0x8a4f2a | ALPHA_TERRAIN) >>> 0;
    };
    for (const bmp of [game.world, game.targetBitmap])
      for (let y = 0; y < HOME_H; y++) for (let x = 0; x < HOME_W + 2; x++) bmp.bits[y * bmp.width + x] = 0;
    const fill = (x0: number, x1: number, y0: number, y1: number) => {
      for (const bmp of [game.world, game.targetBitmap])
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bmp.bits[y * bmp.width + x] = texel(x, y);
    };
    fill(0, HOME_W - 1, 0, 5); // the ceiling
    fill(0, 7, 0, HOME_H - 1); // the walls
    fill(HOME_W - 8, HOME_W - 1, 0, HOME_H - 1);
    for (const [x0, x1, y] of HOME_FLOORS) fill(x0, x1, y, Math.min(HOME_H - 1, y + (y === 146 ? 13 : 7)));
  }

  private saveTerrain(): string {
    const w = this.game.world;
    const region = new Uint32Array(HOME_W * HOME_H);
    for (let y = 0; y < HOME_H; y++) region.set(w.bits.subarray(y * w.width, y * w.width + HOME_W), y * HOME_W);
    return toBase64(deflateSync(new Uint8Array(region.buffer)));
  }

  private restoreTerrain(data: string): boolean {
    try {
      const bytes = inflateSync(fromBase64(data));
      if (bytes.length !== HOME_W * HOME_H * 4) return false;
      const region = new Uint32Array(bytes.buffer, bytes.byteOffset, HOME_W * HOME_H);
      for (const bmp of [this.game.world, this.game.targetBitmap])
        for (let y = 0; y < HOME_H; y++) bmp.bits.set(region.subarray(y * HOME_W, (y + 1) * HOME_W), y * bmp.width);
      return true;
    } catch {
      return false;
    }
  }
}

/** a bitmap of the home as it is drawn (the game's picture of the home: its ground, objects and lemmings) */
export function homePicture(home: ColonyHome, into: Bitmap32): void {
  const t = home.game.targetBitmap;
  if (into.width !== HOME_W || into.height !== HOME_H) into.setSize(HOME_W, HOME_H);
  for (let y = 0; y < HOME_H; y++) into.bits.set(t.bits.subarray(y * t.width, y * t.width + HOME_W), y * HOME_W);
}
