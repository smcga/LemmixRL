/**
 * Touch screens (LemmixRL, not in Lemmix): a tap on the level is a click with the left mouse button there, a little
 * forgiving because a finger is less precise than the mouse. Only engine code, so the tests can play it.
 */
import {
  ACTION_BIT_BASHING,
  ACTION_BIT_BLOCKING,
  ACTION_BIT_BUILDING,
  ACTION_BIT_DIGGING,
  ACTION_BIT_MINING,
  ACTION_BIT_OHNOING,
  ACTION_BIT_SHRUGGING,
  GameOption,
  hasMechanic,
  type Lemming,
  type LemmingGame,
  Mechanic,
} from '../../../engine/src/index.ts';

/** a tap this close to a lemming (in game pixels, outside its hit box) still selects it */
export const TOUCH_AIM_RADIUS = 8;

/** the actions TLemmingGame.PrioritizedHitTest prefers (the workers); lemmings doing anything else are non-prioritized */
const PRIORITIZED_ACTIONS =
  ACTION_BIT_BLOCKING | ACTION_BIT_BUILDING | ACTION_BIT_SHRUGGING | ACTION_BIT_BASHING | ACTION_BIT_MINING | ACTION_BIT_DIGGING | ACTION_BIT_OHNOING;

/**
 * The point in the middle of the hit box of the lemming nearest to p (within radius of its box), if any; only
 * non-prioritized lemmings when nonPrioritizedOnly.
 */
export function nearestLemmingPoint(game: LemmingGame, p: { x: number; y: number }, radius: number, nonPrioritizedOnly = false): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const l of game.lemmingList) {
    if (l.isRemoved || (nonPrioritizedOnly && l.actionIn(PRIORITIZED_ACTIONS))) continue;
    // the hit box of TLemmingGame.PrioritizedHitTest: 13 x 13 pixels from the top left of the frame
    const x0 = l.xPos + l.frameLeftDx;
    const y0 = l.yPos + l.frameTopDy;
    const dx = p.x < x0 ? x0 - p.x : p.x > x0 + 12 ? p.x - x0 - 12 : 0;
    const dy = p.y < y0 ? y0 - p.y : p.y > y0 + 12 ? p.y - y0 - 12 : 0;
    const d = Math.hypot(dx, dy);
    if (d <= radius && d < bestD) {
      bestD = d;
      best = { x: x0 + 6, y: y0 + 6 };
    }
  }
  return best;
}

export interface TouchTapOptions {
  /** select the non-prioritized lemming (a walker rather than a worker), as a click with the right mouse button held */
  selectWalker: boolean;
  /** GameOption.AlwaysRegainControlOnMouseClick */
  alwaysRegainControl: boolean;
}

/**
 * A tap at a point of the level bitmap: what TPlayerScreen.Img_MouseDown does for a left click there (the right mouse
 * button held when selectWalker). When no lemming that the click would select is under the finger, the tap aims at the
 * nearest one. The game sees an ordinary cursor point, and replays record the assignment as usual. Returns the lemming
 * that got the skill.
 */
export function touchTapAt(game: LemmingGame, b: { x: number; y: number }, o: TouchTapOptions): Lemming | null {
  if (o.alwaysRegainControl) game.regainControl();
  game.rightMouseButtonHeldDown = o.selectWalker;
  // TPlayerScreen.SetAdjustedGameCursorPoint
  let cp = { x: b.x - 3, y: b.y + 2 };
  if (game.prioritizedHitTest(cp, true).lemming1 === null) cp = nearestLemmingPoint(game, cp, TOUCH_AIM_RADIUS, o.selectWalker) ?? cp;
  game.cursorPoint = cp;
  const handleClick = (!game.isPaused || game.gameOptions.has(GameOption.SkillAssignmentsEnabledWhenPaused)) && !game.fastForward;
  if (!handleClick) return null;
  // With the right mouse button and only workers under the cursor, Lemmix assigns to no lemming at all, which raises
  // an exception when the skill is available (see "Differences with Lemmix" in the README). A tap does nothing then,
  // unless the right click glitch of the original (an optional mechanic) picks the last non-prioritized lemming.
  const hit = game.prioritizedHitTest(cp, true);
  if (hit.count > 0 && hit.lemming1 === null && !(hasMechanic(game.mechanics, Mechanic.RightClickGlitch) && game.lastNonPrioritizedLemming !== null))
    return null;
  return game.processSkillAssignment(!o.alwaysRegainControl);
}
