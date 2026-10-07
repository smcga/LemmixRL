/**
 * The roguelike screens around the levels: the blinds of the ante, the result of an attempt, the cash out, the shop,
 * the colony, and the end of a run. The levels themselves are played by the original screens (preview, game,
 * postview). Everything is laid out on a 960 x 540 screen that is scaled to the window.
 *
 * The screen is the one of Balatro: the column on the left (what is going on, the abilities, Run Info and Options,
 * the money, the ante and the round), the jokers and the tarots along the top, the colony as the deck in the corner,
 * and in the middle the blinds, the cash out or the shop coming up from below. The cards are handled as in Balatro on
 * a phone (see ui/cards.ts): tap a card for what it is and its buttons, or drag it to where it should go.
 */
import * as Phaser from 'phaser';
import { SoundEffect } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { type RunLevel, levelName } from '../run/catalog.ts';
import { EDITION_NAMES, EDITION_TEXTS, FATE_TEXTS, type Fate, isDeath, JOKERS, jokerDef, type Rarity, tagDef, tarotDef } from '../run/content.ts';
import { normalizeSeed, randomSeed } from '../run/rng.ts';
import { type BlindPreview, cardTitle, isSpecial, RunSession, sellPrice, tarotSellPrice } from '../run/session.ts';
import { describeSkills, SKILL_NAMES, SKILL_PLURALS, SKILLS, type Skill, totalSkills } from '../run/skills.ts';
import { ABILITY_CAP, ANTES, ATTEMPTS, BLIND_NAMES, type BlindKind, HIRE_PRICE, JOKER_SLOTS, type LemmingCard, type ShopOffer, TAROT_SLOTS } from '../run/state.ts';
import { loadMeta, loadRun, recordLevel, saveMeta, saveRun } from '../run/storage.ts';
import { BACKGROUND, ensureRunAssets, type LemmingAnim, lemmingSprite, levelImage, levelThumbnail, SKILL_ICONS } from '../run/ui/assets.ts';
import { type Art, CARD_H, CARD_W, type CardBehaviour, CardTable, CardView, type DropTarget, inRect, type Rect } from '../run/ui/cards.ts';
import { Button, type ButtonOptions, COLORS, hoverTip, label, panel, showTip, type TipContent, Tooltip } from '../run/ui/widgets.ts';
import { cssPx, onTouchChange, safeAreaInsets, touch } from '../touch.ts';
import { ScreenType } from '../screens/base.ts';
import { getApp, gotoScreen, listen } from './shared.ts';

const W = 960;
const H = 540;
/** the column on the left */
const SIDE_X = 6;
const SIDE_W = 200;
/** the middle of the screen: from the column to the deck, below the jokers */
const MAIN_X = 214;
const MAIN_Y = 126;
const MAIN_R = 872;
/** the right edge of the screen (the ability assignment uses the room of the deck too) */
const FULL_R = 954;
/** where the jokers and the tarots lie, and the colony (the middle of its pile) */
const JOKER_AREA: Rect = { x: 214, y: 6, w: 506, h: 100 };
const TAROT_AREA: Rect = { x: 728, y: 6, w: 226, h: 100 };
const DECK = { x: 917, y: 466 };
/** the areas a dragged card is dropped on: over the jokers and the tarots to buy, over the other row to sell, above the deck to use */
const BUY_ZONE: Rect = { x: 214, y: 4, w: 740, h: 118 };
const SELL_JOKER_ZONE: Rect = { x: 728, y: 4, w: 226, h: 118 };
const SELL_TAROT_ZONE: Rect = { x: 214, y: 4, w: 506, h: 118 };
const USE_ZONE: Rect = { x: 880, y: 130, w: 74, h: 280 };
/** the bar of points of the assignment screen: where it starts in the panel, and the width of a point */
const ASSIGN_BAR_X = 134;
const ASSIGN_SEG = 8;
/** the first row of the assignment screen (from the top of the panel), and the height of a row */
const ASSIGN_ROW_Y = 104;
const ASSIGN_ROW_H = 29;

const BLIND_COLORS: Record<BlindKind, number> = { small: COLORS.blue, big: COLORS.orange, boss: COLORS.red };
const RARITY_COLORS: Record<Rarity, number> = { common: COLORS.blue, uncommon: COLORS.green, rare: COLORS.red };
const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare' };
/** the rock behind the screens, in the colour of what is going on */
const BACKDROPS: Record<string, number> = { assign: 0x4fa8a0, blinds: 0x58a070, shop: 0xb8705c, result: 0x7088b0, cashout: 0xc0a050, over: 0x8a7a8a };

const JOKER_ART: Record<string, Art> = {
  toolkit: { anim: 'build' },
  smuggler: { anim: 'bash' },
  overtime: { text: '+1:00', color: COLORS.gold },
  ladder: { anim: 'climb' },
  umbrellas: { anim: 'float' },
  hardhat: { anim: 'block' },
  disposal: { anim: 'ohno' },
  shelter: { icon: 'nuke' },
  lifeguard: { anim: 'drown' },
  crashmats: { anim: 'splat' },
  scout: { anim: 'walk' },
  unionrep: { anim: 'shrug' },
  nolem: { anim: 'exit' },
  piggy: { text: '$$', color: COLORS.gold },
  speedrun: { anim: 'fall' },
  minimalist: { anim: 'shrug', tint: 0xb0e0ff },
  headcount: { anim: 'walkLeft' },
  guild: { icon: 'builder' },
  demolition: { icon: 'basher' },
  climbclub: { icon: 'climber' },
  bombsquad: { icon: 'bomber' },
  trainer: { text: '+5', color: COLORS.teal },
  advisor: { anim: 'walkLeft', tint: 0x9fd0ff },
};

const TAROT_ART: Record<string, Art> = {
  umbrella: { icon: 'floater' },
  gear: { icon: 'climber' },
  midas: { anim: 'walk', tint: COLORS.gold },
  clover: { anim: 'walk', tint: 0x7dff7d },
  mentor: { anim: 'build', tint: 0x9fd0ff },
  policy: { anim: 'block', tint: 0xffd0a0 },
  manual: { icon: 'builder' },
  conscription: { anim: 'walkLeft', tint: 0xff9090 },
  vat: { anim: 'walk', tint: 0xd0a0ff },
  hermit: { text: 'x2', color: COLORS.gold },
  laurel: { anim: 'exit', tint: 0xd090ff },
  recruiter: { anim: 'walk' },
  bootcamp: { anim: 'climb', tint: 0x7dd0ff },
  rethink: { anim: 'shrug', tint: 0xd0a0ff },
};

const EDITION_TINTS: Record<string, number> = { plain: 0xffffff, gold: COLORS.gold, lucky: 0x7dff7d, mentor: 0x9fd0ff, champion: 0xd090ff };

const FATE_ANIMS: Partial<Record<Fate, LemmingAnim>> = {
  saved: 'exit',
  alive: 'walk',
  splat: 'splat',
  drowned: 'drown',
  burned: 'fry',
  bombed: 'ohno',
  nuked: 'ohno',
  exploded: 'ohno',
  trapped: 'shrug',
  fell: 'fall',
};

/** a tarot that is used: one of the player's, or one of the shop that is bought for it */
type TarotUse = { uid?: number; offer?: number; max: number; name: string };

/** What the team lacks for a level: the skills it brings fewer of than the level has, the biggest gap named. */
function shortSummary(p: BlindPreview): { text: string; color: number } {
  const short: { gap: number; text: string }[] = [];
  for (const sk of SKILLS) {
    const gap = p.allocation[sk] + p.aboveMax[sk] - p.usable[sk];
    if (gap > 0) short.push({ gap, text: `${gap} ${gap === 1 ? SKILL_NAMES[sk] : SKILL_PLURALS[sk]}` });
  }
  short.sort((a, b) => b.gap - a.gap);
  if (short.length === 0) return { text: 'You bring every skill it has', color: COLORS.green };
  return { text: short.length === 1 ? `Short of ${short[0].text}` : `Short in ${short.length} skills, most: ${short[0].text}`, color: COLORS.orange };
}

/** The level band names of an ante. */
function bandName(run: RunSession): string {
  const levels = run.state.blinds.map((b) => run.level(b.levelId));
  const names = [...new Set(levels.map((l) => l.sectionName))];
  return names.join(' / ');
}

function minutes(m: number): string {
  return `${m}:00`;
}

export class RunScene extends Phaser.Scene {
  private app!: LemmixApp;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tip!: Tooltip;
  private table!: CardTable;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private toastObj: Phaser.GameObjects.GameObject[] = [];
  /** the screen when there is no run: start a new one or continue */
  private choosing = false;
  /** a render is due on the next frame */
  private renderQueued = false;
  /** what closing the overlay also undoes (the texture of a level preview) */
  private overlayCleanup: (() => void)[] = [];
  /** the level preview: its first column in the window, and scrolling it (keys) */
  private previewSx = 0;
  private previewPan: ((d: number) => void) | null = null;
  /** where things are on the screen, by name: the middle of the buttons and cards (for the tests) */
  private spots: Record<string, { x: number; y: number }> = {};
  /** what the middle of the screen showed last: when it changes, the new one comes up from below */
  private shown = '';
  private shownMoney: number | null = null;

  constructor() {
    super('run');
  }

  private get run(): RunSession | null {
    return this.app.run;
  }

  create(): void {
    this.app = getApp();
    this.objs = [];
    this.overlay = [];
    this.toastObj = [];
    this.spots = {};
    this.shown = '';
    this.shownMoney = null;
    ensureRunAssets(this, this.app);
    this.tip = new Tooltip(this);
    this.table = new CardTable(this, this.tip, (name, x, y) => this.spot(name, x, y));
    this.app.enterRunMode();
    const run = this.run;
    if (run && run.state.phase === 'playing') run.abandonAttempt();
    this.choosing = !run;
    this.layout();
    this.scale.on('resize', this.layout, this);
    const offTouch = onTouchChange(() => this.layout());
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      offTouch();
      for (const o of this.portraitCover) o.destroy();
      this.portraitCover = [];
    });
    listen(this, 'keydown', (e) => this.onKey(e));
    // touch: a tap on nothing closes a tooltip
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (touch.active && over.length === 0) this.tip.hide();
    });
    this.render();
  }

  private layout(): void {
    // the camera shows the safe area of the screen: not under a notch, a rounded corner or the home indicator
    const ins = safeAreaInsets();
    const w = this.scale.width - ins.left - ins.right;
    const h = this.scale.height - ins.top - ins.bottom;
    const f = Math.min(w / W, h / H);
    // whole pixels on a desktop screen; on a phone the screen is filled (its pixels are too small to see the difference)
    const z = f >= 1 && !touch.active ? Math.floor(f) : f;
    const cam = this.cameras.main;
    cam.setViewport(ins.left, ins.top, w, h);
    cam.setZoom(z);
    cam.centerOn(W / 2, H / 2);
    this.updatePortraitCover();
  }

  /** a phone held upright: the run screens need it sideways (they are as wide as a computer screen) */
  private portraitCover: Phaser.GameObjects.GameObject[] = [];

  private updatePortraitCover(): void {
    for (const o of this.portraitCover) o.destroy();
    this.portraitCover = [];
    if (!touch.active || this.scale.width >= this.scale.height) return;
    // over everything the main camera shows, in its world coordinates
    const cam = this.cameras.main;
    const zoom = cam.zoom;
    const vw = cam.width / zoom;
    const vh = cam.height / zoom;
    const cx = W / 2;
    const cy = H / 2;
    const u = cssPx(1) / zoom; // a CSS pixel in world units
    const bg = this.add.rectangle(cx - vw / 2, cy - vh / 2, vw, vh, 0x05050c, 1).setOrigin(0, 0).setInteractive();
    const t = label(this, cx, cy - 40 * u, 'Turn your phone sideways', { size: 22 * u, big: true, originX: 0.5, originY: 0.5, color: COLORS.gold });
    if (t.width > vw * 0.9) t.setFontSize((t.fontSize * vw * 0.9) / t.width);
    const t2 = label(this, cx, cy, 'the run screens need the room', { size: 16 * u, originX: 0.5, originY: 0.5, color: COLORS.dim });
    const sp = lemmingSprite(this, cx, cy + 50 * u, 'walk', 3 * u);
    this.portraitCover = [bg, t, t2, sp];
    for (const o of [bg, t, t2, sp]) o.setDepth(5000);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.overlay.length) this.closeOverlay();
      else this.toMenu();
    } else if (this.previewPan && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) this.previewPan(e.key === 'ArrowLeft' ? -48 : 48);
  }

  private toMenu(): void {
    this.save();
    this.app.leaveRunMode();
    gotoScreen(this, ScreenType.Menu);
  }

  private save(): void {
    saveRun(this.run?.state ?? null);
  }

  private sfx(e: SoundEffect): void {
    this.app.sound.playSound(e);
  }

  /**
   * Touch: the first tap on a small thing that costs money (hiring a skill) shows what it is, the second tap does it.
   * Returns true when the action goes ahead (always with the mouse).
   */
  private confirmTap(owner: object, content: TipContent, hint: string): boolean {
    if (!touch.active) return true;
    if (this.tip.owner === owner) {
      this.tip.hide();
      return true;
    }
    showTip(this.tip, { ...content, lines: [...content.lines, '', hint] }, owner);
    return false;
  }

  /** keeps a game object for the next clear */
  private k<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private spot(name: string, x: number, y: number): void {
    this.spots[name] = { x, y };
  }

  /** a button with a name (see spots) */
  private btn(name: string, x: number, y: number, w: number, h: number, caption: string, color: number, onClick: () => void, o: ButtonOptions = {}): Button {
    this.spot(name, x + w / 2, y + h / 2);
    return this.k(new Button(this, x, y, w, h, caption, color, onClick, o));
  }

  /** a dark rounded box, the inside of a panel */
  private well(x: number, y: number, w: number, h: number, color: number = COLORS.dark, alpha = 1, radius = 8): Phaser.GameObjects.Graphics {
    const g = this.k(this.add.graphics());
    g.fillStyle(color, alpha);
    g.fillRoundedRect(x, y, w, h, radius);
    return g;
  }

  private clear(): void {
    this.tip.hide();
    this.table.clear();
    this.tweens.killTweensOf(this.objs);
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.spots = {};
    this.closeOverlay();
  }

  /** Builds the screen of the current phase. */
  private render(): void {
    this.clear();
    const run = this.run;
    const phase = this.choosing || !run ? 'start' : run.state.phase === 'playing' ? 'blinds' : run.state.phase;
    // background: the brown rock of the DOS screens, in the colour of the phase, drifting slowly
    const rock = this.k(this.add.tileSprite(0, 0, W, H, BACKGROUND).setOrigin(0, 0).setTint(BACKDROPS[phase] ?? 0x8a7a8a));
    rock.tilePositionX = (this.time.now / 90) % 4096;
    this.tweens.add({ targets: rock, tilePositionX: rock.tilePositionX + 4096, tilePositionY: 1024, duration: 360000, repeat: -1 });
    this.k(this.add.rectangle(0, 0, W, H, 0x101820, 0.3).setOrigin(0, 0));
    if (this.choosing || !run) {
      this.renderStart();
      this.shown = 'start';
      return;
    }
    this.renderSidebar(run);
    this.renderTopAreas(run);
    if (phase !== 'assign') this.renderDeck(run);
    const first = this.objs.length;
    switch (phase) {
      case 'assign':
        this.renderAssign(run);
        break;
      case 'blinds':
        this.renderBlinds(run);
        break;
      case 'result':
        this.renderResult(run);
        break;
      case 'cashout':
        this.renderCashout(run);
        break;
      case 'shop':
        this.renderShop(run);
        break;
      case 'over':
        this.renderOver(run);
        break;
    }
    // what is new in the middle of the screen comes up from below, as the shop and the blinds of Balatro do
    const key = `${phase}:${run.state.ante}`;
    if (key !== this.shown) {
      this.shown = key;
      for (const o of this.objs.slice(first)) {
        const t = o as unknown as { y: number };
        const y = t.y;
        t.y = y + 440;
        this.tweens.add({ targets: o, y, duration: 380, ease: 'Back.easeOut', easeParams: [0.7] });
      }
    }
  }

  /* -------------------------------------------------------------------------------------------- start */

  private renderStart(): void {
    const saved = loadRun();
    const meta = loadMeta();
    const k = this.k.bind(this);
    k(panel(this, 180, 40, 600, 460, COLORS.panel, COLORS.panelLight, 12));
    k(label(this, W / 2, 72, 'Lemmings', { size: 48, purple: true, originX: 0.5 }));
    k(label(this, W / 2, 128, 'the roguelike run', { size: 16, color: COLORS.gold, originX: 0.5 }));
    const text = [
      'Eight antes of three blinds each: original levels from Fun to Mayhem. Your lemmings are your deck: the ones that die are gone for good, the ones that survive come with you. Rescue lemmings to earn money, then spend it on recruits, training, jokers and tarots.',
      '',
      'Your abilities: 60 points to spread over the eight skills (at most 20 in one), some of them moved after every boss. In a level you have min(your ability, the allocation of the level) of every skill. The level itself is the original: the same terrain, traps, release rate, timer and rescue requirement.',
    ];
    k(label(this, 212, 168, text.join('\n'), { color: COLORS.text, maxWidth: 536 }));
    for (let i = 0; i < 6; i++) k(lemmingSprite(this, 230 + i * 100, 372, i % 2 ? 'walkLeft' : 'walk', 2));
    const seed = randomSeed();
    const y = 410;
    if (saved) {
      const s = saved;
      this.btn('continue', 210, y, 260, 52, 'Continue run', COLORS.blue, () => this.continueRun(s), { sub: `Ante ${s.ante}, $${s.money}, ${s.colony.length} lemmings` });
      this.btn('newRun', 490, y, 260, 52, 'New run', COLORS.red, () => this.newRun(seed), { sub: `seed ${seed}` });
    } else this.btn('newRun', 350, y, 260, 52, 'New run', COLORS.red, () => this.newRun(seed), { sub: `seed ${seed}` });
    this.btn('seed', 210, 470, 120, 24, 'Seed...', COLORS.gray, () => this.askSeed());
    this.btn('menu', 630, 470, 120, 24, 'Menu', COLORS.gray, () => this.toMenu());
    if (meta.runs > 0) k(label(this, W / 2, 476, `Runs ${meta.runs}  Won ${meta.wins}  Best ante ${meta.bestAnte}`, { color: COLORS.dim, originX: 0.5 }));
  }

  private askSeed(): void {
    const s = normalizeSeed(window.prompt('Seed (up to 8 letters and digits):', '') ?? '');
    if (s) this.newRun(s);
  }

  private newRun(seed: string): void {
    const run = RunSession.newRun(this.app.runCatalog(), seed);
    this.app.run = run;
    const meta = loadMeta();
    meta.runs++;
    meta.bestAnte = Math.max(meta.bestAnte, 1);
    saveMeta(meta);
    this.choosing = false;
    this.shownMoney = null;
    this.sfx(SoundEffect.LetsGo);
    this.save();
    this.render();
  }

  private continueRun(state: ReturnType<typeof loadRun>): void {
    if (!state) return;
    this.app.run = new RunSession(this.app.runCatalog(), state);
    if (state.phase === 'playing') this.app.run.abandonAttempt();
    this.choosing = false;
    this.render();
  }

  /* -------------------------------------------------------------------------------------------- the column on the left */

  private renderSidebar(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const x = SIDE_X;
    const w = SIDE_W;
    k(panel(this, x, 6, w, 528, COLORS.panel, COLORS.panelLight, 10));

    // what is going on: the blind that is played, the shop, or what to do
    const setup = s.setup;
    const played = setup && (s.phase === 'result' || s.phase === 'cashout') ? s.blinds[setup.blind] : null;
    if (played && setup) {
      const l = run.level(setup.levelId);
      k(panel(this, x + 6, 12, w - 12, 84, BLIND_COLORS[played.kind], 0x000000, 8));
      k(label(this, x + w / 2, 30, BLIND_NAMES[played.kind], { big: true, originX: 0.5, originY: 0.5 }));
      k(label(this, x + w / 2, 54, levelName(l), { originX: 0.5, originY: 0.5 }));
      k(label(this, x + w / 2, 76, `Attempt ${setup.attempts}`, { originX: 0.5, originY: 0.5 }));
    } else if (s.phase === 'shop') {
      this.well(x + 6, 12, w - 12, 84);
      k(label(this, x + w / 2, 42, 'SHOP', { size: 32, big: true, color: COLORS.red, originX: 0.5, originY: 0.5 }));
      k(label(this, x + w / 2, 76, 'Improve your colony!', { color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    } else {
      const title: Record<string, string> = { assign: 'Assign your\nabilities', blinds: 'Choose your\nnext Blind', playing: 'Choose your\nnext Blind', over: s.won ? 'You won!' : 'Run over' };
      const color = s.phase === 'assign' ? COLORS.teal : s.phase === 'over' ? (s.won ? COLORS.gold : COLORS.red) : COLORS.text;
      this.well(x + 6, 12, w - 12, 84);
      k(label(this, x + w / 2, 54, title[s.phase] ?? '', { big: true, color, originX: 0.5, originY: 0.5, align: 1 }));
    }

    // the colony, where Balatro has the score of the round
    k(label(this, x + 14, 124, 'Colony', { originY: 0.5 }));
    this.well(x + 76, 104, w - 82, 40);
    k(lemmingSprite(this, x + 94, 124, 'walk', 2));
    k(label(this, x + 112, 124, String(s.colony.length), { size: 32, big: true, originY: 0.5 }));
    const specials = run.specialCards().length;
    const colonyZone = k(this.add.zone(x + 6, 102, w - 12, 44).setOrigin(0, 0).setInteractive());
    hoverTip(colonyZone, this.tip, () => ({
      title: 'Your colony',
      color: COLORS.purple,
      lines: [`${s.colony.length} lemmings, ${specials ? `${specials} of them special:` : 'all of them plain.'}`, ...(specials ? [this.specialCounts(s.colony)] : []), '', 'The pile in the corner shows them all.'],
      x: x + w + 6,
      y: 100,
    }));

    // the abilities, where Balatro has the hand that is played
    this.well(x + 6, 150, w - 12, 140);
    k(label(this, x + 14, 156, 'Abilities', { color: COLORS.dim }));
    k(label(this, x + w - 14, 156, bandName(run), { color: COLORS.dim, originX: 1 }));
    const cap = run.capability();
    SKILLS.forEach((sk, i) => {
      const cx = x + 12 + (i % 4) * 46;
      const cy = 178 + Math.floor(i / 4) * 54;
      const icon = k(this.add.image(cx, cy, SKILL_ICONS, sk).setOrigin(0, 0).setScale(1.5));
      k(label(this, cx + 24, cy + 18, String(cap[sk]), { color: cap[sk] > 0 ? COLORS.text : COLORS.dim }));
      icon.setInteractive();
      hoverTip(icon, this.tip, () => ({
        title: SKILL_PLURALS[sk],
        color: COLORS.teal,
        lines: [
          `You can bring up to ${cap[sk]} ${SKILL_PLURALS[sk].toLowerCase()} to a level`,
          '(never more than the level allows).',
          ...(cap[sk] > s.capacity[sk] ? [`${s.capacity[sk]} of your own, +${cap[sk] - s.capacity[sk]} from jokers.`] : []),
        ],
        x: x + w + 6,
        y: cy,
      }));
    });

    // Run Info and Options; the attempts and the lemmings lost; the money; the ante and the round
    this.btn('runInfo', x + 6, 298, 82, 112, 'Run\nInfo', COLORS.red, () => this.showRunInfo(run), { big: true });
    this.btn('options', x + 6, 418, 82, 110, 'Options', COLORS.orange, () => this.showOptions(run));
    const rx = x + 94;
    const box = (bx: number, by: number, bw: number, bh: number, name: string, value: string, color: number, big = true) => {
      k(panel(this, bx, by, bw, bh, COLORS.panelLight, COLORS.panelLight, 6));
      k(label(this, bx + bw / 2, by + 11, name, { originX: 0.5, originY: 0.5 }));
      this.well(bx + 4, by + 22, bw - 8, bh - 26, COLORS.dark, 1, 5);
      const t = k(label(this, bx + bw / 2, by + 22 + (bh - 26) / 2, value, { size: 32, big, color, originX: 0.5, originY: 0.5 }));
      if (t.width > bw - 12) t.setScale((bw - 12) / t.width);
      return t;
    };
    const tries = Math.max(0, ATTEMPTS - (setup?.attempts ?? 0));
    const triesBox = k(this.add.zone(rx, 298, 48, 72).setOrigin(0, 0).setInteractive());
    box(rx, 298, 48, 72, 'Tries', String(tries), COLORS.blue);
    hoverTip(triesBox, this.tip, () => ({
      title: 'Attempts',
      color: COLORS.blue,
      lines: [`Three attempts per blind are paid: $1 for each one you do not need. You can always retry.`],
      x: x + w + 6,
      y: 298,
    }));
    box(rx + 52, 298, 48, 72, 'Lost', String(s.stats.lost), COLORS.red);
    k(panel(this, rx, 376, 100, 72, COLORS.panelLight, COLORS.panelLight, 6));
    this.well(rx + 4, 380, 92, 64, COLORS.dark, 1, 5);
    const money = k(label(this, rx + 50, 412, `$${s.money}`, { size: 32, big: true, color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    if (money.width > 86) money.setScale(86 / money.width);
    if (this.shownMoney !== null && this.shownMoney !== s.money) {
      const to = money.scale;
      money.setScale(to * 1.35);
      this.tweens.add({ targets: money, scale: to, duration: 260, ease: 'Back.easeOut' });
    }
    this.shownMoney = s.money;
    box(rx, 454, 48, 74, 'Ante', `${Math.min(s.ante, ANTES)}/${ANTES}`, COLORS.orange, false);
    box(rx + 52, 454, 48, 74, 'Round', String(s.stats.blindsWon + (s.phase === 'over' || s.phase === 'cashout' || s.phase === 'shop' ? 0 : 1)), COLORS.orange);
  }

  private specialCounts(colony: LemmingCard[]): string {
    const n = { gold: 0, lucky: 0, mentor: 0, champion: 0, climber: 0, floater: 0, insured: 0 };
    for (const c of colony) {
      if (c.edition !== 'plain') n[c.edition]++;
      if (c.climber) n.climber++;
      if (c.floater) n.floater++;
      if (c.insured) n.insured++;
    }
    const parts: string[] = [];
    if (n.gold) parts.push(`${n.gold} Gold`);
    if (n.lucky) parts.push(`${n.lucky} Lucky`);
    if (n.mentor) parts.push(`${n.mentor} Mentor`);
    if (n.champion) parts.push(`${n.champion} Champion`);
    if (n.climber) parts.push(`${n.climber} Climber${n.climber > 1 ? 's' : ''}`);
    if (n.floater) parts.push(`${n.floater} Floater${n.floater > 1 ? 's' : ''}`);
    if (n.insured) parts.push(`${n.insured} Insured`);
    return parts.join(', ');
  }

  /** Run Info: the blinds of the ante, the abilities and the numbers of the run. */
  private showRunInfo(run: RunSession): void {
    const o = this.openOverlay();
    const s = run.state;
    o(panel(this, 200, 50, 560, 440, COLORS.panel, COLORS.panelLight, 12));
    o(label(this, 480, 74, 'Run Info', { size: 32, big: true, originX: 0.5, originY: 0.5 }));
    o(label(this, 224, 104, `Ante ${Math.min(s.ante, ANTES)} of ${ANTES}: ${bandName(run)}`, { color: COLORS.orange }));
    s.blinds.forEach((b, i) => {
      const l = run.level(b.levelId);
      const y = 128 + i * 40;
      const g = o(this.add.graphics());
      g.fillStyle(COLORS.dark, 1);
      g.fillRoundedRect(224, y, 512, 34, 6);
      g.fillStyle(BLIND_COLORS[b.kind], 1);
      g.fillRoundedRect(224, y, 8, 34, 3);
      o(label(this, 240, y + 9, BLIND_NAMES[b.kind], { color: BLIND_COLORS[b.kind] }));
      o(label(this, 330, y + 9, `${levelName(l)}  ${l.title}`, { maxWidth: 300 }));
      const status = b.status === 'current' ? 'Current' : b.status === 'upcoming' ? 'Upcoming' : b.status === 'skipped' ? 'Skipped' : 'Defeated';
      o(label(this, 728, y + 9, status, { color: b.status === 'current' ? COLORS.gold : COLORS.dim, originX: 1 }));
    });
    const cap = run.capability();
    o(label(this, 224, 258, 'Abilities', { color: COLORS.dim }));
    SKILLS.forEach((sk, i) => {
      const x = 224 + i * 64;
      o(this.add.image(x, 280, SKILL_ICONS, sk).setOrigin(0, 0).setScale(1.5));
      o(label(this, x + 26, 290, String(cap[sk]), { color: cap[sk] > 0 ? COLORS.text : COLORS.dim }));
      if (cap[sk] > s.capacity[sk]) o(label(this, x + 26, 306, `+${cap[sk] - s.capacity[sk]}`, { color: COLORS.teal }));
    });
    const st = s.stats;
    const tags = s.pendingTags.map((t) => tagDef(t).name);
    const lines = [
      `Blinds won ${st.blindsWon}, skipped ${st.skipped}, attempts ${st.attempts}`,
      `Lemmings saved ${st.saved}, lost ${st.lost}, colony ${s.colony.length}`,
      `Money earned $${st.earned}`,
      ...(tags.length ? [`Tags waiting: ${tags.join(', ')}`] : []),
      `Seed ${s.seed}`,
    ];
    o(label(this, 224, 336, lines.join('\n'), { color: COLORS.text, maxWidth: 512 }));
    this.spot('back', 480, 465);
    o(new Button(this, 380, 450, 200, 30, 'Back', COLORS.orange, () => this.closeOverlay()));
  }

  /** Options: back to the menu of Lemmix, or the end of the run. */
  private showOptions(run: RunSession): void {
    const o = this.openOverlay();
    o(panel(this, 340, 130, 280, 280, COLORS.panel, COLORS.panelLight, 12));
    o(label(this, 480, 156, 'Options', { size: 32, big: true, originX: 0.5, originY: 0.5 }));
    o(new Button(this, 364, 190, 232, 40, 'Main menu', COLORS.blue, () => this.toMenu(), { sub: 'the run is saved' }));
    if (run.state.phase !== 'over')
      o(
        new Button(this, 364, 244, 232, 40, 'Give up the run', COLORS.red, () => {
          if (window.confirm('Give up this run?')) this.finishRun(false);
        }),
      );
    o(label(this, 480, 312, `Seed ${run.state.seed}`, { color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    o(label(this, 480, 334, touch.active ? 'The run is saved as you go' : 'Esc: menu, the run is saved', { color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    this.spot('back', 480, 379);
    o(new Button(this, 364, 364, 232, 30, 'Back', COLORS.orange, () => this.closeOverlay()));
  }

  /* -------------------------------------------------------------------------------------------- jokers, tarots, the deck */

  /** where the cards of a row lie: next to each other in the middle of the area, closer together when it is full */
  private slots(area: Rect, n: number): number[] {
    const pitch = n > 1 ? Math.min(CARD_W + 8, (area.w - 16 - CARD_W) / (n - 1)) : 0;
    const x0 = area.x + area.w / 2 - (pitch * (n - 1)) / 2;
    return Array.from({ length: n }, (_, i) => Math.round(x0 + i * pitch));
  }

  private renderTopAreas(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    for (const a of [JOKER_AREA, TAROT_AREA]) {
      const g = this.well(a.x, a.y, a.w, a.h, 0x000000, 0.36, 10);
      g.lineStyle(2, 0xffffff, 0.1);
      g.strokeRoundedRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2, 10);
    }
    k(label(this, JOKER_AREA.x + 6, 108, `${s.jokers.length}/${JOKER_SLOTS}`, { color: COLORS.text }));
    k(label(this, TAROT_AREA.x + TAROT_AREA.w - 6, 108, `${s.tarots.length}/${TAROT_SLOTS}`, { color: COLORS.text, originX: 1 }));
    const cy = JOKER_AREA.y + JOKER_AREA.h / 2;
    const canSell = s.phase !== 'over';

    const jx = this.slots(JOKER_AREA, s.jokers.length);
    s.jokers.forEach((j, i) => {
      const d = jokerDef(j.id);
      const sell = () => {
        if (!run.sellJoker(j.uid)) return;
        this.sfx(SoundEffect.AssignSkill);
        this.save();
        this.render();
      };
      const card = k(new CardView(this, jx[i], cy, { color: RARITY_COLORS[d.rarity], art: JOKER_ART[j.id] }));
      this.spot(`joker:${i}`, jx[i], cy);
      this.table.add(card, {
        tip: () => ({ title: d.name, color: RARITY_COLORS[d.rarity], lines: [d.text], badge: { text: RARITY_NAMES[d.rarity], color: RARITY_COLORS[d.rarity] } }),
        buttons: () => (canSell ? [{ label: 'SELL', sub: `$${sellPrice(j.id)}`, color: COLORS.green, side: 'right', run: sell }] : []),
        targets: () => (canSell ? [{ rect: SELL_JOKER_ZONE, color: COLORS.gold, lines: ['SELL', `$${sellPrice(j.id)}`], active: true, release: sell }] : []),
        // dropped among the jokers: it goes where it was dropped
        reorder: {
          area: { x: JOKER_AREA.x, y: 0, w: JOKER_AREA.w, h: 122 },
          drop: (x) => {
            const index = jx.filter((ox, oi) => oi !== i && ox < x).length;
            if (!run.moveJoker(j.uid, index)) return;
            this.sfx(SoundEffect.SkillButtonSelect);
            this.save();
            this.render();
          },
        },
      });
    });

    const tx = this.slots(TAROT_AREA, s.tarots.length);
    s.tarots.forEach((t, i) => {
      const d = tarotDef(t.id);
      const art = t.id === 'manual' && t.skill ? { icon: t.skill } : TAROT_ART[t.id];
      const canUse = this.tarotsUsable(run);
      const use = () => this.useTarot(run, t.uid);
      const sell = () => {
        if (!run.sellTarot(t.uid)) return;
        this.sfx(SoundEffect.AssignSkill);
        this.save();
        this.render();
      };
      const card = k(new CardView(this, tx[i], cy, { color: COLORS.purple, art }));
      this.spot(`tarot:${i}`, tx[i], cy);
      this.table.add(card, {
        tip: () => ({ title: d.name, color: COLORS.purple, lines: [t.skill && d.skillText ? d.skillText(SKILL_NAMES[t.skill]) : d.text], badge: { text: 'Tarot', color: COLORS.purple } }),
        buttons: () => [
          { label: 'USE', color: COLORS.red, side: 'below', enabled: canUse, run: use },
          { label: 'SELL', sub: `$${tarotSellPrice(t.id)}`, color: COLORS.green, side: 'right', enabled: run.canSellTarot(), run: sell },
        ],
        targets: () => [
          { rect: SELL_TAROT_ZONE, color: COLORS.gold, lines: ['SELL', `$${tarotSellPrice(t.id)}`], active: run.canSellTarot(), release: sell },
          { rect: USE_ZONE, color: COLORS.red, lines: ['USE'], active: canUse, release: use, refused: use },
        ],
      });
    });
  }

  private tarotsUsable(run: RunSession): boolean {
    const p = run.state.phase;
    return p === 'blinds' || p === 'cashout' || p === 'shop';
  }

  /** the colony as the deck of Balatro: a pile in the corner, a tap shows every lemming */
  private renderDeck(run: RunSession): void {
    const s = run.state;
    const card = this.k(new CardView(this, DECK.x, DECK.y, { color: COLORS.purple, art: { anim: 'walk' }, pile: true }));
    this.spot('deck', DECK.x, DECK.y);
    this.k(label(this, DECK.x, DECK.y + CARD_H / 2 + 14, String(s.colony.length), { originX: 0.5, originY: 0.5 }));
    this.table.add(card, {
      tip: () => ({ title: 'Your colony', color: COLORS.purple, lines: [`${s.colony.length} lemmings.`, this.specialCounts(s.colony) || 'Only plain lemmings.'], badge: { text: touch.active ? 'Tap to see them' : 'Click to see them', color: COLORS.purple } }),
      tap: () => this.showColony(null),
    });
  }

  /* -------------------------------------------------------------------------------------------- ability assignment */

  /**
   * The abilities: a row per skill (a bar of points to tap or drag, - and +), and the levels of the ante on the right
   * with what the team would bring to them as it is now.
   */
  private renderAssign(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const a = s.assign!;
    const st = run.assignment()!;
    const x = MAIN_X;
    const y = MAIN_Y;
    const w = 392;
    k(panel(this, x, y, w, 404, COLORS.panel, COLORS.teal, 12));
    k(label(this, x + 16, y + 10, 'Abilities', { size: 32, big: true, color: COLORS.teal }));
    // the counters, next to the title
    k(label(this, x + w - 16, y + 12, st.left > 0 ? `To place ${st.left}` : 'All placed', { color: st.left > 0 ? COLORS.gold : COLORS.green, originX: 1 }));
    if (a.reassign > 0) k(label(this, x + w - 16, y + 30, `Moved ${st.moved}/${a.reassign}`, { color: st.moved >= a.reassign ? COLORS.orange : COLORS.dim, originX: 1 }));
    // (the sources are "Personal Trainer: +5 points": the names are enough here)
    const from = a.sources.map((t) => t.split(':')[0]);
    const intro =
      a.reason === 'start'
        ? `Spread ${a.newPoints} points over the skills, at most ${ABILITY_CAP} in one. Below every skill of the levels on the right: what your team would bring.`
        : a.reason === 'boss'
          ? `A new ante! Move up to ${a.reassign} points to other skills${a.newPoints ? ` and place ${a.newPoints} new ones` : ''} before the shop${from.length ? ` (${from.join(', ')})` : ''}.`
          : `${from.join(', ')}: ${a.newPoints ? `place ${a.newPoints} new points` : `move up to ${a.reassign} points to other skills`}.`;
    k(label(this, x + 16, y + 50, intro, { color: COLORS.text, maxWidth: w - 32 }));

    const cap = run.capability();
    SKILLS.forEach((sk, i) => {
      const ry = y + ASSIGN_ROW_Y + i * ASSIGN_ROW_H;
      const cur = s.capacity[sk];
      const before = a.before[sk];
      const range = run.abilityRange(sk);
      const icon = k(this.add.image(x + 14, ry + 1, SKILL_ICONS, sk).setOrigin(0, 0));
      k(label(this, x + 32, ry + 6, SKILL_PLURALS[sk], { color: cur > 0 ? COLORS.text : COLORS.dim }));
      k(new Button(this, x + 100, ry, 30, 26, '-', COLORS.gray, () => this.setAbility(run, sk, cur - 1), { enabled: range.min < cur, size: 32 }));
      // the bar: a segment per point up to the cap; kept points, new ones, and the ones moved away
      const bx = x + ASSIGN_BAR_X;
      // (the middle of the first point of the bar; a point is ASSIGN_SEG wide)
      this.spot(`ability:${sk}`, bx + ASSIGN_SEG / 2, ry + 13);
      const g = k(this.add.graphics());
      for (let v = 0; v < ABILITY_CAP; v++) {
        const sx = bx + v * ASSIGN_SEG + 1;
        if (v < Math.min(cur, before)) g.fillStyle(COLORS.teal, 1);
        else if (v < cur) g.fillStyle(COLORS.gold, 1);
        else if (v < before) g.fillStyle(COLORS.red, 0.45);
        else g.fillStyle(COLORS.dark, 1);
        g.fillRect(sx, ry + 4, ASSIGN_SEG - 2, 18);
        if (v >= Math.max(cur, before)) {
          g.lineStyle(1, v < range.max ? COLORS.border : COLORS.panelLight, 1);
          g.strokeRect(sx + 0.5, ry + 4.5, ASSIGN_SEG - 3, 17);
        }
      }
      const zone = k(this.add.zone(bx, ry, ABILITY_CAP * ASSIGN_SEG, 26).setOrigin(0, 0).setInteractive());
      const pick = (p: Phaser.Input.Pointer, tap: boolean) => {
        const n = Math.max(1, Math.min(ABILITY_CAP, Math.floor((p.worldX - bx) / ASSIGN_SEG) + 1));
        // a tap on the first point when it is the only one takes it away
        this.setAbility(run, sk, tap && n === 1 && cur === 1 ? 0 : n);
      };
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => pick(p, true));
      zone.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (p.isDown) pick(p, false);
      });
      k(new Button(this, x + 298, ry, 30, 26, '+', COLORS.teal, () => this.setAbility(run, sk, cur + 1), { enabled: range.max > cur, size: 32 }));
      const value = k(label(this, x + 338, ry + 6, String(cur), { color: cur > before ? COLORS.gold : cur < before ? COLORS.red : COLORS.text }));
      if (cap[sk] > cur) k(label(this, x + 340 + value.width, ry + 6, `+${cap[sk] - cur}`, { color: COLORS.teal }));
      icon.setInteractive();
      hoverTip(icon, this.tip, () => ({
        title: `${SKILL_PLURALS[sk]}: ${cur}`,
        color: COLORS.teal,
        lines: [
          `A level gets up to ${cap[sk]} ${SKILL_PLURALS[sk].toLowerCase()} (never more than it allows).`,
          ...(cap[sk] > cur ? [`${cap[sk] - cur} of them come from jokers.`] : []),
          ...(cur !== before ? [`It had ${before} before.`] : []),
        ],
        x: x + 40,
        y: ry + 28,
      }));
    });

    const reset = () => {
      run.resetAssignment();
      this.save();
      this.render();
    };
    this.btn('reset', x + 16, y + 362, 110, 30, 'Reset', COLORS.gray, reset, { enabled: st.moved + st.added > 0 });
    const done = () => {
      if (!run.finishAssignment()) return;
      this.sfx(SoundEffect.LetsGo);
      this.save();
      this.render();
    };
    this.btn('done', x + w - 166, y + 362, 150, 30, 'Done', COLORS.orange, done, { big: true, enabled: run.canFinishAssignment() });

    // the levels of the ante, with what the team brings as it is now
    const lx = x + w + 8;
    const lw = FULL_R - lx;
    s.blinds.forEach((_, i) => this.renderAssignBlind(run, run.preview(i), lx, y + i * 137, lw, 130));
  }

  private renderAssignBlind(run: RunSession, p: BlindPreview, x: number, y: number, w: number, h: number): void {
    const k = this.k.bind(this);
    const b = p.blind;
    const l = p.level;
    const done = b.status === 'defeated' || b.status === 'skipped';
    const color = BLIND_COLORS[b.kind];
    k(panel(this, x, y, w, h, COLORS.panel, done ? COLORS.panelLight : color, 10));
    k(label(this, x + 10, y + 8, BLIND_NAMES[b.kind], { color: done ? COLORS.dim : color }));
    k(label(this, x + w - 10, y + 8, levelName(l), { purple: true, originX: 1 }));
    k(label(this, x + 10, y + 27, l.title, { color: COLORS.text, maxWidth: w - 20 }));
    k(label(this, x + 10, y + 46, `Rescue ${p.required}/${p.squad} · ${minutes(p.minutes)} · Rate ${l.releaseRate}`, { color: COLORS.dim }));
    this.skillCells(k, p, x + 10, y + 68, x - 120);
    const summary = done ? { text: b.status === 'skipped' ? 'Skipped' : 'Defeated', color: COLORS.dim } : shortSummary(p);
    k(label(this, x + 10, y + 108, summary.text, { color: summary.color }));
    if (done) k(this.add.rectangle(x, y, w, h, 0x000000, 0.4).setOrigin(0, 0));
    else this.btn(`preview:${p.index}`, x + w - 74, y + 43, 64, 20, 'Preview', COLORS.blue, () => this.showLevelPreview(run, p.index));
  }

  /** the skills of a level (its allocation, and below what the team brings), 36 pixels per skill */
  private skillCells(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, p: BlindPreview, x: number, y: number, tipX: number): void {
    SKILLS.forEach((sk, i) => {
      const cx = x + i * 36;
      const alloc = p.allocation[sk] + p.aboveMax[sk];
      const u = p.usable[sk];
      const icon = add(this.add.image(cx, y + 4, SKILL_ICONS, sk).setOrigin(0, 0));
      if (alloc === 0) icon.setAlpha(0.3);
      add(label(this, cx + 16, y, String(p.allocation[sk]) + (p.aboveMax[sk] ? `+${p.aboveMax[sk]}` : ''), { color: alloc ? COLORS.text : COLORS.dim }));
      add(label(this, cx + 16, y + 16, String(u), { color: alloc === 0 ? COLORS.dim : u >= alloc ? COLORS.green : u === 0 ? COLORS.red : COLORS.gold }));
      icon.setInteractive();
      hoverTip(icon, this.tip, () => ({
        title: SKILL_PLURALS[sk],
        color: COLORS.teal,
        lines: [`The level has ${p.allocation[sk]}${p.aboveMax[sk] ? ` (+${p.aboveMax[sk]} from jokers)` : ''}, you would bring ${u}.`],
        x: tipX,
        y: y + 36,
      }));
    });
  }

  /** Something over the screen (the colony, a level, Run Info): returns what adds a game object to it. */
  private openOverlay(dim = 0.65): <T extends Phaser.GameObjects.GameObject>(g: T) => T {
    this.closeOverlay();
    this.tip.hide();
    this.table.select(null);
    const o = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
      this.overlay.push(g);
      (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(600);
      return g;
    };
    o(this.add.rectangle(0, 0, W, H, 0x000000, dim).setOrigin(0, 0).setInteractive());
    return o;
  }

  /**
   * A level of the ante as it starts, at twice its size: drag it (or the strip of the whole level below it; or the
   * arrow keys and the mouse wheel) to look around. With its numbers and skills, and what the team would bring.
   */
  private showLevelPreview(run: RunSession, index: number): void {
    const o = this.openOverlay(0.7);
    const p = run.preview(index);
    const l = p.level;
    const color = BLIND_COLORS[p.blind.kind];
    o(panel(this, 20, 16, 920, 508, COLORS.panel, color, 12));
    const kind = o(label(this, 40, 30, BLIND_NAMES[p.blind.kind], { color }));
    const name = o(label(this, kind.x + kind.width + 12, 30, levelName(l), { purple: true }));
    o(label(this, name.x + name.width + 12, 30, l.title, { color: COLORS.text, maxWidth: 800 - name.x - name.width }));
    this.spot('close', 828 + 46, 26 + 14);
    o(new Button(this, 828, 26, 92, 28, 'Close', COLORS.orange, () => this.closeOverlay()));
    const lemmings = p.squad < l.lemmings ? `${l.lemmings} (you have ${p.squad})` : String(l.lemmings);
    o(label(this, 40, 56, `Lemmings ${lemmings} · Rescue ${p.required} · Release rate ${l.releaseRate} · Time ${minutes(p.minutes)}`, { color: COLORS.dim }));
    const meta = loadMeta().levels[l.id];
    if (meta?.fewest) o(label(this, 920, 56, `Your best: ${meta.best}%, ${totalSkills(meta.fewest)} skills`, { color: COLORS.teal, originX: 1 }));

    // the level, twice its size, in a window
    const img = levelImage(this, this.app, l);
    this.overlayCleanup.push(() => this.textures.remove(img.key));
    const S = 2;
    const vx = 36;
    const vy = 80;
    const vw = 888;
    const vh = img.height * S;
    const viewW = Math.min(img.width, vw / S); // level pixels in the window
    const inset = Math.max(0, (vw - img.width * S) / 2); // a narrow level is centred
    o(this.add.rectangle(vx - 2, vy - 2, vw + 4, vh + 4, 0x000000).setOrigin(0, 0).setStrokeStyle(2, COLORS.border));
    const pic = o(this.add.image(vx + inset, vy, img.key).setOrigin(0, 0).setScale(S));
    // the strip of the whole level, with the window on it
    const mh = 60;
    const ms = mh / img.height;
    const mw = Math.round(img.width * ms);
    const mx = Math.round(W / 2 - mw / 2);
    const my = vy + vh + 10;
    o(this.add.image(mx, my, levelThumbnail(this, this.app, l, mw, mh)).setOrigin(0, 0));
    const frame = o(this.add.graphics());
    const maxSx = Math.max(0, img.width - viewW);
    const pan = (v: number) => {
      const sx = Math.max(0, Math.min(maxSx, Math.round(v)));
      this.previewSx = sx;
      pic.setCrop(sx, 0, viewW, img.height);
      pic.x = vx + inset - sx * S;
      frame.clear();
      frame.lineStyle(2, COLORS.gold, 1);
      frame.strokeRect(mx + sx * ms, my, viewW * ms, mh);
    };
    // where the level starts (its screen position in the original)
    pan(img.start - img.x0);
    this.previewPan = (d) => pan(this.previewSx + d);
    const view = o(this.add.zone(vx, vy, vw, vh).setOrigin(0, 0).setInteractive());
    let drag: { x: number; sx: number } | null = null;
    view.on('pointerdown', (ptr: Phaser.Input.Pointer) => (drag = { x: ptr.worldX, sx: this.previewSx }));
    view.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (drag && ptr.isDown) pan(drag.sx - (ptr.worldX - drag.x) / S);
    });
    view.on('pointerup', () => (drag = null));
    view.on('wheel', (_ptr: Phaser.Input.Pointer, dx: number, dy: number) => pan(this.previewSx + (dx + dy) / S));
    const strip = o(this.add.zone(mx, my, mw, mh).setOrigin(0, 0).setInteractive());
    const jump = (ptr: Phaser.Input.Pointer) => pan((ptr.worldX - mx) / ms - viewW / 2);
    strip.on('pointerdown', jump);
    strip.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (ptr.isDown) jump(ptr);
    });

    // the skills
    const sy = my + mh + 10;
    o(label(this, 40, sy + 8, 'Skills: level / yours', { color: COLORS.dim }));
    this.skillCells(o, p, 200, sy, 200);
    const summary = shortSummary(p);
    o(label(this, 504, sy + 8, summary.text, { color: summary.color }));
  }

  /** a change of the assignment: the screen follows on the next frame (a finger may still be dragging the bar) */
  private setAbility(run: RunSession, sk: Skill, value: number): void {
    if (!run.setAbility(sk, value)) return;
    this.sfx(SoundEffect.SkillButtonSelect);
    this.save();
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.time.delayedCall(0, () => {
      this.renderQueued = false;
      this.render();
    });
  }

  /* -------------------------------------------------------------------------------------------- blinds */

  private renderBlinds(run: RunSession): void {
    // the squad of the current blind is drawn now, so you can see who comes along
    if (run.currentBlind && run.state.colony.length > 0) run.ensureSetup();
    for (let i = 0; i < 3; i++) this.renderBlind(run, run.preview(i), MAIN_X + i * 222);
  }

  /**
   * A blind, as a column that comes up from the bottom of the screen: Select on top, the level and what it asks, the
   * reward, and below it the tag for skipping it. The current blind stands a little higher than the others.
   */
  private renderBlind(run: RunSession, p: BlindPreview, x: number): void {
    const k = this.k.bind(this);
    const b = p.blind;
    const l = p.level;
    const current = b.status === 'current';
    const done = b.status === 'defeated' || b.status === 'skipped';
    const color = BLIND_COLORS[b.kind];
    const w = 214;
    const y = MAIN_Y + (current ? 0 : 12);
    k(panel(this, x, y, w, 440, COLORS.panel, current ? color : COLORS.panelLight, 10));

    // Select: play the level
    if (current) this.btn('play', x + 8, y + 8, w - 16, 28, 'Select', COLORS.orange, () => this.play(run), { big: true });
    else {
      const text = b.status === 'upcoming' ? 'Upcoming' : b.status === 'skipped' ? 'Skipped' : 'Defeated';
      k(new Button(this, x + 8, y + 8, w - 16, 28, text, COLORS.gray, () => {}, { big: true, enabled: false }));
    }
    k(panel(this, x + 8, y + 43, w - 16, 24, color, 0x000000, 6));
    k(label(this, x + w / 2, y + 55, BLIND_NAMES[b.kind], { big: true, originX: 0.5, originY: 0.5 }));
    k(label(this, x + w / 2, y + 74, levelName(l), { purple: true, originX: 0.5 }));
    k(label(this, x + w / 2, y + 92, l.title, { color: COLORS.text, originX: 0.5, maxWidth: w - 16, align: 1 }));
    const thumb = levelThumbnail(this, this.app, l, w - 16, 40);
    const pic = k(this.add.image(x + 8, y + 128, thumb).setOrigin(0, 0));
    // the picture opens the level preview
    const hint = label(this, x + w - 12, y + 165, 'Preview', { color: COLORS.text, originX: 1, originY: 1 });
    k(this.add.rectangle(hint.x - hint.width - 4, hint.y - hint.height - 1, hint.width + 6, hint.height + 2, 0x000000, 0.65).setOrigin(0, 0));
    k(hint).setDepth(1);
    pic.setInteractive({ useHandCursor: true });
    pic.on('pointerup', () => this.showLevelPreview(run, p.index));
    this.spot(`preview:${p.index}`, x + w / 2, y + 148);

    // what the level asks
    const row = (yy: number, name: string, value: string, c: number = COLORS.text) => {
      k(label(this, x + 12, yy, name, { color: COLORS.dim }));
      k(label(this, x + w - 12, yy, value, { color: c, originX: 1 }));
    };
    const mine = p.squad < l.lemmings;
    const setup = current ? run.state.setup : null;
    const squadSpecials = setup ? setup.hand.map((id) => run.card(id)).filter((c): c is LemmingCard => !!c && isSpecial(c)) : [];
    row(y + 171, 'Lemmings', mine ? `${l.lemmings}, you have ${p.squad}` : String(l.lemmings), mine ? COLORS.orange : COLORS.text);
    if (current) {
      const zone = k(this.add.zone(x + 8, y + 170, w - 16, 20).setOrigin(0, 0).setInteractive());
      hoverTip(zone, this.tip, () => ({
        title: `Your squad: ${p.squad} lemmings`,
        color: COLORS.purple,
        lines: squadSpecials.length
          ? ['Special lemmings in the squad, in the order they come out:', ...squadSpecials.slice(0, 10).map((c) => cardTitle(c)), ...(squadSpecials.length > 10 ? [`and ${squadSpecials.length - 10} more`] : [])]
          : ['Only plain lemmings in this squad.'],
        x: x + 20,
        y: y + 192,
      }));
      if (squadSpecials.length) k(label(this, x + 12 + 70, y + 171, `*${squadSpecials.length}`, { color: COLORS.purple }));
    }
    row(y + 191, 'Rescue at least', String(p.required), p.tooFewLemmings ? COLORS.red : COLORS.text);
    row(y + 211, 'Time', minutes(p.minutes), p.minutes > l.time ? COLORS.green : COLORS.text);
    row(y + 231, 'Release rate', String(l.releaseRate));

    // skills: the level's allocation and what you bring (min(abilities, allocation))
    // (the tooltip of a skill says which number is which; the colour of the second says how it compares)
    SKILLS.forEach((sk, i) => {
      const cx = x + 12 + (i % 4) * 48;
      const cy = y + 256 + Math.floor(i / 4) * 38;
      const alloc = p.allocation[sk] + p.aboveMax[sk];
      const u = p.usable[sk];
      const icon = k(this.add.image(cx, cy + 4, SKILL_ICONS, sk).setOrigin(0, 0));
      if (alloc === 0) icon.setAlpha(0.3);
      k(label(this, cx + 17, cy, String(p.allocation[sk]) + (p.aboveMax[sk] ? `+${p.aboveMax[sk]}` : ''), { color: alloc ? COLORS.text : COLORS.dim }));
      const uc = alloc === 0 ? COLORS.dim : u >= alloc ? COLORS.green : u === 0 ? COLORS.red : COLORS.gold;
      k(label(this, cx + 17, cy + 16, String(u), { color: uc }));
      icon.setInteractive();
      const canHire = current && run.canHire(sk);
      const skillTip = (): TipContent => ({
        title: SKILL_PLURALS[sk],
        color: COLORS.teal,
        lines: [
          `The level has ${p.allocation[sk]}${p.aboveMax[sk] ? ` (+${p.aboveMax[sk]} from jokers)` : ''}, you bring ${u}.`,
          ...(canHire && !touch.active ? [`Click: hire one for this level ($${HIRE_PRICE}).`] : []),
        ],
        x: cx - 100,
        y: cy + 40,
      });
      hoverTip(icon, this.tip, skillTip, !canHire);
      if (canHire) {
        if (!this.spots.hire) this.spot('hire', cx + 7, cy + 15);
        icon.on('pointerup', () => {
          if (!this.confirmTap(icon, skillTip(), `Tap again to hire one for this level ($${HIRE_PRICE}).`)) return;
          if (run.hire(sk)) {
            this.sfx(SoundEffect.AssignSkill);
            this.save();
            this.render();
          }
        });
      }
    });
    const meta = loadMeta().levels[l.id];
    if (meta?.fewest) k(label(this, x + 12, y + 336, `Your best: ${meta.best}%, ${totalSkills(meta.fewest)} skills`, { color: COLORS.teal, maxWidth: w - 24 }));

    // the reward, and what skipping gives (the boss: another level instead)
    k(label(this, x + 12, y + 355, 'Reward:', { color: COLORS.dim }));
    k(label(this, x + w - 12, y + 355, `${'$'.repeat(p.reward)}+`, { color: COLORS.gold, originX: 1 }));
    if (b.kind === 'boss') {
      if (b.status !== 'defeated' && !run.state.bossRerolled) {
        const can = run.canRerollBoss();
        const rerollTip = (): TipContent => ({
          title: "Director's Cut",
          color: COLORS.red,
          lines: ['Another level for the Boss Blind, from the same band.', 'Once per ante, before the boss is played.'],
          x: x - 60,
          y: y + 270,
        });
        const reroll = () => {
          if (!run.rerollBoss()) return;
          this.sfx(SoundEffect.SkillButtonSelect);
          this.save();
          this.render();
        };
        const rr = this.btn('rerollBoss', x + 8, y + 374, w - 16, 26, `Reroll Boss $${run.bossRerollPrice()}`, COLORS.red, reroll, { enabled: can });
        hoverTip(rr, this.tip, rerollTip, !can);
      }
    } else if (b.tag) {
      const tag = tagDef(b.tag);
      const tagLabel = k(label(this, x + 12, y + 379, tag.name, { color: done ? COLORS.dim : COLORS.orange, maxWidth: w - 96 }));
      tagLabel.setInteractive();
      hoverTip(tagLabel, this.tip, () => ({
        title: `Skip for: ${tag.name}`,
        color: COLORS.orange,
        lines: [tag.text, '', 'No reward and no shop for this blind.'],
        x: x - 20,
        y: y + 290,
      }));
      k(new Button(this, x + w - 78, y + 374, 70, 26, 'Skip', COLORS.red, () => this.skip(run), { enabled: current && run.canSkip() }));
      if (current) this.spot('skip', x + w - 43, y + 387);
    }
    if (done) k(this.add.rectangle(x, y, w, 440, 0x000000, 0.45).setOrigin(0, 0));
    else if (!current) k(this.add.rectangle(x, y, w, 440, 0x000000, 0.2).setOrigin(0, 0));
  }

  private play(run: RunSession): void {
    const setup = run.startBlind();
    this.save();
    this.sfx(SoundEffect.LetsGo);
    this.app.currentLevelInfo = run.level(setup.levelId).info;
    gotoScreen(this, ScreenType.Preview);
  }

  private skip(run: RunSession): void {
    const notes = run.skipBlind();
    this.save();
    this.sfx(SoundEffect.SkillButtonSelect);
    this.render();
    this.toast(notes.join('\n'));
  }

  /* -------------------------------------------------------------------------------------------- result */

  private renderResult(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const out = s.outcome!;
    const setup = s.setup!;
    const l = run.level(setup.levelId);
    const x = MAIN_X;
    const y = MAIN_Y;
    const w = MAIN_R - MAIN_X;
    k(panel(this, x, y, w, 440, COLORS.panel, out.success ? COLORS.green : COLORS.red, 12));
    k(label(this, x + w / 2, y + 14, out.success ? 'Level complete' : 'Not enough lemmings saved', { size: 32, big: true, color: out.success ? COLORS.green : COLORS.red, originX: 0.5 }));
    k(label(this, x + w / 2, y + 54, `${levelName(l)}  ${l.title}`, { purple: true, originX: 0.5 }));
    // accept or retry, on top like the Cash Out of Balatro
    const giveUp = () => {
      if (window.confirm('Give up this run?')) this.finishRun(false);
    };
    if (out.success) {
      const accept = () => {
        run.accept();
        const meta = loadMeta();
        recordLevel(meta, setup.levelId, out);
        saveMeta(meta);
        this.save();
        this.sfx(SoundEffect.Yippee);
        this.render();
      };
      this.btn('accept', x + 16, y + 80, 306, 34, 'Accept result', COLORS.orange, accept, { big: true });
      this.btn('retry', x + 336, y + 80, 306, 34, 'Retry', COLORS.blue, () => this.retry(run), { big: true });
    } else {
      this.btn('retry', x + 16, y + 80, 306, 34, 'Retry', COLORS.blue, () => this.retry(run), { big: true });
      this.btn('giveUp', x + 336, y + 80, 306, 34, 'Give up the run', COLORS.red, giveUp, { big: true });
    }
    this.well(x + 12, y + 126, w - 24, 274);
    const pct = out.hand ? Math.floor((out.rescued * 100) / out.hand) : 0;
    k(label(this, x + 24, y + 134, `Rescued ${out.rescued} of ${out.hand} (${pct}%), you needed ${out.required}.`, { color: COLORS.text }));
    const count = (f: (x: Fate) => boolean) => out.fates.filter(f).length;
    const lost = count(isDeath);
    const alive = count((f) => f === 'alive');
    const home = count((f) => f === 'unreleased');
    const deaths = new Map<Fate, number>();
    for (const f of out.fates) if (isDeath(f)) deaths.set(f, (deaths.get(f) ?? 0) + 1);
    const how = [...deaths].map(([f, n]) => `${n} ${FATE_TEXTS[f]}`).join(', ');
    k(label(this, x + 24, y + 154, `Survived ${alive}   Stayed home ${home}   Lost ${lost}${how ? ` (${how})` : ''}`, { color: COLORS.dim, maxWidth: w - 48 }));
    if (out.success && lost > 0) k(label(this, x + 24, y + 190, 'If you accept this result, the lost lemmings leave your colony for good.', { color: COLORS.orange, maxWidth: w - 48 }));
    k(label(this, x + 24, y + 226, `Skills used: ${describeSkills(out.skillsUsed, 'none')}`, { color: COLORS.dim, maxWidth: w - 48 }));

    // what happened to the special lemmings
    const specials: [LemmingCard, Fate][] = [];
    setup.hand.forEach((id, i) => {
      const c = run.card(id);
      if (c && isSpecial(c)) specials.push([c, out.fates[i]]);
    });
    if (specials.length) {
      k(label(this, x + 24, y + 264, 'Special lemmings', { color: COLORS.purple }));
      specials.slice(0, 8).forEach(([c, f], i) => {
        const cx = x + 24 + (i % 2) * 310;
        const cy = y + 286 + Math.floor(i / 2) * 22;
        const sp = k(lemmingSprite(this, cx + 8, cy + 6, FATE_ANIMS[f] ?? 'walk', 1));
        sp.setTint(EDITION_TINTS[c.edition]);
        k(label(this, cx + 22, cy, `${cardTitle(c)}: ${FATE_TEXTS[f]}`, { color: isDeath(f) ? COLORS.red : f === 'saved' ? COLORS.green : COLORS.text }));
      });
      if (specials.length > 8) k(label(this, x + 24, y + 376, `and ${specials.length - 8} more`, { color: COLORS.dim }));
    }
    const unused = Math.max(0, ATTEMPTS - setup.attempts);
    k(label(this, x + w / 2, y + 406, `Attempt ${setup.attempts}. Unused attempts pay $1 each (${unused} left).`, { color: COLORS.dim, originX: 0.5 }));
  }

  private retry(run: RunSession): void {
    run.retry();
    this.play(run);
  }

  private finishRun(won: boolean): void {
    const run = this.run;
    if (!run) return;
    if (!won) run.giveUp();
    const meta = loadMeta();
    if (run.state.won) meta.wins++;
    meta.bestAnte = Math.max(meta.bestAnte, run.state.ante);
    saveMeta(meta);
    this.save();
    this.sfx(run.state.won ? SoundEffect.Yippee : SoundEffect.Explosion);
    this.render();
  }

  /* -------------------------------------------------------------------------------------------- cash out */

  /** The cash out of Balatro: the button on top, and below it what the blind paid, line by line. */
  private renderCashout(run: RunSession): void {
    const k = this.k.bind(this);
    const cash = run.state.cashout!;
    const x = MAIN_X + 60;
    const y = MAIN_Y;
    const w = MAIN_R - MAIN_X - 120;
    k(panel(this, x, y, w, 440, COLORS.panel, COLORS.panelLight, 12));
    const cashOut = () => {
      run.cashOut();
      this.save();
      if (run.state.phase === 'over') this.finishRun(true);
      else this.render();
    };
    this.btn('cashout', x + 12, y + 12, w - 24, 44, `Cash Out: $${cash.total}`, COLORS.orange, cashOut, { big: true });
    this.well(x + 12, y + 70, w - 24, 340);
    const items: Phaser.GameObjects.BitmapText[] = [];
    cash.lines.forEach((ln, i) => {
      const ly = y + 82 + i * 22;
      const a = k(label(this, x + 24, ly, ln.label, { color: COLORS.text }));
      // the money as Balatro counts it out: a $ for every dollar
      const b = k(label(this, x + w - 24, ly, ln.amount <= 12 ? '$'.repeat(ln.amount) : `$${ln.amount}`, { color: COLORS.gold, originX: 1 }));
      // leader dots from the label to the amount
      const from = x + 24 + a.width + 8;
      const to = x + w - 24 - b.width - 8;
      const dots = k(label(this, from, ly, '.'.repeat(Math.max(0, Math.floor((to - from) / 4))), { color: COLORS.border }));
      for (const o of [a, dots, b]) {
        o.setAlpha(0);
        items.push(o);
      }
    });
    const ty = y + 82 + cash.lines.length * 22 + 10;
    cash.notes.slice(0, 6).forEach((n, i) => k(label(this, x + 24, ty + i * 20, n, { color: COLORS.dim, maxWidth: w - 48 })));
    // the lines come in one by one, with a click each
    items.forEach((o, i) =>
      this.tweens.add({
        targets: o,
        alpha: 1,
        delay: 400 + Math.floor(i / 3) * 260,
        duration: 120,
        onStart: () => {
          if (i % 3 === 0) this.sfx(SoundEffect.AssignSkill);
        },
      }),
    );
  }

  /* -------------------------------------------------------------------------------------------- shop */

  /**
   * The shop of Balatro: Next Round and Reroll on the left, the cards on offer next to them with their price on top,
   * and below them the next blind and the packs (the recruits every shop has, and what a Supply Drop adds). A card is
   * bought by dragging it up to the jokers, or by tapping it and then its Buy button.
   */
  private renderShop(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const shop = s.shop!;
    const x = MAIN_X;
    const y = MAIN_Y;
    const w = MAIN_R - MAIN_X;
    k(panel(this, x, y, w, 440, COLORS.panel, COLORS.red, 12));

    const nextRound = () => {
      run.nextRound();
      this.save();
      this.render();
    };
    this.btn('nextRound', x + 12, y + 12, 124, 58, 'Next\nRound', COLORS.red, nextRound, { big: true });
    const reroll = () => {
      if (!run.reroll()) return;
      this.sfx(SoundEffect.SkillButtonSelect);
      this.save();
      this.render();
    };
    this.btn('reroll', x + 12, y + 80, 124, 58, 'Reroll', COLORS.green, reroll, { big: true, enabled: s.money >= run.rerollPrice(), sub: `$${run.rerollPrice()}` });

    // the cards on offer
    const top: Rect = { x: x + 146, y: y + 12, w: w - 158, h: 130 };
    this.well(top.x, top.y, top.w, top.h);
    const offers = shop.offers.slice(0, 3).filter((o) => !o.sold);
    const ox = this.slots(top, offers.length);
    offers.forEach((o, i) => this.offerCard(run, o, ox[i], top.y + 36 + CARD_H / 2, `offer:${i}`));
    if (!offers.length) k(label(this, top.x + top.w / 2, top.y + top.h / 2, 'Sold out', { color: COLORS.dim, originX: 0.5, originY: 0.5 }));

    // the next blind
    const by = y + 152;
    this.well(x + 12, by, 216, 130);
    const next = s.blinds.find((b) => b.status === 'current') ?? s.blinds.find((b) => b.status === 'upcoming');
    if (next) {
      const index = s.blinds.indexOf(next);
      const nl = run.level(next.levelId);
      k(label(this, x + 20, by + 6, `Next: ${BLIND_NAMES[next.kind]}`, { color: BLIND_COLORS[next.kind] }));
      const pic = k(this.add.image(x + 20, by + 26, levelThumbnail(this, this.app, nl, 200, 40)).setOrigin(0, 0));
      pic.setInteractive({ useHandCursor: true });
      pic.on('pointerup', () => this.showLevelPreview(run, index));
      this.spot('nextBlind', x + 120, by + 46);
      k(label(this, x + 20, by + 70, levelName(nl), { purple: true }));
      k(label(this, x + 220, by + 72, `Rescue ${nl.rescue}/${nl.lemmings}`, { color: COLORS.dim, originX: 1 }));
      k(label(this, x + 20, by + 90, nl.title, { color: COLORS.text, maxWidth: 200 }));
    } else k(label(this, x + 20, by + 6, `Next: Ante ${s.ante + 1}`, { color: COLORS.orange }));

    // the packs: the recruits, and the extra offers of a Supply Drop
    const packs: Rect = { x: x + 238, y: by, w: w - 250, h: 130 };
    this.well(packs.x, packs.y, packs.w, packs.h);
    const extras = shop.offers.slice(3).filter((o) => !o.sold);
    const px = this.slots(packs, extras.length + 1);
    const py = packs.y + 36 + CARD_H / 2;
    const canRecruit = s.money >= shop.recruitPrice;
    const recruit = () => {
      if (!run.buyRecruits()) {
        this.toast('Not enough money.');
        return;
      }
      this.sfx(SoundEffect.LetsGo);
      this.save();
      this.render();
    };
    const price = shop.recruitPrice === 0 ? 'FREE' : `$${shop.recruitPrice}`;
    const pack = k(new CardView(this, px[0], py, { color: COLORS.blue, art: { anim: 'walk' }, price, pile: true }));
    this.spot('recruits', px[0], py);
    this.table.add(pack, {
      tip: () => ({ title: 'Recruits', color: COLORS.blue, lines: ['5 plain lemmings join the colony.', 'Every shop has them, as often as you like.'], badge: { text: 'Lemming Pack', color: COLORS.blue } }),
      buttons: () => [{ label: 'BUY', color: COLORS.orange, side: 'below', enabled: canRecruit, run: recruit }],
      targets: () => [{ rect: BUY_ZONE, color: COLORS.green, lines: ['BUY', price], active: canRecruit, release: recruit, refused: recruit }],
    });
    extras.forEach((o, i) => this.offerCard(run, o, px[i + 1], py, `extra:${i}`));

    k(label(this, x + w / 2, y + 296, touch.active ? 'Drag a card up to buy it, or tap it for what it is' : 'Drag a card up to buy it, or click it for its Buy button', { color: COLORS.dim, originX: 0.5 }));
  }

  /** a card of the shop: its price on top, bought by a drag to the jokers or with its Buy button */
  private offerCard(run: RunSession, o: ShopOffer, cx: number, cy: number, spot: string): void {
    const info = this.offerInfo(run, o);
    const price = o.price === 0 ? 'FREE' : `$${o.price}`;
    const card = this.k(new CardView(this, cx, cy, { color: info.color, art: info.art, price }));
    this.spot(spot, cx, cy);
    const buy = () => this.buy(run, o);
    const buyUse = () => this.buyAndUse(run, o);
    const behaviour: CardBehaviour = {
      tip: () => ({ title: info.title, color: info.color, lines: [...info.lines, ...(run.canBuy(o) ? [] : ['', this.whyNot(run, o)])], badge: info.badge }),
      buttons: () => [
        { label: 'BUY', color: COLORS.orange, side: 'below', enabled: run.canBuy(o), run: buy },
        ...(o.type === 'tarot' ? [{ label: 'BUY &', sub: 'USE', color: COLORS.orange, side: 'right' as const, enabled: run.canBuyAndUse(o), run: buyUse }] : []),
      ],
      targets: () => {
        const targets: DropTarget[] = [{ rect: BUY_ZONE, color: COLORS.green, lines: ['BUY', price], active: run.canBuy(o), release: buy, refused: buy }];
        if (run.canBuyAndUse(o)) targets.push({ rect: USE_ZONE, color: COLORS.orange, lines: ['BUY', '&', 'USE', price], active: true, release: buyUse });
        return targets;
      },
    };
    this.table.add(card, behaviour);
  }

  private whyNot(run: RunSession, o: ShopOffer): string {
    const s = run.state;
    if (s.money < o.price) return 'Not enough money.';
    if (o.type === 'joker' && s.jokers.length >= JOKER_SLOTS) return 'No room for another joker (sell one).';
    if (o.type === 'tarot' && s.tarots.length >= TAROT_SLOTS) return 'No room for another tarot (use one).';
    return '';
  }

  private offerInfo(run: RunSession, o: ShopOffer): { title: string; color: number; lines: string[]; art: Art; badge: { text: string; color: number } } {
    switch (o.type) {
      case 'joker': {
        const d = jokerDef(o.id);
        return { title: d.name, color: RARITY_COLORS[d.rarity], lines: [d.text], art: JOKER_ART[d.id], badge: { text: RARITY_NAMES[d.rarity], color: RARITY_COLORS[d.rarity] } };
      }
      case 'tarot': {
        const d = tarotDef(o.id);
        const text = o.skill && d.skillText ? d.skillText(SKILL_NAMES[o.skill]) : d.text;
        return { title: d.name, color: COLORS.purple, lines: [text], art: o.id === 'manual' && o.skill ? { icon: o.skill } : TAROT_ART[d.id], badge: { text: 'Tarot', color: COLORS.purple } };
      }
      case 'training': {
        const sk = o.skill!;
        return {
          title: `${SKILL_NAMES[sk]} Training`,
          color: COLORS.teal,
          lines: [`+${o.amount} ${SKILL_NAMES[sk]} ability for good.`, `You have ${run.capability()[sk]}.`],
          art: { icon: sk },
          badge: { text: 'Training', color: COLORS.teal },
        };
      }
      case 'drive': {
        const sk = o.skill!;
        return {
          title: `${SKILL_NAMES[sk]} Recruitment Drive`,
          color: COLORS.teal,
          lines: [`+${o.amount} lemmings and +${o.amount} ${SKILL_NAMES[sk]} ability.`],
          art: { anim: 'walk', tint: 0x9ff0e0 },
          badge: { text: 'Recruitment Drive', color: COLORS.teal },
        };
      }
    }
  }

  private buy(run: RunSession, o: ShopOffer): void {
    if (!run.buy(o.uid)) {
      this.toast(this.whyNot(run, o));
      return;
    }
    this.sfx(SoundEffect.AssignSkill);
    this.save();
    this.render();
  }

  /** a tarot of the shop, used at once (it needs no room among the tarots) */
  private buyAndUse(run: RunSession, o: ShopOffer): void {
    if (!run.canBuyAndUse(o)) {
      this.toast(this.whyNot(run, o));
      return;
    }
    const d = tarotDef(o.id);
    if (d.select > 0) {
      this.showColony({ offer: o.uid, max: d.select, name: d.name });
      return;
    }
    const notes = run.buyAndUse(o.uid);
    if (!notes) return;
    this.sfx(SoundEffect.AssignSkill);
    this.save();
    this.render();
    this.toast(notes.join('\n'));
  }

  /* -------------------------------------------------------------------------------------------- tarots and the colony */

  private useTarot(run: RunSession, uid: number): void {
    const t = run.state.tarots.find((tt) => tt.uid === uid);
    if (!t) return;
    const s = run.state.phase;
    if (s === 'result' || s === 'over') {
      this.toast('Tarots can be used on the blind screen and in the shop.');
      return;
    }
    if (s === 'assign') {
      this.toast('Finish assigning your abilities first.');
      return;
    }
    const d = tarotDef(t.id);
    if (d.select === 0) {
      const notes = run.useTarot(uid);
      if (notes) {
        this.sfx(SoundEffect.AssignSkill);
        this.save();
        this.render();
        this.toast(notes.join('\n'));
      }
      return;
    }
    this.showColony({ uid, max: d.select, name: d.name });
  }

  private closeOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    for (const f of this.overlayCleanup) f();
    this.overlayCleanup = [];
    this.previewPan = null;
  }

  /**
   * The colony: every special lemming, and the plain ones. With a tarot: select lemmings for it, with a tap each or
   * with one drag across them (what the drag does to the first lemming it touches, it does to all).
   */
  private showColony(tarot: TarotUse | null): void {
    const run = this.run;
    if (!run) return;
    const o = this.openOverlay(0.6);
    const selected = new Set<number>();
    const colony = run.state.colony;
    const squad = new Set(run.state.setup?.hand ?? []);
    const specials = colony.filter(isSpecial);
    const plain = colony.filter((c) => !isSpecial(c));
    o(panel(this, 60, 30, 840, 480, COLORS.panel, COLORS.purple, 12));
    o(label(this, 84, 44, tarot ? `${tarot.name}: select up to ${tarot.max}` : `Your colony: ${colony.length} lemmings`, { size: 16, color: COLORS.gold }));
    const info = o(label(this, 84, 66, '', { color: COLORS.dim }));
    const update = () =>
      info.setText(
        tarot
          ? `${selected.size} of ${tarot.max} selected.${squad.size ? ' Lemmings of the squad of the blind you are playing are marked.' : ''}`
          : 'Special lemmings have editions (Gold, Lucky, Mentor), abilities or insurance.',
      );
    update();
    const cells: { c: LemmingCard; rect: Rect; draw: () => void }[] = [];
    const shown = specials.slice(0, 44);
    shown.forEach((c, i) => {
      const cx = 84 + (i % 4) * 200;
      const cy = 92 + Math.floor(i / 4) * 32;
      const box = o(this.add.graphics());
      const draw = () => {
        box.clear();
        box.fillStyle(selected.has(c.id) ? COLORS.purple : COLORS.dark, 1);
        box.fillRoundedRect(cx, cy, 192, 28, 5);
        box.lineStyle(1, squad.has(c.id) ? COLORS.orange : COLORS.border, 1);
        box.strokeRoundedRect(cx, cy, 192, 28, 5);
      };
      draw();
      cells.push({ c, rect: { x: cx, y: cy, w: 192, h: 28 }, draw });
      const sp = o(lemmingSprite(this, cx + 12, cy + 14, c.floater ? 'float' : c.climber ? 'climb' : 'walk', 1));
      sp.setTint(EDITION_TINTS[c.edition]);
      o(label(this, cx + 26, cy + 6, cardTitle(c), { color: COLORS.text, maxWidth: 160 }));
      const zone = o(this.add.zone(cx, cy, 192, 28).setOrigin(0, 0).setInteractive());
      this.spot(`colony:${i}`, cx + 96, cy + 14);
      const cellTip = (): TipContent => ({
        title: cardTitle(c),
        color: EDITION_TINTS[c.edition] === 0xffffff ? COLORS.text : EDITION_TINTS[c.edition],
        lines: this.cardLines(c, squad.has(c.id)),
        x: cx,
        y: cy + 30,
        width: 320,
      });
      hoverTip(zone, this.tip, cellTip, !tarot);
      if (!tarot) return;
      zone.on('pointerdown', () => {
        // the first lemming decides: the drag selects, or it takes lemmings out of the selection
        const adding = !selected.has(c.id);
        const apply = (cell: { c: LemmingCard; draw: () => void }) => {
          if (adding === selected.has(cell.c.id)) return;
          if (!adding) selected.delete(cell.c.id);
          else if (selected.size < tarot.max) selected.add(cell.c.id);
          else return;
          cell.draw();
          update();
        };
        apply({ c, draw });
        const move = (p: Phaser.Input.Pointer) => {
          const cell = cells.find((cl) => inRect(cl.rect, p.worldX, p.worldY));
          if (cell) apply(cell);
        };
        const stop = () => {
          this.input.off('pointermove', move);
          this.input.off('pointerup', stop);
          this.input.off('pointerupoutside', stop);
        };
        this.input.on('pointermove', move);
        this.input.on('pointerup', stop);
        this.input.on('pointerupoutside', stop);
        this.overlayCleanup.push(stop);
      });
    });
    if (specials.length > shown.length) o(label(this, 84, 92 + 11 * 32, `and ${specials.length - shown.length} more special lemmings`, { color: COLORS.dim }));
    // the plain lemmings: one tile (with a tarot, every click selects another one)
    const py = 92 + Math.min(11, Math.ceil(shown.length / 4)) * 32 + 8;
    const plainSelected = () => plain.filter((c) => selected.has(c.id)).length;
    const plainLabel = o(label(this, 110, py + 8, '', { color: COLORS.text }));
    const updPlain = () => plainLabel.setText(`Plain lemmings: ${plain.length}${tarot ? `  (${plainSelected()} selected)` : ''}`);
    updPlain();
    o(lemmingSprite(this, 94, py + 14, 'walk', 1));
    if (tarot && plain.length) {
      this.spot('selectOne', 470, py + 15);
      const selectOne = () => {
        const next = plain.find((c) => !selected.has(c.id) && !squad.has(c.id)) ?? plain.find((c) => !selected.has(c.id));
        if (next && selected.size < tarot.max) selected.add(next.id);
        updPlain();
        update();
      };
      o(new Button(this, 420, py + 2, 100, 26, 'Select one', COLORS.blue, selectOne));
      const clearPlain = () => {
        for (const c of plain) selected.delete(c.id);
        updPlain();
        update();
      };
      o(new Button(this, 530, py + 2, 100, 26, 'Clear', COLORS.gray, clearPlain));
    }
    if (tarot) {
      this.spot('use', 665, 482);
      const use = () => {
        const notes = tarot.offer !== undefined ? run.buyAndUse(tarot.offer, [...selected]) : run.useTarot(tarot.uid!, [...selected]);
        if (!notes) {
          this.toast(selected.size === 0 ? 'Select at least one lemming.' : 'That does not work (the squad of a blind cannot leave the colony).');
          return;
        }
        this.sfx(SoundEffect.AssignSkill);
        this.save();
        this.render();
        this.toast(notes.join('\n'));
      };
      o(new Button(this, 600, 466, 130, 32, 'Use', COLORS.red, use));
    }
    this.spot('back', 805, 482);
    o(new Button(this, 740, 466, 130, 32, tarot ? 'Cancel' : 'Back', COLORS.orange, () => this.closeOverlay()));
  }

  private cardLines(c: LemmingCard, inSquad: boolean): string[] {
    const lines = [EDITION_TEXTS[c.edition]];
    if (c.climber) lines.push('Climber: climbs walls from the start of every level.');
    if (c.floater) lines.push('Floater: has an umbrella in every level.');
    if (c.insured) lines.push('Insured: comes back once after it dies.');
    lines.push(`Reached the exit ${c.saves} time${c.saves === 1 ? '' : 's'}.`);
    if (inSquad) lines.push('In the squad of the current blind.');
    return lines;
  }

  /* -------------------------------------------------------------------------------------------- the end */

  private renderOver(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const x = MAIN_X;
    const y = MAIN_Y;
    const w = MAIN_R - MAIN_X;
    k(panel(this, x, y, w, 440, COLORS.panel, s.won ? COLORS.gold : COLORS.red, 12));
    k(label(this, x + w / 2, y + 20, s.won ? 'You win!' : 'Game over', { size: 48, big: true, color: s.won ? COLORS.gold : COLORS.red, originX: 0.5 }));
    k(label(this, x + w / 2, y + 84, s.won ? 'Your colony made it through all eight antes.' : `Your colony reached ante ${s.ante}.`, { color: COLORS.text, originX: 0.5 }));
    const st = s.stats;
    const lines = [
      `Blinds won ${st.blindsWon}, skipped ${st.skipped}, attempts ${st.attempts}`,
      `Lemmings saved ${st.saved}, lost ${st.lost}, colony ${s.colony.length}`,
      `Money earned $${st.earned}`,
      `Jokers: ${s.jokers.map((j) => jokerDef(j.id).name).join(', ') || 'none'}`,
      `Seed ${s.seed}`,
    ];
    this.well(x + 40, y + 112, w - 80, 126);
    k(label(this, x + w / 2, y + 124, lines.join('\n'), { color: COLORS.text, originX: 0.5, align: 1, maxWidth: w - 100 }));
    for (let i = 0; i < 8; i++) k(lemmingSprite(this, x + 77 + i * 72, y + 280, s.won ? (i % 2 ? 'exit' : 'walk') : i % 2 ? 'splat' : 'drown', 2));
    const again = () => {
      this.app.run = null;
      this.newRun(randomSeed());
    };
    this.btn('newRun', x + 130, y + 330, 190, 44, 'New Run', COLORS.red, again, { big: true });
    const menu = () => {
      this.app.run = null;
      saveRun(null);
      this.toMenu();
    };
    this.btn('menu', x + 338, y + 330, 190, 44, 'Main Menu', COLORS.orange, menu, { big: true });
  }

  /* -------------------------------------------------------------------------------------------- messages */

  private toast(text: string): void {
    for (const o of this.toastObj) o.destroy();
    this.toastObj = [];
    if (!text) return;
    // over the middle of the screen, clear of the column on the left
    const cx = (MAIN_X + MAIN_R) / 2;
    const t = label(this, cx, 0, text, { color: COLORS.text, originX: 0.5, maxWidth: 560, align: 1 }).setDepth(900);
    const h = t.height + 20;
    const y = H - h - 16;
    t.setY(y + 10);
    const bg = panel(this, cx - 300, y, 600, h, COLORS.dark, COLORS.gold, 8).setDepth(899);
    this.toastObj = [bg, t];
    this.time.delayedCall(3500, () => {
      for (const o of [bg, t]) if (o.active) this.tweens.add({ targets: o, alpha: 0, duration: 400, onComplete: () => o.destroy() });
    });
  }
}

/** for tests and debugging */
export function describeRun(run: RunSession): string {
  const s = run.state;
  const level = (l: RunLevel) => `${levelName(l)} ${l.title}`;
  return [
    `ante ${s.ante} phase ${s.phase} money ${s.money} colony ${s.colony.length}`,
    ...s.blinds.map((b) => `${b.kind} ${b.status}: ${level(run.level(b.levelId))}`),
    `jokers ${s.jokers.map((j) => j.id).join(',')} capacity ${SKILLS.map((sk: Skill) => run.capability()[sk]).join(' ')} (${totalSkills(run.capability())})`,
    `known jokers ${JOKERS.length}, editions ${Object.keys(EDITION_NAMES).length}`,
  ].join('\n');
}
