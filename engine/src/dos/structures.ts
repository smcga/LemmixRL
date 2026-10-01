/**
 * Port of Dos.Structures.pas: raw DOS file structures (LVL level records, GROUNDxO.DAT metadata,
 * the ODDTABLE.DAT records) and the fixed DOS palettes.
 *
 * The LVL record is kept as its raw 2048 bytes (it is hashed for replay identification and patched
 * in place for "odd table" levels); accessors decode the fields like the packed Delphi records do.
 */
import { getWordBE, getWordLE } from '../base/stream.ts';
import { color32, type TColor32 } from '../gr32/color.ts';
import { DOS_OBJECT_ID_ENTRANCE, DOS_OBJECT_ID_EXIT } from './consts.ts';

export const LVL_MAXOBJECTCOUNT = 32;
export const LVL_MAXTERRAINCOUNT = 400;
export const LVL_MAXSTEELCOUNT = 32;
export const LVL_SIZE = 2048;

export const LVL_OFS_OBJECTS = 0x0020;
export const LVL_OFS_TERRAIN = 0x0120;
export const LVL_OFS_STEEL = 0x0760;
export const LVL_OFS_TITLE = 0x07e0;

/** TLVLRec as raw bytes. */
export type LVLRec = Uint8Array;

export const LVLField = {
  ReleaseRate: 0x00,
  LemmingsCount: 0x02,
  RescueCount: 0x04,
  TimeLimit: 0x06,
  ClimberCount: 0x08,
  FloaterCount: 0x0a,
  BomberCount: 0x0c,
  BlockerCount: 0x0e,
  BuilderCount: 0x10,
  BasherCount: 0x12,
  MinerCount: 0x14,
  DiggerCount: 0x16,
  ScreenPosition: 0x18,
  GraphicSet: 0x1a,
  GraphicSetEx: 0x1c,
  Reserved: 0x1e,
} as const;

/** Reads a big endian "statics" word (TLVLRec.SwapProp). */
export function lvlWord(lvl: LVLRec, ofs: number): number {
  return getWordBE(lvl, ofs);
}

export function lvlObjectBytes(lvl: LVLRec, i: number): Uint8Array {
  return lvl.subarray(LVL_OFS_OBJECTS + i * 8, LVL_OFS_OBJECTS + i * 8 + 8);
}

export function lvlTerrainBytes(lvl: LVLRec, i: number): Uint8Array {
  return lvl.subarray(LVL_OFS_TERRAIN + i * 4, LVL_OFS_TERRAIN + i * 4 + 4);
}

export function lvlSteelBytes(lvl: LVLRec, i: number): Uint8Array {
  return lvl.subarray(LVL_OFS_STEEL + i * 4, LVL_OFS_STEEL + i * 4 + 4);
}

/** TLVLTitle (array[0..31] of AnsiChar) */
export function lvlTitleBytes(lvl: LVLRec): Uint8Array {
  return lvl.subarray(LVL_OFS_TITLE, LVL_OFS_TITLE + 32);
}

/** Windows-1252 decoding of a single AnsiChar (the default ANSI code page of Lemmix users). */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

export function ansiCharToString(b: number): string {
  if (b >= 0x80 && b < 0xa0) return String.fromCharCode(CP1252_HIGH[b - 0x80]);
  return String.fromCharCode(b);
}

/**
 * Delphi string(AnsiCharArray): converts the zero based char array, stopping at the first #0
 * (System._UStrFromArray).
 */
export function ansiCharArrayToString(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) break;
    s += ansiCharToString(bytes[i]);
  }
  return s;
}

/** Dos.Structures.LVLTitleAsString: all 32 characters (including #0), optionally trimmed. */
export function lvlTitleAsString(title: Uint8Array, trimmed: boolean): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += ansiCharToString(title[i]);
  return trimmed ? delphiTrim(s) : s;
}

/** SysUtils.Trim: removes leading and trailing characters <= ' ' (including #0). */
export function delphiTrim(s: string): string {
  let a = 0;
  let b = s.length - 1;
  while (a <= b && s.charCodeAt(a) <= 32) a++;
  while (b >= a && s.charCodeAt(b) <= 32) b--;
  return s.substring(a, b + 1);
}

export function lvlIsSuperLemming(lvl: LVLRec): boolean {
  return getWordLE(lvl, LVLField.Reserved) === 0xffff;
}

export function lvlGetObjectCount(lvl: LVLRec): { count: number; entranceCount: number; exitCount: number } {
  let count = 0;
  let entranceCount = 0;
  let exitCount = 0;
  for (let i = 0; i < LVL_MAXOBJECTCOUNT; i++) {
    const o = lvlObjectBytes(lvl, i);
    if (o.some((v) => v !== 0)) {
      count++;
      const id = o[5] & 15;
      if (id === DOS_OBJECT_ID_EXIT) exitCount++;
      else if (id === DOS_OBJECT_ID_ENTRANCE) entranceCount++;
    }
  }
  return { count, entranceCount, exitCount };
}

/* ------------------------------------------------------------------------------------------------
   GROUNDxO.DAT (1056 bytes): 16 object records (28 bytes), 64 terrain records (8 bytes), palettes
------------------------------------------------------------------------------------------------- */

export interface DosMetaObject {
  animationFlags: number;
  startAnimationFrameIndex: number;
  animationFrameCount: number;
  width: number;
  height: number;
  animationFrameDataSize: number;
  maskOffsetFromImage: number;
  unknown1: number;
  unknown2: number;
  triggerLeft: number;
  triggerTop: number;
  triggerWidth: number;
  triggerHeight: number;
  triggerEffectId: number;
  animationFramesBaseLoc: number;
  previewImageLocation: number;
  unknown3: number;
  soundEffectId: number;
}

export interface DosMetaTerrain {
  width: number;
  height: number;
  imageLoc: number;
  maskLoc: number;
  unknown1: number;
}

export interface DosVgaColorRec {
  r: number;
  g: number;
  b: number;
}

export type DosVgaPalette8 = DosVgaColorRec[];

export interface DosGroundRec {
  objectInfoArray: DosMetaObject[]; // 16
  terrainInfoArray: DosMetaTerrain[]; // 64
  egaPaletteCustom: Uint8Array;
  egaPaletteStandard: Uint8Array;
  egaPalettePreview: Uint8Array;
  vgaPaletteCustom: DosVgaPalette8;
  vgaPaletteStandard: DosVgaPalette8;
  vgaPalettePreview: DosVgaPalette8;
}

export const DOS_GROUND_SIZE = 1056;

function readVgaPalette8(b: Uint8Array, ofs: number): DosVgaPalette8 {
  const pal: DosVgaPalette8 = [];
  for (let i = 0; i < 8; i++) pal.push({ r: b[ofs + i * 3], g: b[ofs + i * 3 + 1], b: b[ofs + i * 3 + 2] });
  return pal;
}

export function parseDosGround(b: Uint8Array): DosGroundRec {
  if (b.length < DOS_GROUND_SIZE) throw new Error('Stream read error (ground data too short)');
  const objectInfoArray: DosMetaObject[] = [];
  for (let i = 0; i < 16; i++) {
    const o = i * 28;
    objectInfoArray.push({
      animationFlags: getWordLE(b, o + 0),
      startAnimationFrameIndex: b[o + 2],
      animationFrameCount: b[o + 3],
      width: b[o + 4],
      height: b[o + 5],
      animationFrameDataSize: getWordLE(b, o + 6),
      maskOffsetFromImage: getWordLE(b, o + 8),
      unknown1: getWordLE(b, o + 10),
      unknown2: getWordLE(b, o + 12),
      triggerLeft: getWordLE(b, o + 14),
      triggerTop: getWordLE(b, o + 16),
      triggerWidth: b[o + 18],
      triggerHeight: b[o + 19],
      triggerEffectId: b[o + 20],
      animationFramesBaseLoc: getWordLE(b, o + 21),
      previewImageLocation: getWordLE(b, o + 23),
      unknown3: getWordLE(b, o + 25),
      soundEffectId: b[o + 27],
    });
  }
  const terrainInfoArray: DosMetaTerrain[] = [];
  for (let i = 0; i < 64; i++) {
    const o = 448 + i * 8;
    terrainInfoArray.push({
      width: b[o],
      height: b[o + 1],
      imageLoc: getWordLE(b, o + 2),
      maskLoc: getWordLE(b, o + 4),
      unknown1: getWordLE(b, o + 6),
    });
  }
  return {
    objectInfoArray,
    terrainInfoArray,
    egaPaletteCustom: b.slice(960, 968),
    egaPaletteStandard: b.slice(968, 976),
    egaPalettePreview: b.slice(976, 984),
    vgaPaletteCustom: readVgaPalette8(b, 984),
    vgaPaletteStandard: readVgaPalette8(b, 1008),
    vgaPalettePreview: readVgaPalette8(b, 1032),
  };
}

/* ------------------------------------------------------------------------------------------------
   ODDTABLE.DAT: records of 12 big endian words + 32 char title (56 bytes)
------------------------------------------------------------------------------------------------- */

export const DOS_ODDTABLE_REC_SIZE = 56;

export function parseOddTable(data: Uint8Array): Uint8Array[] {
  const recs: Uint8Array[] = [];
  const n = Math.trunc(data.length / DOS_ODDTABLE_REC_SIZE);
  for (let i = 0; i < n; i++) recs.push(data.slice(i * DOS_ODDTABLE_REC_SIZE, (i + 1) * DOS_ODDTABLE_REC_SIZE));
  return recs;
}

/* ------------------------------------------------------------------------------------------------
   Palettes
------------------------------------------------------------------------------------------------- */

/** DosInLevelPalettes[christmas]: these values still need the "shl 2" conversion. */
export const DosInLevelPalettes: readonly [DosVgaPalette8, DosVgaPalette8] = [
  [
    { r: 0, g: 0, b: 0 }, // black
    { r: 16, g: 16, b: 56 }, // blue
    { r: 0, g: 44, b: 0 }, // green
    { r: 60, g: 52, b: 52 }, // white
    { r: 44, g: 44, b: 0 }, // yellow
    { r: 60, g: 8, b: 8 }, // red
    { r: 32, g: 32, b: 32 }, // gray
    { r: 0, g: 0, b: 0 }, // not used
  ],
  [
    { r: 0, g: 0, b: 0 }, // black
    { r: 60, g: 8, b: 8 }, // red
    { r: 0, g: 44, b: 0 }, // green
    { r: 60, g: 52, b: 52 }, // white
    { r: 44, g: 44, b: 0 }, // yellow
    { r: 16, g: 16, b: 56 }, // blue
    { r: 32, g: 32, b: 32 }, // gray
    { r: 0, g: 0, b: 0 }, // not used
  ],
];

/** These values do not need to be converted. */
export const DosMainMenuPalette: readonly DosVgaColorRec[] = [
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 64, b: 32 },
  { r: 96, g: 48, b: 32 },
  { r: 48, g: 0, b: 16 },
  { r: 32, g: 8, b: 124 },
  { r: 64, g: 44, b: 144 },
  { r: 104, g: 88, b: 164 },
  { r: 152, g: 140, b: 188 },
  { r: 0, g: 80, b: 0 },
  { r: 0, g: 96, b: 16 },
  { r: 0, g: 112, b: 32 },
  { r: 0, g: 128, b: 64 },
  { r: 208, g: 208, b: 208 },
  { r: 176, g: 176, b: 0 },
  { r: 64, g: 80, b: 176 },
  { r: 224, g: 128, b: 144 },
];

/**
 * Dos.Structures.DosVgaColorToColor32. NB: the Delphi function never sets the alpha byte (it is
 * whatever happened to be in the result register); it is only used for display, so we use $FF.
 */
export function dosVgaColorToColor32(c: DosVgaColorRec): TColor32 {
  return color32((c.r * 4) & 0xff, (c.g * 4) & 0xff, (c.b * 4) & 0xff, 0xff);
}

/** Dos.Structures.GetDosMainMenuPaletteColors32 (alpha 0, rgb unconverted). */
export function getDosMainMenuPaletteColors32(): Uint32Array {
  const r = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    const c = DosMainMenuPalette[i];
    r[i] = color32(c.r, c.g, c.b, 0);
  }
  return r;
}

/** Dos.Structures.DosVgaPalette8ToLemmixPalette: 6 -> 8 bit color conversion, alpha 0. */
export function dosVgaPalette8ToLemmixPalette(pal: DosVgaPalette8): Uint32Array {
  const r = new Uint32Array(8);
  for (let i = 0; i < 8; i++) {
    const d = pal[i];
    r[i] = color32(Math.trunc((d.r * 255) / 63), Math.trunc((d.g * 255) / 63), Math.trunc((d.b * 255) / 63), 0);
  }
  return r;
}
