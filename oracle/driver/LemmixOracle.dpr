program LemmixOracle;

{-------------------------------------------------------------------------------------------------
  The Lemmix oracle: runs the ORIGINAL Lemmix game simulation (compiled with Free Pascal) on a level
  with a scripted sequence of game calls, and dumps the complete game state after every step.

  usage: lemmix-oracle --data DIR --style NAME --section N --level N --script FILE
                       [--full] [--options Opt1,Opt2,..] [--mech NukeGlitch,PauseGlitch,RightClickGlitch]
                       [--dir DIR]   ($DIR in save/load file names)

  Script commands (one per line, '#' comments):
    start R H         Start(R=replay, H=start with hyperspeed)
    update [N]        Update (N times, a dump after each)
    run [N]           Update until the game is finished (at most N times)
    cursor X Y        CursorPoint := (X, Y)
    rmb B             RightMouseButtonHeldDown := B
    click B           ProcessSkillAssignment(checkRegainControl = B)
    hittest           HitTest
    slower B          BtnSlower(minimize = B)
    faster B          BtnFaster(maximize = B)
    stoprr            BtnStopChangingReleaseRate
    select SKILL      BtnClimber .. BtnDigger (climber umbrella explode blocker builder basher miner digger)
    pause M           BtnPause(mode M)
    unpause           BtnPauseStop
    togglepause M     BtnTogglePause(mode M)
    nuke              BtnNuke
    regain            RegainControl
    goto N            GotoIteration(N)
    finish | cheat | setresult
    ff B              FastForward := B
    devcreate | dev99 DeveloperCreateLemmingAtCursorPoint | Developer99Skills
    pixels X Y W H    prints the pixels of the rendered frame (debugging)
    poke FILE OFS V   changes a byte of a file / cut FILE SIZE truncates a file (damaged replay files)
    save FILE         Recorder.SaveToFile
    load FILE         Recorder.LoadFromFile
-------------------------------------------------------------------------------------------------}

{$include lem_directives.inc}

uses
  SysUtils, Classes, Types, Math,
  GR32, LxVcl,
  Base.Utils, Base.Types, Base.Strings,
  Dos.Consts, Level.Base, Styles.Base, Styles.Dos,
  Prog.Base, Prog.Data, Game.Rendering, Game.SkillPanel, Game.Sound, Game;

type
  TOracleHandler = class
    Game: TLemmingGame;
    procedure GameFinished(Sender: TObject);
  end;

procedure TOracleHandler.GameFinished(Sender: TObject);
begin
  // like TGameScreenPlayer.Game_Finished -> CloseScreen -> BeforeCloseScreen: the result is taken immediately
  Game.SetGameResult;
end;

var
  DataPath, StyleName, ScriptFile, ScriptDir: string;
  SectionIx, LevelIx: Integer;
  Full: Boolean;
  GameOpts: TGameOptions;
  OptMech: TOptionalMechanics;

function ParseGameOption(const s: string): TGameOption;
const
  Names: array[TGameOption] of string = (
    'AlwaysRegainControlOnMouseClick', 'CheatKeyToSolveLevel', 'ColorizeLemmings', 'FullCPU', 'GradientBridges',
    'HighResolutionGameMessages', 'HighlightedPauseButton', 'ShowFeedbackMessages', 'ShowParticles',
    'ShowPhotoFlashReplayEffect', 'ShowReplayCursor', 'ShowReplayMessages', 'ShowReplayTextInToolBar',
    'SkillAssignmentsEnabledWhenPaused', 'SkillButtonsEnabledWhenPaused');
var
  o: TGameOption;
begin
  for o := Low(TGameOption) to High(TGameOption) do
    if SameText(Names[o], s) then
      Exit(o);
  raise Exception.Create('unknown game option ' + s);
end;

procedure ParseArgs;
var
  i: Integer;
  a, v: string;
  parts: TStringList;
  j: Integer;
begin
  GameOpts := TGameOptions.DEFAULT;
  OptMech := [];
  Full := False;
  i := 1;
  while i <= ParamCount do begin
    a := ParamStr(i);
    if a = '--full' then begin
      Full := True;
      Inc(i);
      Continue;
    end;
    v := ParamStr(i + 1);
    if a = '--data' then DataPath := v
    else if a = '--style' then StyleName := v
    else if a = '--section' then SectionIx := StrToInt(v)
    else if a = '--level' then LevelIx := StrToInt(v)
    else if a = '--script' then ScriptFile := v
    else if a = '--dir' then ScriptDir := v
    else if a = '--options' then begin
      GameOpts := [];
      parts := TStringList.Create;
      try
        parts.Delimiter := ',';
        parts.StrictDelimiter := True;
        parts.DelimitedText := v;
        for j := 0 to parts.Count - 1 do
          if parts[j] <> '' then
            Include(GameOpts, ParseGameOption(parts[j]));
      finally
        parts.Free;
      end;
    end
    else if a = '--mech' then begin
      if Pos('NukeGlitch', v) > 0 then Include(OptMech, TOptionalMechanic.NukeGlitch);
      if Pos('PauseGlitch', v) > 0 then Include(OptMech, TOptionalMechanic.PauseGlitch);
      if Pos('RightClickGlitch', v) > 0 then Include(OptMech, TOptionalMechanic.RighClickGlitch);
    end
    else
      raise Exception.Create('unknown argument ' + a);
    Inc(i, 2);
  end;
end;

function CreateStyle: TStyle;
begin
  Consts.SetStyleName(StyleName);
  case Consts.StyleDef of
    TStyleDef.Orig: Result := TDosOrigStyle.Create(Consts.StyleName);
    TStyleDef.Ohno: Result := TDosOhNoStyle.Create(Consts.StyleName);
    TStyleDef.H94 : Result := TDosH94Style.Create(Consts.StyleName);
    TStyleDef.X91 : Result := TDosX91Style.Create(Consts.StyleName);
    TStyleDef.X92 : Result := TDosX92Style.Create(Consts.StyleName);
  else
    raise Exception.Create('unsupported style');
  end;
end;

function SkillFromName(const s: string; game: TLemmingGame): Boolean;
begin
  Result := True;
  if s = 'climber' then game.BtnClimber
  else if s = 'umbrella' then game.BtnUmbrella
  else if s = 'explode' then game.BtnExplode
  else if s = 'blocker' then game.BtnBlocker
  else if s = 'builder' then game.BtnBuilder
  else if s = 'basher' then game.BtnBasher
  else if s = 'miner' then game.BtnMiner
  else if s = 'digger' then game.BtnDigger
  else Result := False;
end;

var
  style: TStyle;
  info: TLevelLoadingInformation;
  level: TLevel;
  graph: TGraphicSet;
  renderer: TRenderer;
  img: TImage32;
  toolbar: TSkillPanelToolbar;
  soundMgr: TSoundMgr;
  game: TLemmingGame;
  handler: TOracleHandler;
  gameInfo: TGameInfoRec;
  errors: Integer;
  script, tok, outLines: TStringList;
  line, cmd, err: string;
  stepNo, n, k, li: Integer;
  stdout: TextFile;

  procedure Emit;
  var
    q: Integer;
  begin
    for q := 0 to outLines.Count - 1 do
      Writeln(outLines[q]);
    outLines.Clear;
  end;

  procedure Dump(const what: string);
  begin
    outLines.Add('S ' + IntToStr(stepNo) + ' ' + what);
    game.OracleDump(Full, outLines);
    Emit;
    Inc(stepNo);
  end;

  function Arg(i: Integer): string;
  begin
    if i < tok.Count then Result := tok[i] else Result := '';
  end;

  function ArgPath(i: Integer): string;
  begin
    Result := StringReplace(Arg(i), '$DIR', ScriptDir, [rfReplaceAll]);
  end;

  function ArgI(i: Integer): Integer;
  begin
    Result := StrToInt(Arg(i));
  end;

  // pixels X Y W H: the rendered frame (target bitmap), for debugging
  procedure PrintPixels(x0, y0, w, h: Integer);
  var
    x, y: Integer;
    s: string;
  begin
    for y := y0 to y0 + h - 1 do begin
      s := 'P ' + IntToStr(y);
      for x := x0 to x0 + w - 1 do
        s := s + ' ' + IntToHex(img.Bitmap.PixelS[x, y], 8);
      outLines.Add(s);
    end;
  end;

  // poke FILE OFS VALUE: changes one byte of a file (to test the loading of damaged replay files)
  procedure PokeFile(const fn: string; ofs, value: Integer);
  var
    f: TFileStream;
    b: Byte;
  begin
    f := TFileStream.Create(fn, fmOpenReadWrite);
    try
      if (ofs >= 0) and (ofs < f.Size) then begin
        b := Byte(value);
        f.Position := ofs;
        f.WriteBuffer(b, 1);
      end;
    finally
      f.Free;
    end;
  end;

  // cut FILE SIZE: truncates a file
  procedure CutFile(const fn: string; size: Integer);
  var
    f: TFileStream;
  begin
    f := TFileStream.Create(fn, fmOpenReadWrite);
    try
      if (size >= 0) and (size < f.Size) then
        f.Size := size;
    finally
      f.Free;
    end;
  end;

  // with ORACLE_TRACE set, exceptions (normally just "EXC" in the output) are described on stderr
  procedure TraceException(E: Exception);
  begin
    if GetEnvironmentVariable('ORACLE_TRACE') = '' then
      Exit;
    Writeln(StdErr, 'EXC at step ', stepNo, ': ', E.ClassName, ': ', E.Message);
    DumpExceptionBackTrace(StdErr);
  end;

begin
  try
    ParseArgs;
    Consts.Init(DataPath);
    SoundData.Init;

    style := CreateStyle;
    info := style.LevelSystem.FindLevelByIndex(SectionIx, LevelIx);
    if info = nil then
      raise Exception.Create('level not found');
    level := TLevel.Create;
    info.LoadLevel(level);
    graph := TGraphicSet.Create(style);
    graph.Load(level.Info.GraphicSet, level.Info.GraphicSetEx);
    renderer := TRenderer.Create;
    renderer.Prepare(TRenderInfoRec.Create(level, graph, False), errors);

    img := TImage32.Create;
    toolbar := TSkillPanelToolbar.Create;
    soundMgr := TSoundMgr.Create;
    game := TLemmingGame.Create;
    handler := TOracleHandler.Create;
    handler.Game := game;
    game.OnFinish := handler.GameFinished;
    game.Toolbar := toolbar;

    gameInfo.Style := style;
    gameInfo.Renderer := renderer;
    gameInfo.SoundMgr := soundMgr;
    gameInfo.ReplayCache := nil;
    gameInfo.Img := img;
    gameInfo.TargetBitmap := img.Bitmap;
    gameInfo.DisplayScale := 1;
    gameInfo.Level := level;
    gameInfo.LevelLoadingInfo := info;
    gameInfo.GraphicSet := graph;
    gameInfo.SoundOptions := TSoundOptions.DEFAULT;
    gameInfo.GameOptions := GameOpts;
    gameInfo.MiscOptions := TMiscOptions.DEFAULT;
    gameInfo.OptionalMechanics := OptMech;
    gameInfo.DebugLayerEnabled := False;
    game.Prepare(gameInfo);

    script := TStringList.Create;
    tok := TStringList.Create;
    outLines := TStringList.Create;
    tok.Delimiter := ' ';
    tok.StrictDelimiter := True;
    script.LoadFromFile(ScriptFile);
    stepNo := 0;
    Writeln('LEVEL ' + Trim(level.Info.Title) + ' ' + IntToHex(info.GetLevelHash, 16) + ' ' + info.GetLevelCode);

    for li := 0 to script.Count - 1 do begin
      line := Trim(script[li]);
      if (line = '') or (line[1] = '#') then
        Continue;
      tok.DelimitedText := line;
      cmd := tok[0];
      if (cmd = 'update') or (cmd = 'run') then begin
        if tok.Count > 1 then n := ArgI(1) else n := 1;
        for k := 1 to n do begin
          // run: until the game is finished
          if (cmd = 'run') and game.IsFinished then
            Break;
          err := '';
          try
            game.Update;
          except
            on E: Exception do begin
              err := 'EXC';
              TraceException(E);
            end;
          end;
          if err <> '' then outLines.Add(err);
          Dump('update');
        end;
        Continue;
      end;

      err := '';
      try
        if cmd = 'start' then game.Start(ArgI(1) <> 0, ArgI(2) <> 0)
        else if cmd = 'cursor' then game.CursorPoint := Point(ArgI(1), ArgI(2))
        else if cmd = 'rmb' then game.RightMouseButtonHeldDown := ArgI(1) <> 0
        else if cmd = 'click' then game.ProcessSkillAssignment(ArgI(1) <> 0)
        else if cmd = 'hittest' then game.HitTest
        else if cmd = 'slower' then game.BtnSlower(ArgI(1) <> 0)
        else if cmd = 'faster' then game.BtnFaster(ArgI(1) <> 0)
        else if cmd = 'stoprr' then game.BtnStopChangingReleaseRate
        else if cmd = 'select' then begin
          if not SkillFromName(Arg(1), game) then raise Exception.Create('bad skill');
        end
        else if cmd = 'pause' then game.BtnPause(TPauseCommandMode(ArgI(1)))
        else if cmd = 'unpause' then game.BtnPauseStop
        else if cmd = 'togglepause' then game.BtnTogglePause(TPauseCommandMode(ArgI(1)))
        else if cmd = 'nuke' then game.BtnNuke
        else if cmd = 'regain' then game.RegainControl
        else if cmd = 'goto' then game.GotoIteration(ArgI(1))
        else if cmd = 'finish' then game.Finish
        else if cmd = 'cheat' then game.Cheat
        else if cmd = 'setresult' then game.SetGameResult
        else if cmd = 'ff' then game.FastForward := ArgI(1) <> 0
        else if cmd = 'devcreate' then game.DeveloperCreateLemmingAtCursorPoint
        else if cmd = 'dev99' then game.Developer99Skills
        else if cmd = 'save' then game.Recorder.SaveToFile(ArgPath(1), False)
        else if cmd = 'pixels' then PrintPixels(ArgI(1), ArgI(2), ArgI(3), ArgI(4))
        else if cmd = 'poke' then PokeFile(ArgPath(1), ArgI(2), ArgI(3))
        else if cmd = 'cut' then CutFile(ArgPath(1), ArgI(2))
        else if cmd = 'load' then begin
          if not game.Recorder.LoadFromFile(ArgPath(1), err) then
            outLines.Add('LOADERR ' + err);
          err := '';
        end
        else
          raise Exception.Create('unknown command ' + cmd);
      except
        on E: Exception do begin
          err := 'EXC';
          TraceException(E);
        end;
      end;
      if err <> '' then outLines.Add(err);
      Dump(line);
    end;
  except
    on E: Exception do begin
      Writeln('FATAL ' + E.ClassName + ': ' + E.Message);
      Halt(1);
    end;
  end;
end.
