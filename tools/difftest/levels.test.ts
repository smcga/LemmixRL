/**
 * Every level of the five styles: the title, hash, level code and the complete state of the first 40 frames on the
 * TypeScript engine must be identical to the output of the oracle, stored as hashes in golden-levels.json (written by
 * `npm run difftest:levels -- --update-golden`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../engine/src/node/repoData.ts';
import { runTs } from './runner.ts';

const file = join(REPO_ROOT, 'tools', 'difftest', 'golden-levels.json');
const golden: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};

describe('every level against the oracle output', () => {
  it('has golden data for all 292 levels', () => expect(Object.keys(golden).length).toBe(292));
  for (const style of ['Orig', 'Ohno', 'H94', 'X91', 'X92']) {
    it(style, () => {
      const dir = mkdtempSync(join(tmpdir(), 'lemmix-levels-'));
      try {
        const keys = Object.keys(golden).filter((k) => k.startsWith(style + ':'));
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) {
          const [, sec, lev] = key.split(':').map(Number);
          const out = runTs({ style, section: sec - 1, level: lev - 1, script: ['start 0 0', 'update 40'], full: true, dir });
          expect(createHash('sha256').update(out.join('\n')).digest('hex'), key).toBe(golden[key]);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
