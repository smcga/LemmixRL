/** Port of Level.Loader.pas (TLevelLoader.TranslateLevel: LVL record -> TLevel). */
import { ensureRange } from '../base/utils.ts';
import { GAME_BMPWIDTH } from '../dos/consts.ts';
import {
  ansiCharArrayToString,
  LVLField,
  LVL_MAXOBJECTCOUNT,
  LVL_MAXSTEELCOUNT,
  LVL_MAXTERRAINCOUNT,
  lvlIsSuperLemming,
  lvlObjectBytes,
  lvlSteelBytes,
  lvlTerrainBytes,
  lvlTitleBytes,
  lvlWord,
  type LVLRec,
} from '../dos/structures.ts';
import { InteractiveObject, Level, odf_NoOverwrite, odf_OnlyOnTerrain, odf_UpsideDown, Steel, Terrain } from './base.ts';

export function translateLevel(lvl: LVLRec, level: Level): void {
  level.clearLevel();
  const info = level.info;

  // the statics
  info.releaseRate = lvlWord(lvl, LVLField.ReleaseRate);
  info.lemmingsCount = lvlWord(lvl, LVLField.LemmingsCount);
  info.rescueCount = lvlWord(lvl, LVLField.RescueCount);
  info.timeLimit = lvlWord(lvl, LVLField.TimeLimit);
  info.climberCount = lvlWord(lvl, LVLField.ClimberCount);
  info.floaterCount = lvlWord(lvl, LVLField.FloaterCount);
  info.bomberCount = lvlWord(lvl, LVLField.BomberCount);
  info.blockerCount = lvlWord(lvl, LVLField.BlockerCount);
  info.builderCount = lvlWord(lvl, LVLField.BuilderCount);
  info.basherCount = lvlWord(lvl, LVLField.BasherCount);
  info.minerCount = lvlWord(lvl, LVLField.MinerCount);
  info.diggerCount = lvlWord(lvl, LVLField.DiggerCount);
  info.screenPosition = lvlWord(lvl, LVLField.ScreenPosition);
  info.graphicSet = lvlWord(lvl, LVLField.GraphicSet);
  info.graphicSetEx = lvlWord(lvl, LVLField.GraphicSetEx);
  info.superLemming = lvlIsSuperLemming(lvl);
  info.title = ansiCharArrayToString(lvlTitleBytes(lvl));

  // the objects
  for (let i = 0; i < LVL_MAXOBJECTCOUNT; i++) {
    const o = lvlObjectBytes(lvl, i);
    if (o.every((v) => v === 0)) continue;
    const obj = new InteractiveObject();
    level.interactiveObjects.push(obj);
    obj.left = (o[0] << 8) + o[1] - 16;
    obj.top = (o[2] << 8) + o[3];
    obj.identifier = o[5] & 15;
    const modifier = o[6];
    const displayMode = o[7];
    if ((modifier & 0x80) !== 0) obj.drawingFlags |= odf_NoOverwrite;
    if ((modifier & 0x40) !== 0) obj.drawingFlags |= odf_OnlyOnTerrain;
    if (displayMode === 0x8f) obj.drawingFlags |= odf_UpsideDown;
  }

  // the terrain
  for (let i = 0; i < LVL_MAXTERRAINCOUNT; i++) {
    const t = lvlTerrainBytes(lvl, i);
    if (t[0] === 0xff && t[1] === 0xff && t[2] === 0xff && t[3] === 0xff) continue;
    const ter = new Terrain();
    level.terrains.push(ter);
    ter.left = ((t[0] & 15) << 8) + t[1] - 16; // 9 bits
    ter.drawingFlags = t[0] >>> 5; // the bits are compatible with the Lemmix DrawingFlags
    let h = (t[2] << 1) + ((t[3] & 0x80) >>> 7);
    if (h >= 256) h -= 512;
    h -= 4;
    ter.top = h;
    ter.identifier = t[3] & 63; // max = 63. bit7 belongs to ypos
  }

  // the steel
  for (let i = 0; i < LVL_MAXSTEELCOUNT; i++) {
    const s = lvlSteelBytes(lvl, i);
    if (s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 0) continue;
    const steel = new Steel();
    level.steels.push(steel);
    steel.left = ((s[0] << 1) + ((s[1] & 0x80) >>> 7)) * 4 - 16; // 9 bits
    steel.top = (s[1] & 0x7f) * 4; // bit 7 belongs to steelx
    steel.width = (s[2] >>> 4) * 4 + 4;
    steel.height = (s[2] & 0xf) * 4 + 4;
  }

  // repair nonsense in case anybody messed around with LVL files or worse
  info.releaseRate = ensureRange(info.releaseRate, 1, 99);
  info.lemmingsCount = ensureRange(info.lemmingsCount, 1, 255);
  info.rescueCount = ensureRange(info.rescueCount, 1, info.lemmingsCount);
  info.timeLimit = ensureRange(info.timeLimit, 1, 99);
  info.climberCount = ensureRange(info.climberCount, 0, 99);
  info.floaterCount = ensureRange(info.floaterCount, 0, 99);
  info.bomberCount = ensureRange(info.bomberCount, 0, 99);
  info.blockerCount = ensureRange(info.blockerCount, 0, 99);
  info.builderCount = ensureRange(info.builderCount, 0, 99);
  info.basherCount = ensureRange(info.basherCount, 0, 99);
  info.minerCount = ensureRange(info.minerCount, 0, 99);
  info.diggerCount = ensureRange(info.diggerCount, 0, 99);
  info.screenPosition = ensureRange(info.screenPosition, -200, GAME_BMPWIDTH - 200);
  info.graphicSet = ensureRange(info.graphicSet, 0, 9);
  info.graphicSetEx = ensureRange(info.graphicSetEx, 0, 9);

  // todo (original): find the best solution for this
  if (info.graphicSetEx > 4) info.graphicSetEx = 1;
}
