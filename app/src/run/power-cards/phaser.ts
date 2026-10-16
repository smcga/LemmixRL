import type * as Phaser from 'phaser';
import type { DataProvider } from '../../../../engine/src/index.ts';
import { powerCardAssets, powerCardFrameCount, powerCardSheet } from './render.ts';
import { POWER_CARD_WIDTH as W, POWER_CARD_HEIGHT as H, type PowerCardDesign } from './schema.ts';

/** Immutable catalogue artwork is cached once per Phaser game; metadata does not affect the texture. */
export function powerCardSprite(scene: Phaser.Scene, design: PowerCardDesign, data: DataProvider, width: number, height: number): Phaser.GameObjects.Sprite {
  const key = 'power-card:' + JSON.stringify(design.appearance);
  const count = powerCardFrameCount(design);
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.addCanvas(key, powerCardSheet(design, powerCardAssets(data)))!;
    for (let i = 0; i < count; i++) texture.add(String(i), 0, i * W, 0, W, H);
  }
  if (count > 1 && !scene.anims.exists(key))
    scene.anims.create({ key, frames: Array.from({ length: count }, (_, i) => ({ key, frame: String(i) })), frameRate: 12, repeat: -1 });
  const sprite = scene.add.sprite(0, 0, key, '0').setScale(width / W, height / H);
  if (count > 1) sprite.play(key);
  return sprite;
}
