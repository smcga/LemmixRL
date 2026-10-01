/**
 * Plays Lemmix replay files (.lrb) on both engines and compares every frame: real solutions recorded by players are
 * test cases as well. The level is found by the hash in the replay header (like the replay finder of Lemmix).
 *
 *   npx tsx tools/difftest/replay.ts [--frames N] file.lrb [...]
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseHeader, REPLAY_HEADER_SIZE } from '../../engine/src/game/recorder.ts';
import { repoDataProvider } from '../../engine/src/node/repoData.ts';
import { getStyle } from '../../engine/src/session.ts';
import { STYLE_NAMES, StyleDef } from '../../engine/src/styles/base.ts';
import { firstDifference } from './compare.ts';
import { oracleAvailable, runOracle } from './oracle.ts';
import { runTs } from './runner.ts';

function findLevel(bytes: Uint8Array): { style: string; section: number; level: number } | null {
  if (bytes.length < REPLAY_HEADER_SIZE) return null;
  const header = parseHeader(bytes.subarray(0, REPLAY_HEADER_SIZE));
  if (header.signature !== 'LRB' || header.version < 2) return null;
  const data = repoDataProvider();
  for (let def = StyleDef.Orig; def <= StyleDef.X92; def++)
    for (const info of getStyle(data, def).levelSystem.allLevels())
      if (info.getLevelHash() === header.hash) return { style: STYLE_NAMES[def], section: info.section.sectionIndex, level: info.levelIndex };
  return null;
}

const args = process.argv.slice(2);
const fi = args.indexOf('--frames');
const frames = fi >= 0 ? Number(args[fi + 1]) : 20000;
const files = args.filter((a, i) => !a.startsWith('--') && (fi < 0 || i !== fi + 1));
if (!oracleAvailable()) {
  console.error('The oracle is not built. Run: npm run oracle:build');
  process.exit(2);
}
let failed = 0;
for (const file of files) {
  const bytes = new Uint8Array(readFileSync(file));
  const where = findLevel(bytes);
  if (!where) {
    console.log(`SKIP  ${file}: no level with the hash of this replay (or replay version 1)`);
    continue;
  }
  const dir = mkdtempSync(join(tmpdir(), 'lemmix-replay-'));
  try {
    copyFileSync(file, join(dir, 'replay.lrb'));
    const script = ['load $DIR/replay.lrb', 'start 1 0', `run ${frames}`];
    const or = runOracle({ ...where, script, dir });
    const ts = runTs({ ...where, script, dir });
    const d = firstDifference(or, ts);
    const last = [...ts].reverse().find((l) => l.startsWith('G ')) ?? '';
    if (d < 0) console.log(`ok    ${basename(file)} (${where.style} ${where.section + 1}-${where.level + 1}, ${ts.length} lines, ${last.split(' ')[1]} iterations)`);
    else {
      failed++;
      console.log(`FAIL  ${basename(file)} line ${d}\n  oracle: ${or[d] ?? '<end>'}\n  ts    : ${ts[d] ?? '<end>'}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
process.exit(failed === 0 ? 0 : 1);
