unit Base.Bitmaps;

{ Oracle stand-in for Base.Bitmaps.pas: the TColor32Helper and the TBitmap32Helper methods used by the
  game units, copied from the original. PNG/WIC and bitmap fonts are left out (display only). }

{$include lem_directives.inc}

interface

uses
  Types, Classes, SysUtils, Math,
  GR32, LxVcl,
  Base.Utils;

type
  TColor32Helper = record helper for TColor32
  strict private
    function GetR: Byte; inline;
    function GetG: Byte; inline;
    function GetB: Byte; inline;
    function GetA: Byte; inline;
    procedure SetR(aValue: Byte); inline;
    procedure SetG(aValue: Byte); inline;
    procedure SetB(aValue: Byte); inline;
    procedure SetA(aValue: Byte); inline;
  public
    procedure Init(aR, aG, aB, aA: Byte); inline;
    property R: Byte read GetR write SetR;
    property G: Byte read GetG write SetG;
    property B: Byte read GetB write SetB;
    property A: Byte read GetA write SetA;
  end;

  TPngMode = (
    Opaque,
    BlackIsTransparent,
    AsIs
  );

  TBitmap32Helper = class helper for TBitmap32
  public
    function GetPixelCount: Integer; inline;
    function ToPng(mode: TPngMode): TPngImage;
    procedure ReplaceColor(FromColor, ToColor: TColor32);
    procedure ReplaceAllNonZeroColors(ToColor: TColor32);
    procedure ReplaceAlphaForAllNonZeroColors(alpha: Byte);
    function CalcFrameRect(aFrameCount, aFrameIndex: Integer): TRect;
    function GetUpdateCount: Integer; inline;
  end;

implementation

{ TColor32Helper }

function TColor32Helper.GetR: Byte;
begin
  Result := TColor32Entry(Self).R;
end;

function TColor32Helper.GetG: Byte;
begin
  Result := TColor32Entry(Self).G;
end;

function TColor32Helper.GetB: Byte;
begin
  Result := TColor32Entry(Self).B;
end;

function TColor32Helper.GetA: Byte;
begin
  Result := TColor32Entry(Self).A;
end;

procedure TColor32Helper.SetR(aValue: Byte);
begin
  TColor32Entry(Self).R := aValue;
end;

procedure TColor32Helper.SetG(aValue: Byte);
begin
  TColor32Entry(Self).G := aValue;
end;

procedure TColor32Helper.SetB(aValue: Byte);
begin
  TColor32Entry(Self).B := aValue;
end;

procedure TColor32Helper.SetA(aValue: Byte);
begin
  TColor32Entry(Self).A := aValue;
end;

procedure TColor32Helper.Init(aR, aG, aB, aA: Byte);
begin
  R := aR;
  G := aG;
  B := aB;
  A := aA;
end;

{ TBitmap32Helper }

function TBitmap32Helper.GetPixelCount: Integer;
begin
  Result := Width * Height;
end;

function TBitmap32Helper.ToPng(mode: TPngMode): TPngImage;
begin
  Result := TPngImage.Create;
end;

procedure TBitmap32Helper.ReplaceAllNonZeroColors(ToColor: TColor32);
var
  P: PColor32;
  i: Integer;
begin
  if Width + Height = 0 then
    Exit;
  P := PixelPtr[0, 0];
  for i := 0 to Height * Width - 1 do begin
    if P^ <> 0 then
      P^ := ToColor;
    Inc(P);
  end;
end;

procedure TBitmap32Helper.ReplaceAlphaForAllNonZeroColors(alpha: Byte);
var
  P: PColor32;
  i: Integer;
begin
  if Width + Height = 0 then
    Exit;
  P := PixelPtr[0, 0];
  for i := 0 to Height * Width - 1 do begin
    if P^ <> 0 then
      P^.A := alpha;
    Inc(P);
  end;
end;

function TBitmap32Helper.CalcFrameRect(aFrameCount, aFrameIndex: Integer): TRect;
var
  Y, H: Integer;
begin
  H := Height div aFrameCount;
  Y := H * aFrameIndex;
  Result := Rect(0, Y, Width, Y + H);
end;

procedure TBitmap32Helper.ReplaceColor(FromColor, ToColor: TColor32);
var
  P: PColor32;
  i: Integer;
begin
  if Width + Height = 0 then
    Exit;
  P := PixelPtr[0, 0];
  for i := 0 to Height * Width - 1 do begin
    if P^ = FromColor then
      P^ := ToColor;
    Inc(P);
  end;
end;

function TBitmap32Helper.GetUpdateCount: Integer;
begin
  Result := UpdateCount;
end;

end.
