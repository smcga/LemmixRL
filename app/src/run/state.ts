import type { HomeState } from './home.ts';
/** The saved state of a roguelike run. Everything the run needs to continue is in here (it is stored as JSON). */
import type { LemmingColor } from './colors.ts';
import type { Edition, Fate, PackKind, PowerEdition } from './content.ts';
import type { Skill, SkillCounts } from './skills.ts';

export const RUN_VERSION = 1;
export const ANTES = 8;
export const JOKER_SLOTS = 5;
export const TAROT_SLOTS = 2;
/** squad lemmings that can be swapped for others before a level begins (Balatro's discards) */
export const SWAPS = 3;
/** attempts per blind that pay $1 each when they are not used */
export const ATTEMPTS = 3;
export const START_MONEY = 4;
export const START_COLONY = 80;
export const MAX_INTEREST = 5;
/** what a level pays (a level is played once: there are no attempts left over to pay for) */
export const BLIND_REWARDS = { small: 4, big: 5, boss: 6 } as const;
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
  /** its colours (lemmings of runs saved before they had colours get theirs from their id: see colors.ts) */
  hair?: LemmingColor;
  clothes?: LemmingColor;
}

export type BlindKind = 'small' | 'big' | 'boss';
export type BlindStatus = 'upcoming' | 'current' | 'skipped' | 'defeated';

/** what the screens call the blinds: the three levels of a round */
export const BLIND_NAMES: Record<BlindKind, string> = { small: 'Level 1', big: 'Level 2', boss: 'Level 3' };

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
  /** sell value it has gained (the Nest Egg) */
  sellBonus?: number;
  /** what it has counted (Trainings, rerolls or levels, depending on the Power Card) */
  counter?: number;
  /** its colour (the Checklist's list, the Trendsetter's hair) */
  color?: LemmingColor;
  /** its lemming (Teacher's Pet), by id */
  target?: number;
  /** its edition: Shiny, Glowing, Rainbow or Ghost */
  edition?: PowerEdition;
}

export interface TarotInstance {
  uid: number;
  id: string;
  /** the skill of a Retraining Manual */
  skill?: Skill;
}

export type OfferType = 'joker' | 'tarot' | 'training' | 'drive' | 'pack';

export interface ShopOffer {
  uid: number;
  type: OfferType;
  /** joker or tarot id; the kind of a pack */
  id: string;
  skill?: Skill;
  /** training: capacity; drive: lemmings (and capacity) */
  amount?: number;
  /** the edition of a Power Card on offer */
  edition?: PowerEdition;
  price: number;
  sold: boolean;
}

export interface ShopState {
  offers: ShopOffer[];
  /** the packs of the shop (they are not rerolled); runs saved before packs existed do not have them */
  packs?: ShopOffer[];
  rerolls: number;
  /** the free rerolls used in this shop (the Generous Clown's) */
  freeRerollsUsed?: number;
  /** (saves of old: the free rerolls left when the shop opened; no longer used) */
  freeRerolls?: number;
  /** what the first paid reroll costs (the Reroll Bonus: $0; else $2) */
  rerollBase?: number;
}

/** what can be chosen from an open pack */
export type PackChoice =
  /** plain lemmings join the colony */
  | { type: 'recruits'; amount: number }
  /** special lemmings join the colony */
  | { type: 'specials'; amount: number; trait: SpecialTrait }
  /** an ability goes up (and another one down) */
  | { type: 'ability'; skill: Skill; amount: number; minus?: Skill; minusAmount?: number }
  /** every ability goes up */
  | { type: 'allSkills'; amount: number }
  /** a boost, used at once */
  | { type: 'tarot'; id: string; skill?: Skill }
  /** a gadget (with its edition) */
  | { type: 'joker'; id: string; edition?: PowerEdition };

export type SpecialTrait = 'floater' | 'climber' | 'athlete' | 'gold' | 'lucky' | 'mentor' | 'champion' | 'insured' | 'wise';

/** a pack that has been bought and opened: choose one of its cards (or skip it) */
export interface PackState {
  kind: PackKind;
  choices: PackChoice[];
  /** the phase after the pack (a pack of a Skip Bonus: the levels; else the shop) */
  back?: RunPhase;
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
  /** lemmings that drop in besides the squad (Power Cards), after the squad */
  extra?: number;
  /** the colony in the shuffled order the squad was drawn from (preferences draw it again from it) */
  order?: number[];
  /** the level has begun (the Power Cards that act when a level begins have acted) */
  begun?: boolean;
  /** the lemming of the squad (card id) that was the only one out 10 seconds in (Self Replication) */
  selfCopy?: number | null;
  /** the Crowd Bonus: 3 more lemmings in the squad */
  crowd?: boolean;
  /** the lemmings swapped out of the squad before the level began (card ids; one Swap each) */
  swappedOut?: number[];
  /** how often the level was started (the first start, then the restarts) */
  starts?: number;
}

/** a line of the rescue count: the lemmings saved, then the Power Cards that add (+) or multiply (X) */
export interface RescueLine {
  label: string;
  plus?: number;
  times?: number;
  /** the count after it */
  total: number;
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
  /** the rescue count (the lemmings saved, with what the Power Cards add and multiply), against required */
  score?: number;
  scoring?: RescueLine[];
  /** the lemmings that dropped in (not of the colony), and how many of them were saved */
  extra?: number;
  extraSaved?: number;
  /** the lemmings saved, in the order they were saved: their index in squad (-1: one that dropped in) */
  exitOrder?: number[];
  /** the cards of the fates: the squad, then the Paratroopers (ids; older saves: the hand) */
  squad?: number[];
  /** Final Lap: Gold lemmings saved in the last 30 seconds */
  lapGold?: number;
  /** Second Chance: a lost level that counts as won */
  secondChance?: boolean;
  /** what the Power Cards did in the level (for the cash out) */
  events?: string[];
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
  /** the level as it went (runs saved before it was shown with the cash out do not have it) */
  result?: CashoutResult;
}

export interface CashoutResult {
  rescued: number;
  hand: number;
  required: number;
  lost: number;
  /** "2 splatted, 1 drowned" */
  deaths: string;
  /** the special lemmings of the squad: what happened to them */
  specials: { title: string; edition: Edition; fate: Fate }[];
  /** the rescue count and how it was made */
  score?: number;
  scoring?: RescueLine[];
}

export type RunPhase = 'assign' | 'blinds' | 'playing' | 'result' | 'cashout' | 'shop' | 'pack' | 'over';

export interface RunStats {
  blindsWon: number;
  skipped: number;
  attempts: number;
  saved: number;
  lost: number;
  earned: number;
  /** the Boosts used (runs saved before it was counted do not have it) */
  boostsUsed?: number;
  /** the Tribe cards used */
  tribesUsed?: number;
  /** the Swaps left unused in the levels played */
  swapsUnused?: number;
  /** the skills used in the levels won, this run */
  skillUses?: SkillCounts;
}

export interface RunState {
  /** the colony at home: its ground and where its lemmings are (see home.ts) */
  home?: HomeState;
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
  /** tags waiting for their moment (golden, investment, supply, coupon, uncommon, rare, directorscut, crowd, reroll) */
  pendingTags: string[];
  blinds: BlindState[];
  /** the boss of this ante was rerolled */
  bossRerolled?: boolean;
  usedLevels: string[];
  setup: BlindSetup | null;
  outcome: AttemptOutcome | null;
  cashout: Cashout | null;
  shop: ShopState | null;
  /** the pack opened in the shop (phase 'pack') */
  pack?: PackState | null;
  /** the Power Cards destroyed by their own chance (Big Mike: Little Mike can be offered) */
  extinct?: string[];
  /** the Tribe cards: lemmings more in every squad (Beach), seconds more on every level (Polar), Respawns (Shadow) */
  squadBonus?: number;
  extraSeconds?: number;
  respawns?: number;
  /** the skills used in the last level won, and its round (Same Again) */
  lastSkills?: { ante: number; skills: Skill[] };
  stats: RunStats;
}
