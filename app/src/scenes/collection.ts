/**
 * The collection, as in Balatro: every Power Card, boost, pack, Skip Bonus and kind of Super Lemming the game has, a tab
 * each. What
 * the player has not come across yet (in a shop, a pack, the colony, the bonuses of the levels) is a face-down card
 * with a question mark; it turns over once it has been seen. Opened from the title and from the options of a run, over
 * the screen it was opened from.
 */
import * as Phaser from 'phaser';
import { SoundEffect } from '../../../engine/src/index.ts';
import type { LemmixApp } from '../app.ts';
import { BOOSTS, JOKERS, MAYHEM, PACKS, type PackKind, TAGS, TRIBES } from '../run/content.ts';
import type { SpecialTrait } from '../run/state.ts';
import { markSeen, seenSet } from '../run/storage.ts';
import { consumableLook, JOKER_ART, PACK_LOOKS, RARITY_COLORS, RARITY_NAMES, TAG_ART, TAROT_ART, TRAIT_LOOKS } from '../run/ui/art.ts';
import { ensureRunAssets } from '../run/ui/assets.ts';
import { type Art, CARD_H, CARD_W, CardTable, CardView } from '../run/ui/cards.ts';
import { Swirl, SWIRLS } from '../run/ui/swirl.ts';
import { Button, COLORS, label, panel, Tooltip } from '../run/ui/widgets.ts';
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
  art: Art;
  badge: string;
  pack?: string;
}

const TRAITS: SpecialTrait[] = ['gold', 'lucky', 'mentor', 'champion', 'wise', 'climber', 'floater', 'athlete', 'insured'];

/** the cards of a page: 3 rows of 8 */
const PAGE = 24;

const TABS: { name: string; color: number; entries: () => Entry[] }[] = [
  {
    name: 'Power Cards',
    color: COLORS.orange,
    entries: () =>
      JOKERS.map((d) => ({ key: `joker:${d.id}`, title: d.name, lines: [d.text], color: RARITY_COLORS[d.rarity], art: JOKER_ART[d.id], badge: RARITY_NAMES[d.rarity] })),
  },
  {
    name: 'Boosts',
    color: COLORS.purple,
    entries: () => [...BOOSTS, ...MAYHEM].map((d) => ({ key: `tarot:${d.id}`, title: d.name, lines: [d.text], color: consumableLook(d).color, art: TAROT_ART[d.id], badge: consumableLook(d).badge })),
  },
  {
    name: 'Tribes',
    color: COLORS.teal,
    entries: () => TRIBES.map((d) => ({ key: `tarot:${d.id}`, title: d.name, lines: [d.text], color: COLORS.teal, art: TAROT_ART[d.id], badge: 'Tribe card' })),
  },
  {
    name: 'Packs',
    color: COLORS.green,
    entries: () =>
      (Object.keys(PACKS) as PackKind[]).map((k) => ({ key: `pack:${k}`, title: PACKS[k].name, lines: [PACKS[k].text], color: PACK_LOOKS[k].color, art: PACK_LOOKS[k].art, badge: 'Pack', pack: PACK_LOOKS[k].band })),
  },
  {
    name: 'Skip Bonuses',
    color: COLORS.red,
    entries: () => TAGS.map((d) => ({ key: `tag:${d.id}`, title: d.name, lines: [d.text], color: COLORS.red, art: TAG_ART[d.id], badge: 'Skip Bonus' })),
  },
  {
    name: 'Super Lemmings',
    color: COLORS.blue,
    entries: () => TRAITS.map((t) => ({ key: `lemming:${t}`, title: TRAIT_LOOKS[t].name, lines: [TRAIT_LOOKS[t].text], color: COLORS.blue, art: TRAIT_LOOKS[t].art, badge: 'Super Lemming' })),
  },
];

export class CollectionScene extends Phaser.Scene {
  private app!: LemmixApp;
  /** the scene it was opened from (paused meanwhile) */
  private from = 'title';
  private tab = 0;
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
  }

  create(): void {
    this.app = getApp();
    this.objs = [];
    this.spots = {};
    ensureRunAssets(this, this.app);
    this.tip = new Tooltip(this);
    this.table = new CardTable(this, this.tip, (name, x, y) => (this.spots[name] = { x, y }));
    this.swirl = new Swirl(this, SWIRLS.start);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    listen(this, 'keydown', (e) => {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') this.show((this.tab + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length);
      else if (e.key === 'PageDown' || e.key === 'PageUp') this.turn(e.key === 'PageDown' ? 1 : -1);
    });
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.tip.hide();
    });
    this.show(this.tab);
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

  private close(): void {
    this.app.sound.playSound(SoundEffect.SkillButtonSelect);
    this.scene.stop();
    this.scene.resume(this.from);
  }

  private k<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  /** Shows a tab: its cards, the ones not seen yet face down. */
  private show(tab: number, page = 0): void {
    this.tab = tab;
    this.page = page;
    this.tip.hide();
    this.table.clear();
    this.tweens.killTweensOf(this.objs);
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.swirl.set([TABS[tab].color, 0x2a6fb0, 0x16283a]);
    const seen = seenSet();
    const k = this.k.bind(this);
    k(panel(this, 40, 20, 880, 500, COLORS.panel, COLORS.panelLight, 14));
    k(label(this, W / 2, 50, 'Collection', { size: 48, originX: 0.5, originY: 0.5 }));
    const all = TABS.map((t) => t.entries());
    const found = all.flat().filter((e) => seen.has(e.key)).length;
    k(label(this, W / 2, 86, `${found} of ${all.flat().length} discovered`, { color: COLORS.gold, originX: 0.5, originY: 0.5 }));

    // the tabs, with how much of each has been found
    const tw = Math.min(156, Math.floor((W - 24) / TABS.length) - 8);
    const tx = W / 2 - (TABS.length * (tw + 8) - 8) / 2;
    TABS.forEach((t, i) => {
      const n = all[i].filter((e) => seen.has(e.key)).length;
      const x = tx + i * (tw + 8);
      this.spots[`tab:${t.name}`] = { x: x + tw / 2, y: 120 };
      const b = k(new Button(this, x, 102, tw, 36, `${t.name} ${n}/${all[i].length}`, i === tab ? t.color : COLORS.gray, () => this.show(i)));
      if (i === tab) b.setY(98);
    });

    // the cards, up to 8 in a row, 3 rows a page
    const pages = Math.max(1, Math.ceil(all[tab].length / PAGE));
    const entries = all[tab].slice(page * PAGE, page * PAGE + PAGE);
    const cols = 8;
    const pitchX = CARD_W + 26;
    const pitchY = CARD_H + 14;
    const rows = Math.ceil(entries.length / cols);
    const y0 = 160 + (3 - Math.min(3, rows)) * (pitchY / 2) + CARD_H / 2 + 10;
    this.well(W / 2 - 400, 150, 800, 318);
    entries.forEach((e, i) => {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, entries.length - r * cols);
      const x = W / 2 - ((inRow - 1) * pitchX) / 2 + (i % cols) * pitchX;
      const y = y0 + r * pitchY;
      const known = seen.has(e.key);
      const card = k(
        new CardView(this, x, y, known ? { color: e.color, art: e.art, pack: e.pack } : { color: COLORS.border, art: { text: '?', color: COLORS.dim } }),
      );
      this.spots[`card:${page * PAGE + i}`] = { x, y };
      this.table.add(card, {
        tip: () =>
          known
            ? { title: e.title, color: e.color, lines: e.lines, badge: { text: e.badge, color: e.color } }
            : { title: '?', color: COLORS.border, lines: ['Not discovered yet: it turns over once you come across it in a run.'] },
      });
      // dealt one after the other
      card.setAlpha(0);
      this.tweens.add({ targets: card, alpha: 1, duration: 140, delay: i * 18 });
    });

    // the pages (as in Balatro: < Page 1/3 >)
    if (pages > 1) {
      this.spots.prevPage = { x: 80, y: 494 };
      this.spots.nextPage = { x: 236, y: 494 };
      k(new Button(this, 60, 480, 40, 28, '<', COLORS.red, () => this.turn(-1), { big: true }));
      k(label(this, 158, 494, `Page ${page + 1}/${pages}`, { color: COLORS.text, originX: 0.5, originY: 0.5 }));
      k(new Button(this, 216, 480, 40, 28, '>', COLORS.red, () => this.turn(1), { big: true }));
    }

    // (for development: everything turned over)
    this.spots.unlock = { x: 838, y: 494 };
    k(
      new Button(this, 776, 480, 124, 28, 'Unlock all', COLORS.gray, () => {
        markSeen(TABS.flatMap((t) => t.entries().map((e) => e.key)));
        this.show(this.tab, this.page);
      }),
    );
    this.spots.back = { x: W / 2, y: 494 };
    k(new Button(this, W / 2 - 110, 476, 220, 36, 'Back', COLORS.orange, () => this.close(), { big: true }));
  }

  /** the next or the previous page of the tab (round and round) */
  private turn(d: number): void {
    const pages = Math.max(1, Math.ceil(TABS[this.tab].entries().length / PAGE));
    if (pages > 1) this.show(this.tab, (this.page + d + pages) % pages);
  }

  private well(x: number, y: number, w: number, h: number): void {
    const g = this.k(this.add.graphics());
    g.fillStyle(COLORS.dark, 1);
    g.fillRoundedRect(x, y, w, h, 10);
  }
}
