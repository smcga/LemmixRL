/**
 * Re-runs saved cases (<dir>/script.txt + case.json) on both engines and compares the complete (full) dumps:
 * the hand-written and former failure cases in tools/difftest/regressions, and the artifacts of failed difftest
 * cases in tools/difftest/failures (the generator may produce different scripts after a change, so a failure is
 * re-checked from its saved script).
 *
 *   npx tsx tools/difftest/recheck.ts [dir ...]     (default: all cases in regressions and failures)
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { firstDifference } from './compare.ts';
import { runOracle } from './oracle.ts';
import { runTs } from './runner.ts';

const caseDirs = (parent: string) => (existsSync(parent) ? readdirSync(parent).sort().map((d) => join(parent, d)) : []);
const dirs =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [...caseDirs(join(REPO_ROOT, 'tools', 'difftest', 'regressions')), ...caseDirs(join(REPO_ROOT, 'tools', 'difftest', 'failures'))];
let failed = 0;
for (const dir of dirs) {
  const c = JSON.parse(readFileSync(join(dir, 'case.json'), 'utf8'));
  const script = readFileSync(join(dir, 'script.txt'), 'utf8').split('\n').filter((l) => l !== '');
  const tsDir = mkdtempSync(join(tmpdir(), 'lemmix-ts-'));
  const orDir = mkdtempSync(join(tmpdir(), 'lemmix-or-'));
  try {
    const opts = { style: c.style, section: c.section, level: c.level, script, gameOptions: c.gameOptions, optionalMechanics: c.optionalMechanics, full: true };
    const or = runOracle({ ...opts, dir: orDir });
    const ts = runTs({ ...opts, dir: tsDir });
    const d = firstDifference(or, ts);
    if (d < 0) console.log(`ok    ${dir} (${or.length} lines)`);
    else {
      failed++;
      console.log(`FAIL  ${dir} line ${d}\n  oracle: ${or[d] ?? '<end>'}\n  ts    : ${ts[d] ?? '<end>'}`);
    }
  } catch (e) {
    failed++;
    console.log(`ERROR ${dir}: ${String((e as Error).message ?? e).split('\n').slice(0, 4).join(' | ')}`);
  } finally {
    rmSync(tsDir, { recursive: true, force: true });
    rmSync(orDir, { recursive: true, force: true });
  }
}
process.exit(failed === 0 ? 0 : 1);
