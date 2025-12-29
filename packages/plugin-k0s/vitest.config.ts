import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        // Lower branch threshold for this package because many code paths
        // require k0sctl to be installed and running, which isn't available in CI
        branches: 60,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
