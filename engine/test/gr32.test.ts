import { describe, expect, it } from 'vitest';
import { ArithmeticError } from '../src/base/utils.ts';
import { Bitmap32, DrawMode } from '../src/gr32/bitmap32.ts';

describe('Bitmap32 (GR32 subset)', () => {
  it('draws a rect that lies partly outside the source with the clipped part only', () => {
    const src = new Bitmap32(4, 4);
    src.bits.fill(0xff112233);
    const dst = new Bitmap32(4, 4);
    src.drawToRect(dst, { left: -2, top: 0, right: 2, bottom: 2 }, { left: -2, top: 0, right: 2, bottom: 2 });
    expect(dst.pixel(0, 0)).toBe(0xff112233);
    expect(dst.pixel(1, 1)).toBe(0xff112233);
    expect(dst.pixel(2, 0)).toBe(0);
  });

  it('raises like Delphi (EInvalidOp) for an empty source rect outside the bitmap, where JavaScript gives NaN', () => {
    // TLemmingGame.EraseReplayCursor with an empty replay cursor rect above the level
    const src = new Bitmap32(10, 10);
    const dst = new Bitmap32(10, 10);
    src.drawMode = DrawMode.Opaque;
    const r = { left: 5, top: -2, right: 5, bottom: -2 };
    expect(() => src.drawToRect(dst, r, r)).toThrow(ArithmeticError);
    // inside the bitmap an empty rect is simply nothing to draw
    const inside = { left: 5, top: 2, right: 5, bottom: 2 };
    expect(() => src.drawToRect(dst, inside, inside)).not.toThrow();
  });

  it('CalcFrameRect raises on zero frames (EDivByZero)', () => {
    expect(() => new Bitmap32(4, 8).calcFrameRect(0, 0)).toThrow(ArithmeticError);
    expect(new Bitmap32(4, 8).calcFrameRect(2, 1)).toEqual({ left: 0, top: 4, right: 4, bottom: 8 });
  });
});
