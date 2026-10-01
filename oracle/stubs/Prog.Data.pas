unit Prog.Data;

{ Oracle stand-in for Prog.Data.pas (TData.CreateDataStream).

  Lemmix reads the built in styles from zip resources, looking files up by their name without path
  and case-insensitively. The oracle reads the same files from a directory into which the build script
  extracted the zips (all file names in lower case):  <data>/<Style>/<file>  and  <data>/Particles.dat }

{$include lem_directives.inc}

interface

uses
  Classes, SysUtils,
  LxVcl, GR32,
  Base.Utils, Base.Types,
  Prog.Base;

type
  TDataType = (
    Asset,
    Cursor,
    Sound,
    Particles,
    LemmingData,
    LevelGraphics,
    LevelSpecialGraphics,
    Level,
    Music,
    Language
 );

type
  TData = class sealed
  public
    class function CreateDataStream(const aStyleName, aFileName: string; aType: TDataType; preventCaching: Boolean = False; disk: Boolean = False): TBytesStream; static;
    class function CreateCursorBitmap(const aStyleName, aFileName: string; preventCaching: Boolean = False): TBitmap; static;
  end;

implementation

class function TData.CreateDataStream(const aStyleName, aFileName: string; aType: TDataType; preventCaching: Boolean = False; disk: Boolean = False): TBytesStream;
var
  realName: string;
  f: TFileStream;
begin
  case aType of
    TDataType.LemmingData, TDataType.LevelGraphics, TDataType.LevelSpecialGraphics, TDataType.Level:
      realName := Consts.DataPath + aStyleName + '/' + LowerCase(ExtractFileName(aFileName));
    TDataType.Particles:
      realName := Consts.DataPath + 'Particles.dat';
  else
    raise Exception.Create('Unhandled resource data type (' + aFileName + ')');
  end;
  if not FileExists(realName) then
    raise Exception.Create('File not found in zip-resource: ' + ExtractFileName(aFileName));
  Result := TBytesStream.Create;
  f := TFileStream.Create(realName, fmOpenRead or fmShareDenyNone);
  try
    Result.CopyFrom(f, 0);
  finally
    f.Free;
  end;
  Result.Position := 0;
end;

class function TData.CreateCursorBitmap(const aStyleName, aFileName: string; preventCaching: Boolean = False): TBitmap;
begin
  Result := TBitmap.Create; // display only
end;

end.
