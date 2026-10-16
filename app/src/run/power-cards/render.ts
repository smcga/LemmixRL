/** Shared canvas renderer: the editor preview and in-game card textures use these same pixels. */
import { GraphicSet, LemmingAnimationSet, getStyle, StyleDef, type Bitmap32, type DataProvider } from '../../../../engine/src/index.ts';
import { SkillPanel } from '../../screens/skillpanel.ts';
import { SKILL_BUTTONS, type Skill } from '../skills.ts';
import { pixelGlyphs, PIXEL_FONT_HEIGHT } from '../ui/pixelfont.ts';
import { LEMMING_ANIMS, type LemmingAnim } from './animations.ts';
import { lemmingFrame, POWER_CARD_WIDTH as W, POWER_CARD_HEIGHT as H, type PowerCardDesign, type PowerCardArt } from './schema.ts';

const GLYPHS = pixelGlyphs();
const textWidth = (text: string) => [...text].reduce((n, c) => n + (GLYPHS.find((g) => g.code === c.charCodeAt(0))?.width ?? 3) + 1, -1);

export function hexColor(c: number): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

/** Original colours from ALL frames, excluding transparency; never recolour an already recoloured pixel. */
export function spritePalette(bits: Uint32Array): string[] {
  return [
    ...new Set(
      Array.from(bits)
        .filter((c) => c !== 0)
        .map(hexColor),
    ),
  ].sort();
}
export function remapPixel(c: number, colors: Record<string, string>): number {
  if (c === 0) return 0;
  const replacement = colors[hexColor(c)];
  return (0xff000000 | (replacement ? parseInt(replacement.slice(1), 16) : c & 0xffffff)) >>> 0;
}
function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function bitmapCanvas(bmp: Bitmap32, colors: Record<string, string> = {}): HTMLCanvasElement {
  const out = canvas(bmp.width, bmp.height);
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(bmp.width, bmp.height);
  for (let i = 0; i < bmp.bits.length; i++) {
    const c = remapPixel(bmp.bits[i], colors);
    img.data[i * 4] = (c >>> 16) & 255;
    img.data[i * 4 + 1] = (c >>> 8) & 255;
    img.data[i * 4 + 2] = c & 255;
    img.data[i * 4 + 3] = c >>> 24;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export class PowerCardAssets {
  private readonly animations: LemmingAnimationSet;
  private readonly icons: HTMLCanvasElement;
  private sheets = new Map<string, HTMLCanvasElement>();

  constructor(data: DataProvider) {
    const style = getStyle(data, StyleDef.Orig);
    const gs = new GraphicSet(style);
    gs.load(data, 0, 0);
    this.animations = new LemmingAnimationSet(style);
    this.animations.animationPalette = gs.palette.slice();
    this.animations.load(data);
    const panel = new SkillPanel();
    panel.setStyleAndGraph(data, style, gs);
    this.icons = bitmapCanvas(panel.bitmap);
  }

  animation(name: LemmingAnim) {
    const [index] = LEMMING_ANIMS[name];
    const meta = this.animations.metaLemmingAnimationList[index];
    return { meta, bitmap: this.animations.lemmingBitmaps[index] };
  }
  palette(name: LemmingAnim): string[] {
    return spritePalette(this.animation(name).bitmap.bits);
  }
  private sheet(name: LemmingAnim, colors: Record<string, string>): HTMLCanvasElement {
    const key = name + JSON.stringify(Object.entries(colors).sort());
    let sheet = this.sheets.get(key);
    if (!sheet) {
      sheet = bitmapCanvas(this.animation(name).bitmap, colors);
      // Bounded cache while a colour picker generates many intermediate colours.
      if (this.sheets.size >= 64) this.sheets.delete(this.sheets.keys().next().value!);
      this.sheets.set(key, sheet);
    }
    return sheet;
  }
  drawArt(ctx: CanvasRenderingContext2D, art: PowerCardArt, frame: number): void {
    ctx.save();
    ctx.translate(W / 2 + art.x, H / 2 + art.y);
    ctx.scale(art.scale, art.scale);
    ctx.imageSmoothingEnabled = false;
    if (art.type === 'lemming') {
      const { meta } = this.animation(art.animation);
      ctx.drawImage(
        this.sheet(art.animation, art.colors),
        0,
        lemmingFrame(art, frame) * meta.height,
        meta.width,
        meta.height,
        -meta.width / 2,
        -meta.height / 2,
        meta.width,
        meta.height,
      );
    } else if (art.type === 'icon') {
      const extra = { slower: 1, faster: 17, pause: 161, nuke: 177 };
      const x = Object.hasOwn(extra, art.icon) ? extra[art.icon as keyof typeof extra] : 1 + 16 * (SKILL_BUTTONS[art.icon as Skill] - 1);
      ctx.drawImage(this.icons, x, 16, 14, 23, -7, -11.5, 14, 23);
    } else {
      const chars = [...art.text].map((c) => GLYPHS.find((g) => g.code === c.charCodeAt(0)));
      let x = -chars.reduce((n, g) => n + (g ? g.width + 1 : 4), -1) / 2;
      ctx.fillStyle = art.color;
      for (const g of chars) {
        if (g)
          for (let y = 0; y < PIXEL_FONT_HEIGHT; y++)
            for (let dx = 0; dx < g.width; dx++) if (g.bit(dx, y)) ctx.fillRect(x + dx, y - PIXEL_FONT_HEIGHT / 2, 1, 1);
        x += g ? g.width + 1 : 4;
      }
    }
    ctx.restore();
  }
}

export function artBounds(assets: PowerCardAssets, art: PowerCardArt): { x: number; y: number; w: number; h: number } {
  const size =
    art.type === 'lemming'
      ? assets.animation(art.animation).meta
      : art.type === 'icon'
        ? { width: 14, height: 23 }
        : { width: textWidth(art.text), height: PIXEL_FONT_HEIGHT };
  const w = size.width * art.scale,
    h = size.height * art.scale;
  return { x: W / 2 + art.x - w / 2, y: H / 2 + art.y - h / 2, w, h };
}

const loaded = new WeakMap<DataProvider, PowerCardAssets>();
export function powerCardAssets(data: DataProvider): PowerCardAssets {
  let a = loaded.get(data);
  if (!a) {
    a = new PowerCardAssets(data);
    loaded.set(data, a);
  }
  return a;
}

function innerClip(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 4);
  ctx.clip();
}

export function drawPowerCardBackground(ctx: CanvasRenderingContext2D, design: PowerCardDesign): void {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = design.appearance.border;
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 4);
  ctx.fillStyle = design.appearance.background;
  ctx.fill();
  ctx.restore();
}

export function drawPowerCard(ctx: CanvasRenderingContext2D, design: PowerCardDesign, assets: PowerCardAssets, tick = 0): void {
  drawPowerCardBackground(ctx, design);
  ctx.save();
  innerClip(ctx);
  for (const layer of design.appearance.layers) assets.drawArt(ctx, layer, tick);
  ctx.restore();
}

/** Preview scrubbing range only. Rendering uses an absolute tick so different loop lengths never reset each other. */
export function powerCardFrameCount(design: PowerCardDesign): number {
  return Math.max(1, ...design.appearance.layers.map((a) => (a.type === 'lemming' && a.playback === 'animated' ? LEMMING_ANIMS[a.animation][1] : 1)));
}

export function powerCardBackground(design: PowerCardDesign): HTMLCanvasElement {
  const image = canvas(W, H);
  drawPowerCardBackground(image.getContext('2d')!, design);
  return image;
}

/** Each layer gets its own short strip; no huge least-common-multiple sheet for mixed animation lengths. */
export function powerCardLayerSheet(art: PowerCardArt, assets: PowerCardAssets): HTMLCanvasElement {
  const count = art.type === 'lemming' && art.playback === 'animated' ? LEMMING_ANIMS[art.animation][1] : 1;
  const sheet = canvas(W * count, H);
  const ctx = sheet.getContext('2d')!;
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(i * W, 0);
    innerClip(ctx);
    assets.drawArt(ctx, art, i);
    ctx.restore();
  }
  return sheet;
}
