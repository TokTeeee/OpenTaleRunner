import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Underscore-prefixed names are intentional placeholders
      // (interface contracts in Mem0ClientAdapter, store callbacks
      // awaiting entityId, etc.).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // react-hooks/refs flags zustand store property access as "ref access
      // during render" — false positive. Will re-enable after we audit
      // real useRef().current usage in v0.4 cleanup.
      'react-hooks/refs': 'off',
      // react-hooks/purity is too strict for a UI that legitimately
      // renders wall-clock-derived data (ActionRoundStatus countdown,
      // etc.). Flagging useMemo over a primitive is also a false positive.
      'react-hooks/purity': 'off',
    },
  },
  {
    // Test files: relaxed `no-explicit-any` (mocking + fixture typing benefit
    // from `any`); unused-vars and other safety rules still apply.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
