/**
 * Node-only helper: builds a DataProvider from the original Lemmix data in this repository
 * (src/Data/...). Used by tests and tools.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Archive, ArchiveDataProvider } from '../data/datasource.ts';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DATA_DIR = join(REPO_ROOT, 'src', 'Data');

export const STYLE_ZIPS: Record<string, string> = {
  Orig: 'Styles/Orig/orig.zip',
  Ohno: 'Styles/Ohno/ohno.zip',
  H94: 'Styles/H94/h94.zip',
  X91: 'Styles/X91/x91.zip',
  X92: 'Styles/X92/x92.zip',
};

let cached: ArchiveDataProvider | null = null;

export function repoDataProvider(): ArchiveDataProvider {
  if (cached) return cached;
  const styles: Record<string, Archive> = {};
  for (const [name, rel] of Object.entries(STYLE_ZIPS)) styles[name] = Archive.fromZip(readFileSync(join(DATA_DIR, rel)));
  cached = new ArchiveDataProvider({
    styles,
    sounds: Archive.fromZip(readFileSync(join(DATA_DIR, 'Sounds/Sounds.zip'))),
    cursors: Archive.fromZip(readFileSync(join(DATA_DIR, 'Cursors/Cursors.zip'))),
    assets: Archive.fromZip(readFileSync(join(DATA_DIR, 'Assets/Assets.zip'))),
    particles: new Uint8Array(readFileSync(join(DATA_DIR, 'Particles/Particles.dat'))),
  });
  return cached;
}
