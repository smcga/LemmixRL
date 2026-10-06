/**
 * Textures for the run screens. The text is m6x11, the pixel font of Balatro (see app/fonts/); the rest is made from
 * the original Lemmings data: the purple DOS font (for the logo), the small font of the skill panel (for the touch
 * buttons of the game), the skill icons of the skill panel, the lemming animations, the brown background and level
 * thumbnails.
 */
import * as Phaser from 'phaser';
import { Bitmap32, GraphicSet, LemmingAnimationSet, Level, Renderer, GAME_BMPHEIGHT, GAME_BMPWIDTH } from '../../../../engine/src/index.ts';
import M6X11 from '../../../fonts/m6x11.ttf?inline';
import type { LemmixApp } from '../../app.ts';
import { DosScreenBase } from '../../screens/base.ts';
import { SkillPanel } from '../../screens/skillpanel.ts';
import { SKILL_BUTTONS, SKILLS } from '../skills.ts';
import type { RunLevel } from '../catalog.ts';
import { type PixelFont, readPixelFont } from './pixelfont.ts';

/** the text of the run screens: m6x11, white for tinting, with Balatro's shadow under the letters */
export const FONT = 'rl-text';
/** m6x11 without the shadow, for dark text on a light box */
export const FONT_PLAIN = 'rl-text-plain';
/** the logo: the purple font of the menus of Lemmings */
export const FONT_LOGO = 'rl-logo';
/** the small font of the skill panel (capitals and digits, plus some signs drawn in its style), for the game screens */
export const PANEL_FONT = 'rl-small';
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
 * The purple font of the menus has four colours: a highlight, a light and a dark purple for the body of a letter, and
 * a very dark edge. Most of a letter is the dark body and the edge, which is dark on the panels of the run screens: the
 * logo gets a light purple body and a dark purple edge instead.
 */
function shadeOf(c: number, max: number): 0 | 1 | 2 | 3 {
  const l = (0.3 * ((c >>> 16) & 0xff) + 0.59 * ((c >>> 8) & 0xff) + 0.11 * (c & 0xff)) / max;
  return l > 0.85 ? 0 : l > 0.55 ? 1 : l > 0.3 ? 2 : 3;
}

const PURPLE_RAMP = [0xf4eeff, 0xdcd0ff, 0xbfaef8, 0x14082e];

/** a glyph cell of the purple font: the 16 x 16 letter and a pixel of outline around it */
const CELL = 18;

/**
 * The purple font as a proportional bitmap font for the logo: every glyph is as wide as its pixels, plus 2 pixels of
 * spacing, with a pixel of dark outline around it (drawn a pixel up and left, so that the letters are where they would
 * be without it; Phaser lays the text out by the advances and the line height).
 */
function addLogoFont(scene: Phaser.Scene, base: DosScreenBase): void {
  if (scene.textures.exists(FONT_LOGO)) return;
  const n = CHARS_LAST - CHARS_FIRST + 1;
  // one more (empty) cell for the space
  const sheet = new Bitmap32(CELL * (n + 1), CELL);
  sheet.clear(0);
  const spans: [number, number][] = [];
  let maxLum = 1;
  let darkest = 0;
  let darkestLum = Infinity;
  for (let i = 0; i < n; i++) {
    const g = base.purpleFont.bitmaps[i];
    let l = CELL;
    let r = -1;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = g.bits[y * 16 + x];
        if (c === 0) continue;
        sheet.bits[(y + 1) * sheet.width + i * CELL + x + 1] = c;
        if (x + 1 < l) l = x + 1;
        if (x + 1 > r) r = x + 1;
        const lum = 0.3 * ((c >>> 16) & 0xff) + 0.59 * ((c >>> 8) & 0xff) + 0.11 * (c & 0xff);
        maxLum = Math.max(maxLum, lum);
        if (lum < darkestLum) {
          darkestLum = lum;
          darkest = c;
        }
      }
    // (no pixels: as wide as 6)
    spans.push(r < 0 ? [1, 6] : [l, r]);
  }
  // the outline: every empty pixel next to a letter (also diagonally), in the same cell, in the colour of the dark edge
  const letters = sheet.bits.slice();
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < sheet.width; x++) {
      if (letters[y * sheet.width + x] !== 0) continue;
      const cell = x - (x % CELL);
      let near = false;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(CELL - 1, y + 1) && !near; yy++)
        for (let xx = Math.max(cell, x - 1); xx <= Math.min(cell + CELL - 1, x + 1) && !near; xx++) near = letters[yy * sheet.width + xx] !== 0;
      if (near) sheet.bits[y * sheet.width + x] = darkest;
    }
  const canvas = bitmapToCanvas(sheet, (c) => PURPLE_RAMP[shadeOf(c, maxLum)]);
  scene.textures.addCanvas(FONT_LOGO, canvas);
  const tw = canvas.width;
  const chars: Record<number, unknown> = {};
  // the glyph with its outline: from a pixel left of the letter (l) to a pixel right of it (r)
  const glyph = (cellX: number, l: number, r: number, advance: number) => {
    const x = cellX + l - 1;
    const w = r - l + 3;
    return { x, y: 0, width: w, height: CELL, centerX: Math.floor(w / 2), centerY: CELL / 2, xOffset: -1, yOffset: -1, xAdvance: advance, data: {}, kerning: {}, u0: x / tw, v0: 1, u1: (x + w) / tw, v1: 0 };
  };
  for (let i = 0; i < n; i++) {
    const [l, r] = spans[i];
    chars[CHARS_FIRST + i] = glyph(i * CELL, l, r, r - l + 3);
  }
  chars[32] = glyph(n * CELL, 1, 1, 8);
  scene.cache.bitmapFont.add(FONT_LOGO, { data: { retroFont: true, font: FONT_LOGO, size: 16, lineHeight: 18, chars }, frame: null, texture: FONT_LOGO });
}

/** the characters of the run screens: the printable ASCII ones, and the middle dot */
const TEXT_CODES = Array.from({ length: 95 }, (_, i) => 32 + i);
const MIDDLE_DOT = 0xb7;
/** a line of text, 16 pixels: 2 above the capitals (11 pixels high, m6x11's ascent), the descenders (3) */
const TEXT_LINE = 16;
const TEXT_TOP = 2;
/** the shadow of the letters, as Balatro has it: a pixel down and right, black at this opacity */
const SHADOW_ALPHA = 0.6;

/** The glyphs of m6x11 at its size (16 pixels to the em), with a middle dot it does not have. */
function readM6x11(): PixelFont {
  const bytes = Uint8Array.from(atob(M6X11.slice(M6X11.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const font = readPixelFont(bytes, 16, TEXT_CODES);
  // the full stop, raised to the middle of the lower case letters
  const stop = font.glyphs.get(46)!;
  const xHeight = -font.glyphs.get(120)!.top;
  font.glyphs.set(MIDDLE_DOT, { ...stop, top: -Math.round(xHeight / 2) - Math.floor(stop.height / 2) });
  return font;
}

/**
 * m6x11 as bitmap fonts: white letters (for tinting) with their shadow, and without it. A size of 16 shows the pixels
 * of the font as they are, 32 twice as big.
 */
function addTextFonts(scene: Phaser.Scene): void {
  if (scene.textures.exists(FONT) && scene.textures.exists(FONT_PLAIN)) return;
  const font = readM6x11();
  // the glyphs side by side, a pixel apart, each with a column and a row more for its shadow
  const cells = new Map<number, number>();
  let width = 1;
  for (const [code, g] of font.glyphs) {
    cells.set(code, width);
    width += g.width + 2;
  }
  const height = Math.max(...[...font.glyphs.values()].map((g) => g.height)) + 1;
  for (const [key, shadow] of [
    [FONT, true],
    [FONT_PLAIN, false],
  ] as const) {
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(width, height);
    // (ABGR on a little-endian machine, as browsers are)
    const px = new Uint32Array(img.data.buffer);
    for (const pass of shadow ? ['shadow', 'letters'] : ['letters'])
      for (const [code, g] of font.glyphs) {
        const x0 = cells.get(code)! + (pass === 'shadow' ? 1 : 0);
        const y0 = pass === 'shadow' ? 1 : 0;
        const color = pass === 'shadow' ? (Math.round(SHADOW_ALPHA * 255) << 24) >>> 0 : 0xffffffff;
        for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.bits[y * g.width + x]) px[(y0 + y) * width + x0 + x] = color;
      }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, canvas);
    const chars: Record<number, unknown> = {};
    for (const [code, g] of font.glyphs) {
      const x = cells.get(code)!;
      const w = g.width + 1;
      const h = g.height + 1;
      chars[code] = {
        x,
        y: 0,
        width: w,
        height: h,
        centerX: Math.floor(w / 2),
        centerY: Math.floor(h / 2),
        xOffset: g.left,
        yOffset: TEXT_TOP + font.ascent + g.top,
        xAdvance: g.advance,
        data: {},
        kerning: {},
        u0: x / width,
        v0: 1,
        u1: (x + w) / width,
        v1: 1 - h / height,
      };
    }
    scene.cache.bitmapFont.add(key, { data: { retroFont: true, font: key, size: 16, lineHeight: TEXT_LINE, chars }, frame: null, texture: key });
  }
}

/** Signs that the skill panel font does not have, drawn in its style (7 x 15 pixels, 2 pixel strokes). */
const EXTRA_GLYPHS: Record<string, string[]> = {
  '.': ['', '', '', '', '', '', '', '', '', '', '', '', '###', '###', '###'],
  ',': ['', '', '', '', '', '', '', '', '', '', '', '###', '###', '###', '.##', '##'],
  ':': ['', '', '', '', '###', '###', '###', '', '', '', '', '###', '###', '###'],
  ';': ['', '', '', '', '###', '###', '###', '', '', '', '', '###', '###', '###', '.##', '##'],
  '!': ['###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '', '', '###', '###', '###'],
  '?': ['.#####', '#######', '##...##', '.....##', '....###', '...###', '..###', '..##', '..##', '..##', '', '', '.###', '.###', '.###'],
  "'": ['###', '###', '.##', '##'],
  '"': ['##.##', '##.##', '##.##'],
  '(': ['...##', '..###', '.###', '.##', '###', '##', '##', '##', '##', '##', '###', '.##', '.###', '..###', '...##'],
  ')': ['##', '###', '.###', '..##', '..###', '...##', '...##', '...##', '...##', '...##', '..###', '..##', '.###', '###', '##'],
  '/': ['.....##', '.....##', '....###', '....##', '...###', '...##', '..###', '..##', '.###', '.##', '###', '##', '##'],
  '+': ['', '', '', '', '..##', '..##', '######', '######', '..##', '..##'],
  '=': ['', '', '', '', '', '######', '######', '', '', '######', '######'],
  '<': ['', '', '', '....##', '...###', '..###', '.###', '###', '.###', '..###', '...###', '....##'],
  '>': ['', '', '', '##', '###', '.###', '..###', '...###', '..###', '.###', '###', '##'],
  '_': ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '#######'],
  '$': ['...#', '.#####', '#######', '######', '##.#', '####', '#####', '.#####', '..#####', '...####', '...#.##', '##.####', '#######', '.#####', '...#'],
  '\u00b7': ['', '', '', '', '', '', '.##', '.##'],
  '#': ['', '.##.##', '.##.##', '#######', '.##.##', '.##.##', '#######', '.##.##', '.##.##'],
  '*': ['', '', '', '##.#.##', '.#####', '..###', '.#####', '##.#.##'],
  '&': ['.###', '#####', '##.##', '##.##', '.###', '.###', '#####.#', '##.####', '##..##', '#######', '.###.##'],
};

/** The skill panel font: '%', '0'..'9', '-', 'A'..'Z', 8 x 16, plus the extra signs; proportional, 1 pixel apart. */
function addPanelFont(scene: Phaser.Scene, panel: SkillPanel): void {
  if (scene.textures.exists(PANEL_FONT)) return;
  const own = '%0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const extra = Object.keys(EXTRA_GLYPHS);
  const glyphs: { code: number; bits: (x: number, y: number) => boolean }[] = [];
  const info = (panel as unknown as { infoFont: Bitmap32[] }).infoFont;
  for (let i = 0; i < own.length; i++) glyphs.push({ code: own.charCodeAt(i), bits: (x, y) => (info[i].bits[y * 8 + x] & 0xffffff) !== 0 });
  for (const ch of extra) {
    const rows = EXTRA_GLYPHS[ch];
    glyphs.push({ code: ch.charCodeAt(0), bits: (x, y) => rows[y]?.[x] === '#' });
  }
  const sheet = new Bitmap32(8 * glyphs.length, 16);
  sheet.clear(0);
  const spans: [number, number][] = [];
  glyphs.forEach((g, i) => {
    let l = 8;
    let r = -1;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 8; x++)
        if (g.bits(x, y)) {
          sheet.bits[y * sheet.width + i * 8 + x] = 0xffffffff;
          if (x < l) l = x;
          if (x > r) r = x;
        }
    spans.push(r < 0 ? [0, 0] : [l, r]);
  });
  const canvas = bitmapToCanvas(sheet);
  scene.textures.addCanvas(PANEL_FONT, canvas);
  const tw = canvas.width;
  const chars: Record<number, unknown> = {};
  const glyph = (x: number, w: number, adv: number) => ({
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
    v1: 0,
  });
  glyphs.forEach((g, i) => {
    const [l, r] = spans[i];
    const c = glyph(i * 8 + l, r - l + 1, r - l + 2);
    chars[g.code] = c;
    // lower case letters are the capitals
    if (g.code >= 65 && g.code <= 90) chars[g.code + 32] = c;
  });
  chars[32] = glyph(0, 1, 4);
  scene.cache.bitmapFont.add(PANEL_FONT, { data: { retroFont: true, font: PANEL_FONT, size: 16, lineHeight: 17, chars }, frame: null, texture: PANEL_FONT });
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
  if (scene.textures.exists(FONT) && scene.textures.exists(FONT_LOGO) && scene.textures.exists(SKILL_ICONS)) return;
  addTextFonts(scene);
  const data = app.data.provider;
  const style = app.style;
  const base = new DosScreenBase(data, style);
  base.extractPurpleFont();
  base.extractBackGround();
  addLogoFont(scene, base);
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
  addPanelFont(scene, panel);

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
