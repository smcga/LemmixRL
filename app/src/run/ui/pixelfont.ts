/**
 * Pixel fonts from TrueType files (LemmixRL, not in Lemmix): the run screens are written in m6x11, the pixel font of
 * Balatro (by Daniel Linssen, see app/fonts/). Its glyphs are outlines of whole pixels, so they are read from the font
 * file and filled pixel by pixel: no text rendering of the browser, no anti-aliasing, the same pixels everywhere.
 */

export interface PixelGlyph {
  /** pixels from the start of this character to the start of the next */
  advance: number;
  /** the box of the pixels: from the origin of the character, y down from the baseline (above it is negative) */
  left: number;
  top: number;
  width: number;
  height: number;
  /** width * height, row by row from the top: 1 where the glyph is */
  bits: Uint8Array;
}

export interface PixelFont {
  /** pixels above the baseline and below it */
  ascent: number;
  descent: number;
  glyphs: Map<number, PixelGlyph>;
}

/**
 * Reads the glyphs of the given characters (those the font has) from a TrueType font whose outlines are on a grid of
 * pixels, pixelsPerEm to the em (m6x11: 16). Throws when the font is not such a font (curves, composite glyphs,
 * points between the pixels).
 */
export function readPixelFont(bytes: Uint8Array, pixelsPerEm: number, codes: Iterable<number>): PixelFont {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, number>();
  const numTables = v.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const r = 12 + 16 * i;
    tables.set(String.fromCharCode(bytes[r], bytes[r + 1], bytes[r + 2], bytes[r + 3]), v.getUint32(r + 8));
  }
  const table = (tag: string): number => {
    const t = tables.get(tag);
    if (t === undefined) throw new Error(`not a TrueType font: no ${tag} table`);
    return t;
  };
  const head = table('head');
  const unitsPerEm = v.getUint16(head + 18);
  const longLoca = v.getInt16(head + 50) === 1;
  const numGlyphs = v.getUint16(table('maxp') + 4);
  const hhea = table('hhea');
  const numberOfHMetrics = v.getUint16(hhea + 34);
  const hmtx = table('hmtx');
  const loca = table('loca');
  const glyf = table('glyf');
  const unit = unitsPerEm / pixelsPerEm;
  const px = (u: number): number => {
    if (u % unit !== 0) throw new Error(`not a pixel font: ${u} is between the pixels (${unit} units each)`);
    return u / unit;
  };
  const glyphOffset = (g: number) => (longLoca ? v.getUint32(loca + 4 * g) : 2 * v.getUint16(loca + 2 * g));
  const advance = (g: number) => v.getUint16(hmtx + 4 * Math.min(g, numberOfHMetrics - 1));
  const glyphIndex = cmap4(v, table('cmap'));

  const font: PixelFont = { ascent: px(v.getInt16(hhea + 4)), descent: -px(v.getInt16(hhea + 6)), glyphs: new Map() };
  for (const code of codes) {
    const g = glyphIndex(code);
    if (g === 0 || g >= numGlyphs) continue;
    const start = glyphOffset(g);
    const glyph: PixelGlyph = { advance: px(advance(g)), left: 0, top: 0, width: 0, height: 0, bits: new Uint8Array(0) };
    font.glyphs.set(code, glyph);
    if (start === glyphOffset(g + 1)) continue; // no outline (a space)
    const p = glyf + start;
    const contours = v.getInt16(p);
    if (contours < 0) throw new Error(`not a pixel font: the glyph of ${code} is composite`);
    const x0 = px(v.getInt16(p + 2));
    const y0 = px(v.getInt16(p + 4));
    const x1 = px(v.getInt16(p + 6));
    const y1 = px(v.getInt16(p + 8));
    // the outline: the end points of the contours, the flags and the coordinates (as deltas)
    const ends: number[] = [];
    for (let i = 0; i < contours; i++) ends.push(v.getUint16(p + 10 + 2 * i));
    const n = contours ? ends[contours - 1] + 1 : 0;
    let q = p + 10 + 2 * contours;
    q += 2 + v.getUint16(q); // the instructions
    const flags: number[] = [];
    while (flags.length < n) {
      const f = bytes[q++];
      flags.push(f);
      if (f & 8) for (let r = bytes[q++]; r > 0; r--) flags.push(f);
    }
    const coords = (short: number, same: number): number[] => {
      const out: number[] = [];
      let c = 0;
      for (const f of flags) {
        if (f & short) c += f & same ? bytes[q++] : -bytes[q++];
        else if (!(f & same)) {
          c += v.getInt16(q);
          q += 2;
        }
        out.push(c);
      }
      return out;
    };
    const xs = coords(2, 16).map(px);
    const ys = coords(4, 32).map(px);
    if (flags.some((f) => !(f & 1))) throw new Error(`not a pixel font: the glyph of ${code} has curves`);
    // the pixels whose middle is inside the outline (non-zero winding)
    glyph.left = x0;
    glyph.top = -y1;
    glyph.width = x1 - x0;
    glyph.height = y1 - y0;
    glyph.bits = new Uint8Array(glyph.width * glyph.height);
    for (let row = 0; row < glyph.height; row++) {
      const y = y1 - row - 0.5;
      for (let col = 0; col < glyph.width; col++) {
        const x = x0 + col + 0.5;
        let winding = 0;
        let first = 0;
        for (const last of ends) {
          for (let i = first; i <= last; i++) {
            const j = i === last ? first : i + 1;
            const [ax, ay, bx, by] = [xs[i], ys[i], xs[j], ys[j]];
            const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
            if (ay <= y && by > y && side > 0) winding++;
            else if (ay > y && by <= y && side < 0) winding--;
          }
          first = last + 1;
        }
        if (winding !== 0) glyph.bits[row * glyph.width + col] = 1;
      }
    }
  }
  return font;
}

/** The glyph index of a character, from the (3, 1) or (0, x) subtable of format 4 of the cmap table. */
function cmap4(v: DataView, cmap: number): (code: number) => number {
  let sub = -1;
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const r = cmap + 4 + 8 * i;
    const platform = v.getUint16(r);
    const offset = cmap + v.getUint32(r + 4);
    if ((platform === 0 || (platform === 3 && v.getUint16(r + 2) === 1)) && v.getUint16(offset) === 4) sub = offset;
  }
  if (sub < 0) throw new Error('no Unicode character map of format 4');
  const segments = v.getUint16(sub + 6) / 2;
  const endCodes = sub + 14;
  const startCodes = endCodes + 2 * segments + 2;
  const deltas = startCodes + 2 * segments;
  const rangeOffsets = deltas + 2 * segments;
  return (code) => {
    for (let k = 0; k < segments; k++) {
      if (code > v.getUint16(endCodes + 2 * k)) continue;
      const start = v.getUint16(startCodes + 2 * k);
      if (code < start) return 0;
      const delta = v.getUint16(deltas + 2 * k);
      const ro = v.getUint16(rangeOffsets + 2 * k);
      if (ro === 0) return (code + delta) & 0xffff;
      const g = v.getUint16(rangeOffsets + 2 * k + ro + 2 * (code - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
}
