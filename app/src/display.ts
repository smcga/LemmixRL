/**
 * Shows Bitmap32 contents on screen. A TImage32 ignores the alpha channel when it paints its bitmap (the alpha bits
 * are used as flags by the game), so every pixel is copied as opaque.
 */
import type * as Phaser from 'phaser';
import type { Bitmap32 } from '../../engine/src/index.ts';

let nextKey = 0;

export class BitmapTexture {
  readonly canvas: HTMLCanvasElement;
  readonly key: string;
  readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private pixels: Uint32Array;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    /** false: the alpha channel is used (cursors) */
    private readonly opaque = true,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.imageData = this.ctx.createImageData(width, height);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    this.key = 'bitmap' + nextKey++;
    this.texture = scene.textures.addCanvas(this.key, this.canvas)!;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  resize(width: number, height: number): void {
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.texture.setSize(width, height);
    this.imageData = this.ctx.createImageData(width, height);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
  }

  /** Copies the area (sx, sy, width, height) of src (outside: black) and uploads it. */
  update(src: Bitmap32, sx = 0, sy = 0): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dst = this.pixels;
    const bits = src.bits;
    for (let y = 0; y < h; y++) {
      const yy = y + sy;
      const di = y * w;
      if (yy < 0 || yy >= src.height) {
        dst.fill(0xff000000, di, di + w);
        continue;
      }
      const si = yy * src.width + sx;
      for (let x = 0; x < w; x++) {
        const xx = x + sx;
        if (xx < 0 || xx >= src.width) {
          dst[di + x] = 0xff000000;
          continue;
        }
        const c = bits[si + x];
        // ARGB -> little endian RGBA
        const a = this.opaque ? 0xff000000 : c & 0xff000000;
        dst[di + x] = (a | ((c & 0xff) << 16) | (c & 0xff00) | ((c >>> 16) & 0xff)) >>> 0;
      }
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    this.scene.textures.remove(this.key);
  }
}
