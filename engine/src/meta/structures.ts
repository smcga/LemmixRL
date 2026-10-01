/** Port of Meta.Structures.pas: translation of the DOS structures for terrain, objects and animations. */
import type { DosMetaObject, DosMetaTerrain } from '../dos/structures.ts';

// Object Animation Types
export const oat_None = 0;
export const oat_Triggered = 1;
export const oat_Continuous = 2;
export const oat_Once = 3;

// Object Trigger Effects (equal to the data inside the DOS files)
export const ote_None = 0;
export const ote_Exit = 1;
export const ote_BlockerLeft = 2;
export const ote_BlockerRight = 3;
export const ote_TriggeredTrap = 4;
export const ote_Drown = 5;
export const ote_Vaporize = 6;
export const ote_OneWayWallLeft = 7;
export const ote_OneWayWallRight = 8;
export const ote_Steel = 9;

// Object Sound Effects (equal to the data inside the DOS files)
export const ose_None = 0;
export const ose_SkillSelect = 1;
export const ose_Entrance = 2;
export const ose_LevelIntro = 3;
export const ose_SkillAssign = 4;
export const ose_OhNo = 5;
export const ose_ElectroTrap = 6;
export const ose_SquishingTrap = 7;
export const ose_Splattering = 8;
export const ose_RopeTrap = 9;
export const ose_HitsSteel = 10;
export const ose_Unknown = 11;
export const ose_Explosion = 12;
export const ose_SpinningTrap = 13;
export const ose_TenTonTrap = 14;
export const ose_BearTrap = 15;
export const ose_Exit = 16;
export const ose_Drowning = 17;
export const ose_BuilderWarning = 18;

export enum LemmingAnimationType {
  Loop = 0,
  Once = 1,
}

export class MetaAnimation {
  constructor(
    readonly description: string,
    readonly frameCount: number,
    readonly width: number,
    readonly height: number,
    readonly bitsPerPixel: number,
    readonly imageLocation: number,
  ) {}
}

export class MetaLemmingAnimation extends MetaAnimation {
  constructor(
    description: string,
    frameCount: number,
    width: number,
    height: number,
    bitsPerPixel: number,
    imageLocation: number,
    readonly animationType: LemmingAnimationType,
    readonly footX: number,
    readonly footY: number,
  ) {
    super(description, frameCount, width, height, bitsPerPixel, imageLocation);
  }
}

/** Masks and countdown digits. */
export class MetaExtraAnimation extends MetaAnimation {}

export class MetaTerrain {
  width = 0;
  height = 0;
  imageLocation = 0;

  assignFromDos(ter: DosMetaTerrain): void {
    this.width = ter.width;
    this.height = ter.height;
    this.imageLocation = ter.imageLoc;
  }
}

export class MetaObject {
  animationType = 0; // oat_xxxx
  startAnimationFrameIndex = 0;
  animationFrameCount = 0;
  width = 0;
  height = 0;
  animationFrameDataSize = 0;
  maskOffsetFromImage = 0;
  triggerLeft = 0;
  triggerTop = 0;
  triggerWidth = 0;
  triggerHeight = 0;
  triggerEffect = 0; // ote_xxxx
  animationFramesBaseLoc = 0;
  previewFrameIndex = 0;
  soundEffect = 0; // ose_xxxx

  assignFromDos(obj: DosMetaObject): void {
    this.animationType = obj.animationFlags;
    this.startAnimationFrameIndex = obj.startAnimationFrameIndex;
    this.animationFrameCount = obj.animationFrameCount;
    this.animationFrameDataSize = obj.animationFrameDataSize;
    this.maskOffsetFromImage = obj.maskOffsetFromImage;
    this.width = obj.width;
    this.height = obj.height;
    this.triggerLeft = obj.triggerLeft * 4; // encoded
    this.triggerTop = obj.triggerTop * 4 - 4; // encoded
    this.triggerWidth = obj.triggerWidth * 4; // encoded
    this.triggerHeight = obj.triggerHeight * 4; // encoded
    this.triggerEffect = obj.triggerEffectId;
    this.animationFramesBaseLoc = obj.animationFramesBaseLoc;
    if (obj.animationFrameDataSize === 0) throw new Error('Division by zero (object animation frame data size)');
    this.previewFrameIndex = Math.trunc((obj.previewImageLocation - obj.animationFramesBaseLoc) / obj.animationFrameDataSize);
    this.soundEffect = obj.soundEffectId;
  }
}
