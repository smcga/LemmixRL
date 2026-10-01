/** Port of Styles.Dos.pas: the 5 built in DOS styles and their level systems. */
import { leadZeroStr } from '../base/utils.ts';
import type { DataProvider } from '../data/datasource.ts';
import { DOSOHNO_MECHANICS, DOSORIG_MECHANICS, type Mechanics } from '../dos/consts.ts';
import { LevelLoadingInformation, LevelSystem, Section, Style, StyleDef, trackName } from './base.ts';

/* -------------------------------------------------------------------------------------------- Orig */

// fun..mayhem, 1..30 encoded indices (note: the levels are 1-based)
const OrigSectionTable: readonly (readonly number[])[] = [
  [147, 155, 157, 149, 151, 153, 159, 14, 22, 54, 70, 16, 29, 32, 38, 42, 48, 72, 84, 104, 138, 23, 68, 96, 98, 116, 78, 100, 108, 134],
  [1, 30, 36, 50, 52, 56, 58, 80, 102, 120, 128, 130, 136, 5, 148, 152, 154, 156, 160, 7, 11, 13, 15, 17, 19, 21, 25, 27, 33, 31],
  [37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61, 63, 3, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 35, 111],
  [91, 93, 95, 97, 99, 101, 103, 105, 107, 109, 112, 113, 115, 117, 119, 121, 123, 125, 127, 150, 129, 9, 131, 133, 135, 137, 139, 141, 143, 145],
];

interface Entry {
  fileName: string;
  fileIndex: number;
  isOddTable: boolean;
  oddIndex: number;
}

export class DosOrigLevelSystem extends LevelSystem {
  /**
   * The numbers in the table are subtracted by 1 first; the lowest bit then tells whether the odd table
   * is used, the rest (div 2) is the level number: file = n div 8, index in file = n mod 8.
   */
  static getEntry(section: number, level: number): Entry {
    let b = OrigSectionTable[section][level];
    b = (b - 1) & 0xff; // Dec(B) on a Byte
    const isOddTable = (b & 1) === 1;
    b = Math.trunc(b / 2);
    const fx = Math.trunc(b / 8);
    return {
      fileName: 'LEVEL' + fx.toString().padStart(3, '0') + '.DAT',
      fileIndex: b % 8,
      isOddTable,
      oddIndex: isOddTable ? b : -1,
    };
  }

  protected doInitializeLevelSystem(): void {
    const sectionNames = ['Fun', 'Tricky', 'Taxing', 'Mayhem'];
    this.oddTableFileName = 'oddtable.dat';
    let iMusic = 1;
    for (let iSection = 0; iSection <= 3; iSection++) {
      const section = new Section(this);
      section.sectionName = sectionNames[iSection];
      for (let iLevel = 0; iLevel <= 29; iLevel++) {
        const level = new LevelLoadingInformation(section);
        const e = DosOrigLevelSystem.getEntry(section.sectionIndex, level.levelIndex);
        level.sourceFileName = e.fileName;
        level.sectionIndexInSourceFile = e.fileIndex;
        level.useOddTable = e.isOddTable;
        level.oddTableIndex = e.oddIndex;
        level.musicFileName = trackName(iMusic); // tracks 01..21
        iMusic++;
        if (iMusic > 21) iMusic = 1;
      }
    }
  }
}

export class DosOrigStyle extends Style {
  constructor(data: DataProvider) {
    super('Orig', StyleDef.Orig, data);
  }
  protected createLevelSystem(): LevelSystem {
    return new DosOrigLevelSystem(this);
  }
  get mechanics(): Mechanics {
    return DOSORIG_MECHANICS;
  }
}

/* -------------------------------------------------------------------------------------------- Ohno */

// My own little system for OhNo: div 10 = file, mod 10 is index. So 117 means file 11, index 7.
const OhNoTable: readonly (readonly number[])[] = [
  [100, 101, 102, 103, 104, 105, 106, 107, 110, 111, 112, 113, 114, 115, 116, 117, 120, 121, 122, 123], // tame
  [1, 10, 14, 20, 21, 30, 31, 35, 51, 54, 57, 67, 4, 15, 16, 26, 34, 37, 43, 64], // crazy
  [92, 70, 71, 72, 73, 75, 86, 7, 22, 25, 33, 36, 40, 42, 44, 50, 63, 65, 66, 47], // wild
  [96, 46, 90, 91, 5, 94, 61, 6, 12, 87, 41, 55, 60, 62, 77, 81, 97, 93, 80, 76], // wicked
  [74, 53, 32, 27, 24, 23, 52, 17, 11, 3, 2, 0, 45, 85, 13, 82, 83, 56, 84, 95], // havoc
];

export class DosOhNoLevelSystem extends LevelSystem {
  static getEntry(section: number, level: number): Entry {
    const h = OhNoTable[section][level];
    return {
      fileName: 'Dlvel' + leadZeroStr(Math.trunc(h / 10), 3) + '.dat',
      fileIndex: h % 10,
      isOddTable: false,
      oddIndex: -1,
    };
  }

  protected doInitializeLevelSystem(): void {
    const sectionNames = ['Tame', 'Crazy', 'Wild', 'Wicked', 'Havoc'];
    this.oddTableFileName = '';
    let iMusic = 1;
    for (let iSection = 0; iSection <= 4; iSection++) {
      const section = new Section(this);
      section.sectionName = sectionNames[iSection];
      for (let iLevel = 0; iLevel <= 19; iLevel++) {
        const level = new LevelLoadingInformation(section);
        const e = DosOhNoLevelSystem.getEntry(section.sectionIndex, level.levelIndex);
        level.sourceFileName = e.fileName;
        level.sectionIndexInSourceFile = e.fileIndex;
        level.useOddTable = e.isOddTable;
        level.oddTableIndex = e.oddIndex;
        level.musicFileName = trackName(iMusic); // tracks 01..06
        iMusic++;
        if (iMusic > 6) iMusic = 1;
      }
    }
  }
}

export class DosOhNoStyle extends Style {
  constructor(data: DataProvider) {
    super('Ohno', StyleDef.Ohno, data);
  }
  protected createLevelSystem(): LevelSystem {
    return new DosOhNoLevelSystem(this);
  }
  get mechanics(): Mechanics {
    return DOSOHNO_MECHANICS;
  }
}

/* -------------------------------------------------------------------------------------------- H94 */

export class DosH94LevelSystem extends LevelSystem {
  static getEntry(section: number, level: number): Entry {
    // 2 files per section with each 8 levels: section 1 -> LEVEL000/001, section 2 -> 002/003 etc.
    const fileNo = section * 2 + (level >= 8 ? 1 : 0);
    return {
      fileName: 'LEVEL' + leadZeroStr(fileNo, 3) + '.DAT',
      fileIndex: level % 8,
      isOddTable: false,
      oddIndex: -1,
    };
  }

  protected doInitializeLevelSystem(): void {
    const sectionNames = ["Frost '94", "Hail '94", "Flurry '93", "Blitz '93"];
    this.oddTableFileName = '';
    let iMusic = 1;
    for (let iSection = 0; iSection <= 3; iSection++) {
      const section = new Section(this);
      section.sectionName = sectionNames[iSection];
      for (let iLevel = 0; iLevel <= 15; iLevel++) {
        const level = new LevelLoadingInformation(section);
        const e = DosH94LevelSystem.getEntry(section.sectionIndex, level.levelIndex);
        level.sourceFileName = e.fileName;
        level.sectionIndexInSourceFile = e.fileIndex;
        level.useOddTable = e.isOddTable;
        level.oddTableIndex = e.oddIndex;
        level.musicFileName = trackName(iMusic); // tracks 01..02
        iMusic++;
        if (iMusic > 2) iMusic = 1;
      }
    }
  }
}

export class DosH94Style extends Style {
  constructor(data: DataProvider) {
    super('H94', StyleDef.H94, data);
  }
  protected createLevelSystem(): LevelSystem {
    return new DosH94LevelSystem(this);
  }
  get mechanics(): Mechanics {
    return DOSOHNO_MECHANICS;
  }
}

/* -------------------------------------------------------------------------------------------- X91, X92 */

class DosXmasLevelSystem extends LevelSystem {
  protected doInitializeLevelSystem(): void {
    this.oddTableFileName = '';
    const section = new Section(this);
    section.sectionName = 'XMas';
    for (let iLevel = 0; iLevel <= 3; iLevel++) {
      const level = new LevelLoadingInformation(section);
      level.sourceFileName = 'LEVEL000.DAT';
      level.sectionIndexInSourceFile = level.levelIndex;
      level.useOddTable = false;
      level.oddTableIndex = -1;
      level.musicFileName = ''; // no tracks yet
    }
  }
}

export class DosX91LevelSystem extends DosXmasLevelSystem {}
export class DosX92LevelSystem extends DosXmasLevelSystem {}

export class DosX91Style extends Style {
  constructor(data: DataProvider) {
    super('X91', StyleDef.X91, data);
  }
  protected createLevelSystem(): LevelSystem {
    return new DosX91LevelSystem(this);
  }
  get mechanics(): Mechanics {
    return DOSOHNO_MECHANICS;
  }
}

export class DosX92Style extends Style {
  constructor(data: DataProvider) {
    super('X92', StyleDef.X92, data);
  }
  protected createLevelSystem(): LevelSystem {
    return new DosX92LevelSystem(this);
  }
  get mechanics(): Mechanics {
    return DOSOHNO_MECHANICS;
  }
}

export function createDosStyle(def: StyleDef, data: DataProvider): Style {
  switch (def) {
    case StyleDef.Orig:
      return new DosOrigStyle(data);
    case StyleDef.Ohno:
      return new DosOhNoStyle(data);
    case StyleDef.H94:
      return new DosH94Style(data);
    case StyleDef.X91:
      return new DosX91Style(data);
    case StyleDef.X92:
      return new DosX92Style(data);
    default:
      throw new Error('Unhandled style definition');
  }
}
