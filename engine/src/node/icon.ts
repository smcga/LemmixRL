/** Node-only: the app icons (a walking lemming of the original game) for the web app manifest and home screens. */
import { Bitmap32 } from '../gr32/bitmap32.ts';
import { getStyle } from '../session.ts';
import { GraphicSet, LemmingAnimationSet, StyleDef } from '../styles/base.ts';
import { encodePng } from './png.ts';
import { repoDataProvider } from './repoData.ts';

/** An icon of size x size pixels; size must be a multiple of 4 (the lemming is drawn on a 4 x 4 grid of pixels). */
export function appIcon(size: number): Uint8Array {
  const data = repoDataProvider();
  const style = getStyle(data, StyleDef.Orig);
  const gs = new GraphicSet(style);
  gs.load(data, 0, 0);
  const ani = new LemmingAnimationSet(style);
  ani.animationPalette = gs.palette.slice();
  ani.load(data);
  const walker = ani.lemmingBitmaps[0]; // 8 frames of 16 x 10
  const base = size / 4;
  const bmp = new Bitmap32(base, base);
  bmp.clear(0xff101030);
  // frame 2, twice as big, in the middle
  const frame = 2;
  const ox = Math.floor((base - 32) / 2);
  const oy = Math.floor((base - 20) / 2);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 16; x++) {
      const c = walker.bits[(frame * 10 + y) * 16 + x];
      if ((c & 0xffffff) === 0) continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) bmp.bits[(oy + y * 2 + dy) * base + ox + x * 2 + dx] = (c | 0xff000000) >>> 0;
    }
  return encodePng(bmp, 4);
}
