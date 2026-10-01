/**
 * Hosts the game screen. The layout is the one of TGameScreenPlayer.BuildScreen: the game image (320 x 160) with
 * the skill panel (320 x 40) below it, scaled by the largest integer that fits, centered.
 *
 * Three cameras: one shows the visible part of the level (zoomed by the display scale), one the high resolution
 * messages (clipped to the game image, like the layer of the TImage32), and one the skill panel and the cursor.
 */
import * as Phaser from 'phaser';
import { Bitmap32, type HighResolutionMessage, type TColor32 } from '../../../engine/src/index.ts';
import { BitmapTexture } from '../display.ts';
import { PlayerScreen } from '../screens/player.ts';
import { download, selectFile, showMessage, showText } from '../ui.ts';
import { getApp, gotoScreen, isGameKey, keyMods, listen } from './shared.ts';

const DOUBLE_CLICK_MS = 500;

type Area = 'img' | 'tool';

function colorString(c: TColor32): string {
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

export class PlayerScene extends Phaser.Scene {
  private player!: PlayerScreen;
  private gameTex!: BitmapTexture;
  private toolTex!: BitmapTexture;
  private gameImage!: Phaser.GameObjects.Image;
  private toolImage!: Phaser.GameObjects.Image;
  private cursorImage!: Phaser.GameObjects.Image;
  private readonly cursorTextures = new Map<number, BitmapTexture>();
  private textCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private readonly messageTexts = new Map<HighResolutionMessage, Phaser.GameObjects.Text>();
  private left = 0;
  private top = 0;
  private scaleFactor = 1;
  private capture: Area | null = null;
  private lastArea: Area = 'img';
  private lastToolDown = { button: -1, time: -Infinity, x: 0, y: 0 };
  private dialogOpen = 0;

  constructor() {
    super('player');
  }

  private computeScale(): number {
    const max = Math.max(1, Math.min(Math.floor(this.scale.width / 320), Math.floor(this.scale.height / 200)));
    const zf = getApp().config.zoomFactor;
    return zf > 0 && zf <= max ? zf : max;
  }

  create(): void {
    const app = getApp();
    this.capture = null;
    this.messageTexts.clear();
    this.scaleFactor = this.computeScale();
    const dialog = async <T>(p: () => Promise<T>): Promise<T> => {
      this.dialogOpen++;
      try {
        return await p();
      } finally {
        this.dialogOpen--;
      }
    };
    this.player = new PlayerScreen(app, (next) => gotoScreen(this, next), this.scaleFactor, {
      selectReplayFile: () => dialog(() => selectFile('.lrb')),
      download,
      showText: (title, text) => dialog(() => showText(title, text)),
      showMessage: (text) => dialog(() => showMessage(text)),
      hasFocus: () => document.hasFocus(),
    });
    this.player.build();

    // display objects
    this.gameTex = new BitmapTexture(this, 321, 160);
    this.gameImage = this.add.image(0, 0, this.gameTex.key).setOrigin(0, 0);
    this.toolTex = new BitmapTexture(this, 320, 40);
    this.toolImage = this.add.image(0, 0, this.toolTex.key).setOrigin(0, 0);
    for (const [id, name] of [
      [1, 'CursorDefault'],
      [2, 'CursorHighlight'],
      [3, 'CursorDrag'],
    ] as const) {
      const tex = new BitmapTexture(this, 14, 14, false);
      tex.update(this.cursorBitmap(name));
      this.cursorTextures.set(id, tex);
    }
    this.cursorImage = this.add.image(0, 0, this.cursorTextures.get(1)!.key).setOrigin(0, 0);

    this.textCam = this.cameras.add(0, 0, 1, 1);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.cameras.main.ignore([this.toolImage, this.cursorImage]);
    this.textCam.ignore([this.gameImage, this.toolImage, this.cursorImage]);
    this.uiCam.ignore(this.gameImage);
    this.layout();

    this.scale.on('resize', this.onResize, this);
    this.game.canvas.style.cursor = 'none';
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.game.canvas.style.cursor = '';
      this.gameTex.destroy();
      this.toolTex.destroy();
      for (const t of this.cursorTextures.values()) t.destroy();
      this.cursorTextures.clear();
      this.messageTexts.clear(); // the scene destroys its game objects and cameras itself
    });

    this.installInput();
    this.player.activate(performance.now());
    // the mouse starts in the center of the game image (SetCursorPos)
    this.player.mouseX = Math.trunc(this.player.imgWidth / 2);
    this.player.mouseY = Math.trunc(this.player.imgHeight / 2);
  }

  /** a cursor from the bitmap and its mask (white in the mask is transparent) */
  private cursorBitmap(name: string): Bitmap32 {
    const app = getApp();
    const color = app.cursors.get(name);
    const mask = app.cursors.get(name + 'Mask');
    const b = new Bitmap32(14, 14);
    if (!color || !mask) return b;
    for (let i = 0; i < b.bits.length; i++) b.bits[i] = (mask.bits[i] & 0xffffff) === 0xffffff ? 0 : (color.bits[i] | 0xff000000) >>> 0;
    return b;
  }

  private onResize(): void {
    const s = this.computeScale();
    if (s !== this.scaleFactor) {
      this.player.rescale(s);
      this.scaleFactor = s;
    }
    this.layout();
  }

  private layout(): void {
    const s = this.scaleFactor;
    this.left = Math.floor((this.scale.width - 320 * s) / 2);
    this.top = Math.floor((this.scale.height - 200 * s) / 2);
    const main = this.cameras.main;
    main.setViewport(this.left, this.top, 320 * s, 160 * s);
    main.setOrigin(0, 0);
    main.setZoom(s);
    main.setScroll(0, 0);
    this.textCam.setViewport(this.left, this.top, 320 * s, 160 * s);
    this.uiCam.setViewport(0, 0, this.scale.width, this.scale.height);
    this.toolImage.setScale(s).setPosition(this.left, this.top + 160 * s);
    this.cursorImage.setScale(s);
  }

  // input

  private installInput(): void {
    const canvas = this.game.canvas;
    listen(this, 'keydown', (e) => {
      if (this.dialogOpen) return;
      if (isGameKey(e)) e.preventDefault();
      const mods = keyMods(e);
      const handled = this.safe(() => this.player.keyDown(e.key, mods, performance.now()));
      if (!handled && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) this.safe(() => this.player.keyPress(e.key));
    });
    listen(this, 'keyup', (e) => {
      if (this.dialogOpen) return;
      this.safe(() => this.player.keyUp(e.key, keyMods(e)));
    });
    listen(this, 'blur', () => this.player.deactivate());
    listen(this, 'pointerdown', (e) => {
      if (this.dialogOpen || e.target !== canvas) return;
      const { x, y } = this.virtualMouse(e);
      const area: Area = y < this.player.imgHeight ? 'img' : 'tool';
      this.capture = area;
      if (area === 'img') this.safe(() => this.player.imgMouseDown(x, y, e.button, (e.buttons & 2) !== 0, keyMods(e)));
      else {
        const bx = Math.floor(x / this.scaleFactor);
        const by = Math.floor((y - this.player.imgHeight) / this.scaleFactor);
        const now = performance.now();
        const last = this.lastToolDown;
        const isDouble = last.button === e.button && now - last.time < DOUBLE_CLICK_MS && Math.abs(last.x - x) <= 4 && Math.abs(last.y - y) <= 4;
        this.lastToolDown = isDouble ? { button: -1, time: -Infinity, x, y } : { button: e.button, time: now, x, y };
        this.safe(() => this.player.toolbar.mouseDown(bx, by, isDouble));
      }
    });
    listen(this, 'pointermove', (e) => {
      if (this.dialogOpen) return;
      const { x, y } = this.virtualMouse(e);
      const area: Area = this.capture ?? (y < this.player.imgHeight ? 'img' : 'tool');
      if (area === 'tool' && this.lastArea === 'img' && !this.capture) this.player.toolBarMouseEnter();
      this.lastArea = area;
      if (area === 'img') this.safe(() => this.player.imgMouseMove(x, y, (e.buttons & 2) !== 0));
      else {
        this.player.toolBarMouseMove(x, y);
        const bx = Math.floor(x / this.scaleFactor);
        const by = Math.floor((y - this.player.imgHeight) / this.scaleFactor);
        this.safe(() => this.player.toolbar.mouseMove(bx, by, (e.buttons & 1) !== 0));
      }
    });
    listen(this, 'pointerup', (e) => {
      const area = this.capture;
      if (e.buttons === 0) this.capture = null;
      if (area === 'img') this.safe(() => this.player.imgMouseUp((e.buttons & 2) !== 0));
      else if (area === 'tool') this.safe(() => this.player.toolbar.mouseUp());
    });
  }

  /** the mouse in control coordinates of the game image, kept inside the game image and the skill panel (ClipCursor) */
  private virtualMouse(e: PointerEvent): { x: number; y: number } {
    const rect = this.game.canvas.getBoundingClientRect();
    const s = this.scaleFactor;
    const x = Math.min(320 * s - 1, Math.max(0, Math.floor(e.clientX - rect.left - this.left)));
    const y = Math.min(200 * s - 1, Math.max(0, Math.floor(e.clientY - rect.top - this.top)));
    return { x, y };
  }

  /** Exceptions in event handlers end up in Application.HandleException in Lemmix: the program continues. */
  private safe<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  override update(): void {
    const player = this.player;
    if (!this.dialogOpen) this.safe(() => player.update(performance.now()));
    if (!this.scene.isActive()) return;

    // the visible part of the level
    const s = this.scaleFactor;
    const pos = -player.offsetHorz / s;
    const sx = Math.floor(pos);
    this.gameTex.update(player.targetBitmap, sx, 0);
    this.gameImage.setPosition(-(pos - sx), 0);

    if (player.toolbar.dirty) {
      player.toolbar.dirty = false;
      this.toolTex.update(player.toolbar.bitmap);
    }

    // cursor
    const tex = this.cursorTextures.get(player.currentCursor) ?? this.cursorTextures.get(1)!;
    if (this.cursorImage.texture.key !== tex.key) this.cursorImage.setTexture(tex.key);
    this.cursorImage.setPosition(this.left + player.mouseX - 7 * s, this.top + player.mouseY - 7 * s);

    this.updateMessages();
  }

  /** THighResolutionLayer.Paint */
  private updateMessages(): void {
    const layer = this.player.game.highResolutionLayer;
    const alive = new Set<HighResolutionMessage>();
    for (const msg of layer.messageList) {
      if (msg.ended || !layer.visible) continue;
      alive.add(msg);
      let t = this.messageTexts.get(msg);
      if (!t) {
        t = this.add.text(0, 0, msg.text, { fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: '23px', color: colorString(msg.color) });
        this.cameras.main.ignore(t);
        this.uiCam.ignore(t);
        this.messageTexts.set(msg, t);
      }
      t.setPosition(msg.x, msg.y);
      t.setAlpha(msg.alpha / 255);
    }
    for (const [msg, t] of this.messageTexts)
      if (!alive.has(msg)) {
        t.destroy();
        this.messageTexts.delete(msg);
      }
  }
}
