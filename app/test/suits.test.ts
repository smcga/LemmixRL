import { describe, expect, it } from 'vitest';
import { Bitmap32, createSessionFromInfo, getStyle, StyleDef } from '../../engine/src/index.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { LevelCatalog } from '../src/run/catalog.ts';
import { JOKERS, jokerDef, jokerText, keywordsOf, PACKS, TAGS, TAROTS } from '../src/run/content.ts';
import { drawnIndexes, parseRich, plainText, RICH_COLORS } from '../src/run/rich.ts';
import { RunSession } from '../src/run/session.ts';
import { SKILLS, type SkillCounts, zeroSkills } from '../src/run/skills.ts';
import type { LemmingCard } from '../src/run/state.ts';

const data = repoDataProvider();
const catalog = new LevelCatalog(getStyle(data, StyleDef.Orig));
const SPREAD: SkillCounts = { climber: 6, floater: 6, bomber: 6, blocker: 6, builder: 12, basher: 8, miner: 8, digger: 8 };

function runWith(jokers: string[] = [], levelId = 'Orig-1-02'): RunSession {
  const run = RunSession.newRun(catalog, 'SUITS');
  for (const sk of SKILLS) run.setAbility(sk, SPREAD[sk]);
  expect(run.finishAssignment()).toBe(true);
  run.state.blinds[0].levelId = levelId;
  jokers.forEach((id, i) => run.state.jokers.push({ uid: 900 + i, id }));
  return run;
}

/** a lemming of the colony with these colours (its own id) */
function lem(run: RunSession, i: number, hair: LemmingCard['hair'], clothes: LemmingCard['clothes'] = 'blue'): LemmingCard {
  const c = run.state.colony[i];
  c.hair = hair;
  c.clothes = clothes;
  return c;
}

function score(run: RunSession, order: LemmingCard[]): number {
  return run.rescueCount(order, order, zeroSkills()).score;
}

function playIdle(run: RunSession) {
  const setup = run.startBlind();
  const session = createSessionFromInfo(
    data,
    catalog.get(setup.levelId).info,
    { view: { bitmapToControl: (x, y) => ({ x, y }), renderLowResText: (t) => new Bitmap32(t.length * 7, 14) } },
    (level) => run.applyToLevel(level),
  );
  run.attach(session.game);
  session.game.start(false);
  for (let n = 0; n < 30000 && !session.game.isFinished; n++) session.game.update();
  return run.finishAttempt(session.game);
}

describe('the colours of a description', () => {
  it('parses the tags: blue +Rescues, red X Rescues, gold money, colours of hair', () => {
    const { plain, spans } = parseRich('Saved {c:orange}Orange{} hair give {+}+1{} Rescues, {x}X2{} or {$}$3{}');
    expect(plain).toBe('Saved Orange hair give +1 Rescues, X2 or $3');
    expect(spans.map((s) => plain.slice(s.start, s.start + s.length))).toEqual(['Orange', '+1', 'X2', '$3']);
    expect(spans[1].color).toBe(RICH_COLORS['+']);
    expect(spans[2].color).toBe(RICH_COLORS.x);
    expect(parseRich('no tags at all').spans).toEqual([]);
  });

  it('colours the letters as they are drawn: a line break in place of a space shifts everything after it', () => {
    // Conscription, wrapped after the 3: "Super" is the 40th character, the 39th drawn
    const plain = '5 random plain lemmings leave, 3 random Super Lemmings join';
    const at = drawnIndexes(plain, '5 random plain lemmings leave, 3\nrandom Super Lemmings join', () => true);
    expect(at[plain.indexOf('3')]).toBe(31);
    expect(at[plain.indexOf(' random S')]).toBe(-1);
    expect(at[plain.indexOf('Super')]).toBe(39);
    // two wraps, and a character the font cannot draw
    expect(drawnIndexes('a b c', 'a\nb\nc', () => true)).toEqual([0, -1, 1, -1, 2]);
    expect(drawnIndexes('a~b', 'a~b', (code) => code !== 126)).toEqual([0, -1, 1]);
  });

  it('every Power Card, Boost, pack and Skip Bonus describes itself in known tags, without explaining the game in it', () => {
    for (const t of [...JOKERS.map((d) => d.text), ...TAROTS.map((d) => d.text), ...Object.values(PACKS).map((d) => d.text), ...TAGS.map((d) => d.text)]) {
      const plain = plainText(t);
      expect(plain, t).not.toMatch(/[{}#]/);
      // (what a term means is in the box next to the description, not in it)
      expect(plain, t).not.toMatch(/count(s)? as \d|not of your colony|\(they are/);
      expect(plain.length, t).toBeLessThan(120);
      for (const tag of t.match(/\{([^{}]*)\}/g) ?? []) expect(['{}', '{+}', '{x}', '{$}', '{%}', '{s}', '{!}', '{~}'].includes(tag) || /^\{c:(green|orange|red|purple|blue)\}$/.test(tag), tag).toBe(true);
    }
  });

  it('the terms of a description get their boxes: +Rescues, X Rescues, Drop in, Respawns, Fully', () => {
    const titles = (id: string) => keywordsOf(plainText(jokerDef(id).text)).map((k) => k.title);
    expect(titles('orangehair')).toContain('+Rescues');
    expect(titles('redshirts')).toContain('X Rescues');
    expect(titles('hitchhikers')).toContain('Drop in');
    expect(titles('camouflage')).toContain('Respawns');
    expect(titles('coordinated')).toContain('Fully');
    // Paratroopers are of the colony: they parachute in, they do not "drop in"
    expect(titles('paratroopers')).not.toContain('Drop in');
  });

  it('a Power Card of the run says its colour and its lemming', () => {
    const run = runWith(['checklist', 'trendsetter', 'teacherspet']);
    expect(plainText(jokerDef('checklist').text)).toContain('Red clothes');
    expect(plainText(jokerText(jokerDef('checklist'), { color: 'purple' }))).toContain('Purple clothes');
    const pet = run.state.colony[3];
    expect(plainText(jokerText(jokerDef('teacherspet'), { target: pet.id }, (id) => run.card(id)?.name))).toContain(pet.name);
  });
});

describe('Copycat and Hive Mind', () => {
  it('Copycat copies the Power Card to its right, Hive Mind the leftmost one', () => {
    const order = (run: RunSession) => [lem(run, 0, 'green'), lem(run, 1, 'green'), lem(run, 2, 'green')];
    // 3 saved, Abstract +3 for each of 2 Power Cards: 9; copied: 15
    expect(score(runWith(['abstract']), order(runWith(['abstract'])))).toBe(3 + 3);
    let run = runWith(['copycat', 'abstract']);
    expect(score(run, order(run))).toBe(3 + 6 + 6);
    expect(run.rescueCount(order(run), order(run), zeroSkills()).lines.map((l) => l.label)).toEqual(['Lemmings saved', 'Copycat (Abstract Lemming)', 'Abstract Lemming']);
    run = runWith(['abstract', 'hivemind']);
    expect(score(run, order(run))).toBe(15);
    // a chain of copies; a copy of nothing; a Hive Mind on the left copies nothing
    run = runWith(['copycat', 'copycat', 'abstract']);
    expect(score(run, order(run))).toBe(3 + 9 + 9 + 9);
    expect(runWith(['abstract', 'copycat']).copyOf(901)).toBeNull();
    expect(runWith(['hivemind', 'abstract']).copyOf(900)).toBeNull();
  });

  it('copies abilities and money, but not what would do the same thing twice', () => {
    const run = runWith(['copycat', 'guild']);
    expect(run.capability().builder - run.state.capacity.builder).toBe(4);
    expect(runWith(['copycat', 'checklist']).copyOf(900)).toBeNull();
    expect(runWith(['copycat', 'recycler']).copyOf(900)).toBeNull();
    expect(runWith(['copycat', 'paydayloan']).debtLimit()).toBe(50);
  });
});

describe('hair and clothes', () => {
  it('Follow the Leader, Paint Box, Orange Jumpsuit, Redshirts, Colour Coordinated', () => {
    let run = runWith(['follow']);
    // green green orange orange green: 2 follow the one before
    expect(score(run, [lem(run, 0, 'green'), lem(run, 1, 'green'), lem(run, 2, 'orange'), lem(run, 3, 'orange'), lem(run, 4, 'green')])).toBe(5 + 2);
    run = runWith(['paintbox']);
    const five = [lem(run, 0, 'green'), lem(run, 1, 'orange'), lem(run, 2, 'red'), lem(run, 3, 'purple'), lem(run, 4, 'blue')];
    expect(score(run, five)).toBe(15);
    expect(score(run, five.slice(0, 4))).toBe(4);
    run = runWith(['jumpsuit']);
    expect(score(run, [lem(run, 0, 'green', 'orange'), lem(run, 1, 'green')])).toBe(2 + 3);
    run = runWith(['redshirts']);
    // 10 X1.2 X1.2 = 14.4
    expect(score(run, [...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => lem(run, i, 'green')), lem(run, 8, 'green', 'red'), lem(run, 9, 'green', 'red')])).toBe(14);
    run = runWith(['coordinated']);
    expect(score(run, [lem(run, 0, 'red', 'red'), lem(run, 1, 'blue', 'blue'), lem(run, 2, 'green', 'blue'), lem(run, 3, 'green', 'blue'), lem(run, 4, 'green', 'blue')])).toBe(7);
  });

  it("the Trendsetter's colour and the Teacher's Pet's lemming: chosen when bought, changed after each level", () => {
    const run = runWith();
    run.state.money = 100;
    run.state.phase = 'shop';
    run.state.shop = { offers: [{ uid: 1, type: 'joker', id: 'trendsetter', price: 7, sold: false }, { uid: 2, type: 'joker', id: 'teacherspet', price: 6, sold: false }], packs: [], rerolls: 0 };
    expect(run.buy(1)).toBe(true);
    expect(run.buy(2)).toBe(true);
    const [trend, pet] = run.state.jokers;
    expect(trend.color).toBeDefined();
    expect(trend.color).not.toBe('green');
    expect(run.card(pet.target!)).toBeDefined();
    // X1.1 for each saved with its hair; X2 when the pet is saved
    const order = [lem(run, 0, trend.color!), lem(run, 1, trend.color!), lem(run, 2, 'green')];
    const withPet = order.some((c) => c.id === pet.target) ? order : [...order, run.card(pet.target!)!];
    const n = withPet.length;
    expect(run.rescueCount(withPet, withPet, zeroSkills()).score).toBe(Math.floor(n * 1.1 ** withPet.filter((c) => c.hair === trend.color).length * 2 + 1e-9));
  });

  it('the Hair Salon pays; Camouflage brings back lost lemmings in green clothes', () => {
    const run = runWith(['salon', 'camouflage']);
    const setup = run.ensureSetup();
    // Fun 2: the floaters are saved, the others splat
    const hairs = ['green', 'orange', 'red'] as const;
    setup.hand.slice(0, 3).forEach((id, i) => Object.assign(run.card(id)!, { floater: true, clothes: 'purple', hair: hairs[i] }));
    for (const id of setup.hand.slice(3)) run.card(id)!.clothes = 'green';
    const size = run.state.colony.length;
    const out = playIdle(run);
    expect(out.rescued).toBe(3);
    const cash = run.accept();
    expect(cash.lines).toContainEqual({ label: 'Hair Salon', amount: 3 });
    expect(run.state.colony.length).toBe(size);
    expect(cash.notes.some((n) => n.includes('(Camouflage)'))).toBe(true);
  });
});

describe('the dyes, the Barber and the Tailor', () => {
  it('give hair colours, and the hair or the clothes of another lemming', () => {
    const run = runWith();
    run.state.phase = 'blinds';
    const [a, b, c] = [run.state.colony[10], run.state.colony[11], run.state.colony[12]];
    run.state.tarots = [
      { uid: 1, id: 'amethyst' },
      { uid: 2, id: 'barber' },
      { uid: 3, id: 'tailor' },
    ];
    expect(run.useTarot(1, [a.id, b.id])).not.toBeNull();
    expect([a.hair, b.hair]).toEqual(['purple', 'purple']);
    c.hair = 'red';
    c.clothes = 'orange';
    // the Barber needs exactly 2
    expect(run.useTarot(2, [a.id])).toBeNull();
    expect(run.useTarot(2, [a.id, c.id])).not.toBeNull();
    expect(a.hair).toBe('red');
    expect(run.useTarot(3, [b.id, c.id])).not.toBeNull();
    expect(b.clothes).toBe('orange');
    expect(c.hair).toBe('red');
  });
});
