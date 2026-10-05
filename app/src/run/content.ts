/**
 * The roguelike content: lemming card editions, jokers (passive gadgets), tarots (consumables) and tags (rewards for
 * skipping a blind). None of them changes how a level plays, except the few rule breakers that say so: they add a
 * skill above the level's maximum, time on the clock, or start lemmings with an ability.
 */
import type { SkillCounts } from './skills.ts';

/* ---------------------------------------------------------------------------------------------- lemming cards */

/** what a lemming card is worth outside the level (one per card) */
export type Edition = 'plain' | 'gold' | 'lucky' | 'mentor' | 'champion';

export const EDITION_NAMES: Record<Edition, string> = { plain: 'Lemming', gold: 'Gold', lucky: 'Lucky', mentor: 'Mentor', champion: 'Champion' };

export const EDITION_TEXTS: Record<Edition, string> = {
  plain: 'An ordinary lemming.',
  gold: 'Earns $2 when it reaches the exit.',
  lucky: 'When it reaches the exit: 1 in 3 chance of $4, 1 in 5 chance of a Tarot.',
  mentor: 'When it reaches the exit: +1 ability in the skill you used most in that level.',
  champion: 'When it reaches the exit, the rescue bonus of the level is multiplied (x2 for one champion, x3 for two, ...).',
};

/** how a lemming was lost (or not) in a level */
export type Fate =
  | 'saved' // reached the exit
  | 'alive' // still in the level when it ended
  | 'unreleased' // never left the entrance
  | 'splat'
  | 'drowned'
  | 'burned'
  | 'bombed' // a bomber you assigned
  | 'nuked'
  | 'exploded' // any other explosion
  | 'trapped'
  | 'fell'; // out of the level

export const DEATHS: readonly Fate[] = ['splat', 'drowned', 'burned', 'bombed', 'nuked', 'exploded', 'trapped', 'fell'];

export const FATE_TEXTS: Record<Fate, string> = {
  saved: 'saved',
  alive: 'survived',
  unreleased: 'stayed home',
  splat: 'splatted',
  drowned: 'drowned',
  burned: 'burned',
  bombed: 'blew up (bomber)',
  nuked: 'nuked',
  exploded: 'exploded',
  trapped: 'trapped',
  fell: 'fell out of the world',
};

export function isDeath(f: Fate): boolean {
  return DEATHS.includes(f);
}

/** Names for lemming cards: the people of DMA Design and Psygnosis who made Lemmings, and some more. */
export const LEMMING_NAMES = [
  'Mike', 'Dave', 'Russell', 'Gary', 'Scott', 'Brian', 'Tim', 'Tony', 'Steve', 'Jim', 'Ian', 'Gordon', 'Eric', 'Volker',
  'Mindy', 'Willy', 'Lemmy', 'Larry', 'Lola', 'Pip', 'Dot', 'Bob', 'Nora', 'Moss', 'Fern', 'Ivy', 'Rex', 'Max', 'Kit',
  'Bo', 'Jo', 'Ned', 'Ted', 'Sid', 'Mo', 'Flo', 'Gus', 'Hal', 'Ida', 'Jem', 'Kay', 'Lou', 'Mac', 'Nat', 'Ozzy', 'Pat',
  'Quin', 'Ray', 'Sam', 'Tess', 'Uma', 'Val', 'Wes', 'Xan', 'Yan', 'Zed', 'Ann', 'Bea', 'Cal', 'Dee',
];

/* ---------------------------------------------------------------------------------------------- jokers */

export type Rarity = 'common' | 'uncommon' | 'rare';

export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };

/** what a joker can see when it pays out */
export interface PayoutContext {
  hand: number;
  required: number;
  rescued: number;
  perfect: boolean;
  secondsLeft: number;
  skillsUsed: number;
  skillsAvailable: number;
  colonySize: number;
}

export interface JokerDef {
  id: string;
  name: string;
  rarity: Rarity;
  price: number;
  text: string;
  /** extra abilities (while you have the joker) */
  capacity?: Partial<SkillCounts>;
  /** new ability points to assign after every boss blind */
  pointsAfterBoss?: number;
  /** more ability points that can be moved after every boss blind */
  reassignAfterBoss?: number;
  /** raises the level's maximum of these skills (the rule breakers) */
  aboveMax?: Partial<SkillCounts>;
  /** one random skill above the level's maximum per blind */
  randomAboveMax?: boolean;
  /** extra minutes on the clock */
  extraMinutes?: number;
  /** the first lemmings of the squad start with an ability */
  startClimbers?: number;
  startFloaters?: number;
  /** lemmings lost this way return to the colony */
  returns?: Fate[];
  /** the first lemming that dies in a blind returns to the colony */
  firstDeathReturns?: boolean;
  /** money at the cash out */
  payout?: (c: PayoutContext) => number;
  /** raises the interest cap */
  interestCap?: number;
  /** plain lemmings that join the colony after every blind */
  recruitsAfterBlind?: number;
}

export const JOKERS: readonly JokerDef[] = [
  // the rule breakers
  { id: 'toolkit', name: 'Illegal Toolkit', rarity: 'rare', price: 8, text: '+1 Builder above the level maximum.', aboveMax: { builder: 1 } },
  { id: 'smuggler', name: 'Smuggler', rarity: 'rare', price: 8, text: 'Every blind: +1 of a random skill above the level maximum.', randomAboveMax: true },
  { id: 'overtime', name: 'Overtime', rarity: 'uncommon', price: 6, text: '+1 minute on the clock.', extraMinutes: 1 },
  { id: 'ladder', name: 'Rope Ladder', rarity: 'uncommon', price: 7, text: 'The first 3 lemmings of every level are Climbers.', startClimbers: 3 },
  { id: 'umbrellas', name: 'Umbrella Stand', rarity: 'uncommon', price: 7, text: 'The first 3 lemmings of every level are Floaters.', startFloaters: 3 },
  // the colony
  { id: 'hardhat', name: 'Hard Hat', rarity: 'common', price: 5, text: 'The first lemming that dies in a level returns to the colony.', firstDeathReturns: true },
  { id: 'disposal', name: 'Bomb Disposal', rarity: 'uncommon', price: 6, text: 'Lemmings you turn into Bombers return to the colony.', returns: ['bombed'] },
  { id: 'shelter', name: 'Fallout Shelter', rarity: 'common', price: 4, text: 'Lemmings killed by the nuke return to the colony.', returns: ['nuked'] },
  { id: 'lifeguard', name: 'Lifeguard', rarity: 'common', price: 4, text: 'Drowned lemmings return to the colony.', returns: ['drowned'] },
  { id: 'crashmats', name: 'Crash Mats', rarity: 'uncommon', price: 6, text: 'Splatted lemmings return to the colony.', returns: ['splat'] },
  { id: 'scout', name: 'Talent Scout', rarity: 'common', price: 4, text: '2 lemmings join the colony after every blind.', recruitsAfterBlind: 2 },
  // money
  {
    id: 'unionrep',
    name: 'Union Rep',
    rarity: 'common',
    price: 5,
    text: '+$1 for every 10% of the squad rescued above the requirement.',
    payout: (c) => Math.floor(((c.rescued - c.required) * 10) / Math.max(1, c.hand)),
  },
  { id: 'nolem', name: 'Leave No Lem Behind', rarity: 'common', price: 4, text: '+$3 for a perfect rescue.', payout: (c) => (c.perfect ? 3 : 0) },
  { id: 'piggy', name: 'Piggy Bank', rarity: 'common', price: 5, text: 'The interest cap is $5 higher.', interestCap: 5 },
  {
    id: 'speedrun',
    name: 'Speedrunner',
    rarity: 'common',
    price: 5,
    text: '+$1 for every full minute left on the clock.',
    payout: (c) => Math.floor(c.secondsLeft / 60),
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    rarity: 'uncommon',
    price: 6,
    text: '+$4 if you used at most half of the skills you had.',
    payout: (c) => (c.skillsUsed * 2 <= c.skillsAvailable ? 4 : 0),
  },
  { id: 'headcount', name: 'Head Count', rarity: 'common', price: 5, text: '+$1 for every 20 lemmings in the colony.', payout: (c) => Math.floor(c.colonySize / 20) },
  // abilities
  { id: 'guild', name: "Builders' Guild", rarity: 'common', price: 4, text: '+2 Builder ability.', capacity: { builder: 2 } },
  { id: 'demolition', name: 'Demolition Crew', rarity: 'common', price: 5, text: '+1 Basher, Miner and Digger ability.', capacity: { basher: 1, miner: 1, digger: 1 } },
  { id: 'climbclub', name: 'Climbing Club', rarity: 'common', price: 4, text: '+2 Climber and Floater ability.', capacity: { climber: 2, floater: 2 } },
  { id: 'bombsquad', name: 'Bomb Squad', rarity: 'common', price: 4, text: '+2 Bomber and Blocker ability.', capacity: { bomber: 2, blocker: 2 } },
  { id: 'trainer', name: 'Personal Trainer', rarity: 'uncommon', price: 6, text: '+5 ability points to assign after every Boss Blind.', pointsAfterBoss: 5 },
  { id: 'advisor', name: 'Careers Advisor', rarity: 'common', price: 4, text: 'After every Boss Blind, 5 more ability points can be moved.', reassignAfterBoss: 5 },
];

export function jokerDef(id: string): JokerDef {
  const j = JOKERS.find((d) => d.id === id);
  if (!j) throw new Error('unknown joker ' + id);
  return j;
}

/* ---------------------------------------------------------------------------------------------- tarots */

export interface TarotDef {
  id: string;
  name: string;
  price: number;
  text: string;
  /** how many lemmings the player selects (0: none) */
  select: number;
  /** the tarot's text with the name of its skill */
  skillText?: (skillName: string) => string;
}

export const TAROTS: readonly TarotDef[] = [
  { id: 'umbrella', name: 'The Umbrella', price: 3, text: 'Up to 3 selected lemmings become Floaters for good.', select: 3 },
  { id: 'gear', name: 'The Climbing Gear', price: 3, text: 'Up to 3 selected lemmings become Climbers for good.', select: 3 },
  { id: 'midas', name: 'The Midas', price: 3, text: '1 selected lemming becomes Gold.', select: 1 },
  { id: 'clover', name: 'The Four-Leaf', price: 3, text: 'Up to 2 selected lemmings become Lucky.', select: 2 },
  { id: 'mentor', name: 'The Mentor', price: 3, text: '1 selected lemming becomes a Mentor.', select: 1 },
  { id: 'laurel', name: 'The Laurel', price: 3, text: '1 selected lemming becomes a Champion.', select: 1 },
  { id: 'policy', name: 'The Policy', price: 3, text: 'Up to 2 selected lemmings become Insured.', select: 2 },
  {
    id: 'manual',
    name: 'Retraining Manual',
    price: 3,
    text: 'Up to 3 selected lemmings leave the colony; +2 ability per lemming.',
    select: 3,
    skillText: (s) => `Up to 3 selected lemmings leave the colony; +2 ${s} ability per lemming.`,
  },
  { id: 'conscription', name: 'Conscription', price: 3, text: '5 random plain lemmings leave; 3 random special lemmings join.', select: 0 },
  { id: 'vat', name: 'The Cloning Vat', price: 3, text: '1 selected lemming is duplicated.', select: 1 },
  { id: 'hermit', name: 'The Hermit', price: 3, text: 'Doubles your money (max +$20).', select: 0 },
  { id: 'recruiter', name: 'The Recruiter', price: 3, text: '5 plain lemmings join the colony.', select: 0 },
  { id: 'bootcamp', name: 'Boot Camp', price: 3, text: '+5 ability points: assign them now.', select: 0 },
  { id: 'rethink', name: 'The Rethink', price: 3, text: 'Move up to 10 ability points to other skills now.', select: 0 },
];

export function tarotDef(id: string): TarotDef {
  const t = TAROTS.find((d) => d.id === id);
  if (!t) throw new Error('unknown tarot ' + id);
  return t;
}

/* ---------------------------------------------------------------------------------------------- tags */

export interface TagDef {
  id: string;
  name: string;
  text: string;
}

export const TAGS: readonly TagDef[] = [
  { id: 'recruits', name: 'Recruitment Drive', text: '8 plain lemmings join the colony.' },
  { id: 'umbrellas', name: 'Umbrella Tag', text: '5 random lemmings become Floaters.' },
  { id: 'golden', name: 'Golden Exit', text: 'Doubles the payout of the next Boss Blind.' },
  { id: 'supply', name: 'Supply Drop', text: 'The next shop has 2 more training offers.' },
  { id: 'clone', name: 'Clone Tag', text: 'A random special lemming is duplicated (or a plain one).' },
  { id: 'investment', name: 'Investment Tag', text: '+$10 after the next Boss Blind.' },
  { id: 'coupon', name: 'Coupon Tag', text: 'The offers in the next shop are free.' },
  { id: 'training', name: 'Training Tag', text: '+3 ability in a random skill.' },
  { id: 'economy', name: 'Economy Tag', text: 'Doubles your money (max +$15).' },
];

export function tagDef(id: string): TagDef {
  const t = TAGS.find((d) => d.id === id);
  if (!t) throw new Error('unknown tag ' + id);
  return t;
}
