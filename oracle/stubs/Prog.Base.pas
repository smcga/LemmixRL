unit Prog.Base;

{ Oracle stand-in for Prog.Base.pas (the Consts static class) with the members used by the game units.
  Style information is only provided for the 5 built in DOS styles (as in Consts.Init / SetStyleName). }

{$include lem_directives.inc}

interface

uses
  Classes, SysUtils, Contnrs,
  Dos.Consts,
  Base.Utils, Base.Types;

type
  TLevelGraphicsMapping = (
    Default,
    Orig,
    Ohno,
    Concat
  );

  TLevelSpecialGraphicsMapping = (
    Default,
    Orig
  );

type
  Consts = class sealed
  public
    class var GLOBAL_DEVELOPER_MODUS : Boolean;
    type
      TStyleInformation = class
      private
        fStyleDef: TStyleDef;
        fFamily: TStyleFamily;
        fName: string;
        fDescription: string;
        fUserMechanics: TMechanics;
        fUserGraphicsMapping: TLevelGraphicsMapping;
        fUserSpecialGraphicsMapping: TLevelSpecialGraphicsMapping;
        fMaindatOhNo: Boolean;
      public
        property StyleDef: TStyleDef read fStyleDef;
        property Family: TStyleFamily read fFamily;
        property Name: string read fName;
        property Description: string read fDescription;
        property UserMechanics: TMechanics read fUserMechanics;
        property UserGraphicsMapping: TLevelGraphicsMapping read fUserGraphicsMapping;
        property UserSpecialGraphicsMapping: TLevelSpecialGraphicsMapping read fUserSpecialGraphicsMapping;
        property MaindatOhNo: Boolean read fMaindatOhNo;
      end;
    TStyleInformationList = class(TFastObjectList<TStyleInformation>);
  strict private
    class var fStyleDef: TStyleDef;
    class var fStyleName: string;
    class var fChristmasPalette: Boolean;
    class var fStyleInformationList: TStyleInformationList;
    class var fDataPath: string;
    class function GetPathToLemmings(const aStylename: string): string; static;
    class function GetPathToStyle(const aStylename: string): string; static;
  public
    const FilenameParticles = 'Particles.dat';
    const FilenameCursorHighlight = 'CursorHighlight.bmp';
    const FullProgramName = 'Lemmix oracle';
    const PathToReplay = 'Output/Replay/';
    const PathToAutoSave = 'Output/AutoSave/';
    const PathToBin = 'Output/Bin/';
    const PathToScreenShots = 'Output/ScreenShots/';
    class procedure Init(const aDataPath: string); static;
    class procedure SetStyleName(const aName: string); static;
    class function FindStyleInfo(const aStyleName: string): TStyleInformation; static;
    class function GraphicSetNameToGraphicSet(const aGraphicSetname: string): Integer; static;
    class property StyleDef: TStyleDef read fStyleDef;
    class property StyleName: string read fStyleName;
    class property ChristmasPalette: Boolean read fChristmasPalette;
    class property StyleInformationlist: TStyleInformationList read fStyleInformationList;
    class property DataPath: string read fDataPath;
    class property PathToLemmings[const aStylename: string]: string read GetPathToLemmings;
    class property PathToStyle[const aStylename: string]: string read GetPathToStyle;
  end;

implementation

class procedure Consts.Init(const aDataPath: string);
const
  Texts: array[TStyleDef] of string = ('Original Lemmings', 'Oh No More Lemmings!', 'Holiday Lemmings 1994', 'Xmas Lemmings 1991', 'Xmas Lemmings 1992', 'User Lemmings');
var
  def: TStyleDef;
  info: TStyleInformation;
begin
  fDataPath := IncludeTrailingPathDelimiter(aDataPath);
  fStyleInformationList := TStyleInformationList.Create;
  for def := TStyleDef.Orig to TStyleDef.X92 do begin
    info := TStyleInformation.Create;
    fStyleInformationList.Add(info);
    info.fStyleDef := def;
    info.fFamily := TStyleFamily.DOS;
    info.fName := STYLE_NAMES[def];
    info.fDescription := Texts[def];
  end;
end;

class procedure Consts.SetStyleName(const aName: string);
var
  def: TStyleDef;
begin
  fStyleDef := TStyleDef.Orig;
  for def := TStyleDef.Orig to TStyleDef.X92 do
    if SameText(STYLE_NAMES[def], aName) then
      fStyleDef := def;
  fStyleName := STYLE_NAMES[fStyleDef];
  fChristmasPalette := fStyleDef in [TStyleDef.H94, TStyleDef.X91, TStyleDef.X92];
end;

class function Consts.FindStyleInfo(const aStyleName: string): TStyleInformation;
begin
  for Result in StyleInformationList do
    if SameText(aStyleName, Result.Name) then
      Exit;
  Result := nil;
end;

class function Consts.GraphicSetNameToGraphicSet(const aGraphicSetname: string): Integer;
const
  fGraphicSetNames: array[0..8] of string = ('Dirt', 'Fire', 'Marble', 'Pillar', 'Crystal', 'Brick', 'Rock', 'Snow', 'Bubble');
begin
  for Result := 0 to 8 do
    if SameText(fGraphicSetNames[Result], aGraphicSetname) then
      Exit;
  Result := -1;
end;

class function Consts.GetPathToLemmings(const aStylename: string): string;
begin
  Result := fDataPath + aStylename + '/';
end;

class function Consts.GetPathToStyle(const aStylename: string): string;
begin
  Result := fDataPath + aStylename + '/';
end;

end.
