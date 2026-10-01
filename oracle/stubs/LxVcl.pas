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
    // the pixels ($AARRGGBB, alpha $FF) of a loaded .bmp (uncompressed 1, 4, 8, 24 or 32 bits)
    Pixels: array of Cardinal;
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
var
  data: array of Byte;
  pixelOffset, headerSize, bpp, colors, stride, x, y, row, p, idx, h: Integer;
  pal: array of Cardinal;
  bottomUp: Boolean;

  function W16(o: Integer): Integer;
  begin
    Result := data[o] or (data[o + 1] shl 8);
  end;

  function W32(o: Integer): Integer;
  begin
    Result := Integer(Cardinal(data[o]) or (Cardinal(data[o + 1]) shl 8) or (Cardinal(data[o + 2]) shl 16) or (Cardinal(data[o + 3]) shl 24));
  end;

  function RGB(o: Integer): Cardinal;
  begin
    Result := $FF000000 or (Cardinal(data[o + 2]) shl 16) or (Cardinal(data[o + 1]) shl 8) or data[o];
  end;

begin
  SetLength(data, S.Size - S.Position);
  if Length(data) > 0 then
    S.ReadBuffer(data[0], Length(data));
  if (Length(data) < 54) or (data[0] <> Ord('B')) or (data[1] <> Ord('M')) then
    raise Exception.Create('not a bmp');
  pixelOffset := W32(10);
  headerSize := W32(14);
  FWidth := W32(18);
  h := W32(22);
  bpp := W16(28);
  colors := W32(46);
  if (colors = 0) and (bpp <= 8) then
    colors := 1 shl bpp;
  bottomUp := h > 0;
  FHeight := Abs(h);
  SetLength(pal, 0);
  if bpp <= 8 then begin
    SetLength(pal, colors);
    for idx := 0 to colors - 1 do
      pal[idx] := RGB(14 + headerSize + idx * 4);
  end;
  stride := ((FWidth * bpp + 31) div 32) * 4;
  SetLength(Pixels, FWidth * FHeight);
  for y := 0 to FHeight - 1 do begin
    if bottomUp then row := pixelOffset + (FHeight - 1 - y) * stride else row := pixelOffset + y * stride;
    for x := 0 to FWidth - 1 do begin
      case bpp of
        1: idx := (data[row + x shr 3] shr (7 - (x and 7))) and 1;
        4: if x and 1 = 0 then idx := data[row + x shr 1] shr 4 else idx := data[row + x shr 1] and 15;
        8: idx := data[row + x];
      else
        idx := 0;
      end;
      case bpp of
        24: p := row + x * 3;
        32: p := row + x * 4;
      else
        p := 0;
      end;
      if bpp <= 8 then Pixels[y * FWidth + x] := pal[idx]
      else Pixels[y * FWidth + x] := RGB(p);
    end;
  end;
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
