/**
 * Saving the run and what the player has learned about the levels (in the browser's local storage). A run is saved
 * after every step, so closing the page never loses more than the level being played.
 */
import type { AttemptOutcome, RunState } from './state.ts';
import { RUN_VERSION } from './state.ts';
import { SKILLS, type SkillCounts, totalSkills } from './skills.ts';

const RUN_KEY = 'lemmixrl.run';
const META_KEY = 'lemmixrl.meta';

/** the player's best result on a level (over all runs) */
export interface LevelRecord {
  /** best % of the squad rescued */
  best: number;
  /** the skills of the accepted solution that used the fewest skills */
  fewest: SkillCounts | null;
  wins: number;
}

export interface Meta {
  levels: Record<string, LevelRecord>;
  runs: number;
  wins: number;
  bestAnte: number;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveRun(state: RunState | null): void {
  const st = storage();
  if (!st) return;
  try {
    if (state && state.phase !== 'over') st.setItem(RUN_KEY, JSON.stringify(state));
    else st.removeItem(RUN_KEY);
  } catch {
    // storage full or disabled: the run just isn't saved
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = storage()?.getItem(RUN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as RunState;
    return s.version === RUN_VERSION && Array.isArray(s.colony) ? s : null;
  } catch {
    return null;
  }
}

export function loadMeta(): Meta {
  try {
    const raw = storage()?.getItem(META_KEY);
    if (raw) return JSON.parse(raw) as Meta;
  } catch {
    // a broken record starts again
  }
  return { levels: {}, runs: 0, wins: 0, bestAnte: 0 };
}

export function saveMeta(meta: Meta): void {
  try {
    storage()?.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // not saved
  }
}

/** Remembers an accepted result of a level. */
export function recordLevel(meta: Meta, levelId: string, outcome: AttemptOutcome): void {
  const rec = meta.levels[levelId] ?? { best: 0, fewest: null, wins: 0 };
  rec.wins++;
  rec.best = Math.max(rec.best, outcome.hand > 0 ? Math.floor((outcome.rescued * 100) / outcome.hand) : 0);
  if (!rec.fewest || totalSkills(outcome.skillsUsed) < totalSkills(rec.fewest)) {
    rec.fewest = {} as SkillCounts;
    for (const s of SKILLS) rec.fewest[s] = outcome.skillsUsed[s];
  }
  meta.levels[levelId] = rec;
}
