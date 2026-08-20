import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    env: {
      DEBUG_MODE: 'true',
      ADMIN_SECRET: 'test-admin-secret',
      CRON_SECRET: 'test-cron-secret',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
