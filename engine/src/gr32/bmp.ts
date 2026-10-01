/**
 * Minimal Windows BMP reader (uncompressed 1/4/8/24/32 bits) for the cursor bitmaps: a TBitmap assigned to a
 * TBitmap32 (GR32 AssignFromBitmap: drawn with GDI, then ResetAlpha, so every pixel has alpha 255).
 */
import { Bitmap32 } from './bitmap32.ts';

export function readBmp(data: Uint8Array): Bitmap32 {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data[0] !== 0x42 || data[1] !== 0x4d) throw new Error('not a bmp');
  const pixelOffset = v.getUint32(10, true);
  const headerSize = v.getUint32(14, true);
  const width = v.getInt32(18, true);
  const rawHeight = v.getInt32(22, true);
  const bpp = v.getUint16(28, true);
  const compression = v.getUint32(30, true);
  if (compression !== 0 && compression !== 3) throw new Error('compressed bmp not supported');
  let colors = v.getUint32(46, true);
  if (colors === 0 && bpp <= 8) colors = 1 << bpp;
  const palette: number[] = [];
  const palOfs = 14 + headerSize;
  for (let i = 0; i < colors && bpp <= 8; i++) {
    const p = palOfs + i * 4;
    palette.push((0xff000000 | (data[p + 2] << 16) | (data[p + 1] << 8) | data[p]) >>> 0);
  }
  const height = Math.abs(rawHeight);
  const bottomUp = rawHeight > 0;
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const bmp = new Bitmap32(width, height);
  for (let y = 0; y < height; y++) {
    const row = pixelOffset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      let c: number;
      switch (bpp) {
        case 1:
          c = palette[(data[row + (x >> 3)] >> (7 - (x & 7))) & 1];
          break;
        case 4:
          c = palette[(data[row + (x >> 1)] >> (x & 1 ? 0 : 4)) & 15];
          break;
        case 8:
          c = palette[data[row + x]];
          break;
        case 24: {
          const p = row + x * 3;
          c = (0xff000000 | (data[p + 2] << 16) | (data[p + 1] << 8) | data[p]) >>> 0;
          break;
        }
        case 32: {
          const p = row + x * 4;
          c = (0xff000000 | (data[p + 2] << 16) | (data[p + 1] << 8) | data[p]) >>> 0;
          break;
        }
        default:
          throw new Error('unsupported bmp depth ' + bpp);
      }
      bmp.bits[x + y * width] = c ?? 0xff000000;
    }
  }
  return bmp;
}
