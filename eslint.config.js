// Flat config — ESLint 10.x + typescript-eslint 8.x.
// Run with `npm run lint`; auto-fix with `npm run lint:fix`.
// Prettier owns formatting; this config focuses on correctness rules only.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', '.smithery/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // src/index.ts + src/server.ts target Node; src/worker.ts targets the
      // Workers runtime. The union below covers both without forcing per-file
      // overrides for the shared modules under src/BraveAPI, src/tools, etc.
      globals: {
        ...globals.node,
        ...globals.worker,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    },
  },
  prettier
);
