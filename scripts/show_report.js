#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const {
  getProjectOutputDir,
  getRunId,
  getTaskKey,
  getTaskOutputDir,
  getTestResultsDir,
  loadEnvFiles,
  resolveFromRepo,
} = require('./utils/runtime_config');

loadEnvFiles();

const projectOutputDir = getProjectOutputDir();
const taskKey = getTaskKey();
const taskOutputDir = getTaskOutputDir({ projectOutputDir, taskKey });
const runId = getRunId();
const testResultsDir = getTestResultsDir({ taskOutputDir, runId });
const reportDir = path.join(testResultsDir, 'playwright-report');

const result = spawnSync(
  path.join(resolveFromRepo('node_modules'), '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright'),
  ['show-report', reportDir],
  { stdio: 'inherit', shell: false },
);

process.exit(result.status || 0);
