/**
 * Textures for the run screens, all made from the original Lemmings data: the purple DOS font (as a proportional
 * bitmap font, also in white for tinting), the skill icons of the skill panel, the lemming animations, the brown
 * background and level thumbnails.
 */
import * as Phaser from 'phaser';
import { Bitmap32, GraphicSet, LemmingAnimationSet, Level, Renderer, GAME_BMPHEIGHT, GAME_BMPWIDTH } from '../../../../engine/src/index.ts';
import type { LemmixApp } from '../../app.ts';
import { DosScreenBase } from '../../screens/base.ts';
import { SkillPanel } from '../../screens/skillpanel.ts';
import { SKILL_BUTTONS, SKILLS } from '../skills.ts';
import { PIXEL_FONT_HEIGHT, pixelGlyphs } from './pixelfont.ts';
import type { RunLevel } from '../catalog.ts';

/** the text font: a pixel font with capitals and small letters (pixelfont.ts) */
export const FONT = 'rl-small';
/** the purple DOS font, white for tinting */
export const FONT_BIG = 'rl-font';
export const FONT_PURPLE = 'rl-font-purple';
export const SKILL_ICONS = 'rl-skills';
export const BACKGROUND = 'rl-background';

/** the lemming animations used in the screens: [texture key, animation index in main.dat, frames] */
export const LEMMING_ANIMS = {
  walk: [0, 8],
  walkLeft: [2, 8],
  dig: [4, 16],
  climb: [5, 8],
  drown: [7, 16],
  build: [10, 16],
  bash: [12, 32],
  mine: [14, 24],
  fall: [16, 4],
  float: [18, 8],
  splat: [20, 16],
  exit: [21, 8],
  fry: [22, 14],
  block: [23, 16],
  shrug: [24, 8],
  ohno: [26, 16],
} as const;
export type LemmingAnim = keyof typeof LEMMING_ANIMS;

const CHARS_FIRST = 33;
const CHARS_LAST = 126;

/** a canvas with the bitmap's pixels; colour 0 is transparent */
export function bitmapToCanvas(bmp: Bitmap32, transform?: (c: number) => number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, bmp.width);
  canvas.height = Math.max(1, bmp.height);
  if (bmp.width === 0 || bmp.height === 0) return canvas;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(bmp.width, bmp.height);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.length; i++) {
    let c = bmp.bits[i];
    if ((c & 0xffffff) === 0 && c >>> 24 === 0) {
      px[i] = 0;
      continue;
    }
    if (transform) c = transform(c);
    px[i] = (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >>> 16) & 0xff)) >>> 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * The white version of the purple font: solid letters, with only a little of the shading of the original left. (By
 * luminance alone the dark middle of every stroke stays dark, and a tinted letter reads as an outline.)
 */
function luminanceToWhite(max: number): (c: number) => number {
  return (c) => {
    const r = (c >>> 16) & 0xff;
    const g = (c >>> 8) & 0xff;
    const b = c & 0xff;
    const l = Math.min(255, Math.round(205 + ((0.3 * r + 0.59 * g + 0.11 * b) * 50) / max));
    return (l << 16) | (l << 8) | l;
  };
}

/**
 * The purple font as a proportional bitmap font: every glyph is as wide as its pixels, plus 2 pixels of spacing.
 * Two textures: the original colours and a white one (by luminance) that can be tinted.
 */
function addFonts(scene: Phaser.Scene, base: DosScreenBase): void {
  const n = CHARS_LAST - CHARS_FIRST + 1;
  const sheet = new Bitmap32(16 * n, 16);
  sheet.clear(0);
  const spans: [number, number][] = [];
  let maxLum = 1;
  for (let i = 0; i < n; i++) {
    const g = base.purpleFont.bitmaps[i];
    let l = 16;
    let r = -1;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = g.bits[y * 16 + x];
        if (c === 0) continue;
        sheet.bits[y * sheet.width + i * 16 + x] = c;
        if (x < l) l = x;
        if (x > r) r = x;
        maxLum = Math.max(maxLum, 0.3 * ((c >>> 16) & 0xff) + 0.59 * ((c >>> 8) & 0xff) + 0.11 * (c & 0xff));
      }
    spans.push(r < 0 ? [0, 5] : [l, r]);
  }
  for (const [key, transform] of [
    [FONT_PURPLE, undefined],
    [FONT_BIG, luminanceToWhite(maxLum)],
  ] as const) {
    if (scene.textures.exists(key)) continue;
    const canvas = bitmapToCanvas(sheet, transform);
    scene.textures.addCanvas(key, canvas);
    const chars: Record<number, unknown> = {};
    const tw = canvas.width;
    const th = canvas.height;
    const glyph = (code: number, x: number, w: number, adv: number) => ({
      x,
      y: 0,
      width: w,
      height: 16,
      centerX: Math.floor(w / 2),
      centerY: 8,
      xOffset: 0,
      yOffset: 0,
      xAdvance: adv,
      data: {},
      kerning: {},
      u0: x / tw,
      v0: 1,
      u1: (x + w) / tw,
      v1: 1 - 16 / th,
    });
    for (let i = 0; i < n; i++) {
      const [l, r] = spans[i];
      chars[CHARS_FIRST + i] = glyph(CHARS_FIRST + i, i * 16 + l, r - l + 1, r - l + 3);
    }
    chars[32] = glyph(32, 0, 1, 8);
    scene.cache.bitmapFont.add(key, { data: { retroFont: true, font: key, size: 16, lineHeight: 18, chars }, frame: null, texture: key });
  }
}

/** The text font (see pixelfont.ts) as a bitmap font: proportional, the letters 1 pixel apart. */
function addSmallFont(scene: Phaser.Scene): void {
  if (scene.textures.exists(FONT)) return;
  const glyphs = pixelGlyphs();
  const cell = 10;
  const sheet = new Bitmap32(cell * glyphs.length, PIXEL_FONT_HEIGHT);
  sheet.clear(0);
  glyphs.forEach((g, i) => {
    for (let y = 0; y < PIXEL_FONT_HEIGHT; y++) for (let x = 0; x < g.width; x++) if (g.bit(x, y)) sheet.bits[y * sheet.width + i * cell + x] = 0xffffffff;
  });
  const canvas = bitmapToCanvas(sheet);
  scene.textures.addCanvas(FONT, canvas);
  const tw = canvas.width;
  const chars: Record<number, unknown> = {};
  const glyph = (x: number, w: number, adv: number) => ({
    x,
    y: 0,
    width: w,
    height: PIXEL_FONT_HEIGHT,
    centerX: Math.floor(w / 2),
    centerY: PIXEL_FONT_HEIGHT / 2,
    xOffset: 0,
    yOffset: 0,
    xAdvance: adv,
    data: {},
    kerning: {},
    u0: x / tw,
    v0: 1,
    u1: (x + w) / tw,
    v1: 0,
  });
  glyphs.forEach((g, i) => (chars[g.code] = glyph(i * cell, g.width, g.width + 1)));
  chars[32] = glyph(cell * glyphs.length - 1, 1, 4);
  scene.cache.bitmapFont.add(FONT, { data: { retroFont: true, font: FONT, size: 16, lineHeight: 17, chars }, frame: null, texture: FONT });
}

/** a texture with frames cut from a bitmap */
function addFramedTexture(scene: Phaser.Scene, key: string, bmp: Bitmap32, frames: [string, number, number, number, number][]): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, bitmapToCanvas(bmp))!;
  for (const [name, x, y, w, h] of frames) tex.add(name, 0, x, y, w, h);
}

let animationSet: LemmingAnimationSet | null = null;

/** Creates the textures and animations of the run screens (once per game). */
export function ensureRunAssets(scene: Phaser.Scene, app: LemmixApp): void {
  if (scene.textures.exists(FONT) && scene.textures.exists(FONT_BIG) && scene.textures.exists(SKILL_ICONS)) return;
  const data = app.data.provider;
  const style = app.style;
  const base = new DosScreenBase(data, style);
  base.extractPurpleFont();
  base.extractBackGround();
  addFonts(scene, base);
  if (!scene.textures.exists(BACKGROUND)) scene.textures.addCanvas(BACKGROUND, bitmapToCanvas(base.background));

  // the skill buttons of the panel (with their black number area): x = 1 + 16 * (button - 1), 14 x 23
  const gs = new GraphicSet(style);
  gs.load(data, 0, 0);
  const panel = new SkillPanel();
  panel.setStyleAndGraph(data, style, gs);
  const frames: [string, number, number, number, number][] = [];
  for (const s of SKILLS) frames.push([s, 1 + 16 * (SKILL_BUTTONS[s] - 1), 16, 14, 23]);
  frames.push(['slower', 1, 16, 14, 23], ['faster', 17, 16, 14, 23], ['pause', 161, 16, 14, 23], ['nuke', 177, 16, 14, 23]);
  addFramedTexture(scene, SKILL_ICONS, panel.bitmap, frames);
  addSmallFont(scene);

  // the lemmings
  animationSet ??= new LemmingAnimationSet(style);
  animationSet.animationPalette = gs.palette.slice();
  animationSet.load(data);
  const metas = animationSet.metaLemmingAnimationList;
  for (const [name, [ix, count]] of Object.entries(LEMMING_ANIMS)) {
    const key = 'rl-lem-' + name;
    const m = metas[ix];
    const f: [string, number, number, number, number][] = [];
    for (let i = 0; i < count; i++) f.push([String(i), 0, i * m.height, m.width, m.height]);
    addFramedTexture(scene, key, animationSet.lemmingBitmaps[ix], f);
    if (!scene.anims.exists(key))
      scene.anims.create({
        key,
        frames: f.map(([fr]) => ({ key, frame: fr })),
        frameRate: 12,
        repeat: -1,
      });
  }
}

/** A lemming sprite playing an animation. */
export function lemmingSprite(scene: Phaser.Scene, x: number, y: number, anim: LemmingAnim, scale = 2): Phaser.GameObjects.Sprite {
  const key = 'rl-lem-' + anim;
  const s = scene.add.sprite(x, y, key, '0').setScale(scale);
  s.play(key);
  return s;
}

/* ---------------------------------------------------------------------------------------------- level thumbnails */

const thumbnails = new Map<string, HTMLCanvasElement>();

/** The level's terrain and objects, cropped to what is there and averaged down to w x h (like the preview). */
/** The level as it starts (terrain and objects), and the columns it uses (the rest of the 1584 pixels is empty). */
function renderLevelWorld(app: LemmixApp, level: RunLevel): { world: Bitmap32; x0: number; x1: number; start: number } {
  const lvl = new Level();
  level.info.loadLevel(lvl);
  const gs = new GraphicSet(app.style);
  gs.load(app.data.provider, lvl.info.graphicSet, lvl.info.graphicSetEx);
  const renderer = new Renderer();
  renderer.prepare(lvl, gs);
  const world = new Bitmap32();
  world.setSize(GAME_BMPWIDTH, GAME_BMPHEIGHT);
  world.clear(0);
  renderer.renderWorld(world, true);
  let x0 = world.width;
  let x1 = -1;
  for (let x = 0; x < world.width; x++)
    for (let y = 0; y < world.height; y++)
      if ((world.bits[y * world.width + x] & 0xffffff) !== 0) {
        if (x < x0) x0 = x;
        x1 = x;
        break;
      }
  if (x1 < x0) {
    x0 = 0;
    x1 = world.width - 1;
  }
  return { world, x0, x1, start: lvl.info.screenPosition };
}

/** a canvas of a bitmap with black (not transparent) where nothing is */
function opaqueCanvas(bmp: Bitmap32): HTMLCanvasElement {
  const canvas = bitmapToCanvas(bmp, (c) => c);
  const ctx = canvas.getContext('2d')!;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A small picture of a level (w x h, its used columns averaged). */
export function levelThumbnail(scene: Phaser.Scene, app: LemmixApp, level: RunLevel, w: number, h: number): string {
  const key = `rl-thumb-${level.id}-${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  let canvas = thumbnails.get(key);
  if (!canvas) {
    const { world, x0, x1 } = renderLevelWorld(app, level);
    const sw = x1 - x0 + 1;
    const out = new Bitmap32(w, h);
    for (let ty = 0; ty < h; ty++) {
      const sy0 = Math.floor((ty * world.height) / h);
      const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * world.height) / h));
      for (let tx = 0; tx < w; tx++) {
        const sx0 = x0 + Math.floor((tx * sw) / w);
        const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((tx + 1) * sw) / w));
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let y = sy0; y < sy1; y++)
          for (let x = sx0; x < sx1; x++) {
            const c = world.bits[y * world.width + x];
            r += (c >>> 16) & 0xff;
            g += (c >>> 8) & 0xff;
            b += c & 0xff;
            n++;
          }
        // brighten a little: the averaged terrain is dark
        const k = 1.6 / n;
        out.bits[ty * w + tx] = (0xff000000 | (Math.min(255, r * k) << 16) | (Math.min(255, g * k) << 8) | Math.min(255, b * k)) >>> 0;
      }
    }
    canvas = opaqueCanvas(out);
    thumbnails.set(key, canvas);
  }
  scene.textures.addCanvas(key, canvas);
  return key;
}

/**
 * The whole level at full size, as it starts (terrain and objects), cropped to the columns it uses: a texture to show
 * in the level preview. x0 is the first column it shows, start the column the game starts at (the left of the
 * screen). Remove it with scene.textures.remove(key) when done.
 */
export function levelImage(scene: Phaser.Scene, app: LemmixApp, level: RunLevel): { key: string; width: number; height: number; x0: number; start: number } {
  const { world, x0, x1, start } = renderLevelWorld(app, level);
  const key = `rl-level-${level.id}`;
  const width = x1 - x0 + 1;
  if (!scene.textures.exists(key)) {
    const bmp = new Bitmap32(width, world.height);
    for (let y = 0; y < world.height; y++) bmp.bits.set(world.bits.subarray(y * world.width + x0, y * world.width + x1 + 1), y * width);
    scene.textures.addCanvas(key, opaqueCanvas(bmp));
  }
  return { key, width, height: world.height, x0, start };
}
