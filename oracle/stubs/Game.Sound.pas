unit Game.Sound;

{ Oracle stand-in for the sound manager. Sound has no influence on the simulation; the ids follow the
  default sound set (the "custom" sounds are not available, so their id is -1), like the TypeScript
  DEFAULT_SOUND_IDS. }

{$include lem_directives.inc}

interface

uses
  Base.Types, Dos.Consts;

type
  TSoundMgr = class
  public
    function AddMusicFromFileName(const aFileName: string; aType: TMusicStreamType; aVolume: Single = 0.2): Integer;
    procedure ClearMusics;
    procedure PlaySound(index: Integer);
    procedure PlayMusic(index: Integer);
    procedure StopMusic(index: Integer);
    function GetMusicVolumne(index: Integer): Single;
    procedure SetMusicVolume(index: Integer; const aVolume: Single);
    function GetMusicIsPlaying(index: Integer): Boolean;
    property MusicIsPlaying[index: Integer]: Boolean read GetMusicIsPlaying;
  end;

  SoundData = class sealed
  public
  class var
    SFX_BUILDER_WARNING  : Integer;
    SFX_ASSIGN_SKILL     : Integer;
    SFX_YIPPEE           : Integer;
    SFX_SPLAT            : Integer;
    SFX_LETSGO           : Integer;
    SFX_ENTRANCE         : Integer;
    SFX_VAPORIZING       : Integer;
    SFX_DROWNING         : Integer;
    SFX_EXPLOSION        : Integer;
    SFX_HITS_STEEL       : Integer;
    SFX_OHNO             : Integer;
    SFX_SKILLBUTTON      : Integer;
    SFX_ROPETRAP         : Integer;
    SFX_TENTON           : Integer;
    SFX_BEARTRAP         : Integer;
    SFX_ELECTROTRAP      : Integer;
    SFX_SPINNINGTRAP     : Integer;
    SFX_SQUISHINGTRAP    : Integer;
    SFX_MINER            : Integer;
    SFX_DIGGER           : Integer;
    SFX_BASHER           : Integer;
    SFX_FlOATER          : Integer;
    SFX_OPENUMBRELLA     : Integer;
    SFX_SILENTDEATH      : Integer;
    SFX_NUKE             : Integer;
  public
    class procedure Init; static;
  end;

implementation

function TSoundMgr.AddMusicFromFileName(const aFileName: string; aType: TMusicStreamType; aVolume: Single): Integer; begin Result := -1; end;
procedure TSoundMgr.ClearMusics; begin end;
procedure TSoundMgr.PlaySound(index: Integer); begin end;
procedure TSoundMgr.PlayMusic(index: Integer); begin end;
procedure TSoundMgr.StopMusic(index: Integer); begin end;
function TSoundMgr.GetMusicVolumne(index: Integer): Single; begin Result := 0; end;
procedure TSoundMgr.SetMusicVolume(index: Integer; const aVolume: Single); begin end;
function TSoundMgr.GetMusicIsPlaying(index: Integer): Boolean; begin Result := False; end;

class procedure SoundData.Init;
begin
  SFX_BUILDER_WARNING := Ord(TSoundEffect.BuilderWarning);
  SFX_ASSIGN_SKILL    := Ord(TSoundEffect.AssignSkill);
  SFX_YIPPEE          := Ord(TSoundEffect.Yippee);
  SFX_SPLAT           := Ord(TSoundEffect.Splat);
  SFX_LETSGO          := Ord(TSoundEffect.LetsGo);
  SFX_ENTRANCE        := Ord(TSoundEffect.EntranceOpening);
  SFX_VAPORIZING      := Ord(TSoundEffect.Vaporizing);
  SFX_DROWNING        := Ord(TSoundEffect.Drowning);
  SFX_EXPLOSION       := Ord(TSoundEffect.Explosion);
  SFX_HITS_STEEL      := Ord(TSoundEffect.HitsSteel);
  SFX_OHNO            := Ord(TSoundEffect.Ohno);
  SFX_SKILLBUTTON     := Ord(TSoundEffect.SkillButtonSelect);
  SFX_ROPETRAP        := Ord(TSoundEffect.RopeTrap);
  SFX_TENTON          := Ord(TSoundEffect.TenTonTrap);
  SFX_BEARTRAP        := Ord(TSoundEffect.BearTrap);
  SFX_ELECTROTRAP     := Ord(TSoundEffect.ElectroTrap);
  SFX_SPINNINGTRAP    := Ord(TSoundEffect.SpinningTrap);
  SFX_SQUISHINGTRAP   := Ord(TSoundEffect.SquishingTrap);
  SFX_MINER           := -1;
  SFX_DIGGER          := -1;
  SFX_BASHER          := -1;
  SFX_FlOATER         := -1;
  SFX_OPENUMBRELLA    := -1;
  SFX_SILENTDEATH     := -1;
  SFX_NUKE            := -1;
end;

end.
