import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'coverage/**',
      'data/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'release/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['server/**/*.js', 'scripts/**/*.js', 'desktop/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['desktop/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },
  {
    files: ['web/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      sourceType: 'module',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      // Le code React existant sera typé et modernisé progressivement.
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['e2e/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
