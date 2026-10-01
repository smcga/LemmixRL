/** Port of Dos.Consts.pas. Ordinal values match the Delphi enumerations (they are stored in replays). */

export const DOS_MINIMAP_WIDTH = 104;
export const DOS_MINIMAP_HEIGHT = 20;
export const DOS_FRAMES_PER_SECOND = 17;

export const DosMiniMapCorners = { left: 208, top: 18, right: 311, bottom: 37 };
export const DosMiniMapBounds = { left: 208, top: 18, right: 311 + 1, bottom: 37 + 1 };

export const GAME_BMPWIDTH = 1584;
export const GAME_BMPHEIGHT = 160;

export const DOS_OBJECT_ID_EXIT = 0;
export const DOS_OBJECT_ID_ENTRANCE = 1;

/** color used for "shape-only" masks */
export const clMask32 = 0x00ff00ff;

export enum LemmingAction {
  None = 0,
  Walking = 1,
  Jumping = 2,
  Digging = 3,
  Climbing = 4,
  Drowning = 5,
  Hoisting = 6,
  Building = 7,
  Bashing = 8,
  Mining = 9,
  Falling = 10,
  Floating = 11,
  Splatting = 12,
  Exiting = 13,
  Vaporizing = 14,
  Blocking = 15,
  Shrugging = 16,
  Ohnoing = 17,
  Exploding = 18,
}

export const LemmingActionNames = [
  'None', 'Walking', 'Jumping', 'Digging', 'Climbing', 'Drowning', 'Hoisting', 'Building', 'Bashing',
  'Mining', 'Falling', 'Floating', 'Splatting', 'Exiting', 'Vaporizing', 'Blocking', 'Shrugging',
  'Ohnoing', 'Exploding',
] as const;

export enum SkillPanelButton {
  None = 0,
  Slower = 1,
  Faster = 2,
  Climber = 3,
  Umbrella = 4,
  Explode = 5,
  Blocker = 6,
  Builder = 7,
  Basher = 8,
  Miner = 9,
  Digger = 10,
  Pause = 11,
  Nuke = 12,
}

export const ACTION_BIT_WALKING = 1 << LemmingAction.Walking;
export const ACTION_BIT_JUMPING = 1 << LemmingAction.Jumping;
export const ACTION_BIT_DIGGING = 1 << LemmingAction.Digging;
export const ACTION_BIT_CLIMBING = 1 << LemmingAction.Climbing;
export const ACTION_BIT_DROWNING = 1 << LemmingAction.Drowning;
export const ACTION_BIT_HOISTING = 1 << LemmingAction.Hoisting;
export const ACTION_BIT_BUILDING = 1 << LemmingAction.Building;
export const ACTION_BIT_BASHING = 1 << LemmingAction.Bashing;
export const ACTION_BIT_MINING = 1 << LemmingAction.Mining;
export const ACTION_BIT_FALLING = 1 << LemmingAction.Falling;
export const ACTION_BIT_FLOATING = 1 << LemmingAction.Floating;
export const ACTION_BIT_SPLATTING = 1 << LemmingAction.Splatting;
export const ACTION_BIT_EXITING = 1 << LemmingAction.Exiting;
export const ACTION_BIT_VAPORIZING = 1 << LemmingAction.Vaporizing;
export const ACTION_BIT_BLOCKING = 1 << LemmingAction.Blocking;
export const ACTION_BIT_SHRUGGING = 1 << LemmingAction.Shrugging;
export const ACTION_BIT_OHNOING = 1 << LemmingAction.Ohnoing;
export const ACTION_BIT_EXPLODING = 1 << LemmingAction.Exploding;

export const AssignableSkills: ReadonlySet<LemmingAction> = new Set([
  LemmingAction.Digging,
  LemmingAction.Climbing,
  LemmingAction.Building,
  LemmingAction.Bashing,
  LemmingAction.Mining,
  LemmingAction.Floating,
  LemmingAction.Blocking,
  LemmingAction.Exploding,
]);

export const ActionToSkillPanelButton: readonly SkillPanelButton[] = [
  SkillPanelButton.None, // None
  SkillPanelButton.None, // Walking
  SkillPanelButton.None, // Jumping
  SkillPanelButton.Digger, // Digging
  SkillPanelButton.Climber, // Climbing
  SkillPanelButton.None, // Drowning
  SkillPanelButton.None, // Hoisting
  SkillPanelButton.Builder, // Building
  SkillPanelButton.Basher, // Bashing
  SkillPanelButton.Miner, // Mining
  SkillPanelButton.None, // Falling
  SkillPanelButton.Umbrella, // Floating
  SkillPanelButton.None, // Splatting
  SkillPanelButton.None, // Exiting
  SkillPanelButton.None, // Vaporizing
  SkillPanelButton.Blocker, // Blocking
  SkillPanelButton.None, // Shrugging
  SkillPanelButton.None, // Ohnoing
  SkillPanelButton.Explode, // Exploding
];

export const SkillPanelButtonToAction: readonly LemmingAction[] = [
  LemmingAction.None, // None
  LemmingAction.None, // Slower
  LemmingAction.None, // Faster
  LemmingAction.Climbing, // Climber
  LemmingAction.Floating, // Umbrella
  LemmingAction.Exploding, // Explode
  LemmingAction.Blocking, // Blocker
  LemmingAction.Building, // Builder
  LemmingAction.Bashing, // Basher
  LemmingAction.Mining, // Miner
  LemmingAction.Digging, // Digger
  LemmingAction.None, // Pause
  LemmingAction.None, // Nuke
];

/**
 * TMechanic. NEVER change the ordinal values: the set is stored (as a 16 bit set) in replay files.
 * A TMechanics set is represented as a bit mask: bit n = mechanic with ordinal n.
 */
export enum Mechanic {
  DisableObjectsAfter15 = 0,
  MinerOneWayRightBug = 1,
  Obsolete = 2,
  SplattingExitsBug = 3,
  OldEntranceABBAOrder = 4,
  EntranceX25 = 5,
  FallerStartsWith3 = 6,
  Max4EnabledEntrances = 7,
  AssignClimberShruggerActionBug = 8,
  TriggeredTrapLemmixBugSolved = 9,
  NukeGlitch = 10,
  PauseGlitch = 11,
  RightClickGlitch = 12,
}

export type Mechanics = number;

export function mech(...items: Mechanic[]): Mechanics {
  let r = 0;
  for (const m of items) r |= 1 << m;
  return r;
}

export function hasMechanic(set: Mechanics, m: Mechanic): boolean {
  return (set & (1 << m)) !== 0;
}

export const MechanicDescriptions = [
  'Disabled objects after #15',
  'Miner One Way Right Bug',
  'Obsolete (must be on)',
  'Splatting Exits Bug',
  'Old Entrance ABBA Order',
  'Lemmings spawn at X=25',
  'Faller starts with 3 Falling pixels',
  'Max 4 Enabled Entrances',
  'Assign Climber Shrugger Action Bug',
  'TriggeredTrap LemmixBug Solved',
  'Optional Nuke Glitch',
  'Optional Pause Glitch',
  'Optional Right Click Glitch',
] as const;

export const DOSORIG_MECHANICS: Mechanics = mech(
  Mechanic.DisableObjectsAfter15,
  Mechanic.MinerOneWayRightBug,
  Mechanic.Obsolete,
  Mechanic.SplattingExitsBug,
  Mechanic.OldEntranceABBAOrder,
  Mechanic.FallerStartsWith3,
  Mechanic.Max4EnabledEntrances,
  Mechanic.AssignClimberShruggerActionBug,
  Mechanic.TriggeredTrapLemmixBugSolved,
);

export const DOSOHNO_MECHANICS: Mechanics = mech(
  Mechanic.DisableObjectsAfter15,
  Mechanic.MinerOneWayRightBug,
  Mechanic.Obsolete,
  Mechanic.SplattingExitsBug,
  Mechanic.FallerStartsWith3,
  Mechanic.EntranceX25,
  Mechanic.Max4EnabledEntrances,
  Mechanic.TriggeredTrapLemmixBugSolved,
);

export const CUSTLEMM_MECHANICS: Mechanics = mech(
  Mechanic.DisableObjectsAfter15,
  Mechanic.MinerOneWayRightBug,
  Mechanic.Obsolete,
  Mechanic.SplattingExitsBug,
  Mechanic.EntranceX25,
  Mechanic.Max4EnabledEntrances,
  Mechanic.TriggeredTrapLemmixBugSolved,
);

/** TMechanicsHelper.AsText */
export function mechanicsAsText(set: Mechanics, align: boolean, useBullets: boolean, useTabs: boolean): string {
  const bullet = useBullets ? '• ' : '';
  const sep = useTabs ? '\t' : ' : ';
  const lines: string[] = [];
  for (let m = 0; m < MechanicDescriptions.length; m++) {
    const d = align ? MechanicDescriptions[m].padEnd(35 + bullet.length) : MechanicDescriptions[m];
    lines.push(bullet + d + sep + ((set & (1 << m)) !== 0 ? 'yes' : 'no'));
  }
  return lines.join('\r\n').trimEnd();
}

/** TSoundEffect (Dos.Consts) */
export enum SoundEffect {
  None = 0,
  BuilderWarning,
  AssignSkill,
  Yippee,
  Splat,
  LetsGo,
  EntranceOpening,
  Vaporizing,
  Drowning,
  Explosion,
  HitsSteel,
  Ohno,
  SkillButtonSelect,
  RopeTrap,
  TenTonTrap,
  BearTrap,
  ElectroTrap,
  SpinningTrap,
  SquishingTrap,
  Miner,
  Digger,
  Basher,
  OpenUmbrella,
  SilentDeath,
  Nuke,
}

export const SoundEffectFileNames = [
  'None', 'BuilderWarning', 'AssignSkill', 'Yippee', 'Splat', 'LetsGo', 'EntranceOpening', 'Vaporizing',
  'Drowning', 'Explosion', 'HitsSteel', 'Ohno', 'SkillButtonSelect', 'RopeTrap', 'TenTonTrap', 'BearTrap',
  'ElectroTrap', 'SpinningTrap', 'SquishingTrap', 'Miner', 'Digger', 'Basher', 'OpenUmbrella', 'SilentDeath',
  'Nuke',
] as const;
