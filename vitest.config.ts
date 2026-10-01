import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['engine/test/**/*.test.ts', 'app/test/**/*.test.ts', 'tools/**/*.test.ts'],
    testTimeout: 300000,
  },
});
