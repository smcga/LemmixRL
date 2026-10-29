import * as Phaser from 'phaser';
import { jokerDef, tarotDef } from '../run/content.ts';
import { jokerLines } from '../run/joker-tooltip.ts';
import { plainText } from '../run/rich.ts';
import { jokerSellValue, type RunSession, tarotSellPrice } from '../run/session.ts';
import { saveRun } from '../run/storage.ts';
import { consumableLook, JOKER_ART, RARITY_COLORS, TAROT_ART } from '../run/ui/art.ts';
import { CardView } from '../run/ui/cards.ts';
import { COLORS, label, panel } from '../run/ui/widgets.ts';
import { SKILL_NAMES } from '../run/skills.ts';

/** Cards and actions in the space above a run's level. Coordinates are relative to a 960 x 110 strip. */
export class LevelCards {
  readonly container: Phaser.GameObjects.Container;
  private selected: { kind: 'joker' | 'tarot'; uid: number } | null = null;
  readonly targets: number[] = [];
  private message = '';
  private hits: { x: number; y: number; w: number; h: number; action: () => void }[] = [];

  constructor(private readonly scene: Phaser.Scene, private readonly run: RunSession) {
    this.container = scene.add.container(0, 0).setDepth(50);
    this.render();
  }

  get selecting(): boolean {
    const t = this.run.state.tarots.find((item) => this.selected?.kind === 'tarot' && item.uid === this.selected.uid);
    return !!t && tarotDef(t.id).select > 0 && !['manual', 'hermit'].includes(t.id);
  }

  toggleTarget(id: number): void {
    const t = this.run.state.tarots.find((item) => this.selected?.kind === 'tarot' && item.uid === this.selected.uid);
    if (!t || !this.selecting) return;
    const index = this.targets.indexOf(id);
    if (index >= 0) this.targets.splice(index, 1);
    else if (this.targets.length < tarotDef(t.id).select) this.targets.push(id);
    this.render();
  }

  pruneTargets(alive: Set<number>): void {
    const kept = this.targets.filter((id) => alive.has(id));
    if (kept.length === this.targets.length) return;
    this.targets.splice(0, this.targets.length, ...kept);
    this.render();
  }

  layout(x: number, y: number, scale: number): void {
    this.container.setPosition(x, y).setScale(scale);
  }

  /** Consume a pointer in the strip, even when it falls between cards. */
  pointerDown(x: number, y: number): boolean {
    x = (x - this.container.x) / this.container.scaleX;
    y = (y - this.container.y) / this.container.scaleY;
    if (x < 0 || y < 0 || x >= 960 || y >= 106) return false;
    const hit = [...this.hits].reverse().find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
    hit?.action();
    return true;
  }

  private choose(kind: 'joker' | 'tarot', uid: number): void {
    const same = this.selected?.kind === kind && this.selected.uid === uid;
    this.selected = same ? null : { kind, uid };
    this.targets.length = 0;
    this.message = '';
    this.render();
  }

  private render(): void {
    this.container.removeAll(true);
    this.hits = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.container.add(o); return o; };
    add(panel(this.scene, 0, 0, 960, 106, COLORS.dark, COLORS.border, 6));
    add(label(this.scene, 10, 5, 'POWER CARDS', { size: 12, color: COLORS.dim }));
    add(label(this.scene, 335, 5, 'CONSUMABLES', { size: 12, color: COLORS.dim }));
    const s = this.run.state;
    const card = (x: number, color: number, art: typeof JOKER_ART[string], selected: boolean, choose: () => void, edition?: typeof s.jokers[number]['edition']) => {
      if (selected) add(this.scene.add.rectangle(x, 54, 46, 62, COLORS.gold));
      const view = add(new CardView(this.scene, x, 54, { color, art, edition }, 40, 54));
      view.disableInteractive();
      this.hits.push({ x: x - 20, y: 27, w: 40, h: 54, action: choose });
    };
    const pitch = s.jokers.length > 1 ? Math.min(49, 285 / (s.jokers.length - 1)) : 49;
    s.jokers.forEach((j, i) => card(32 + i * pitch, RARITY_COLORS[jokerDef(j.id).rarity], JOKER_ART[j.id], this.selected?.kind === 'joker' && this.selected.uid === j.uid, () => this.choose('joker', j.uid), j.edition));
    s.tarots.forEach((t, i) => card(358 + i * 49, consumableLook(tarotDef(t.id)).color, t.id === 'manual' && t.skill ? { icon: t.skill } : TAROT_ART[t.id], this.selected?.kind === 'tarot' && this.selected.uid === t.uid, () => this.choose('tarot', t.uid)));
    const j = s.jokers.find((item) => this.selected?.kind === 'joker' && item.uid === this.selected.uid);
    const t = s.tarots.find((item) => this.selected?.kind === 'tarot' && item.uid === this.selected.uid);
    if (!j && !t) {
      add(label(this.scene, 470, 25, 'Select a card to inspect, sell or use it.', { size: 16, maxWidth: 475 }));
      add(label(this.scene, 470, 51, 'Select a consumable, then tap lemmings in the level.', { size: 14, color: COLORS.dim, maxWidth: 475 }));
      return;
    }
    const d = j ? jokerDef(j.id) : tarotDef(t!.id);
    const description = j ? jokerLines(this.run, j).join(' ') : t!.skill && tarotDef(t!.id).skillText ? tarotDef(t!.id).skillText!(SKILL_NAMES[t!.skill]) : tarotDef(t!.id).text;
    add(label(this.scene, 470, 6, d.name, { size: 16, color: COLORS.gold, maxWidth: 340 }));
    add(label(this.scene, 470, 28, plainText(description), { size: 13, maxWidth: 345 }));
    const blocked = t && ['bootcamp', 'rethink', 'manual', 'hermit'].includes(t.id);
    const detail = this.message || (blocked ? 'Use between levels' : this.selecting ? `Select ${tarotDef(t!.id).pair ? '2 in order' : `up to ${tarotDef(t!.id).select}`}  (${this.targets.length} selected)` : '');
    if (detail) add(label(this.scene, 470, 78, detail, { size: 13, color: COLORS.dim, maxWidth: 340 }));
    const button = (x: number, y: number, w: number, h: number, title: string, color: number, action: () => void, enabled = true) => {
      add(this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, enabled ? color : COLORS.gray));
      add(label(this.scene, x + w / 2, y + h / 2, title, { size: 13, originX: 0.5, originY: 0.5, align: 1 }));
      if (enabled) this.hits.push({ x, y, w, h, action });
    };
    if (t) button(823, 8, 62, 38, 'USE', COLORS.red, () => {
      const notes = this.run.useLevelTarot(t.uid, this.targets);
      if (!notes) { this.message = 'Cannot use on this selection'; this.render(); return; }
      saveRun(s);
      this.targets.length = 0;
      this.selected = null;
      this.message = '';
      this.render();
    }, !blocked);
    button(890, 8, 62, 38, `SELL\n$${j ? jokerSellValue(j) : tarotSellPrice(t!.id)}`, COLORS.green, () => {
      const sold = j ? this.run.sellJoker(j.uid) : this.run.sellTarot(t!.uid);
      if (!sold) return;
      saveRun(s);
      this.selected = null;
      this.targets.length = 0;
      this.render();
    });
    button(823, 54, 129, 34, 'CLOSE', COLORS.gray, () => { this.selected = null; this.targets.length = 0; this.render(); });
  }
}
