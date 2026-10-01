import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { ANTE_BANDS, RunSession } from '../src/run/session.ts';
import { zeroSkills } from '../src/run/skills.ts';
import { ANTES, ATTEMPTS, type RunState, START_COLONY } from '../src/run/state.ts';

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

/** a run whose current blind is the given level */
function runOn(levelId: string, seed = 'TEST'): RunSession {
  const run = RunSession.newRun(catalog, seed);
  run.state.blinds[0].levelId = levelId;
  return run;
}

/** pretends the current blind was won with every lemming saved (no engine) */
function winCurrentBlind(run: RunSession): void {
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

  it('skipping a blind gives its tag', () => {
    const run = RunSession.newRun(catalog, 'SKIP');
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
    const run = RunSession.newRun(catalog, 'TAROT');
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
