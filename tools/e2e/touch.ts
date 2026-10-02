/**
 * Browser test with a finger, on an emulated phone (844 x 390 CSS pixels sideways, 3 device pixels per CSS pixel):
 * the menu signs, a level (a skill from the panel, a lemming tapped, the level dragged, the touch buttons), the
 * result screen's menu button, and the roguelike run (a tap shows what a button does, a second tap does it).
 *
 *   npm run e2e         (CHROMIUM=/path/to/chromium to use a specific browser; otherwise Playwright's)
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';

const W = 844;
const H = 390;
const DPR = 3;

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
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const ev = <T>(js: string) => page.evaluate(js) as Promise<T>;
  const tap = async (x: number, y: number, wait = 300) => {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(wait);
  };
  // a finger dragged across the screen (CSS pixels)
  const cdp = await ctx.newCDPSession(page);
  const drag = async (x1: number, y1: number, x2: number, y2: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const sceneKeys = () => ev<string>(`globalThis.phaserGame.scene.getScenes(true).map((s) => s.sys.settings.key).join()`);

  await page.goto(url);
  await page.waitForFunction(() => (globalThis as Record<string, unknown>).lemmix, null, { timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.waitForTimeout(500);
  const canvas = await ev<number[]>(`[document.querySelector('canvas').width, document.querySelector('canvas').height]`);
  if (canvas[0] !== W * DPR || canvas[1] !== H * DPR) fail('the canvas does not have the device resolution: ' + canvas.join('x'));

  // the menu (640 x 350, next to the column of touch buttons): the "1 Player" sign
  const ms = Math.min((W - 96) / 640, H / 350);
  const mx = (x: number) => Math.floor((W - 96 - 640 * ms) / 2) + x * ms;
  const my = (y: number) => Math.floor((H - 350 * ms) / 2) + y * ms;
  await tap(mx(130), my(150), 700);
  if ((await sceneKeys()) !== 'dos') fail('no preview');
  await tap(mx(320), my(200)); // preview -> game
  await page.waitForFunction(
    () => {
      const g = (globalThis as any).lemmix.game;
      return g.playing && g.lemmingList.some((l: any) => !l.isRemoved && l.action === 1);
    },
    null,
    { timeout: 30000 },
  );
  const geo = await ev<{ s: number; left: number; top: number }>(`(() => { const p = globalThis.phaserGame.scene.getScene('player'); return { s: p.scaleFactor, left: p.left, top: p.top }; })()`);
  if (geo.s !== 5) fail('the game is not scaled by 5 device pixels: ' + geo.s);
  // control coordinates of the game image (device pixels) -> CSS pixels
  const css = (x: number, y: number) => ({ x: (geo.left + x) / DPR, y: (geo.top + y) / DPR });

  // the digger button of the skill panel, then a lemming (tapped a little next to it)
  let p = css(152 * geo.s, 187 * geo.s);
  await tap(p.x, p.y);
  const lem = await ev<{ x: number; y: number; off: number }>(
    `(() => { const p = globalThis.phaserGame.scene.getScene('player').player; const l = p.game.lemmingList.find((x) => !x.isRemoved && x.action === 1); return { x: l.xPos, y: l.yPos, off: p.offsetHorz }; })()`,
  );
  p = css((lem.x + 7) * geo.s + lem.off, (lem.y - 6) * geo.s);
  await tap(p.x, p.y);
  if ((await ev<number>('globalThis.lemmix.game.currDiggerCount')) !== 9) fail('the digger was not assigned by a tap');

  // dragging the level scrolls it
  p = css(250 * geo.s, 60 * geo.s);
  await drag(p.x, p.y, p.x - 100, p.y);
  const off = await ev<number>(`globalThis.phaserGame.scene.getScene('player').player.offsetHorz`);
  if (off >= lem.off) fail('dragging did not scroll the level');
  if ((await ev<number>('globalThis.lemmix.game.currDiggerCount')) !== 9) fail('dragging assigned a skill');

  // the touch buttons: pause (on and off), end (needs a second tap)
  const bar = await ev<{ x: number; y: number; w: number; h: number }[]>(
    `globalThis.phaserGame.scene.getScene('player').touchBar.buttons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))`,
  );
  const button = (i: number) => ({ x: (bar[i].x + bar[i].w / 2) / DPR, y: (bar[i].y + bar[i].h / 2) / DPR });
  await tap(button(0).x, button(0).y);
  if (!(await ev<boolean>('globalThis.lemmix.game.isPaused'))) fail('PAUSE did not pause');
  await tap(button(0).x, button(0).y);
  if (await ev<boolean>('globalThis.lemmix.game.isPaused')) fail('PAUSE did not unpause');
  await tap(button(5).x, button(5).y);
  if ((await sceneKeys()) !== 'player') fail('END ended the level without a second tap');
  await tap(button(5).x, button(5).y, 1000);
  if ((await sceneKeys()) !== 'dos') fail('END did not end the level');

  // the result screen: its MENU button (the right mouse button of Lemmix)
  const menuBtn = await ev<{ x: number; y: number; w: number; h: number }>(
    `(() => { const b = globalThis.phaserGame.scene.getScene('dos').touchBar.buttons[0]; return { x: b.x, y: b.y, w: b.w, h: b.h }; })()`,
  );
  await tap((menuBtn.x + menuBtn.w / 2) / DPR, (menuBtn.y + menuBtn.h / 2) / DPR, 800);

  // the run: "Tap here for a Roguelike Run", then "New run"
  await tap(mx(320), my(312), 800);
  if ((await sceneKeys()) !== 'run') fail('the menu did not start the run screens');
  const cam = await ev<{ zoom: number; x: number; y: number }>(
    `(() => { const c = globalThis.phaserGame.scene.getScene('run').cameras.main; return { zoom: c.zoom, x: c.worldView.x, y: c.worldView.y }; })()`,
  );
  const v = (x: number, y: number) => ({ x: ((x - cam.x) * cam.zoom) / DPR, y: ((y - cam.y) * cam.zoom) / DPR });
  p = v(480, 436);
  await tap(p.x, p.y, 600);
  if (!(await ev<boolean>('!!globalThis.lemmix.run'))) fail('no new run');
  // Skip: the first tap shows what the tag gives, the second skips
  p = v(244 + 120 + 48, 124 + 362 + 15);
  await tap(p.x, p.y);
  if ((await ev<string>('globalThis.lemmix.run.state.blinds[0].status')) !== 'current') fail('the first tap on Skip skipped');
  await tap(p.x, p.y);
  if ((await ev<string>('globalThis.lemmix.run.state.blinds[0].status')) !== 'skipped') fail('the second tap on Skip did not skip');

  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/touch.png` });
  if (errors.length) fail('errors in the page:\n' + errors.join('\n'));
  console.log('e2e ok: touch on a phone: menu signs, skill and lemming taps, dragging, touch buttons, result menu, run screens');
} finally {
  await browser.close();
  await server.close();
}
