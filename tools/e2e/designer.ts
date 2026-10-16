/** Real browser coverage of the designer's data round trip and the game's shared artwork renderer. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';

const server = await createServer({ configFile: `${REPO_ROOT}/vite.config.ts`, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls!.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(url + 'designer.html');
  await page.waitForFunction(() => !document.getElementById('workspace')!.inert);
  assert.equal(await page.locator('#card-list button').count(), 23);
  assert.equal(await page.locator('#animation option').count(), 28);
  const animations = await page.locator('#animation option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  for (const animation of animations) {
    await page.selectOption('#animation', animation);
    assert.ok((await page.locator('#palette input').count()) > 0, `${animation} needs a palette`);
  }
  await page.click('#new');
  await page.fill('#name', 'Midnight Mason');
  await page.fill('#card-id', 'midnight-mason');
  await page.fill('#description', 'An idea for a future Power Card.\nThe night shift has arrived.');
  await page.selectOption('#rarity', 'rare');
  await page.fill('#price', '9');
  await page.selectOption('#animation', 'buildLeft');
  await page.fill('#scale-number', '4');
  await page.fill('#x', '2');
  await page.fill('#y', '-3');
  await page
    .locator('#palette input')
    .first()
    .evaluate((el) => {
      (el as HTMLInputElement).value = '#ff00ff';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await page.locator('#background').evaluate((el) => {
    (el as HTMLInputElement).value = '#162945';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#border').evaluate((el) => {
    (el as HTMLInputElement).value = '#e9bc77';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#play');
  await page.locator('#frame').evaluate((el) => {
    (el as HTMLInputElement).value = '5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const bounds = (await page.locator('#preview').boundingBox())!;
  await page.mouse.move(bounds.x + 132, bounds.y + 176);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 148, bounds.y + 184);
  await page.mouse.up();
  assert.equal(await page.inputValue('#x'), '6');
  assert.equal(await page.inputValue('#y'), '-1');
  await page.locator('#preview').press('ArrowLeft');
  assert.equal(await page.inputValue('#x'), '5');
  await page.waitForTimeout(100);
  assert.equal(
    await page.locator('#small-preview').evaluate((el) => {
      const bytes = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 66, 88).data;
      for (let i = 0; i < bytes.length; i += 4) if (bytes[i] === 255 && bytes[i + 1] === 0 && bytes[i + 2] === 255) return true;
      return false;
    }),
    true,
    'palette edit must change actual sprite pixels',
  );
  if (process.env.DESIGNER_SCREENSHOT) await page.screenshot({ path: process.env.DESIGNER_SCREENSHOT, fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.click('#export-card');
  const download = await downloadPromise;
  const stream = (await download.createReadStream())!;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(exported.cards.length, 1);
  assert.equal(exported.cards[0].name, 'Midnight Mason');
  assert.equal(exported.cards[0].price, 9);
  assert.equal(exported.cards[0].rarity, 'rare');
  assert.deepEqual({ x: exported.cards[0].appearance.art.x, y: exported.cards[0].appearance.art.y }, { x: 5, y: -1 });
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('workspace')!.inert);
  assert.equal(await page.locator('#card-list button').count(), 24, 'draft survives reload');
  await page.locator('#file').setInputFiles({ name: 'card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Imported'));
  assert.equal(await page.inputValue('#name'), 'Midnight Mason');
  assert.equal(await page.inputValue('#x'), '5');
  const before = await page.evaluate(() => localStorage.getItem('lemmatro-power-card-designer-v1'));
  await page.locator('#file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":42,"cards":[]}') });
  await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Import failed'));
  assert.equal(await page.evaluate(() => localStorage.getItem('lemmatro-power-card-designer-v1')), before, 'invalid import is atomic');
  await page.fill('#scale-number', '99');
  assert.equal(await page.isDisabled('#export-card'), true, 'invalid controls cannot export a different hidden value');
  await page.fill('#scale-number', '4');
  assert.equal(await page.isDisabled('#export-card'), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile layout must not overflow');

  // All existing cards, plus an exported draft, use the shared renderer in an actual running Phaser scene.
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(url);
  await page.waitForFunction(() => (globalThis as any).phaserGame?.scene.isActive('title'));
  const checked = await page.evaluate(async (design) => {
    const path = '/src/run/ui/cards.ts',
      cataloguePath = '/src/run/power-cards/catalogue.ts';
    const { CardView } = await import(/* @vite-ignore */ path);
    const { POWER_CARD_LIBRARY } = await import(/* @vite-ignore */ cataloguePath);
    const scene = (globalThis as any).phaserGame.scene.getScene('title');
    const designs = [...POWER_CARD_LIBRARY.cards, design];
    for (const item of designs) {
      const card = new CardView(scene, 400, 250, { color: 0xffffff, art: { design: item } });
      const image = card.list.find((child: any) => child.type === 'Sprite');
      if (!image || image.texture.key.startsWith('__')) throw new Error(`Missing card texture: ${item.id}`);
      if (image.texture.getSourceImage().height !== 88) throw new Error('Unexpected texture height');
      card.destroy();
    }
    return designs.length;
  }, exported.cards[0]);
  assert.equal(checked, 24);
  assert.deepEqual(errors, []);
  console.log(
    'designer e2e ok: 28 animations, palette pixels, drag/nudge, metadata, JSON export/import, invalid input, draft recovery, mobile layout, 24 in-game card renders',
  );
} finally {
  await browser.close();
  await server.close();
}
