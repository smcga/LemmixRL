/**
 * Port of Level.Hash.pas (TLevelHasher). "after release never change the hashing of levelcodes".
 * The short hash (an UInt64) identifies a level in replay files; it is represented here as a bigint.
 */
import type { LVLRec } from '../dos/structures.ts';
import { md5 } from './md5.ts';

export function longHash(lvl: LVLRec): Uint8Array {
  return md5(lvl);
}

/** The 8 bytes of the short hash (little endian UInt64 bytes). */
export function shortHashBytes(lvl: LVLRec): Uint8Array {
  const h = longHash(lvl);
  const r = new Uint8Array(8);
  for (let i = 0; i < 8; i++) r[i] = h[i] ^ h[i + 8];
  return r;
}

export function bytesToUInt64(b: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
  return v;
}

export function uint64ToBytes(v: bigint): Uint8Array {
  const r = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    r[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return r;
}

export function shortHash(lvl: LVLRec): bigint {
  return bytesToUInt64(shortHashBytes(lvl));
}

const Vowels = ['A', 'E', 'I', 'O', 'U'];
const NonVowels = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z']; // Q omitted on purpose

export function getLevelCode(hash: bigint): string {
  const u = uint64ToBytes(hash);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += u[i];
  const odd = (sum & 1) === 1;
  let vowel = odd;
  const result: string[] = [];
  for (let i = 0; i < 8; i++) {
    result.push(vowel ? Vowels[u[i] % 5] : NonVowels[u[i] % 20]);
    vowel = !vowel;
  }
  let b = odd ? u[0] ^ u[1] : u[6] ^ u[7];
  result.push(vowel ? Vowels[b % 5] : NonVowels[b % 20]);
  vowel = !vowel;
  b = odd ? u[2] ^ u[3] : u[4] ^ u[5];
  result.push(vowel ? Vowels[b % 5] : NonVowels[b % 20]);
  return result.join('');
}
