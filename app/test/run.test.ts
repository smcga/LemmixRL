import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { ANTE_BANDS, RunSession } from '../src/run/session.ts';
import { SKILLS, type SkillCounts, totalSkills, zeroSkills } from '../src/run/skills.ts';
import { ABILITY_CAP, ANTES, ATTEMPTS, BOSS_REASSIGN_POINTS, type RunState, START_ABILITY_POINTS, START_COLONY } from '../src/run/state.ts';

const data = repoDataProvider();
const catalog = new LevelCatalog(getStyle(data, StyleDef.Orig));

/** plays the current blind's level on the engine without any input, until the game ends */
function playIdle(run: RunSession) {
  const setup = run.startBlind();
  const session = createSessionFromInfo(
    data,
    catalog.get(setup.levelId).info,
    { view: { bitmapToControl: (x, y) => ({ x, y }), renderLowResText: (t) => new Bitmap32(t.length * 7, 14) } },
    (level) => run.applyToLevel(level),
  );
  const game = session.game;
  game.onLemmingReleased = run.releaseHook(game);
  game.start(false);
  for (let n = 0; n < 30000 && !game.isFinished; n++) game.update();
  return { game, outcome: run.finishAttempt(game) };
}

/** the abilities the tests start with (60 points) */
const SPREAD: SkillCounts = { climber: 6, floater: 6, bomber: 6, blocker: 6, builder: 12, basher: 8, miner: 8, digger: 8 };

/** a new run with its start points assigned (SPREAD) */
function started(seed = 'TEST'): RunSession {
  const run = RunSession.newRun(catalog, seed);
  for (const sk of SKILLS) run.setAbility(sk, SPREAD[sk]);
  expect(run.finishAssignment()).toBe(true);
  return run;
}

/** a run whose current blind is the given level */
function runOn(levelId: string, seed = 'TEST'): RunSession {
  const run = started(seed);
  run.state.blinds[0].levelId = levelId;
  return run;
}

/** pretends the current blind was won with every lemming saved (no engine); after a boss the abilities stay as they are */
function winCurrentBlind(run: RunSession, keepAbilities = true): void {
  const setup = run.startBlind();
  run.state.outcome = {
    success: true,
    rescued: setup.hand.length,
    required: setup.rescue,
    hand: setup.hand.length,
    fates: setup.hand.map(() => 'saved'),
    skillsUsed: zeroSkills(),
    secondsLeft: 60,
    timeUp: false,
    nuked: false,
    done: 100,
    target: 0,
  };
  setup.attempts = 1;
  run.state.phase = 'result';
  run.accept();
  run.cashOut();
  if (keepAbilities && run.assignment()) expect(run.finishAssignment()).toBe(true);
}

describe('roguelike run', () => {
  it('the catalog has the 120 levels of the original game with their allocations', () => {
    expect(catalog.levels.length).toBe(120);
    const fun6 = catalog.get('Orig-1-06');
    expect(fun6.title).toBe('A task for blockers and bombers');
    expect(fun6.skills).toMatchObject({ bomber: 5, blocker: 5, builder: 0 });
    expect(catalog.get('Orig-4-30').title).toBe('Rendezvous at the Mountain');
  });

  it('is determined by its seed', () => {
    const a = RunSession.newRun(catalog, 'SEED1');
    const b = RunSession.newRun(catalog, 'SEED1');
    expect(a.state.blinds).toEqual(b.state.blinds);
    expect(a.startBlind().hand).toEqual(b.startBlind().hand);
    expect(RunSession.newRun(catalog, 'SEED2').state.blinds).not.toEqual(a.state.blinds);
  });

  it('takes the blinds of every ante from its band, without repeating a level', () => {
    const run = RunSession.newRun(catalog, 'BANDS');
    const seen = new Set<string>();
    for (let ante = 1; ante <= ANTES; ante++) {
      expect(run.state.ante).toBe(ante);
      const [lo, hi] = ANTE_BANDS[ante - 1];
      const orders = run.state.blinds.map((b) => catalog.get(b.levelId).order);
      for (const o of orders) expect(o >= lo && o <= hi).toBe(true);
      // small < big < boss within the band
      expect(orders[0]).toBeLessThan(orders[2]);
      for (const b of run.state.blinds) {
        expect(seen.has(b.levelId)).toBe(false);
        seen.add(b.levelId);
      }
      for (let k = 0; k < 3; k++) {
        winCurrentBlind(run);
        if (run.state.phase === 'shop') run.nextRound();
      }
    }
    expect(run.state.phase).toBe('over');
    expect(run.state.won).toBe(true);
  });

  it('gives a level min(capability, allocation) of every skill, and rule breakers above the maximum', () => {
    const run = runOn('Orig-1-06'); // 5 bombers, 5 blockers
    run.state.capacity = { ...zeroSkills(), bomber: 3, blocker: 9, builder: 30 };
    expect(run.preview(0).usable).toEqual({ ...zeroSkills(), bomber: 3, blocker: 5 });
    run.state.jokers.push({ uid: 999, id: 'toolkit' });
    expect(run.preview(0).usable).toEqual({ ...zeroSkills(), bomber: 3, blocker: 5, builder: 1 });
  });

  it('draws a squad of min(colony, level lemmings) that stays the same for every attempt', () => {
    const run = runOn('Orig-1-06'); // 50 lemmings
    const setup = run.startBlind();
    expect(setup.hand.length).toBe(50);
    expect(new Set(setup.hand).size).toBe(50);
    run.state.phase = 'result';
    run.retry();
    expect(run.startBlind().hand).toEqual(setup.hand);
  });

  it('plays the original level: permanent floaters survive Fun 2, the others die and leave the colony', () => {
    const run = runOn('Orig-1-02'); // "Only floaters can survive this": 10 lemmings, 1 to rescue
    const setup = run.ensureSetup();
    for (const id of setup.hand.slice(0, 3)) run.card(id)!.floater = true;
    const { outcome } = playIdle(run);
    expect(outcome.success).toBe(true);
    expect(outcome.fates).toEqual(['saved', 'saved', 'saved', 'splat', 'splat', 'splat', 'splat', 'splat', 'splat', 'splat']);
    const cash = run.accept();
    expect(run.state.colony.length).toBe(START_COLONY - 7);
    expect(cash.lines).toEqual([
      { label: 'Small Blind defeated', amount: 3 },
      { label: `Unused attempts (${ATTEMPTS - 1})`, amount: ATTEMPTS - 1 },
    ]);
    run.cashOut();
    expect(run.state.money).toBe(4 + 3 + ATTEMPTS - 1);
    expect(run.state.phase).toBe('shop');
  });

  it('a failed attempt can be retried without losing lemmings', () => {
    const run = runOn('Orig-1-02');
    const { outcome } = playIdle(run); // no floaters: everybody splats
    expect(outcome.success).toBe(false);
    expect(() => run.accept()).toThrow();
    run.retry();
    expect(run.state.colony.length).toBe(START_COLONY);
    expect(run.state.phase).toBe('blinds');
  });

  it('jokers and insurance bring lost lemmings back', () => {
    const run = runOn('Orig-1-02');
    run.state.jokers.push({ uid: 900, id: 'crashmats' });
    const setup = run.ensureSetup();
    run.card(setup.hand[0])!.floater = true;
    playIdle(run);
    run.accept();
    expect(run.state.colony.length).toBe(START_COLONY);

    const run2 = runOn('Orig-1-02');
    const setup2 = run2.ensureSetup();
    run2.card(setup2.hand[0])!.floater = true;
    run2.card(setup2.hand[1])!.insured = true;
    run2.state.jokers.push({ uid: 901, id: 'hardhat' });
    playIdle(run2);
    run2.accept();
    expect(run2.state.colony.length).toBe(START_COLONY - 7); // 9 died: 1 insured, 1 hard hat
    expect(run2.card(setup2.hand[1])!.insured).toBe(false);
  });

  it('pays the rescue bonus, gold lemmings, jokers and interest', () => {
    const run = runOn('Orig-1-02');
    run.state.money = 23;
    run.state.jokers.push({ uid: 902, id: 'nolem' });
    const setup = run.ensureSetup();
    for (const id of setup.hand) run.card(id)!.floater = true;
    run.card(setup.hand[0])!.edition = 'gold';
    const { outcome } = playIdle(run);
    expect(outcome.rescued).toBe(10);
    const cash = run.accept();
    expect(cash.lines).toEqual([
      { label: 'Small Blind defeated', amount: 3 },
      { label: 'Unused attempts (2)', amount: 2 },
      { label: 'Rescue bonus (100%)', amount: 4 },
      { label: 'Perfect rescue', amount: 2 },
      { label: 'Gold lemmings (1)', amount: 2 },
      { label: 'Leave No Lem Behind', amount: 3 },
      { label: 'Interest ($1 per $5)', amount: 4 },
    ]);
    expect(cash.total).toBe(20);
  });

  it('champions multiply the rescue bonus', () => {
    const run = runOn('Orig-1-02');
    const setup = run.ensureSetup();
    for (const id of setup.hand) run.card(id)!.floater = true;
    run.card(setup.hand[0])!.edition = 'champion';
    run.card(setup.hand[1])!.edition = 'champion';
    playIdle(run);
    const cash = run.accept();
    expect(cash.lines).toContainEqual({ label: 'Rescue bonus (100%) x3', amount: 12 });
  });

  it('the boss can be rerolled once per ante, to another level of the band', () => {
    const run = started('BOSS');
    run.state.money = 20;
    const before = run.state.blinds[2].levelId;
    expect(run.rerollBoss()).toBe(true);
    const after = run.state.blinds[2].levelId;
    expect(after).not.toBe(before);
    const [lo, hi] = ANTE_BANDS[0];
    expect(catalog.get(after).order >= lo && catalog.get(after).order <= hi).toBe(true);
    expect(run.state.money).toBe(14);
    expect(run.rerollBoss()).toBe(false);
  });

  it('skipping a blind gives its tag', () => {
    const run = started('SKIP');
    run.state.blinds[0].tag = 'recruits';
    run.skipBlind();
    expect(run.state.colony.length).toBe(START_COLONY + 8);
    expect(run.state.blinds[0].status).toBe('skipped');
    expect(run.state.blinds[1].status).toBe('current');
    // the boss cannot be skipped
    run.skipBlind();
    expect(run.skipBlind()).toEqual([]);
    expect(run.currentBlind!.kind).toBe('boss');
  });

  it('shop: buying, rerolling, recruits and selling', () => {
    const run = runOn('Orig-1-02');
    winCurrentBlind(run);
    run.state.money = 50;
    const shop = run.state.shop!;
    expect(shop.offers.length).toBe(3);
    run.state.shop!.offers[0] = { uid: 5000, type: 'training', id: 'training', skill: 'miner', amount: 3, price: 4, sold: false };
    const miners = run.state.capacity.miner;
    expect(run.buy(5000)).toBe(true);
    expect(run.state.capacity.miner).toBe(miners + 3);
    expect(run.buy(5000)).toBe(false);
    expect(run.rerollPrice()).toBe(2);
    run.reroll();
    expect(run.rerollPrice()).toBe(3);
    const n = run.state.colony.length;
    run.buyRecruits();
    expect(run.state.colony.length).toBe(n + 5);
    run.state.jokers.push({ uid: 6000, id: 'toolkit' });
    const money = run.state.money;
    run.sellJoker(6000);
    expect(run.state.money).toBe(money + 4);
  });

  it('tarots change the selected lemmings', () => {
    const run = started('TAROT');
    const [a, b] = run.state.colony;
    run.state.tarots.push({ uid: 7000, id: 'umbrella' }, { uid: 7001, id: 'manual', skill: 'basher' });
    expect(run.useTarot(7000, [a.id, b.id])).not.toBeNull();
    expect(a.floater && b.floater).toBe(true);
    const bashers = run.state.capacity.basher;
    run.useTarot(7001, [a.id]);
    expect(run.state.capacity.basher).toBe(bashers + 2);
    expect(run.card(a.id)).toBeUndefined();
    expect(run.state.tarots.length).toBe(0);
  });

  it('a tarot of the shop can be bought and used at once, without a free tarot slot', () => {
    const run = started();
    winCurrentBlind(run); // the shop
    const s = run.state;
    s.money = 10;
    s.tarots = [
      { uid: 6000, id: 'recruiter' },
      { uid: 6001, id: 'recruiter' },
    ];
    s.shop!.offers[0] = { uid: 5000, type: 'tarot', id: 'hermit', price: 3, sold: false };
    s.shop!.offers[1] = { uid: 5001, type: 'tarot', id: 'midas', price: 3, sold: false };
    expect(run.canBuy(s.shop!.offers[0])).toBe(false); // no room
    expect(run.canBuyAndUse(s.shop!.offers[0])).toBe(true);
    // The Hermit doubles what is left after paying for it
    expect(run.buyAndUse(5000)).not.toBeNull();
    expect(s.money).toBe(14);
    expect(s.shop!.offers[0].sold).toBe(true);
    expect(s.tarots.map((t) => t.uid)).toEqual([6000, 6001]);
    // a tarot that needs a lemming: without one nothing is bought
    expect(run.buyAndUse(5001)).toBeNull();
    expect(s.money).toBe(14);
    expect(s.shop!.offers[1].sold).toBe(false);
    expect(s.tarots.length).toBe(2);
    expect(run.buyAndUse(5001, [s.colony[0].id])).not.toBeNull();
    expect(s.colony[0].edition).toBe('gold');
    expect(s.money).toBe(11);
    // not twice, and not a joker
    expect(run.buyAndUse(5001, [s.colony[1].id])).toBeNull();
    s.shop!.offers[2] = { uid: 5002, type: 'joker', id: 'piggy', price: 5, sold: false };
    expect(run.canBuyAndUse(s.shop!.offers[2])).toBe(false);
  });

  it('tarots can be sold, and the jokers put in another order', () => {
    const run = started();
    const s = run.state;
    s.tarots = [{ uid: 6000, id: 'recruiter' }];
    s.jokers = [
      { uid: 7000, id: 'piggy' },
      { uid: 7001, id: 'guild' },
      { uid: 7002, id: 'scout' },
    ];
    const money = s.money;
    expect(run.sellTarot(6000)).toBe(true);
    expect(s.money).toBe(money + 1);
    expect(s.tarots.length).toBe(0);
    expect(run.sellTarot(6000)).toBe(false);
    expect(run.moveJoker(7000, 2)).toBe(true);
    expect(s.jokers.map((j) => j.id)).toEqual(['guild', 'scout', 'piggy']);
    expect(run.moveJoker(7002, 0)).toBe(true);
    expect(s.jokers.map((j) => j.id)).toEqual(['scout', 'guild', 'piggy']);
    expect(run.moveJoker(7002, 0)).toBe(false);
    expect(run.capability().builder).toBe(SPREAD.builder + 2); // the order changes nothing
    // not while the abilities are assigned
    s.tarots = [{ uid: 6001, id: 'recruiter' }];
    s.phase = 'assign';
    expect(run.sellTarot(6001)).toBe(false);
  });

  it('starts with the ability assignment: 60 points, at most 20 in a skill, all placed before the first blind', () => {
    const run = RunSession.newRun(catalog, 'ASSIGN');
    expect(run.state.phase).toBe('assign');
    expect(run.state.capacity).toEqual(zeroSkills());
    expect(run.assignment()).toEqual({ moved: 0, added: 0, left: START_ABILITY_POINTS });
    // the levels of the first ante are known, and what the team would bring follows the assignment
    expect(run.state.blinds.length).toBe(3);
    expect(run.preview(0).usable).toEqual(zeroSkills());
    run.setAbility('digger', 25);
    expect(run.state.capacity.digger).toBe(ABILITY_CAP);
    const p = run.preview(0);
    expect(p.usable.digger).toBe(Math.min(ABILITY_CAP, p.allocation.digger));
    expect(run.assignment()!.left).toBe(START_ABILITY_POINTS - ABILITY_CAP);
    // nothing else can happen before every point is placed
    expect(run.skipBlind()).toEqual([]);
    expect(run.canFinishAssignment()).toBe(false);
    expect(run.finishAssignment()).toBe(false);
    run.setAbility('builder', 20);
    run.setAbility('basher', 15);
    run.setAbility('miner', 9); // only 5 left
    expect(run.state.capacity.miner).toBe(5);
    run.setAbility('basher', 0); // freely changed: these are new points
    expect(run.assignment()).toEqual({ moved: 0, added: 45, left: 15 });
    run.resetAssignment();
    expect(totalSkills(run.state.capacity)).toBe(0);
    for (const sk of ['digger', 'builder', 'basher'] as const) run.setAbility(sk, 20);
    expect(run.finishAssignment()).toBe(true);
    expect(run.state.phase).toBe('blinds');
    expect(run.state.assign).toBeNull();
  });

  it('after every boss blind, up to 10 points move to other skills, with the next ante in view, before the shop', () => {
    const run = started('REASSIGN');
    for (let k = 0; k < 2; k++) {
      winCurrentBlind(run);
      run.nextRound();
    }
    winCurrentBlind(run, false); // the boss
    expect(run.state.phase).toBe('assign');
    expect(run.state.assign).toMatchObject({ reason: 'boss', newPoints: 0, reassign: BOSS_REASSIGN_POINTS, next: 'shop' });
    expect(run.state.ante).toBe(2);
    expect(run.state.blinds.map((b) => b.status)).toEqual(['current', 'upcoming', 'upcoming']);
    const [lo, hi] = ANTE_BANDS[1];
    for (const b of run.state.blinds) expect(catalog.get(b.levelId).order >= lo && catalog.get(b.levelId).order <= hi).toBe(true);
    // keeping everything is fine
    expect(run.canFinishAssignment()).toBe(true);
    // at most 10 points move; moved points must be placed again
    run.setAbility('builder', 0);
    expect(run.state.capacity.builder).toBe(SPREAD.builder - 10);
    run.setAbility('digger', 0); // no points left to move
    expect(run.state.capacity.digger).toBe(SPREAD.digger);
    expect(run.assignment()).toEqual({ moved: 10, added: 0, left: 10 });
    expect(run.canFinishAssignment()).toBe(false);
    run.setAbility('digger', SPREAD.digger + 4);
    run.setAbility('builder', SPREAD.builder - 6); // 4 of the 10 go back: only 6 moved now
    expect(run.assignment()).toEqual({ moved: 6, added: 4, left: 2 });
    run.setAbility('miner', 100);
    expect(run.state.capacity.miner).toBe(SPREAD.miner + 2);
    expect(run.finishAssignment()).toBe(true);
    expect(run.state.phase).toBe('shop');
    expect(run.state.shop).not.toBeNull();
    run.nextRound();
    expect([run.state.phase, run.state.ante, run.currentBlindIndex]).toEqual(['blinds', 2, 0]);
  });

  it('the cap only stops points from being added: a skill above it (training) keeps its points', () => {
    const run = started('CAP');
    run.state.capacity.digger = 23;
    run.state.jokers.push({ uid: 990, id: 'trainer' }, { uid: 991, id: 'advisor' });
    run.state.blinds[0].status = 'defeated';
    run.state.blinds[1].status = 'defeated';
    run.state.blinds[2].status = 'current';
    winCurrentBlind(run, false); // the boss
    // Personal Trainer: 5 new points; Careers Advisor: 5 more to move
    expect(run.state.assign).toMatchObject({ newPoints: 5, reassign: BOSS_REASSIGN_POINTS + 5 });
    expect(run.state.assign!.sources).toEqual(['Personal Trainer: +5 points', 'Careers Advisor: 5 more to move']);
    expect(run.canFinishAssignment()).toBe(false); // the 5 new points
    run.setAbility('digger', 30);
    expect(run.state.capacity.digger).toBe(23);
    run.setAbility('digger', 21);
    run.setAbility('digger', 23); // back up to what it had
    expect(run.state.capacity.digger).toBe(23);
    run.setAbility('climber', 30);
    expect(run.state.capacity.climber).toBe(SPREAD.climber + 5);
    expect(run.finishAssignment()).toBe(true);
  });

  it('Boot Camp and The Rethink assign right away, then the run goes on where they were used', () => {
    const run = runOn('Orig-1-02', 'TAROTS');
    winCurrentBlind(run); // the shop
    const offers = JSON.stringify(run.state.shop!.offers);
    run.state.tarots.push({ uid: 8000, id: 'bootcamp' }, { uid: 8001, id: 'rethink' });
    expect(run.useTarot(8000)).not.toBeNull();
    expect(run.state.assign).toMatchObject({ reason: 'tarot', newPoints: 5, reassign: 0, next: 'shop' });
    expect(run.useTarot(8001)).toBeNull(); // not during an assignment
    run.setAbility('climber', 0); // nothing may move
    expect(run.state.capacity.climber).toBe(SPREAD.climber);
    run.setAbility('climber', SPREAD.climber + 5);
    expect(run.finishAssignment()).toBe(true);
    expect(run.state.phase).toBe('shop');
    expect(JSON.stringify(run.state.shop!.offers)).toBe(offers); // the same shop
    run.nextRound();
    // The Rethink on the blind screen: what the level gets follows at once
    const setup = run.ensureSetup();
    expect(run.useTarot(8001)).not.toBeNull();
    run.setAbility('climber', 0);
    expect(run.state.capacity.climber).toBe(SPREAD.climber + 5 - 10);
    run.setAbility('digger', SPREAD.digger + 10);
    expect(setup.usable.digger).toBe(Math.min(SPREAD.digger + 10, catalog.get(setup.levelId).skills.digger));
    expect(run.finishAssignment()).toBe(true);
    expect(run.state.phase).toBe('blinds');
  });

  it('a run saved before the assignment existed goes on (shop after a boss: the next ante is drawn when leaving it)', () => {
    const run = started('OLD');
    const old = JSON.parse(JSON.stringify(run.state)) as RunState;
    delete old.assign;
    for (const b of old.blinds) b.status = 'defeated';
    old.phase = 'shop';
    old.shop = { offers: [], rerolls: 0, recruitPrice: 3 };
    const copy = new RunSession(catalog, old);
    copy.nextRound();
    expect([copy.state.phase, copy.state.ante, copy.currentBlindIndex]).toEqual(['blinds', 2, 0]);
  });

  it('a saved run continues exactly like the original', () => {
    const run = runOn('Orig-1-02', 'SAVE');
    winCurrentBlind(run);
    const copy = new RunSession(catalog, JSON.parse(JSON.stringify(run.state)) as RunState);
    run.reroll();
    copy.reroll();
    expect(copy.state.shop).toEqual(run.state.shop);
    run.nextRound();
    copy.nextRound();
    expect(copy.startBlind().hand).toEqual(run.startBlind().hand);
  });
});
