import * as Phaser from 'phaser';
import { jokerDef, tarotDef } from '../run/content.ts';
import { jokerLines } from '../run/joker-tooltip.ts';
import { jokerSellValue, type RunSession, tarotSellPrice } from '../run/session.ts';
import { saveRun } from '../run/storage.ts';
import { consumableLook, JOKER_ART, RARITY_COLORS, TAROT_ART } from '../run/ui/art.ts';
import { CardView } from '../run/ui/cards.ts';
import { Button, COLORS, label } from '../run/ui/widgets.ts';
import { SKILL_NAMES } from '../run/skills.ts';
import { TAROT_SLOTS } from '../run/state.ts';

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
  contains(x: number, y: number): boolean {
    x = (x - this.container.x) / this.container.scaleX;
    y = (y - this.container.y) / this.container.scaleY;
    return x >= 0 && y >= 0 && x < 960 && y < 106;
  }

  pointerDown(x: number, y: number): boolean {
    if (!this.contains(x, y)) return false;
    x = (x - this.container.x) / this.container.scaleX;
    y = (y - this.container.y) / this.container.scaleY;
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
    const s = this.run.state;
    const wells = add(this.scene.add.graphics());
    for (const [x, w] of [[4, 320], [330, 128]] as const) {
      wells.fillStyle(0x000000, 0.36);
      wells.fillRoundedRect(x, 3, w, 100, 10);
      wells.lineStyle(2, 0xffffff, 0.1);
      wells.strokeRoundedRect(x + 1, 4, w - 2, 98, 10);
    }
    add(label(this.scene, 10, 87, `${s.jokers.length}/${this.run.jokerSlots()}`, { size: 12, color: COLORS.dim }));
    add(label(this.scene, 452, 87, `${s.tarots.length}/${TAROT_SLOTS}`, { size: 12, color: COLORS.dim, originX: 1 }));
    const card = (x: number, color: number, art: typeof JOKER_ART[string], selected: boolean, choose: () => void, edition?: typeof s.jokers[number]['edition']) => {
      if (selected) add(this.scene.add.rectangle(x, 49, 54, 76, COLORS.gold));
      const view = add(new CardView(this.scene, x, 49, { color, art, edition }, 48, 68));
      view.disableInteractive();
      this.hits.push({ x: x - 24, y: 15, w: 48, h: 68, action: choose });
    };
    const pitch = s.jokers.length > 1 ? Math.min(49, 285 / (s.jokers.length - 1)) : 49;
    s.jokers.forEach((j, i) => card(32 + i * pitch, RARITY_COLORS[jokerDef(j.id).rarity], JOKER_ART[j.id], this.selected?.kind === 'joker' && this.selected.uid === j.uid, () => this.choose('joker', j.uid), j.edition));
    s.tarots.forEach((t, i) => card(358 + i * 49, consumableLook(tarotDef(t.id)).color, t.id === 'manual' && t.skill ? { icon: t.skill } : TAROT_ART[t.id], this.selected?.kind === 'tarot' && this.selected.uid === t.uid, () => this.choose('tarot', t.uid)));
    const j = s.jokers.find((item) => this.selected?.kind === 'joker' && item.uid === this.selected.uid);
    const t = s.tarots.find((item) => this.selected?.kind === 'tarot' && item.uid === this.selected.uid);
    if (!j && !t) return;
    const d = j ? jokerDef(j.id) : tarotDef(t!.id);
    const description = j ? jokerLines(this.run, j).join(' ') : t!.skill && tarotDef(t!.id).skillText ? tarotDef(t!.id).skillText!(SKILL_NAMES[t!.skill]) : tarotDef(t!.id).text;
    add(label(this.scene, 470, 6, d.name, { size: 16, color: COLORS.gold, maxWidth: 340 }));
    add(label(this.scene, 470, 28, description, { size: 13, maxWidth: 345 }));
    const blocked = t && ['bootcamp', 'rethink', 'manual', 'hermit'].includes(t.id);
    const detail = this.message || (blocked ? 'Use between levels' : this.selecting ? `${this.targets.length}/${tarotDef(t!.id).select} selected${tarotDef(t!.id).pair ? ' - in order' : ''}` : '');
    if (detail) add(label(this.scene, 470, 78, detail, { size: 13, color: COLORS.dim, maxWidth: 340 }));
    const button = (x: number, y: number, w: number, h: number, title: string, color: number, action: () => void, enabled = true) => {
      const [caption, sub] = title.split('\n');
      add(new Button(this.scene, x, y, w, h, caption, color, action, { size: 13, enabled, sub })).disableInteractive();
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
