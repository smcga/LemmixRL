/** What can kill a lemming in a level besides a fall: its water, fire and traps (from the objects of the level). */
import { type DataProvider, GraphicSet, Level, ote_Drown, ote_TriggeredTrap, ote_Vaporize, type Style } from '../../../engine/src/index.ts';
import type { RunLevel } from './catalog.ts';

export interface LevelHazards {
  water: boolean;
  fire: boolean;
  traps: number;
}

const cache = new Map<string, LevelHazards>();

/** The hazards of a level (what Lifeguard, Fire Blanket and the like are about). */
export function levelHazards(style: Style, provider: DataProvider, level: RunLevel): LevelHazards {
  const known = cache.get(level.id);
  if (known) return known;
  const lvl = new Level();
  level.info.loadLevel(lvl);
  const gs = new GraphicSet(style);
  gs.load(provider, lvl.info.graphicSet, lvl.info.graphicSetEx);
  const h: LevelHazards = { water: false, fire: false, traps: 0 };
  for (const obj of lvl.interactiveObjects) {
    const effect = (gs.metaObjectList[obj.identifier]?.triggerEffect ?? 0) & 0xff;
    if (effect === ote_Drown) h.water = true;
    else if (effect === ote_Vaporize) h.fire = true;
    else if (effect === ote_TriggeredTrap) h.traps++;
  }
  cache.set(level.id, h);
  return h;
}

/** "Water, 2 traps" (or "No water, fire or traps") */
export function hazardsText(h: LevelHazards): string {
  const parts = [...(h.water ? ['Water'] : []), ...(h.fire ? ['Fire'] : []), ...(h.traps ? [`${h.traps} trap${h.traps === 1 ? '' : 's'}`] : [])];
  return parts.length ? parts.join(', ') : 'No water, fire or traps';
}
