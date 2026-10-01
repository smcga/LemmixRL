/**
 * Port of Styles.Base.pas: TStyle, TLemmingAnimationSet, TGraphicSet, TLevelSystem, TSection,
 * TLevelLoadingInformation and TLevelFactory.
 */
import { ByteStream } from '../base/stream.ts';
import { EngineError, leadZeroStr } from '../base/utils.ts';
import { DataType, type DataProvider } from '../data/datasource.ts';
import { DosPlanarBitmap, dosPaletteEntryRecToColor32, VgaSpecBitmap } from '../dos/bitmaps.ts';
import { DosDatDecompressor } from '../dos/compression.ts';
import { clMask32, LemmingAction, type Mechanics } from '../dos/consts.ts';
import {
  ansiCharArrayToString,
  delphiTrim,
  DOS_ODDTABLE_REC_SIZE,
  DosInLevelPalettes,
  dosVgaPalette8ToLemmixPalette,
  LVL_SIZE,
  lvlTitleAsString,
  lvlTitleBytes,
  parseDosGround,
  parseOddTable,
  type LVLRec,
} from '../dos/structures.ts';
import { Bitmap32 } from '../gr32/bitmap32.ts';
import { color32, type TColor32 } from '../gr32/color.ts';
import type { Level } from '../level/base.ts';
import { getLevelCode, shortHash } from '../level/hash.ts';
import { translateLevel } from '../level/loader.ts';
import { LemmingAnimationType, MetaExtraAnimation, MetaLemmingAnimation, MetaObject, MetaTerrain } from '../meta/structures.ts';

export enum StyleDef {
  Orig = 0,
  Ohno = 1,
  H94 = 2,
  X91 = 3,
  X92 = 4,
  User = 5,
}

export const STYLE_NAMES = ['Orig', 'Ohno', 'H94', 'X91', 'X92', 'User'] as const;

export const STYLE_DESCRIPTIONS = [
  'Original Lemmings',
  'Oh No More Lemmings!',
  'Holiday Lemmings 1994',
  'Xmas Lemmings 1991',
  'Xmas Lemmings 1992',
  'User Lemmings',
] as const;

/* ================================================================================================
   TLemmingAnimationSet
================================================================================================ */

export const LTR = 0;
export const RTL = 1;

// dos animations ordered by their appearance in main.dat
export const ANIM_WALKING = 0;
export const ANIM_JUMPING = 1;
export const ANIM_WALKING_RTL = 2;
export const ANIM_JUMPING_RTL = 3;
export const ANIM_DIGGING = 4;
export const ANIM_CLIMBING = 5;
export const ANIM_CLIMBING_RTL = 6;
export const ANIM_DROWNING = 7;
export const ANIM_HOISTING = 8;
export const ANIM_HOISTING_RTL = 9;
export const ANIM_BRICKLAYING = 10;
export const ANIM_BRICKLAYING_RTL = 11;
export const ANIM_BASHING = 12;
export const ANIM_BASHING_RTL = 13;
export const ANIM_MINING = 14;
export const ANIM_MINING_RTL = 15;
export const ANIM_FALLING = 16;
export const ANIM_FALLING_RTL = 17;
export const ANIM_UMBRELLA = 18;
export const ANIM_UMBRELLA_RTL = 19;
export const ANIM_SPLATTING = 20;
export const ANIM_EXITING = 21;
export const ANIM_FRIED = 22;
export const ANIM_BLOCKING = 23;
export const ANIM_SHRUGGING = 24;
export const ANIM_SHRUGGING_RTL = 25;
export const ANIM_OHNOING = 26;
export const ANIM_EXPLOSION = 27;

/** TLemmingAnimationSet.AnimationIndices[TLemmingAction, LTR..RTL] */
export const AnimationIndices: readonly (readonly [number, number])[] = [
  [0, 0], // None
  [ANIM_WALKING, ANIM_WALKING_RTL],
  [ANIM_JUMPING, ANIM_JUMPING_RTL],
  [ANIM_DIGGING, ANIM_DIGGING],
  [ANIM_CLIMBING, ANIM_CLIMBING_RTL],
  [ANIM_DROWNING, ANIM_DROWNING],
  [ANIM_HOISTING, ANIM_HOISTING_RTL],
  [ANIM_BRICKLAYING, ANIM_BRICKLAYING_RTL],
  [ANIM_BASHING, ANIM_BASHING_RTL],
  [ANIM_MINING, ANIM_MINING_RTL],
  [ANIM_FALLING, ANIM_FALLING_RTL],
  [ANIM_UMBRELLA, ANIM_UMBRELLA_RTL],
  [ANIM_SPLATTING, ANIM_SPLATTING],
  [ANIM_EXITING, ANIM_EXITING],
  [ANIM_FRIED, ANIM_FRIED],
  [ANIM_BLOCKING, ANIM_BLOCKING],
  [ANIM_SHRUGGING, ANIM_SHRUGGING_RTL],
  [ANIM_OHNOING, ANIM_OHNOING],
  [ANIM_EXPLOSION, ANIM_EXPLOSION],
];

export function animationIndex(action: LemmingAction, rtl: boolean): number {
  return AnimationIndices[action][rtl ? RTL : LTR];
}

export class LemmingAnimationSet {
  readonly metaLemmingAnimationList: MetaLemmingAnimation[] = [];
  readonly metaExtraAnimationList: MetaExtraAnimation[] = [];
  readonly lemmingBitmaps: Bitmap32[] = [];
  readonly extraBitmaps: Bitmap32[] = [];
  animationPalette: Uint32Array = new Uint32Array(0);
  explosionMaskBitmap!: Bitmap32;
  bashMasksBitmap!: Bitmap32;
  bashMasksRTLBitmap!: Bitmap32;
  mineMasksBitmap!: Bitmap32;
  mineMasksRTLBitmap!: Bitmap32;
  countDownDigitsBitmap!: Bitmap32;

  constructor(readonly style: Style) {
    this.initMetadata();
  }

  /** Foot positions from ccexplore's emails, see lemming_mechanics pseudo code. */
  private initMetadata(): void {
    const lem = (loc: number, d: string, f: number, w: number, h: number, bpp: number, fx: number, fy: number, t: LemmingAnimationType) =>
      this.metaLemmingAnimationList.push(new MetaLemmingAnimation(d, f, w, h, bpp, loc, t, fx, fy));
    const msk = (loc: number, d: string, f: number, w: number, h: number, bpp: number) =>
      this.metaExtraAnimationList.push(new MetaExtraAnimation(d, f, w, h, bpp, loc));
    const Loop = LemmingAnimationType.Loop;
    const Once = LemmingAnimationType.Once;
    //  place   description            F   W   H  BPP  FX  FY  animationtype
    lem(0x0000, 'Walking', 8, 16, 10, 2, 8, 10, Loop); // 0
    lem(0x0140, 'Jumping', 1, 16, 10, 2, 8, 10, Once);
    lem(0x0168, 'Walking (rtl)', 8, 16, 10, 2, 8, 10, Loop);
    lem(0x02a8, 'Jumping (rtl)', 1, 16, 10, 2, 8, 10, Once);
    lem(0x02d0, 'Digging', 16, 16, 14, 3, 8, 12, Loop);
    lem(0x0810, 'Climbing', 8, 16, 12, 2, 8, 12, Loop);
    lem(0x0990, 'Climbing (rtl)', 8, 16, 12, 2, 8, 12, Loop);
    lem(0x0b10, 'Drowning', 16, 16, 10, 2, 8, 10, Once);
    lem(0x0d90, 'Hoisting', 8, 16, 12, 2, 8, 12, Once);
    lem(0x0f10, 'Hoisting (rtl)', 8, 16, 12, 2, 8, 12, Once);
    lem(0x1090, 'Building', 16, 16, 13, 3, 8, 13, Loop); // 10
    lem(0x1570, 'Building (rtl)', 16, 16, 13, 3, 8, 13, Loop);
    lem(0x1a50, 'Bashing', 32, 16, 10, 3, 8, 10, Loop);
    lem(0x21d0, 'Bashing (rtl)', 32, 16, 10, 3, 8, 10, Loop);
    lem(0x2950, 'Mining', 24, 16, 13, 3, 8, 13, Loop);
    lem(0x30a0, 'Mining (rtl)', 24, 16, 13, 3, 8, 13, Loop);
    lem(0x37f0, 'Falling', 4, 16, 10, 2, 8, 10, Loop);
    lem(0x3890, 'Falling (rtl)', 4, 16, 10, 2, 8, 10, Loop);
    lem(0x3930, 'Umbrella', 8, 16, 16, 3, 8, 16, Loop);
    lem(0x3c30, 'Umbrella (rtl)', 8, 16, 16, 3, 8, 16, Loop);
    lem(0x3f30, 'Splatting', 16, 16, 10, 2, 8, 10, Once); // 20
    lem(0x41b0, 'Exiting', 8, 16, 13, 2, 8, 13, Once);
    lem(0x4350, 'Vaporizing', 14, 16, 14, 4, 8, 14, Once);
    lem(0x4970, 'Blocking', 16, 16, 10, 2, 8, 10, Loop);
    lem(0x4bf0, 'Shrugging', 8, 16, 10, 2, 8, 10, Once);
    lem(0x4d30, 'Shrugging (rtl)', 8, 16, 10, 2, 8, 10, Once);
    lem(0x4e70, 'Oh-No-ing', 16, 16, 10, 2, 8, 10, Once);
    lem(0x50f0, 'Exploding', 1, 32, 32, 3, 16, 25, Once); // 27

    //  place   description            F   W   H  BPP
    msk(0x0000, 'Bashmasks', 4, 16, 10, 1);
    msk(0x0050, 'Bashmasks (rtl)', 4, 16, 10, 1);
    msk(0x00a0, 'Minemasks', 2, 16, 13, 1);
    msk(0x00d4, 'Minemasks (rtl)', 2, 16, 13, 1);
    msk(0x0108, 'Explosionmask', 1, 16, 22, 1);
    msk(0x0154, 'Countdown digits', 5, 8, 8, 1); // we only take the digits 5 downto zero
  }

  load(data: DataProvider): void {
    this.lemmingBitmaps.length = 0;
    this.extraBitmaps.length = 0;
    const pal = this.animationPalette.slice(); // Copy(fAnimationPalette)
    const decompressor = new DosDatDecompressor();
    const stream = data.createDataStream(this.style.name, this.style.mainDatFileName, DataType.LemmingData);
    const sections = decompressor.loadSectionList(stream, false);

    decompressor.decompressSection(sections[0].compressedData, sections[0].decompressedData);
    let mem = sections[0].decompressedData;
    for (const mla of this.metaLemmingAnimationList) {
      const bmp = new Bitmap32();
      this.lemmingBitmaps.push(bmp);
      DosPlanarBitmap.loadAnimationFromStream(mem, bmp, mla.imageLocation, mla.width, mla.height, mla.frameCount, mla.bitsPerPixel, pal);
    }

    pal[0] = 0;
    pal[1] = clMask32; // the ugly mask pink
    decompressor.decompressSection(sections[1].compressedData, sections[1].decompressedData);
    mem = sections[1].decompressedData;
    const temp = new Bitmap32();
    for (const ma of this.metaExtraAnimationList) {
      let y = 0;
      const bmp = new Bitmap32();
      this.extraBitmaps.push(bmp);
      bmp.setSize(ma.width, ma.frameCount * ma.height);
      bmp.clear(0);
      mem.seek(ma.imageLocation);
      for (let f = 0; f < ma.frameCount; f++) {
        DosPlanarBitmap.loadFromStream(mem, temp, -1, ma.width, ma.height, ma.bitsPerPixel, pal);
        temp.drawTo(bmp, 0, y);
        y += ma.height;
      }
    }

    this.bashMasksBitmap = this.extraBitmaps[0];
    this.bashMasksRTLBitmap = this.extraBitmaps[1];
    this.mineMasksBitmap = this.extraBitmaps[2];
    this.mineMasksRTLBitmap = this.extraBitmaps[3];
    this.explosionMaskBitmap = this.extraBitmaps[4];
    this.countDownDigitsBitmap = this.extraBitmaps[5];
    this.countDownDigitsBitmap.replaceColor(clMask32, pal[3]);
  }
}

/* ================================================================================================
   TGraphicSet
================================================================================================ */

export class GraphicSet {
  graphicSetId = -1;
  graphicSetIdExt = -1;
  metaDataFile = '';
  graphicFile = '';
  graphicExtFile = '';
  readonly metaObjectList: MetaObject[] = [];
  readonly metaTerrainList: MetaTerrain[] = [];
  readonly terrainBitmaps: Bitmap32[] = [];
  readonly objectBitmaps: Bitmap32[] = [];
  readonly specialBitmap = new Bitmap32();
  paletteCustom: Uint32Array = new Uint32Array(0);
  paletteStandard: Uint32Array = new Uint32Array(0);
  palettePreview: Uint32Array = new Uint32Array(0);
  palette: Uint32Array = new Uint32Array(0);
  brickColor: TColor32 = 0;

  constructor(readonly style: Style) {}

  private clear(): void {
    this.metaObjectList.length = 0;
    this.metaTerrainList.length = 0;
    this.terrainBitmaps.length = 0;
    this.objectBitmaps.length = 0;
    this.specialBitmap.setSize(0, 0);
    this.paletteCustom = new Uint32Array(0);
    this.paletteStandard = new Uint32Array(0);
    this.palettePreview = new Uint32Array(0);
    this.palette = new Uint32Array(0);
    this.brickColor = 0;
    this.metaDataFile = '';
    this.graphicFile = '';
    this.graphicExtFile = '';
  }

  private loadMetaData(data: DataProvider): void {
    const d = data.createDataStream(this.style.name, this.metaDataFile, DataType.LevelGraphics);
    const dosData = parseDosGround(d.readBuffer(1056));

    this.paletteCustom = dosVgaPalette8ToLemmixPalette(dosData.vgaPaletteCustom);
    this.paletteStandard = dosVgaPalette8ToLemmixPalette(dosData.vgaPaletteStandard);
    this.palettePreview = dosVgaPalette8ToLemmixPalette(dosData.vgaPalettePreview);

    // if special graphic then overwrite the custom palette
    if (this.graphicSetIdExt > 0) {
      const specStream = data.createDataStream(this.style.name, this.graphicExtFile, DataType.LevelSpecialGraphics);
      this.paletteCustom = dosVgaPalette8ToLemmixPalette(VgaSpecBitmap.loadPaletteFromStream(specStream));
    }

    // AssemblePalette: concatenate the fixed palette and the custom palette, then copy the first custom
    // color to the last fixed color (bridges, minimap). For special graphics a hardcoded color is used.
    this.palette = new Uint32Array(16);
    const fixed = DosInLevelPalettes[this.style.christmasPalette ? 1 : 0];
    for (let i = 0; i <= 7; i++) this.palette[i] = dosPaletteEntryRecToColor32(fixed[i]);
    for (let i = 8; i <= 15; i++) this.palette[i] = this.paletteCustom[i - 8];
    if (this.graphicSetIdExt > 0) this.palette[8] = color32(124, 124, 0, 0);
    this.palette[7] = this.palette[8];
    this.brickColor = this.palette[7];

    for (const o of dosData.objectInfoArray) {
      if (o.width === 0) break; // the rest is empty
      const mo = new MetaObject();
      this.metaObjectList.push(mo);
      mo.assignFromDos(o);
    }

    // if extended graphic then no terrain
    if (this.graphicSetIdExt > 0) return;

    for (const t of dosData.terrainInfoArray) {
      if (t.width === 0) break; // the rest is empty
      const mt = new MetaTerrain();
      this.metaTerrainList.push(mt);
      mt.assignFromDos(t);
    }
  }

  private loadData(data: DataProvider): void {
    const decompressor = new DosDatDecompressor();
    const dataStream = data.createDataStream(this.style.name, this.graphicFile, DataType.LevelGraphics);
    const sections = decompressor.loadSectionList(dataStream, true);

    if (this.graphicSetIdExt <= 0) {
      // terrains from the first section
      const mem = sections[0].decompressedData;
      for (const mt of this.metaTerrainList) {
        const bmp = new Bitmap32();
        this.terrainBitmaps.push(bmp);
        DosPlanarBitmap.loadFromStream(mem, bmp, mt.imageLocation, mt.width, mt.height, 4, this.palette);
      }
    } else {
      // the one terrain bitmap from the vgaspec
      const specStream = data.createDataStream(this.style.name, this.graphicExtFile, DataType.LevelSpecialGraphics);
      VgaSpecBitmap.loadFromStream(specStream, this.specialBitmap);
    }

    // objects from the second section
    const mem = sections[1].decompressedData;
    for (const mo of this.metaObjectList) {
      const bmp = new Bitmap32();
      bmp.setSize(mo.width, mo.height * mo.animationFrameCount);
      this.objectBitmaps.push(bmp);
      let y = 0;
      let loc = mo.animationFramesBaseLoc;
      const frame = new Bitmap32();
      for (let f = 0; f < mo.animationFrameCount; f++) {
        DosPlanarBitmap.loadFromStream(mem, frame, loc, mo.width, mo.height, 4, this.palette);
        frame.drawTo(bmp, 0, y);
        y += mo.height;
        loc += mo.animationFrameDataSize;
      }
    }
  }

  load(data: DataProvider, id: number, idExt: number): void {
    this.clear();
    this.graphicSetId = id;
    this.graphicSetIdExt = idExt;
    const names = this.style.levelSystem.getFileNamesForGraphicSet(id, idExt);
    this.metaDataFile = names.metaDataFileName;
    this.graphicFile = names.graphicsFileName;
    this.graphicExtFile = names.specialGraphicsFileName;
    this.loadMetaData(data);
    this.loadData(data);
  }
}

/* ================================================================================================
   TLevelSystem, TSection, TLevelLoadingInformation, TLevelFactory
================================================================================================ */

export interface GraphicSetFileNames {
  metaDataFileName: string;
  graphicsFileName: string;
  specialGraphicsFileName: string;
}

export abstract class LevelSystem {
  readonly sectionList: Section[] = [];
  oddTableFileName = '';

  constructor(readonly style: Style) {}

  /** Must be called once after construction (Delphi: AfterConstruction). */
  initialize(): void {
    this.doInitializeLevelSystem();
    if (this.sectionList.length === 0) throw new EngineError('No game sections implemented');
    for (const s of this.sectionList)
      if (s.levelLoadingInformationList.length === 0) throw new EngineError('No levelinformation found in one of the sections');
  }

  protected abstract doInitializeLevelSystem(): void;

  /** all our 6 built in styles use the same naming convention */
  static getDefaultNamesForGraphics(id: number, idExt: number): GraphicSetFileNames {
    return {
      metaDataFileName: 'ground' + id + 'o.dat',
      graphicsFileName: 'vgagr' + id + '.dat',
      specialGraphicsFileName: idExt > 0 ? 'vgaspec' + (idExt - 1) + '.dat' : '',
    };
  }

  getFileNamesForGraphicSet(id: number, idExt: number): GraphicSetFileNames {
    return LevelSystem.getDefaultNamesForGraphics(id, idExt);
  }

  doAddSection(section: Section): void {
    section.sectionIndex = this.sectionList.length;
    this.sectionList.push(section);
    const ix = section.sectionIndex;
    if (ix > 0) {
      const prev = this.sectionList[ix - 1];
      prev.next = section;
      section.prev = prev;
    }
  }

  firstLevel(): LevelLoadingInformation {
    return this.sectionList[0].levelLoadingInformationList[0];
  }

  lastLevel(): LevelLoadingInformation {
    const s = this.sectionList[this.sectionList.length - 1];
    return s.levelLoadingInformationList[s.levelLoadingInformationList.length - 1];
  }

  findLevelByIndex(sectionIndex: number, levelIndex: number): LevelLoadingInformation | null {
    if (sectionIndex < this.sectionList.length && levelIndex < this.sectionList[sectionIndex].levelLoadingInformationList.length)
      return this.sectionList[sectionIndex].levelLoadingInformationList[levelIndex];
    return null;
  }

  findLevelByHash(hash: bigint): LevelLoadingInformation | null {
    for (const section of this.sectionList)
      for (const info of section.levelLoadingInformationList) if (info.getLevelHash() === hash) return info;
    return null;
  }

  allLevels(): LevelLoadingInformation[] {
    return this.sectionList.flatMap((s) => s.levelLoadingInformationList);
  }
}

export class Section {
  sectionIndex = 0;
  sectionName = '';
  prev: Section | null = null;
  next: Section | null = null;
  readonly levelLoadingInformationList: LevelLoadingInformation[] = [];

  constructor(readonly levelSystem: LevelSystem) {
    levelSystem.doAddSection(this);
  }

  get style(): Style {
    return this.levelSystem.style;
  }

  doAddLevelInfo(info: LevelLoadingInformation): void {
    info.levelIndex = this.levelLoadingInformationList.length;
    this.levelLoadingInformationList.push(info);
    const ix = info.levelIndex;
    if (ix > 0) {
      const prev = this.levelLoadingInformationList[ix - 1];
      prev.next = info;
      info.prev = prev;
    } else if (this.prev && this.prev.levelLoadingInformationList.length > 0) {
      const prev = this.prev.levelLoadingInformationList[this.prev.levelLoadingInformationList.length - 1];
      prev.next = info;
      info.prev = prev;
    }
  }
}

export class LevelLoadingInformation {
  levelIndex = 0;
  sourceFileName = '';
  sectionIndexInSourceFile = 0;
  useOddTable = false;
  oddTableIndex = -1;
  musicFileName = '';
  prev: LevelLoadingInformation | null = null;
  next: LevelLoadingInformation | null = null;
  private cachedLVL: LVLRec | null = null;
  private cachedHash = 0n;
  private cachedLevelCode = '';

  constructor(readonly section: Section) {
    section.doAddLevelInfo(this);
  }

  get style(): Style {
    return this.section.style;
  }

  get levelSystem(): LevelSystem {
    return this.section.levelSystem;
  }

  get sectionIndex(): number {
    return this.section.sectionIndex;
  }

  get isCached(): boolean {
    return this.cachedLVL !== null;
  }

  private cacheLVL(): LVLRec {
    if (!this.cachedLVL) {
      this.cachedLVL = loadLVL(this);
      this.cachedHash = shortHash(this.cachedLVL);
      this.cachedLevelCode = getLevelCode(this.cachedHash);
    }
    return this.cachedLVL;
  }

  loadLevel(level: Level): void {
    translateLevel(this.cacheLVL(), level);
  }

  getLevelHash(): bigint {
    this.cacheLVL();
    return this.cachedHash;
  }

  getLevelCode(): string {
    this.cacheLVL();
    return this.cachedLevelCode;
  }

  getRawLVL(): LVLRec {
    return this.cacheLVL().slice();
  }

  getRawLVLTitle(): Uint8Array {
    return lvlTitleBytes(this.cacheLVL()).slice();
  }

  /** string(LevelName) (stops at the first #0), optionally trimmed. */
  getLevelTitle(trimmed = true): string {
    const s = ansiCharArrayToString(lvlTitleBytes(this.cacheLVL()));
    return trimmed ? delphiTrim(s) : s;
  }

  /** LVLTitleAsString of the raw title (all 32 characters). */
  getRawTitleString(trimmed = true): string {
    return lvlTitleAsString(lvlTitleBytes(this.cacheLVL()), trimmed);
  }
}

/** TLevelFactory.LoadLVL: DAT section (+ optional odd table patch). */
export function loadLVL(info: LevelLoadingInformation): LVLRec {
  const data = info.style.data;
  const decompressor = new DosDatDecompressor();
  const dataStream = data.createDataStream(info.style.name, info.sourceFileName, DataType.Level);
  const sections = decompressor.loadSectionList(dataStream, false);
  const theSection = sections[info.sectionIndexInSourceFile];
  if (!theSection) throw new EngineError('Level section not found: ' + info.sourceFileName + ' #' + info.sectionIndexInSourceFile);
  decompressor.decompressSection(theSection.compressedData, theSection.decompressedData);
  theSection.decompressedData.seek(0);
  const lvl = new Uint8Array(LVL_SIZE);
  lvl.set(theSection.decompressedData.readBuffer(LVL_SIZE));
  theSection.decompressedData.seek(0);

  if (info.useOddTable) {
    const ox = info.oddTableIndex;
    const oddStream = data.createDataStream(info.style.name, info.levelSystem.oddTableFileName, DataType.LemmingData);
    const recs = parseOddTable(oddStream.bytes);
    const rec = recs[ox];
    if (!rec) throw new EngineError('Odd table index out of range');
    lvl.set(rec.subarray(0, DOS_ODDTABLE_REC_SIZE - 32), 0); // the 12 statics words
    lvl.set(rec.subarray(DOS_ODDTABLE_REC_SIZE - 32, DOS_ODDTABLE_REC_SIZE), 0x7e0); // the title
    theSection.decompressedData.writeBuffer(lvl);
  }

  // TLevelLoader.LoadLVLFromStream
  theSection.decompressedData.seek(0);
  const result = new Uint8Array(LVL_SIZE);
  result.set(theSection.decompressedData.readBuffer(LVL_SIZE));
  return result;
}

/* ================================================================================================
   TStyle
================================================================================================ */

export abstract class Style {
  readonly mainDatFileName: string = 'main.dat';
  readonly lemmingAnimationSet: LemmingAnimationSet;
  readonly levelSystem: LevelSystem;

  constructor(
    readonly name: string,
    readonly def: StyleDef,
    readonly data: DataProvider,
  ) {
    this.lemmingAnimationSet = new LemmingAnimationSet(this);
    this.levelSystem = this.createLevelSystem();
    this.levelSystem.initialize();
  }

  protected abstract createLevelSystem(): LevelSystem;

  abstract get mechanics(): Mechanics;

  /** Consts.ChristmasPalette: true for the holiday styles. */
  get christmasPalette(): boolean {
    return this.def === StyleDef.H94 || this.def === StyleDef.X91 || this.def === StyleDef.X92;
  }

  get description(): string {
    return STYLE_DESCRIPTIONS[this.def];
  }
}

/** Utility to create a level loading info quickly. */
export function trackName(i: number): string {
  return 'Track_' + leadZeroStr(i, 2) + '.mod';
}

export function newByteStream(bytes: Uint8Array): ByteStream {
  return new ByteStream(bytes);
}
