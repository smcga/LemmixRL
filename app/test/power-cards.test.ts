import { describe, expect, it } from 'vitest';
import { LEMMING_ANIMS } from '../src/run/power-cards/animations.ts';
import { POWER_CARD_LIBRARY } from '../src/run/power-cards/catalogue.ts';
import { newPowerCard, parsePowerCardLibrary } from '../src/run/power-cards/schema.ts';
import { remapPixel, spritePalette } from '../src/run/power-cards/render.ts';
import { JOKERS, POWER_CARD_EFFECTS, playablePowerCards } from '../src/run/content.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { getStyle, StyleDef, LemmingAnimationSet } from '../../engine/src/index.ts';

describe('Power Card JSON boundary', () => {
  it('round trips every shipped design and preserves the existing effect IDs', () => {
    expect(parsePowerCardLibrary(JSON.parse(JSON.stringify(POWER_CARD_LIBRARY)))).toEqual(POWER_CARD_LIBRARY);
    expect(JOKERS.map((c) => c.id).sort()).toEqual(Object.keys(POWER_CARD_EFFECTS).sort());
    expect(JOKERS).toHaveLength(23);
  });
  it('uses JSON metadata for gameplay while withholding unimplemented designs', () => {
    const library = structuredClone(POWER_CARD_LIBRARY);
    library.cards[0].name = 'New toolkit name';
    library.cards[0].description = 'New tooltip';
    library.cards[0].price = 13;
    library.cards[0].rarity = 'common';
    library.cards.push(newPowerCard('future-card'));
    const playable = playablePowerCards(parsePowerCardLibrary(library));
    expect(playable).toHaveLength(23);
    expect(playable[0]).toMatchObject({ name: 'New toolkit name', text: 'New tooltip', price: 13, rarity: 'common', aboveMax: { builder: 1 } });
    expect(playable.some((c) => c.id === 'future-card')).toBe(false);
  });
  it.each([
    ['future version', (d: any) => (d.version = 2)],
    ['duplicate ID', (d: any) => d.cards.push(structuredClone(d.cards[0]))],
    ['unknown animation', (d: any) => (d.cards[0].appearance.art.animation = 'not-real')],
    ['prototype key', (d: any) => (d.cards[0].appearance.art.animation = 'constructor')],
    ['unknown effect', (d: any) => (d.cards[0].payout = 'do something')],
    ['fractional price', (d: any) => (d.cards[0].price = 2.5)],
    ['negative price', (d: any) => (d.cards[0].price = -1)],
    ['non-finite position', (d: any) => (d.cards[0].appearance.art.x = Infinity)],
    ['excessive scale', (d: any) => (d.cards[0].appearance.art.scale = 500)],
    ['bad colour', (d: any) => (d.cards[0].appearance.art.colors = { '#ffffff': 'red' })],
  ])('rejects %s before it can replace a library', (_name, edit) => {
    const d = structuredClone(POWER_CARD_LIBRARY);
    edit(d);
    expect(() => parsePowerCardLibrary(d)).toThrow();
    expect(POWER_CARD_LIBRARY.cards[0].name).toBe('Illegal Toolkit');
  });
});

describe('original animation and palette fidelity', () => {
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
