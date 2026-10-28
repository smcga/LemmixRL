import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { hairOf, lemmingPalette, remapColor } from '../src/run/colors.ts';
import { BOOSTS, JOKERS, keywordsOf, MAYHEM, TAGS, TAROTS } from '../src/run/content.ts';
import { isSpecial, jokerSellValue, ROUND_SCALE, RunSession } from '../src/run/session.ts';
import { SKILLS, type SkillCounts, zeroSkills } from '../src/run/skills.ts';
import { JOKER_SLOTS, TAROT_SLOTS, type LemmingCard } from '../src/run/state.ts';

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

/** accepts a perfect result without running the engine, then advances to the next blind */
function winPerfect(run: RunSession) {
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
    exitOrder: setup.hand.map((_, i) => i),
  };
  setup.attempts++;
  run.state.phase = 'result';
  const cash = run.accept();
  run.cashOut();
  if (run.assignment()) expect(run.finishAssignment()).toBe(true);
  if ((run.state.phase as string) === 'shop') run.nextRound();
  return cash;
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
  run.attach(game);
  game.start(false);
  for (let n = 0; n < 30000 && !game.isFinished; n++) game.update();
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
    const run = runOn('Orig-1-02', ['nestegg', 'recycler']);
    run.state.jokers[0].sellBonus = 6;
    const total = SKILLS.reduce((n, sk) => n + run.state.capacity[sk], 0);
    const value = jokerSellValue(run.state.jokers[0]);
    run.startBlind();
    expect(run.state.jokers.map((j) => j.id)).toEqual(['recycler']);
    expect(SKILLS.reduce((n, sk) => n + run.state.capacity[sk], 0)).toBe(total + value);
  });

  it('Going Up!, Going Down! and Big Mike after a level', () => {
    const run = runOn('Orig-1-02', ['goingup', 'goingdown', 'bigmike']);
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
    run.state.shop = { offers: [], packs: [], rerolls: 0 };
    expect(run.rerollPrice()).toBe(0);
    expect(run.reroll()).toBe(true);
    expect(run.reroll()).toBe(true);
    expect(run.rerollPrice()).toBe(2);
    expect(run.reroll()).toBe(false);
    expect(run.state.money).toBe(0);
  });

  it('the Generous Clown gives its free rerolls at once when it is bought in the shop (and not after it is sold)', () => {
    const run = runOn('Orig-1-02');
    run.state.money = 5;
    run.state.phase = 'shop';
    run.state.shop = { offers: [{ uid: 1, type: 'joker', id: 'clown', price: 5, sold: false }], packs: [], rerolls: 0, freeRerollsUsed: 0 };
    expect(run.rerollPrice()).toBe(2);
    expect(run.buy(1)).toBe(true);
    expect(run.state.money).toBe(0);
    expect(run.freeRerollsLeft()).toBe(2);
    expect(run.reroll()).toBe(true);
    expect(run.freeRerollsLeft()).toBe(1);
    // sold: the free reroll left goes with it
    expect(run.sellJoker(run.state.jokers[0].uid)).toBe(true);
    expect(run.freeRerollsLeft()).toBe(0);
    expect(run.rerollPrice()).toBe(2);
  });
});

describe('Power Cards inspired by missing Balatro Joker families', () => {
  it('Bootstraps, Baseball Card and Hanging Chad score from money, rarity and the first save', () => {
    const saved = (run: RunSession) => [card(run, 'green'), card(run, 'orange')];

    const boots = runOn('Orig-1-02', ['bootstraps']);
    boots.state.money = 14;
    expect(boots.rescueCount(saved(boots), [], zeroSkills()).score).toBe(6); // 2 saved + 4 for $10

    const baseball = runOn('Orig-1-02', ['baseball', 'bootstraps', 'overtime']);
    expect(baseball.rescueCount(saved(baseball), [], zeroSkills()).score).toBe(4); // floor(2 x 1.5 x 1.5)

    const chad = runOn('Orig-1-02', ['hangingchad']);
    expect(chad.rescueCount(saved(chad), [], zeroSkills()).score).toBe(4);
    expect(chad.rescueCount([], [], zeroSkills()).score).toBe(0);
  });

  it('Flash Card gains +2 Rescues on paid and free shop rerolls', () => {
    const run = runOn('Orig-1-02', ['flashcard', 'clown']);
    run.state.money = 20;
    run.state.phase = 'shop';
    run.state.shop = { offers: [], packs: [], rerolls: 0, freeRerollsUsed: 0 };
    expect(run.reroll()).toBe(true);
    expect(run.reroll()).toBe(true);
    expect(run.state.jokers[0].counter).toBe(4);
    expect(run.state.money).toBe(20);
    expect(run.rescueCount([card(run, 'green')], [], zeroSkills()).score).toBe(5);
  });

  it('Golden Lemming, Gold Rush and Savings Burrow pay out, while Nest Egg grows in value', () => {
    const run = runOn('Orig-1-02', ['goldenlemming', 'goldenticket', 'tothemoon', 'nestegg']);
    run.state.money = 25;
    const setup = run.ensureSetup();
    run.card(setup.hand[0])!.edition = 'gold';
    run.card(setup.hand[1])!.edition = 'gold';
    const cash = winPerfect(run);
    expect(cash.lines).toContainEqual({ label: 'Golden Lemming', amount: 4 });
    expect(cash.lines).toContainEqual({ label: 'Gold Rush', amount: 8 });
    expect(cash.lines).toContainEqual({ label: 'Interest ($2 per $5)', amount: 10 });
    const egg = run.state.jokers.find((j) => j.id === 'nestegg')!;
    expect(egg.sellBonus).toBe(3);
    expect(jokerSellValue(egg)).toBe(5);
  });

  it('Boost Cartomancer creates one Boost once per level, only when there is room', () => {
    const run = runOn('Orig-1-02', ['cartomancer']);
    expect(run.state.tarots).toHaveLength(0);
    run.startBlind();
    expect(run.state.tarots).toHaveLength(1);
    run.abandonAttempt();
    run.startBlind();
    expect(run.state.tarots).toHaveLength(1);

    const full = runOn('Orig-1-02', ['cartomancer']);
    full.state.tarots = Array.from({ length: TAROT_SLOTS }, (_, i) => ({ uid: 8000 + i, id: 'recruiter' }));
    full.startBlind();
    expect(full.state.tarots).toHaveLength(TAROT_SLOTS);
  });

  it('Popcorn loses 4 Rescues after each level and disappears when exhausted', () => {
    const run = runOn('Orig-1-02', ['popcorn']);
    for (const bonus of [20, 16, 12, 8, 4]) {
      expect(run.rescueCount([card(run, 'green')], [], zeroSkills()).score).toBe(1 + bonus);
      winPerfect(run);
    }
    expect(run.state.jokers.some((j) => j.id === 'popcorn')).toBe(false);
  });
});

describe('Legendary Power Cards', () => {
  it('Triboulet doubles Rescues for every saved Gold or Champion lemming', () => {
    const run = runOn('Orig-1-02', ['triboulet']);
    const gold = { ...card(run, 'green'), edition: 'gold' as const };
    const champion = { ...card(run, 'orange'), edition: 'champion' as const };
    const plain = { ...card(run, 'red'), edition: 'plain' as const };
    expect(run.rescueCount([gold, champion, plain], [], zeroSkills()).score).toBe(12);
  });

  it('Yorick counts lost lemmings and gains X1 Rescues for every 23', () => {
    const run = runOn('Orig-1-02', ['yorick']);
    const yorick = run.state.jokers[0];
    yorick.counter = 22;
    expect(run.rescueCount([card(run, 'green')], [], zeroSkills()).score).toBe(1);

    const setup = run.startBlind();
    run.state.outcome = {
      success: true,
      rescued: setup.hand.length - 1,
      required: setup.rescue,
      hand: setup.hand.length,
      fates: setup.hand.map((_, i) => (i === 0 ? 'splat' : 'saved')),
      skillsUsed: zeroSkills(),
      secondsLeft: 60,
      timeUp: false,
      nuked: false,
      done: 100,
      target: 0,
      exitOrder: setup.hand.slice(1).map((_, i) => i + 1),
    };
    setup.attempts++;
    run.state.phase = 'result';
    run.accept();
    expect(yorick.counter).toBe(23);
    expect(run.rescueCount([card(run, 'green')], [], zeroSkills()).score).toBe(2);
  });

  it('Chicot halves only the Level 3 rescue requirement', () => {
    const run = runOn('Orig-1-02');
    const level1 = run.level(run.state.blinds[0].levelId);
    const boss = run.level(run.state.blinds[2].levelId);
    const level1Before = run.requiredFor(level1);
    const bossBefore = run.requiredFor(boss);
    run.state.jokers.push({ uid: 990, id: 'chicot' });
    expect(run.requiredFor(level1)).toBe(level1Before);
    expect(run.requiredFor(boss)).toBe(Math.ceil(bossBefore / 2));
  });
});

describe('Power Cards: colours and keywords', () => {
  it('the colony a run starts with is classic lemmings, nearly all of it; recruits bring the colours', () => {
    const run = started();
    const classic = run.state.colony.filter((c) => c.hair === 'green' && c.clothes === 'blue').length;
    expect(classic).toBeGreaterThanOrEqual(run.state.colony.length * 0.8);
    expect(classic).toBeLessThan(run.state.colony.length);
    const before = run.state.colony.length;
    run.recruit(200);
    const joined = run.state.colony.slice(before);
    expect(joined.filter((c) => c.hair === 'green' && c.clothes === 'blue').length).toBeLessThan(joined.length * 0.4);
  });

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

describe('Lematro Phase 1: the rescue count', () => {
  const score = (run: RunSession, order: LemmingCard[]) => run.rescueCount(order, order, zeroSkills()).score;
  const lems = (run: RunSession, hairs: LemmingCard['hair'][], edition: LemmingCard['edition'] = 'plain') =>
    hairs.map((h, i) => ({ ...run.state.colony[i], hair: h, clothes: 'blue' as const, edition, climber: false, floater: false, insured: false }));

  it('Lemming, Matching Set, Same Hair Day, Birds of a Feather and Night Shift', () => {
    let run = runOn('Orig-1-02', ['lemming']);
    expect(score(run, lems(run, ['red']))).toBe(5);
    run = runOn('Orig-1-02', ['matchingset']);
    expect(score(run, lems(run, ['red', 'red', 'red']))).toBe(8);
    expect(score(run, lems(run, ['red', 'red']))).toBe(2);
    expect(score(run, lems(run, ['red', 'red', 'blue']))).toBe(3);
    run = runOn('Orig-1-02', ['samehair']);
    expect(score(run, lems(run, ['blue', 'blue']))).toBe(5);
    expect(score(run, [])).toBe(0);
    run = runOn('Orig-1-02', ['birds', 'ginger']);
    // the Ginger Lemming: red and orange are the same colour
    expect(score(run, lems(run, ['red', 'orange']))).toBe(4);
    run = runOn('Orig-1-02', ['nightshift']);
    expect(score(run, lems(run, ['green', 'purple']))).toBe(6);
    expect(score(run, lems(run, ['green', 'orange']))).toBe(2);
  });

  it('Long Service every 6th level, the Glitch from the seed, the Weakest Link and the Spiral Staircase', () => {
    let run = runOn('Orig-1-02', ['longservice']);
    run.state.jokers[0].counter = 4;
    expect(score(run, lems(run, ['red']))).toBe(1);
    run.state.jokers[0].counter = 5;
    expect(score(run, lems(run, ['red']))).toBe(3);

    run = runOn('Orig-1-02', ['glitch']);
    run.ensureSetup();
    const a = score(run, lems(run, ['red']));
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(16);
    expect(score(run, lems(run, ['red']))).toBe(a);

    run = runOn('Orig-1-02', ['weakestlink']);
    const low = Math.min(...SKILLS.map((sk) => run.capability()[sk]));
    expect(score(run, lems(run, ['red']))).toBe(1 + 2 * low);

    run = runOn('Orig-1-02', ['spiral']);
    // the 1st, 2nd, 3rd, 5th and 8th of 8
    expect(score(run, lems(run, Array(8).fill('red')))).toBe(8 + 10);
  });

  it("Star Turn, Rank and File, Photo Finish, Everyone's Special and Encore!", () => {
    let run = runOn('Orig-1-02', ['starturn', 'rankandfile']);
    const order = [...lems(run, ['red'], 'gold'), ...lems(run, ['red', 'red'])];
    expect(score(run, order)).toBe(3 + 3 + 2);
    run = runOn('Orig-1-02', ['photofinish']);
    expect(score(run, order)).toBe(6);
    expect(score(run, [...order].reverse())).toBe(3);
    run = runOn('Orig-1-02', ['everyonespecial', 'starturn', 'rankandfile']);
    expect(score(run, order)).toBe(3 + 9);
    run = runOn('Orig-1-02', ['encore', 'starturn']);
    // the Gold one counts twice: 4 saved, and Star Turn gives +3 twice
    const { score: s, lines } = run.rescueCount(order, order, zeroSkills());
    expect(s).toBe(4 + 6);
    expect(lines[1]).toMatchObject({ label: 'Encore!', plus: 1, total: 4 });
  });

  it('Reserves, Thin Ranks, Booster Club, Bull Market, Treasure Chest, Skipping Rope, Grand Finale and Super Squad', () => {
    let run = runOn('Orig-1-02', ['reserves']);
    const setup = run.ensureSetup();
    expect(score(run, lems(run, ['red']))).toBe(1 + Math.floor((run.state.colony.length - setup.hand.length) / 5));
    run = runOn('Orig-1-02', ['thinranks']);
    run.state.colony.splice(0, 5);
    expect(score(run, lems(run, ['red']))).toBe(11);
    run = runOn('Orig-1-02', ['boosterclub', 'bullmarket']);
    run.state.stats.boostsUsed = 3;
    run.state.money = 9;
    expect(score(run, lems(run, ['red']))).toBe(1 + 3 + 4);
    run = runOn('Orig-1-02', ['treasurechest', 'nestegg', 'lemming']);
    run.state.jokers[1].sellBonus = 3;
    // the others sell for $2 + $3 and $1
    expect(score(run, lems(run, ['red']))).toBe(1 + 6 + 4);
    run = runOn('Orig-1-02', ['skippingrope']);
    run.state.stats.skipped = 4;
    expect(score(run, lems(run, ['red', 'red']))).toBe(4);
    run = runOn('Orig-1-02', ['grandfinale']);
    expect(score(run, lems(run, ['red']))).toBe(1);
    run.state.blinds[0].status = run.state.blinds[1].status = 'defeated';
    run.state.blinds[2].status = 'current';
    run.ensureSetup();
    expect(score(run, lems(run, ['red']))).toBe(2);
    run = runOn('Orig-1-02', ['supersquad']);
    for (const c of run.state.colony) Object.assign(c, { edition: 'plain', climber: false, floater: false, insured: false });
    for (const c of run.state.colony.slice(0, 15)) c.climber = true;
    expect(score(run, lems(run, ['red']))).toBe(1);
    run.state.colony[15].insured = true;
    expect(score(run, lems(run, ['red']))).toBe(3);
  });
});

describe('Lematro Phase 1: the new hooks', () => {
  it('Plus One, Stunt Double and the Crowd Bonus change the squad', () => {
    let run = runOn('Orig-1-02', ['plusone']);
    expect(run.ensureSetup().hand).toHaveLength(11);
    run = runOn('Orig-1-02', ['stuntdouble']);
    expect(run.ensureSetup().hand).toHaveLength(8);
    expect(run.rescueCount([card(run, 'red')], [], zeroSkills()).score).toBe(21);
    run = runOn('Orig-1-02');
    run.state.pendingTags.push('crowd');
    expect(run.preview(0).squad).toBe(13);
    expect(run.startBlind().hand).toHaveLength(13);
    expect(run.state.pendingTags).not.toContain('crowd');
    // bought before the level begins: the squad grows at once
    run = runOn('Orig-1-02');
    expect(run.ensureSetup().hand).toHaveLength(10);
    run.state.jokers.push({ uid: 990, id: 'plusone' });
    expect(run.ensureSetup().hand).toHaveLength(11);
  });

  it('No Thanks gains when a pack is skipped; Camp Out when a card is sold, until a Level 3', () => {
    const run = runOn('Orig-1-02', ['nothanks', 'campout', 'lemming']);
    run.state.phase = 'pack';
    run.state.pack = { kind: 'training', choices: [{ type: 'allSkills', amount: 1 }] };
    run.skipPack();
    expect(run.state.phase).toBe('shop');
    expect(run.state.jokers[0].counter).toBe(1);
    expect(run.sellJoker(902)).toBe(true);
    run.state.tarots = [{ uid: 7000, id: 'recruiter' }];
    expect(run.sellTarot(7000)).toBe(true);
    expect(run.state.jokers[1].counter).toBe(2);
    // 1 saved +2 = 3, X1.5
    expect(run.rescueCount([card(run, 'red')], [], zeroSkills()).score).toBe(4);
  });

  it('a Stampede gains and destroys a Power Card at Levels 1 and 2; the Rabble brings 2 Common Power Cards', () => {
    let run = runOn('Orig-1-02', ['stampede', 'lemming', 'glitch']);
    run.startBlind();
    expect(run.state.jokers).toHaveLength(2);
    expect(run.state.jokers[0]).toMatchObject({ id: 'stampede', counter: 1 });
    run = runOn('Orig-1-02', ['rabble']);
    const setup = run.startBlind();
    expect(run.state.jokers).toHaveLength(3);
    expect(run.state.jokers.slice(1).map((j) => rarityOf(j.id))).toEqual(['common', 'common']);
    expect(setup.begun).toBe(true);
  });

  it('Body Snatcher, Gold Leaf, Jetpack, Fizzy Pop and Little Helper after a level', () => {
    const run = runOn('Orig-1-02', ['bodysnatcher', 'goldleaf', 'jetpack', 'fizzypop', 'littlehelper']);
    const setup = run.ensureSetup();
    run.card(setup.hand[1])!.edition = 'lucky';
    run.card(setup.hand[2])!.climber = true;
    const cash = winPerfect(run);
    expect(cash.lines).toContainEqual({ label: 'Jetpack', amount: 1 });
    // Gold Leaf made the first Super Lemming Gold, then Body Snatcher made both plain (X0.2 gained)
    expect(run.card(setup.hand[1])).toMatchObject({ edition: 'plain', climber: false });
    expect(run.card(setup.hand[2])).toMatchObject({ edition: 'plain', climber: false });
    const [snatcher, , jet, fizzy, helper] = run.state.jokers;
    expect(snatcher.counter).toBe(2);
    expect(fizzy.counter).toBe(1);
    expect(helper.counter).toBe(10);
    expect(jet.counter ?? 0).toBe(0);
    winPerfect(run);
    winPerfect(run); // a Level 3: the Jetpack rises
    expect(run.state.jokers.some((j) => j.id === 'fizzypop')).toBe(false);
    expect(run.state.jokers.find((j) => j.id === 'jetpack')!.counter).toBe(1);
  });

  it('Gold Leaf turns the first Super Lemming saved Gold', () => {
    const run = runOn('Orig-1-02', ['goldleaf']);
    const setup = run.ensureSetup();
    run.card(setup.hand[3])!.edition = 'mentor';
    run.card(setup.hand[5])!.floater = true;
    winPerfect(run);
    expect(run.card(setup.hand[3])!.edition).toBe('gold');
    expect(run.card(setup.hand[5])!.edition).toBe('plain');
  });

  it('Population Boom counts the lemmings that join; Fragile and Oh No! the Super Lemmings that die and are lost', () => {
    let run = runOn('Orig-1-02', ['populationboom']);
    run.recruit(5);
    expect(run.state.jokers[0].counter).toBe(5);
    run = runOn('Orig-1-02', ['fragile', 'ohno']);
    const setup = run.ensureSetup();
    // Fun 2: the Floaters are saved, the others splat (and the Gold ones are lost for good)
    for (const id of setup.hand.slice(0, 3)) run.card(id)!.floater = true;
    for (const id of setup.hand.slice(3, 6)) run.card(id)!.edition = 'gold';
    for (const id of setup.hand.slice(6)) Object.assign(run.card(id)!, { edition: 'plain', climber: false, floater: false, insured: false });
    playIdle(run);
    run.accept();
    expect(run.state.jokers.map((j) => j.counter)).toEqual([3, 3]);
    expect(run.rescueCount([card(run, 'red')], [], zeroSkills()).score).toBe(Math.floor(1 * 1.75 * 4));
  });

  it("Loaded Dice double the listed chances; Moon Landing and the Rabbit's Foot", () => {
    // a Rainy Day Fund pays every Floater with a 1 in 2 chance doubled
    const run = runOn('Orig-1-02', ['loadeddice', 'rainyday']);
    const setup = run.ensureSetup();
    for (const id of setup.hand.slice(0, 4)) run.card(id)!.floater = true;
    playIdle(run);
    expect(run.accept().lines).toContainEqual({ label: 'Rainy Day Fund', amount: 4 });
    // Copycat copies the Loaded Dice: 1 in 4 four times over, every time
    const moon = runOn('Orig-1-02', ['copycat', 'loadeddice', 'moonlanding', 'rabbitsfoot']);
    const total = () => SKILLS.reduce((n, sk) => n + moon.state.capacity[sk], 0);
    const before = total();
    const s2 = moon.ensureSetup();
    for (const id of s2.hand) moon.card(id)!.edition = 'lucky';
    const cash = winPerfect(moon);
    expect(total()).toBe(before + 1);
    const lucky = cash.lines.filter((l) => l.label.startsWith('Lucky ')).length;
    expect(lucky).toBe(10);
    expect(moon.state.jokers[3].counter).toBe(10);
  });

  it('Little Mike is offered only after Big Mike was destroyed; Stage Door offers what you have', () => {
    const run = runOn('Orig-1-02');
    const offers = (r: RunSession) => (r as unknown as { offerable(): { id: string }[] }).offerable().map((d) => d.id);
    expect(offers(run)).not.toContain('littlemike');
    run.state.extinct = ['bigmike'];
    expect(offers(run)).toContain('littlemike');
    run.state.jokers.push({ uid: 990, id: 'lemming' });
    expect(offers(run)).not.toContain('lemming');
    run.state.jokers.push({ uid: 991, id: 'stagedoor' });
    expect(offers(run)).toEqual(expect.arrayContaining(['lemming', 'stagedoor']));
  });

  it('Big Mike destroyed by its chance makes Little Mike possible', () => {
    const run = runOn('Orig-1-02', ['bigmike']);
    for (let i = 0; i < 40 && run.state.jokers.length; i++) {
      if (run.state.phase === 'over') break;
      run.state.blinds.forEach((b, k) => (b.levelId = k === run.currentBlindIndex ? 'Orig-1-02' : b.levelId));
      winPerfect(run);
    }
    expect(run.state.jokers.some((j) => j.id === 'bigmike')).toBe(false);
    expect(run.state.extinct).toContain('bigmike');
  });

  it('Mirror Image copies a random Power Card when sold after 2 levels; Yippee! copies a Boost past the limit', () => {
    const run = runOn('Orig-1-02', ['mirrorimage', 'nestegg']);
    run.state.jokers[0].counter = 1;
    run.state.jokers[1].sellBonus = 6;
    const early = structuredClone(run.state);
    expect(run.sellJoker(900)).toBe(true);
    expect(run.state.jokers.map((j) => j.id)).toEqual(['nestegg']);
    const later = new RunSession(catalog, early);
    later.state.jokers[0].counter = 2;
    expect(later.sellJoker(900)).toBe(true);
    expect(later.state.jokers.map((j) => [j.id, j.sellBonus])).toEqual([
      ['nestegg', 6],
      ['nestegg', 6],
    ]);

    const yip = runOn('Orig-1-02', ['yippee']);
    yip.state.phase = 'shop';
    yip.state.shop = { offers: [], packs: [], rerolls: 0 };
    yip.state.tarots = [
      { uid: 7000, id: 'recruiter' },
      { uid: 7001, id: 'recruiter' },
    ];
    yip.nextRound();
    expect(yip.state.tarots).toHaveLength(TAROT_SLOTS + 1);
    expect(yip.state.tarots[2].id).toBe('recruiter');
  });
});

describe('Lematro Phase 1: Boosts and Skip Bonuses', () => {
  it('The Foreman makes up to 2 Boosts, The Audition a Power Card, if there is room', () => {
    const run = runOn('Orig-1-02');
    run.state.tarots = [{ uid: 7000, id: 'foreman' }];
    expect(run.useTarot(7000)).not.toBeNull();
    expect(run.state.tarots).toHaveLength(2);
    expect(run.state.stats.boostsUsed).toBe(1);
    run.state.tarots = [
      { uid: 7001, id: 'foreman' },
      { uid: 7002, id: 'recruiter' },
    ];
    run.useTarot(7001);
    expect(run.state.tarots).toHaveLength(2);
    run.state.tarots = [{ uid: 7003, id: 'audition' }];
    run.useTarot(7003);
    expect(run.state.jokers).toHaveLength(1);
    run.state.jokers.push(...[1, 2, 3, 4].map((i) => ({ uid: 8000 + i, id: 'lemming' })));
    run.state.tarots = [{ uid: 7004, id: 'audition' }];
    expect(run.useTarot(7004)).toEqual(['The Audition: no room for a Power Card.']);
  });

  it('the Boost and Power Bonuses open a free pack, then back to the levels', () => {
    const run = runOn('Orig-1-02');
    run.state.blinds[0].tag = 'powerpack';
    run.skipBlind();
    expect(run.state.phase).toBe('pack');
    expect(run.state.pack!.kind).toBe('gadget');
    expect(run.choosePack(0)).not.toBeNull();
    expect(run.state.phase).toBe('blinds');
    expect(run.state.jokers).toHaveLength(1);
    run.state.blinds[1].tag = 'boostpack';
    run.skipBlind();
    expect(run.state.pack!.kind).toBe('boost');
    run.skipPack();
    expect([run.state.phase, run.currentBlind!.kind]).toEqual(['blinds', 'boss']);
  });

  it('Fast Track, Reinforcements, the Reroll Bonus and the Uncommon and Rare Bonuses', () => {
    const run = runOn('Orig-1-02');
    run.state.stats.skipped = 2;
    run.state.blinds[0].tag = 'fasttrack';
    const money = run.state.money;
    run.skipBlind();
    expect(run.state.money).toBe(money + 15);
    run.state.blinds[1].tag = 'reinforcements';
    run.skipBlind();
    expect(run.state.jokers.map((j) => rarityOf(j.id))).toEqual(['common', 'common']);

    const shop = runOn('Orig-1-02');
    const s = shop.state;
    s.pendingTags.push('reroll', 'uncommon', 'rare');
    for (const id of shop.ensureSetup().hand) shop.card(id)!.floater = true;
    playIdle(shop);
    shop.accept();
    shop.cashOut();
    expect(s.phase).toBe('shop');
    expect(shop.rerollPrice()).toBe(0);
    expect(s.shop!.offers.slice(0, 2).map((o) => [o.type, rarityOf(o.id), o.price])).toEqual([
      ['joker', 'uncommon', 0],
      ['joker', 'rare', 0],
    ]);
    expect(s.pendingTags).toEqual([]);
  });

  it("the Director's Cut Bonus rerolls Level 3 for free, also after a paid reroll", () => {
    const run = runOn('Orig-1-02');
    run.state.money = 6;
    expect(run.rerollBoss()).toBe(true);
    expect(run.state.money).toBe(0);
    expect(run.canRerollBoss()).toBe(false);
    run.state.pendingTags.push('directorscut');
    expect(run.bossRerollPrice()).toBe(0);
    const before = run.state.blinds[2].levelId;
    expect(run.rerollBoss()).toBe(true);
    expect(run.state.blinds[2].levelId).not.toBe(before);
    expect(run.state.money).toBe(0);
    expect(run.state.pendingTags).toEqual([]);
  });

  it('a saved run with a Power Card that was cut sells it when it is loaded', () => {
    const run = runOn('Orig-1-02', ['lemming']);
    const saved = structuredClone(run.state);
    saved.jokers.push({ uid: 991, id: 'omelette', sellBonus: 6 }, { uid: 992, id: 'piggy' });
    saved.money = 0;
    const loaded = new RunSession(catalog, saved);
    expect(loaded.state.jokers.map((j) => j.id)).toEqual(['lemming']);
    expect(loaded.state.money).toBe(2 + 6 + 2);
    expect(loaded.retired).toEqual(['Omelette is no longer in the game: sold for $8.', 'Piggy Bank is no longer in the game: sold for $2.']);
  });
});

/** the rarity of a Power Card */
function rarityOf(id: string) {
  return JOKERS.find((d) => d.id === id)?.rarity;
}

/** accepts a perfect result with these skills used (no engine); stays at the cash out */
function winWith(run: RunSession, used: Partial<SkillCounts>) {
  const setup = run.startBlind();
  run.state.outcome = {
    success: true,
    rescued: setup.hand.length,
    required: setup.rescue,
    hand: setup.hand.length,
    fates: setup.hand.map(() => 'saved'),
    skillsUsed: { ...zeroSkills(), ...used },
    secondsLeft: 60,
    timeUp: false,
    nuked: false,
    done: 100,
    target: 0,
    exitOrder: setup.hand.map((_, i) => i),
  };
  setup.attempts++;
  run.state.phase = 'result';
  return run.accept();
}

describe('Lematro Phase 2: Power Cards that read the level', () => {
  const one = (run: RunSession, used: Partial<SkillCounts>) => run.rescueCount([card(run, 'red')], [], { ...zeroSkills(), ...used }).score;
  const two = { builder: 1, digger: 1 };
  const three = { builder: 1, digger: 1, climber: 1 };
  const pairs = { builder: 2, basher: 2 };
  const terrain = { builder: 1, basher: 1, miner: 1, digger: 1 };

  it("the kinds of skill used: Double Act, Three's Company, Tag Team, Groundworks and their cheaper and X Rescues kin", () => {
    const cases: [string, Partial<SkillCounts>, number, Partial<SkillCounts>][] = [
      ['doubleact', two, 5, three],
      ['threescompany', three, 7, two],
      ['tagteam', pairs, 6, { builder: 2, basher: 1 }],
      ['groundworks', terrain, 7, { builder: 1, basher: 1, miner: 1 }],
      ['twostep', two, 3, three],
      ['hattrick', three, 4, two],
      ['doubleshift', pairs, 4, { builder: 3 }],
      ['earthworks', terrain, 4, three],
    ];
    for (const [id, yes, score, no] of cases) {
      const run = runOn('Orig-1-02', [id, 'lemming']);
      expect(one(run, yes), id).toBe(score + 4);
      expect(one(run, no), id).toBe(5);
    }
    // X Rescues (after Lemming's +4: 5)
    const times: [string, Partial<SkillCounts>, number][] = [
      ['thepair', two, 7],
      ['threemusketeers', three, 10],
      ['workaholic', { blocker: 4 }, 10],
      ['workforce', terrain, 10],
    ];
    for (const [id, yes, score] of times) {
      const run = runOn('Orig-1-02', ['lemming', id]);
      expect(one(run, yes), id).toBe(score);
      expect(one(run, { blocker: 3 }), id).toBe(5);
    }
  });

  it('Close Enough: 3 terrain skills, 4 hair colours, all but one sharing a hair colour', () => {
    const run = runOn('Orig-1-02', ['workforce', 'closeenough']);
    expect(one(run, { builder: 1, basher: 1, miner: 1 })).toBe(2);
    const paint = runOn('Orig-1-02', ['paintbox']);
    const four = (['green', 'orange', 'red', 'purple'] as const).map((h) => card(paint, h));
    expect(paint.rescueCount(four, four, zeroSkills()).score).toBe(4);
    paint.state.jokers.push({ uid: 990, id: 'closeenough' });
    expect(paint.rescueCount(four, four, zeroSkills()).score).toBe(12);
    const birds = runOn('Orig-1-02', ['birds', 'closeenough']);
    const almost = [card(birds, 'red'), card(birds, 'red'), card(birds, 'blue')];
    expect(birds.rescueCount(almost, almost, zeroSkills()).score).toBe(6);
  });

  it('Old Favourite, Same Again, Lord of the Manor and Star Pupils', () => {
    let run = runOn('Orig-1-02', ['oldfavourite']);
    run.state.stats.skillUses = { ...zeroSkills(), digger: 12 };
    // 12 before and 3 now: 15 Digger uses
    expect(one(run, { digger: 3, builder: 1 })).toBe(4);
    run = runOn('Orig-1-02', ['sameagain']);
    run.state.lastSkills = { ante: run.state.ante, skills: ['builder', 'digger'] };
    expect(one(run, { builder: 3, digger: 1 })).toBe(2);
    expect(one(run, { builder: 3 })).toBe(1);
    run.state.lastSkills.ante--;
    expect(one(run, { builder: 3, digger: 1 })).toBe(1);
    run = runOn('Orig-1-02', ['lordofthemanor', 'starpupils']);
    const squad = run.ensureSetup().hand;
    const out = run.state.colony.filter((c) => !squad.includes(c.id));
    out[0].edition = out[1].edition = 'champion';
    out[2].edition = 'mentor';
    run.card(squad[0])!.edition = 'mentor';
    // 1 saved, X1.44, then +5
    expect(run.rescueCount([card(run, 'red')], [], zeroSkills()).score).toBe(Math.floor(1 * 1.44 + 5));
  });

  it('Road Crew and Fresh Approach after a level; Ice Lolly loses 3 a restart', () => {
    const run = runOn('Orig-1-02', ['roadcrew', 'freshapproach', 'icelolly']);
    run.state.stats.skillUses = { ...zeroSkills(), blocker: 5 };
    const setup = run.ensureSetup();
    setup.starts = 3;
    // terrain used, without the Blocker (the most used): +2, X1.2, +30 - 6
    expect(run.rescueCount([card(run, 'red')], [], { ...zeroSkills(), ...terrain })).toMatchObject({ score: Math.floor((1 + 2) * 1.2 + 24) });
    winWith(run, terrain);
    const [road, fresh, lolly] = run.state.jokers;
    expect([road.counter, fresh.counter, lolly.counter]).toEqual([1, 1, 2]);
    expect(run.state.stats.skillUses).toMatchObject({ blocker: 5, builder: 1, digger: 1 });
    expect(run.state.lastSkills).toEqual({ ante: 1, skills: ['builder', 'basher', 'miner', 'digger'] });
  });

  it('a restart of the level is counted; Ice Lolly melts', () => {
    const run = runOn('Orig-1-02', ['icelolly']);
    const setup = run.ensureSetup();
    for (const id of setup.hand) run.card(id)!.floater = true;
    const { game } = (() => {
      const s = run.startBlind();
      const session = createSessionFromInfo(
        data,
        catalog.get(s.levelId).info,
        { view: { bitmapToControl: (x, y) => ({ x, y }), renderLowResText: (t) => new Bitmap32(t.length * 7, 14) } },
        (level) => run.applyToLevel(level),
      );
      run.attach(session.game);
      return { game: session.game };
    })();
    game.start(false);
    for (let n = 0; n < 50; n++) game.update();
    game.start(false);
    for (let n = 0; n < 30000 && !game.isFinished; n++) game.update();
    expect(run.restarts()).toBe(1);
    run.finishAttempt(game);
    run.state.jokers[0].counter = 9;
    run.accept();
    expect(run.state.jokers).toHaveLength(0);
  });

  it('Second Chance: a lost level with a quarter of the requirement saved counts as won, once', () => {
    const run = runOn('Orig-1-02', ['secondchance']);
    run.state.ante = 8;
    const setup = run.ensureSetup();
    expect(setup.rescue).toBeGreaterThan(1);
    // Fun 2: only the Floaters are saved
    const need = Math.ceil(setup.rescue / 4);
    for (const id of setup.hand.slice(0, need)) run.card(id)!.floater = true;
    const { outcome } = playIdle(run);
    expect(outcome.rescued).toBeLessThan(setup.rescue);
    expect(outcome).toMatchObject({ success: true, secondChance: true });
    expect(run.state.jokers).toHaveLength(0);
    expect(run.state.phase).toBe('result');
  });
});

describe('Lematro Phase 2: Swaps and the Power Cards that read them', () => {
  it('Steady Squad, Clean Sweep and Green Party', () => {
    const run = runOn('Orig-1-02', ['steadysquad', 'cleansweep', 'greenparty']);
    run.state.jokers[2].counter = 3;
    const setup = run.ensureSetup();
    run.swap([setup.hand[0]]);
    expect(run.state.jokers[2].counter).toBe(2);
    // 1 saved, +6 (2 Swaps left), Green Party +2
    expect(run.rescueCount([card(run, 'red')], [], zeroSkills()).score).toBe(9);
    run.swap(run.state.setup!.hand.slice(0, 2));
    expect(run.rescueCount([card(run, 'red')], [], zeroSkills()).score).toBe(1 + 8);
    run.startBlind();
    // the level began: Green Party +1
    expect(run.state.jokers[2].counter).toBe(1);
  });

  it('Returns Desk pays for swapped-out lemmings of its colour; On-the-Job Training: the first Swap trains', () => {
    const run = runOn('Orig-1-02', ['returnsdesk', 'onthejob']);
    run.state.jokers[0].color = 'purple';
    run.state.stats.skillUses = { ...zeroSkills(), miner: 4 };
    const setup = run.ensureSetup();
    run.card(setup.hand[0])!.hair = 'purple';
    run.card(setup.hand[1])!.hair = 'red';
    const money = run.state.money;
    const miner = run.state.capacity.miner;
    run.swap(setup.hand.slice(0, 2));
    expect(run.state.money).toBe(money + 3);
    expect(run.state.capacity.miner).toBe(miner + 1);
    run.swap([run.state.setup!.hand[0]]);
    expect(run.state.capacity.miner).toBe(miner + 1);
    winWith(run, {});
    expect(run.state.jokers[0].color).not.toBe('purple');
  });

  it('Spare Change pays for the Swaps left unused this run', () => {
    const run = runOn('Orig-1-02');
    run.state.blinds[1].levelId = 'Orig-1-02';
    run.swap([run.ensureSetup().hand[0]]);
    winWith(run, {});
    run.cashOut();
    run.nextRound();
    expect(run.state.stats.swapsUnused).toBe(2);
    run.state.blinds[1].tag = 'sparechange';
    const money = run.state.money;
    run.skipBlind();
    expect(run.state.money).toBe(money + 2);
  });
});

describe('Lematro Phase 2: Tribe cards', () => {
  it('level up a skill (+2), or every squad, the clock and the Respawns; the Gym Membership counts them', () => {
    const run = runOn('Orig-1-02', ['gym']);
    const use = (id: string) => {
      run.state.tarots = [{ uid: 7000, id }];
      return run.useTarot(7000);
    };
    const cap = { ...run.state.capacity };
    expect(use('egyptian')).toEqual(['Egyptian Tribe: +2 Builder ability.']);
    expect(run.state.capacity.builder).toBe(cap.builder + 2);
    use('classic');
    expect(SKILLS.reduce((n, sk) => n + run.state.capacity[sk], 0)).toBe(SKILLS.reduce((n, sk) => n + cap[sk], 0) + 4);
    use('beach');
    expect(run.ensureSetup().hand).toHaveLength(11);
    use('polar');
    use('polar');
    expect(run.state.extraSeconds).toBe(40);
    use('shadow');
    expect(run.state.respawns).toBe(1);
    expect(run.state.jokers[0].counter).toBe(6);
    expect(run.state.stats).toMatchObject({ tribesUsed: 6 });
    expect(run.state.stats.boostsUsed ?? 0).toBe(0);
  });

  it('the Polar Tribe puts seconds on the clock; the Shadow Tribe a Respawn', () => {
    const run = runOn('Orig-1-02');
    run.state.extraSeconds = 80;
    run.state.respawns = 1;
    const setup = run.ensureSetup();
    for (const id of setup.hand.slice(0, 5)) run.card(id)!.floater = true;
    const size = run.state.colony.length;
    const { game } = playIdle(run);
    expect(game.extraSeconds).toBe(80);
    run.accept();
    // 5 splatted, 1 respawned
    expect(run.state.colony.length).toBe(size - 4);
  });

  it('the shop offers Tribe cards in place of training; the Tribe Pack holds Tribe cards; Supply Drop opens one', () => {
    const run2 = runOn('Orig-1-02');
    run2.state.money = 1000;
    run2.state.phase = 'shop';
    run2.state.shop = { offers: [], packs: [], rerolls: 0 };
    const types = new Set<string>();
    for (let i = 0; i < 30; i++) {
      run2.reroll();
      for (const o of run2.state.shop!.offers) types.add(o.type === 'tarot' ? `tarot:${TAROTS.find((t) => t.id === o.id)!.kind ?? 'boost'}` : o.type);
    }
    expect([...types].sort()).toEqual(['joker', 'tarot:boost', 'tarot:tribe']);
    run2.state.blinds[0].tag = 'supply';
    run2.state.phase = 'blinds';
    run2.state.shop = null;
    run2.skipBlind();
    expect(run2.state.pack!.kind).toBe('training');
    for (const c of run2.state.pack!.choices) expect(c.type === 'allSkills' || (c.type === 'tarot' && TAROTS.find((t) => t.id === c.id)!.kind === 'tribe')).toBe(true);
    expect(run2.choosePack(0)).not.toBeNull();
    expect(run2.state.phase).toBe('blinds');
    expect(run2.state.stats.tribesUsed).toBe(1);
  });
});

describe('Lematro Phase 3: Power Card editions', () => {
  it('Shiny, Glowing and Rainbow act after the card itself, left to right; Ghost gives a slot', () => {
    const run = runOn('Orig-1-02', ['lemming', 'lemming', 'lemming']);
    const [a, b, c] = run.state.jokers;
    a.edition = 'rainbow';
    b.edition = 'shiny';
    c.edition = 'glowing';
    // 1, +4 = 5, X1.5 = 7.5, +4 = 11.5, +5 = 16.5, +4 = 20.5, +10 = 30.5
    const { score, lines } = run.rescueCount([card(run, 'red')], [], zeroSkills());
    expect(score).toBe(30);
    expect(lines.map((l) => l.label)).toEqual(['Lemmings saved', 'Lemming', 'Lemming (Rainbow)', 'Lemming', 'Lemming (Shiny)', 'Lemming', 'Lemming (Glowing)']);
    // a copy acts as the card it copies, but its edition is its own
    const copy = runOn('Orig-1-02', ['copycat', 'lemming']);
    copy.state.jokers[1].edition = 'shiny';
    expect(copy.rescueCount([card(copy, 'red')], [], zeroSkills()).score).toBe(1 + 4 + 4 + 5);
    // Ghost: a sixth slot (Personal Space sees it)
    const ghost = runOn('Orig-1-02', ['personalspace']);
    ghost.state.jokers[0].edition = 'ghost';
    expect(ghost.jokerSlots()).toBe(JOKER_SLOTS + 1);
    expect(ghost.rescueCount([card(ghost, 'red')], [], zeroSkills()).score).toBe(JOKER_SLOTS);
  });

  it('an edition adds to the sell value; a Ghost Power Card can be bought with no room', () => {
    const run = runOn('Orig-1-02', ['lemming', 'lemming', 'lemming', 'lemming', 'lemming']);
    expect(jokerSellValue({ uid: 1, id: 'lemming', edition: 'rainbow' })).toBe(1 + 2);
    run.state.money = 50;
    run.state.phase = 'shop';
    run.state.shop = {
      offers: [
        { uid: 1, type: 'joker', id: 'glitch', price: 4, sold: false },
        { uid: 2, type: 'joker', id: 'spiral', price: 13, sold: false, edition: 'ghost' },
      ],
      packs: [],
      rerolls: 0,
    };
    expect(run.canBuy(run.state.shop.offers[0])).toBe(false);
    expect(run.buy(2)).toBe(true);
    expect(run.state.jokers.at(-1)).toMatchObject({ id: 'spiral', edition: 'ghost' });
    expect(run.jokerSlots()).toBe(JOKER_SLOTS + 1);
    expect(run.buy(1)).toBe(false);
  });

  it('the edition Skip Bonuses: the next Power Card you get', () => {
    const run = runOn('Orig-1-02');
    run.state.blinds[0].tag = 'rainbowbonus';
    run.skipBlind();
    expect(run.state.pendingTags).toEqual(['rainbowbonus']);
    run.state.tarots = [{ uid: 7000, id: 'audition' }];
    run.useTarot(7000);
    expect(run.state.jokers[0].edition).toBe('rainbow');
    expect(run.state.pendingTags).toEqual([]);
  });

  it('shops and Power Packs now and then offer a Power Card with an edition, at a higher price', () => {
    const run = runOn('Orig-1-02');
    run.state.money = 10000;
    run.state.phase = 'shop';
    run.state.shop = { offers: [], packs: [], rerolls: 0 };
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      run.reroll();
      for (const o of run.state.shop!.offers)
        if (o.type === 'joker' && o.edition) {
          seen.add(o.edition);
          expect(o.price).toBeGreaterThan(JOKERS.find((d) => d.id === o.id)!.price);
        }
    }
    expect(seen.has('shiny')).toBe(true);
  });
});

describe('Lematro Phase 3: Mayhem boosts and The Lottery', () => {
  const use = (run: RunSession, id: string, selected: number[] = []) => {
    run.state.tarots = [{ uid: 7000, id }];
    return run.useTarot(7000, selected);
  };

  it('The Reaper, The Summoning, The Bonfire, The Dye Vat and The Uniform', () => {
    const run = runOn('Orig-1-02', ['ohno']);
    const size = run.state.colony.length;
    expect(use(run, 'reaper')).not.toBeNull();
    expect(run.state.colony.length).toBe(size + 1);
    expect(run.state.colony.slice(-2).map((c) => c.edition)).toEqual(['champion', 'champion']);
    use(run, 'summoning');
    expect(run.state.colony.length).toBe(size + 4);
    expect(run.state.colony.slice(-4).every((c) => isSpecial(c))).toBe(true);
    const money = run.state.money;
    use(run, 'bonfire');
    expect([run.state.colony.length, run.state.money]).toEqual([size - 1, money + 20]);
    use(run, 'dyevat');
    expect(new Set(run.state.colony.map((c) => c.hair)).size).toBe(1);
    const squad = run.ensureSetup().hand.length;
    use(run, 'uniform');
    expect(new Set(run.state.colony.map((c) => c.clothes)).size).toBe(1);
    expect(run.ensureSetup().hand).toHaveLength(squad - 1);
  });

  it('The Makeover gives a plain lemming a random edition (not one that has one)', () => {
    const run = runOn('Orig-1-02');
    const [a, b] = run.state.colony;
    a.edition = 'plain';
    b.edition = 'gold';
    expect(use(run, 'makeover', [b.id])).toBeNull();
    expect(use(run, 'makeover', [a.id])).not.toBeNull();
    expect(['gold', 'lucky', 'mentor', 'champion', 'wise']).toContain(a.edition);
  });

  it('The Big Gamble, The Phantom, The Sole Survivor and The Prism', () => {
    const run = runOn('Orig-1-02', ['lemming', 'glitch', 'nestegg']);
    run.state.money = 30;
    use(run, 'biggamble');
    expect(run.state.money).toBe(0);
    expect(rarityOf(run.state.jokers[3].id)).toBe('rare');
    use(run, 'phantom');
    expect(run.state.jokers.filter((j) => j.edition === 'ghost')).toHaveLength(1);
    expect(run.state.squadBonus).toBe(-1);
    use(run, 'solesurvivor');
    expect(run.state.jokers).toHaveLength(2);
    expect(run.state.jokers[0].id).toBe(run.state.jokers[1].id);
    expect(run.state.jokers[1].edition).not.toBe('ghost');
    const prism = runOn('Orig-1-02', ['lemming', 'glitch']);
    prism.state.jokers[0].edition = 'shiny';
    use(prism, 'prism');
    expect(prism.state.jokers).toEqual([expect.objectContaining({ id: 'glitch', edition: 'rainbow' })]);
    // nothing without an edition to give one to
    expect(use(prism, 'prism')).toBeNull();
  });

  it('The Lottery: 1 in 4 (4 in 4 with Loaded Dice and a copy of them) for Shiny, Glowing or Rainbow', () => {
    const run = runOn('Orig-1-02', ['copycat', 'loadeddice', 'lemming']);
    expect(use(run, 'lottery')).not.toBeNull();
    expect(['shiny', 'glowing', 'rainbow']).toContain(run.state.jokers.find((j) => j.edition)?.edition);
    const none = runOn('Orig-1-02');
    expect(use(none, 'lottery')).toBeNull();
  });

  it('the Mayhem Pack and the Mayhem Bonus; Conscription and The Cloning Vat are Mayhem boosts', () => {
    expect(MAYHEM.map((t) => t.id).sort()).toEqual(
      ['biggamble', 'bonfire', 'conscription', 'dyevat', 'makeover', 'phantom', 'prism', 'reaper', 'solesurvivor', 'summoning', 'uniform', 'vat', 'goldbadge', 'redbadge', 'bluebadge', 'purplebadge'].sort(),
    );
    expect(BOOSTS).toHaveLength(22);
    expect(TAGS).toHaveLength(24);
    const run = runOn('Orig-1-02');
    run.state.blinds[0].tag = 'mayhembonus';
    run.skipBlind();
    expect(run.state.pack!.kind).toBe('mayhem');
    expect(run.state.pack!.choices).toHaveLength(2);
    for (const c of run.state.pack!.choices) expect(c.type === 'tarot' && MAYHEM.some((t) => t.id === c.id)).toBe(true);
    run.skipPack();
    expect(run.state.phase).toBe('blinds');
  });
});

describe('Lematro Phase 4: Badges and the Rambler', () => {
  const use = (run: RunSession, id: string, selected: number[] = []) => {
    run.state.tarots = [{ uid: 7000, id }];
    return run.useTarot(7000, selected);
  };

  it('the Badge boosts give 1 selected lemming its Badge (in place of the one it had)', () => {
    const run = runOn('Orig-1-02');
    const c = run.state.colony[0];
    expect(use(run, 'goldbadge')).toBeNull();
    expect(use(run, 'goldbadge', [c.id])).toEqual([`${c.name} got a Gold Badge.`]);
    expect(c.badge).toBe('gold');
    use(run, 'purplebadge', [c.id]);
    expect(c.badge).toBe('purple');
    expect(MAYHEM).toHaveLength(16);
    expect(BOOSTS).toHaveLength(22);
  });

  it('a Red Badge counts twice when saved, for the count and for the Power Cards', () => {
    const run = runOn('Orig-1-02', ['starturn']);
    const red = { ...card(run, 'red'), edition: 'gold' as const, badge: 'red' as const };
    const plain = { ...card(run, 'red'), edition: 'plain' as const, climber: false, floater: false, insured: false };
    const { score, lines } = run.rescueCount([red, plain], [], zeroSkills());
    // 2 saved, +1 (Red Badge), Star Turn +3 twice
    expect(score).toBe(3 + 6);
    expect(lines[1]).toEqual({ label: 'Red Badges', plus: 1, total: 3 });
  });

  it('a Gold Badge earns $3 when saved; a Blue Badge saved last makes a Tribe card', () => {
    const run = runOn('Orig-1-02');
    const setup = run.ensureSetup();
    run.card(setup.hand[0])!.badge = 'gold';
    run.card(setup.hand[1])!.badge = 'gold';
    run.card(setup.hand.at(-1)!)!.badge = 'blue';
    const cash = winPerfect(run);
    expect(cash.lines).toContainEqual({ label: 'Gold Badges (2)', amount: 6 });
    expect(run.state.tarots).toHaveLength(1);
    expect(TAROTS.find((t) => t.id === run.state.tarots[0].id)!.kind).toBe('tribe');
  });

  it('a Purple Badge makes a Boost when its lemming is lost', () => {
    const run = runOn('Orig-1-02');
    const setup = run.ensureSetup();
    // Fun 2: the Floaters are saved, the others splat
    for (const id of setup.hand.slice(0, 3)) run.card(id)!.floater = true;
    run.card(setup.hand[1])!.badge = 'purple';
    run.card(setup.hand[5])!.badge = 'purple';
    playIdle(run);
    const cash = run.accept();
    expect(run.state.tarots).toHaveLength(1);
    expect(BOOSTS.some((t) => t.id === run.state.tarots[0].id)).toBe(true);
    expect(cash.notes.some((n) => n.includes('(Purple Badge) was lost'))).toBe(true);
  });

  it('the Rambler: each saved lemming gains +1 Rescues for good, counted when it is saved again', () => {
    const run = runOn('Orig-1-02', ['rambler']);
    const setup = run.ensureSetup();
    const hand = [...setup.hand];
    winPerfect(run);
    for (const id of hand) expect(run.card(id)!.bonus).toBe(1);
    const saved = hand.slice(0, 3).map((id) => run.card(id)!);
    // sold: the bonus stays on the lemmings
    run.state.jokers = [];
    const { score, lines } = run.rescueCount(saved, saved, zeroSkills());
    expect(score).toBe(6);
    expect(lines.at(-1)).toEqual({ label: 'Lemming bonuses', plus: 3, total: 6 });
  });
});
