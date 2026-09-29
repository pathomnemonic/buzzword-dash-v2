import js from '@eslint/js';
import globals from 'globals';

export default [
  // Global ignores — must be a standalone object with only `ignores` key [18]
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'js/cardsarchive.js'
    ]
  },

  // Base recommended rules
  js.configs.recommended,

  // Application source files
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        THREE: 'readonly',
        JSZip: 'readonly',
        initSqlJs: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      // Codebase is deliberately ES5-style (var + function expressions); converting
      // ~3000 declarations risks hoisting regressions, so these are not enforced.
      'no-var': 'off',
      'prefer-const': 'off',
      'eqeqeq': ['warn', 'smart']
    }
  },

  // Service worker
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.es2021 }
    }
  },

  // Test files
  {
    files: ['tests/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      'no-unused-vars': 'off'
    }
  },

  // Tooling scripts
  {
    files: ['tools/**/*.mjs', 'vite.config.js', 'vitest.config.js', 'playwright.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  }
];
