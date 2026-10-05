/**
 * The levels a run draws its blinds from: the 120 levels of the original Lemmings (Fun, Tricky, Taxing, Mayhem), with
 * the numbers of their level files. The order of the levels is the difficulty backbone of a run.
 */
import { delphiTrim, Level, type LevelLoadingInformation, type Style } from '../../../engine/src/index.ts';
import { type SkillCounts, skillsOf } from './skills.ts';

export interface RunLevel {
  /** "Orig-2-06": style, section and level number */
  id: string;
  info: LevelLoadingInformation;
  /** 0-based position in the whole level system (0 = Fun 1, 119 = Mayhem 30) */
  order: number;
  sectionName: string;
  /** 1-based level number in the section */
  number: number;
  title: string;
  lemmings: number;
  rescue: number;
  releaseRate: number;
  /** minutes */
  time: number;
  /** the skills of the level file: the original allocation */
  skills: SkillCounts;
}

export function levelId(styleName: string, section: number, level: number): string {
  return `${styleName}-${section + 1}-${String(level + 1).padStart(2, '0')}`;
}

export class LevelCatalog {
  readonly levels: RunLevel[] = [];
  private readonly byId = new Map<string, RunLevel>();

  constructor(readonly style: Style) {
    const level = new Level();
    let order = 0;
    for (const info of style.levelSystem.allLevels()) {
      info.loadLevel(level);
      const li = level.info;
      const l: RunLevel = {
        id: levelId(style.name, info.sectionIndex, info.levelIndex),
        info,
        order: order++,
        sectionName: info.section.sectionName,
        number: info.levelIndex + 1,
        title: delphiTrim(li.title),
        lemmings: li.lemmingsCount,
        rescue: li.rescueCount,
        releaseRate: li.releaseRate,
        time: li.timeLimit,
        skills: skillsOf(li),
      };
      this.levels.push(l);
      this.byId.set(l.id, l);
    }
  }

  get(id: string): RunLevel {
    const l = this.byId.get(id);
    if (!l) throw new Error('unknown level ' + id);
    return l;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }
}

/** "Fun 6" */
export function levelName(l: RunLevel): string {
  return `${l.sectionName} ${l.number}`;
}
