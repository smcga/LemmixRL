/**
 * Random game script generator for differential testing.
 *
 * The generator plays the level on the TypeScript engine while it generates the script, so it can aim
 * the cursor at lemmings that are actually there and pick skills that are available. The produced
 * script is then executed by the oracle (the original code) and both outputs are compared.
 *
 * Everything the player can do is exercised: skill selection and assignment (with and without the
 * right mouse button, with and without "regain control"), release rate changes (also while paused),
 * pausing (with the pause glitch window before frame 34), assignments while paused, hit tests, nuking,
 * rewinding and skipping (GotoIteration), replaying (Start(True)), regaining control during a replay,
 * saving and loading replay files (also damaged ones), finishing and cheating, and the developer commands (99 skills, creating
 * lemmings at the cursor).
 */
import { GameOption, LemmingAction, OptionalMechanic, SkillPanelButton } from '../../engine/src/index.ts';
import { DEFAULT_GAME_OPTIONS } from '../../engine/src/game/game.ts';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { TsScriptRunner } from './runner.ts';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What a case exercised (collected on the TypeScript engine after every step). */
export interface Coverage {
  /** bit per LemmingAction that occurred */
  actions: number;
  /** the game finished because the time was up / because all lemmings were accounted for */
  timeUp: number;
  allAccountedFor: number;
  nukes: number;
  /** steps where the code raised (in both engines, if the case passes) */
  exceptions: number;
  maxLemmings: number;
}

export interface GeneratedCase {
  style: string;
  section: number;
  level: number;
  seed: number;
  gameOptions: GameOption[];
  optionalMechanics: OptionalMechanic[];
  script: string[];
  tsOut: string[];
  coverage: Coverage;
}

const SKILLS = ['climber', 'umbrella', 'explode', 'blocker', 'builder', 'basher', 'miner', 'digger'] as const;

export interface GenerateOptions {
  style: string;
  section: number;
  level: number;
  seed: number;
  /** stop generating after this iteration */
  maxIteration?: number;
  /** upper bound for the number of script commands */
  maxCommands?: number;
  dir: string;
  full?: boolean;
}

function pickOptions(rng: () => number): { gameOptions: GameOption[]; optionalMechanics: OptionalMechanic[] } {
  const opts = new Set(DEFAULT_GAME_OPTIONS);
  const toggle = (o: GameOption, p: number) => {
    if (rng() < p) {
      if (opts.has(o)) opts.delete(o);
      else opts.add(o);
    }
  };
  // options that influence the simulation or the rendering of the target bitmap
  toggle(GameOption.ShowParticles, 0.25); // particles delay the end of the game
  toggle(GameOption.GradientBridges, 0.25);
  toggle(GameOption.ColorizeLemmings, 0.25);
  toggle(GameOption.HighResolutionGameMessages, 0.1);
  toggle(GameOption.ShowReplayMessages, 0.1);
  toggle(GameOption.ShowFeedbackMessages, 0.1);
  toggle(GameOption.HighlightedPauseButton, 0.2);
  toggle(GameOption.ShowPhotoFlashReplayEffect, 0.3);
  toggle(GameOption.ShowReplayCursor, 0.2);
  const mech: OptionalMechanic[] = [];
  if (rng() < 0.35) mech.push(OptionalMechanic.NukeGlitch);
  if (rng() < 0.35) mech.push(OptionalMechanic.PauseGlitch);
  if (rng() < 0.35) mech.push(OptionalMechanic.RighClickGlitch);
  return { gameOptions: [...opts].sort((a, b) => a - b), optionalMechanics: mech };
}

export function generateCase(g: GenerateOptions): GeneratedCase {
  const rng = mulberry32(g.seed * 7919 + g.section * 131 + g.level * 17 + g.style.length);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p: number) => rng() < p;
  const { gameOptions, optionalMechanics } = pickOptions(rng);

  const r = new TsScriptRunner({
    style: g.style,
    section: g.section,
    level: g.level,
    gameOptions,
    optionalMechanics,
    dir: g.dir,
    full: g.full,
  });
  const game = r.game;
  const coverage: Coverage = { actions: 0, timeUp: 0, allAccountedFor: 0, nukes: 0, exceptions: 0, maxLemmings: 0 };
  let wasFinished = false;
  let wasNuked = false;
  r.afterStep = () => {
    for (const l of game.lemmingList) if (!l.isRemoved) coverage.actions |= 1 << l.action;
    coverage.maxLemmings = Math.max(coverage.maxLemmings, game.lemmingList.length);
    if (game.isFinished && !wasFinished) {
      if (game.gameResultRec.timeIsUp) coverage.timeUp++;
      else coverage.allAccountedFor++;
    }
    wasFinished = game.isFinished;
    if (game.isNukedByUser && !wasNuked) coverage.nukes++;
    wasNuked = game.isNukedByUser;
  };
  const maxIteration = g.maxIteration ?? 4000;
  const maxCommands = g.maxCommands ?? 1500;

  // "god mode" cases also use the developer commands: all skills at 99 (many more assignments) and lemmings created at the cursor
  const god = chance(0.2);
  r.exec('start 0 0');
  let commands = 1;
  let rrChanging = 0;
  let saved = false;

  const skillCount = (s: (typeof SKILLS)[number]): number => {
    switch (s) {
      case 'climber':
        return game.currClimberCount;
      case 'umbrella':
        return game.currFloaterCount;
      case 'explode':
        return game.currBomberCount;
      case 'blocker':
        return game.currBlockerCount;
      case 'builder':
        return game.currBuilderCount;
      case 'basher':
        return game.currBasherCount;
      case 'miner':
        return game.currMinerCount;
      case 'digger':
        return game.currDiggerCount;
    }
  };

  const aimAtLemming = (): boolean => {
    const alive = game.lemmingList.filter((l) => !l.isRemoved);
    if (alive.length === 0) {
      if (chance(0.3)) r.exec(`cursor ${int(-20, 1600)} ${int(-10, 170)}`);
      return false;
    }
    const l = alive[int(0, alive.length - 1)];
    // the hit test box is [x .. x+12] x [y .. y+12] with x = XPos + FrameLeftDx, y = YPos + FrameTopDy
    const x = l.xPos + l.frameLeftDx + int(-2, 14);
    const y = l.yPos + l.frameTopDy + int(-2, 14);
    r.exec(`cursor ${x} ${y}`);
    return true;
  };

  /** damages the saved replay file, to test loading and replaying broken or odd files */
  const damageReplay = () => {
    const size = statSync(join(g.dir, 'replay.lrb')).size;
    const records = Math.max(0, Math.trunc((size - 64) / 32));
    for (let n = int(1, 3); n > 0; n--) {
      const q = rng();
      let ofs: number;
      let value: number;
      if (q < 0.15 || records === 0) {
        ofs = int(0, 63); // any header byte
        value = int(0, 255);
      } else if (q < 0.25) {
        ofs = 3; // version
        value = int(0, 4);
      } else if (q < 0.3) {
        ofs = 28; // glitch pause iterations
        value = int(0, 40);
      } else {
        const rec = 64 + 32 * int(0, records - 1);
        const field = [1, 5, 6, 7, 8, 9, 13, 17, 21, 25, 27, 29, 0][int(0, 12)];
        ofs = rec + field;
        switch (field) {
          case 7: // assigned skill
            value = int(0, 20);
            break;
          case 8: // selected button
            value = int(0, 13);
            break;
          case 13: // lemming index
            value = int(0, 90);
            break;
          case 29: // flags
            value = int(0, 3);
            break;
          case 0: // 'R'
            value = chance(0.5) ? 0x52 : int(0, 255);
            break;
          default:
            value = int(0, 255);
        }
      }
      r.exec(`poke $DIR/replay.lrb ${ofs} ${value}`);
    }
    if (chance(0.15)) r.exec(`cut $DIR/replay.lrb ${Math.max(0, size - int(1, 70))}`);
  };

  const assign = () => {
    aimAtLemming();
    // mostly skills that are still available
    let skill = SKILLS[int(0, SKILLS.length - 1)];
    if (chance(0.85)) {
      const avail = SKILLS.filter((s) => skillCount(s) > 0);
      if (avail.length) skill = avail[int(0, avail.length - 1)];
    }
    r.exec(`select ${skill}`);
    const rmb = chance(0.12);
    if (rmb) r.exec('rmb 1');
    if (chance(0.15)) r.exec('hittest');
    r.exec(`click ${chance(0.5) ? 1 : 0}`);
    if (rmb && chance(0.8)) r.exec('rmb 0');
    commands += 4;
  };

  while (!game.isFinished && game.currentIteration < maxIteration && commands < maxCommands) {
    const p = rng();
    commands++;
    if (game.isPaused) {
      // while paused: frames still tick (release rate changes continue), assignments are possible
      if (p < 0.3) r.exec(`update ${int(1, 5)}`);
      else if (p < 0.45) assign();
      else if (p < 0.55) r.exec(`${chance(0.5) ? 'faster' : 'slower'} ${chance(0.3) ? 1 : 0}`);
      else if (p < 0.6) r.exec('stoprr');
      else if (p < 0.65) r.exec(`goto ${Math.max(0, game.currentIteration + int(-3, 3))}`);
      else if (p < 0.7) r.exec(`togglepause ${int(0, 2)}`);
      else r.exec('unpause');
      continue;
    }
    if (rrChanging > 0) {
      rrChanging--;
      if (rrChanging === 0) {
        r.exec('stoprr');
        continue;
      }
    }
    if (p < 0.5) r.exec(`update ${int(1, game.currentIteration < 60 ? 6 : 25)}`);
    else if (p < 0.75) assign();
    else if (p < 0.8) {
      r.exec(`${chance(0.5) ? 'faster' : 'slower'} 0`);
      rrChanging = int(1, 4);
    } else if (p < 0.84) r.exec(`pause ${int(0, 2)}`);
    else if (p < 0.86) r.exec(`goto ${Math.max(0, game.currentIteration - int(1, 300))}`);
    else if (p < 0.875) r.exec(`goto ${game.currentIteration + int(1, 120)}`);
    else if (p < 0.885) r.exec('hittest');
    else if (p < 0.89) {
      if (game.currentIteration > 400 && chance(0.3)) r.exec('nuke');
    } else if (p < 0.9) {
      // replay what has been recorded so far
      r.exec('start 1 0');
    } else if (p < 0.905) {
      r.exec('save $DIR/replay.lrb');
      saved = true;
    } else if (p < 0.91) {
      if (saved) {
        if (chance(0.4)) damageReplay();
        r.exec('load $DIR/replay.lrb');
        r.exec('start 1 0');
      }
    } else if (p < 0.915) r.exec('regain');
    else if (p < 0.92) r.exec(`ff ${chance(0.5) ? 1 : 0}`);
    else if (p < 0.9205) r.exec(chance(0.5) ? 'finish' : 'cheat');
    else if (p < 0.93) r.exec(`cursor ${int(-20, 1600)} ${int(-10, 170)}`);
    else if (p < 0.94 && god) {
      if (chance(0.3)) r.exec('dev99');
      else {
        r.exec(`cursor ${int(0, 1599)} ${int(0, 159)}`);
        r.exec('devcreate');
      }
    } else r.exec(`update ${int(20, 80)}`);
  }
  // run a little further to see the effects of the last commands
  if (!game.isFinished) r.exec('update 30');
  r.exec('setresult');

  coverage.exceptions = r.out.filter((l) => l === 'EXC').length;
  return {
    style: g.style,
    section: g.section,
    level: g.level,
    seed: g.seed,
    gameOptions,
    optionalMechanics,
    script: r.script,
    tsOut: r.out,
    coverage,
  };
}

/** Lemming actions present in a TS full dump (for coverage statistics). */
export function actionsSeen(tsGame: { lemmingList: { action: LemmingAction }[] }): Set<LemmingAction> {
  return new Set(tsGame.lemmingList.map((l) => l.action));
}

export { SkillPanelButton };
