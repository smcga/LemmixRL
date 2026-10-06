/**
 * Browser test of a roguelike run: start a run, play the small blind ("Just dig!", solved with a digger), accept the
 * result, cash out, the shop (recruits dragged up to buy them, a joker bought with its Buy button, put in another
 * place and sold by dragging it, a tarot bought and used), skip the big blind, and continue the saved run after a
 * reload.
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
// the run screens are 960 x 540, at zoom 1 centered in the 1280 x 720 page
const vx = (x: number) => (1280 - 960) / 2 + x;
const vy = (y: number) => (720 - 540) / 2 + y;
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
  await page.keyboard.press('F6'); // menu -> run
  await page.waitForTimeout(600);
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
  // the preview of a level of the ante (the big blind, a wide level here): it opens, scrolls and closes
  await ev(`(() => { globalThis.lemmix.run.state.blinds[1].levelId = 'Orig-1-08'; globalThis.phaserGame.scene.getScene('run').render(); })()`);
  await page.waitForTimeout(200);
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
  await ev(`(() => { const s = globalThis.lemmix.run.state; s.blinds[0].levelId = 'Orig-1-01'; s.setup = null; globalThis.phaserGame.scene.getScene('run').render(); })()`);
  await clickSpot('play', 800); // Select
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
  await page.keyboard.press('F10');
  const l = await ev<{ x: number; y: number; scroll: number }>(
    `(() => { const g = globalThis.lemmix.game; const lem = g.lemmingList.find((x) => !x.isRemoved && x.action === 1); return { x: lem.xPos, y: lem.yPos, scroll: g.level.info.screenPosition }; })()`,
  );
  // the game is at scale 3 in 1280 x 720 (320 x 200 * 3, centered)
  await page.mouse.move(160 + (l.x - l.scroll + 3) * 3, 60 + (l.y - 8) * 3);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.keyboard.press('z'); // to the end
  await page.waitForFunction(() => (globalThis as any).lemmix.run.state.phase === 'result', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.mouse.click(640, 400); // postview -> result
  await page.waitForTimeout(800);
  s = await state();
  if (!s.outcome?.success || s.outcome.rescued !== 10) fail('unexpected outcome ' + JSON.stringify(s.outcome));

  await clickSpot('accept');
  s = await state();
  if (s.phase !== 'cashout' || s.cashout.total !== 11) fail('unexpected cash out ' + JSON.stringify(s.cashout));
  await clickSpot('cashout');
  s = await state();
  if (s.phase !== 'shop' || s.money !== 15) fail(`not in the shop with $15: ${s.phase} $${s.money}`);

  // the shop, as in Balatro: the recruits are dragged up to the jokers to buy them
  await dragSpot('recruits', 500, 60);
  s = await state();
  if (s.colony.length !== 85 || s.money !== 12) fail(`recruits dragged: ${s.colony.length} lemmings, $${s.money}`);
  // dropped anywhere else, a card goes back
  await dragSpot('recruits', 500, 400);
  if ((await state()).colony.length !== 85) fail('recruits were bought by a drag that did not end on Buy');
  // a joker and a tarot on offer: a click selects a card and shows its Buy button
  await ev(
    `(() => { const s = globalThis.lemmix.run.state; s.money = 20; s.shop.offers = [{ uid: 9001, type: 'joker', id: 'piggy', price: 5, sold: false }, { uid: 9002, type: 'joker', id: 'guild', price: 4, sold: false }, { uid: 9003, type: 'tarot', id: 'hermit', price: 3, sold: false }]; ${scene}.render(); })()`,
  );
  await page.waitForTimeout(200);
  await clickSpot('offer:0');
  if ((await state()).jokers.length !== 0) fail('a click on a card of the shop bought it');
  await clickSpot('card:BUY');
  await dragSpot('offer:0', 500, 60); // (the next card on offer)
  s = await state();
  if (s.jokers.map((j: any) => j.id).join() !== 'piggy,guild' || s.money !== 11) fail(`jokers bought: ${JSON.stringify(s.jokers)}, $${s.money}`);
  // a joker dragged along its row goes to another place; dragged to the tarots it is sold
  const j1 = await spot('joker:1');
  await dragSpot('joker:0', j1.x + 30, j1.y);
  if ((await state()).jokers.map((j: any) => j.id).join() !== 'guild,piggy') fail('the joker did not move to another place');
  await dragSpot('joker:0', 840, 60);
  s = await state();
  if (s.jokers.map((j: any) => j.id).join() !== 'piggy' || s.money !== 13) fail(`joker sold: ${JSON.stringify(s.jokers)}, $${s.money}`);
  // the tarot, dragged to the area above the colony: bought and used at once (The Hermit doubles the money)
  await dragSpot('offer:0', 917, 270);
  s = await state();
  if (s.money !== 20 || s.tarots.length !== 0 || !s.shop.offers[2].sold) fail(`tarot bought and used: $${s.money}, ${JSON.stringify(s.shop.offers[2])}`);

  await clickSpot('nextRound');
  s = await state();
  if (s.phase !== 'blinds' || s.blinds[1].status !== 'current') fail('not at the big blind');
  await clickSpot('skip'); // the big blind
  s = await state();
  if (s.blinds[1].status !== 'skipped' || s.blinds[2].status !== 'current') fail('the big blind was not skipped');

  // the run is saved: after a reload it continues
  await page.reload();
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  await page.keyboard.press('F6');
  await page.waitForTimeout(600);
  await clickSpot('continue');
  const t = await state();
  if (t.money !== s.money || t.colony.length !== s.colony.length || t.blinds[2].status !== 'current') fail('the saved run did not continue');
  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/run.png` });
  if (errors.length) fail('errors in the page:\n' + errors.join('\n'));
  console.log('e2e ok: a run: abilities assigned, a level previewed, blind played and accepted, cash out, shop (cards dragged to buy, sell and use), skip, continued after a reload');
} finally {
  await browser.close();
  await server.close();
}
