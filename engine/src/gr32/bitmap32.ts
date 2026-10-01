/**
 * The subset of Graphics32 (TBitmap32, TByteMap, BlockTransfer, StretchTransfer) that Lemmix uses.
 *
 * The game simulation reads and writes the terrain bitmap ("fWorld") through these primitives, so they
 * replicate GR32 exactly where it matters for the simulation:
 *  - PixelS / SetPixelS are clipped against ClipRect and return OuterColor outside of it;
 *  - DrawTo with dmCustom calls the pixel combiner for every source pixel inside the clipped area,
 *    with the clipping arithmetic of GR32_Resamplers.BlockTransfer / StretchTransfer;
 *  - Assign copies the pixel map plus DrawMode, CombineMode, MasterAlpha and OuterColor.
 * Display-only features (stretching with a resampler, alpha blending) are implemented simply.
 */
import { blendMem, blendMemEx, clBlack32, type TColor32 } from './color.ts';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom };
}

export function rectWidth(r: Rect): number {
  return r.right - r.left;
}

export function rectHeight(r: Rect): number {
  return r.bottom - r.top;
}

/** GR32.IntersectRect: returns the intersection, or the zero rect when the rects do not intersect. */
export function intersectRect(r1: Rect, r2: Rect): Rect {
  const left = r1.left >= r2.left ? r1.left : r2.left;
  const right = r1.right <= r2.right ? r1.right : r2.right;
  const top = r1.top >= r2.top ? r1.top : r2.top;
  const bottom = r1.bottom <= r2.bottom ? r1.bottom : r2.bottom;
  if (right >= left && bottom >= top) return { left, top, right, bottom };
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

/** GR32.IntersectRect including its boolean result. */
export function intersectRectEx(r1: Rect, r2: Rect): [boolean, Rect] {
  const left = r1.left >= r2.left ? r1.left : r2.left;
  const right = r1.right <= r2.right ? r1.right : r2.right;
  const top = r1.top >= r2.top ? r1.top : r2.top;
  const bottom = r1.bottom <= r2.bottom ? r1.bottom : r2.bottom;
  const ok = right >= left && bottom >= top;
  return [ok, ok ? { left, top, right, bottom } : { left: 0, top: 0, right: 0, bottom: 0 }];
}

export function isRectEmpty(r: Rect): boolean {
  return r.right <= r.left || r.bottom <= r.top;
}

export function offsetRect(r: Rect, dx: number, dy: number): Rect {
  return { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
}

export function inflateRect(r: Rect, dx: number, dy: number): Rect {
  return { left: r.left - dx, top: r.top - dy, right: r.right + dx, bottom: r.bottom + dy };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  // TRect.IntersectsWith
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function zeroTopLeftRect(r: Rect): Rect {
  return { left: 0, top: 0, right: r.right - r.left, bottom: r.bottom - r.top };
}

export enum DrawMode {
  Opaque = 0,
  Blend = 1,
  Transparent = 2,
  Custom = 3,
}

/** TPixelCombineEvent(F; var B; M). In TypeScript the new value of B is returned. */
export type PixelCombine = (f: TColor32, b: TColor32, m: number) => TColor32;

export class Bitmap32 {
  width = 0;
  height = 0;
  bits: Uint32Array = new Uint32Array(0);
  clipRect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  outerColor: TColor32 = 0x00000000; // GR32: "by default as full transparency black"
  drawMode: DrawMode = DrawMode.Opaque;
  onPixelCombine: PixelCombine | null = null;
  masterAlpha = 0xff;
  private updateCount = 0;

  constructor(width = 0, height = 0) {
    if (width > 0 || height > 0) this.setSize(width, height);
  }

  /** TCustomMap.SetSize. Returns true when the size changed (and the clip rect was reset). */
  setSize(newWidth: number, newHeight: number): boolean {
    if (newWidth < 0) newWidth = 0;
    if (newHeight < 0) newHeight = 0;
    const changed = newWidth !== this.width || newHeight !== this.height;
    if (changed) {
      this.width = newWidth;
      this.height = newHeight;
      // the GDI backend (Windows DIB section) hands out zero filled memory
      this.bits = new Uint32Array(newWidth * newHeight);
      this.resetClipRect();
    }
    return changed;
  }

  resetClipRect(): void {
    this.clipRect = { left: 0, top: 0, right: this.width, bottom: this.height };
  }

  get empty(): boolean {
    return this.width === 0 || this.height === 0;
  }

  get boundsRect(): Rect {
    return { left: 0, top: 0, right: this.width, bottom: this.height };
  }

  private get clipping(): boolean {
    const c = this.clipRect;
    return !(c.left === 0 && c.top === 0 && c.right === this.width && c.bottom === this.height);
  }

  /** TCustomBitmap32.Clear(FillColor). Default fill color is clBlack32. */
  clear(fillColor: TColor32 = clBlack32): void {
    if (this.empty) return;
    if (this.clipping) {
      const c = this.clipRect;
      this.fillRect(c.left, c.top, c.right, c.bottom, fillColor);
    } else {
      this.bits.fill(fillColor >>> 0);
    }
  }

  pixel(x: number, y: number): TColor32 {
    return this.bits[x + y * this.width];
  }

  setPixel(x: number, y: number, value: TColor32): void {
    this.bits[x + y * this.width] = value;
  }

  pixelS(x: number, y: number): TColor32 {
    const c = this.clipRect;
    if (x >= c.left && x < c.right && y >= c.top && y < c.bottom) return this.bits[x + y * this.width];
    return this.outerColor;
  }

  setPixelS(x: number, y: number, value: TColor32): void {
    const c = this.clipRect;
    if (x >= c.left && x < c.right && y >= c.top && y < c.bottom) this.bits[x + y * this.width] = value;
  }

  /** TCustomBitmap32.Assign(TCustomBitmap32): CopyMapTo + CopyPropertiesTo. */
  assign(src: Bitmap32): void {
    this.setSize(src.width, src.height);
    if (!src.empty) this.bits.set(src.bits);
    this.drawMode = src.drawMode;
    this.masterAlpha = src.masterAlpha;
    this.outerColor = src.outerColor;
  }

  /** TCustomBitmap32.FillRect (unclipped). */
  fillRect(x1: number, y1: number, x2: number, y2: number, value: TColor32): void {
    value = value >>> 0;
    for (let y = y1; y < y2; y++) {
      const row = y * this.width;
      this.bits.fill(value, row + x1, row + x2);
    }
  }

  /** TCustomBitmap32.FillRectS (clipped). */
  fillRectS(x1: number, y1: number, x2: number, y2: number, value: TColor32): void {
    const c = this.clipRect;
    if (x2 > x1 && y2 > y1 && x1 < c.right && y1 < c.bottom && x2 > c.left && y2 > c.top) {
      if (x1 < c.left) x1 = c.left;
      if (y1 < c.top) y1 = c.top;
      if (x2 > c.right) x2 = c.right;
      if (y2 > c.bottom) y2 = c.bottom;
      this.fillRect(x1, y1, x2, y2, value);
    }
  }

  /** TCustomBitmap32.FrameRectS (clipped, outline of the rect excluding right/bottom edge). */
  frameRectS(x1: number, y1: number, x2: number, y2: number, value: TColor32): void {
    if (x2 <= x1 || y2 <= y1) return;
    x2--;
    y2--;
    for (let x = x1; x <= x2; x++) {
      this.setPixelS(x, y1, value);
      this.setPixelS(x, y2, value);
    }
    for (let y = y1; y <= y2; y++) {
      this.setPixelS(x1, y, value);
      this.setPixelS(x2, y, value);
    }
  }

  /** TCustomBitmap32.FlipVert(Dst). With dst omitted (or self) the bitmap is flipped in place. */
  flipVert(dst?: Bitmap32): void {
    const w = this.width;
    if (!dst || dst === this) {
      let j2 = this.height - 1;
      const tmp = new Uint32Array(w);
      for (let j = 0; j < (this.height >> 1); j++) {
        tmp.set(this.bits.subarray(j * w, j * w + w));
        this.bits.copyWithin(j * w, j2 * w, j2 * w + w);
        this.bits.set(tmp, j2 * w);
        j2--;
      }
      return;
    }
    dst.setSize(this.width, this.height);
    let j2 = this.height - 1;
    for (let j = 0; j < this.height; j++) {
      dst.bits.set(this.bits.subarray(j * w, j * w + w), j2 * w);
      j2--;
    }
  }

  replaceColor(fromColor: TColor32, toColor: TColor32): void {
    fromColor = fromColor >>> 0;
    toColor = toColor >>> 0;
    for (let i = 0; i < this.bits.length; i++) if (this.bits[i] === fromColor) this.bits[i] = toColor;
  }

  /** TBitmap32Helper.CalcFrameRect (Base.Bitmaps): frame of a vertical strip. */
  calcFrameRect(frameCount: number, frameIndex: number): Rect {
    const h = Math.trunc(this.height / frameCount);
    const y = h * frameIndex;
    return { left: 0, top: y, right: this.width, bottom: y + h };
  }

  /** DrawTo(Dst, DstX, DstY) -> BlockTransfer with the whole source. */
  drawTo(dst: Bitmap32, dstX: number, dstY: number, srcRect?: Rect): void {
    blockTransfer(dst, dstX, dstY, dst.clipRect, this, srcRect ?? this.boundsRect, this.drawMode, this.onPixelCombine);
  }

  /** DrawTo(Dst, DstRect, SrcRect) -> StretchTransfer. */
  drawToRect(dst: Bitmap32, dstRect: Rect, srcRect?: Rect): void {
    stretchTransfer(dst, dstRect, dst.clipRect, this, srcRect ?? this.boundsRect, this.drawMode, this.onPixelCombine);
  }

  beginUpdate(): void {
    this.updateCount++;
  }

  endUpdate(): void {
    this.updateCount--;
  }

  getUpdateCount(): number {
    return this.updateCount;
  }
}

/** GR32_Resamplers.BlendBlock (internal routine). */
function blendBlock(
  dst: Bitmap32,
  dstRect: Rect,
  src: Bitmap32,
  srcX: number,
  srcY: number,
  combineOp: DrawMode,
  combine: PixelCombine | null,
): void {
  const w = dstRect.right - dstRect.left;
  let sp = srcX + srcY * src.width;
  let dp = dstRect.left + dstRect.top * dst.width;
  const sb = src.bits;
  const db = dst.bits;
  switch (combineOp) {
    case DrawMode.Opaque:
      for (let y = dstRect.top; y < dstRect.bottom; y++) {
        db.set(sb.subarray(sp, sp + w), dp);
        sp += src.width;
        dp += dst.width;
      }
      break;
    case DrawMode.Blend:
      for (let y = dstRect.top; y < dstRect.bottom; y++) {
        for (let i = 0; i < w; i++) {
          db[dp + i] = src.masterAlpha >= 255 ? blendMem(sb[sp + i], db[dp + i]) : blendMemEx(sb[sp + i], db[dp + i], src.masterAlpha);
        }
        sp += src.width;
        dp += dst.width;
      }
      break;
    case DrawMode.Transparent: {
      const mc = src.outerColor >>> 0;
      for (let y = dstRect.top; y < dstRect.bottom; y++) {
        for (let i = 0; i < w; i++) if (sb[sp + i] !== mc) db[dp + i] = sb[sp + i];
        sp += src.width;
        dp += dst.width;
      }
      break;
    }
    default: {
      const m = src.masterAlpha;
      const cb = combine!;
      for (let y = dstRect.top; y < dstRect.bottom; y++) {
        for (let i = 0; i < w; i++) db[dp + i] = cb(sb[sp + i], db[dp + i], m) >>> 0;
        sp += src.width;
        dp += dst.width;
      }
    }
  }
}

/** GR32_Resamplers.BlockTransfer. */
export function blockTransfer(
  dst: Bitmap32,
  dstX: number,
  dstY: number,
  dstClip: Rect,
  src: Bitmap32,
  srcRect: Rect,
  combineOp: DrawMode,
  combine: PixelCombine | null,
): void {
  if (dst.empty || src.empty || (combineOp === DrawMode.Blend && src.masterAlpha === 0)) return;
  const srcX = srcRect.left;
  const srcY = srcRect.top;
  dstClip = intersectRect(dstClip, dst.boundsRect);
  srcRect = intersectRect(srcRect, src.boundsRect);
  srcRect = offsetRect(srcRect, dstX - srcX, dstY - srcY);
  srcRect = intersectRect(dstClip, srcRect);
  if (isRectEmpty(srcRect)) return;
  dstClip = srcRect;
  srcRect = offsetRect(srcRect, srcX - dstX, srcY - dstY);
  if (combineOp === DrawMode.Custom && !combine) combineOp = DrawMode.Opaque;
  blendBlock(dst, dstClip, src, srcRect.left, srcRect.top, combineOp, combine);
}

/** GR32_Resamplers.StretchTransfer. Same-size transfers are exact; other sizes use nearest neighbour. */
export function stretchTransfer(
  dst: Bitmap32,
  dstRect: Rect,
  dstClip: Rect,
  src: Bitmap32,
  srcRect: Rect,
  combineOp: DrawMode,
  combine: PixelCombine | null,
): void {
  dstRect = { ...dstRect };
  srcRect = { ...srcRect };
  if (srcRect.left < 0 || srcRect.right > src.width || srcRect.top < 0 || srcRect.bottom > src.height) {
    const ratioX = (dstRect.right - dstRect.left) / (srcRect.right - srcRect.left);
    const ratioY = (dstRect.bottom - dstRect.top) / (srcRect.bottom - srcRect.top);
    if (srcRect.left < 0) {
      dstRect.left = dstRect.left + Math.ceil(-srcRect.left * ratioX);
      srcRect.left = 0;
    }
    if (srcRect.top < 0) {
      dstRect.top = dstRect.top + Math.ceil(-srcRect.top * ratioY);
      srcRect.top = 0;
    }
    if (srcRect.right > src.width) {
      dstRect.right = dstRect.right - Math.floor((srcRect.right - src.width) * ratioX);
      srcRect.right = src.width;
    }
    if (srcRect.bottom > src.height) {
      dstRect.bottom = dstRect.bottom - Math.floor((srcRect.bottom - src.height) * ratioY);
      srcRect.bottom = src.height;
    }
  }
  if (src.empty || dst.empty || (combineOp === DrawMode.Blend && src.masterAlpha === 0) || isRectEmpty(srcRect)) return;
  dstClip = intersectRect(dstClip, dst.boundsRect);
  dstClip = intersectRect(dstClip, dstRect);
  if (isRectEmpty(dstClip)) return;
  if (combineOp === DrawMode.Custom && !combine) combineOp = DrawMode.Opaque;
  const srcW = srcRect.right - srcRect.left;
  const srcH = srcRect.bottom - srcRect.top;
  const dstW = dstRect.right - dstRect.left;
  const dstH = dstRect.bottom - dstRect.top;
  if (srcW === dstW && srcH === dstH) {
    blendBlock(
      dst,
      dstClip,
      src,
      srcRect.left + dstClip.left - dstRect.left,
      srcRect.top + dstClip.top - dstRect.top,
      combineOp,
      combine,
    );
  } else {
    resampleNearest(dst, dstRect, dstClip, src, srcRect, combineOp, combine);
  }
}

/** Display only: nearest neighbour resampling (GR32 TNearestResampler-like). */
function resampleNearest(
  dst: Bitmap32,
  dstRect: Rect,
  dstClip: Rect,
  src: Bitmap32,
  srcRect: Rect,
  combineOp: DrawMode,
  combine: PixelCombine | null,
): void {
  const srcW = srcRect.right - srcRect.left;
  const srcH = srcRect.bottom - srcRect.top;
  const dstW = dstRect.right - dstRect.left;
  const dstH = dstRect.bottom - dstRect.top;
  for (let y = dstClip.top; y < dstClip.bottom; y++) {
    const sy = srcRect.top + Math.trunc(((y - dstRect.top) * srcH) / dstH);
    for (let x = dstClip.left; x < dstClip.right; x++) {
      const sx = srcRect.left + Math.trunc(((x - dstRect.left) * srcW) / dstW);
      const f = src.bits[sx + sy * src.width];
      const di = x + y * dst.width;
      switch (combineOp) {
        case DrawMode.Opaque:
          dst.bits[di] = f;
          break;
        case DrawMode.Blend:
          dst.bits[di] = blendMemEx(f, dst.bits[di], src.masterAlpha);
          break;
        case DrawMode.Transparent:
          if (f !== src.outerColor) dst.bits[di] = f;
          break;
        default:
          dst.bits[di] = combine!(f, dst.bits[di], src.masterAlpha) >>> 0;
      }
    }
  }
}

/** GR32_OrdinalMaps.TByteMap subset. */
export class ByteMap {
  width = 0;
  height = 0;
  bits: Uint8Array = new Uint8Array(0);

  setSize(w: number, h: number): void {
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.bits = new Uint8Array(w * h);
    }
  }

  clear(value: number): void {
    this.bits.fill(value & 0xff);
  }

  value(x: number, y: number): number {
    return this.bits[x + y * this.width];
  }

  setValue(x: number, y: number, v: number): void {
    this.bits[x + y * this.width] = v;
  }
}
