import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Archive } from '../../engine/src/index.ts';
import { DATA_DIR, repoDataProvider } from '../../engine/src/node/repoData.ts';
import { ModPlayer } from '../src/modplayer.ts';
import { levelTracks } from '../src/musicpanel.ts';

/** the music zips, cut out of the resource files like vite.config.ts does */
function musicArchives(): Map<string, Archive> {
  const music = new Map<string, Archive>();
  for (const style of ['Orig', 'Ohno', 'H94']) {
    const res = readFileSync(join(DATA_DIR, `${style}_music.RES`));
    music.set(style.toLowerCase(), Archive.fromZip(new Uint8Array(res.subarray(res.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))))));
  }
  return music;
}

const context = { sampleRate: 44100, destination: null } as unknown as AudioContext;

describe('the music panel (?music)', () => {
  const tracks = levelTracks(repoDataProvider(), musicArchives());

  it('lists every track the levels play, by style, each with its file', () => {
    const count = (style: string) => tracks.filter((t) => t.styleName === style).length;
    expect([count('Orig'), count('Ohno'), count('H94'), count('X91'), count('X92')]).toEqual([21, 6, 2, 0, 0]);
    expect(tracks.every((t) => t.data !== null)).toBe(true);
    const levels = (style: string) => tracks.filter((t) => t.styleName === style).reduce((n, t) => n + t.levelCount, 0);
    expect([levels('Orig'), levels('Ohno'), levels('H94')]).toEqual([120, 100, 64]);
  });

  it('names the levels of a track by section (the tracks go round, 21 of them in Orig)', () => {
    const first = tracks.find((t) => t.styleName === 'Orig' && t.fileName === 'Track_01.mod')!;
    expect(first.levels).toBe('Fun 1, 22 · Tricky 13 · Taxing 4, 25 · Mayhem 16');
    expect(first.levelCount).toBe(6);
  });

  it('measures a song once from its start, the same every time', () => {
    const data = tracks.find((t) => t.styleName === 'Ohno' && t.fileName === 'Track_01.mod')!.data!;
    const player = new ModPlayer(context, data);
    const a = player.measure();
    const b = player.measure();
    expect(b).toEqual(a);
    // the song ends (and would restart) long before the limit
    expect(a.seconds).toBeGreaterThan(20);
    expect(a.seconds).toBeLessThan(120);
    expect(a.rms).toBeGreaterThan(0);
    expect(a.peak).toBeGreaterThan(a.rms);
    expect(a.peak).toBeLessThanOrEqual(1);
    // at most maxSeconds
    expect(player.measure(2).seconds).toBeLessThan(2.1);
  });
});
