import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest config for integration tests.
 *
 * Runs against real PostgreSQL + Redis (dind services).
 * Separate from unit tests to avoid slowing down `npm run test`.
 *
 * Run with: npm run test:integration
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.integration.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: {
      concurrent: false, // Run serially — integration tests share a DB
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
