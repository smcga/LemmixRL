unit Base.Strings;

{ Oracle stand-in for Base.Strings.pas: the (English) texts used by the game units. }

{$include lem_directives.inc}

interface

uses
  Base.Utils, Base.Types, Dos.Consts;

type
  TGlobalTexts = class sealed
  public
    SAthlete: string;
    SClimber: string;
    SFloater: string;
    SWordYes: string;
    SWordNo: string;
    SGame_ToolBar_Replaying: string;
    SGame_ToolBar_Replayed: string;
    SGame_FeedbackMessage_GameSaved: string;
    SGame_FeedbackMessage_ScreenshotFail: string;
    SGame_FeedbackMessage_Screenshot: string;
    LemmingActionStrings: array[TLemmingAction] of string;
    LemmingReplayStrings: array[TLemmingAction] of string;
    constructor Create;
  end;

function YesNo(const b: Boolean): string;

var
  gt: TGlobalTexts;

implementation

function YesNo(const b: Boolean): string;
begin
  if b then Result := gt.SWordYes else Result := gt.SWordNo;
end;

constructor TGlobalTexts.Create;
const
  A: array[TLemmingAction] of string = ('', 'Walker', 'Jumper', 'Digger', 'Climber', 'Drowner', 'Hoister', 'Builder', 'Basher',
    'Miner', 'Faller', 'Floater', 'Splatter', 'Exiter', 'Frier', 'Blocker', 'Shrugger', 'Ohnoer', 'Bomber');
  R: array[TLemmingAction] of string = ('', 'Walk', 'Jump', 'Dig', 'Climb', 'Drown', 'Hoist', 'Build', 'Bash', 'Mine', 'Fall',
    'Float', 'Splat', 'Exit', 'Vaporize', 'Block', 'Shrug', 'Ohno', 'Explode');
var
  act: TLemmingAction;
begin
  SAthlete := 'Athlete';
  SClimber := 'Climber';
  SFloater := 'Floater';
  SWordYes := 'yes';
  SWordNo := 'no';
  SGame_ToolBar_Replaying := 'replaying';
  SGame_ToolBar_Replayed := 'replayed';
  SGame_FeedbackMessage_GameSaved := 'Game saved';
  SGame_FeedbackMessage_ScreenshotFail := 'Screenshot fail';
  SGame_FeedbackMessage_Screenshot := 'Screenshot';
  for act := Low(TLemmingAction) to High(TLemmingAction) do begin
    LemmingActionStrings[act] := A[act];
    LemmingReplayStrings[act] := R[act];
  end;
end;

initialization
  gt := TGlobalTexts.Create;
end.
