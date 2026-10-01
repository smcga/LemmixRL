unit GR32;

{-------------------------------------------------------------------------------------------------
  Oracle stand-in for Graphics32 (GR32, GR32_OrdinalMaps, GR32_Layers, GR32_Image, GR32_Blend,
  GR32_LowLevel), containing only what the Lemmix game units use.

  The parts that influence the simulation are copied from the Graphics32 sources in src/Graphics32
  (as modified by Lemmix: TPixelCombineEvent is a plain procedure type):
    - TCustomBitmap32.SetSize / PixelS / SetPixelS / Assign / CopyMapTo / CopyPropertiesTo / FlipVert
    - GR32_Resamplers.BlockTransfer / StretchTransfer / BlendBlock (clipping arithmetic)
    - GR32.IntersectRect / OffsetRect / IsRectEmpty
  Everything that is display-only (layers, fonts, alpha blending) is a stub or simplified.
-------------------------------------------------------------------------------------------------}

{$include lem_directives.inc}
{$scopedenums off} // Graphics32 and the VCL do not use scoped enums

interface

uses
  Types, Classes, SysUtils, Math, LxVcl;

type
  PColor32 = ^TColor32;
  TColor32 = type Cardinal;

  PColor32Array = ^TColor32Array;
  TColor32Array = array [0..0] of TColor32;
  TArrayOfColor32 = array of TColor32;

  PColor32Entry = ^TColor32Entry;
  TColor32Entry = packed record
    case Integer of
      0: (B, G, R, A: Byte);
      1: (ARGB: TColor32);
      2: (Planes: array[0..3] of Byte);
  end;

  TDrawMode = (dmOpaque, dmBlend, dmCustom, dmTransparent);
  TCombineMode = (cmBlend, cmMerge);
  TWrapMode = (wmClamp, wmRepeat, wmMirror);

  TPixelCombineEvent = procedure(F: TColor32; var B: TColor32; M: TColor32); // Lemmix: "made this static"

  TFloatRect = record
    Left, Top, Right, Bottom: Single;
  end;

  TCustomBitmap32 = class(TPersistent)
  private
    FWidth: Integer;
    FHeight: Integer;
    FBits: PColor32Array;
    FClipRect: TRect;
    FOuterColor: TColor32;
    FDrawMode: TDrawMode;
    FCombineMode: TCombineMode;
    FWrapMode: TWrapMode;
    FMasterAlpha: Cardinal;
    FOnPixelCombine: TPixelCombineEvent;
    FUpdateCount: Integer;
    FMeasuringMode: Boolean;
    FFont: TFont;
    function GetPixel(X, Y: Integer): TColor32; inline;
    procedure SetPixel(X, Y: Integer; Value: TColor32); inline;
    function GetPixelS(X, Y: Integer): TColor32;
    procedure SetPixelS(X, Y: Integer; Value: TColor32);
    function GetPixelPtr(X, Y: Integer): PColor32;
    function GetBoundsRect: TRect;
    procedure SetClipRect(const Value: TRect);
    function GetClipping: Boolean;
    procedure SetMasterAlpha(Value: Cardinal);
    procedure SetFont(Value: TFont);
    procedure SetWidth(NewWidth: Integer);
    procedure SetHeight(NewHeight: Integer);
  protected
    procedure ChangeSize(var Width, Height: Integer; NewWidth, NewHeight: Integer); virtual;
  public
    constructor Create; virtual;
    destructor Destroy; override;
    procedure Assign(Source: TPersistent); override;
    function SetSize(NewWidth, NewHeight: Integer): Boolean; virtual;
    procedure SetSizeFrom(Source: TPersistent);
    function Empty: Boolean;
    procedure Clear; overload;
    procedure Clear(FillColor: TColor32); overload;
    procedure ResetClipRect;
    procedure CopyMapTo(Dst: TCustomBitmap32);
    procedure CopyPropertiesTo(Dst: TCustomBitmap32);
    procedure BeginUpdate;
    procedure EndUpdate;
    procedure Changed; overload;
    procedure Changed(const Area: TRect; const Info: Cardinal = 0); overload;
    procedure FillRect(X1, Y1, X2, Y2: Integer; Value: TColor32);
    procedure FillRectS(X1, Y1, X2, Y2: Integer; Value: TColor32); overload;
    procedure FillRectS(const ARect: TRect; Value: TColor32); overload;
    procedure FillRectT(X1, Y1, X2, Y2: Integer; Value: TColor32);
    procedure FillRectTS(X1, Y1, X2, Y2: Integer; Value: TColor32); overload;
    procedure FillRectTS(const ARect: TRect; Value: TColor32); overload;
    procedure FrameRectS(X1, Y1, X2, Y2: Integer; Value: TColor32); overload;
    procedure FrameRectS(const ARect: TRect; Value: TColor32); overload;
    procedure FlipVert(Dst: TCustomBitmap32 = nil);
    procedure Draw(DstX, DstY: Integer; Src: TCustomBitmap32); overload;
    procedure Draw(DstX, DstY: Integer; const SrcRect: TRect; Src: TCustomBitmap32); overload;
    procedure Draw(const DstRect, SrcRect: TRect; Src: TCustomBitmap32); overload;
    procedure DrawTo(Dst: TCustomBitmap32); overload;
    procedure DrawTo(Dst: TCustomBitmap32; DstX, DstY: Integer); overload;
    procedure DrawTo(Dst: TCustomBitmap32; DstX, DstY: Integer; const SrcRect: TRect); overload;
    procedure DrawTo(Dst: TCustomBitmap32; const DstRect: TRect); overload;
    procedure DrawTo(Dst: TCustomBitmap32; const DstRect, SrcRect: TRect); overload;
    function TextExtent(const Text: string): TSize;
    function TextWidth(const Text: string): Integer;
    function TextHeight(const Text: string): Integer;
    procedure Textout(X, Y: Integer; const Text: string);
    procedure ResetAlpha;
    property Width: Integer read FWidth write SetWidth;
    property Height: Integer read FHeight write SetHeight;
    property Bits: PColor32Array read FBits;
    property Pixel[X, Y: Integer]: TColor32 read GetPixel write SetPixel; default;
    property PixelS[X, Y: Integer]: TColor32 read GetPixelS write SetPixelS;
    property PixelPtr[X, Y: Integer]: PColor32 read GetPixelPtr;
    property BoundsRect: TRect read GetBoundsRect;
    property ClipRect: TRect read FClipRect write SetClipRect;
    property Clipping: Boolean read GetClipping;
    property OuterColor: TColor32 read FOuterColor write FOuterColor;
    property DrawMode: TDrawMode read FDrawMode write FDrawMode;
    property CombineMode: TCombineMode read FCombineMode write FCombineMode;
    property WrapMode: TWrapMode read FWrapMode write FWrapMode;
    property MasterAlpha: Cardinal read FMasterAlpha write SetMasterAlpha;
    property OnPixelCombine: TPixelCombineEvent read FOnPixelCombine write FOnPixelCombine;
    property MeasuringMode: Boolean read FMeasuringMode;
    property Font: TFont read FFont write SetFont;
    property UpdateCount: Integer read FUpdateCount;
  end;

  TBitmap32 = class(TCustomBitmap32);

  { GR32_OrdinalMaps }
  TByteMap = class(TPersistent)
  private
    FBits: PByteArray;
    FWidth, FHeight: Integer;
    function GetValPtr(X, Y: Integer): PByte; inline;
    function GetValue(X, Y: Integer): Byte; inline;
    procedure SetValue(X, Y: Integer; Value: Byte); inline;
  public
    destructor Destroy; override;
    function SetSize(NewWidth, NewHeight: Integer): Boolean;
    procedure Clear(FillValue: Byte);
    property Bits: PByteArray read FBits;
    property ValPtr[X, Y: Integer]: PByte read GetValPtr;
    property Value[X, Y: Integer]: Byte read GetValue write SetValue; default;
    property Width: Integer read FWidth;
    property Height: Integer read FHeight;
  end;

  { GR32_Layers / GR32_Image (display only) }
  TCustomLayer = class;
  TLayerCollection = class
  public
    Owner: TObject;
  end;

  TPaintLayerEvent = procedure(Sender: TObject; Buffer: TBitmap32) of object;

  TCustomLayer = class(TPersistent)
  private
    FVisible: Boolean;
    FMouseEvents: Boolean;
    FOnPaint: TPaintLayerEvent;
  public
    constructor Create(aLayerCollection: TLayerCollection); virtual;
    procedure Update; overload;
    procedure Changed;
    property Visible: Boolean read FVisible write FVisible;
    property MouseEvents: Boolean read FMouseEvents write FMouseEvents;
    property OnPaint: TPaintLayerEvent read FOnPaint write FOnPaint;
  end;

  TPositionedLayer = class(TCustomLayer)
  private
    FScaled: Boolean;
  public
    property Scaled: Boolean read FScaled write FScaled;
  end;

  TImage32 = class
  private
    FLayers: TLayerCollection;
    FBitmap: TBitmap32;
  public
    constructor Create;
    destructor Destroy; override;
    function BitmapToControl(const P: TPoint): TPoint;
    property Layers: TLayerCollection read FLayers;
    property Bitmap: TBitmap32 read FBitmap;
  end;

const
  clBlack32               = TColor32($FF000000);
  clDimGray32             = TColor32($FF3F3F3F);
  clGray32                = TColor32($FF7F7F7F);
  clLightGray32           = TColor32($FFBFBFBF);
  clWhite32               = TColor32($FFFFFFFF);
  clMaroon32              = TColor32($FF7F0000);
  clGreen32               = TColor32($FF007F00);
  clOlive32               = TColor32($FF7F7F00);
  clNavy32                = TColor32($FF00007F);
  clPurple32              = TColor32($FF7F007F);
  clTeal32                = TColor32($FF007F7F);
  clRed32                 = TColor32($FFFF0000);
  clLime32                = TColor32($FF00FF00);
  clYellow32              = TColor32($FFFFFF00);
  clBlue32                = TColor32($FF0000FF);
  clFuchsia32             = TColor32($FFFF00FF);
  clAqua32                = TColor32($FF00FFFF);
  clCornFlowerBlue32      = TColor32($FF6495ED);
  clOrange32              = TColor32($FFFFA500);
  clOrangeRed32           = TColor32($FFFF4500);
  clTrWhite32             = TColor32($7FFFFFFF);
  clTrBlack32             = TColor32($7F000000);

function Color32(R, G, B: Byte; A: Byte = $FF): TColor32; overload; inline;
function SetAlpha(Color32: TColor32; NewAlpha: Integer): TColor32; inline;
function WinColor(Color32: TColor32): TColor;
function RedComponent(Color32: TColor32): Integer; inline;
function GreenComponent(Color32: TColor32): Integer; inline;
function BlueComponent(Color32: TColor32): Integer; inline;
function AlphaComponent(Color32: TColor32): Integer; inline;

function IntersectRect(out Dst: TRect; const R1, R2: TRect): Boolean;
procedure OffsetRect(var R: TRect; Dx, Dy: Integer);
function IsRectEmpty(const R: TRect): Boolean;
function MakeRect(const L, T, R, B: Integer): TRect;

procedure MoveLongword(const Source; var Dest; Count: Integer);
procedure FillLongword(var X; Count: Cardinal; Value: Longword);
procedure EMMS;

procedure BlendMem(F: TColor32; var B: TColor32);
function BlendReg(F, B: TColor32): TColor32;

procedure BlockTransfer(
  Dst: TCustomBitmap32; DstX: Integer; DstY: Integer; DstClip: TRect;
  Src: TCustomBitmap32; SrcRect: TRect;
  CombineOp: TDrawMode; CombineCallBack: TPixelCombineEvent);

procedure StretchTransfer(
  Dst: TCustomBitmap32; DstRect: TRect; DstClip: TRect;
  Src: TCustomBitmap32; SrcRect: TRect;
  CombineOp: TDrawMode; CombineCallBack: TPixelCombineEvent);

implementation

function Color32(R, G, B: Byte; A: Byte = $FF): TColor32;
begin
  Result := (A shl 24) or (R shl 16) or (G shl  8) or B;
end;

function SetAlpha(Color32: TColor32; NewAlpha: Integer): TColor32;
begin
  if NewAlpha < 0 then NewAlpha := 0
  else if NewAlpha > $FF then NewAlpha := $FF;
  Result := (Color32 and $00FFFFFF) or (TColor32(NewAlpha) shl 24);
end;

function WinColor(Color32: TColor32): TColor;
begin
  Result := ((Color32 and $00FF0000) shr 16) or (Color32 and $0000FF00) or ((Color32 and $000000FF) shl 16);
end;

function RedComponent(Color32: TColor32): Integer;
begin
  Result := (Color32 and $00FF0000) shr 16;
end;

function GreenComponent(Color32: TColor32): Integer;
begin
  Result := (Color32 and $0000FF00) shr 8;
end;

function BlueComponent(Color32: TColor32): Integer;
begin
  Result := Color32 and $000000FF;
end;

function AlphaComponent(Color32: TColor32): Integer;
begin
  Result := Color32 shr 24;
end;

{ from GR32.pas }
function IntersectRect(out Dst: TRect; const R1, R2: TRect): Boolean;
begin
  if R1.Left >= R2.Left then Dst.Left := R1.Left else Dst.Left := R2.Left;
  if R1.Right <= R2.Right then Dst.Right := R1.Right else Dst.Right := R2.Right;
  if R1.Top >= R2.Top then Dst.Top := R1.Top else Dst.Top := R2.Top;
  if R1.Bottom <= R2.Bottom then Dst.Bottom := R1.Bottom else Dst.Bottom := R2.Bottom;
  Result := (Dst.Right >= Dst.Left) and (Dst.Bottom >= Dst.Top);
  if not Result then Dst := Rect(0, 0, 0, 0);
end;

procedure OffsetRect(var R: TRect; Dx, Dy: Integer);
begin
  Inc(R.Left, Dx); Inc(R.Top, Dy);
  Inc(R.Right, Dx); Inc(R.Bottom, Dy);
end;

function IsRectEmpty(const R: TRect): Boolean;
begin
  Result := (R.Right <= R.Left) or (R.Bottom <= R.Top);
end;

function MakeRect(const L, T, R, B: Integer): TRect;
begin
  Result.Left := L; Result.Top := T; Result.Right := R; Result.Bottom := B;
end;

procedure MoveLongword(const Source; var Dest; Count: Integer);
begin
  Move(Source, Dest, Count shl 2);
end;

procedure FillLongword(var X; Count: Cardinal; Value: Longword);
var
  P: PLongword;
  I: Cardinal;
begin
  P := @X;
  for I := 1 to Count do begin P^ := Value; Inc(P); end;
end;

procedure EMMS;
begin
end;

{ display only: plain blending (cmBlend) }
function BlendReg(F, B: TColor32): TColor32;
var
  FA: Integer;
begin
  FA := F shr 24;
  if FA = 0 then Exit(B);
  if FA = $FF then Exit(F);
  Result := Color32(
    (RedComponent(F) * FA + RedComponent(B) * (255 - FA)) div 255,
    (GreenComponent(F) * FA + GreenComponent(B) * (255 - FA)) div 255,
    (BlueComponent(F) * FA + BlueComponent(B) * (255 - FA)) div 255,
    $FF);
end;

procedure BlendMem(F: TColor32; var B: TColor32);
begin
  B := BlendReg(F, B);
end;

{ TCustomBitmap32 }

constructor TCustomBitmap32.Create;
begin
  inherited Create;
  FOuterColor := $00000000;  // by default as full transparency black
  FMasterAlpha := $FF;
  FCombineMode := cmBlend;
  FDrawMode := dmOpaque;
  FFont := TFont.Create;
end;

destructor TCustomBitmap32.Destroy;
begin
  if FBits <> nil then FreeMem(FBits);
  FFont.Free;
  inherited;
end;

procedure TCustomBitmap32.ChangeSize(var Width, Height: Integer; NewWidth, NewHeight: Integer);
begin
  if FBits <> nil then FreeMem(FBits);
  FBits := nil;
  if NewWidth * NewHeight > 0 then
    FBits := AllocMem(NewWidth * NewHeight * 4); // the GDI backend hands out zero filled memory
  Width := NewWidth;
  Height := NewHeight;
  ResetClipRect; // BackendChangedHandler
end;

function TCustomBitmap32.SetSize(NewWidth, NewHeight: Integer): Boolean;
begin
  if NewWidth < 0 then NewWidth := 0;
  if NewHeight < 0 then NewHeight := 0;
  Result := (NewWidth <> FWidth) or (NewHeight <> FHeight);
  if Result then
    ChangeSize(FWidth, FHeight, NewWidth, NewHeight);
end;

procedure TCustomBitmap32.SetSizeFrom(Source: TPersistent);
begin
  if Source is TCustomBitmap32 then
    SetSize(TCustomBitmap32(Source).Width, TCustomBitmap32(Source).Height)
  else
    SetSize(0, 0);
end;

function TCustomBitmap32.Empty: Boolean;
begin
  Result := (FBits = nil) or (FWidth = 0) or (FHeight = 0);
end;

procedure TCustomBitmap32.ResetClipRect;
begin
  FClipRect := BoundsRect;
end;

procedure TCustomBitmap32.SetClipRect(const Value: TRect);
begin
  IntersectRect(FClipRect, Value, BoundsRect);
end;

function TCustomBitmap32.GetClipping: Boolean;
begin
  Result := not EqualRect(FClipRect, BoundsRect);
end;

procedure TCustomBitmap32.SetMasterAlpha(Value: Cardinal);
begin
  FMasterAlpha := Value;
end;

procedure TCustomBitmap32.SetFont(Value: TFont);
begin
  FFont.Assign(Value);
end;

{ from GR32.pas TCustomMap }
procedure TCustomBitmap32.SetWidth(NewWidth: Integer);
begin
  SetSize(NewWidth, Height);
end;

procedure TCustomBitmap32.SetHeight(NewHeight: Integer);
begin
  SetSize(Width, NewHeight);
end;

function TCustomBitmap32.GetBoundsRect: TRect;
begin
  Result := Rect(0, 0, FWidth, FHeight);
end;

function TCustomBitmap32.GetPixel(X, Y: Integer): TColor32;
begin
  Result := FBits^[X + Y * FWidth];
end;

procedure TCustomBitmap32.SetPixel(X, Y: Integer; Value: TColor32);
begin
  FBits^[X + Y * FWidth] := Value;
end;

function TCustomBitmap32.GetPixelS(X, Y: Integer): TColor32;
begin
  if (X >= FClipRect.Left) and (X < FClipRect.Right) and
     (Y >= FClipRect.Top) and (Y < FClipRect.Bottom) then
    Result := FBits^[X + Y * FWidth]
  else
    Result := FOuterColor;
end;

procedure TCustomBitmap32.SetPixelS(X, Y: Integer; Value: TColor32);
begin
  if (X >= FClipRect.Left) and (X < FClipRect.Right) and
     (Y >= FClipRect.Top) and (Y < FClipRect.Bottom) then
    FBits^[X + Y * FWidth] := Value;
end;

function TCustomBitmap32.GetPixelPtr(X, Y: Integer): PColor32;
begin
  Result := @FBits^[X + Y * FWidth];
end;

procedure TCustomBitmap32.Clear;
begin
  Clear(clBlack32);
end;

procedure TCustomBitmap32.Clear(FillColor: TColor32);
begin
  if Empty then Exit;
  if Clipping then
    FillRect(FClipRect.Left, FClipRect.Top, FClipRect.Right, FClipRect.Bottom, FillColor)
  else
    FillLongword(FBits^[0], FWidth * FHeight, FillColor);
end;

procedure TCustomBitmap32.CopyMapTo(Dst: TCustomBitmap32);
begin
  Dst.SetSize(Width, Height);
  if not Empty then
    MoveLongword(FBits^[0], Dst.FBits^[0], Width * Height);
end;

procedure TCustomBitmap32.CopyPropertiesTo(Dst: TCustomBitmap32);
begin
  Dst.DrawMode := Self.DrawMode;
  Dst.CombineMode := Self.CombineMode;
  Dst.WrapMode := Self.WrapMode;
  Dst.MasterAlpha := Self.MasterAlpha;
  Dst.OuterColor := Self.OuterColor;
end;

procedure TCustomBitmap32.Assign(Source: TPersistent);
begin
  if not Assigned(Source) then
    SetSize(0, 0)
  else if Source is TCustomBitmap32 then
  begin
    TCustomBitmap32(Source).CopyMapTo(Self);
    TCustomBitmap32(Source).CopyPropertiesTo(Self);
  end
  else if Source is TBitmap then
    SetSize(TBitmap(Source).Width, TBitmap(Source).Height) // display only (cursor bitmaps)
  else
    inherited;
end;

procedure TCustomBitmap32.BeginUpdate;
begin
  Inc(FUpdateCount);
end;

procedure TCustomBitmap32.EndUpdate;
begin
  Dec(FUpdateCount);
end;

procedure TCustomBitmap32.Changed;
begin
end;

procedure TCustomBitmap32.Changed(const Area: TRect; const Info: Cardinal);
begin
end;

procedure TCustomBitmap32.FillRect(X1, Y1, X2, Y2: Integer; Value: TColor32);
var
  j: Integer;
  P: PColor32Array;
begin
  for j := Y1 to Y2 - 1 do
  begin
    P := Pointer(@FBits^[j * FWidth]);
    FillLongword(P^[X1], X2 - X1, Value);
  end;
end;

procedure TCustomBitmap32.FillRectS(X1, Y1, X2, Y2: Integer; Value: TColor32);
begin
  if (X2 > X1) and (Y2 > Y1) and
    (X1 < FClipRect.Right) and (Y1 < FClipRect.Bottom) and
    (X2 > FClipRect.Left) and (Y2 > FClipRect.Top) then
  begin
    if X1 < FClipRect.Left then X1 := FClipRect.Left;
    if Y1 < FClipRect.Top then Y1 := FClipRect.Top;
    if X2 > FClipRect.Right then X2 := FClipRect.Right;
    if Y2 > FClipRect.Bottom then Y2 := FClipRect.Bottom;
    FillRect(X1, Y1, X2, Y2, Value);
  end;
end;

procedure TCustomBitmap32.FillRectS(const ARect: TRect; Value: TColor32);
begin
  with ARect do FillRectS(Left, Top, Right, Bottom, Value);
end;

procedure TCustomBitmap32.FillRectT(X1, Y1, X2, Y2: Integer; Value: TColor32);
var
  i, j: Integer;
begin
  for j := Y1 to Y2 - 1 do
    for i := X1 to X2 - 1 do
      BlendMem(Value, FBits^[i + j * FWidth]);
end;

procedure TCustomBitmap32.FillRectTS(X1, Y1, X2, Y2: Integer; Value: TColor32);
begin
  if (X2 > X1) and (Y2 > Y1) and
    (X1 < FClipRect.Right) and (Y1 < FClipRect.Bottom) and
    (X2 > FClipRect.Left) and (Y2 > FClipRect.Top) then
  begin
    if X1 < FClipRect.Left then X1 := FClipRect.Left;
    if Y1 < FClipRect.Top then Y1 := FClipRect.Top;
    if X2 > FClipRect.Right then X2 := FClipRect.Right;
    if Y2 > FClipRect.Bottom then Y2 := FClipRect.Bottom;
    FillRectT(X1, Y1, X2, Y2, Value);
  end;
end;

procedure TCustomBitmap32.FillRectTS(const ARect: TRect; Value: TColor32);
begin
  with ARect do FillRectTS(Left, Top, Right, Bottom, Value);
end;

procedure TCustomBitmap32.FrameRectS(X1, Y1, X2, Y2: Integer; Value: TColor32);
var
  i: Integer;
begin
  if (X2 <= X1) or (Y2 <= Y1) then Exit;
  Dec(X2); Dec(Y2);
  for i := X1 to X2 do begin SetPixelS(i, Y1, Value); SetPixelS(i, Y2, Value); end;
  for i := Y1 to Y2 do begin SetPixelS(X1, i, Value); SetPixelS(X2, i, Value); end;
end;

procedure TCustomBitmap32.FrameRectS(const ARect: TRect; Value: TColor32);
begin
  with ARect do FrameRectS(Left, Top, Right, Bottom, Value);
end;

procedure TCustomBitmap32.FlipVert(Dst: TCustomBitmap32);
var
  J, J2: Integer;
  Buffer: PColor32Array;
  P1, P2: PColor32;
begin
  if (Dst = nil) or (Dst = Self) then
  begin
    { in-place }
    J2 := Height - 1;
    GetMem(Buffer, Width shl 2);
    for J := 0 to Height div 2 - 1 do
    begin
      P1 := PixelPtr[0, J];
      P2 := PixelPtr[0, J2];
      MoveLongword(P1^, Buffer^, Width);
      MoveLongword(P2^, P1^, Width);
      MoveLongword(Buffer^, P2^, Width);
      Dec(J2);
    end;
    FreeMem(Buffer);
  end
  else
  begin
    Dst.SetSize(Width, Height);
    J2 := Height - 1;
    for J := 0 to Height - 1 do
    begin
      MoveLongword(PixelPtr[0, J]^, Dst.PixelPtr[0, J2]^, Width);
      Dec(J2);
    end;
  end;
end;

procedure TCustomBitmap32.Draw(DstX, DstY: Integer; Src: TCustomBitmap32);
begin
  if Assigned(Src) then Src.DrawTo(Self, DstX, DstY);
end;

procedure TCustomBitmap32.Draw(DstX, DstY: Integer; const SrcRect: TRect; Src: TCustomBitmap32);
begin
  if Assigned(Src) then Src.DrawTo(Self, DstX, DstY, SrcRect);
end;

procedure TCustomBitmap32.Draw(const DstRect, SrcRect: TRect; Src: TCustomBitmap32);
begin
  if Assigned(Src) then Src.DrawTo(Self, DstRect, SrcRect);
end;

procedure TCustomBitmap32.DrawTo(Dst: TCustomBitmap32);
begin
  BlockTransfer(Dst, 0, 0, Dst.ClipRect, Self, BoundsRect, DrawMode, FOnPixelCombine);
end;

procedure TCustomBitmap32.DrawTo(Dst: TCustomBitmap32; DstX, DstY: Integer);
begin
  BlockTransfer(Dst, DstX, DstY, Dst.ClipRect, Self, BoundsRect, DrawMode, FOnPixelCombine);
end;

procedure TCustomBitmap32.DrawTo(Dst: TCustomBitmap32; DstX, DstY: Integer; const SrcRect: TRect);
begin
  BlockTransfer(Dst, DstX, DstY, Dst.ClipRect, Self, SrcRect, DrawMode, FOnPixelCombine);
end;

procedure TCustomBitmap32.DrawTo(Dst: TCustomBitmap32; const DstRect: TRect);
begin
  StretchTransfer(Dst, DstRect, Dst.ClipRect, Self, BoundsRect, DrawMode, FOnPixelCombine);
end;

procedure TCustomBitmap32.DrawTo(Dst: TCustomBitmap32; const DstRect, SrcRect: TRect);
begin
  StretchTransfer(Dst, DstRect, Dst.ClipRect, Self, SrcRect, DrawMode, FOnPixelCombine);
end;

function TCustomBitmap32.TextExtent(const Text: string): TSize;
begin
  // display only: deterministic fake metrics
  Result.cx := Length(Text) * 7;
  Result.cy := 14;
end;

function TCustomBitmap32.TextWidth(const Text: string): Integer;
begin
  Result := TextExtent(Text).cx;
end;

function TCustomBitmap32.TextHeight(const Text: string): Integer;
begin
  Result := TextExtent(Text).cy;
end;

procedure TCustomBitmap32.Textout(X, Y: Integer; const Text: string);
begin
  // display only
end;

procedure TCustomBitmap32.ResetAlpha;
begin
end;

{ from GR32_Resamplers.pas: BlendBlock (internal routine) }
procedure BlendBlock(
  Dst: TCustomBitmap32; DstRect: TRect;
  Src: TCustomBitmap32; SrcX, SrcY: Integer;
  CombineOp: TDrawMode; CombineCallBack: TPixelCombineEvent);
var
  SrcP, DstP: PColor32;
  SP, DP: PColor32;
  MC: TColor32;
  W, I, DstY: Integer;
begin
  W := DstRect.Right - DstRect.Left;
  SrcP := Src.PixelPtr[SrcX, SrcY];
  DstP := Dst.PixelPtr[DstRect.Left, DstRect.Top];

  case CombineOp of
    dmOpaque:
      begin
        for DstY := DstRect.Top to DstRect.Bottom - 1 do
        begin
          MoveLongWord(SrcP^, DstP^, W);
          Inc(SrcP, Src.Width);
          Inc(DstP, Dst.Width);
        end;
      end;
    dmBlend:
      begin
        for DstY := DstRect.Top to DstRect.Bottom - 1 do
        begin
          SP := SrcP;
          DP := DstP;
          for I := 0 to W - 1 do
          begin
            if Src.MasterAlpha >= 255 then
              DP^ := BlendReg(SP^, DP^)
            else
              DP^ := BlendReg(SetAlpha(SP^, (SP^ shr 24) * Src.MasterAlpha div 255), DP^);
            Inc(SP); Inc(DP);
          end;
          Inc(SrcP, Src.Width);
          Inc(DstP, Dst.Width);
        end;
      end;
    dmTransparent:
      begin
        MC := Src.OuterColor;
        for DstY := DstRect.Top to DstRect.Bottom - 1 do
        begin
          SP := SrcP;
          DP := DstP;
          for I := 0 to W - 1 do
          begin
            if MC <> SP^ then DP^ := SP^;
            Inc(SP); Inc(DP);
          end;
          Inc(SrcP, Src.Width);
          Inc(DstP, Dst.Width);
        end;
      end;
    else //  dmCustom:
      begin
        for DstY := DstRect.Top to DstRect.Bottom - 1 do
        begin
          SP := SrcP;
          DP := DstP;
          for I := 0 to W - 1 do
          begin
            CombineCallBack(SP^, DP^, Src.MasterAlpha);
            Inc(SP); Inc(DP);
          end;
          Inc(SrcP, Src.Width);
          Inc(DstP, Dst.Width);
        end;
      end;
    end;
end;

{ from GR32_Resamplers.pas }
procedure BlockTransfer(
  Dst: TCustomBitmap32; DstX: Integer; DstY: Integer; DstClip: TRect;
  Src: TCustomBitmap32; SrcRect: TRect;
  CombineOp: TDrawMode; CombineCallBack: TPixelCombineEvent);
var
  SrcX, SrcY: Integer;
begin
  if Dst.Empty or Src.Empty or ((CombineOp = dmBlend) and (Src.MasterAlpha = 0)) then Exit;

  SrcX := SrcRect.Left;
  SrcY := SrcRect.Top;

  GR32.IntersectRect(DstClip, DstClip, Dst.BoundsRect);
  GR32.IntersectRect(SrcRect, SrcRect, Src.BoundsRect);

  GR32.OffsetRect(SrcRect, DstX - SrcX, DstY - SrcY);
  GR32.IntersectRect(SrcRect, DstClip, SrcRect);
  if GR32.IsRectEmpty(SrcRect) then
    exit;

  DstClip := SrcRect;
  GR32.OffsetRect(SrcRect, SrcX - DstX, SrcY - DstY);

  if (CombineOp = dmCustom) and not Assigned(CombineCallBack) then
    CombineOp := dmOpaque;

  BlendBlock(Dst, DstClip, Src, SrcRect.Left, SrcRect.Top, CombineOp, CombineCallBack);
end;

{ display only: nearest neighbour }
procedure ResampleNearest(Dst: TCustomBitmap32; DstRect, DstClip: TRect; Src: TCustomBitmap32; SrcRect: TRect;
  CombineOp: TDrawMode; CombineCallBack: TPixelCombineEvent);
var
  X, Y, SX, SY, SrcW, SrcH, DstW, DstH: Integer;
  F: TColor32;
  D: PColor32;
begin
  SrcW := SrcRect.Right - SrcRect.Left;
  SrcH := SrcRect.Bottom - SrcRect.Top;
  DstW := DstRect.Right - DstRect.Left;
  DstH := DstRect.Bottom - DstRect.Top;
  for Y := DstClip.Top to DstClip.Bottom - 1 do
  begin
    SY := SrcRect.Top + ((Y - DstRect.Top) * SrcH) div DstH;
    for X := DstClip.Left to DstClip.Right - 1 do
    begin
      SX := SrcRect.Left + ((X - DstRect.Left) * SrcW) div DstW;
      F := Src.Bits^[SX + SY * Src.Width];
      D := Dst.PixelPtr[X, Y];
      case CombineOp of
        dmOpaque: D^ := F;
        dmBlend: D^ := BlendReg(F, D^);
        dmTransparent: if F <> Src.OuterColor then D^ := F;
      else
        CombineCallBack(F, D^, Src.MasterAlpha);
      end;
    end;
  end;
end;

{ from GR32_Resamplers.pas }
procedure StretchTransfer(
  Dst: TCustomBitmap32; DstRect: TRect; DstClip: TRect;
  Src: TCustomBitmap32; SrcRect: TRect;
  CombineOp: TDrawMode; CombineCallBack: TPixelCombineEvent);
var
  SrcW, SrcH: Integer;
  DstW, DstH: Integer;
  R: TRect;
  RatioX, RatioY: Single;
begin
  // transform dest rect when the src rect is out of the src bitmap's bounds
  if (SrcRect.Left < 0) or (SrcRect.Right > Src.Width) or
    (SrcRect.Top < 0) or (SrcRect.Bottom > Src.Height) then
  begin
    RatioX := (DstRect.Right - DstRect.Left) / (SrcRect.Right - SrcRect.Left);
    RatioY := (DstRect.Bottom - DstRect.Top) / (SrcRect.Bottom - SrcRect.Top);

    if SrcRect.Left < 0 then
    begin
      DstRect.Left := DstRect.Left + Ceil(-SrcRect.Left * RatioX);
      SrcRect.Left := 0;
    end;

    if SrcRect.Top < 0 then
    begin
      DstRect.Top := DstRect.Top + Ceil(-SrcRect.Top * RatioY);
      SrcRect.Top := 0;
    end;

    if SrcRect.Right > Src.Width then
    begin
      DstRect.Right := DstRect.Right - Floor((SrcRect.Right - Src.Width) * RatioX);
      SrcRect.Right := Src.Width;
    end;

    if SrcRect.Bottom > Src.Height then
    begin
      DstRect.Bottom := DstRect.Bottom - Floor((SrcRect.Bottom - Src.Height) * RatioY);
      SrcRect.Bottom := Src.Height;
    end;
  end;

  if Src.Empty or Dst.Empty or
    ((CombineOp = dmBlend) and (Src.MasterAlpha = 0)) or
    GR32.IsRectEmpty(SrcRect) then
      Exit;

  GR32.IntersectRect(DstClip, DstClip, Dst.BoundsRect);
  GR32.IntersectRect(DstClip, DstClip, DstRect);
  if GR32.IsRectEmpty(DstClip) then Exit;
  GR32.IntersectRect(R, DstClip, DstRect);
  if GR32.IsRectEmpty(R) then Exit;

  if (CombineOp = dmCustom) and not Assigned(CombineCallBack) then
    CombineOp := dmOpaque;

  SrcW := SrcRect.Right - SrcRect.Left;
  SrcH := SrcRect.Bottom - SrcRect.Top;
  DstW := DstRect.Right - DstRect.Left;
  DstH := DstRect.Bottom - DstRect.Top;

  if (SrcW = DstW) and (SrcH = DstH) then
    BlendBlock(Dst, DstClip, Src, SrcRect.Left + DstClip.Left - DstRect.Left,
      SrcRect.Top + DstClip.Top - DstRect.Top, CombineOp, CombineCallBack)
  else
    ResampleNearest(Dst, DstRect, DstClip, Src, SrcRect, CombineOp, CombineCallBack);
end;

{ TByteMap }

destructor TByteMap.Destroy;
begin
  if FBits <> nil then FreeMem(FBits);
  inherited;
end;

function TByteMap.SetSize(NewWidth, NewHeight: Integer): Boolean;
begin
  Result := (NewWidth <> FWidth) or (NewHeight <> FHeight);
  if Result then
  begin
    if FBits <> nil then FreeMem(FBits);
    FBits := AllocMem(NewWidth * NewHeight);
    FWidth := NewWidth;
    FHeight := NewHeight;
  end;
end;

procedure TByteMap.Clear(FillValue: Byte);
begin
  if FBits <> nil then FillChar(FBits^, FWidth * FHeight, FillValue);
end;

function TByteMap.GetValPtr(X, Y: Integer): PByte;
begin
  Result := @FBits^[X + Y * FWidth];
end;

function TByteMap.GetValue(X, Y: Integer): Byte;
begin
  Result := FBits^[X + Y * FWidth];
end;

procedure TByteMap.SetValue(X, Y: Integer; Value: Byte);
begin
  FBits^[X + Y * FWidth] := Value;
end;

{ TCustomLayer }

constructor TCustomLayer.Create(aLayerCollection: TLayerCollection);
begin
  inherited Create;
  FVisible := True;
end;

procedure TCustomLayer.Update;
begin
end;

procedure TCustomLayer.Changed;
begin
end;

{ TImage32 }

constructor TImage32.Create;
begin
  FLayers := TLayerCollection.Create;
  FBitmap := TBitmap32.Create;
end;

destructor TImage32.Destroy;
begin
  FLayers.Free;
  FBitmap.Free;
  inherited;
end;

function TImage32.BitmapToControl(const P: TPoint): TPoint;
begin
  Result := P;
end;

end.
