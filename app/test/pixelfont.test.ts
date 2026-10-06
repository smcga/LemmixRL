import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { type PixelGlyph, readPixelFont } from '../src/run/ui/pixelfont.ts';

const ASCII = Array.from({ length: 95 }, (_, i) => 32 + i);
const font = readPixelFont(new Uint8Array(readFileSync(`${REPO_ROOT}/app/fonts/m6x11.ttf`)), 16, [...ASCII, 0xb7]);

const art = (g: PixelGlyph) => Array.from({ length: g.height }, (_, r) => Array.from(g.bits.subarray(r * g.width, (r + 1) * g.width), (b) => (b ? '#' : '.')).join(''));
const glyph = (ch: string) => font.glyphs.get(ch.charCodeAt(0))!;

describe('the pixel font of the run screens (m6x11)', () => {
  // the pixels Chromium draws for the font at 16 px (every pixel of it is a whole pixel there)
  it('has the pixels of the glyphs', () => {
    const a = glyph('A');
    expect([a.left, a.top, a.width, a.height]).toEqual([0, -11, 6, 11]);
    expect(art(a)).toEqual(['.####.', '######', '##..##', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##', '##..##']);
    const g = glyph('g');
    expect([g.left, g.top]).toEqual([0, -8]);
    expect(art(g)).toEqual(['.####.', '######', '##..##', '##..##', '##..##', '##..##', '######', '.#####', '....##', '######', '#####.']);
    const m = glyph('M');
    expect(art(m)).toEqual(['#######.', '########', ...Array(7).fill('##.##.##'), '##....##', '##....##']);
    const one = glyph('1');
    expect(art(one)).toEqual(['..##..', '####..', '####..', ...Array(6).fill('..##..'), '######', '######']);
  });

  it('has the advances and the metrics of the font', () => {
    expect(font.ascent).toBe(11);
    expect(font.descent).toBe(3);
    const advances = Object.fromEntries([...' AiMj.$'].map((ch) => [ch, glyph(ch).advance]));
    expect(advances).toEqual({ ' ': 5, A: 7, i: 3, M: 9, j: 5, '.': 3, $: 7 });
    expect(glyph(' ').width).toBe(0);
  });

  it('has every printable ASCII character, and not the middle dot', () => {
    expect(ASCII.filter((c) => !font.glyphs.has(c))).toEqual([]);
    expect(font.glyphs.has(0xb7)).toBe(false);
  });

  it('refuses a font that is not on the pixel grid', () => {
    expect(() => readPixelFont(new Uint8Array(readFileSync(`${REPO_ROOT}/app/fonts/m6x11.ttf`)), 12, [65])).toThrow(/between the pixels/);
  });
});
