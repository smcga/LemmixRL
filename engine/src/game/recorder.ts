/**
 * Port of the replay part of Game.pas: TReplayItem, TRecorder, TReplayFileHeaderRec, TReplayRec.
 * The binary .lrb format is identical to Lemmix (replay version 3).
 */
import { type ByteStream, getInt16LE, getInt32LE, getWordLE, setInt32LE, setWordLE } from '../base/stream.ts';
import { ensureRange, leadZeroStr, yesNo } from '../base/utils.ts';
import { Mechanic, type Mechanics, mechanicsAsText } from '../dos/consts.ts';
import { ansiCharToString } from '../dos/structures.ts';
import { bytesToUInt64, uint64ToBytes } from '../level/hash.ts';

export const LEMMIX_REPLAY_VERSION = 3;
export const MAX_REPLAY_RECORDS = 32768;
export const REPLAY_HEADER_SIZE = 64;
export const REPLAY_RECORD_SIZE = 32;

// Recorded Action Flags
export const raf_StartPause = 1 << 0;
export const raf_EndPause = 1 << 1;
export const raf_Pausing = 1 << 2;
export const raf_StartIncreaseRR = 1 << 3; // only allowed when not pausing
export const raf_StartDecreaseRR = 1 << 4; // only allowed when not pausing
export const raf_StopChangingRR = 1 << 5; // only allowed when not pausing
export const raf_SkillSelection = 1 << 6;
export const raf_SkillAssignment = 1 << 7;
export const raf_Nuke = 1 << 8; // only allowed when not pausing, as in the game

// Replay Flag
export const rf_UseLemming2 = 1 << 0;
export const rf_RightMouseGlitch = 1 << 1;

// Recorded Lemming Action
export const rla_None = 0;
export const rla_Exploding = 18;

// Recorded Selected Button
export const rsb_None = 0;
export const rsb_Slower = 1;
export const rsb_Faster = 2;
export const rsb_Climber = 3;
export const rsb_Umbrella = 4;
export const rsb_Explode = 5;
export const rsb_Stopper = 6;
export const rsb_Builder = 7;
export const rsb_Basher = 8;
export const rsb_Miner = 9;
export const rsb_Digger = 10;
export const rsb_Pause = 11;
export const rsb_Nuke = 12;

export class ReplayItem {
  iteration = 0;
  private fActionFlags = 0; // Word
  private fAssignedSkill = 0; // Byte
  private fSelectedButton = 0; // Byte
  private fReleaseRate = 0; // Byte
  lemmingIndex = 0;
  lemmingX = 0;
  lemmingY = 0;
  cursorX = 0;
  cursorY = 0;
  private fFlags = 0; // Byte
  hasValidCursorData = false;

  get actionFlags(): number {
    return this.fActionFlags;
  }
  set actionFlags(v: number) {
    this.fActionFlags = v & 0xffff;
  }
  get assignedSkill(): number {
    return this.fAssignedSkill;
  }
  set assignedSkill(v: number) {
    this.fAssignedSkill = v & 0xff;
  }
  get selectedButton(): number {
    return this.fSelectedButton;
  }
  set selectedButton(v: number) {
    this.fSelectedButton = v & 0xff;
  }
  get releaseRate(): number {
    return this.fReleaseRate;
  }
  set releaseRate(v: number) {
    this.fReleaseRate = v & 0xff;
  }
  get flags(): number {
    return this.fFlags;
  }
  set flags(v: number) {
    this.fFlags = v & 0xff;
  }
}

/** TReplayFileHeaderRec (64 bytes). */
export interface ReplayFileHeader {
  signature: string;
  version: number;
  fileSize: number;
  headerSize: number;
  mechanics: Mechanics; // 16 bit set
  firstRecordPos: number;
  reserved1: number;
  reserved2: number;
  replayRecordCount: number;
  hash: bigint;
  replayGlitchPauseIterations: number;
  levelTitle: Uint8Array; // 32 AnsiChars
}

export function emptyHeader(): ReplayFileHeader {
  return {
    signature: '\0\0\0',
    version: 0,
    fileSize: 0,
    headerSize: 0,
    mechanics: 0,
    firstRecordPos: 0,
    reserved1: 0,
    reserved2: 0,
    replayRecordCount: 0,
    hash: 0n,
    replayGlitchPauseIterations: 0,
    levelTitle: new Uint8Array(32),
  };
}

export function parseHeader(b: Uint8Array): ReplayFileHeader {
  return {
    signature: String.fromCharCode(b[0], b[1], b[2]),
    version: b[3],
    fileSize: getInt32LE(b, 4),
    headerSize: getWordLE(b, 8),
    mechanics: getWordLE(b, 10),
    firstRecordPos: getInt32LE(b, 12),
    reserved1: b[16],
    reserved2: b[17],
    replayRecordCount: getWordLE(b, 18),
    hash: bytesToUInt64(b.subarray(20, 28)),
    replayGlitchPauseIterations: getInt32LE(b, 28),
    levelTitle: b.slice(32, 64),
  };
}

export function writeHeader(h: ReplayFileHeader): Uint8Array {
  const b = new Uint8Array(REPLAY_HEADER_SIZE);
  for (let i = 0; i < 3; i++) b[i] = h.signature.charCodeAt(i) & 0xff;
  b[3] = h.version & 0xff;
  setInt32LE(b, 4, h.fileSize);
  setWordLE(b, 8, h.headerSize);
  setWordLE(b, 10, h.mechanics);
  setInt32LE(b, 12, h.firstRecordPos);
  b[16] = h.reserved1 & 0xff;
  b[17] = h.reserved2 & 0xff;
  setWordLE(b, 18, h.replayRecordCount);
  b.set(uint64ToBytes(h.hash), 20);
  setInt32LE(b, 28, h.replayGlitchPauseIterations);
  b.set(h.levelTitle.subarray(0, 32), 32);
  return b;
}

/** What the recorder needs to know from the game when saving. */
export interface RecorderGameContext {
  readonly mechanics: Mechanics;
  readonly glitchPauseIterations: number;
  getLevelHash(): bigint;
  getLevelTitle(): string; // Level.Info.Title
}

export class Recorder {
  wasSaved = false;
  wasLoaded = false;
  /**
   * TFastObjectList<TReplayItem>. Can hold nil (null) items: Truncate sets TList.Count, which zero-fills
   * when it grows the list. Code that dereferences such an item raises, like the original does.
   */
  readonly list: (ReplayItem | null)[] = [];
  currentMechanics: Mechanics = 0;
  recordedGlitchPauseIterations = 0;
  currentHeader: ReplayFileHeader = emptyHeader();

  get isEmpty(): boolean {
    return this.list.length === 0;
  }

  add(): ReplayItem {
    const item = new ReplayItem();
    this.list.push(item);
    return item;
  }

  lastOrDefault(): ReplayItem | null {
    return this.list.length > 0 ? this.list[this.list.length - 1] : null;
  }

  clear(): void {
    this.list.length = 0;
    this.wasLoaded = false;
    this.wasSaved = false;
  }

  truncate(count: number): void {
    // TList.Count := aCount. This normally shrinks the list, but RegainControl passes the replay index, which can be
    // larger than the count after SaveToStream deleted a trailing StartPause record during a replay. TList.SetCount
    // then appends nil items.
    if (count < this.list.length) this.list.length = count;
    else while (this.list.length < count) this.list.push(null);
  }

  /**
   * TRecorder.LoadFromStream. Returns an error message, or empty string on success.
   * NB: like the original, a failure halfway may leave a partially filled list and changed mechanics.
   */
  loadFromBytes(data: Uint8Array): string {
    const deftext = 'Replay loading error: ';
    if (data.length < REPLAY_HEADER_SIZE) return deftext + 'Header read error size mismatch';
    const header = parseHeader(data.subarray(0, REPLAY_HEADER_SIZE));
    if (header.signature !== 'LRB') return deftext + 'Invalid replay header signature. this must be "LRB"';
    if (header.fileSize !== data.length) return deftext + 'Invalid replay header filesize mismatch';
    if (header.headerSize !== REPLAY_HEADER_SIZE) return deftext + 'Invalid replay header headersize mismatch';
    if (header.replayRecordCount > 0 && (header.firstRecordPos < header.headerSize || header.firstRecordPos >= data.length))
      return deftext + 'Invalid first record position';
    if (header.version < 1 || header.version > LEMMIX_REPLAY_VERSION)
      return deftext + 'Invalid replay header version (' + header.version + ').';

    this.currentMechanics = header.mechanics;

    if (header.version > 1) {
      header.replayGlitchPauseIterations = ensureRange(header.replayGlitchPauseIterations, 0, 33);
      this.recordedGlitchPauseIterations = header.replayGlitchPauseIterations;
    }

    let parity = 0;
    this.list.length = 0;
    let pos = header.firstRecordPos;

    for (;;) {
      if (pos + REPLAY_RECORD_SIZE > data.length) break;
      const rec = data.subarray(pos, pos + REPLAY_RECORD_SIZE);
      pos += REPLAY_RECORD_SIZE;
      if (rec[0] !== 0x52 /* 'R' */) return deftext + 'Replay record check error, must be equal to "R"';
      let item = this.add();
      const recActionFlags = getWordLE(rec, 5);
      const recReleaseRate = getInt32LE(rec, 9);
      const recIteration = getInt32LE(rec, 1);
      item.iteration = recIteration;
      item.actionFlags = recActionFlags;
      item.assignedSkill = rec[7];
      item.selectedButton = rec[8];
      item.releaseRate = recReleaseRate;
      item.lemmingIndex = getInt32LE(rec, 13);
      item.lemmingX = getInt32LE(rec, 17);
      item.lemmingY = getInt32LE(rec, 21);
      item.cursorX = getInt16LE(rec, 25);
      item.cursorY = getInt16LE(rec, 27);

      // some very old replays (0.0.7.0 and before that) did not store cursorposition, and there is crap inside it
      item.hasValidCursorData =
        item.assignedSkill !== 0 &&
        item.cursorX > item.lemmingX - 8 &&
        item.cursorX < item.lemmingX + 12 &&
        item.cursorY > item.lemmingY - 16 &&
        item.cursorY < item.lemmingY + 12;

      if (!item.hasValidCursorData) {
        item.cursorX = 0;
        item.cursorY = 0;
      }

      if (header.version > 2) item.flags = rec[29]; // glitchflags were added in replay version 3

      if (recActionFlags === raf_StartPause) parity++;
      else if (recActionFlags === raf_EndPause) parity--;

      const rr = recReleaseRate;
      const iter = recIteration;

      // Add fake paused record if unpaired startpause. This happens when this file was saved in paused mode!
      if (parity === 1 && this.list.length === header.replayRecordCount) {
        item = this.add();
        item.iteration = iter;
        item.releaseRate = rr;
        item.actionFlags = raf_EndPause;
        break;
      }

      if (this.list.length >= header.replayRecordCount) break;
    }

    this.currentHeader = header;
    this.wasLoaded = true;
    return '';
  }

  /**
   * TRecorder.SaveToStream. NB: deletes a trailing StartPause record from the list, like the original.
   * A nil item (see truncate) raises halfway, after the header and the preceding records have been written.
   */
  saveToStream(game: RecorderGameContext, s: ByteStream): void {
    const last = this.lastOrDefault();
    if (last && last.actionFlags === raf_StartPause) this.list.pop();

    const header = emptyHeader();
    header.signature = 'LRB';
    header.version = LEMMIX_REPLAY_VERSION;
    header.fileSize = REPLAY_HEADER_SIZE + REPLAY_RECORD_SIZE * this.list.length;
    header.headerSize = REPLAY_HEADER_SIZE;
    header.mechanics = (game.mechanics | (1 << Mechanic.Obsolete)) & 0xffff;
    header.firstRecordPos = header.headerSize;
    header.replayRecordCount = this.list.length & 0xffff;
    header.hash = game.getLevelHash();
    header.replayGlitchPauseIterations = game.glitchPauseIterations;
    // "for var t := 1 to 32 do header.LevelTitle := ' '" assigns ' ' followed by #0 padding
    const title = new Uint8Array(32);
    title[0] = 0x20;
    const t = game.getLevelTitle();
    for (let i = 0; i < t.length && i < 32; i++) title[i] = t.charCodeAt(i) & 0xff;
    header.levelTitle = title;

    s.writeBuffer(writeHeader(header));

    for (const entry of this.list) {
      const item = entry!; // a nil item raises at the first field access
      const rec = new Uint8Array(REPLAY_RECORD_SIZE); // rec.Clear
      rec[0] = 0x52; // 'R'
      setInt32LE(rec, 1, item.iteration);
      setWordLE(rec, 5, item.actionFlags);
      rec[7] = item.assignedSkill;
      rec[8] = item.selectedButton;
      setInt32LE(rec, 9, item.releaseRate);
      setInt32LE(rec, 13, item.lemmingIndex);
      setInt32LE(rec, 17, item.lemmingX);
      setInt32LE(rec, 21, item.lemmingY);
      setWordLE(rec, 25, item.cursorX & 0xffff);
      setWordLE(rec, 27, item.cursorY & 0xffff);
      rec[29] = item.flags;
      s.writeBuffer(rec);
    }

    this.wasSaved = true;
    this.currentHeader = header;
  }

  /** The table part of TRecorder.SaveToTxt (useful for debugging and comparing replays). */
  recordsAsText(): string {
    const skillstrings = [
      '-', 'Walk', 'Jump (not allowed)', 'Dig', 'Climb', 'Drown (not allowed)', 'Hoist (not allowed)', 'Build', 'Bash', 'Mine',
      'Fall (not allowed)', 'Float', 'Splat (not allowed)', 'Exit (not allowed)', 'Vaporize (not allowed)', 'Block',
      'Shrug (not allowed)', 'Ohno (not allowed)', 'Explode',
    ];
    const selstrings = ['-', 'Slower', 'Faster', 'Climber', 'Umbrella', 'Explode', 'Stopper', 'Builder', 'Basher', 'Miner', 'Digger', 'Pause', 'Nuke'];
    const actionStr = (f: number): string => {
      const r = '........'.split('');
      if (f & raf_StartPause) r[0] = 'B';
      if (f & raf_EndPause) r[1] = 'E';
      if (f & raf_StartIncreaseRR) r[2] = '+';
      if (f & raf_StartDecreaseRR) r[3] = '-';
      if (f & raf_StopChangingRR) r[4] = '*';
      if (f & raf_SkillSelection) r[5] = 'S';
      if (f & raf_SkillAssignment) r[6] = 'A';
      if (f & raf_Nuke) r[7] = 'N';
      return r.join('');
    };
    const lines: string[] = [];
    lines.push(' Rec   Frame  Pausing Action        Skill     Button     RR  lem    x    y   mx   my prio MouseGlitch');
    this.list.forEach((entry, i) => {
      const item = entry!; // a nil item raises, like the original
      lines.push(
        leadZeroStr(i, 4) + '  ' +
          leadZeroStr(item.iteration, 6) + '  ' +
          yesNo((item.actionFlags & raf_Pausing) !== 0).padEnd(7) + ' ' +
          actionStr(item.actionFlags).padEnd(12) + '  ' +
          (skillstrings[item.assignedSkill] ?? '?').padEnd(8) + '  ' +
          (selstrings[item.selectedButton] ?? '?').padEnd(8) + '  ' +
          leadZeroStr(item.releaseRate, 3) + ' ' +
          leadZeroStr(item.lemmingIndex, 4) + ' ' +
          leadZeroStr(item.lemmingX, 4) + ' ' +
          leadZeroStr(item.lemmingY, 4) + ' ' +
          leadZeroStr(item.cursorX, 4) + ' ' +
          leadZeroStr(item.cursorY, 4) + ' ' +
          String((item.flags & rf_UseLemming2) === 0 ? 0 : 1).padEnd(5) +
          yesNo((item.flags & rf_RightMouseGlitch) !== 0),
      );
    });
    return lines.join('\r\n');
  }

  mechanicsText(m: Mechanics): string {
    return mechanicsAsText(m, true, true, false);
  }
}

export function headerTitle(h: ReplayFileHeader): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += ansiCharToString(h.levelTitle[i]);
  return s;
}
