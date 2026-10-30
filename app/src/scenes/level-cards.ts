/**
 * The bar above a level of a run: the level and its rescues, the Power Cards and the Boosts, drawn and handled as on
 * the run screens (the same cards, popups, buttons and drop areas, over the same swirl). It is a scene of its own over
 * the player, so that its popups can hang down over the level. Its world is the 960 wide strip of the run screens'
 * top row; the player tells it where that strip is on the canvas, and how big.
 */
import * as Phaser from 'phaser';
import { SoundEffect } from '../../../engine/src/index.ts';
import { levelName } from '../run/catalog.ts';
import { jokerDef, tarotDef } from '../run/content.ts';
import { jokerLines } from '../run/joker-tooltip.ts';
import { jokerSellValue, type RunSession, tarotSellPrice } from '../run/session.ts';
import { SKILL_NAMES } from '../run/skills.ts';
import { BLIND_NAMES, TAROT_SLOTS } from '../run/state.ts';
import { saveRun } from '../run/storage.ts';
import { BLIND_COLORS, consumableLook, JOKER_ART, RARITY_COLORS, RARITY_NAMES, TAROT_ART } from '../run/ui/art.ts';
import { CardTable, CardView, type Rect } from '../run/ui/cards.ts';
import { SWIRLS, Swirl } from '../run/ui/swirl.ts';
import { COLORS, label, panel, Tooltip } from '../run/ui/widgets.ts';
import { touch } from '../touch.ts';
import { getApp } from './shared.ts';

/** the strip, in the coordinates of the run screens */
export const STRIP_W = 960;
export const STRIP_H = 120;
/** the level, where the run screens have their column */
const BLIND_AREA: Rect = { x: 6, y: 3, w: 200, h: 114 };
/** where the Power Cards and the Boosts lie: as on the run screens */
const JOKER_AREA: Rect = { x: 214, y: 3, w: 506, h: 98 };
const TAROT_AREA: Rect = { x: 728, y: 3, w: 226, h: 98 };
/** a dragged card: over the other row to sell, down onto the level to use */
const SELL_JOKER_ZONE: Rect = { x: 728, y: 1, w: 226, h: 118 };
const SELL_TAROT_ZONE: Rect = { x: 214, y: 1, w: 506, h: 118 };
const USE_ZONE: Rect = { x: 214, y: 130, w: 740, h: 150 };
/** Boosts that are only used between levels (they open a screen, or take the lemming out of the level) */
const BETWEEN_LEVELS = ['bootcamp', 'rethink', 'manual', 'hermit'];

export class LevelCardsScene extends Phaser.Scene {
  private run: RunSession | null = null;
  private tip!: Tooltip;
  private table!: CardTable;
  private swirl!: Swirl;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private cursor: Phaser.GameObjects.Image | null = null;
  private savedText: Phaser.GameObjects.BitmapText | null = null;
  private toastObjs: Phaser.GameObjects.GameObject[] = [];
  private ready = false;
  /** where the strip is on the canvas (set by the player, also before the scene has started) */
  private place = { x: 0, y: 0, scale: 1 };
  private saved = -1;
  /** the card that is selected, and the lemmings picked for it (card ids, in order) */
  private selected: { kind: 'joker' | 'tarot'; uid: number } | null = null;
  private readonly cardOf = new Map<CardView, { kind: 'joker' | 'tarot'; uid: number }>();
  readonly targets: number[] = [];
  private message = '';
  /** the middle of each card and button by name, in canvas pixels (for the tests) */
  spots: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('levelcards');
  }

  create(): void {
    const app = getApp();
    this.run = app.run;
    this.objs = [];
    this.toastObjs = [];
    this.spots = {};
    this.selected = null;
    this.targets.length = 0;
    this.message = '';
    this.saved = -1;
    this.savedText = null;
    this.tip = new Tooltip(this);
    this.table = new CardTable(this, this.tip, (name, x, y) => this.spot(name, x, y));
    this.table.onSelect = (card) => this.onSelect(card);
    this.swirl = new Swirl(this, SWIRLS[this.run?.currentBlind?.kind ?? 'small']);
    this.cursor = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(5000).setVisible(false);
    this.ready = true;
    this.events.once('shutdown', () => {
      this.ready = false;
      this.cursor = null;
      this.table.clear();
      this.cardOf.clear();
    });
    this.applyPlace();
    this.render();
  }

  /* -------------------------------------------------------------------------------------------- for the player */

  /** Puts the strip at (x, y) on the canvas, scale canvas pixels to a unit of the run screens. */
  layout(x: number, y: number, scale: number): void {
    this.place = { x, y, scale };
    if (this.ready) this.applyPlace();
  }

  /** a point of the canvas is the bar's (on the strip, a button of a card, or a card being dragged) */
  blocks(cx: number, cy: number): boolean {
    const { x, y } = this.toWorld(cx, cy);
    if (x >= 0 && x < STRIP_W && y >= 0 && y < STRIP_H) return true;
    return this.ready && (this.table.busy || this.table.overButton(x, y));
  }

  /** a Boost is selected that takes lemmings: a click on a lemming picks it */
  get selecting(): boolean {
    const t = this.selectedTarot();
    return !!t && tarotDef(t.id).select > 0 && !BETWEEN_LEVELS.includes(t.id);
  }

  toggleTarget(id: number): void {
    const t = this.selectedTarot();
    if (!t || !this.selecting) return;
    const index = this.targets.indexOf(id);
    if (index >= 0) this.targets.splice(index, 1);
    else if (this.targets.length < tarotDef(t.id).select) this.targets.push(id);
    else return;
    this.message = '';
    this.sfx(SoundEffect.SkillButtonSelect);
    this.table.refreshTip();
  }

  /** forgets the picked lemmings that are gone */
  pruneTargets(alive: Set<number>): void {
    const kept = this.targets.filter((id) => alive.has(id));
    if (kept.length === this.targets.length) return;
    this.targets.splice(0, this.targets.length, ...kept);
    if (this.ready) this.table.refreshTip();
  }

  /** the lemmings saved so far */
  setSaved(n: number): void {
    if (n === this.saved) return;
    const more = this.saved >= 0 && n > this.saved;
    this.saved = n;
    if (!this.ready) return;
    this.renderSaved();
    if (more && this.savedText) {
      // (it pops, as the money does on the run screens)
      const to = this.savedText.scale;
      this.savedText.setScale(to * 1.35);
      this.tweens.add({ targets: this.savedText, scale: to, duration: 260, ease: 'Back.easeOut' });
    }
  }

  /** The cursor of the game, drawn over the bar (and its popups): at (x, y) of the canvas, s canvas pixels a pixel. */
  setCursor(key: string, x: number, y: number, s: number, visible: boolean): void {
    const c = this.cursor;
    if (!c) return;
    if (c.texture.key !== key) c.setTexture(key);
    const p = this.toWorld(x, y);
    c.setPosition(p.x, p.y).setScale(s / this.place.scale).setVisible(visible);
  }

  /* -------------------------------------------------------------------------------------------- the strip */

  private toWorld(cx: number, cy: number): { x: number; y: number } {
    const { x, y, scale } = this.place;
    return { x: (cx - x) / scale, y: (cy - y) / scale };
  }

  private applyPlace(): void {
    const { x, y, scale } = this.place;
    const cam = this.cameras.main;
    cam.setViewport(0, 0, this.scale.width, this.scale.height);
    cam.setOrigin(0, 0);
    cam.setZoom(scale);
    cam.setScroll(-x / scale, -y / scale);
    // the swirl of the run screens behind the strip, across the whole width of the screen
    const left = -x / scale;
    const w = this.scale.width / scale;
    this.swirl.cover(left, -y / scale, w, y / scale + STRIP_H);
    const img = this.swirl.image;
    const top = img.y - (img.height * img.scaleY) / 2;
    img.setCrop(0, (-y / scale - top) / img.scaleY, img.width, (y / scale + STRIP_H) / img.scaleY);
    // (the spots are in canvas pixels: they move with the strip)
    if (Object.keys(this.spots).length) this.render();
  }

  private spot(name: string, x: number, y: number): void {
    const { x: px, y: py, scale } = this.place;
    this.spots[name] = { x: px + x * scale, y: py + y * scale };
  }

  private k<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private sfx(e: SoundEffect): void {
    getApp().sound.playMenuSound(e);
  }

  private selectedTarot() {
    const sel = this.selected;
    return sel?.kind === 'tarot' ? this.run?.state.tarots.find((t) => t.uid === sel.uid) : undefined;
  }

  private onSelect(card: CardView | null): void {
    const next = card ? (this.cardOf.get(card) ?? null) : null;
    const same = next && this.selected && next.kind === this.selected.kind && next.uid === this.selected.uid;
    if (!same) {
      this.targets.length = 0;
      this.message = '';
    }
    this.selected = next;
  }

  private render(): void {
    const run = this.run;
    if (!this.ready || !run) return;
    const keep = this.selected;
    this.tip.hide();
    this.table.clear();
    this.cardOf.clear();
    this.tweens.killTweensOf(this.objs);
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.spots = {};
    this.selected = keep;
    const s = run.state;
    this.swirl.set(SWIRLS[run.currentBlind?.kind ?? 'small']);
    this.renderBlind(run);

    for (const a of [JOKER_AREA, TAROT_AREA]) {
      const g = this.k(this.add.graphics());
      g.fillStyle(0x000000, 0.36);
      g.fillRoundedRect(a.x, a.y, a.w, a.h, 10);
      g.lineStyle(2, 0xffffff, 0.1);
      g.strokeRoundedRect(a.x + 1, a.y + 1, a.w - 2, a.h - 2, 10);
    }
    this.k(label(this, JOKER_AREA.x + 6, JOKER_AREA.y + JOKER_AREA.h + 1, `${s.jokers.length}/${run.jokerSlots()}`));
    this.k(label(this, TAROT_AREA.x + TAROT_AREA.w - 6, TAROT_AREA.y + TAROT_AREA.h + 1, `${s.tarots.length}/${TAROT_SLOTS}`, { originX: 1 }));
    const cy = JOKER_AREA.y + JOKER_AREA.h / 2;
    let reselect: CardView | null = null;

    const jx = this.slots(JOKER_AREA, s.jokers.length);
    s.jokers.forEach((j, i) => {
      const d = jokerDef(j.id);
      const sell = () => {
        if (!run.sellJoker(j.uid)) return;
        this.sfx(SoundEffect.AssignSkill);
        saveRun(s);
        this.selected = null;
        this.render();
      };
      const card = this.k(new CardView(this, jx[i], cy, { color: RARITY_COLORS[d.rarity], art: JOKER_ART[j.id], edition: j.edition }));
      this.cardOf.set(card, { kind: 'joker', uid: j.uid });
      if (keep?.kind === 'joker' && keep.uid === j.uid) reselect = card;
      this.spot(`joker:${i}`, jx[i], cy);
      this.table.add(card, {
        tip: () => ({ title: d.name, color: RARITY_COLORS[d.rarity], lines: jokerLines(run, j), badge: { text: RARITY_NAMES[d.rarity], color: RARITY_COLORS[d.rarity] } }),
        buttons: () => [{ label: 'SELL', sub: `$${jokerSellValue(j)}`, color: COLORS.green, side: 'right', run: sell }],
        targets: () => [{ rect: SELL_JOKER_ZONE, color: COLORS.gold, lines: ['SELL', `$${jokerSellValue(j)}`], active: true, release: sell }],
        reorder: {
          area: { x: JOKER_AREA.x, y: 0, w: JOKER_AREA.w, h: STRIP_H },
          drop: (x) => {
            const index = jx.filter((ox, oi) => oi !== i && ox < x).length;
            if (!run.moveJoker(j.uid, index)) return;
            this.sfx(SoundEffect.SkillButtonSelect);
            saveRun(s);
            this.render();
          },
        },
      });
    });

    const tx = this.slots(TAROT_AREA, s.tarots.length);
    s.tarots.forEach((t, i) => {
      const d = tarotDef(t.id);
      const look = consumableLook(d);
      const art = t.id === 'manual' && t.skill ? { icon: t.skill } : TAROT_ART[t.id];
      const later = BETWEEN_LEVELS.includes(t.id);
      const picks = d.select > 0 && !later;
      const use = () => this.useTarot(t.uid);
      const sell = () => {
        if (!run.sellTarot(t.uid)) return;
        this.sfx(SoundEffect.AssignSkill);
        saveRun(s);
        this.selected = null;
        this.render();
      };
      const card = this.k(new CardView(this, tx[i], cy, { color: look.color, art }));
      this.cardOf.set(card, { kind: 'tarot', uid: t.uid });
      if (keep?.kind === 'tarot' && keep.uid === t.uid) reselect = card;
      this.spot(`tarot:${i}`, tx[i], cy);
      const isSelected = () => this.selected?.kind === 'tarot' && this.selected.uid === t.uid;
      this.table.add(card, {
        tip: () => {
          const lines = [t.skill && d.skillText ? d.skillText(SKILL_NAMES[t.skill]) : d.text];
          if (later) lines.push('{~}(Used between levels){}');
          else if (picks && isSelected()) {
            const verb = touch.active ? 'Tap' : 'Click';
            lines.push(`{!}${this.targets.length}/${d.select}{} picked: ${verb.toLowerCase()} lemmings in the level${d.pair ? ', in order' : ''}`);
          } else if (picks) lines.push(`{~}(Select it, then pick ${d.select === 1 ? 'a lemming' : `up to ${d.select} lemmings`}){}`);
          if (this.message && isSelected()) lines.push(`{x}${this.message}{}`);
          return { title: d.name, color: look.color, lines, badge: { text: look.badge, color: look.color } };
        },
        buttons: () => [
          { label: 'USE', color: COLORS.red, side: 'below', enabled: !later, run: use },
          { label: 'SELL', sub: `$${tarotSellPrice(t.id)}`, color: COLORS.green, side: 'right', enabled: run.canSellTarot(), run: sell },
        ],
        // (a Boost that takes lemmings is picked first, then used with its button)
        targets: () => [
          { rect: SELL_TAROT_ZONE, color: COLORS.gold, lines: ['SELL', `$${tarotSellPrice(t.id)}`], active: run.canSellTarot(), release: sell },
          ...(picks ? [] : [{ rect: USE_ZONE, color: COLORS.red, lines: ['USE'], active: !later, release: use }]),
        ],
        // while lemmings are picked, a click on the level does not put the card back
        sticky: () => picks,
      });
    });

    if (reselect) this.table.select(reselect);
    else this.selected = null;
  }

  /** the level, where the run screens show the blind that is played: its name, and the lemmings saved of those needed */
  private renderBlind(run: RunSession): void {
    const s = run.state;
    const setup = s.setup;
    const blind = run.currentBlind;
    const { x, y, w, h } = BLIND_AREA;
    const color = BLIND_COLORS[blind?.kind ?? 'small'];
    this.k(panel(this, x, y, w, h, color, 0x000000, 8));
    this.k(label(this, x + w / 2, y + 15, BLIND_NAMES[blind?.kind ?? 'small'], { size: 24, originX: 0.5, originY: 0.5 }));
    if (setup) {
      const l = run.level(setup.levelId);
      const name = this.k(label(this, x + w / 2, y + 36, `${levelName(l)}: ${l.title}`, { size: 13, originX: 0.5, originY: 0.5 }));
      if (name.width > w - 14) name.setScale((w - 14) / name.width);
    }
    // the rescues, where Balatro has "Score at least"
    const g = this.k(this.add.graphics());
    g.fillStyle(COLORS.dark, 1);
    g.fillRoundedRect(x + 6, y + 48, w - 12, h - 54, 6);
    const half = (w - 12) / 2;
    this.k(label(this, x + 6 + half / 2, y + 58, 'Saved', { size: 13, color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    this.k(label(this, x + 6 + half + half / 2, y + 58, 'Needed', { size: 13, color: COLORS.dim, originX: 0.5, originY: 0.5 }));
    g.fillStyle(COLORS.panelLight, 1);
    g.fillRect(x + 6 + half - 1, y + 54, 2, h - 66);
    this.k(label(this, x + 6 + half + half / 2, y + 84, String(setup?.rescue ?? 0), { size: 32, big: true, color: COLORS.red, originX: 0.5, originY: 0.5 }));
    this.savedText = null;
    this.renderSaved();
  }

  private renderSaved(): void {
    const run = this.run;
    if (!run) return;
    const { x, y, w } = BLIND_AREA;
    const need = run.state.setup?.rescue ?? 0;
    const n = Math.max(0, this.saved);
    const text = String(n);
    const color = n >= need ? COLORS.green : COLORS.blue;
    if (this.savedText?.active) {
      this.savedText.setText(text).setTint(color);
      return;
    }
    this.savedText = this.k(label(this, x + 6 + (w - 12) / 4, y + 84, text, { size: 32, big: true, color, originX: 0.5, originY: 0.5 }));
  }

  /** where the cards of a row lie: next to each other in the middle of the area, closer together when it is full */
  private slots(area: Rect, n: number, cardW = 66, gap = 8): number[] {
    const pitch = n > 1 ? Math.min(cardW + gap, (area.w - 16 - cardW) / (n - 1)) : 0;
    const x0 = area.x + area.w / 2 - (pitch * (n - 1)) / 2;
    return Array.from({ length: n }, (_, i) => Math.round(x0 + i * pitch));
  }

  private useTarot(uid: number): void {
    const run = this.run;
    const t = run?.state.tarots.find((item) => item.uid === uid);
    if (!run || !t) return;
    const picks = tarotDef(t.id).select > 0;
    const notes = run.useLevelTarot(uid, picks ? [...this.targets] : []);
    if (!notes) {
      this.message = picks && !this.targets.length ? 'Pick lemmings first' : 'Cannot use on this selection';
      for (const [card, c] of this.cardOf) if (c.kind === 'tarot' && c.uid === uid) card.juice(0.08, 0.12);
      this.table.refreshTip();
      return;
    }
    this.sfx(SoundEffect.AssignSkill);
    saveRun(run.state);
    this.selected = null;
    this.targets.length = 0;
    this.message = '';
    this.render();
    if (notes.length) this.toast(notes.join('\n'));
  }

  /** a note under the bar for a moment (what a Boost did) */
  private toast(text: string): void {
    for (const o of this.toastObjs) o.destroy();
    const t = label(this, STRIP_W / 2, STRIP_H + 24, text, { originX: 0.5, originY: 0.5, align: 1, maxWidth: 520 });
    const w = t.width + 28;
    const h = t.height + 18;
    const p = panel(this, STRIP_W / 2 - w / 2, STRIP_H + 24 - h / 2, w, h, COLORS.panel, COLORS.panelLight, 8);
    p.setDepth(900);
    t.setDepth(901);
    this.toastObjs = [p, t];
    this.tweens.add({ targets: [p, t], alpha: 0, delay: 2200, duration: 400, onComplete: () => { p.destroy(); t.destroy(); } });
  }

  override update(): void {
    if (!this.ready) return;
    // the popup of the selected card is out of the way while the pointer is over the level, and back over the bar
    const p = this.input.activePointer;
    const { y } = this.toWorld(p.x, p.y);
    if (this.selected && !this.table.busy) {
      if (y > STRIP_H + 4 && !this.table.overButton(this.toWorld(p.x, p.y).x, y)) {
        if (this.tip.owner) this.tip.hide();
      } else if (y < STRIP_H && !this.tip.owner) this.table.refreshTip();
    }
  }
}
