/** Port of GameScreen.LevelCode (TGameScreenLevelCode): typing a level code. */
import { type LevelLoadingInformation, MiscOption } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { formatSimple, SCheatCode, SLevelCodeScreen_CodeForSectionLevel_ss, SLevelCodeScreen_EnterCode, SLevelCodeScreen_IncorrectCode } from '../texts.ts';
import { DosScreenBase, ScreenType } from './base.ts';

const INTERNAL_BLINK = 240;

/** TLevelSystem.FindLevelBySectionNameAndNumber, e.g. "fun12" (cheat codes). */
function findLevelBySectionNameAndNumber(app: LemmixApp, code: string): LevelLoadingInformation | null {
  if (code.length < 2) return null;
  let sectionString = '';
  let levelString = '';
  let charsFound = false;
  let digitsFound = false;
  for (const c of code) {
    if (/\p{L}/u.test(c)) {
      if (digitsFound) return null;
      charsFound = true;
      sectionString += c;
    } else if (/\p{Nd}/u.test(c)) {
      if (!charsFound) return null;
      digitsFound = true;
      levelString += c;
    }
  }
  const section = app.style.levelSystem.sectionList.find((s) => s.sectionName.toLowerCase() === sectionString.toLowerCase());
  if (!section || !/^\d+$/.test(levelString)) return null;
  const ix = Number.parseInt(levelString, 10);
  if (ix < 1 || ix > section.levelLoadingInformationList.length) return null;
  return section.levelLoadingInformationList[ix - 1];
}

export class LevelCodeScreen extends DosScreenBase {
  dirty = true;
  private readonly levelCode = '..........'.split('');
  private cursorPosition = 1;
  private validLevelCode = false;
  private readonly yPositions = [120, 152, 184, 216];
  private readonly xPos = Math.trunc((640 - 10 * 16) / 2);
  private blinking = false;
  private lastMessage = '';
  private lastCheatMessage = '';
  private blinkTick = 0;
  private closing = false;

  constructor(
    private readonly app: LemmixApp,
    private readonly close: (next: ScreenType) => void,
  ) {
    super(app.data.provider, app.style);
    this.initializeImageSize(640, 380);
    this.extractBackGround();
    this.extractPurpleFont();
  }

  build(): void {
    this.tileBackgroundBitmap(0, 0);
    this.backBuffer.assign(this.screen); // save background
    this.drawPurpleText(this.screen, SLevelCodeScreen_EnterCode, this.xPos, 120);
    this.drawPurpleText(this.screen, this.levelCode.join(''), this.xPos, this.yPositions[1]);
    this.updateCheatMessage();
    this.dirty = true;
  }

  idle(currTick: number): void {
    if (this.closing) return;
    if (currTick - this.blinkTick >= INTERNAL_BLINK) {
      this.blinkTick = currTick;
      this.blinking = !this.blinking;
      this.drawChar(this.blinking);
    }
  }

  private checkCheatCode(): boolean {
    return this.levelCode.join('').toLowerCase().replace(/\./g, '') === SCheatCode;
  }

  private findLevelByCode(code: string): LevelLoadingInformation | null {
    for (const info of this.app.style.levelSystem.allLevels()) if (info.getLevelCode() === code) return info;
    return null;
  }

  private checkLevelCode(): boolean {
    const s = this.levelCode.join('').replace(/\./g, '');
    let info = this.findLevelByCode(s);
    if (!info && this.app.config.miscOptions.has(MiscOption.CheatCodesInLevelCodeScreen))
      info = findLevelBySectionNameAndNumber(this.app, this.levelCode.join(''));
    if (info) {
      this.app.currentLevelInfo = info;
      this.drawMessage(formatSimple(SLevelCodeScreen_CodeForSectionLevel_ss, [info.section.sectionName, String(info.levelIndex + 1)]));
      return true;
    }
    this.drawMessage(SLevelCodeScreen_IncorrectCode);
    return false;
  }

  private drawChar(blink = false): void {
    const c = blink ? '_' : this.levelCode[this.cursorPosition - 1];
    this.drawPurpleText(this.screen, c, this.xPos + this.cursorPosition * 16 - 16, this.yPositions[1], this.backBuffer);
    this.dirty = true;
  }

  private drawMessage(s: string): void {
    if (this.lastMessage) this.drawPurpleTextCentered(this.screen, this.lastMessage, this.yPositions[2], this.backBuffer, true);
    this.lastMessage = s;
    if (s) this.drawPurpleTextCentered(this.screen, s, this.yPositions[2]);
    this.dirty = true;
  }

  private updateCheatMessage(): void {
    if (this.lastCheatMessage) this.drawPurpleTextCentered(this.screen, this.lastCheatMessage, 350 - 20, this.backBuffer, true);
    this.lastCheatMessage = '';
    if (!this.app.config.miscOptions.has(MiscOption.CheatCodesInLevelCodeScreen)) return;
    this.lastCheatMessage = 'Cheatcodes Enabled!';
    this.drawPurpleTextCentered(this.screen, this.lastCheatMessage, 350 - 20);
    this.dirty = true;
  }

  keyDown(key: string, shift: boolean, ctrl: boolean, alt: boolean): void {
    if (this.closing || shift || ctrl || alt) return;
    if (key === 'Escape') this.close(ScreenType.Menu);
    else if (key === 'Enter') {
      if (this.checkCheatCode()) {
        // toggle cheat enabled
        this.app.config.miscOptions.add(MiscOption.CheatCodesInLevelCodeScreen);
        this.app.config.save();
        this.updateCheatMessage();
        return;
      }
      if (!this.validLevelCode) {
        this.validLevelCode = this.checkLevelCode();
        if (this.validLevelCode) {
          this.drawChar(false);
          // CloseDelay = 1000
          this.closing = true;
          setTimeout(() => this.close(ScreenType.Menu), 1000);
        }
      } else this.close(ScreenType.Menu);
    }
  }

  keyPress(key: string): void {
    if (this.closing) return;
    const c = key.toUpperCase();
    if (/^[A-Z0-9]$/.test(c)) {
      this.drawMessage('');
      const oldC = this.levelCode[this.cursorPosition - 1];
      const oldPos = this.cursorPosition;
      this.levelCode[this.cursorPosition - 1] = c;
      if (this.cursorPosition < 10) {
        // maybe blinking: repair
        this.drawChar(false);
        this.cursorPosition++;
      }
      if (oldPos !== this.cursorPosition || oldC !== c) this.drawChar();
      this.validLevelCode = false;
    } else if (key === 'Backspace') {
      this.drawMessage('');
      if (this.cursorPosition > 1) {
        this.levelCode[this.cursorPosition - 1] = '.';
        // maybe blinking: repair
        this.drawChar(false);
        if (this.cursorPosition > 1) this.cursorPosition--;
        this.validLevelCode = false;
      }
    }
  }

  /** ^V: a pasted code of 10 characters */
  paste(text: string): void {
    const s = text.trim();
    if (s.length !== 10) return;
    for (let i = 1; i <= 10; i++) {
      this.levelCode[i - 1] = s[i - 1];
      this.cursorPosition = i;
      this.drawChar(false);
    }
  }
}
