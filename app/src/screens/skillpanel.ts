/** Port of Game.SkillPanel (TSkillPanelToolbar): the DOS skill panel, implementing the game's toolbar interface. */
import {
  Bitmap32,
  DataType,
  type DataProvider,
  DosDatDecompressor,
  DosInLevelPalettes,
  DosMiniMapCorners,
  DosPlanarBitmap,
  dosPaletteToArrayOfColor32,
  dosVgaColorToColor32,
  type GameToolbar,
  type GraphicSet,
  leadZeroStr,
  percentage,
  type Rect,
  restrict,
  SkillPanelButton,
  type Style,
  type TColor32,
} from '../../../engine/src/index.ts';
import { SGame_ToolBar_TextTemplate } from '../texts.ts';

const FIRST_BUTTON = SkillPanelButton.Slower;
const LAST_BUTTON = SkillPanelButton.Nuke;

function ptInRectEx(r: Rect, x: number, y: number): boolean {
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
}

/** Delphi Round (banker's rounding) */
function delphiRound(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export class SkillPanel implements GameToolbar {
  /** fImg.Bitmap */
  readonly bitmap = new Bitmap32();
  private readonly original = new Bitmap32();
  private readonly skillFont: Bitmap32[][] = []; // ['0'..'9'][0..1]
  private readonly infoFont: Bitmap32[] = []; // % 0..9 - A..Z
  private readonly buttonRects = new Map<SkillPanelButton, Rect>();
  private rectColor: TColor32 = 0;
  private lastDrawnStr = ' '.repeat(40).split('');
  private readonly newDrawStr = SGame_ToolBar_TextTemplate.split('');
  private isPauseButtonHighlighted = false;
  private pauseButtonChanged = false;
  private readonly pauseButtonBuffer = new Bitmap32();
  private updateCount = 0;
  /** set when the bitmap changed */
  dirty = true;
  /** the horizontal scroll position of the game image in bitmap pixels (for the minimap frame) */
  getScrollX: () => number = () => 0;
  onMinimapClick: ((x: number, y: number) => void) | null = null;
  onSkillButtonsMouseDown: ((button: SkillPanelButton, isDoubleClick: boolean) => void) | null = null;
  onSkillButtonsMouseUp: (() => void) | null = null;

  constructor() {
    for (let i = 0; i <= 37; i++) this.infoFont.push(new Bitmap32());
    for (let c = 0; c <= 9; c++) this.skillFont.push([new Bitmap32(), new Bitmap32()]);
  }

  setStyleAndGraph(data: DataProvider, style: Style, graph: GraphicSet): void {
    this.rectColor = style.christmasPalette
      ? dosVgaColorToColor32(DosInLevelPalettes[1][1]) // red
      : dosVgaColorToColor32(DosInLevelPalettes[0][3]); // white
    this.readBitmapFromStyle(data, style, graph);
    this.initPauseButtonBuffer();
    this.dirty = true;
  }

  // updating methods for hyperspeed
  beginUpdateImg(): void {
    this.updateCount++;
  }

  endUpdateImg(): void {
    this.updateCount--;
    this.dirty = true;
  }

  getUpdateCount(): number {
    return this.updateCount;
  }

  private readBitmapFromStyle(data: DataProvider, style: Style, graph: GraphicSet): void {
    // concatenate the palettes
    const lemmixPal = new Uint32Array(16);
    lemmixPal.set(dosPaletteToArrayOfColor32(DosInLevelPalettes[style.christmasPalette ? 1 : 0]));
    const hiPal = graph.paletteCustom;
    for (let i = 8; i <= 15; i++) lemmixPal[i] = hiPal[i - 8];
    lemmixPal[7] = lemmixPal[8];

    this.setButtonRects();

    const decompressor = new DosDatDecompressor();
    const sections = decompressor.loadSectionList(data.createDataStream(style.name, style.mainDatFileName, DataType.LemmingData), false);

    // skillpanel
    const s6 = sections[6];
    decompressor.decompressSection(s6.compressedData, s6.decompressedData);
    s6.decompressedData.seek(0);
    DosPlanarBitmap.loadFromStream(s6.decompressedData, this.original, 0, 320, 40, 4, lemmixPal);
    this.bitmap.assign(this.original);

    // info fonts
    s6.decompressedData.seek(0x1900);
    for (let i = 0; i <= 37; i++) DosPlanarBitmap.loadFromStream(s6.decompressedData, this.infoFont[i], -1, 8, 16, 3, lemmixPal);

    // skill fonts
    lemmixPal[1] = lemmixPal[3]; // WHITE
    const s2 = sections[2];
    decompressor.decompressSection(s2.compressedData, s2.decompressedData);
    s2.decompressedData.seek(0x1900);
    for (let c = 0; c <= 9; c++)
      for (let i = 0; i <= 1; i++) DosPlanarBitmap.loadFromStream(s2.decompressedData, this.skillFont[c][i], -1, 8, 8, 1, lemmixPal);
  }

  private initPauseButtonBuffer(): void {
    const c = 0x004040e0; // Color32(64, 64, 224, 0): this is the lemming color
    const src = this.buttonRects.get(SkillPanelButton.Pause)!;
    this.pauseButtonBuffer.setSize(src.right - src.left, src.bottom - src.top);
    this.original.drawTo(this.pauseButtonBuffer, 0, 0, src);
    this.pauseButtonBuffer.replaceColor(0, c);
  }

  private setButtonRects(): void {
    let r = { left: 1, top: 16, right: 15, bottom: 38 }; // exact position of first button
    for (let b = FIRST_BUTTON; b <= LAST_BUTTON; b++) {
      this.buttonRects.set(b, r);
      r = { left: r.left + 16, top: r.top, right: r.right + 16, bottom: r.bottom };
    }
  }

  drawButtonSelector(button: SkillPanelButton, highlight: boolean): void {
    if (button === SkillPanelButton.None) return;
    const b = this.buttonRects.get(button)!;
    const r = { left: b.left, top: b.top, right: b.right + 1, bottom: b.bottom + 2 };
    if (!highlight) {
      // remove selector by copying the original
      for (const a of [
        { ...r, bottom: r.top + 1 }, // top
        { ...r, right: r.left + 1 }, // left
        { ...r, left: r.right - 1 }, // right
        { ...r, top: r.bottom - 1 }, // bottom
      ])
        this.original.drawToRect(this.bitmap, a, a);
    } else this.bitmap.frameRectS(r.left, r.top, r.right, r.bottom, this.rectColor);
    this.dirty = true;
  }

  switchButtonSelector(oldButton: SkillPanelButton, newButton: SkillPanelButton): void {
    if (oldButton === newButton) return;
    this.drawButtonSelector(oldButton, false);
    this.drawButtonSelector(newButton, true);
  }

  private drawNewStr(): void {
    let x = 0;
    for (let i = 0; i < 40; i++) {
      const oldChar = this.lastDrawnStr[i].toUpperCase();
      const newChar = this.newDrawStr[i].toUpperCase();
      // only draw changed letters
      if (oldChar !== newChar) {
        let idx = -1;
        const code = newChar.charCodeAt(0);
        if (newChar === '%') idx = 0;
        else if (code >= 48 && code <= 57) idx = code - 48 + 1;
        else if (newChar === '-') idx = 11;
        else if (code >= 65 && code <= 90) idx = code - 65 + 12;
        if (idx >= 0 && idx <= 37) this.infoFont[idx].drawTo(this.bitmap, x, 0);
        else this.bitmap.fillRectS(x, 0, x + 8, 16, 0); // empty
        this.dirty = true;
      }
      x += 8;
    }
  }

  private drawCheckPauseButton(): void {
    if (!this.pauseButtonChanged) return;
    const r = this.buttonRects.get(SkillPanelButton.Pause)!;
    if (this.isPauseButtonHighlighted) this.pauseButtonBuffer.drawTo(this.bitmap, r.left, r.top);
    else this.original.drawTo(this.bitmap, r.left, r.top, r);
    this.pauseButtonChanged = false;
    this.dirty = true;
  }

  /** draw the number of skills left in the top of the buttons */
  drawSkillCount(button: SkillPanelButton, num: number): void {
    num = restrict(num, 0, 99);
    const s = leadZeroStr(num, 2);
    const btnIdx = button - 1; // "ignore" the 'None' button enumeration
    this.dirty = true;
    // white nothingness if number is zero
    if (num === 0) {
      this.bitmap.fillRect(btnIdx * 16 + 4, 17, btnIdx * 16 + 4 + 8, 17 + 8, 0xfff0d0d0); // Color32(60 * 4, 52 * 4, 52 * 4)
      return;
    }
    // left
    const dst = { left: btnIdx * 16 + 4, top: 17, right: btnIdx * 16 + 4 + 4, bottom: 17 + 8 };
    this.skillFont[s.charCodeAt(0) - 48][1].drawToRect(this.bitmap, dst, { left: 0, top: 0, right: 4, bottom: 8 }); // 1 is left
    // right
    const dst2 = { left: dst.left + 4, top: dst.top, right: dst.right + 4, bottom: dst.bottom };
    this.skillFont[s.charCodeAt(1) - 48][0].drawToRect(this.bitmap, dst2, { left: 4, top: 0, right: 8, bottom: 8 }); // 0 is right
  }

  /** called by game after a frame is finished */
  refreshInfo(): void {
    this.drawNewStr();
    this.drawCheckPauseButton();
    this.lastDrawnStr = [...this.newDrawStr];
  }

  // info positions types:
  // 1. BUILDER(23)             1/14               0..13
  // 2. OUT 28                  15/23              14..22
  // 3. IN 99%                  24/31              23..30
  // 4. TIME 2-31               32/40              31..39

  setInfoCursorLemming(lem: string, num: number): void {
    const s = lem ? (lem + ' ' + num).padEnd(14) : ' '.repeat(14);
    for (let i = 0; i < 14; i++) this.newDrawStr[i] = s[i];
  }

  setInfoAlternative(info: string): void {
    const s = info.padEnd(14);
    for (let i = 0; i < 14; i++) this.newDrawStr[i] = s[i];
  }

  setInfoLemmingsOut(num: number): void {
    const s = String(num).padEnd(5);
    for (let i = 0; i < 5; i++) this.newDrawStr[18 + i] = s[i];
  }

  setInfoLemmingsSaved(num: number, max: number, showCount: boolean): void {
    // NB: with showCount the original copies 5 characters of a 3 character string; the two characters behind it read
    // as #0 here (drawn as empty)
    const s = !showCount ? (percentage(max, num) + '%').padEnd(5) : String(num).padEnd(3);
    for (let i = 0; i < 5; i++) this.newDrawStr[26 + i] = s[i] ?? '\0';
  }

  setInfoMinutes(num: number): void {
    const s = String(num).padStart(2);
    for (let i = 0; i < 2; i++) this.newDrawStr[35 + i] = s[i];
  }

  setInfoSeconds(num: number): void {
    const s = String(num).padStart(2, '0');
    for (let i = 0; i < 2; i++) this.newDrawStr[38 + i] = s[i];
  }

  setPauseHighlight(highlight: boolean): void {
    if (this.isPauseButtonHighlighted === highlight) return;
    this.isPauseButtonHighlighted = highlight;
    this.pauseButtonChanged = true;
  }

  drawMinimap(map: Bitmap32): void {
    map.drawTo(this.bitmap, 208, 18);
    const x = delphiRound(this.getScrollX() / 16);
    this.bitmap.frameRectS(208 + x, 18, 208 + x + 20 + 5, 38, this.rectColor);
    this.dirty = true;
  }

  // mouse behaviour of the toolbar: minimap scrolling and button clicks (bitmap coordinates)

  mouseDown(x: number, y: number, isDoubleClick: boolean): void {
    if (ptInRectEx(DosMiniMapCorners, x, y)) {
      this.onMinimapClick?.((x - DosMiniMapCorners.left) * 16, (y - DosMiniMapCorners.top) * 8);
      return;
    }
    for (let b = FIRST_BUTTON; b <= LAST_BUTTON; b++) {
      if (ptInRectEx(this.buttonRects.get(b)!, x, y)) {
        this.onSkillButtonsMouseDown?.(b, isDoubleClick);
        return;
      }
    }
  }

  buttonAt(x: number, y: number): SkillPanelButton {
    for (let b = FIRST_BUTTON; b <= LAST_BUTTON; b++) if (ptInRectEx(this.buttonRects.get(b)!, x, y)) return b;
    return SkillPanelButton.None;
  }

  mouseMove(x: number, y: number, leftDown: boolean): void {
    if (leftDown && ptInRectEx(DosMiniMapCorners, x, y))
      this.onMinimapClick?.((x - DosMiniMapCorners.left) * 16, (y - DosMiniMapCorners.top) * 8);
  }

  mouseUp(): void {
    this.onSkillButtonsMouseUp?.();
  }
}
