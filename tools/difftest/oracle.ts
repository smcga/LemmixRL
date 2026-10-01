/** Runs the compiled oracle (oracle/bin/lemmix-oracle) on a script. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { GameOption, OptionalMechanic } from '../../engine/src/game/game.ts';
import type { RunOptions } from './runner.ts';

/** LEMMIX_ORACLE=path uses another build (e.g. oracle/bin/lemmix-oracle-debug) */
export const ORACLE_BIN = process.env.LEMMIX_ORACLE ?? join(REPO_ROOT, 'oracle', 'bin', 'lemmix-oracle');
export const ORACLE_DATA = join(REPO_ROOT, 'oracle', 'build', 'data');

export function oracleAvailable(): boolean {
  return existsSync(ORACLE_BIN) && existsSync(ORACLE_DATA);
}

export function runOracle(opts: RunOptions): string[] {
  const tmp = mkdtempSync(join(tmpdir(), 'lemmix-oracle-'));
  try {
    const scriptFile = join(tmp, 'script.txt');
    writeFileSync(scriptFile, opts.script.join('\n') + '\n');
    const args = ['--data', ORACLE_DATA, '--style', opts.style, '--section', String(opts.section), '--level', String(opts.level), '--script', scriptFile];
    if (opts.full) args.push('--full');
    if (opts.dir) args.push('--dir', opts.dir);
    if (opts.gameOptions) args.push('--options', opts.gameOptions.map((o) => GameOption[o]).join(','));
    if (opts.optionalMechanics?.length)
      args.push('--mech', opts.optionalMechanics.map((m) => (m === OptionalMechanic.RighClickGlitch ? 'RightClickGlitch' : OptionalMechanic[m])).join(','));
    const res = spawnSync(ORACLE_BIN, args, { encoding: 'latin1', maxBuffer: 1 << 30 });
    if (res.error) throw res.error;
    const lines = res.stdout.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    if (res.status !== 0) throw new Error('oracle failed: ' + lines.slice(-3).join('\n') + res.stderr);
    return lines;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
