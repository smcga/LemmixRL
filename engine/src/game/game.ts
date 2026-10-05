/**
 * Port of Game.pas: TLemming, TInteractiveObjectInfo and TLemmingGame.
 *
 * This is a behaviour-preserving port. Method names, the order of operations and all the quirks of the
 * original (including the emulated DOS bugs and the Lemmix bugs that influence the simulation) are kept.
 * Comments starting with "ORIGINAL:" quote or explain the Delphi code where the behaviour is subtle.
 *
 * Rendering into the target bitmap is ported as well (it is part of the game loop in the original),
 * while everything that is pure UI (toolbar, sound, messages layer, voice) goes through small interfaces.
 */
import type { ByteStream } from '../base/stream.ts';
import { EngineError, ensureRange, restrict } from '../base/utils.ts';
import type { DataProvider } from '../data/datasource.ts';
import { DataType } from '../data/datasource.ts';
import {
  ACTION_BIT_BASHING,
  ACTION_BIT_BLOCKING,
  ACTION_BIT_BUILDING,
  ACTION_BIT_DIGGING,
  ACTION_BIT_DROWNING,
  ACTION_BIT_EXPLODING,
  ACTION_BIT_FALLING,
  ACTION_BIT_FLOATING,
  ACTION_BIT_MINING,
  ACTION_BIT_OHNOING,
  ACTION_BIT_SHRUGGING,
  ACTION_BIT_SPLATTING,
  ACTION_BIT_VAPORIZING,
  ACTION_BIT_WALKING,
  ActionToSkillPanelButton,
  AssignableSkills,
  DOS_MINIMAP_HEIGHT,
  DOS_MINIMAP_WIDTH,
  DOS_OBJECT_ID_ENTRANCE,
  GAME_BMPHEIGHT,
  GAME_BMPWIDTH,
  hasMechanic,
  LemmingAction,
  Mechanic,
  type Mechanics,
  SkillPanelButton,
  SkillPanelButtonToAction,
  SoundEffect,
} from '../dos/consts.ts';
import { Bitmap32, DrawMode, inflateRect, intersectRectEx, rect, rectsIntersect, type PixelCombine, type Rect } from '../gr32/bitmap32.ts';
import { readBmp } from '../gr32/bmp.ts';
import {
  blendMem,
  clBlack32,
  clBlue32,
  clCornFlowerBlue32,
  clFuchsia32,
  clGreen32,
  clLightGray32,
  clLime32,
  clOrange32,
  clOrangeRed32,
  clRed32,
  clTrWhite32,
  clYellow32,
  color32,
  type TColor32,
} from '../gr32/color.ts';
import type { InteractiveObject, Level } from '../level/base.ts';
import { odf_OnlyOnTerrain } from '../level/base.ts';
import {
  LemmingAnimationType,
  type MetaLemmingAnimation,
  type MetaObject,
  oat_Continuous,
  ose_BearTrap,
  ose_ElectroTrap,
  ose_RopeTrap,
  ose_SpinningTrap,
  ose_SquishingTrap,
  ose_TenTonTrap,
  ote_TriggeredTrap,
} from '../meta/structures.ts';
import { animationIndex, type GraphicSet, type LevelLoadingInformation, type Style } from '../styles/base.ts';
import {
  raf_EndPause,
  raf_Nuke,
  raf_Pausing,
  raf_SkillAssignment,
  raf_SkillSelection,
  raf_StartDecreaseRR,
  raf_StartIncreaseRR,
  raf_StartPause,
  raf_StopChangingRR,
  Recorder,
  type ReplayItem,
  rf_RightMouseGlitch,
  rf_UseLemming2,
  rsb_Basher,
  rsb_Builder,
  rsb_Climber,
  rsb_Digger,
  rsb_Explode,
  rsb_Miner,
  rsb_Stopper,
  rsb_Umbrella,
} from './recorder.ts';
import { ALPHA_TERRAIN, type Renderer } from './rendering.ts';

/* ================================================================================================
   constants
================================================================================================ */

export const COMBINE_FLAG_CLIMBER = 1 << 0;
export const COMBINE_FLAG_FLOATER = 1 << 1;
export const COMBINE_FLAG_BUILDER = 1 << 2;

export const ParticleColorIndices = [4, 15, 14, 13, 12, 11, 10, 9, 8, 11, 10, 9, 8, 7, 6, 2];

const OBJMAPOFFSET = 16;
const OBJMAPADD = OBJMAPOFFSET >> 2;

export const MAX_FALLDISTANCE = 60;

// values for the (4 pixel resolution) Dos Object Map (for triggereffects)
export const DOM_NONE = 128 + 0;
export const DOM_EXIT = 128 + 1;
export const DOM_FORCELEFT = 128 + 2; // left arm of blocker
export const DOM_FORCERIGHT = 128 + 3; // right arm of blocker
export const DOM_WATER = 128 + 5; // causes drowning
export const DOM_FIRE = 128 + 6; // causes vaporizing
export const DOM_ONEWAYLEFT = 128 + 7;
export const DOM_ONEWAYRIGHT = 128 + 8;
export const DOM_STEEL = 128 + 9;
export const DOM_BLOCKER = 128 + 10; // the middle part of blocker

export const HEAD_MIN_Y = -5;
export const LEMMING_MIN_X = 0;
export const LEMMING_MAX_X = 1647;
export const LEMMING_MAX_Y = 163;

export const PARTICLE_FRAMECOUNT = 52;

export const GAME_CURSOR_DEFAULT = 1;
export const GAME_CURSOR_LEMMING = 2;
export const GAME_CURSOR_DRAG = 3;

/**
 * So what is this: A table which describes what to do when floating.
 * The floaters animation has 8 frames: 0..3 is opening the umbrella and 4..7 is the actual floating.
 * This table "fakes" 16 frames of floating and what should happen with the Y-position of the lemming
 * each frame. Frame zero is missing, because that is automatically frame zero.
 * Additionally: after 15 go back to 8
 */
export const FloatParametersTable: readonly { dy: number; animationFrameIndex: number }[] = [
  { dy: 3, animationFrameIndex: 1 },
  { dy: 3, animationFrameIndex: 2 },
  { dy: 3, animationFrameIndex: 3 },
  { dy: 3, animationFrameIndex: 5 },
  { dy: -1, animationFrameIndex: 5 },
  { dy: 0, animationFrameIndex: 5 },
  { dy: 1, animationFrameIndex: 5 },
  { dy: 1, animationFrameIndex: 5 },
  { dy: 2, animationFrameIndex: 5 },
  { dy: 2, animationFrameIndex: 6 },
  { dy: 2, animationFrameIndex: 7 },
  { dy: 2, animationFrameIndex: 7 },
  { dy: 2, animationFrameIndex: 6 },
  { dy: 2, animationFrameIndex: 5 },
  { dy: 2, animationFrameIndex: 4 },
  { dy: 2, animationFrameIndex: 4 },
];

/** TGameOption (Base.Types), ordinal order preserved. */
export enum GameOption {
  AlwaysRegainControlOnMouseClick,
  CheatKeyToSolveLevel,
  ColorizeLemmings,
  FullCPU,
  GradientBridges,
  HighResolutionGameMessages,
  HighlightedPauseButton,
  ShowFeedbackMessages,
  ShowParticles,
  ShowPhotoFlashReplayEffect,
  ShowReplayCursor,
  ShowReplayMessages,
  ShowReplayTextInToolBar,
  SkillAssignmentsEnabledWhenPaused,
  SkillButtonsEnabledWhenPaused,
}

export const DEFAULT_GAME_OPTIONS: ReadonlySet<GameOption> = new Set([
  GameOption.AlwaysRegainControlOnMouseClick,
  GameOption.GradientBridges,
  GameOption.HighResolutionGameMessages,
  GameOption.ShowFeedbackMessages,
  GameOption.ShowParticles,
  GameOption.ShowReplayCursor,
  GameOption.ShowReplayMessages,
  GameOption.ShowReplayTextInToolBar,
  GameOption.SkillButtonsEnabledWhenPaused,
]);

/** TMiscOption (Base.Types), ordinal order preserved. */
export enum MiscOption {
  AdjustLogoInMenuScreen,
  AlwaysOverwriteReplayFiles,
  AutoSaveReplayFiles,
  CheatCodesInLevelCodeScreen,
  CheatScrollingInPreviewScreen,
  FullCPU,
  KeepLevelRatioInPreviewScreen,
  LemmingsPercentages,
  MessageAfterSaveInResultScreen,
  RepairCustomLevelErrors,
  ShuffledMusic,
  UpdateReplayCacheWhenSaving,
  Voice,
}

export const DEFAULT_MISC_OPTIONS: ReadonlySet<MiscOption> = new Set([
  MiscOption.AdjustLogoInMenuScreen,
  MiscOption.AlwaysOverwriteReplayFiles,
  MiscOption.LemmingsPercentages,
  MiscOption.MessageAfterSaveInResultScreen,
  MiscOption.RepairCustomLevelErrors,
  MiscOption.UpdateReplayCacheWhenSaving,
  MiscOption.Voice,
]);

/** TOptionalMechanic (Base.Types): optional mechanics, inserted into the mechanics if set. */
export enum OptionalMechanic {
  NukeGlitch,
  PauseGlitch,
  RighClickGlitch,
}

export enum SoundOption {
  Sound,
  Music,
}

export enum ReleaseRateStatus {
  None,
  SlowingDown,
  SpeedingUp,
}

export enum PauseCommandMode {
  None,
  F11,
  PauseKey,
}

export interface GameResultsRec {
  lemmingCount: number;
  toRescue: number;
  rescued: number;
  target: number; // percentage
  done: number; // percentage
  success: boolean;
  cheated: boolean;
  timeIsUp: boolean;
}

function emptyGameResult(): GameResultsRec {
  return { lemmingCount: 0, toRescue: 0, rescued: 0, target: 0, done: 0, success: false, cheated: false, timeIsUp: false };
}

/* ================================================================================================
   UI interfaces (replacing the VCL / Graphics32 controls the game talks to)
================================================================================================ */

/** The calls TLemmingGame makes on TSkillPanelToolbar. */
export interface GameToolbar {
  drawSkillCount(button: SkillPanelButton, num: number): void;
  drawButtonSelector(button: SkillPanelButton, highlight: boolean): void;
  switchButtonSelector(oldButton: SkillPanelButton, newButton: SkillPanelButton): void;
  drawMinimap(map: Bitmap32): void;
  setInfoAlternative(info: string): void;
  setInfoCursorLemming(lem: string, num: number): void;
  setInfoLemmingsOut(num: number): void;
  setInfoLemmingsSaved(num: number, max: number, showCount: boolean): void;
  setInfoMinutes(num: number): void;
  setInfoSeconds(num: number): void;
  setPauseHighlight(highlight: boolean): void;
  refreshInfo(): void;
  beginUpdateImg(): void;
  endUpdateImg(): void;
  getUpdateCount(): number;
}

export class NullToolbar implements GameToolbar {
  private updateCount = 0;
  drawSkillCount(): void {}
  drawButtonSelector(): void {}
  switchButtonSelector(): void {}
  drawMinimap(): void {}
  setInfoAlternative(): void {}
  setInfoCursorLemming(): void {}
  setInfoLemmingsOut(): void {}
  setInfoLemmingsSaved(): void {}
  setInfoMinutes(): void {}
  setInfoSeconds(): void {}
  setPauseHighlight(): void {}
  refreshInfo(): void {}
  beginUpdateImg(): void {
    this.updateCount++;
  }
  endUpdateImg(): void {
    this.updateCount--;
  }
  getUpdateCount(): number {
    return this.updateCount;
  }
}

/** TSoundMgr as used by the game. Sound ids are indices handed out by the sound manager (or -1). */
export interface GameSoundManager {
  playSound(id: number): void;
  playMusic(index: number): void;
  stopMusic(index: number): void;
  clearMusics(): void;
  musicIsPlaying(index: number): boolean;
  getMusicVolume(index: number): number;
  setMusicVolume(index: number, volume: number): void;
  addMusic(fileName: string): number;
}

export class NullSoundManager implements GameSoundManager {
  playSound(): void {}
  playMusic(): void {}
  stopMusic(): void {}
  clearMusics(): void {}
  musicIsPlaying(): boolean {
    return false;
  }
  getMusicVolume(): number {
    return 0;
  }
  setMusicVolume(): void {}
  addMusic(): number {
    return -1;
  }
}

/** SoundData.SFX_xxx: sound manager ids, -1 when the sound is not available. */
export interface SoundIds {
  SFX_BUILDER_WARNING: number;
  SFX_ASSIGN_SKILL: number;
  SFX_YIPPEE: number;
  SFX_SPLAT: number;
  SFX_LETSGO: number;
  SFX_ENTRANCE: number;
  SFX_VAPORIZING: number;
  SFX_DROWNING: number;
  SFX_EXPLOSION: number;
  SFX_HITS_STEEL: number;
  SFX_OHNO: number;
  SFX_SKILLBUTTON: number;
  SFX_ROPETRAP: number;
  SFX_TENTON: number;
  SFX_BEARTRAP: number;
  SFX_ELECTROTRAP: number;
  SFX_SPINNINGTRAP: number;
  SFX_SQUISHINGTRAP: number;
  SFX_MINER: number;
  SFX_DIGGER: number;
  SFX_BASHER: number;
  SFX_OPENUMBRELLA: number;
  SFX_SILENTDEATH: number;
  SFX_NUKE: number;
}

/**
 * The default sound ids: the DOS sounds are identified by their TSoundEffect ordinal, the "custom"
 * sounds (miner, digger, basher, umbrella, silent death, nuke) do not exist in the default sound set.
 */
export const DEFAULT_SOUND_IDS: SoundIds = {
  SFX_BUILDER_WARNING: SoundEffect.BuilderWarning,
  SFX_ASSIGN_SKILL: SoundEffect.AssignSkill,
  SFX_YIPPEE: SoundEffect.Yippee,
  SFX_SPLAT: SoundEffect.Splat,
  SFX_LETSGO: SoundEffect.LetsGo,
  SFX_ENTRANCE: SoundEffect.EntranceOpening,
  SFX_VAPORIZING: SoundEffect.Vaporizing,
  SFX_DROWNING: SoundEffect.Drowning,
  SFX_EXPLOSION: SoundEffect.Explosion,
  SFX_HITS_STEEL: SoundEffect.HitsSteel,
  SFX_OHNO: SoundEffect.Ohno,
  SFX_SKILLBUTTON: SoundEffect.SkillButtonSelect,
  SFX_ROPETRAP: SoundEffect.RopeTrap,
  SFX_TENTON: SoundEffect.TenTonTrap,
  SFX_BEARTRAP: SoundEffect.BearTrap,
  SFX_ELECTROTRAP: SoundEffect.ElectroTrap,
  SFX_SPINNINGTRAP: SoundEffect.SpinningTrap,
  SFX_SQUISHINGTRAP: SoundEffect.SquishingTrap,
  SFX_MINER: -1,
  SFX_DIGGER: -1,
  SFX_BASHER: -1,
  SFX_OPENUMBRELLA: -1,
  SFX_SILENTDEATH: -1,
  SFX_NUKE: -1,
};

/** The parts of the game screen (TImage32 and friends) the game uses. All optional. */
export interface GameView {
  /** TImage32.BitmapToControl */
  bitmapToControl(x: number, y: number): { x: number; y: number };
  /** Renders a text into a bitmap with Arial 12 (non anti aliased); used for low resolution messages. */
  renderLowResText?(text: string, color: TColor32): Bitmap32;
  /** Prog.Voice.Speak */
  speak?(what: 'ReplayFail' | 'GameSaved' | 'StartReplay', force: boolean): void;
}

/* ================================================================================================
   TLemming, TInteractiveObjectInfo
================================================================================================ */

export class Lemming {
  pixelCombine: PixelCombine | null = null; // effects
  readonly savedMap = new Uint8Array(9); // saves part of the object map when blocking
  rectToErase: Rect = rect(0, 0, 0, 0); // the rectangle of the last draw action
  listIndex = 0; // index in the lemming list
  xPos = 0; // the "main" foot x position
  yPos = 0; // the "main" foot y position
  xDelta = 0; // x speed (1 if left to right, -1 if right to left)
  fallen = 0; // number of pixels a faller has fallen
  explosionTimer = 0; // 79 downto 0
  lma: MetaLemmingAnimation = null as unknown as MetaLemmingAnimation; // ref to Lemming Meta Animation (nil until the first transition)
  lab: Bitmap32 = null as unknown as Bitmap32; // ref to Lemming Animation Bitmap
  frame = 0; // current animationframe
  maxFrame = 0; // copy from LMA
  animationType = LemmingAnimationType.Loop; // copy from LMA
  particleTimer = 0; // @particles, 52 downto 0, after explosion
  particleFrame = 0; // the "frame" of the particle drawing algorithm
  frameTopDy = 0; // = -LMA.FootY (ccexplore code compatible)
  frameLeftDx = 0; // = -LMA.FootX (ccexplore code compatible)
  floatParametersTableIndex = 0; // index for floaters
  numberOfBricksLeft = 0; // for builder
  born = 0; // game iteration the lemming was created
  action = LemmingAction.None; // current action of the lemming
  actionBits = 0; // in sync current action of the lemming
  objectBelow = 0; // Byte
  objectInFront = 0; // Byte
  endOfAnimation = false;
  isRemoved = false; // the lemming is not in the level anymore
  isClimber = false;
  isFloater = false;
  isBlocking = false; // not always exactly in sync with the action
  isNewDigger = false;
  isExploded = false; // @particles, set after a Lemming actually exploded
  photoFlashForReplay = false;
  combineFlags = 0; // Byte

  get rtl(): boolean {
    return this.xDelta < 0;
  }

  actionIn(flag: number): boolean {
    return (this.actionBits & flag) !== 0;
  }

  getCountDownDigitBounds(): Rect {
    const left = this.xPos - 1;
    const top = this.yPos + this.frameTopDy - 12;
    return { left, top, right: left + 8, bottom: top + 8 };
  }

  getFrameBounds(): Rect {
    const top = this.frame * this.lma.height;
    return { left: 0, top, right: this.lma.width, bottom: top + this.lma.height };
  }

  getLocationBounds(): Rect {
    const left = this.xPos - this.lma.footX;
    const top = this.yPos - this.lma.footY;
    return { left, top, right: left + this.lma.width, bottom: top + this.lma.height };
  }
}

export class InteractiveObjectInfo {
  metaObj!: MetaObject;
  obj!: InteractiveObject;
  currentFrame = 0;
  triggered = false;

  /** ORIGINAL: Right := Left + MetaObj.Height; Bottom := Top + MetaObj.Width (sic) */
  get bounds(): Rect {
    return { left: this.obj.left, top: this.obj.top, right: this.obj.left + this.metaObj.height, bottom: this.obj.top + this.metaObj.width };
  }

  get onlyOnTerrain(): boolean {
    return (odf_OnlyOnTerrain & this.obj.drawingFlags) !== 0;
  }
}

/* ================================================================================================
   messages (display only)
================================================================================================ */

export class LowResolutionMessage {
  buffer: Bitmap32 = new Bitmap32(1, 1);
  duration = 32;
  currentFrame = 0;
  location = { x: 0, y: 0 };
  deltaY = -2;
  deltaX = 0;
  text = '';
  ended = false;

  nextFrame(): void {
    this.currentFrame++;
    this.location.y += this.deltaY;
    this.location.x += this.deltaX;
    if (
      this.location.y + this.buffer.height <= 0 ||
      this.location.x >= GAME_BMPWIDTH ||
      this.location.x + this.buffer.width <= 0 ||
      this.currentFrame > this.duration
    )
      this.ended = true;
  }
}

/** Delphi Round (banker's rounding). */
function delphiRound(v: number): number {
  const f = Math.floor(v);
  const diff = v - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export class HighResolutionMessage {
  currentFrame = 0;
  ended = false;
  alpha = 255;
  readonly alphaDelta: number;

  constructor(
    public x: number,
    public y: number,
    readonly deltaX: number,
    readonly deltaY: number,
    readonly duration: number,
    readonly text: string,
    readonly color: TColor32,
  ) {
    this.alphaDelta = delphiRound(255 / duration);
  }

  nextFrame(): void {
    if (this.ended) return;
    this.currentFrame++;
    this.x += this.deltaX;
    this.y += this.deltaY;
    if (this.alpha > 0) {
      this.alpha -= this.alphaDelta;
      if (this.alpha < 0) this.alpha = 0;
    }
    if (this.currentFrame > this.duration) this.ended = true;
  }
}

export class HighResolutionLayer {
  readonly messageList: HighResolutionMessage[] = [];
  visible = true;

  addMessage(x: number, y: number, deltaX: number, deltaY: number, duration: number, text: string, color: TColor32): void {
    this.messageList.push(new HighResolutionMessage(x, y, deltaX, deltaY, duration, text, color));
  }

  updateMessages(): void {
    if (this.messageList.length === 0) return;
    for (let i = this.messageList.length - 1; i >= 0; i--) if (this.messageList[i].ended) this.messageList.splice(i, 1);
    for (const msg of this.messageList) msg.nextFrame();
    if (this.visible && this.messageList.length === 0) this.visible = false;
    else if (!this.visible && this.messageList.length > 0) this.visible = true;
  }
}

export class ReplayCursor {
  bitmap: Bitmap32 | null = null;
  position = { x: 0, y: 0 };
  cursorPos = { x: 0, y: 0 };
  drawRect: Rect = rect(0, 0, 0, 0);
  previousDrawRect: Rect = rect(0, 0, 0, 0);
  visible = false;
  erasable = false;
  frames = 0;
  alpha = 0; // Byte

  reset(): void {
    this.position = { x: 0, y: 0 };
    this.cursorPos = { x: 0, y: 0 };
    this.drawRect = rect(0, 0, 0, 0);
    this.previousDrawRect = this.drawRect;
    this.visible = false;
    this.erasable = false;
    this.frames = 0;
    this.alpha = 0;
  }

  activate(x: number, y: number): void {
    this.previousDrawRect = this.erasable ? this.drawRect : rect(0, 0, 0, 0);
    // convert the normal hotspot to the hotspot the game uses (4,9 instead of 7,7)
    this.cursorPos = { x, y };
    this.position = { x: x - 7 + 3, y: y - 7 - 2 };
    const w = this.bitmap?.width ?? 0;
    const h = this.bitmap?.height ?? 0;
    this.drawRect = { left: this.position.x, top: this.position.y, right: this.position.x + w, bottom: this.position.y + h };
    this.alpha = 132;
    if (this.bitmap) this.bitmap.masterAlpha = this.alpha;
    this.frames = 10;
    this.visible = true;
    this.erasable = true;
  }

  decrement(): void {
    if (this.frames >= 0) {
      this.frames--;
      this.visible = this.frames >= 0;
      this.erasable = this.frames >= -1;
      this.alpha = (this.alpha - 12) & 0xff;
      if (this.bitmap) this.bitmap.masterAlpha = this.alpha;
    }
  }
}

function rectIsEmpty(r: Rect): boolean {
  // TRect.IsEmpty
  return r.right <= r.left || r.bottom <= r.top;
}

/* ================================================================================================
   TLemmingGame
================================================================================================ */

export interface GameInfo {
  style: Style;
  data: DataProvider;
  renderer: Renderer;
  level: Level;
  levelLoadingInfo: LevelLoadingInformation;
  graphicSet: GraphicSet;
  targetBitmap: Bitmap32;
  toolbar?: GameToolbar;
  soundMgr?: GameSoundManager;
  soundIds?: SoundIds;
  view?: GameView;
  displayScale?: number;
  soundOptions?: ReadonlySet<SoundOption>;
  gameOptions?: ReadonlySet<GameOption>;
  miscOptions?: ReadonlySet<MiscOption>;
  optionalMechanics?: ReadonlySet<OptionalMechanic>;
}

export const FilenameCursorHighlight = 'CursorHighlight.bmp';

/** The texts of Base.Strings (TGlobalTexts, English) that the game uses. */
export const GameTexts = {
  SAthlete: 'Athlete',
  SClimber: 'Climber',
  SFloater: 'Floater',
  SGame_ToolBar_Replaying: 'replaying',
  SGame_ToolBar_Replayed: 'replayed',
  SGame_FeedbackMessage_GameSaved: 'Game saved',
  SGame_FeedbackMessage_ScreenshotFail: 'Screenshot fail',
  SGame_FeedbackMessage_Screenshot: 'Screenshot',
  /** indexed by LemmingAction (SNone, SWalker, ..., SVaporizer = 'Frier', SExploder = 'Bomber') */
  LemmingActionStrings: [
    '', 'Walker', 'Jumper', 'Digger', 'Climber', 'Drowner', 'Hoister', 'Builder', 'Basher', 'Miner', 'Faller',
    'Floater', 'Splatter', 'Exiter', 'Frier', 'Blocker', 'Shrugger', 'Ohnoer', 'Bomber',
  ],
  /** indexed by LemmingAction (SGame_ReplayMessage_None .. SGame_ReplayMessage_Explode) */
  LemmingReplayStrings: [
    '', 'Walk', 'Jump', 'Dig', 'Climb', 'Drown', 'Hoist', 'Build', 'Bash', 'Mine', 'Fall', 'Float', 'Splat', 'Exit',
    'Vaporize', 'Block', 'Shrug', 'Ohno', 'Explode',
  ],
};

type LemmingMethod = (l: Lemming) => boolean;
type SkillMethod = (l1: Lemming | null, l2: Lemming | null) => Lemming | null;

const ClimberColor = clGreen32;
const FloaterColor = clCornFlowerBlue32;
const AthleteColor = clOrangeRed32;

const MESSAGE_COLOR_COUNT = 8;
const fMessageColors: readonly TColor32[] = [clBlue32, clRed32, clYellow32, clGreen32, clFuchsia32, clLime32, clLightGray32, clOrange32];

export class LemmingGame {
  // these vars are "global" (class vars) in the original because the pixel combiners are static
  readonly brickPixelColors = new Uint32Array(12); // 12 gradient steps
  currentlyDrawnLemming: Lemming | null = null;
  brickPixelColor: TColor32 = 0;

  // misc
  private particles = new Int8Array(51 * 80 * 2); // TParticleTable
  private readonly lemmingMethods: (LemmingMethod | null)[] = [];
  private readonly skillMethods: (SkillMethod | null)[] = [];
  private readonly particleColors = new Uint32Array(16);
  gameResultRec: GameResultsRec = emptyGameResult();
  private readonly dosEntranceOrderTable = [0, 0, 0, 0];
  private bashMasks: [Bitmap32, Bitmap32] = [new Bitmap32(), new Bitmap32()]; // (not RTL, RTL)
  private mineMasks: [Bitmap32, Bitmap32] = [new Bitmap32(), new Bitmap32()];
  onFinish: (() => void) | null = null;
  /**
   * LemmixRL, not in the original: called for every lemming that comes out of an entrance, with its release index
   * (0 for the first lemming). The roguelike layer gives colony lemmings their permanent abilities here. When it is
   * not set the game is exactly the original.
   */
  onLemmingReleased: ((l: Lemming, releaseIndex: number) => void) | null = null;

  // owned objects
  readonly lemmingList: Lemming[] = [];
  readonly world = new Bitmap32(); // actual bitmap that is changed by the lemmings
  readonly miniMap = new Bitmap32();
  readonly minimapBuffer = new Bitmap32();
  private readonly objectMap = { width: 0, height: 0, bits: new Uint8Array(0) }; // dos compatible 4 pixel resolution map
  readonly recorder = new Recorder();
  readonly messageList: LowResolutionMessage[] = [];
  readonly replayCursor = new ReplayCursor();
  readonly highResolutionLayer = new HighResolutionLayer();
  private readonly soundsToPlay: number[] = [];
  readonly objectInfos: InteractiveObjectInfo[] = []; // list of objects excluding entrances
  readonly entrances: InteractiveObjectInfo[] = [];
  lastNonPrioritizedLemming: Lemming | null = null; // RightClickGlitch emulation

  // references
  private soundMgr: GameSoundManager = new NullSoundManager();
  private soundIds: SoundIds = DEFAULT_SOUND_IDS;
  private view: GameView | null = null;
  targetBitmap: Bitmap32 = new Bitmap32();
  private cntDownBmp!: Bitmap32;
  private explodeMaskBmp!: Bitmap32;
  renderer!: Renderer;
  toolbar: GameToolbar = new NullToolbar();
  level!: Level;
  levelLoadingInfo!: LevelLoadingInformation;
  private style!: Style;
  private graph!: GraphicSet;
  private data!: DataProvider;

  // 32 bits
  displayScale = 1;
  currentIteration = 0;
  clockFrame = 0; // 17 frames is one game-second
  glitchPauseIterations = 0; // pause glitch
  lemmingsReleased = 0; // number of lemmings that were created
  lemmingsOut = 0; // number of lemmings currently walking around
  lemmingsSaved = 0; // number of lemmings that made it to heaven
  lemmingsRemoved = 0; // number of lemmings removed
  cursorPoint = { x: 0, y: 0 };
  minutes = 0;
  seconds = 0;
  maxNumLemmings = 0;
  currReleaseRate = 0;
  currClimberCount = 0;
  currFloaterCount = 0;
  currBomberCount = 0;
  currBlockerCount = 0;
  currBuilderCount = 0;
  currBasherCount = 0;
  currMinerCount = 0;
  currDiggerCount = 0;
  isNukedByUser = false;
  indexOfLemmingToBeNuked = 0;
  currentCursor = 0; // normal or highlight lemming
  particleFinishTimer = 0; // extra frames to enable viewing of explosions
  musicIndex = -1;
  nextLemmingCountDown = 0;
  replayIndex = 0;
  lastCueSoundIteration = 0;
  messagesPlayedCount = 0;
  targetIteration = 0; // used in hyperspeed
  updateCallsSession = 0;
  updateCalls = 0;
  handleLemmingCalls = 0;
  replayMessageCounter = 0;

  // options
  gameOptions: ReadonlySet<GameOption> = DEFAULT_GAME_OPTIONS;
  mechanics: Mechanics = 0;
  miscOptions: ReadonlySet<MiscOption> = DEFAULT_MISC_OPTIONS;
  private fSoundOpts: Set<SoundOption> = new Set([SoundOption.Sound, SoundOption.Music]);
  selectedSkill = SkillPanelButton.None; // currently selected skill restricted by F3-F9
  releaseRateStatus = ReleaseRateStatus.None;

  // states
  rightMouseButtonHeldDown = false;
  playing = false; // game in active playing mode?
  entrancesOpened = false;
  isPaused = false;
  isPausedExt = false; // paused with pause key
  isFinished = false;
  isCheated = false;
  isExploderAssignInProgress = false;
  isLastRecordedRecordReached = false;
  hyperSpeed = false; // we are at hyperspeed no targetbitmap output
  targetBitmapsUpdatingSet = false;
  entranceAnimationCompleted = false;
  startupMusicAfterEntrance = false;
  fastForward = false;
  replaying = false;
  explodingPixelsUpdateNeeded = false;
  assignmentIsRightClickGlitch = false; // storage of the bug
  debugLayerEnabled = false;

  constructor() {
    const lm = this.lemmingMethods;
    lm[LemmingAction.None] = null;
    lm[LemmingAction.Walking] = (l) => this.handleWalking(l);
    lm[LemmingAction.Jumping] = (l) => this.handleJumping(l);
    lm[LemmingAction.Digging] = (l) => this.handleDigging(l);
    lm[LemmingAction.Climbing] = (l) => this.handleClimbing(l);
    lm[LemmingAction.Drowning] = (l) => this.handleDrowning(l);
    lm[LemmingAction.Hoisting] = (l) => this.handleHoisting(l);
    lm[LemmingAction.Building] = (l) => this.handleBuilding(l);
    lm[LemmingAction.Bashing] = (l) => this.handleBashing(l);
    lm[LemmingAction.Mining] = (l) => this.handleMining(l);
    lm[LemmingAction.Falling] = (l) => this.handleFalling(l);
    lm[LemmingAction.Floating] = (l) => this.handleFloating(l);
    lm[LemmingAction.Splatting] = (l) => this.handleSplatting(l);
    lm[LemmingAction.Exiting] = (l) => this.handleExiting(l);
    lm[LemmingAction.Vaporizing] = (l) => this.handleVaporizing(l);
    lm[LemmingAction.Blocking] = (l) => this.handleBlocking(l);
    lm[LemmingAction.Shrugging] = (l) => this.handleShrugging(l);
    lm[LemmingAction.Ohnoing] = (l) => this.handleOhNoing(l);
    lm[LemmingAction.Exploding] = (l) => this.handleExploding(l);

    const sm = this.skillMethods;
    for (let a = LemmingAction.None; a <= LemmingAction.Exploding; a++) sm[a] = null;
    sm[LemmingAction.Digging] = (a, b) => this.assignDigger(a, b);
    sm[LemmingAction.Climbing] = (a, b) => this.assignClimber(a, b);
    sm[LemmingAction.Building] = (a, b) => this.assignBuilder(a, b);
    sm[LemmingAction.Bashing] = (a, b) => this.assignBasher(a, b);
    sm[LemmingAction.Mining] = (a, b) => this.assignMiner(a, b);
    sm[LemmingAction.Floating] = (a, b) => this.assignFloater(a, b);
    sm[LemmingAction.Blocking] = (a, b) => this.assignBlocker(a, b);
    sm[LemmingAction.Exploding] = (a, b) => this.assignBomber(a, b);
  }

  /* ---------------------------------------------------------------------------------------------- properties */

  get soundOpts(): ReadonlySet<SoundOption> {
    return this.fSoundOpts;
  }

  /** TLemmingGame.SetSoundOpts */
  setSoundOpts(value: ReadonlySet<SoundOption>): void {
    const same = value.size === this.fSoundOpts.size && [...value].every((v) => this.fSoundOpts.has(v));
    if (same) return;
    this.fSoundOpts = new Set(value);
    if (!this.fSoundOpts.has(SoundOption.Music)) this.soundMgr.stopMusic(this.musicIndex);
    else this.soundMgr.playMusic(this.musicIndex);
  }

  get isActuallyReplaying(): boolean {
    return this.replaying && !this.isLastRecordedRecordReached && !this.recorder.isEmpty;
  }

  get isSpeedingUp(): boolean {
    return this.releaseRateStatus === ReleaseRateStatus.SpeedingUp;
  }

  get isSlowingDown(): boolean {
    return this.releaseRateStatus === ReleaseRateStatus.SlowingDown;
  }

  hasGameOption(o: GameOption): boolean {
    return this.gameOptions.has(o);
  }

  private selectReplayMessageTextColor(): TColor32 {
    return fMessageColors[this.replayMessageCounter];
  }

  private selectFeedbackMessageTextColor(): TColor32 {
    return fMessageColors[this.currentIteration % 8];
  }

  update(): void {
    this.internalUpdate(false, false);
  }

  private drawDebug(): void {
    // the debug layer is a GR32 layer of the game screen: nothing to do in the engine
  }

  /* ---------------------------------------------------------------------------------------------- pixel combiners */

  private readonly combineDefault: PixelCombine = (f, b) => (f !== 0 ? f : b);
  private readonly combineLemming: PixelCombine = (f, b) => (f !== 0 ? f : b);
  private readonly combineClimber: PixelCombine = (f, b) => ((f & 0xff) === 224 ? ClimberColor : f !== 0 ? f : b);
  private readonly combineFloater: PixelCombine = (f, b) => ((f & 0xff) === 224 ? FloaterColor : f !== 0 ? f : b);
  private readonly combineAthlete: PixelCombine = (f, b) => ((f & 0xff) === 224 ? AthleteColor : f !== 0 ? f : b);
  private brickColorForCurrentlyDrawn(): TColor32 {
    // ORIGINAL: BrickPixelColors[12 - CurrentlyDrawnLemming.NumberOfBricksLeft] (never reached: the builder flag is never set)
    const i = 12 - (this.currentlyDrawnLemming?.numberOfBricksLeft ?? 0);
    return this.brickPixelColors[Math.min(Math.max(i, 0), 11)];
  }
  private readonly combineBuilder: PixelCombine = (f, b) => (f === this.brickPixelColor ? this.brickColorForCurrentlyDrawn() : f !== 0 ? f : b);
  private readonly combineBuilderClimber: PixelCombine = (f, b) =>
    f === this.brickPixelColor ? this.brickColorForCurrentlyDrawn() : (f & 0xff) === 224 ? ClimberColor : f !== 0 ? f : b;
  private readonly combineBuilderFloater: PixelCombine = (f, b) =>
    f === this.brickPixelColor ? this.brickColorForCurrentlyDrawn() : (f & 0xff) === 224 ? FloaterColor : f !== 0 ? f : b;
  private readonly combineBuilderAthlete: PixelCombine = (f, b) =>
    f === this.brickPixelColor ? this.brickColorForCurrentlyDrawn() : (f & 0xff) === 224 ? AthleteColor : f !== 0 ? f : b;
  private readonly combineLemmingPhotoFlash: PixelCombine = (f, b) => (f !== 0 ? clBlack32 : blendMem(clTrWhite32, b));
  /** copy masks to the world */
  private readonly combineMask: PixelCombine = (f, b) => (f !== 0 ? 0 : b);
  /** copy the world to the minimap */
  private readonly combineMinimapWorld: PixelCombine = (f, b) => (f !== 0 ? this.brickPixelColor : b);

  private updatePixelCombine(l: Lemming): void {
    if (!this.gameOptions.has(GameOption.ColorizeLemmings)) {
      l.pixelCombine = this.combineLemming;
      return;
    }
    switch (l.combineFlags) {
      case 0:
        l.pixelCombine = this.combineLemming;
        break;
      case COMBINE_FLAG_CLIMBER:
        l.pixelCombine = this.combineClimber;
        break;
      case COMBINE_FLAG_CLIMBER | COMBINE_FLAG_FLOATER:
        l.pixelCombine = this.combineAthlete;
        break;
      case COMBINE_FLAG_CLIMBER | COMBINE_FLAG_BUILDER:
        l.pixelCombine = this.combineBuilderClimber;
        break;
      case COMBINE_FLAG_CLIMBER | COMBINE_FLAG_FLOATER | COMBINE_FLAG_BUILDER:
        l.pixelCombine = this.combineBuilderAthlete;
        break;
      case COMBINE_FLAG_FLOATER:
        l.pixelCombine = this.combineFloater;
        break;
      case COMBINE_FLAG_FLOATER | COMBINE_FLAG_BUILDER:
        l.pixelCombine = this.combineBuilderFloater;
        break;
      case COMBINE_FLAG_BUILDER:
        l.pixelCombine = this.combineBuilder;
        break;
    }
  }

  private btnInternalSelectOnly(btn: SkillPanelButton): void {
    switch (btn) {
      case SkillPanelButton.Climber:
        this.btnClimber();
        break;
      case SkillPanelButton.Umbrella:
        this.btnUmbrella();
        break;
      case SkillPanelButton.Explode:
        this.btnExplode();
        break;
      case SkillPanelButton.Blocker:
        this.btnBlocker();
        break;
      case SkillPanelButton.Builder:
        this.btnBuilder();
        break;
      case SkillPanelButton.Basher:
        this.btnBasher();
        break;
      case SkillPanelButton.Miner:
        this.btnMiner();
        break;
      case SkillPanelButton.Digger:
        this.btnDigger();
        break;
    }
  }

  /* ---------------------------------------------------------------------------------------------- Prepare / Start */

  /** TLemmingGame.Prepare. #EL 2020-02-23 decoupled game from global app: all info is passed to this method. */
  prepare(info: GameInfo): void {
    this.updateCallsSession = 0;

    this.mechanics = info.style.mechanics;
    this.fSoundOpts = new Set(info.soundOptions ?? [SoundOption.Sound, SoundOption.Music]);
    this.gameOptions = new Set(info.gameOptions ?? DEFAULT_GAME_OPTIONS);
    this.miscOptions = new Set(info.miscOptions ?? DEFAULT_MISC_OPTIONS);
    this.renderer = info.renderer;
    this.view = info.view ?? null;
    this.targetBitmap = info.targetBitmap;
    this.displayScale = info.displayScale ?? 1;
    this.soundMgr = info.soundMgr ?? new NullSoundManager();
    this.soundIds = info.soundIds ?? DEFAULT_SOUND_IDS;
    this.level = info.level;
    this.style = info.style;
    this.graph = info.graphicSet;
    this.levelLoadingInfo = info.levelLoadingInfo;
    this.data = info.data;
    if (info.toolbar) this.toolbar = info.toolbar;
    // TReplayCursor.Create: the highlight cursor with black made transparent
    if (!this.replayCursor.bitmap) {
      const cursor = readBmp(this.data.createDataStream(this.style.name, FilenameCursorHighlight, DataType.Cursor).bytes);
      cursor.replaceColor(0xff000000, 0);
      cursor.drawMode = DrawMode.Blend;
      this.replayCursor.bitmap = cursor;
    }

    this.lastNonPrioritizedLemming = null;

    const opt = info.optionalMechanics ?? new Set<OptionalMechanic>();
    if (opt.has(OptionalMechanic.NukeGlitch)) this.mechanics |= 1 << Mechanic.NukeGlitch;
    if (opt.has(OptionalMechanic.PauseGlitch)) this.mechanics |= 1 << Mechanic.PauseGlitch;
    if (opt.has(OptionalMechanic.RighClickGlitch)) this.mechanics |= 1 << Mechanic.RightClickGlitch;

    this.recorder.currentMechanics = this.mechanics;

    this.messagesPlayedCount = 0;
    this.startupMusicAfterEntrance = true;

    // Initialize the palette of AnimationSet: low part is the fixed palette, hi part comes from the graphicset.
    // Reloading the lemming animations is needed because of the brickcolor.
    const ani = this.style.lemmingAnimationSet;
    ani.animationPalette = this.graph.palette.slice();
    ani.load(this.data);

    // initialize explosion particle colors
    for (let i = 0; i <= 15; i++) this.particleColors[i] = this.graph.palette[ParticleColorIndices[i]];

    // prepare masks for drawing
    this.cntDownBmp = ani.countDownDigitsBitmap;
    this.cntDownBmp.drawMode = DrawMode.Custom;
    this.cntDownBmp.onPixelCombine = this.combineDefault;

    this.explodeMaskBmp = ani.explosionMaskBitmap;
    this.explodeMaskBmp.drawMode = DrawMode.Custom;
    this.explodeMaskBmp.onPixelCombine = this.combineMask;

    this.bashMasks = [ani.bashMasksBitmap, ani.bashMasksRTLBitmap];
    this.mineMasks = [ani.mineMasksBitmap, ani.mineMasksRTLBitmap];
    for (const m of [...this.bashMasks, ...this.mineMasks]) {
      m.drawMode = DrawMode.Custom;
      m.onPixelCombine = this.combineMask;
    }

    // prepare animationbitmaps for drawing (set pixelcombine eventhandlers)
    for (const bmp of ani.lemmingBitmaps) {
      bmp.drawMode = DrawMode.Custom;
      bmp.onPixelCombine = this.combineLemming;
    }

    this.world.setSize(GAME_BMPWIDTH, GAME_BMPHEIGHT);

    // load particle array: stream.Read(fParticles, stream.Size)
    const stream = this.data.createDataStream(this.style.name, 'Particles.dat', DataType.Particles);
    const bytes = stream.read(this.particles.length);
    this.particles = new Int8Array(51 * 80 * 2);
    this.particles.set(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));

    if (this.levelLoadingInfo.musicFileName) this.musicIndex = this.soundMgr.addMusic(this.levelLoadingInfo.musicFileName);
    else this.musicIndex = -1;
  }

  start(aReplay = false, startWithHyperspeed = false): void {
    this.playing = false;

    this.highResolutionLayer.messageList.length = 0;
    this.messageList.length = 0;
    this.replayCursor.reset();

    // flicker free hyperspeed rewind
    if (startWithHyperspeed) {
      this.targetBitmapsUpdatingSet = true;
      this.targetBitmap.beginUpdate();
      this.toolbar.beginUpdateImg();
    } else this.targetBitmapsUpdatingSet = false;

    this.renderer.renderWorld(this.world, false);

    this.targetBitmap.assign(this.world);

    // hyperspeed things
    this.targetIteration = 0;
    this.hyperSpeed = startWithHyperspeed;
    this.entranceAnimationCompleted = false;

    this.updateCalls = 0;
    this.handleLemmingCalls = 0;

    this.fastForward = false;
    this.isLastRecordedRecordReached = false;

    this.isFinished = false;
    this.isCheated = false;
    this.lemmingsReleased = 0;
    this.world.assign(this.targetBitmap);
    this.world.outerColor = 0;
    this.minutes = this.level.info.timeLimit;
    this.seconds = 0;

    this.gameResultRec = emptyGameResult();
    this.gameResultRec.lemmingCount = this.level.info.lemmingsCount;
    this.gameResultRec.toRescue = this.level.info.rescueCount;

    this.replayIndex = 0;
    this.lemmingsReleased = 0;
    this.lemmingsOut = 0;
    this.lemmingsSaved = 0;
    this.lemmingsRemoved = 0;
    this.rightMouseButtonHeldDown = false;
    this.currentIteration = 0;

    this.lastCueSoundIteration = 0;
    this.clockFrame = 0;
    this.entrancesOpened = false;
    this.objectInfos.length = 0;
    this.entrances.length = 0;
    this.setOrder(0, 0, 0, 0);
    this.releaseRateStatus = ReleaseRateStatus.None;
    this.isPaused = false;
    this.isPausedExt = false;
    this.isNukedByUser = false;
    this.isExploderAssignInProgress = false;
    this.indexOfLemmingToBeNuked = 0;
    this.currentCursor = 0;
    this.particleFinishTimer = 0;
    this.lemmingList.length = 0;
    this.soundsToPlay.length = 0;
    if (!aReplay) this.recorder.clear();
    this.replaying = aReplay;
    this.explodingPixelsUpdateNeeded = false;
    this.lastNonPrioritizedLemming = null;
    this.replayMessageCounter = 0;

    // replay pause glitch aware stuff
    this.glitchPauseIterations = 0;

    // if replaying then overwrite mechanics from the recorder
    if (aReplay && (this.recorder.wasLoaded || this.recorder.wasSaved || !this.recorder.isEmpty)) this.mechanics = this.recorder.currentMechanics;

    // if replaying then reset glitchpauseiterations
    if (aReplay && hasMechanic(this.mechanics, Mechanic.PauseGlitch)) this.glitchPauseIterations = this.recorder.recordedGlitchPauseIterations;

    this.maxNumLemmings = this.level.info.lemmingsCount;

    this.currReleaseRate = this.level.info.releaseRate;
    this.currClimberCount = this.level.info.climberCount;
    this.currFloaterCount = this.level.info.floaterCount;
    this.currBomberCount = this.level.info.bomberCount;
    this.currBlockerCount = this.level.info.blockerCount;
    this.currBuilderCount = this.level.info.builderCount;
    this.currBasherCount = this.level.info.basherCount;
    this.currMinerCount = this.level.info.minerCount;
    this.currDiggerCount = this.level.info.diggerCount;

    this.nextLemmingCountDown = 20;

    for (const o of this.level.interactiveObjects) {
      if (o.identifier < 0 || o.identifier >= this.graph.metaObjectList.length)
        throw new EngineError('Close encounter with an invalid object identifier (' + o.identifier + ')');
      const mo = this.graph.metaObjectList[o.identifier];
      const inf = new InteractiveObjectInfo();
      inf.obj = o;
      inf.metaObj = mo;
      inf.currentFrame = mo.startAnimationFrameIndex;
      // add to the right list (Entrances or other objects)
      if (o.identifier === DOS_OBJECT_ID_ENTRANCE) this.entrances.push(inf);
      else this.objectInfos.push(inf);
    }

    // release order index table
    if (hasMechanic(this.mechanics, Mechanic.OldEntranceABBAOrder)) {
      switch (this.entrances.length) {
        case 2:
          this.setOrder(0, 1, 1, 0); // ABBA
          break;
        case 3:
          this.setOrder(0, 1, 2, 1); // ABCB
          break;
        case 4:
          this.setOrder(0, 1, 2, 3); // ABCD
          break;
        default:
          this.setOrder(0, 0, 0, 0); // AAAA
      }
    } else {
      switch (this.entrances.length) {
        case 2:
          this.setOrder(0, 1, 0, 1); // ABAB
          break;
        case 3:
          this.setOrder(0, 1, 2, 1); // ABCB
          break;
        case 4:
          this.setOrder(0, 1, 2, 3); // ABCD
          break;
        default:
          this.setOrder(0, 0, 0, 0); // AAAA
      }
    }

    this.initializeBrickColors(this.graph.brickColor);
    this.initializeObjectMap();
    this.initializeMiniMap();

    if (!startWithHyperspeed) this.drawAnimatedObjects(); // first draw needed

    this.toolbar.setInfoMinutes(this.minutes);
    this.toolbar.setInfoSeconds(this.seconds);
    this.toolbar.setInfoLemmingsOut(this.lemmingsOut);
    this.toolbar.setInfoLemmingsSaved(0, 1, !this.miscOptions.has(MiscOption.LemmingsPercentages));
    if (!this.hyperSpeed) this.toolbar.setPauseHighlight(false);

    this.selectedSkill = SkillPanelButton.None; // to force update
    this.btnClimber(); // this is not recorded because not playing yet

    if (!this.hyperSpeed) this.repaintSkillPanelButtons();

    this.playing = true;
  }

  private setOrder(i0: number, i1: number, i2: number, i3: number): void {
    this.dosEntranceOrderTable[0] = i0;
    this.dosEntranceOrderTable[1] = i1;
    this.dosEntranceOrderTable[2] = i2;
    this.dosEntranceOrderTable[3] = i3;
  }

  /** only called from gotoiteration (when rewinding to frame zero) */
  private internalRefresh(): void {
    this.eraseLemmings();
    this.eraseReplayCursor();
    this.eraseMessages();

    this.targetBitmap.assign(this.world);
    if (this.targetBitmapsUpdatingSet) {
      this.targetBitmapsUpdatingSet = false;
      this.targetBitmap.endUpdate();
      this.toolbar.endUpdateImg();
    }

    this.drawAnimatedObjects();
    this.drawLemmings();
    this.drawReplayCursorCheck();
    this.drawMessages();
    this.drawDebug();

    if (this.explodingPixelsUpdateNeeded) this.explodingPixelsUpdateNeeded = false;
  }

  gotoIteration(aTargetIteration: number): void {
    if (!this.playing) return;
    if (aTargetIteration <= 0) aTargetIteration = 0;
    if (aTargetIteration === this.currentIteration) return;

    const oldPause = this.isPaused;

    if (aTargetIteration < this.currentIteration) {
      // rewind
      if (aTargetIteration === 0) {
        this.start(true, false);
        this.internalRefresh();
      } else {
        this.start(true, true);
        while (this.currentIteration < aTargetIteration && !this.isFinished)
          this.internalUpdate(true, this.currentIteration === aTargetIteration - 1);
        this.hyperSpeedEnd();
      }
    } else {
      // skip forward
      this.hyperSpeedBegin();
      while (this.currentIteration < aTargetIteration && !this.isFinished)
        this.internalUpdate(true, this.currentIteration === aTargetIteration - 1);
      this.hyperSpeedEnd();
    }

    if (this.isPaused !== oldPause) {
      this.isPaused = oldPause;
      this.toolbar.setPauseHighlight(this.isPaused);
    }
  }

  /* ---------------------------------------------------------------------------------------------- world and object map */

  /** Read value from the world. Returns true when the value at (x, y) is terrain. */
  hasPixelAt(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.world.width && y < this.world.height && (this.world.bits[x + y * this.world.width] & ALPHA_TERRAIN) !== 0;
  }

  hasPixelAt_ClipY(x: number, y: number, minY: number): boolean {
    if (y >= minY) return this.hasPixelAt(x, y);
    return this.hasPixelAt(x, minY);
  }

  private removePixelAt(x: number, y: number): void {
    this.world.setPixelS(x, y, 0);
  }

  /** original dos object map has a resolution of 4 */
  readObjectMap(x: number, y: number): number {
    // the "and not 3" ensures rounding down when operand is negative (eg. -0.25 -> -1)
    x = (x & ~3) >> 2;
    y = (y & ~3) >> 2;
    x += OBJMAPADD;
    y += OBJMAPADD;
    const m = this.objectMap;
    if (x >= 0 && x < m.width && y >= 0 && y < m.height) return m.bits[x + y * m.width];
    return DOM_NONE; // whoops, important
  }

  private writeObjectMap(x: number, y: number, value: number): void {
    x = (x & ~3) >> 2;
    y = (y & ~3) >> 2;
    x += OBJMAPADD;
    y += OBJMAPADD;
    const m = this.objectMap;
    if (x >= 0 && x < m.width && y >= 0 && y < m.height) m.bits[x + y * m.width] = value & 0xff;
  }

  /** Read only view on the object map (for tests and tools). */
  get objectMapBits(): Uint8Array {
    return this.objectMap.bits;
  }

  private saveMap(l: Lemming): void {
    l.savedMap[0] = this.readObjectMap(l.xPos - 4, l.yPos - 6);
    l.savedMap[1] = this.readObjectMap(l.xPos, l.yPos - 6);
    l.savedMap[2] = this.readObjectMap(l.xPos + 4, l.yPos - 6);
    l.savedMap[3] = this.readObjectMap(l.xPos - 4, l.yPos - 2);
    l.savedMap[4] = this.readObjectMap(l.xPos, l.yPos - 2);
    l.savedMap[5] = this.readObjectMap(l.xPos + 4, l.yPos - 2);
    l.savedMap[6] = this.readObjectMap(l.xPos - 4, l.yPos + 2);
    l.savedMap[7] = this.readObjectMap(l.xPos, l.yPos + 2);
    l.savedMap[8] = this.readObjectMap(l.xPos + 4, l.yPos + 2);
  }

  private restoreMap(l: Lemming): void {
    this.writeObjectMap(l.xPos - 4, l.yPos - 6, l.savedMap[0]);
    this.writeObjectMap(l.xPos, l.yPos - 6, l.savedMap[1]);
    this.writeObjectMap(l.xPos + 4, l.yPos - 6, l.savedMap[2]);
    this.writeObjectMap(l.xPos - 4, l.yPos - 2, l.savedMap[3]);
    this.writeObjectMap(l.xPos, l.yPos - 2, l.savedMap[4]);
    this.writeObjectMap(l.xPos + 4, l.yPos - 2, l.savedMap[5]);
    this.writeObjectMap(l.xPos - 4, l.yPos + 2, l.savedMap[6]);
    this.writeObjectMap(l.xPos, l.yPos + 2, l.savedMap[7]);
    this.writeObjectMap(l.xPos + 4, l.yPos + 2, l.savedMap[8]);
  }

  private setBlockerField(l: Lemming): void {
    this.writeObjectMap(l.xPos - 4, l.yPos - 6, DOM_FORCELEFT);
    this.writeObjectMap(l.xPos, l.yPos - 6, DOM_BLOCKER);
    this.writeObjectMap(l.xPos + 4, l.yPos - 6, DOM_FORCERIGHT);
    this.writeObjectMap(l.xPos - 4, l.yPos - 2, DOM_FORCELEFT);
    this.writeObjectMap(l.xPos, l.yPos - 2, DOM_BLOCKER);
    this.writeObjectMap(l.xPos + 4, l.yPos - 2, DOM_FORCERIGHT);
    this.writeObjectMap(l.xPos - 4, l.yPos + 2, DOM_FORCELEFT);
    this.writeObjectMap(l.xPos, l.yPos + 2, DOM_BLOCKER);
    this.writeObjectMap(l.xPos + 4, l.yPos + 2, DOM_FORCERIGHT);
  }

  private checkForOverlappingField(l: Lemming): boolean {
    const inSet = (v: number) => v === DOM_FORCELEFT || v === DOM_BLOCKER || v === DOM_FORCERIGHT;
    return (
      inSet(this.readObjectMap(l.xPos - 4, l.yPos - 6)) ||
      inSet(this.readObjectMap(l.xPos, l.yPos - 6)) ||
      inSet(this.readObjectMap(l.xPos + 4, l.yPos - 6)) ||
      inSet(this.readObjectMap(l.xPos - 4, l.yPos - 2)) ||
      inSet(this.readObjectMap(l.xPos, l.yPos - 2)) ||
      inSet(this.readObjectMap(l.xPos + 4, l.yPos - 2)) ||
      inSet(this.readObjectMap(l.xPos - 4, l.yPos + 2)) ||
      inSet(this.readObjectMap(l.xPos, l.yPos + 2)) ||
      inSet(this.readObjectMap(l.xPos + 4, l.yPos + 2))
    );
  }

  /* ---------------------------------------------------------------------------------------------- transitions */

  /** Handling of a transition and/or turnaround */
  transition(l: Lemming, aAction: LemmingAction, doTurn = false): void {
    // check if any change
    if (l.action === aAction && !doTurn) return;

    if (doTurn) l.xDelta = -l.xDelta;

    // *always* new animation
    const ix = animationIndex(aAction, l.rtl); // watch out: here we use the aAction parameter!
    l.lma = this.style.lemmingAnimationSet.metaLemmingAnimationList[ix];
    l.lab = this.style.lemmingAnimationSet.lemmingBitmaps[ix];
    l.maxFrame = l.lma.frameCount - 1;
    l.animationType = l.lma.animationType;
    l.frameTopDy = -l.lma.footY; // ccexplore code compatible
    l.frameLeftDx = -l.lma.footX; // ccexplore code compatible

    // transition
    if (l.action === aAction) return;

    const oldFlags = l.combineFlags;

    l.action = aAction;
    l.actionBits = 1 << aAction;
    l.frame = 0;
    l.endOfAnimation = false;
    l.fallen = 0;
    l.numberOfBricksLeft = 0;
    l.combineFlags = l.combineFlags & ~COMBINE_FLAG_BUILDER;

    // some things to do when entering state
    switch (l.action) {
      case LemmingAction.Splatting:
        l.explosionTimer = 0;
        l.xDelta = 0;
        this.cueSoundEffect(this.soundIds.SFX_SPLAT);
        break;
      case LemmingAction.Blocking:
        l.isBlocking = true;
        this.saveMap(l);
        this.setBlockerField(l);
        break;
      case LemmingAction.Exiting:
        this.cueSoundEffect(this.soundIds.SFX_YIPPEE);
        break;
      case LemmingAction.Digging:
        l.isNewDigger = true;
        break;
      case LemmingAction.Falling:
        if (hasMechanic(this.mechanics, Mechanic.FallerStartsWith3)) l.fallen = 3;
        break;
      case LemmingAction.Building:
        l.numberOfBricksLeft = 12;
        l.combineFlags = l.combineFlags & ~COMBINE_FLAG_BUILDER;
        break;
      case LemmingAction.Ohnoing:
        if (!this.isNukedByUser) this.cueSoundEffect(this.soundIds.SFX_OHNO);
        break;
      case LemmingAction.Exploding:
        this.cueSoundEffect(this.soundIds.SFX_EXPLOSION);
        break;
      case LemmingAction.Floating:
        l.floatParametersTableIndex = 0;
        break;
      case LemmingAction.Mining:
        l.yPos++;
        break;
    }

    if (oldFlags !== l.combineFlags) this.updatePixelCombine(l);
  }

  /** we assume that the mirrored animations at least have the same framecount */
  turnAround(l: Lemming): void {
    l.xDelta = -l.xDelta;
    const i = animationIndex(l.action, l.rtl);
    l.lma = this.style.lemmingAnimationSet.metaLemmingAnimationList[i];
    l.lab = this.style.lemmingAnimationSet.lemmingBitmaps[i];
    l.maxFrame = l.lma.frameCount - 1;
    l.animationType = l.lma.animationType;
    l.frameTopDy = -l.lma.footY;
    l.frameLeftDx = -l.lma.footX;
  }

  /* ---------------------------------------------------------------------------------------------- skill assignment */

  /** key method */
  assignSkill(lemming1: Lemming | null, lemming2: Lemming | null, aSkill: LemmingAction): Lemming | null {
    let result: Lemming | null = null;
    const method = this.skillMethods[aSkill];
    if (method) {
      result = method(lemming1, lemming2);
      if (result) {
        this.updatePixelCombine(result);
        this.cueSoundEffect(this.soundIds.SFX_ASSIGN_SKILL);
      }
    }
    this.assignmentIsRightClickGlitch = false;
    return result;
  }

  // NB: like the original, the assign methods dereference Lemming1 without a nil check. A nil Lemming1 is
  // possible (see ProcessSkillAssignment) and then raises at the same point as the Delphi access violation.

  private assignClimber(lemming1: Lemming | null, _lemming2: Lemming | null): Lemming | null {
    let result: Lemming | null = null;
    if (
      this.currClimberCount > 0 &&
      !lemming1!.isClimber &&
      !lemming1!.actionIn(ACTION_BIT_BLOCKING | ACTION_BIT_SPLATTING | ACTION_BIT_EXPLODING)
    ) {
      const l1 = lemming1!;
      l1.isClimber = true;
      this.currClimberCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Climber, this.currClimberCount);
      if (hasMechanic(this.mechanics, Mechanic.AssignClimberShruggerActionBug))
        if (l1.action === LemmingAction.Shrugging) {
          l1.action = LemmingAction.Walking; // take this bug literally
          l1.actionBits = ACTION_BIT_WALKING;
        }
      result = l1;
      result.combineFlags = (result.combineFlags | COMBINE_FLAG_CLIMBER) & 0xff;
      this.recordSkillAssignment(l1, LemmingAction.Climbing, false, this.assignmentIsRightClickGlitch);
    }
    return result;
  }

  private assignFloater(lemming1: Lemming | null, _lemming2: Lemming | null): Lemming | null {
    let result: Lemming | null = null;
    if (
      this.currFloaterCount > 0 &&
      !lemming1!.isFloater &&
      !lemming1!.actionIn(ACTION_BIT_BLOCKING | ACTION_BIT_SPLATTING | ACTION_BIT_EXPLODING)
    ) {
      const l1 = lemming1!;
      l1.isFloater = true;
      this.currFloaterCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Umbrella, this.currFloaterCount);
      result = l1;
      result.combineFlags = (result.combineFlags | COMBINE_FLAG_FLOATER) & 0xff;
      this.recordSkillAssignment(l1, LemmingAction.Floating, false, this.assignmentIsRightClickGlitch);
    }
    return result;
  }

  private assignBomber(lemming1: Lemming | null, _lemming2: Lemming | null): Lemming | null {
    let result: Lemming | null = null;
    if (
      this.currBomberCount > 0 &&
      lemming1!.explosionTimer === 0 &&
      !lemming1!.actionIn(ACTION_BIT_OHNOING | ACTION_BIT_EXPLODING | ACTION_BIT_VAPORIZING | ACTION_BIT_SPLATTING)
    ) {
      const l1 = lemming1!;
      l1.explosionTimer = 79;
      this.currBomberCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Explode, this.currBomberCount);
      result = l1;
      this.recordSkillAssignment(l1, LemmingAction.Exploding, false, this.assignmentIsRightClickGlitch);
    }
    return result;
  }

  private assignBlocker(lemming1: Lemming | null, _lemming2: Lemming | null): Lemming | null {
    let result: Lemming | null = null;
    if (
      this.currBlockerCount > 0 &&
      lemming1!.actionIn(ACTION_BIT_WALKING | ACTION_BIT_SHRUGGING | ACTION_BIT_BUILDING | ACTION_BIT_BASHING | ACTION_BIT_MINING | ACTION_BIT_DIGGING) &&
      this.checkForOverlappingField(lemming1!) === false
    ) {
      const l1 = lemming1!;
      this.currBlockerCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Blocker, this.currBlockerCount);
      this.transition(l1, LemmingAction.Blocking);
      result = l1;
      this.recordSkillAssignment(l1, LemmingAction.Blocking, false, this.assignmentIsRightClickGlitch);
    }
    return result;
  }

  private assignBuilder(lemming1: Lemming | null, lemming2: Lemming | null): Lemming | null {
    const actionSet = ACTION_BIT_WALKING | ACTION_BIT_SHRUGGING | ACTION_BIT_BASHING | ACTION_BIT_MINING | ACTION_BIT_DIGGING;
    let result: Lemming | null = null;

    if (this.currBuilderCount === 0 || lemming1!.yPos + lemming1!.frameTopDy < HEAD_MIN_Y) return result;

    const l1 = lemming1!;
    if (l1.actionIn(actionSet)) {
      this.transition(l1, LemmingAction.Building);
      this.currBuilderCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Builder, this.currBuilderCount);
      result = l1;
      this.recordSkillAssignment(l1, LemmingAction.Building, false, this.assignmentIsRightClickGlitch);
    } else if (lemming2 !== null && lemming2.actionIn(actionSet)) {
      this.transition(lemming2, LemmingAction.Building);
      this.currBuilderCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Builder, this.currBuilderCount);
      result = lemming2;
      this.recordSkillAssignment(lemming2, LemmingAction.Building, true, this.assignmentIsRightClickGlitch);
    }
    return result;
  }

  private assignBasher(lemming1: Lemming | null, lemming2: Lemming | null): Lemming | null {
    const actionSet = ACTION_BIT_WALKING | ACTION_BIT_SHRUGGING | ACTION_BIT_BUILDING | ACTION_BIT_MINING | ACTION_BIT_DIGGING;
    let selected: Lemming;
    if (this.currBasherCount === 0) return null;
    else if (lemming1!.actionIn(actionSet)) selected = lemming1!;
    else if (lemming2 !== null && lemming2.actionIn(actionSet)) selected = lemming2;
    else return null;

    if (selected.objectInFront === DOM_STEEL) {
      this.cueSoundEffect(this.soundIds.SFX_HITS_STEEL);
      return null;
    } else if (
      (selected.objectInFront === DOM_ONEWAYLEFT && selected.xDelta !== -1) ||
      (selected.objectInFront === DOM_ONEWAYRIGHT && selected.xDelta !== 1)
    )
      return null;
    else {
      this.transition(selected, LemmingAction.Bashing);
      this.currBasherCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Basher, this.currBasherCount);
      this.recordSkillAssignment(selected, LemmingAction.Bashing, selected === lemming2, this.assignmentIsRightClickGlitch);
      return selected;
    }
  }

  private assignMiner(lemming1: Lemming | null, lemming2: Lemming | null): Lemming | null {
    const actionSet = ACTION_BIT_WALKING | ACTION_BIT_SHRUGGING | ACTION_BIT_BUILDING | ACTION_BIT_BASHING | ACTION_BIT_DIGGING;
    let selected: Lemming;
    if (this.currMinerCount === 0) return null;
    else if (lemming1!.actionIn(actionSet)) selected = lemming1!;
    else if (lemming2 !== null && lemming2.actionIn(actionSet)) selected = lemming2;
    else return null;

    if (selected.objectInFront === DOM_STEEL) {
      this.cueSoundEffect(this.soundIds.SFX_HITS_STEEL);
      return null;
    } else if (
      selected.objectBelow === DOM_STEEL ||
      (selected.objectInFront === DOM_ONEWAYLEFT && selected.xDelta !== -1) ||
      (selected.objectInFront === DOM_ONEWAYRIGHT && selected.xDelta !== 1)
    )
      return null;
    else {
      this.transition(selected, LemmingAction.Mining);
      this.currMinerCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Miner, this.currMinerCount);
      this.recordSkillAssignment(selected, LemmingAction.Mining, selected === lemming2, this.assignmentIsRightClickGlitch);
      return selected;
    }
  }

  private assignDigger(lemming1: Lemming | null, lemming2: Lemming | null): Lemming | null {
    const actionSet = ACTION_BIT_WALKING | ACTION_BIT_SHRUGGING | ACTION_BIT_BUILDING | ACTION_BIT_BASHING | ACTION_BIT_MINING;
    let result: Lemming | null = null;
    if (this.currDiggerCount === 0 || lemming1!.objectBelow === DOM_STEEL) return result;
    else if (lemming1!.actionIn(actionSet)) {
      const l1 = lemming1!;
      this.transition(l1, LemmingAction.Digging);
      this.currDiggerCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Digger, this.currDiggerCount);
      result = l1;
      this.recordSkillAssignment(l1, LemmingAction.Digging, false, this.assignmentIsRightClickGlitch);
    } else if (lemming2 !== null && lemming2.actionIn(actionSet)) {
      this.transition(lemming2, LemmingAction.Digging);
      this.currDiggerCount--;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Digger, this.currDiggerCount);
      result = lemming2;
      this.recordSkillAssignment(lemming2, LemmingAction.Digging, true, this.assignmentIsRightClickGlitch);
    }
    return result;
  }

  private updateExplosionTimer(l: Lemming): boolean {
    l.explosionTimer--;
    if (l.explosionTimer > 0) return false;
    if (l.actionIn(ACTION_BIT_VAPORIZING | ACTION_BIT_DROWNING | ACTION_BIT_FLOATING | ACTION_BIT_FALLING))
      this.transition(l, LemmingAction.Exploding);
    else this.transition(l, LemmingAction.Ohnoing);
    return true;
  }

  private checkForGameFinished(): void {
    if (this.isFinished) return;
    if (this.particleFinishTimer > 0) return;

    if (this.minutes <= 0 && this.seconds <= 0) {
      this.gameResultRec.timeIsUp = true;
      this.finish();
      return;
    }

    if (this.lemmingsSaved >= this.maxNumLemmings || this.lemmingsRemoved >= this.maxNumLemmings || (this.isNukedByUser && this.lemmingsOut === 0))
      this.finish();
  }

  /**
   * In one of the previous e-mails I said the DOS Lemmings object map has an x range from -16 to 1647
   * and a y range from 0 to 159. I think to provide better safety margins, let us extend the y range a
   * bit, say from -16 to 175 (I added 16 in both directions). (ccexplore)
   */
  private initializeObjectMap(): void {
    const w = Math.trunc((1647 + OBJMAPOFFSET) / 4);
    const h = Math.trunc((175 + OBJMAPOFFSET) / 4);
    if (this.objectMap.width !== w || this.objectMap.height !== h) {
      this.objectMap.width = w;
      this.objectMap.height = h;
      this.objectMap.bits = new Uint8Array(w * h);
    }
    this.objectMap.bits.fill(DOM_NONE);

    // map steel
    for (const steel of this.level.steels)
      for (let y = steel.top; y <= steel.top + steel.height - 1; y++)
        for (let x = steel.left; x <= steel.left + steel.width - 1; x++) this.writeObjectMap(x, y, DOM_STEEL);

    const maxO = hasMechanic(this.mechanics, Mechanic.DisableObjectsAfter15) ? Math.min(this.objectInfos.length - 1, 15) : this.objectInfos.length - 1;

    for (let i = 0; i <= maxO; i++) {
      const inf = this.objectInfos[i];
      // 0..127 = triggered trap index, 128..255 = triggereffect (128 is DOM_NONE)
      const effect = inf.metaObj.triggerEffect & 0xff;
      const v = effect === ote_TriggeredTrap ? i & 0xff : (effect + 128) & 0xff;
      // ORIGINAL: Inf.Obj.Top and not 3 + Inf.MetaObj.TriggerTop  ("and" binds stronger than "+")
      const offsetY = (inf.obj.top & ~3) + inf.metaObj.triggerTop;
      const offsetX = (inf.obj.left & ~3) + inf.metaObj.triggerLeft;
      for (let y = offsetY; y <= offsetY + inf.metaObj.triggerHeight - 1; y++)
        for (let x = offsetX; x <= offsetX + inf.metaObj.triggerWidth - 1; x++) this.writeObjectMap(x, y, v); // traps --> object_id
    }
  }

  /**
   * Put the terrainpixels in the minimap. Copy them (scaled) from the world bitmap. During the game the
   * minimap will be updated like the world bitmap gets updated (display only).
   */
  private initializeMiniMap(): void {
    this.miniMap.setSize(DOS_MINIMAP_WIDTH, DOS_MINIMAP_HEIGHT);
    this.miniMap.clear(0);
    const oldCombine = this.world.onPixelCombine;
    const oldMode = this.world.drawMode;
    this.world.drawMode = DrawMode.Custom;
    this.world.onPixelCombine = this.combineMinimapWorld;
    const dstRect = rect(0, 0, Math.trunc(this.world.width / 16), Math.trunc(this.world.height / 8));
    this.world.drawToRect(this.miniMap, dstRect, this.world.boundsRect);
    this.world.onPixelCombine = oldCombine;
    this.world.drawMode = oldMode;
  }

  private getTrapSoundIndex(dosSoundEffect: number): number {
    switch (dosSoundEffect) {
      case ose_RopeTrap:
        return this.soundIds.SFX_ROPETRAP;
      case ose_SquishingTrap:
        return this.soundIds.SFX_SQUISHINGTRAP;
      case ose_TenTonTrap:
        return this.soundIds.SFX_TENTON;
      case ose_BearTrap:
        return this.soundIds.SFX_BEARTRAP;
      case ose_ElectroTrap:
        return this.soundIds.SFX_ELECTROTRAP;
      case ose_SpinningTrap:
        return this.soundIds.SFX_SPINNINGTRAP;
      default:
        return -1;
    }
  }

  private checkForInteractiveObjects(l: Lemming): void {
    l.objectBelow = this.readObjectMap(l.xPos, l.yPos);
    l.objectInFront = this.readObjectMap(l.xPos + 8 * l.xDelta, l.yPos - 8);

    const below = l.objectBelow;
    if (below === DOM_NONE) return;
    if (below <= 127) {
      // 0..127 triggered objects
      const inf = this.objectInfos[below];
      if (!inf.triggered) {
        inf.triggered = true;
        inf.currentFrame = 0;
        if (!hasMechanic(this.mechanics, Mechanic.TriggeredTrapLemmixBugSolved)) inf.currentFrame++;
        if (inf.currentFrame >= inf.metaObj.animationFrameCount) inf.currentFrame = 0;
        this.removeLemming(l);
        this.cueSoundEffect(this.getTrapSoundIndex(inf.metaObj.soundEffect));
      }
      return;
    }
    // 128 + n (continuous objects, staticobjects, steel, oneway wall)
    switch (below) {
      case DOM_EXIT:
        if (l.action !== LemmingAction.Falling) {
          this.transition(l, LemmingAction.Exiting);
          this.cueSoundEffect(this.soundIds.SFX_YIPPEE);
        }
        break;
      case DOM_FORCELEFT:
        if (l.xDelta > 0) this.turnAround(l);
        break;
      case DOM_FORCERIGHT:
        if (l.xDelta < 0) this.turnAround(l);
        break;
      case DOM_WATER:
        this.transition(l, LemmingAction.Drowning);
        this.cueSoundEffect(this.soundIds.SFX_DROWNING);
        break;
      case DOM_FIRE:
        this.transition(l, LemmingAction.Vaporizing);
        this.cueSoundEffect(this.soundIds.SFX_VAPORIZING);
        break;
    }
  }

  /* ---------------------------------------------------------------------------------------------- masks */

  /** dos explosion mask 16 x 22 */
  private applyExplosionMask(l: Lemming): void {
    this.explodeMaskBmp.drawTo(this.world, l.xPos - 8, l.yPos - 14);
    if (!this.hyperSpeed) this.explodeMaskBmp.drawTo(this.targetBitmap, l.xPos - 8, l.yPos - 14);
    // fake draw mask in the minimap. this clears 4 pixels as windows programmers should know
    const x = Math.trunc(l.xPos / 16);
    const y = Math.trunc(l.yPos / 8);
    this.miniMap.fillRectS(x - 1, y - 1, x + 1, y + 1, 0);
  }

  /** dos bashing mask = 16 x 10 */
  private applyBashingMask(l: Lemming, maskFrame: number): void {
    const bmp = this.bashMasks[l.rtl ? 1 : 0];
    const s = bmp.calcFrameRect(4, maskFrame);
    const left = l.xPos + l.frameLeftDx;
    const top = l.yPos + l.frameTopDy;
    const d = rect(left, top, left + 16, top + 10);
    bmp.drawToRect(this.world, d, s);
    if (!this.hyperSpeed) bmp.drawToRect(this.targetBitmap, d, s);
    // fake draw mask in the minimap
    this.miniMap.setPixelS(Math.trunc(l.xPos / 16), Math.trunc(l.yPos / 8), 0);
  }

  /** x,y is topleft */
  private applyMinerMask(l: Lemming, maskFrame: number, x: number, y: number): void {
    const bmp = this.mineMasks[l.rtl ? 1 : 0];
    const s = bmp.calcFrameRect(2, maskFrame);
    const d = rect(x, y, x + (s.right - s.left), y + (s.bottom - s.top));
    bmp.drawToRect(this.world, d, s);
    if (!this.hyperSpeed) bmp.drawToRect(this.targetBitmap, d, s);
    this.miniMap.setPixelS(Math.trunc(l.xPos / 16), Math.trunc(l.yPos / 8), 0);
  }

  /* ---------------------------------------------------------------------------------------------- drawing (display) */

  private particleAt(frame: number, i: number): [number, number] {
    const o = (frame * 80 + i) * 2;
    return [this.particles[o], this.particles[o + 1]];
  }

  /** Erase the previously drawn particles of an exploded lemming */
  private eraseParticles(l: Lemming): void {
    if (!this.gameOptions.has(GameOption.ShowParticles)) return;
    let drawn = false;
    if (l.particleFrame <= 50) {
      for (let i = 0; i <= 79; i++) {
        let [x, y] = this.particleAt(l.particleFrame, i);
        if (x !== -128 && y !== -128) {
          x = l.xPos + x;
          y = l.yPos + y;
          this.targetBitmap.setPixelS(x, y, this.world.pixelS(x, y));
          drawn = true;
        }
      }
    }
    this.explodingPixelsUpdateNeeded = drawn;
  }

  private drawParticles(l: Lemming): void {
    if (!this.gameOptions.has(GameOption.ShowParticles)) return;
    let drawn = false;
    if (l.particleFrame <= 50) {
      for (let i = 0; i <= 79; i++) {
        let [x, y] = this.particleAt(l.particleFrame, i);
        if (x !== -128 && y !== -128) {
          x = l.xPos + x;
          y = l.yPos + y;
          this.targetBitmap.setPixelS(x, y, this.particleColors[i % 16]);
          drawn = true;
        }
      }
    }
    this.explodingPixelsUpdateNeeded = drawn;
  }

  /** the order is important */
  drawAnimatedObjects(): void {
    if (this.hyperSpeed) return;
    const r = this.renderer;
    const t = this.targetBitmap;
    for (const inf of this.entrances) r.eraseObject(t, inf.obj, this.world);
    for (const inf of this.objectInfos) r.eraseObject(t, inf.obj, this.world);
    for (const inf of this.entrances) if (inf.onlyOnTerrain) r.drawObject(t, inf.obj, inf.currentFrame, null);
    for (const inf of this.objectInfos) if (inf.onlyOnTerrain) r.drawObject(t, inf.obj, inf.currentFrame, null);
    for (const inf of this.entrances) if (!inf.onlyOnTerrain) r.drawObject(t, inf.obj, inf.currentFrame, null);
    for (const inf of this.objectInfos) if (!inf.onlyOnTerrain) r.drawObject(t, inf.obj, inf.currentFrame, null);
  }

  /** Erase the lemming from the targetbitmap by copying its rect from the world bitmap. */
  private eraseLemmings(): void {
    if (this.hyperSpeed || this.lemmingList.length === 0) return;
    for (const l of this.lemmingList) {
      if (!l.isRemoved) {
        const r = inflateRect(l.rectToErase, 2, 2);
        const [ok, dstRect] = intersectRectEx(r, this.world.boundsRect);
        if (ok) this.world.drawToRect(this.targetBitmap, dstRect, dstRect);
      } else if (l.particleTimer > 0) this.eraseParticles(l);
    }
  }

  private drawLemmings(): void {
    if (this.hyperSpeed) return;

    this.minimapBuffer.assign(this.miniMap);

    for (const l of this.lemmingList) {
      if (!l.isRemoved) {
        this.currentlyDrawnLemming = l;
        let srcRect = l.getFrameBounds();
        const dstRect = l.getLocationBounds();
        l.rectToErase = dstRect;

        this.minimapBuffer.setPixelS(Math.trunc(l.xPos / 16), Math.trunc(l.yPos / 8), color32(0, 255, 0));

        if (!l.photoFlashForReplay) {
          l.lab.onPixelCombine = l.pixelCombine;
          l.lab.drawToRect(this.targetBitmap, dstRect, srcRect);
        } else {
          const oldCombine = l.lab.onPixelCombine;
          l.lab.onPixelCombine = this.combineLemmingPhotoFlash;
          l.lab.drawToRect(this.targetBitmap, dstRect, srcRect);
          l.lab.onPixelCombine = oldCombine;
          l.photoFlashForReplay = false;
        }

        if (l.explosionTimer > 0) {
          srcRect = rect(0, 0, 8, 8);
          const digRect = l.getCountDownDigitBounds();
          l.rectToErase = { ...l.rectToErase, top: digRect.top };
          const t = l.explosionTimer;
          let digit: number;
          if (t >= 65 && t <= 79) digit = 5;
          else if (t >= 49 && t <= 64) digit = 4;
          else if (t >= 33 && t <= 48) digit = 3;
          else if (t >= 17 && t <= 32) digit = 2;
          else if (t >= 0 && t <= 16) digit = 1;
          else digit = 1;
          srcRect = { left: 0, top: (5 - digit) * 8, right: 8, bottom: (5 - digit) * 8 + 8 }; // get "frame"
          this.cntDownBmp.drawToRect(this.targetBitmap, digRect, srcRect);
        }
      } else if (l.particleTimer > 0) {
        // check explosiondrawing if the lemming is already dead
        this.drawParticles(l);
      }
    }

    // ORIGINAL: "todo: i do not like the next lines being here" -- HitTest influences the RightClickGlitch state!
    this.hitTest();
    this.toolbar.setInfoLemmingsOut(this.lemmingsOut);
  }

  private eraseReplayCursor(): void {
    if (this.hyperSpeed || !this.replaying || !this.replayCursor.erasable) return;
    if (!rectIsEmpty(this.replayCursor.previousDrawRect)) {
      this.world.drawToRect(this.targetBitmap, this.replayCursor.previousDrawRect, this.replayCursor.previousDrawRect);
      this.replayCursor.previousDrawRect = rect(0, 0, 0, 0);
    }
    this.world.drawToRect(this.targetBitmap, this.replayCursor.drawRect, this.replayCursor.drawRect);
  }

  private drawReplayCursorCheck(): void {
    if (this.hyperSpeed || !this.replayCursor.visible) return;
    this.replayCursor.bitmap?.drawTo(this.targetBitmap, this.replayCursor.position.x, this.replayCursor.position.y);
    this.replayCursor.decrement();
  }

  private drawReplayCursor(x: number, y: number): void {
    this.replayCursor.activate(x, y);
    this.replayCursor.bitmap?.drawTo(this.targetBitmap, this.replayCursor.position.x, this.replayCursor.position.y);
  }

  /** N.B: high res messages do not need to erase */
  private eraseMessages(): void {
    if (this.hyperSpeed || this.messageList.length === 0 || this.gameOptions.has(GameOption.HighResolutionGameMessages)) return;
    for (const msg of this.messageList) {
      const dstRect = rect(msg.location.x, msg.location.y, msg.location.x + msg.buffer.width, msg.location.y + msg.buffer.height);
      if (rectsIntersect(this.world.boundsRect, dstRect)) this.world.drawToRect(this.targetBitmap, dstRect, dstRect);
    }
    // free the messages that have ended
    for (let i = this.messageList.length - 1; i >= 0; i--) if (this.messageList[i].ended) this.messageList.splice(i, 1);
  }

  private drawMessages(): void {
    if (this.hyperSpeed) return;
    if (this.gameOptions.has(GameOption.HighResolutionGameMessages)) {
      // the high resolution layer is drawn by the game screen
    } else {
      for (const msg of this.messageList) {
        if (msg.ended) continue;
        msg.buffer.drawTo(this.targetBitmap, msg.location.x, msg.location.y);
      }
    }
  }

  private drawToolbar(): void {
    if (this.hyperSpeed) return;
    this.toolbar.refreshInfo();
  }

  private drawMinimap(): void {
    if (this.hyperSpeed) return;
    this.toolbar.drawMinimap(this.minimapBuffer);
  }

  /* ---------------------------------------------------------------------------------------------- terrain changes */

  /** bricks are in the lemming area so will automatically be copied to the screen during drawlemmings */
  private layBrick(l: Lemming): void {
    let numPixelsFilled = 0;
    let x = l.xDelta === 1 ? l.xPos : l.xPos - 4;
    let i = 12 - l.numberOfBricksLeft;
    if (i < 0) i = 0;
    if (i > 11) i = 11;
    const c = (this.brickPixelColors[i] | ALPHA_TERRAIN) >>> 0;
    do {
      if (this.world.pixelS(x, l.yPos - 1) === 0) this.world.setPixelS(x, l.yPos - 1, c);
      numPixelsFilled++;
      x++;
    } while (numPixelsFilled !== 6);
  }

  private digOneRow(l: Lemming, y: number): boolean {
    let result = false;
    let n = 1;
    let x = l.xPos - 4;
    let yy = y;
    if (yy < 0) yy = 0;
    while (n <= 9) {
      if (this.hasPixelAt(x, yy)) {
        this.removePixelAt(x, yy);
        result = true;
      }
      n++;
      x++;
    }
    // fake draw mask in the minimap
    this.miniMap.setPixelS(Math.trunc(l.xPos / 16), Math.trunc(l.yPos / 8), 0);
    if (result) this.cueSoundEffect(this.soundIds.SFX_DIGGER);
    return result;
  }

  /* ---------------------------------------------------------------------------------------------- lemming actions */

  /**
   * This is the main lemming method, called by CheckLemmings().
   * The return value should return true if the lemming has to be checked by interactive objects.
   *  - Increment lemming animationframe
   *  - Call specialized action-method
   *  - Do *not* call this method for a removed lemming
   */
  private handleLemming(l: Lemming): boolean {
    this.handleLemmingCalls++;
    // next frame (except floating and digging which are handled differently)
    if (!l.actionIn(ACTION_BIT_FLOATING | ACTION_BIT_DIGGING)) {
      if (l.frame < l.maxFrame) {
        l.endOfAnimation = false;
        l.frame++;
      } else {
        l.endOfAnimation = true;
        if (l.animationType === LemmingAnimationType.Loop) l.frame = 0;
      }
    }
    const method = this.lemmingMethods[l.action];
    return method!(l);
  }

  private handleWalking(l: Lemming): boolean {
    l.xPos += l.xDelta;

    if (l.xPos >= LEMMING_MIN_X && l.xPos <= LEMMING_MAX_X) {
      if (this.hasPixelAt_ClipY(l.xPos, l.yPos, 0)) {
        // walk, jump, climb, or turn around
        let dy = 0;
        let newY = l.yPos;
        while (dy <= 6 && this.hasPixelAt_ClipY(l.xPos, newY - 1, -dy - 1)) {
          dy++;
          newY--;
        }
        if (dy > 6) {
          if (l.isClimber) this.transition(l, LemmingAction.Climbing);
          else this.turnAround(l);
          return true;
        } else {
          if (dy >= 3) {
            this.transition(l, LemmingAction.Jumping);
            newY = l.yPos - 2;
          }
          l.yPos = newY;
          this.checkForLevelTopBoundary(l);
          return true;
        }
      } else {
        // no pixel at feet: walk or fall downwards
        let dy = 1;
        while (dy <= 3) {
          l.yPos++;
          if (this.hasPixelAt_ClipY(l.xPos, l.yPos, dy)) break;
          dy++;
        }
        if (dy > 3) {
          // in this case, lemming becomes a faller
          l.yPos++;
          this.transition(l, LemmingAction.Falling);
        }
        if (l.yPos > LEMMING_MAX_Y) {
          this.removeLemming(l);
          this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
          return false;
        } else return true;
      }
    } else {
      // almost out of level bounds
      this.turnAround(l);
      return true;
    }
  }

  private handleJumping(l: Lemming): boolean {
    let dy = 0;
    while (dy < 2 && this.hasPixelAt_ClipY(l.xPos, l.yPos - 1, -dy - 1)) {
      dy++;
      l.yPos--;
    }
    if (dy < 2) this.transition(l, LemmingAction.Walking);
    this.checkForLevelTopBoundary(l);
    return true;
  }

  private handleDigging(l: Lemming): boolean {
    if (l.isNewDigger) {
      this.digOneRow(l, l.yPos - 2);
      this.digOneRow(l, l.yPos - 1);
      l.isNewDigger = false;
    } else {
      l.frame++;
      if (l.frame >= 16) l.frame = l.frame - 16;
    }

    if (l.frame === 0 || l.frame === 8) {
      const y = l.yPos;
      l.yPos++;
      if (l.yPos > LEMMING_MAX_Y) {
        // #EL 2020-02-23: we changed L.IsRemoved with RemoveLemming(). This was a small bug.
        this.removeLemming(l);
        this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
        return false;
      }
      if (!this.digOneRow(l, y)) this.transition(l, LemmingAction.Falling);
      else if (this.readObjectMap(l.xPos, l.yPos) === DOM_STEEL) {
        this.cueSoundEffect(this.soundIds.SFX_HITS_STEEL);
        this.transition(l, LemmingAction.Walking);
      }
      return true;
    } else return false;
  }

  private handleClimbing(l: Lemming): boolean {
    if (l.frame <= 3) {
      // check if we approached the top
      if (!this.hasPixelAt_ClipY(l.xPos, l.yPos - 7 - l.frame, 0)) {
        l.yPos = l.yPos - l.frame + 2;
        this.transition(l, LemmingAction.Hoisting);
        this.checkForLevelTopBoundary(l);
      }
      return true;
    } else {
      l.yPos--;
      // check for overhang or level top boundary
      if (l.yPos + l.frameTopDy < HEAD_MIN_Y || this.hasPixelAt_ClipY(l.xPos - l.xDelta, l.yPos - 8, -8)) {
        this.transition(l, LemmingAction.Falling, true);
        l.xPos += l.xDelta * 2;
      }
      return true;
    }
  }

  /** here the use of HasPixelAt rather than HasPixelAt_ClipY is correct */
  private handleDrowning(l: Lemming): boolean {
    if (l.endOfAnimation) this.removeLemming(l);
    else if (!this.hasPixelAt(l.xPos + 8 * l.xDelta, l.yPos)) l.xPos += l.xDelta;
    return false;
  }

  private handleHoisting(l: Lemming): boolean {
    if (l.frame <= 4) {
      l.yPos -= 2;
      this.checkForLevelTopBoundary(l);
      return true;
    } else if (l.endOfAnimation) {
      // Frame = 7
      this.transition(l, LemmingAction.Walking);
      this.checkForLevelTopBoundary(l);
      return true;
    }
    return false;
  }

  private handleBuilding(l: Lemming): boolean {
    // sound
    if (l.frame === 10 && l.numberOfBricksLeft <= 3) this.cueSoundEffect(this.soundIds.SFX_BUILDER_WARNING);

    // lay brick
    if (l.frame === 9 || (l.frame === 10 && l.numberOfBricksLeft === 9)) {
      this.layBrick(l);
      return false;
    } else if (l.frame === 0) {
      l.xPos += l.xDelta;
      l.yPos--;
      if (l.xPos <= LEMMING_MIN_X || l.xPos > LEMMING_MAX_X || this.hasPixelAt_ClipY(l.xPos, l.yPos - 1, -1)) {
        this.transition(l, LemmingAction.Walking, true); // turn around as well
        this.checkForLevelTopBoundary(l);
        return true;
      }

      l.xPos += l.xDelta;
      if (this.hasPixelAt_ClipY(l.xPos, l.yPos - 1, -1)) {
        this.transition(l, LemmingAction.Walking, true); // turn around as well
        this.checkForLevelTopBoundary(l);
        return true;
      }

      l.numberOfBricksLeft--;
      if (l.numberOfBricksLeft === 0) {
        this.transition(l, LemmingAction.Shrugging);
        this.checkForLevelTopBoundary(l);
        return true;
      }

      if (this.hasPixelAt_ClipY(l.xPos + l.xDelta * 2, l.yPos - 9, -9) || l.xPos <= LEMMING_MIN_X || l.xPos > LEMMING_MAX_X) {
        this.transition(l, LemmingAction.Walking, true); // turn around as well
        this.checkForLevelTopBoundary(l);
        return true;
      }

      // if builder too high he becomes a walker. will *not* turn around although it seems he should,
      // but the CheckForLevelTop fails because of a changed FrameTopDy
      if (l.yPos + l.frameTopDy < HEAD_MIN_Y) {
        this.transition(l, LemmingAction.Walking);
        this.checkForLevelTopBoundary(l);
      }
      return true;
    } else return true;
  }

  private handleBashing(l: Lemming): boolean {
    let index = l.frame;
    if (index >= 16) index -= 16;

    if (index >= 11 && index <= 15) {
      l.xPos += l.xDelta;

      if (l.xPos < LEMMING_MIN_X || l.xPos > LEMMING_MAX_X) {
        // outside leftside or outside rightside?
        this.transition(l, LemmingAction.Walking, true); // turn around as well
      } else {
        // check 3 pixels below the new position
        let dy = 0;
        while (dy < 3 && !this.hasPixelAt_ClipY(l.xPos, l.yPos, dy)) {
          dy++;
          l.yPos++;
        }
        if (dy === 3) this.transition(l, LemmingAction.Falling);
        else {
          // check steel or one way digging
          const frontObj = this.readObjectMap(l.xPos + l.xDelta * 8, l.yPos - 8);
          if (frontObj === DOM_STEEL) this.cueSoundEffect(this.soundIds.SFX_HITS_STEEL);
          if (
            frontObj === DOM_STEEL ||
            (frontObj === DOM_ONEWAYLEFT && l.xDelta !== -1) ||
            (frontObj === DOM_ONEWAYRIGHT && l.xDelta !== 1)
          )
            this.transition(l, LemmingAction.Walking, true); // turn around as well
        }
      }
      return true;
    } else {
      if (index >= 2 && index <= 5) {
        // frame 2..5 and 18..21 or used for masking
        this.applyBashingMask(l, index - 2);
        if (index === 5) this.cueSoundEffect(this.soundIds.SFX_BASHER);
        // special treatment frame 5 (see txt)
        if (l.frame === 5) {
          let n = 0;
          let x = l.xPos + l.xDelta * 8;
          const y = l.yPos - 6;
          // here the use of HasPixelAt rather than HasPixelAt_ClipY is correct
          while (n < 4 && !this.hasPixelAt(x, y)) {
            n++;
            x += l.xDelta;
          }
          if (n === 4) this.transition(l, LemmingAction.Walking);
        }
      }
      return false;
    }
  }

  private handleMining(l: Lemming): boolean {
    if (l.frame === 1) {
      this.applyMinerMask(l, 0, l.xPos + l.frameLeftDx, l.yPos + l.frameTopDy);
      return false;
    } else if (l.frame === 2) {
      this.applyMinerMask(l, 1, l.xPos + l.xDelta + l.frameLeftDx, l.yPos + 1 + l.frameTopDy);
      this.cueSoundEffect(this.soundIds.SFX_MINER);
      return false;
    } else if (l.frame === 3 || l.frame === 15) {
      l.xPos += l.xDelta;
      if (l.xPos < LEMMING_MIN_X || l.xPos > LEMMING_MAX_X) {
        this.transition(l, LemmingAction.Walking, true); // turn around as well
        return true;
      }

      l.xPos += l.xDelta;
      if (l.xPos < LEMMING_MIN_X || l.xPos > LEMMING_MAX_X) {
        this.transition(l, LemmingAction.Walking, true); // turn around as well
        return true;
      }

      if (l.frame === 3) {
        l.yPos++;
        if (l.yPos > LEMMING_MAX_Y) {
          this.removeLemming(l);
          this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
          return false;
        }
      }

      if (!this.hasPixelAt_ClipY(l.xPos, l.yPos, 0)) {
        this.transition(l, LemmingAction.Falling);
        return true;
      }

      const belowObj = this.readObjectMap(l.xPos, l.yPos);
      if (belowObj === DOM_STEEL) this.cueSoundEffect(this.soundIds.SFX_HITS_STEEL);

      // Emulating dos-original bug onewayright: a one-way wall pointing right is unminable in either
      // direction. (Optional Game Mechanic)
      const bug = hasMechanic(this.mechanics, Mechanic.MinerOneWayRightBug);
      if (bug) {
        if (belowObj === DOM_STEEL || (belowObj === DOM_ONEWAYLEFT && l.xDelta !== -1) || belowObj === DOM_ONEWAYRIGHT)
          this.transition(l, LemmingAction.Walking, true); // turn around as well
      } else {
        if (
          belowObj === DOM_STEEL ||
          (belowObj === DOM_ONEWAYLEFT && l.xDelta !== -1) ||
          (belowObj === DOM_ONEWAYRIGHT && l.xDelta !== 1)
        )
          this.transition(l, LemmingAction.Walking, true); // turn around as well
      }
      return true;
    } else if (l.frame === 0) {
      l.yPos++;
      if (l.yPos > LEMMING_MAX_Y) {
        this.removeLemming(l);
        this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
        return false;
      } else return true;
    } else return false;
  }

  private handleFalling(l: Lemming): boolean {
    if (l.fallen > 16 && l.isFloater) {
      this.transition(l, LemmingAction.Floating);
      return true;
    } else {
      let dy = 0;
      while (dy < 3 && !this.hasPixelAt_ClipY(l.xPos, l.yPos, dy)) {
        dy++;
        l.yPos++;
        if (l.yPos > LEMMING_MAX_Y) {
          this.removeLemming(l);
          this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
          return false;
        }
      }
      if (dy === 3) {
        l.fallen += 3;
        return true;
      } else {
        if (l.fallen > MAX_FALLDISTANCE) {
          this.transition(l, LemmingAction.Splatting);
          // ccexplore: the "return true" after SetToSplattering() is actually correct. It is in fact the
          // bug in DOS Lemmings that enables the "direct drop to exit".
          return true;
        } else {
          this.transition(l, LemmingAction.Walking);
          return true;
        }
      }
    }
  }

  private handleFloating(l: Lemming): boolean {
    l.frame = FloatParametersTable[l.floatParametersTableIndex].animationFrameIndex;
    let dy = FloatParametersTable[l.floatParametersTableIndex].dy;

    l.floatParametersTableIndex++;
    if (l.floatParametersTableIndex >= 16) l.floatParametersTableIndex = 8;

    if (dy <= 0) l.yPos += dy;
    else {
      let minY = 0;
      while (dy > 0) {
        if (this.hasPixelAt_ClipY(l.xPos, l.yPos, minY)) {
          this.transition(l, LemmingAction.Walking);
          return true;
        } else {
          l.yPos++;
          dy--;
          minY++;
        }
      }
      if (l.floatParametersTableIndex === 1) this.cueSoundEffect(this.soundIds.SFX_OPENUMBRELLA);
    }

    if (l.yPos > LEMMING_MAX_Y) {
      this.removeLemming(l);
      this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
      return false;
    } else return true;
  }

  private handleSplatting(l: Lemming): boolean {
    if (l.endOfAnimation) this.removeLemming(l);
    return false;
  }

  private handleExiting(l: Lemming): boolean {
    if (l.endOfAnimation) {
      this.removeLemming(l);
      this.lemmingsSaved++;
      this.toolbar.setInfoLemmingsOut(this.lemmingsOut);
      this.toolbar.setInfoLemmingsSaved(this.lemmingsSaved, this.maxNumLemmings, !this.miscOptions.has(MiscOption.LemmingsPercentages));
    }
    return false;
  }

  private handleVaporizing(l: Lemming): boolean {
    if (l.endOfAnimation) this.removeLemming(l);
    return false;
  }

  private handleBlocking(l: Lemming): boolean {
    if (!this.hasPixelAt_ClipY(l.xPos, l.yPos, 0)) {
      this.transition(l, LemmingAction.Walking);
      l.isBlocking = false;
      this.restoreMap(l);
    }
    return false;
  }

  private handleShrugging(l: Lemming): boolean {
    if (l.endOfAnimation) {
      this.transition(l, LemmingAction.Walking);
      return true;
    }
    return false;
  }

  private handleOhNoing(l: Lemming): boolean {
    if (l.endOfAnimation) {
      this.transition(l, LemmingAction.Exploding);
      return false;
    } else {
      let dy = 0;
      while (dy < 3 && !this.hasPixelAt_ClipY(l.xPos, l.yPos, dy)) {
        dy++;
        l.yPos++;
      }
      if (l.yPos > LEMMING_MAX_Y) {
        this.removeLemming(l);
        this.cueSoundEffect(this.soundIds.SFX_SILENTDEATH);
        return false;
      } else return true;
    }
  }

  private handleExploding(l: Lemming): boolean {
    if (l.endOfAnimation) {
      if (l.isBlocking) {
        l.isBlocking = false;
        this.restoreMap(l);
      }
      const below = this.readObjectMap(l.xPos, l.yPos);
      if (below !== DOM_STEEL && below !== DOM_WATER) this.applyExplosionMask(l);
      this.removeLemming(l);
      l.isExploded = true;
      l.particleTimer = PARTICLE_FRAMECOUNT;
      if (this.gameOptions.has(GameOption.ShowParticles)) this.particleFinishTimer = PARTICLE_FRAMECOUNT;
    }
    return false;
  }

  private checkForLevelTopBoundary(l: Lemming, localFrameTopDy = 0): boolean {
    let result = false;
    const dy = localFrameTopDy === 0 ? l.frameTopDy : localFrameTopDy;
    if (l.yPos + dy < HEAD_MIN_Y) {
      result = true;
      l.yPos = HEAD_MIN_Y - 2 - dy;
      this.turnAround(l);
      if (l.action === LemmingAction.Jumping) this.transition(l, LemmingAction.Walking);
    }
    return result;
  }

  private removeLemming(l: Lemming): void {
    l.isRemoved = true;
    this.lemmingsOut--;
    this.lemmingsRemoved++;
  }

  /* ---------------------------------------------------------------------------------------------- main loop */

  /** The main method: handling a single frame of the game. */
  internalUpdate(force: boolean, leaveHyperSpeed: boolean): void {
    this.updateCalls++;
    this.updateCallsSession++;
    if (this.isFinished) return;
    this.checkForGameFinished();

    // issue #14: replay iteration zero
    if (this.currentIteration === 0) this.checkForReplayAction();

    if ((force && this.hyperSpeed) || !(this.isPaused && this.replaying)) this.checkAdjustReleaseRate();

    if (this.isPaused && !force) {
      this.drawToolbar();
      this.drawMinimap();
      this.drawDebug();
      return;
    }

    this.incrementIteration();

    if (!this.hyperSpeed) {
      this.eraseLemmings();
      this.eraseReplayCursor();
      this.eraseMessages();
    }

    this.checkSpawnLemming();
    this.checkLemmings();
    this.checkUpdateNuking();
    this.updateInteractiveObjects();
    this.updateMessages();

    // when hyperspeed is terminated then copy complete world back into targetbitmap
    if (leaveHyperSpeed) {
      this.hyperSpeed = false;
      this.targetBitmap.assign(this.world);
      this.repaintSkillPanelButtons();
      if (this.targetBitmapsUpdatingSet) {
        this.targetBitmapsUpdatingSet = false;
        this.targetBitmap.endUpdate();
        this.toolbar.endUpdateImg();
      }
    }

    if (!this.hyperSpeed) {
      this.drawAnimatedObjects();
      this.drawLemmings();
      this.drawReplayCursorCheck();
      this.drawMessages();
      this.drawToolbar();
      this.drawMinimap();
      this.drawDebug();
    }

    this.checkForReplayAction();
    this.checkForPlaySoundEffect();

    // force update if raw explosion pixels drawn
    if (this.explodingPixelsUpdateNeeded) this.explodingPixelsUpdateNeeded = false;
  }

  private updateMessages(): void {
    if (this.hyperSpeed) return;
    if (this.gameOptions.has(GameOption.HighResolutionGameMessages)) this.highResolutionLayer.updateMessages();
    else {
      if (this.messageList.length === 0) return;
      for (const msg of this.messageList) msg.nextFrame();
    }
  }

  private incrementIteration(): void {
    this.currentIteration++;

    // pause glitch
    if (this.glitchPauseIterations <= 0 || !hasMechanic(this.mechanics, Mechanic.PauseGlitch)) this.clockFrame++;
    else if (this.glitchPauseIterations > 0) this.glitchPauseIterations--;

    if (this.particleFinishTimer > 0) this.particleFinishTimer--;

    if (this.clockFrame >= 17) {
      this.clockFrame = 0;
      this.seconds--;
      if (this.seconds < 0) {
        if (this.minutes > 0) {
          this.minutes--;
          this.seconds = 59;
        } else {
          this.minutes = 0;
          this.seconds = 0;
        }
      }
    } else if (this.clockFrame === 1) {
      this.toolbar.setInfoMinutes(this.minutes);
      this.toolbar.setInfoSeconds(this.seconds);
    }

    // hard coded dos frame numbers
    switch (this.currentIteration) {
      case 15:
        if (!this.isPaused) this.cueSoundEffect(this.soundIds.SFX_LETSGO);
        break;
      case 34:
        if (!this.isPaused) this.cueSoundEffect(this.soundIds.SFX_ENTRANCE);
        break;
      case 35:
        this.entrancesOpened = true;
        for (const entrance of this.entrances) {
          entrance.triggered = true;
          entrance.currentFrame = 1; // #EL 2020 corrected from 2 to 1
        }
        break;
      case 55:
        // prevent restart music after rewind
        if (this.startupMusicAfterEntrance) {
          this.startupMusicAfterEntrance = false;
          // prevent restart music if the music already started by user
          if (this.fSoundOpts.has(SoundOption.Music) && !this.soundMgr.musicIsPlaying(this.musicIndex)) this.soundMgr.playMusic(this.musicIndex);
        }
        break;
    }
  }

  /** draw after hyperspeed */
  private repaintSkillPanelButtons(): void {
    if (this.hyperSpeed) return;
    const t = this.toolbar;
    t.drawSkillCount(SkillPanelButton.Slower, this.currReleaseRate);
    t.drawSkillCount(SkillPanelButton.Faster, this.currReleaseRate);
    t.drawSkillCount(SkillPanelButton.Climber, this.currClimberCount);
    t.drawSkillCount(SkillPanelButton.Umbrella, this.currFloaterCount);
    t.drawSkillCount(SkillPanelButton.Explode, this.currBomberCount);
    t.drawSkillCount(SkillPanelButton.Blocker, this.currBlockerCount);
    t.drawSkillCount(SkillPanelButton.Builder, this.currBuilderCount);
    t.drawSkillCount(SkillPanelButton.Basher, this.currBasherCount);
    t.drawSkillCount(SkillPanelButton.Miner, this.currMinerCount);
    t.drawSkillCount(SkillPanelButton.Digger, this.currDiggerCount);
    for (let skill = SkillPanelButton.Climber; skill <= SkillPanelButton.Digger; skill++) t.drawButtonSelector(skill, skill === this.selectedSkill);
  }

  /** meant for both prioritized processskillassignment and hittest. returns number of hits. */
  prioritizedHitTest(cp: { x: number; y: number }, checkRightMouseButton: boolean): { count: number; lemming1: Lemming | null; lemming2: Lemming | null } {
    const prioActions =
      ACTION_BIT_BLOCKING | ACTION_BIT_BUILDING | ACTION_BIT_SHRUGGING | ACTION_BIT_BASHING | ACTION_BIT_MINING | ACTION_BIT_DIGGING | ACTION_BIT_OHNOING;
    let result = 0;
    let prioritized: Lemming | null = null;
    let nonPrioritized: Lemming | null = null;

    for (const l of this.lemmingList) {
      if (l.isRemoved) continue;
      const x = l.xPos + l.frameLeftDx;
      const y = l.yPos + l.frameTopDy;
      if (x <= cp.x && cp.x <= x + 12 && y <= cp.y && cp.y <= y + 12) {
        result++;
        if (l.actionIn(prioActions)) prioritized = l;
        else nonPrioritized = l;
      }
    }

    if (nonPrioritized !== null) this.lastNonPrioritizedLemming = nonPrioritized; // save for RightClickGlitch emulation

    const lemming1 = (this.rightMouseButtonHeldDown && checkRightMouseButton) || prioritized === null ? nonPrioritized : prioritized;
    const lemming2 = nonPrioritized;
    return { count: result, lemming1, lemming2 };
  }

  hitTest(): void {
    const { count, lemming1 } = this.prioritizedHitTest(this.cursorPoint, true);
    if (count > 0 && lemming1 !== null) {
      // get highlight text
      let txt: string;
      if (lemming1.isClimber && lemming1.isFloater) txt = GameTexts.SAthlete;
      else if (lemming1.isClimber) txt = GameTexts.SClimber;
      else if (lemming1.isFloater) txt = GameTexts.SFloater;
      else txt = GameTexts.LemmingActionStrings[lemming1.action];
      this.toolbar.setInfoCursorLemming(txt, count);
      this.currentCursor = GAME_CURSOR_LEMMING;
    } else {
      // no hit
      if (this.replaying) {
        if (!this.isLastRecordedRecordReached || this.glitchPauseIterations > 0) this.toolbar.setInfoAlternative(GameTexts.SGame_ToolBar_Replaying);
        else this.toolbar.setInfoAlternative(GameTexts.SGame_ToolBar_Replayed);
      } else this.toolbar.setInfoCursorLemming('', 0);
      this.currentCursor = GAME_CURSOR_DEFAULT;
    }
  }

  processSkillAssignment(checkRegainControl: boolean): Lemming | null {
    let result: Lemming | null = null;

    // convert selected skillpanel buttontype to action we have to assign
    const act = SkillPanelButtonToAction[this.selectedSkill];

    const hit = this.prioritizedHitTest(this.cursorPoint, true);
    let lemming1 = hit.lemming1;
    const lemming2 = hit.lemming2;
    if (hit.count > 0) {
      if (hasMechanic(this.mechanics, Mechanic.RightClickGlitch)) {
        // this is the RightClickGlitch emulation
        if (lemming1 === null) {
          lemming1 = this.lastNonPrioritizedLemming;
          this.assignmentIsRightClickGlitch = true;
        }
      }
      // ORIGINAL (note the missing begin/end):
      //   if Lemming1 <> nil then
      //     if checkRegainControl and fReplaying then
      //       RegainControl;
      //     Result := AssignSkill(Lemming1, Lemming2, act);
      if (lemming1 !== null) if (checkRegainControl && this.replaying) this.regainControl();
      result = this.assignSkill(lemming1, lemming2, act);
    }
    return result;
  }

  private replaySkillAssignment(item: ReplayItem): boolean {
    if (item.lemmingIndex < 0 || item.lemmingIndex >= this.lemmingList.length) {
      this.regainControl();
      this.view?.speak?.('ReplayFail', true);
      this.addFeedbackMessage('fail lem at ' + this.currentIteration);
      return false;
    }

    const storedLemming = this.lemmingList[item.lemmingIndex];
    const assignedAction = item.assignedSkill as LemmingAction;

    if (!AssignableSkills.has(assignedAction)) {
      this.regainControl();
      this.view?.speak?.('ReplayFail', true);
      this.addFeedbackMessage('fail skill at ' + this.currentIteration);
      return false;
    }

    // for antiques but nice (and just to be sure the right skill is selected in the skillpanel)
    const checkSel = ActionToSkillPanelButton[assignedAction];
    if (checkSel !== this.selectedSkill) this.btnInternalSelectOnly(checkSel);

    if ((item.flags & rf_UseLemming2) === 0) this.assignSkill(storedLemming, null, assignedAction);
    else this.assignSkill(storedLemming, storedLemming, assignedAction);

    this.replayMessageCounter++;
    if (this.replayMessageCounter >= MESSAGE_COLOR_COUNT) this.replayMessageCounter = 0;
    if (!this.hyperSpeed) {
      // some very old replays (0.0.7.0 and before that) did not store cursorposition, and there is crap inside it
      if (this.gameOptions.has(GameOption.ShowReplayCursor)) {
        if (item.hasValidCursorData) this.drawReplayCursor(item.cursorX, item.cursorY);
        else
          this.drawReplayCursor(storedLemming.xPos + storedLemming.frameLeftDx + 7, storedLemming.yPos + storedLemming.frameTopDy + 7); // best guess position
      }
      if (this.gameOptions.has(GameOption.ShowPhotoFlashReplayEffect)) storedLemming.photoFlashForReplay = true;
      if ((item.flags & rf_RightMouseGlitch) === 0) this.addReplayMessage(storedLemming, assignedAction);
      else this.addReplayMessage(storedLemming, assignedAction, 'glitch'); // show it was the glitch
    }

    // check if the lemming is in sync with the replay command
    if (item.lemmingX > 0 && item.lemmingY > 0 && (item.lemmingX !== storedLemming.xPos || item.lemmingY !== storedLemming.yPos)) {
      this.regainControl();
      this.view?.speak?.('ReplayFail', true);
      this.addFeedbackMessage('fail pos at ' + this.currentIteration);
      return false;
    }
    return true;
  }

  private replaySkillSelection(item: ReplayItem): void {
    this.btnInternalSelectOnly(item.selectedButton as SkillPanelButton);
  }

  /* ---------------------------------------------------------------------------------------------- buttons */

  /** minimize only possible when paused */
  btnSlower(minimize: boolean): void {
    if (!minimize) {
      if (this.releaseRateStatus !== ReleaseRateStatus.SlowingDown) this.recordReleaseRate(raf_StartDecreaseRR);
      this.releaseRateStatus = ReleaseRateStatus.SlowingDown;
    } else if (this.isPaused) {
      if (this.releaseRateStatus !== ReleaseRateStatus.SlowingDown) this.recordReleaseRate(raf_StartDecreaseRR);
      this.currReleaseRate = this.level.info.releaseRate;
      this.recordReleaseRate(raf_StopChangingRR);
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Faster, this.currReleaseRate);
      this.releaseRateStatus = ReleaseRateStatus.None;
    }
  }

  /** maximize only possible when paused */
  btnFaster(maximize: boolean): void {
    if (!maximize) {
      if (this.releaseRateStatus !== ReleaseRateStatus.SpeedingUp) this.recordReleaseRate(raf_StartIncreaseRR);
      this.releaseRateStatus = ReleaseRateStatus.SpeedingUp;
    } else if (this.isPaused) {
      if (this.releaseRateStatus !== ReleaseRateStatus.SpeedingUp) this.recordReleaseRate(raf_StartIncreaseRR);
      this.currReleaseRate = 99;
      this.recordReleaseRate(raf_StopChangingRR);
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Faster, this.currReleaseRate);
      this.releaseRateStatus = ReleaseRateStatus.None;
    }
  }

  btnStopChangingReleaseRate(): void {
    if (this.releaseRateStatus !== ReleaseRateStatus.None) {
      this.releaseRateStatus = ReleaseRateStatus.None;
      this.recordReleaseRate(raf_StopChangingRR);
    }
  }

  private selectSkillButton(btn: SkillPanelButton, recorded: SkillPanelButton): void {
    if (this.selectedSkill === btn) return;
    if (!this.hyperSpeed) this.toolbar.switchButtonSelector(this.selectedSkill, btn);
    this.selectedSkill = btn;
    this.recordSkillSelection(recorded);
    this.cueSoundEffect(this.soundIds.SFX_SKILLBUTTON);
  }

  btnClimber(): void {
    this.selectSkillButton(SkillPanelButton.Climber, SkillPanelButton.Climber);
  }

  btnUmbrella(): void {
    // ORIGINAL BUG (kept, it ends up in replay files): BtnUmbrella records the selection of the *climber* button
    this.selectSkillButton(SkillPanelButton.Umbrella, SkillPanelButton.Climber);
  }

  btnExplode(): void {
    this.selectSkillButton(SkillPanelButton.Explode, SkillPanelButton.Explode);
  }

  btnBlocker(): void {
    this.selectSkillButton(SkillPanelButton.Blocker, SkillPanelButton.Blocker);
  }

  btnBuilder(): void {
    this.selectSkillButton(SkillPanelButton.Builder, SkillPanelButton.Builder);
  }

  btnBasher(): void {
    this.selectSkillButton(SkillPanelButton.Basher, SkillPanelButton.Basher);
  }

  btnMiner(): void {
    this.selectSkillButton(SkillPanelButton.Miner, SkillPanelButton.Miner);
  }

  btnDigger(): void {
    this.selectSkillButton(SkillPanelButton.Digger, SkillPanelButton.Digger);
  }

  btnPause(mode: PauseCommandMode = PauseCommandMode.None): void {
    if (this.isPaused) return;

    this.isPaused = true;
    this.isPausedExt = mode === PauseCommandMode.PauseKey;
    if (this.gameOptions.has(GameOption.HighlightedPauseButton)) this.toolbar.setPauseHighlight(true);
    this.fastForward = false;

    if (this.currentIteration < 34 && hasMechanic(this.mechanics, Mechanic.PauseGlitch)) {
      if (this.replaying) {
        // regain control if pausing *earlier* than the current replay (maybe optional)
        const iteration = 34 - this.recorder.recordedGlitchPauseIterations;
        if (this.currentIteration < iteration) {
          this.glitchPauseIterations = 34 - this.currentIteration;
          this.recorder.recordedGlitchPauseIterations = this.glitchPauseIterations; // record it
          this.regainControl();
        }
      } else {
        // start pause keep track of glitch iterations
        if (this.glitchPauseIterations === 0) {
          this.glitchPauseIterations = 34 - this.currentIteration;
          this.recorder.recordedGlitchPauseIterations = this.glitchPauseIterations; // record it
        }
      }
    }

    this.recordStartPause();
  }

  btnPauseStop(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.isPausedExt = false;
    this.fastForward = false;
    if (this.gameOptions.has(GameOption.HighlightedPauseButton)) this.toolbar.setPauseHighlight(false);
    this.recordEndPause();
  }

  btnTogglePause(mode: PauseCommandMode = PauseCommandMode.None): void {
    if (!this.isPaused) this.btnPause(mode);
    else this.btnPauseStop();
  }

  btnNuke(): void {
    if (this.isNukedByUser) return;
    // next line of code is the NUKE GLITCH. Changing MaxNumLemmings also allows IN % to be calculated and
    // displayed in-game using the glitch calculation, just like the actual game
    if (hasMechanic(this.mechanics, Mechanic.NukeGlitch)) this.maxNumLemmings = this.lemmingsReleased;
    this.isNukedByUser = true;
    this.isExploderAssignInProgress = true;
    this.recordNuke();
    this.cueSoundEffect(this.soundIds.SFX_NUKE);
  }

  /* ---------------------------------------------------------------------------------------------- spawning, nuking */

  private checkSpawnLemming(): void {
    // ccexplore: in the DOS version, for a given RR, the number of frames from one release to the next
    // is (99 - RR) / 2 + 4 (truncating integer division, so RR 99 and RR 98 act identically).
    const calculateNextLemmingCountdown = (): number => {
      let result = 99 - this.currReleaseRate;
      if (result < 0) result += 256;
      return Math.trunc(result / 2) + 4;
    };

    if (!this.entrancesOpened || this.isNukedByUser) return;

    // NextLemmingCountdown is initialized to 20 before start of a level
    this.nextLemmingCountDown--;

    if (this.nextLemmingCountDown === 0) {
      this.nextLemmingCountDown = calculateNextLemmingCountdown();
      if (this.lemmingsReleased < this.maxNumLemmings) {
        if (this.entrances.length === 0) return; // prevent error when there are no entrances
        const entranceIndex = this.lemmingsReleased % 4;
        const ix = this.dosEntranceOrderTable[entranceIndex];
        const newLemming = new Lemming();
        newLemming.pixelCombine = this.combineLemming;
        this.lemmingList.push(newLemming);
        newLemming.listIndex = this.lemmingList.length - 1;
        newLemming.born = this.currentIteration;
        this.transition(newLemming, LemmingAction.Falling);
        newLemming.xPos = this.entrances[ix].obj.left + 24;
        // @Optional Game Mechanic
        if (hasMechanic(this.mechanics, Mechanic.EntranceX25)) newLemming.xPos++;
        newLemming.yPos = this.entrances[ix].obj.top + 14;
        newLemming.xDelta = 1;
        // these must be initialized to nothing
        newLemming.objectInFront = DOM_NONE;
        newLemming.objectBelow = DOM_NONE;
        this.lemmingsReleased++;
        this.lemmingsOut++;
        this.onLemmingReleased?.(newLemming, this.lemmingsReleased - 1);
      }
    }
  }

  /**
   * LemmixRL, not in the original: makes a lemming a climber and/or floater without using a skill (no count, sound
   * or replay record), with the same state and colours as when the skill is assigned.
   */
  grantPermanentAbilities(l: Lemming, climber: boolean, floater: boolean): void {
    if (climber) {
      l.isClimber = true;
      l.combineFlags = (l.combineFlags | COMBINE_FLAG_CLIMBER) & 0xff;
    }
    if (floater) {
      l.isFloater = true;
      l.combineFlags = (l.combineFlags | COMBINE_FLAG_FLOATER) & 0xff;
    }
    this.updatePixelCombine(l);
  }

  private checkUpdateNuking(): void {
    if (this.isNukedByUser && this.isExploderAssignInProgress) {
      // find first following non removed lemming
      while (this.indexOfLemmingToBeNuked < this.lemmingsReleased && this.lemmingList[this.indexOfLemmingToBeNuked].isRemoved)
        this.indexOfLemmingToBeNuked++;

      if (this.indexOfLemmingToBeNuked > this.lemmingsReleased - 1) this.isExploderAssignInProgress = false;
      else {
        const l = this.lemmingList[this.indexOfLemmingToBeNuked];
        if (l.explosionTimer === 0 && !l.actionIn(ACTION_BIT_SPLATTING | ACTION_BIT_EXPLODING)) l.explosionTimer = 79;
        this.indexOfLemmingToBeNuked++;
      }
    }
  }

  /** god modus, debugging procedure: click and create lemming */
  developerCreateLemmingAtCursorPoint(): void {
    if (!this.entrancesOpened || this.isNukedByUser) return;
    if (this.lemmingsReleased < this.maxNumLemmings) {
      const newLemming = new Lemming();
      this.lemmingList.push(newLemming);
      newLemming.listIndex = this.lemmingList.length - 1;
      newLemming.born = this.currentIteration;
      newLemming.pixelCombine = this.combineLemming;
      this.transition(newLemming, LemmingAction.Falling);
      newLemming.xPos = this.cursorPoint.x;
      newLemming.yPos = this.cursorPoint.y;
      newLemming.xDelta = 1;
      newLemming.objectInFront = DOM_NONE;
      newLemming.objectBelow = DOM_NONE;
      this.lemmingsReleased++;
      this.lemmingsOut++;
    }
  }

  /** god modus, all skills at maximum */
  developer99Skills(): void {
    this.currClimberCount = 99;
    this.currFloaterCount = 99;
    this.currBomberCount = 99;
    this.currBlockerCount = 99;
    this.currBuilderCount = 99;
    this.currBasherCount = 99;
    this.currMinerCount = 99;
    this.currDiggerCount = 99;
    const t = this.toolbar;
    t.drawSkillCount(SkillPanelButton.Climber, this.currClimberCount);
    t.drawSkillCount(SkillPanelButton.Umbrella, this.currFloaterCount);
    t.drawSkillCount(SkillPanelButton.Explode, this.currBomberCount);
    t.drawSkillCount(SkillPanelButton.Blocker, this.currBlockerCount);
    t.drawSkillCount(SkillPanelButton.Builder, this.currBuilderCount);
    t.drawSkillCount(SkillPanelButton.Basher, this.currBasherCount);
    t.drawSkillCount(SkillPanelButton.Miner, this.currMinerCount);
    t.drawSkillCount(SkillPanelButton.Digger, this.currDiggerCount);
  }

  /* ---------------------------------------------------------------------------------------------- sound */

  private checkForPlaySoundEffect(): void {
    if (this.hyperSpeed) return;
    if (this.soundsToPlay.length === 0) return;
    for (const i of this.soundsToPlay) this.soundMgr.playSound(i);
    this.soundsToPlay.length = 0;
  }

  /** save last sound. */
  private cueSoundEffect(soundId: number): void {
    if (soundId < 0 || this.hyperSpeed || !this.playing || !this.fSoundOpts.has(SoundOption.Sound)) return;
    if (this.soundsToPlay.length < 8) this.soundsToPlay.push(soundId); // i think we have some balance with the soundlib (overlapping sounds)
    if (this.isPaused) this.checkForPlaySoundEffect();
  }

  private adjustReleaseRate(delta: number): void {
    const n = restrict(this.currReleaseRate + delta, this.level.info.releaseRate, 99);
    if (n !== this.currReleaseRate) {
      this.currReleaseRate = n;
      if (!this.hyperSpeed) this.toolbar.drawSkillCount(SkillPanelButton.Faster, this.currReleaseRate);
    }
  }

  /* ---------------------------------------------------------------------------------------------- messages */

  private addReplayMessage(l: Lemming, assignedAction: LemmingAction, suffix = ''): void {
    if (!this.gameOptions.has(GameOption.ShowReplayMessages)) return;
    const text = GameTexts.LemmingReplayStrings[assignedAction] + suffix;
    if (this.gameOptions.has(GameOption.HighResolutionGameMessages)) {
      // x,y is converted to screen point, when high res
      const x = l.xPos;
      let y = l.yPos + l.frameTopDy - 8;
      if (assignedAction === LemmingAction.Exploding) y -= 8;
      const p = this.view ? this.view.bitmapToControl(x, y) : { x, y };
      this.messagesPlayedCount++;
      this.highResolutionLayer.addMessage(p.x, p.y, l.xDelta, -1, 34, text, this.selectReplayMessageTextColor());
    } else {
      const msg = new LowResolutionMessage();
      msg.duration = 32;
      const lb = l.getLocationBounds();
      msg.location = { x: lb.left, y: lb.top - 8 };
      msg.deltaX = l.xDelta;
      this.setLowResText(msg, text, this.selectReplayMessageTextColor());
      this.messagesPlayedCount++;
      this.messageList.push(msg);
    }
  }

  private setLowResText(msg: LowResolutionMessage, text: string, color: TColor32): void {
    msg.text = text;
    const bmp = this.view?.renderLowResText?.(text, color);
    msg.buffer = bmp ?? new Bitmap32(1, 1);
    msg.buffer.drawMode = DrawMode.Transparent;
  }

  addFeedbackMessage(s: string): void {
    if (!this.gameOptions.has(GameOption.ShowFeedbackMessages)) return;
    if (this.gameOptions.has(GameOption.HighResolutionGameMessages)) {
      const x = this.cursorPoint.x;
      const y = Math.trunc(GAME_BMPHEIGHT / 3);
      const p = this.view ? this.view.bitmapToControl(x, y) : { x, y };
      this.messagesPlayedCount++;
      this.highResolutionLayer.addMessage(p.x, p.y, 0, -1, 34, s, this.selectFeedbackMessageTextColor());
    } else {
      const msg = new LowResolutionMessage();
      msg.duration = 32;
      msg.deltaX = 0;
      this.setLowResText(msg, s, this.selectFeedbackMessageTextColor());
      msg.location = { x: this.cursorPoint.x - Math.trunc(msg.buffer.width / 2), y: 32 };
      this.messagesPlayedCount++;
      this.messageList.push(msg);
    }
  }

  /* ---------------------------------------------------------------------------------------------- recording */

  /** Records the start of a pause session. When the previous record is raf_Pausing or raf_StartPause we do *not* record it. */
  private recordStartPause(): void {
    const last = this.recorder.lastOrDefault();
    const prevOk = !last || (last.actionFlags & (raf_Pausing | raf_StartPause)) === 0;
    if (!this.playing || this.replaying || !prevOk) return;
    const r = this.recorder.add();
    r.iteration = this.currentIteration;
    r.actionFlags = raf_StartPause;
    r.releaseRate = this.currReleaseRate;
  }

  /** Recording the end of a pause. Only allowed if there is a startpause-counterpart. */
  private recordEndPause(): void {
    const last = this.recorder.lastOrDefault();
    const prevOk = !last || (last.actionFlags & (raf_Pausing | raf_StartPause)) !== 0;
    if (!this.playing || this.replaying || !prevOk) return;
    const r = this.recorder.add();
    r.iteration = this.currentIteration;
    r.actionFlags = raf_EndPause;
    r.releaseRate = this.currReleaseRate;
  }

  /** Easy one: Record nuking. Always add new record. */
  private recordNuke(): void {
    if (!this.playing || this.replaying) return;
    const r = this.recorder.add();
    r.iteration = this.currentIteration;
    r.actionFlags = r.actionFlags | raf_Nuke;
    // Just in case: nuking is normally not possible when pausing, but it does no harm setting the flag
    if (this.isPaused) r.actionFlags = r.actionFlags | raf_Pausing;
    r.releaseRate = this.currReleaseRate;
  }

  /**
   * This is a tricky one. It can be done when pausing and when not pausing. The only valid parameters are
   * raf_StartIncreaseRR, raf_StartDecreaseRR, raf_StopChangingRR.
   */
  private recordReleaseRate(actionFlag: number): void {
    if (!this.playing || this.replaying) return;
    let r: ReplayItem;
    if (this.isPaused) {
      const last = this.recorder.lastOrDefault();
      // if empty add new record. never overwrite a startpause, so create a new one as well
      if (!last || (last.actionFlags & raf_StartPause) !== 0) r = this.recorder.add();
      else r = last;
    } else r = this.recorder.add(); // not paused, always create new record

    r.iteration = this.currentIteration;
    r.releaseRate = this.currReleaseRate;
    r.actionFlags = r.actionFlags | actionFlag;
    if (this.isPaused) r.actionFlags = r.actionFlags | raf_Pausing;
  }

  /** Always add new record. */
  private recordSkillAssignment(l: Lemming, aSkill: LemmingAction, usedLemming2: boolean, rightMouseGlitched: boolean): void {
    if (!this.playing || this.replaying) return;
    const item = this.recorder.add();
    item.iteration = this.currentIteration;
    item.actionFlags = raf_SkillAssignment;
    // assignment is possible during pause, although we should refrain from it
    if (this.isPaused) item.actionFlags = item.actionFlags | raf_Pausing;
    item.lemmingIndex = l.listIndex;
    item.releaseRate = this.currReleaseRate;
    item.assignedSkill = aSkill; // the byte is "compatible" for now
    item.lemmingX = l.xPos;
    item.lemmingY = l.yPos;
    item.cursorX = this.cursorPoint.x;
    item.cursorY = this.cursorPoint.y;
    if (usedLemming2) item.flags = item.flags | rf_UseLemming2;
    if (rightMouseGlitched) item.flags = item.flags | rf_RightMouseGlitch;
  }

  private recordSkillSelection(aSkill: SkillPanelButton): void {
    if (!this.playing || this.replaying) return;
    let r: ReplayItem;
    if (this.isPaused) {
      const last = this.recorder.lastOrDefault();
      // never overwrite startpause
      if (!last || (last.actionFlags & raf_StartPause) !== 0) r = this.recorder.add();
      else r = last;
    } else r = this.recorder.add();

    r.iteration = this.currentIteration;
    r.actionFlags = r.actionFlags | raf_SkillSelection;
    if (this.isPaused) r.actionFlags = r.actionFlags | raf_Pausing;
    r.releaseRate = this.currReleaseRate;

    switch (aSkill) {
      case SkillPanelButton.Climber:
        r.selectedButton = rsb_Climber;
        break;
      case SkillPanelButton.Umbrella:
        r.selectedButton = rsb_Umbrella;
        break;
      case SkillPanelButton.Explode:
        r.selectedButton = rsb_Explode;
        break;
      case SkillPanelButton.Blocker:
        r.selectedButton = rsb_Stopper;
        break;
      case SkillPanelButton.Builder:
        r.selectedButton = rsb_Builder;
        break;
      case SkillPanelButton.Basher:
        r.selectedButton = rsb_Basher;
        break;
      case SkillPanelButton.Miner:
        r.selectedButton = rsb_Miner;
        break;
      case SkillPanelButton.Digger:
        r.selectedButton = rsb_Digger;
        break;
    }
  }

  /** all records with the same iterationnumber must be handled here in one atomic moment. */
  private checkForReplayAction(): void {
    if (!this.replaying) return;
    const last = this.recorder.list.length - 1;

    if (this.replayIndex > last) this.isLastRecordedRecordReached = true;

    // note: since 2.1.0 skill assignments are optionally possible during pause, so we can have more than one action during a frame.
    while (this.replayIndex <= last) {
      const r = this.recorder.list[this.replayIndex]!; // a nil item (see Recorder.truncate) raises below, like the original
      // break if we go beyond the current iteration
      if (r.iteration !== this.currentIteration) break;

      if ((raf_Nuke & r.actionFlags) !== 0) this.btnNuke();
      if ((raf_SkillAssignment & r.actionFlags) !== 0) if (!this.replaySkillAssignment(r)) return;
      if ((raf_SkillSelection & r.actionFlags) !== 0) this.replaySkillSelection(r);
      if ((raf_StopChangingRR & r.actionFlags) !== 0) {
        this.btnStopChangingReleaseRate();
        if (r.releaseRate !== 0 && r.releaseRate !== this.currReleaseRate) this.adjustReleaseRate(r.releaseRate - this.currReleaseRate);
      } else if ((raf_StartIncreaseRR & r.actionFlags) !== 0) this.btnFaster(false);
      else if ((raf_StartDecreaseRR & r.actionFlags) !== 0) this.btnSlower(false);

      // check for changes (on fail we regain control)
      if (!this.replaying) return;

      // double check
      if (r.releaseRate > 0 && r.releaseRate !== this.currReleaseRate) this.adjustReleaseRate(r.releaseRate - this.currReleaseRate);

      this.replayIndex++;
    }
  }

  private checkLemmings(): void {
    if (this.lemmingList.length === 0) return;
    // the original "for in" enumerator re-reads the count on every step
    for (let i = 0; i < this.lemmingList.length; i++) {
      const l = this.lemmingList[i];
      let countDownReachedZero = false;
      // @particles
      if (l.particleTimer > 0) {
        l.particleTimer--;
        if (l.particleFrame < 50) l.particleFrame++; // #EL this solves the particle erase error
      }
      if (l.isRemoved) continue;
      if (l.explosionTimer !== 0) countDownReachedZero = this.updateExplosionTimer(l);
      if (countDownReachedZero) continue;
      const handleInteractiveObjects = this.handleLemming(l);
      if (handleInteractiveObjects) this.checkForInteractiveObjects(l);
    }
  }

  /** We will not, I repeat *NOT* simulate the original Nuke-error. #EL 2020: Ok ccexplore: here it is. */
  setGameResult(): void {
    const g = this.gameResultRec;
    g.cheated = this.isCheated;
    if (hasMechanic(this.mechanics, Mechanic.NukeGlitch)) g.lemmingCount = this.maxNumLemmings; // this is the glitch
    else g.lemmingCount = this.level.info.lemmingsCount;
    g.toRescue = this.level.info.rescueCount;
    g.rescued = this.lemmingsSaved;
    if (this.level.info.lemmingsCount === 0) g.target = 0;
    else g.target = Math.trunc((g.toRescue * 100) / this.level.info.lemmingsCount);
    if (g.lemmingCount === 0) g.done = 0;
    else g.done = Math.trunc((g.rescued * 100) / g.lemmingCount);
    if (g.cheated) {
      g.done = 100;
      g.rescued = g.lemmingCount;
    }
    g.success = g.done >= g.target;
  }

  /** Key routine. It jumps from replay into usercontrol. */
  regainControl(): void {
    if (this.replaying) {
      this.replaying = false;
      this.recorder.truncate(this.replayIndex);
      // special case: if the game is paused and the control is regained we have to append the lost (truncated) startpause record.
      if (this.isPaused) this.recordStartPause();
      this.replayIndex = 0;
    }
  }

  private hyperSpeedBegin(): void {
    if (!this.hyperSpeed) {
      this.hyperSpeed = true;
      this.fastForward = false;
      if (!this.targetBitmapsUpdatingSet) {
        this.targetBitmapsUpdatingSet = true;
        this.targetBitmap.beginUpdate();
        this.toolbar.beginUpdateImg();
      }
    }
  }

  private hyperSpeedEnd(): void {
    if (this.hyperSpeed) this.hyperSpeed = false;
  }

  /**
   * This method handles the updating of the moving interactive objects: entrances moving, continuously
   * moving objects like water, triggered objects (traps). It does not handle the drawing.
   */
  private updateInteractiveObjects(): void {
    // moving entrances?
    if (!this.entranceAnimationCompleted && this.currentIteration >= 35) {
      for (const inf of this.entrances) {
        if (inf.triggered) {
          inf.currentFrame++;
          if (inf.currentFrame >= inf.metaObj.animationFrameCount) {
            inf.currentFrame = 0;
            inf.triggered = false;
            this.entranceAnimationCompleted = true;
          }
        }
      }
    }

    // other objects
    for (const inf of this.objectInfos) {
      if (inf.triggered || inf.metaObj.animationType === oat_Continuous) inf.currentFrame++;
      if (inf.currentFrame >= inf.metaObj.animationFrameCount) {
        inf.currentFrame = 0;
        inf.triggered = false;
      }
    }
  }

  private checkAdjustReleaseRate(): void {
    switch (this.releaseRateStatus) {
      case ReleaseRateStatus.SlowingDown:
        this.adjustReleaseRate(-1);
        break;
      case ReleaseRateStatus.SpeedingUp:
        this.adjustReleaseRate(1);
        break;
    }
  }

  terminate(): void {
    this.isFinished = true;
    this.soundMgr.stopMusic(this.musicIndex);
    this.soundMgr.clearMusics();
  }

  finish(): void {
    this.terminate();
    if (this.onFinish) this.onFinish();
  }

  changeMusicVolume(up: boolean): void {
    const curr = this.soundMgr.getMusicVolume(this.musicIndex);
    if (up && curr <= 0.9) this.soundMgr.setMusicVolume(this.musicIndex, curr + 0.1);
    else if (curr >= 0.1) this.soundMgr.setMusicVolume(this.musicIndex, curr - 0.1);
  }

  cheat(): void {
    this.isCheated = true;
    this.finish();
  }

  /* ---------------------------------------------------------------------------------------------- bricks */

  private initializeBrickColors(aBrickPixelColor: TColor32): void {
    this.brickPixelColor = aBrickPixelColor >>> 0;
    for (let i = 0; i <= 11; i++) this.brickPixelColors[i] = aBrickPixelColor;
    if (!this.gameOptions.has(GameOption.GradientBridges)) return;

    const base = this.brickPixelColor;
    const setRGB = (i: number, r: number, g: number, b: number) => {
      // P^.R := ar etc.: the byte stores keep the alpha of the base color
      this.brickPixelColors[i] = ((this.brickPixelColors[i] & 0xff000000) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
    };

    // lighter
    let ar = (base >>> 16) & 0xff;
    let ag = (base >>> 8) & 0xff;
    let ab = base & 0xff;
    for (let i = 7; i <= 11; i++) {
      if (ar < 252) ar += 4;
      if (ag < 252) ag += 4;
      if (ab < 252) ab += 4;
      setRGB(i, ar, ag, ab);
    }

    // darker
    ar = (base >>> 16) & 0xff;
    ag = (base >>> 8) & 0xff;
    ab = base & 0xff;
    for (let i = 5; i >= 0; i--) {
      if (ar > 3) ar -= 4;
      if (ag > 3) ag -= 4;
      if (ab > 3) ab -= 4;
      setRGB(i, ar, ag, ab);
    }
  }

  /* ---------------------------------------------------------------------------------------------- recorder glue */

  /** The context the recorder needs when saving a replay (TRecorder accesses fGame directly). */
  recorderContext(): { mechanics: Mechanics; glitchPauseIterations: number; getLevelHash(): bigint; getLevelTitle(): string } {
    return {
      mechanics: this.mechanics,
      glitchPauseIterations: this.glitchPauseIterations,
      getLevelHash: () => this.levelLoadingInfo.getLevelHash(),
      getLevelTitle: () => this.level.info.title,
    };
  }

  /** TRecorder.SaveToStream */
  /** Recorder.SaveToStream (TRecorder.SaveToFile writes the stream to the file in a finally block). */
  saveReplay(s: ByteStream): void {
    this.recorder.saveToStream(this.recorderContext(), s);
  }
}

export { ensureRange };
