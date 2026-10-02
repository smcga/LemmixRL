/**
 * Port of GameScreen.Player (TGameScreenPlayer): the heartbeat of the game (frame and scroll timers), mouse and
 * keyboard input, scrolling, and the skill panel events.
 *
 * Coordinates are "control" coordinates of the game image (TImage32): its size is 320 x 160 times the display
 * scale. Like Lemmix (which clips the mouse cursor to the game area with ClipCursor), the scene keeps the mouse
 * inside the image and the skill panel.
 */
import {
  Bitmap32,
  ByteStream,
  GAME_BMPWIDTH,
  type GameView,
  GameOption,
  GameTexts,
  type LemmingGame,
  MiscOption,
  PauseCommandMode,
  SkillPanelButton,
  SoundOption,
  type TColor32,
} from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { saveRun } from '../run/storage.ts';
import { speak, voice, VoiceOption } from '../voice.ts';
import { ScreenType } from './base.ts';
import { SkillPanel } from './skillpanel.ts';

export enum GameScroll {
  None,
  Right,
  Left,
}

const INTERVAL_FRAME = 58;
const INTERVAL_FRAME_SUPERLEMMING = 20;
const INTERVAL_FRAME_FASTFORWARD = 10;
const INTERVAL_SCROLL = 58;
const INTERVAL_NUKE_KEY = 250;
const SECOND = 17;
const MINUTE = 17 * 60;

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

/**
 * TTicker. Lemmix polls the timers about every millisecond (Sleep(1) in the idle loop); a browser animation frame
 * comes every 16 ms or so. Late ticks are caught up with, so the frame rate stays the original one; after a stall
 * (a hidden browser tab for example) the timer starts again from the current time.
 */
class Ticker {
  last = 0;
  interval = 0;

  check(t: number): boolean {
    return t - this.last >= this.interval;
  }

  reset(t: number): void {
    this.last += this.interval;
    if (t - this.last > 250) this.last = t;
  }
}

/** Things the player needs from the hosting scene. */
export interface PlayerHost {
  /** let the user pick a replay file */
  selectReplayFile(): Promise<{ name: string; bytes: Uint8Array } | null>;
  download(fileName: string, bytes: Uint8Array, mimeType: string): void;
  showText(title: string, text: string): Promise<void>;
  showMessage(text: string): Promise<void>;
  hasFocus(): boolean;
}

/** Base.Utils.StripInvalidFileChars(s, removeDots = False, removeDoubleSpaces = True, trimAccess = True) */
export function stripInvalidFileChars(s: string): string {
  let r = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  while (r.includes('  ')) r = r.replace('  ', ' ');
  return r.trim();
}

export class PlayerScreen implements GameView {
  readonly toolbar = new SkillPanel();
  readonly game: LemmingGame;
  /** Img.OffsetHorz: control pixels, between MinScroll * DisplayScale and 0 */
  offsetHorz = 0;
  imgWidth: number;
  imgHeight: number;
  private readonly frameTimer = new Ticker();
  private readonly scrollTimer = new Ticker();
  private gameScroll = GameScroll.None;
  private mouseScroll = false; // input scroll = mouse
  private keyBoardScroll = false; // input scroll = keyboard
  private readonly keyBoardPageScroll = false; // scroll a whole screen by keyboard
  private playLock = 1; // set to > 0 whenever we don't want to play
  private draggingMapStartX = 0;
  draggingMap = false;
  private readonly minScroll = -(GAME_BMPWIDTH - 320);
  private readonly maxScroll = 0;
  private saveStateIteration = -1;
  private lastShiftState: Modifiers = { shift: false, ctrl: false, alt: false };
  private lastNukeKeyTick = -Infinity;
  private alwaysRegainControlOnMouseClick = false;
  private keyIsDown = 0;
  private lastReplayFileName = '';
  private closing = false;
  /** the mouse position in control coordinates of the image (the skill panel is below it) */
  mouseX = 0;
  mouseY = 0;

  constructor(
    private readonly app: LemmixApp,
    private readonly close: (next: ScreenType) => void,
    public displayScale: number,
    private readonly host: PlayerHost,
  ) {
    this.game = app.game;
    this.imgWidth = 320 * displayScale;
    this.imgHeight = 160 * displayScale;
    this.game.onFinish = () => this.closeScreen(ScreenType.Postview);
    this.toolbar.getScrollX = () => -this.offsetHorz / this.displayScale;
    this.toolbar.onMinimapClick = (x) => this.toolBarMinimapClick(x);
    this.toolbar.onSkillButtonsMouseDown = (b, dbl) => this.toolBarMouseDown(b, dbl);
    this.toolbar.onSkillButtonsMouseUp = () => this.game.btnStopChangingReleaseRate();
  }

  /** BuildScreen */
  build(): void {
    const app = this.app;
    const sca = this.displayScale;
    const cfg = app.config;
    this.game.prepare({
      style: app.style,
      data: app.data.provider,
      renderer: app.renderer,
      level: app.level,
      levelLoadingInfo: app.currentLevelInfo!,
      graphicSet: app.graphicSet,
      targetBitmap: new Bitmap32(),
      toolbar: this.toolbar,
      soundMgr: app.sound,
      view: this,
      displayScale: sca,
      soundOptions: cfg.soundOptions,
      gameOptions: cfg.gameOptions,
      miscOptions: cfg.miscOptions,
      optionalMechanics: cfg.optionalMechanics,
    });
    this.alwaysRegainControlOnMouseClick = cfg.gameOptions.has(GameOption.AlwaysRegainControlOnMouseClick);
    // LemmixRL: the lemmings of the run's squad get the abilities of their cards (the game is shared: always set)
    this.game.onLemmingReleased = app.inRun && app.run ? app.run.releaseHook(this.game) : null;

    // init timers
    this.scrollTimer.reset(0);
    this.frameTimer.reset(0);
    this.scrollTimer.interval = INTERVAL_SCROLL;
    this.frameTimer.interval = this.game.level.info.superLemming ? INTERVAL_FRAME_SUPERLEMMING : INTERVAL_FRAME;
    this.offsetHorz = -app.level.info.screenPosition * sca;
    this.toolbar.setStyleAndGraph(app.data.provider, app.style, app.graphicSet);
  }

  /** Form_Activate */
  activate(now: number): void {
    const app = this.app;
    const f = app.replayFile;
    const name = app.replayFileName;
    app.replayFile = null; // de-activate replaying
    app.replayFileName = '';
    this.frameTimer.last = now;
    this.scrollTimer.last = now;
    if (!f) {
      if (app.replayCurrent) this.startReplay();
      else this.game.start(false);
    } else this.startReplayFromFile(name, f);
    app.replayCurrent = false;
    this.playLock = 0;
  }

  /** a new display scale (the window was resized) */
  rescale(s: number): void {
    const old = this.displayScale;
    this.offsetHorz = Math.round((this.offsetHorz / old) * s);
    this.mouseX = Math.trunc((this.mouseX / old) * s);
    this.mouseY = Math.trunc((this.mouseY / old) * s);
    this.displayScale = s;
    this.game.displayScale = s;
    this.imgWidth = 320 * s;
    this.imgHeight = 160 * s;
  }

  get targetBitmap(): Bitmap32 {
    return this.game.targetBitmap;
  }

  // GameView

  bitmapToControl(x: number, y: number): { x: number; y: number } {
    return { x: x * this.displayScale + this.offsetHorz, y: y * this.displayScale };
  }

  /** TLowResolutionMessage.SetText: Arial, height 12, not anti aliased */
  renderLowResText(text: string, color: TColor32): Bitmap32 {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = '10.5px Arial, Helvetica, sans-serif';
    ctx.font = font;
    const w = Math.max(1, Math.ceil(ctx.measureText(text).width));
    const h = 12;
    canvas.width = w;
    canvas.height = h;
    ctx.font = font;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 0, 1);
    const px = ctx.getImageData(0, 0, w, h).data;
    const bmp = new Bitmap32(w, h);
    const c = (color | 0xff000000) >>> 0;
    for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] >= 128) bmp.bits[i] = c;
    return bmp;
  }

  speak(what: 'ReplayFail' | 'GameSaved' | 'StartReplay', force: boolean): void {
    speak(VoiceOption[what], force);
  }

  // control <-> bitmap

  controlToBitmap(x: number, y: number): { x: number; y: number } {
    return { x: Math.floor((x - this.offsetHorz) / this.displayScale), y: Math.floor(y / this.displayScale) };
  }

  /** convert the normal hotspot to the hotspot the game uses (4,9 instead of 7,7) */
  private setAdjustedGameCursorPoint(p: { x: number; y: number }): void {
    this.game.cursorPoint = { x: p.x - 3, y: p.y + 2 };
  }

  /** the cursor shape (CheckResetCursor) */
  get currentCursor(): number {
    return this.draggingMap ? 3 : this.game.currentCursor;
  }

  /** Application_Idle: the main heartbeat of the player. */
  update(now: number): void {
    if (this.playLock > 0 || !this.game.playing || this.game.isFinished || this.draggingMap) return;
    for (let n = 0; n < 8 && this.scrollTimer.check(now); n++) {
      this.scrollTimer.reset(now);
      this.checkScroll();
    }
    // handle game mechanics (fast forward is faster than the display)
    for (let n = 0; n < 8 && this.frameTimer.check(now); n++) {
      this.frameTimer.reset(now);
      this.game.update();
      if (this.closing || this.game.isFinished || !this.game.playing) break;
    }
  }

  private checkScroll(): void {
    if (!this.host.hasFocus()) return;
    const sca = this.displayScale;
    let scrollDist = 8;
    if (this.keyBoardPageScroll) scrollDist = 328;
    else if (this.keyBoardScroll && this.lastShiftState.ctrl) scrollDist = 1;
    if (this.gameScroll === GameScroll.Right) {
      this.offsetHorz = Math.max(this.minScroll * sca, this.offsetHorz - sca * scrollDist);
      this.checkUpdateGameCursor();
    } else if (this.gameScroll === GameScroll.Left) {
      this.offsetHorz = Math.min(this.maxScroll * sca, this.offsetHorz + sca * scrollDist);
      this.checkUpdateGameCursor();
    }
  }

  /** when scrolling the cursor is updated as well */
  private checkUpdateGameCursor(): void {
    if (this.mouseScroll || this.keyBoardScroll) this.setAdjustedGameCursorPoint(this.controlToBitmap(this.mouseX, this.mouseY));
  }

  private dragMap(currX: number): void {
    const sca = this.displayScale;
    if (currX < this.draggingMapStartX) {
      this.offsetHorz = Math.max(this.minScroll * sca, this.offsetHorz - (this.draggingMapStartX - currX));
      this.draggingMapStartX = currX;
    } else if (currX > this.draggingMapStartX) {
      this.offsetHorz = Math.min(this.maxScroll * sca, this.offsetHorz + (currX - this.draggingMapStartX));
      this.draggingMapStartX = currX;
    }
  }

  // mouse handling of the game image

  imgMouseDown(x: number, y: number, button: number, rightDown: boolean, mods: Modifiers): void {
    const game = this.game;
    this.mouseX = x;
    this.mouseY = y;
    if (!game.playing || game.hyperSpeed) return;
    if (button === 0 && mods.alt && !mods.ctrl) {
      this.draggingMap = true;
      this.draggingMapStartX = x;
      return;
    }
    if (this.alwaysRegainControlOnMouseClick || mods.ctrl) game.regainControl();
    this.setAdjustedGameCursorPoint(this.controlToBitmap(x, y));
    // normal
    game.rightMouseButtonHeldDown = rightDown;
    if (button === 0) {
      const handleClick = (!game.isPaused || game.gameOptions.has(GameOption.SkillAssignmentsEnabledWhenPaused)) && !game.fastForward;
      if (handleClick) game.processSkillAssignment(!this.alwaysRegainControlOnMouseClick);
    }
  }

  imgMouseMove(x: number, y: number, rightDown: boolean): void {
    this.mouseX = x;
    this.mouseY = y;
    const game = this.game;
    if (!game.playing || game.hyperSpeed) return;
    game.rightMouseButtonHeldDown = rightDown;
    this.mouseScroll = false;
    if (this.draggingMap) {
      this.dragMap(x);
      return;
    }
    this.setAdjustedGameCursorPoint(this.controlToBitmap(x, y));
    if (game.isPaused) game.hitTest();
    if (x >= this.imgWidth - 1) {
      this.gameScroll = GameScroll.Right;
      this.mouseScroll = true;
    } else if (x <= 0) {
      this.gameScroll = GameScroll.Left;
      this.mouseScroll = true;
    } else this.gameScroll = GameScroll.None;
  }

  imgMouseUp(rightDown: boolean): void {
    if (this.draggingMap) this.draggingMap = false;
    this.mouseScroll = false;
    this.game.rightMouseButtonHeldDown = rightDown;
  }

  // skill panel

  toolBarMouseEnter(): void {
    if (!this.keyBoardScroll && this.mouseScroll) {
      this.gameScroll = GameScroll.None;
      this.mouseScroll = false;
    }
  }

  /** the toolbar shares the mouse position (for scrolling with the keyboard while the mouse is on the toolbar) */
  toolBarMouseMove(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  /** ToolBar_MinimapClick: here we scroll the game image */
  private toolBarMinimapClick(px: number): void {
    const sca = this.displayScale;
    let o = -px * sca + Math.trunc(this.imgWidth / 2);
    if (o < this.minScroll * sca) o = this.minScroll * sca;
    if (o > this.maxScroll * sca) o = this.maxScroll * sca;
    this.offsetHorz = o;
  }

  private toolBarMouseDown(button: SkillPanelButton, isDoubleClick: boolean): void {
    const game = this.game;
    if (game.hyperSpeed || game.fastForward) return;
    let exec = game.gameOptions.has(GameOption.SkillButtonsEnabledWhenPaused) ? true : !game.isPaused || button === SkillPanelButton.Pause;
    // nuke requires doubleclick
    if (exec && button === SkillPanelButton.Nuke) exec = isDoubleClick;
    if (!exec) return;
    if (button !== SkillPanelButton.Pause) game.regainControl();
    switch (button) {
      case SkillPanelButton.Slower:
        game.btnSlower(false);
        break;
      case SkillPanelButton.Faster:
        game.btnFaster(false);
        break;
      case SkillPanelButton.Climber:
        game.btnClimber();
        break;
      case SkillPanelButton.Umbrella:
        game.btnUmbrella();
        break;
      case SkillPanelButton.Explode:
        game.btnExplode();
        break;
      case SkillPanelButton.Blocker:
        game.btnBlocker();
        break;
      case SkillPanelButton.Builder:
        game.btnBuilder();
        break;
      case SkillPanelButton.Basher:
        game.btnBasher();
        break;
      case SkillPanelButton.Miner:
        game.btnMiner();
        break;
      case SkillPanelButton.Digger:
        game.btnDigger();
        break;
      case SkillPanelButton.Pause:
        game.btnTogglePause();
        break;
      case SkillPanelButton.Nuke:
        game.btnNuke();
        break;
    }
  }

  // keyboard

  /** Form_KeyDown. Returns true when the key is handled (then there is no key press). */
  keyDown(key: string, mods: Modifiers, now: number): boolean {
    const game = this.game;
    this.lastShiftState = mods;
    this.keyIsDown++;

    if (key === 'Escape') game.finish(); // OnFinish eventhandler does the rest

    if (!game.playing || game.hyperSpeed) return false;

    // no gamecontrol if going fast
    if (key !== 'F11' && key !== 'Pause' && game.fastForward) return false;

    if (mods.ctrl) {
      switch (key) {
        case 'F1':
          if (game.isPaused) game.btnSlower(true);
          return true;
        case 'F2':
          if (game.isPaused) game.btnFaster(true);
          return true;
        case 'ArrowLeft':
          this.keyBoardScroll = true;
          this.gameScroll = GameScroll.Left;
          return true;
        case 'ArrowRight':
          this.keyBoardScroll = true;
          this.gameScroll = GameScroll.Right;
          return true;
      }
      return false;
    }
    if (mods.shift || mods.alt) return false;

    // game buttons
    if (key === 'Pause' || /^F([1-9]|1[0-2])$/.test(key)) {
      if (key !== 'F11' && key !== 'Pause') game.regainControl();
      switch (key) {
        case 'Pause':
          if (this.keyIsDown < 2) game.btnTogglePause(PauseCommandMode.PauseKey);
          break;
        case 'F1':
          game.btnSlower(false);
          break;
        case 'F2':
          game.btnFaster(false);
          break;
        case 'F3':
          game.btnClimber();
          break;
        case 'F4':
          game.btnUmbrella();
          break;
        case 'F5':
          game.btnExplode();
          break;
        case 'F6':
          game.btnBlocker();
          break;
        case 'F7':
          game.btnBuilder();
          break;
        case 'F8':
          game.btnBasher();
          break;
        case 'F9':
          game.btnMiner();
          break;
        case 'F10':
          game.btnDigger();
          break;
        case 'F11':
          if (this.keyIsDown < 2) game.btnTogglePause(PauseCommandMode.F11);
          break;
        case 'F12':
          if (this.keyIsDown < 2) this.checkNuke(now);
          break;
      }
      return true;
    }
    switch (key) {
      case 'Enter':
        this.saveStateIteration = game.currentIteration;
        return true;
      case 'Backspace':
        if (this.saveStateIteration >= 0) game.gotoIteration(this.saveStateIteration);
        return true;
      case 'ArrowLeft':
        this.keyBoardScroll = true;
        this.gameScroll = GameScroll.Left;
        return true;
      case 'ArrowRight':
        this.keyBoardScroll = true;
        this.gameScroll = GameScroll.Right;
        return true;
    }
    return false;
  }

  /** double keypress needed to prevent accidently nuking */
  private checkNuke(now: number): void {
    if (this.game.isNukedByUser) return;
    if (now - this.lastNukeKeyTick < INTERVAL_NUKE_KEY) this.game.btnNuke();
    else this.lastNukeKeyTick = now;
  }

  keyUp(key: string, mods: Modifiers): void {
    this.lastShiftState = mods;
    this.keyIsDown = 0;
    if (!this.game.playing) return;
    this.keyBoardScroll = false;
    switch (key) {
      case 'F1':
      case 'F2':
        this.game.btnStopChangingReleaseRate();
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        this.gameScroll = GameScroll.None;
        break;
    }
  }

  /** the application lost the focus */
  deactivate(): void {
    this.lastShiftState = { shift: false, ctrl: false, alt: false };
    this.keyIsDown = 0;
    this.gameScroll = GameScroll.None;
  }

  keyPress(ch: string): void {
    const game = this.game;
    if (game.hyperSpeed || !game.playing) return;
    switch (ch) {
      case '1': // skip one second
        game.gotoIteration(game.currentIteration + SECOND);
        break;
      case '!': // rewind one second
        game.gotoIteration(game.currentIteration - SECOND);
        break;
      case '5': // cheat (never in a run)
        if (this.app.config.gameOptions.has(GameOption.CheatKeyToSolveLevel) && !this.app.inRun) game.cheat();
        break;
      case '+':
      case '=':
        game.changeMusicVolume(true);
        break;
      case '-':
      case '_':
        game.changeMusicVolume(false);
        break;
      case '?':
        void this.otherScreen(() => this.host.showText('Game Screen', HELP_TEXT));
        break;
      case ' ': // skip or rewind 10 seconds
        if (!this.lastShiftState.shift) game.gotoIteration(game.currentIteration + SECOND * 10);
        else game.gotoIteration(game.currentIteration - SECOND * 10);
        break;
      case 'b': // rewind one frame
        if (game.isPaused) game.gotoIteration(game.currentIteration - 1);
        break;
      case 'f': // toggle fastforward
        if (!game.isPaused) {
          game.fastForward = !game.fastForward;
          if (game.fastForward) this.frameTimer.interval = INTERVAL_FRAME_FASTFORWARD;
          else this.frameTimer.interval = game.level.info.superLemming ? INTERVAL_FRAME_SUPERLEMMING : INTERVAL_FRAME;
        }
        break;
      case 'i': // show replay information
        void this.otherScreen(() => this.host.showText(...this.mechanicsText()));
        break;
      case 'l':
      case 'L': // load replay file
        void this.selectReplayFile();
        break;
      case 'm': // enable/disable music
        game.setSoundOpts(toggled(game.soundOpts, SoundOption.Music));
        break;
      case 'n': // do next frame if paused
        if (game.isPaused) game.gotoIteration(game.currentIteration + 1);
        break;
      case 'p':
        this.saveCurrentFrameToPng();
        break;
      case 'r': // start replay
        if (this.keyIsDown < 2) this.startReplay();
        break;
      case 'R': // start without replay
        this.startNoReplay();
        break;
      case 's': // enable/disable sounds
        game.setSoundOpts(toggled(game.soundOpts, SoundOption.Sound));
        break;
      case 'u': // save replay
        if (this.keyIsDown < 2) this.save();
        break;
      case 'v':
      case 'V': // voice
        if (this.keyIsDown < 2) toggleVoice(this.app);
        break;
      case 'z': // run until the end
        if (this.keyIsDown < 2) game.gotoIteration(game.currentIteration + MINUTE * 10); // let it overflow
        break;
      case 'D': // rewind one minute
        game.gotoIteration(game.currentIteration - MINUTE);
        break;
      case 'F': // skip one minute
        game.gotoIteration(game.currentIteration + MINUTE);
        break;
    }
  }

  // replays

  private startReplay(): void {
    this.playLock++;
    try {
      this.game.setGameResult();
      this.game.start(true);
    } finally {
      this.playLock--;
    }
  }

  private startNoReplay(): void {
    this.playLock++;
    try {
      this.game.setGameResult();
      this.game.start(false);
    } finally {
      this.playLock--;
    }
  }

  private startReplayFromFile(name: string, bytes: Uint8Array): void {
    this.playLock++;
    try {
      speak(VoiceOption.StartReplay, true);
      const error = this.game.recorder.loadFromBytes(bytes);
      if (!error) {
        this.lastReplayFileName = name;
        this.game.start(true);
      } else void this.otherScreen(() => this.host.showMessage(error));
    } finally {
      this.playLock--;
    }
  }

  private async selectReplayFile(): Promise<void> {
    this.playLock++;
    try {
      const f = await this.host.selectReplayFile();
      if (f) this.startReplayFromFile(f.name, f.bytes);
    } finally {
      this.playLock--;
    }
  }

  /** TLemmingGame.Save(False): the replay file (.lrb) is downloaded. */
  private save(): void {
    saveGame(this.game, false, true, this.host.download);
  }

  private saveCurrentFrameToPng(): void {
    const bmp = this.game.targetBitmap;
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(bmp.width, bmp.height);
    const px = new Uint32Array(img.data.buffer);
    for (let i = 0; i < px.length; i++) {
      const c = bmp.bits[i];
      px[i] = (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >>> 16) & 0xff)) >>> 0;
    }
    ctx.putImageData(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        this.game.addFeedbackMessage(GameTexts.SGame_FeedbackMessage_ScreenshotFail);
        return;
      }
      void blob.arrayBuffer().then((b) => this.host.download(stripInvalidFileChars(this.game.levelLoadingInfo.getLevelTitle()) + '.png', new Uint8Array(b), 'image/png'));
    }, 'image/png');
    this.game.addFeedbackMessage(GameTexts.SGame_FeedbackMessage_Screenshot);
  }

  private mechanicsText(): [string, string] {
    const game = this.game;
    if (!game.replaying || !(game.recorder.wasLoaded || game.recorder.wasSaved))
      return ['Game Screen Mechanics', game.recorder.mechanicsText(game.mechanics)];
    const header = game.recorder.currentHeader;
    return ['Game Screen Replay Mechanics', game.recorder.mechanicsText(header.mechanics) + '\n\nReplay Version ' + header.version];
  }

  /** OtherScreenBegin / OtherScreenEnd: the game does not run while another screen is shown. */
  private async otherScreen(show: () => Promise<void>): Promise<void> {
    this.playLock++;
    try {
      await show();
    } finally {
      this.playLock--;
    }
  }

  /** after a fatal error: the game does not run anymore */
  stop(): void {
    this.playLock = 1;
    this.closing = true;
  }

  /** CloseScreen + BeforeCloseScreen */
  closeScreen(next: ScreenType): void {
    if (this.closing) return;
    this.closing = true;
    this.playLock = 1;
    this.game.setGameResult();
    this.app.gameResult = { ...this.game.gameResultRec };
    // LemmixRL: the attempt of a blind is over
    const run = this.app.inRun ? this.app.run : null;
    if (run && next === ScreenType.Postview && run.state.phase === 'playing') {
      run.finishAttempt(this.game);
      saveRun(run.state);
    }
    this.close(next);
  }
}

/**
 * TLemmingGame.InternalSave (not auto): the replay is saved (downloaded) as <level title>.lrb. NB: saving changes the
 * recorder (SaveToStream deletes a trailing StartPause record), and the file is written even when saving raises.
 */
export function saveGame(game: LemmingGame, includeGameResult: boolean, displayGameMessage: boolean, download: PlayerHost['download']): void {
  let levelName = stripInvalidFileChars(game.levelLoadingInfo.getLevelTitle());
  if (!levelName) levelName = 'noname';
  const s = new ByteStream();
  try {
    game.saveReplay(s);
  } finally {
    download(levelName + '.lrb', s.bytes.slice(), 'application/octet-stream');
  }
  void includeGameResult; // the .txt file with the game result is not written in the browser
  speak(VoiceOption.GameSaved, false);
  if (!game.isFinished && game.playing && displayGameMessage) game.addFeedbackMessage(GameTexts.SGame_FeedbackMessage_GameSaved);
}

function toggled<T>(set: ReadonlySet<T>, v: T): Set<T> {
  const r = new Set(set);
  if (r.has(v)) r.delete(v);
  else r.add(v);
  return r;
}

/** App.ToggleVoiceEnabled */
export function toggleVoice(app: LemmixApp): void {
  if (voice.enabled) speak(VoiceOption.VoiceDisable, false);
  voice.enabled = !voice.enabled;
  if (voice.enabled) app.config.miscOptions.add(MiscOption.Voice);
  else app.config.miscOptions.delete(MiscOption.Voice);
  app.config.save();
  if (voice.enabled) speak(VoiceOption.VoiceEnable, false);
}

const HELP_TEXT = [
  ['F1', 'Decrease release rate'],
  ['F2', 'Increase release rate'],
  ['F3', 'Select climber button'],
  ['F4', 'Select umbrella button'],
  ['F5', 'Select exploder button'],
  ['F6', 'Select blocker button'],
  ['F7', 'Select builder button'],
  ['F8', 'Select basher button'],
  ['F9', 'Select miner button'],
  ['F10', 'Select digger button'],
  ['F11', 'Pause or unpause'],
  ['F12', 'Nuke (press twice)'],
  ['Ctrl+F1', 'Set minimum release rate (paused)'],
  ['Ctrl+F2', 'Set maximum release rate (paused)'],
  ['Pause', 'Pause or unpause'],
  ['Escape', 'Finish game'],
  ['Enter', 'Save state'],
  ['Backspace', 'Go to saved state'],
  ['1', 'Skip one second'],
  ['!', 'Rewind one second'],
  ['Space', 'Skip ten seconds'],
  ['Shift+Space', 'Rewind ten seconds'],
  ['F', 'Skip one minute'],
  ['D', 'Rewind one minute'],
  ['n', 'Skip one frame (paused)'],
  ['b', 'Rewind one frame (paused)'],
  ['z', 'Skip to the end of the game'],
  ['s', 'Toggle sounds on/off'],
  ['m', 'Toggle music on/off'],
  ['v', 'Toggle voice on/off'],
  ['f', 'Toggle game speed'],
  ['+ =', 'Increase music volume'],
  ['- _', 'Decrease music volume'],
  ['p', 'Save current frame to png'],
  ['r', 'Replay game'],
  ['R', 'Restart game without replay'],
  ['u', 'Save game (replay file)'],
  ['l', 'Load replay file'],
  ['i', 'Show mechanics'],
  ['Alt+drag', 'Drag the map'],
  ['Ctrl+click', 'Regain control in a replay'],
]
  .map(([k, d]) => k.padEnd(14) + d)
  .join('\n');
