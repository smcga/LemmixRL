/**
 * The cards of the run screens, handled the way Balatro handles them on a phone (and, with the mouse, like its
 * desktop version): a tap selects a card, which shows what it is and the buttons of what can be done with it (buy,
 * sell, use); a card that is dragged shows the areas it can be dropped on, and dropping it there does the same.
 */
import * as Phaser from 'phaser';
import { touch } from '../../touch.ts';
import { type LemmingAnim, lemmingSprite, SKILL_ICONS } from './assets.ts';
import { Button, COLORS, label, shade, type TipContent, type Tooltip } from './widgets.ts';

export type Art = { anim: LemmingAnim; tint?: number } | { icon: string } | { text: string; color: number };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** the size of a card: the proportions of a card of Balatro on a 960 x 540 screen */
export const CARD_W = 66;
export const CARD_H = 88;

export interface CardFace {
  color: number;
  art?: Art;
  /** the price tag above a card of the shop */
  price?: string;
  /** a pile of cards, face down (the colony) */
  pile?: boolean;
}

/** A card: a cream edge around a field in the colour of its kind, with its picture. Its position is its middle. */
export class CardView extends Phaser.GameObjects.Container {
  homeX: number;
  homeY: number;
  private readonly sway: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly face: CardFace,
    readonly cw = CARD_W,
    readonly ch = CARD_H,
  ) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;
    const g = scene.add.graphics();
    const l = -cw / 2;
    const t = -ch / 2;
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(l + 3, t + 5, cw, ch, 6);
    if (face.pile)
      for (let i = 3; i >= 1; i--) {
        g.fillStyle(shade(COLORS.cream, 0.55 + i * 0.08), 1);
        g.fillRoundedRect(l + i * 2, t + i * 2, cw, ch, 6);
      }
    g.fillStyle(COLORS.cream, 1);
    g.fillRoundedRect(l, t, cw, ch, 6);
    g.fillStyle(shade(face.color, 0.4), 1);
    g.fillRoundedRect(l + 4, t + 4, cw - 8, ch - 8, 4);
    g.lineStyle(2, face.color, 1);
    g.strokeRoundedRect(l + 5, t + 5, cw - 10, ch - 10, 3);
    this.add(g);
    const art = face.art;
    if (art) {
      if ('anim' in art) {
        const sp = lemmingSprite(scene, 0, 0, art.anim, 3);
        if (art.tint) sp.setTint(art.tint);
        this.add(sp);
      } else if ('icon' in art) this.add(scene.add.image(0, 0, SKILL_ICONS, art.icon).setScale(2));
      else {
        const text = label(scene, 0, 0, art.text, { size: 32, color: art.color, originX: 0.5, originY: 0.5 });
        if (text.width > cw - 14) text.setScale((cw - 14) / text.width);
        this.add(text);
      }
    }
    if (face.price) {
      const price = label(scene, 0, t - 11, face.price, { color: COLORS.gold, originX: 0.5, originY: 0.5 });
      const w = price.width + 14;
      const tag = scene.add.graphics();
      tag.fillStyle(COLORS.panel, 1);
      tag.fillRoundedRect(-w / 2, t - 22, w, 26, 6);
      tag.fillStyle(COLORS.dark, 1);
      tag.fillRoundedRect(-w / 2 + 3, t - 19, w - 6, 16, 4);
      this.addAt(tag, 0);
      this.add(price);
    }
    this.setSize(cw, ch);
    this.setInteractive();
    // a card is never quite still
    this.sway = scene.tweens.add({
      targets: this,
      rotation: { from: -0.02, to: 0.02 },
      duration: 1700 + Math.random() * 900,
      delay: Math.random() * 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.once('destroy', () => scene.tweens.killTweensOf(this));
    scene.add.existing(this);
  }

  /** the card as it lies: its rectangle on the screen */
  get rect(): Rect {
    return { x: this.homeX - this.cw / 2, y: this.homeY - this.ch / 2, w: this.cw, h: this.ch };
  }

  /** back to its place, raised a little when it is selected */
  settle(lift = 0, ms = 140): void {
    this.scene.tweens.add({ targets: this, x: this.homeX, y: this.homeY - lift, scale: 1, duration: ms, ease: 'Cubic.easeOut' });
    if (this.sway.isPaused()) this.sway.resume();
  }

  grow(scale: number): void {
    this.scene.tweens.add({ targets: this, scale, duration: 90 });
  }

  /** picked up: it follows the pointer, leaning the way it moves */
  pickUp(): void {
    this.sway.pause();
    this.grow(1.12);
  }

  follow(x: number, y: number): void {
    const lean = Math.max(-0.3, Math.min(0.3, (x - this.x) * 0.03));
    this.rotation += (lean - this.rotation) * 0.35;
    this.setPosition(x, y);
  }
}

export interface CardButton {
  label: string;
  /** a second line: the price */
  sub?: string;
  color: number;
  /** under the card, or sticking out of its side */
  side: 'below' | 'right';
  enabled?: boolean;
  run: () => void;
}

/** An area a dragged card can be dropped on. */
export interface DropTarget {
  rect: Rect;
  color: number;
  lines: string[];
  /** it can be dropped there now (else the area is grey and the card goes back) */
  active: boolean;
  release: () => void;
  /** dropped on it while it is not active */
  refused?: () => void;
}

export interface CardBehaviour {
  /** what the card is, for its popup */
  tip?: () => Omit<TipContent, 'x' | 'y' | 'center' | 'above'>;
  /** the buttons of a selected card */
  buttons?: () => CardButton[];
  /** the areas shown while the card is dragged */
  targets?: () => DropTarget[];
  /** dropped inside this area, on no target: its place among the cards of the area changes */
  reorder?: { area: Rect; drop: (x: number) => void };
  /** a tap does this instead of selecting the card */
  tap?: () => void;
}

interface ShownTarget {
  spec: DropTarget;
  draw: (over: boolean) => void;
  over: boolean;
  objs: Phaser.GameObjects.GameObject[];
}

/** how far a pointer moves (in pixels of the screen, about a third of a millimetre each) before a tap is a drag */
const DRAG_DISTANCE = 6;
/** a card that is held this long (ms) shows where it can be dropped */
const HOLD_MS = 180;
const DEPTH_SELECTED = 20;
const DEPTH_BUTTONS = 650;
const DEPTH_TARGETS = 700;
const DEPTH_DRAGGED = 800;

/** The cards on the screen and what the pointer is doing with them. */
export class CardTable {
  private readonly cards = new Map<CardView, CardBehaviour>();
  private press: { card: CardView; id: number; x: number; y: number; dx: number; dy: number; moved: boolean; held: boolean; timer: Phaser.Time.TimerEvent | null } | null = null;
  private selected: CardView | null = null;
  private selectedObjs: Phaser.GameObjects.GameObject[] = [];
  private targets: ShownTarget[] = [];
  private hovered: CardView | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tip: Tooltip,
    /** the middle of a button of the selected card, by its label (for the tests) */
    private readonly spot: (name: string, x: number, y: number) => void,
  ) {
    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    scene.events.once('shutdown', () => {
      input.off('pointerdown', this.onDown, this);
      input.off('pointermove', this.onMove, this);
      input.off('pointerup', this.onUp, this);
      input.off('pointerupoutside', this.onUp, this);
    });
  }

  /** a card is being dragged (or held) */
  get busy(): boolean {
    return !!this.press;
  }

  add(card: CardView, b: CardBehaviour): CardView {
    this.cards.set(card, b);
    card.on('pointerdown', (p: Phaser.Input.Pointer) => this.onCardDown(card, p));
    card.on('pointerover', () => {
      if (touch.active || this.press) return;
      this.hovered = card;
      if (card !== this.selected) card.grow(1.06);
      this.showTip(card);
    });
    card.on('pointerout', () => {
      if (touch.active || this.press) return;
      if (this.hovered === card) this.hovered = null;
      if (card !== this.selected) card.grow(1);
      if (this.selected) this.showTip(this.selected);
      else this.tip.hide();
    });
    return card;
  }

  /** Forgets every card (they are destroyed by whoever made them). */
  clear(): void {
    this.press?.timer?.remove();
    this.press = null;
    this.hideTargets();
    for (const o of this.selectedObjs) o.destroy();
    this.selectedObjs = [];
    this.selected = null;
    this.hovered = null;
    this.cards.clear();
  }

  /* -------------------------------------------------------------------------------------------- the popup */

  private showTip(card: CardView): void {
    const b = this.cards.get(card);
    if (!b?.tip) return;
    // below the cards along the top of the screen, above the ones further down
    const below = card.homeY < 150;
    const buttonsBelow = card === this.selected && (b.buttons?.() ?? []).some((x) => x.side === 'below');
    const r = card.rect;
    this.tip.show(
      {
        ...b.tip(),
        center: true,
        above: !below,
        x: card.homeX,
        y: below ? r.y + r.h + (buttonsBelow ? 44 : 10) : r.y - (card.face.price ? 34 : 12),
      },
      card,
    );
  }

  /* -------------------------------------------------------------------------------------------- selecting */

  select(card: CardView | null): void {
    const old = this.selected;
    for (const o of this.selectedObjs) o.destroy();
    this.selectedObjs = [];
    this.selected = null;
    if (old?.active) {
      old.setDepth(0);
      old.settle();
    }
    if (!card) {
      if (this.hovered?.active) this.showTip(this.hovered);
      else this.tip.hide();
      return;
    }
    this.selected = card;
    card.setDepth(DEPTH_SELECTED);
    card.settle(10);
    const r = card.rect;
    for (const b of this.cards.get(card)?.buttons?.() ?? []) {
      const below = b.side === 'below';
      const w = below ? Math.max(card.cw + 8, 10 + 8 * b.label.length) : 58;
      const h = below ? (b.sub ? 40 : 26) : 40;
      // a button on the side goes to the left when there is no room on the right
      let x = below ? card.homeX - w / 2 : r.x + r.w - 6;
      if (!below && x + w > 956) x = r.x - w + 6;
      const y = below ? r.y + r.h - 6 : card.homeY - h / 2 - 10;
      const btn = new Button(this.scene, x, y, w, h, b.label, b.color, b.run, { enabled: b.enabled ?? true, sub: b.sub });
      btn.setDepth(below ? DEPTH_BUTTONS : DEPTH_SELECTED - 1);
      this.selectedObjs.push(btn);
      this.spot('card:' + b.label, x + w / 2, y + h / 2);
    }
    this.showTip(card);
  }

  /* -------------------------------------------------------------------------------------------- the pointer */

  private onCardDown(card: CardView, p: Phaser.Input.Pointer): void {
    if (this.press) return;
    this.press = { card, id: p.id, x: p.worldX, y: p.worldY, dx: card.x - p.worldX, dy: card.y - p.worldY, moved: false, held: false, timer: null };
    const b = this.cards.get(card);
    if (b?.targets || b?.reorder) this.press.timer = this.scene.time.delayedCall(HOLD_MS, () => this.pickUp());
  }

  /** a press on anything but the selected card and its buttons puts the card back */
  private onDown(_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const sel = this.selected;
    if (!sel) return;
    if (over.some((o) => o === sel || this.selectedObjs.includes(o))) return;
    // (the card that is pressed now is selected when the pointer comes up)
    this.select(null);
  }

  private pickUp(): void {
    const press = this.press;
    if (!press || press.held) return;
    const b = this.cards.get(press.card);
    if (!b || (!b.targets && !b.reorder)) return;
    press.held = true;
    press.timer?.remove();
    if (this.selected) this.select(null);
    this.tip.hide();
    this.hovered = null;
    press.card.setDepth(DEPTH_DRAGGED);
    press.card.pickUp();
    this.showTargets(b.targets?.() ?? []);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || p.id !== press.id) return;
    if (!press.moved) {
      const zoom = this.scene.cameras.main.zoom || 1;
      if (Math.hypot(p.worldX - press.x, p.worldY - press.y) * zoom < DRAG_DISTANCE * Math.max(1, window.devicePixelRatio || 1)) return;
      press.moved = true;
      this.pickUp();
    }
    if (!press.held) return;
    press.card.follow(p.worldX + press.dx, p.worldY + press.dy);
    for (const t of this.targets) {
      const over = inRect(t.spec.rect, p.worldX, p.worldY);
      if (over !== t.over) t.draw(over);
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || p.id !== press.id) return;
    this.press = null;
    press.timer?.remove();
    const card = press.card;
    const b = this.cards.get(card);
    if (!press.moved) {
      // a tap (also a card that was held and put back where it was)
      if (press.held) {
        this.hideTargets();
        card.setDepth(0);
        card.settle();
      }
      if (!b) return;
      if (b.tap) b.tap();
      else this.select(this.selected === card ? null : card);
      return;
    }
    if (!press.held || !b) return;
    const target = this.targets.find((t) => inRect(t.spec.rect, p.worldX, p.worldY));
    this.hideTargets();
    if (target?.spec.active) target.spec.release();
    else if (target) target.spec.refused?.();
    else if (b.reorder && inRect(b.reorder.area, p.worldX, p.worldY)) b.reorder.drop(card.x);
    // (what was done may have rebuilt the screen, without this card)
    if (card.active) {
      card.setDepth(0);
      card.settle(0, 200);
      this.scene.tweens.add({ targets: card, rotation: 0, duration: 200 });
    }
  }

  /* -------------------------------------------------------------------------------------------- drop areas */

  private showTargets(specs: DropTarget[]): void {
    const s = this.scene;
    for (const spec of specs) {
      const { x, y, w, h } = spec.rect;
      const g = s.add.graphics().setDepth(DEPTH_TARGETS);
      const ring = s.add.graphics().setDepth(DEPTH_TARGETS);
      const big = w >= 180;
      const texts = spec.lines.map((line) => label(s, x + w / 2, 0, line, { size: big ? 32 : 16, originX: 0.5, originY: 0.5 }).setDepth(DEPTH_TARGETS + 1));
      const step = big ? 36 : 20;
      texts.forEach((t, i) => {
        t.setY(y + h / 2 + (i - (texts.length - 1) / 2) * step);
        if (t.width > w - 10) t.setScale((w - 10) / t.width);
        if (!spec.active) t.setAlpha(0.5);
      });
      const shown: ShownTarget = {
        spec,
        over: false,
        objs: [g, ring, ...texts],
        draw: (over) => {
          shown.over = over;
          g.clear();
          g.fillStyle(spec.active ? (over ? shade(spec.color, 1.25) : spec.color) : COLORS.panelLight, 0.9);
          g.fillRoundedRect(x, y, w, h, 10);
        },
      };
      shown.draw(false);
      if (spec.active) {
        // the edge of an area that takes the card pulses
        ring.lineStyle(3, 0xffffff, 1);
        ring.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 10);
        s.tweens.add({ targets: ring, alpha: { from: 1, to: 0.15 }, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      this.targets.push(shown);
    }
  }

  private hideTargets(): void {
    for (const t of this.targets)
      for (const o of t.objs) {
        this.scene.tweens.killTweensOf(o);
        o.destroy();
      }
    this.targets = [];
  }
}
