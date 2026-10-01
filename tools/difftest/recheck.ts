/**
 * Re-runs saved cases (<dir>/script.txt + case.json) on both engines and compares the complete (full) dumps:
 * the hand-written and former failure cases in tools/difftest/regressions, and the artifacts of failed difftest
 * cases in tools/difftest/failures (the generator may produce different scripts after a change, so a failure is
 * re-checked from its saved script).
 *
 *   npx tsx tools/difftest/recheck.ts [--update-golden] [dir ...]   (default: all cases in regressions and failures)
 *
 * --update-golden writes <dir>/golden.json with a hash of the oracle output, which the unit tests compare the
 * TypeScript output with (so the regression cases are also checked where the oracle is not built).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { firstDifference } from './compare.ts';
import { runOracle } from './oracle.ts';
import { runTs } from './runner.ts';

export function outputHash(lines: string[]): string {
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

const args = process.argv.slice(2);
const updateGolden = args.includes('--update-golden');
const caseDirs = (parent: string) => (existsSync(parent) ? readdirSync(parent).sort().map((d) => join(parent, d)) : []);
const named = args.filter((a) => !a.startsWith('--'));
const dirs =
  named.length > 0
    ? named
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
    if (updateGolden) writeFileSync(join(dir, 'golden.json'), JSON.stringify({ lines: or.length, sha256: outputHash(or) }, null, 2) + '\n');
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
