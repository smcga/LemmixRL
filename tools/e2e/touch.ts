/**
 * Browser test with a finger, on an emulated phone (844 x 390 CSS pixels sideways, 3 device pixels per CSS pixel):
 * the menu signs, a level (a skill from the panel, a lemming tapped with the walker selection, the level dragged, the
 * touch buttons, the nuke that wants two taps of its own, a confirmation that a rotation cancels), the result screen's
 * menu button, the roguelike run (cards as in Balatro on a phone: a tap selects a card and shows its buttons, a card
 * dragged to an area is bought or used, a finger dragged across lemmings selects them), and the screens with the safe
 * area of an iPhone (a notch on the left, the home indicator below).
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
type Box = { x: number; y: number; w: number; h: number };
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
  // the touch buttons of a scene (device pixels), by label
  const touchButton = async (scene: string, label: string) => {
    const b = await ev<(Box & { label: string; text: string }) | undefined>(
      `(() => { const b = globalThis.phaserGame.scene.getScene('${scene}').touchBar.buttons.find((b) => b.def.label === '${label}'); return b && { x: b.x, y: b.y, w: b.w, h: b.h, label: b.def.label, text: b.text.text }; })()`,
    );
    return b ?? fail(`no touch button ${label} in ${scene}`);
  };
  const tapButton = async (scene: string, label: string, wait = 300) => {
    const b = await touchButton(scene, label);
    await tap((b.x + b.w / 2) / DPR, (b.y + b.h / 2) / DPR, wait);
  };

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
  // a point of the skill panel (game pixels, x from the left, y from the top of the panel)
  const panel = (x: number, y: number) => css(x * geo.s, (160 + y) * geo.s);
  const walkerSelection = () => ev<boolean>(`globalThis.phaserGame.scene.getScene('player').player.touchSelectWalker`);

  // WALKER (the right mouse button), the digger button of the skill panel, then a lemming (tapped a little next to it):
  // the walker selection is for one assignment
  await tapButton('player', 'WALKER');
  if (!(await walkerSelection())) fail('WALKER did not turn on the walker selection');
  let p = panel(152, 27);
  await tap(p.x, p.y);
  const lem = await ev<{ x: number; y: number; off: number }>(
    `(() => { const p = globalThis.phaserGame.scene.getScene('player').player; const l = p.game.lemmingList.find((x) => !x.isRemoved && x.action === 1); return { x: l.xPos, y: l.yPos, off: p.offsetHorz }; })()`,
  );
  p = css((lem.x + 7) * geo.s + lem.off, (lem.y - 6) * geo.s);
  await tap(p.x, p.y);
  if ((await ev<number>('globalThis.lemmix.game.currDiggerCount')) !== 9) fail('the digger was not assigned by a tap');
  if (await walkerSelection()) fail('the walker selection stayed on after an assignment');

  // dragging the level scrolls it
  p = css(250 * geo.s, 60 * geo.s);
  await drag(p.x, p.y, p.x - 100, p.y);
  const off = await ev<number>(`globalThis.phaserGame.scene.getScene('player').player.offsetHorz`);
  if (off >= lem.off) fail('dragging did not scroll the level');
  if ((await ev<number>('globalThis.lemmix.game.currDiggerCount')) !== 9) fail('dragging assigned a skill');

  // the touch buttons: pause, on and off
  await tapButton('player', 'PAUSE');
  if (!(await ev<boolean>('globalThis.lemmix.game.isPaused'))) fail('PAUSE did not pause');
  await tapButton('player', 'PAUSE');
  if (await ev<boolean>('globalThis.lemmix.game.isPaused')) fail('PAUSE did not unpause');

  // the nuke wants two taps of its own: pause (on the panel, it unpauses) and right after it the nuke next to it is no
  // double tap
  const nuked = () => ev<boolean>('globalThis.lemmix.game.isNukedByUser');
  await tapButton('player', 'PAUSE');
  const pause = panel(174, 27);
  const nuke = panel(178, 27);
  await tap(pause.x, pause.y, 50);
  await tap(nuke.x, nuke.y, 300);
  if (await ev<boolean>('globalThis.lemmix.game.isPaused')) fail('the pause button of the panel did not unpause');
  if (await nuked()) fail('a tap on pause and one on the nuke nuked the level');

  // a confirmation (END: "SURE?") is cancelled by a rotation: the next tap asks again
  await tapButton('player', 'END');
  if ((await touchButton('player', 'END')).text !== 'SURE?') fail('END did not ask for a second tap');
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(400);
  if ((await touchButton('player', 'END')).text !== 'END') fail('the rotation did not cancel the confirmation of END');
  await tapButton('player', 'END');
  if ((await sceneKeys()) !== 'player') fail('END ended the level with one tap after a rotation');
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(400);

  // two taps on the nuke
  await tap(nuke.x, nuke.y, 50);
  await tap(nuke.x, nuke.y, 300);
  if (!(await nuked())) fail('two taps on the nuke did not nuke the level');

  // END, twice
  await tapButton('player', 'END');
  if ((await sceneKeys()) !== 'player') fail('END ended the level without a second tap');
  await tapButton('player', 'END', 1000);
  if ((await sceneKeys()) !== 'dos') fail('END did not end the level');

  // the result screen: its MENU button (the right mouse button of Lemmix)
  await tapButton('dos', 'MENU', 800);

  // the run: "Tap here for a Roguelike Run", then "New run"
  await tap(mx(320), my(312), 800);
  if ((await sceneKeys()) !== 'run') fail('the menu did not start the run screens');
  const cam = await ev<{ zoom: number; x: number; y: number }>(
    `(() => { const c = globalThis.phaserGame.scene.getScene('run').cameras.main; return { zoom: c.zoom, x: c.worldView.x, y: c.worldView.y }; })()`,
  );
  const v = (x: number, y: number) => ({ x: ((x - cam.x) * cam.zoom) / DPR, y: ((y - cam.y) * cam.zoom) / DPR });
  const runScene = `globalThis.phaserGame.scene.getScene('run')`;
  // where a button or a card of the run screens is (the scene keeps the middle of each by name), in CSS pixels
  const spot = async (name: string, dx = 0) => {
    const s = (await ev<{ x: number; y: number } | undefined>(`${runScene}.spots[${JSON.stringify(name)}]`)) ?? fail(`nothing called ${name} on the screen`);
    return v(s.x + dx, s.y);
  };
  const tapSpot = async (name: string, wait = 400, dx = 0) => {
    const s = await spot(name, dx);
    await tap(s.x, s.y, wait);
  };
  const run = <T>(js: string) => ev<T>(`globalThis.lemmix.run.${js}`);
  await tapSpot('newRun', 700);
  if (!(await ev<boolean>('!!globalThis.lemmix.run'))) fail('no new run');
  // the preview of the boss level opens and closes with taps
  await tapSpot('preview:2', 500);
  if ((await ev<number>(`${runScene}.overlay.length`)) === 0) fail('a tap on Preview did not open the level');
  await tapSpot('close');
  if ((await ev<number>(`${runScene}.overlay.length`)) !== 0) fail('a tap on Close did not close the level preview');
  // the abilities: the 20th point of three bars, then Done
  for (const skill of ['digger', 'builder', 'basher']) await tapSpot(`ability:${skill}`, 200, 19 * 8);
  await tapSpot('done', 700);
  if ((await run<string>('state.phase')) !== 'blinds') fail('the abilities were not assigned by taps');
  // Skip Blind, as in Balatro: one tap (what the tag gives is next to it)
  await tapSpot('skip', 700);
  if ((await run<string>('state.blinds[0].status')) !== 'skipped') fail('a tap on Skip did not skip');

  // the shop: a card is dragged up to the jokers to buy it
  await ev(`(() => { const r = globalThis.lemmix.run; r.state.money = 10; r.openShop(); ${runScene}.render(); })()`);
  await page.waitForTimeout(700);
  const colony = await run<number>('state.colony.length');
  const dragSpot = async (name: string, x: number, y: number) => {
    const from = await spot(name);
    const to = v(x, y);
    await drag(from.x, from.y, to.x, to.y);
    await page.waitForTimeout(400);
  };
  await dragSpot('recruits', 500, 60);
  if ((await run<number>('state.colony.length')) !== colony + 5 || (await run<number>('state.money')) !== 7) fail('a card dragged to Buy was not bought');
  await dragSpot('recruits', 500, 420);
  if ((await run<number>('state.colony.length')) !== colony + 5) fail('a card dropped next to Buy was bought');
  // a tap selects a card (it shows what it is, and its Buy button); a tap on the button buys
  await tapSpot('recruits');
  if ((await run<number>('state.colony.length')) !== colony + 5) fail('a tap on a card bought it');
  if (!(await ev<boolean>(`!!${runScene}.tip.owner`))) fail('a tap on a card did not show what it is');
  await tapSpot('card:BUY');
  if ((await run<number>('state.colony.length')) !== colony + 10 || (await run<number>('state.money')) !== 4) fail('the Buy button of a tapped card did not buy it');
  // a tarot: its Use button opens the colony, where a finger dragged across lemmings selects them
  await ev(
    `(() => { const s = globalThis.lemmix.run.state; s.tarots = [{ uid: 9001, id: 'umbrella' }]; s.jokers = [{ uid: 9002, id: 'piggy' }]; for (const c of s.colony) c.floater = false; for (let i = 0; i < 3; i++) s.colony[i].insured = true; ${runScene}.render(); })()`,
  );
  await page.waitForTimeout(200);
  await tapSpot('tarot:0');
  await tapSpot('card:USE', 500);
  if ((await ev<number>(`${runScene}.overlay.length`)) === 0) fail('Use did not open the colony');
  const first = await spot('colony:0');
  const third = await spot('colony:2');
  await drag(first.x, first.y, third.x, third.y);
  await page.waitForTimeout(200);
  await tapSpot('use', 500);
  if ((await run<number>('state.colony.filter((c) => c.floater).length')) !== 3 || (await run<number>('state.tarots.length')) !== 0)
    fail('a finger dragged across three lemmings did not select them for the tarot');
  // a joker dragged to the tarots is sold
  await dragSpot('joker:0', 840, 60);
  if ((await run<number>('state.jokers.length')) !== 0 || (await run<number>('state.money')) !== 6) fail('a joker dragged to Sell was not sold');
  await page.screenshot({ path: `${REPO_ROOT}/tools/e2e/touch.png` });

  // the safe area of an iPhone held sideways: the screens stay out of the notch (left) and the home indicator (below)
  const inset = { top: 0, left: 47, right: 47, bottom: 21 };
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: inset } as never);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(300);
  const safe = { x0: inset.left * DPR, y0: inset.top * DPR, x1: (W - inset.right) * DPR, y1: (H - inset.bottom) * DPR };
  const inside = (what: string, b: Box) => {
    if (b.x < safe.x0 - 0.5 || b.y < safe.y0 - 0.5 || b.x + b.w > safe.x1 + 0.5 || b.y + b.h > safe.y1 + 0.5)
      fail(`${what} is outside the safe area: ${JSON.stringify(b)} not in ${JSON.stringify(safe)}`);
  };
  inside('the run screen', await ev<Box>(`(() => { const c = globalThis.phaserGame.scene.getScene('run').cameras.main; return { x: c.x, y: c.y, w: c.width, h: c.height }; })()`));
  await page.keyboard.press('Escape'); // the run screens -> the menu
  await page.waitForTimeout(800);
  if ((await sceneKeys()) !== 'dos') fail('no menu after the run screens');
  const dosImage = `(() => { const i = globalThis.phaserGame.scene.getScene('dos').image; return { x: i.x, y: i.y, w: i.displayWidth, h: i.displayHeight }; })()`;
  inside('the menu', await ev<Box>(dosImage));
  for (const label of ['OPTIONS', 'STYLE']) inside(`the menu button ${label}`, await touchButton('dos', label));
  await page.keyboard.press('F1'); // -> the preview
  await page.waitForTimeout(600);
  inside('the preview', await ev<Box>(dosImage));
  inside('the BACK button', await touchButton('dos', 'BACK'));
  await page.keyboard.press('Enter'); // -> the game
  await page.waitForFunction(() => (globalThis as any).phaserGame.scene.getScenes(true)[0]?.sys.settings.key === 'player', null, { timeout: 30000 });
  await page.waitForTimeout(300);
  inside('the game', await ev<Box>(`(() => { const p = globalThis.phaserGame.scene.getScene('player'); return { x: p.left, y: p.top, w: 320 * p.scaleFactor, h: 200 * p.scaleFactor }; })()`));
  for (const label of ['PAUSE', 'END']) inside(`the game button ${label}`, await touchButton('player', label));

  if (errors.length) fail('errors in the page:\n' + errors.join('\n'));
  console.log(
    'e2e ok: touch on a phone: menu signs, skill and lemming taps (walker selection), dragging, touch buttons, the nuke, a rotation, result menu, run screens (level preview, abilities, skip, cards tapped and dragged to buy, use and sell), safe areas',
  );
} finally {
  await browser.close();
  await server.close();
}
