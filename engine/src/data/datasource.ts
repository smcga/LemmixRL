/**
 * Equivalent of Prog.Data.pas (TData.CreateDataStream) for the built-in DOS styles.
 *
 * Lemmix embeds each style as a zip resource (src/Data/Styles/<Style>/<style>.zip). Files are looked up
 * by their name without path, case-insensitively (Delphi's TZipFile.IndexOf compares with SameText;
 * Lemmix asks for 'main.dat' while the Orig zip contains 'MAIN.DAT').
 */
import { unzipSync } from 'fflate';
import { ByteStream } from '../base/stream.ts';
import { EngineError } from '../base/utils.ts';

export enum DataType {
  Asset,
  Cursor,
  Sound,
  Particles,
  LemmingData,
  LevelGraphics,
  LevelSpecialGraphics,
  Level,
  Music,
  Language,
}

export class Archive {
  private readonly files = new Map<string, Uint8Array>();

  constructor(entries: Iterable<[string, Uint8Array]>) {
    for (const [name, data] of entries) this.files.set(Archive.key(name), data);
  }

  private static key(name: string): string {
    const base = name.replace(/\\/g, '/').split('/').pop() ?? name;
    return base.toLowerCase();
  }

  static fromZip(zip: Uint8Array): Archive {
    const entries = unzipSync(zip);
    return new Archive(Object.entries(entries).filter(([name]) => !name.endsWith('/')));
  }

  has(name: string): boolean {
    return this.files.has(Archive.key(name));
  }

  get(name: string): Uint8Array | undefined {
    return this.files.get(Archive.key(name));
  }

  names(): string[] {
    return [...this.files.keys()];
  }
}

export interface DataProvider {
  createDataStream(styleName: string, fileName: string, type: DataType): ByteStream;
}

/** Strips any path, like SysUtils.ExtractFileName (both separators). */
export function extractFileName(fileName: string): string {
  const parts = fileName.split(/[\\/]/);
  return parts[parts.length - 1];
}

export interface ArchiveDataProviderOptions {
  /** One archive per style name (case-insensitive key). */
  styles: Map<string, Archive> | Record<string, Archive>;
  sounds?: Archive;
  cursors?: Archive;
  assets?: Archive;
  /** Raw contents of Particles.dat */
  particles?: Uint8Array;
  /** Optional music archives per style name. */
  music?: Map<string, Archive> | Record<string, Archive>;
}

export class ArchiveDataProvider implements DataProvider {
  private readonly styles = new Map<string, Archive>();
  private readonly music = new Map<string, Archive>();
  private readonly sounds?: Archive;
  private readonly cursors?: Archive;
  private readonly assets?: Archive;
  private readonly particles?: Uint8Array;

  constructor(opts: ArchiveDataProviderOptions) {
    const styles = opts.styles instanceof Map ? opts.styles : new Map(Object.entries(opts.styles));
    for (const [k, v] of styles) this.styles.set(k.toLowerCase(), v);
    if (opts.music) {
      const music = opts.music instanceof Map ? opts.music : new Map(Object.entries(opts.music));
      for (const [k, v] of music) this.music.set(k.toLowerCase(), v);
    }
    this.sounds = opts.sounds;
    this.cursors = opts.cursors;
    this.assets = opts.assets;
    this.particles = opts.particles;
  }

  styleArchive(styleName: string): Archive | undefined {
    return this.styles.get(styleName.toLowerCase());
  }

  createDataStream(styleName: string, fileName: string, type: DataType): ByteStream {
    const name = extractFileName(fileName);
    let archive: Archive | undefined;
    switch (type) {
      case DataType.LemmingData:
      case DataType.LevelGraphics:
      case DataType.LevelSpecialGraphics:
      case DataType.Level:
        archive = this.styles.get(styleName.toLowerCase());
        if (!archive) throw new EngineError(`Style not found ${styleName}`);
        break;
      case DataType.Sound:
        archive = this.sounds;
        break;
      case DataType.Cursor:
        archive = this.cursors;
        break;
      case DataType.Asset:
        archive = this.assets;
        break;
      case DataType.Music:
        archive = this.music.get(styleName.toLowerCase());
        break;
      case DataType.Particles:
        if (!this.particles) throw new EngineError(`Unassigned datastream for ${fileName}`);
        return new ByteStream(this.particles.slice());
      default:
        throw new EngineError(`Unhandled resource data type (${fileName})`);
    }
    const data = archive?.get(name);
    if (!data) throw new EngineError(`File not found in zip-resource: ${name}`);
    // a fresh stream on a copy, like TBytesStream.Create(bytes)
    return new ByteStream(data.slice());
  }
}
