unit Game.SkillPanel;

{ Oracle stand-in for the skill panel toolbar: all methods only paint, so they do nothing here. }

{$include lem_directives.inc}

interface

uses
  Classes, GR32, Dos.Consts;

type
  TSkillPanelToolbar = class
  private
    fUpdateCount: Integer;
  public
    procedure BeginUpdateImg;
    procedure EndUpdateImg;
    function GetUpdateCount: Integer;
    procedure DrawSkillCount(aButton: TSkillPanelButton; aNumber: Integer);
    procedure DrawButtonSelector(aButton: TSkillPanelButton; Highlight: Boolean);
    procedure SwitchButtonSelector(oldButton, newButton: TSkillPanelButton);
    procedure DrawMinimap(Map: TBitmap32);
    procedure SetInfoAlternative(const info: string);
    procedure SetInfoCursorLemming(const Lem: string; Num: Integer);
    procedure SetInfoLemmingsOut(Num: Integer);
    procedure SetInfoLemmingsSaved(Num, Max: Integer; showcount: Boolean);
    procedure SetInfoMinutes(Num: Integer);
    procedure SetInfoSeconds(Num: Integer);
    procedure SetPauseHighlight(highlight: Boolean);
    procedure RefreshInfo;
  end;

implementation

procedure TSkillPanelToolbar.BeginUpdateImg; begin Inc(fUpdateCount); end;
procedure TSkillPanelToolbar.EndUpdateImg; begin Dec(fUpdateCount); end;
function TSkillPanelToolbar.GetUpdateCount: Integer; begin Result := fUpdateCount; end;
procedure TSkillPanelToolbar.DrawSkillCount(aButton: TSkillPanelButton; aNumber: Integer); begin end;
procedure TSkillPanelToolbar.DrawButtonSelector(aButton: TSkillPanelButton; Highlight: Boolean); begin end;
procedure TSkillPanelToolbar.SwitchButtonSelector(oldButton, newButton: TSkillPanelButton); begin end;
procedure TSkillPanelToolbar.DrawMinimap(Map: TBitmap32); begin end;
procedure TSkillPanelToolbar.SetInfoAlternative(const info: string); begin end;
procedure TSkillPanelToolbar.SetInfoCursorLemming(const Lem: string; Num: Integer); begin end;
procedure TSkillPanelToolbar.SetInfoLemmingsOut(Num: Integer); begin end;
procedure TSkillPanelToolbar.SetInfoLemmingsSaved(Num, Max: Integer; showcount: Boolean); begin end;
procedure TSkillPanelToolbar.SetInfoMinutes(Num: Integer); begin end;
procedure TSkillPanelToolbar.SetInfoSeconds(Num: Integer); begin end;
procedure TSkillPanelToolbar.SetPauseHighlight(highlight: Boolean); begin end;
procedure TSkillPanelToolbar.RefreshInfo; begin end;

end.
