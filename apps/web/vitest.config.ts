import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.spec.{ts,tsx}'],
    maxWorkers: 4,
    css: false,
    env: {
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': '.',
    },
  },
});
