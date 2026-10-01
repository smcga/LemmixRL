/**
 * Port of Game.Rendering.pas (TRenderer).
 *
 * The alpha channel of the world pixels carries information:
 *  - ALPHA_TERRAIN ($01000000): there is terrain in this pixel
 *  - ALPHA_OBJECT  ($02000000): there is an interactive object in this pixel
 *  - ALPHA_TRANSPARENTBLACK ($80000000): enables black terrain
 */
import { EngineError } from '../base/utils.ts';
import { Bitmap32, DrawMode, intersectRect, offsetRect, type PixelCombine, type Rect } from '../gr32/bitmap32.ts';
import type { TColor32 } from '../gr32/color.ts';
import { InteractiveObject, Level, odf_NoOverwrite, odf_OnlyOnTerrain, odf_UpsideDown, tdf_Erase, tdf_Invert, tdf_NoOverwrite, type Terrain } from '../level/base.ts';
import type { GraphicSet } from '../styles/base.ts';

export const COLOR_MASK = 0x80ffffff; // transparent black flag is included!
export const ALPHA_MASK = 0xff000000;
export const ALPHA_TERRAIN = 0x01000000;
export const ALPHA_OBJECT = 0x02000000;
export const ALPHA_TRANSPARENTBLACK = 0x80000000;

const NOT_COLOR_MASK = ~COLOR_MASK; // B and not COLOR_MASK

export const combineTerrainDefault: PixelCombine = (f: TColor32, b: TColor32): TColor32 => {
  if (f !== 0) {
    b = b & NOT_COLOR_MASK; // erase color
    b = b | ALPHA_TERRAIN; // put terrain bit
    b = b | (f & COLOR_MASK); // copy color
    return b >>> 0;
  }
  return b;
};

export const combineTerrainNoOverwrite: PixelCombine = (f: TColor32, b: TColor32): TColor32 => {
  if (f !== 0 && (b & ALPHA_TERRAIN) === 0) {
    b = b & NOT_COLOR_MASK;
    b = b | ALPHA_TERRAIN;
    b = b | (f & COLOR_MASK);
    return b >>> 0;
  }
  return b;
};

export const combineTerrainErase: PixelCombine = (f: TColor32, b: TColor32): TColor32 => (f !== 0 ? 0 : b);

export const combineObjectDefault: PixelCombine = (f: TColor32, b: TColor32): TColor32 => {
  if (f !== 0) {
    b = b & NOT_COLOR_MASK;
    b = b | ALPHA_OBJECT;
    b = b | (f & COLOR_MASK);
    return b >>> 0;
  }
  return b;
};

export const combineObjectNoOverwrite: PixelCombine = (f: TColor32, b: TColor32): TColor32 => {
  if (f !== 0 && (b & ALPHA_MASK) === 0) {
    b = b & NOT_COLOR_MASK;
    b = b | ALPHA_OBJECT;
    b = b | (f & COLOR_MASK);
    return b >>> 0;
  }
  return b;
};

export const combineObjectOnlyOnTerrain: PixelCombine = (f: TColor32, b: TColor32): TColor32 => {
  if (f !== 0 && (b & ALPHA_TERRAIN) !== 0) {
    b = b & NOT_COLOR_MASK;
    b = b | ALPHA_OBJECT;
    b = b | (f & COLOR_MASK);
    return b >>> 0;
  }
  return b;
};

/** TObjectAnimation: original frames plus a vertically flipped copy (per frame). */
export class ObjectAnimation {
  readonly inverted = new Bitmap32();

  constructor(
    readonly original: Bitmap32,
    readonly frameCount: number,
    readonly frameWidth: number,
    readonly frameHeight: number,
  ) {
    this.inverted.assign(original);
    this.flip();
  }

  calcFrameRect(frameIndex: number): Rect {
    const top = frameIndex * this.frameHeight;
    return { left: 0, top, right: this.frameWidth, bottom: top + this.frameHeight };
  }

  private flip(): void {
    if (this.frameCount === 0) return;
    const w = this.frameWidth;
    const h = this.frameHeight;
    for (let f = 0; f < this.frameCount; f++) {
      const top = f * h;
      for (let y = 0; y < h; y++) {
        const src = (top + y) * w;
        const dst = (top + h - 1 - y) * w;
        this.inverted.bits.set(this.original.bits.subarray(src, src + w), dst);
      }
    }
  }
}

export class Renderer {
  private readonly tempBitmap = new Bitmap32();
  private readonly objectRenderList: ObjectAnimation[] = [];
  private level: Level | null = null;
  private graphicSet: GraphicSet | null = null;

  /** TRenderer.Prepare. Built-in DOS levels are not validated (TRenderInfoRec.CheckOrRepair). */
  prepare(level: Level, graphicSet: GraphicSet): void {
    if (graphicSet.metaObjectList.length !== graphicSet.objectBitmaps.length)
      throw new EngineError('Graphicset metaobjects count mismatch with objects');
    this.level = level;
    this.graphicSet = graphicSet;
    this.objectRenderList.length = 0;
    for (let i = 0; i < graphicSet.objectBitmaps.length; i++) {
      const mo = graphicSet.metaObjectList[i];
      this.objectRenderList.push(new ObjectAnimation(graphicSet.objectBitmaps[i], mo.animationFrameCount, mo.width, mo.height));
    }
  }

  private prepareTerrainBitmap(bmp: Bitmap32, drawingFlags: number): void {
    bmp.drawMode = DrawMode.Custom;
    if ((drawingFlags & tdf_NoOverwrite) !== 0) bmp.onPixelCombine = combineTerrainNoOverwrite;
    else if ((drawingFlags & tdf_Erase) !== 0) bmp.onPixelCombine = combineTerrainErase;
    else bmp.onPixelCombine = combineTerrainDefault;
  }

  private prepareObjectBitmap(bmp: Bitmap32, drawingFlags: number): void {
    bmp.drawMode = DrawMode.Custom;
    if ((drawingFlags & odf_OnlyOnTerrain) !== 0) bmp.onPixelCombine = combineObjectOnlyOnTerrain;
    else if ((drawingFlags & odf_NoOverwrite) !== 0) bmp.onPixelCombine = combineObjectNoOverwrite;
    else bmp.onPixelCombine = combineObjectDefault;
  }

  drawTerrain(dst: Bitmap32, t: Terrain): void {
    const src = this.graphicSet!.terrainBitmaps[t.identifier];
    if (!src) throw new EngineError('Invalid terrain identifier (' + t.identifier + ')');
    if ((t.drawingFlags & tdf_Invert) === 0) {
      this.prepareTerrainBitmap(src, t.drawingFlags);
      src.drawTo(dst, t.left, t.top);
    } else {
      src.flipVert(this.tempBitmap);
      this.prepareTerrainBitmap(this.tempBitmap, t.drawingFlags);
      this.tempBitmap.drawTo(dst, t.left, t.top);
    }
  }

  drawSpecialBitmap(dst: Bitmap32, spec: Bitmap32): void {
    spec.drawMode = DrawMode.Custom;
    spec.onPixelCombine = combineTerrainDefault;
    spec.drawTo(dst, 304, 0);
  }

  /**
   * Draws an interactive object. If original is given, first the destination area is restored
   * from it (the world, when playing).
   */
  drawObject(dst: Bitmap32, o: InteractiveObject, frame: number, original: Bitmap32 | null = null): void {
    const item = this.objectRenderList[o.identifier];
    const src = (odf_UpsideDown & o.drawingFlags) === 0 ? item.original : item.inverted;
    this.prepareObjectBitmap(src, o.drawingFlags);
    const srcRect = item.calcFrameRect(frame);
    const dstRect = offsetRect({ left: 0, top: 0, right: srcRect.right - srcRect.left, bottom: srcRect.bottom - srcRect.top }, o.left, o.top);
    if (original) {
      const r = intersectRect(dstRect, original.boundsRect);
      original.drawToRect(dst, r, r);
    }
    src.drawToRect(dst, dstRect, srcRect);
  }

  eraseObject(dst: Bitmap32, o: InteractiveObject, original: Bitmap32 | null): void {
    if (!original) return;
    const item = this.objectRenderList[o.identifier];
    const srcRect = item.calcFrameRect(0);
    const dstRect = offsetRect({ left: 0, top: 0, right: srcRect.right - srcRect.left, bottom: srcRect.bottom - srcRect.top }, o.left, o.top);
    const r = intersectRect(dstRect, original.boundsRect);
    original.drawToRect(dst, r, r);
  }

  renderWorld(world: Bitmap32, doObjects: boolean): void {
    world.clear(0);
    const level = this.level;
    const gs = this.graphicSet;
    if (!level || !gs) return;
    if (gs.graphicSetIdExt > 0) {
      this.drawSpecialBitmap(world, gs.specialBitmap);
    } else {
      for (const ter of level.terrains) this.drawTerrain(world, ter);
    }
    if (doObjects) {
      // draw only on terrain
      for (const obj of level.interactiveObjects) {
        const mo = gs.metaObjectList[obj.identifier];
        if ((odf_OnlyOnTerrain & obj.drawingFlags) !== 0) this.drawObject(world, obj, mo.previewFrameIndex);
      }
      // draw *not* only on terrain
      for (const obj of level.interactiveObjects) {
        const mo = gs.metaObjectList[obj.identifier];
        if ((odf_OnlyOnTerrain & obj.drawingFlags) === 0) this.drawObject(world, obj, mo.previewFrameIndex);
      }
    }
  }
}
