/**
 * Browser smoke test of the front-end: menu, preview, playing a level (a digger solves Orig Fun 1), postview.
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
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  type G = { lemmix: { game: Record<string, any>; gameResult: Record<string, unknown> | null } };
  // runs f(lemmix) in the page (f must not use variables from outside)
  const game = <T>(f: (g: G['lemmix']) => T) => page.evaluate(`(${f.toString()})(globalThis.lemmix)`) as Promise<T>;

  await page.keyboard.press('Enter'); // menu -> preview
  await page.waitForTimeout(500);
  await page.mouse.click(640, 400); // preview -> game
  await page.waitForFunction(() => {
    const g = (globalThis as any).lemmix.game;
    return g.playing && g.lemmingList.some((l: any) => !l.isRemoved && l.action === 1);
  }, null, { timeout: 30000 });

  // the game runs at the speed of Lemmix (17 frames per second)
  const it0 = await game((a) => a.game.currentIteration);
  await page.waitForTimeout(2000);
  const it1 = await game((a) => a.game.currentIteration);
  if (it1 - it0 < 25 || it1 - it0 > 45) fail(`game speed: ${it1 - it0} frames in 2 seconds`);

  // select the digger and click on the walking lemming (display scale 4, the hotspot of the game cursor is 4,9)
  await page.keyboard.press('F10');
  const l = await game((a) => {
    const g = (a as any).game;
    const lem = g.lemmingList.find((x: any) => !x.isRemoved && x.action === 1);
    return { x: lem.xPos, y: lem.yPos, scroll: g.level.info.screenPosition };
  });
  await page.mouse.move((l.x - l.scroll + 3) * 4, (l.y - 8) * 4);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  if ((await game((a) => a.game.currDiggerCount)) !== 9) fail('the digger was not assigned');

  // a left click while the right mouse button is held down (selects the non-prioritized lemming): a mousedown of a
  // second button, which pointer events would not report
  await page.waitForFunction(() => (globalThis as any).lemmix.game.lemmingList.filter((x: any) => !x.isRemoved && x.action === 1).length > 0, null, {
    timeout: 30000,
  });
  const w = await game((a) => {
    const g = (a as any).game;
    const lem = g.lemmingList.find((x: any) => !x.isRemoved && x.action === 1);
    return { x: lem.xPos, y: lem.yPos, scroll: g.level.info.screenPosition };
  });
  await page.mouse.move((w.x - w.scroll + 3) * 4, (w.y - 8) * 4);
  await page.mouse.down({ button: 'right' });
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  if ((await game((a) => a.game.currDiggerCount)) !== 8) fail('no assignment with the right mouse button held down');

  // to the end of the game: all lemmings saved, postview
  await page.keyboard.press('z');
  await page.waitForFunction(() => (globalThis as any).lemmix.gameResult !== null, null, { timeout: 30000 });
  const result = await game((a) => a.gameResult!);
  if (!result.success || result.rescued !== 10) fail('unexpected result ' + JSON.stringify(result));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/postview.png` });
  if (errors.length) fail('errors in the page:\n' + errors.join('\n'));
  console.log('e2e ok: menu, preview, game (diggers, also with the right mouse button held), postview; game speed ' + ((it1 - it0) / 2).toFixed(1) + ' frames/s');
} finally {
  await browser.close();
  await server.close();
}
