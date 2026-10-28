/**
 * The pictures of the cards of a run: the gadgets (jokers), the boosts (tarots), the packs, the bonuses (tags) and the
 * kinds of lemmings, with the colours of their rarity and edition. Shared by the run screens and the collection.
 */
import type { Art } from './cards.ts';
import { POWER_CARD_LIBRARY } from '../power-cards/catalogue.ts';
import type { LemmingAnim } from '../power-cards/animations.ts';
import type { PowerCardDesign } from '../power-cards/schema.ts';
import { COLORS } from './widgets.ts';
import { EDITION_TEXTS, type PackKind, type Rarity, type TarotDef, TRAIT_TEXTS } from '../content.ts';
import type { LemmingCard, SpecialTrait } from '../state.ts';

/** the colour of the small mark above a special lemming (in a level and in the colony), or none */
export function markerColor(c: LemmingCard): number | null {
  if (c.edition === 'gold') return 0xf5c542;
  if (c.edition === 'lucky') return 0x50e050;
  if (c.edition === 'mentor') return 0x60c0ff;
  if (c.edition === 'champion') return 0xc070ff;
  if (c.edition === 'wise') return 0xb8b8c8;
  if (c.insured) return 0xffffff;
  if (c.climber && c.floater) return 0xff4500;
  if (c.climber) return 0x00ff00;
  if (c.floater) return 0x6495ed;
  return null;
}

export const RARITY_COLORS: Record<Rarity, number> = { common: COLORS.blue, uncommon: COLORS.green, rare: COLORS.red, legendary: COLORS.purple };
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };
/** the packs of the shop: their colour, picture and the name on their band */
export const PACK_LOOKS: Record<PackKind, { color: number; art: Art; band: string }> = {
  lemmings: { color: 0x3fae4f, art: { anim: 'walk' }, band: 'LEMMINGS' },
  training: { color: COLORS.teal, art: { anim: 'walk', tint: 0x7dd0ff }, band: 'TRIBE' },
  boost: { color: COLORS.purple, art: { anim: 'float' }, band: 'BOOST' },
  gadget: { color: COLORS.orange, art: { anim: 'build' }, band: 'POWER' },
  mayhem: { color: 0xb02a3a, art: { anim: 'explode' }, band: 'MAYHEM' },
};

export const JOKER_ART: Record<string, Art> = Object.fromEntries(POWER_CARD_LIBRARY.cards.map((design) => [design.id, { design }]));

type Layer = PowerCardDesign['appearance']['layers'][number];

function lemmingLayer(animation: LemmingAnim, scale: number, x: number, y: number, colors: Record<string, string> = {}): Layer {
  return { type: 'lemming', animation, scale, x, y, colors, playback: 'animated', frame: 0 };
}

function textLayer(text: string, color: string, scale: number, x: number, y: number): Layer {
  return { type: 'text', text, color, scale, x, y };
}

/** the picture of a boost drawn as a Power Card is (lemmings in their own colours) */
function boostArt(id: string, layers: Layer[]): Art {
  return { design: { id, name: id, rarity: 'common', price: 0, description: '', appearance: { background: '#4a2f72', border: '#f4f1e6', layers } } };
}

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
  sage: { anim: 'walk', tint: 0xe8e8f0 },
  // the dyes: a lemming with the hair it gives; the Barber and the Tailor: the left one becomes like the right one
  ember: boostArt('ember', [lemmingLayer('walk', 3, 0, 6, { '#00b000': '#e03030' })]),
  tangerine: boostArt('tangerine', [lemmingLayer('walk', 3, 0, 6, { '#00b000': '#f08820' })]),
  amethyst: boostArt('amethyst', [lemmingLayer('walk', 3, 0, 6, { '#00b000': '#a040e0' })]),
  sapphire: boostArt('sapphire', [lemmingLayer('walk', 3, 0, 6, { '#00b000': '#3070f0' })]),
  barber: boostArt('barber', [lemmingLayer('walk', 2, -12, 10), lemmingLayer('walkLeft', 2, 12, 10, { '#00b000': '#e03030' }), textLayer('<', '#f3b958', 1.6, 0, -18)]),
  tailor: boostArt('tailor', [lemmingLayer('walk', 2, -12, 10), lemmingLayer('walkLeft', 2, 12, 10, { '#4040e0': '#e07020' }), textLayer('<', '#f3b958', 1.6, 0, -18)]),
  foreman: boostArt('foreman', [lemmingLayer('build', 3, 0, 8), textLayer('+2', '#f3b958', 1.4, 0, -26)]),
  audition: boostArt('audition', [lemmingLayer('exit', 3, 0, 8, { '#00b000': '#f3b958' }), textLayer('+1', '#f3b958', 1.4, 0, -26)]),
  lottery: boostArt('lottery', [lemmingLayer('shrug', 3, 0, 8), textLayer('1:4', '#2fae5f', 1.3, 0, -26)]),
  // the Mayhem boosts: dark red, lemmings in trouble
  reaper: mayhemArt('reaper', [lemmingLayer('ohno', 3, 0, 8, { '#00b000': '#f0f0f0', '#4040e0': '#202020' })]),
  summoning: mayhemArt('summoning', [lemmingLayer('float', 3, 0, 8, { '#00b000': '#f3b958' }), textLayer('+4', '#f3b958', 1.4, 0, -26)]),
  makeover: mayhemArt('makeover', [lemmingLayer('walk', 3, 0, 8, { '#00b000': '#d090ff', '#4040e0': '#9a5ae0' })]),
  biggamble: mayhemArt('biggamble', [lemmingLayer('jump', 3, 0, 8), textLayer('$0', '#f3b958', 1.4, 0, -26)]),
  dyevat: mayhemArt('dyevat', [lemmingLayer('walk', 2, -10, 12, { '#00b000': '#3070f0' }), lemmingLayer('walkLeft', 2, 10, 12, { '#00b000': '#3070f0' })]),
  uniform: mayhemArt('uniform', [lemmingLayer('walk', 2, -10, 12, { '#4040e0': '#e03030' }), lemmingLayer('walkLeft', 2, 10, 12, { '#4040e0': '#e03030' })]),
  phantom: mayhemArt('phantom', [lemmingLayer('float', 3, 0, 8, { '#00b000': '#8c8ca8', '#4040e0': '#6a5a8a' })]),
  bonfire: mayhemArt('bonfire', [lemmingLayer('fry', 3, 0, 8), textLayer('$20', '#f3b958', 1.2, 0, -26)]),
  solesurvivor: mayhemArt('solesurvivor', [lemmingLayer('walk', 3, 0, 8), textLayer('x2', '#f3b958', 1.4, 0, -26)]),
  prism: mayhemArt('prism', [lemmingLayer('walk', 3, 0, 8, { '#00b000': '#e060c0', '#4040e0': '#30b0e0' })]),
  // the Tribe cards: a lemming of the tribe, in its colours (as in Lemmings 2), and what it levels up
  classic: tribeArt('classic', 'walk', '#00b000', '#4040e0', '+2'),
  highland: tribeArt('highland', 'climb', '#f08820', '#2f8f3f', '+2'),
  circus: tribeArt('circus', 'float', '#e03030', '#f0e040', '+2'),
  egyptian: tribeArt('egyptian', 'build', '#202020', '#f3d080', '+2'),
  medieval: tribeArt('medieval', 'block', '#a0a0a8', '#8a3030', '+2'),
  space: tribeArt('space', 'ohno', '#f0f0f0', '#5060a0', '+2'),
  cavelem: tribeArt('cavelem', 'dig', '#7a4a20', '#b08050', '+2'),
  sports: tribeArt('sports', 'bash', '#f0f0f0', '#e03030', '+2'),
  outdoor: tribeArt('outdoor', 'mine', '#6a8a30', '#806040', '+2'),
  beach: tribeArt('beach', 'walk', '#f0e040', '#30b0e0', '+1'),
  polar: tribeArt('polar', 'walk', '#f0f0f0', '#80c0f0', ':20'),
  shadow: tribeArt('shadow', 'walk', '#404040', '#202020', '+1'),
};

/** the picture of a Mayhem boost */
function mayhemArt(id: string, layers: Layer[]): Art {
  return { design: { id, name: id, rarity: 'common', price: 0, description: '', appearance: { background: '#5a1820', border: '#f4f1e6', layers } } };
}

/** the picture of a Tribe card: a lemming in the colours of its tribe */
function tribeArt(id: string, anim: LemmingAnim, hair: string, clothes: string, text: string): Art {
  return {
    design: {
      id,
      name: id,
      rarity: 'common',
      price: 0,
      description: '',
      appearance: { background: '#1d5a5a', border: '#f4f1e6', layers: [lemmingLayer(anim, 3, 0, 8, { '#00b000': hair, '#4040e0': clothes }), textLayer(text, '#f3b958', 1.4, 0, -26)] },
    },
  };
}

/** a Boost or a Tribe card: its colour and its badge */
export function consumableLook(d: TarotDef): { color: number; badge: string } {
  if (d.kind === 'tribe') return { color: COLORS.teal, badge: 'Tribe card' };
  return d.rare ? { color: COLORS.red, badge: 'Mayhem' } : { color: COLORS.purple, badge: 'Boost' };
}

export const EDITION_TINTS: Record<string, number> = { plain: 0xffffff, gold: COLORS.gold, lucky: 0x7dff7d, mentor: 0x9fd0ff, champion: 0xd090ff, wise: 0xe8e8f0 };

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
  uncommon: { anim: 'walk', tint: COLORS.green },
  rare: { anim: 'walk', tint: COLORS.red },
  directorscut: { anim: 'shrug', tint: COLORS.gold },
  boostpack: { anim: 'float', tint: COLORS.purple },
  powerpack: { anim: 'build', tint: COLORS.orange },
  crowd: { text: '+3', color: COLORS.gold },
  reroll: { text: '$0', color: COLORS.gold },
  reinforcements: { anim: 'walkLeft', tint: COLORS.blue },
  fasttrack: { text: '$5', color: COLORS.gold },
  sparechange: { text: '$1', color: COLORS.gold },
  ghostbonus: { anim: 'float', tint: 0x8c8ca8 },
  shinybonus: { anim: 'walk', tint: 0xd8e0f0 },
  glowingbonus: { anim: 'walk', tint: COLORS.teal },
  rainbowbonus: { anim: 'walk', tint: 0xe060c0 },
  mayhembonus: { anim: 'explode' },
};

/** the kinds of special lemmings: their name, what they do, and their picture */
export const TRAIT_LOOKS: Record<SpecialTrait, { name: string; text: string; art: Art }> = {
  gold: { name: 'Gold', text: EDITION_TEXTS.gold, art: { anim: 'walk', tint: COLORS.gold } },
  lucky: { name: 'Lucky', text: EDITION_TEXTS.lucky, art: { anim: 'walk', tint: 0x7dff7d } },
  mentor: { name: 'Mentor', text: EDITION_TEXTS.mentor, art: { anim: 'build', tint: 0x9fd0ff } },
  champion: { name: 'Champion', text: EDITION_TEXTS.champion, art: { anim: 'exit', tint: 0xd090ff } },
  climber: { name: 'Climber', text: TRAIT_TEXTS.climber, art: { anim: 'climb' } },
  floater: { name: 'Floater', text: TRAIT_TEXTS.floater, art: { anim: 'float' } },
  athlete: { name: 'Athlete', text: 'A {s}Climber{} and a {s}Floater{}', art: { anim: 'climb', tint: 0x9fd0ff } },
  insured: { name: 'Insured', text: TRAIT_TEXTS.insured, art: { anim: 'block', tint: 0xffd0a0 } },
  wise: { name: 'Wise', text: EDITION_TEXTS.wise, art: { anim: 'walk', tint: 0xe8e8f0 } },
};
