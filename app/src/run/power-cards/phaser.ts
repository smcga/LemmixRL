import type * as Phaser from 'phaser';
import type { DataProvider } from '../../../../engine/src/index.ts';
import { powerCardAssets, powerCardBackground, powerCardLayerSheet } from './render.ts';
import { LEMMING_ANIMS } from './animations.ts';
import { POWER_CARD_WIDTH as W, POWER_CARD_HEIGHT as H, type PowerCardDesign } from './schema.ts';

/** Independently looping sprites preserve every layer's timing, including mixed 14/24/32-frame animations. */
export function powerCardSprite(scene: Phaser.Scene, design: PowerCardDesign, data: DataProvider, width: number, height: number): Phaser.GameObjects.Container {
  const group = scene.add
    .container(0, 0)
    .setScale(width / W, height / H)
    .setData('powerCardArtwork', true);
  const backgroundKey = 'power-bg:' + design.appearance.background + ':' + design.appearance.border;
  if (!scene.textures.exists(backgroundKey)) scene.textures.addCanvas(backgroundKey, powerCardBackground(design));
  group.add(scene.add.image(0, 0, backgroundKey));
  const assets = powerCardAssets(data);
  design.appearance.layers.forEach((art, index) => {
    const key = 'power-layer:' + JSON.stringify(art);
    const count = art.type === 'lemming' && art.playback === 'animated' ? LEMMING_ANIMS[art.animation][1] : 1;
    if (!scene.textures.exists(key)) {
      const texture = scene.textures.addCanvas(key, powerCardLayerSheet(art, assets))!;
      for (let i = 0; i < count; i++) texture.add(String(i), 0, i * W, 0, W, H);
    }
    if (count > 1 && !scene.anims.exists(key))
      scene.anims.create({ key, frames: Array.from({ length: count }, (_, i) => ({ key, frame: String(i) })), frameRate: 12, repeat: -1 });
    const sprite = scene.add.sprite(0, 0, key, '0').setData('powerCardLayer', index);
    if (count > 1) sprite.play(key);
    group.add(sprite);
  });
  return group;
}
