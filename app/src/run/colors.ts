/**
 * The colours of the lemmings of a colony (Lematro): every lemming has a colour of hair and a colour of clothes, and
 * Power Cards count them. The sprites of Lemmings have green hair (#00b000), blue clothes (#4040e0) and pink skin
 * (#f0d0d0); a lemming is drawn with its own colours in their place, in the level too (see LemmingGame.lemmingBitmap),
 * and the skin of a special lemming in the colour of its edition.
 *
 * A lemming is "Fully" a colour when its hair and its clothes are both that colour.
 */
import type { Rng } from './rng.ts';
import type { LemmingCard } from './state.ts';

export type LemmingColor = 'green' | 'orange' | 'red' | 'purple' | 'blue';

export const LEMMING_COLORS: readonly LemmingColor[] = ['green', 'orange', 'red', 'purple', 'blue'];

export const COLOR_NAMES: Record<LemmingColor, string> = { green: 'Green', orange: 'Orange', red: 'Red', purple: 'Purple', blue: 'Blue' };

/** the colours drawn (hair and clothes look best a little different) */
const HAIR_HEX: Record<LemmingColor, string> = { green: '#00b000', orange: '#f08820', red: '#e03030', purple: '#a040e0', blue: '#3070f0' };
const CLOTHES_HEX: Record<LemmingColor, string> = { green: '#20a040', orange: '#e07020', red: '#c02828', purple: '#8030c0', blue: '#4040e0' };
/** the colour of a colour in the interface (a word of a description, a mark) */
export const COLOR_UI: Record<LemmingColor, number> = { green: 0x40c050, orange: 0xf08820, red: 0xe84040, purple: 0xb060f0, blue: 0x4a80f0 };

/** the skin of a special lemming */
const SKIN_HEX: Record<string, string> = { gold: '#f0c840', lucky: '#a0f0a0', mentor: '#a8d0ff', champion: '#e0a8ff', wise: '#e0e0e8' };

/** most lemmings look like lemmings: green hair, blue clothes */
const HAIR_WEIGHTS: Record<LemmingColor, number> = { green: 46, orange: 14, red: 13, purple: 14, blue: 13 };
const CLOTHES_WEIGHTS: Record<LemmingColor, number> = { blue: 46, red: 14, orange: 13, purple: 14, green: 13 };

const SOURCE = { hair: '#00b000', clothes: '#4040e0', skin: '#f0d0d0' };

function weighted(rng: Rng, weights: Record<LemmingColor, number>): LemmingColor {
  return rng.pickWeighted(LEMMING_COLORS, LEMMING_COLORS.map((c) => weights[c]));
}

/** the colours of a new lemming */
export function randomColors(rng: Rng): { hair: LemmingColor; clothes: LemmingColor } {
  return { hair: weighted(rng, HAIR_WEIGHTS), clothes: weighted(rng, CLOTHES_WEIGHTS) };
}

/** a number from 0 to 1 of an id (the colours of the lemmings of runs saved before they had any) */
function hashOf(id: number, salt: number): number {
  let h = (id * 2654435761 + salt * 40503) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fromHash(r: number, weights: Record<LemmingColor, number>): LemmingColor {
  const total = LEMMING_COLORS.reduce((n, c) => n + weights[c], 0);
  let x = r * total;
  for (const c of LEMMING_COLORS) {
    x -= weights[c];
    if (x < 0) return c;
  }
  return LEMMING_COLORS[0];
}

export function hairOf(c: LemmingCard): LemmingColor {
  return c.hair ?? fromHash(hashOf(c.id, 1), HAIR_WEIGHTS);
}

export function clothesOf(c: LemmingCard): LemmingColor {
  return c.clothes ?? fromHash(hashOf(c.id, 2), CLOTHES_WEIGHTS);
}

/**
 * Has the lemming hair of this colour? With the Ginger Lemming, red hair counts as orange hair and the other way
 * round.
 */
export function hasHair(c: LemmingCard, color: LemmingColor, ginger = false): boolean {
  const h = hairOf(c);
  if (h === color) return true;
  return ginger && ((h === 'red' && color === 'orange') || (h === 'orange' && color === 'red'));
}

/** hair and clothes of the colour */
export function isFully(c: LemmingCard, color: LemmingColor): boolean {
  return hairOf(c) === color && clothesOf(c) === color;
}

/** "Green hair, Blue clothes" */
export function colorsText(c: LemmingCard): string {
  const h = hairOf(c);
  const cl = clothesOf(c);
  return h === cl ? `Fully ${COLOR_NAMES[h]}` : `${COLOR_NAMES[h]} hair, ${COLOR_NAMES[cl]} clothes`;
}

/** the colours of the sprites of a lemming in place of those of Lemmings (as #rrggbb to #rrggbb) */
export function lemmingPalette(c: LemmingCard): Record<string, string> {
  const p: Record<string, string> = {};
  const h = HAIR_HEX[hairOf(c)];
  const cl = CLOTHES_HEX[clothesOf(c)];
  if (h !== SOURCE.hair) p[SOURCE.hair] = h;
  if (cl !== SOURCE.clothes) p[SOURCE.clothes] = cl;
  const skin = SKIN_HEX[c.edition];
  if (skin) p[SOURCE.skin] = skin;
  return p;
}

/** a key of a palette (the same colours, the same key) */
export function paletteKey(p: Record<string, string>): string {
  return Object.entries(p)
    .sort()
    .map(([a, b]) => a.slice(1) + b.slice(1))
    .join('');
}

/** a pixel (0xAARRGGBB) of a lemming sprite in other colours */
export function remapColor(px: number, palette: Record<string, string>): number {
  if ((px >>> 24) === 0 && (px & 0xffffff) === 0) return px;
  const hex = '#' + (px & 0xffffff).toString(16).padStart(6, '0');
  const to = palette[hex];
  return to ? ((px & 0xff000000) | parseInt(to.slice(1), 16)) >>> 0 : px;
}
