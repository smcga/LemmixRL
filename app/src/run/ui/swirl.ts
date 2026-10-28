/**
 * The background of the Lematro screens: two colours of paint swirling slowly around the middle, with a darker third
 * in the folds, drawn in big pixels (in the spirit of Balatro's background). A change of colours (another level, the
 * shop, a pack being opened) blends over in a moment, and the swirl speeds up while it does.
 *
 * It is drawn on a small canvas (a pixel of it is several pixels of the screen) a number of times a second.
 */
import * as Phaser from 'phaser';

/** the colours of a swirl: the main paint, the second paint and the dark of the folds */
export type SwirlColors = readonly [number, number, number];

/** the swirls of the screens */
export const SWIRLS = {
  title: [0xd8443c, 0x2a6fb0, 0x2b1d3a],
  start: [0x3f9f4f, 0x2a6fb0, 0x16283a],
  assign: [0x2b9f98, 0x2f6b8f, 0x14262e],
  small: [0x2a7fd0, 0x3fa060, 0x13233a],
  big: [0xd88a2b, 0x3fa060, 0x2a1d14],
  boss: [0xd8443c, 0x7a3fa0, 0x2a1020],
  shop: [0xc0503c, 0x3f7fb0, 0x231a2a],
  over: [0x6a6a7a, 0x3a3a4a, 0x141418],
  won: [0xe0b040, 0x3fa060, 0x2a2010],
  lemmings: [0x3fae4f, 0x2a7fd0, 0x10281a],
  training: [0x2bb3a8, 0xd8a02b, 0x102a28],
  boost: [0x9b59d0, 0x3f4fb0, 0x1c1030],
  gadget: [0xe8892b, 0xd8443c, 0x2a1408],
  mayhem: [0xd8303c, 0x2a2a3a, 0x1a0810],
} as const satisfies Record<string, SwirlColors>;

const PX_W = 192;
const PX_H = 108;
/** how often the swirl is drawn (times a second) */
const FPS = 24;

let counter = 0;

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
}

export class Swirl {
  readonly image: Phaser.GameObjects.Image;
  private readonly key: string;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly data: ImageData;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private colors: [number, number, number][];
  private target: [number, number, number][];
  private time = Math.random() * 100;
  /** extra speed, while the colours change */
  private spin = 0;
  private sinceDraw = Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    colors: SwirlColors,
  ) {
    this.key = `rl-swirl-${counter++}`;
    this.canvas = document.createElement('canvas');
    this.canvas.width = PX_W;
    this.canvas.height = PX_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.data = this.ctx.createImageData(PX_W, PX_H);
    this.texture = scene.textures.addCanvas(this.key, this.canvas)!;
    this.colors = colors.map(rgb);
    this.target = colors.map(rgb);
    this.image = scene.add.image(0, 0, this.key).setDepth(-100);
    this.draw();
    scene.events.on('update', this.update, this);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Blends over to other colours. */
  set(colors: SwirlColors): void {
    const t = colors.map(rgb);
    if (t.every((c, i) => c.every((v, j) => v === this.target[i][j]))) return;
    this.target = t;
    this.spin = 1;
  }

  /** Covers a rectangle of the world (what the camera shows). */
  cover(x: number, y: number, w: number, h: number): void {
    // a little bigger than asked, and in the shape of the canvas (cropping, not stretching)
    const s = Math.max(w / PX_W, h / PX_H) * 1.02;
    this.image.setPosition(x + w / 2, y + h / 2).setScale(s);
  }

  private update(_time: number, delta: number): void {
    const dt = Math.min(0.1, delta / 1000);
    this.time += dt * (1 + 5 * this.spin);
    this.spin = Math.max(0, this.spin - dt * 1.2);
    // the colours follow their target in about half a second
    const k = 1 - Math.exp(-dt * 5);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) this.colors[i][j] += (this.target[i][j] - this.colors[i][j]) * k;
    this.sinceDraw += dt;
    if (this.sinceDraw < 1 / FPS) return;
    this.sinceDraw = 0;
    this.draw();
  }

  private draw(): void {
    const px = this.data.data;
    const [c1, c2, c3] = this.colors;
    const t = this.time;
    const turn = t * 0.07;
    let o = 0;
    for (let y = 0; y < PX_H; y++) {
      for (let x = 0; x < PX_W; x++) {
        // from the middle (a little to the left, as the column is on the left), in units of the height
        let u = (x - PX_W * 0.56) / PX_H;
        let v = (y - PX_H * 0.5) / PX_H;
        // the swirl: further out, turned more
        const r = Math.sqrt(u * u + v * v);
        const a = Math.atan2(v, u) + turn + r * 3.2;
        u = r * Math.cos(a) * 7;
        v = r * Math.sin(a) * 7;
        // the paint folds over itself
        for (let i = 0; i < 4; i++) {
          const nu = u + 0.7 * Math.sin(v * 0.8 + t * 0.21 + i * 1.7);
          v = v + 0.7 * Math.cos(u * 0.7 - t * 0.17 + i * 2.3);
          u = nu;
        }
        const p = 0.5 + 0.5 * Math.sin(u * 0.55 + v * 0.45 + t * 0.05);
        // the first paint, the second, and the dark between them
        const w1 = Math.max(0, 1 - Math.abs(p - 0.9) * 3.2);
        const w2 = Math.max(0, 1 - Math.abs(p - 0.15) * 3.2);
        const w3 = Math.max(0, 1 - w1 - w2);
        px[o] = c1[0] * w1 + c2[0] * w2 + c3[0] * w3;
        px[o + 1] = c1[1] * w1 + c2[1] * w2 + c3[1] * w3;
        px[o + 2] = c1[2] * w1 + c2[2] * w2 + c3[2] * w3;
        px[o + 3] = 255;
        o += 4;
      }
    }
    this.ctx.putImageData(this.data, 0, 0);
    this.texture.refresh();
  }

  destroy(): void {
    this.scene.events.off('update', this.update, this);
    this.image.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
