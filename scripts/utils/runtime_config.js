const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end > 0) value = value.slice(1, end);
      else if (value.endsWith(quote)) value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) process.env[key] = value;
  }

  return true;
}

let taskEnvWarned = false;

// Per-project run profile: file trỏ bởi biến môi trường TASK_ENV.
// Truyền theo TỪNG lệnh (không set trong .env chung) để cô lập các task chạy song song.
// VD (PowerShell): $env:TASK_ENV='profiles/SAPP-23439.env'; npm run test:task -- --task SAPP-23439 ...
function resolveTaskEnvFile() {
  const profile = process.env.TASK_ENV;
  if (!profile || !String(profile).trim()) return null;

  const resolved = path.isAbsolute(profile)
    ? profile
    : path.join(REPO_ROOT, String(profile).trim());

  if (!fs.existsSync(resolved)) {
    if (!taskEnvWarned) {
      taskEnvWarned = true;
      console.warn(
        `[runtime_config] TASK_ENV trỏ tới file không tồn tại: ${resolved}. ` +
          'Bỏ qua profile và fallback về .env.local/.env — kiểm tra lại đường dẫn để tránh chạy nhầm credential.',
      );
    }
    return null;
  }

  return resolved;
}

function loadEnvFiles(extraFiles = []) {
  const taskEnvFile = resolveTaskEnvFile();

  // Thứ tự = độ ưu tiên (file đầu tiên set key sẽ thắng). Profile ưu tiên hơn .env chung
  // nhưng vẫn thua env truyền inline và integration-specific extraFiles.
  const envFiles = [
    ...extraFiles,
    ...(taskEnvFile ? [taskEnvFile] : []),
    path.join(REPO_ROOT, '.env.local'),
    path.join(REPO_ROOT, '.env'),
  ];

  for (const envFile of envFiles) parseEnvFile(envFile);
}

loadEnvFiles();

function isUsableValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (/^<[^>]+>$/.test(normalized)) return false;
  if (/^\[[^\]]+\]$/.test(normalized)) return false;
  if (normalized.includes('<YOUR_') || normalized.includes('<ĐIỀN_')) return false;
  return true;
}

function requireValue(name, value, hint) {
  if (isUsableValue(value)) return String(value).trim();
  const suffix = hint ? ` ${hint}` : '';
  throw new Error(`Missing required config: ${name}.${suffix}`);
}

function getProjectOutputDir(value = process.env.PROJECT_OUTPUT_DIR) {
  return requireValue(
    'PROJECT_OUTPUT_DIR',
    value,
    'Set it in .env, .env.local, or pass --project-output.',
  );
}

function getTaskKey(options = {}) {
  const value = [
    options.task,
    options.taskKey,
    options.task_key,
    options.taskId,
    options.task_id,
    process.env.TASK_KEY,
    process.env.TASK_SCOPE,
    process.env.TASK,
    options.story,
  ].find((candidate) => isUsableValue(candidate));

  return requireValue(
    'TASK_KEY',
    value,
    'Set TASK_KEY or pass --task <TASK_KEY>. Do not rely on JIRA_STORY_KEY as task scope.',
  );
}

function getRunId(value = process.env.RUN_ID) {
  if (!isUsableValue(value)) return '';
  const runId = String(value).trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(runId)) {
    throw new Error('Invalid RUN_ID. Use only letters, numbers, dot, underscore, or hyphen.');
  }
  return runId;
}

function getTaskOutputDir(options = {}) {
  if (isUsableValue(options.taskOutputDir)) return options.taskOutputDir;

  const projectOutputDir = options.projectOutputDir || getProjectOutputDir();
  const taskKey = options.taskKey || getTaskKey(options);
  const defaultTaskOutputDir = path.join(projectOutputDir, 'tasks', taskKey);

  if (isUsableValue(process.env.TASK_OUTPUT_DIR)) {
    const configuredTaskOutputDir = process.env.TASK_OUTPUT_DIR;
    const normalizedConfigured = path.normalize(configuredTaskOutputDir);
    const normalizedExpectedSuffix = path.normalize(path.join('tasks', taskKey));
    const basenameMatchesTask = path.basename(normalizedConfigured) === taskKey;
    const suffixMatchesTask = normalizedConfigured.endsWith(normalizedExpectedSuffix);

    if (!basenameMatchesTask && !suffixMatchesTask) {
      throw new Error(
        `TASK_OUTPUT_DIR does not match TASK_KEY. TASK_OUTPUT_DIR=${configuredTaskOutputDir}, TASK_KEY=${taskKey}. ` +
          'Unset TASK_OUTPUT_DIR or pass the correct task output path.',
      );
    }

    return configuredTaskOutputDir;
  }

  return defaultTaskOutputDir;
}

function getTestResultsDir(options = {}) {
  const taskOutputDir = options.taskOutputDir || getTaskOutputDir(options);
  const runId = options.runId !== undefined ? getRunId(options.runId) : getRunId();
  if (!runId) return path.join(taskOutputDir, 'test-results');
  return path.join(taskOutputDir, 'test-results', 'runs', runId);
}

function resolveFromRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

module.exports = {
  REPO_ROOT,
  getProjectOutputDir,
  getRunId,
  getTaskKey,
  getTaskOutputDir,
  getTestResultsDir,
  isUsableValue,
  loadEnvFiles,
  parseEnvFile,
  requireValue,
  resolveFromRepo,
};
