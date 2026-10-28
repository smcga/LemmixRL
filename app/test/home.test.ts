import { describe, expect, it } from 'vitest';
import { getStyle, LemmingAction, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { ColonyHome, HOME_BOTTOM, HOME_PENS, HOME_W } from '../src/run/home.ts';
import { RunSession } from '../src/run/session.ts';
import { SKILLS, type SkillCounts } from '../src/run/skills.ts';
import type { LemmingCard } from '../src/run/state.ts';

const data = repoDataProvider();
const catalog = new LevelCatalog(getStyle(data, StyleDef.Orig));
const base = catalog.get('Orig-1-01').info;

function colony(n: number): LemmingCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `L${i + 1}`, climber: false, floater: false, edition: 'plain' as const, insured: false, saves: 0 }));
}

function frames(home: ColonyHome, n: number): void {
  for (let i = 0; i < n; i++) home.update();
}

describe('the colony at home', () => {
  it('every lemming of the colony is at home, on the floors, and stays there (the home never ends)', () => {
    const cards = colony(40);
    const home = new ColonyHome(data, base, () => cards, undefined);
    expect(home.lemmings()).toHaveLength(40);
    frames(home, 600);
    expect(home.game.isFinished).toBe(false);
    // nothing is lost at home: every lemming is still there (or on its way back by the trapdoor)
    frames(home, 60);
    expect(home.lemmings().length).toBeGreaterThanOrEqual(36);
    for (const l of home.lemmings()) expect(l.xPos).toBeLessThan(HOME_W);
  });

  it('skills cost nothing; the ground and where the lemmings are is kept', () => {
    const cards = colony(10);
    const home = new ColonyHome(data, base, () => cards, undefined);
    frames(home, 5);
    // a blocker, and a digger through the bottom floor
    const [a, b] = home.lemmings().filter((l) => l.yPos === HOME_BOTTOM);
    expect(home.assign('blocker', a.xPos, a.yPos - 5)).toBe(true);
    frames(home, 2);
    const holeX = b.xPos;
    expect(home.assign('digger', b.xPos, b.yPos - 5)).toBe(true);
    frames(home, 40);
    expect(home.game.skillCount(LemmingAction.Digging)).toBeGreaterThanOrEqual(98);
    const saved = home.save();
    expect(saved.lemmings.find((s) => s.id === home.card(a)!.id)?.blocker).toBe(true);
    // a new visit: the hole is there, the blocker blocks
    const again = new ColonyHome(data, base, () => cards, saved);
    const hasGround = (h: ColonyHome) => h.game.hasPixelAt(holeX, HOME_BOTTOM + 2);
    expect(hasGround(home)).toBe(false);
    expect(hasGround(again)).toBe(false);
    expect(again.lemmings().some((l) => l.action === LemmingAction.Blocking)).toBe(true);
    expect(new ColonyHome(data, base, () => cards, undefined).game.hasPixelAt(holeX, HOME_BOTTOM + 2)).toBe(true);
  });

  it('a lemming lost at home comes back by the trapdoor; a new one comes in by it', () => {
    const cards = colony(5);
    const home = new ColonyHome(data, base, () => cards, undefined);
    frames(home, 40);
    const first = home.lemmings()[0];
    const id = home.card(first)!.id;
    expect(home.assign('bomber', first.xPos, first.yPos - 5)).toBe(true);
    frames(home, 200);
    expect(home.lemmings().filter((l) => home.card(l)?.id === id)).toHaveLength(1);
    // the colony grows: the new lemming comes in on the next visit
    const saved = home.save();
    cards.push({ ...cards[0], id: 99, name: 'New' });
    const again = new ColonyHome(data, base, () => cards, saved);
    expect(again.lemmings().some((l) => again.card(l)?.id === 99)).toBe(false);
    frames(again, 60);
    expect(again.lemmings().some((l) => again.card(l)?.id === 99)).toBe(true);
  });
});

describe('the home as it starts, and the brush', () => {
  it('three shelves of three pens: every lemming stays in its pen, climbers too', () => {
    const cards = colony(36).map((c, i) => ({ ...c, climber: i % 3 === 0 }));
    const home = new ColonyHome(data, base, () => cards, undefined);
    expect(HOME_PENS).toHaveLength(9);
    // (a climber on a wall of its pen is in the column of the wall)
    const penOf = (x: number, y: number) => HOME_PENS.findIndex(([x0, x1, fy]) => x >= x0 - 1 && x <= x1 + 1 && y <= fy && y > fy - 46);
    const start = new Map(home.lemmings().map((l) => [home.card(l)!.id, penOf(l.xPos, l.yPos)]));
    expect([...start.values()].every((p) => p >= 0)).toBe(true);
    // every pen but the nook of the exit has lemmings
    expect(new Set(start.values()).size).toBe(9);
    frames(home, 800);
    for (const l of home.lemmings()) expect(penOf(l.xPos, l.yPos), home.card(l)!.name).toBe(start.get(home.card(l)!.id));
  });

  it('Dirt paints ground and Erase takes it away; the home keeps it', () => {
    const cards = colony(4);
    const home = new ColonyHome(data, base, () => cards, undefined);
    // a hole through the wall between the first two pens of the top row, and a block in the middle of the second
    home.paint(102, 46, 4, false);
    home.paint(150, 30, 4, true);
    expect(home.game.hasPixelAt(102, 46)).toBe(false);
    expect(home.game.hasPixelAt(150, 30)).toBe(true);
    // (nothing outside the home)
    home.paint(HOME_W + 3, 30, 4, true);
    expect(home.game.hasPixelAt(HOME_W + 3, 30)).toBe(false);
    const again = new ColonyHome(data, base, () => cards, home.save());
    expect(again.game.hasPixelAt(102, 46)).toBe(false);
    expect(again.game.hasPixelAt(150, 30)).toBe(true);
  });
});

describe('Poof and the trapdoor', () => {
  it('Poof: a lemming gone without a hole, back in by the trapdoor, which can be moved (and is kept where it was put)', () => {
    const cards = colony(6);
    const home = new ColonyHome(data, base, () => cards, undefined);
    frames(home, 40);
    // the trapdoor over the middle pen of the middle row: lemmings drop in there
    home.moveTrapdoor(150, 70);
    const l = home.lemmings()[0];
    const floor = l.yPos;
    const id = home.card(l)!.id;
    const ground = () => Array.from({ length: 9 }, (_, d) => home.game.hasPixelAt(l.xPos - 4 + d, floor + 1)).every(Boolean);
    expect(ground()).toBe(true);
    home.poof(l);
    expect(l.isRemoved).toBe(true);
    frames(home, 80);
    expect(ground()).toBe(true);
    const back = home.lemmings().find((x) => home.card(x)?.id === id)!;
    expect(back).toBeDefined();
    // it came in by the trapdoor where it was put: it is in the middle pen of the middle row now
    expect(back.xPos).toBeGreaterThan(105);
    expect(back.xPos).toBeLessThan(200);
    expect(back.yPos).toBeLessThanOrEqual(100);
    const saved = home.save();
    expect(saved.entrance).toEqual({ left: 126, top: 56 });
    expect(new ColonyHome(data, base, () => cards, saved).game.entrancePoint(0)).toEqual({ x: 150, y: 70 });
  });
});

describe('Swaps', () => {
  const SPREAD: SkillCounts = { climber: 6, floater: 6, bomber: 6, blocker: 6, builder: 12, basher: 8, miner: 8, digger: 8 };
  it('swap lemmings of the squad for the next ones of the colony, 3 a level, before it begins', () => {
    const run = RunSession.newRun(catalog, 'SWAPS');
    for (const sk of SKILLS) run.setAbility(sk, SPREAD[sk]);
    expect(run.finishAssignment()).toBe(true);
    // a level of 10 lemmings out of the colony of 80
    run.state.blinds[0].levelId = 'Orig-1-02';
    const before = [...run.ensureSetup().hand];
    expect(run.swapsLeft()).toBe(3);
    // only lemmings of the squad can be swapped
    const outside = run.state.colony.find((c) => !before.includes(c.id))!.id;
    expect(run.swap([outside])).toBeNull();
    expect(run.swap(before.slice(0, 2))).not.toBeNull();
    const after = run.state.setup!.hand;
    expect(after).toHaveLength(10);
    for (const id of before.slice(0, 2)) expect(after).not.toContain(id);
    expect(run.swapsLeft()).toBe(1);
    // more than the Swaps left: only as many as are left
    run.swap(after.slice(0, 3));
    expect(run.swapsLeft()).toBe(0);
    expect(run.state.setup!.swappedOut).toHaveLength(3);
    // the squad stays as it is when it is drawn again, and once the level has begun no Swap is left; the unused are counted
    const hand = [...run.state.setup!.hand];
    expect(run.ensureSetup().hand).toEqual(hand);
    run.startBlind();
    expect(run.swapsLeft()).toBe(0);
    expect(run.state.stats.swapsUnused).toBe(0);
  });
});
