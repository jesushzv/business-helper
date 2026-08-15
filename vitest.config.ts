import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['node_modules', 'tests/e2e/**', '.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '.next/**',
        'scripts/**',
        '**/*.d.ts',
        '**/*.config.*',
        'middleware.ts',
      ],
      /**
       * The enforced coverage floor — and the single source of truth for it
       * (#51).
       *
       * These were 85/80/80/85 and ran nowhere: `npm test` is
       * `lint && typecheck && vitest run` with no `--coverage`, CI ran
       * `npx vitest run`, and `test:coverage` was invoked by no automation.
       * Run by hand they were red on `main`. Meanwhile eight documents cited
       * the 85% gate as evidence the code was covered — the same shape as the
       * simulated-CFDI finding, and worse than having no gate at all.
       *
       * Resolved the second way the issue offers: enforce what the suite
       * actually achieves, in CI, rather than keep an aspirational number that
       * never runs. A gate that holds at a lower figure is worth more than one
       * that holds at no figure.
       *
       * Each is set just under the measured value, so an honest small change
       * cannot redden CI while a real regression does. **This is a ratchet:
       * raise it when coverage rises, never lower it to make a red run pass** —
       * lowering is how the previous numbers stopped meaning anything. The live
       * measured figures belong in `docs/STATUS.md`, not here and not in any
       * other document; `tests/unit/coverageGateSingleSource.test.ts` fails the
       * build on a markdown file that restates them.
       */
      thresholds: {
        lines: 84,
        functions: 78,
        branches: 75,
        statements: 82,
      },
    },
  },
});
