import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { hairOf, lemmingPalette, remapColor } from '../src/run/colors.ts';
import { keywordsOf } from '../src/run/content.ts';
import { jokerSellValue, ROUND_SCALE, RunSession } from '../src/run/session.ts';
import { SKILLS, type SkillCounts, zeroSkills } from '../src/run/skills.ts';
import { JOKER_SLOTS, type LemmingCard } from '../src/run/state.ts';

const data = repoDataProvider();
const catalog = new LevelCatalog(getStyle(data, StyleDef.Orig));

const SPREAD: SkillCounts = { climber: 6, floater: 6, bomber: 6, blocker: 6, builder: 12, basher: 8, miner: 8, digger: 8 };

function started(seed = 'TEST'): RunSession {
  const run = RunSession.newRun(catalog, seed);
  for (const sk of SKILLS) run.setAbility(sk, SPREAD[sk]);
  expect(run.finishAssignment()).toBe(true);
  return run;
}

function runOn(levelId: string, jokers: string[] = [], seed = 'TEST'): RunSession {
  const run = started(seed);
  run.state.blinds[0].levelId = levelId;
  jokers.forEach((id, i) => run.state.jokers.push({ uid: 900 + i, id }));
  return run;
}

/** plays the level without any input, with every hook of the player screen */
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
  game.onLemmingExited = run.exitHook();
  game.lemmingBitmap = run.lemmingBitmapHook();
  game.start(false);
  for (let n = 0; n < 30000 && !game.isFinished; n++) {
    game.update();
    run.tick(game);
  }
  return { game, outcome: run.finishAttempt(game) };
}

function card(run: RunSession, hair: LemmingCard['hair'], clothes: LemmingCard['clothes'] = 'blue'): LemmingCard {
  const c = run.state.colony[0];
  return { ...c, hair, clothes };
}

describe('Power Cards: the rescue count', () => {
  it('counts the saved lemmings, then the Power Cards from left to right (+Rescues, then X Rescues)', () => {
    const run = runOn('Orig-1-02', ['abstract', 'personalspace']);
    const order = [card(run, 'green'), card(run, 'orange'), card(run, 'red')];
    const { score, lines } = run.rescueCount(order, order, zeroSkills());
    // 3 saved, +3 for each of the 2 Power Cards = 9, X(empty slots)
    const empty = JOKER_SLOTS - 2;
    expect(score).toBe(9 * empty);
    expect(lines.map((l) => l.label)).toEqual(['Lemmings saved', 'Abstract Lemming', 'Personal Space']);

    // the other way round: the X comes before the +
    run.state.jokers.reverse();
    expect(run.rescueCount(order, order, zeroSkills()).score).toBe(3 * empty + 6);
  });

  it('hair colours, the first saves, a few good lemmings, the sunset and the Ginger Lemming', () => {
    const run = runOn('Orig-1-02', ['orangehair']);
    const order = [card(run, 'orange'), card(run, 'red'), card(run, 'green')];
    expect(run.rescueCount(order, order, zeroSkills()).score).toBe(4);
    run.state.jokers.push({ uid: 990, id: 'ginger' });
    expect(run.rescueCount(order, order, zeroSkills()).score).toBe(5);

    const run2 = runOn('Orig-1-02', ['medals', 'fewgood']);
    // 3 saved: the first three +1 each = 6, then every one counts 5 (+4 each) = 18
    expect(run2.rescueCount(order, order, zeroSkills()).score).toBe(18);

    const run3 = runOn('Orig-1-02', ['sunset']);
    expect(run3.rescueCount([card(run3, 'green'), card(run3, 'orange')], [], zeroSkills()).score).toBe(11);
    expect(run3.rescueCount([card(run3, 'orange'), card(run3, 'green')], [], zeroSkills()).score).toBe(2);
  });

  it('St. Patrick, Unblocked, the Council of Elders and the Gym Membership', () => {
    const run = runOn('Orig-1-02', ['stpatrick', 'unblocked', 'elders', 'gym']);
    const blockers = { ...zeroSkills(), blocker: 2 };
    run.state.colony[0].edition = 'wise';
    run.state.colony[1].edition = 'wise';
    run.state.jokers[3].counter = 5;
    const order = [card(run, 'green', 'green'), card(run, 'green', 'blue')];
    // 2 + 4 (Fully Green) + 2 (blockers) = 8, X1.4 (2 Wise) = 11.2, X1.5 (5 Trainings) = 16.8
    expect(run.rescueCount(order, order, blockers).score).toBe(16);
  });

  it('the requirement grows with the rounds, and the Inverse Curve lowers it', () => {
    const run = runOn('Orig-1-02');
    const level = catalog.get('Orig-1-02');
    expect(run.requiredFor(level)).toBe(level.rescue);
    run.state.ante = 8;
    expect(run.requiredFor(level)).toBe(Math.ceil(level.rescue * ROUND_SCALE[7]));
    const fun = catalog.levels.reduce((a, b) => (b.rescue > a.rescue ? b : a));
    const before = run.requiredFor(fun);
    run.state.jokers.push({ uid: 990, id: 'inversecurve' });
    run.state.stats.blindsWon = 30;
    expect(run.requiredFor(fun)).toBe(Math.ceil(fun.rescue * ROUND_SCALE[7] * 0.7 - 1e-9));
    expect(run.requiredFor(fun)).toBeLessThan(before);
  });

  it('a level is won by the rescue count, not by the lemmings', () => {
    // Fun 2: 10 lemmings, every one splats without an umbrella. Rush Hour adds 5 that splat too.
    const run = runOn('Orig-1-02', ['rushhour']);
    const setup = run.ensureSetup();
    run.card(setup.hand[0])!.floater = true;
    const { game, outcome } = playIdle(run);
    expect(game.lemmingList.length).toBe(setup.hand.length + 5);
    expect(outcome.extra).toBe(5);
    expect(outcome.score).toBe(1);
    expect(outcome.success).toBe(outcome.score! >= setup.rescue);
  });
});

describe('Power Cards: money, the shop and after a level', () => {
  it('the Payday Loan lets the money go $25 into debt; the Generous Clown rerolls for free twice', () => {
    const run = runOn('Orig-1-02');
    run.state.money = 0;
    expect(run.canAfford(10)).toBe(false);
    run.state.jokers.push({ uid: 990, id: 'paydayloan' });
    expect(run.canAfford(25)).toBe(true);
    expect(run.canAfford(26)).toBe(false);
  });

  it('the Recycling Plant destroys the Power Card to its left when a level begins, for an ability', () => {
    const run = runOn('Orig-1-02', ['omelette', 'recycler']);
    run.state.jokers[0].sellBonus = 6;
    const total = SKILLS.reduce((n, sk) => n + run.state.capacity[sk], 0);
    const value = jokerSellValue(run.state.jokers[0]);
    run.startBlind();
    expect(run.state.jokers.map((j) => j.id)).toEqual(['recycler']);
    expect(SKILLS.reduce((n, sk) => n + run.state.capacity[sk], 0)).toBe(total + value);
  });

  it('Going Up!, Going Down!, the Omelette and Big Mike after a level', () => {
    const run = runOn('Orig-1-02', ['goingup', 'goingdown', 'omelette', 'bigmike']);
    const setup = run.ensureSetup();
    for (const id of setup.hand.slice(0, 3)) run.card(id)!.floater = true;
    const size = run.state.colony.length;
    const { outcome } = playIdle(run);
    expect(outcome.success).toBe(true);
    run.accept();
    // 7 splats: all of them respawn (Big Mike), and a Climber and a Floater join
    expect(run.state.colony.length).toBe(size + 2);
    expect(run.state.colony.slice(-2).map((c) => [c.climber, c.floater])).toEqual([
      [true, false],
      [false, true],
    ]);
    const omelette = run.state.jokers.find((j) => j.id === 'omelette')!;
    expect(omelette.sellBonus).toBe(21);
  });

  it('the Checklist pays for the colour on its list, and changes it', () => {
    const run = runOn('Orig-1-02');
    run.state.jokers.push({ uid: 990, id: 'checklist', color: 'red' });
    const setup = run.ensureSetup();
    for (const id of setup.hand.slice(0, 3)) {
      run.card(id)!.floater = true;
      run.card(id)!.clothes = 'red';
    }
    playIdle(run);
    const cash = run.accept();
    expect(cash.lines).toContainEqual({ label: 'Checklist (Red)', amount: 3 });
    expect(run.state.jokers[0].color).not.toBe('red');
  });

  it('the Generous Clown: 2 free rerolls in every shop', () => {
    const run = runOn('Orig-1-02', ['clown']);
    run.state.money = 0;
    run.state.shop = { offers: [], packs: [], rerolls: 0, freeRerolls: 2 };
    expect(run.rerollPrice()).toBe(0);
    expect(run.reroll()).toBe(true);
    expect(run.reroll()).toBe(true);
    expect(run.rerollPrice()).toBe(2);
    expect(run.reroll()).toBe(false);
    expect(run.state.money).toBe(0);
  });
});

describe('Power Cards: colours and keywords', () => {
  it('new lemmings have colours, and are drawn in them', () => {
    const run = started();
    expect(run.state.colony.every((c) => !!hairOf(c))).toBe(true);
    const c: LemmingCard = { ...run.state.colony[0], hair: 'orange', clothes: 'red', edition: 'plain' };
    const p = lemmingPalette(c);
    expect(remapColor(0xff00b000, p)).toBe(0xfff08820);
    expect(remapColor(0xff4040e0, p)).toBe(0xffc02828);
    expect(remapColor(0xff123456, p)).toBe(0xff123456);
  });

  it('descriptions name their keywords', () => {
    expect(keywordsOf('+3 Rescues for every Power Card you have.').map((k) => k.title)).toContain('+Rescues');
    expect(keywordsOf('X0.2 Rescues for every Wise lemming').map((k) => k.title)).toEqual(expect.arrayContaining(['X Rescues', 'Wise']));
    expect(keywordsOf('Fully Green lemmings').map((k) => k.title)).toContain('Fully');
  });
});
