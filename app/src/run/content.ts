/**
 * The roguelike content: lemming card editions, jokers (passive gadgets), tarots (consumables) and tags (rewards for
 * skipping a blind). None of them changes how a level plays, except the few rule breakers that say so: they add a
 * skill above the level's maximum, time on the clock, or start lemmings with an ability.
 */
import { clothesOf, COLOR_NAMES, hairOf, hasHair, isFully, LEMMING_COLORS, type LemmingColor } from './colors.ts';
import type { SkillCounts } from './skills.ts';
import type { LemmingCard } from './state.ts';
import { POWER_CARD_LIBRARY } from './power-cards/catalogue.ts';
import type { Rarity } from './power-cards/schema.ts';
import type { PowerCardLibrary } from './power-cards/schema.ts';
export type { Rarity } from './power-cards/schema.ts';

/* ---------------------------------------------------------------------------------------------- lemming cards */

/** what a lemming card is worth outside the level (one per card) */
export type Edition = 'plain' | 'gold' | 'lucky' | 'mentor' | 'champion' | 'wise';

export const EDITION_NAMES: Record<Edition, string> = { plain: 'Lemming', gold: 'Gold', lucky: 'Lucky', mentor: 'Mentor', champion: 'Champion', wise: 'Wise' };

/** what the abilities of a lemming do (in every level), as a description is written */
export const TRAIT_TEXTS = {
  climber: '{!}Climbs{} walls in every level',
  floater: 'Opens an {!}umbrella{} when it falls, in every level',
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

export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 70, uncommon: 25, rare: 5 };

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
  wise: number;
  /** what this Power Card has counted (the Trainings of the Gym Membership) */
  counter: number;
  /** the Ginger Lemming: red and orange hair count as each other */
  ginger: boolean;
  /** the colour of this Power Card (the Trendsetter's hair) */
  color?: LemmingColor;
  /** the lemming of this Power Card (Teacher's Pet), by id */
  target?: number;
}

const savedWithHair = (c: RescueContext, color: LemmingColor) => c.savedCards.filter((x) => hasHair(x, color, c.ginger)).length;
const firstSaved = (n: number) => (c: RescueContext) => ({ plus: Math.min(n, c.saved) });

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
  /** lemmings that drop into every level besides the squad (not of the colony) */
  dropsExtra?: number;
  /** its part of the rescue count: +Rescues, then X Rescues */
  rescues?: (c: RescueContext) => { plus?: number; times?: number } | null;
  /** Respawns in every level */
  respawns?: number;
  /** free rerolls in every shop */
  freeRerolls?: number;
  /** how far into debt the money can go */
  debt?: number;
  /** a lemming of this kind joins the colony after every level */
  joinsAfterLevel?: 'climber' | 'floater';
  /** the chance to be destroyed after a level */
  destroyChance?: number;
  /** the rescue requirement, this much lower for every level beaten in the run */
  requirementPerLevel?: number;
  /** all lemmings drop at once, with three times the skills */
  sneakAttack?: boolean;
  /** when a level begins, the Power Card to its left goes, its sell value to a random ability */
  recycler?: boolean;
  /** red and orange hair count as each other */
  ginger?: boolean;
  /** lemmings with these clothes that explode respawn */
  respawnClothes?: LemmingColor;
  /** sell value gained for every lemming that splats */
  splatValue?: number;
  /** counts the Trainings used */
  countsTraining?: boolean;
  /** what it does after a level (see RunSession.accept) */
  afterLevel?: 'wasteNot' | 'rainyDay' | 'purpleRain' | 'purpleBoost' | 'marmalade' | 'checklist' | 'changeling' | 'finalLap' | 'royalPurple' | 'salon' | 'trendsetter' | 'teacherspet';
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
  shelter: { returns: ['nuked'] },
  lifeguard: { returns: ['drowned'] },
  crashmats: { returns: ['splat'] },
  scout: { recruitsAfterBlind: 2 },
  unionrep: { payout: (c) => Math.floor(((c.rescued - c.required) * 10) / Math.max(1, c.hand)) },
  nolem: { payout: (c) => (c.perfect ? 3 : 0) },
  piggy: { interestCap: 5 },
  speedrun: { payout: (c) => Math.floor(c.secondsLeft / 60) },
  minimalist: { payout: (c) => (c.skillsUsed * 2 <= c.skillsAvailable ? 4 : 0) },
  headcount: { payout: (c) => Math.floor(c.colonySize / 20) },
  guild: { capacity: { builder: 2 } },
  demolition: { capacity: { basher: 1, miner: 1, digger: 1 } },
  climbclub: { capacity: { climber: 2, floater: 2 } },
  bombsquad: { capacity: { bomber: 2, blocker: 2 } },
  trainer: { pointsAfterBoss: 5 },
  advisor: { reassignAfterBoss: 5 },
  // Lematro's own Power Cards
  stowaway: { dropsExtra: 1 },
  hitchhikers: { dropsExtra: 2 },
  gatecrashers: { dropsExtra: 3 },
  coachtrip: { dropsExtra: 4 },
  rushhour: { dropsExtra: 5 },
  orangehair: { rescues: (c) => ({ plus: savedWithHair(c, 'orange') }) },
  redhair: { rescues: (c) => ({ plus: savedWithHair(c, 'red') }) },
  purplehair: { rescues: (c) => ({ plus: savedWithHair(c, 'purple') }) },
  greenhair: { rescues: (c) => ({ plus: savedWithHair(c, 'green') }) },
  firstpast: { rescues: firstSaved(1) },
  podium: { rescues: firstSaved(2) },
  medals: { rescues: firstSaved(3) },
  fewgood: { rescues: (c) => (c.saved > 0 && c.saved <= 3 ? { plus: 4 * c.saved } : null) },
  personalspace: { rescues: (c) => ({ times: Math.max(1, c.emptySlots) }) },
  wastenot: { afterLevel: 'wasteNot' },
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
  bluebombers: { respawnClothes: 'blue' },
  inversecurve: { requirementPerLevel: 0.01 },
  streak: {
    rescues: (c) => {
      let n = 0;
      for (const x of c.released) n = x && clothesOf(x) === 'orange' ? 0 : n + 1;
      return { plus: n };
    },
  },
  omelette: { splatValue: 3, noCopy: true },
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
  paintbox: { rescues: (c) => (LEMMING_COLORS.every((col) => c.savedCards.some((x) => hairOf(x) === col)) ? { times: 3 } : null) },
  trendsetter: { afterLevel: 'trendsetter', rescues: (c) => ({ times: 1.1 ** c.savedCards.filter((x) => !!c.color && hasHair(x, c.color, c.ginger)).length }) },
  teacherspet: { afterLevel: 'teacherspet', rescues: (c) => (c.target !== undefined && c.savedCards.some((x) => x.id === c.target) ? { times: 2 } : null) },
  bluecollar: { rescues: (c) => ({ plus: Math.floor(c.savedCards.filter((x) => clothesOf(x) === 'blue').length / 4) }) },
  jumpsuit: { rescues: (c) => ({ plus: 3 * c.savedCards.filter((x) => clothesOf(x) === 'orange').length }) },
  royalpurple: { afterLevel: 'royalPurple' },
  redshirts: { rescues: (c) => ({ times: 1.2 ** c.savedCards.filter((x) => clothesOf(x) === 'red').length }) },
  camouflage: { lostRespawnClothes: 'green' },
  coordinated: { rescues: (c) => ({ times: 1.2 ** c.savedCards.filter((x) => hairOf(x) === clothesOf(x)).length }) },
  salon: { afterLevel: 'salon' },
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
}

export const TAROTS: readonly TarotDef[] = [
  { id: 'umbrella', name: 'The Umbrella', price: 3, text: 'Makes up to {!}3{} selected lemmings {!}Floaters{}', select: 3 },
  { id: 'gear', name: 'The Climbing Gear', price: 3, text: 'Makes up to {!}3{} selected lemmings {!}Climbers{}', select: 3 },
  { id: 'midas', name: 'The Midas', price: 3, text: 'Makes {!}1{} selected lemming {!}Gold{}', select: 1 },
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
    skillText: (s) => `Up to {!}3{} selected lemmings leave the colony for {!}+2{} ${s} ability each`,
  },
  { id: 'conscription', name: 'Conscription', price: 3, text: '{!}5{} random plain lemmings leave, {!}3{} random {!}Super Lemmings{} join', select: 0 },
  { id: 'vat', name: 'The Cloning Vat', price: 3, text: 'Creates a copy of {!}1{} selected lemming', select: 1 },
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
];

export function tarotDef(id: string): TarotDef {
  const t = TAROTS.find((d) => d.id === id);
  if (!t) throw new Error('unknown tarot ' + id);
  return t;
}

/* ---------------------------------------------------------------------------------------------- packs */

export type PackKind = 'lemmings' | 'training' | 'boost' | 'gadget';

export interface PackDef {
  kind: PackKind;
  name: string;
  price: number;
  /** how many cards it shows (one is chosen) */
  size: number;
  text: string;
}

export const PACKS: Record<PackKind, PackDef> = {
  lemmings: { kind: 'lemmings', name: 'Lemmings Pack', price: 4, size: 3, text: 'Choose 1 of 3 groups of lemmings to join your colony.' },
  training: { kind: 'training', name: 'Training Pack', price: 4, size: 3, text: 'Choose 1 of 3 changes to your abilities.' },
  boost: { kind: 'boost', name: 'Boost Pack', price: 4, size: 3, text: 'Choose 1 of 3 boosts, used at once.' },
  gadget: { kind: 'gadget', name: 'Power Pack', price: 6, size: 2, text: 'Choose 1 of 2 Power Cards.' },
};

/* ---------------------------------------------------------------------------------------------- tags */

export interface TagDef {
  id: string;
  name: string;
  text: string;
}

export const TAGS: readonly TagDef[] = [
  { id: 'recruits', name: 'Recruitment Drive', text: '8 plain lemmings join the colony.' },
  { id: 'umbrellas', name: 'Umbrella Bonus', text: '5 random lemmings become Floaters.' },
  { id: 'golden', name: 'Golden Exit', text: 'Doubles the payout of the next Level 3.' },
  { id: 'supply', name: 'Supply Drop', text: 'The next shop has 2 more training offers.' },
  { id: 'clone', name: 'Clone Bonus', text: 'A random special lemming is duplicated (or a plain one).' },
  { id: 'investment', name: 'Investment Bonus', text: '+$10 after the next Level 3.' },
  { id: 'coupon', name: 'Coupon Bonus', text: 'The offers in the next shop are free.' },
  { id: 'training', name: 'Training Bonus', text: '+3 ability in a random skill.' },
  { id: 'economy', name: 'Economy Bonus', text: '+$1 for every 10 lemmings in your colony.' },
];

export function tagDef(id: string): TagDef {
  const t = TAGS.find((d) => d.id === id);
  if (!t) throw new Error('unknown tag ' + id);
  return t;
}
