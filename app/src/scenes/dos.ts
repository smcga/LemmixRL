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
import { download, selectFile, showMessage, showText } from '../ui.ts';
import { getApp, gotoScreen, isGameKey, listen } from './shared.ts';

type DosScreen = MenuScreen | PreviewScreen | PostviewScreen | LevelCodeScreen;

export class DosScene extends Phaser.Scene {
  private type = ScreenType.Menu;
  private screen!: DosScreen;
  private tex!: BitmapTexture;
  private image!: Phaser.GameObjects.Image;
  private closed = false;

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
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.tex.destroy();
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
    listen(this, 'pointerdown', (e) => {
      if (this.closed || e.target !== this.game.canvas) return;
      if ('mouseDown' in screen) screen.mouseDown(e.button);
    });
    listen(this, 'wheel', (e) => {
      if (!this.closed && 'wheel' in screen) screen.wheel(e.deltaY);
    });
    listen(this, 'paste', (e) => {
      if (!this.closed && 'paste' in screen) screen.paste(e.clipboardData?.getData('text') ?? '');
    });
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const bmp = this.screen.screen;
    const s = Math.min(w / bmp.width, h / bmp.height);
    this.image.setScale(s);
    this.image.setPosition(Math.floor((w - bmp.width * s) / 2), Math.floor((h - bmp.height * s) / 2));
  }

  override update(): void {
    const screen = this.screen;
    if ('idle' in screen) screen.idle(performance.now());
    if (screen.dirty) {
      screen.dirty = false;
      this.tex.update(screen.screen);
    }
  }
}
