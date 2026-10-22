/**
 * The colours of a description, as in Balatro: a description says {+}+4{} Rescues or {x}X2{} Rescues, and the numbers
 * are drawn in the colour of what they are (blue: added to the rescue count, like Balatro's Chips; red: multiplies it,
 * like Mult; gold: money; green: a chance). {} ends a colour.
 *
 * | tag          | what                                       |
 * |--------------|--------------------------------------------|
 * | {+}          | +Rescues (blue)                            |
 * | {x}          | X Rescues (red)                            |
 * | {$}          | money (gold)                               |
 * | {%}          | a chance, "1 in 4" (green)                 |
 * | {!}          | something to notice: a skill, an edition   |
 * | {~}          | as it is now: "(Currently X1.5)" (grey)    |
 * | {c:orange}   | a colour of hair or clothes, in its colour |
 *
 * Plain text (no tags) is text as it was, so every text of the game can use it.
 */
import { COLOR_UI, LEMMING_COLORS, type LemmingColor } from './colors.ts';

export const RICH_COLORS: Record<string, number> = {
  '+': 0x009dff,
  x: 0xfe5f55,
  $: 0xd99a20,
  '%': 0x2fae5f,
  '!': 0xf08a10,
  '~': 0x8c8c94,
};

export interface RichSpan {
  start: number;
  length: number;
  color: number;
}

/** the text without its tags, and where its colours are */
export function parseRich(text: string): { plain: string; spans: RichSpan[] } {
  if (!text.includes('{')) return { plain: text, spans: [] };
  let plain = '';
  const spans: RichSpan[] = [];
  let open: { start: number; color: number } | null = null;
  const re = /\{([^{}]*)\}/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    plain += text.slice(last, m.index);
    last = m.index + m[0].length;
    const tag = m[1];
    if (open && plain.length > open.start) spans.push({ start: open.start, length: plain.length - open.start, color: open.color });
    open = null;
    if (tag === '') continue;
    const color = tag.startsWith('c:') ? (LEMMING_COLORS.includes(tag.slice(2) as LemmingColor) ? COLOR_UI[tag.slice(2) as LemmingColor] : null) : (RICH_COLORS[tag] ?? null);
    if (color !== null) open = { start: plain.length, color };
  }
  plain += text.slice(last);
  if (open && plain.length > open.start) spans.push({ start: open.start, length: plain.length - open.start, color: open.color });
  return { plain, spans };
}

/** the text without its tags */
export function plainText(text: string): string {
  return parseRich(text).plain;
}

/** "{c:orange}Orange{}" */
export function colorTag(color: LemmingColor, word: string): string {
  return `{c:${color}}${word}{}`;
}

/**
 * Where each character of the plain text is among the characters a bitmap text draws (-1: not drawn). Phaser numbers
 * them after wrapping, without line breaks (a wrap takes the place of a space) and without characters its font has no
 * glyph for; a colour has to go by those numbers.
 */
export function drawnIndexes(plain: string, wrapped: string, hasGlyph: (code: number) => boolean): number[] {
  const at: number[] = new Array(plain.length).fill(-1);
  let drawn = 0;
  let p = 0;
  for (let w = 0; w < wrapped.length && p < plain.length; w++) {
    const ch = wrapped[w];
    if (ch === '\n') {
      if (plain[p] === ' ' || plain[p] === '\n') p++;
      continue;
    }
    at[p++] = hasGlyph(ch.charCodeAt(0)) ? drawn++ : -1;
  }
  return at;
}
