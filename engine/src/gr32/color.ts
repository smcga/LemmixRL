/**
 * TColor32 handling, mirroring Graphics32 (GR32.pas) and the TColor32Helper of Base.Bitmaps.pas.
 * A TColor32 is an unsigned 32 bit $AARRGGBB value. In TypeScript we keep it as a non-negative
 * number (use `>>> 0` after bit operations).
 */

export type TColor32 = number;

export function color32(r: number, g: number, b: number, a = 0xff): TColor32 {
  return (((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

export function redOf(c: TColor32): number {
  return (c >>> 16) & 0xff;
}
export function greenOf(c: TColor32): number {
  return (c >>> 8) & 0xff;
}
export function blueOf(c: TColor32): number {
  return c & 0xff;
}
export function alphaOf(c: TColor32): number {
  return (c >>> 24) & 0xff;
}

export function setRed(c: TColor32, v: number): TColor32 {
  return ((c & 0xff00ffff) | ((v & 0xff) << 16)) >>> 0;
}
export function setGreen(c: TColor32, v: number): TColor32 {
  return ((c & 0xffff00ff) | ((v & 0xff) << 8)) >>> 0;
}
export function setBlue(c: TColor32, v: number): TColor32 {
  return ((c & 0xffffff00) | (v & 0xff)) >>> 0;
}
export function setAlpha(c: TColor32, v: number): TColor32 {
  return ((c & 0x00ffffff) | ((v & 0xff) << 24)) >>> 0;
}

// GR32 color constants (exact values from GR32.pas)
export const clBlack32 = 0xff000000;
export const clGray32 = 0xff7f7f7f;
export const clLightGray32 = 0xffbfbfbf;
export const clWhite32 = 0xffffffff;
export const clGreen32 = 0xff007f00;
export const clRed32 = 0xffff0000;
export const clLime32 = 0xff00ff00;
export const clYellow32 = 0xffffff00;
export const clBlue32 = 0xff0000ff;
export const clFuchsia32 = 0xffff00ff;
export const clCornFlowerBlue32 = 0xff6495ed;
export const clOrange32 = 0xffffa500;
export const clOrangeRed32 = 0xffff4500;
export const clTrWhite32 = 0x7fffffff;

/** GR32_Blend BlendMem (cmBlend), pascal reference implementation. Only used for display. */
export function blendMem(f: TColor32, b: TColor32): TColor32 {
  const fa = f >>> 24;
  if (fa === 0) return b;
  if (fa === 0xff) return f >>> 0;
  const ia = 255 - fa;
  const r = Math.trunc((((f >>> 16) & 0xff) * fa + ((b >>> 16) & 0xff) * ia) / 255);
  const g = Math.trunc((((f >>> 8) & 0xff) * fa + ((b >>> 8) & 0xff) * ia) / 255);
  const bl = Math.trunc(((f & 0xff) * fa + (b & 0xff) * ia) / 255);
  return color32(r, g, bl, 0xff);
}

/** GR32_Blend BlendMemEx: blend with an extra master alpha. Only used for display. */
export function blendMemEx(f: TColor32, b: TColor32, m: number): TColor32 {
  const fa = Math.trunc(((f >>> 24) * m) / 255);
  return blendMem(setAlpha(f, fa), b);
}
