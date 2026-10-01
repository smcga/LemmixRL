/**
 * Minimal equivalent of Delphi's TStream / TMemoryStream / TBytesStream, as far as Lemmix uses them.
 *
 * The DOS loaders rely heavily on stream *positions* (e.g. "aPos = -1 means continue reading where the
 * previous read stopped"), so this class keeps the exact Delphi semantics:
 *  - read(count)        : reads min(count, size - position) bytes (TStream.Read)
 *  - readBuffer(count)  : raises when fewer bytes are available (TStream.ReadBuffer -> EReadError)
 *  - write/writeBuffer  : writes at the current position, growing the stream (TMemoryStream.Write)
 *  - copyFrom(src, n)   : TStream.CopyFrom, including the "n = 0 copies the whole source" rule
 */
export class StreamReadError extends Error {}

export class ByteStream {
  private buf: Uint8Array;
  private fSize: number;
  position = 0;

  constructor(data?: Uint8Array) {
    if (data) {
      this.buf = data;
      this.fSize = data.length;
    } else {
      this.buf = new Uint8Array(256);
      this.fSize = 0;
    }
  }

  get size(): number {
    return this.fSize;
  }

  /** The valid bytes of the stream (a view, not a copy). */
  get bytes(): Uint8Array {
    return this.buf.subarray(0, this.fSize);
  }

  seek(pos: number): number {
    this.position = pos;
    return this.position;
  }

  /** TStream.Read: returns the bytes actually read (may be fewer than requested). */
  read(count: number): Uint8Array {
    if (count <= 0) return new Uint8Array(0);
    const avail = Math.max(0, this.fSize - this.position);
    const n = Math.min(count, avail);
    const result = this.buf.slice(this.position, this.position + n);
    this.position += n;
    return result;
  }

  /** TStream.ReadBuffer: raises when the requested number of bytes is not available. */
  readBuffer(count: number): Uint8Array {
    const result = this.read(count);
    if (result.length !== count) throw new StreamReadError('Stream read error');
    return result;
  }

  readByte(): number | undefined {
    if (this.position >= this.fSize) return undefined;
    return this.buf[this.position++];
  }

  private ensureCapacity(needed: number): void {
    if (needed <= this.buf.length) return;
    let cap = Math.max(this.buf.length * 2, 256);
    while (cap < needed) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.fSize));
    this.buf = nb;
  }

  write(data: Uint8Array): number {
    if (data.length === 0) return 0;
    const end = this.position + data.length;
    this.ensureCapacity(end);
    this.buf.set(data, this.position);
    this.position = end;
    if (end > this.fSize) this.fSize = end;
    return data.length;
  }

  writeBuffer(data: Uint8Array): void {
    this.write(data);
  }

  /** TStream.CopyFrom. Count = 0 means: copy the entire source from position 0. */
  copyFrom(src: ByteStream, count: number): number {
    if (count === 0) {
      src.seek(0);
      count = src.size;
    }
    const data = src.readBuffer(count);
    this.writeBuffer(data);
    return count;
  }

  clear(): void {
    this.fSize = 0;
    this.position = 0;
  }
}

/** Little endian word at offset. */
export function getWordLE(b: Uint8Array, ofs: number): number {
  return b[ofs] | (b[ofs + 1] << 8);
}

/** Big endian word at offset (System.Swap of a little endian Word). */
export function getWordBE(b: Uint8Array, ofs: number): number {
  return (b[ofs] << 8) | b[ofs + 1];
}

export function getInt32LE(b: Uint8Array, ofs: number): number {
  return b[ofs] | (b[ofs + 1] << 8) | (b[ofs + 2] << 16) | (b[ofs + 3] << 24);
}

export function getInt16LE(b: Uint8Array, ofs: number): number {
  const w = getWordLE(b, ofs);
  return w >= 0x8000 ? w - 0x10000 : w;
}

export function setWordLE(b: Uint8Array, ofs: number, v: number): void {
  b[ofs] = v & 0xff;
  b[ofs + 1] = (v >>> 8) & 0xff;
}

export function setInt32LE(b: Uint8Array, ofs: number, v: number): void {
  b[ofs] = v & 0xff;
  b[ofs + 1] = (v >>> 8) & 0xff;
  b[ofs + 2] = (v >>> 16) & 0xff;
  b[ofs + 3] = (v >>> 24) & 0xff;
}
