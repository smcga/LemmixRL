/** Port of the small helpers from Base.Utils.pas that the engine depends on. */

export const Bit0 = 1 << 0;
export const Bit1 = 1 << 1;
export const Bit2 = 1 << 2;
export const Bit3 = 1 << 3;
export const Bit4 = 1 << 4;
export const Bit5 = 1 << 5;
export const Bit6 = 1 << 6;
export const Bit7 = 1 << 7;
export const Bit8 = 1 << 8;

/** System.Math.EnsureRange for integers. */
export function ensureRange(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** Base.Utils.Restrict (returns the restricted value instead of using a var param). */
export const restrict = ensureRange;

/** Base.Utils.LeadZeroStr: i.ToString.PadLeft(zeros, '0'), so a negative number gets the zeros before the sign. */
export function leadZeroStr(i: number, zeros: number): string {
  return i.toString().padStart(zeros, '0');
}

/** Base.Utils.Percentage: Trunc((N / Max) * 100) (double precision, as on Win64). */
export function percentage(max: number, n: number): number {
  if (max === 0) return 0;
  return Math.trunc((n / max) * 100);
}

export function yesNo(b: boolean): string {
  return b ? 'yes' : 'no';
}

/**
 * The exceptions of the CPU/FPU that Delphi raises where JavaScript produces NaN or Infinity: EDivByZero for an integer
 * division by zero, EZeroDivide and EInvalidOp for floating point divisions (Delphi does not mask them).
 */
export class ArithmeticError extends Error {}

/** Delphi "div" for 32-bit integers (truncates toward zero). Raises like EDivByZero. */
export function div(a: number, b: number): number {
  if (b === 0) throw new ArithmeticError('Division by zero');
  return Math.trunc(a / b);
}

/** Delphi "mod" for 32-bit integers (sign follows the dividend). Raises like EDivByZero. */
export function mod(a: number, b: number): number {
  if (b === 0) throw new ArithmeticError('Division by zero');
  return a % b;
}

/** Delphi "/" with the default FPU exception masks: 0 / 0 raises EInvalidOp, x / 0 raises EZeroDivide. */
export function fdiv(a: number, b: number): number {
  if (b === 0) throw new ArithmeticError(a === 0 ? 'Invalid floating point operation' : 'Floating point division by zero');
  return a / b;
}

/** Truncate to a signed 32-bit Integer, like Delphi Integer arithmetic with overflow checks off. */
export function int32(v: number): number {
  return v | 0;
}

/** Truncate to a Byte. */
export function byte(v: number): number {
  return v & 0xff;
}

/** Truncate to a Word. */
export function word(v: number): number {
  return v & 0xffff;
}

export class EngineError extends Error {}

/** Base.Utils.Throw */
export function throwError(msg: string, proc?: string): never {
  throw new EngineError(proc ? `${msg} (${proc})` : msg);
}
