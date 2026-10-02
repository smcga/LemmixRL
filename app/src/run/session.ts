/**
 * A roguelike run: Balatro's loop around unchanged Lemmings levels.
 *
 *   ante (8)  = three blinds: small, big and boss, levels from the ante's band of the original 120 levels
 *   blind     = a level, played with the original rules; the run only decides the counts it starts with:
 *               lemmings = min(colony size, level lemmings), skills = min(capability, level allocation)
 *   accepting = the result of an attempt becomes canonical: dead lemmings leave the colony, survivors stay
 *   cash out  = blind reward + rescue bonus + card and joker money + interest, then the shop
 */
import { type Lemming, LEMMING_MAX_Y, LemmingAction, type LemmingGame, type Level, raf_SkillAssignment } from '../../../engine/src/index.ts';
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
} from './content.ts';
import { type Rng, RunRandom } from './rng.ts';
import { SKILL_ACTIONS, SKILL_NAMES, SKILLS, type Skill, type SkillCounts, setSkills, totalSkills, zeroSkills } from './skills.ts';
import {
  ANTES,
  ATTEMPTS,
  type AttemptOutcome,
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
  type RunState,
  type ShopOffer,
  START_COLONY,
  START_MONEY,
  startCapacity,
  TAROT_SLOTS,
} from './state.ts';

/** The level bands of the antes, as positions in the level system (0 = Fun 1 ... 119 = Mayhem 30). */
export const ANTE_BANDS: readonly (readonly [number, number])[] = [
  [0, 17],
  [12, 32],
  [25, 47],
  [40, 62],
  [55, 77],
  [70, 92],
  [85, 107],
  [98, 119],
];

const KINDS: readonly BlindKind[] = ['small', 'big', 'boss'];

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
      phase: 'blinds',
      won: false,
      money: START_MONEY,
      colony: [],
      nextUid: 1,
      capacity: startCapacity(),
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
    for (let i = 0; i < START_COLONY; i++) state.colony.push(run.newCard(names));
    run.newAnte();
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

  /** capacity of the colony plus the capacity jokers */
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
    return {
      index,
      blind,
      level,
      reward: BLIND_REWARDS[blind.kind],
      squad,
      required: level.rescue,
      minutes: setup ? setup.minutes : level.time + this.jokerSum((d) => d.extraMinutes),
      allocation: level.skills,
      usable: setup ? setup.usable : this.usableSkills(level, aboveMax, hires),
      aboveMax,
      tooFewLemmings: squad < level.rescue,
    };
  }

  /* -------------------------------------------------------------------------------------------- antes and blinds */

  private newAnte(): void {
    const s = this.state;
    const rng = this.random.stream('blinds');
    const [lo, hi] = ANTE_BANDS[Math.min(s.ante, ANTES) - 1];
    const band = this.catalog.levels.filter((l) => l.order >= lo && l.order <= hi);
    const third = band.length / 3;
    const tagRng = this.random.stream('tags');
    s.blinds = KINDS.map((kind, k) => {
      const part = band.slice(Math.floor(third * k), Math.floor(third * (k + 1)));
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
    if (s.phase !== 'blinds' || !boss || boss.status === 'defeated' || s.bossRerolled || s.money < BOSS_REROLL_PRICE) return false;
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
    const third = band.length / 3;
    const part = band.slice(Math.floor(third * 2));
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
    if (i < 0 || s.phase !== 'blinds' || s.money < HIRE_PRICE) return false;
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

  /** Play the current blind (also a retry). */
  startBlind(): BlindSetup {
    const setup = this.ensureSetup();
    this.state.phase = 'playing';
    this.state.outcome = null;
    return setup;
  }

  /** The level as the blind plays it: the squad, the skills and the clock of the setup. */
  applyToLevel(level: Level): void {
    const setup = this.state.setup;
    if (!setup) return;
    level.info.lemmingsCount = setup.hand.length;
    level.info.timeLimit = setup.minutes;
    setSkills(level.info, setup.usable);
  }

  /** the colony card of a release index */
  cardAt(releaseIndex: number): LemmingCard | undefined {
    const id = this.state.setup?.hand[releaseIndex];
    return id === undefined ? undefined : this.card(id);
  }

  /** Gives the released lemmings the permanent abilities of their cards (and of the jokers). */
  releaseHook(game: LemmingGame): (l: Lemming, releaseIndex: number) => void {
    return (l, i) => {
      const setup = this.state.setup;
      if (!setup) return;
      const card = this.cardAt(i);
      const climber = (card?.climber ?? false) || i < setup.startClimbers;
      const floater = (card?.floater ?? false) || i < setup.startFloaters;
      if (climber || floater) game.grantPermanentAbilities(l, climber, floater);
    };
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
    const fates: Fate[] = setup.hand.map((_, i) => fateOf(game.lemmingList[i], bombed.has(i), game.isNukedByUser));
    const used = zeroSkills();
    const left = remainingSkills(game);
    for (const sk of SKILLS) used[sk] = Math.max(0, setup.usable[sk] - left[sk]);
    const outcome: AttemptOutcome = {
      success: g.success && !g.cheated,
      rescued: fates.filter((f) => f === 'saved').length,
      required: setup.rescue,
      hand: setup.hand.length,
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
    s.phase = 'result';
    return outcome;
  }

  /** Back from the level without a result (the attempt does not count). */
  abandonAttempt(): void {
    if (this.state.phase === 'playing') this.state.phase = 'blinds';
  }

  retry(): void {
    if (this.state.phase === 'result') this.state.phase = 'blinds';
  }

  /** Give up the run (after a failed attempt, or any time from the blind screen). */
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

    // the colony
    const returns = new Set<Fate>();
    for (const j of s.jokers) for (const f of jokerDef(j.id).returns ?? []) returns.add(f);
    const deadIdx = out.fates.map((f, i) => (isDeath(f) ? i : -1)).filter((i) => i >= 0);
    let hardHat = this.hasJoker('hardhat');
    // the hard hat saves the most valuable lemming
    const value = (c: LemmingCard | undefined) => (c ? (c.edition !== 'plain' ? 4 : 0) + (c.climber ? 1 : 0) + (c.floater ? 1 : 0) + (c.insured ? -2 : 0) : 0);
    deadIdx.sort((a, b) => value(this.cardAt(b)) - value(this.cardAt(a)));
    const lost = new Set<number>();
    for (const i of deadIdx) {
      const card = this.cardAt(i);
      if (!card) continue;
      const f = out.fates[i];
      const who = cardTitle(card);
      if (returns.has(f)) notes.push(`${who} ${FATE_TEXTS[f]} but came back.`);
      else if (card.insured) {
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
    lines.push({ label: `${BLIND_NAMES[blind.kind]} defeated`, amount: BLIND_REWARDS[blind.kind] });
    const unused = Math.max(0, ATTEMPTS - setup.attempts);
    if (unused > 0) lines.push({ label: `Unused attempts (${unused})`, amount: unused });
    if (out.hand > out.required) {
      const bonus = Math.floor((4 * (out.rescued - out.required)) / (out.hand - out.required) + 1e-9);
      // champions that reached the exit multiply it
      const champions = out.fates.filter((f, i) => f === 'saved' && this.cardAt(i)?.edition === 'champion').length;
      if (bonus > 0) lines.push({ label: `Rescue bonus (${percentOf(out.rescued, out.hand)}%)${champions ? ` x${champions + 1}` : ''}`, amount: bonus * (champions + 1) });
    }
    const perfect = out.rescued === out.hand;
    if (perfect) lines.push({ label: 'Perfect rescue', amount: 2 });

    // the cards that reached the exit
    let gold = 0;
    const mentorSkill = mostUsed(out.skillsUsed, rng);
    for (let i = 0; i < out.fates.length; i++) {
      if (out.fates[i] !== 'saved') continue;
      const card = this.cardAt(i);
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
        notes.push(`Mentor ${card.name} trained a ${SKILL_NAMES[mentorSkill]} (+1 capacity).`);
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

    // boss tags
    if (blind.kind === 'boss') {
      if (this.takePendingTag('golden')) {
        const sum = lines.reduce((a, l) => a + l.amount, 0);
        lines.push({ label: 'Golden Exit', amount: sum });
      }
      if (this.takePendingTag('investment')) lines.push({ label: 'Investment Tag', amount: 10 });
    }

    // interest on the money you had
    const interest = Math.min(Math.floor(s.money / 5), MAX_INTEREST + this.jokerSum((d) => d.interestCap));
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
    s.cashout = { lines, total, notes };
    s.phase = 'cashout';
    return s.cashout;
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
    this.openShop();
  }

  /** Leave the shop: the next blind, or the next ante after the boss. */
  nextRound(): void {
    const s = this.state;
    if (s.phase !== 'shop') return;
    s.shop = null;
    if (s.blinds.every((b) => b.status === 'defeated' || b.status === 'skipped')) {
      s.ante++;
      this.newAnte();
    } else this.advanceBlind();
    s.phase = 'blinds';
    if (s.colony.length === 0) {
      s.phase = 'over';
      s.won = false;
    }
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
    s.shop = { offers, rerolls: 0, recruitPrice: 3 };
    s.phase = 'shop';
  }

  rerollPrice(): number {
    return 2 + (this.state.shop?.rerolls ?? 0);
  }

  reroll(): boolean {
    const s = this.state;
    const shop = s.shop;
    if (!shop || s.money < this.rerollPrice()) return false;
    s.money -= this.rerollPrice();
    shop.rerolls++;
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
    if (offer.sold || s.money < offer.price) return false;
    if (offer.type === 'joker') return s.jokers.length < JOKER_SLOTS;
    if (offer.type === 'tarot') return s.tarots.length < TAROT_SLOTS;
    return true;
  }

  buy(uid: number): boolean {
    const s = this.state;
    const offer = s.shop?.offers.find((o) => o.uid === uid);
    if (!offer || !this.canBuy(offer)) return false;
    s.money -= offer.price;
    offer.sold = true;
    switch (offer.type) {
      case 'joker':
        s.jokers.push({ uid: this.uid(), id: offer.id });
        break;
      case 'tarot':
        s.tarots.push({ uid: this.uid(), id: offer.id, skill: offer.skill });
        break;
      case 'training':
        s.capacity[offer.skill!] += offer.amount!;
        break;
      case 'drive':
        this.recruit(offer.amount!);
        s.capacity[offer.skill!] += offer.amount!;
        break;
    }
    return true;
  }

  /** the staple of every shop: 5 plain lemmings */
  buyRecruits(): boolean {
    const s = this.state;
    if (!s.shop || s.money < s.shop.recruitPrice) return false;
    s.money -= s.shop.recruitPrice;
    this.recruit(5);
    return true;
  }

  sellJoker(uid: number): boolean {
    const s = this.state;
    const i = s.jokers.findIndex((j) => j.uid === uid);
    if (i < 0) return false;
    s.money += sellPrice(s.jokers[i].id);
    s.jokers.splice(i, 1);
    return true;
  }

  /* -------------------------------------------------------------------------------------------- tarots and tags */

  /** Uses a tarot on the selected cards (ids). Returns what happened, or null when it cannot be used. */
  useTarot(uid: number, selected: number[] = []): string[] | null {
    const s = this.state;
    const i = s.tarots.findIndex((t) => t.uid === uid);
    if (i < 0 || s.phase === 'playing' || s.phase === 'result') return null;
    const t = s.tarots[i];
    const d = tarotDef(t.id);
    const cards = [...new Set(selected)].map((id) => this.card(id)).filter((c): c is LemmingCard => !!c);
    if (cards.length > d.select || (d.select > 0 && cards.length === 0)) return null;
    // the squad of a blind that has started is fixed: its lemmings cannot leave the colony
    const squad = new Set(s.setup?.hand ?? []);
    if (t.id === 'manual' && cards.some((c) => squad.has(c.id))) return null;
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
      case 'policy':
        for (const c of cards) c.insured = true;
        notes.push(`${names(cards)} insured.`);
        break;
      case 'manual': {
        const skill = t.skill ?? 'builder';
        const ids = new Set(cards.map((c) => c.id));
        s.colony = s.colony.filter((c) => !ids.has(c.id));
        s.capacity[skill] += 2 * cards.length;
        notes.push(`${names(cards)} retrained: +${2 * cards.length} ${SKILL_NAMES[skill]} capacity.`);
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
        const gain = Math.min(s.money, 20);
        s.money += gain;
        notes.push(`+$${gain}.`);
        break;
      }
      case 'recruiter':
        this.recruit(5);
        notes.push('5 lemmings joined the colony.');
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
        return [`${d.name}: +3 ${SKILL_NAMES[skill]} capacity.`];
      }
      case 'economy': {
        const gain = Math.min(s.money, 15);
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

  private newCard(names: Rng): LemmingCard {
    return { id: this.uid(), name: names.pick(LEMMING_NAMES), climber: false, floater: false, edition: 'plain', insured: false, saves: 0 };
  }

  recruit(n: number): void {
    const names = this.random.stream('names');
    for (let i = 0; i < n; i++) this.state.colony.push(this.newCard(names));
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
