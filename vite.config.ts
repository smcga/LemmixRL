import { defineConfig } from 'vite';

// The Phaser front-end lives in app/. The original DOS data (zips in src/Data) is
// served from app/public/data, which tools/copy-data.ts fills.
export default defineConfig({
  root: 'app',
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
