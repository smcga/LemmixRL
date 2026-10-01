import { describe, expect, it } from 'vitest';
import { makeList } from '../src/screens/base.ts';
import { CR, formatSimple } from '../src/texts.ts';

describe('GameScreen.Base.MakeList', () => {
  it('gives the lines with one CR item per line feed, like the original (no empty last line)', () => {
    expect(makeList('A' + CR + 'B')).toEqual(['A', CR, 'B']);
    expect(makeList('A' + CR + CR + 'B')).toEqual(['A', CR, CR, 'B']);
    expect(makeList(CR + CR + 'X')).toEqual(['', CR, CR, 'X']);
    expect(makeList('A' + CR)).toEqual(['A', CR]);
    expect(makeList('')).toEqual(['']);
  });
});

describe('Base.Utils.FormatSimple', () => {
  it('replaces the first %s of the result for each argument in turn', () => {
    expect(formatSimple('Level %s %s', ['1', 'Just dig!'])).toBe('Level 1 Just dig!');
    // an argument that contains %s itself is replaced by the next argument, like in the original
    expect(formatSimple('%s and %s', ['a%s', 'b'])).toBe('ab and %s');
  });
});
