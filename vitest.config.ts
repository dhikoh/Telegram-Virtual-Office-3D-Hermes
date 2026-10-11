import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@hermes-office/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      '@hermes-office/mock-hermes': path.resolve(__dirname, './tools/mock-hermes/src/server.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
