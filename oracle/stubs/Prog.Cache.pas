unit Prog.Cache;

{ Oracle stand-in: the replay cache only serves the replay finder screen. }

{$include lem_directives.inc}

interface

type
  TReplayCache = class
  public
    procedure AddOrReplace(const aFilename: string; const aHeader);
  end;

implementation

procedure TReplayCache.AddOrReplace(const aFilename: string; const aHeader);
begin
end;

end.
