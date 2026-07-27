const { defineConfig, devices } = require('@playwright/test');
const {
  getProjectOutputDir,
  getRunId,
  getTaskKey,
  getTaskOutputDir,
  getTestResultsDir,
  loadEnvFiles,
} = require('./scripts/utils/runtime_config');

loadEnvFiles();

const projectOutputDir = getProjectOutputDir();
const taskKey = getTaskKey();
const taskOutputDir = getTaskOutputDir({ projectOutputDir, taskKey });
const runId = getRunId();
const testResultsDir = getTestResultsDir({ taskOutputDir, runId });

module.exports = defineConfig({
  testDir: './tests',
  outputDir: `${testResultsDir}/artifacts`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${testResultsDir}/playwright-report`, open: 'never' }],
    ['json', { outputFile: `${testResultsDir}/results.json` }],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: process.env.PW_VIDEO || 'off',
    trace: process.env.PW_TRACE || 'off',
    // Tắt cờ automation của Chromium: một số SPA (vd LMS/Keycloak) phát hiện automation → chặn OIDC
    // redirect / loop trang login trắng. Vô hại với app khác. Xem tests/fe/support/lmsLogin.ts.
    launchOptions: { args: ['--disable-blink-features=AutomationControlled'] },
  },
  // Desktop chạy toàn bộ tests/ trừ tests/mobile-web; mobile-web chạy trên thiết bị thật (touch/UA/isMobile).
  // Không để project mobile phủ toàn bộ suite (tránh nhân 3 lần). Task-scoped scripts (automation/*.js)
  // KHÔNG dùng projects này — chúng tự emulate qua browser.newContext({ ...devices[...] }), xem
  // prompt_templates/phase2/04_execute_fe_playwright.md.
  projects: [
    {
      name: 'chromium-desktop',
      testIgnore: ['**/mobile-web/**', '**/load/**'], // load/ là k6 script, KHÔNG phải Playwright spec
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iphone-13',
      testDir: './tests/mobile-web',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'pixel-7',
      testDir: './tests/mobile-web',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
