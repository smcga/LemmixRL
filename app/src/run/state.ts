/** The saved state of a roguelike run. Everything the run needs to continue is in here (it is stored as JSON). */
import type { Edition, Fate } from './content.ts';
import { type Skill, type SkillCounts, zeroSkills } from './skills.ts';

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

export function startCapacity(): SkillCounts {
  return { ...zeroSkills(), climber: 4, floater: 4, bomber: 4, blocker: 4, builder: 8, basher: 4, miner: 4, digger: 4 };
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

export type RunPhase = 'blinds' | 'playing' | 'result' | 'cashout' | 'shop' | 'over';

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
  capacity: SkillCounts;
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
