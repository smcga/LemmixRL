/** Port of Level.Base.pas */

// Terrain Drawing Flags
export const tdf_Erase = 1; // use terrain bitmap as eraser
export const tdf_Invert = 2; // invert terrain bitmap
export const tdf_NoOverwrite = 4; // do not overwrite existing terrain pixels

// Object Drawing Flags
export const odf_OnlyOnTerrain = 1;
export const odf_UpsideDown = 2;
export const odf_NoOverwrite = 4;

export class LevelInfo {
  releaseRate = 1;
  lemmingsCount = 1;
  rescueCount = 1;
  timeLimit = 1;
  climberCount = 0;
  floaterCount = 0;
  bomberCount = 0;
  blockerCount = 0;
  builderCount = 0;
  basherCount = 0;
  minerCount = 0;
  diggerCount = 0;
  graphicSet = 0;
  graphicSetEx = 0;
  superLemming = false;
  screenPosition = 0;
  title = '';

  clear(): void {
    this.releaseRate = 1;
    this.lemmingsCount = 1;
    this.rescueCount = 1;
    this.timeLimit = 1;
    this.climberCount = 0;
    this.floaterCount = 0;
    this.bomberCount = 0;
    this.blockerCount = 0;
    this.builderCount = 0;
    this.basherCount = 0;
    this.minerCount = 0;
    this.diggerCount = 0;
    this.graphicSet = 0;
    this.graphicSetEx = 0;
    this.superLemming = false;
    this.screenPosition = 0;
    this.title = '';
  }
}

export class Terrain {
  left = 0;
  top = 0;
  identifier = 0;
  drawingFlags = 0;
}

export class InteractiveObject {
  left = 0;
  top = 0;
  identifier = 0;
  drawingFlags = 0; // odf_xxxx
}

export class Steel {
  left = 0;
  top = 0;
  width = 0;
  height = 0;
}

export class Level {
  readonly info = new LevelInfo();
  readonly interactiveObjects: InteractiveObject[] = [];
  readonly terrains: Terrain[] = [];
  readonly steels: Steel[] = [];

  clearLevel(): void {
    this.interactiveObjects.length = 0;
    this.terrains.length = 0;
    this.steels.length = 0;
  }
}
