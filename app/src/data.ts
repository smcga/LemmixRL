/**
 * Loads the original Lemmix data in the browser (served under data/ by the Vite plugin in vite.config.ts) and
 * builds the engine's DataProvider from it, like Prog.Data does from the zip resources of the executable.
 */
import { Archive, ArchiveDataProvider } from '../../engine/src/index.ts';

export interface LemmixData {
  provider: ArchiveDataProvider;
  sounds: Archive;
  cursors: Archive;
  assets: Archive;
  /** music archives per style name (Orig, Ohno, H94) */
  music: Map<string, Archive>;
}

const STYLE_FILES: Record<string, string> = { Orig: 'orig.zip', Ohno: 'ohno.zip', H94: 'h94.zip', X91: 'x91.zip', X92: 'x92.zip' };
const MUSIC_FILES: Record<string, string> = { Orig: 'orig_music.zip', Ohno: 'ohno_music.zip', H94: 'h94_music.zip' };

async function fetchBytes(name: string): Promise<Uint8Array> {
  const res = await fetch(new URL('data/' + name, document.baseURI));
  if (!res.ok) throw new Error(`cannot load data/${name}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function loadLemmixData(onProgress?: (done: number, total: number) => void): Promise<LemmixData> {
  const names = [...Object.values(STYLE_FILES), ...Object.values(MUSIC_FILES), 'sounds.zip', 'cursors.zip', 'assets.zip', 'particles.dat'];
  let done = 0;
  const files = new Map<string, Uint8Array>();
  await Promise.all(
    names.map(async (n) => {
      files.set(n, await fetchBytes(n));
      onProgress?.(++done, names.length);
    }),
  );
  const zip = (n: string) => Archive.fromZip(files.get(n)!);
  const styles: Record<string, Archive> = {};
  for (const [style, f] of Object.entries(STYLE_FILES)) styles[style] = zip(f);
  const music = new Map<string, Archive>();
  for (const [style, f] of Object.entries(MUSIC_FILES)) music.set(style.toLowerCase(), zip(f));
  const sounds = zip('sounds.zip');
  const cursors = zip('cursors.zip');
  const assets = zip('assets.zip');
  const provider = new ArchiveDataProvider({ styles, sounds, cursors, assets, particles: files.get('particles.dat')!, music });
  return { provider, sounds, cursors, assets, music };
}
