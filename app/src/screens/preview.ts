/** Port of GameScreen.Preview (TGamePreviewScreen): the level preview with the level information. */
import { Bitmap32, delphiTrim, GAME_BMPHEIGHT, GAME_BMPWIDTH, type LevelLoadingInformation, MiscOption, percentage } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import {
  formatSimple,
  SPreviewScreen_Level_ss,
  SPreviewScreen_NumberOfLemmings_s,
  SPreviewScreen_PressMouseButtonToContinue,
  SPreviewScreen_ReleaseRate_s,
  SPreviewScreen_Rating_s,
  SPreviewScreen_Style_s,
  SPreviewScreen_Time_s,
  SPreviewScreen_ToBeSaved_s,
} from '../texts.ts';
import { BLIND_NAMES } from '../run/state.ts';
import { DosScreenBase, ScreenType } from './base.ts';

export class PreviewScreen extends DosScreenBase {
  dirty = true;
  private initialLevelInfo: LevelLoadingInformation | null;

  constructor(
    private readonly app: LemmixApp,
    private readonly close: (next: ScreenType) => void,
    private readonly host: { selectReplayFile(): Promise<{ name: string; bytes: Uint8Array } | null> },
  ) {
    super(app.data.provider, app.style);
    this.initialLevelInfo = app.currentLevelInfo;
    this.initializeImageSize(640, 350);
    this.extractBackGround();
    this.extractPurpleFont();
  }

  build(): void {
    const app = this.app;
    if (!app.currentLevelInfo) app.currentLevelInfo = app.style.levelSystem.firstLevel();
    if (!this.initialLevelInfo) this.initialLevelInfo = app.currentLevelInfo;
    app.currentLevelInfo.loadLevel(app.level);
    // LemmixRL: a blind plays the level with the squad, skills and clock of the run
    if (app.inRun) app.run?.applyToLevel(app.level);

    // prepare the renderer
    app.graphicSet.load(app.data.provider, app.level.info.graphicSet, app.level.info.graphicSetEx);
    app.renderer.prepare(app.level, app.graphicSet);

    const target = new Bitmap32();
    const fullLevel = new Bitmap32();
    target.setSize(640, 350); // the original dos-screen size
    target.clear(0);

    // draw level preview
    fullLevel.setSize(GAME_BMPWIDTH, GAME_BMPHEIGHT);
    fullLevel.clear(0);
    app.renderer.renderWorld(fullLevel, true);

    // make preview as big as possible at the top or keep ratio
    const previewLevelHeight = app.config.miscOptions.has(MiscOption.KeepLevelRatioInPreviewScreen)
      ? Math.round((target.width / GAME_BMPWIDTH) * GAME_BMPHEIGHT)
      : 80;
    const dst = { left: 0, top: 80 - previewLevelHeight, right: target.width, bottom: 80 };
    fullLevel.drawToRect(target, dst, fullLevel.boundsRect);

    // draw background
    this.tileBackgroundBitmap(0, 80, target);

    // draw text
    const text = this.getScreenLines();
    let y = 80 + 2;
    for (let i = 0; i < text.length; i++) {
      if (i < 15) this.drawPurpleText(target, text[i], 0, y);
      else this.drawPurpleTextCentered(target, text[i], y);
      y += 16;
    }
    this.screen.assign(target);
    this.dirty = true;
  }

  private getScreenLines(): string[] {
    const app = this.app;
    const info = app.currentLevelInfo!;
    const levelInfo = app.level.info;
    const replayString = app.replayFile && this.initialLevelInfo === info ? 'Replay' : '';
    // LemmixRL: the blind of the run, in the empty line under the title
    const blind = app.inRun ? app.run?.currentBlind : null;
    const blindString = blind ? `${BLIND_NAMES[blind.kind]} - Ante ${app.run!.state.ante}` : '';
    let styleDescriptor = info.style.description;
    if (styleDescriptor.length > 24) styleDescriptor = info.style.name;
    const percStr = app.config.miscOptions.has(MiscOption.LemmingsPercentages)
      ? percentage(levelInfo.lemmingsCount, levelInfo.rescueCount) + '%'
      : String(levelInfo.rescueCount);
    const indent = ' '.repeat(10);
    return [
      formatSimple(SPreviewScreen_Level_ss, [String(info.levelIndex + 1), delphiTrim(levelInfo.title)]),
      blindString,
      replayString,
      indent + formatSimple(SPreviewScreen_NumberOfLemmings_s, [String(levelInfo.lemmingsCount)]),
      '',
      indent + formatSimple(SPreviewScreen_ToBeSaved_s, [percStr]),
      '',
      indent + formatSimple(SPreviewScreen_ReleaseRate_s, [String(levelInfo.releaseRate)]),
      '',
      indent + formatSimple(SPreviewScreen_Time_s, [String(levelInfo.timeLimit)]),
      '',
      indent + formatSimple(SPreviewScreen_Rating_s, [info.section.sectionName]),
      '',
      indent + formatSimple(SPreviewScreen_Style_s, [styleDescriptor]),
      '',
      SPreviewScreen_PressMouseButtonToContinue, // this one is drawn centered
    ];
  }

  /** BeforeCloseScreen: a replay file stays selected only for the level it was selected for. */
  private closeScreen(next: ScreenType): void {
    if (next === ScreenType.Play && this.initialLevelInfo !== this.app.currentLevelInfo && this.app.replayFile) {
      this.app.replayFile = null;
      this.app.replayFileName = '';
    }
    this.close(next);
  }

  keyDown(key: string, shift: boolean, ctrl: boolean, alt: boolean): void {
    if (shift || ctrl || alt) return;
    switch (key) {
      case 'Escape':
        if (this.app.inRun) {
          this.app.run?.abandonAttempt();
          this.close(ScreenType.Run);
        } else this.closeScreen(ScreenType.Menu);
        break;
      case 'Enter':
        this.closeScreen(ScreenType.Play);
        break;
      case 'ArrowUp':
        this.showNextLevel(true);
        break;
      case 'ArrowDown':
        this.showNextLevel(false);
        break;
    }
  }

  mouseDown(button: number): void {
    if (button === 0 && !this.selecting) this.closeScreen(ScreenType.Play);
  }

  private selecting = false;

  /** 'l': play a replay file of this level (the replay finder of Lemmix lists the matching replays) */
  keyPress(ch: string): void {
    if (ch !== 'l' || this.selecting || this.app.inRun) return;
    this.selecting = true;
    void this.host.selectReplayFile().then((f) => {
      this.selecting = false;
      if (!f) return;
      this.app.replayFile = f.bytes;
      this.app.replayFileName = f.name;
      this.initialLevelInfo = this.app.currentLevelInfo;
      this.close(ScreenType.Play);
    });
  }

  wheel(deltaY: number): void {
    this.showNextLevel(deltaY < 0);
  }

  private showNextLevel(forwards: boolean): void {
    const app = this.app;
    if (!app.config.miscOptions.has(MiscOption.CheatScrollingInPreviewScreen) || app.inRun) return;
    if (forwards) app.currentLevelInfo = app.currentLevelInfo!.next ?? app.style.levelSystem.firstLevel();
    else app.currentLevelInfo = app.currentLevelInfo!.prev ?? app.style.levelSystem.lastLevel();
    this.build();
  }
}
