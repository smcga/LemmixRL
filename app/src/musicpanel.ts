/**
 * ?music (LemmixRL, a debug tool): a panel that plays the music of the levels track by track, to compare how loud the
 * tracks are. It lists the tracks of every style with music (Orig, Ohno, H94) with the levels that play them and their
 * loudness, measured by rendering each song once without playing it. A track plays like a level plays it (the volume
 * of a level's music, then the music setting) and loops; "Play all" plays every track for some seconds, one after the
 * other. `?music` turns the panel on (also for the next visits), `?music=0` off again.
 */
import { type Archive, type DataProvider, getStyle, STYLE_DESCRIPTIONS, StyleDef } from '../../engine/src/index.ts';
import type { LemmixApp } from './app.ts';
import { urlSwitch } from './diagnostics.ts';
import { ModPlayer } from './modplayer.ts';
import { whenApp } from './scenes/shared.ts';

export interface LevelTrack {
  style: StyleDef;
  styleName: string;
  /** the name of the music file, as the levels name it (Track_01.mod) */
  fileName: string;
  /** null when the music archive of the style does not have it */
  data: Uint8Array | null;
  /** the levels that play it, by section: "Fun 1, 22 · Tricky 13" */
  levels: string;
  levelCount: number;
}

/** The music of the levels: every music file a level of a built-in style plays, by style, in the order of the files. */
export function levelTracks(provider: DataProvider, music: Map<string, Archive>): LevelTrack[] {
  const tracks: LevelTrack[] = [];
  for (let def = StyleDef.Orig; def <= StyleDef.X92; def++) {
    const style = getStyle(provider, def);
    const archive = music.get(style.name.toLowerCase());
    // file name -> section name -> level numbers
    const files = new Map<string, Map<string, number[]>>();
    for (const section of style.levelSystem.sectionList)
      for (const level of section.levelLoadingInformationList) {
        if (!level.musicFileName) continue;
        let sections = files.get(level.musicFileName);
        if (!sections) files.set(level.musicFileName, (sections = new Map()));
        let numbers = sections.get(section.sectionName);
        if (!numbers) sections.set(section.sectionName, (numbers = []));
        numbers.push(level.levelIndex + 1);
      }
    for (const [fileName, sections] of [...files].sort(([a], [b]) => a.localeCompare(b)))
      tracks.push({
        style: def,
        styleName: style.name,
        fileName,
        data: archive?.get(fileName) ?? null,
        levels: [...sections].map(([name, numbers]) => `${name} ${numbers.join(', ')}`).join(' · '),
        levelCount: [...sections.values()].reduce((n, numbers) => n + numbers.length, 0),
      });
  }
  return tracks;
}

export function initMusicPanel(): void {
  if (!urlSwitch('music')) return;
  whenApp((app) => new MusicPanel(app));
}

interface Loudness {
  rms: number;
  peak: number;
  seconds: number;
}

interface Row {
  track: LevelTrack;
  el: HTMLDivElement;
  bar: HTMLSpanElement;
  db: HTMLSpanElement;
  diff: HTMLSpanElement;
  info: HTMLDivElement;
  /** undefined while not measured, null when it cannot be */
  loudness?: Loudness | null;
}

const HIDDEN_KEY = 'lemmix.music.hidden';
const BUTTON_CSS = 'background:#303060;color:#fff;border:1px solid #6060a0;padding:3px 8px;cursor:pointer;font:inherit;';
const ACTIVE_BORDER = '#e0e0ff';
const LOUDER = '#ff9a7a';
const QUIETER = '#7ab8ff';
/** a difference from the median track that is easy to hear (in dB) */
const NOTICEABLE_DB = 2;
const TEXT = '#d0d0e0';
const DIM = '#8080a0';
const BAR = '#6060a0';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

const dB = (x: number) => 20 * Math.log10(Math.max(x, 1e-6));
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Track_01.mod: Track 01 */
const trackName = (t: LevelTrack) => t.fileName.replace(/\.mod$/i, '').replace(/_/g, ' ');
const trackLabel = (t: LevelTrack) => `${t.styleName} ${trackName(t)}`;

class MusicPanel {
  private readonly rows: Row[] = [];
  private current = -1;
  private startedAt = 0;
  private playAll = false;
  private readonly status: HTMLDivElement;
  private readonly setting: HTMLDivElement;
  private readonly seconds: HTMLInputElement;
  private readonly playAllButton: HTMLButtonElement;

  constructor(private readonly app: LemmixApp) {
    const root = el(
      'div',
      'position:fixed;top:calc(env(safe-area-inset-top) + 8px);right:calc(env(safe-area-inset-right) + 8px);z-index:9;' +
        'max-width:calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));' +
        'max-height:calc(100dvh - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom));box-sizing:border-box;' +
        `display:flex;flex-direction:column;background:rgba(16,16,24,0.95);color:${TEXT};border:1px solid ${BAR};` +
        'font:12px/1.4 Segoe UI,Arial,sans-serif;font-variant-numeric:tabular-nums;',
    );
    // the game reacts to the keys and the clicks of the page: not to those of the panel
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown'])
      root.addEventListener(type, (e) => e.stopPropagation());

    const header = el('div', 'display:flex;align-items:center;gap:8px;padding:6px 8px;');
    const toggle = this.button('Hide', () => setHidden(body.style.display !== 'none'));
    header.append(el('span', 'font-weight:bold;color:#fff;', 'Level music'), el('span', `flex:1;color:${DIM};`, 'debug'), toggle);

    const body = el(
      'div',
      'display:flex;flex-direction:column;min-height:0;border-top:1px solid #404070;' +
        'width:min(400px, calc(100vw - 18px - env(safe-area-inset-left) - env(safe-area-inset-right)));',
    );
    const controls = el('div', 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;');
    this.playAllButton = this.button('Play all', () => this.togglePlayAll());
    this.seconds = el('input', `width:3.5em;background:#202030;color:#fff;border:1px solid ${BAR};font:inherit;padding:2px 4px;`);
    this.seconds.type = 'number';
    this.seconds.min = '3';
    this.seconds.max = '600';
    this.seconds.value = '15';
    this.seconds.title = 'seconds of every track with Play all';
    controls.append(
      this.button('Stop', () => this.stop()),
      this.button('Prev', () => this.step(-1)),
      this.button('Next', () => this.step(1)),
      this.playAllButton,
      this.seconds,
      el('span', `color:${DIM};`, 's each'),
    );
    this.status = el('div', 'padding:0 8px 4px;color:#fff;min-height:1.4em;');
    this.setting = el('div', `padding:0 8px 6px;color:${DIM};`);
    const list = el('div', 'overflow:auto;min-height:0;flex:1;touch-action:pan-y;overscroll-behavior:contain;border-top:1px solid #404070;');
    body.append(controls, this.status, this.setting, list);
    root.append(header, body);

    let group: StyleDef | null = null;
    for (const track of levelTracks(app.data.provider, app.data.music)) {
      if (track.style !== group) {
        group = track.style;
        list.append(el('div', 'padding:6px 8px 2px;color:#a0a0ff;font-weight:bold;', STYLE_DESCRIPTIONS[track.style]));
      }
      this.rows.push(this.row(track, list));
    }

    const setHidden = (hidden: boolean) => {
      body.style.display = hidden ? 'none' : 'flex';
      toggle.textContent = hidden ? 'Show' : 'Hide';
      try {
        if (hidden) localStorage.setItem(HIDDEN_KEY, '1');
        else localStorage.removeItem(HIDDEN_KEY);
      } catch {
        // not remembered
      }
    };
    let hidden = false;
    try {
      hidden = localStorage.getItem(HIDDEN_KEY) === '1';
    } catch {
      // shown
    }
    setHidden(hidden);
    document.body.appendChild(root);

    this.update();
    setInterval(() => this.tick(), 250);
    void this.measureAll();
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', BUTTON_CSS, text);
    b.addEventListener('click', () => {
      b.blur(); // the keys go to the game again
      onClick();
    });
    return b;
  }

  private row(track: LevelTrack, list: HTMLDivElement): Row {
    const e = el('div', 'padding:4px 8px;cursor:pointer;border-left:3px solid transparent;');
    const line = el('div', 'display:flex;align-items:center;gap:8px;');
    const name = el('span', 'width:6.5em;color:#fff;', trackName(track));
    const barBox = el('span', 'flex:1;height:6px;background:#202038;');
    const bar = el('span', `display:block;height:100%;width:0;background:${BAR};`);
    barBox.appendChild(bar);
    const db = el('span', 'width:5.5em;text-align:right;');
    const diff = el('span', 'width:3.5em;text-align:right;');
    line.append(name, barBox, db, diff);
    const info = el('div', `color:${DIM};font-size:11px;`);
    e.append(line, info);
    list.appendChild(e);
    const row: Row = { track, el: e, bar, db, diff, info };
    const index = this.rows.length;
    if (track.data) e.addEventListener('click', () => this.play(index));
    else {
      row.loudness = null;
      e.style.cursor = 'default';
      name.style.color = DIM;
    }
    this.showRow(row, 0, 0, 0);
    return row;
  }

  /** the loudness of every track, one after the other, between the frames of the game */
  private async measureAll(): Promise<void> {
    for (const row of this.rows) {
      if (row.loudness !== undefined) continue;
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        row.loudness = new ModPlayer(this.app.sound.context, row.track.data!).measure();
      } catch {
        row.loudness = null;
      }
      this.showLoudness();
    }
  }

  private showLoudness(): void {
    const levels = this.rows.flatMap((r) => (r.loudness ? [dB(r.loudness.rms)] : [])).sort((a, b) => a - b);
    const median = levels.length ? (levels[(levels.length - 1) >> 1] + levels[levels.length >> 1]) / 2 : 0;
    const low = (levels[0] ?? 0) - 3;
    const high = levels[levels.length - 1] ?? 0;
    for (const row of this.rows) this.showRow(row, median, low, high);
  }

  private showRow(row: Row, median: number, low: number, high: number): void {
    const l = row.loudness;
    const t = row.track;
    const levels = `${t.levelCount} level${t.levelCount === 1 ? '' : 's'}: ${t.levels}`;
    if (l === undefined) {
      row.db.textContent = '...';
      row.info.textContent = levels;
    } else if (l === null) {
      row.db.textContent = t.data ? 'error' : 'missing';
      row.info.textContent = levels;
    } else {
      const level = dB(l.rms);
      const d = level - median;
      const marked = d >= NOTICEABLE_DB ? LOUDER : d <= -NOTICEABLE_DB ? QUIETER : null;
      row.db.textContent = `${level.toFixed(1)} dB`;
      row.diff.textContent = `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
      row.diff.style.color = marked ?? TEXT;
      row.bar.style.width = `${high > low ? Math.max(2, ((level - low) / (high - low)) * 100) : 100}%`;
      row.bar.style.background = marked ?? BAR;
      row.info.textContent = `${time(l.seconds)} long, peak ${dB(l.peak).toFixed(1)} dB · ${levels}`;
    }
  }

  private play(index: number): void {
    const row = this.rows[index];
    if (!row?.track.data) return;
    this.app.sound.resume();
    if (!this.app.sound.previewMusic(row.track.data)) {
      row.loudness = null;
      this.showLoudness();
      return;
    }
    this.current = index;
    this.startedAt = this.app.sound.context.currentTime;
    this.update();
  }

  private stop(): void {
    this.app.sound.stopPreview();
    this.current = -1;
    this.playAll = false;
    this.update();
  }

  /** the next (1) or the previous (-1) track that can be played */
  private step(dir: number): void {
    const n = this.rows.length;
    let i = this.current < 0 ? (dir > 0 ? -1 : n) : this.current;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (this.rows[i].track.data && this.rows[i].loudness !== null) return this.play(i);
    }
  }

  private togglePlayAll(): void {
    this.playAll = !this.playAll;
    if (this.playAll) {
      // from the track that plays, else from the first
      if (this.current >= 0) this.play(this.current);
      else this.step(1);
    }
    this.update();
  }

  private secondsEach(): number {
    const s = Number.parseFloat(this.seconds.value);
    return Number.isFinite(s) && s >= 1 ? s : 15;
  }

  private tick(): void {
    // a level that starts its music stops the panel's
    if (this.current >= 0 && !this.app.sound.previewing) {
      this.current = -1;
      this.playAll = false;
    }
    if (this.current >= 0 && this.playAll && this.app.sound.context.currentTime - this.startedAt >= this.secondsEach()) {
      if (this.rows.slice(this.current + 1).some((r) => r.track.data && r.loudness !== null)) this.step(1);
      else this.stop();
    }
    this.update();
  }

  private update(): void {
    const cur = this.rows[this.current];
    if (!cur) this.status.textContent = 'Click a track to play it (it loops).';
    else {
      const elapsed = this.app.sound.context.currentTime - this.startedAt;
      const count = this.playAll ? `${this.current + 1}/${this.rows.length} ` : '';
      const of = this.playAll ? ` of ${time(this.secondsEach())}` : '';
      this.status.textContent = `Playing ${count}${trackLabel(cur.track)} · ${time(elapsed)}${of}`;
    }
    for (const [i, row] of this.rows.entries()) {
      const on = i === this.current;
      row.el.style.background = on ? '#28284a' : '';
      row.el.style.borderLeftColor = on ? ACTIVE_BORDER : 'transparent';
    }
    this.playAllButton.style.borderColor = this.playAll ? ACTIVE_BORDER : BAR;
    this.playAllButton.style.background = this.playAll ? '#505090' : '#303060';
    const setting = this.app.sound.musicSetting;
    this.setting.textContent =
      (setting > 0 ? `Music setting ${Math.round(setting * 100)}%.` : 'The music setting is off: turn it up to hear the tracks.') +
      ' dB: the RMS of one pass of the song (before any volume), then the difference with the median track.';
  }
}
