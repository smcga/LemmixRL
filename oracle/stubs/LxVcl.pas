unit LxVcl;

{ Oracle stand-in for the VCL units (Vcl.Forms, Vcl.Graphics, Vcl.Dialogs, Vcl.Controls, Vcl.ClipBrd,
  Vcl.Imaging.PngImage, Winapi.Windows). Display/UI only: nothing here influences the simulation. }

{$include lem_directives.inc}
{$scopedenums off} // Graphics32 and the VCL do not use scoped enums

interface

uses
  Types, Classes, SysUtils;

type
  TColor = -$7FFFFFFF-1..$7FFFFFFF;
  TFontQuality = (fqDefault, fqDraft, fqProof, fqNonAntialiased, fqAntialiased, fqClearType, fqClearTypeNatural);

  TFont = class(TPersistent)
  private
    FName: string;
    FHeight: Integer;
    FColor: TColor;
    FQuality: TFontQuality;
  public
    procedure Assign(Source: TPersistent); override;
    property Name: string read FName write FName;
    property Height: Integer read FHeight write FHeight;
    property Color: TColor read FColor write FColor;
    property Quality: TFontQuality read FQuality write FQuality;
  end;

  TBitmap = class(TPersistent)
  private
    FWidth, FHeight: Integer;
  public
    procedure LoadFromStream(S: TStream);
    property Width: Integer read FWidth write FWidth;
    property Height: Integer read FHeight write FHeight;
  end;

  TPngImage = class(TPersistent)
  public
    procedure SaveToFile(const aFileName: string);
  end;

  TClipboard = class(TPersistent)
  end;

const
  clWhite = TColor($FFFFFF);
  clBlack = TColor($000000);

function Clipboard: TClipboard;

implementation

var
  _Clipboard: TClipboard;

procedure TFont.Assign(Source: TPersistent);
begin
  if Source is TFont then begin
    FName := TFont(Source).Name;
    FHeight := TFont(Source).Height;
    FColor := TFont(Source).Color;
    FQuality := TFont(Source).Quality;
  end;
end;

procedure TBitmap.LoadFromStream(S: TStream);
begin
  // display only
end;

procedure TPngImage.SaveToFile(const aFileName: string);
begin
end;

function Clipboard: TClipboard;
begin
  if _Clipboard = nil then _Clipboard := TClipboard.Create;
  Result := _Clipboard;
end;

end.
