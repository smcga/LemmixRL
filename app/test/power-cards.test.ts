import { describe, expect, it } from 'vitest';
import { LEMMING_ANIMS } from '../src/run/power-cards/animations.ts';
import { POWER_CARD_LIBRARY } from '../src/run/power-cards/catalogue.ts';
import { MAX_ART_LAYERS, lemmingFrame, newArtwork, newPowerCard, parsePowerCardLibrary } from '../src/run/power-cards/schema.ts';
import { remapPixel, spritePalette } from '../src/run/power-cards/render.ts';
import { JOKERS, POWER_CARD_EFFECTS, playablePowerCards } from '../src/run/content.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { getStyle, StyleDef, LemmingAnimationSet } from '../../engine/src/index.ts';

describe('Power Card JSON boundary', () => {
  it('round trips every shipped design and preserves the existing effect IDs', () => {
    expect(parsePowerCardLibrary(JSON.parse(JSON.stringify(POWER_CARD_LIBRARY)))).toEqual(POWER_CARD_LIBRARY);
    expect(JOKERS.map((c) => c.id).sort()).toEqual(Object.keys(POWER_CARD_EFFECTS).sort());
    expect(JOKERS).toHaveLength(Object.keys(POWER_CARD_EFFECTS).length);
    expect(JOKERS.filter((c) => c.rarity === 'legendary').map((c) => c.id)).toEqual(['triboulet', 'yorick', 'chicot', 'ohno', 'yippee']);
    expect(JOKERS).toHaveLength(150);
  });
  it('uses JSON metadata for gameplay while withholding unimplemented designs', () => {
    const library = structuredClone(POWER_CARD_LIBRARY);
    library.cards[0].name = 'New toolkit name';
    library.cards[0].description = 'New tooltip';
    library.cards[0].price = 13;
    library.cards[0].rarity = 'common';
    library.cards.push(newPowerCard('future-card'));
    const playable = playablePowerCards(parsePowerCardLibrary(library));
    expect(playable).toHaveLength(Object.keys(POWER_CARD_EFFECTS).length);
    expect(playable[0]).toMatchObject({ name: 'New toolkit name', text: 'New tooltip', price: 13, rarity: 'common', aboveMax: { builder: 1 } });
    expect(playable.some((c) => c.id === 'future-card')).toBe(false);
  });
  it.each([
    ['future version', (d: any) => (d.version = 3)],
    ['duplicate ID', (d: any) => d.cards.push(structuredClone(d.cards[0]))],
    ['unknown animation', (d: any) => (d.cards[0].appearance.layers[0].animation = 'not-real')],
    ['prototype key', (d: any) => (d.cards[0].appearance.layers[0].animation = 'constructor')],
    ['unknown effect', (d: any) => (d.cards[0].payout = 'do something')],
    ['fractional price', (d: any) => (d.cards[0].price = 2.5)],
    ['negative price', (d: any) => (d.cards[0].price = -1)],
    ['non-finite position', (d: any) => (d.cards[0].appearance.layers[0].x = Infinity)],
    ['excessive scale', (d: any) => (d.cards[0].appearance.layers[0].scale = 500)],
    ['bad colour', (d: any) => (d.cards[0].appearance.layers[0].colors = { '#ffffff': 'red' })],
    ['invalid playback', (d: any) => (d.cards[0].appearance.layers[0].playback = 'unknown')],
    ['out-of-range frame', (d: any) => (d.cards[0].appearance.layers[0].frame = 16)],
    ['fractional frame', (d: any) => (d.cards[0].appearance.layers[0].frame = 1.5)],
    ['empty layers', (d: any) => (d.cards[0].appearance.layers = [])],
    ['too many layers', (d: any) => (d.cards[0].appearance.layers = Array.from({ length: MAX_ART_LAYERS + 1 }, () => newArtwork()))],
  ])('rejects %s before it can replace a library', (_name, edit) => {
    const d = structuredClone(POWER_CARD_LIBRARY);
    edit(d);
    expect(() => parsePowerCardLibrary(d)).toThrow();
    expect(POWER_CARD_LIBRARY.cards[0].name).toBe('Illegal Toolkit');
  });
  it('migrates version 1 exports and browser drafts, including text, icons and custom palettes', () => {
    // (version 1 had one picture a card: the designs of one layer)
    const single = { version: 2 as const, cards: POWER_CARD_LIBRARY.cards.filter((card) => card.appearance.layers.length === 1) };
    const legacy = {
      version: 1,
      cards: single.cards.map((card) => {
        const { layers, ...appearance } = structuredClone(card.appearance);
        const { playback: _playback, frame: _frame, ...art } = layers[0] as any;
        return { ...card, appearance: { ...appearance, art } };
      }),
    };
    expect(parsePowerCardLibrary(legacy)).toEqual(single);
    expect(legacy.cards[0].appearance).toHaveProperty('art'); // migration does not modify the input
  });
  it('round trips independently coloured fixed/animated layers, text and icons in drawing order', () => {
    const card = newPowerCard('layered');
    const second = newArtwork();
    if (second.type !== 'lemming') throw new Error('expected lemming');
    second.animation = 'fry';
    second.playback = 'fixed';
    second.frame = 13;
    second.colors['#00b000'] = '#ff00ff';
    card.appearance.layers.push(second, newArtwork('text'), newArtwork('icon'));
    const result = parsePowerCardLibrary({ version: 2, cards: [card] });
    expect(result.cards[0]).toEqual(card);
    expect(result.cards[0].appearance.layers[0]).toMatchObject({ colors: {}, playback: 'animated' });
    expect(parsePowerCardLibrary(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
});

describe('original animation and palette fidelity', () => {
  it('keeps mixed loop lengths independent and fixed poses fixed for every tick', () => {
    const animated = newArtwork();
    if (animated.type !== 'lemming') throw new Error('expected lemming');
    const fry = { ...animated, animation: 'fry' as const };
    const mine = { ...animated, animation: 'mine' as const };
    const fixed = { ...fry, playback: 'fixed' as const, frame: 13 };
    for (const tick of [0, 7, 13, 14, 23, 24, 31, 32, 333, 1000]) {
      expect(lemmingFrame(fry, tick)).toBe(tick % 14);
      expect(lemmingFrame(mine, tick)).toBe(tick % 24);
      expect(lemmingFrame(fixed, tick)).toBe(13);
    }
  });
  it('exposes every actual animation with its complete frame count', () => {
    const set = new LemmingAnimationSet(getStyle(repoDataProvider(), StyleDef.Orig));
    expect(
      Object.values(LEMMING_ANIMS)
        .map(([index]) => index)
        .sort((a, b) => a - b),
    ).toEqual(set.metaLemmingAnimationList.map((_, i) => i));
    for (const [index, count] of Object.values(LEMMING_ANIMS)) expect(count).toBe(set.metaLemmingAnimationList[index].frameCount);
  });
  it('includes opaque black and later-frame colours while keeping transparency untouched', () => {
    expect(spritePalette(new Uint32Array([0, 0xff000000, 0xff00ff00, 0xff000000, 0xffffffff]))).toEqual(['#000000', '#00ff00', '#ffffff']);
    expect(remapPixel(0, { '#000000': '#ff0000' })).toBe(0);
    expect(remapPixel(0xff000000, { '#000000': '#ff0000' })).toBe(0xffff0000);
    expect(remapPixel(0xff00ff00, { '#00ff00': '#ff0000', '#ff0000': '#0000ff' })).toBe(0xffff0000);
  });
});
