/** The eight classic skills, in the order of the skill panel. */
import { LemmingAction, type LevelInfo, SkillPanelButton } from '../../../engine/src/index.ts';

export const SKILLS = ['climber', 'floater', 'bomber', 'blocker', 'builder', 'basher', 'miner', 'digger'] as const;
export type Skill = (typeof SKILLS)[number];
export type SkillCounts = Record<Skill, number>;

export const SKILL_NAMES: Record<Skill, string> = {
  climber: 'Climber',
  floater: 'Floater',
  bomber: 'Bomber',
  blocker: 'Blocker',
  builder: 'Builder',
  basher: 'Basher',
  miner: 'Miner',
  digger: 'Digger',
};

export const SKILL_PLURALS: Record<Skill, string> = {
  climber: 'Climbers',
  floater: 'Floaters',
  bomber: 'Bombers',
  blocker: 'Blockers',
  builder: 'Builders',
  basher: 'Bashers',
  miner: 'Miners',
  digger: 'Diggers',
};

/** the skill panel button of each skill (its icon in the panel) */
export const SKILL_BUTTONS: Record<Skill, SkillPanelButton> = {
  climber: SkillPanelButton.Climber,
  floater: SkillPanelButton.Umbrella,
  bomber: SkillPanelButton.Explode,
  blocker: SkillPanelButton.Blocker,
  builder: SkillPanelButton.Builder,
  basher: SkillPanelButton.Basher,
  miner: SkillPanelButton.Miner,
  digger: SkillPanelButton.Digger,
};

/** the action a replay records for an assignment of each skill */
export const SKILL_ACTIONS: Record<Skill, LemmingAction> = {
  climber: LemmingAction.Climbing,
  floater: LemmingAction.Floating,
  bomber: LemmingAction.Exploding,
  blocker: LemmingAction.Blocking,
  builder: LemmingAction.Building,
  basher: LemmingAction.Bashing,
  miner: LemmingAction.Mining,
  digger: LemmingAction.Digging,
};

const FIELDS = {
  climber: 'climberCount',
  floater: 'floaterCount',
  bomber: 'bomberCount',
  blocker: 'blockerCount',
  builder: 'builderCount',
  basher: 'basherCount',
  miner: 'minerCount',
  digger: 'diggerCount',
} as const satisfies Record<Skill, keyof LevelInfo>;

export function zeroSkills(): SkillCounts {
  return { climber: 0, floater: 0, bomber: 0, blocker: 0, builder: 0, basher: 0, miner: 0, digger: 0 };
}

export function skillsOf(info: LevelInfo): SkillCounts {
  const r = zeroSkills();
  for (const s of SKILLS) r[s] = info[FIELDS[s]];
  return r;
}

export function setSkills(info: LevelInfo, counts: SkillCounts): void {
  for (const s of SKILLS) info[FIELDS[s]] = counts[s];
}

export function totalSkills(c: SkillCounts): number {
  let n = 0;
  for (const s of SKILLS) n += c[s];
  return n;
}

/** "5 Blockers · 5 Bombers" (skills with a count, in panel order) */
export function describeSkills(c: SkillCounts, empty = 'no skills'): string {
  const parts: string[] = [];
  for (const s of SKILLS) if (c[s] > 0) parts.push(`${c[s]} ${c[s] === 1 ? SKILL_NAMES[s] : SKILL_PLURALS[s]}`);
  return parts.length ? parts.join(' · ') : empty;
}
