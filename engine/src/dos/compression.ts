/**
 * Port of the decompression part of Dos.Compression.pas (TDosDatDecompressor), which itself is based on
 * the C code of ccexplore. A DOS .DAT file consists of sections, each with a 10 byte header:
 *
 *   BitCnt: Byte; Checksum: Byte; Unused1: Word; DecompressedSize: Word (BE); Unused2: Word; CompressedSize: Word (BE)
 *
 * CompressedSize includes the header.
 */
import { ByteStream, getWordBE } from '../base/stream.ts';
import { EngineError } from '../base/utils.ts';

export const COMPRESSIONHEADER_SIZE = 10;

export class DecompressError extends EngineError {}

export class DosDatSection {
  readonly compressedData = new ByteStream();
  readonly decompressedData = new ByteStream();
}

interface DecompressorState {
  bitCnt: number; // Byte
  curBits: number; // Byte
  cdata: Uint8Array;
  cptr: number;
  ddata: Uint8Array;
  dptr: number;
  checksum: number;
  csize: number;
  dsize: number;
}

export class DosDatDecompressor {
  skipErrors = false;

  private checkSrc(s: DecompressorState, index: number): void {
    if (!(index < s.csize && index >= 0) && !this.skipErrors)
      throw new DecompressError(
        `Decompress error. Attempt to read or write source data at index ${index}. BitCnt=${s.bitCnt}, CurBits=${s.curBits}, Cptr=${s.cptr}, Dptr=${s.dptr}, CSize=${s.csize}, DSize=${s.dsize}`,
      );
  }

  private checkDst(s: DecompressorState, index: number): void {
    if (!(index < s.dsize && index >= 0) && !this.skipErrors)
      throw new DecompressError(
        `Decompress error. Attempt to read or write destination data at index ${index}. BitCnt=${s.bitCnt}, CurBits=${s.curBits}, Cptr=${s.cptr}, Dptr=${s.dptr}, CSize=${s.csize}, DSize=${s.dsize}`,
      );
  }

  private getNextBits(n: number, s: DecompressorState): number {
    let result = 0;
    while (n > 0) {
      s.bitCnt = (s.bitCnt - 1) & 0xff;
      if (s.bitCnt === 0) {
        s.cptr--;
        this.checkSrc(s, s.cptr);
        s.curBits = s.cdata[s.cptr] ?? 0;
        s.checksum = s.checksum ^ s.curBits;
        s.bitCnt = 8;
      }
      result = result << 1;
      result = result | (s.curBits & 1);
      s.curBits = s.curBits >>> 1;
      n--;
    }
    return result;
  }

  private copyPrevData(blockLen: number, offsetSize: number, s: DecompressorState): void {
    const offset = this.getNextBits(offsetSize, s);
    for (let i = 0; i < blockLen; i++) {
      s.dptr--;
      this.checkDst(s, s.dptr);
      this.checkDst(s, s.dptr + offset + 1);
      s.ddata[s.dptr] = s.ddata[s.dptr + offset + 1];
    }
  }

  private dumpData(numBytes: number, s: DecompressorState): void {
    while (numBytes > 0) {
      s.dptr--;
      const b = this.getNextBits(8, s) & 0xff;
      this.checkDst(s, s.dptr);
      s.ddata[s.dptr] = b;
      numBytes--;
    }
  }

  /** Returns the computed checksum. */
  decompress(compData: Uint8Array, decompData: Uint8Array, bitCnt: number, compSize: number, decompSize: number): number {
    const s: DecompressorState = {
      bitCnt: (bitCnt + 1) & 0xff,
      cptr: compSize - 1,
      dptr: decompSize,
      cdata: compData,
      ddata: decompData,
      curBits: compData[compSize - 1] ?? 0,
      checksum: 0,
      csize: compSize,
      dsize: decompSize,
    };
    s.checksum = s.curBits;
    while (s.dptr > 0) {
      if (this.getNextBits(1, s) === 1) {
        switch (this.getNextBits(2, s)) {
          case 0:
            this.copyPrevData(3, 9, s);
            break;
          case 1:
            this.copyPrevData(4, 10, s);
            break;
          case 2:
            this.copyPrevData(this.getNextBits(8, s) + 1, 12, s);
            break;
          case 3:
            this.dumpData(this.getNextBits(8, s) + 9, s);
            break;
        }
      } else {
        switch (this.getNextBits(1, s)) {
          case 0:
            this.dumpData(this.getNextBits(3, s) + 1, s);
            break;
          case 1:
            this.copyPrevData(2, 8, s);
            break;
        }
      }
    }
    return s.checksum;
  }

  /**
   * Decompresses one section, reading the header and data at the current position of src and writing
   * the result at the current position of dst. Returns the number of decompressed bytes.
   */
  decompressSection(src: ByteStream, dst: ByteStream): number {
    const header = src.read(COMPRESSIONHEADER_SIZE);
    if (header.length !== COMPRESSIONHEADER_SIZE) return 0;
    const bitCnt = header[0];
    const checksum = header[1];
    // Dec(Header.CompressedSize, 10) on a Word
    const compressedSize = (getWordBE(header, 8) - COMPRESSIONHEADER_SIZE) & 0xffff;
    const decompressedSize = getWordBE(header, 4);
    const srcData = new Uint8Array(compressedSize);
    const dstData = new Uint8Array(decompressedSize);
    srcData.set(src.readBuffer(compressedSize));
    const computed = this.decompress(srcData, dstData, bitCnt, compressedSize, decompressedSize);
    if (computed !== checksum) throw new DecompressError('Checksum error occurred during decompression');
    dst.writeBuffer(dstData);
    return decompressedSize;
  }

  /**
   * Splits a DAT stream into its sections. With decompressOnTheFly every section is decompressed
   * immediately, otherwise only the compressed data is stored.
   */
  loadSectionList(src: ByteStream, decompressOnTheFly = true): DosDatSection[] {
    const list: DosDatSection[] = [];
    src.seek(0);
    for (;;) {
      const header = src.read(COMPRESSIONHEADER_SIZE);
      if (header.length === 0) break;
      if (header.length !== COMPRESSIONHEADER_SIZE) throw new DecompressError('Decompressor Header Error');
      const copySize = getWordBE(header, 8);
      src.seek(src.position - COMPRESSIONHEADER_SIZE);
      const sec = new DosDatSection();
      sec.compressedData.copyFrom(src, copySize);
      if (decompressOnTheFly) {
        sec.compressedData.seek(0);
        this.decompressSection(sec.compressedData, sec.decompressedData);
        sec.compressedData.seek(0);
        sec.decompressedData.seek(0);
      } else {
        sec.compressedData.seek(0);
        sec.decompressedData.seek(0);
      }
      list.push(sec);
    }
    return list;
  }
}
