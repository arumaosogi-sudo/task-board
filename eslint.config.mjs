// @ts-check
// Flat ESLint config shared across the monorepo (apps/api, apps/web, packages/shared).
// Each workspace runs `eslint src` from its own dir; ESLint walks up to this root config.
// Rationale for non-type-checked preset: keeps lint fast and avoids per-workspace
// parserOptions.project wiring across 3 tsconfigs. `typecheck` (tsc --noEmit) already
// covers the type dimension in CI, so ESLint here focuses on correctness/hygiene lint.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // ---- Global ignores (build output, generated, vendored) ----
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      'apps/api/prisma/migrations/**',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
    ],
  },

  // ---- Base: JS + typescript-eslint recommended (non type-checked) ----
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ---- Shared TS tweaks (all workspaces) ----
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Allow intentionally-unused vars/args when prefixed with `_`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `any` is a smell, not a build-breaker — surface it without blocking CI.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // ---- Backend: NestJS (Node) ----
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // NestJS DI leans on decorator metadata & empty constructors/lifecycle hooks.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // ---- Frontend: React + Vite ----
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // ---- Test files: Jest (api) + Vitest (web) globals ----
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
  },

  // ---- Turn OFF all formatting rules — Prettier owns formatting. Keep last. ----
  prettier,
)
