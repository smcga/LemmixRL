unit LxHash;

{ Oracle stand-in for System.Hash (THashMD5), implemented with the FPC md5 unit. }

{$include lem_directives.inc}

interface

uses
  SysUtils, md5;

type
  THashMD5 = record
  private
    FContext: TMDContext;
  public
    class function Create: THashMD5; static;
    procedure Update(const AData; ALength: Cardinal);
    function HashAsBytes: TBytes;
  end;

implementation

class function THashMD5.Create: THashMD5;
begin
  MDInit(Result.FContext, MD_VERSION_5);
end;

procedure THashMD5.Update(const AData; ALength: Cardinal);
begin
  MDUpdate(FContext, PByte(@AData)^, ALength);
end;

function THashMD5.HashAsBytes: TBytes;
var
  D: TMDDigest;
begin
  MDFinal(FContext, D);
  SetLength(Result, 16);
  Move(D, Result[0], 16);
end;

end.
