/** Compares TypeScript and oracle outputs of one generated case. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { type Coverage, generateCase, type GeneratedCase } from './generate.ts';
import { runOracle } from './oracle.ts';
import { runTs } from './runner.ts';

export interface CaseResult {
  name: string;
  ok: boolean;
  steps: number;
  lines: number;
  iterations: number;
  assignments: number;
  replayBytesEqual: boolean | null;
  firstDiff?: { line: number; oracle: string; ts: string; context: string[] };
  artifactDir?: string;
  error?: string;
  ms: number;
  coverage?: Coverage;
}

export function caseName(c: { style: string; section: number; level: number; seed: number }): string {
  return `${c.style}-${c.section + 1}-${String(c.level + 1).padStart(2, '0')}-s${c.seed}`;
}

export function firstDifference(a: string[], b: string[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export function runCase(job: { style: string; section: number; level: number; seed: number; maxIteration?: number; maxCommands?: number }): CaseResult {
  const t0 = Date.now();
  const name = caseName(job);
  const tsDir = mkdtempSync(join(tmpdir(), 'lemmix-ts-'));
  const orDir = mkdtempSync(join(tmpdir(), 'lemmix-or-'));
  let gen: GeneratedCase | undefined;
  try {
    gen = generateCase({ ...job, dir: tsDir });
    const oracleOut = runOracle({
      style: job.style,
      section: job.section,
      level: job.level,
      script: gen.script,
      gameOptions: gen.gameOptions,
      optionalMechanics: gen.optionalMechanics,
      dir: orDir,
    });
    const d = firstDifference(oracleOut, gen.tsOut);
    const steps = gen.tsOut.filter((l) => l.startsWith('S ')).length;
    const assignments = gen.script.filter((l) => l.startsWith('click')).length;
    const lastG = [...gen.tsOut].reverse().find((l) => l.startsWith('G ')) ?? 'G 0';
    const iterations = Number(lastG.split(' ')[1]);
    let replayBytesEqual: boolean | null = null;
    if (existsSync(join(tsDir, 'replay.lrb')) || existsSync(join(orDir, 'replay.lrb'))) {
      try {
        replayBytesEqual = Buffer.compare(readFileSync(join(tsDir, 'replay.lrb')), readFileSync(join(orDir, 'replay.lrb'))) === 0;
      } catch {
        replayBytesEqual = false;
      }
    }
    const result: CaseResult = {
      name,
      ok: d < 0 && replayBytesEqual !== false,
      steps,
      lines: gen.tsOut.length,
      iterations,
      assignments,
      replayBytesEqual,
      ms: 0,
      coverage: gen.coverage,
    };
    if (!result.ok) result.artifactDir = writeArtifacts(name, gen, orDir, tsDir);
    if (d >= 0) {
      result.firstDiff = { line: d, oracle: oracleOut[d] ?? '<end>', ts: gen.tsOut[d] ?? '<end>', context: oracleOut.slice(Math.max(0, d - 6), d) };
    }
    result.ms = Date.now() - t0;
    return result;
  } catch (e) {
    const artifactDir = gen ? writeArtifacts(name, gen, orDir, tsDir) : undefined;
    return { name, ok: false, steps: 0, lines: 0, iterations: 0, assignments: 0, replayBytesEqual: null, error: String((e as Error).stack ?? e), artifactDir, ms: Date.now() - t0 };
  } finally {
    rmSync(tsDir, { recursive: true, force: true });
    rmSync(orDir, { recursive: true, force: true });
  }
}

/** Writes the script and full dumps of both engines for investigation. */
function writeArtifacts(name: string, gen: GeneratedCase, orDir: string, tsDir: string): string {
  const dir = join(REPO_ROOT, 'tools', 'difftest', 'failures', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'script.txt'), gen.script.join('\n') + '\n');
  writeFileSync(
    join(dir, 'case.json'),
    JSON.stringify({ style: gen.style, section: gen.section, level: gen.level, seed: gen.seed, gameOptions: gen.gameOptions, optionalMechanics: gen.optionalMechanics }, null, 2),
  );
  try {
    const fullOr = runOracle({ style: gen.style, section: gen.section, level: gen.level, script: gen.script, gameOptions: gen.gameOptions, optionalMechanics: gen.optionalMechanics, full: true, dir: orDir });
    const fullTs = runTs({ style: gen.style, section: gen.section, level: gen.level, script: gen.script, gameOptions: gen.gameOptions, optionalMechanics: gen.optionalMechanics, full: true, dir: tsDir });
    writeFileSync(join(dir, 'oracle.full.txt'), fullOr.join('\n') + '\n');
    writeFileSync(join(dir, 'ts.full.txt'), fullTs.join('\n') + '\n');
    const d = firstDifference(fullOr, fullTs);
    writeFileSync(
      join(dir, 'first-difference.txt'),
      d < 0 ? 'full dumps are identical\n' : `line ${d}\n--- oracle\n${fullOr.slice(Math.max(0, d - 20), d + 5).join('\n')}\n--- ts\n${fullTs.slice(Math.max(0, d - 20), d + 5).join('\n')}\n`,
    );
  } catch (e) {
    writeFileSync(join(dir, 'error.txt'), String((e as Error).stack ?? e));
  }
  return dir;
}

export function tmpBase(): string {
  return mkdtempSync(join(tmpdir(), 'lemmix-'));
}
