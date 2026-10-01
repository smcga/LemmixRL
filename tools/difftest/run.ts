/**
 * Differential test: the TypeScript engine against the oracle (the original Lemmix code compiled with
 * Free Pascal), on randomly generated game scripts for every level of every built-in style.
 *
 *   npm run oracle:build                     # once
 *   npm run difftest -- [options]
 *
 * options:
 *   --styles Orig,Ohno,H94,X91,X92   styles to test (default: all)
 *   --level Orig:1:1                 a single level (style:section:level, 1-based)
 *   --seeds N                        scripts per level (default 1), seeds start at --seed-start (default 1)
 *   --max-iteration N                stop generating after this game iteration (default 4000)
 *   --max-commands N                 upper bound of script commands per case (default 1500)
 *   --jobs N                         parallel worker processes (default: number of CPUs)
 *   --report FILE                    write a JSON report
 *
 * Every step of every case compares the complete game state (all lemming fields, objects, counters,
 * recorder, flags) and hashes of the terrain bitmap, the object map and the rendered frame.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoDataProvider, REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { getStyle } from '../../engine/src/session.ts';
import type { CaseResult } from './compare.ts';
import { oracleAvailable } from './oracle.ts';
import { styleDefFromName } from './runner.ts';

interface Job {
  style: string;
  section: number;
  level: number;
  seed: number;
  maxIteration: number;
  maxCommands: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function buildJobs(): Job[] {
  const styles = (arg('styles') ?? 'Orig,Ohno,H94,X91,X92').split(',');
  const seeds = Number(arg('seeds') ?? 1);
  const seedStart = Number(arg('seed-start') ?? 1);
  const maxIteration = Number(arg('max-iteration') ?? 4000);
  const maxCommands = Number(arg('max-commands') ?? 1500);
  const single = arg('level');
  const data = repoDataProvider();
  const jobs: Job[] = [];
  const addLevel = (style: string, section: number, level: number) => {
    for (let s = seedStart; s < seedStart + seeds; s++) jobs.push({ style, section, level, seed: s, maxIteration, maxCommands });
  };
  if (single) {
    const [style, sec, lev] = single.split(':');
    addLevel(style, Number(sec) - 1, Number(lev) - 1);
    return jobs;
  }
  for (const style of styles) {
    const ls = getStyle(data, styleDefFromName(style)).levelSystem;
    for (const section of ls.sectionList)
      for (const info of section.levelLoadingInformationList) addLevel(style, section.sectionIndex, info.levelIndex);
  }
  return jobs;
}

async function main(): Promise<void> {
  if (!oracleAvailable()) {
    console.error('The oracle is not built. Run: npm run oracle:build');
    process.exit(2);
  }
  const jobs = buildJobs();
  const nJobs = Math.max(1, Math.min(Number(arg('jobs') ?? cpus().length), jobs.length));
  const tmp = mkdtempSync(join(tmpdir(), 'lemmix-difftest-'));
  const chunks: Job[][] = Array.from({ length: nJobs }, () => []);
  jobs.forEach((j, i) => chunks[i % nJobs].push(j));

  console.log(`difftest: ${jobs.length} cases on ${nJobs} workers`);
  const results: CaseResult[] = [];
  const t0 = Date.now();

  await Promise.all(
    chunks.map(
      (chunk, w) =>
        new Promise<void>((resolve, reject) => {
          const file = join(tmp, `jobs-${w}.json`);
          writeFileSync(file, JSON.stringify(chunk));
          const child = spawn(process.execPath, ['--import', 'tsx', join(REPO_ROOT, 'tools/difftest/worker.ts'), file], { stdio: ['ignore', 'pipe', 'inherit'] });
          let buf = '';
          child.stdout.on('data', (d: Buffer) => {
            buf += d.toString();
            let nl: number;
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (!line.trim()) continue;
              const r = JSON.parse(line) as CaseResult;
              results.push(r);
              const status = r.ok ? 'ok  ' : 'FAIL';
              console.log(
                `[${String(results.length).padStart(4)}/${jobs.length}] ${status} ${r.name.padEnd(18)} steps=${String(r.steps).padStart(5)} it=${String(r.iterations).padStart(5)} clicks=${String(r.assignments).padStart(4)} ${r.ms}ms` +
                  (r.ok ? '' : `  -> ${r.artifactDir ?? ''} ${r.error ? r.error.split('\n')[0] : ''}`),
              );
              if (r.firstDiff) console.log(`      oracle: ${r.firstDiff.oracle}\n      ts    : ${r.firstDiff.ts}`);
            }
          });
          child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${w} exited with ${code}`))));
        }),
    ),
  );
  rmSync(tmp, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  const steps = results.reduce((a, r) => a + r.steps, 0);
  const iterations = results.reduce((a, r) => a + r.iterations, 0);
  const clicks = results.reduce((a, r) => a + r.assignments, 0);
  console.log('');
  console.log(`cases: ${results.length}, failed: ${failed.length}`);
  console.log(`compared steps: ${steps}, game iterations: ${iterations}, skill clicks: ${clicks}, time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const report = arg('report');
  if (report) writeFileSync(report, JSON.stringify({ cases: results.length, failed: failed.length, steps, iterations, clicks, results }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

void main();
