/**
 * Sets up a playable game the way the Lemmix screens do it:
 *  - GameScreen.Preview: LoadLevel, GraphicSet.Load, Renderer.Prepare
 *  - GameScreen.Player.BuildScreen: Game.Prepare(GameInfo)
 */
import type { DataProvider } from './data/datasource.ts';
import { Bitmap32 } from './gr32/bitmap32.ts';
import { Level } from './level/base.ts';
import { type GameInfo, LemmingGame } from './game/game.ts';
import { Renderer } from './game/rendering.ts';
import { GraphicSet, type LevelLoadingInformation, type Style, type StyleDef } from './styles/base.ts';
import { createDosStyle } from './styles/dos.ts';

export interface Session {
  style: Style;
  info: LevelLoadingInformation;
  level: Level;
  graphicSet: GraphicSet;
  renderer: Renderer;
  game: LemmingGame;
  targetBitmap: Bitmap32;
}

export type SessionOptions = Partial<Omit<GameInfo, 'style' | 'data' | 'renderer' | 'level' | 'levelLoadingInfo' | 'graphicSet' | 'targetBitmap'>>;

const styleCache = new WeakMap<DataProvider, Map<StyleDef, Style>>();

/** One style object per data provider and style (like the Lemmix style pool). */
export function getStyle(data: DataProvider, def: StyleDef): Style {
  let m = styleCache.get(data);
  if (!m) {
    m = new Map();
    styleCache.set(data, m);
  }
  let s = m.get(def);
  if (!s) {
    s = createDosStyle(def, data);
    m.set(def, s);
  }
  return s;
}

export function createSession(data: DataProvider, def: StyleDef, sectionIndex: number, levelIndex: number, options: SessionOptions = {}): Session {
  const style = getStyle(data, def);
  const info = style.levelSystem.findLevelByIndex(sectionIndex, levelIndex);
  if (!info) throw new Error(`Level not found: ${style.name} section ${sectionIndex} level ${levelIndex}`);
  return createSessionFromInfo(data, info, options);
}

export function createSessionFromInfo(data: DataProvider, info: LevelLoadingInformation, options: SessionOptions = {}): Session {
  const style = info.style;
  const level = new Level();
  info.loadLevel(level);
  const graphicSet = new GraphicSet(style);
  graphicSet.load(data, level.info.graphicSet, level.info.graphicSetEx);
  const renderer = new Renderer();
  renderer.prepare(level, graphicSet);
  const targetBitmap = new Bitmap32();
  const game = new LemmingGame();
  game.prepare({
    ...options,
    style,
    data,
    renderer,
    level,
    levelLoadingInfo: info,
    graphicSet,
    targetBitmap,
  });
  return { style, info, level, graphicSet, renderer, game, targetBitmap };
}
