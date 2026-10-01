/**
 * The regression cases (tools/difftest/regressions): the TypeScript output must be identical to the output of the
 * oracle, which is stored as a hash in golden.json (written by `npm run difftest:recheck -- --update-golden`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { runTs } from './runner.ts';

const dir = join(REPO_ROOT, 'tools', 'difftest', 'regressions');
const cases = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'golden.json'))) : [];

describe('regression cases against the oracle output', () => {
  for (const name of cases) {
    it(name, () => {
      const c = JSON.parse(readFileSync(join(dir, name, 'case.json'), 'utf8'));
      const golden = JSON.parse(readFileSync(join(dir, name, 'golden.json'), 'utf8')) as { lines: number; sha256: string };
      const script = readFileSync(join(dir, name, 'script.txt'), 'utf8').split('\n').filter((l) => l !== '');
      const tmp = mkdtempSync(join(tmpdir(), 'lemmix-ts-'));
      try {
        const out = runTs({ style: c.style, section: c.section, level: c.level, script, gameOptions: c.gameOptions, optionalMechanics: c.optionalMechanics, full: true, dir: tmp });
        expect(out.length).toBe(golden.lines);
        expect(createHash('sha256').update(out.join('\n')).digest('hex')).toBe(golden.sha256);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
