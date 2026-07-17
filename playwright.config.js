const { defineConfig } = require('@playwright/test');
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
  },
});
