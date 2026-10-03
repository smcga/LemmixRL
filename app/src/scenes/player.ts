/**
 * Hosts the game screen. The layout is the one of TGameScreenPlayer.BuildScreen: the game image (320 x 160) with
 * the skill panel (320 x 40) below it, scaled by the largest integer that fits, centered.
 *
 * Three cameras: one shows the visible part of the level (zoomed by the display scale), one the high resolution
 * messages (clipped to the game image, like the layer of the TImage32), and one the skill panel and the cursor.
 */
import * as Phaser from 'phaser';
import { Bitmap32, type HighResolutionMessage, SkillPanelButton, type TColor32 } from '../../../engine/src/index.ts';
import { BitmapTexture } from '../display.ts';
import { ScreenType } from '../screens/base.ts';
import type { LemmingCard } from '../run/state.ts';
import { ensureRunAssets, FONT } from '../run/ui/assets.ts';
import { PlayerScreen } from '../screens/player.ts';
import { canvasPoint, cssPx, DoubleTap, onTouchChange, pixelRatio, safeAreaInsets, touch } from '../touch.ts';
import { keepScreenOn } from '../wakelock.ts';
import { download, selectFile, showMessage, showText } from '../ui.ts';
import { getApp, gotoScreen, isGameKey, keyMods, listen } from './shared.ts';
import { TouchBar } from './touchbar.ts';

const DOUBLE_CLICK_MS = 500;
/** a finger that moves more than this (CSS pixels) scrolls instead of tapping */
const TOUCH_SLOP = 10;
/** mouse events this soon after a touch are the browser's emulation of it */
const TOUCH_MOUSE_GUARD_MS = 800;

/** the colour of a run card's mark: its edition, else insurance, else its abilities (the Lemmix colours) */
function markerColor(c: LemmingCard): number | null {
  if (c.edition === 'gold') return 0xf5c542;
  if (c.edition === 'lucky') return 0x50e050;
  if (c.edition === 'mentor') return 0x60c0ff;
  if (c.edition === 'champion') return 0xc070ff;
  if (c.insured) return 0xffffff;
  if (c.climber && c.floater) return 0xff4500;
  if (c.climber) return 0x00ff00;
  if (c.floater) return 0x6495ed;
  return null;
}

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
  /** LemmixRL: the marks above the special lemmings of a run's squad */
  private markers: Phaser.GameObjects.Rectangle[] = [];
  /** LemmixRL: touch screens */
  private touchBar!: TouchBar;
  private portraitHint!: Phaser.GameObjects.BitmapText;
  private touchTrack: { id: number; area: Area; x0: number; y0: number; lastX: number; panning: boolean } | null = null;
  private lastTouchTime = -Infinity;
  /** the double tap of the nuke button (only two taps on the nuke itself count) */
  private panelTaps = new DoubleTap<SkillPanelButton>(DOUBLE_CLICK_MS, TOUCH_SLOP);

  constructor() {
    super('player');
  }

  /**
   * The touch bar (only for touch): a column to the right of the game in landscape, a row below it in portrait.
   * The space it needs is not available for the game.
   */
  private barSpace(): { vertical: boolean; w: number; h: number } | null {
    if (!touch.active) return null;
    const vertical = this.scale.width >= this.scale.height * 1.25;
    return vertical ? { vertical, w: cssPx(84), h: 0 } : { vertical, w: 0, h: cssPx(56) };
  }

  private computeScale(): number {
    const ins = safeAreaInsets();
    const bar = this.barSpace();
    const gap = bar ? cssPx(12) : 0;
    const w = this.scale.width - ins.left - ins.right - (bar?.vertical ? bar.w + gap : 0);
    const h = this.scale.height - ins.top - ins.bottom - (bar && !bar.vertical ? bar.h + gap : 0);
    const max = Math.max(1, Math.min(Math.floor(w / 320), Math.floor(h / 200)));
    // the zoom factor of the options counts pixels as the browser shows them; the canvas has device pixels
    const zf = Math.round(getApp().config.zoomFactor * pixelRatio());
    return zf > 0 && zf <= max ? zf : max;
  }

  create(): void {
    const app = getApp();
    this.fatalError = false;
    this.capture = null;
    this.messageTexts.clear();
    this.markers = [];
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

    // LemmixRL: the buttons for touch screens (the keys of Lemmix that a phone does not have)
    this.panelTaps = new DoubleTap<SkillPanelButton>(DOUBLE_CLICK_MS, cssPx(TOUCH_SLOP));
    ensureRunAssets(this, app);
    const p = this.player;
    this.touchBar = new TouchBar(
      this,
      [
        { label: 'PAUSE', action: () => this.safe(() => p.clickPanelButton(SkillPanelButton.Pause)), active: () => p.game.isPaused },
        { label: 'FAST', action: () => this.safe(() => p.keyPress('f')), active: () => p.game.fastForward },
        // the right mouse button: the next tap picks the walker where it overlaps a worker
        { label: 'WALKER', action: () => this.safe(() => p.setTouchSelectWalker(!p.touchSelectWalker)), active: () => p.touchSelectWalker },
        { label: 'STEP', action: () => this.safe(() => p.keyPress('n')) },
        { label: '-1 SEC', action: () => this.safe(() => p.keyPress('!')) },
        { label: 'RESTART', action: () => this.safe(() => p.keyPress('R')), confirm: true },
        { label: 'END', action: () => this.safe(() => p.keyDown('Escape', { shift: false, ctrl: false, alt: false }, performance.now())), confirm: true },
      ],
      [this.cameras.main, this.textCam],
    );
    this.portraitHint = this.add.bitmapText(0, 0, FONT, 'TURN YOUR PHONE SIDEWAYS FOR A BIGGER GAME', 16).setOrigin(0.5, 0.5).setTint(0x8080c0);
    this.cameras.main.ignore(this.portraitHint);
    this.textCam.ignore(this.portraitHint);
    this.layout();

    this.scale.on('resize', this.onResize, this);
    // touch: the screen stays on while the level is played
    keepScreenOn(touch.active);
    const offTouch = onTouchChange((active) => {
      keepScreenOn(active);
      this.onResize();
    });
    this.game.canvas.style.cursor = 'none';
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      offTouch();
      keepScreenOn(false);
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
    // a finger that is down stays where it was on the screen, but the game moved under it (a rotation)
    this.cancelTouch();
    const s = this.computeScale();
    if (s !== this.scaleFactor) {
      this.player.rescale(s);
      this.scaleFactor = s;
    }
    this.layout();
  }

  private layout(): void {
    const s = this.scaleFactor;
    const W = this.scale.width;
    const H = this.scale.height;
    const ins = safeAreaInsets();
    const bar = this.barSpace();
    const gap = cssPx(12);
    const areaW = W - ins.left - ins.right;
    const areaH = H - ins.top - ins.bottom;
    if (bar?.vertical) {
      this.left = ins.left + Math.floor((areaW - (320 * s + gap + bar.w)) / 2);
      this.top = ins.top + Math.floor((areaH - 200 * s) / 2);
      const h = Math.min(areaH - 2 * gap, cssPx(this.touchBar.size * 48));
      this.touchBar.layout(this.left + 320 * s + gap, ins.top + Math.floor((areaH - h) / 2), bar.w, h, true);
    } else if (bar) {
      this.left = ins.left + Math.floor((areaW - 320 * s) / 2);
      this.top = ins.top + Math.floor((areaH - (200 * s + gap + bar.h)) / 2);
      this.touchBar.layout(ins.left + gap, this.top + 200 * s + gap, areaW - 2 * gap, bar.h, false);
    } else {
      this.left = Math.floor((W - 320 * s) / 2);
      this.top = Math.floor((H - 200 * s) / 2);
    }
    this.touchBar.setVisible(!!bar);
    // portrait on a phone: the game is small, and would be bigger sideways
    const room = this.top - ins.top;
    this.portraitHint.setVisible(!!bar && !bar.vertical && room > cssPx(40));
    this.portraitHint.setFontSize(16 * Math.max(1, Math.round(cssPx(16) / 16)));
    if (this.portraitHint.width > areaW * 0.9) this.portraitHint.setFontSize(Math.max(8, Math.floor((this.portraitHint.fontSize * areaW * 0.9) / this.portraitHint.width)));
    this.portraitHint.setPosition(ins.left + areaW / 2, ins.top + room / 2);
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
    // mouse events, not pointer events: a second button pressed while another one is held down (the right button for
    // the non-prioritized lemming) is a pointermove for pointer events, but a mousedown for mouse events
    listen(this, 'mousedown', (e) => {
      if (this.dialogOpen || e.target !== canvas || this.isTouchEcho()) return;
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
    listen(this, 'mousemove', (e) => {
      if (this.dialogOpen || this.isTouchEcho()) return;
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
    listen(this, 'mouseup', (e) => {
      if (this.isTouchEcho()) return;
      const area = this.capture;
      if (e.buttons === 0) this.capture = null;
      if (area === 'img') this.safe(() => this.player.imgMouseUp((e.buttons & 2) !== 0));
      else if (area === 'tool') this.safe(() => this.player.toolbar.mouseUp());
    });
    this.installTouch();
  }

  /** the browser's mouse events that follow a touch */
  private isTouchEcho(): boolean {
    return performance.now() - this.lastTouchTime < TOUCH_MOUSE_GUARD_MS;
  }

  /**
   * LemmixRL: fingers. A tap on the game image is a click there (when the finger comes up, and a little forgiving, see
   * PlayerScreen.touchTap); a drag scrolls the level; the skill panel works like with the mouse (tap a button, hold
   * the release rate buttons, double tap the nuke, tap or drag the minimap). Only the first finger counts.
   */
  private installTouch(): void {
    const canvas = this.game.canvas;
    const toolPoint = (x: number, y: number) => ({ bx: Math.floor(x / this.scaleFactor), by: Math.floor((y - this.player.imgHeight) / this.scaleFactor) });
    listen(this, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || this.dialogOpen || e.target !== canvas) return;
      this.lastTouchTime = performance.now();
      const p = this.controlPoint(e);
      const s = this.scaleFactor;
      const area: Area | null = p.x < 0 || p.y < 0 || p.x >= 320 * s || p.y >= 200 * s ? null : p.y < this.player.imgHeight ? 'img' : 'tool';
      if (area !== 'tool') this.panelTaps.cancel();
      if (!area) return; // the touch bar or the margins
      e.preventDefault();
      this.touchTrack = { id: e.pointerId, area, x0: p.x, y0: p.y, lastX: p.x, panning: false };
      if (area === 'img') this.safe(() => this.player.touchCursor(p.x, p.y));
      else {
        const { bx, by } = toolPoint(p.x, p.y);
        const button = this.player.toolbar.buttonAt(bx, by);
        this.panelTaps.down(button, performance.now(), p.x, p.y);
        this.player.toolBarMouseMove(p.x, p.y);
        // the nuke wants a double click in Lemmix: here two completed taps on it (see the end of the touch)
        if (button !== SkillPanelButton.Nuke) this.safe(() => this.player.toolbar.mouseDown(bx, by, false));
      }
    });
    listen(this, 'pointermove', (e) => {
      const t = this.touchTrack;
      if (!t || e.pointerId !== t.id) return;
      this.lastTouchTime = performance.now();
      const p = this.controlPoint(e);
      if (t.area === 'img') {
        if (!t.panning && Math.hypot(p.x - t.x0, p.y - t.y0) > cssPx(TOUCH_SLOP)) t.panning = true;
        if (t.panning) {
          this.player.panBy(p.x - t.lastX);
          t.lastX = p.x;
        } else this.safe(() => this.player.touchCursor(this.clampX(p.x), this.clampY(p.y)));
      } else {
        const x = this.clampX(p.x);
        const y = this.clampY(p.y);
        const { bx, by } = toolPoint(x, y);
        // a finger that leaves its button (or slides along it) does not make a tap
        this.panelTaps.move(x === p.x && y === p.y ? this.player.toolbar.buttonAt(bx, by) : SkillPanelButton.None, p.x, p.y);
        this.player.toolBarMouseMove(x, y);
        this.safe(() => this.player.toolbar.mouseMove(bx, by, true));
      }
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      const t = this.touchTrack;
      if (!t || e.pointerId !== t.id) return;
      this.touchTrack = null;
      this.lastTouchTime = performance.now();
      if (t.area === 'tool') {
        this.safe(() => this.player.toolbar.mouseUp());
        if (cancel) this.panelTaps.cancel();
        else if (this.panelTaps.up() === SkillPanelButton.Nuke) {
          const { bx, by } = toolPoint(t.x0, t.y0);
          this.safe(() => {
            this.player.toolbar.mouseDown(bx, by, true);
            this.player.toolbar.mouseUp();
          });
        }
      } else if (!t.panning && !cancel) {
        const p = this.controlPoint(e);
        this.safe(() => this.player.touchTap(this.clampX(p.x), this.clampY(p.y)));
      }
    };
    listen(this, 'pointerup', (e) => end(e, false));
    listen(this, 'pointercancel', (e) => end(e, true));
  }

  /** ends the touch going on without a tap (a rotation, a resize): held panel buttons are released */
  private cancelTouch(): void {
    const t = this.touchTrack;
    this.touchTrack = null;
    this.panelTaps.cancel();
    if (t?.area === 'tool') this.safe(() => this.player.toolbar.mouseUp());
  }

  /** a pointer position in control coordinates of the game image (not clamped) */
  private controlPoint(e: MouseEvent): { x: number; y: number } {
    const p = canvasPoint(this.game.canvas, e.clientX, e.clientY);
    return { x: Math.floor(p.x - this.left), y: Math.floor(p.y - this.top) };
  }

  private clampX(x: number): number {
    return Math.min(320 * this.scaleFactor - 1, Math.max(0, x));
  }

  private clampY(y: number): number {
    return Math.min(200 * this.scaleFactor - 1, Math.max(0, y));
  }

  /** the mouse in control coordinates of the game image, kept inside the game image and the skill panel (ClipCursor) */
  private virtualMouse(e: MouseEvent): { x: number; y: number } {
    const p = this.controlPoint(e);
    return { x: this.clampX(p.x), y: this.clampY(p.y) };
  }

  /**
   * TFormMain.App_Exception: an exception in the game (some bugs of the original raise one, like assigning a skill
   * with the right mouse button held down to a blocker without other lemmings under the cursor) is fatal in Lemmix:
   * the error is shown and the program terminates. Here the game stops, the error is shown, and the menu follows.
   */
  private safe<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (e) {
      this.fatal(e);
      return undefined;
    }
  }

  private fatalError = false;

  private fatal(e: unknown): void {
    console.error(e);
    if (this.fatalError) return;
    this.fatalError = true;
    this.player.stop();
    const err = e as Error;
    const cls = err instanceof TypeError ? 'EAccessViolation' : (err?.name ?? 'Exception');
    this.dialogOpen++;
    void showMessage(`${err?.message ?? String(e)}\nExceptionclass: ${cls}\n\n(Lemmix terminates here.)`).then(() => {
      this.dialogOpen--;
      // in a run the attempt does not count, the run goes on
      const app = getApp();
      if (app.inRun) app.run?.abandonAttempt();
      gotoScreen(this, app.inRun ? ScreenType.Run : ScreenType.Menu);
    });
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
    this.cursorImage.setVisible(!touch.active || (this.touchTrack?.area === 'img' && !this.touchTrack.panning));
    if (touch.active) player.syncTouchSelection();
    this.touchBar.update();

    this.updateMessages();
    this.updateMarkers(pos);
  }

  /** LemmixRL: a small mark above every special lemming of the squad, in the colour of its card */
  private updateMarkers(pos: number): void {
    const app = getApp();
    const run = app.inRun ? app.run : null;
    let n = 0;
    if (run) {
      const list = this.player.game.lemmingList;
      for (let i = 0; i < list.length; i++) {
        const l = list[i];
        if (l.isRemoved) continue;
        const card = run.cardAt(i);
        const color = card ? markerColor(card) : null;
        if (color === null) continue;
        let m = this.markers[n];
        if (!m) {
          m = this.add.rectangle(0, 0, 3, 3, color).setStrokeStyle(1, 0x000000).setOrigin(0.5, 0.5);
          this.textCam.ignore(m);
          this.uiCam.ignore(m);
          this.markers.push(m);
        }
        m.setPosition(l.xPos - pos + 0.5, l.yPos - 13).setFillStyle(color).setVisible(true);
        n++;
      }
    }
    for (let i = n; i < this.markers.length; i++) this.markers[i].setVisible(false);
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
        t = this.add.text(0, 0, msg.text, { fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: `${Math.round(23 * pixelRatio())}px`, color: colorString(msg.color) });
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
