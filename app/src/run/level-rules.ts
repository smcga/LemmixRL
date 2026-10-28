/**
 * What the Power Cards do inside a level (Lematro): the lemmings of the colony in their colours, the ones that drop in,
 * the order they are saved in, faster lemmings, skills that copy themselves or come back. Everything here runs in the
 * hooks of the game (LemmingGame.onIteration and the others), inside the frames of the game: a rewind or a restart
 * plays the same frames again, so the same things happen again. Its random choices come from the seed of the run, the
 * level and the frame, never from the order things were asked in.
 */
import { Bitmap32, DOM_FIRE, DOM_WATER, type Lemming, LEMMING_MAX_Y, LemmingAction, type LemmingGame } from '../../../engine/src/index.ts';
import { hairOf, type LemmingColor, lemmingPalette, paletteKey, remapColor } from './colors.ts';
import type { JokerDef } from './content.ts';
import { SKILL_ACTIONS, SKILLS } from './skills.ts';
import type { BlindSetup, LemmingCard, RunState } from './state.ts';

/** frames of the game in a second (the clock of the original) */
export const SECOND = 17;
/** Paratroopers and Self Replication: 10 seconds in */
export const TEN_SECONDS = 10 * SECOND;
/** Paratroopers: at most this many drop in */
export const MAX_PARATROOPERS = 20;
/** Final Lap: the last 30 seconds, 5 times as fast */
export const FINAL_LAP_SECONDS = 30;
export const FINAL_LAP_SPEED = 5;
/** Dead Lemmings Jogging Club: every explosion, the walkers 0.2 faster */
export const JOGGING_STEP = 0.2;
/** SplngErr: 0 to 6 lemmings, one every few frames */
const SPLNG_MAX = 6;
const SPLNG_GAP = 6;
/** Full Spectrum: 4 hair colours within 10 seconds */
const SPECTRUM_COLORS = 4;

export interface LevelRulesHost {
  readonly state: RunState;
  card(id: number): LemmingCard | undefined;
  /** the Power Cards as they act (Copycat and Hive Mind as the card they copy) */
  activeJokers(): { d: JokerDef }[];
}

/** a number from 0 to 1 of a text and some numbers (the random choices of a level) */
function hash01(text: string, ...nums: number[]): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  for (const n of nums) {
    h = Math.imul(h ^ (n & 0xffff), 16777619);
    h = Math.imul(h ^ (n >>> 16), 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** the lemming animations in the colours of the lemmings (shared by every game) */
const recoloured = new Map<Bitmap32, Map<string, Bitmap32>>();

/** An animation bitmap of the game in the colours of a lemming (made once for each palette; shared by the home). */
export function recolouredBitmap(card: LemmingCard, bitmap: Bitmap32): Bitmap32 {
  const palette = lemmingPalette(card);
  const key = paletteKey(palette);
  if (!key) return bitmap;
  let byPalette = recoloured.get(bitmap);
  if (!byPalette) recoloured.set(bitmap, (byPalette = new Map()));
  let copy = byPalette.get(key);
  if (!copy) {
    copy = new Bitmap32();
    copy.assign(bitmap);
    for (let p = 0; p < copy.bits.length; p++) copy.bits[p] = remapColor(copy.bits[p], palette);
    byPalette.set(key, copy);
  }
  return copy;
}

/** The Power Cards of a run in one game of a level: attach() sets the hooks of the game. */
export class LevelPlay {
  /** the release index of every lemming that came out of an entrance */
  readonly releaseIndex = new WeakMap<Lemming, number>();
  /** the colony card (id) of every Paratrooper */
  readonly dropIns = new WeakMap<Lemming, number>();
  /** the lemmings saved, in order, with the seconds left when they were */
  exits: { l: Lemming; secondsLeft: number }[] = [];
  /** the Paratroopers that dropped in (their card ids) */
  paratroopers: number[] = [];
  /** Self Replication: the only lemming out 10 seconds in (card id) */
  selfCopy: number | null = null;
  /** what happened (for the notes of the cash out) */
  refunds = 0;
  mirrored = 0;
  splngDrops = 0;

  private explosions = 0;
  private readonly exploded = new WeakSet<Lemming>();
  private splatted = false;
  private pendingDrops = 0;
  private nextDropAt = 0;
  private dropsMade = 0;
  private recent: { it: number; hair: LemmingColor }[] = [];

  constructor(
    private readonly host: LevelRulesHost,
    readonly game: LemmingGame,
  ) {}

  private get setup(): BlindSetup | null {
    return this.host.state.setup;
  }

  private has(f: (d: JokerDef) => unknown): boolean {
    return this.host.activeJokers().some((a) => !!f(a.d));
  }

  /** a random number from 0 to 1, the same in every replay of the level */
  private random(salt: number, n = 0): number {
    const s = this.host.state;
    return hash01(`${s.seed}/${s.setup?.levelId ?? ''}/${s.setup?.blind ?? 0}`, salt, this.game.currentIteration, n);
  }

  /** the card of a lemming: of the squad, a Paratrooper, or none (a lemming that dropped in) */
  cardOf(l: Lemming): LemmingCard | undefined {
    const setup = this.setup;
    if (!setup) return undefined;
    const i = this.releaseIndex.get(l);
    if (i !== undefined) {
      const id = setup.hand[i];
      return id === undefined ? undefined : this.host.card(id);
    }
    const id = this.dropIns.get(l);
    return id === undefined ? undefined : this.host.card(id);
  }

  /** the seconds left on the clock */
  secondsLeft(): number {
    return this.game.minutes * 60 + this.game.seconds;
  }

  /** a new start of the level (a restart or a rewind): what happened in it so far is gone */
  private reset(): void {
    this.exits = [];
    this.paratroopers = [];
    this.selfCopy = null;
    this.refunds = 0;
    this.mirrored = 0;
    this.splngDrops = 0;
    this.explosions = 0;
    this.splatted = false;
    this.pendingDrops = 0;
    this.nextDropAt = 0;
    this.dropsMade = 0;
    this.recent = [];
  }

  /** Sets the hooks of the game. */
  attach(): void {
    const game = this.game;
    game.onLemmingReleased = (l, i) => this.released(l, i);
    game.onLemmingExited = (l) => this.exited(l);
    game.lemmingBitmap = (l, bitmap) => this.bitmap(l, bitmap);
    game.onLemmingAction = (l, action) => this.action(l, action);
    game.onSkillAssigned = this.has((d) => d.mirror) ? (l, skill) => this.mirror(l, skill) : null;
    game.onIteration = () => this.iteration();
    game.lemmingSpeed = this.has((d) => d.finalLap || d.jogging) ? (l) => this.speed(l) : null;
  }

  /** The hooks of a game that is not of a run: the original game. */
  static detach(game: LemmingGame): void {
    game.onLemmingReleased = null;
    game.onLemmingExited = null;
    game.lemmingBitmap = null;
    game.onLemmingAction = null;
    game.onSkillAssigned = null;
    game.onIteration = null;
    game.lemmingSpeed = null;
  }

  /** a lemming out of an entrance: the permanent abilities of its card (and of the Power Cards) */
  private released(l: Lemming, i: number): void {
    const setup = this.setup;
    if (!setup) return;
    this.releaseIndex.set(l, i);
    const card = this.cardOf(l);
    const climber = (card?.climber ?? false) || i < setup.startClimbers;
    const floater = (card?.floater ?? false) || i < setup.startFloaters;
    if (climber || floater) this.game.grantPermanentAbilities(l, climber, floater);
  }

  /** a lemming saved: its place in the order; Full Spectrum */
  private exited(l: Lemming): void {
    this.exits.push({ l, secondsLeft: this.secondsLeft() });
    if (!this.has((d) => d.spectrum)) return;
    const it = this.game.currentIteration;
    const card = this.cardOf(l);
    this.recent.push({ it, hair: card ? hairOf(card) : 'green' });
    this.recent = this.recent.filter((r) => it - r.it <= TEN_SECONDS);
    if (new Set(this.recent.map((r) => r.hair)).size < SPECTRUM_COLORS) return;
    this.recent = [];
    // one of the skills used is available again
    const setup = this.setup!;
    const used = SKILLS.filter((sk) => (this.game.skillCount(SKILL_ACTIONS[sk]) ?? 0) < setup.usable[sk]);
    if (!used.length) return;
    const sk = used[Math.floor(this.random(18) * used.length)];
    const action = SKILL_ACTIONS[sk];
    this.game.setSkillCount(action, (this.game.skillCount(action) ?? 0) + 1);
    this.refunds++;
  }

  /** a lemming in the colours of its card */
  private bitmap(l: Lemming, bitmap: Bitmap32): Bitmap32 {
    const card = this.cardOf(l);
    return card ? recolouredBitmap(card, bitmap) : bitmap;
  }

  /** SplngErr (the first splat), the Dead Lemmings Jogging Club (every explosion) */
  private action(l: Lemming, action: LemmingAction): void {
    if (action === LemmingAction.Splatting && !this.splatted) {
      this.splatted = true;
      if (this.has((d) => d.splngErr)) {
        this.pendingDrops = Math.floor(this.random(24) * (SPLNG_MAX + 1));
        this.nextDropAt = this.game.currentIteration + SPLNG_GAP;
      }
    } else if (action === LemmingAction.Exploding && !this.exploded.has(l)) {
      this.exploded.add(l);
      this.explosions++;
    }
  }

  /** sgnimmeL: the closest other lemming gets the skill too (the closest that can take it) */
  private mirror(l: Lemming, skill: LemmingAction): void {
    const others = this.game.lemmingList
      .filter((o) => o !== l && !o.isRemoved)
      .map((o) => ({ o, d: Math.hypot(o.xPos - l.xPos, o.yPos - l.yPos) }))
      .sort((a, b) => a.d - b.d || a.o.listIndex - b.o.listIndex);
    for (const { o } of others.slice(0, 3))
      if (this.game.assignSkillFree(o, skill)) {
        this.mirrored++;
        return;
      }
  }

  /** how fast a lemming moves: Final Lap, the Dead Lemmings Jogging Club */
  private speed(l: Lemming): number {
    let m = 1;
    if (this.explosions && l.action === LemmingAction.Walking && this.has((d) => d.jogging)) m *= 1 + JOGGING_STEP * this.explosions;
    if (this.secondsLeft() <= FINAL_LAP_SECONDS && this.has((d) => d.finalLap)) m *= FINAL_LAP_SPEED;
    return m;
  }

  /** every frame: a restart, the drops of SplngErr, 10 seconds in (Paratroopers, Self Replication) */
  private iteration(): void {
    const game = this.game;
    const it = game.currentIteration;
    if (it === 1) {
      this.reset();
      // (the first start of the level, then its restarts)
      const setup = this.setup;
      if (setup) setup.starts = (setup.starts ?? 0) + 1;
    }
    if (this.pendingDrops > 0 && it >= this.nextDropAt) {
      const p = game.entrancePoint(this.dropsMade);
      if (p) {
        game.spawnLemming(p.x, p.y);
        this.splngDrops++;
      }
      this.dropsMade++;
      this.pendingDrops--;
      this.nextDropAt = it + SPLNG_GAP;
    }
    if (it === TEN_SECONDS) {
      if (this.has((d) => d.selfReplication)) this.checkSelfCopy();
      if (this.has((d) => d.paratroopers)) this.dropParatroopers();
    }
  }

  private checkSelfCopy(): void {
    const out = this.game.lemmingList.filter((l) => !l.isRemoved);
    this.selfCopy = null;
    const i = out.length === 1 ? this.releaseIndex.get(out[0]) : undefined;
    if (i !== undefined) this.selfCopy = this.setup?.hand[i] ?? null;
  }

  /** Paratroopers: the Floaters of the colony that are not in the squad, across the level */
  private dropParatroopers(): void {
    const setup = this.setup!;
    const squad = new Set(setup.hand);
    const floaters = this.host.state.colony.filter((c) => c.floater && !squad.has(c.id)).slice(0, MAX_PARATROOPERS);
    const game = this.game;
    floaters.forEach((card, n) => {
      const spot = this.landingSpot(n);
      if (!spot) return; // (nowhere to land: it stays at home)
      const l = game.spawnLemming(spot.x, spot.y, this.random(29, n) < 0.5 ? 1 : -1);
      this.dropIns.set(l, card.id);
      game.grantPermanentAbilities(l, card.climber, true);
      this.paratroopers.push(card.id);
    });
  }

  /**
   * A place for a Paratrooper: the first open air from the top of the level (rock above is fine, it drops in below
   * it), with ground under it to land on, and no water, fire or trap on the way down.
   */
  private landingSpot(n: number): { x: number; y: number } | null {
    const game = this.game;
    const unsafe = (x: number, y: number) => {
      const o = game.readObjectMap(x, y);
      return o === DOM_WATER || o === DOM_FIRE || o < 128;
    };
    const air = (x: number, y: number) => {
      for (let k = 0; k < 12; k++) for (const dx of [-2, 0, 2]) if (game.hasPixelAt(x + dx, y + k)) return false;
      return true;
    };
    for (let t = 0; t < 40; t++) {
      const x = 24 + Math.floor(this.random(28, n * 64 + t) * (game.world.width - 48));
      let y = 0;
      while (y < LEMMING_MAX_Y - 24 && !air(x, y)) y++;
      if (y >= LEMMING_MAX_Y - 24) continue;
      const feet = y + 11;
      let g = feet;
      let safe = true;
      while (g < LEMMING_MAX_Y && !game.hasPixelAt(x, g)) {
        if (unsafe(x, g)) safe = false;
        g++;
      }
      if (safe && g < LEMMING_MAX_Y && !unsafe(x, g)) return { x, y: feet };
    }
    return null;
  }
}
