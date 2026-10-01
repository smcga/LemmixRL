/**
 * Port of Dos.Bitmaps.pas: planar DOS bitmaps and the VGASPECx.DAT special graphics.
 */
import { ByteStream } from '../base/stream.ts';
import { Bitmap32, ByteMap } from '../gr32/bitmap32.ts';
import { color32, type TColor32 } from '../gr32/color.ts';
import { DosDatDecompressor } from './compression.ts';
import type { DosVgaColorRec, DosVgaPalette8 } from './structures.ts';

export const VGASPEC_SECTIONSIZE = 14400;

/** Dos.Bitmaps.ALPHA_TRANSPARENTBLACK */
const ALPHA_TRANSPARENTBLACK = 0x80000000;

/** DosPaletteEntryToColor32: 6 bit -> 8 bit by "shl 2"; black is fully transparent, others opaque. */
export function dosPaletteEntryToColor32(red: number, green: number, blue: number): TColor32 {
  const r = (red << 2) & 0xff;
  const g = (green << 2) & 0xff;
  const b = (blue << 2) & 0xff;
  const a = r === 0 && g === 0 && b === 0 ? 0 : 0xff;
  return color32(r, g, b, a);
}

export function dosPaletteEntryRecToColor32(e: DosVgaColorRec): TColor32 {
  return dosPaletteEntryToColor32(e.r, e.g, e.b);
}

export function dosPaletteToArrayOfColor32(pal: DosVgaPalette8): Uint32Array {
  const r = new Uint32Array(pal.length);
  for (let i = 0; i < pal.length; i++) r[i] = dosPaletteEntryRecToColor32(pal[i]);
  return r;
}

/** TDosPlanarBitmap: planar bitmaps in the dos files are stored per plane, not interlaced. */
export const DosPlanarBitmap = {
  /**
   * Converts a planar stored bitmap to a byte map of palette indices.
   * aPos < 0 means: continue reading at the current stream position.
   */
  getByteMap(s: ByteStream, byteMap: ByteMap, pos: number, width: number, height: number, bpp: number): void {
    const lineSize = Math.trunc(width / 8);
    const planeSize = lineSize * height;
    const numBytes = planeSize * bpp;
    if (pos >= 0) s.seek(pos);
    const buf = s.readBuffer(numBytes);
    byteMap.setSize(width, height);
    byteMap.clear(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * lineSize + Math.trunc(x / 8);
        const mask = 1 << (7 - (x % 8));
        let entry = 0;
        let bp = p;
        for (let i = 0; i < bpp; i++) {
          if ((buf[bp] & mask) !== 0) entry |= 1 << i;
          bp += planeSize;
        }
        byteMap.bits[x + y * width] = entry;
      }
    }
  },

  /**
   * Loads a bytemap and converts it to a bitmap with the palette.
   * NB: exactly like the Delphi code ("PreparePal") this MODIFIES the passed palette: entries 1..n-1
   * that are 0 get the ALPHA_TRANSPARENTBLACK bit, so black can be drawn as non-transparent.
   */
  loadFromStream(s: ByteStream, bitmap: Bitmap32, pos: number, width: number, height: number, bpp: number, palette: Uint32Array): void {
    const palLen = palette.length;
    for (let i = 1; i < palLen; i++) if (palette[i] === 0) palette[i] = (palette[i] | ALPHA_TRANSPARENTBLACK) >>> 0;
    const byteMap = new ByteMap();
    DosPlanarBitmap.getByteMap(s, byteMap, pos, width, height, bpp);
    bitmap.setSize(width, height);
    bitmap.clear(0);
    const n = width * height;
    for (let i = 0; i < n; i++) bitmap.bits[i] = palette[byteMap.bits[i]] ?? 0;
  },

  /** Frames are stored after each other, same size, palette and bpp. */
  loadAnimationFromStream(
    s: ByteStream,
    bitmap: Bitmap32,
    pos: number,
    width: number,
    height: number,
    frameCount: number,
    bpp: number,
    palette: Uint32Array,
  ): void {
    if (pos >= 0) s.seek(pos);
    const frame = new Bitmap32();
    bitmap.setSize(width, height * frameCount);
    bitmap.clear(0);
    for (let i = 0; i < frameCount; i++) {
      DosPlanarBitmap.loadFromStream(s, frame, -1, width, height, bpp, palette);
      frame.drawTo(bitmap, 0, height * i);
    }
  },
};

/** TVgaSpecBitmap: the special (one big picture) graphics of some levels. Reading only. */
export const VgaSpecBitmap = {
  getSectionsAndPalette(src: ByteStream, dst: ByteStream): DosVgaPalette8 {
    src.seek(0);
    dst.seek(0);
    const palInfo = src.read(40); // TDosVgaSpecPaletteHeader: 24 vga + 8 ega + 8 unknown
    const pal: DosVgaPalette8 = [];
    for (let i = 0; i < 8; i++) pal.push({ r: palInfo[i * 3] ?? 0, g: palInfo[i * 3 + 1] ?? 0, b: palInfo[i * 3 + 2] ?? 0 });
    let curSection = 0;
    for (;;) {
      const curByte = src.readByte();
      if (curByte === undefined) break;
      if (curByte === 128) {
        if (dst.position % VGASPEC_SECTIONSIZE !== 0) throw new Error('vga spec section size error');
        curSection++;
        if (curSection > 3) break;
      } else if (curByte <= 127) {
        dst.copyFrom(src, curByte + 1);
      } else {
        const cnt = 257 - curByte;
        const value = src.read(1)[0] ?? 0;
        dst.write(new Uint8Array(cnt).fill(value));
      }
    }
    return pal;
  },

  /**
   *  Step 1: decompress with the default DOS decompression
   *  Step 2: get the vga palette from the first bytes
   *  Step 3: decode 4 sections with the "bitmap" RLE code
   *  Step 4: each section (14400 bytes) is a planar 960x40 bitmap with 3 bpp
   *  Step 5: glue them together into one 960x160 bitmap
   */
  loadFromStream(s: ByteStream, bitmap: Bitmap32): void {
    const decompressor = new DosDatDecompressor();
    const mem = new ByteStream();
    decompressor.decompressSection(s, mem);
    const pmem = new ByteStream();
    const temp = new Bitmap32();
    const dosPal = VgaSpecBitmap.getSectionsAndPalette(mem, pmem);
    const pal = dosPaletteToArrayOfColor32(dosPal);
    bitmap.setSize(960, 160);
    bitmap.clear(0);
    for (let sec = 0; sec < 4; sec++) {
      temp.clear(0);
      DosPlanarBitmap.loadFromStream(pmem, temp, sec * VGASPEC_SECTIONSIZE, 960, 40, 3, pal);
      temp.drawTo(bitmap, 0, sec * 40); // TBitmap32.Draw(0, y, Temp): temp has DrawMode dmOpaque
    }
  },

  loadPaletteFromStream(s: ByteStream): DosVgaPalette8 {
    const decompressor = new DosDatDecompressor();
    const mem = new ByteStream();
    decompressor.decompressSection(s, mem);
    mem.seek(0);
    const b = mem.read(24);
    const pal: DosVgaPalette8 = [];
    for (let i = 0; i < 8; i++) pal.push({ r: b[i * 3] ?? 0, g: b[i * 3 + 1] ?? 0, b: b[i * 3 + 2] ?? 0 });
    return pal;
  },
};
