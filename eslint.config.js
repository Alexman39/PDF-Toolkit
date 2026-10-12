import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  {
    // ESLint merges `globals` across configs, so core is excluded here rather than
    // overridden below; otherwise browser globals would leak into it.
    ignores: ['src/core/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    // Core must run in a worker, in Node tests and on the main thread, so it may only
    // use globals all of them share. Touching `document` or `window` fails `no-undef`.
    files: ['src/core/**/*.js'],
    languageOptions: { globals: { ...globals['shared-node-browser'] } },
  },
  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['*.config.js', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
];
