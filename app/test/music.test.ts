import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Archive } from '../../engine/src/index.ts';
import { DATA_DIR, repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LoudnessMeter } from '../src/loudness.ts';
import { ModPlayer } from '../src/modplayer.ts';
import { MUSIC_TARGET_LUFS, musicGain, musicGainDb, musicLoudness } from '../src/musicloudness.ts';
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

const context = { sampleRate: 48000, destination: null } as unknown as AudioContext;

/** the loudness of seconds of a sine (frequency, amplitude of the left and the right channel) */
function sineLoudness(rate: number, seconds: number, frequency: number, left: number, right: number, silence = 0): number {
  const meter = new LoudnessMeter(rate);
  const n = 1000;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  let t = 0;
  for (let part = 0; part < (seconds * rate) / n; part++) {
    for (let i = 0; i < n; i++, t++) {
      const v = Math.sin((2 * Math.PI * frequency * t) / rate);
      l[i] = v * left;
      r[i] = v * right;
    }
    meter.add(l, r);
  }
  l.fill(0);
  r.fill(0);
  for (let part = 0; part < (silence * rate) / n; part++) meter.add(l, r);
  return meter.integrated();
}

describe('the loudness meter (ITU-R BS.1770)', () => {
  it('measures the reference sines of the standard', () => {
    // a 997 Hz sine at full scale in one channel is -3.01 LUFS, at -20 dBFS in both channels -20 LUFS
    for (const rate of [44100, 48000]) {
      expect(sineLoudness(rate, 5, 997, 1, 0)).toBeCloseTo(-3.01, 1);
      expect(sineLoudness(rate, 5, 997, 0.1, 0.1)).toBeCloseTo(-20, 1);
    }
  });

  it('hears high tones as louder and deep ones as less loud', () => {
    const at1k = sineLoudness(48000, 3, 997, 0.1, 0.1);
    expect(sineLoudness(48000, 3, 4000, 0.1, 0.1)).toBeGreaterThan(at1k + 3);
    expect(sineLoudness(48000, 3, 30, 0.1, 0.1)).toBeLessThan(at1k - 1);
  });

  it('leaves the silence out', () => {
    // (only the blocks over the end of the sound count a little: 3 of 100)
    const sound = sineLoudness(48000, 10, 997, 0.1, 0.1);
    expect(Math.abs(sineLoudness(48000, 10, 997, 0.1, 0.1, 10) - sound)).toBeLessThan(0.15);
    expect(sineLoudness(48000, 0, 997, 0, 0, 2)).toBe(-Infinity);
  });
});

const tracks = levelTracks(repoDataProvider(), musicArchives());

describe('the music panel (?music)', () => {
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
    expect(a.loudness).toBeGreaterThan(-30);
    expect(a.loudness).toBeLessThan(0);
    expect(a.peak).toBeGreaterThan(0.1);
    expect(a.peak).toBeLessThanOrEqual(1);
    // at most maxSeconds
    expect(player.measure(2).seconds).toBeLessThan(2.1);
  });
});

describe('the music of the levels, normalised', () => {
  it('knows the loudness of every track, as the files measure now', () => {
    const measured: Record<string, number> = {};
    for (const t of tracks) measured[`${t.styleName}/${t.fileName}`.toLowerCase()] = new ModPlayer(context, t.data!).measure().loudness;
    const off = Object.entries(measured).filter(([k, v]) => {
      const [style, file] = k.split('/');
      const l = musicLoudness(style, file);
      return l === undefined || Math.abs(l - v) > 0.05;
    });
    const table = Object.entries(measured)
      .map(([k, v]) => `  '${k}': ${Number(v.toFixed(2))},`)
      .join('\n');
    expect(off, `the loudness table of app/src/musicloudness.ts is out of date, the files measure:\n${table}\n`).toEqual([]);
  });

  it('plays every track as loud as the median track', () => {
    expect(MUSIC_TARGET_LUFS).toBeCloseTo(-12.05, 2);
    for (const t of tracks) expect(musicLoudness(t.styleName, t.fileName)! + musicGainDb(t.styleName, t.fileName)).toBeCloseTo(MUSIC_TARGET_LUFS, 6);
    // the quietest track gets louder, the loudest quieter; the names are found in any case
    expect(musicGainDb('H94', 'Track_01.mod')).toBeCloseTo(8.77, 2);
    expect(musicGainDb('Orig', 'Track_19.mod')).toBeCloseTo(-2.37, 2);
    expect(musicGain('h94', 'TRACK_01.MOD')).toBeCloseTo(10 ** (8.77 / 20), 3);
    // a track that is not in the table plays as its file
    expect(musicGain('User', 'Track_01.mod')).toBe(1);
  });
});

