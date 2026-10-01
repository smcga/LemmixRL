/**
 * Builds the "oracle": the ORIGINAL Delphi simulation code of Lemmix compiled with Free Pascal.
 *
 *   npm run oracle:build
 *
 * 1. The original units listed in ORIGINAL_UNITS are copied from src/ and mechanically transformed
 *    (tools/oracle/pascal.ts): unit names in uses clauses are mapped and Delphi inline variables are
 *    hoisted. Then the documented PATCHES are applied. Nothing else is changed.
 * 2. The stub units in oracle/stubs replace the VCL, Graphics32 and the Lemmix UI units.
 * 3. oracle/driver/LemmixOracle.dpr is compiled to oracle/bin/lemmix-oracle.
 * 4. The style zips are extracted to oracle/build/data for the oracle's TData stand-in.
 *
 * The full diff between the original sources and what is compiled is written to
 * oracle/build/original-vs-compiled.diff for review.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { applyPatches, hoistInlineVars, rewriteUses, type Patch } from './pascal.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(ROOT, 'src');
const ORACLE = join(ROOT, 'oracle');
const BUILD = join(ORACLE, 'build');
const BUILD_SRC = join(BUILD, 'src');
const BUILD_ORIG = join(BUILD, 'original');
const BIN = join(ORACLE, 'bin');

/** The original units that are compiled (as far as they are needed for the game simulation). */
export const ORIGINAL_UNITS = [
  'Game.pas',
  'Game.Rendering.pas',
  'Styles.Base.pas',
  'Styles.Dos.pas',
  'Level.Base.pas',
  'Level.Loader.pas',
  'Level.Hash.pas',
  'Dos.Compression.pas',
  'Dos.Bitmaps.pas',
  'Dos.Structures.pas',
  'Dos.Consts.pas',
  'Meta.Structures.pas',
  'Base.Types.pas',
];

/** uses clause mapping: Delphi unit -> FPC unit or oracle stub (null = remove). */
const USES_MAP: Record<string, string | null> = {
  'System.Types': 'Types',
  'System.Classes': 'Classes',
  'System.Contnrs': 'Contnrs',
  'System.SysUtils': 'SysUtils',
  'System.Math': 'Math',
  'System.Generics.Collections': 'Generics.Collections',
  'System.Character': 'Character',
  'System.Hash': 'LxHash',
  'System.UITypes': null,
  'System.IOUtils': null,
  'System.Zip': null,
  'Winapi.Windows': null,
  'Winapi.MMSystem': null,
  'Vcl.Forms': 'LxVcl',
  'Vcl.Dialogs': 'LxVcl',
  'Vcl.Controls': 'LxVcl',
  'Vcl.Graphics': 'LxVcl',
  'Vcl.ClipBrd': 'LxVcl',
  'Vcl.Imaging.PngImage': 'LxVcl',
  GR32_OrdinalMaps: 'GR32',
  GR32_Layers: 'GR32',
  GR32_Image: 'GR32',
  GR32_Blend: 'GR32',
  GR32_LowLevel: 'GR32',
};

/** Types of untyped inline vars ("var x := expr") that cannot be inferred from "T.Create". */
const TYPE_HINTS: Record<string, Record<string, string>> = {
  'Game.pas': { 'info@1464': 'TLevelLoadingInformation' },
  'Level.Loader.pas': { 's@369': 'string' },
  'Level.Hash.pas': { 'hash@44': 'TBytes' },
};

/**
 * Documented patches, applied after the mechanical transformation. Each one is either
 *  - a Delphi -> FPC syntax/library difference without behavioural meaning, or
 *  - oracle instrumentation (additive: the state dump method), or
 *  - removal of pure UI code that cannot be compiled without the VCL.
 */
const PATCHES: Patch[] = [
  // ---------------------------------------------------------------- Game.pas
  {
    file: 'Game.pas',
    find: '    property OnFinish: TNotifyEvent read fOnFinish write fOnFinish;\n  end;',
    replace:
      '    property OnFinish: TNotifyEvent read fOnFinish write fOnFinish;\n' +
      '    procedure OracleDump(full: Boolean; aOut: TStrings); // ORACLE instrumentation (see OracleGameDump.inc)\n' +
      '  end;',
    reason: 'oracle instrumentation: declare the state dump method (additive)',
  },
  {
    file: 'Game.pas',
    find: '\nend.\n',
    replace: '\n{$include OracleGameDump.inc} // ORACLE instrumentation\n\nend.\n',
    reason: 'oracle instrumentation: implementation of the state dump method (additive)',
  },
  {
    file: 'Game.pas',
    find: '    stream.WriteData(lev^);',
    replace: '    stream.WriteBuffer(lev^, SizeOf(lev^));',
    reason: 'FPC: TStream has no generic WriteData (SaveToEngineFile, a developer feature)',
  },
  // ---------------------------------------------------------------- Dos.Bitmaps.pas
  {
    file: 'Dos.Bitmaps.pas',
    find: '  B: System.Types.PByte;',
    replace: '  B: PByte;',
    reason: 'FPC: PByte is declared in unit System, not in unit Types',
  },
  // ---------------------------------------------------------------- Game.Rendering.pas
  {
    file: 'Game.Rendering.pas',
    find: '  TDrawList = class(TObjectList)',
    replace: '  TDrawList = class(Contnrs.TObjectList)',
    reason: 'FPC: the generic TObjectList<T> of Generics.Collections hides Contnrs.TObjectList (Delphi keeps both)',
  },
  // ---------------------------------------------------------------- Styles.Base.pas
  {
    file: 'Styles.Base.pas',
    find: '    if C.IsLetter then begin',
    replace: "    if CharInSet(C, ['A'..'Z', 'a'..'z']) then begin",
    reason: 'FPC 3.2.2: no Char helper (level code lookup by section name, UI only)',
  },
  {
    file: 'Styles.Base.pas',
    find: '    else if C.IsDigit then begin',
    replace: "    else if CharInSet(C, ['0'..'9']) then begin",
    reason: 'FPC 3.2.2: no Char helper (level code lookup by section name, UI only)',
  },
  {
    file: 'Styles.Base.pas',
    find: '  ext := ExtractFileExt(s).ToUpper;',
    replace: '  ext := UpperCase(ExtractFileExt(s));',
    reason: 'FPC 3.2.2: ExtractFileExt returns a RawByteString without string helper (music file type)',
  },
  // ---------------------------------------------------------------- Level.Loader.pas
  {
    file: 'Level.Loader.pas',
    find: '  aStream.WriteData(LVL);',
    replace: '  aStream.WriteBuffer(LVL, SizeOf(LVL));',
    reason: 'FPC: TStream has no generic WriteData; WriteBuffer(x, SizeOf(x)) is what it does',
  },
  {
    file: 'Level.Loader.pas',
    find: '      Result := strings.Length = count;\n      if strings.Length <> count then',
    replace: '      Result := Length(strings) = count;\n      if Length(strings) <> count then',
    reason: 'FPC: no TStringArrayHelper for TArray<string> (Lemmini loader, not used by DOS levels)',
  },
  {
    file: 'Level.Loader.pas',
    find: '      for i := 0 to strings.Length - 1 do begin',
    replace: '      for i := 0 to Length(strings) - 1 do begin',
    reason: 'FPC: no TStringArrayHelper for TArray<string> (Lemmini loader, not used by DOS levels)',
  },
  {
    file: 'Level.Loader.pas',
    find: '      if ar.Length <> 2 then',
    replace: '      if Length(ar) <> 2 then',
    reason: 'FPC: no TStringArrayHelper for TArray<string> (Lemmini loader, not used by DOS levels)',
  },
];

function readLatin1(p: string): string {
  return readFileSync(p).toString('latin1').replace(/\r\n/g, '\n');
}

function writeLatin1(p: string, s: string): void {
  writeFileSync(p, Buffer.from(s, 'latin1'));
}

function extractData(): void {
  const dataDir = join(BUILD, 'data');
  rmSync(dataDir, { recursive: true, force: true });
  const styles: Record<string, string> = {
    Orig: 'Styles/Orig/orig.zip',
    Ohno: 'Styles/Ohno/ohno.zip',
    H94: 'Styles/H94/h94.zip',
    X91: 'Styles/X91/x91.zip',
    X92: 'Styles/X92/x92.zip',
  };
  for (const [name, rel] of Object.entries(styles)) {
    const dir = join(dataDir, name);
    mkdirSync(dir, { recursive: true });
    const files = unzipSync(readFileSync(join(SRC, 'Data', rel)));
    for (const [fn, bytes] of Object.entries(files)) {
      if (fn.endsWith('/')) continue;
      writeFileSync(join(dir, (fn.split('/').pop() ?? fn).toLowerCase()), bytes);
    }
  }
  copyFileSync(join(SRC, 'Data', 'Particles', 'Particles.dat'), join(dataDir, 'Particles.dat'));
}

export function buildOracle(verbose = true): string {
  rmSync(BUILD_SRC, { recursive: true, force: true });
  rmSync(BUILD_ORIG, { recursive: true, force: true });
  mkdirSync(BUILD_SRC, { recursive: true });
  mkdirSync(BUILD_ORIG, { recursive: true });
  mkdirSync(BIN, { recursive: true });

  const reportLines: string[] = [];
  for (const unit of ORIGINAL_UNITS) {
    const original = readLatin1(join(SRC, unit));
    writeLatin1(join(BUILD_ORIG, unit), original);
    // hoist first: line numbers in TYPE_HINTS and in error messages refer to the original source
    const hoist = hoistInlineVars(original, { file: unit, typeHints: TYPE_HINTS[unit] });
    let s = rewriteUses(hoist.src, USES_MAP, unit);
    for (const r of hoist.reports)
      reportLines.push(`${unit}: routine at line ${r.routineLine}: ` + r.hoisted.map((h) => `${h.name}: ${h.type} (line ${h.line})`).join(', '));
    s = applyPatches(unit, s, PATCHES);
    writeLatin1(join(BUILD_SRC, unit), s);
  }
  writeFileSync(join(BUILD, 'hoisted-inline-vars.txt'), reportLines.join('\n') + '\n');

  // stubs and driver
  for (const f of readdirSync(join(ORACLE, 'stubs'))) copyFileSync(join(ORACLE, 'stubs', f), join(BUILD_SRC, f));
  for (const f of readdirSync(join(ORACLE, 'driver'))) copyFileSync(join(ORACLE, 'driver', f), join(BUILD_SRC, f));

  // review diff
  const diff = spawnSync('diff', ['-ru', 'original', 'src', '-x', '*.inc', ...readdirSync(join(ORACLE, 'stubs')).flatMap((f) => ['-x', f]), ...readdirSync(join(ORACLE, 'driver')).flatMap((f) => ['-x', f])], {
    cwd: BUILD,
    encoding: 'latin1',
  });
  writeFileSync(join(BUILD, 'original-vs-compiled.diff'), diff.stdout);

  extractData();

  const out = join(BIN, 'lemmix-oracle');
  const args = ['-Mdelphi', '-O2', '-Sa-', '-vewn-h-', `-FU${join(BUILD, 'units')}`, `-Fi${BUILD_SRC}`, `-Fu${BUILD_SRC}`, `-o${out}`, join(BUILD_SRC, 'LemmixOracle.dpr')];
  mkdirSync(join(BUILD, 'units'), { recursive: true });
  try {
    const res = execFileSync('fpc', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (verbose) console.log(res.split('\n').filter((l) => /Error|Fatal|Warning/.test(l)).join('\n'));
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    console.error(err.stdout ?? '', err.stderr ?? '');
    throw new Error('FPC compilation of the oracle failed');
  }
  if (!existsSync(out)) throw new Error('oracle binary missing');
  if (verbose) console.log('oracle built: ' + out);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildOracle();
