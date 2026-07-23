'use strict';

// Flat config (eslint 9+). Lint script Node của kit. Lần đầu bật lint → ADVISORY ở CI (không chặn);
// nhiều rule noisy hạ 'warn'. no-undef = 'warn' (script có đoạn chạy trong page.evaluate = ngữ cảnh browser).
// Siết dần khi dọn baseline. Test .ts do `tsc --noEmit` lo; k6 (tests/load) khác runtime → bỏ qua.
const js = require('@eslint/js');

const globals = {
  // Node
  require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly',
  console: 'readonly', __dirname: 'readonly', __filename: 'readonly', Buffer: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  URL: 'readonly', URLSearchParams: 'readonly', globalThis: 'readonly', fetch: 'readonly',
  // Browser (dùng bên trong page.evaluate của Playwright)
  document: 'readonly', window: 'readonly', navigator: 'readonly', location: 'readonly',
  getComputedStyle: 'readonly', HTMLElement: 'readonly', MutationObserver: 'readonly',
};

const commonRules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-undef': 'warn',
  'no-control-regex': 'off',
  // Rule style mới của eslint 10 — nợ cũ, hạ 'warn' cho baseline (siết dần sau).
  'no-useless-assignment': 'warn',
  'preserve-caught-error': 'warn',
};

module.exports = [
  { ignores: ['node_modules/**', 'outputs/**', 'playwright-report/**', 'test-results/**', 'reports/**', 'docs/**', 'tests/**'] },
  { files: ['scripts/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals }, rules: commonRules },
  { files: ['scripts/**/*.mjs'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals }, rules: commonRules },
];
