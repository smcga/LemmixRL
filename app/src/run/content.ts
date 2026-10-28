/**
 * The roguelike content: lemming card editions, jokers (passive gadgets), tarots (consumables) and tags (rewards for
 * skipping a blind). None of them changes how a level plays, except the few rule breakers that say so: they add a
 * skill above the level's maximum, time on the clock, or start lemmings with an ability.
 */
import { clothesOf, COLOR_NAMES, hairOf, hasHair, isFully, LEMMING_COLORS, type LemmingColor } from './colors.ts';
import { type Skill, type SkillCounts, SKILLS } from './skills.ts';
import { type LemmingCard, START_COLONY } from './state.ts';
import { POWER_CARD_LIBRARY } from './power-cards/catalogue.ts';
import type { Rarity } from './power-cards/schema.ts';
import type { PowerCardLibrary } from './power-cards/schema.ts';
export type { Rarity } from './power-cards/schema.ts';

/* ---------------------------------------------------------------------------------------------- lemming cards */

/** what a lemming card is worth outside the level (one per card) */
export type Edition = 'plain' | 'gold' | 'lucky' | 'mentor' | 'champion' | 'wise';

export const EDITION_NAMES: Record<Edition, string> = { plain: 'Lemming', gold: 'Gold', lucky: 'Lucky', mentor: 'Mentor', champion: 'Champion', wise: 'Wise' };

/** a Badge: a mark on a lemming, besides its edition (Balatro's seals) */
export type Badge = 'red' | 'gold' | 'blue' | 'purple';
export const BADGES: readonly Badge[] = ['red', 'gold', 'blue', 'purple'];
export const BADGE_NAMES: Record<Badge, string> = { red: 'Red Badge', gold: 'Gold Badge', blue: 'Blue Badge', purple: 'Purple Badge' };
export const BADGE_TEXTS: Record<Badge, string> = {
  red: 'Counts {!}twice{} when saved',
  gold: 'Earns {$}$3{} when saved',
  blue: 'Creates a {!}Tribe card{} when saved last, if there is room',
  purple: 'Creates a {!}Boost{} when lost, if there is room',
};
/** the colours of the Badges (their mark above a lemming, and their box in a tooltip) */
export const BADGE_COLORS: Record<Badge, number> = { red: 0xe03030, gold: 0xffd23c, blue: 0x3a8cff, purple: 0xb050f0 };

/** what the abilities of a lemming do (in every level), as a description is written */
export const TRAIT_TEXTS = {
  climber: '{s}Climbs{} walls in every level',
  floater: 'Opens an {s}umbrella{} when it falls, in every level',
  insured: '{!}Returns{} to the colony the first time it is lost',
};

/** the colours of the badges of a lemming (on a light tooltip: darker than the marks of the levels) */
export const LEMMING_BADGE_COLORS = {
  gold: 0xd99a20,
  lucky: 0x2fae5f,
  mentor: 0x3f7fd8,
  champion: 0x9a5ae0,
  wise: 0x8c8ca8,
  climber: 0x3a9a3a,
  floater: 0x4a70c8,
  athlete: 0xd05020,
  insured: 0x8a8a96,
  squad: 0xf08a10,
};

export const EDITION_TEXTS: Record<Edition, string> = {
  plain: '',
  gold: 'Earns {$}$2{} when saved',
  lucky: '{%}1 in 3{} chance to earn {$}$4{} and {%}1 in 5{} chance to create a {!}Boost{} when saved',
  mentor: '{!}+1{} ability in your most used skill when saved',
  champion: 'Multiplies the rescue bonus when saved ({!}x2{} for one Champion, {!}x3{} for two)',
  wise: 'Some Power Cards count the {!}Wise{} lemmings of your colony',
};

/**
 * The words of the descriptions that have a box of their own next to a description, as in Balatro (the terms of the
 * game a description uses).
 */
export const KEYWORDS: { match: RegExp; title: string; text: string }[] = [
  { match: /\+\d* ?Rescues/, title: '+Rescues', text: '+Rescues are added on to the final rescue count at the end of the level.' },
  { match: /X[\d.]+ Rescues/, title: 'X Rescues', text: 'Multiplies the rescue count at the end of the level (after the Power Cards to its left).' },
  { match: /drops? in\b/, title: 'Drop in', text: 'A lemming that drops in is not from your colony: if it is lost, nothing is lost.' },
  { match: /[Rr]espawn/, title: 'Respawns', text: 'A lemming that dies comes back to the colony, as long as there are Respawns left in the level.' },
  { match: /Fully/, title: 'Fully', text: 'A lemming is Fully a colour when its hair and its clothes are both that colour.' },
  { match: /Wise/, title: 'Wise', text: 'A Super Lemming. It does nothing itself, but some Power Cards count the Wise lemmings of your colony.' },
  { match: /\bGhost\b/, title: 'Ghost', text: 'A Power Card edition: +1 Power Card slot.' },
  { match: /\bShiny\b/, title: 'Shiny', text: 'A Power Card edition: +5 Rescues.' },
  { match: /\bGlowing\b/, title: 'Glowing', text: 'A Power Card edition: +10 Rescues.' },
  { match: /\bRainbow\b/, title: 'Rainbow', text: 'A Power Card edition: X1.5 Rescues.' },
  { match: /Badge/, title: 'Badge', text: 'A mark on a lemming: Red counts twice when saved, Gold earns $3 when saved, Blue makes a Tribe card when saved last, Purple a Boost when lost.' },
  { match: /Redraw/, title: 'Redraw', text: 'Before a level begins: the plain lemmings of the squad go back to the colony and the next ones come in. Super Lemmings and lemmings with a Badge stay.' },
  { match: /Super Lemming/, title: 'Super Lemming', text: 'A special lemming: Gold, Lucky, Mentor, Champion or Wise, a Climber, a Floater or Insured.' },
];

/** the keyword boxes of a description */
export function keywordsOf(text: string): { title: string; text: string }[] {
  return KEYWORDS.filter((k) => k.match.test(text)).map(({ title, text: t }) => ({ title, text: t }));
}

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
  'Mike',
  'Dave',
  'Russell',
  'Gary',
  'Scott',
  'Brian',
  'Tim',
  'Tony',
  'Steve',
  'Jim',
  'Ian',
  'Gordon',
  'Eric',
  'Volker',
  'Mindy',
  'Willy',
  'Lemmy',
  'Larry',
  'Lola',
  'Pip',
  'Dot',
  'Bob',
  'Nora',
  'Moss',
  'Fern',
  'Ivy',
  'Rex',
  'Max',
  'Kit',
  'Bo',
  'Jo',
  'Ned',
  'Ted',
  'Sid',
  'Mo',
  'Flo',
  'Gus',
  'Hal',
  'Ida',
  'Jem',
  'Kay',
  'Lou',
  'Mac',
  'Nat',
  'Ozzy',
  'Pat',
  'Quin',
  'Ray',
  'Sam',
  'Tess',
  'Uma',
  'Val',
  'Wes',
  'Xan',
  'Yan',
  'Zed',
  'Ann',
  'Bea',
  'Cal',
  'Dee',
];

/* ---------------------------------------------------------------------------------------------- jokers */

/* ---------------------------------------------------------------------------------------------- Power Card editions */

/** what a Power Card can be besides itself (Balatro's Foil, Holographic, Polychrome and Negative) */
export type PowerEdition = 'shiny' | 'glowing' | 'rainbow' | 'ghost';
export const POWER_EDITIONS: readonly PowerEdition[] = ['shiny', 'glowing', 'rainbow', 'ghost'];

export const POWER_EDITION_NAMES: Record<PowerEdition, string> = { shiny: 'Shiny', glowing: 'Glowing', rainbow: 'Rainbow', ghost: 'Ghost' };
export const POWER_EDITION_TEXTS: Record<PowerEdition, string> = {
  shiny: '{+}+5{} Rescues',
  glowing: '{+}+10{} Rescues',
  rainbow: '{x}X1.5{} Rescues',
  ghost: '{!}+1{} Power Card slot',
};
/** what an edition does to the rescue count, after the card's own ability */
export const POWER_EDITION_RESCUES: Record<PowerEdition, { plus?: number; times?: number }> = { shiny: { plus: 5 }, glowing: { plus: 10 }, rainbow: { times: 1.5 }, ghost: {} };
/** what an edition adds to the price of a Power Card (half of it to its sell value) */
export const POWER_EDITION_PRICES: Record<PowerEdition, number> = { shiny: 2, glowing: 3, rainbow: 5, ghost: 5 };
/** the chance that a Power Card of a shop or a pack has an edition (as in Balatro) */
export const POWER_EDITION_CHANCES: Record<PowerEdition, number> = { shiny: 0.02, glowing: 0.014, rainbow: 0.003, ghost: 0.003 };
/** the colours of the editions (their badges) */
export const POWER_EDITION_COLORS: Record<PowerEdition, number> = { shiny: 0xb8c4d0, glowing: 0x39c5bb, rainbow: 0xe060c0, ghost: 0x6a5a8a };

/** Legendary Power Cards are found in Boost Packs, not ordinary shop or Power Pack rarity rolls. */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5, legendary: 0 };

/**
 * What a Power Card can see of a level when the rescue count is made (at the end of the level). The count starts with
 * the lemmings saved; every Power Card, left to right, adds +Rescues to it, then multiplies it (X Rescues).
 */
export interface RescueContext {
  /** the lemmings saved: the squad and the lemmings that dropped in */
  saved: number;
  /** the lemmings of the colony saved, in the order they were saved */
  savedCards: LemmingCard[];
  /** every lemming saved, in the order they were saved (null: one that dropped in, not of the colony) */
  order: (LemmingCard | null)[];
  /** every lemming released, in the order they came out (null: not of the colony) */
  released: (LemmingCard | null)[];
  blockersUsed: number;
  emptySlots: number;
  powerCards: number;
  money: number;
  uncommonPowerCards: number;
  wise: number;
  /** what this Power Card has counted (the Trainings of the Gym Membership) */
  counter: number;
  /** the Ginger Lemming: red and orange hair count as each other */
  ginger: boolean;
  /** the colour of this Power Card (the Trendsetter's hair) */
  color?: LemmingColor;
  /** the lemming of this Power Card (Teacher's Pet), by id */
  target?: number;
  /** a Super Lemming, as the Power Cards see it (Everyone's Special: every lemming) */
  isSuper: (c: LemmingCard) => boolean;
  /** the lowest ability of the colony (with the Power Cards') */
  lowestAbility: number;
  /** the lemmings of the colony, and the ones not in the squad */
  colonySize: number;
  reserves: number;
  /** the Super Lemmings of the colony */
  colonySupers: number;
  /** the Boosts used and the levels skipped this run */
  boostsUsed: number;
  skipped: number;
  /** the level is a Level 3 */
  boss: boolean;
  /** the sell value of the other Power Cards */
  otherSellValue: number;
  /** a random number from 0 to 1 for this Power Card in this level, from the seed of the run (the Glitch) */
  roll: number;
  /** the level as it went: the skills used, what happened to every lemming of the squad, the time left, the restarts */
  skillsUsed: SkillCounts;
  fates: Fate[];
  secondsLeft: number;
  restarts: number;
  squadSize: number;
  /** the skills used in the levels won before this one, this run */
  runSkillUses: SkillCounts;
  /** the skills used in the previous level of the round (null: none won yet this round) */
  prevSkills: Skill[] | null;
  /** the lemmings of the colony that are not in the squad */
  outside: LemmingCard[];
  /** the Redraws of the level: used and left */
  redrawsUsed: number;
  redrawsLeft: number;
  /** Close Enough: the colour and skill-set conditions need one fewer */
  closeEnough: boolean;
}

const savedWithHair = (c: RescueContext, color: LemmingColor) => c.savedCards.filter((x) => hasHair(x, color, c.ginger)).length;
const firstSaved = (n: number) => (c: RescueContext) => ({ plus: Math.min(n, c.saved) });
/** every saved lemming of the colony shares a hair colour (at least `min` of them) */
const sameHair = (c: RescueContext, min = 1) =>
  c.savedCards.length >= min && LEMMING_COLORS.some((col) => c.savedCards.filter((x) => hasHair(x, col, c.ginger)).length >= c.savedCards.length - (c.closeEnough ? 1 : 0));
/** the terrain skills: Builder, Basher, Miner and Digger */
export const TERRAIN_SKILLS: readonly Skill[] = ['builder', 'basher', 'miner', 'digger'];
/** the kinds of skill used */
const kinds = (c: { skillsUsed: SkillCounts }) => SKILLS.filter((sk) => c.skillsUsed[sk] > 0).length;
/** Builder, Basher, Miner and Digger were all used (Close Enough: 3 of them) */
const allTerrain = (c: RescueContext) => TERRAIN_SKILLS.filter((sk) => c.skillsUsed[sk] > 0).length >= (c.closeEnough ? 3 : 4);
/** two skills were each used at least twice */
const twoPairs = (c: RescueContext) => SKILLS.filter((sk) => c.skillsUsed[sk] >= 2).length >= 2;
const ifThen = (cond: boolean, r: { plus?: number; times?: number }) => (cond ? r : null);

/** the skill used most (ties: the one used most before, then the first of the panel); null: none used */
export function mostUsedSkill(used: SkillCounts, before: SkillCounts = zeroCounts()): Skill | null {
  let best: Skill | null = null;
  for (const sk of SKILLS) if (used[sk] > 0 && (!best || used[sk] > used[best] || (used[sk] === used[best] && before[sk] > before[best]))) best = sk;
  return best;
}

/** Fresh Approach: the level did without the skill used most in the run before it */
export function freshApproach(runSkillUses: SkillCounts, used: SkillCounts): boolean {
  const most = mostUsedSkill(runSkillUses);
  return !!most && used[most] === 0;
}

function zeroCounts(): SkillCounts {
  return Object.fromEntries(SKILLS.map((sk) => [sk, 0])) as SkillCounts;
}
/** the Spiral Staircase: the places in the order of the saves that are Fibonacci numbers */
const FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];

/** A Super Lemming: a lemming with an edition (Gold, Lucky, Mentor, Champion, Wise), a Climber, a Floater or Insured. */
export function isSuperLemming(c: LemmingCard): boolean {
  return c.edition !== 'plain' || c.climber || c.floater || c.insured;
}

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
  goldSaved: number;
  /** what this Power Card has counted */
  counter: number;
  /** the level as it went: the skills used, the restarts, the squad */
  skillsUsedBySkill: SkillCounts;
  restarts: number;
  squadSize: number;
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
  /** raises the level's maximum of these skills (the rule breakers) */
  aboveMax?: Partial<SkillCounts>;
  /** one random skill above the level's maximum per blind */
  randomAboveMax?: boolean;
  /** extra minutes on the clock */
  extraMinutes?: number;
  /** extra bridge blocks laid by every Builder */
  extraBuilderBricks?: number;
  /** the first lemmings of the squad start with an ability */
  startClimbers?: number;
  startFloaters?: number;
  /** lemmings lost this way return to the colony */
  returns?: Fate[];
  /** the first lemming that dies in a blind returns to the colony */
  firstDeathReturns?: boolean;
  /** money at the cash out */
  payout?: (c: PayoutContext) => number;
  /** extra dollars of interest earned per $5 */
  interestPerFive?: number;
  /** plain lemmings that join the colony after every blind */
  recruitsAfterBlind?: number;
  /** lemmings that drop into every level besides the squad (not of the colony) */
  dropsExtra?: number;
  /** its part of the rescue count: +Rescues, then X Rescues */
  rescues?: (c: RescueContext) => { plus?: number; times?: number } | null;
  /** Respawns in every level */
  respawns?: number;
  /** free rerolls in every shop */
  freeRerolls?: number;
  /** Rescues permanently gained whenever the shop is rerolled */
  gainsOnReroll?: number;
  /** how far into debt the money can go */
  debt?: number;
  /** a lemming of this kind joins the colony after every level */
  joinsAfterLevel?: 'climber' | 'floater';
  /** the chance to be destroyed after a level */
  destroyChance?: number;
  /** the rescue requirement, this much lower for every level beaten in the run */
  requirementPerLevel?: number;
  /** multiplier applied to the rescue requirement of Level 3 */
  bossRequirementMultiplier?: number;
  /** all lemmings drop at once, with three times the skills */
  sneakAttack?: boolean;
  /** when a level begins, the Power Card to its left goes, its sell value to a random ability */
  recycler?: boolean;
  /** red and orange hair count as each other */
  ginger?: boolean;
  /** sell value gained after every level */
  sellValueAfterLevel?: number;
  /** Boosts created when a level begins, if there is room */
  boostsAtLevelStart?: number;
  /** counts the Tribe cards used */
  countsTraining?: boolean;
  /** what it does after a level (see RunSession.accept) */
  afterLevel?:
    | 'rainyDay'
    | 'purpleRain'
    | 'purpleBoost'
    | 'marmalade'
    | 'checklist'
    | 'changeling'
    | 'finalLap'
    | 'salon'
    | 'trendsetter'
    | 'teacherspet'
    | 'popcorn'
    | 'yorick'
    | 'countLevels'
    | 'moonLanding'
    | 'bodySnatcher'
    | 'jetpack'
    | 'goldLeaf'
    | 'campOut'
    | 'littleHelper'
    | 'roadCrew'
    | 'iceLolly'
    | 'freshApproach'
    | 'returnsDesk'
    | 'rambler';
  /** destroyed after this many levels (its counter counts them) */
  lasts?: number;
  /** what its counter counts, one for each time it happens (the cards it has, not the ones that copy it) */
  counts?: 'packSkipped' | 'joined' | 'sold' | 'luckyPaid' | 'superDied' | 'superLeft';
  /** what it does when a level begins (see RunSession.levelBegins) */
  atLevelStart?: 'stampede' | 'rabble' | 'greenParty';
  /** what it does on a Redraw (see RunSession.redraw) */
  onRedraw?: 'greenParty' | 'returnsDesk' | 'onTheJob';
  /** Close Enough: the colour and skill-set conditions need one fewer */
  closeEnough?: boolean;
  /** a lost level with 25% of the requirement saved counts as won, and it is destroyed */
  secondChance?: boolean;
  /** more (or fewer) lemmings in the squad */
  squad?: number;
  /** every lemming counts as a Super Lemming for the Power Cards */
  allSuper?: boolean;
  /** saved Super Lemmings count twice in the rescue count */
  encore?: boolean;
  /** shops and packs can offer Power Cards and Boosts you already have */
  duplicates?: boolean;
  /** multiplies every listed chance */
  chanceMultiplier?: number;
  /** offered only once this Power Card has been destroyed by its own chance (Little Mike after Big Mike) */
  onlyAfter?: string;
  /** after 2 levels, selling it copies a random Power Card */
  copyOnSell?: boolean;
  /** copies a random Boost when you leave the shop, past the Boost limit */
  boostOnShopExit?: boolean;
  /** a copy of the only lemming out after 10 seconds joins the colony */
  selfReplication?: boolean;
  /** in the level (see level-rules.ts): 0 to 6 lemmings drop in at the first splat */
  splngErr?: boolean;
  /** in the level: every explosion makes the walkers faster */
  jogging?: boolean;
  /** in the level: 4 hair colours saved within 10 seconds bring a skill back */
  spectrum?: boolean;
  /** in the level: the Floaters of the colony drop in after 10 seconds */
  paratroopers?: boolean;
  /** in the level: the last 30 seconds 5 times as fast */
  finalLap?: boolean;
  /** in the level: a skill used goes to the closest other lemming too */
  mirror?: boolean;
  /** acts as another Power Card (Copycat: the one to its right; Hive Mind: the leftmost one) */
  copies?: 'right' | 'leftmost';
  /** a copy of it would do it twice to the same thing: Copycat and Hive Mind cannot copy it */
  noCopy?: boolean;
  /** lost lemmings with these clothes respawn (however they were lost) */
  lostRespawnClothes?: LemmingColor;
  /** the description as written, with its placeholders (#clothes#, #hair#, #lemming#): see jokerText */
  rawText?: string;
}

/** Gameplay stays in code. A JSON design enters the game only when its ID has an implemented effect here. */
export const POWER_CARD_EFFECTS: Record<string, Omit<JokerDef, 'id' | 'name' | 'rarity' | 'price' | 'text'>> = {
  toolkit: { aboveMax: { builder: 1 } },
  smuggler: { randomAboveMax: true },
  overtime: { extraMinutes: 1 },
  ladder: { startClimbers: 3 },
  umbrellas: { startFloaters: 3 },
  hardhat: { firstDeathReturns: true },
  disposal: { returns: ['bombed'] },
  lifeguard: { returns: ['drowned'] },
  crashmats: { returns: ['splat'] },
  scout: { recruitsAfterBlind: 2 },
  unionrep: { payout: (c) => Math.floor(((c.rescued - c.required) * 10) / Math.max(1, c.hand)) },
  speedrun: { payout: (c) => Math.floor(c.secondsLeft / 60) },
  minimalist: { payout: (c) => (c.skillsUsed * 2 <= c.skillsAvailable ? 4 : 0) },
  headcount: { payout: (c) => Math.floor(c.colonySize / 20) },
  guild: { capacity: { builder: 2 } },
  longbridge: { extraBuilderBricks: 4 },
  demolition: { capacity: { basher: 1, miner: 1, digger: 1 } },
  trainer: { pointsAfterBoss: 5 },
  // Lematro's own Power Cards
  hitchhikers: { dropsExtra: 2 },
  rushhour: { dropsExtra: 5 },
  orangehair: { rescues: (c) => ({ plus: savedWithHair(c, 'orange') }) },
  redhair: { rescues: (c) => ({ plus: savedWithHair(c, 'red') }) },
  purplehair: { rescues: (c) => ({ plus: savedWithHair(c, 'purple') }) },
  greenhair: { rescues: (c) => ({ plus: savedWithHair(c, 'green') }) },
  medals: { rescues: firstSaved(3) },
  fewgood: { rescues: (c) => (c.saved > 0 && c.saved <= 3 ? { plus: 4 * c.saved } : null) },
  personalspace: { rescues: (c) => ({ times: Math.max(1, c.emptySlots) }) },
  paydayloan: { debt: 25 },
  recycler: { recycler: true, noCopy: true },
  goingup: { joinsAfterLevel: 'climber' },
  goingdown: { joinsAfterLevel: 'floater' },
  purplerain: { afterLevel: 'purpleRain' },
  sunset: {
    rescues: (c) => {
      const last = c.order[c.order.length - 1];
      return last && hasHair(last, 'orange', c.ginger) ? { plus: 9 } : null;
    },
  },
  marmalade: { afterLevel: 'marmalade' },
  unblocked: { rescues: (c) => ({ plus: c.blockersUsed }) },
  clown: { freeRerolls: 2 },
  elders: { rescues: (c) => ({ times: 1 + 0.2 * c.wise }) },
  stpatrick: { rescues: (c) => ({ plus: 4 * c.savedCards.filter((x) => isFully(x, 'green')).length }) },
  abstract: { rescues: (c) => ({ plus: 3 * c.powerCards }) },
  ginger: { ginger: true },
  bigmike: { respawns: 15, destroyChance: 1 / 6 },
  rainyday: { afterLevel: 'rainyDay' },
  inversecurve: { requirementPerLevel: 0.01 },
  streak: {
    rescues: (c) => {
      let n = 0;
      for (const x of c.released) n = x && clothesOf(x) === 'orange' ? 0 : n + 1;
      return { plus: n };
    },
  },
  sneak: { sneakAttack: true },
  checklist: { afterLevel: 'checklist', noCopy: true },
  changeling: { afterLevel: 'changeling', noCopy: true },
  gym: { countsTraining: true, rescues: (c) => ({ times: 1 + 0.1 * c.counter }) },
  selfrep: { selfReplication: true },
  splngerr: { splngErr: true },
  jogging: { jogging: true },
  spectrum: { spectrum: true },
  purplereign: { afterLevel: 'purpleBoost' },
  paratroopers: { paratroopers: true },
  finallap: { finalLap: true, afterLevel: 'finalLap' },
  sgnimmel: { mirror: true },
  // the suits: hair and clothes
  copycat: { copies: 'right' },
  hivemind: { copies: 'leftmost' },
  follow: {
    rescues: (c) => {
      let n = 0;
      for (let i = 1; i < c.order.length; i++) {
        const a = c.order[i - 1];
        const b = c.order[i];
        if (a && b && hasHair(b, hairOf(a), c.ginger)) n++;
      }
      return { plus: n };
    },
  },
  paintbox: { rescues: (c) => ifThen(LEMMING_COLORS.filter((col) => c.savedCards.some((x) => hairOf(x) === col)).length >= (c.closeEnough ? 4 : 5), { times: 3 }) },
  trendsetter: { afterLevel: 'trendsetter', rescues: (c) => ({ times: 1.1 ** c.savedCards.filter((x) => !!c.color && hasHair(x, c.color, c.ginger)).length }) },
  teacherspet: { afterLevel: 'teacherspet', rescues: (c) => (c.target !== undefined && c.savedCards.some((x) => x.id === c.target) ? { times: 2 } : null) },
  jumpsuit: { rescues: (c) => ({ plus: 3 * c.savedCards.filter((x) => clothesOf(x) === 'orange').length }) },
  redshirts: { rescues: (c) => ({ times: 1.2 ** c.savedCards.filter((x) => clothesOf(x) === 'red').length }) },
  camouflage: { lostRespawnClothes: 'green' },
  coordinated: { rescues: (c) => ({ times: 1.2 ** c.savedCards.filter((x) => hairOf(x) === clothesOf(x)).length }) },
  salon: { afterLevel: 'salon' },
  // Balatro families that did not yet have a Lematro counterpart
  goldenlemming: { payout: () => 4 },
  goldenticket: { payout: (c) => 4 * c.goldSaved },
  bootstraps: { rescues: (c) => ({ plus: 2 * Math.floor(Math.max(0, c.money) / 5) }) },
  baseball: { rescues: (c) => ({ times: 1.5 ** c.uncommonPowerCards }) },
  flashcard: { gainsOnReroll: 2, rescues: (c) => ({ plus: c.counter }) },
  hangingchad: { rescues: (c) => ({ plus: c.saved > 0 ? 2 : 0 }) },
  nestegg: { sellValueAfterLevel: 3, noCopy: true },
  cartomancer: { boostsAtLevelStart: 1, noCopy: true },
  popcorn: { rescues: (c) => ({ plus: Math.max(0, 20 - 4 * c.counter) }), afterLevel: 'popcorn' },
  tothemoon: { interestPerFive: 1 },
  // Legendaries: found very rarely in Boost Packs, never in ordinary shops or Power Packs
  triboulet: {
    rescues: (c) => ({ times: 2 ** c.savedCards.filter((x) => x.edition === 'gold' || x.edition === 'champion').length }),
  },
  yorick: { rescues: (c) => ({ times: 1 + Math.floor(c.counter / 23) }), afterLevel: 'yorick' },
  chicot: { bossRequirementMultiplier: 0.5, noCopy: true },
  // Lematro Phase 1: the Balatro jokers that run on the hooks the game already has
  lemming: { rescues: () => ({ plus: 4 }) },
  matchingset: { rescues: (c) => (sameHair(c, 3) ? { plus: 5 } : null) },
  samehair: { rescues: (c) => (sameHair(c) ? { plus: 3 } : null) },
  longservice: { afterLevel: 'countLevels', rescues: (c) => (c.counter % 6 === 5 ? { times: 3 } : null) },
  glitch: { rescues: (c) => ({ plus: Math.floor(c.roll * 16) }) },
  weakestlink: { rescues: (c) => ({ plus: 2 * c.lowestAbility }) },
  spiral: { rescues: (c) => ({ plus: 2 * FIBONACCI.filter((n) => n <= c.saved).length }) },
  starturn: { rescues: (c) => ({ plus: 3 * c.savedCards.filter(c.isSuper).length }) },
  rankandfile: { rescues: (c) => ({ plus: c.savedCards.filter((x) => !c.isSuper(x)).length }) },
  everyonespecial: { allSuper: true },
  moonlanding: { afterLevel: 'moonLanding' },
  nightshift: { rescues: (c) => (c.savedCards.length && c.savedCards.every((x) => hairOf(x) === 'purple' || hairOf(x) === 'green') ? { times: 3 } : null) },
  reserves: { rescues: (c) => ({ plus: Math.floor(Math.max(0, c.reserves) / 5) }) },
  littlemike: { rescues: () => ({ times: 3 }), destroyChance: 1 / 1000, onlyAfter: 'bigmike' },
  nothanks: { counts: 'packSkipped', rescues: (c) => ({ plus: 2 * c.counter }) },
  stampede: { atLevelStart: 'stampede', rescues: (c) => ({ times: 1 + 0.25 * c.counter }) },
  rabble: { atLevelStart: 'rabble', noCopy: true },
  bodysnatcher: { afterLevel: 'bodySnatcher', rescues: (c) => ({ times: 1 + 0.1 * (c.counter + new Set(c.savedCards.filter(c.isSuper)).size) }) },
  populationboom: { counts: 'joined', rescues: (c) => ({ times: 1 + 0.1 * c.counter }) },
  jetpack: { afterLevel: 'jetpack', payout: (c) => 1 + c.counter },
  goldleaf: { afterLevel: 'goldLeaf', noCopy: true },
  photofinish: { rescues: (c) => (c.order[0] && c.isSuper(c.order[0]) ? { times: 2 } : null) },
  thinranks: { rescues: (c) => ({ plus: 2 * Math.max(0, START_COLONY - c.colonySize) }) },
  boosterclub: { rescues: (c) => ({ plus: c.boostsUsed }) },
  plusone: { squad: 1 },
  rabbitsfoot: { counts: 'luckyPaid', rescues: (c) => ({ times: 1 + 0.1 * c.counter }) },
  bullmarket: { rescues: (c) => ({ plus: Math.floor(Math.max(0, c.money) / 2) }) },
  fizzypop: { afterLevel: 'countLevels', lasts: 3, rescues: () => ({ times: 2 }) },
  campout: { counts: 'sold', afterLevel: 'campOut', rescues: (c) => ({ times: 1 + 0.25 * c.counter }) },
  grandfinale: { rescues: (c) => (c.boss ? { times: 2 } : null) },
  encore: { encore: true },
  treasurechest: { rescues: (c) => ({ plus: c.otherSellValue }) },
  skippingrope: { rescues: (c) => ({ times: 1 + 0.25 * c.skipped }) },
  fragile: { counts: 'superDied', rescues: (c) => ({ times: 1 + 0.25 * c.counter }) },
  stagedoor: { duplicates: true },
  littlehelper: { afterLevel: 'littleHelper', rescues: (c) => ({ plus: Math.floor(c.counter / 10) }) },
  loadeddice: { chanceMultiplier: 2 },
  birds: { rescues: (c) => (sameHair(c) ? { times: 2 } : null) },
  stuntdouble: { rescues: () => ({ plus: 20 }), squad: -2 },
  mirrorimage: { afterLevel: 'countLevels', copyOnSell: true, noCopy: true },
  supersquad: { rescues: (c) => (c.colonySupers >= 16 ? { times: 3 } : null) },
  ohno: { counts: 'superLeft', rescues: (c) => ({ times: 1 + c.counter }) },
  yippee: { boostOnShopExit: true },
  // Lematro Phase 2: the level as it went (the skills used, the restarts) and the Redraws
  doubleact: { rescues: (c) => ifThen(kinds(c) === 2, { plus: 4 }) },
  threescompany: { rescues: (c) => ifThen(kinds(c) === 3, { plus: 6 }) },
  tagteam: { rescues: (c) => ifThen(twoPairs(c), { plus: 5 }) },
  groundworks: { rescues: (c) => ifThen(allTerrain(c), { plus: 6 }) },
  twostep: { rescues: (c) => ifThen(kinds(c) === 2, { plus: 2 }) },
  hattrick: { rescues: (c) => ifThen(kinds(c) === 3, { plus: 3 }) },
  doubleshift: { rescues: (c) => ifThen(twoPairs(c), { plus: 3 }) },
  earthworks: { rescues: (c) => ifThen(allTerrain(c), { plus: 3 }) },
  closeenough: { closeEnough: true },
  oldfavourite: {
    rescues: (c) => {
      const sk = mostUsedSkill(c.skillsUsed, c.runSkillUses);
      return sk ? { plus: Math.floor((c.runSkillUses[sk] + c.skillsUsed[sk]) / 5) } : null;
    },
  },
  roadcrew: { afterLevel: 'roadCrew', rescues: (c) => ({ plus: 2 * (c.counter + (allTerrain(c) ? 1 : 0)) }) },
  icelolly: { afterLevel: 'iceLolly', rescues: (c) => ({ plus: Math.max(0, 30 - 3 * (c.counter + c.restarts)) }) },
  sameagain: { rescues: (c) => ifThen(!!c.prevSkills && sameSkills(c.prevSkills, c.skillsUsed), { times: 2 }) },
  lordofthemanor: { rescues: (c) => ({ times: 1.2 ** c.outside.filter((x) => x.edition === 'champion').length }) },
  freshapproach: { afterLevel: 'freshApproach', rescues: (c) => ifThen(freshApproach(c.runSkillUses, c.skillsUsed), { times: 1 + 0.2 * (c.counter + 1) }) },
  secondchance: { secondChance: true, noCopy: true },
  thepair: { rescues: (c) => ifThen(kinds(c) === 2, { times: 1.5 }) },
  threemusketeers: { rescues: (c) => ifThen(kinds(c) === 3, { times: 2 }) },
  workaholic: { rescues: (c) => ifThen(SKILLS.some((sk) => c.skillsUsed[sk] >= 4), { times: 2 }) },
  workforce: { rescues: (c) => ifThen(allTerrain(c), { times: 2 }) },
  starpupils: { rescues: (c) => ({ plus: 5 * c.outside.filter((x) => x.edition === 'mentor').length }) },
  steadysquad: { rescues: (c) => ({ plus: 5 * c.redrawsLeft }) },
  cleansweep: { rescues: (c) => ifThen(c.redrawsLeft === 0 && c.redrawsUsed > 0, { plus: 8 }) },
  greenparty: { atLevelStart: 'greenParty', onRedraw: 'greenParty', rescues: (c) => ({ plus: c.counter }) },
  returnsdesk: { afterLevel: 'returnsDesk', onRedraw: 'returnsDesk' },
  onthejob: { onRedraw: 'onTheJob' },
  // Lematro Phase 4
  rambler: { afterLevel: 'rambler' },
};

/** the same kinds of skill used (and at least one) */
function sameSkills(prev: readonly Skill[], used: SkillCounts): boolean {
  const now = SKILLS.filter((sk) => used[sk] > 0);
  return now.length > 0 && now.length === prev.length && now.every((sk) => prev.includes(sk));
}

/** The Power Cards that were cut from the game: a saved run that has one sells it when it is loaded. */
export const CUT_POWER_CARDS: Record<string, { name: string; price: number }> = {
  shelter: { name: 'Fallout Shelter', price: 4 },
  nolem: { name: 'Leave No Lem Behind', price: 4 },
  piggy: { name: 'Piggy Bank', price: 5 },
  climbclub: { name: 'Climbing Club', price: 4 },
  bombsquad: { name: 'Bomb Squad', price: 4 },
  advisor: { name: 'Careers Advisor', price: 4 },
  stowaway: { name: 'Stowaway', price: 4 },
  gatecrashers: { name: 'Gatecrashers', price: 6 },
  coachtrip: { name: 'Coach Trip', price: 7 },
  firstpast: { name: 'First Past the Post', price: 3 },
  podium: { name: 'Podium', price: 4 },
  wastenot: { name: 'Waste Not', price: 5 },
  bluebombers: { name: 'Blue Bombers', price: 5 },
  omelette: { name: 'Omelette', price: 4 },
  bluecollar: { name: 'Blue Collar', price: 4 },
  royalpurple: { name: 'Royal Purple', price: 5 },
};

/** what the placeholders of a description say before a Power Card has a colour or a lemming of its own */
const PLACEHOLDER_DEFAULTS: Record<string, string> = { clothes: '{c:red}Red{}', hair: '{c:orange}Orange{}', lemming: '{!}a random lemming{}' };

/**
 * The description of a Power Card, its placeholders filled: with what a Power Card of the run has (its colour, its
 * lemming), or else as it starts.
 */
export function jokerText(d: JokerDef, j?: { color?: LemmingColor; target?: number }, lemmingName?: (id: number) => string | undefined): string {
  return (d.rawText ?? d.text).replace(/#(clothes|hair|lemming)#/g, (_, what: string) => {
    if (what === 'lemming') {
      const name = j?.target !== undefined ? lemmingName?.(j.target) : undefined;
      return name ? `{!}${name}{}` : PLACEHOLDER_DEFAULTS.lemming;
    }
    return j?.color ? `{c:${j.color}}${COLOR_NAMES[j.color]}{}` : PLACEHOLDER_DEFAULTS[what];
  });
}

export function playablePowerCards(library: PowerCardLibrary): readonly JokerDef[] {
  return library.cards
    .filter((card) => Object.hasOwn(POWER_CARD_EFFECTS, card.id))
    .map((card) => {
      const d: JokerDef = { id: card.id, name: card.name, rarity: card.rarity, price: card.price, text: card.description, rawText: card.description, ...POWER_CARD_EFFECTS[card.id] };
      return { ...d, text: jokerText(d) };
    });
}
export const JOKERS: readonly JokerDef[] = playablePowerCards(POWER_CARD_LIBRARY);

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
  /** the colour of hair it gives (a dye) */
  hair?: LemmingColor;
  /** it takes exactly two lemmings: the first becomes like the second (Balatro's Death) */
  pair?: boolean;
  /** a Boost (Balatro's tarots), or a Tribe card (Balatro's planets: each levels up a skill) */
  kind?: 'boost' | 'tribe';
  /** a Mayhem boost (Balatro's spectrals): rare and strong, found in Mayhem Packs and now and then in a Boost Pack */
  rare?: boolean;
  /** the skill a Tribe card levels up (+2 ability) */
  tribeSkill?: Skill;
}

export const TAROTS: readonly TarotDef[] = [
  { id: 'umbrella', name: 'The Umbrella', price: 3, text: 'Makes up to {!}3{} selected lemmings {s}Floaters{}', select: 3 },
  { id: 'gear', name: 'The Climbing Gear', price: 3, text: 'Makes up to {!}3{} selected lemmings {s}Climbers{}', select: 3 },
  { id: 'midas', name: 'The Gilding', price: 3, text: 'Makes {!}1{} selected lemming {!}Gold{}', select: 1 },
  { id: 'clover', name: 'The Four-Leaf', price: 3, text: 'Makes up to {!}2{} selected lemmings {!}Lucky{}', select: 2 },
  { id: 'mentor', name: 'The Mentor', price: 3, text: 'Makes {!}1{} selected lemming a {!}Mentor{}', select: 1 },
  { id: 'laurel', name: 'The Laurel', price: 3, text: 'Makes {!}1{} selected lemming a {!}Champion{}', select: 1 },
  { id: 'policy', name: 'The Policy', price: 3, text: 'Makes up to {!}2{} selected lemmings {!}Insured{}', select: 2 },
  {
    id: 'manual',
    name: 'Retraining Manual',
    price: 3,
    text: 'Up to {!}3{} selected lemmings leave the colony for {!}+2{} ability each',
    select: 3,
    skillText: (s) => `Up to {!}3{} selected lemmings leave the colony for {!}+2{} {s}${s}{} ability each`,
  },
  { id: 'hermit', name: 'The Golden Handshake', price: 3, text: 'Up to {!}3{} selected lemmings retire for {$}$4{} each', select: 3 },
  { id: 'recruiter', name: 'The Recruiter', price: 3, text: '{!}5{} lemmings join the colony', select: 0 },
  { id: 'bootcamp', name: 'Boot Camp', price: 3, text: '{!}+5{} ability points to assign now', select: 0 },
  { id: 'rethink', name: 'The Rethink', price: 3, text: 'Move up to {!}10{} ability points now', select: 0 },
  { id: 'sage', name: 'The Sage', price: 3, text: 'Makes {!}1{} selected lemming {!}Wise{}', select: 1 },
  // the colours (Balatro's suit tarots, and Death)
  { id: 'ember', name: 'The Ember', price: 3, text: 'Gives up to {!}3{} selected lemmings {c:red}Red{} hair', select: 3, hair: 'red' },
  { id: 'tangerine', name: 'The Tangerine', price: 3, text: 'Gives up to {!}3{} selected lemmings {c:orange}Orange{} hair', select: 3, hair: 'orange' },
  { id: 'amethyst', name: 'The Amethyst', price: 3, text: 'Gives up to {!}3{} selected lemmings {c:purple}Purple{} hair', select: 3, hair: 'purple' },
  { id: 'sapphire', name: 'The Sapphire', price: 3, text: 'Gives up to {!}3{} selected lemmings {c:blue}Blue{} hair', select: 3, hair: 'blue' },
  { id: 'barber', name: 'The Barber', price: 3, text: 'Select {!}2{} lemmings: the first gets the hair of the second', select: 2, pair: true },
  { id: 'tailor', name: 'The Tailor', price: 3, text: 'Select {!}2{} lemmings: the first gets the clothes of the second', select: 2, pair: true },
  // Lematro Phase 1
  { id: 'foreman', name: 'The Foreman', price: 3, text: 'Creates up to {!}2{} random {!}Boosts{}, if there is room', select: 0 },
  { id: 'audition', name: 'The Audition', price: 3, text: 'Creates a random {!}Power Card{}, if there is room', select: 0 },
  { id: 'lottery', name: 'The Lottery', price: 3, text: '{%}1 in 4{} chance to make a random Power Card {!}Shiny{}, {!}Glowing{} or {!}Rainbow{}', select: 0 },
  // the Mayhem boosts (Balatro's spectrals), named after the Mayhem rating
  { id: 'conscription', name: 'Conscription', price: 4, rare: true, text: '{!}5{} random plain lemmings leave, {!}3{} random {!}Super Lemmings{} join', select: 0 },
  { id: 'vat', name: 'The Cloning Vat', price: 4, rare: true, text: 'Creates a copy of {!}1{} selected lemming', select: 1 },
  { id: 'reaper', name: 'The Reaper', price: 4, rare: true, text: '{!}1{} random lemming leaves, {!}2{} random {!}Champions{} join', select: 0 },
  { id: 'summoning', name: 'The Summoning', price: 4, rare: true, text: '{!}1{} random lemming leaves, {!}4{} random {!}Super Lemmings{} join', select: 0 },
  { id: 'makeover', name: 'The Makeover', price: 4, rare: true, text: '{!}1{} selected plain lemming becomes {!}Gold{}, {!}Lucky{}, {!}Mentor{}, {!}Champion{} or {!}Wise{}', select: 1 },
  { id: 'biggamble', name: 'The Big Gamble', price: 4, rare: true, text: 'Creates a {!}Rare{} Power Card. Your money goes to {$}$0{}', select: 0 },
  { id: 'dyevat', name: 'The Dye Vat', price: 4, rare: true, text: 'Every lemming of the colony gets the same random hair colour', select: 0 },
  { id: 'uniform', name: 'The Uniform', price: 4, rare: true, text: 'Every lemming gets the same random clothes colour. {!}-1{} lemming in every squad', select: 0 },
  { id: 'phantom', name: 'The Phantom', price: 4, rare: true, text: 'A random Power Card becomes {!}Ghost{}. {!}-1{} lemming in every squad', select: 0 },
  { id: 'bonfire', name: 'The Bonfire', price: 4, rare: true, text: '{!}5{} random lemmings leave the colony. Earn {$}$20{}', select: 0 },
  { id: 'solesurvivor', name: 'The Sole Survivor', price: 4, rare: true, text: 'Copies a random Power Card. All your other Power Cards are destroyed', select: 0 },
  { id: 'goldbadge', name: 'The Gold Badge', price: 4, rare: true, text: '{!}1{} selected lemming gets a {!}Gold Badge{}', select: 1 },
  { id: 'redbadge', name: 'The Red Badge', price: 4, rare: true, text: '{!}1{} selected lemming gets a {!}Red Badge{}', select: 1 },
  { id: 'bluebadge', name: 'The Blue Badge', price: 4, rare: true, text: '{!}1{} selected lemming gets a {!}Blue Badge{}', select: 1 },
  { id: 'purplebadge', name: 'The Purple Badge', price: 4, rare: true, text: '{!}1{} selected lemming gets a {!}Purple Badge{}', select: 1 },
  { id: 'prism', name: 'The Prism', price: 4, rare: true, text: 'A random Power Card becomes {!}Rainbow{}. All the others are destroyed', select: 0 },
  // the Tribe cards (Balatro's planets): the tribes of Lemmings 2, each levels up a skill
  ...(
    [
      ['classic', 'Classic Tribe', null],
      ['highland', 'Highland Tribe', 'climber'],
      ['circus', 'Circus Tribe', 'floater'],
      ['egyptian', 'Egyptian Tribe', 'builder'],
      ['medieval', 'Medieval Tribe', 'blocker'],
      ['space', 'Space Tribe', 'bomber'],
      ['cavelem', 'Cavelem Tribe', 'digger'],
      ['sports', 'Sports Tribe', 'basher'],
      ['outdoor', 'Outdoor Tribe', 'miner'],
    ] as const
  ).map(
    ([id, name, skill]): TarotDef => ({
      id,
      name,
      price: 3,
      kind: 'tribe',
      select: 0,
      ...(skill ? { tribeSkill: skill, text: `{!}+2{} {s}${skill[0].toUpperCase() + skill.slice(1)}{} ability` } : { text: '{!}+2{} ability in a random skill' }),
    }),
  ),
  { id: 'beach', name: 'Beach Tribe', price: 3, kind: 'tribe', select: 0, text: '{!}+1{} lemming in every squad' },
  { id: 'polar', name: 'Polar Tribe', price: 3, kind: 'tribe', select: 0, text: '{!}+20{} seconds on the clock in every level' },
  { id: 'shadow', name: 'Shadow Tribe', price: 3, kind: 'tribe', select: 0, text: '{!}+1{} Respawn in every level' },
];

/** the Boosts (Balatro's tarots) and the Tribe cards (its planets) */
export const BOOSTS: readonly TarotDef[] = TAROTS.filter((t) => t.kind !== 'tribe' && !t.rare);
export const MAYHEM: readonly TarotDef[] = TAROTS.filter((t) => t.rare);
export const TRIBES: readonly TarotDef[] = TAROTS.filter((t) => t.kind === 'tribe');

export function tarotDef(id: string): TarotDef {
  const t = TAROTS.find((d) => d.id === id);
  if (!t) throw new Error('unknown tarot ' + id);
  return t;
}

/* ---------------------------------------------------------------------------------------------- packs */

export type PackKind = 'lemmings' | 'training' | 'boost' | 'gadget' | 'mayhem';

export interface PackDef {
  kind: PackKind;
  name: string;
  price: number;
  /** how many cards it shows (one is chosen) */
  size: number;
  text: string;
}

export const PACKS: Record<PackKind, PackDef> = {
  lemmings: { kind: 'lemmings', name: 'Lemmings Pack', price: 4, size: 3, text: 'Choose {!}1{} of {!}3{} groups of lemmings to join your colony' },
  // (its id of old: the Tribe Pack was the Training Pack)
  training: { kind: 'training', name: 'Tribe Pack', price: 4, size: 3, text: 'Choose {!}1{} of {!}3{} {!}Tribe cards{} to use at once' },
  boost: { kind: 'boost', name: 'Boost Pack', price: 4, size: 3, text: 'Choose {!}1{} of {!}3{} {!}Boosts{} to use at once. A {!}Legendary{} Power Card can rarely appear' },
  gadget: { kind: 'gadget', name: 'Power Pack', price: 6, size: 2, text: 'Choose {!}1{} of {!}2{} {!}Power Cards{}' },
  mayhem: { kind: 'mayhem', name: 'Mayhem Pack', price: 4, size: 2, text: 'Choose {!}1{} of {!}2{} {!}Mayhem{} boosts to use at once' },
};

/* ---------------------------------------------------------------------------------------------- tags */

export interface TagDef {
  id: string;
  name: string;
  text: string;
}

export const TAGS: readonly TagDef[] = [
  { id: 'recruits', name: 'Recruitment Drive', text: '{!}8{} plain lemmings join the colony' },
  { id: 'umbrellas', name: 'Umbrella Bonus', text: '{!}5{} random lemmings become {s}Floaters{}' },
  { id: 'golden', name: 'Golden Exit', text: 'Doubles the payout of the next {!}Level 3{}' },
  { id: 'supply', name: 'Supply Drop', text: 'Opens a free {!}Tribe Pack{} at once' },
  { id: 'clone', name: 'Clone Bonus', text: 'Creates a copy of a random {!}Super Lemming{} (or a plain one)' },
  { id: 'investment', name: 'Retirement Fund', text: 'Earn {$}$10{} after the next {!}Level 3{}' },
  { id: 'coupon', name: 'Free Lunch', text: 'The offers in the next shop are {$}free{}' },
  { id: 'training', name: 'Training Bonus', text: '{!}+3{} ability in a random skill' },
  { id: 'economy', name: 'Colony Dividend', text: 'Earn {$}$1{} for every {!}10{} lemmings in your colony' },
  // Lematro Phase 1
  { id: 'uncommon', name: 'Uncommon Bonus', text: 'The next shop has a free {!}Uncommon{} Power Card' },
  { id: 'rare', name: 'Rare Bonus', text: 'The next shop has a free {!}Rare{} Power Card' },
  { id: 'directorscut', name: "Director's Cut Bonus", text: "A free {!}Director's Cut{} reroll of the next {!}Level 3{}" },
  { id: 'boostpack', name: 'Boost Bonus', text: 'Opens a free {!}Boost Pack{} at once' },
  { id: 'powerpack', name: 'Power Bonus', text: 'Opens a free {!}Power Pack{} at once' },
  { id: 'crowd', name: 'Crowd Bonus', text: '{!}+3{} lemmings in the squad of the next level' },
  { id: 'reroll', name: 'Reroll Bonus', text: 'Rerolls in the next shop start at {$}$0{}' },
  { id: 'reinforcements', name: 'Reinforcements', text: 'Up to {!}2{} Common Power Cards, if there is room' },
  { id: 'fasttrack', name: 'Fast Track', text: 'Earn {$}$5{} for each level skipped this run' },
  // Lematro Phase 2
  { id: 'sparechange', name: 'Spare Change', text: 'Earn {$}$2{} for each {!}Redraw{} left unused this run' },
  // Lematro Phase 3
  { id: 'ghostbonus', name: 'Ghost Bonus', text: 'The next Power Card you get is {!}Ghost{}' },
  { id: 'shinybonus', name: 'Shiny Bonus', text: 'The next Power Card you get is {!}Shiny{}' },
  { id: 'glowingbonus', name: 'Glowing Bonus', text: 'The next Power Card you get is {!}Glowing{}' },
  { id: 'rainbowbonus', name: 'Rainbow Bonus', text: 'The next Power Card you get is {!}Rainbow{}' },
  { id: 'mayhembonus', name: 'Mayhem Bonus', text: 'Opens a free {!}Mayhem Pack{} at once' },
];

export function tagDef(id: string): TagDef {
  const t = TAGS.find((d) => d.id === id);
  if (!t) throw new Error('unknown tag ' + id);
  return t;
}
