/**
 * The roguelike screens around the levels: the blinds of the ante, the result of an attempt, the cash out, the shop,
 * the colony, and the end of a run. The levels themselves are played by the original screens (preview, game,
 * postview). Everything is laid out on a 960 x 540 screen that is scaled to the window.
 */
import * as Phaser from 'phaser';
import { SoundEffect } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { type RunLevel, levelName } from '../run/catalog.ts';
import { EDITION_NAMES, EDITION_TEXTS, FATE_TEXTS, type Fate, isDeath, JOKERS, jokerDef, type Rarity, tagDef, tarotDef } from '../run/content.ts';
import { normalizeSeed, randomSeed } from '../run/rng.ts';
import { type BlindPreview, cardTitle, isSpecial, RunSession, sellPrice } from '../run/session.ts';
import { describeSkills, SKILL_NAMES, SKILL_PLURALS, SKILLS, type Skill, totalSkills } from '../run/skills.ts';
import { ABILITY_CAP, ANTES, ATTEMPTS, BLIND_NAMES, type BlindKind, HIRE_PRICE, JOKER_SLOTS, type LemmingCard, type ShopOffer, TAROT_SLOTS } from '../run/state.ts';
import { loadMeta, loadRun, recordLevel, saveMeta, saveRun } from '../run/storage.ts';
import { BACKGROUND, ensureRunAssets, type LemmingAnim, lemmingSprite, levelImage, levelThumbnail, SKILL_ICONS } from '../run/ui/assets.ts';
import { Button, COLORS, containerHitArea, hoverTip, label, panel, showTip, type TipContent, Tooltip } from '../run/ui/widgets.ts';
import { cssPx, onTouchChange, safeAreaInsets, touch } from '../touch.ts';
import { ScreenType } from '../screens/base.ts';
import { getApp, gotoScreen, listen } from './shared.ts';

const W = 960;
const H = 540;
const MAIN_X = 240;
const MAIN_Y = 120;
/** the bar of points of the assignment screen: where it starts in the panel, and the width of a point */
const ASSIGN_BAR_X = 134;
const ASSIGN_SEG = 8;
/** the first row of the assignment screen (from the top of the panel), and the height of a row */
const ASSIGN_ROW_Y = 104;
const ASSIGN_ROW_H = 29;

const BLIND_COLORS: Record<BlindKind, number> = { small: COLORS.blue, big: COLORS.orange, boss: COLORS.red };
const RARITY_COLORS: Record<Rarity, number> = { common: COLORS.blue, uncommon: COLORS.green, rare: COLORS.red };

type Art = { anim: LemmingAnim; tint?: number } | { icon: string } | { text: string; color: number };

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

/** The level band names of an ante, for the sidebar. */
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
    ensureRunAssets(this, this.app);
    this.tip = new Tooltip(this);
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
   * Touch: the first tap on something that acts (buy, sell, use, hire, skip) shows what it is, the second tap acts.
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

  private clear(): void {
    this.tip.hide();
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.closeOverlay();
  }

  /** Builds the screen of the current phase. */
  private render(): void {
    this.clear();
    // background: the brown rock of the DOS screens, darkened
    this.k(this.add.tileSprite(0, 0, W, H, BACKGROUND).setOrigin(0, 0).setTint(0x8a7a8a));
    this.k(this.add.rectangle(0, 0, W, H, 0x05050c, 0.72).setOrigin(0, 0));
    const run = this.run;
    if (this.choosing || !run) {
      this.renderStart();
      return;
    }
    this.renderSidebar(run);
    this.renderTopBar(run);
    switch (run.state.phase) {
      case 'assign':
        this.renderAssign(run);
        break;
      case 'blinds':
      case 'playing':
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
  }

  /* -------------------------------------------------------------------------------------------- start */

  private renderStart(): void {
    const saved = loadRun();
    const meta = loadMeta();
    const k = this.k.bind(this);
    k(panel(this, 180, 40, 600, 460, COLORS.panel, COLORS.purple, 12));
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
    let y = 410;
    if (saved) {
      const s = saved;
      k(
        new Button(this, 210, y, 260, 52, 'Continue run', COLORS.blue, () => this.continueRun(s), {
          sub: `Ante ${s.ante}, $${s.money}, ${s.colony.length} lemmings`,
        }),
      );
      k(new Button(this, 490, y, 260, 52, 'New run', COLORS.red, () => this.newRun(seed), { sub: `seed ${seed}` }));
    } else k(new Button(this, 350, y, 260, 52, 'New run', COLORS.red, () => this.newRun(seed), { sub: `seed ${seed}` }));
    k(new Button(this, 210, 470, 120, 24, 'Seed...', COLORS.gray, () => this.askSeed()));
    k(new Button(this, 630, 470, 120, 24, 'Menu', COLORS.gray, () => this.toMenu()));
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

  /* -------------------------------------------------------------------------------------------- sidebar and top bar */

  private renderSidebar(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const blind = run.currentBlind;
    const color = blind ? BLIND_COLORS[blind.kind] : COLORS.purple;
    k(panel(this, 8, 8, 224, 524, COLORS.panel, COLORS.border, 10));
    // the phase
    const title: Record<string, string> = {
      assign: 'Assign your\nabilities',
      blinds: 'Choose your\nnext blind',
      playing: 'Choose your\nnext blind',
      result: 'Level over',
      cashout: 'Cash out',
      shop: 'Shop',
      over: s.won ? 'You won!' : 'Run over',
    };
    k(panel(this, 16, 16, 208, 64, color, 0x000000, 8));
    k(label(this, 120, 48, title[s.phase], { big: true, originX: 0.5, originY: 0.5, align: 1 }));
    // ante
    k(label(this, 20, 90, 'Ante', { color: COLORS.dim }));
    k(label(this, 62, 90, `${Math.min(s.ante, ANTES)} of ${ANTES}`, { color: COLORS.orange }));
    k(label(this, 216, 90, bandName(run), { color: COLORS.dim, originX: 1 }));
    // money
    k(panel(this, 16, 116, 208, 50, COLORS.dark, COLORS.border, 8));
    k(label(this, 120, 141, `$${s.money}`, { size: 32, big: true, color: COLORS.gold, originX: 0.5, originY: 0.5 }));
    // colony
    k(panel(this, 16, 176, 208, 92, COLORS.dark, COLORS.border, 8));
    k(lemmingSprite(this, 40, 206, 'walk', 2));
    k(label(this, 62, 188, `${s.colony.length} lemmings`, { color: COLORS.text }));
    const specials = run.specialCards();
    k(label(this, 62, 208, specials.length ? `${specials.length} special` : 'all plain', { color: COLORS.dim }));
    const colonyBtn = k(new Button(this, 24, 236, 192, 24, 'Colony', COLORS.purple, () => this.showColony(null)));
    // (touch: the button just opens the colony, which says all of this)
    hoverTip(
      colonyBtn,
      this.tip,
      () => ({
        title: 'Your colony',
        color: COLORS.purple,
        lines: [this.specialCounts(s.colony) || 'Only plain lemmings.', '', 'Click to see all your lemmings.'],
        x: 236,
        y: 200,
      }),
      false,
    );
    // abilities
    k(label(this, 20, 280, 'Abilities', { color: COLORS.dim }));
    const cap = run.capability();
    SKILLS.forEach((sk, i) => {
      const x = 22 + (i % 4) * 52;
      const y = 300 + Math.floor(i / 4) * 52;
      const icon = k(this.add.image(x, y, SKILL_ICONS, sk).setOrigin(0, 0).setScale(1.5));
      k(label(this, x + 25, y + 18, String(cap[sk]), { color: cap[sk] > 0 ? COLORS.text : COLORS.dim }));
      icon.setInteractive();
      hoverTip(icon, this.tip, () => ({
        title: SKILL_PLURALS[sk],
        color: COLORS.teal,
        lines: [
          `You can bring up to ${cap[sk]} ${SKILL_PLURALS[sk].toLowerCase()} to a level`,
          '(never more than the level allows).',
          ...(cap[sk] > s.capacity[sk] ? [`${s.capacity[sk]} of your own, +${cap[sk] - s.capacity[sk]} from jokers.`] : []),
        ],
        x: x + 30,
        y: y,
      }));
    });
    // stats and buttons
    k(label(this, 20, 412, `Saved ${s.stats.saved}   Lost ${s.stats.lost}`, { color: COLORS.dim }));
    k(label(this, 20, 432, `Seed ${s.seed}`, { color: COLORS.dim }));
    k(new Button(this, 24, 462, 92, 28, 'Menu', COLORS.gray, () => this.toMenu()));
    if (s.phase !== 'over')
      k(
        new Button(this, 124, 462, 92, 28, 'Give up', COLORS.red, () => {
          if (window.confirm('Give up this run?')) this.finishRun(false);
        }),
      );
    k(label(this, 20, 502, touch.active ? 'The run is saved as you go' : 'Esc: menu, the run is saved', { color: 0x606080 }));
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

  private renderTopBar(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    k(panel(this, MAIN_X, 8, 712, 104, COLORS.panel, COLORS.border, 10));
    k(label(this, MAIN_X + 12, 14, `Jokers ${s.jokers.length}/${JOKER_SLOTS}`, { color: COLORS.dim }));
    for (let i = 0; i < JOKER_SLOTS; i++) {
      const x = MAIN_X + 12 + i * 76;
      const j = s.jokers[i];
      if (!j) {
        k(panel(this, x, 34, 68, 70, COLORS.dark, COLORS.border, 6));
        continue;
      }
      const d = jokerDef(j.id);
      // (touch: one tap shows the joker and its sell button, under each other)
      this.card(x, 34, 68, 70, RARITY_COLORS[d.rarity], JOKER_ART[j.id], () => this.jokerMenu(run, j.uid, x, 34), () => ({
        title: d.name,
        color: RARITY_COLORS[d.rarity],
        lines: [d.text, '', `${d.rarity} joker, sells for $${sellPrice(j.id)}`],
        x: x,
        y: touch.active ? 154 : 110,
      }), null);
    }
    const tx = MAIN_X + 412;
    k(label(this, tx, 14, `Tarots ${s.tarots.length}/${TAROT_SLOTS}`, { color: COLORS.dim }));
    for (let i = 0; i < TAROT_SLOTS; i++) {
      const x = tx + i * 76;
      const t = s.tarots[i];
      if (!t) {
        k(panel(this, x, 34, 68, 70, COLORS.dark, COLORS.border, 6));
        continue;
      }
      const d = tarotDef(t.id);
      const art = t.id === 'manual' && t.skill ? { icon: t.skill } : TAROT_ART[t.id];
      this.card(x, 34, 68, 70, COLORS.purple, art, () => this.useTarot(run, t.uid), () => ({
        title: d.name,
        color: COLORS.purple,
        lines: [t.skill && d.skillText ? d.skillText(SKILL_NAMES[t.skill]) : d.text, ...(touch.active ? [] : ['', 'Click to use it.'])],
        x: x - 120,
        y: 110,
      }), 'Tap again to use it.');
    }
    // the blind being played
    const setup = s.setup;
    if (setup && (s.phase === 'result' || s.phase === 'cashout')) {
      const l = run.level(setup.levelId);
      k(label(this, MAIN_X + 580, 20, levelName(l), { purple: true }));
      k(label(this, MAIN_X + 580, 42, `Attempt ${setup.attempts}`, { color: COLORS.dim }));
    }
  }

  /** a card with art; click and tooltip */
  private card(
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    art: Art | undefined,
    onClick: (() => void) | null,
    tip: (() => TipContent) | null,
    /** touch: what the second tap does; null: the first tap shows the tooltip and acts (the action asks itself) */
    touchHint: string | null = 'Tap it again to go ahead.',
  ): Phaser.GameObjects.Container {
    const c = this.k(this.add.container(x, y));
    const g = panel(this, 0, 0, w, h, COLORS.dark, color, 6);
    g.fillStyle(color, 0.25);
    g.fillRoundedRect(4, 4, w - 8, h - 8, 4);
    c.add(g);
    if (art) {
      if ('anim' in art) {
        const sp = lemmingSprite(this, w / 2, h / 2, art.anim, w >= 90 ? 4 : 3);
        if (art.tint) sp.setTint(art.tint);
        c.add(sp);
      } else if ('icon' in art) c.add(this.add.image(w / 2, h / 2, SKILL_ICONS, art.icon).setScale(w >= 90 ? 3 : 2));
      else c.add(label(this, w / 2, h / 2, art.text, { size: 32, big: true, color: art.color, originX: 0.5, originY: 0.5 }));
    }
    c.setSize(w, h);
    c.setInteractive(containerHitArea(w, h), Phaser.Geom.Rectangle.Contains);
    c.on('pointerover', () => {
      if (touch.active) return;
      this.tweens.add({ targets: c, y: y - 4, duration: 80 });
      if (tip) showTip(this.tip, tip());
    });
    c.on('pointerout', () => {
      if (touch.active) return;
      this.tweens.add({ targets: c, y, duration: 80 });
      this.tip.hide();
    });
    c.on('pointerup', () => {
      if (!touch.active) {
        onClick?.();
        return;
      }
      if (!tip) {
        onClick?.();
        return;
      }
      if (!onClick) {
        if (this.tip.owner === c) this.tip.hide();
        else showTip(this.tip, tip(), c);
        return;
      }
      if (touchHint === null) {
        onClick();
        showTip(this.tip, tip(), c);
        return;
      }
      if (this.confirmTap(c, tip(), touchHint)) onClick();
    });
    return c;
  }

  private jokerMenu(run: RunSession, uid: number, x: number, y: number): void {
    const j = run.state.jokers.find((jj) => jj.uid === uid);
    if (!j) return;
    this.closeOverlay();
    const o = (g: Phaser.GameObjects.GameObject) => {
      this.overlay.push(g);
      return g;
    };
    // a click anywhere else closes it
    const away = o(this.add.zone(0, 0, W, H).setOrigin(0, 0).setDepth(499).setInteractive()) as Phaser.GameObjects.Zone;
    away.on('pointerdown', () => {
      this.closeOverlay();
      this.tip.hide();
    });
    o(panel(this, x - 6, y + 74, 140, 40, COLORS.dark, COLORS.border, 6).setDepth(500));
    o(
      new Button(this, x, y + 80, 128, 28, `Sell $${sellPrice(j.id)}`, COLORS.orange, () => {
        run.sellJoker(uid);
        this.sfx(SoundEffect.AssignSkill);
        this.save();
        this.render();
      }).setDepth(501),
    );
  }

  /* -------------------------------------------------------------------------------------------- blinds */

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
    const x = MAIN_X + 4;
    const y = MAIN_Y + 4;
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
      const g = k(this.add.graphics());
      for (let v = 0; v < ABILITY_CAP; v++) {
        const sx = bx + v * ASSIGN_SEG + 1;
        if (v < Math.min(cur, before)) g.fillStyle(COLORS.teal, 1);
        else if (v < cur) g.fillStyle(COLORS.gold, 1);
        else if (v < before) g.fillStyle(COLORS.red, 0.45);
        else g.fillStyle(COLORS.dark, 1);
        g.fillRect(sx, ry + 4, ASSIGN_SEG - 2, 18);
        if (v >= Math.max(cur, before)) {
          g.lineStyle(1, v < range.max ? COLORS.border : 0x24243c, 1);
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

    k(
      new Button(this, x + 16, y + 362, 110, 30, 'Reset', COLORS.gray, () => {
        run.resetAssignment();
        this.save();
        this.render();
      }, { enabled: st.moved + st.added > 0 }),
    );
    k(
      new Button(this, x + w - 166, y + 362, 150, 30, 'Done', COLORS.red, () => {
        if (!run.finishAssignment()) return;
        this.sfx(SoundEffect.LetsGo);
        this.save();
        this.render();
      }, { big: true, enabled: run.canFinishAssignment() }),
    );

    // the levels of the ante, with what the team brings as it is now
    const lx = x + w + 8;
    const lw = MAIN_X + 712 - lx;
    s.blinds.forEach((_, i) => this.renderAssignBlind(run, run.preview(i), lx, y + i * 137, lw, 130));
  }

  private renderAssignBlind(run: RunSession, p: BlindPreview, x: number, y: number, w: number, h: number): void {
    const k = this.k.bind(this);
    const b = p.blind;
    const l = p.level;
    const done = b.status === 'defeated' || b.status === 'skipped';
    const color = BLIND_COLORS[b.kind];
    k(panel(this, x, y, w, h, COLORS.panel, done ? COLORS.border : color, 10));
    k(label(this, x + 10, y + 8, BLIND_NAMES[b.kind], { color: done ? COLORS.dim : color }));
    k(label(this, x + w - 10, y + 8, levelName(l), { purple: true, originX: 1 }));
    k(label(this, x + 10, y + 27, l.title, { color: COLORS.text, maxWidth: w - 20 }));
    k(label(this, x + 10, y + 46, `Rescue ${p.required}/${p.squad} · ${minutes(p.minutes)} · Rate ${l.releaseRate}`, { color: COLORS.dim }));
    this.skillCells(k, p, x + 10, y + 68, x - 120);
    const summary = done ? { text: b.status === 'skipped' ? 'Skipped' : 'Defeated', color: COLORS.dim } : shortSummary(p);
    k(label(this, x + 10, y + 108, summary.text, { color: summary.color }));
    if (done) k(this.add.rectangle(x, y, w, h, 0x000000, 0.4).setOrigin(0, 0));
    else k(new Button(this, x + w - 74, y + 43, 64, 20, 'Preview', COLORS.blue, () => this.showLevelPreview(run, p.index)));
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

  /**
   * A level of the ante as it starts, at twice its size: drag it (or the strip of the whole level below it; or the
   * arrow keys and the mouse wheel) to look around. With its numbers and skills, and what the team would bring.
   */
  private showLevelPreview(run: RunSession, index: number): void {
    this.closeOverlay();
    this.tip.hide();
    const o = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
      this.overlay.push(g);
      (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(600);
      return g;
    };
    const p = run.preview(index);
    const l = p.level;
    const color = BLIND_COLORS[p.blind.kind];
    o(this.add.rectangle(0, 0, W, H, 0x000000, 0.7).setOrigin(0, 0).setInteractive());
    o(panel(this, 20, 16, 920, 508, COLORS.panel, color, 12));
    const kind = o(label(this, 40, 30, BLIND_NAMES[p.blind.kind], { color }));
    const name = o(label(this, kind.x + kind.width + 12, 30, levelName(l), { purple: true }));
    o(label(this, name.x + name.width + 12, 30, l.title, { color: COLORS.text, maxWidth: 800 - name.x - name.width }));
    o(new Button(this, 828, 26, 92, 28, 'Close', COLORS.gray, () => this.closeOverlay()));
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

  private renderBlinds(run: RunSession): void {
    // the squad of the current blind is drawn now, so you can see who comes along
    if (run.currentBlind && run.state.colony.length > 0) run.ensureSetup();
    for (let i = 0; i < 3; i++) this.renderBlind(run, run.preview(i), MAIN_X + 4 + i * 236, MAIN_Y + 4);
  }

  private renderBlind(run: RunSession, p: BlindPreview, x: number, y: number): void {
    const k = this.k.bind(this);
    const b = p.blind;
    const l = p.level;
    const current = b.status === 'current';
    const color = BLIND_COLORS[b.kind];
    const w = 228;
    const h = 404;
    k(panel(this, x, y, w, h, current ? COLORS.panelLight : COLORS.panel, current ? color : COLORS.border, 10));
    k(panel(this, x + 8, y + 8, w - 16, 26, color, 0x000000, 6));
    k(label(this, x + w / 2, y + 21, BLIND_NAMES[b.kind], { big: true, originX: 0.5, originY: 0.5 }));
    k(label(this, x + w / 2, y + 40, levelName(l), { purple: true, originX: 0.5 }));
    k(label(this, x + w / 2, y + 60, l.title, { color: COLORS.text, originX: 0.5, maxWidth: w - 20, align: 1 }));
    const thumb = levelThumbnail(this, this.app, l, 212, 40);
    const pic = k(this.add.image(x + 8, y + 98, thumb).setOrigin(0, 0));
    if (!current) k(this.add.rectangle(x + 8, y + 98, 212, 40, 0x000000, 0.35).setOrigin(0, 0));
    // the picture opens the level preview
    const hint = label(this, x + 216, y + 135, 'Preview', { color: COLORS.text, originX: 1, originY: 1 });
    k(this.add.rectangle(hint.x - hint.width - 4, hint.y - hint.height - 1, hint.width + 6, hint.height + 2, 0x000000, 0.65).setOrigin(0, 0));
    k(hint).setDepth(1);
    pic.setInteractive({ useHandCursor: true });
    pic.on('pointerup', () => this.showLevelPreview(run, p.index));

    // the numbers of the level
    const row = (yy: number, name: string, value: string, c: number = COLORS.text) => {
      k(label(this, x + 12, yy, name, { color: COLORS.dim }));
      k(label(this, x + w - 12, yy, value, { color: c, originX: 1 }));
    };
    const mine = p.squad < l.lemmings;
    const setup = current ? run.state.setup : null;
    const squadSpecials = setup ? setup.hand.map((id) => run.card(id)).filter((c): c is LemmingCard => !!c && isSpecial(c)) : [];
    row(y + 146, 'Lemmings', mine ? `${l.lemmings}, you have ${p.squad}` : String(l.lemmings), mine ? COLORS.orange : COLORS.text);
    if (current) {
      const zone = k(this.add.zone(x + 8, y + 144, w - 16, 18).setOrigin(0, 0).setInteractive());
      hoverTip(zone, this.tip, () => ({
        title: `Your squad: ${p.squad} lemmings`,
        color: COLORS.purple,
        lines: squadSpecials.length
          ? ['Special lemmings in the squad, in the order they come out:', ...squadSpecials.slice(0, 10).map((c) => cardTitle(c)), ...(squadSpecials.length > 10 ? [`and ${squadSpecials.length - 10} more`] : [])]
          : ['Only plain lemmings in this squad.'],
        x: x + 20,
        y: y + 166,
      }));
      if (squadSpecials.length) k(label(this, x + 12 + 70, y + 146, `*${squadSpecials.length}`, { color: COLORS.purple }));
    }
    row(y + 164, 'Rescue', String(p.required), p.tooFewLemmings ? COLORS.red : COLORS.text);
    row(y + 182, 'Time', minutes(p.minutes), p.minutes > l.time ? COLORS.green : COLORS.text);
    row(y + 200, 'Release rate', String(l.releaseRate));

    // skills: the level's allocation and what you bring (min(abilities, allocation))
    k(label(this, x + 12, y + 222, 'Skills: level / yours', { color: COLORS.dim }));
    SKILLS.forEach((sk, i) => {
      const cx = x + 12 + (i % 4) * 52;
      const cy = y + 242 + Math.floor(i / 4) * 36;
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
      if (canHire)
        icon.on('pointerup', () => {
          if (!this.confirmTap(icon, skillTip(), `Tap again to hire one for this level ($${HIRE_PRICE}).`)) return;
          if (run.hire(sk)) {
            this.sfx(SoundEffect.AssignSkill);
            this.save();
            this.render();
          }
        });
    });
    const meta = loadMeta().levels[l.id];
    if (meta?.fewest) k(label(this, x + 12, y + 316, `Your best: ${meta.best}%, ${totalSkills(meta.fewest)} skills`, { color: COLORS.teal, maxWidth: w - 24 }));

    // reward and actions
    k(label(this, x + 12, y + 340, 'Reward', { color: COLORS.dim }));
    k(label(this, x + w - 12, y + 336, `$${p.reward}`, { big: true, color: COLORS.gold, originX: 1 }));
    if (b.kind === 'boss' && b.status !== 'defeated' && !run.state.bossRerolled) {
      const can = run.canRerollBoss();
      const rerollTip = (): TipContent => ({
        title: "Director's Cut",
        color: COLORS.red,
        lines: ['Another level for the Boss Blind, from the same band.', 'Once per ante, before the boss is played.'],
        x: x - 80,
        y: y + 64,
      });
      const rr: Button = k(
        new Button(this, x + w - 86, y + 102, 74, 18, `Reroll $${run.bossRerollPrice()}`, COLORS.red, () => {
          if (!this.confirmTap(rr, rerollTip(), `Tap again to reroll the boss ($${run.bossRerollPrice()}).`)) return;
          if (run.rerollBoss()) {
            this.sfx(SoundEffect.SkillButtonSelect);
            this.save();
            this.render();
          }
        }, { enabled: can }),
      );
      hoverTip(rr, this.tip, rerollTip, !can); // (touch: an enabled button shows the tooltip itself, see confirmTap)
    }
    if (current) {
      const playW = b.kind === 'boss' ? w - 24 : 100;
      k(new Button(this, x + 12, y + 362, playW, 30, 'Play', COLORS.red, () => this.play(run), { big: true }));
      if (b.kind !== 'boss' && b.tag) {
        const tag = tagDef(b.tag);
        const skipTip = (): TipContent => ({
          title: `Skip for: ${tag.name}`,
          color: COLORS.orange,
          lines: [tag.text, '', 'No reward and no shop for this blind.'],
          x: x - 40,
          y: y + 250,
        });
        const skip: Button = k(
          new Button(this, x + 120, y + 362, 96, 30, 'Skip', COLORS.orange, () => {
            if (this.confirmTap(skip, skipTip(), 'Tap Skip again to skip.')) this.skip(run);
          }, { big: true, enabled: run.canSkip() }),
        );
        hoverTip(skip, this.tip, skipTip, !run.canSkip());
      }
    } else {
      const text = b.status === 'upcoming' ? (b.tag ? `Skip reward:\n${tagDef(b.tag).name}` : 'Upcoming') : b.status === 'skipped' ? 'Skipped' : 'Defeated';
      const c = b.status === 'skipped' ? COLORS.orange : b.status === 'defeated' ? COLORS.green : COLORS.dim;
      k(label(this, x + w / 2, y + 362, text, { color: c, originX: 0.5, align: 1 }));
    }
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
    const x = MAIN_X + 4;
    const y = MAIN_Y + 4;
    k(panel(this, x, y, 704, 404, COLORS.panel, out.success ? COLORS.green : COLORS.red, 12));
    k(label(this, x + 352, y + 18, out.success ? 'Level complete' : 'Not enough lemmings saved', { size: 32, big: true, color: out.success ? COLORS.green : COLORS.red, originX: 0.5 }));
    k(label(this, x + 352, y + 60, `${levelName(l)}  ${l.title}`, { purple: true, originX: 0.5 }));
    const pct = out.hand ? Math.floor((out.rescued * 100) / out.hand) : 0;
    k(label(this, x + 24, y + 96, `Rescued ${out.rescued} of ${out.hand} (${pct}%), you needed ${out.required}.`, { color: COLORS.text }));
    const count = (f: (x: Fate) => boolean) => out.fates.filter(f).length;
    const lost = count(isDeath);
    const alive = count((f) => f === 'alive');
    const home = count((f) => f === 'unreleased');
    const deaths = new Map<Fate, number>();
    for (const f of out.fates) if (isDeath(f)) deaths.set(f, (deaths.get(f) ?? 0) + 1);
    const how = [...deaths].map(([f, n]) => `${n} ${FATE_TEXTS[f]}`).join(', ');
    k(label(this, x + 24, y + 118, `Survived ${alive}   Stayed home ${home}   Lost ${lost}${how ? ` (${how})` : ''}`, { color: COLORS.dim, maxWidth: 660 }));
    if (out.success && lost > 0)
      k(label(this, x + 24, y + 144, 'If you accept this result, the lost lemmings leave your colony for good.', { color: COLORS.orange }));
    k(label(this, x + 24, y + 166, `Skills used: ${describeSkills(out.skillsUsed, 'none')}`, { color: COLORS.dim, maxWidth: 660 }));

    // what happened to the special lemmings
    const specials: [LemmingCard, Fate][] = [];
    setup.hand.forEach((id, i) => {
      const c = run.card(id);
      if (c && isSpecial(c)) specials.push([c, out.fates[i]]);
    });
    if (specials.length) {
      k(label(this, x + 24, y + 196, 'Special lemmings', { color: COLORS.purple }));
      specials.slice(0, 12).forEach(([c, f], i) => {
        const cx = x + 24 + (i % 2) * 340;
        const cy = y + 220 + Math.floor(i / 2) * 22;
        const sp = k(lemmingSprite(this, cx + 8, cy + 6, FATE_ANIMS[f] ?? 'walk', 1));
        sp.setTint(EDITION_TINTS[c.edition]);
        k(label(this, cx + 22, cy, `${cardTitle(c)}: ${FATE_TEXTS[f]}`, { color: isDeath(f) ? COLORS.red : f === 'saved' ? COLORS.green : COLORS.text }));
      });
      if (specials.length > 12) k(label(this, x + 24, y + 352, `and ${specials.length - 12} more`, { color: COLORS.dim }));
    }

    const unused = Math.max(0, ATTEMPTS - setup.attempts);
    k(label(this, x + 24, y + 346, `Attempt ${setup.attempts}. Unused attempts pay $1 each (${unused} left).`, { color: COLORS.dim }));
    if (out.success) {
      k(
        new Button(this, x + 24, y + 366, 200, 30, 'Accept result', COLORS.green, () => {
          const cash = run.accept();
          const meta = loadMeta();
          recordLevel(meta, setup.levelId, out);
          saveMeta(meta);
          this.save();
          this.sfx(SoundEffect.Yippee);
          this.render();
          void cash;
        }),
      );
      k(new Button(this, x + 236, y + 366, 200, 30, 'Retry', COLORS.blue, () => this.retry(run)));
    } else {
      k(new Button(this, x + 24, y + 366, 200, 30, 'Retry', COLORS.blue, () => this.retry(run)));
      k(
        new Button(this, x + 480, y + 366, 200, 30, 'Give up the run', COLORS.red, () => {
          if (window.confirm('Give up this run?')) this.finishRun(false);
        }),
      );
    }
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

  private renderCashout(run: RunSession): void {
    const k = this.k.bind(this);
    const cash = run.state.cashout!;
    const x = MAIN_X + 104;
    const y = MAIN_Y + 4;
    k(panel(this, x, y, 504, 404, COLORS.panel, COLORS.gold, 12));
    k(label(this, x + 252, y + 16, 'Cash out', { size: 32, big: true, color: COLORS.gold, originX: 0.5 }));
    const items: Phaser.GameObjects.GameObject[] = [];
    cash.lines.forEach((ln, i) => {
      const ly = y + 64 + i * 22;
      const a = k(label(this, x + 24, ly, ln.label, { color: COLORS.text }));
      const b = k(label(this, x + 480, ly, `+$${ln.amount}`, { color: COLORS.gold, originX: 1 }));
      // leader dots from the label to the amount
      const from = x + 24 + a.width + 8;
      const to = x + 480 - b.width - 8;
      const dots = k(label(this, from, ly, '.'.repeat(Math.max(0, Math.floor((to - from) / 4))), { color: 0x505070 }));
      for (const o of [a, dots, b]) {
        o.setAlpha(0);
        items.push(o);
      }
    });
    const ty = y + 64 + cash.lines.length * 22 + 8;
    const total = k(label(this, x + 480, ty, `$${cash.total}`, { size: 32, big: true, color: COLORS.gold, originX: 1 }));
    total.setAlpha(0);
    cash.notes.slice(0, 6).forEach((n, i) => k(label(this, x + 24, ty + 44 + i * 20, n, { color: COLORS.dim, maxWidth: 456 })));
    // the lines come in one by one, with a click each
    items.forEach((o, i) =>
      this.tweens.add({
        targets: o,
        alpha: 1,
        delay: 150 + Math.floor(i / 3) * 260,
        duration: 120,
        onStart: () => {
          if (i % 3 === 0) this.sfx(SoundEffect.AssignSkill);
        },
      }),
    );
    this.tweens.add({ targets: total, alpha: 1, delay: 300 + (items.length / 3) * 260, duration: 200, onStart: () => this.sfx(SoundEffect.Yippee) });
    k(
      new Button(this, x + 152, y + 362, 200, 32, `Cash out $${cash.total}`, COLORS.gold, () => {
        run.cashOut();
        this.save();
        if (run.state.phase === 'over') this.finishRun(true);
        else this.render();
      }),
    );
  }

  /* -------------------------------------------------------------------------------------------- shop */

  private renderShop(run: RunSession): void {
    const k = this.k.bind(this);
    const s = run.state;
    const shop = s.shop!;
    const x = MAIN_X + 4;
    const y = MAIN_Y + 4;
    k(panel(this, x, y, 704, 404, COLORS.panel, COLORS.red, 12));
    k(label(this, x + 24, y + 12, 'Shop', { size: 32, big: true, color: COLORS.red }));
    k(lemmingSprite(this, x + 178, y + 30, 'build', 2));
    k(label(this, x + 204, y + 22, `Recruits, training, jokers and tarots. ${touch.active ? 'Tap twice' : 'Click'} to buy.`, { color: COLORS.dim }));

    const step = shop.offers.length > 4 ? 94 : 116;
    const cw = shop.offers.length > 4 ? 86 : 100;
    shop.offers.forEach((o, i) => {
      const cx = x + 24 + i * step;
      const cy = y + 70;
      const info = this.offerInfo(run, o);
      const can = run.canBuy(o);
      // touch: the tooltip says why an offer cannot be bought, so tapping it only shows the tooltip
      const buy = o.sold || (!can && touch.active) ? null : () => this.buy(run, o);
      const tail = o.sold ? 'Sold.' : !can ? this.whyNot(run, o) : touch.active ? null : `Click to buy for $${o.price}.`;
      const card = this.card(cx, cy, cw, 132, info.color, info.art, buy, () => ({
        title: info.title,
        color: info.color,
        lines: tail ? [...info.lines, '', tail] : info.lines,
        x: cx,
        y: cy + 180,
      }), `Tap again to buy it for $${o.price}.`);
      if (o.sold) card.setAlpha(0.3);
      k(label(this, cx + cw / 2, cy + 140, o.sold ? 'sold' : `$${o.price}`, { color: o.sold ? COLORS.dim : can ? COLORS.gold : COLORS.red, originX: 0.5 }));
      k(label(this, cx + cw / 2, cy + 160, info.short, { color: COLORS.text, originX: 0.5, maxWidth: cw + 8, align: 1 }));
    });

    // the staples
    const rx = x + 500;
    k(
      new Button(this, rx, y + 70, 184, 52, 'Next round', COLORS.red, () => {
        run.nextRound();
        this.save();
        this.render();
      }),
    );
    k(
      new Button(this, rx, y + 136, 184, 44, `Reroll $${run.rerollPrice()}`, COLORS.green, () => {
        if (run.reroll()) {
          this.sfx(SoundEffect.SkillButtonSelect);
          this.save();
          this.render();
        }
      }, { enabled: s.money >= run.rerollPrice() }),
    );
    k(
      new Button(this, rx, y + 194, 184, 52, 'Recruit 5 lemmings', COLORS.blue, () => {
        if (run.buyRecruits()) {
          this.sfx(SoundEffect.LetsGo);
          this.save();
          this.render();
        }
      }, { enabled: s.money >= shop.recruitPrice, sub: `$${shop.recruitPrice}` }),
    );

    // the next blind
    const next = s.blinds.find((b) => b.status === 'current') ?? s.blinds.find((b) => b.status === 'upcoming');
    const nextKind = next ? next.kind : 'small';
    const nextLevel = next ? run.level(next.levelId) : null;
    k(label(this, x + 24, y + 300, next ? `Next: ${BLIND_NAMES[nextKind]}` : `Next: Ante ${s.ante + 1}`, { color: next ? BLIND_COLORS[nextKind] : COLORS.orange }));
    if (nextLevel) {
      k(label(this, x + 24, y + 320, `${levelName(nextLevel)}  ${nextLevel.title}`, { purple: true }));
      k(label(this, x + 24, y + 342, `Rescue ${nextLevel.rescue} of ${nextLevel.lemmings}. Skills: ${describeSkills(nextLevel.skills)}`, { color: COLORS.dim, maxWidth: 660 }));
    }
  }

  private whyNot(run: RunSession, o: ShopOffer): string {
    const s = run.state;
    if (s.money < o.price) return 'Not enough money.';
    if (o.type === 'joker' && s.jokers.length >= JOKER_SLOTS) return 'No room for another joker (sell one).';
    if (o.type === 'tarot' && s.tarots.length >= TAROT_SLOTS) return 'No room for another tarot (use one).';
    return '';
  }

  private offerInfo(run: RunSession, o: ShopOffer): { title: string; color: number; lines: string[]; art: Art; short: string } {
    switch (o.type) {
      case 'joker': {
        const d = jokerDef(o.id);
        return { title: d.name, color: RARITY_COLORS[d.rarity], lines: [d.text, '', `${d.rarity} joker`], art: JOKER_ART[d.id], short: d.name };
      }
      case 'tarot': {
        const d = tarotDef(o.id);
        const text = o.skill && d.skillText ? d.skillText(SKILL_NAMES[o.skill]) : d.text;
        return { title: d.name, color: COLORS.purple, lines: [text, '', 'tarot (keep up to 2, use any time)'], art: o.id === 'manual' && o.skill ? { icon: o.skill } : TAROT_ART[d.id], short: d.name };
      }
      case 'training': {
        const sk = o.skill!;
        return {
          title: `${SKILL_NAMES[sk]} Training`,
          color: COLORS.teal,
          lines: [`+${o.amount} ${SKILL_NAMES[sk]} ability for good.`, `You have ${run.capability()[sk]}.`],
          art: { icon: sk },
          short: `+${o.amount} ${SKILL_PLURALS[sk]}`,
        };
      }
      case 'drive': {
        const sk = o.skill!;
        return {
          title: `${SKILL_NAMES[sk]} Recruitment Drive`,
          color: COLORS.teal,
          lines: [`+${o.amount} lemmings and +${o.amount} ${SKILL_NAMES[sk]} ability.`],
          art: { anim: 'walk' },
          short: `${SKILL_NAMES[sk]} Drive`,
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

  /** The colony: every special lemming, and the plain ones. With a tarot: select lemmings for it. */
  private showColony(tarot: { uid: number; max: number; name: string } | null): void {
    const run = this.run;
    if (!run) return;
    this.closeOverlay();
    this.tip.hide();
    const o = <T extends Phaser.GameObjects.GameObject>(g: T): T => {
      this.overlay.push(g);
      (g as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(600);
      return g;
    };
    const selected = new Set<number>();
    const colony = run.state.colony;
    const squad = new Set(run.state.setup?.hand ?? []);
    const specials = colony.filter(isSpecial);
    const plain = colony.filter((c) => !isSpecial(c));
    o(this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0, 0).setInteractive());
    o(panel(this, 60, 30, 840, 480, COLORS.panel, COLORS.purple, 12));
    o(label(this, 84, 44, tarot ? `${tarot.name}: select up to ${tarot.max}` : `Your colony: ${colony.length} lemmings`, { size: 16, color: COLORS.purple }));
    const info = o(label(this, 84, 66, '', { color: COLORS.dim }));
    const update = () =>
      info.setText(
        tarot
          ? `${selected.size} of ${tarot.max} selected.${squad.size ? ' Lemmings of the squad of the blind you are playing are marked.' : ''}`
          : 'Special lemmings have editions (Gold, Lucky, Mentor), abilities or insurance.',
      );
    update();
    const cells: { c: LemmingCard; box: Phaser.GameObjects.Graphics }[] = [];
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
      cells.push({ c, box });
      const sp = o(lemmingSprite(this, cx + 12, cy + 14, c.floater ? 'float' : c.climber ? 'climb' : 'walk', 1));
      sp.setTint(EDITION_TINTS[c.edition]);
      o(label(this, cx + 26, cy + 6, cardTitle(c), { color: COLORS.text, maxWidth: 160 }));
      const zone = o(this.add.zone(cx, cy, 192, 28).setOrigin(0, 0).setInteractive());
      const cellTip = (): TipContent => ({
        title: cardTitle(c),
        color: EDITION_TINTS[c.edition] === 0xffffff ? COLORS.text : EDITION_TINTS[c.edition],
        lines: this.cardLines(c, squad.has(c.id)),
        x: cx,
        y: cy + 30,
        width: 320,
      });
      hoverTip(zone, this.tip, cellTip, !tarot);
      if (tarot)
        zone.on('pointerup', () => {
          if (selected.has(c.id)) selected.delete(c.id);
          else if (selected.size < tarot.max) selected.add(c.id);
          draw();
          update();
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
      o(
        new Button(this, 420, py + 2, 100, 26, 'Select one', COLORS.blue, () => {
          const next = plain.find((c) => !selected.has(c.id) && !squad.has(c.id)) ?? plain.find((c) => !selected.has(c.id));
          if (next && selected.size < tarot.max) selected.add(next.id);
          updPlain();
          update();
        }).setDepth(601),
      );
      o(
        new Button(this, 530, py + 2, 100, 26, 'Clear', COLORS.gray, () => {
          for (const c of plain) selected.delete(c.id);
          updPlain();
          update();
        }).setDepth(601),
      );
    }
    if (tarot) {
      o(
        new Button(this, 600, 466, 130, 32, 'Use', COLORS.purple, () => {
          const notes = run.useTarot(tarot.uid, [...selected]);
          if (!notes) {
            this.toast(selected.size === 0 ? 'Select at least one lemming.' : 'That does not work (the squad of a blind cannot leave the colony).');
            return;
          }
          this.sfx(SoundEffect.AssignSkill);
          this.save();
          this.render();
          this.toast(notes.join('\n'));
        }).setDepth(601),
      );
    }
    o(new Button(this, 740, 466, 130, 32, tarot ? 'Cancel' : 'Close', COLORS.gray, () => this.closeOverlay()).setDepth(601));
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
    const x = MAIN_X + 4;
    const y = MAIN_Y + 4;
    k(panel(this, x, y, 704, 404, COLORS.panel, s.won ? COLORS.gold : COLORS.red, 12));
    k(label(this, x + 352, y + 24, s.won ? 'Victory!' : 'Run over', { size: 48, big: true, color: s.won ? COLORS.gold : COLORS.red, originX: 0.5 }));
    k(label(this, x + 352, y + 90, s.won ? 'Your colony made it through all eight antes.' : `Your colony reached ante ${s.ante}.`, { color: COLORS.text, originX: 0.5 }));
    const st = s.stats;
    const lines = [
      `Blinds won ${st.blindsWon}, skipped ${st.skipped}, attempts ${st.attempts}`,
      `Lemmings saved ${st.saved}, lost ${st.lost}, colony ${s.colony.length}`,
      `Money earned $${st.earned}`,
      `Jokers: ${s.jokers.map((j) => jokerDef(j.id).name).join(', ') || 'none'}`,
      `Seed ${s.seed}`,
    ];
    k(label(this, x + 352, y + 130, lines.join('\n'), { color: COLORS.dim, originX: 0.5, align: 1 }));
    for (let i = 0; i < 8; i++) k(lemmingSprite(this, x + 100 + i * 72, y + 280, s.won ? (i % 2 ? 'exit' : 'walk') : i % 2 ? 'splat' : 'drown', 2));
    k(
      new Button(this, x + 160, y + 340, 180, 40, 'New run', COLORS.red, () => {
        this.app.run = null;
        this.newRun(randomSeed());
      }),
    );
    k(
      new Button(this, x + 364, y + 340, 180, 40, 'Menu', COLORS.gray, () => {
        this.app.run = null;
        saveRun(null);
        this.toMenu();
      }),
    );
  }

  /* -------------------------------------------------------------------------------------------- messages */

  private toast(text: string): void {
    for (const o of this.toastObj) o.destroy();
    this.toastObj = [];
    if (!text) return;
    const t = label(this, W / 2, 0, text, { color: COLORS.text, originX: 0.5, maxWidth: 600, align: 1 }).setDepth(900);
    const h = t.height + 20;
    const y = H - h - 16;
    t.setY(y + 10);
    const bg = panel(this, W / 2 - 320, y, 640, h, COLORS.dark, COLORS.gold, 8).setDepth(899);
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
