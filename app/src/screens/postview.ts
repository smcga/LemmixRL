/** Port of GameScreen.Postview (TGamePostviewScreen): how you've played the level, and the code of the next one. */
import { Bitmap32, type GameResultsRec, type LevelLoadingInformation, MiscOption } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import {
  CR,
  congratsString,
  formatSimple,
  resultStrings,
  SPostviewScreen_AllLemmingsAccountedFor,
  SPostviewScreen_PressLeftMouseForNextLevel,
  SPostviewScreen_PressLeftMouseToRetryLevel,
  SPostviewScreen_PressMouseToContinue,
  SPostviewScreen_PressRightMouseForMenu,
  SPostviewScreen_UnknownGameResultString,
  SPostviewScreen_YouCheater,
  SPostviewScreen_YouNeeded_s,
  SPostviewScreen_YouRescued_s,
  SPostviewScreen_YourAccessCode_ss,
  SPostviewScreen_YourTimeIsUp,
} from '../texts.ts';
import { DosScreenBase, ScreenType } from './base.ts';
import { saveGame } from './player.ts';

export interface PostviewHost {
  download(fileName: string, bytes: Uint8Array, mimeType: string): void;
  showMessage(text: string): Promise<void>;
  copyToClipboard(text: string): void;
}

export class PostviewScreen extends DosScreenBase {
  dirty = true;
  private playedLevelInfo: LevelLoadingInformation | null = null;
  nextCode = '';
  private gameIsSaved = false;

  constructor(
    private readonly app: LemmixApp,
    private readonly close: (next: ScreenType) => void,
    private readonly host: PostviewHost,
  ) {
    super(app.data.provider, app.style);
  }

  build(): void {
    this.initializeImageSize(640, 350);
    this.extractBackGround();
    this.extractPurpleFont();
    const temp = new Bitmap32();
    temp.setSize(640, 350);
    temp.clear(0);
    this.tileBackgroundBitmap(0, 0, temp);
    this.drawPurpleTextCentered(temp, this.getScreenText(), 16);
    this.screen.assign(temp);
    this.dirty = true;
  }

  private getResultText(r: GameResultsRec): string {
    if (r.cheated) return SPostviewScreen_YouCheater;
    let ix = -1;
    if (r.done === 100) ix = 8;
    else if (r.done === 0) ix = 0;
    else if (r.done < Math.trunc(r.target / 2)) ix = 1;
    else if (r.done < r.target - 5) ix = 2;
    else if (r.done < r.target - 1) ix = 3;
    else if (r.done === r.target - 1) ix = 4;
    else if (r.done === r.target) ix = 5;
    else if (r.done < r.target + 20) ix = 6;
    else if (r.done >= r.target + 20) ix = 7;
    const strings = resultStrings(this.app.styleDef);
    return ix >= 0 && ix < strings.length ? strings[ix] : SPostviewScreen_UnknownGameResultString;
  }

  private getScreenText(): string {
    const app = this.app;
    let result = '';
    const addLine = (s: string) => (result += s + CR);
    const addLineFeed = (count: number) => {
      if (count > 0) result += CR.repeat(count);
    };

    this.playedLevelInfo = app.currentLevelInfo;
    const r = app.gameResult!;
    // LemmixRL: in a run there is no next level or access code, the run goes on
    const nextInfo = app.inRun ? null : app.currentLevelInfo!.next;
    const congrats = !nextInfo && r.success && !app.inRun;
    // next level earned
    if (r.success && !app.inRun) app.currentLevelInfo = nextInfo;

    if (congrats) addLine(congratsString(app.styleDef));
    else {
      let sTarget: string;
      let sDone: string;
      if (app.config.miscOptions.has(MiscOption.LemmingsPercentages)) {
        sTarget = r.target + '%';
        sDone = r.done + '%';
      } else {
        sTarget = String(r.toRescue);
        sDone = String(r.rescued);
      }
      // top text
      addLine(r.timeIsUp ? SPostviewScreen_YourTimeIsUp : SPostviewScreen_AllLemmingsAccountedFor);
      addLineFeed(1);
      addLine(formatSimple(SPostviewScreen_YouRescued_s, [sDone]));
      addLine(formatSimple(SPostviewScreen_YouNeeded_s, [sTarget]));
      addLineFeed(1);
      addLine(this.getResultText(r));
      addLineFeed(6);
      if (r.success && nextInfo) {
        const h = nextInfo.getLevelCode();
        this.nextCode = h;
        addLine(formatSimple(SPostviewScreen_YourAccessCode_ss, [String(nextInfo.levelIndex + 1), h]));
        addLineFeed(3);
      } else addLineFeed(5);
    }

    // force bottomtext to a fixed position
    addLineFeed(18 - result.split(CR).length + 1);

    if (congrats || app.inRun) addLine(SPostviewScreen_PressMouseToContinue);
    else {
      addLine(r.success ? SPostviewScreen_PressLeftMouseForNextLevel : SPostviewScreen_PressLeftMouseToRetryLevel);
      addLine(SPostviewScreen_PressRightMouseForMenu);
    }
    return result;
  }

  keyDown(key: string): void {
    if (this.app.inRun && (key === 'Escape' || key === 'Enter')) this.close(ScreenType.Run);
    else if (key === 'Escape') this.close(ScreenType.Menu);
    else if (key === 'Enter') this.close(ScreenType.Preview);
  }

  keyPress(ch: string): void {
    switch (ch) {
      case 'r':
        if (this.app.inRun) return; // a replay would be another attempt
        this.app.currentLevelInfo = this.playedLevelInfo;
        this.app.replayCurrent = true;
        this.close(ScreenType.Play);
        break;
      case 'u':
        if (this.gameIsSaved) return;
        this.gameIsSaved = true;
        saveGame(this.app.game, true, true, this.host.download);
        if (this.app.config.miscOptions.has(MiscOption.MessageAfterSaveInResultScreen)) void this.host.showMessage('Game saved');
        break;
    }
  }

  /** ^C: the level code */
  copy(): void {
    if (this.app.game.gameResultRec.success) this.host.copyToClipboard(this.nextCode);
  }

  mouseDown(button: number): void {
    if (this.app.inRun) this.close(ScreenType.Run);
    else if (button === 0) this.close(ScreenType.Preview);
    else if (button === 2) this.close(ScreenType.Menu);
  }
}
