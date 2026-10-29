/**
 * Browser test of a roguelike run: from the title of Lematro, start a run, play Level 1 ("Just dig!", solved with a
 * digger), cash out (a won level goes straight there), the shop (a Lemmings Pack dragged up to open it and one of its
 * cards taken, a gadget bought with its Buy button, put in another place and sold by dragging it, a boost bought and
 * used), skip Level 2, and continue the saved run after a reload.
 *
 *   npm run e2e         (CHROMIUM=/path/to/chromium to use a specific browser; otherwise Playwright's)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';

const server = await createServer({ configFile: `${REPO_ROOT}/vite.config.ts`, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error('no server url');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors: string[] = [];
const fail = (msg: string): never => {
  throw new Error(msg);
};
// the run screens are 960 x 540, scaled to fill the 1280 x 720 page (the camera says where a point of them is)
let cam = { x: 0, y: 0, zoom: 1, left: 0, top: 0 };
const vx = (x: number) => cam.left + (x - cam.x) * cam.zoom;
const vy = (y: number) => cam.top + (y - cam.y) * cam.zoom;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('dialog', (d) => void d.accept());
  const ev = <T>(js: string) => page.evaluate(js) as Promise<T>;
  const click = async (x: number, y: number, wait = 500) => {
    await page.mouse.click(vx(x), vy(y));
    await page.waitForTimeout(wait);
  };
  const state = () => ev<Record<string, any>>('globalThis.lemmix.run.state');
  const scene = `globalThis.phaserGame.scene.getScene('run')`;
  // where a button or a card of the run screens is (the scene keeps the middle of each by name)
  const spot = async (name: string) => (await ev<{ x: number; y: number } | undefined>(`${scene}.spots[${JSON.stringify(name)}]`)) ?? fail(`nothing called ${name} on the screen`);
  const clickSpot = async (name: string, wait = 500) => {
    const p = await spot(name);
    await click(p.x, p.y, wait);
  };
  // a card dragged with the mouse to a point of the screen
  const dragSpot = async (name: string, x: number, y: number) => {
    const p = await spot(name);
    await page.mouse.move(vx(p.x), vy(p.y));
    await page.mouse.down();
    await page.mouse.move(vx(x), vy(y), { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  await page.goto(url);
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  // the first screen asks for a key (or a tap, or a click): the sound can start after it
  await page.waitForFunction(() => (globalThis as any).phaserGame?.scene.isActive('start'), null, { timeout: 30000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (globalThis as any).phaserGame.scene.isActive('title'), null, { timeout: 5000 });
  await page.waitForTimeout(500);
  // the credits on the title are links (opened in a new tab)
  await ev(`window.open = (url) => { globalThis.openedUrl = url; return null; }`);
  const balatro = await ev<{ x: number; y: number; zoom: number; left: number; top: number; sx: number; sy: number }>(
    `(() => { const sc = globalThis.phaserGame.scene.getScene('title'); const c = sc.cameras.main; const s = sc.spots['link:Balatro']; return { x: c.worldView.x, y: c.worldView.y, zoom: c.zoom, left: c.x, top: c.y, sx: s.x, sy: s.y }; })()`,
  );
  await page.mouse.click(balatro.left + (balatro.sx - balatro.x) * balatro.zoom, balatro.top + (balatro.sy - balatro.y) * balatro.zoom);
  await page.waitForTimeout(200);
  if ((await ev<string>('globalThis.openedUrl')) !== 'https://www.playbalatro.com/') fail('the Balatro credit did not link to its site');
  await page.keyboard.press('F6'); // the title of Lematro -> run
  await page.waitForTimeout(600);
  const camera = () =>
    ev<typeof cam>(`(() => { const c = globalThis.phaserGame.scene.getScene('run').cameras.main; return { x: c.worldView.x, y: c.worldView.y, zoom: c.zoom, left: c.x, top: c.y }; })()`);
  cam = await camera();
  if (Math.abs(cam.zoom - 1280 / 960) > 0.01) fail('the run screens do not fill the page: zoom ' + cam.zoom);
  await clickSpot('newRun');
  let s = await state();
  if (s.ante !== 1 || s.colony.length !== 80 || s.money !== 4) fail('unexpected new run ' + JSON.stringify({ ante: s.ante, money: s.money }));

  // the abilities: 60 points, at most 20 in a skill (the 20th point of the bars of diggers, builders and bashers)
  if (s.phase !== 'assign') fail('a new run does not start with the ability assignment');
  const ability = async (skill: string, n: number) => {
    const p = await spot(`ability:${skill}`);
    await click(p.x + (n - 1) * 8, p.y, 200);
  };
  const done = () => clickSpot('done');
  await ability('digger', 20);
  await ability('builder', 20);
  await done(); // 20 points are not placed yet
  if ((await state()).phase !== 'assign') fail('the assignment ended with points left');
  await ability('basher', 20);
  s = await state();
  if (s.capacity.digger !== 20 || s.capacity.builder !== 20 || s.capacity.basher !== 20) fail('unexpected abilities ' + JSON.stringify(s.capacity));
  // the preview of a level of the round (Level 2, a wide level here): it opens, scrolls and closes
  await ev(`(() => { globalThis.lemmix.run.state.blinds[1].levelId = 'Orig-1-08'; globalThis.phaserGame.scene.getScene('run').render(); })()`);
  await page.waitForTimeout(200);
  // the Wiki button of a level opens its page on the Lemmings Wiki
  await ev(`window.open = (url) => { globalThis.openedUrl = url; return null; }`);
  await clickSpot('wiki:0');
  const wiki = await ev<string>('globalThis.openedUrl');
  if (!/^https:\/\/lemmings\.fandom\.com\/wiki\/Special:Search\?query=.+&go=Go$/.test(wiki ?? '')) fail('the Wiki button did not open the Lemmings Wiki: ' + wiki);
  // Auto pick places every point
  await clickSpot('reset');
  await clickSpot('autoPick');
  if (Object.values((await state()).capacity as Record<string, number>).reduce((a, b) => a + b, 0) !== 60) fail('Auto pick did not place the 60 points');
  await clickSpot('reset');
  await ability('digger', 20);
  await ability('builder', 20);
  await ability('basher', 20);
  await clickSpot('preview:1');
  if ((await ev<number>(`${scene}.overlay.length`)) === 0) fail('Preview did not open the level preview');
  const sx0 = await ev<number>(`${scene}.previewSx`);
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(vx(700), vy(240));
  await page.mouse.down();
  await page.mouse.move(vx(500), vy(240), { steps: 5 });
  await page.mouse.up();
  if ((await ev<number>(`${scene}.previewSx`)) !== sx0 + 48 + 100) fail('the level preview did not scroll');
  await clickSpot('close');
  if ((await ev<number>(`${scene}.overlay.length`)) !== 0) fail('the level preview did not close');
  await done();
  if ((await state()).phase !== 'blinds') fail('the assignment did not end');

  // the small blind becomes "Just dig!"
  await ev(`(() => { const s = globalThis.lemmix.run.state; s.blinds[0].levelId = 'Orig-1-01'; s.setup = null; s.jokers.push({uid: 900001, id: 'longbridge'}); s.tarots.push({uid: 900002, id: 'ember'}, {uid: 900003, id: 'umbrella'}); globalThis.phaserGame.scene.getScene('run').render(); })()`);
  await clickSpot('play', 800); // Select
  // the level before it is played: the screen of a run (a click anywhere goes on, as in Lemmings)
  const active = () => ev<string>(`globalThis.phaserGame.scene.getScenes(true).map((s) => s.sys.settings.key).join()`);
  if ((await active()) !== 'runpreview') fail('Select did not show the level before it is played: ' + (await active()));
  await page.mouse.click(640, 400); // preview -> game
  await page.waitForFunction(
    () => {
      const g = (globalThis as any).lemmix.game;
      return g.playing && g.lemmingList.some((l: any) => !l.isRemoved && l.action === 1);
    },
    null,
    { timeout: 30000 },
  );
  if ((await ev<number>('globalThis.lemmix.game.currDiggerCount')) !== 10) fail('the level does not have min(abilities, allocation) = 10 diggers');
  // a level of a run: no walker selection, frame steps or rewinding (touch buttons or keys); its keys are shown
  const player = `globalThis.phaserGame.scene.getScene('player')`;
  const labels = await ev<string[]>(`${player}.touchBar.buttons.map((b) => b.def.label)`);
  if (labels.some((l) => ['WALKER', 'STEP', '-1 SEC'].includes(l))) fail('a run has the touch buttons of time and the walker: ' + labels.join());
  await page.keyboard.press('p');
  if (!(await ev<boolean>('globalThis.lemmix.game.isPaused'))) fail('P did not pause the level of a run');
  // The cards above the level use the same pointer as the game. Select a living lemming while paused, then use a Boost.
  const cardPoint = (x: number, y: number) => ev<{ x: number; y: number }>(`(() => { const c = ${player}.levelCards.container; return { x: c.x + ${x} * c.scaleX, y: c.y + ${y} * c.scaleY }; })()`);
  const clickCardPoint = async (x: number, y: number) => { const p = await cardPoint(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); };
  const cardCursor = await cardPoint(358, 54);
  await page.mouse.move(cardCursor.x, cardCursor.y);
  await page.waitForTimeout(100);
  const cursor = await ev<{ x: number; y: number; visible: boolean; depth: number; cardDepth: number }>(`(() => { const p = ${player}; return { x: p.cursorImage.x + 7 * p.scaleFactor, y: p.cursorImage.y + 7 * p.scaleFactor, visible: p.cursorImage.visible, depth: p.cursorImage.depth, cardDepth: p.levelCards.container.depth }; })()`);
  if (!cursor.visible || cursor.depth <= cursor.cardDepth || Math.abs(cursor.x - cardCursor.x) > 2 || Math.abs(cursor.y - cardCursor.y) > 2) fail('the cursor does not follow the mouse over the cards: ' + JSON.stringify(cursor));
  await clickCardPoint(358, 54);
  const selectedLem = await ev<{ x: number; y: number; id: number }>(`(() => { const p = ${player}; const l = globalThis.lemmix.game.lemmingList.find((v) => !v.isRemoved && globalThis.lemmix.run.cardOfLemming(v)); return { x: p.left + l.xPos * p.scaleFactor + p.player.offsetHorz, y: p.top + (l.yPos - 8) * p.scaleFactor, id: globalThis.lemmix.run.cardOfLemming(l).id }; })()`);
  await page.mouse.click(selectedLem.x, selectedLem.y);
  if (!(await ev<number[]>(`${player}.levelCards.targets`)).includes(selectedLem.id)) fail('the living lemming was not selected');
  await clickCardPoint(854, 27);
  if ((await state()).colony.find((c: any) => c.id === selectedLem.id).hair !== 'red') fail('the Boost did not change the selected lemming: ' + JSON.stringify(await ev(`({selected: ${player}.levelCards.selected, targets: ${player}.levelCards.targets, message: ${player}.levelCards.message})`)));
  await clickCardPoint(358, 54);
  await clickCardPoint(921, 27);
  if ((await state()).tarots.length) fail('the consumable was not sold');
  await clickCardPoint(32, 54);
  await clickCardPoint(921, 27);
  if ((await state()).jokers.length) fail('the Power Card was not sold');
  await ev('globalThis.lemmix.run.state.money = 4'); // keep the rest of this run test independent of the sales
  const it0 = await ev<number>('globalThis.lemmix.game.currentIteration');
  await page.keyboard.press('!'); // (rewind one second, in Lemmix)
  await page.keyboard.press('1'); // (skip one second)
  if ((await ev<number>('globalThis.lemmix.game.currentIteration')) !== it0) fail('the time of a level of a run can be moved');
  await page.keyboard.press('p');
  await page.keyboard.press('F10');
  const l = await ev<{ x: number; y: number; scroll: number }>(
    `(() => { const g = globalThis.lemmix.game; const lem = g.lemmingList.find((x) => !x.isRemoved && x.action === 1); return { x: lem.xPos, y: lem.yPos, scroll: g.level.info.screenPosition }; })()`,
  );
  const gamePoint = await ev<{ x: number; y: number }>(`(() => { const p = ${player}; return { x: p.left + (${l.x} + 3) * p.scaleFactor + p.player.offsetHorz, y: p.top + (${l.y} - 8) * p.scaleFactor }; })()`);
  await page.mouse.move(gamePoint.x, gamePoint.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  // to the end (z does that in Lemmix, not in a run: the test moves the clock itself)
  await ev(`(() => { const g = globalThis.lemmix.game; g.gotoIteration(g.currentIteration + 17 * 60 * 10); })()`);
  await page.waitForFunction(() => (globalThis as any).lemmix.run.state.phase === 'result', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.mouse.click(640, 400); // postview -> result
  await page.waitForTimeout(800);
  s = await state();
  if (!s.outcome?.success || s.outcome.rescued !== 10) fail('unexpected outcome ' + JSON.stringify(s.outcome));

  // a won level is cashed out: no going back to it
  s = await state();
  if (s.phase !== 'cashout' || s.cashout.total !== 10) fail('unexpected cash out ' + JSON.stringify(s.cashout));
  await clickSpot('cashout');
  s = await state();
  if (s.phase !== 'shop' || s.money !== 14) fail(`not in the shop with $14: ${s.phase} $${s.money}`);

  // the shop, as in Balatro: a pack dropped anywhere but Open goes back; dragged up to the gadgets it is opened
  const colony0 = s.colony.length;
  await dragSpot('pack:0', 500, 400);
  if ((await state()).phase !== 'shop') fail('a pack was opened by a drag that did not end on Open');
  await dragSpot('pack:0', 500, 60);
  await page.waitForTimeout(400);
  s = await state();
  if (s.phase !== 'pack' || s.pack.kind !== 'lemmings' || s.money !== 10) fail(`the Lemmings Pack was not opened: ${s.phase} $${s.money}`);
  // the pack opens (it shakes, bursts, and its cards fly out); one is taken (a click shows it with its Take button)
  await page.waitForFunction(() => !(globalThis as any).phaserGame.scene.getScene('run').packOpening, null, { timeout: 10000 });
  await clickSpot('choice:0');
  await clickSpot('card:TAKE', 900);
  s = await state();
  if (s.phase !== 'shop' || s.colony.length <= colony0) fail(`a card of the pack was not taken: ${s.phase}, ${s.colony.length} lemmings`);
  // a joker and a tarot on offer: a click selects a card and shows its Buy button
  await ev(
    `(() => { const s = globalThis.lemmix.run.state; s.money = 20; s.shop.offers = [{ uid: 9001, type: 'joker', id: 'headcount', price: 5, sold: false }, { uid: 9002, type: 'joker', id: 'guild', price: 4, sold: false }, { uid: 9003, type: 'tarot', id: 'recruiter', price: 3, sold: false }]; ${scene}.render(); })()`,
  );
  await page.waitForTimeout(200);
  await clickSpot('offer:0');
  if ((await state()).jokers.length !== 0) fail('a click on a card of the shop bought it');
  await clickSpot('card:BUY');
  await dragSpot('offer:0', 500, 60); // (the next card on offer)
  s = await state();
  if (s.jokers.map((j: any) => j.id).join() !== 'headcount,guild' || s.money !== 11) fail(`jokers bought: ${JSON.stringify(s.jokers)}, $${s.money}`);
  // a joker dragged along its row goes to another place; dragged to the tarots it is sold
  const j1 = await spot('joker:1');
  await dragSpot('joker:0', j1.x + 30, j1.y);
  if ((await state()).jokers.map((j: any) => j.id).join() !== 'guild,headcount') fail('the joker did not move to another place');
  await dragSpot('joker:0', 840, 60);
  s = await state();
  if (s.jokers.map((j: any) => j.id).join() !== 'headcount' || s.money !== 13) fail(`joker sold: ${JSON.stringify(s.jokers)}, $${s.money}`);
  // the options: the volume of the music down to nothing (its sound option goes off), the sounds at half
  await clickSpot('options');
  const music = await spot('slider:music');
  await click(music.x + 1, music.y);
  const sfx = await spot('slider:sfx');
  await click(sfx.x + 136, sfx.y);
  const cfg = await ev<{ music: boolean; sound: boolean; sfx: number }>(
    `(() => { const c = globalThis.lemmix.config; return { music: [...c.soundOptions].length === 1, sound: c.sfxVolume === 0.5, sfx: c.sfxVolume }; })()`,
  );
  if (!cfg.music || !cfg.sound) fail('the volume sliders did not set the volumes: ' + JSON.stringify(cfg));
  // the collection: the gadgets seen in this shop are turned over
  await clickSpot('collection', 800);
  const scenes = () => ev<string>(`globalThis.phaserGame.scene.getScenes(true).map((s) => s.sys.settings.key).join()`);
  if (!(await scenes()).includes('collection')) fail('the collection did not open');
  const seen = await ev<string[]>(`JSON.parse(localStorage.getItem('lemmixrl.meta')).seen`);
  for (const k of ['joker:headcount', 'joker:guild', 'pack:lemmings']) if (!seen.includes(k)) fail(`the collection did not see ${k}: ${seen}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if ((await scenes()) !== 'run' || (await state()).phase !== 'shop') fail('the collection did not go back to the run');

  // the colony at home: every lemming of it in a little level of its own, played by the game
  await clickSpot('deck', 1500);
  const home = `${scene}.homeView.home`;
  const atHome = await ev<number>(`${home}.population()`);
  if (atHome !== (await state()).colony.length) fail(`the home has ${atHome} lemmings of ${(await state()).colony.length}`);
  const frame0 = await ev<number>(`${home}.game.currentIteration`);
  await page.waitForTimeout(600);
  if ((await ev<number>(`${home}.game.currentIteration`)) <= frame0) fail('the home does not move');
  // the Builder tool, and a click on a lemming of the bottom floor: it builds (for nothing)
  await clickSpot('tool:builder', 200);
  const walker = await ev<{ x: number; y: number }>(
    `(() => { const l = ${home}.lemmings().find((l) => l.yPos === 146 && l.xPos > 40 && l.xPos < 220); return { x: 56 + l.xPos * 2, y: 96 + (l.yPos - 5) * 2 }; })()`,
  );
  await click(walker.x, walker.y, 400);
  if ((await ev<number>(`${home}.lemmings().filter((l) => l.numberOfBricksLeft > 0).length`)) < 1) fail('a click with the Builder tool did not make a builder');
  // Pick, and a box dragged around the top left floor: they are picked (no Swap in the shop)
  await clickSpot('tool:pick', 200);
  await page.mouse.move(vx(56 + 10 * 2), vy(96 + 22 * 2));
  await page.mouse.down();
  await page.mouse.move(vx(56 + 152 * 2), vy(96 + 56 * 2), { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  if ((await ev<number>(`${scene}.homeView.marked.size`)) < 1) fail('a box did not pick the lemmings in it');
  // the brush: Dirt dragged through the air of a pen makes ground, Erase dragged over it takes it away
  const drag = async (x0: number, y0: number, x1: number, y1: number) => {
    await page.mouse.move(vx(56 + x0 * 2), vy(96 + y0 * 2));
    await page.mouse.down();
    await page.mouse.move(vx(56 + x1 * 2), vy(96 + y1 * 2), { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const ground = (x: number, y: number) => ev<boolean>(`${home}.game.hasPixelAt(${x}, ${y})`);
  await clickSpot('tool:dirt', 200);
  await drag(130, 30, 175, 30);
  if (!(await ground(150, 30)) || !(await ground(170, 30))) fail('Dirt dragged through the air did not make ground');
  await clickSpot('tool:erase', 200);
  await drag(130, 30, 160, 30);
  if ((await ground(150, 30)) || !(await ground(172, 30))) fail('Erase did not take away the ground it was dragged over (only that)');
  // the Trapdoor tool: a click puts the trapdoor there; Poof: the lemming clicked is gone, without a hole
  await clickSpot('tool:trapdoor', 200);
  await click(56 + 150 * 2, 96 + 70 * 2, 200);
  const door = await ev<{ x: number; y: number }>(`${home}.game.entrancePoint(0)`);
  if (door.x !== 150 || door.y !== 70) fail(`the Trapdoor tool did not move the trapdoor (${door.x}, ${door.y})`);
  await clickSpot('tool:poof', 200);
  const victim = await ev<{ x: number; y: number; fx: number; fy: number }>(
    `(() => { const l = ${home}.lemmings().find((l) => l.yPos === 146 && l.xPos > 30 && l.xPos < 90); return { x: 56 + l.xPos * 2, y: 96 + (l.yPos - 5) * 2, fx: l.xPos, fy: l.yPos }; })()`,
  );
  const atHomeBefore = await ev<number>(`${home}.lemmings().length`);
  await click(victim.x, victim.y, 300);
  if ((await ev<number>(`${home}.lemmings().length`)) !== atHomeBefore - 1) fail('Poof did not take the lemming away');
  if (!(await ground(victim.fx, victim.fy + 1))) fail('Poof made a hole in the ground');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/home.png` });
  // closed and opened again: the home is as it was left (its ground kept)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (!(await state()).home?.terrain) fail('the home was not kept');
  await clickSpot('deck', 1500);
  if ((await ev<number>(`${home}.population()`)) !== (await state()).colony.length) fail('the home lost lemmings between visits');
  // Next picks the first lemming (the special ones come first), and shows who it is
  await clickSpot('colonyNext', 300);
  await clickSpot('colonyNext', 300);
  const position = await ev<string>(`${scene}.overlay.map((o) => (typeof o.text === 'string' ? o.text : '')).find((t) => t.includes(' / ')) ?? ''`);
  if (!position.startsWith('2 / ')) fail(`Next did not browse the colony (${position})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if ((await ev<number>(`${scene}.overlay.length`)) !== 0) fail('Escape did not close the colony');

  // the boost, dragged to the area above the colony: bought and used at once (The Recruiter: 5 lemmings join)
  const before = (await state()).colony.length;
  await dragSpot('offer:0', 917, 270);
  s = await state();
  if (s.money !== 10 || s.tarots.length !== 0 || !s.shop.offers[2].sold || s.colony.length !== before + 5) fail(`boost bought and used: $${s.money}, ${JSON.stringify(s.shop.offers[2])}`);

  await clickSpot('nextRound');
  s = await state();
  if (s.phase !== 'blinds' || s.blinds[1].status !== 'current') fail('not at the big blind');
  // Redraw: the plain lemmings of the squad go back for the next ones of the colony
  const squadSize = (await state()).setup.hand.length;
  await clickSpot('redraw', 600);
  s = await state();
  const out: number[] = s.setup.redrawnOut ?? [];
  if (s.setup.redraws !== 1 || !out.length || out.some((id: number) => s.setup.hand.includes(id)) || s.setup.hand.length !== squadSize)
    fail(`the Redraw did not redraw the squad: ${JSON.stringify(s.setup.redrawnOut)}`);
  await clickSpot('skip'); // the big blind
  s = await state();
  if (s.blinds[1].status !== 'skipped' || s.blinds[2].status !== 'current') fail('the big blind was not skipped');

  // the run is saved: after a reload it continues
  await page.reload();
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  // the first screen asks for a key (or a tap, or a click): the sound can start after it
  await page.waitForFunction(() => (globalThis as any).phaserGame?.scene.isActive('start'), null, { timeout: 30000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (globalThis as any).phaserGame.scene.isActive('title'), null, { timeout: 5000 });
  await page.keyboard.press('F6');
  await page.waitForTimeout(600);
  await clickSpot('continue');
  const t = await state();
  if (t.money !== s.money || t.colony.length !== s.colony.length || t.blinds[2].status !== 'current') fail('the saved run did not continue');
  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/run.png` });
  if (errors.length) fail('errors in the page:\n' + errors.join('\n'));
  // giving up is asked in the game (Keep playing goes back, Give up ends the run)
  await clickSpot('options');
  await clickSpot('giveUpRun');
  await clickSpot('keepPlaying');
  if ((await state()).phase === 'over') fail('Keep playing gave up the run');
  await clickSpot('options');
  await clickSpot('giveUpRun');
  await clickSpot('giveUp');
  if ((await state()).phase !== 'over') fail('Give up did not end the run');

  console.log('e2e ok: a run: from the title, abilities assigned, a level previewed, played (its own screen before it, the keys of a run) and cashed out, shop (a pack opened and a card of it taken, cards dragged to buy, sell and use), a Redraw, skip, continued after a reload, given up in the game');
} finally {
  await browser.close();
  await server.close();
}
