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

describe('Redraws', () => {
  const SPREAD: SkillCounts = { climber: 6, floater: 6, bomber: 6, blocker: 6, builder: 12, basher: 8, miner: 8, digger: 8 };
  function ready(seed = 'REDRAWS'): RunSession {
    const run = RunSession.newRun(catalog, seed);
    for (const sk of SKILLS) run.setAbility(sk, SPREAD[sk]);
    expect(run.finishAssignment()).toBe(true);
    run.state.blinds[0].levelId = 'Orig-1-02';
    return run;
  }

  it('redraws exactly the chosen lemmings, including Super Lemmings and Badges, twice before a level', () => {
    const run = ready();
    const setup = run.ensureSetup();
    const gold = run.card(setup.hand[0])!;
    gold.edition = 'gold';
    run.card(setup.hand[1])!.badge = 'red';
    const before = [...setup.hand];
    const colony = structuredClone(run.state.colony);
    const selected = before.slice(0, 2);
    expect(run.redrawsLeft()).toBe(2);
    expect(run.redrawable()).toEqual(before);
    const r = run.redraw([...selected, selected[0]])!;
    const after = run.state.setup!.hand;
    expect(after).toHaveLength(10);
    expect(after.slice(2)).toEqual(before.slice(2));
    for (const id of selected) expect(after).not.toContain(id);
    expect(r.came).toHaveLength(2);
    expect(new Set(after).size).toBe(after.length);
    expect(run.state.colony).toEqual(colony);
    expect(run.ensureSetup().hand).toEqual(after);
    const reloaded = new RunSession(catalog, structuredClone(run.state));
    expect(reloaded.ensureSetup().hand).toEqual(after);
    expect(run.redrawsLeft()).toBe(1);
    run.redraw([after[0]]);
    for (const id of selected) expect(setup.hand).not.toContain(id);
    expect(run.redrawsLeft()).toBe(0);
    expect(run.redraw([setup.hand[0]])).toBeNull();
    // the squad stays as it is when it is drawn again, and once the level has begun no Redraw is left; the unused are counted
    const hand = [...run.state.setup!.hand];
    expect(run.ensureSetup().hand).toEqual(hand);
    run.startBlind();
    expect(run.redrawsLeft()).toBe(0);
    expect(run.state.stats.redrawsUnused).toBe(0);
  });

  it('rejects empty selections, non-squad members and selections without enough replacements without spending a Redraw', () => {
    const run = ready();
    const setup = run.ensureSetup();
    const reserve = run.state.colony.find((c) => !setup.hand.includes(c.id))!;
    run.state.colony = run.state.colony.filter((c) => setup.hand.includes(c.id) || c === reserve);
    const before = structuredClone(run.state);
    expect(run.redrawLimit()).toBe(1);
    expect(run.redrawable()).toEqual(setup.hand);
    expect(run.redraw([])).toBeNull();
    expect(run.redraw([reserve.id])).toBeNull();
    expect(run.redraw([999999])).toBeNull();
    expect(run.redraw(setup.hand.slice(0, 2))).toBeNull();
    expect(run.state).toEqual(before);
    const returned = setup.hand[0];
    expect(run.redraw([returned])!.came).toEqual([reserve.id]);
    expect(run.redrawLimit()).toBe(0);
    expect(run.redrawable()).toEqual([]);
    expect(run.redraw([setup.hand[0]])).toBeNull();
    expect(run.redrawsLeft()).toBe(1);
    expect(run.card(returned)).toBeDefined();
  });

  it('draws random replacements reproducibly from the run seed and disallows redraws once play begins', () => {
    const a = ready('REDRAW-RANDOM');
    const b = ready('REDRAW-RANDOM');
    const sa = a.ensureSetup();
    const sb = b.ensureSetup();
    expect(a.redraw(sa.hand.slice(0, 4))!.came).toEqual(b.redraw(sb.hand.slice(0, 4))!.came);
    expect(a.state.setup!.hand).toEqual(b.state.setup!.hand);
    a.startBlind();
    expect(a.redrawLimit()).toBe(0);
    expect(a.redraw([sa.hand[0]])).toBeNull();
  });
});
