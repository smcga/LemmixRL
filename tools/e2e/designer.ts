/** Real browser coverage of the designer's data round trip and the game's shared artwork renderer. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';

const SHIPPED = JSON.parse(readFileSync(`${REPO_ROOT}/app/src/run/power-cards/catalogue.json`, 'utf8')).cards.length as number;

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
  assert.equal(await page.locator('#card-list button').count(), SHIPPED);
  // Existing artwork types are editable, without converting them into a lemming.
  await page.locator('#card-list button').filter({ hasText: 'Overtime' }).click();
  assert.equal(await page.inputValue('#art-text'), '+1:00');
  await page.fill('#art-text', '+2:00');
  await page.locator('#art-text-color').evaluate((el) => {
    (el as HTMLInputElement).value = '#33ccff';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#card-list button').filter({ hasText: "Builders' Guild" }).click();
  assert.equal(await page.inputValue('#art-icon'), 'builder');
  await page.selectOption('#art-icon', 'nuke');
  assert.equal(await page.locator('#art-icon option').count(), 12);
  // Simulate a draft saved by the first release, then recover it through the upgraded editor.
  await page.evaluate(() => {
    const key = 'lemmatro-power-card-designer-v1';
    const doc = JSON.parse(localStorage.getItem(key)!);
    doc.version = 1;
    for (const card of doc.cards) {
      const art = card.appearance.layers[0];
      delete art.playback;
      delete art.frame;
      delete card.appearance.layers;
      card.appearance.art = art;
    }
    localStorage.setItem(key, JSON.stringify(doc));
  });
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('workspace')!.inert);
  await page.locator('#card-list button').filter({ hasText: 'Overtime' }).click();
  assert.equal(await page.inputValue('#art-text'), '+2:00');
  assert.equal(await page.inputValue('#art-text-color'), '#33ccff');
  await page.locator('#card-list button').filter({ hasText: "Builders' Guild" }).click();
  assert.equal(await page.inputValue('#art-icon'), 'nuke');
  await page.locator('#card-list button').filter({ hasText: 'Illegal Toolkit' }).click();
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
  // Second lemming: a different pose, palette and persistent fixed frame.
  await page.click('#add-lemming');
  await page.selectOption('#animation', 'climbLeft');
  await page.selectOption('#layer-playback', 'fixed');
  await page.locator('#pose-frame').evaluate((el) => {
    (el as HTMLInputElement).value = '6';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.fill('#scale-number', '2');
  await page.fill('#x', '-16');
  await page.fill('#y', '-12');
  await page
    .locator('#palette input')
    .first()
    .evaluate((el) => {
      (el as HTMLInputElement).value = '#00ffff';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await page.click('#duplicate-layer');
  await page
    .locator('#palette input')
    .first()
    .evaluate((el) => {
      (el as HTMLInputElement).value = '#ffcc00';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  await page.locator('#layer-list button[data-layer="1"]').click();
  assert.equal(await page.locator('#palette input').first().inputValue(), '#00ffff', 'duplicated palettes must be independent');
  await page.locator('#layer-list button[data-layer="2"]').click();
  await page.click('#remove-layer');
  assert.equal(await page.inputValue('#pose-frame'), '6');
  await page.click('#add-text');
  await page.fill('#art-text', '+7');
  await page.fill('#scale-number', '2');
  await page.fill('#x', '0');
  await page.fill('#y', '23');
  await page.click('#add-icon');
  await page.selectOption('#art-icon', 'pause');
  await page.fill('#scale-number', '1');
  await page.fill('#x', '17');
  await page.fill('#y', '-23');
  await page.click('#layer-backward');
  assert.equal(await page.locator('#layer-list button[aria-current="true"]').getAttribute('data-layer'), '2');
  await page.click('#layer-forward');
  assert.equal(await page.locator('#layer-list button[aria-current="true"]').getAttribute('data-layer'), '3');
  await page.click('#play'); // Resume preview: the second lemming must remain on its saved pose.
  await page.waitForTimeout(120);
  assert.equal(await page.locator('#layer-list button').count(), 4);
  if (process.env.DESIGNER_SCREENSHOT) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: process.env.DESIGNER_SCREENSHOT, fullPage: true });
  }
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
  const layers = exported.cards[0].appearance.layers;
  assert.equal(exported.version, 2);
  assert.equal(layers.length, 4);
  assert.deepEqual({ x: layers[0].x, y: layers[0].y }, { x: 5, y: -1 });
  assert.equal(layers[0].playback, 'animated');
  assert.equal(layers[1].playback, 'fixed');
  assert.equal(layers[1].frame, 5);
  assert.equal(layers[2].text, '+7');
  assert.equal(layers[3].icon, 'pause');
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('workspace')!.inert);
  assert.equal(await page.locator('#card-list button').count(), SHIPPED + 1, 'draft survives reload');
  await page.locator('#file').setInputFiles({ name: 'card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.waitForFunction(() => document.getElementById('status')!.textContent!.startsWith('Imported'));
  assert.equal(await page.inputValue('#name'), 'Midnight Mason');
  assert.equal(await page.inputValue('#x'), '5');
  await page.locator('#layer-list button[data-layer="1"]').click();
  assert.equal(await page.inputValue('#pose-frame'), '6');
  assert.equal(await page.inputValue('#layer-playback'), 'fixed');
  assert.equal(await page.locator('#palette input').first().inputValue(), '#00ffff');
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
    const mixed = structuredClone(design);
    mixed.id = 'mixed-timing-test';
    mixed.appearance.layers.push(
      { ...mixed.appearance.layers[0], animation: 'fry', playback: 'animated', frame: 0 },
      { ...mixed.appearance.layers[0], animation: 'mine', playback: 'animated', frame: 0 },
    );
    const designs = [...POWER_CARD_LIBRARY.cards, design, mixed];
    const renderPath = '/src/run/power-cards/render.ts';
    const { drawPowerCard, powerCardAssets } = await import(/* @vite-ignore */ renderPath);
    for (const item of designs) {
      const card = new CardView(scene, 400, 250, { color: 0xffffff, art: { design: item } });
      const group = card.list.find((child: any) => child.getData?.('powerCardArtwork'));
      if (!group || group.list.length !== item.appearance.layers.length + 1) throw new Error(`Missing card layers: ${item.id}`);
      item.appearance.layers.forEach((art: any, index: number) => {
        const sprite = group.list[index + 1];
        if (sprite.texture.key.startsWith('__') || sprite.texture.getSourceImage().height !== 88) throw new Error('Missing layer texture');
        if (sprite.anims.isPlaying !== (art.type === 'lemming' && art.playback === 'animated' && sprite.texture.frameTotal > 2))
          throw new Error('Incorrect layer playback');
      });
      if (item.id === 'mixed-timing-test') {
        const expected = document.createElement('canvas'),
          composed = document.createElement('canvas');
        expected.width = composed.width = 66;
        expected.height = composed.height = 88;
        const a = expected.getContext('2d')!,
          b = composed.getContext('2d')!;
        const assets = powerCardAssets((globalThis as any).lemmix.data.provider);
        for (const tick of [0, 13, 14, 23, 24, 32, 333]) {
          drawPowerCard(a, item, assets, tick);
          b.clearRect(0, 0, 66, 88);
          b.drawImage(group.list[0].texture.getSourceImage(), 0, 0);
          item.appearance.layers.forEach((art: any, index: number) => {
            const sprite = group.list[index + 1];
            const count = art.type === 'lemming' && art.playback === 'animated' ? sprite.anims.currentAnim.frames.length : 1;
            sprite.anims.stop();
            sprite.setFrame(String(tick % count));
            b.drawImage(sprite.texture.getSourceImage(), (tick % count) * 66, 0, 66, 88, 0, 0, 66, 88);
          });
          const pixels = a.getImageData(0, 0, 66, 88).data,
            other = b.getImageData(0, 0, 66, 88).data;
          for (let i = 0; i < pixels.length; i++)
            if (Math.abs(pixels[i] - other[i]) > 2) throw new Error(`Editor/game pixel mismatch at tick ${tick}, byte ${i}`);
        }
      }
      card.destroy();
    }
    return designs.length;
  }, exported.cards[0]);
  assert.equal(checked, SHIPPED + 2);
  assert.deepEqual(errors, []);
  console.log(
    `designer e2e ok: editable text/icons, version 1 migration, 28 animations, independent palettes/fixed poses, layer controls, JSON round trip, mobile layout, ${SHIPPED + 2} in-game renders and mixed-loop pixel parity`,
  );
} finally {
  await browser.close();
  await server.close();
}
