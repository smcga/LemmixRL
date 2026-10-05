/**
 * Browser test of a roguelike run: start a run, play the small blind ("Just dig!", solved with a digger), accept the
 * result, cash out, buy recruits in the shop, skip the big blind, and continue the saved run after a reload.
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

  await page.goto(url);
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.keyboard.press('F6'); // menu -> run
  await page.waitForTimeout(600);
  await click(480, 436); // new run
  let s = await state();
  if (s.ante !== 1 || s.colony.length !== 80 || s.money !== 4) fail('unexpected new run ' + JSON.stringify({ ante: s.ante, money: s.money }));

  // the abilities: 60 points, at most 20 in a skill (the 20th point of the bars of diggers, builders and bashers)
  if (s.phase !== 'assign') fail('a new run does not start with the ability assignment');
  const row = (i: number) => 124 + 104 + i * 29 + 13;
  const point = (n: number) => 244 + 134 + (n - 1) * 8 + 4;
  const done = () => click(244 + 392 - 166 + 75, 124 + 362 + 15);
  await click(point(20), row(7), 200); // diggers
  await click(point(20), row(4), 200); // builders
  await done(); // 20 points are not placed yet
  if ((await state()).phase !== 'assign') fail('the assignment ended with points left');
  await click(point(20), row(5), 200); // bashers
  s = await state();
  if (s.capacity.digger !== 20 || s.capacity.builder !== 20 || s.capacity.basher !== 20) fail('unexpected abilities ' + JSON.stringify(s.capacity));
  // the preview of a level of the ante (the big blind, a wide level here): it opens, scrolls and closes
  await ev(`(() => { globalThis.lemmix.run.state.blinds[1].levelId = 'Orig-1-08'; globalThis.phaserGame.scene.getScene('run').render(); })()`);
  await page.waitForTimeout(200);
  const scene = `globalThis.phaserGame.scene.getScene('run')`;
  await click(644 + 308 - 74 + 32, 124 + 137 + 43 + 10);
  if ((await ev<number>(`${scene}.overlay.length`)) === 0) fail('Preview did not open the level preview');
  const sx0 = await ev<number>(`${scene}.previewSx`);
  await page.keyboard.press('ArrowRight');
  await page.mouse.move(vx(700), vy(240));
  await page.mouse.down();
  await page.mouse.move(vx(500), vy(240), { steps: 5 });
  await page.mouse.up();
  if ((await ev<number>(`${scene}.previewSx`)) !== sx0 + 48 + 100) fail('the level preview did not scroll');
  await click(828 + 46, 26 + 14); // Close
  if ((await ev<number>(`${scene}.overlay.length`)) !== 0) fail('the level preview did not close');
  await done();
  if ((await state()).phase !== 'blinds') fail('the assignment did not end');

  // the small blind becomes "Just dig!"
  await ev(`(() => { const s = globalThis.lemmix.run.state; s.blinds[0].levelId = 'Orig-1-01'; s.setup = null; globalThis.phaserGame.scene.getScene('run').render(); })()`);
  await click(244 + 62, 124 + 377, 800); // play
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

  await click(244 + 124, 124 + 381); // accept
  s = await state();
  if (s.phase !== 'cashout' || s.cashout.total !== 11) fail('unexpected cash out ' + JSON.stringify(s.cashout));
  await click(344 + 252, 124 + 378); // cash out
  s = await state();
  if (s.phase !== 'shop' || s.money !== 15) fail(`not in the shop with $15: ${s.phase} $${s.money}`);
  await click(744 + 92, 318 + 26); // recruit 5 lemmings
  s = await state();
  if (s.colony.length !== 85 || s.money !== 12) fail(`recruits: ${s.colony.length} lemmings, $${s.money}`);
  await click(744 + 92, 194 + 26); // next round
  s = await state();
  if (s.phase !== 'blinds' || s.blinds[1].status !== 'current') fail('not at the big blind');
  await click(244 + 236 + 168, 124 + 377); // skip the big blind
  s = await state();
  if (s.blinds[1].status !== 'skipped' || s.blinds[2].status !== 'current') fail('the big blind was not skipped');

  // the run is saved: after a reload it continues
  await page.reload();
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  await page.keyboard.press('F6');
  await page.waitForTimeout(600);
  await click(340, 436); // continue
  const t = await state();
  if (t.money !== s.money || t.colony.length !== s.colony.length || t.blinds[2].status !== 'current') fail('the saved run did not continue');
  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/run.png` });
  if (errors.length) fail('errors in the page:\n' + errors.join('\n'));
  console.log('e2e ok: a run: abilities assigned, a level previewed, blind played and accepted, cash out, shop, skip, continued after a reload');
} finally {
  await browser.close();
  await server.close();
}
