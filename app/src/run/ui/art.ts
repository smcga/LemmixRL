/**
 * The pictures of the cards of a run: the gadgets (jokers), the boosts (tarots), the packs, the bonuses (tags) and the
 * kinds of lemmings, with the colours of their rarity and edition. Shared by the run screens and the collection.
 */
import type { Art } from './cards.ts';
import { COLORS } from './widgets.ts';
import type { PackKind, Rarity } from '../content.ts';
import type { SpecialTrait } from '../state.ts';

export const RARITY_COLORS: Record<Rarity, number> = { common: COLORS.blue, uncommon: COLORS.green, rare: COLORS.red };
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };
/** the packs of the shop: their colour, picture and the name on their band */
export const PACK_LOOKS: Record<PackKind, { color: number; art: Art; band: string }> = {
  lemmings: { color: 0x3fae4f, art: { anim: 'walk' }, band: 'LEMMINGS' },
  training: { color: COLORS.teal, art: { icon: 'builder' }, band: 'TRAINING' },
  boost: { color: COLORS.purple, art: { anim: 'float' }, band: 'BOOST' },
  gadget: { color: COLORS.orange, art: { anim: 'build' }, band: 'POWER' },
};

export const JOKER_ART: Record<string, Art> = {
  toolkit: { anim: 'build' },
  smuggler: { anim: 'bash' },
  overtime: { text: '+1:00', color: COLORS.gold },
  ladder: { anim: 'climb' },
  umbrellas: { anim: 'float' },
  hardhat: { anim: 'block' },
  disposal: { anim: 'ohno' },
  shelter: { icon: 'nuke' },
  lifeguard: { anim: 'drown' },
  crashmats: { anim: 'splat' },
  scout: { anim: 'walk' },
  unionrep: { anim: 'shrug' },
  nolem: { anim: 'exit' },
  piggy: { text: '$$', color: COLORS.gold },
  speedrun: { anim: 'fall' },
  minimalist: { anim: 'shrug', tint: 0xb0e0ff },
  headcount: { anim: 'walkLeft' },
  guild: { icon: 'builder' },
  demolition: { icon: 'basher' },
  climbclub: { icon: 'climber' },
  bombsquad: { icon: 'bomber' },
  trainer: { text: '+5', color: COLORS.teal },
  advisor: { anim: 'walkLeft', tint: 0x9fd0ff },
};

export const TAROT_ART: Record<string, Art> = {
  umbrella: { icon: 'floater' },
  gear: { icon: 'climber' },
  midas: { anim: 'walk', tint: COLORS.gold },
  clover: { anim: 'walk', tint: 0x7dff7d },
  mentor: { anim: 'build', tint: 0x9fd0ff },
  policy: { anim: 'block', tint: 0xffd0a0 },
  manual: { icon: 'builder' },
  conscription: { anim: 'walkLeft', tint: 0xff9090 },
  vat: { anim: 'walk', tint: 0xd0a0ff },
  hermit: { anim: 'exit', tint: COLORS.gold },
  laurel: { anim: 'exit', tint: 0xd090ff },
  recruiter: { anim: 'walk' },
  bootcamp: { anim: 'climb', tint: 0x7dd0ff },
  rethink: { anim: 'shrug', tint: 0xd0a0ff },
};

export const EDITION_TINTS: Record<string, number> = { plain: 0xffffff, gold: COLORS.gold, lucky: 0x7dff7d, mentor: 0x9fd0ff, champion: 0xd090ff };

/** the bonuses for skipping a level */
export const TAG_ART: Record<string, Art> = {
  recruits: { anim: 'walk' },
  umbrellas: { anim: 'float' },
  golden: { anim: 'exit', tint: COLORS.gold },
  supply: { icon: 'builder' },
  clone: { anim: 'walk', tint: 0xd0a0ff },
  investment: { text: '$10', color: COLORS.gold },
  coupon: { text: '$0', color: COLORS.green },
  training: { icon: 'miner' },
  economy: { text: '$$', color: COLORS.gold },
};

/** the kinds of special lemmings: their name, what they do, and their picture */
export const TRAIT_LOOKS: Record<SpecialTrait, { name: string; text: string; art: Art }> = {
  gold: { name: 'Gold', text: 'Earns $2 when it reaches the exit.', art: { anim: 'walk', tint: COLORS.gold } },
  lucky: { name: 'Lucky', text: 'When it reaches the exit: 1 in 3 chance of $4, 1 in 5 chance of a Boost.', art: { anim: 'walk', tint: 0x7dff7d } },
  mentor: { name: 'Mentor', text: 'When it reaches the exit: +1 ability in the skill you used most in that level.', art: { anim: 'build', tint: 0x9fd0ff } },
  champion: { name: 'Champion', text: 'When it reaches the exit, the rescue bonus of the level is multiplied.', art: { anim: 'exit', tint: 0xd090ff } },
  climber: { name: 'Climber', text: 'Climbs walls from the start of every level.', art: { anim: 'climb' } },
  floater: { name: 'Floater', text: 'Has an umbrella in every level.', art: { anim: 'float' } },
  athlete: { name: 'Athlete', text: 'A climber and a floater.', art: { anim: 'climb', tint: 0x9fd0ff } },
  insured: { name: 'Insured', text: 'Comes back once after it dies.', art: { anim: 'block', tint: 0xffd0a0 } },
};
