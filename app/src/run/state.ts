/** The saved state of a roguelike run. Everything the run needs to continue is in here (it is stored as JSON). */
import type { Edition, Fate } from './content.ts';
import type { Skill, SkillCounts } from './skills.ts';

export const RUN_VERSION = 1;
export const ANTES = 8;
export const JOKER_SLOTS = 5;
export const TAROT_SLOTS = 2;
/** attempts per blind that pay $1 each when they are not used */
export const ATTEMPTS = 3;
export const START_MONEY = 4;
export const START_COLONY = 80;
export const MAX_INTEREST = 5;
export const BLIND_REWARDS = { small: 3, big: 4, boss: 5 } as const;
export const HIRE_PRICE = 1;
export const BOSS_REROLL_PRICE = 6;
/** the ability points a run starts with, spread by the player over the eight skills */
export const START_ABILITY_POINTS = 60;
/** the most points the player can assign to one skill */
export const ABILITY_CAP = 20;
/** after every boss blind: points that can be moved to other skills */
export const BOSS_REASSIGN_POINTS = 10;

/**
 * The ability assignment: at the start of a run the player spreads the start points over the skills; after every boss
 * blind (and with some tarots) they move some points to other skills, and place new ones.
 */
export interface AssignState {
  reason: 'start' | 'boss' | 'tarot';
  /** the abilities when the assignment began: what is taken away from them counts as moved */
  before: SkillCounts;
  /** new points to place */
  newPoints: number;
  /** how many points may be moved (taken away from the skills they were in) */
  reassign: number;
  /** the phase after the assignment */
  next: RunPhase;
  /** where the points come from, for the screen */
  sources: string[];
}

/** A lemming of the colony: a card of the deck. */
export interface LemmingCard {
  id: number;
  name: string;
  climber: boolean;
  floater: boolean;
  edition: Edition;
  insured: boolean;
  /** how often it reached the exit */
  saves: number;
}

export type BlindKind = 'small' | 'big' | 'boss';
export type BlindStatus = 'upcoming' | 'current' | 'skipped' | 'defeated';

export const BLIND_NAMES: Record<BlindKind, string> = { small: 'Small Blind', big: 'Big Blind', boss: 'Boss Blind' };

export interface BlindState {
  kind: BlindKind;
  levelId: string;
  /** the reward for skipping it (not for the boss) */
  tag: string | null;
  status: BlindStatus;
}

export interface JokerInstance {
  uid: number;
  id: string;
}

export interface TarotInstance {
  uid: number;
  id: string;
  /** the skill of a Retraining Manual */
  skill?: Skill;
}

export type OfferType = 'joker' | 'tarot' | 'training' | 'drive';

export interface ShopOffer {
  uid: number;
  type: OfferType;
  /** joker or tarot id */
  id: string;
  skill?: Skill;
  /** training: capacity; drive: lemmings (and capacity) */
  amount?: number;
  price: number;
  sold: boolean;
}

export interface ShopState {
  offers: ShopOffer[];
  rerolls: number;
  recruitPrice: number;
}

/** A blind that is being played: fixed when the player starts it, the same for every attempt. */
export interface BlindSetup {
  blind: number;
  levelId: string;
  /** card ids in release order */
  hand: number[];
  rescue: number;
  minutes: number;
  /** the skill counts of the level as played */
  usable: SkillCounts;
  /** temporary hires for this blind */
  hires: SkillCounts;
  /** skills above the level maximum (jokers) */
  aboveMax: SkillCounts;
  /** the skill the Smuggler brings to this blind */
  smuggled?: Skill;
  startClimbers: number;
  startFloaters: number;
  /** finished attempts */
  attempts: number;
}

export interface AttemptOutcome {
  success: boolean;
  rescued: number;
  required: number;
  hand: number;
  /** per release index */
  fates: Fate[];
  skillsUsed: SkillCounts;
  secondsLeft: number;
  timeUp: boolean;
  nuked: boolean;
  /** rescued and required in %, like the original result screen */
  done: number;
  target: number;
}

export interface PayoutLine {
  label: string;
  amount: number;
}

export interface Cashout {
  lines: PayoutLine[];
  total: number;
  /** what happened to the colony */
  notes: string[];
}

export type RunPhase = 'assign' | 'blinds' | 'playing' | 'result' | 'cashout' | 'shop' | 'over';

export interface RunStats {
  blindsWon: number;
  skipped: number;
  attempts: number;
  saved: number;
  lost: number;
  earned: number;
}

export interface RunState {
  version: number;
  seed: string;
  /** random stream counters (see RunRandom) */
  counters: Record<string, number>;
  ante: number;
  phase: RunPhase;
  /** when over: won or lost */
  won: boolean;
  money: number;
  colony: LemmingCard[];
  nextUid: number;
  /** the abilities: how many of each skill the colony can bring to a level (the jokers add theirs) */
  capacity: SkillCounts;
  /** the ability assignment going on (phase 'assign'); runs saved before it existed do not have it */
  assign?: AssignState | null;
  jokers: JokerInstance[];
  tarots: TarotInstance[];
  /** tags waiting for their moment (golden, investment, supply, coupon) */
  pendingTags: string[];
  blinds: BlindState[];
  /** the boss of this ante was rerolled */
  bossRerolled?: boolean;
  usedLevels: string[];
  setup: BlindSetup | null;
  outcome: AttemptOutcome | null;
  cashout: Cashout | null;
  shop: ShopState | null;
  stats: RunStats;
}
