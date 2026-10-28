/**
 * Little effects of the run screens, after Balatro's: sparks that burst from a card (when a pack bursts, when a card
 * materialises out of it or dissolves), a stream of them while a pack shakes, and a flash.
 */
import * as Phaser from 'phaser';

const SPARK = 'rl-spark';

/** the texture of a spark: a small white square (pixel art, as the rest) */
function sparkTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists(SPARK)) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture(SPARK, 4, 4);
    g.destroy();
  }
  return SPARK;
}

export interface SparkOptions {
  colors: number[];
  /** how many, at once */
  count: number;
  /** pixels a second */
  speed?: [number, number];
  /** ms */
  life?: number;
  /** how big at first (the texture is 4 pixels) */
  scale?: number;
  /** the area they start from, around the point */
  spread?: { w: number; h: number };
  depth?: number;
  /** falls (pixels a second, each second) */
  gravity?: number;
}

/** A burst of sparks from a point (gone by themselves). */
export function sparks(scene: Phaser.Scene, x: number, y: number, o: SparkOptions): Phaser.GameObjects.Particles.ParticleEmitter {
  const life = o.life ?? 500;
  const spread = o.spread;
  const emitter = scene.add.particles(x, y, sparkTexture(scene), {
    speed: { min: o.speed?.[0] ?? 40, max: o.speed?.[1] ?? 160 },
    angle: { min: 0, max: 360 },
    lifespan: { min: life * 0.6, max: life },
    scale: { start: o.scale ?? 1, end: 0 },
    alpha: { start: 1, end: 0.6 },
    rotate: { min: 0, max: 90 },
    tint: o.colors,
    gravityY: o.gravity ?? 0,
    emitting: false,
    ...(spread ? { emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-spread.w / 2, -spread.h / 2, spread.w, spread.h) } } : {}),
  } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig);
  emitter.setDepth(o.depth ?? 900);
  emitter.explode(o.count);
  scene.time.delayedCall(life + 50, () => emitter.destroy());
  return emitter;
}

/** A stream of sparks from a point, until it is stopped (then it goes when its last spark has gone). */
export function sparkStream(scene: Phaser.Scene, x: number, y: number, o: Omit<SparkOptions, 'count'> & { every: number }): { emitter: Phaser.GameObjects.Particles.ParticleEmitter; stop: () => void } {
  const life = o.life ?? 500;
  const spread = o.spread;
  const emitter = scene.add.particles(x, y, sparkTexture(scene), {
    speed: { min: o.speed?.[0] ?? 40, max: o.speed?.[1] ?? 160 },
    angle: { min: 0, max: 360 },
    lifespan: { min: life * 0.6, max: life },
    scale: { start: o.scale ?? 1, end: 0 },
    rotate: { min: 0, max: 90 },
    tint: o.colors,
    gravityY: o.gravity ?? 0,
    frequency: o.every,
    ...(spread ? { emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-spread.w / 2, -spread.h / 2, spread.w, spread.h) } } : {}),
  } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig);
  emitter.setDepth(o.depth ?? 900);
  return {
    emitter,
    stop: () => {
      if (!emitter.active) return;
      emitter.stop();
      scene.time.delayedCall(life + 50, () => emitter.destroy());
    },
  };
}

/** A flash: a white rectangle over an area that fades. */
export function flash(scene: Phaser.Scene, x: number, y: number, w: number, h: number, depth = 950, ms = 280, alpha = 0.85): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(x, y, w, h, 0xffffff, alpha).setOrigin(0, 0).setDepth(depth);
  scene.tweens.add({ targets: r, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  return r;
}
