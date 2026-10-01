{-------------------------------------------------------------------------------------------------
  ORACLE instrumentation, included at the end of the implementation of Game.pas.

  Writes the complete simulation state of TLemmingGame in a canonical text format. The TypeScript
  engine has an identical dump (tools/difftest/dump.ts); both are compared line by line.
  In compact mode the per-lemming/object lines are replaced by their hash.
-------------------------------------------------------------------------------------------------}

function OracleFnvStr(h: Cardinal; const s: string): Cardinal;
var
  i: Integer;
begin
  Result := h;
  for i := 1 to Length(s) do
    Result := Cardinal((Result xor Ord(s[i])) * 16777619);
end;

function OracleFnvWords(P: PColor32; Count: Integer): Cardinal;
var
  i: Integer;
begin
  Result := 2166136261;
  for i := 0 to Count - 1 do begin
    Result := Cardinal((Result xor P^) * 16777619);
    Inc(P);
  end;
end;

function OracleFnvBytes(P: PByte; Count: Integer): Cardinal;
var
  i: Integer;
begin
  Result := 2166136261;
  for i := 0 to Count - 1 do begin
    Result := Cardinal((Result xor P^) * 16777619);
    Inc(P);
  end;
end;

function OB(b: Boolean): string;
begin
  if b then Result := '1' else Result := '0';
end;

function OI(i: Int64): string;
begin
  Result := IntToStr(i);
end;

procedure TLemmingGame.OracleDump(full: Boolean; aOut: TStrings);
var
  s: string;
  L: TLemming;
  Inf: TInteractiveObjectInfo;
  item: TReplayItem;
  i, lastNP, lmaIx: Integer;
  h: Cardinal;
begin
  if fLastNonPrioritizedLemming = nil then lastNP := -1 else lastNP := fLastNonPrioritizedLemming.ListIndex;

  s := 'G ' +
    OI(fCurrentIteration) + ' ' + OI(fClockFrame) + ' ' + OI(Minutes) + ' ' + OI(Seconds) + ' ' +
    OI(LemmingsReleased) + ' ' + OI(LemmingsOut) + ' ' + OI(LemmingsSaved) + ' ' + OI(LemmingsRemoved) + ' ' +
    OI(MaxNumLemmings) + ' ' + OI(CurrReleaseRate) + ' ' + OI(Ord(fReleaseRateStatus)) + ' ' +
    OI(CurrClimberCount) + ' ' + OI(CurrFloaterCount) + ' ' + OI(CurrBomberCount) + ' ' + OI(CurrBlockerCount) + ' ' +
    OI(CurrBuilderCount) + ' ' + OI(CurrBasherCount) + ' ' + OI(CurrMinerCount) + ' ' + OI(CurrDiggerCount) + ' ' +
    OI(Ord(fSelectedSkill)) + ' ' + OB(fIsPaused) + ' ' + OB(fIsPausedExt) + ' ' + OB(fIsNukedByUser) + ' ' +
    OI(fIndexOfLemmingToBeNuked) + ' ' + OB(fIsExploderAssignInProgress) + ' ' + OB(fIsFinished) + ' ' +
    OB(fReplaying) + ' ' + OI(fReplayIndex) + ' ' + OB(fIsLastRecordedRecordReached) + ' ' + OB(fHyperSpeed) + ' ' +
    OB(EntrancesOpened) + ' ' + OB(fEntranceAnimationCompleted) + ' ' + OI(NextLemmingCountDown) + ' ' +
    OI(fGlitchPauseIterations) + ' ' + OI(fParticleFinishTimer) + ' ' + OI(Word(fMechanics)) + ' ' +
    OB(fRightMouseButtonHeldDown) + ' ' + OI(fCurrentCursor) + ' ' + OI(lastNP) + ' ' + OB(fAssignmentIsRightClickGlitch) + ' ' +
    OI(fCursorPoint.X) + ' ' + OI(fCursorPoint.Y) + ' ' + OB(fFastForward) + ' ' + OB(fPlaying) + ' ' + OB(fIsCheated) + ' ' +
    OB(fStartupMusicAfterEntrance) + ' ' + OI(fTargetIteration) + ' ' +
    OI(fRecorder.fRecordedGlitchPauseIterations) + ' ' + OI(Word(fRecorder.fCurrentMechanics)) + ' ' +
    OB(fRecorder.WasLoaded) + ' ' + OB(fRecorder.WasSaved) + ' ' +
    OI(DosEntranceOrderTable[0]) + ' ' + OI(DosEntranceOrderTable[1]) + ' ' + OI(DosEntranceOrderTable[2]) + ' ' + OI(DosEntranceOrderTable[3]) + ' ' +
    OI(fLemmingList.Count) + ' ' + OI(fUpdateCalls) + ' ' + OI(fUpdateCallsSession) + ' ' + OI(fHandleLemmingCalls) + ' ' +
    OI(GameResultRec.LemmingCount) + ' ' + OI(GameResultRec.ToRescue) + ' ' + OI(GameResultRec.Rescued) + ' ' +
    OI(GameResultRec.Target) + ' ' + OI(GameResultRec.Done) + ' ' + OB(GameResultRec.Success) + ' ' +
    OB(GameResultRec.Cheated) + ' ' + OB(GameResultRec.TimeIsUp);
  aOut.Add(s);

  h := 2166136261;
  for L in fLemmingList do begin
    lmaIx := fStyle.LemmingAnimationSet.MetaLemmingAnimationList.IndexOf(L.LMA);
    s := 'L ' + OI(L.ListIndex) + ' ' + OI(L.XPos) + ' ' + OI(L.YPos) + ' ' + OI(L.XDelta) + ' ' + OI(L.Fallen) + ' ' +
      OI(L.ExplosionTimer) + ' ' + OI(L.Frame) + ' ' + OI(L.MaxFrame) + ' ' + OI(Ord(L.AnimationType)) + ' ' +
      OI(L.FrameTopDy) + ' ' + OI(L.FrameLeftDx) + ' ' + OI(L.FloatParametersTableIndex) + ' ' + OI(L.NumberOfBricksLeft) + ' ' +
      OI(L.Born) + ' ' + OI(Ord(L.Action)) + ' ' + OI(L.ActionBits) + ' ' + OI(L.ObjectBelow) + ' ' + OI(L.ObjectInFront) + ' ' +
      OB(L.EndOfAnimation) + ' ' + OB(L.IsRemoved) + ' ' + OB(L.IsClimber) + ' ' + OB(L.IsFloater) + ' ' + OB(L.IsBlocking) + ' ' +
      OB(L.IsNewDigger) + ' ' + OB(L.IsExploded) + ' ' + OB(L.PhotoFlashForReplay) + ' ' + OI(L.CombineFlags) + ' ' +
      OI(L.ParticleTimer) + ' ' + OI(L.ParticleFrame) + ' ' +
      OI(L.SavedMap[0]) + ',' + OI(L.SavedMap[1]) + ',' + OI(L.SavedMap[2]) + ',' + OI(L.SavedMap[3]) + ',' + OI(L.SavedMap[4]) + ',' +
      OI(L.SavedMap[5]) + ',' + OI(L.SavedMap[6]) + ',' + OI(L.SavedMap[7]) + ',' + OI(L.SavedMap[8]) + ' ' +
      OI(lmaIx) + ' ' + OI(L.RectToErase.Left) + ',' + OI(L.RectToErase.Top) + ',' + OI(L.RectToErase.Right) + ',' + OI(L.RectToErase.Bottom);
    if full then aOut.Add(s);
    h := OracleFnvStr(h, s + #10);
  end;

  s := 'O';
  for Inf in ObjectInfos do
    s := s + ' ' + OI(Inf.CurrentFrame) + ',' + OB(Inf.Triggered);
  if full then aOut.Add(s);
  h := OracleFnvStr(h, s + #10);

  s := 'E';
  for Inf in Entrances do
    s := s + ' ' + OI(Inf.CurrentFrame) + ',' + OB(Inf.Triggered);
  if full then aOut.Add(s);
  h := OracleFnvStr(h, s + #10);

  aOut.Add('X ' + OI(h));

  aOut.Add('H ' + OI(OracleFnvWords(PColor32(fWorld.Bits), fWorld.Width * fWorld.Height)) + ' ' +
    OI(OracleFnvBytes(PByte(fObjectMap.Bits), fObjectMap.Width * fObjectMap.Height)) + ' ' +
    OI(OracleFnvWords(PColor32(fTargetBitmap.Bits), fTargetBitmap.Width * fTargetBitmap.Height)));

  h := 2166136261;
  for i := 0 to fRecorder.List.Count - 1 do begin
    item := fRecorder.List[i];
    if item = nil then
      s := 'RI nil'
    else
      s := 'RI ' + OI(item.Iteration) + ' ' + OI(item.ActionFlags) + ' ' + OI(item.AssignedSkill) + ' ' + OI(item.SelectedButton) + ' ' +
        OI(item.ReleaseRate) + ' ' + OI(item.LemmingIndex) + ' ' + OI(item.LemmingX) + ' ' + OI(item.LemmingY) + ' ' +
        OI(item.CursorX) + ' ' + OI(item.CursorY) + ' ' + OI(item.Flags) + ' ' + OB(item.HasValidCursorData);
    if full then aOut.Add(s);
    h := OracleFnvStr(h, s + #10);
  end;
  aOut.Add('R ' + OI(fRecorder.List.Count) + ' ' + OI(h));
end;
