/**
 * Quick check of every level: the title, hash and level code, and the complete game state after the start and the
 * first frames (loading, the terrain, the objects and the rendered frame) on both engines.
 *
 *   npx tsx tools/difftest/levels.ts [--styles Orig,Ohno] [--update-golden]
 *
 * --update-golden writes tools/difftest/golden-levels.json (a hash of the oracle output per level), which the unit
 * tests compare the TypeScript output with.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, repoDataProvider } from '../../engine/src/node/repoData.ts';
import { getStyle } from '../../engine/src/session.ts';
import { firstDifference } from './compare.ts';
import { oracleAvailable, runOracle } from './oracle.ts';
import { runTs, styleDefFromName } from './runner.ts';

if (!oracleAvailable()) {
  console.error('The oracle is not built. Run: npm run oracle:build');
  process.exit(2);
}
const i = process.argv.indexOf('--styles');
const styles = (i >= 0 ? process.argv[i + 1] : 'Orig,Ohno,H94,X91,X92').split(',');
const LEVEL_SCRIPT = ['start 0 0', 'update 40']; // also in levels.test.ts
const script = LEVEL_SCRIPT;
const updateGolden = process.argv.includes('--update-golden');
const golden: Record<string, string> = {};
let levels = 0;
let failed = 0;
const dir = mkdtempSync(join(tmpdir(), 'lemmix-levels-'));
try {
  for (const style of styles) {
    for (const info of getStyle(repoDataProvider(), styleDefFromName(style)).levelSystem.allLevels()) {
      const where = { style, section: info.section.sectionIndex, level: info.levelIndex, script, full: true, dir };
      const or = runOracle(where);
      const ts = runTs(where);
      const d = firstDifference(or, ts);
      golden[`${style}:${where.section + 1}:${where.level + 1}`] = createHash('sha256').update(or.join('\n')).digest('hex');
      levels++;
      if (d >= 0) {
        failed++;
        console.log(`FAIL  ${style} ${where.section + 1}-${where.level + 1} line ${d}\n  oracle: ${or[d] ?? '<end>'}\n  ts    : ${ts[d] ?? '<end>'}`);
      }
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
if (updateGolden) writeFileSync(join(REPO_ROOT, 'tools', 'difftest', 'golden-levels.json'), JSON.stringify(golden, null, 1) + '\n');
console.log(`levels: ${levels}, failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
