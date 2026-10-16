/**
 * The level before it is played, in a run (LemmixRL): what the preview screen of Lemmings tells (the whole level, its
 * number and title, the lemmings, how many to save, the release rate, the time, the rating), laid out like a blind of
 * Balatro over the swirl in the colour of the level, with the skills the squad brings. A click (or Enter) plays it,
 * Back (or Escape) goes back to the levels of the round.
 *
 * It prepares the level for the game as the preview screen of Lemmix does (the game plays the level loaded here).
 */
import * as Phaser from 'phaser';
import { Bitmap32, delphiTrim, GAME_BMPHEIGHT, GAME_BMPWIDTH } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { ScreenType } from '../screens/base.ts';
import { SKILLS } from '../run/skills.ts';
import { BLIND_NAMES, BLIND_REWARDS, type BlindKind } from '../run/state.ts';
import { bitmapToCanvas, ensureRunAssets, lemmingSprite, SKILL_ICONS } from '../run/ui/assets.ts';
import { Swirl, SWIRLS } from '../run/ui/swirl.ts';
import { Button, COLORS, label, panel } from '../run/ui/widgets.ts';
import { safeAreaInsets, touch } from '../touch.ts';
import { getApp, gotoScreen, listen } from './shared.ts';

const W = 960;
const H = 540;
const BLIND_COLORS: Record<BlindKind, number> = { small: COLORS.blue, big: COLORS.orange, boss: COLORS.red };
const LEVEL_KEY = 'rl-prelevel';

export class RunPreviewScene extends Phaser.Scene {
  private app!: LemmixApp;
  private swirl!: Swirl;
  private closed = false;
  /** where the buttons are, by name (for the tests) */
  private spots: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('runpreview');
  }

  create(): void {
    const app = (this.app = getApp());
    this.closed = false;
    this.spots = {};
    ensureRunAssets(this, app);
    const run = app.run!;
    const blind = run.currentBlind;
    const kind = blind?.kind ?? 'small';
    const color = BLIND_COLORS[kind];
    this.swirl = new Swirl(this, SWIRLS[kind]);

    // the level, as the preview screen of Lemmix prepares it: the squad, the skills and the clock of the run
    const info = app.currentLevelInfo!;
    info.loadLevel(app.level);
    run.applyToLevel(app.level);
    app.replayFile = null; // (no replays in a run)
    app.replayFileName = '';
    app.graphicSet.load(app.data.provider, app.level.info.graphicSet, app.level.info.graphicSetEx);
    app.renderer.prepare(app.level, app.graphicSet);
    const world = new Bitmap32();
    world.setSize(GAME_BMPWIDTH, GAME_BMPHEIGHT);
    world.clear(0);
    app.renderer.renderWorld(world, true);
    const li = app.level.info;

    // the whole level along the top (the columns it uses), framed
    let x0 = world.width;
    let x1 = -1;
    for (let x = 0; x < world.width; x++)
      for (let y = 0; y < world.height; y++)
        if ((world.bits[y * world.width + x] & 0xffffff) !== 0) {
          if (x < x0) x0 = x;
          x1 = x;
          break;
        }
    if (x1 < x0) [x0, x1] = [0, world.width - 1];
    const cw = x1 - x0 + 1;
    const crop = new Bitmap32(cw, world.height);
    for (let y = 0; y < world.height; y++) crop.bits.set(world.bits.subarray(y * world.width + x0, y * world.width + x1 + 1), y * cw);
    const canvas = bitmapToCanvas(crop);
    const bg = canvas.getContext('2d')!;
    bg.globalCompositeOperation = 'destination-over';
    bg.fillStyle = '#000';
    bg.fillRect(0, 0, canvas.width, canvas.height);
    if (this.textures.exists(LEVEL_KEY)) this.textures.remove(LEVEL_KEY);
    this.textures.addCanvas(LEVEL_KEY, canvas);
    this.events.once('shutdown', () => {
      if (this.textures.exists(LEVEL_KEY)) this.textures.remove(LEVEL_KEY);
    });

    // a click anywhere plays the level ("Press mouse button to continue")
    this.add.zone(-W, -H, 3 * W, 3 * H).setOrigin(0, 0).setInteractive().on('pointerup', () => this.go());

    // the round and the level of it, as the panel of a blind
    panel(this, 40, 16, 880, 508, COLORS.panel, color, 14);
    panel(this, 56, 28, 848, 34, color, 0x000000, 8);
    label(this, 72, 45, `Round ${run.state.ante}`, { size: 24, originY: 0.5 });
    label(this, W / 2, 45, blind ? BLIND_NAMES[blind.kind] : '', { size: 32, originX: 0.5, originY: 0.5 });
    const reward = blind ? BLIND_REWARDS[blind.kind] : 0;
    label(this, 888, 45, `Reward ${'$'.repeat(reward)}+`, { size: 24, color: COLORS.gold, originX: 1, originY: 0.5 });
    // (as wide as the panel allows, as high as 150 pixels: a narrow level is not drawn bigger than the room)
    const s = Math.min(848 / cw, 150 / world.height);
    const ph = Math.round(world.height * s);
    const pw = Math.round(cw * s);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 1);
    g.fillRect(W / 2 - pw / 2 - 4, 74, pw + 8, ph + 8);
    g.lineStyle(2, COLORS.panelLight, 1);
    g.strokeRect(W / 2 - pw / 2 - 4, 74, pw + 8, ph + 8);
    this.add.image(W / 2 - pw / 2, 78, LEVEL_KEY).setOrigin(0, 0).setDisplaySize(pw, ph);

    // Level 5: You need bashers this time
    // Fun 4: Now use miners and climbers (the level of Lemmings; "Level 1" above is the level of the round)
    const ty = 244;
    label(this, W / 2, ty + 14, `${info.section.sectionName} ${info.levelIndex + 1}`, { size: 48, originX: 0.5, originY: 0.5 });
    label(this, W / 2, ty + 52, delphiTrim(li.title), { size: 24, color: COLORS.lilac, originX: 0.5, originY: 0.5 });

    // the numbers of the preview of Lemmings, as the boxes of Balatro
    const pct = li.lemmingsCount > 0 ? Math.round((li.rescueCount * 100) / li.lemmingsCount) : 0;
    const boxes: [string, string, number][] = [
      ['Lemmings', String(li.lemmingsCount), COLORS.blue],
      ['To be saved', `${li.rescueCount} (${pct}%)`, COLORS.red],
      ['Release rate', String(li.releaseRate), COLORS.green],
      ['Time', `${li.timeLimit}:00`, COLORS.gold],
    ];
    const by = ty + 74;
    const bw = 196;
    boxes.forEach(([name, value, c], i) => {
      const bx = W / 2 - (boxes.length * (bw + 12) - 12) / 2 + i * (bw + 12);
      panel(this, bx, by, bw, 74, COLORS.panelLight, COLORS.panelLight, 8);
      label(this, bx + bw / 2, by + 13, name, { originX: 0.5, originY: 0.5 });
      const well = this.add.graphics();
      well.fillStyle(COLORS.dark, 1);
      well.fillRoundedRect(bx + 6, by + 26, bw - 12, 42, 6);
      const t = label(this, bx + bw / 2, by + 47, value, { size: 32, color: c, originX: 0.5, originY: 0.5 });
      if (t.width > bw - 20) t.setScale((bw - 20) / t.width);
    });

    // the skills the squad brings, as on the skill panel
    const sy = by + 88;
    const sk = run.state.setup?.usable;
    label(this, 64, sy + 18, 'Skills', { color: COLORS.dim, originY: 0.5 });
    SKILLS.forEach((skill, i) => {
      const sx = 160 + i * 66;
      const n = sk ? sk[skill] : 0;
      const icon = this.add.image(sx, sy, SKILL_ICONS, skill).setOrigin(0, 0).setScale(1.5);
      if (n === 0) icon.setAlpha(0.35);
      label(this, sx + 26, sy + 18, String(n), { size: 24, color: n > 0 ? COLORS.text : COLORS.dim, originY: 0.5 });
    });

    // Let's go, or back to the levels
    this.spots.go = { x: 805, y: 486 };
    new Button(this, 710, 464, 190, 44, "Let's go!", COLORS.orange, () => this.go(), { big: true });
    this.spots.back = { x: 120, y: 486 };
    new Button(this, 60, 470, 120, 32, 'Back', COLORS.gray, () => this.back());
    label(this, W / 2, 486, touch.active ? 'Tap to continue' : 'Press mouse button to continue', { color: COLORS.dim, originX: 0.5, originY: 0.5 });
    lemmingSprite(this, 682, 494, 'walk', 2);

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    listen(this, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.go();
      else if (e.key === 'Escape') this.back();
    });
  }

  private layout(): void {
    const ins = safeAreaInsets();
    const w = this.scale.width - ins.left - ins.right;
    const h = this.scale.height - ins.top - ins.bottom;
    const f = Math.min(w / W, h / H);
    const cam = this.cameras.main;
    cam.setViewport(ins.left, ins.top, w, h);
    cam.setZoom(f);
    cam.centerOn(W / 2, H / 2);
    this.swirl.cover(W / 2 - w / f / 2, H / 2 - h / f / 2, w / f, h / f);
  }

  private go(): void {
    if (this.closed) return;
    this.closed = true;
    gotoScreen(this, ScreenType.Play);
  }

  private back(): void {
    if (this.closed) return;
    this.closed = true;
    this.app.run?.abandonAttempt();
    gotoScreen(this, ScreenType.Run);
  }
}
