/** Port of GameScreen.Menu (TGameMenuScreen): the main menu with the scrolling credits reel. */
import { Bitmap32, DrawMode, getDosMainMenuPaletteColors32, MiscOption, SoundOption, StyleDef, zeroTopLeftRect, offsetRect } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { CR, FULL_PROGRAM_NAME, SCredits, SProgramTexts, formatSimple } from '../texts.ts';
import { speak, VoiceOption } from '../voice.ts';
import { DosScreenBase, ScreenType } from './base.ts';
import { pixelGlyphs } from '../run/ui/pixelfont.ts';
import { toggleVoice } from './player.ts';

/** The dialogs the menu screen opens (Windows dialogs in Lemmix). */
export interface MenuHost {
  chooseStyle(current: string): Promise<string | null>;
  editConfig(): Promise<void>;
  selectReplayFile(): Promise<{ name: string; bytes: Uint8Array } | null>;
  showMessage(text: string): Promise<void>;
  showText(title: string, text: string): Promise<void>;
}

enum MenuBitmap {
  Logo,
  Play, // 1st row, 1st button
  LevelCode, // 1st row, 2nd button
  Music, // 1st row, 3d button
  Section, // 1st row, 4th button
  Exit, // 2nd row, 1st button
  Navigation, // 2nd row, 2nd button
  MusicNote, // drawn in gmbMusic
  FXSound, // drawn in gmbMusic
  GameSection1, // mayhem/havoc    drawn in gmbSection
  GameSection2, // taxing/wicked   drawn in gmbSection
  GameSection3, // tricky/wild     drawn in gmbSection
  GameSection4, // fun/crazy       drawn in gmbSection
  GameSection5, // .../ohno tame, only last one
  Roguelike, // LemmixRL: 2nd row, 3d button (made from the empty sign of the music button)
}

// Positions at which the images of the menuscreen are drawn
const POSITIONS: Record<MenuBitmap, [number, number]> = {
  [MenuBitmap.Logo]: [8, 10],
  [MenuBitmap.Play]: [72, 120],
  [MenuBitmap.LevelCode]: [200, 120],
  [MenuBitmap.Music]: [328, 120],
  [MenuBitmap.Section]: [456, 120],
  // LemmixRL: three signs in the 2nd row (Lemmix has two, at 200 and 328)
  [MenuBitmap.Exit]: [136, 196],
  [MenuBitmap.Navigation]: [264, 196],
  [MenuBitmap.Roguelike]: [392, 196],
  [MenuBitmap.MusicNote]: [328 + 27, 120 + 26],
  [MenuBitmap.FXSound]: [328 + 27, 120 + 26],
  [MenuBitmap.GameSection1]: [456 + 32, 120 + 24],
  [MenuBitmap.GameSection2]: [456 + 32, 120 + 24],
  [MenuBitmap.GameSection3]: [456 + 32, 120 + 24],
  [MenuBitmap.GameSection4]: [456 + 32, 120 + 24],
  [MenuBitmap.GameSection5]: [456 + 32, 120 + 24],
};

const YPos_ProgramText = 272;
/** LemmixRL: the colours of the sign of the roguelike run (the board, its name and the shadow of the name) */
const SIGN_BOARD = 0xb03848;
const SIGN_TEXT = 0xf0f0f0;
const SIGN_SHADOW = 0x300010;
const YPos_Credits = 350 - 16;
const Reel_Width = 34 * 16;
const Font_Width = 16;

export class MenuScreen extends DosScreenBase {
  private readonly elements: Bitmap32[] = [];
  private currentSection = 0;
  private lastSection = 0;
  // credits
  private readonly leftLemmingAnimation = new Bitmap32();
  private readonly rightLemmingAnimation = new Bitmap32();
  private readonly reel = new Bitmap32();
  private readonly reelBuffer = new Bitmap32();
  private canAnimate = false;
  // credits animation counters
  private readonly frameTimeMS = 32;
  private prevTime = 0;
  private readonly readingPauseMS = 1000;
  private readonly reelLetterBoxCount = 34; // the number of letterboxes on the reel
  private pausing = false;
  userPausing = false;
  private pausingDone = false; // the current text has been paused
  private readonly creditList = SCredits;
  private creditIndex = -1;
  private creditString = '';
  private textX = 0;
  private textPauseX = 0; // if -1 then no pause
  private textGoneX = 0;
  private currentFrame = 0;
  private reelShift = 0;
  dirty = true;

  constructor(
    private readonly app: LemmixApp,
    private readonly close: (next: ScreenType) => void,
    private readonly host: MenuHost,
  ) {
    super(app.data.provider, app.style);
    for (let e = MenuBitmap.Logo; e <= MenuBitmap.Roguelike; e++) {
      const bmp = new Bitmap32();
      if (![MenuBitmap.MusicNote, MenuBitmap.FXSound, MenuBitmap.GameSection1, MenuBitmap.GameSection2, MenuBitmap.GameSection3, MenuBitmap.GameSection4].includes(e))
        bmp.drawMode = DrawMode.Transparent;
      this.elements.push(bmp);
    }
    this.leftLemmingAnimation.drawMode = DrawMode.Transparent;
    this.rightLemmingAnimation.drawMode = DrawMode.Transparent;
    this.setNextCredit();
  }

  private drawBitmapElement(e: MenuBitmap): void {
    const [x, y] = POSITIONS[e];
    if (this.app.config.miscOptions.has(MiscOption.AdjustLogoInMenuScreen) && e === MenuBitmap.Logo) {
      const src = this.elements[e];
      const tmp = new Bitmap32();
      tmp.setSize(Math.trunc(src.width / 2), src.height);
      src.drawToRect(tmp, tmp.boundsRect, src.boundsRect);
      tmp.drawMode = DrawMode.Transparent;
      tmp.drawTo(this.screen, x + Math.trunc(tmp.width / 2), y);
    } else this.elements[e].drawTo(this.screen, x, y);
    this.dirty = true;
  }

  /** extract bitmaps from the lemmingsdata and draw */
  build(): void {
    const app = this.app;
    if (!app.currentLevelInfo) app.currentLevelInfo = app.style.levelSystem.firstLevel();
    this.currentSection = app.currentLevelInfo.section.sectionIndex;
    const sections = app.style.levelSystem.sectionList;
    this.lastSection = sections[sections.length - 1].sectionIndex;

    const tmp = new Bitmap32();
    const pal = getDosMainMenuPaletteColors32();
    this.initializeImageSize(640, 350);
    this.extractBackGround();
    this.extractPurpleFont();

    const md = this.mainDat;
    const el = this.elements;
    md.extractBitmap(el[MenuBitmap.Logo], 3, 0x2080, 632, 94, 4, pal);
    md.extractBitmap(el[MenuBitmap.Play], 3, 0x9488, 120, 61, 4, pal);
    md.extractBitmap(el[MenuBitmap.LevelCode], 3, 0xa2d4, 120, 61, 4, pal);
    md.extractBitmap(el[MenuBitmap.Music], 3, 0xb120, 120, 61, 4, pal);
    md.extractBitmap(el[MenuBitmap.Section], 3, 0xbf6c, 120, 61, 4, pal);
    md.extractBitmap(el[MenuBitmap.Exit], 3, 0xcdb8, 120, 61, 4, pal);
    md.extractBitmap(el[MenuBitmap.Navigation], 3, 0xdc04, 120, 61, 4, pal);
    md.extractBitmap(el[MenuBitmap.MusicNote], 3, 0xea50, 64, 31, 4, pal);
    md.extractBitmap(el[MenuBitmap.FXSound], 3, 0xee30, 64, 31, 4, pal);

    md.extractAnimation(this.leftLemmingAnimation, 4, 0x2a00, 48, 16, 16, 4, pal);
    md.extractAnimation(this.rightLemmingAnimation, 4, 0x4200, 48, 16, 16, 4, pal);

    md.extractBitmap(el[MenuBitmap.GameSection1], 4, 0x5a80, 72, 27, 4, pal);
    md.extractBitmap(el[MenuBitmap.GameSection2], 4, 0x5e4c, 72, 27, 4, pal);
    md.extractBitmap(el[MenuBitmap.GameSection3], 4, 0x6218, 72, 27, 4, pal);
    md.extractBitmap(el[MenuBitmap.GameSection4], 4, 0x65e4, 72, 27, 4, pal);

    // the only style with 5 sections
    if (app.styleDef === StyleDef.Ohno) md.extractBitmap(el[MenuBitmap.GameSection5], 4, 0x65e4 + 972, 72, 27, 4, pal);

    // reel
    md.extractBitmap(tmp, 4, 0x5a00, 16, 16, 4, pal);
    // a little oversize
    this.reel.setSize(this.reelLetterBoxCount * 16 + 32, 16);
    for (let i = 0; i < this.reelLetterBoxCount + 4; i++) tmp.drawTo(this.reel, i * 16, 0);
    // make sure the reelbuffer is the right size
    this.reelBuffer.setSize(this.reelLetterBoxCount * 16, 16);

    // background
    this.tileBackgroundBitmap(0, 0);
    this.backBuffer.assign(this.screen); // save it

    this.makeRoguelikeSign();

    // menu elements
    for (const e of [MenuBitmap.Logo, MenuBitmap.Play, MenuBitmap.LevelCode, MenuBitmap.Music, MenuBitmap.Section, MenuBitmap.Exit, MenuBitmap.Navigation, MenuBitmap.Roguelike])
      this.drawBitmapElement(e);

    // program text
    this.drawPurpleTextCentered(this.screen, formatSimple(SProgramTexts[app.styleDef], [app.style.name]) + CR + FULL_PROGRAM_NAME, YPos_ProgramText);

    // credits animation
    this.drawWorkerLemmings(0);
    this.drawReel();

    this.paintCurrentSection();
    this.drawCorrectSoundBitmap();

    this.canAnimate = true;
    this.dirty = true;
  }

  /**
   * LemmixRL: the sign of the roguelike run. The data has no such sign, so it is made from the one of the music
   * button, which is an empty board with the F3 key on it: the board gets another colour, the key becomes F6, and the
   * name is written on it.
   */
  private makeRoguelikeSign(): void {
    const sign = this.elements[MenuBitmap.Roguelike];
    sign.assign(this.elements[MenuBitmap.Music]);
    sign.drawMode = DrawMode.Transparent;
    const w = sign.width;
    const set = (x: number, y: number, c: number) => {
      if (x >= 0 && y >= 0 && x < w && y < sign.height) sign.bits[y * w + x] = c;
    };
    // the board: every pixel in the colour of the board, except the key in its corner
    const board = sign.bits[40 * w + 60];
    const key = (x: number, y: number) => x >= 9 && x <= 26 && y >= 20 && y <= 28;
    for (let y = 0; y < sign.height; y++) for (let x = 0; x < w; x++) if (sign.bits[y * w + x] === board && !key(x, y)) sign.bits[y * w + x] = SIGN_BOARD;
    // the key: the 3 of F3 becomes a 6 (5 x 5 pixels, dark on the colour of the key)
    ['#####', '##...', '#####', '##.##', '#####'].forEach((row, y) => {
      for (let x = 0; x < 5; x++) set(19 + x, 21 + y, row[x] === '#' ? 0 : board);
    });
    // the name, with a shadow: a small line next to the key, a big one below it
    const glyphs = new Map(pixelGlyphs().map((g) => [g.code, g]));
    const write = (text: string, y: number, scale: number, left: number, right: number) => {
      const letters = [...text].map((ch) => glyphs.get(ch.charCodeAt(0))!);
      const width = letters.reduce((n, g) => n + (g.width + 1) * scale, -scale);
      for (const [dx, dy, c] of [
        [scale, scale, SIGN_SHADOW],
        [0, 0, SIGN_TEXT],
      ]) {
        let x0 = Math.round((left + right - width) / 2);
        for (const g of letters) {
          for (let gy = 0; gy < 16; gy++)
            for (let gx = 0; gx < g.width; gx++)
              if (g.bit(gx, gy)) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(x0 + gx * scale + sx + dx, y + (gy - 2) * scale + sy + dy, c);
          x0 += (g.width + 1) * scale;
        }
      }
    };
    write('ROGUELIKE', 20, 1, 30, 102);
    write('RUN', 32, 2, 8, 104);
  }

  keyDown(key: string, shift: boolean, ctrl: boolean, alt: boolean): void {
    if (shift || ctrl || alt || this.dialogOpen) return;
    switch (key) {
      case 'Enter':
      case 'F1':
        this.close(ScreenType.Preview);
        break;
      case 'F2':
        this.close(ScreenType.LevelCode);
        break;
      case 'F6': // LemmixRL
        this.close(ScreenType.Run);
        break;
      case 'F3':
        this.nextSoundSetting();
        break;
      case 'F4':
        void this.withDialog(async () => {
          const name = await this.host.chooseStyle(this.app.style.name);
          if (!name) return;
          this.app.setStyle(name);
          this.app.config.save();
          speak(VoiceOption.CurrentStyle, false, this.app.style.description);
          this.close(ScreenType.Menu); // this screen has to be reloaded because a new style is becoming active
        });
        break;
      case 'F5':
        void this.withDialog(() => this.host.editConfig());
        break;
      case 'ArrowUp':
        this.nextSection(true);
        break;
      case 'ArrowDown':
        this.nextSection(false);
        break;
      case ' ':
        this.userPausing = !this.userPausing;
        break;
    }
  }

  keyPress(ch: string): void {
    if (this.dialogOpen) return;
    switch (ch) {
      case 'l':
      case 'L':
        void this.withDialog(() => this.loadReplayDialog());
        break;
      case '?':
        void this.withDialog(() => this.host.showText('Menu Screen', MENU_HELP));
        break;
      case 'v':
      case 'V':
        toggleVoice(this.app);
        break;
    }
  }

  mouseDown(button: number): void {
    if (button === 0 && !this.dialogOpen) this.close(ScreenType.Preview);
  }

  /**
   * LemmixRL, touch screens only (a click anywhere is "play" in Lemmix): the signs do what their keys do. Returns
   * false when the tap is not on a sign (then it is a click).
   */
  touchAt(x: number, y: number): boolean {
    if (this.dialogOpen) return true;
    const on = (e: MenuBitmap) => {
      const [px, py] = POSITIONS[e];
      const b = this.elements[e];
      return x >= px && x < px + b.width && y >= py && y < py + b.height;
    };
    const press = (key: string) => this.keyDown(key, false, false, false);
    if (on(MenuBitmap.Play)) press('F1');
    else if (on(MenuBitmap.LevelCode)) press('F2');
    else if (on(MenuBitmap.Music)) press('F3');
    else if (on(MenuBitmap.Navigation)) press('F4');
    else if (on(MenuBitmap.Section)) press(y < POSITIONS[MenuBitmap.Section][1] + this.elements[MenuBitmap.Section].height / 2 ? 'ArrowUp' : 'ArrowDown');
    else if (on(MenuBitmap.Exit)) return true; // a browser page does not exit
    else if (on(MenuBitmap.Roguelike)) press('F6');
    else return false;
    return true;
  }

  /**
   * LemmixRL: a click on the sign of the roguelike run starts it (a click anywhere else is "play", as in Lemmix).
   * Returns whether the click was on the sign.
   */
  clickAt(x: number, y: number): boolean {
    if (this.dialogOpen) return false;
    const [px, py] = POSITIONS[MenuBitmap.Roguelike];
    const b = this.elements[MenuBitmap.Roguelike];
    if (x < px || x >= px + b.width || y < py || y >= py + b.height) return false;
    this.keyDown('F6', false, false, false);
    return true;
  }

  private dialogOpen = false;

  /** the credits do not animate while a dialog is shown (fIdle.Active := False) */
  private async withDialog(fn: () => Promise<void>): Promise<void> {
    this.dialogOpen = true;
    this.canAnimate = false;
    try {
      await fn();
    } finally {
      this.dialogOpen = false;
      this.canAnimate = true;
    }
  }

  private async loadReplayDialog(): Promise<void> {
    const file = await this.host.selectReplayFile();
    if (!file) return; // nothing selected
    const info = this.app.findReplayLevel(file.bytes);
    if (!info) {
      await this.host.showMessage(`Cannot find the level from replayfile ${file.name}.`);
      return;
    }
    if (info.style !== this.app.style) this.app.setStyle(info.style.name);
    this.app.currentLevelInfo = info;
    this.app.replayFile = file.bytes;
    this.app.replayFileName = file.name;
    this.close(ScreenType.Preview);
  }

  private nextSection(forwards: boolean): void {
    const change = () => {
      const sect = this.app.style.levelSystem.sectionList[this.currentSection];
      this.app.currentLevelInfo = sect.levelLoadingInformationList[0];
      speak(VoiceOption.CurrentSection, false, sect.sectionName);
    };
    if (!forwards) {
      if (this.currentSection > 0) {
        this.currentSection--;
        this.paintCurrentSection();
        change();
      }
    } else if (this.currentSection < this.lastSection) {
      this.currentSection++;
      this.paintCurrentSection();
      change();
    }
  }

  private drawCorrectSoundBitmap(): void {
    const opt = this.app.config.soundOptions;
    if (opt.size === 0) this.drawBitmapElement(MenuBitmap.Music);
    else if (opt.size === 1 && opt.has(SoundOption.Sound)) this.drawBitmapElement(MenuBitmap.FXSound);
    else if (opt.has(SoundOption.Music)) this.drawBitmapElement(MenuBitmap.MusicNote);
  }

  private nextSoundSetting(): void {
    const opt = this.app.config.soundOptions;
    if (opt.size === 0) opt.add(SoundOption.Sound);
    else if (opt.size === 1 && opt.has(SoundOption.Sound)) opt.add(SoundOption.Music);
    else if (opt.has(SoundOption.Music)) opt.clear();
    this.app.config.save();
    this.drawCorrectSoundBitmap();
    if (opt.size === 0) speak(VoiceOption.SoundFX, false, 'No sounds');
    else if (opt.size === 1 && opt.has(SoundOption.Sound)) speak(VoiceOption.SoundFX, false, 'sounds only');
    else if (opt.size === 2) speak(VoiceOption.SoundFX, false, 'music and sounds');
  }

  private paintCurrentSection(): void {
    const order =
      this.app.styleDef === StyleDef.Ohno
        ? [MenuBitmap.GameSection5, MenuBitmap.GameSection4, MenuBitmap.GameSection3, MenuBitmap.GameSection2, MenuBitmap.GameSection1]
        : [MenuBitmap.GameSection4, MenuBitmap.GameSection3, MenuBitmap.GameSection2, MenuBitmap.GameSection1];
    const e = order[this.currentSection];
    if (e !== undefined) this.drawBitmapElement(e);
  }

  private drawWorkerLemmings(frame: number): void {
    const src = this.leftLemmingAnimation.calcFrameRect(16, frame);
    let dst = offsetRect(zeroTopLeftRect(src), 0, YPos_Credits);
    this.backBuffer.drawToRect(this.screen, dst, dst);
    this.leftLemmingAnimation.drawToRect(this.screen, dst, src);
    dst = offsetRect(zeroTopLeftRect(src), 640 - 48, YPos_Credits);
    this.backBuffer.drawToRect(this.screen, dst, dst);
    this.rightLemmingAnimation.drawToRect(this.screen, dst, src);
    this.dirty = true;
  }

  /** Drawing of the moving credits. */
  private drawReel(): void {
    this.reel.drawTo(this.reelBuffer, this.reelShift, 0);
    this.drawPurpleText(this.reelBuffer, this.creditString, this.textX, 0);
    this.reelBuffer.drawTo(this.screen, 48, YPos_Credits);
    this.dirty = true;
  }

  private setNextCredit(): void {
    this.textX = 33 * 16;
    if (this.creditList.length === 0) {
      this.creditString = '';
      return;
    }
    this.creditIndex++;
    if (this.creditIndex > this.creditList.length - 1) this.creditIndex = 0;
    // set new string
    this.creditString = this.creditList[this.creditIndex];
    this.pausing = false;
    this.pausingDone = false;
    const textSize = this.creditString.length * Font_Width;
    this.textPauseX = Math.trunc((Reel_Width - textSize) / 2);
    this.textGoneX = -textSize;
  }

  /**
   * Animation of credits (Application_Idle): 34 characters fit into the reel. The text scrolls from right to left.
   * When one line is centered into the reel, scrolling is paused for a while.
   */
  idle(currTime: number): void {
    if (!this.canAnimate || this.userPausing) return;
    // check end reading pause
    if (this.pausing) {
      if (currTime - this.prevTime >= this.readingPauseMS) {
        this.prevTime = currTime;
        this.pausing = false;
        this.pausingDone = true; // we only pause once per text
      }
      return;
    }
    // update frames
    if (currTime - this.prevTime >= this.frameTimeMS) {
      this.prevTime = currTime;
      // workerlemmings animation has 16 frames
      this.currentFrame++;
      if (this.currentFrame >= 15) this.currentFrame = 0;
      // text + reel
      this.reelShift -= 4;
      if (this.reelShift <= -16) this.reelShift = 0;
      this.textX -= 4;
      if (this.textX < this.textGoneX) this.setNextCredit();
      // if text can be centered then pause if we are there
      if (!this.pausingDone && this.textPauseX >= 0 && this.textX <= this.textPauseX) this.pausing = true;
      this.drawWorkerLemmings(this.currentFrame);
      this.drawReel();
    }
  }
}

const MENU_HELP = [
  ['Enter, F1', 'Preview screen'],
  ['F2', 'Level code screen'],
  ['F3', 'Select sound setting'],
  ['F4', 'Select style'],
  ['F5', 'Configuration'],
  ['F6', 'Roguelike run'],
  ['Up', 'Next section'],
  ['Down', 'Previous section'],
  ['Space', 'Pause or unpause the credits'],
  ['l', 'Load a replay file'],
  ['v', 'Toggle voice on/off'],
]
  .map(([k, d]) => k.padEnd(12) + d)
  .join('\n');
