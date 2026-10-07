/**
 * Hosts the DOS style screens (menu, level code, preview, postview). Their bitmap is stretched to the window
 * keeping its aspect ratio (TImage32 ScaleMode smResize, BitmapAlign baCenter).
 */
import * as Phaser from 'phaser';
import { chooseStyle, editConfig } from '../dialogs.ts';
import { BitmapTexture } from '../display.ts';
import { ScreenType } from '../screens/base.ts';
import { LevelCodeScreen } from '../screens/levelcode.ts';
import { MenuScreen } from '../screens/menu.ts';
import { PostviewScreen } from '../screens/postview.ts';
import { PreviewScreen } from '../screens/preview.ts';
import { ensureRunAssets } from '../run/ui/assets.ts';
import { canFullscreen, canvasPoint, cssPx, isFullscreen, onTouchChange, safeAreaInsets, toggleFullscreen, touch } from '../touch.ts';
import { download, selectFile, showMessage, showText } from '../ui.ts';
import { getApp, gotoScreen, isGameKey, listen } from './shared.ts';
import { TouchBar, type TouchButtonDef } from './touchbar.ts';

/** mouse events this soon after a touch are the browser's emulation of it */
const TOUCH_MOUSE_GUARD_MS = 800;

type DosScreen = MenuScreen | PreviewScreen | PostviewScreen | LevelCodeScreen;

export class DosScene extends Phaser.Scene {
  private type = ScreenType.Menu;
  private screen!: DosScreen;
  private tex!: BitmapTexture;
  private image!: Phaser.GameObjects.Image;
  private closed = false;
  private touchBar!: TouchBar;
  private touchBarSize = 1;
  private lastTouchTime = -Infinity;
  private codeInput: HTMLInputElement | null = null;

  constructor() {
    super('dos');
  }

  init(data: { type: ScreenType }): void {
    this.type = data.type;
    this.closed = false;
  }

  create(): void {
    const app = getApp();
    const close = (next: ScreenType) => {
      if (this.closed) return;
      this.closed = true;
      gotoScreen(this, next);
    };
    switch (this.type) {
      case ScreenType.Preview:
        this.screen = new PreviewScreen(app, close, { selectReplayFile: () => selectFile('.lrb') });
        break;
      case ScreenType.Postview:
        this.screen = new PostviewScreen(app, close, {
          download,
          showMessage,
          copyToClipboard: (text) => void navigator.clipboard?.writeText(text),
        });
        break;
      case ScreenType.LevelCode:
        this.screen = new LevelCodeScreen(app, close);
        break;
      default:
        this.screen = new MenuScreen(app, close, {
          chooseStyle,
          editConfig: () => editConfig(app.config),
          selectReplayFile: () => selectFile('.lrb'),
          showMessage,
          showText,
        });
    }
    this.screen.build();

    const bmp = this.screen.screen;
    this.tex = new BitmapTexture(this, bmp.width, bmp.height);
    this.image = this.add.image(0, 0, this.tex.key).setOrigin(0, 0);

    // LemmixRL: for touch screens, the keys these screens need
    ensureRunAssets(this, app);
    const screen0 = this.screen;
    const key = (k: string) => () => {
      if (!this.closed && 'keyDown' in screen0) screen0.keyDown(k, false, false, false);
    };
    const defs: TouchButtonDef[] =
      this.type === ScreenType.Menu
        ? [
            { label: 'OPTIONS', action: key('F5') },
            { label: 'STYLE', action: key('F4') },
          ]
        : [{ label: this.type === ScreenType.Postview ? 'MENU' : 'BACK', action: key('Escape') }];
    if (this.type === ScreenType.Menu && canFullscreen()) defs.push({ label: 'FULLSCREEN', action: toggleFullscreen, active: isFullscreen });
    this.touchBarSize = defs.length;
    this.touchBar = new TouchBar(this, defs, []);
    if (this.type === ScreenType.LevelCode) this.createCodeInput();

    this.layout();
    this.scale.on('resize', this.layout, this);
    const offTouch = onTouchChange(() => this.layout());
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      offTouch();
      this.tex.destroy();
      this.codeInput?.remove();
      this.codeInput = null;
    });

    const screen = this.screen;
    listen(this, 'keydown', (e) => {
      if (isGameKey(e)) e.preventDefault();
      if (this.closed) return;
      if ('keyDown' in screen) screen.keyDown(e.key, e.shiftKey, e.ctrlKey, e.altKey);
      if (this.closed) return;
      if (e.ctrlKey && e.key === 'c' && 'copy' in screen) screen.copy();
      if ('keyPress' in screen && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === 'Backspace')) screen.keyPress(e.key);
    });
    listen(this, 'mousedown', (e) => {
      if (this.closed || e.target !== this.game.canvas || performance.now() - this.lastTouchTime < TOUCH_MOUSE_GUARD_MS) return;
      // LemmixRL: the sign of the roguelike run in the menu is a button
      if (e.button === 0 && 'clickAt' in screen) {
        const p = canvasPoint(this.game.canvas, e.clientX, e.clientY);
        const s = this.image.scaleX;
        if (screen.clickAt((p.x - this.image.x) / s, (p.y - this.image.y) / s)) return;
      }
      if ('mouseDown' in screen) screen.mouseDown(e.button);
    });
    // LemmixRL: a tap is a click with the left button, except on the signs of the menu (see MenuScreen.touchAt)
    listen(this, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || this.closed || e.target !== this.game.canvas) return;
      this.lastTouchTime = performance.now();
      const p = canvasPoint(this.game.canvas, e.clientX, e.clientY);
      const s = this.image.scaleX;
      const bx = (p.x - this.image.x) / s;
      const by = (p.y - this.image.y) / s;
      if (bx < 0 || by < 0 || bx >= bmp.width || by >= bmp.height) return; // the touch buttons, the margins
      e.preventDefault();
      if ('touchAt' in screen && screen.touchAt(bx, by)) return;
      if ('mouseDown' in screen) screen.mouseDown(0);
    });
    listen(this, 'wheel', (e) => {
      if (!this.closed && 'wheel' in screen) screen.wheel(e.deltaY);
    });
    listen(this, 'paste', (e) => {
      if (!this.closed && 'paste' in screen) screen.paste(e.clipboardData?.getData('text') ?? '');
    });
  }

  private layout(): void {
    // the safe area of the screen: not under a notch, a rounded corner or the home indicator
    const ins = safeAreaInsets();
    const x0 = ins.left;
    const y0 = ins.top;
    const w = this.scale.width - ins.left - ins.right;
    const h = this.scale.height - ins.top - ins.bottom;
    const bmp = this.screen.screen;
    // touch: the buttons get a strip at the right (landscape) or at the bottom (portrait)
    const vertical = w >= h * 1.25;
    const barW = touch.active && vertical ? cssPx(96) : 0;
    const barH = touch.active && !vertical ? cssPx(56) : 0;
    const s = Math.min((w - barW) / bmp.width, (h - barH) / bmp.height);
    this.image.setScale(s);
    this.image.setPosition(x0 + Math.floor((w - barW - bmp.width * s) / 2), y0 + Math.floor((h - barH - bmp.height * s) / 2));
    const gap = cssPx(8);
    const n = this.touchBarSize;
    if (vertical) this.touchBar.layout(x0 + w - barW + gap, y0 + gap, barW - 2 * gap, Math.min(h - 2 * gap, n * cssPx(48) + (n - 1) * gap), true);
    else this.touchBar.layout(x0 + gap, y0 + h - barH + gap, Math.min(w - 2 * gap, n * cssPx(140)), barH - 2 * gap, false);
    this.touchBar.setVisible(touch.active);
    this.positionCodeInput();
  }

  /** LemmixRL: a phone shows its keyboard for an input element only: the level code screen gets one (touch only) */
  private createCodeInput(): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Tap here to type the code';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('autocorrect', 'off');
    input.style.cssText =
      'position:fixed;transform:translateX(-50%);width:min(80vw,360px);padding:8px 10px;font:18px monospace;' +
      'text-align:center;background:#101028;color:#e0e0ff;border:1px solid #6060a0;border-radius:8px;z-index:5;';
    const screen = this.screen as LevelCodeScreen;
    input.addEventListener('keydown', (e) => {
      // the soft keyboard: characters come with the input events
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') screen.keyDown(e.key, false, false, false);
    });
    input.addEventListener('input', (e) => {
      const ie = e as InputEvent;
      if (ie.inputType === 'deleteContentBackward') screen.keyPress('Backspace');
      else for (const ch of input.value) screen.keyPress(ch);
      input.value = '';
    });
    document.body.appendChild(input);
    this.codeInput = input;
  }

  private positionCodeInput(): void {
    const input = this.codeInput;
    if (!input) return;
    input.style.display = touch.active ? 'block' : 'none';
    // under the code, in the middle of the screen image (CSS pixels)
    const k = this.game.canvas.getBoundingClientRect().height / this.scale.height;
    input.style.top = `${Math.round((this.image.y + 250 * this.image.scaleY) * k)}px`;
    input.style.left = `${Math.round((this.image.x + (this.screen.screen.width * this.image.scaleX) / 2) * k)}px`;
  }

  override update(): void {
    this.touchBar.update();
    const screen = this.screen;
    if ('idle' in screen) screen.idle(performance.now());
    if (screen.dirty) {
      screen.dirty = false;
      this.tex.update(screen.screen);
    }
  }
}
