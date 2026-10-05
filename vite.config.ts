import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { appIcon } from './engine/src/node/icon.ts';

/**
 * The Phaser front-end lives in app/. The original Lemmix data (src/Data) is served to the browser under
 * data/: the zips as they are, and the music zips cut out of the Windows resource files they are only
 * available in (*_music.RES).
 */
const DATA = join(dirname(fileURLToPath(import.meta.url)), 'src', 'Data');

function dataFiles(): Record<string, () => Uint8Array> {
  const file = (rel: string) => () => new Uint8Array(readFileSync(join(DATA, rel)));
  const zipInResource = (rel: string) => () => {
    const res = readFileSync(join(DATA, rel));
    const start = res.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04])); // first local file header
    if (start < 0) throw new Error('no zip in ' + rel);
    return new Uint8Array(res.subarray(start));
  };
  return {
    'orig.zip': file('Styles/Orig/orig.zip'),
    'ohno.zip': file('Styles/Ohno/ohno.zip'),
    'h94.zip': file('Styles/H94/h94.zip'),
    'x91.zip': file('Styles/X91/x91.zip'),
    'x92.zip': file('Styles/X92/x92.zip'),
    'sounds.zip': file('Sounds/Sounds.zip'),
    'cursors.zip': file('Cursors/Cursors.zip'),
    'assets.zip': file('Assets/Assets.zip'),
    'particles.dat': file('Particles/Particles.dat'),
    'lemmix.ico': () => new Uint8Array(readFileSync(join(DATA, '..', 'Lemmix_Icon.ico'))),
    'orig_music.zip': zipInResource('Orig_music.RES'),
    'ohno_music.zip': zipInResource('Ohno_music.RES'),
    'h94_music.zip': zipInResource('H94_music.RES'),
    // installing the game on a phone's home screen (full screen, landscape)
    'manifest.webmanifest': () => new TextEncoder().encode(JSON.stringify(MANIFEST)),
    'icon-180.png': () => appIcon(180),
    'icon-192.png': () => appIcon(192),
    'icon-512.png': () => appIcon(512),
  };
}

const MANIFEST = {
  name: 'Lemmix',
  short_name: 'Lemmix',
  start_url: '../',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#000000',
  theme_color: '#000000',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

const CONTENT_TYPES: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  webmanifest: 'application/manifest+json',
};

function lemmixData(): Plugin {
  const files = dataFiles();
  return {
    name: 'lemmix-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/data\/([^/?]+)/.exec(req.url ?? '');
        const f = m && files[m[1]];
        if (!f) return next();
        res.setHeader('Content-Type', CONTENT_TYPES[m[1].split('.').pop()!] ?? 'application/octet-stream');
        res.end(f());
      });
    },
    generateBundle() {
      for (const [name, f] of Object.entries(files)) this.emitFile({ type: 'asset', fileName: 'data/' + name, source: f() });
    },
  };
}

export default defineConfig({
  root: 'app',
  base: './',
  plugins: [lemmixData()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
