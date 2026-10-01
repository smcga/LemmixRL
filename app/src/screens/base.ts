/**
 * Port of GameScreen.Base (TGameBaseScreen, TPurpleFont) and Dos.MainDat (TMainDatExtractor): the DOS style screens
 * draw into a bitmap (the TImage32 of the form) with graphics from main.dat.
 */
import {
  Bitmap32,
  type DataProvider,
  DataType,
  type DosDatSection,
  DosDatDecompressor,
  DosPlanarBitmap,
  DrawMode,
  getDosMainMenuPaletteColors32,
  intersectRect,
  offsetRect,
  type Rect,
  StyleDef,
  type Style,
  type TColor32,
} from '../../../engine/src/index.ts';
import { CR } from '../texts.ts';

export enum ScreenType {
  Menu,
  Preview,
  Play,
  Postview,
  LevelCode,
}

/** TMainDatExtractor */
export class MainDatExtractor {
  private sections: DosDatSection[] | null = null;
  private readonly decompressor = new DosDatDecompressor();

  constructor(
    private readonly data: DataProvider,
    private readonly styleName: string,
    private readonly fileName: string,
  ) {}

  private ensureLoaded(): DosDatSection[] {
    if (!this.sections) {
      const stream = this.data.createDataStream(this.styleName, this.fileName, DataType.LemmingData);
      this.sections = this.decompressor.loadSectionList(stream, false);
    }
    return this.sections;
  }

  private ensureDecompressed(section: number): DosDatSection {
    const sec = this.ensureLoaded()[section];
    if (sec.decompressedData.size === 0) this.decompressor.decompressSection(sec.compressedData, sec.decompressedData);
    return sec;
  }

  extractBitmap(bmp: Bitmap32, section: number, position: number, width: number, height: number, bpp: number, pal: Uint32Array): void {
    DosPlanarBitmap.loadFromStream(this.ensureDecompressed(section).decompressedData, bmp, position, width, height, bpp, pal);
  }

  extractAnimation(bmp: Bitmap32, section: number, pos: number, width: number, height: number, frameCount: number, bpp: number, pal: Uint32Array): void {
    DosPlanarBitmap.loadAnimationFromStream(this.ensureDecompressed(section).decompressedData, bmp, pos, width, height, frameCount, bpp, pal);
  }

  /** The brown background, used in several screens. */
  extractBrownBackGround(bmp: Bitmap32): void {
    this.extractBitmap(bmp, 3, 0, 320, 104, 2, getDosMainMenuPaletteColors32());
  }
}

export const PURPLEFONTCOUNT = '~'.charCodeAt(0) - '!'.charCodeAt(0) + 1;

/** TPurpleFont: the characters '!'..'~', 16x16, drawn with "just show transparent". */
export class PurpleFont {
  readonly bitmaps: Bitmap32[] = [];

  constructor() {
    for (let i = 0; i < PURPLEFONTCOUNT; i++) {
      const b = new Bitmap32();
      b.onPixelCombine = (f: TColor32, bk: TColor32) => (f !== 0 ? f : bk);
      b.drawMode = DrawMode.Custom;
      this.bitmaps.push(b);
    }
  }

  bitmapOfChar(ch: string): Bitmap32 {
    return this.bitmaps[ch.charCodeAt(0) - 33];
  }
}

function isFontChar(c: string): boolean {
  const code = c.charCodeAt(0);
  return code >= 33 && code <= 126;
}

/** TGameBaseScreen.MakeList: lines, each followed by one CR item per line feed. */
export function makeList(s: string): string[] {
  const list: string[] = [];
  let start = 0;
  let p = 0;
  for (;;) {
    if (p >= s.length) {
      list.push(s.slice(start, p));
      break;
    }
    if (s[p] === CR) {
      list.push(s.slice(start, p));
      while (s[p] === CR) {
        list.push(CR);
        p++;
      }
      if (p >= s.length) break;
      start = p;
    }
    p++;
  }
  return list;
}

/** The DOS screen basics of TGameBaseScreen. */
export class DosScreenBase {
  readonly mainDat: MainDatExtractor;
  readonly purpleFont = new PurpleFont();
  readonly background = new Bitmap32();
  readonly backBuffer = new Bitmap32();
  /** ScreenImg.Bitmap */
  readonly screen = new Bitmap32();

  constructor(
    readonly data: DataProvider,
    readonly style: Style,
  ) {
    this.mainDat = new MainDatExtractor(data, style.name, style.mainDatFileName);
  }

  initializeImageSize(width: number, height: number): void {
    this.screen.setSize(width, height);
  }

  extractBackGround(): void {
    this.mainDat.extractBrownBackGround(this.background);
  }

  extractPurpleFont(): void {
    const pal = getDosMainMenuPaletteColors32();
    // there are 5 signs in ohno stored before the purple font (5 sections)
    const pos = this.style.def === StyleDef.Ohno ? 0x69b0 + 972 : 0x69b0;
    this.mainDat.extractBitmap(this.purpleFont.bitmaps[0], 4, pos, 16, 16, 3, pal);
    // the position is updated automatically by stream reading (-1 parameter)
    for (let i = 1; i < PURPLEFONTCOUNT; i++) this.mainDat.extractBitmap(this.purpleFont.bitmaps[i], 4, -1, 16, 16, 3, pal);
  }

  tileBackgroundBitmap(x: number, y: number, dst: Bitmap32 = this.screen): void {
    for (let ay = y; ay < dst.height; ay += this.background.height)
      for (let ax = x; ax < dst.width; ax += this.background.width) this.background.drawTo(dst, ax, ay);
  }

  /** Linefeeds and spaces increment 16 pixels. */
  calcPurpleTextSize(s: string): Rect {
    const r = { left: 0, top: 0, right: 0, bottom: 0 };
    let cx = 0;
    if (s.length > 0) r.bottom = 16;
    for (const c of s) {
      if (c === CR) {
        r.bottom += 16;
        cx = 0;
      } else if (isFontChar(c) || c === ' ') {
        cx += 16;
        if (cx > r.right) r.right = cx;
      }
    }
    return r;
  }

  drawPurpleText(dst: Bitmap32, s: string, x: number, y: number, restoreBuffer: Bitmap32 | null = null): void {
    if (s.length === 0) return;
    if (restoreBuffer) {
      const r = intersectRect(offsetRect(this.calcPurpleTextSize(s), x, y), restoreBuffer.boundsRect);
      restoreBuffer.drawToRect(dst, r, r);
    }
    let cx = x;
    let cy = y;
    for (const c of s) {
      if (c === CR) {
        cy += 16;
        cx = x;
      } else if (c === ' ') cx += 16;
      else if (isFontChar(c)) {
        this.purpleFont.bitmapOfChar(c).drawTo(dst, cx, cy);
        cx += 16;
      }
    }
  }

  drawPurpleTextCentered(dst: Bitmap32, s: string, y: number, restoreBuffer: Bitmap32 | null = null, eraseOnly = false): void {
    const list = makeList(s);
    if (restoreBuffer) {
      const size = this.calcPurpleTextSize(s);
      const r = intersectRect(offsetRect(size, Math.trunc((dst.width - (size.right - size.left)) / 2), y), restoreBuffer.boundsRect);
      restoreBuffer.drawToRect(dst, r, r);
    }
    if (eraseOnly) return;
    for (const h of list) {
      const x = Math.trunc((dst.width - 16 * h.length) / 2);
      if (h !== CR) this.drawPurpleText(dst, h, x, y);
      else y += 16;
    }
  }
}
