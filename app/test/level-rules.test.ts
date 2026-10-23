import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, Lemming, LemmingAction, type LemmingGame, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { hazardsText, levelHazards } from '../src/run/hazards.ts';
import { FINAL_LAP_SPEED, TEN_SECONDS } from '../src/run/level-rules.ts';
import { RunSession } from '../src/run/session.ts';
import { SKILLS, type SkillCounts } from '../src/run/skills.ts';

const data = repoDataProvider();
const catalog = new LevelCatalog(getStyle(data, StyleDef.Orig));

const SPREAD: SkillCounts = { climber: 6, floater: 6, bomber: 6, blocker: 6, builder: 12, basher: 8, miner: 8, digger: 8 };

/** a run on a level, with Power Cards */
function runOn(levelId: string, jokers: string[] = [], seed = 'TEST'): RunSession {
  const run = RunSession.newRun(catalog, seed);
  for (const sk of SKILLS) run.setAbility(sk, SPREAD[sk]);
  expect(run.finishAssignment()).toBe(true);
  run.state.blinds[0].levelId = levelId;
  jokers.forEach((id, i) => run.state.jokers.push({ uid: 900 + i, id }));
  return run;
}

/** the game of the current level, started, with the hooks of the run */
function startGame(run: RunSession): LemmingGame {
  const setup = run.startBlind();
  const session = createSessionFromInfo(
    data,
    catalog.get(setup.levelId).info,
    { view: { bitmapToControl: (x, y) => ({ x, y }), renderLowResText: (t) => new Bitmap32(t.length * 7, 14) } },
    (level) => run.applyToLevel(level),
  );
  const game = session.game;
  run.attach(game);
  game.start(false);
  return game;
}

function runTo(game: LemmingGame, iteration: number): void {
  while (game.currentIteration < iteration && !game.isFinished) game.update();
}

function finish(game: LemmingGame): void {
  for (let n = 0; n < 30000 && !game.isFinished; n++) game.update();
}

describe('Power Cards in the level', () => {
  it('Long Bridge gives every Builder 4 extra bridge blocks', () => {
    const bricks = (jokers: string[]) => {
      const game = startGame(runOn('Orig-1-01', jokers));
      runTo(game, 160);
      const walkers = game.lemmingList.filter((l) => l.action === LemmingAction.Walking);
      expect(walkers.length).toBeGreaterThan(1);
      game.setSkillCount(LemmingAction.Building, 2);
      for (const lemming of walkers.slice(0, 2)) expect(game.assignSkill(lemming, null, LemmingAction.Building)).toBe(lemming);
      return walkers.slice(0, 2).map((l) => l.numberOfBricksLeft);
    };

    expect(bricks([])).toEqual([12, 12]);
    expect(bricks(['longbridge'])).toEqual([16, 16]);
  });

  it('SplngErr: 0 to 6 lemmings drop in at the first splat, the same ones in every replay', () => {
    // Fun 2: without umbrellas every lemming splats
    const counts: number[] = [];
    for (let k = 0; k < 2; k++) {
      const run = runOn('Orig-1-02', ['splngerr']);
      const game = startGame(run);
      finish(game);
      const out = run.finishAttempt(game);
      expect(out.fates).toHaveLength(10);
      expect(game.lemmingList.length).toBe(10 + out.extra!);
      counts.push(out.extra!);
    }
    expect(counts[0]).toBe(counts[1]);
    expect(counts[0]).toBeLessThanOrEqual(6);
    // without the card nobody drops in
    const plain = runOn('Orig-1-02');
    const game = startGame(plain);
    finish(game);
    expect(game.lemmingList.length).toBe(10);
  });

  it('Paratroopers: the Floaters of the colony outside the squad drop in after 10 seconds, and count as the colony', () => {
    const run = runOn('Orig-1-02', ['paratroopers']);
    const setup = run.ensureSetup();
    const squad = new Set(setup.hand);
    const outside = run.state.colony.filter((c) => !squad.has(c.id)).slice(0, 4);
    for (const c of outside) c.floater = true;
    const game = startGame(run);
    runTo(game, TEN_SECONDS - 1);
    const before = game.lemmingList.length;
    runTo(game, TEN_SECONDS);
    expect(game.lemmingList.length).toBe(before + 4);
    expect(game.lemmingList.slice(-4).every((l) => l.isFloater)).toBe(true);
    // they land somewhere: 5 seconds later none of them fell out of the level
    runTo(game, TEN_SECONDS + 85);
    expect(game.lemmingList.slice(-4).every((l) => !l.isRemoved)).toBe(true);
    finish(game);
    const out = run.finishAttempt(game);
    expect(out.squad).toEqual([...setup.hand, ...outside.map((c) => c.id)]);
    expect(out.fates).toHaveLength(14);
    // floaters do not splat
    expect(out.fates.slice(10).every((f) => f !== 'splat')).toBe(true);
    expect(out.events).toContain('Paratroopers: 4 Floaters dropped in.');
  });

  it('sgnimmeL: a skill used goes to the closest other lemming too, and again in a rewind', () => {
    const run = runOn('Orig-1-01', ['sgnimmel']); // Fun 1: "Just dig!"
    const game = startGame(run);
    runTo(game, 160);
    const walkers = game.lemmingList.filter((l) => l.action === LemmingAction.Walking);
    expect(walkers.length).toBeGreaterThan(1);
    const before = game.skillCount(LemmingAction.Digging)!;
    expect(game.assignSkill(walkers[0], null, LemmingAction.Digging)).toBe(walkers[0]);
    expect(game.skillCount(LemmingAction.Digging)).toBe(before - 1);
    const digging = () => game.lemmingList.filter((l) => l.action === LemmingAction.Digging).length;
    expect(digging()).toBe(2);
    runTo(game, 200);
    // back before the assignment and forward again: the replay assigns it, and the copy comes again
    game.gotoIteration(150);
    expect(digging()).toBe(0);
    game.gotoIteration(200);
    expect(digging()).toBe(2);
    expect(game.skillCount(LemmingAction.Digging)).toBe(before - 1);
  });

  it('Full Spectrum: 4 hair colours saved within 10 seconds bring back a used skill', () => {
    const run = runOn('Orig-1-01', ['spectrum']);
    const setup = run.ensureSetup();
    const hairs = ['green', 'orange', 'red', 'purple'] as const;
    setup.hand.slice(0, 4).forEach((id, i) => (run.card(id)!.hair = hairs[i]));
    const game = startGame(run);
    game.setSkillCount(LemmingAction.Digging, setup.usable.digger - 2);
    const lemmings = hairs.map((_, i) => {
      const l = new Lemming();
      game.onLemmingReleased!(l, i);
      return l;
    });
    for (const l of lemmings.slice(0, 3)) game.onLemmingExited!(l);
    expect(game.skillCount(LemmingAction.Digging)).toBe(setup.usable.digger - 2);
    game.onLemmingExited!(lemmings[3]);
    expect(game.skillCount(LemmingAction.Digging)).toBe(setup.usable.digger - 1);
  });

  it('the Dead Lemmings Jogging Club and Final Lap make lemmings faster', () => {
    const run = runOn('Orig-1-01', ['jogging']);
    const game = startGame(run);
    const walker = new Lemming();
    walker.action = LemmingAction.Walking;
    expect(game.lemmingSpeed!(walker)).toBe(1);
    game.onLemmingAction!(new Lemming(), LemmingAction.Exploding);
    game.onLemmingAction!(new Lemming(), LemmingAction.Exploding);
    expect(game.lemmingSpeed!(walker)).toBeCloseTo(1.4);
    walker.action = LemmingAction.Building;
    expect(game.lemmingSpeed!(walker)).toBe(1);

    const lap = runOn('Orig-1-01', ['finallap']);
    const g2 = startGame(lap);
    expect(g2.lemmingSpeed!(walker)).toBe(1);
    g2.minutes = 0;
    g2.seconds = 30;
    expect(g2.lemmingSpeed!(walker)).toBe(FINAL_LAP_SPEED);

    // the extra steps: a faster game moves its lemmings more often
    const steps = (jokers: string[]) => {
      const g = startGame(runOn('Orig-1-01', jokers));
      // 40 seconds on the clock: the last 30 from frame 170
      g.minutes = 0;
      g.seconds = 40;
      runTo(g, 600);
      return g.handleLemmingCalls;
    };
    expect(steps(['finallap'])).toBeGreaterThan(2 * steps([]));
  });

  it('Purple Reign: purple-haired lemmings saved can find Boosts; Final Lap pays for Gold lemmings in the last 30 seconds', () => {
    const run = runOn('Orig-1-02', ['purplereign', 'finallap']);
    const setup = run.ensureSetup();
    for (const id of setup.hand) {
      const c = run.card(id)!;
      c.floater = true;
      c.hair = 'purple';
      c.edition = 'gold';
    }
    const game = startGame(run);
    // the whole level in the last 30 seconds
    game.minutes = 0;
    game.seconds = 30;
    finish(game);
    const out = run.finishAttempt(game);
    expect(out.rescued).toBe(10);
    expect(out.lapGold).toBe(10);
    const cash = run.accept();
    expect(cash.lines).toContainEqual({ label: 'Final Lap (10 Gold)', amount: 50 });
    expect(run.state.tarots.length).toBeGreaterThan(0);
    expect(cash.notes.some((n) => n.includes('(Purple Reign)'))).toBe(true);
  });

  it('a game outside a run is the original game: no hooks', () => {
    const run = runOn('Orig-1-01', ['sgnimmel', 'finallap', 'jogging']);
    const game = startGame(run);
    expect(game.onSkillAssigned).not.toBeNull();
    expect(game.lemmingSpeed).not.toBeNull();
    const plain = runOn('Orig-1-01');
    const g2 = startGame(plain);
    expect(g2.onSkillAssigned).toBeNull();
    expect(g2.lemmingSpeed).toBeNull();
  });
});

describe('the hazards of a level (Run Info)', () => {
  it('tells water, fire and traps from the objects of the level', () => {
    const style = getStyle(data, StyleDef.Orig);
    const h = (id: string) => hazardsText(levelHazards(style, data, catalog.get(id)));
    expect(h('Orig-1-01')).toBe('No water, fire or traps');
    expect(h('Orig-1-05')).toBe('Water');
    expect(h('Orig-1-06')).toBe('Fire');
    expect(h('Orig-1-17')).toBe('4 traps');
    expect(h('Orig-1-21')).toBe('Water, 1 trap');
  });
});
