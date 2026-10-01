/**
 * The TypeScript counterpart of oracle/driver/OracleGameDump.inc: writes the complete simulation state
 * of a LemmingGame in exactly the same canonical text format.
 */
import type { LemmingGame } from '../../engine/src/game/game.ts';

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function fnvStr(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), FNV_PRIME) >>> 0;
  return h;
}

export function fnvWords(bits: Uint32Array): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < bits.length; i++) h = Math.imul(h ^ bits[i], FNV_PRIME) >>> 0;
  return h;
}

export function fnvBytes(bits: Uint8Array): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < bits.length; i++) h = Math.imul(h ^ bits[i], FNV_PRIME) >>> 0;
  return h;
}

const b = (v: boolean) => (v ? '1' : '0');

/** Access to the private parts of the game (the dump is instrumentation, like the Pascal include). */
type Internals = {
  dosEntranceOrderTable: number[];
  style: { lemmingAnimationSet: { metaLemmingAnimationList: unknown[] } };
};

export function dumpGame(game: LemmingGame, full: boolean, out: string[]): void {
  const g = game;
  const inner = game as unknown as Internals;
  const lastNP = g.lastNonPrioritizedLemming ? g.lastNonPrioritizedLemming.listIndex : -1;
  const r = g.gameResultRec;
  const order = inner.dosEntranceOrderTable;
  out.push(
    'G ' +
      [
        g.currentIteration, g.clockFrame, g.minutes, g.seconds,
        g.lemmingsReleased, g.lemmingsOut, g.lemmingsSaved, g.lemmingsRemoved,
        g.maxNumLemmings, g.currReleaseRate, g.releaseRateStatus,
        g.currClimberCount, g.currFloaterCount, g.currBomberCount, g.currBlockerCount,
        g.currBuilderCount, g.currBasherCount, g.currMinerCount, g.currDiggerCount,
        g.selectedSkill, b(g.isPaused), b(g.isPausedExt), b(g.isNukedByUser),
        g.indexOfLemmingToBeNuked, b(g.isExploderAssignInProgress), b(g.isFinished),
        b(g.replaying), g.replayIndex, b(g.isLastRecordedRecordReached), b(g.hyperSpeed),
        b(g.entrancesOpened), b(g.entranceAnimationCompleted), g.nextLemmingCountDown,
        g.glitchPauseIterations, g.particleFinishTimer, g.mechanics & 0xffff,
        b(g.rightMouseButtonHeldDown), g.currentCursor, lastNP, b(g.assignmentIsRightClickGlitch),
        g.cursorPoint.x, g.cursorPoint.y, b(g.fastForward), b(g.playing), b(g.isCheated),
        b(g.startupMusicAfterEntrance), g.targetIteration,
        g.recorder.recordedGlitchPauseIterations, g.recorder.currentMechanics & 0xffff,
        b(g.recorder.wasLoaded), b(g.recorder.wasSaved),
        order[0], order[1], order[2], order[3],
        g.lemmingList.length, g.updateCalls, g.updateCallsSession, g.handleLemmingCalls,
        r.lemmingCount, r.toRescue, r.rescued, r.target, r.done, b(r.success), b(r.cheated), b(r.timeIsUp),
      ].join(' '),
  );

  let h = FNV_OFFSET;
  const lmaList = inner.style.lemmingAnimationSet.metaLemmingAnimationList;
  for (const l of g.lemmingList) {
    const lmaIx = l.lma ? lmaList.indexOf(l.lma) : -1;
    const s =
      'L ' +
      [
        l.listIndex, l.xPos, l.yPos, l.xDelta, l.fallen, l.explosionTimer, l.frame, l.maxFrame, l.animationType,
        l.frameTopDy, l.frameLeftDx, l.floatParametersTableIndex, l.numberOfBricksLeft, l.born, l.action, l.actionBits,
        l.objectBelow, l.objectInFront, b(l.endOfAnimation), b(l.isRemoved), b(l.isClimber), b(l.isFloater),
        b(l.isBlocking), b(l.isNewDigger), b(l.isExploded), b(l.photoFlashForReplay), l.combineFlags,
        l.particleTimer, l.particleFrame, Array.from(l.savedMap).join(','), lmaIx,
        `${l.rectToErase.left},${l.rectToErase.top},${l.rectToErase.right},${l.rectToErase.bottom}`,
      ].join(' ');
    if (full) out.push(s);
    h = fnvStr(h, s + '\n');
  }

  let s = 'O';
  for (const inf of g.objectInfos) s += ` ${inf.currentFrame},${b(inf.triggered)}`;
  if (full) out.push(s);
  h = fnvStr(h, s + '\n');

  s = 'E';
  for (const inf of g.entrances) s += ` ${inf.currentFrame},${b(inf.triggered)}`;
  if (full) out.push(s);
  h = fnvStr(h, s + '\n');

  out.push('X ' + h);
  out.push('H ' + fnvWords(g.world.bits) + ' ' + fnvBytes(g.objectMapBits) + ' ' + fnvWords(g.targetBitmap.bits));

  h = FNV_OFFSET;
  for (const item of g.recorder.list) {
    const rs = !item
      ? 'RI nil'
      : 'RI ' +
        [
          item.iteration, item.actionFlags, item.assignedSkill, item.selectedButton, item.releaseRate, item.lemmingIndex,
          item.lemmingX, item.lemmingY, item.cursorX, item.cursorY, item.flags, b(item.hasValidCursorData),
        ].join(' ');
    if (full) out.push(rs);
    h = fnvStr(h, rs + '\n');
  }
  out.push('R ' + g.recorder.list.length + ' ' + h);
}
