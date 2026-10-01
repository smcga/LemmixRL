{ Oracle build (Free Pascal 3.2.2): replaces src/lem_directives.inc.
  The original only contains Delphi optimisation/debug switches; these are the language settings
  that must match Delphi semantics. The compiler is invoked with -Mdelphi (FPC 3.2.2 has string helpers for AnsiString only; all simulation strings are ASCII). }
{$modeswitch typehelpers}
{$modeswitch advancedrecords}
{$scopedenums on}
{$pointermath on}
{$rangechecks off}
{$overflowchecks off}
{$packset 1}
