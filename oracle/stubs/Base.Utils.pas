unit Base.Utils;

{ Oracle stand-in for Base.Utils.pas. Only the parts used by the compiled game units. The bodies of
  TFastObjectList, TEnumeratorForFastList, Restrict, LeadZeroStr, Percentage, ZeroTopLeftRect,
  Throw and the TIntHelper are copied from the original; Windows/VCL specific things are stubs. }

{$include lem_directives.inc}

interface

uses
  Types, Classes, Contnrs, SysUtils, Math, GR32;

const
  Bit0  = 1;
  Bit1  = 1 shl 1;
  Bit2  = 1 shl 2;
  Bit3  = 1 shl 3;
  Bit4  = 1 shl 4;
  Bit5  = 1 shl 5;
  Bit6  = 1 shl 6;
  Bit7  = 1 shl 7;
  Bit8  = 1 shl 8;
  Bit9  = 1 shl 9;
  Bit10 = 1 shl 10;
  Bit11 = 1 shl 11;
  Bit12 = 1 shl 12;
  Bit13 = 1 shl 13;
  Bit14 = 1 shl 14;
  Bit15 = 1 shl 15;

const
  GAME_CURSOR_DEFAULT     = 1;
  GAME_CURSOR_LEMMING     = 2;
  GAME_CURSOR_DRAG        = 3;
  PROGAM_CURSOR_HOURGLASS = 4;

const
  CR = #13;
  LF = #10;
  CRLF = #13#10;
  tab = Chr(9);

type
  EInvalidOperation = class(Exception);

  // Delphi's System.Classes.TBufferedFileStream (not in FPC 3.2.2): a file stream
  TBufferedFileStream = class(TFileStream);

procedure DoThrow(const msg: string; const proc: string = '');

type
  TObjectHelper = class helper for TObject
  public
    class procedure Throw(const msg: string; const method: string = '');
  end;

  ITempCursor = interface(IInterface)
    ['{495ADE0F-EFBE-4A0E-BF37-F1ACCACCE03D}']
  end;

  TempCursor = class(TInterfacedObject, ITempCursor)
  public
    class function Activate: ITempCursor;
  end;

function ForceDir(const aFileName: string): Boolean;
function LeadZeroStr(const i, zeros: Integer): string; inline;
function StripInvalidFileChars(const S: string; removeDots: Boolean = True; removeDoubleSpaces: Boolean = True; trimAccess: Boolean = True): string;
function ZeroTopLeftRect(const r: TRect): TRect; inline;
procedure Restrict(var i: Integer; aMin, aMax: Integer); overload; inline;
procedure Restrict(var s: Single; const aMin, aMax: Single); overload; inline;
function Percentage(Max, N: integer): integer;
function GetLocalComputerName: string;
function QueryTimer: Int64;
function MSBetween(const T1, T2: Int64): Int64; inline;
function Scale(const i: Integer): Integer; overload; inline;

type
  TIntHelper = record helper for Integer
  public
    function ToString: string; inline;
    function ToThousandString: string; inline;
    function Scale: Integer; inline;
  end;

type
  // fastest possible 'for in' loop support
  // (FPC 3.2.2 cannot forward declare the generic list, so the enumerator refers to the TObjectList ancestor)
  TEnumeratorForFastList<T: class> = record
  private
    fIndex: Integer;
    fList: TObjectList;
  public
    function MoveNext: Boolean; inline;
    function GetCurrent: T; inline;
    property Current: T read GetCurrent;
  end;

  // fast typed object list
  TFastObjectList<T: class> = class(TObjectList)
  public
    function GetEnumerator: TEnumeratorForFastList<T>; inline;
    function ValidIndex(ix: Integer): Boolean; inline;
    procedure CheckIndex(aIndex: Integer);
    function GetItem(aIndex: Integer): T; inline;
    function First: T; inline;
    function Last: T; inline;
    function FirstOrDefault: T; inline;
    function LastOrDefault: T; inline;
    function HasItems: Boolean; inline;
    function IsEmpty: Boolean; inline;
    property Items[aIndex: Integer]: T read GetItem; default;
  end;

  TBitmaps = class(TFastObjectList<TBitmap32>);

  // a very basic helper (from the original)
  TStringArray = TArray<string>;
  TStringArrayHelper = type helper for TStringArray
  public
    function Length: Integer; inline;
  end;

implementation

procedure DoThrow(const msg: string; const proc: string = '');
var
  txt: string;
begin
  txt := msg;
  if proc = '' then
    txt := txt + CRLF + 'Proc: ' + proc;
  raise EInvalidOperation.Create(txt);
end;

class procedure TObjectHelper.Throw(const msg: string; const method: string = '');
begin
  raise EInvalidOperation.Create(msg + CRLF + 'Error from: ' + ClassName + CRLF + 'Method: ' + method);
end;

class function TempCursor.Activate: ITempCursor;
begin
  Result := TempCursor.Create;
end;

function ForceDir(const aFileName: string): Boolean;
begin
  Result := ForceDirectories(ExtractFilePath(aFileName));
end;

function LeadZeroStr(const i, zeros: Integer): string; inline;
begin
  Result := i.ToString.PadLeft(zeros, '0');
end;

function StripInvalidFileChars(const S: string; removeDots: Boolean = True; removeDoubleSpaces: Boolean = True; trimAccess: Boolean = True): string;
var
  C: Char;
begin
  Result := '';
  for C in S do
    if not CharInSet(C, ['<', '>', ':', '"', '/', '\', '|', '?', '*', #0..#31]) then
      Result := Result + C;
  if removeDoubleSpaces then
    while Pos('  ', Result) > 0 do
      Result := StringReplace(Result, '  ', ' ', [rfReplaceAll]);
  if removeDots then
    Result := StringReplace(Result, '.', '', [rfReplaceAll]);
  if trimAccess then
    Result := Trim(Result);
end;

function ZeroTopLeftRect(const r: TRect): TRect;
begin
  Result := r;
  Result.Offset(-Result.Left, -Result.Top);
end;

procedure Restrict(var i: Integer; aMin, aMax: Integer);
begin
  i := EnsureRange(i, aMin, aMax);
end;

procedure Restrict(var s: Single; const aMin, aMax: Single); overload;
begin
  s := EnsureRange(s, aMin, aMax);
end;

function Percentage(Max, N: integer): integer;
begin
  if Max = 0 then
    Result := 0
  else
    Result := Trunc((N/Max) * 100);
end;

function GetLocalComputerName: string;
begin
  Result := 'oracle';
end;

function QueryTimer: Int64;
begin
  Result := GetTickCount64;
end;

function MSBetween(const T1, T2: Int64): Int64;
begin
  Result := Abs(T2 - T1);
end;

function Scale(const i: Integer): Integer;
begin
  Result := i;
end;

{ TIntHelper }

function TIntHelper.ToString: string;
begin
  Result := IntToStr(Self);
end;

function TIntHelper.ToThousandString: string;
begin
  Result := IntToStr(Self);
end;

function TIntHelper.Scale: Integer;
begin
  Result := Base.Utils.Scale(Self);
end;

{ TStringArrayHelper }

function TStringArrayHelper.Length: Integer;
begin
  Result := System.Length(Self);
end;

{ TEnumeratorForFastList<T> }

function TEnumeratorForFastList<T>.GetCurrent: T;
begin
  Result := T(fList.List[fIndex]);
end;

function TEnumeratorForFastList<T>.MoveNext: Boolean;
begin
  Inc(fIndex);
  Result := fIndex < fList.Count;
end;

{ TFastObjectList<T> }

function TFastObjectList<T>.ValidIndex(ix: Integer): Boolean;
begin
  Result := (ix >= 0) and (ix < Count);
end;

procedure TFastObjectList<T>.CheckIndex(aIndex: Integer);
begin
  if (aIndex < 0) or (aIndex >= Count) then
    Throw('TFastObjectList index error (' + aIndex.ToString + ')');
end;

function TFastObjectList<T>.GetItem(aIndex: Integer): T;
begin
  Result := T(List[aIndex]);
end;

function TFastObjectList<T>.First: T;
begin
  Result := GetItem(0);
end;

function TFastObjectList<T>.Last: T;
begin
  Result := GetItem(Count - 1);
end;

function TFastObjectList<T>.FirstOrDefault: T;
begin
  if Count > 0
  then Result := GetItem(0)
  else Result := nil;
end;

function TFastObjectList<T>.LastOrDefault: T;
begin
  if Count > 0
  then Result := GetItem(Count - 1)
  else Result := nil;
end;

function TFastObjectList<T>.HasItems: Boolean;
begin
  Result := Count > 0;
end;

function TFastObjectList<T>.IsEmpty: Boolean;
begin
  Result := Count = 0;
end;

function TFastObjectList<T>.GetEnumerator: TEnumeratorForFastList<T>;
begin
  Result.fIndex := -1;
  Result.fList := Self;
end;

end.
