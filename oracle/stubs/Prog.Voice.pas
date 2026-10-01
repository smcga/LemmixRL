unit Prog.Voice;

{ Oracle stand-in: speech output (SAPI) is UI only. }

{$include lem_directives.inc}

interface

uses
  Base.Types;

procedure Speak(aOption: TVoiceOption; aForce: Boolean);

implementation

procedure Speak(aOption: TVoiceOption; aForce: Boolean);
begin
end;

end.
