/** Child process of tools/difftest/run.ts: runs the jobs given as JSON in argv[2] and prints one JSON result per line. */
import { readFileSync } from 'node:fs';
import { runCase } from './compare.ts';

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Parameters<typeof runCase>[0][];
for (const job of jobs) {
  const r = runCase(job);
  process.stdout.write(JSON.stringify(r) + '\n');
}
