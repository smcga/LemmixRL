/**
 * The collection, as in Balatro: a menu of what the game has (Power Cards, the three kinds of consumables in a box of
 * their own, Super Lemmings, Badges, Editions, Packs and Skip Bonuses), each with how much of it has been found, and a
 * screen for each, its cards in rows in a dark well, a page at a time. What the player has not come across yet (in a
 * shop, a pack, the colony, the bonuses of the levels) is a face-down card with a question mark; it turns over once it
 * has been seen. Opened from the title and from the options of a run, over the screen it was opened from.
 */
import * as Phaser from 'phaser';
import { SoundEffect } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import {
  BADGE_COLORS,
  BADGE_NAMES,
  BADGE_TEXTS,
  BADGES,
  BOOSTS,
  JOKERS,
  MAYHEM,
  PACKS,
  type PackKind,
  POWER_EDITION_COLORS,
  POWER_EDITION_NAMES,
  POWER_EDITION_TEXTS,
  POWER_EDITIONS,
  type PowerEdition,
  TAGS,
  type TarotDef,
  TRIBES,
} from '../run/content.ts';
import type { SpecialTrait } from '../run/state.ts';
import { markSeen, seenSet } from '../run/storage.ts';
import { consumableLook, JOKER_ART, PACK_LOOKS, RARITY_COLORS, RARITY_NAMES, TAG_ART, TAROT_ART, TRAIT_LOOKS } from '../run/ui/art.ts';
import { ensureRunAssets } from '../run/ui/assets.ts';
import { type Art, CARD_H, CARD_W, CardTable, CardView } from '../run/ui/cards.ts';
import { Swirl } from '../run/ui/swirl.ts';
import { Button, COLORS, label, panel, shade, Tooltip } from '../run/ui/widgets.ts';
import { safeAreaInsets } from '../touch.ts';
import { getApp, listen } from './shared.ts';

const W = 960;
const H = 540;

/** a card of the collection */
interface Entry {
  key: string;
  title: string;
  lines: string[];
  color: number;
  art?: Art;
  badge: string;
  pack?: string;
  edition?: PowerEdition;
  /** shown whether it has been seen or not (Balatro's base edition) */
  always?: boolean;
}

/** a screen of the collection */
interface Category {
  name: string;
  /** the colour of its button (and of the swirl behind its screen) */
  color: number;
  /** how many cards each row of a page has (Balatro's layout for the same kind of thing) */
  rows: number[];
  /** the size of its cards (packs are bigger, skip bonuses smaller) */
  scale?: number;
  entries: () => Entry[];
}

const TRAITS: SpecialTrait[] = ['gold', 'lucky', 'mentor', 'champion', 'wise', 'climber', 'floater', 'athlete', 'insured'];

const consumable = (d: TarotDef): Entry => {
  const look = consumableLook(d);
  return { key: `tarot:${d.id}`, title: d.name, lines: [d.text], color: look.color, art: TAROT_ART[d.id], badge: look.badge };
};

const POWER_CARDS: Category = {
  name: 'Power Cards',
  color: COLORS.red,
  rows: [5, 5, 5],
  entries: () => JOKERS.map((d) => ({ key: `joker:${d.id}`, title: d.name, lines: [d.text], color: RARITY_COLORS[d.rarity], art: JOKER_ART[d.id], badge: RARITY_NAMES[d.rarity] })),
};

/** the consumables: in a box of their own on the menu, in their own colours (Balatro's tarots, planets and spectrals) */
const CONSUMABLES: Category[] = [
  { name: 'Boosts', color: COLORS.purple, rows: [5, 6], entries: () => BOOSTS.map(consumable) },
  { name: 'Tribe Cards', color: COLORS.teal, rows: [6, 6], entries: () => TRIBES.map(consumable) },
  { name: 'Mayhem', color: shade(COLORS.red, 0.75), rows: [4, 5], entries: () => MAYHEM.map(consumable) },
];

const OTHERS: Category[] = [
  {
    name: 'Super Lemmings',
    color: COLORS.red,
    rows: [5, 4],
    entries: () => TRAITS.map((t) => ({ key: `lemming:${t}`, title: TRAIT_LOOKS[t].name, lines: [TRAIT_LOOKS[t].text], color: COLORS.blue, art: TRAIT_LOOKS[t].art, badge: 'Super Lemming' })),
  },
  {
    name: 'Badges',
    color: COLORS.red,
    rows: [4],
    entries: () => BADGES.map((b) => ({ key: `badge:${b}`, title: BADGE_NAMES[b], lines: [BADGE_TEXTS[b]], color: BADGE_COLORS[b], art: { anim: 'walk' }, badge: 'Badge' })),
  },
  {
    name: 'Editions',
    color: COLORS.red,
    rows: [5],
    entries: () => [
      { key: 'edition:base', title: 'Base', lines: ['A Power Card with no edition'], color: COLORS.orange, art: { anim: 'walk' }, badge: 'Edition', always: true },
      ...POWER_EDITIONS.map((e) => ({
        key: `edition:${e}`,
        title: POWER_EDITION_NAMES[e],
        lines: [POWER_EDITION_TEXTS[e]],
        color: COLORS.orange,
        art: { anim: 'walk' } as Art,
        badge: 'Edition',
        edition: e,
      })),
    ],
  },
  {
    name: 'Packs',
    color: COLORS.red,
    rows: [4, 4],
    scale: 1.2,
    entries: () =>
      (Object.keys(PACKS) as PackKind[]).map((k) => ({ key: `pack:${k}`, title: PACKS[k].name, lines: [PACKS[k].text], color: PACK_LOOKS[k].color, art: PACK_LOOKS[k].art, badge: 'Pack', pack: PACK_LOOKS[k].band })),
  },
  {
    name: 'Skip Bonuses',
    color: COLORS.red,
    rows: [6, 6, 6, 6],
    scale: 0.8,
    entries: () => TAGS.map((d) => ({ key: `tag:${d.id}`, title: d.name, lines: [d.text], color: COLORS.red, art: TAG_ART[d.id], badge: 'Skip Bonus' })),
  },
];

const CATEGORIES: Category[] = [POWER_CARDS, ...CONSUMABLES, ...OTHERS];

/** the cards of a page of a category */
const pageSize = (c: Category): number => c.rows.reduce((a, b) => a + b, 0);
const pageCount = (c: Category): number => Math.max(1, Math.ceil(c.entries().length / pageSize(c)));

export class CollectionScene extends Phaser.Scene {
  private app!: LemmixApp;
  /** the scene it was opened from (paused meanwhile) */
  private from = 'title';
  /** the category on screen (null: the menu) */
  private category: Category | null = null;
  private page = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private tip!: Tooltip;
  private table!: CardTable;
  private swirl!: Swirl;
  /** where the buttons and cards are, by name (for the tests) */
  private spots: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('collection');
  }

  init(data: { from?: string }): void {
    this.from = data.from ?? 'title';
    this.category = null;
    this.page = 0;
  }

  create(): void {
    this.app = getApp();
    this.objs = [];
    this.spots = {};
    ensureRunAssets(this, this.app);
    this.tip = new Tooltip(this);
    this.table = new CardTable(this, this.tip, (name, x, y) => (this.spots[name] = { x, y }));
    this.swirl = new Swirl(this, [COLORS.red, 0x2a6fb0, 0x16283a]);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    listen(this, 'keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace') this.back();
      else if (this.category && (e.key === 'ArrowRight' || e.key === 'PageDown')) this.turn(1);
      else if (this.category && (e.key === 'ArrowLeft' || e.key === 'PageUp')) this.turn(-1);
    });
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.tip.hide();
    });
    this.redraw();
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

  /** Back: from a category to the menu, from the menu to the screen it was opened from. */
  private back(): void {
    this.app.sound.playSound(SoundEffect.SkillButtonSelect);
    if (this.category) {
      this.category = null;
      this.redraw();
      return;
    }
    this.scene.stop();
    this.scene.resume(this.from);
  }

  private open(c: Category): void {
    this.category = c;
    this.page = 0;
    this.redraw();
  }

  private k<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private clear(): void {
    this.tip.hide();
    this.table.clear();
    this.tweens.killTweensOf(this.objs);
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.spots = {};
  }

  private redraw(): void {
    this.clear();
    if (this.category) this.showCategory(this.category, this.page);
    else this.showMenu();
  }

  /** the menu, as Balatro's: a column of the Power Cards and the consumables, a column of the rest */
  private showMenu(): void {
    this.swirl.set([COLORS.red, 0x2a6fb0, 0x16283a]);
    const seen = seenSet();
    const k = this.k.bind(this);
    const found = (c: Category) => c.entries().filter((e) => e.always || seen.has(e.key)).length;
    const button = (c: Category, x: number, y: number, w: number, h: number, big = false) => {
      this.spots[`category:${c.name}`] = { x: x + w / 2, y: y + h / 2 };
      k(new Button(this, x, y, w, h, c.name, c.color, () => this.open(c), { big, sub: `${found(c)} / ${c.entries().length}` }));
    };

    const px = 170;
    const pw = 620;
    k(panel(this, px, 36, pw, 468, COLORS.panel, COLORS.panelLight, 14));
    k(label(this, W / 2, 74, 'Collection', { size: 32, big: true, originX: 0.5, originY: 0.5 }));
    const all = CATEGORIES.flatMap((c) => c.entries());
    const total = all.filter((e) => e.always || seen.has(e.key)).length;
    k(label(this, W / 2, 108, `${total} of ${all.length} discovered`, { color: COLORS.gold, originX: 0.5, originY: 0.5 }));

    // the left column: the Power Cards, big, and the consumables in a dark box with its name down the side
    const top = 134;
    const lx = px + 30;
    const lw = 270;
    button(POWER_CARDS, lx, top, lw, 70, true);
    const boxY = top + 70 + 14;
    const bh = 46;
    const gap = 10;
    const boxH = CONSUMABLES.length * bh + (CONSUMABLES.length - 1) * gap + 24;
    const g = k(this.add.graphics());
    g.fillStyle(COLORS.dark, 1);
    g.fillRoundedRect(lx, boxY, lw, boxH, 12);
    k(label(this, lx + 20, boxY + boxH / 2, 'CONSUMABLES', { color: COLORS.border, originX: 0.5, originY: 0.5 }).setAngle(-90));
    CONSUMABLES.forEach((c, i) => button(c, lx + 40, boxY + 12 + i * (bh + gap), lw - 52, bh));

    // the right column: the rest, one under the other
    const rx = px + pw - 30 - lw;
    const step = (boxY + boxH - top + gap) / OTHERS.length;
    OTHERS.forEach((c, i) => button(c, rx, top + i * step, lw, step - gap));

    this.spots.back = { x: W / 2, y: 464 };
    k(new Button(this, W / 2 - 110, 446, 220, 36, 'Back', COLORS.orange, () => this.back(), { big: true }));
    // (for development: everything turned over)
    this.spots.unlock = { x: px + pw - 80, y: 464 };
    k(
      new Button(this, px + pw - 140, 450, 120, 28, 'Unlock all', COLORS.gray, () => {
        markSeen(CATEGORIES.flatMap((c) => c.entries().map((e) => e.key)));
        this.redraw();
      }),
    );
  }

  /** a category: a page of its cards in rows in a dark well, the page switch under it, and Back */
  private showCategory(c: Category, page: number): void {
    this.swirl.set([c.color, 0x2a6fb0, 0x16283a]);
    const seen = seenSet();
    const k = this.k.bind(this);
    const s = c.scale ?? 1;
    const cw = Math.round(CARD_W * s);
    const ch = Math.round(CARD_H * s);
    const pitchX = cw + 14;
    const pitchY = ch + 12;
    const pages = pageCount(c);
    const size = pageSize(c);
    const entries = c.entries().slice(page * size, page * size + size);

    // the size of the well: the widest row, every row (a short last page keeps the size of the others)
    const cols = Math.max(...c.rows);
    const wellW = cols * pitchX + 22;
    const wellH = c.rows.length * pitchY + 14;
    const heading = 34;
    const pager = pages > 1 ? 52 : 0;
    const backH = 50;
    const panelW = Math.max(wellW + 48, 380);
    const panelH = heading + wellH + pager + backH + 40;
    const px = W / 2 - panelW / 2;
    const py = H / 2 - panelH / 2;
    k(panel(this, px, py, panelW, panelH, COLORS.panel, COLORS.panelLight, 14));
    k(label(this, W / 2, py + 12 + heading / 2, c.name, { size: 24, big: true, color: COLORS.text, originX: 0.5, originY: 0.5 }));
    const wellX = W / 2 - wellW / 2;
    const wellY = py + 16 + heading;
    const g = k(this.add.graphics());
    g.fillStyle(COLORS.dark, 1);
    g.fillRoundedRect(wellX, wellY, wellW, wellH, 10);

    // the cards, row by row, each row centred
    let i = 0;
    c.rows.forEach((n, r) => {
      const row = entries.slice(i, i + n);
      const y = wellY + 7 + r * pitchY + pitchY / 2;
      row.forEach((e, j) => {
        const x = W / 2 - ((row.length - 1) * pitchX) / 2 + j * pitchX;
        this.card(e, x, y, cw, ch, seen.has(e.key) || !!e.always, page * size + i + j, i + j);
      });
      i += n;
    });

    // the pages, as in Balatro: < Page 1/3 >
    let y = wellY + wellH + 12;
    if (pages > 1) {
      const mw = 200;
      this.spots.prevPage = { x: W / 2 - mw / 2 - 26, y: y + 18 };
      this.spots.nextPage = { x: W / 2 + mw / 2 + 26, y: y + 18 };
      k(new Button(this, W / 2 - mw / 2 - 46, y, 40, 36, '<', COLORS.red, () => this.turn(-1), { big: true }));
      const m = k(this.add.graphics());
      m.fillStyle(shade(COLORS.red, 0.8), 1);
      m.fillRoundedRect(W / 2 - mw / 2, y + 3, mw, 36, 8);
      m.fillStyle(COLORS.red, 1);
      m.fillRoundedRect(W / 2 - mw / 2, y, mw, 36, 8);
      k(label(this, W / 2, y + 18, `Page ${page + 1}/${pages}`, { big: true, originX: 0.5, originY: 0.5 }));
      k(new Button(this, W / 2 + mw / 2 + 6, y, 40, 36, '>', COLORS.red, () => this.turn(1), { big: true }));
      y += pager;
    }
    this.spots.back = { x: W / 2, y: y + 18 };
    k(new Button(this, W / 2 - 110, y, 220, 36, 'Back', COLORS.orange, () => this.back(), { big: true }));
  }

  private card(e: Entry, x: number, y: number, cw: number, ch: number, known: boolean, index: number, order: number): void {
    const face = known ? { color: e.color, art: e.art, pack: e.pack, edition: e.edition } : { color: COLORS.border, art: { text: '?', color: COLORS.dim } };
    const card = this.k(new CardView(this, x, y, face, cw, ch));
    this.spots[`card:${index}`] = { x, y };
    this.table.add(card, {
      tip: () =>
        known
          ? { title: e.title, color: e.color, lines: e.lines, badge: { text: e.badge, color: e.edition ? POWER_EDITION_COLORS[e.edition] : e.color } }
          : { title: '?', color: COLORS.border, lines: ['Not discovered yet: it turns over once you come across it in a run.'] },
    });
    // dealt one after the other
    card.setAlpha(0);
    this.tweens.add({ targets: card, alpha: 1, duration: 140, delay: order * 18 });
  }

  /** the next or the previous page of the category (round and round) */
  private turn(d: number): void {
    if (!this.category) return;
    const pages = pageCount(this.category);
    if (pages < 2) return;
    this.page = (this.page + d + pages) % pages;
    this.redraw();
  }
}
