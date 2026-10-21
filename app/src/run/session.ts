/**
 * A roguelike run: Balatro's loop around unchanged Lemmings levels.
 *
 *   ante (8)  = three blinds: small, big and boss, levels from the ante's band of the original 120 levels
 *   abilities = how many of each skill the colony can bring: 60 points spread by the player at the start (at most
 *               20 in a skill), some of them moved to other skills after every boss blind
 *   blind     = a level, played with the original rules; the run only decides the counts it starts with:
 *               lemmings = min(colony size, level lemmings), skills = min(abilities, level allocation)
 *   accepting = the result of an attempt becomes canonical: dead lemmings leave the colony, survivors stay
 *   cash out  = blind reward + rescue bonus + card and joker money + interest, then the shop
 */
import { type Lemming, LEMMING_MAX_Y, LemmingAction, type LemmingGame, type Level, raf_SkillAssignment } from '../../../engine/src/index.ts';
import { clothesOf, COLOR_NAMES, hasHair, LEMMING_COLORS, type LemmingColor, randomColors } from './colors.ts';
import { FINAL_LAP_SECONDS, LevelPlay } from './level-rules.ts';
import { type LevelCatalog, type RunLevel } from './catalog.ts';
import {
  type Edition,
  EDITION_NAMES,
  FATE_TEXTS,
  type Fate,
  isDeath,
  JOKERS,
  jokerDef,
  LEMMING_NAMES,
  type PayoutContext,
  RARITY_WEIGHTS,
  type Rarity,
  TAGS,
  TAROTS,
  tagDef,
  tarotDef,
  PACKS,
  type PackKind,
  type RescueContext,
} from './content.ts';
import { type Rng, RunRandom } from './rng.ts';
import { SKILL_ACTIONS, SKILL_NAMES, SKILLS, type Skill, type SkillCounts, setSkills, totalSkills, zeroSkills } from './skills.ts';
import {
  ABILITY_CAP,
  ANTES,
  type AssignState,
  type AttemptOutcome,
  BOSS_REASSIGN_POINTS,
  BLIND_NAMES,
  BLIND_REWARDS,
  type BlindKind,
  type BlindSetup,
  type BlindState,
  type Cashout,
  HIRE_PRICE,
  JOKER_SLOTS,
  type LemmingCard,
  BOSS_REROLL_PRICE,
  MAX_INTEREST,
  type PayoutLine,
  RUN_VERSION,
  type RunPhase,
  type RunState,
  type ShopOffer,
  START_ABILITY_POINTS,
  START_COLONY,
  START_MONEY,
  TAROT_SLOTS,
  type TarotInstance,
  type PackChoice,
  type PackState,
  type CashoutResult,
  type SpecialTrait,
  type JokerInstance,
  type RescueLine,
} from './state.ts';

/** The level bands of the antes, as positions in the level system (0 = Fun 1 ... 119 = Mayhem 30). */
export const ANTE_BANDS: readonly (readonly [number, number])[] = [
  [0, 23],
  [12, 32],
  [25, 47],
  [40, 62],
  [55, 77],
  [70, 92],
  [85, 107],
  [98, 119],
];

const KINDS: readonly BlindKind[] = ['small', 'big', 'boss'];

/**
 * The rescue requirement of a level, against the original's, round by round: as in Balatro the score to beat grows,
 * and Power Cards (+Rescues, X Rescues) are what makes the later rounds possible (a requirement can be more lemmings
 * than there are).
 */
export const ROUND_SCALE: readonly number[] = [1, 1, 1.1, 1.25, 1.4, 1.6, 1.8, 2];

/**
 * The levels of a band a blind is drawn from: the easier half for Level 1, the middle half for Level 2, the harder half
 * for Level 3. (They overlap, so a level has more than a handful of candidates: thirds gave Level 1 of the first
 * round six levels to come from.) Level 1 stays easier than Level 3.
 */
function blindPart(band: RunLevel[], kind: number): RunLevel[] {
  const q = band.length / 4;
  return band.slice(Math.floor(q * kind), Math.floor(q * (kind + 2)));
}

/** What the blind screen shows about a blind. */
export interface BlindPreview {
  index: number;
  blind: BlindState;
  level: RunLevel;
  reward: number;
  /** the squad: min(colony, level lemmings) */
  squad: number;
  required: number;
  minutes: number;
  /** the original allocation */
  allocation: SkillCounts;
  /** what you would have: min(capability + hires, allocation + above max) */
  usable: SkillCounts;
  aboveMax: SkillCounts;
  /** the colony is too small for the rescue requirement */
  tooFewLemmings: boolean;
  /** lemmings that drop in besides the squad (Power Cards) */
  extra: number;
}

export class RunSession {
  readonly random: RunRandom;

  constructor(
    readonly catalog: LevelCatalog,
    readonly state: RunState,
  ) {
    this.random = new RunRandom(state.seed, state.counters);
  }

  static newRun(catalog: LevelCatalog, seed: string): RunSession {
    const state: RunState = {
      version: RUN_VERSION,
      seed,
      counters: {},
      ante: 1,
      phase: 'assign',
      won: false,
      money: START_MONEY,
      colony: [],
      nextUid: 1,
      capacity: zeroSkills(),
      assign: null,
      jokers: [],
      tarots: [],
      pendingTags: [],
      blinds: [],
      usedLevels: [],
      setup: null,
      outcome: null,
      cashout: null,
      shop: null,
      stats: { blindsWon: 0, skipped: 0, attempts: 0, saved: 0, lost: 0, earned: 0 },
    };
    const run = new RunSession(catalog, state);
    const names = run.random.stream('names');
    for (let i = 0; i < START_COLONY; i++) state.colony.push(run.newCard(names, true));
    run.newAnte();
    // the first decision of the run: the abilities, with the levels of the first ante in view
    run.beginAssignment('start', START_ABILITY_POINTS, 0, 'blinds', []);
    return run;
  }

  /* -------------------------------------------------------------------------------------------- derived */

  get currentBlindIndex(): number {
    return this.state.blinds.findIndex((b) => b.status === 'current');
  }

  get currentBlind(): BlindState | null {
    return this.state.blinds[this.currentBlindIndex] ?? null;
  }

  level(id: string): RunLevel {
    return this.catalog.get(id);
  }

  /** the abilities of the colony plus those of the jokers */
  capability(): SkillCounts {
    const c = { ...this.state.capacity };
    for (const j of this.state.jokers) {
      const d = jokerDef(j.id);
      if (d.capacity) for (const s of SKILLS) c[s] += d.capacity[s] ?? 0;
    }
    return c;
  }

  /** the skills the jokers add above the level maximum (without the random one of the Smuggler) */
  fixedAboveMax(): SkillCounts {
    const c = zeroSkills();
    for (const j of this.state.jokers) {
      const d = jokerDef(j.id);
      if (d.aboveMax) for (const s of SKILLS) c[s] += d.aboveMax[s] ?? 0;
    }
    return c;
  }

  private jokerSum(f: (d: (typeof JOKERS)[number]) => number | undefined): number {
    let n = 0;
    for (const j of this.state.jokers) n += f(jokerDef(j.id)) ?? 0;
    return n;
  }

  hasJoker(id: string): boolean {
    return this.state.jokers.some((j) => j.id === id);
  }

  card(id: number): LemmingCard | undefined {
    return this.state.colony.find((c) => c.id === id);
  }

  specialCards(): LemmingCard[] {
    return this.state.colony.filter((c) => isSpecial(c));
  }

  /** usable = min(capability + hires, allocation + above max) */
  usableSkills(level: RunLevel, aboveMax: SkillCounts, hires: SkillCounts): SkillCounts {
    const cap = this.capability();
    const r = zeroSkills();
    for (const s of SKILLS) r[s] = Math.max(0, Math.min(cap[s] + hires[s], level.skills[s] + aboveMax[s]));
    return r;
  }

  preview(index: number): BlindPreview {
    const blind = this.state.blinds[index];
    const level = this.level(blind.levelId);
    const setup = this.state.setup && this.state.setup.blind === index ? this.refreshSetup(this.state.setup) : null;
    const aboveMax = setup ? setup.aboveMax : this.fixedAboveMax();
    const hires = setup ? setup.hires : zeroSkills();
    const squad = Math.min(this.state.colony.length, level.lemmings);
    const required = setup ? setup.rescue : this.requiredFor(level);
    const extra = this.jokerSum((d) => d.dropsExtra);
    return {
      index,
      blind,
      level,
      reward: BLIND_REWARDS[blind.kind],
      squad,
      extra,
      required,
      minutes: setup ? setup.minutes : level.time + this.jokerSum((d) => d.extraMinutes),
      allocation: level.skills,
      usable: setup ? setup.usable : this.usableSkills(level, aboveMax, hires),
      aboveMax,
      tooFewLemmings: squad + extra < required,
    };
  }

  /** the rescue requirement of a level in this round (ROUND_SCALE; lower with the Inverse Curve) */
  requiredFor(level: RunLevel): number {
    const s = this.state;
    const scale = ROUND_SCALE[Math.min(s.ante, ANTES) - 1] ?? 1;
    const lower = Math.max(0, 1 - this.jokerSum((d) => d.requirementPerLevel) * s.stats.blindsWon);
    return Math.max(1, Math.ceil(level.rescue * scale * lower - 1e-9));
  }

  /** the money can go this far into debt (the Payday Loan) */
  debtLimit(): number {
    return this.jokerSum((d) => d.debt);
  }

  /** can this be paid (with the debt the Power Cards allow) */
  canAfford(price: number): boolean {
    return price <= 0 || this.state.money - price >= -this.debtLimit();
  }

  /* -------------------------------------------------------------------------------------------- antes and blinds */

  private newAnte(): void {
    const s = this.state;
    const rng = this.random.stream('blinds');
    const [lo, hi] = ANTE_BANDS[Math.min(s.ante, ANTES) - 1];
    const band = this.catalog.levels.filter((l) => l.order >= lo && l.order <= hi);
    const tagRng = this.random.stream('tags');
    s.blinds = KINDS.map((kind, k) => {
      const part = blindPart(band, k);
      const level = this.pickLevel(rng, part, band);
      s.usedLevels.push(level.id);
      return { kind, levelId: level.id, tag: kind === 'boss' ? null : tagRng.pick(TAGS).id, status: 'upcoming' };
    });
    s.blinds[0].status = 'current';
    s.bossRerolled = false;
  }

  /** an unused level from the preferred part of the band, else from the band, else the nearest unused level */
  private pickLevel(rng: Rng, part: RunLevel[], band: RunLevel[]): RunLevel {
    const used = new Set(this.state.usedLevels);
    for (const list of [part, band]) {
      const free = list.filter((l) => !used.has(l.id));
      if (free.length) return rng.pick(free);
    }
    const mid = (band[0].order + band[band.length - 1].order) / 2;
    const free = this.catalog.levels.filter((l) => !used.has(l.id));
    const pool = free.length ? free : this.catalog.levels;
    return pool.reduce((a, b) => (Math.abs(b.order - mid) < Math.abs(a.order - mid) ? b : a));
  }

  /** Skip the current (small or big) blind for its tag. */
  skipBlind(): string[] {
    const s = this.state;
    const blind = this.currentBlind;
    if (!blind || blind.kind === 'boss' || s.phase !== 'blinds') return [];
    if (s.setup && (s.setup.blind !== this.currentBlindIndex || s.setup.attempts > 0)) return [];
    s.setup = null;
    blind.status = 'skipped';
    s.stats.skipped++;
    const notes = blind.tag ? this.applyTag(blind.tag) : [];
    this.advanceBlind();
    return notes;
  }

  private advanceBlind(): void {
    const s = this.state;
    const i = s.blinds.findIndex((b) => b.status === 'upcoming');
    if (i >= 0) s.blinds[i].status = 'current';
  }

  /** Director's Cut: the boss of the ante can be rerolled once, before it is played. */
  bossRerollPrice(): number {
    return BOSS_REROLL_PRICE;
  }

  canRerollBoss(): boolean {
    const s = this.state;
    const boss = s.blinds[2];
    if (s.phase !== 'blinds' || !boss || boss.status === 'defeated' || s.bossRerolled || !this.canAfford(BOSS_REROLL_PRICE)) return false;
    // not once the boss is being played
    return !(s.setup && s.setup.blind === 2 && s.setup.attempts > 0);
  }

  rerollBoss(): boolean {
    if (!this.canRerollBoss()) return false;
    const s = this.state;
    s.money -= BOSS_REROLL_PRICE;
    s.bossRerolled = true;
    const [lo, hi] = ANTE_BANDS[Math.min(s.ante, ANTES) - 1];
    const band = this.catalog.levels.filter((l) => l.order >= lo && l.order <= hi);
    const part = blindPart(band, 2);
    const level = this.pickLevel(this.random.stream('boss'), part, band);
    s.usedLevels.push(level.id);
    s.blinds[2].levelId = level.id;
    if (s.setup && s.setup.blind === 2) s.setup = null;
    return true;
  }

  /** Hire a temporary skill for the current blind (up to the level's maximum). */
  /** can the current blind still be skipped (before its first attempt) */
  canSkip(): boolean {
    const s = this.state;
    const blind = this.currentBlind;
    return !!blind && blind.kind !== 'boss' && s.phase === 'blinds' && (!s.setup || s.setup.attempts === 0);
  }

  canHire(skill: Skill): boolean {
    const s = this.state;
    const i = this.currentBlindIndex;
    if (i < 0 || s.phase !== 'blinds' || !this.canAfford(HIRE_PRICE)) return false;
    const p = this.preview(i);
    return p.usable[skill] < p.allocation[skill] + p.aboveMax[skill];
  }

  hire(skill: Skill): boolean {
    if (!this.canHire(skill)) return false;
    const setup = this.ensureSetup();
    this.state.money -= HIRE_PRICE;
    setup.hires[skill]++;
    this.refreshSetup(setup);
    return true;
  }

  /** The counts of a setup follow the jokers you have now (they can be bought and sold before the blind is played). */
  refreshSetup(setup: BlindSetup): BlindSetup {
    const level = this.level(setup.levelId);
    const aboveMax = this.fixedAboveMax();
    if (this.hasJoker('smuggler')) {
      setup.smuggled ??= this.random.stream('smuggler').pick(SKILLS);
      aboveMax[setup.smuggled]++;
    }
    setup.aboveMax = aboveMax;
    setup.usable = this.usableSkills(level, aboveMax, setup.hires);
    // Sneak Attack: three times the skills, above the level maximum
    if (this.state.jokers.some((j) => jokerDef(j.id).sneakAttack)) for (const sk of SKILLS) setup.usable[sk] = Math.min(99, setup.usable[sk] * 3);
    setup.rescue = this.requiredFor(level);
    setup.extra = this.jokerSum((d) => d.dropsExtra);
    setup.minutes = level.time + this.jokerSum((d) => d.extraMinutes);
    setup.startClimbers = this.jokerSum((d) => d.startClimbers);
    setup.startFloaters = this.jokerSum((d) => d.startFloaters);
    return setup;
  }

  /** The setup of the current blind: the squad is drawn when the blind is first played (or a skill is hired). */
  ensureSetup(): BlindSetup {
    const s = this.state;
    const index = this.currentBlindIndex;
    if (s.setup && s.setup.blind === index) return this.refreshSetup(s.setup);
    const blind = s.blinds[index];
    const level = this.level(blind.levelId);
    const ids = this.random.stream('hand').shuffle(s.colony.map((c) => c.id));
    const squad = ids.slice(0, Math.min(ids.length, level.lemmings));
    s.setup = {
      blind: index,
      levelId: level.id,
      hand: squad,
      rescue: level.rescue,
      minutes: level.time,
      usable: zeroSkills(),
      hires: zeroSkills(),
      aboveMax: zeroSkills(),
      startClimbers: 0,
      startFloaters: 0,
      attempts: 0,
    };
    return this.refreshSetup(s.setup);
  }

  /** Play the current blind. */
  startBlind(): BlindSetup {
    const setup = this.ensureSetup();
    if (!setup.begun) {
      setup.begun = true;
      this.levelBegins();
    }
    this.state.phase = 'playing';
    this.state.outcome = null;
    return setup;
  }

  /** The Power Cards that act when a level begins: the Recycling Plant takes the Power Card to its left. */
  private levelBegins(): void {
    const s = this.state;
    const rng = this.random.stream('begin');
    for (let i = 1; i < s.jokers.length; i++) {
      if (!jokerDef(s.jokers[i].id).recycler) continue;
      const [left] = s.jokers.splice(i - 1, 1);
      const skill = rng.pick(SKILLS);
      s.capacity[skill] += jokerSellValue(left);
      i--;
    }
    if (s.setup) this.refreshSetup(s.setup);
  }

  /** The level as the blind plays it: the squad, the skills and the clock of the setup. */
  applyToLevel(level: Level): void {
    const setup = this.state.setup;
    if (!setup) return;
    level.info.lemmingsCount = setup.hand.length + (setup.extra ?? 0);
    // (the level's own count: what it can show; the run's rescue count decides)
    level.info.rescueCount = Math.min(setup.rescue, level.info.lemmingsCount);
    level.info.timeLimit = setup.minutes;
    if (this.state.jokers.some((j) => jokerDef(j.id).sneakAttack)) level.info.releaseRate = 99;
    setSkills(level.info, setup.usable);
  }

  /** the colony card of a release index */
  cardAt(releaseIndex: number): LemmingCard | undefined {
    const id = this.state.setup?.hand[releaseIndex];
    return id === undefined ? undefined : this.card(id);
  }

  /** the Power Cards in the game being played (see attach) */
  private play: LevelPlay | null = null;

  /** Sets the hooks of a game of the current level: the Power Cards of the run act in it (see level-rules.ts). */
  attach(game: LemmingGame): LevelPlay {
    this.play = new LevelPlay(this, game);
    this.play.attach();
    return this.play;
  }

  /** the card of a lemming of the game being played (of the squad, a Paratrooper; none: one that dropped in) */
  cardOfLemming(l: Lemming): LemmingCard | undefined {
    return this.play ? this.play.cardOf(l) : this.cardAt(l.listIndex);
  }

  /** the card of the squad (and the Paratroopers) of an outcome, by its index in the fates */
  squadCard(out: AttemptOutcome, i: number): LemmingCard | undefined {
    const id = (out.squad ?? this.state.setup?.hand ?? [])[i];
    return id === undefined ? undefined : this.card(id);
  }

  /**
   * The rescue count of a level, as Balatro counts a hand: the lemmings saved, then every Power Card from left to right
   * adds its +Rescues and multiplies by its X Rescues.
   */
  rescueCount(order: (LemmingCard | null)[], released: (LemmingCard | null)[], skillsUsed: SkillCounts): { score: number; lines: RescueLine[] } {
    const s = this.state;
    const saved = order.length;
    const lines: RescueLine[] = [{ label: 'Lemmings saved', total: saved }];
    let score = saved;
    const ginger = s.jokers.some((j) => jokerDef(j.id).ginger);
    const base: Omit<RescueContext, 'counter'> = {
      saved,
      savedCards: order.filter((c): c is LemmingCard => !!c),
      order,
      released,
      blockersUsed: skillsUsed.blocker,
      emptySlots: JOKER_SLOTS - s.jokers.length,
      powerCards: s.jokers.length,
      wise: s.colony.filter((c) => c.edition === 'wise').length,
      ginger,
    };
    for (const j of s.jokers) {
      const d = jokerDef(j.id);
      const r = d.rescues?.({ ...base, counter: j.counter ?? 0 });
      if (!r) continue;
      const plus = r.plus ?? 0;
      const times = r.times ?? 1;
      if (plus === 0 && times === 1) continue;
      score = (score + plus) * times;
      lines.push({ label: d.name, ...(plus ? { plus } : {}), ...(times !== 1 ? { times: Math.round(times * 100) / 100 } : {}), total: Math.floor(score + 1e-9) });
    }
    return { score: Math.floor(score + 1e-9), lines };
  }

  /* -------------------------------------------------------------------------------------------- attempts */

  /** The game of the blind has finished: what happened to every lemming of the squad. */
  finishAttempt(game: LemmingGame): AttemptOutcome {
    const s = this.state;
    const setup = s.setup!;
    game.setGameResult();
    const g = game.gameResultRec;
    const bombed = new Set<number>();
    for (const item of game.recorder.list)
      if (item && (item.actionFlags & raf_SkillAssignment) !== 0 && item.assignedSkill === SKILL_ACTIONS.bomber) bombed.add(item.lemmingIndex);
    // the lemmings of the squad (by release index) and the Paratroopers; the others dropped in
    const play = this.play?.game === game ? this.play : null;
    const paratroopers = play?.paratroopers ?? [];
    const squad = [...setup.hand, ...paratroopers];
    const squadIndex = new Map<Lemming, number>();
    for (const l of game.lemmingList) {
      if (!play) {
        if (l.listIndex < setup.hand.length) squadIndex.set(l, l.listIndex);
        continue;
      }
      const r = play.releaseIndex.get(l);
      if (r !== undefined && r < setup.hand.length) squadIndex.set(l, r);
      const p = play.dropIns.get(l);
      if (p !== undefined) squadIndex.set(l, setup.hand.length + paratroopers.indexOf(p));
    }
    const lemmingOf: (Lemming | undefined)[] = squad.map(() => undefined);
    for (const [l, i] of squadIndex) lemmingOf[i] = l;
    const fates: Fate[] = lemmingOf.map((l) => fateOf(l, !!l && bombed.has(l.listIndex), game.isNukedByUser));
    const used = zeroSkills();
    const left = remainingSkills(game);
    for (const sk of SKILLS) used[sk] = Math.max(0, setup.usable[sk] - left[sk]);
    // the lemmings that dropped in besides the squad: saved or not
    const others = game.lemmingList.filter((l) => !squadIndex.has(l));
    const extra = others.length;
    const extraSaved = others.filter((l) => fateOf(l, false, false) === 'saved').length;
    // the saves in their order (the ones the hook missed, at the end): squad indexes, -1 for the others
    const savedLemmings = (play?.exits.map((e) => e.l) ?? []).filter((l) => fateOf(l, false, false) === 'saved');
    for (const l of game.lemmingList) if (!savedLemmings.includes(l) && fateOf(l, false, false) === 'saved') savedLemmings.push(l);
    const exitOrder = savedLemmings.map((l) => squadIndex.get(l) ?? -1);
    const cardOfIndex = (i: number) => (i >= 0 ? (this.card(squad[i]) ?? null) : null);
    const released = game.lemmingList.map((l) => {
      const i = squadIndex.get(l);
      return i === undefined ? null : cardOfIndex(i);
    });
    const { score, lines } = this.rescueCount(exitOrder.map(cardOfIndex), released, used);
    // Final Lap: the Gold lemmings saved in the last 30 seconds
    const lapGold = (play?.exits ?? []).filter((e) => e.secondsLeft <= FINAL_LAP_SECONDS && fateOf(e.l, false, false) === 'saved' && this.squadCardOf(e.l, squadIndex, squad)?.edition === 'gold').length;
    // what happened in the level, for the notes of the cash out
    const events: string[] = [];
    if (play?.refunds) events.push(`Full Spectrum: ${play.refunds} skill${play.refunds === 1 ? '' : 's'} came back.`);
    if (play?.mirrored) events.push(`sgnimmeL: ${play.mirrored} skill${play.mirrored === 1 ? '' : 's'} copied to a neighbour.`);
    if (play?.splngDrops) events.push(`SplngErr: ${play.splngDrops} lemming${play.splngDrops === 1 ? '' : 's'} dropped in.`);
    if (paratroopers.length) events.push(`Paratroopers: ${paratroopers.length} Floater${paratroopers.length === 1 ? '' : 's'} dropped in.`);
    setup.selfCopy = play?.selfCopy ?? null;
    const outcome: AttemptOutcome = {
      success: score >= setup.rescue && !g.cheated,
      score,
      scoring: lines,
      extra,
      extraSaved,
      exitOrder,
      squad,
      lapGold,
      events,
      rescued: fates.filter((f) => f === 'saved').length,
      required: setup.rescue,
      hand: squad.length,
      fates,
      skillsUsed: used,
      secondsLeft: game.minutes * 60 + game.seconds,
      timeUp: g.timeIsUp,
      nuked: game.isNukedByUser,
      done: g.done,
      target: g.target,
    };
    setup.attempts++;
    s.stats.attempts++;
    s.outcome = outcome;
    // a level that is not won ends the run (in the level it can be restarted, as often as you like)
    if (outcome.success) s.phase = 'result';
    else this.giveUp();
    return outcome;
  }

  private squadCardOf(l: Lemming, squadIndex: Map<Lemming, number>, squad: number[]): LemmingCard | undefined {
    const i = squadIndex.get(l);
    return i === undefined ? undefined : this.card(squad[i]);
  }

  /** Back from the level without a result (the attempt does not count). */
  abandonAttempt(): void {
    if (this.state.phase === 'playing') this.state.phase = 'blinds';
  }

  /** Give up the run (or a level was not won). */
  giveUp(): void {
    this.state.phase = 'over';
    this.state.won = false;
  }

  /** The result of the last attempt becomes canonical: the colony changes and the blind pays out. */
  accept(): Cashout {
    const s = this.state;
    const setup = s.setup!;
    const out = s.outcome!;
    if (!out.success) throw new Error('only a successful attempt can be accepted');
    const blind = s.blinds[setup.blind];
    const rng = this.random.stream('cashout');
    const lines: PayoutLine[] = [];
    const notes: string[] = [];

    // the level as it went, shown with the cash out (before the lost lemmings leave the colony)
    const deathCounts = new Map<Fate, number>();
    for (const f of out.fates) if (isDeath(f)) deathCounts.set(f, (deathCounts.get(f) ?? 0) + 1);
    const result: CashoutResult = {
      score: out.score,
      scoring: out.scoring,
      rescued: out.rescued + (out.extraSaved ?? 0),
      hand: out.hand + (out.extra ?? 0),
      required: out.required,
      lost: out.fates.filter(isDeath).length,
      deaths: [...deathCounts].map(([f, n]) => `${n} ${FATE_TEXTS[f]}`).join(', '),
      specials: (out.squad ?? setup.hand).flatMap((id, i) => {
        const c = this.card(id);
        return c && isSpecial(c) ? [{ title: cardTitle(c), edition: c.edition, fate: out.fates[i] }] : [];
      }),
    };

    // the colony
    const returns = new Set<Fate>();
    for (const j of s.jokers) for (const f of jokerDef(j.id).returns ?? []) returns.add(f);
    const deadIdx = out.fates.map((f, i) => (isDeath(f) ? i : -1)).filter((i) => i >= 0);
    let hardHat = this.hasJoker('hardhat');
    let respawns = this.jokerSum((d) => d.respawns);
    const respawnClothes = new Set(s.jokers.map((j) => jokerDef(j.id).respawnClothes).filter((c): c is LemmingColor => !!c));
    const exploded = new Set<Fate>(['bombed', 'exploded', 'nuked']);
    // the hard hat saves the most valuable lemming
    const value = (c: LemmingCard | undefined) => (c ? (c.edition !== 'plain' ? 4 : 0) + (c.climber ? 1 : 0) + (c.floater ? 1 : 0) + (c.insured ? -2 : 0) : 0);
    deadIdx.sort((a, b) => value(this.squadCard(out, b)) - value(this.squadCard(out, a)));
    const lost = new Set<number>();
    for (const i of deadIdx) {
      const card = this.squadCard(out, i);
      if (!card) continue;
      const f = out.fates[i];
      const who = cardTitle(card);
      if (returns.has(f)) notes.push(`${who} ${FATE_TEXTS[f]} but came back.`);
      else if (exploded.has(f) && respawnClothes.has(clothesOf(card))) notes.push(`${who} ${FATE_TEXTS[f]}, and respawned (Blue Bombers).`);
      else if (respawns > 0) {
        respawns--;
        notes.push(`${who} ${FATE_TEXTS[f]}, and respawned.`);
      } else if (card.insured) {
        card.insured = false;
        notes.push(`${who} ${FATE_TEXTS[f]}; the insurance brought it back.`);
      } else if (hardHat) {
        hardHat = false;
        notes.push(`${who} ${FATE_TEXTS[f]}; the Hard Hat saved it.`);
      } else {
        lost.add(card.id);
        if (isSpecial(card)) notes.push(`${who} ${FATE_TEXTS[f]}. Lost!`);
      }
    }
    if (lost.size) {
      s.colony = s.colony.filter((c) => !lost.has(c.id));
      notes.unshift(`${lost.size} lemming${lost.size === 1 ? '' : 's'} lost for good.`);
    }
    s.stats.lost += lost.size;
    s.stats.saved += out.rescued;

    // the blind
    lines.push({ label: `${BLIND_NAMES[blind.kind]} done`, amount: BLIND_REWARDS[blind.kind] });
    const score = out.score ?? out.rescued;
    if (score > out.required) {
      // (from the requirement to all the lemmings, as before; Power Cards can take it above that)
      const room = Math.max(1, out.hand + (out.extra ?? 0) - out.required, Math.ceil(out.required / 4));
      const bonus = Math.min(8, Math.floor((4 * (score - out.required)) / room + 1e-9));
      // champions that reached the exit multiply it
      const champions = out.fates.filter((f, i) => f === 'saved' && this.squadCard(out, i)?.edition === 'champion').length;
      if (bonus > 0) lines.push({ label: `Rescue bonus (${percentOf(out.rescued, out.hand)}%)${champions ? ` x${champions + 1}` : ''}`, amount: bonus * (champions + 1) });
    }
    const perfect = out.rescued === out.hand;
    if (perfect) lines.push({ label: 'Perfect rescue', amount: 2 });

    // the cards that reached the exit
    let gold = 0;
    const mentorSkill = mostUsed(out.skillsUsed, rng);
    for (let i = 0; i < out.fates.length; i++) {
      if (out.fates[i] !== 'saved') continue;
      const card = this.squadCard(out, i);
      if (!card) continue;
      card.saves++;
      if (card.edition === 'gold') gold++;
      else if (card.edition === 'lucky') {
        if (rng.chance(1 / 3)) lines.push({ label: `Lucky ${card.name}`, amount: 4 });
        if (rng.chance(1 / 5) && s.tarots.length < TAROT_SLOTS) {
          const t = this.newTarot(rng);
          s.tarots.push(t);
          notes.push(`Lucky ${card.name} found ${tarotDef(t.id).name}.`);
        }
      } else if (card.edition === 'mentor') {
        s.capacity[mentorSkill]++;
        notes.push(`Mentor ${card.name} trained a ${SKILL_NAMES[mentorSkill]} (+1 ability).`);
      }
    }
    if (gold > 0) lines.push({ label: `Gold lemmings (${gold})`, amount: 2 * gold });

    // the jokers
    const ctx: PayoutContext = {
      hand: out.hand,
      required: out.required,
      rescued: out.rescued,
      perfect,
      secondsLeft: out.secondsLeft,
      skillsUsed: totalSkills(out.skillsUsed),
      skillsAvailable: totalSkills(setup.usable),
      colonySize: s.colony.length,
    };
    for (const j of s.jokers) {
      const d = jokerDef(j.id);
      const n = d.payout ? d.payout(ctx) : 0;
      if (n > 0) lines.push({ label: d.name, amount: n });
    }

    // what happened in the level, then the Power Cards that act after a level
    notes.push(...(out.events ?? []));
    this.afterLevel(out, setup, lines, notes, rng);

    // boss tags
    if (blind.kind === 'boss') {
      if (this.takePendingTag('golden')) {
        const sum = lines.reduce((a, l) => a + l.amount, 0);
        lines.push({ label: 'Golden Exit', amount: sum });
      }
      if (this.takePendingTag('investment')) lines.push({ label: 'Investment Bonus', amount: 10 });
    }

    // interest on the money you had
    const interest = Math.min(Math.max(0, Math.floor(s.money / 5)), MAX_INTEREST + this.jokerSum((d) => d.interestCap));
    if (interest > 0) lines.push({ label: `Interest ($1 per $5)`, amount: interest });

    // after the blind
    const recruits = this.jokerSum((d) => d.recruitsAfterBlind);
    if (recruits > 0) {
      this.recruit(recruits);
      notes.push(`${recruits} lemmings joined the colony (Talent Scout).`);
    }

    blind.status = 'defeated';
    s.stats.blindsWon++;
    const total = lines.reduce((a, l) => a + l.amount, 0);
    s.cashout = { lines, total, notes, result };
    s.phase = 'cashout';
    return s.cashout;
  }

  /** What the Power Cards do after a level (accept): money, lemmings that join or leave, sell value, being destroyed. */
  private afterLevel(out: AttemptOutcome, setup: BlindSetup, lines: PayoutLine[], notes: string[], rng: Rng): void {
    const s = this.state;
    const names = this.random.stream('names');
    const colors = this.random.stream('colors');
    const saved: LemmingCard[] = [];
    for (const i of out.exitOrder ?? []) {
      const c = i >= 0 ? this.squadCard(out, i) : undefined;
      if (c) saved.push(c);
    }
    const ginger = s.jokers.some((j) => jokerDef(j.id).ginger);
    const join = (make: (c: LemmingCard) => void) => {
      const c = this.newCard(names);
      make(c);
      s.colony.push(c);
      return c;
    };
    for (const j of [...s.jokers]) {
      const d = jokerDef(j.id);
      if (d.joinsAfterLevel) {
        const c = join((c) => (c[d.joinsAfterLevel!] = true));
        notes.push(`${c.name} the ${d.joinsAfterLevel === 'climber' ? 'Climber' : 'Floater'} joined the colony (${d.name}).`);
      }
      if (d.splatValue) {
        const splats = out.fates.filter((f) => f === 'splat').length;
        if (splats) {
          j.sellBonus = (j.sellBonus ?? 0) + d.splatValue * splats;
          notes.push(`${d.name}: +$${d.splatValue * splats} of sell value.`);
        }
      }
      switch (d.afterLevel) {
        case 'wasteNot': {
          const left = SKILLS.filter((sk) => setup.usable[sk] > 0 && out.skillsUsed[sk] >= setup.usable[sk]).length;
          let n = 0;
          for (let k = 0; k < left; k++) if (rng.chance(0.5)) n++;
          if (n) lines.push({ label: d.name, amount: n });
          break;
        }
        case 'rainyDay': {
          const floaters = setup.hand.filter((id, i) => out.fates[i] !== 'unreleased' && (this.card(id)?.floater || i < setup.startFloaters)).length;
          let n = 0;
          for (let k = 0; k < floaters; k++) if (rng.chance(0.5)) n++;
          if (n) lines.push({ label: d.name, amount: n });
          break;
        }
        case 'marmalade': {
          const n = saved.filter((c) => hasHair(c, 'orange', ginger)).length;
          if (n) lines.push({ label: d.name, amount: n });
          break;
        }
        case 'purpleRain': {
          const n = 2 * saved.filter((c) => hasHair(c, 'purple', ginger)).length;
          for (let k = 0; k < n; k++)
            join((c) => {
              c.hair = 'purple';
              c.clothes = randomColors(colors).clothes;
            });
          if (n) notes.push(`${n} lemmings with Purple hair joined the colony (${d.name}).`);
          break;
        }
        case 'checklist': {
          const color = j.color ?? 'red';
          const n = saved.filter((c) => clothesOf(c) === color).length;
          if (n) lines.push({ label: `${d.name} (${COLOR_NAMES[color]})`, amount: n });
          j.color = colors.pick(LEMMING_COLORS.filter((c) => c !== color));
          break;
        }
        case 'purpleBoost':
          for (const c of saved)
            if (hasHair(c, 'purple', ginger) && s.tarots.length < TAROT_SLOTS && rng.chance(1 / 4)) {
              const t = this.newTarot(rng);
              s.tarots.push(t);
              notes.push(`${c.name} found ${tarotDef(t.id).name} (${d.name}).`);
            }
          break;
        case 'finalLap':
          if (out.lapGold) lines.push({ label: `${d.name} (${out.lapGold} Gold)`, amount: 5 * out.lapGold });
          break;
        case 'changeling': {
          const first = saved[0];
          if (first && (out.exitOrder ?? [])[0] >= 0 && first === this.squadCard(out, out.exitOrder![0]) && clothesOf(first) === 'purple') {
            s.colony = s.colony.filter((c) => c.id !== first.id);
            const c = join((c) => randomSpecial(c, colors));
            notes.push(`${first.name} left the colony; ${cardTitle(c)} joined (${d.name}).`);
          }
          break;
        }
      }
      if (d.selfReplication && setup.selfCopy != null) {
        const original = this.card(setup.selfCopy);
        if (original) {
          s.colony.push({ ...original, id: this.uid(), name: original.name + ' II', saves: 0 });
          notes.push(`${original.name} was the only one out: a copy joined the colony (${d.name}).`);
        }
      }
      if (d.destroyChance && rng.chance(d.destroyChance)) {
        s.jokers = s.jokers.filter((x) => x.uid !== j.uid);
        notes.push(`${d.name} was destroyed.`);
      }
    }
  }

  /** The Trainings used count on the Gym Membership. */
  private noteTraining(): void {
    for (const j of this.state.jokers) if (jokerDef(j.id).countsTraining) j.counter = (j.counter ?? 0) + 1;
  }

  /** Take the money; on to the shop (or the end of the run). */
  cashOut(): void {
    const s = this.state;
    if (s.phase !== 'cashout' || !s.cashout) return;
    s.money += s.cashout.total;
    s.stats.earned += s.cashout.total;
    const wasBoss = s.blinds[s.setup?.blind ?? 0]?.kind === 'boss';
    s.setup = null;
    s.outcome = null;
    s.cashout = null;
    if (wasBoss && s.ante >= ANTES) {
      s.phase = 'over';
      s.won = true;
      return;
    }
    if (wasBoss) {
      // the next ante is drawn now: its levels are in view while the abilities are assigned again, before the shop
      s.ante++;
      this.newAnte();
      const sources: string[] = [];
      let points = 0;
      let reassign = BOSS_REASSIGN_POINTS;
      for (const j of s.jokers) {
        const d = jokerDef(j.id);
        if (d.pointsAfterBoss) {
          points += d.pointsAfterBoss;
          sources.push(`${d.name}: +${d.pointsAfterBoss} points`);
        }
        if (d.reassignAfterBoss) {
          reassign += d.reassignAfterBoss;
          sources.push(`${d.name}: ${d.reassignAfterBoss} more to move`);
        }
      }
      this.beginAssignment('boss', points, reassign, 'shop', sources);
      return;
    }
    this.openShop();
  }

  /** Leave the shop: the next blind, or the first blind of the next ante (drawn after the boss). */
  nextRound(): void {
    const s = this.state;
    if (s.phase !== 'shop') return;
    s.shop = null;
    if (this.currentBlindIndex < 0) {
      // (a run saved in the shop after a boss before the ante was drawn at the cash out)
      if (s.blinds.every((b) => b.status === 'defeated' || b.status === 'skipped')) {
        s.ante++;
        this.newAnte();
      } else this.advanceBlind();
    }
    s.phase = 'blinds';
    if (s.colony.length === 0) {
      s.phase = 'over';
      s.won = false;
    }
  }

  /* -------------------------------------------------------------------------------------------- ability assignment */

  /** Starts an ability assignment; when it is done the run goes on with the phase `next`. */
  private beginAssignment(reason: AssignState['reason'], newPoints: number, reassign: number, next: RunPhase, sources: string[]): void {
    const s = this.state;
    s.assign = { reason, before: { ...s.capacity }, newPoints, reassign, next, sources };
    s.phase = 'assign';
  }

  /** The assignment going on: points moved (taken from the skills they were in), added, and still to place. */
  assignment(): { moved: number; added: number; left: number } | null {
    const s = this.state;
    const a = s.assign;
    if (!a || s.phase !== 'assign') return null;
    let moved = 0;
    let added = 0;
    for (const sk of SKILLS) {
      const d = s.capacity[sk] - a.before[sk];
      if (d > 0) added += d;
      else moved -= d;
    }
    return { moved, added, left: a.newPoints + moved - added };
  }

  /**
   * The values a skill can have in the assignment going on: down as far as the points that may still be moved allow,
   * up as far as the points to place and the cap (ABILITY_CAP, or more when the skill already had more) allow.
   */
  abilityRange(skill: Skill): { min: number; max: number } {
    const s = this.state;
    const a = s.assign;
    const st = this.assignment();
    const cur = s.capacity[skill];
    if (!a || !st) return { min: cur, max: cur };
    const movedElsewhere = st.moved - Math.max(0, a.before[skill] - cur);
    const min = Math.max(0, a.before[skill] - (a.reassign - movedElsewhere));
    const max = Math.min(Math.max(ABILITY_CAP, a.before[skill]), cur + st.left);
    return { min: Math.min(min, cur), max: Math.max(max, cur) };
  }

  /** Sets a skill's ability in the assignment going on (kept within abilityRange). Returns whether it changed. */
  setAbility(skill: Skill, value: number): boolean {
    const s = this.state;
    if (s.phase !== 'assign') return false;
    const { min, max } = this.abilityRange(skill);
    const v = Math.max(min, Math.min(max, Math.round(value)));
    if (v === s.capacity[skill]) return false;
    s.capacity[skill] = v;
    if (s.setup) this.refreshSetup(s.setup);
    return true;
  }

  /** Back to the abilities the assignment began with. */
  resetAssignment(): void {
    const s = this.state;
    if (s.phase !== 'assign' || !s.assign) return;
    s.capacity = { ...s.assign.before };
    if (s.setup) this.refreshSetup(s.setup);
  }

  /** Every point is placed (or no skill can take another one). */
  canFinishAssignment(): boolean {
    const st = this.assignment();
    if (!st) return false;
    return st.left === 0 || SKILLS.every((sk) => this.abilityRange(sk).max <= this.state.capacity[sk]);
  }

  /**
   * Auto pick: a best guess at the assignment going on. A point is worth what it lets the levels of the round still to
   * be played bring (Level 3 counts most); points no level of the round can use go to the skills most levels need,
   * spread out. New points are placed first; then points are moved while that brings more than it costs.
   */
  autoAssign(): boolean {
    const s = this.state;
    const a = s.assign;
    if (s.phase !== 'assign' || !a) return false;
    this.resetAssignment();
    const levels = s.blinds.filter((b) => b.status !== 'defeated' && b.status !== 'skipped').map((b) => ({ level: this.level(b.levelId), weight: AUTO_WEIGHTS[b.kind] }));
    const aboveMax = this.fixedAboveMax();
    const fromJokers = zeroSkills();
    const cap = this.capability();
    for (const sk of SKILLS) fromJokers[sk] = cap[sk] - s.capacity[sk];
    // the worth of the point that makes a skill `value`
    const worth = (sk: Skill, value: number) => {
      let w = 0;
      for (const { level, weight } of levels) if (value + fromJokers[sk] <= level.skills[sk] + aboveMax[sk]) w += weight;
      return w * 10 + AUTO_IMPORTANCE[sk] / (value + 1);
    };
    const best = (except?: Skill): Skill | null => {
      let pick: Skill | null = null;
      let most = -1;
      for (const sk of SKILLS) {
        const cur = s.capacity[sk];
        if (sk === except || this.abilityRange(sk).max <= cur) continue;
        const w = worth(sk, cur + 1);
        if (w > most) {
          most = w;
          pick = sk;
        }
      }
      return pick;
    };
    // the new points
    for (let sk = best(); sk && this.assignment()!.left > 0; sk = best()) this.setAbility(sk, s.capacity[sk] + 1);
    // moving points: the one that is worth least goes where a point is worth most
    for (let n = 0; n < a.reassign; n++) {
      let from: Skill | null = null;
      let least = Infinity;
      for (const sk of SKILLS) {
        const cur = s.capacity[sk];
        if (cur === 0 || this.abilityRange(sk).min >= cur) continue;
        const w = worth(sk, cur);
        if (w < least) {
          least = w;
          from = sk;
        }
      }
      if (!from) break;
      const was = s.capacity[from];
      this.setAbility(from, was - 1);
      const to = best(from);
      if (!to || worth(to, s.capacity[to] + 1) <= least + 1e-9) {
        this.setAbility(from, was);
        break;
      }
      this.setAbility(to, s.capacity[to] + 1);
    }
    return true;
  }

  finishAssignment(): boolean {
    const s = this.state;
    if (!this.canFinishAssignment()) return false;
    const next = s.assign!.next;
    s.assign = null;
    // after a boss: the shop of the new ante; after a tarot: back where it was used (the same shop)
    if (next === 'shop' && !s.shop) this.openShop();
    else s.phase = next;
    return true;
  }

  /* -------------------------------------------------------------------------------------------- the shop */

  private openShop(): void {
    const s = this.state;
    const rng = this.random.stream('shop');
    const free = this.takePendingTag('coupon');
    const extra = this.takePendingTag('supply') ? 2 : 0;
    const offers: ShopOffer[] = [];
    for (let i = 0; i < 3; i++) offers.push(this.newOffer(rng, offers));
    for (let i = 0; i < extra; i++) offers.push(this.newTraining(rng));
    if (free) for (const o of offers) o.price = 0;
    // two packs, as in Balatro: a Lemmings Pack (the colony has to grow somewhere), and one of the others
    const other = rng.pickWeighted(['training', 'boost', 'gadget'] as PackKind[], [40, 35, 25]);
    const packs = (['lemmings', other] as PackKind[]).map((kind): ShopOffer => ({ uid: this.uid(), type: 'pack', id: kind, price: PACKS[kind].price, sold: false }));
    s.shop = { offers, packs, rerolls: 0, freeRerolls: this.jokerSum((d) => d.freeRerolls) };
    s.phase = 'shop';
  }

  rerollPrice(): number {
    if ((this.state.shop?.freeRerolls ?? 0) > 0) return 0;
    return 2 + (this.state.shop?.rerolls ?? 0);
  }

  reroll(): boolean {
    const s = this.state;
    const shop = s.shop;
    if (!shop || !this.canAfford(this.rerollPrice())) return false;
    if ((shop.freeRerolls ?? 0) > 0) shop.freeRerolls!--;
    else {
      s.money -= this.rerollPrice();
      shop.rerolls++;
    }
    const rng = this.random.stream('shop');
    const offers: ShopOffer[] = [];
    for (let i = 0; i < 3; i++) offers.push(this.newOffer(rng, offers));
    shop.offers = offers;
    return true;
  }

  private newOffer(rng: Rng, others: ShopOffer[]): ShopOffer {
    const type = rng.pickWeighted(['joker', 'tarot', 'training'] as const, [40, 30, 30]);
    if (type === 'joker') {
      const owned = new Set([...this.state.jokers.map((j) => j.id), ...others.filter((o) => o.type === 'joker').map((o) => o.id)]);
      const rarity = rng.pickWeighted(['common', 'uncommon', 'rare'] as Rarity[], [RARITY_WEIGHTS.common, RARITY_WEIGHTS.uncommon, RARITY_WEIGHTS.rare]);
      let pool = JOKERS.filter((j) => j.rarity === rarity && !owned.has(j.id));
      if (!pool.length) pool = JOKERS.filter((j) => !owned.has(j.id));
      if (pool.length) {
        const d = rng.pick(pool);
        return { uid: this.uid(), type: 'joker', id: d.id, price: d.price, sold: false };
      }
    }
    if (type === 'tarot') {
      const t = this.newTarot(rng);
      return { uid: this.uid(), type: 'tarot', id: t.id, skill: t.skill, price: tarotDef(t.id).price, sold: false };
    }
    return this.newTraining(rng);
  }

  private newTraining(rng: Rng): ShopOffer {
    const skill = rng.pick(SKILLS);
    if (rng.chance(0.25)) return { uid: this.uid(), type: 'drive', id: 'drive', skill, amount: 5, price: 7, sold: false };
    return { uid: this.uid(), type: 'training', id: 'training', skill, amount: 3, price: 4, sold: false };
  }

  private newTarot(rng: Rng): { uid: number; id: string; skill?: Skill } {
    const d = rng.pick(TAROTS);
    return { uid: this.uid(), id: d.id, skill: d.id === 'manual' ? rng.pick(SKILLS) : undefined };
  }

  canBuy(offer: ShopOffer): boolean {
    const s = this.state;
    if (offer.sold || !this.canAfford(offer.price)) return false;
    if (offer.type === 'joker') return s.jokers.length < JOKER_SLOTS;
    if (offer.type === 'tarot') return s.tarots.length < TAROT_SLOTS;
    return true;
  }

  /** an offer of the shop, also a pack */
  private offer(uid: number): ShopOffer | undefined {
    const shop = this.state.shop;
    return shop?.offers.find((o) => o.uid === uid) ?? shop?.packs?.find((o) => o.uid === uid);
  }

  buy(uid: number): boolean {
    const s = this.state;
    const offer = this.offer(uid);
    if (!offer || !this.canBuy(offer) || s.phase !== 'shop') return false;
    s.money -= offer.price;
    offer.sold = true;
    switch (offer.type) {
      case 'pack':
        // opened at once: one of its cards is chosen (or none)
        s.pack = { kind: offer.id as PackKind, choices: this.packChoices(offer.id as PackKind) };
        s.phase = 'pack';
        break;
      case 'joker':
        s.jokers.push(this.newJoker(offer.id));
        break;
      case 'tarot':
        s.tarots.push({ uid: this.uid(), id: offer.id, skill: offer.skill });
        break;
      case 'training':
        s.capacity[offer.skill!] += offer.amount!;
        this.noteTraining();
        break;
      case 'drive':
        this.recruit(offer.amount!);
        s.capacity[offer.skill!] += offer.amount!;
        break;
    }
    return true;
  }

  /* -------------------------------------------------------------------------------------------- packs */

  /** the cards of a pack: different ones */
  private packChoices(kind: PackKind): PackChoice[] {
    const rng = this.random.stream('pack');
    const n = PACKS[kind].size;
    const out: PackChoice[] = [];
    const seen = new Set<string>();
    for (let tries = 0; out.length < n && tries < 100; tries++) {
      const c = this.packChoice(kind, rng, out);
      if (!c) break;
      const key = JSON.stringify(c.type === 'ability' ? { t: c.type, s: c.skill } : c);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }

  private packChoice(kind: PackKind, rng: Rng, others: PackChoice[]): PackChoice | null {
    switch (kind) {
      case 'lemmings': {
        const pool: [PackChoice, number][] = [
          [{ type: 'recruits', amount: 5 }, 30],
          [{ type: 'recruits', amount: 8 }, 10],
          [{ type: 'specials', amount: 2, trait: 'floater' }, 12],
          [{ type: 'specials', amount: 2, trait: 'climber' }, 12],
          [{ type: 'specials', amount: 1, trait: 'athlete' }, 6],
          [{ type: 'specials', amount: 1, trait: 'gold' }, 8],
          [{ type: 'specials', amount: 1, trait: 'lucky' }, 8],
          [{ type: 'specials', amount: 1, trait: 'mentor' }, 6],
          [{ type: 'specials', amount: 1, trait: 'champion' }, 4],
          [{ type: 'specials', amount: 3, trait: 'insured' }, 8],
          [{ type: 'specials', amount: 1, trait: 'wise' }, 6],
        ];
        return rng.pickWeighted(
          pool.map(([c]) => c),
          pool.map(([, w]) => w),
        );
      }
      case 'training': {
        const skill = rng.pick(SKILLS);
        const kindOf = rng.pickWeighted(['plus', 'trade', 'all'] as const, [55, 33, 12]);
        if (kindOf === 'all' && !others.some((o) => o.type === 'allSkills')) return { type: 'allSkills', amount: 1 };
        if (kindOf === 'trade') {
          const minus = rng.pick(SKILLS.filter((sk) => sk !== skill));
          return { type: 'ability', skill, amount: 5, minus, minusAmount: 3 };
        }
        return { type: 'ability', skill, amount: 3 };
      }
      case 'boost': {
        const t = this.newTarot(rng);
        return { type: 'tarot', id: t.id, skill: t.skill };
      }
      case 'gadget': {
        const owned = new Set([...this.state.jokers.map((j) => j.id), ...others.map((o) => (o.type === 'joker' ? o.id : ''))]);
        const rarity = rng.pickWeighted(['common', 'uncommon', 'rare'] as Rarity[], [RARITY_WEIGHTS.common, RARITY_WEIGHTS.uncommon, RARITY_WEIGHTS.rare]);
        let pool = JOKERS.filter((j) => j.rarity === rarity && !owned.has(j.id));
        if (!pool.length) pool = JOKERS.filter((j) => !owned.has(j.id));
        return pool.length ? { type: 'joker', id: rng.pick(pool).id } : null;
      }
    }
  }

  /** can this card of the open pack be chosen (a gadget needs room; a boost that wants lemmings, some) */
  canChoose(index: number): boolean {
    const s = this.state;
    const c = s.pack?.choices[index];
    if (!c || s.phase !== 'pack') return false;
    if (c.type === 'joker') return s.jokers.length < JOKER_SLOTS;
    return true;
  }

  /** Takes a card of the open pack; back to the shop. Returns what happened, or null when it cannot be taken. */
  choosePack(index: number, selected: number[] = []): string[] | null {
    const s = this.state;
    const pack = s.pack;
    if (!pack || !this.canChoose(index)) return null;
    const c = pack.choices[index];
    // (the shop comes back first: a boost that opens the ability assignment goes back to the shop)
    s.pack = null;
    s.phase = 'shop';
    const notes = this.applyChoice(c, selected);
    if (!notes) {
      s.pack = pack;
      s.phase = 'pack';
    }
    return notes;
  }

  /** Leaves the open pack without taking anything. */
  skipPack(): void {
    const s = this.state;
    if (s.phase !== 'pack') return;
    s.pack = null;
    s.phase = 'shop';
  }

  private applyChoice(c: PackChoice, selected: number[]): string[] | null {
    const s = this.state;
    switch (c.type) {
      case 'recruits':
        this.recruit(c.amount);
        return [`${c.amount} lemmings joined the colony.`];
      case 'specials': {
        const names = this.random.stream('names');
        const joined: LemmingCard[] = [];
        for (let i = 0; i < c.amount; i++) {
          const card = this.newCard(names);
          applyTrait(card, c.trait);
          s.colony.push(card);
          joined.push(card);
        }
        return [`${joined.map(cardTitle).join(', ')} joined the colony.`];
      }
      case 'ability': {
        this.noteTraining();
        s.capacity[c.skill] += c.amount;
        if (c.minus) s.capacity[c.minus] = Math.max(0, s.capacity[c.minus] - (c.minusAmount ?? 0));
        if (s.setup) this.refreshSetup(s.setup);
        return [`+${c.amount} ${SKILL_NAMES[c.skill]} ability${c.minus ? `, -${c.minusAmount} ${SKILL_NAMES[c.minus]}` : ''}.`];
      }
      case 'allSkills':
        this.noteTraining();
        for (const sk of SKILLS) s.capacity[sk] += c.amount;
        if (s.setup) this.refreshSetup(s.setup);
        return [`+${c.amount} ability in every skill.`];
      case 'joker':
        if (s.jokers.length >= JOKER_SLOTS) return null;
        s.jokers.push(this.newJoker(c.id));
        return [`${jokerDef(c.id).name} joined your Power Cards.`];
      case 'tarot': {
        const tarot: TarotInstance = { uid: this.uid(), id: c.id, skill: c.skill };
        s.tarots.push(tarot);
        const notes = this.useTarot(tarot.uid, selected);
        if (!notes) s.tarots.pop();
        return notes;
      }
    }
  }

  sellJoker(uid: number): boolean {
    const s = this.state;
    const i = s.jokers.findIndex((j) => j.uid === uid);
    if (i < 0) return false;
    s.money += jokerSellValue(s.jokers[i]);
    s.jokers.splice(i, 1);
    if (s.setup) this.refreshSetup(s.setup);
    return true;
  }

  /** Puts a joker at another place in the row (the order is the player's; it does not change what they do). */
  moveJoker(uid: number, index: number): boolean {
    const jokers = this.state.jokers;
    const i = jokers.findIndex((j) => j.uid === uid);
    const to = Math.max(0, Math.min(jokers.length - 1, index));
    if (i < 0 || i === to) return false;
    const [j] = jokers.splice(i, 1);
    jokers.splice(to, 0, j);
    return true;
  }

  /** A tarot can be sold wherever it can be used (not while a level is played or the abilities are assigned). */
  canSellTarot(): boolean {
    const p = this.state.phase;
    return p === 'blinds' || p === 'cashout' || p === 'shop';
  }

  sellTarot(uid: number): boolean {
    const s = this.state;
    const i = s.tarots.findIndex((t) => t.uid === uid);
    if (i < 0 || !this.canSellTarot()) return false;
    s.money += tarotSellPrice(s.tarots[i].id);
    s.tarots.splice(i, 1);
    return true;
  }

  /** A tarot of the shop can be used straight away: it does not need a free tarot slot. */
  canBuyAndUse(offer: ShopOffer): boolean {
    const s = this.state;
    return s.phase === 'shop' && offer.type === 'tarot' && !offer.sold && this.canAfford(offer.price);
  }

  /** Buys a tarot of the shop and uses it on the selected cards. Returns what happened, or null when it cannot be. */
  buyAndUse(uid: number, selected: number[] = []): string[] | null {
    const s = this.state;
    const offer = s.shop?.offers.find((o) => o.uid === uid);
    if (!offer || !this.canBuyAndUse(offer)) return null;
    const tarot: TarotInstance = { uid: this.uid(), id: offer.id, skill: offer.skill };
    // paid first (a boost that pays can not pay for itself)
    s.money -= offer.price;
    s.tarots.push(tarot);
    const notes = this.useTarot(tarot.uid, selected);
    if (!notes) {
      s.tarots.pop();
      s.money += offer.price;
      return null;
    }
    offer.sold = true;
    return notes;
  }

  /* -------------------------------------------------------------------------------------------- tarots and tags */

  /** Uses a tarot on the selected cards (ids). Returns what happened, or null when it cannot be used. */
  useTarot(uid: number, selected: number[] = []): string[] | null {
    const s = this.state;
    const i = s.tarots.findIndex((t) => t.uid === uid);
    if (i < 0 || s.phase === 'playing' || s.phase === 'result' || s.phase === 'assign' || s.phase === 'over') return null;
    const t = s.tarots[i];
    const d = tarotDef(t.id);
    const cards = [...new Set(selected)].map((id) => this.card(id)).filter((c): c is LemmingCard => !!c);
    if (cards.length > d.select || (d.select > 0 && cards.length === 0)) return null;
    // the squad of a blind that has started is fixed: its lemmings cannot leave the colony
    const squad = new Set(s.setup?.hand ?? []);
    if ((t.id === 'manual' || t.id === 'hermit') && cards.some((c) => squad.has(c.id))) return null;
    const rng = this.random.stream('tarot');
    const notes: string[] = [];
    switch (t.id) {
      case 'umbrella':
        for (const c of cards) c.floater = true;
        notes.push(`${names(cards)} became Floater${cards.length > 1 ? 's' : ''}.`);
        break;
      case 'gear':
        for (const c of cards) c.climber = true;
        notes.push(`${names(cards)} became Climber${cards.length > 1 ? 's' : ''}.`);
        break;
      case 'midas':
      case 'clover':
      case 'mentor':
      case 'laurel': {
        const e: Edition = t.id === 'midas' ? 'gold' : t.id === 'clover' ? 'lucky' : t.id === 'mentor' ? 'mentor' : 'champion';
        for (const c of cards) c.edition = e;
        notes.push(`${names(cards)}: ${EDITION_NAMES[e]}.`);
        break;
      }
      case 'sage':
        for (const c of cards) c.edition = 'wise';
        notes.push(`${names(cards)}: ${EDITION_NAMES.wise}.`);
        break;
      case 'policy':
        for (const c of cards) c.insured = true;
        notes.push(`${names(cards)} insured.`);
        break;
      case 'manual': {
        const skill = t.skill ?? 'builder';
        const ids = new Set(cards.map((c) => c.id));
        s.colony = s.colony.filter((c) => !ids.has(c.id));
        s.capacity[skill] += 2 * cards.length;
        notes.push(`${names(cards)} retrained: +${2 * cards.length} ${SKILL_NAMES[skill]} ability.`);
        break;
      }
      case 'conscription': {
        const plain = rng.shuffle(s.colony.filter((c) => !isSpecial(c) && !squad.has(c.id)));
        const gone = new Set(plain.slice(0, 5).map((c) => c.id));
        s.colony = s.colony.filter((c) => !gone.has(c.id));
        const names2 = this.random.stream('names');
        const joined: LemmingCard[] = [];
        for (let k = 0; k < 3; k++) {
          const c = this.newCard(names2);
          randomSpecial(c, rng);
          s.colony.push(c);
          joined.push(c);
        }
        notes.push(`${gone.size} lemmings left; ${joined.map(cardTitle).join(', ')} joined.`);
        break;
      }
      case 'vat': {
        const c = cards[0];
        const copy: LemmingCard = { ...c, id: this.uid(), name: c.name + ' II', saves: 0 };
        s.colony.push(copy);
        notes.push(`${cardTitle(c)} was cloned.`);
        break;
      }
      case 'hermit': {
        // (id of old: The Golden Handshake was The Hermit) lemmings retire for money
        const ids = new Set(cards.map((c) => c.id));
        s.colony = s.colony.filter((c) => !ids.has(c.id));
        s.money += 4 * cards.length;
        notes.push(`${names(cards)} retired: +$${4 * cards.length}.`);
        break;
      }
      case 'recruiter':
        this.recruit(5);
        notes.push('5 lemmings joined the colony.');
        break;
      case 'bootcamp':
        this.beginAssignment('tarot', 5, 0, s.phase, [`${d.name}: +5 points`]);
        notes.push('Assign your 5 new ability points.');
        break;
      case 'rethink':
        this.beginAssignment('tarot', 0, 10, s.phase, [`${d.name}: move up to 10 points`]);
        notes.push('Move up to 10 ability points to other skills.');
        break;
    }
    s.tarots.splice(i, 1);
    // a changed squad card keeps its place; a removed one is gone from the colony (the setup refers to ids)
    if (s.setup) this.refreshSetup(s.setup);
    return notes;
  }

  private takePendingTag(id: string): boolean {
    const i = this.state.pendingTags.indexOf(id);
    if (i < 0) return false;
    this.state.pendingTags.splice(i, 1);
    return true;
  }

  private applyTag(id: string): string[] {
    const s = this.state;
    const rng = this.random.stream('tag');
    const d = tagDef(id);
    switch (id) {
      case 'recruits':
        this.recruit(8);
        return [`${d.name}: 8 lemmings joined the colony.`];
      case 'umbrellas': {
        const cands = rng.shuffle(s.colony.filter((c) => !c.floater)).slice(0, 5);
        for (const c of cands) c.floater = true;
        return [`${d.name}: ${cands.length} lemmings became Floaters.`];
      }
      case 'clone': {
        const specials = this.specialCards();
        const c = specials.length ? rng.pick(specials) : s.colony.length ? rng.pick(s.colony) : null;
        if (!c) return [];
        s.colony.push({ ...c, id: this.uid(), name: c.name + ' II', saves: 0 });
        return [`${d.name}: ${cardTitle(c)} was cloned.`];
      }
      case 'training': {
        const skill = rng.pick(SKILLS);
        s.capacity[skill] += 3;
        return [`${d.name}: +3 ${SKILL_NAMES[skill]} ability.`];
      }
      case 'economy': {
        const gain = Math.floor(s.colony.length / 10);
        s.money += gain;
        return [`${d.name}: +$${gain}.`];
      }
      default:
        s.pendingTags.push(id);
        return [`${d.name}: ${d.text}`];
    }
  }

  /* -------------------------------------------------------------------------------------------- cards */

  private uid(): number {
    return this.state.nextUid++;
  }

  /** a new lemming (start: of the colony a run starts with, a classic lemming nearly always) */
  private newCard(names: Rng, start = false): LemmingCard {
    const card: LemmingCard = { id: this.uid(), name: names.pick(LEMMING_NAMES), climber: false, floater: false, edition: 'plain', insured: false, saves: 0 };
    return { ...card, ...randomColors(this.random.stream('colors'), start) };
  }

  /** a Power Card as it is bought (the Checklist starts with Red clothes on its list) */
  private newJoker(id: string): JokerInstance {
    const j: JokerInstance = { uid: this.uid(), id };
    if (jokerDef(id).afterLevel === 'checklist') j.color = 'red';
    return j;
  }

  recruit(n: number): void {
    const names = this.random.stream('names');
    for (let i = 0; i < n; i++) this.state.colony.push(this.newCard(names));
  }

  /** What the player can see of the run now, for the collection (see Meta.seen). */
  visibleKeys(): string[] {
    const s = this.state;
    const keys: string[] = [];
    for (const j of s.jokers) keys.push(`joker:${j.id}`);
    for (const t of s.tarots) keys.push(`tarot:${t.id}`);
    for (const o of s.shop?.offers ?? []) if (o.type === 'joker' || o.type === 'tarot') keys.push(`${o.type}:${o.id}`);
    for (const o of s.shop?.packs ?? []) keys.push(`pack:${o.id}`);
    for (const c of s.pack?.choices ?? []) {
      if (c.type === 'joker' || c.type === 'tarot') keys.push(`${c.type}:${c.id}`);
      else if (c.type === 'specials') keys.push(`lemming:${c.trait}`);
    }
    if (s.phase === 'blinds') for (const b of s.blinds) if (b.tag) keys.push(`tag:${b.tag}`);
    for (const c of s.colony) {
      if (c.edition !== 'plain') keys.push(`lemming:${c.edition}`);
      if (c.climber && c.floater) keys.push('lemming:athlete');
      else if (c.climber) keys.push('lemming:climber');
      else if (c.floater) keys.push('lemming:floater');
      if (c.insured) keys.push('lemming:insured');
    }
    return keys;
  }

  /** for saving */
  toJSON(): RunState {
    return this.state;
  }
}

/* ---------------------------------------------------------------------------------------------- helpers */

export function isSpecial(c: LemmingCard): boolean {
  return c.edition !== 'plain' || c.climber || c.floater || c.insured;
}

/** "Gary (Gold, Floater)" */
export function cardTitle(c: LemmingCard): string {
  const tags: string[] = [];
  if (c.edition !== 'plain') tags.push(EDITION_NAMES[c.edition]);
  if (c.climber && c.floater) tags.push('Athlete');
  else if (c.climber) tags.push('Climber');
  else if (c.floater) tags.push('Floater');
  if (c.insured) tags.push('Insured');
  return tags.length ? `${c.name} (${tags.join(', ')})` : c.name;
}

/** a lemming of a Lemmings Pack */
function applyTrait(c: LemmingCard, trait: SpecialTrait): void {
  switch (trait) {
    case 'floater':
      c.floater = true;
      break;
    case 'climber':
      c.climber = true;
      break;
    case 'athlete':
      c.climber = c.floater = true;
      break;
    case 'insured':
      c.insured = true;
      break;
    default:
      c.edition = trait;
  }
}

function names(cards: LemmingCard[]): string {
  return cards.map((c) => c.name).join(', ');
}

function randomSpecial(c: LemmingCard, rng: Rng): void {
  switch (rng.int(6)) {
    case 0:
      c.edition = 'gold';
      break;
    case 1:
      c.edition = 'lucky';
      break;
    case 2:
      c.edition = 'mentor';
      break;
    case 3:
      c.climber = c.floater = true;
      break;
    case 4:
      c.edition = 'champion';
      break;
    default:
      c.insured = true;
  }
}

export function sellPrice(jokerId: string): number {
  return Math.max(1, Math.floor(jokerDef(jokerId).price / 2));
}

/** what a Power Card sells for, with the sell value it has gained (the Omelette) */
export function jokerSellValue(j: JokerInstance): number {
  return sellPrice(j.id) + (j.sellBonus ?? 0);
}

export function tarotSellPrice(tarotId: string): number {
  return Math.max(1, Math.floor(tarotDef(tarotId).price / 2));
}

function percentOf(a: number, b: number): number {
  return b > 0 ? Math.floor((a * 100) / b) : 0;
}

function mostUsed(used: SkillCounts, rng: Rng): Skill {
  let best = -1;
  let list: Skill[] = [];
  for (const s of SKILLS) {
    if (used[s] > best) {
      best = used[s];
      list = [s];
    } else if (used[s] === best) list.push(s);
  }
  return rng.pick(list);
}

function remainingSkills(game: LemmingGame): SkillCounts {
  return {
    climber: game.currClimberCount,
    floater: game.currFloaterCount,
    bomber: game.currBomberCount,
    blocker: game.currBlockerCount,
    builder: game.currBuilderCount,
    basher: game.currBasherCount,
    miner: game.currMinerCount,
    digger: game.currDiggerCount,
  };
}

/** What happened to a lemming of the squad, from its final state. */
export function fateOf(l: Lemming | undefined, bombed: boolean, nuked: boolean): Fate {
  if (!l) return 'unreleased';
  if (!l.isRemoved) return 'alive';
  switch (l.action) {
    case LemmingAction.Exiting:
      return 'saved';
    case LemmingAction.Splatting:
      return 'splat';
    case LemmingAction.Drowning:
      return 'drowned';
    case LemmingAction.Vaporizing:
      return 'burned';
    case LemmingAction.Exploding:
      return bombed ? 'bombed' : nuked ? 'nuked' : 'exploded';
  }
  if (l.yPos > LEMMING_MAX_Y) return 'fell';
  return 'trapped';
}

/** Auto pick: how much the levels of a round count (the last one, the hardest, most) */
const AUTO_WEIGHTS: Record<BlindKind, number> = { small: 1, big: 1.2, boss: 1.5 };
/** Auto pick: the skills most levels need, for the points the levels of the round cannot use */
const AUTO_IMPORTANCE: SkillCounts = { builder: 6, basher: 5, digger: 5, miner: 4, blocker: 4, floater: 3, climber: 3, bomber: 3 };
