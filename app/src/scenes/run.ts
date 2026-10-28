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
import { SoundEffect, SoundOption } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { type RunLevel, levelName } from '../run/catalog.ts';
import { EDITION_NAMES, EDITION_TEXTS, FATE_TEXTS, LEMMING_BADGE_COLORS, TRAIT_TEXTS, type Fate, isDeath, JOKERS, jokerDef, jokerText, PACKS, type PackKind, type Rarity, tagDef, tarotDef } from '../run/content.ts';
import { normalizeSeed, randomSeed } from '../run/rng.ts';
import { type BlindPreview, cardTitle, isSpecial, jokerSellValue, RunSession, tarotSellPrice } from '../run/session.ts';
import { colorsText } from '../run/colors.ts';
import { hazardsText, levelHazards } from '../run/hazards.ts';
import { describeSkills, SKILL_NAMES, SKILL_PLURALS, SKILLS, type Skill, totalSkills } from '../run/skills.ts';
import { ABILITY_CAP, ANTES, BLIND_NAMES, type BlindKind, HIRE_PRICE, JOKER_SLOTS, type LemmingCard, type JokerInstance, type PackChoice, type RescueLine, type ShopOffer, START_COLONY, TAROT_SLOTS } from '../run/state.ts';
import { loadMeta, loadRun, markSeen, recordLevel, saveMeta, saveRun } from '../run/storage.ts';
import { ensureRunAssets, type LemmingAnim, lemmingSprite, levelImage, levelThumbnail, SKILL_ICONS } from '../run/ui/assets.ts';
import { type Art, CARD_H, CARD_W, type CardBehaviour, CardTable, CardView, type DropTarget, inRect, type Rect } from '../run/ui/cards.ts';
import { EDITION_TINTS, JOKER_ART, PACK_LOOKS, RARITY_COLORS, RARITY_NAMES, TAROT_ART } from '../run/ui/art.ts';
import { ColonyHome, HOME_LEVEL } from '../run/home.ts';
import { HomeView } from '../run/ui/homeview.ts';
import { plainText } from '../run/rich.ts';
import { lematroLogo } from '../run/ui/logo.ts';
import { soundSliders } from '../run/ui/settings.ts';
import { Swirl, type SwirlColors, SWIRLS } from '../run/ui/swirl.ts';
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
const ASSIGN_ROW_Y = 58;
const ASSIGN_ROW_H = 36;

const BLIND_COLORS: Record<BlindKind, number> = { small: COLORS.blue, big: COLORS.orange, boss: COLORS.red };

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

/** a tarot that is used: one of the player's, one of the shop that is bought for it, or the card of an open pack */
type TarotUse = { uid?: number; offer?: number; pack?: number; max: number; name: string; text?: string; pair?: boolean };

/** "Rescue 72/80 (90%)": the requirement of a level, of the squad you bring to it */
function rescueText(p: BlindPreview): string {
  const all = p.squad + p.extra;
  return `Rescue ${p.required}/${all} (${percent(p.required, all)}%)`;
}

function percent(n: number, of: number): number {
  return of > 0 ? Math.round((n * 100) / of) : 0;
}

/** The page of a level on the Lemmings Wiki: its search jumps to the page of a title (without the dots some end with). */
export function wikiUrl(level: RunLevel): string {
  return `https://lemmings.fandom.com/wiki/Special:Search?query=${encodeURIComponent(level.title.replace(/[.\s]+$/, ''))}&go=Go`;
}

/** the width of the button that opens the page of a level on the Lemmings Wiki */
const WIKI_W = 36;

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
  /** a key for the overlay that is open (the colony: the arrow keys browse it) */
  private overlayKey: ((key: string) => void) | null = null;
  /** the colony at home, while it is open (for the tests) */
  homeView: HomeView | null = null;
  /** where things are on the screen, by name: the middle of the buttons and cards (for the tests) */
  private spots: Record<string, { x: number; y: number }> = {};
  /** what the middle of the screen showed last: when it changes, the new one comes up from below */
  private shown = '';
  private shownMoney: number | null = null;
  /** the swirl behind everything, in the colours of what is going on */
  private swirl!: Swirl;

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
    this.swirl = new Swirl(this, SWIRLS.start);
    // every button clicks (the "Let's go!" of the lemmings is for the levels)
    Button.clickSound = () => this.sfx(SoundEffect.SkillButtonSelect);
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
    // the screen is filled, as the menu and the screens of Lemmix are (not only by whole pixels)
    const cam = this.cameras.main;
    cam.setViewport(ins.left, ins.top, w, h);
    cam.setZoom(f);
    cam.centerOn(W / 2, H / 2);
    this.swirl.cover(W / 2 - w / f / 2, H / 2 - h / f / 2, w / f, h / f);
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
    // (not while the collection is open over it)
    if (!this.sys.isActive()) return;
    if (e.key === 'Escape') {
      if (this.overlay.length) this.closeOverlay();
      else this.toMenu();
    } else if (this.previewPan && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) this.previewPan(e.key === 'ArrowLeft' ? -48 : 48);
    else this.overlayKey?.(e.key);
  }

  private toMenu(): void {
    this.save();
    this.app.leaveRunMode();
    gotoScreen(this, ScreenType.Title);
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
    // a level that was won is cashed out: there is no going back to it (the result is shown with the cash out); one that
    // was not won is the end of the run (a run saved at its result, before that was so, ends here too)
    if (run && !this.choosing && run.state.phase === 'result') {
      if (run.state.outcome?.success) this.acceptResult(run);
      else run.giveUp();
    }
    if (run && !this.choosing && run.state.phase === 'over') this.noteEnd(run);
    const phase = this.choosing || !run ? 'start' : run.state.phase === 'playing' ? 'blinds' : run.state.phase;
    this.swirl.set(this.swirlColors(run, phase));
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
      case 'cashout':
        this.renderCashout(run);
        break;
      case 'shop':
        this.renderShop(run);
        break;
      case 'pack':
        this.renderPack(run);
        break;
      case 'over':
        this.renderOver(run);
        break;
    }
    // what the player comes across turns over in the collection
    markSeen(run.visibleKeys());
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

  /** the colours of the swirl: the level being played or chosen, the shop, the pack that is open */
  private swirlColors(run: RunSession | null, phase: string): SwirlColors {
    if (!run || phase === 'start') return SWIRLS.start;
    const s = run.state;
    switch (phase) {
      case 'assign':
        return SWIRLS.assign;
      case 'shop':
        return SWIRLS.shop;
      case 'pack':
        return SWIRLS[s.pack?.kind ?? 'lemmings'];
      case 'over':
        return s.won ? SWIRLS.won : SWIRLS.over;
    }
    const blind = s.setup && (phase === 'result' || phase === 'cashout') ? s.blinds[s.setup.blind] : run.currentBlind;
    return SWIRLS[blind?.kind ?? 'small'];
  }

  /* -------------------------------------------------------------------------------------------- start */

  private renderStart(): void {
    const saved = loadRun();
    const meta = loadMeta();
    const k = this.k.bind(this);
    k(panel(this, 200, 30, 560, 480, COLORS.panel, COLORS.panelLight, 14));
    k(lematroLogo(this, W / 2, 104, 80));
    k(label(this, W / 2, 168, 'a Lemmings roguelike', { size: 24, color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    const text = [
      'Eight rounds of three levels: the original levels, from Fun to Mayhem.',
      'Your lemmings are your deck: the ones that die are gone for good.',
      'Rescue lemmings for money; spend it on Power Cards, boosts and packs.',
    ];
    this.well(224, 196, 512, 84);
    k(label(this, W / 2, 238, text.join('\n'), { color: COLORS.text, originX: 0.5, originY: 0.5, align: 1, maxWidth: 490 }));
    for (let i = 0; i < 6; i++) k(lemmingSprite(this, 260 + i * 88, 312, i % 2 ? 'walkLeft' : 'walk', 2));
    const seed = randomSeed();
    const y = 344;
    if (saved) {
      const s = saved;
      this.btn('continue', 232, y, 240, 64, 'Continue', COLORS.blue, () => this.continueRun(s), { big: true, sub: `Round ${s.ante}, ${s.money < 0 ? `-$${-s.money}` : `$${s.money}`}, ${s.colony.length} lemmings` });
      this.btn('newRun', 488, y, 240, 64, 'New run', COLORS.red, () => this.newRun(seed), { big: true, sub: `seed ${seed}` });
    } else this.btn('newRun', 360, y, 240, 64, 'New run', COLORS.red, () => this.newRun(seed), { big: true, sub: `seed ${seed}` });
    this.btn('seed', 232, 430, 140, 30, 'Seed...', COLORS.gray, () => this.askSeed());
    this.btn('menu', 588, 430, 140, 30, 'Back', COLORS.orange, () => this.toMenu());
    if (meta.runs > 0) k(label(this, W / 2, 445, `Runs ${meta.runs}  Won ${meta.wins}  Best round ${meta.bestAnte}`, { color: COLORS.dim, originX: 0.5, originY: 0.5 }));
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
    this.save();
    this.render();
  }

  private continueRun(state: ReturnType<typeof loadRun>): void {
    if (!state) return;
    this.app.run = new RunSession(this.app.runCatalog(), state);
    if (state.phase === 'playing') this.app.run.abandonAttempt();
    this.choosing = false;
    this.render();
    if (this.app.run.retired.length) {
      this.save();
      this.toast(this.app.run.retired.join('\n'));
    }
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
      k(label(this, x + w / 2, 32, BLIND_NAMES[played.kind], { size: 32, originX: 0.5, originY: 0.5 }));
      k(label(this, x + w / 2, 54, levelName(l), { originX: 0.5, originY: 0.5 }));
      k(label(this, x + w / 2, 76, `Round ${s.ante}`, { originX: 0.5, originY: 0.5 }));
    } else if (s.phase === 'shop') {
      this.well(x + 6, 12, w - 12, 84);
      k(label(this, x + w / 2, 42, 'Shop', { size: 48, color: COLORS.red, originX: 0.5, originY: 0.5 }));
      k(label(this, x + w / 2, 76, 'Improve your colony!', { color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    } else {
      const title: Record<string, string> = {
        assign: 'Assign your\nabilities',
        blinds: 'Choose your\nnext level',
        playing: 'Choose your\nnext level',
        pack: PACKS[s.pack?.kind ?? 'lemmings'].name.replace(' ', '\n'),
        over: s.won ? 'You won!' : 'Run over',
      };
      const color = s.phase === 'assign' ? COLORS.teal : s.phase === 'pack' ? PACK_LOOKS[s.pack?.kind ?? 'lemmings'].color : s.phase === 'over' ? (s.won ? COLORS.gold : COLORS.red) : COLORS.text;
      this.well(x + 6, 12, w - 12, 84);
      // (in the text font, twice its size: the headings of Balatro are in its pixel font too)
      k(label(this, x + w / 2, 54, title[s.phase] ?? '', { size: 32, color, originX: 0.5, originY: 0.5, align: 1 }));
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
          ...(cap[sk] > s.capacity[sk] ? [`${s.capacity[sk]} of your own, +${cap[sk] - s.capacity[sk]} from Power Cards.`] : []),
        ],
        x: x + w + 6,
        y: cy,
      }));
    });

    // Run Info and Options; the attempts and the lemmings lost; the money; the ante and the round
    this.btn('runInfo', x + 6, 298, 82, 112, 'Run\nInfo', COLORS.red, () => this.showRunInfo(run), { big: true });
    this.btn('options', x + 6, 418, 82, 110, 'Options', COLORS.orange, () => this.showOptions(run), { big: true });
    const rx = x + 94;
    const box = (bx: number, by: number, bw: number, bh: number, name: string, value: string, color: number, big = true) => {
      k(panel(this, bx, by, bw, bh, COLORS.panelLight, COLORS.panelLight, 6));
      k(label(this, bx + bw / 2, by + 11, name, { originX: 0.5, originY: 0.5 }));
      this.well(bx + 4, by + 22, bw - 8, bh - 26, COLORS.dark, 1, 5);
      const t = k(label(this, bx + bw / 2, by + 22 + (bh - 26) / 2, value, { size: 32, big, color, originX: 0.5, originY: 0.5 }));
      if (t.width > bw - 12) t.setScale((bw - 12) / t.width);
      return t;
    };
    const savedBox = k(this.add.zone(rx, 298, 100, 72).setOrigin(0, 0).setInteractive());
    box(rx, 298, 48, 72, 'Saved', String(s.stats.saved), COLORS.blue);
    hoverTip(savedBox, this.tip, () => ({
      title: 'Saved and lost',
      color: COLORS.blue,
      lines: [`${s.stats.saved} lemmings reached the exit in this run, ${s.stats.lost} were lost for good. A level that is not won ends the run (in the level, Restart starts it again).`],
      x: x + w + 6,
      y: 298,
    }));
    box(rx + 52, 298, 48, 72, 'Lost', String(s.stats.lost), COLORS.red);
    k(panel(this, rx, 376, 100, 72, COLORS.panelLight, COLORS.panelLight, 6));
    this.well(rx + 4, 380, 92, 64, COLORS.dark, 1, 5);
    const money = k(label(this, rx + 50, 412, s.money < 0 ? `-$${-s.money}` : `$${s.money}`, { size: 32, big: true, color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    if (money.width > 86) money.setScale(86 / money.width);
    if (this.shownMoney !== null && this.shownMoney !== s.money) {
      const to = money.scale;
      money.setScale(to * 1.35);
      this.tweens.add({ targets: money, scale: to, duration: 260, ease: 'Back.easeOut' });
    }
    this.shownMoney = s.money;
    box(rx, 454, 48, 74, 'Round', `${Math.min(s.ante, ANTES)}/${ANTES}`, COLORS.orange, false);
    box(rx + 52, 454, 48, 74, 'Game', String(s.stats.blindsWon + (s.phase === 'over' || s.phase === 'cashout' || s.phase === 'shop' ? 0 : 1)), COLORS.orange);
  }

  private specialCounts(colony: LemmingCard[]): string {
    const n = { gold: 0, lucky: 0, mentor: 0, champion: 0, wise: 0, climber: 0, floater: 0, insured: 0 };
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
    if (n.wise) parts.push(`${n.wise} Wise`);
    if (n.climber) parts.push(`${n.climber} Climber${n.climber > 1 ? 's' : ''}`);
    if (n.floater) parts.push(`${n.floater} Floater${n.floater > 1 ? 's' : ''}`);
    if (n.insured) parts.push(`${n.insured} Insured`);
    return parts.join(', ');
  }

  /** Run Info: the blinds of the ante, the abilities and the numbers of the run. */
  private showRunInfo(run: RunSession): void {
    const o = this.openOverlay();
    const s = run.state;
    o(panel(this, 180, 16, 600, 508, COLORS.panel, COLORS.panelLight, 12));
    o(label(this, 480, 40, 'Run Info', { size: 32, big: true, originX: 0.5, originY: 0.5 }));
    o(label(this, 204, 66, `Round ${Math.min(s.ante, ANTES)} of ${ANTES}: ${bandName(run)}`, { color: COLORS.orange }));
    // the levels of the round: a picture of each (a click on it: the preview), what can kill a lemming in it
    s.blinds.forEach((b, i) => {
      const l = run.level(b.levelId);
      const p = run.preview(i);
      const y = 88 + i * 78;
      const g = o(this.add.graphics());
      g.fillStyle(COLORS.dark, 1);
      g.fillRoundedRect(204, y, 552, 72, 6);
      g.fillStyle(BLIND_COLORS[b.kind], 1);
      g.fillRoundedRect(204, y, 8, 72, 3);
      const pic = o(this.add.image(220, y + 6, levelThumbnail(this, this.app, l, 180, 60)).setOrigin(0, 0));
      pic.setInteractive({ useHandCursor: true });
      const preview = () => this.showLevelPreview(run, i, () => this.showRunInfo(run));
      pic.on('pointerup', preview);
      const head = o(label(this, 412, y + 6, BLIND_NAMES[b.kind], { color: BLIND_COLORS[b.kind] }));
      o(label(this, head.x + head.width + 8, y + 6, levelName(l), { purple: true }));
      const status = b.status === 'current' ? 'Current' : b.status === 'upcoming' ? 'Upcoming' : b.status === 'skipped' ? 'Skipped' : 'Defeated';
      o(label(this, 744, y + 6, status, { color: b.status === 'current' ? COLORS.gold : COLORS.dim, originX: 1 }));
      o(label(this, 412, y + 24, l.title, { color: COLORS.text, maxWidth: 260 }));
      const hz = levelHazards(this.app.style, this.app.data.provider, l);
      o(label(this, 412, y + 44, hazardsText(hz), { color: hz.water || hz.fire || hz.traps ? COLORS.red : COLORS.green }));
      o(label(this, 412, y + 58, `Rescue ${p.required} of ${p.squad + p.extra}`, { color: COLORS.dim }));
      this.spot(`info:preview:${i}`, 712, y + 54);
      o(new Button(this, 680, y + 44, 64, 22, 'Preview', COLORS.blue, preview));
    });
    const cap = run.capability();
    o(label(this, 204, 326, 'Abilities', { color: COLORS.dim }));
    SKILLS.forEach((sk, i) => {
      const x = 204 + i * 68;
      o(this.add.image(x, 344, SKILL_ICONS, sk).setOrigin(0, 0).setScale(1.5));
      o(label(this, x + 26, 354, String(cap[sk]), { color: cap[sk] > 0 ? COLORS.text : COLORS.dim }));
      if (cap[sk] > s.capacity[sk]) o(label(this, x + 26, 370, `+${cap[sk] - s.capacity[sk]}`, { color: COLORS.teal }));
    });
    const st = s.stats;
    const tags = s.pendingTags.map((t) => tagDef(t).name);
    const lines = [
      `Levels won ${st.blindsWon}, skipped ${st.skipped}, attempts ${st.attempts}`,
      `Lemmings saved ${st.saved}, lost ${st.lost}, colony ${s.colony.length}`,
      `Money earned $${st.earned}`,
      ...(tags.length ? [`Skip Bonuses waiting: ${tags.join(', ')}`] : []),
      `Seed ${s.seed}`,
    ];
    o(label(this, 204, 398, lines.join('\n'), { color: COLORS.text, maxWidth: 552 }));
    this.spot('back', 480, 499);
    o(new Button(this, 380, 486, 200, 28, 'Back', COLORS.orange, () => this.closeOverlay()));
  }

  /** Options: the volumes, the collection, back to the title, or the end of the run. */
  private showOptions(run: RunSession): void {
    const o = this.openOverlay();
    o(panel(this, 320, 40, 320, 460, COLORS.panel, COLORS.panelLight, 12));
    o(label(this, 480, 72, 'Options', { size: 48, originX: 0.5, originY: 0.5 }));
    o(new Button(this, 344, 108, 272, 40, 'Collection', COLORS.green, () => this.openCollection(), { big: true }));
    this.spot('collection', 480, 128);
    const [sfx, music] = soundSliders(this, this.app, 344, 166, 272).map((sl) => o(sl));
    // (the left end of a slider, and its width)
    this.spot('slider:sfx', sfx.x, sfx.y + 31);
    this.spot('slider:music', music.x, music.y + 31);
    o(new Button(this, 344, 290, 272, 40, 'Main menu', COLORS.blue, () => this.toMenu(), { sub: 'the run is saved' }));
    if (run.state.phase !== 'over') {
      o(new Button(this, 344, 340, 272, 40, 'Give up the run', COLORS.red, () => this.confirmGiveUp()));
      this.spot('giveUpRun', 480, 360);
    }
    o(label(this, 480, 402, `Seed ${run.state.seed}`, { color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    o(label(this, 480, 424, touch.active ? 'The run is saved as you go' : 'Esc: menu, the run is saved', { color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    this.spot('back', 480, 465);
    o(new Button(this, 344, 448, 272, 34, 'Back', COLORS.orange, () => this.closeOverlay()));
  }

  /** Give up the run? Asked over the screen, in the colours of the run. */
  private confirmGiveUp(): void {
    const o = this.openOverlay(0.75);
    o(panel(this, 300, 170, 360, 200, COLORS.panel, COLORS.red, 14));
    o(label(this, 480, 206, 'Give up the run?', { size: 32, originX: 0.5, originY: 0.5 }));
    o(label(this, 480, 246, 'The colony is gone for good: the run ends here.', { color: COLORS.dim, originX: 0.5, originY: 0.5, maxWidth: 320, align: 1 }));
    this.spot('giveUp', 400, 318);
    o(new Button(this, 324, 296, 152, 44, 'Give up', COLORS.red, () => this.finishRun(false), { big: true }));
    this.spot('keepPlaying', 560, 318);
    o(new Button(this, 484, 296, 152, 44, 'Keep playing', COLORS.green, () => this.closeOverlay(), { big: true }));
  }

  /** the collection, over the run (which waits under it) */
  private openCollection(): void {
    this.closeOverlay();
    this.scene.pause();
    this.scene.launch('collection', { from: 'run' });
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
        tip: () => ({ title: d.name, color: RARITY_COLORS[d.rarity], lines: jokerLines(run, j), badge: { text: RARITY_NAMES[d.rarity], color: RARITY_COLORS[d.rarity] } }),
        buttons: () => (canSell ? [{ label: 'SELL', sub: `$${jokerSellValue(j)}`, color: COLORS.green, side: 'right', run: sell }] : []),
        targets: () => (canSell ? [{ rect: SELL_JOKER_ZONE, color: COLORS.gold, lines: ['SELL', `$${jokerSellValue(j)}`], active: true, release: sell }] : []),
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
        tip: () => ({ title: d.name, color: COLORS.purple, lines: [t.skill && d.skillText ? d.skillText(SKILL_NAMES[t.skill]) : d.text], badge: { text: 'Boost', color: COLORS.purple } }),
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
          ...(cap[sk] > cur ? [`${cap[sk] - cur} of them come from Power Cards.`] : []),
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
    this.btn('reset', x + 16, y + 362, 100, 30, 'Reset', COLORS.gray, reset, { enabled: st.moved + st.added > 0 });
    // a best guess: the skills the levels of the round ask for, then the ones most levels need
    const autoPick = () => {
      if (!run.autoAssign()) return;
      this.save();
      this.render();
    };
    this.btn('autoPick', x + 124, y + 362, 100, 30, 'Auto pick', COLORS.blue, autoPick);
    const done = () => {
      if (!run.finishAssignment()) return;
      this.save();
      this.render();
    };
    this.btn('done', x + 232, y + 362, w - 248, 30, 'Done', COLORS.orange, done, { big: true, enabled: run.canFinishAssignment() });

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
    k(label(this, x + 10, y + 10, BLIND_NAMES[b.kind], { color: done ? COLORS.dim : color }));
    const name = k(label(this, x + w - 52, y + 10, levelName(l), { purple: true, originX: 1 }));
    this.wikiButton(l, name.x + 6, y + 9, `wiki:${p.index}`);
    k(label(this, x + 10, y + 34, l.title, { color: COLORS.text, maxWidth: w - 20 }));
    k(label(this, x + 10, y + 56, rescueText(p), { color: COLORS.dim }));
    this.skillCells(k, p, x + 10, y + 82, x - 120);
    if (done) {
      k(label(this, x + w - 10, y + 56, b.status === 'skipped' ? 'Skipped' : 'Done', { color: COLORS.dim, originX: 1 }));
      k(this.add.rectangle(x, y, w, h, 0x000000, 0.4).setOrigin(0, 0));
    } else this.btn(`preview:${p.index}`, x + w - 74, y + 53, 64, 20, 'Preview', COLORS.blue, () => this.showLevelPreview(run, p.index));
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
        lines: [`The level has ${p.allocation[sk]}${p.aboveMax[sk] ? ` (+${p.aboveMax[sk]} from Power Cards)` : ''}, you would bring ${u}.`],
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
    o(this.add.rectangle(-W, -H, 3 * W, 3 * H, 0x000000, dim).setOrigin(0, 0).setInteractive());
    return o;
  }

  /**
   * A level of the ante as it starts, at twice its size: drag it (or the strip of the whole level below it; or the
   * arrow keys and the mouse wheel) to look around. With its numbers and skills, and what the team would bring.
   */
  private showLevelPreview(run: RunSession, index: number, onClose?: () => void): void {
    const o = this.openOverlay(0.7);
    const p = run.preview(index);
    const l = p.level;
    const color = BLIND_COLORS[p.blind.kind];
    o(panel(this, 20, 16, 920, 508, COLORS.panel, color, 12));
    const kind = o(label(this, 40, 30, BLIND_NAMES[p.blind.kind], { color }));
    const name = o(label(this, kind.x + kind.width + 12, 30, levelName(l), { purple: true }));
    const wiki = o(this.wikiButton(l, name.x + name.width + 8, 29, 'wiki:preview'));
    o(label(this, wiki.x + wiki.bw + 12, 30, l.title, { color: COLORS.text, maxWidth: 800 - wiki.x - wiki.bw }));
    this.spot('close', 828 + 46, 26 + 14);
    o(
      new Button(this, 828, 26, 92, 28, 'Close', COLORS.orange, () => {
        this.closeOverlay();
        onClose?.();
      }),
    );
    const lemmings = (p.squad < l.lemmings ? `${l.lemmings} (you have ${p.squad})` : String(l.lemmings)) + (p.extra ? ` +${p.extra}` : '');
    const hz = levelHazards(this.app.style, this.app.data.provider, l);
    o(label(this, 40, 56, `Lemmings ${lemmings} · Rescue ${p.required} (${percent(p.required, p.squad + p.extra)}%) · ${hazardsText(hz)}`, { color: COLORS.dim }));
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
    // the name of the level, and next to it the page of the level on the Lemmings Wiki
    const name = k(label(this, x + w / 2 - WIKI_W / 2 - 3, y + 74, levelName(l), { purple: true, originX: 0.5 }));
    this.wikiButton(l, name.x + name.width / 2 + 6, y + 73, `wiki:${p.index}`);
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
    row(y + 171, 'Lemmings', (mine ? `${l.lemmings}, you have ${p.squad}` : String(l.lemmings)) + (p.extra ? ` +${p.extra}` : ''), mine ? COLORS.orange : COLORS.text);
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
    row(y + 191, 'Rescue at least', `${p.required} (${percent(p.required, p.squad + p.extra)}%)`, p.tooFewLemmings ? COLORS.red : COLORS.text);
    const rescueZone = k(this.add.zone(x + 8, y + 190, w - 16, 20).setOrigin(0, 0).setInteractive());
    hoverTip(rescueZone, this.tip, () => ({
      title: 'Rescue count',
      color: COLORS.blue,
      lines: [
        `The level asks for ${l.rescue}; in round ${run.state.ante} you need ${p.required}.`,
        'The rescue count is the lemmings saved, then your Power Cards from left to right: +Rescues, then X Rescues.',
        ...(p.extra ? [`+${p.extra} lemmings drop in besides your squad (Power Cards).`] : []),
      ],
      x: x + 20,
      y: y + 212,
    }));

    // skills: the level's allocation and what you bring (min(abilities, allocation))
    // (the tooltip of a skill says which number is which; the colour of the second says how it compares)
    SKILLS.forEach((sk, i) => {
      const cx = x + 12 + (i % 4) * 48;
      const cy = y + 220 + Math.floor(i / 4) * 40;
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
          `The level has ${p.allocation[sk]}${p.aboveMax[sk] ? ` (+${p.aboveMax[sk]} from Power Cards)` : ''}, you bring ${u}.`,
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
    if (meta?.fewest) k(label(this, x + 12, y + 310, `Your best: ${meta.best}%, ${totalSkills(meta.fewest)} skills`, { color: COLORS.teal, maxWidth: w - 24 }));

    // the reward, and what skipping gives (the boss: another level instead)
    k(label(this, x + 12, y + 355, 'Reward:', { color: COLORS.dim }));
    k(label(this, x + w - 12, y + 355, `${'$'.repeat(p.reward)}+`, { color: COLORS.gold, originX: 1 }));
    if (b.kind === 'boss') {
      if (b.status !== 'defeated' && !run.state.bossRerolled) {
        const can = run.canRerollBoss();
        const rerollTip = (): TipContent => ({
          title: "Director's Cut",
          color: COLORS.red,
          lines: ['Another level for Level 3, from the same band.', 'Once per round, before Level 3 is played.'],
          x: x - 60,
          y: y + 270,
        });
        const reroll = () => {
          if (!run.rerollBoss()) return;
          this.save();
          this.render();
        };
        const rr = this.btn('rerollBoss', x + 8, y + 374, w - 16, 26, `Reroll Level 3 $${run.bossRerollPrice()}`, COLORS.red, reroll, { enabled: can });
        hoverTip(rr, this.tip, rerollTip, !can);
      }
    } else if (b.tag) {
      const tag = tagDef(b.tag);
      const tagLabel = k(label(this, x + 12, y + 379, tag.name, { color: done ? COLORS.dim : COLORS.orange, maxWidth: w - 96 }));
      tagLabel.setInteractive();
      hoverTip(tagLabel, this.tip, () => ({
        title: `Skip for: ${tag.name}`,
        color: COLORS.orange,
        lines: [tag.text, '', 'No reward and no shop for this level.'],
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
    this.app.currentLevelInfo = run.level(setup.levelId).info;
    gotoScreen(this, ScreenType.Preview);
  }

  private skip(run: RunSession): void {
    const notes = run.skipBlind();
    this.save();
    this.render();
    this.toast(notes.join('\n'));
  }

  /* -------------------------------------------------------------------------------------------- result */

  /** a won level: its result becomes the colony's, and it pays (the cash out) */
  private acceptResult(run: RunSession): void {
    const out = run.state.outcome!;
    const levelId = run.state.setup!.levelId;
    run.accept();
    const meta = loadMeta();
    recordLevel(meta, levelId, out);
    saveMeta(meta);
    this.save();
    this.sfx(SoundEffect.Yippee);
  }

  private finishRun(won: boolean): void {
    const run = this.run;
    if (!run) return;
    if (!won) run.giveUp();
    this.save();
    this.render();
  }

  /** the end of a run (won, given up, or a level that was not won): the records, once */
  private noteEnd(run: RunSession): void {
    if (endedRuns.has(run)) return;
    endedRuns.add(run);
    const meta = loadMeta();
    if (run.state.won) meta.wins++;
    meta.bestAnte = Math.max(meta.bestAnte, run.state.ante);
    saveMeta(meta);
    this.save();
    this.sfx(run.state.won ? SoundEffect.Yippee : SoundEffect.Explosion);
  }

  /* -------------------------------------------------------------------------------------------- cash out */

  /** "Rescue count  3  +6 Abstract Lemming  X5 Personal Space  = 45", wrapped; returns the y below it */
  private rescueCountRow(lines: RescueLine[], x: number, y: number, w: number): number {
    const k = this.k.bind(this);
    let cx = x;
    let cy = y;
    const put = (text: string, color: number) => {
      const t = k(label(this, cx, cy, text, { color }));
      if (cx > x && cx + t.width > x + w) {
        cx = x + 12;
        cy += 18;
        t.setPosition(cx, cy);
      }
      cx += t.width + 8;
    };
    put('Rescue count', COLORS.text);
    put(String(lines[0].total), COLORS.blue);
    for (const ln of lines.slice(1)) {
      if (ln.plus) put(`+${ln.plus} ${ln.label}`, COLORS.blue);
      if (ln.times !== undefined) put(`X${ln.times} ${ln.label}`, COLORS.red);
    }
    put(`= ${lines[lines.length - 1].total}`, COLORS.gold);
    return cy + 20;
  }

  /** The cash out of Balatro: the button on top, below it how the level went, and what it paid, line by line. */
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
    this.btn('cashout', x + 12, y + 12, w - 24, 48, `Cash Out: $${cash.total}`, COLORS.orange, cashOut, { big: true, size: 21 });
    this.well(x + 12, y + 70, w - 24, 340);
    // how the level went
    let ly = y + 80;
    const res = cash.result;
    const setup = run.state.setup;
    if (setup) {
      const blind = run.state.blinds[setup.blind];
      const l = run.level(setup.levelId);
      const head = k(label(this, x + 24, ly, BLIND_NAMES[blind.kind], { color: BLIND_COLORS[blind.kind] }));
      k(label(this, head.x + head.width + 10, ly, `${levelName(l)}  ${l.title}`, { color: COLORS.lilac, maxWidth: w - head.width - 60 }));
      ly += 22;
    }
    if (res) {
      const counted = res.scoring && res.scoring.length > 1;
      k(label(this, x + 24, ly, `Rescued ${res.rescued} of ${res.hand} (${percent(res.rescued, res.hand)}%), you needed ${counted ? 'a rescue count of ' : ''}${res.required}.`, { color: COLORS.green }));
      ly += 20;
      // the rescue count as Balatro counts a hand: the saved, then the Power Cards from left to right
      if (counted) ly = this.rescueCountRow(res.scoring!, x + 24, ly, w - 48) + 2;
      if (res.lost) {
        k(label(this, x + 24, ly, `Lost ${res.lost} (${res.deaths})`, { color: COLORS.red, maxWidth: w - 48 }));
        ly += 20;
      }
      res.specials.slice(0, 4).forEach((sp, i) => {
        const cx = x + 24 + (i % 2) * 250;
        const cy = ly + Math.floor(i / 2) * 20;
        k(lemmingSprite(this, cx + 8, cy + 7, FATE_ANIMS[sp.fate] ?? 'walk', 1)).setTint(EDITION_TINTS[sp.edition]);
        k(label(this, cx + 22, cy, `${sp.title}: ${FATE_TEXTS[sp.fate]}`, { color: isDeath(sp.fate) ? COLORS.red : sp.fate === 'saved' ? COLORS.green : COLORS.text, maxWidth: 226 }));
      });
      ly += Math.ceil(Math.min(4, res.specials.length) / 2) * 20;
    }
    const rule = k(this.add.graphics());
    rule.fillStyle(COLORS.panelLight, 1);
    rule.fillRect(x + 24, ly + 4, w - 48, 2);
    ly += 14;
    // what it paid
    const items: Phaser.GameObjects.BitmapText[] = [];
    const top = ly;
    cash.lines.forEach((ln, i) => {
      const ly = top + i * 22;
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
    const ty = top + cash.lines.length * 22 + 6;
    const room = Math.max(1, Math.floor((y + 404 - ty) / 20));
    cash.notes.slice(0, room).forEach((n, i) => k(label(this, x + 24, ty + i * 20, n, { color: COLORS.dim, maxWidth: w - 48 })));
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
    this.btn('nextRound', x + 12, y + 12, 124, 58, 'Next\nLevel', COLORS.red, nextRound, { big: true });
    const reroll = () => {
      if (!run.reroll()) return;
      this.save();
      this.render();
    };
    this.btn('reroll', x + 12, y + 80, 124, 58, 'Reroll', COLORS.green, reroll, { big: true, enabled: run.canAfford(run.rerollPrice()), sub: run.rerollPrice() === 0 ? `FREE (${run.freeRerollsLeft()})` : `$${run.rerollPrice()}` });

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
      const name = k(label(this, x + 20, by + 70, levelName(nl), { purple: true }));
      this.wikiButton(nl, name.x + name.width + 6, by + 69, 'wiki:next');
      const np = run.preview(index);
      k(label(this, x + 220, by + 6, `Rescue ${np.required} (${percent(np.required, np.squad + np.extra)}%)`, { color: COLORS.dim, originX: 1 }));
      k(label(this, x + 20, by + 90, nl.title, { color: COLORS.text, maxWidth: 200 }));
      const hz = levelHazards(this.app.style, this.app.data.provider, nl);
      k(label(this, x + 20, by + 110, hazardsText(hz), { color: hz.water || hz.fire || hz.traps ? COLORS.red : COLORS.green, maxWidth: 200 }));
    } else k(label(this, x + 20, by + 6, `Next: Round ${s.ante + 1}`, { color: COLORS.orange }));

    // the packs, and the extra offers of a Supply Drop
    const packs: Rect = { x: x + 238, y: by, w: w - 250, h: 130 };
    this.well(packs.x, packs.y, packs.w, packs.h);
    const packOffers = (shop.packs ?? []).filter((o) => !o.sold);
    const extras = shop.offers.slice(3).filter((o) => !o.sold);
    const px = this.slots(packs, packOffers.length + extras.length);
    const py = packs.y + 36 + CARD_H / 2;
    packOffers.forEach((o, i) => this.packCard(run, o, px[i], py, `pack:${i}`));
    extras.forEach((o, i) => this.offerCard(run, o, px[packOffers.length + i], py, `extra:${i}`));
    if (!packOffers.length && !extras.length) k(label(this, packs.x + packs.w / 2, packs.y + packs.h / 2, 'Sold out', { color: COLORS.dim, originX: 0.5, originY: 0.5 }));

    k(label(this, x + w / 2, y + 296, touch.active ? 'Drag a card up to buy it, or tap it for what it is' : 'Drag a card up to buy it, or click it for its Buy button', { color: COLORS.dim, originX: 0.5 }));
  }

  /** a pack of the shop: opened when it is bought (by a drag to the gadgets, or with its Open button) */
  private packCard(run: RunSession, o: ShopOffer, cx: number, cy: number, spot: string): void {
    const kind = o.id as PackKind;
    const d = PACKS[kind];
    const look = PACK_LOOKS[kind];
    const price = `$${o.price}`;
    const card = this.k(new CardView(this, cx, cy, { color: look.color, art: look.art, price, pack: look.band }));
    this.spot(spot, cx, cy);
    const open = () => this.openPack(run, o, card);
    this.table.add(card, {
      tip: () => ({ title: d.name, color: look.color, lines: [d.text, ...(run.canBuy(o) ? [] : ['', 'Not enough money.'])], badge: { text: 'Pack', color: look.color } }),
      buttons: () => [{ label: 'OPEN', color: COLORS.orange, side: 'below', enabled: run.canBuy(o), run: open }],
      targets: () => [{ rect: BUY_ZONE, color: COLORS.green, lines: ['OPEN', price], active: run.canBuy(o), release: open, refused: open }],
    });
  }

  /** a pack is bought: it bursts open (and the shop makes way for its cards) */
  private openPack(run: RunSession, o: ShopOffer, card: CardView): void {
    if (!run.canBuy(o)) {
      this.toast('Not enough money.');
      return;
    }
    this.table.select(null);
    this.tip.hide();
    card.disableInteractive();
    card.setDepth(900);
    this.sfx(SoundEffect.AssignSkill);
    this.tweens.add({
      targets: card,
      scale: 1.6,
      alpha: 0,
      angle: 12,
      duration: 260,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        if (!run.buy(o.uid)) return;
        this.save();
        this.render();
      },
    });
  }

  /* -------------------------------------------------------------------------------------------- an open pack */

  /** The cards of an open pack, dealt one after the other: take one (tap it, or drag it up), or skip the pack. */
  private renderPack(run: RunSession): void {
    const k = this.k.bind(this);
    const pack = run.state.pack!;
    const d = PACKS[pack.kind];
    const cx = (MAIN_X + MAIN_R) / 2;
    k(label(this, cx, MAIN_Y + 30, d.name, { size: 48, originX: 0.5, originY: 0.5 }));
    k(label(this, cx, MAIN_Y + 72, `Choose 1 of ${pack.choices.length}`, { size: 24, color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    const area: Rect = { x: MAIN_X + 40, y: MAIN_Y + 96, w: MAIN_R - MAIN_X - 80, h: 200 };
    this.well(area.x, area.y, area.w, area.h, 0x000000, 0.35, 12);
    const cw = 92;
    const ch = 123;
    const pitch = Math.min(cw + 30, (area.w - 40) / Math.max(1, pack.choices.length));
    const x0 = cx - (pitch * (pack.choices.length - 1)) / 2;
    pack.choices.forEach((c, i) => {
      const info = this.choiceInfo(run, c);
      const x = x0 + i * pitch;
      const y = area.y + area.h / 2 - 8;
      const card = k(new CardView(this, x, y, { color: info.color, art: info.art }, cw, ch));
      this.spot(`choice:${i}`, x, y);
      // its name below it (the popup says the rest)
      const name = k(label(this, x, area.y + area.h - 12, info.title, { color: COLORS.text, originX: 0.5, originY: 0.5, maxWidth: pitch - 6, align: 1 }));
      name.setAlpha(0);
      this.tweens.add({ targets: name, alpha: 1, duration: 200, delay: 480 + i * 150 });
      const verb = c.type === 'tarot' ? 'USE' : 'TAKE';
      const can = run.canChoose(i);
      const take = () => this.choose(run, i);
      this.table.add(card, {
        tip: () => ({ title: info.title, color: info.color, lines: [...info.lines, ...(can ? [] : ['', 'No room for another Power Card (sell one).'])], badge: info.badge }),
        buttons: () => [{ label: verb, color: c.type === 'tarot' ? COLORS.red : COLORS.green, side: 'below', enabled: can, run: take }],
        targets: () => [{ rect: BUY_ZONE, color: COLORS.green, lines: [verb], active: can, release: take }],
      });
      // dealt from the pack: turned over one after the other
      card.scaleX = 0;
      this.tweens.add({ targets: card, scaleX: 1, duration: 160, delay: 380 + i * 150, ease: 'Back.easeOut', onStart: () => this.sfx(SoundEffect.AssignSkill) });
    });
    this.btn('skipPack', cx - 70, area.y + area.h + 18, 140, 34, 'Skip', COLORS.gray, () => {
      run.skipPack();
      this.save();
      this.render();
    }, { big: true });
    k(label(this, cx, area.y + area.h + 72, touch.active ? 'Tap a card for what it is, or drag it up to take it' : 'Click a card for what it is, or drag it up to take it', { color: COLORS.dim, originX: 0.5 }));
  }

  private choose(run: RunSession, index: number): void {
    const c = run.state.pack?.choices[index];
    if (!c) return;
    if (c.type === 'tarot') {
      const d = tarotDef(c.id);
      if (d.select > 0) {
        this.showColony({ pack: index, max: d.select, name: d.name, text: d.text, pair: d.pair });
        return;
      }
    }
    const notes = run.choosePack(index);
    if (!notes) return;
    this.sfx(SoundEffect.AssignSkill);
    this.save();
    this.render();
    this.toast(notes.join('\n'));
  }

  /** what a card of a pack is */
  private choiceInfo(run: RunSession, c: PackChoice): { title: string; color: number; lines: string[]; art: Art; badge: { text: string; color: number } } {
    const lemmings = (title: string, line: string, art: Art) => ({ title, color: COLORS.blue, lines: [line], art, badge: { text: 'Lemmings', color: COLORS.blue } });
    switch (c.type) {
      case 'recruits':
        return lemmings(`${c.amount} Lemmings`, `{!}${c.amount}{} plain lemmings join the colony`, { anim: 'walk' });
      case 'specials': {
        const n = c.amount;
        switch (c.trait) {
          case 'floater':
            return lemmings(`${n} Floaters`, `{!}${n}{} {s}Floaters{} join the colony`, { anim: 'float' });
          case 'climber':
            return lemmings(`${n} Climbers`, `{!}${n}{} {s}Climbers{} join the colony`, { anim: 'climb' });
          case 'athlete':
            return lemmings('An Athlete', 'A {s}Climber{} and {s}Floater{} joins the colony', { anim: 'climb', tint: 0x9fd0ff });
          case 'insured':
            return lemmings(`${n} Insured`, `{!}${n}{} {!}Insured{} lemmings join the colony. ${TRAIT_TEXTS.insured}`, { anim: 'block', tint: 0xffd0a0 });
          default:
            return lemmings(`A ${EDITION_NAMES[c.trait]} Lemming`, `A {!}${EDITION_NAMES[c.trait]}{} lemming joins the colony. ${EDITION_TEXTS[c.trait]}`, { anim: c.trait === 'mentor' ? 'build' : c.trait === 'champion' ? 'exit' : 'walk', tint: EDITION_TINTS[c.trait] });
        }
      }
      case 'ability':
        return {
          title: `+${c.amount} ${SKILL_PLURALS[c.skill]}`,
          color: COLORS.teal,
          lines: [
            `{!}+${c.amount}{} {s}${SKILL_NAMES[c.skill]}{} ability${c.minus ? `, {x}-${c.minusAmount}{} {s}${SKILL_NAMES[c.minus]}{} ability` : ''}`,
            `{~}(Currently{} {!}${run.capability()[c.skill]}{}${c.minus ? `{~} and{} {!}${run.capability()[c.minus]}{}` : ''}{~}){}`,
          ],
          art: { icon: c.skill },
          badge: { text: c.minus ? 'Trade' : 'Training', color: COLORS.teal },
        };
      case 'allSkills':
        return { title: 'All-round Training', color: COLORS.teal, lines: [`{!}+${c.amount}{} ability in every skill`], art: { text: `+${c.amount}`, color: COLORS.teal }, badge: { text: 'Training', color: COLORS.teal } };
      case 'tarot': {
        const d = tarotDef(c.id);
        const text = c.skill && d.skillText ? d.skillText(SKILL_NAMES[c.skill]) : d.text;
        return { title: d.name, color: COLORS.purple, lines: [text, '{~}(Used at once){}'], art: c.id === 'manual' && c.skill ? { icon: c.skill } : TAROT_ART[c.id], badge: { text: 'Boost', color: COLORS.purple } };
      }
      case 'joker': {
        const d = jokerDef(c.id);
        return { title: d.name, color: RARITY_COLORS[d.rarity], lines: [d.text], art: JOKER_ART[c.id], badge: { text: RARITY_NAMES[d.rarity], color: RARITY_COLORS[d.rarity] } };
      }
    }
    throw new Error('unknown card of a pack');
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
    if (!run.canAfford(o.price)) return 'Not enough money.';
    if (o.type === 'joker' && s.jokers.length >= JOKER_SLOTS) return 'No room for another Power Card (sell one).';
    if (o.type === 'tarot' && s.tarots.length >= TAROT_SLOTS) return 'No room for another boost (use one).';
    return '';
  }

  private offerInfo(run: RunSession, o: ShopOffer): { title: string; color: number; lines: string[]; art: Art; badge: { text: string; color: number } } {
    switch (o.type) {
      case 'pack': {
        const d = PACKS[o.id as PackKind];
        const look = PACK_LOOKS[o.id as PackKind];
        return { title: d.name, color: look.color, lines: [d.text], art: look.art, badge: { text: 'Pack', color: look.color } };
      }
      case 'joker': {
        const d = jokerDef(o.id);
        return { title: d.name, color: RARITY_COLORS[d.rarity], lines: [d.text], art: JOKER_ART[d.id], badge: { text: RARITY_NAMES[d.rarity], color: RARITY_COLORS[d.rarity] } };
      }
      case 'tarot': {
        const d = tarotDef(o.id);
        const text = o.skill && d.skillText ? d.skillText(SKILL_NAMES[o.skill]) : d.text;
        return { title: d.name, color: COLORS.purple, lines: [text], art: o.id === 'manual' && o.skill ? { icon: o.skill } : TAROT_ART[d.id], badge: { text: 'Boost', color: COLORS.purple } };
      }
      case 'training': {
        const sk = o.skill!;
        return {
          title: `${SKILL_NAMES[sk]} Training`,
          color: COLORS.teal,
          lines: [`{!}+${o.amount}{} {s}${SKILL_NAMES[sk]}{} ability`, `{~}(Currently{} {!}${run.capability()[sk]}{}{~}){}`],
          art: { icon: sk },
          badge: { text: 'Training', color: COLORS.teal },
        };
      }
      case 'drive': {
        const sk = o.skill!;
        return {
          title: `${SKILL_NAMES[sk]} Recruitment Drive`,
          color: COLORS.teal,
          lines: [`{!}${o.amount}{} lemmings join the colony and {!}+${o.amount}{} {s}${SKILL_NAMES[sk]}{} ability`],
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
      this.showColony({ offer: o.uid, max: d.select, name: d.name, text: d.text, pair: d.pair });
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
      this.toast('Boosts can be used on the level screen and in the shop.');
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
    this.showColony({ uid, max: d.select, name: d.name, text: d.text, pair: d.pair });
  }

  private closeOverlay(): void {
    const objects = this.overlay;
    const cleanup = this.overlayCleanup;
    // (taken first: a cleanup can render the screen again, which closes the overlay again)
    this.overlay = [];
    this.overlayCleanup = [];
    this.previewPan = null;
    this.overlayKey = null;
    for (const o of objects) o.destroy();
    for (const f of cleanup) f();
  }

  /**
   * The colony at home (see home.ts and HomeView): every lemming of it in a little level of its own, played by the game.
   * Pick shows who a lemming is (a drag picks a group); the skills are free at home, to sort the colony with walls,
   * bridges and blockers, and the home stays as it is left. The lemmings picked can be preferred for squads or avoided.
   * With a boost, the lemmings picked are the ones it is used on.
   */
  private showColony(tarot: TarotUse | null): void {
    const run = this.run;
    if (!run) return;
    const o = this.openOverlay(0.6);
    const s = run.state;
    const colony = () => s.colony;
    // the order of Previous and Next: the special lemmings first
    const order = () => [...colony().filter(isSpecial), ...colony().filter((c) => !isSpecial(c))];
    const inSquad = (c: LemmingCard) => (s.setup?.hand ?? []).includes(c.id);
    o(panel(this, 40, 20, 880, 500, COLORS.panel, COLORS.purple, 12));
    o(label(this, 64, 34, tarot ? `${tarot.name}: select ${tarot.max === 1 ? 'a lemming' : `up to ${tarot.max} lemmings`}` : `Your colony: ${colony().length} lemmings`, { size: 32, color: COLORS.gold, maxWidth: 820 }));
    const sub = o(label(this, 64, 72, '', { color: COLORS.dim, maxWidth: 620 }));
    /** the lemmings picked: one, or a group (a box); with a boost, the ones selected for it */
    let selection: number[] = [];
    let picked: LemmingCard | null = null;
    let changed = false;
    let resetting = false;
    const updateSub = () => {
      if (tarot) {
        sub.setText(`${selection.length} of ${tarot.max} selected${selection.length ? ': ' + selection.map((id) => run.card(id)?.name ?? '').join(', ') : ''}`);
        return;
      }
      const specials = this.specialCounts(colony());
      const prefer = colony().filter((c) => c.pref === 'prefer').length;
      const avoid = colony().filter((c) => c.pref === 'avoid').length;
      const prefs = prefer || avoid ? ` · {c:green}${prefer} preferred{}, {x}${avoid} avoided{}` : '';
      sub.setText(plainText((specials ? `Special: ${specials}` : 'All of them plain lemmings.') + prefs));
    };

    // the home, played by the game (with its sounds, without its music)
    const options = { soundMgr: this.app.sound, soundOptions: new Set([...this.app.config.soundOptions].filter((x) => x !== SoundOption.Music)) };
    const home = new ColonyHome(this.app.data.provider, run.catalog.get(HOME_LEVEL).info, colony, s.home, options);
    const info = new Tooltip(this);
    const view = new HomeView(this, home, 56, 96, o, {
      colony,
      onPick: (c) => (tarot ? (c ? toggle(c) : null) : pickOne(c)),
      onBox: (cards) => (tarot ? boxForBoost(cards) : pickGroup(cards)),
      onHover: (c, x, y) => {
        if (touch.active) return;
        if (!c) {
          if (this.tip.owner && (this.tip.owner as { id?: number }).id !== undefined) this.tip.hide();
          return;
        }
        if (this.tip.owner === c) return;
        showTip(this.tip, { title: cardTitle(c), color: this.cardColor(c), lines: [], x, y: y - 58, center: true, width: Math.min(260, 40 + 8 * cardTitle(c).length), keywords: [] }, c);
      },
      spot: (name, x, y) => this.spot(name, x, y),
    });
    view.toolbar(56, 424);
    this.homeView = view;
    this.overlayCleanup.push(() => {
      if (!resetting) s.home = home.save();
      this.save();
      view.destroy();
      this.homeView = null;
      info.hide();
      this.tip.hide();
      if (changed) this.render();
    });

    // the panel at the side: who the lemmings picked are
    const showInfo = () => {
      const at = { x: 690, y: 96, width: 214, keywords: [] as { title: string; text: string }[] };
      const group = tarot ? [] : selection.map((id) => run.card(id)).filter((c): c is LemmingCard => !!c);
      if (picked && (tarot || group.length <= 1)) {
        info.show({ ...this.cardTip(picked, inSquad(picked)), ...at });
      } else if (group.length > 1) {
        const names = group.slice(0, 6).map((c) => c.name).join(', ') + (group.length > 6 ? ` and ${group.length - 6} more` : '');
        const specials = this.specialCounts(group);
        const prefer = group.filter((c) => c.pref === 'prefer').length;
        const avoid = group.filter((c) => c.pref === 'avoid').length;
        info.show({
          title: `${group.length} lemmings`,
          color: COLORS.gold,
          lines: [names, ...(specials ? ['', specials] : []), ...(prefer || avoid ? ['', `{c:green}${prefer} preferred{}, {x}${avoid} avoided{}`] : [])],
          badges: group.some(inSquad) ? [{ text: `${group.filter(inSquad).length} in squad`, color: LEMMING_BADGE_COLORS.squad }] : [],
          ...at,
        });
      } else
        info.show({
          title: tarot ? tarot.name : 'Your colony',
          color: tarot ? COLORS.purple : COLORS.gold,
          lines: tarot
            ? [...(tarot.text ? [tarot.text, ''] : []), 'Pick the lemmings, or drag a box around them.']
            : [
                '{!}Pick{} a lemming to see who it is, or drag a box around a group.',
                '',
                'Skills are {$}free{} at home. {!}Dirt{} and {!}Erase{} paint the ground, {!}Poof{} sends a lemming back to the {!}Trapdoor{}, which you can move.',
              ],
          ...at,
        });
      updateButtons();
      updateSub();
    };

    const mark = () => {
      view.marked.clear();
      for (const id of selection) view.marked.add(id);
      if (picked) view.marked.add(picked.id);
      view.focus = picked?.id ?? null;
    };
    const pickOne = (c: LemmingCard | null) => {
      picked = c;
      selection = c ? [c.id] : [];
      mark();
      showInfo();
      if (c) this.sfx(SoundEffect.SkillButtonSelect);
    };
    const pickGroup = (cards: LemmingCard[]) => {
      picked = cards.length === 1 ? cards[0] : null;
      selection = cards.map((c) => c.id);
      mark();
      showInfo();
      if (cards.length) this.sfx(SoundEffect.SkillButtonSelect);
    };
    // with a boost: selected, or put back
    const toggle = (c: LemmingCard) => {
      if (!tarot) return;
      picked = c;
      const i = selection.indexOf(c.id);
      if (i >= 0) selection.splice(i, 1);
      else if (selection.length < tarot.max) selection.push(c.id);
      else this.toast(`${tarot.name} takes ${tarot.max === 1 ? 'one lemming' : `${tarot.max} lemmings`}: put one back first.`);
      mark();
      showInfo();
      this.sfx(SoundEffect.SkillButtonSelect);
    };
    const boxForBoost = (cards: LemmingCard[]) => {
      if (!tarot || !cards.length) return;
      // a box of selected lemmings puts them back; else it selects as many as the boost takes
      if (cards.every((c) => selection.includes(c.id))) selection = selection.filter((id) => !cards.some((c) => c.id === id));
      else for (const c of cards) if (!selection.includes(c.id) && selection.length < tarot.max) selection.push(c.id);
      picked = cards[0];
      mark();
      showInfo();
      this.sfx(SoundEffect.SkillButtonSelect);
    };

    // Prefer / Normal / Avoid: for the squads (the lemmings picked)
    const prefButtons: Button[] = [];
    const setPref = (pref: 'prefer' | 'avoid' | null) => {
      if (!selection.length) return;
      run.setPreference(selection, pref);
      changed = true;
      this.save();
      this.sfx(SoundEffect.AssignSkill);
      showInfo();
    };
    if (!tarot) {
      const prefs: [string, 'prefer' | 'avoid' | null, number, string][] = [
        ['Prefer', 'prefer', COLORS.green, 'prefer'],
        ['Normal', null, COLORS.gray, 'normal'],
        ['Avoid', 'avoid', COLORS.red, 'avoid'],
      ];
      prefs.forEach(([caption, pref, color, spot], i) => {
        const bx = 690 + i * 73;
        this.spot(spot, bx + 34, 410);
        prefButtons.push(o(new Button(this, bx, 396, 68, 28, caption, color, () => setPref(pref))));
      });
    }

    // Previous and Next: one lemming after the other (also with the arrow keys; Enter selects it for a boost)
    const position = o(label(this, 797, 446, '', { color: COLORS.text, originX: 0.5, originY: 0.5 }));
    const browse = (d: number) => {
      const list = order();
      if (!list.length) return;
      const i = picked ? list.indexOf(picked) : d > 0 ? -1 : 0;
      const c = list[(i + d + list.length) % list.length];
      if (tarot) {
        picked = c;
        mark();
        showInfo();
      } else pickOne(c);
    };
    this.spot('colonyPrev', 720, 446);
    this.spot('colonyNext', 874, 446);
    o(new Button(this, 690, 432, 60, 28, '<', COLORS.blue, () => browse(-1), { big: true }));
    o(new Button(this, 844, 432, 60, 28, '>', COLORS.blue, () => browse(1), { big: true }));
    let selectButton: Button | null = null;
    const updateButtons = () => {
      const list = order();
      position.setText(picked && list.includes(picked) ? `${list.indexOf(picked) + 1} / ${list.length}` : `${list.length} lemmings`);
      for (const b of prefButtons) b.setVisible(selection.length > 0);
      if (selectButton) {
        selectButton.setVisible(!!picked);
        selectButton.setCaption(picked && selection.includes(picked.id) ? 'Put back' : 'Select');
      }
    };
    if (tarot) {
      this.spot('colonySelect', 797, 410);
      selectButton = o(new Button(this, 690, 396, 214, 28, 'Select', COLORS.purple, () => picked && toggle(picked)));
    }
    this.overlayKey = (key) => {
      if (key === 'ArrowLeft' || key === 'ArrowRight') browse(key === 'ArrowLeft' ? -1 : 1);
      else if (key === 'Enter' && picked && tarot) toggle(picked);
    };

    // a new home: the ground as at first (a second click to be sure)
    if (!tarot) {
      let sure = false;
      this.spot('newHome', 116, 494);
      const again = o(
        new Button(this, 56, 478, 120, 32, 'New home', COLORS.gray, () => {
          if (!sure) {
            sure = true;
            again.setCaption('Sure?');
            return;
          }
          resetting = true;
          s.home = undefined;
          this.closeOverlay();
          this.showColony(null);
        }),
      );
    }

    if (tarot) {
      this.spot('use', 665, 494);
      const use = () => {
        const ids = [...selection];
        const notes = tarot.pack !== undefined ? run.choosePack(tarot.pack, ids) : tarot.offer !== undefined ? run.buyAndUse(tarot.offer, ids) : run.useTarot(tarot.uid!, ids);
        if (!notes) {
          this.toast(
            tarot.pair && ids.length !== 2
              ? `${tarot.name} needs 2 lemmings: the first becomes like the second.`
              : ids.length === 0
                ? 'Select at least one lemming.'
                : 'That does not work (the squad of a level cannot leave the colony).',
          );
          return;
        }
        this.sfx(SoundEffect.AssignSkill);
        this.closeOverlay();
        this.render();
        this.toast(notes.join('\n'));
      };
      o(new Button(this, 600, 478, 130, 32, 'Use', COLORS.red, use));
    }
    this.spot('back', 820, 494);
    o(new Button(this, 750, 478, 140, 32, tarot ? 'Cancel' : 'Back', COLORS.orange, () => this.closeOverlay()));
    showInfo();
  }

  /** the colour of a lemming's name: its edition */
  private cardColor(c: LemmingCard): number {
    return EDITION_TINTS[c.edition] === 0xffffff ? COLORS.text : EDITION_TINTS[c.edition];
  }

  /**
   * Who a lemming is, as Balatro describes a card: what it does first (in colour), then its hair and clothes, and how
   * often it was saved; what it is (its edition, its abilities) in badges under it.
   */
  private cardTip(c: LemmingCard, inSquad: boolean): Pick<TipContent, 'title' | 'color' | 'lines' | 'badges'> {
    const does = [EDITION_TEXTS[c.edition], c.climber ? TRAIT_TEXTS.climber : '', c.floater ? TRAIT_TEXTS.floater : '', c.insured ? TRAIT_TEXTS.insured : ''].filter((t) => t);
    const saves = c.saves === 0 ? 'Not saved yet' : `Saved ${c.saves} time${c.saves === 1 ? '' : 's'}`;
    // (a line between one effect and the next, as Balatro has a box for each)
    const lines = [...does.flatMap((t) => [t, '']), colorsText(c), `{~}${saves}{}`];
    const badges: { text: string; color: number }[] = [];
    if (c.edition !== 'plain') badges.push({ text: EDITION_NAMES[c.edition], color: LEMMING_BADGE_COLORS[c.edition] });
    if (c.climber && c.floater) badges.push({ text: 'Athlete', color: LEMMING_BADGE_COLORS.athlete });
    else if (c.climber) badges.push({ text: 'Climber', color: LEMMING_BADGE_COLORS.climber });
    else if (c.floater) badges.push({ text: 'Floater', color: LEMMING_BADGE_COLORS.floater });
    if (c.insured) badges.push({ text: 'Insured', color: LEMMING_BADGE_COLORS.insured });
    if (inSquad) badges.push({ text: 'In squad', color: LEMMING_BADGE_COLORS.squad });
    return { title: c.name, color: this.cardColor(c), lines, badges };
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
    const out = s.outcome;
    const lostLevel = !s.won && out && !out.success && s.setup ? run.level(s.setup.levelId) : null;
    const why = lostLevel && out ? `${levelName(lostLevel)} was not won: ${out.score !== undefined && out.score !== out.rescued ? `rescue count ${out.score}` : `${out.rescued} of ${out.hand} saved`}, ${out.required} needed.` : '';
    k(label(this, x + w / 2, y + 80, s.won ? 'Your colony made it through all eight rounds.' : `Your colony reached round ${s.ante}.`, { color: COLORS.text, originX: 0.5 }));
    if (why) k(label(this, x + w / 2, y + 98, why, { color: COLORS.red, originX: 0.5 }));
    const st = s.stats;
    const lines = [
      `Levels won ${st.blindsWon}, skipped ${st.skipped}`,
      `Lemmings saved ${st.saved}, lost ${st.lost}, colony ${s.colony.length}`,
      `Money earned $${st.earned}`,
      `Power Cards: ${s.jokers.map((j) => jokerDef(j.id).name).join(', ') || 'none'}`,
      `Seed ${s.seed}`,
    ];
    this.well(x + 40, y + 122, w - 80, 126);
    k(label(this, x + w / 2, y + 134, lines.join('\n'), { color: COLORS.text, originX: 0.5, align: 1, maxWidth: w - 100 }));
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

  /** a small button that opens the page of a level on the Lemmings Wiki (in a new tab), for its strategy */
  private wikiButton(l: RunLevel, x: number, y: number, name: string): Button {
    const open = () => window.open(wikiUrl(l), '_blank', 'noopener');
    return this.btn(name, x, y, WIKI_W, 18, 'Wiki', COLORS.teal, open);
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

/** the runs whose end has been recorded (the end screen can be shown again: back from the title) */
const endedRuns = new WeakSet<RunSession>();

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

/** what a Power Card of the run is at now: the colour on the Checklist, the sell value it gained, the Trainings */
/**
 * The description of a Power Card of the run, as Balatro shows a joker: its colour or its lemming in the text, and
 * what it is at now at the end, "(Currently X1.4)".
 */
function jokerLines(run: RunSession, j: JokerInstance): string[] {
  const d = jokerDef(j.id);
  const s = run.state;
  const text = jokerText(d, j, (id) => run.card(id)?.name);
  const now = (v: string) => `{~}(Currently{} ${v}{~}){}`;
  let current: string | null = null;
  switch (j.id) {
    case 'personalspace':
      current = `{x}X${Math.max(1, JOKER_SLOTS - s.jokers.length)}{}`;
      break;
    case 'elders':
      current = `{x}X${+(1 + 0.2 * s.colony.filter((c) => c.edition === 'wise').length).toFixed(1)}{}`;
      break;
    case 'abstract':
      current = `{+}+${3 * s.jokers.length}{}`;
      break;
    case 'gym':
      current = `{x}X${+(1 + 0.1 * (j.counter ?? 0)).toFixed(1)}{}`;
      break;
    case 'inversecurve':
      current = `{!}-${Math.min(100, s.stats.blindsWon)}%{}`;
      break;
    case 'bootstraps':
      current = `{+}+${2 * Math.floor(Math.max(0, s.money) / 5)}{}`;
      break;
    case 'baseball':
      current = `{x}X${+(1.5 ** s.jokers.filter((x) => jokerDef(x.id).rarity === 'uncommon').length).toFixed(2)}{}`;
      break;
    case 'flashcard':
      current = `{+}+${j.counter ?? 0}{}`;
      break;
    case 'popcorn':
      current = `{+}+${Math.max(0, 20 - 4 * (j.counter ?? 0))}{}`;
      break;
    case 'yorick':
      current = `{x}X${1 + Math.floor((j.counter ?? 0) / 23)}{} (${j.counter ?? 0} lost)`;
      break;
    case 'longservice': {
      const left = 5 - ((j.counter ?? 0) % 6);
      current = left === 0 ? '{x}X3{} this level' : `${left} level${left === 1 ? '' : 's'} to go`;
      break;
    }
    case 'weakestlink':
      current = `{+}+${2 * Math.min(...SKILLS.map((sk) => run.capability()[sk]))}{}`;
      break;
    case 'reserves':
    {
      const blind = run.currentBlind;
      const squad = s.setup?.hand.length ?? (blind ? run.squadSize(run.level(blind.levelId)) : 0);
      current = `{+}+${Math.floor(Math.max(0, s.colony.length - squad) / 5)}{}`;
    }
      break;
    case 'nothanks':
      current = `{+}+${2 * (j.counter ?? 0)}{}`;
      break;
    case 'stampede':
    case 'campout':
    case 'fragile':
      current = `{x}X${+(1 + 0.25 * (j.counter ?? 0)).toFixed(2)}{}`;
      break;
    case 'bodysnatcher':
    case 'populationboom':
    case 'rabbitsfoot':
      current = `{x}X${+(1 + 0.1 * (j.counter ?? 0)).toFixed(1)}{}`;
      break;
    case 'jetpack':
      current = `{$}$${1 + (j.counter ?? 0)}{}`;
      break;
    case 'thinranks':
      current = `{+}+${2 * Math.max(0, START_COLONY - s.colony.length)}{}`;
      break;
    case 'boosterclub':
      current = `{+}+${s.stats.boostsUsed ?? 0}{}`;
      break;
    case 'bullmarket':
      current = `{+}+${Math.floor(Math.max(0, s.money) / 2)}{}`;
      break;
    case 'fizzypop':
      current = `${3 - (j.counter ?? 0)} level${3 - (j.counter ?? 0) === 1 ? '' : 's'} left`;
      break;
    case 'treasurechest':
      current = `{+}+${s.jokers.filter((x) => x !== j).reduce((n, x) => n + jokerSellValue(x), 0)}{}`;
      break;
    case 'skippingrope':
      current = `{x}X${+(1 + 0.25 * s.stats.skipped).toFixed(2)}{}`;
      break;
    case 'littlehelper':
      current = `{+}+${Math.floor((j.counter ?? 0) / 10)}{} (${j.counter ?? 0} saved)`;
      break;
    case 'mirrorimage':
      current = (j.counter ?? 0) >= 2 ? 'ready' : `${j.counter ?? 0}/2 levels`;
      break;
    case 'supersquad':
      current = `${s.colony.filter((c) => run.isSuper(c)).length} Super Lemmings`;
      break;
    case 'ohno':
      current = `{x}X${1 + (j.counter ?? 0)}{}`;
      break;
  }
  if (d.copies) {
    const t = run.copyOf(j.uid);
    return [text, t ? `{~}(Copying{} {!}${jokerDef(t.id).name}{}{~}){}` : '{~}(Nothing it can copy){}'];
  }
  return current ? [text, now(current)] : [text];
}
