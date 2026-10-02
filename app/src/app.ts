/**
 * Prog.App (TApp): the state shared by the screens. Like Lemmix there is one global game, level, graphic set and
 * renderer: the preview screen loads the level, the player screen prepares the game with it, and the postview
 * screen can replay the last game from memory.
 */
import {
  ansiCharArrayToString,
  type Bitmap32,
  type GameResultsRec,
  getStyle,
  GraphicSet,
  Level,
  LemmingGame,
  parseHeader,
  readBmp,
  REPLAY_HEADER_SIZE,
  type LevelLoadingInformation,
  Renderer,
  STYLE_NAMES,
  StyleDef,
  type Style,
} from '../../engine/src/index.ts';
import { Config } from './config.ts';
import type { LemmixData } from './data.ts';
import { LevelCatalog } from './run/catalog.ts';
import type { RunSession } from './run/session.ts';
import type { WebSoundManager } from './sound.ts';

export class LemmixApp {
  readonly config = Config.load();
  style!: Style;
  graphicSet!: GraphicSet;
  readonly level = new Level();
  readonly renderer = new Renderer();
  readonly game = new LemmingGame();
  currentLevelInfo: LevelLoadingInformation | null = null;
  gameResult: GameResultsRec | null = null;
  /** App.ReplayFileName: a replay file chosen to be played (its bytes) */
  replayFile: Uint8Array | null = null;
  replayFileName = '';
  /** App.ReplayCurrent: replay the last game (postview 'r') */
  replayCurrent = false;
  readonly cursors = new Map<string, Bitmap32>();
  /** the roguelike run (LemmixRL) */
  run: RunSession | null = null;
  /** the screens play the levels of the run (preview, game, postview) */
  inRun = false;
  private catalog: LevelCatalog | null = null;
  private beforeRun: { style: string; level: LevelLoadingInformation | null } | null = null;

  constructor(
    readonly data: LemmixData,
    readonly sound: WebSoundManager,
  ) {
    this.setStyle(this.config.styleName);
    for (const name of ['CursorDefault', 'CursorDefaultMask', 'CursorHighlight', 'CursorHighlightMask', 'CursorDrag', 'CursorDragMask']) {
      const bytes = data.cursors.get(name + '.bmp');
      if (bytes) this.cursors.set(name, readBmp(bytes));
    }
  }

  /** the levels of runs: the original Lemmings */
  runCatalog(): LevelCatalog {
    this.catalog ??= new LevelCatalog(getStyle(this.data.provider, StyleDef.Orig));
    return this.catalog;
  }

  /** Runs are played with the original Lemmings style; the style and level of normal play come back afterwards. */
  enterRunMode(): void {
    if (this.inRun) return;
    this.beforeRun = { style: this.style.name, level: this.currentLevelInfo };
    if (this.style.def !== StyleDef.Orig) this.setStyle('Orig');
    this.inRun = true;
  }

  leaveRunMode(): void {
    if (!this.inRun) return;
    this.inRun = false;
    const b = this.beforeRun;
    this.beforeRun = null;
    if (!b) return;
    if (b.style !== this.style.name) this.setStyle(b.style);
    this.currentLevelInfo = b.level && b.level.style === this.style ? b.level : this.currentLevelInfo;
    this.config.styleName = this.style.name;
  }

  get styleDef(): StyleDef {
    return this.style.def;
  }

  /** Consts.SetStyleName + TStyleFactory.CreateStyle */
  setStyle(name: string): void {
    let ix = STYLE_NAMES.findIndex((n) => n.toLowerCase() === name.toLowerCase());
    if (ix < 0 || ix > StyleDef.X92) ix = StyleDef.Orig;
    this.style = getStyle(this.data.provider, ix as StyleDef);
    this.config.styleName = this.style.name;
    this.graphicSet = new GraphicSet(this.style);
    this.currentLevelInfo = null;
    this.sound.setMusicArchive(this.data.music.get(this.style.name.toLowerCase()) ?? null);
  }

  /**
   * TRecorder.LoadTitleHashVersionFromHeader + TStyleCache.SelectBestMatchingLevel: the level of a replay file, by
   * its hash (or by its title for replays of version 1). With duplicates the first style wins.
   */
  findReplayLevel(bytes: Uint8Array): LevelLoadingInformation | null {
    if (bytes.length < REPLAY_HEADER_SIZE) return null;
    const header = parseHeader(bytes.subarray(0, REPLAY_HEADER_SIZE));
    if (header.signature !== 'LRB') return null;
    const hash = header.version > 1 ? header.hash : 0n;
    const clean = (t: string) => t.replace(/\0/g, ' ').trim();
    const title = clean(ansiCharArrayToString(header.levelTitle));
    for (let def = StyleDef.Orig; def <= StyleDef.X92; def++) {
      for (const info of getStyle(this.data.provider, def).levelSystem.allLevels()) {
        if (hash !== 0n ? info.getLevelHash() === hash : clean(info.getRawTitleString(false)) === title) return info;
      }
    }
    return null;
  }
}
