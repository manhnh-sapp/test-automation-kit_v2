const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  getRunId,
  getTaskOutputDir,
  isUsableValue,
} = require('./runtime_config');

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return '';
  const value = args[index + 1];
  if (!isUsableValue(value) || value.startsWith('--')) {
    throw new Error(`Missing value for ${name}`);
  }
  args.splice(index, 2);
  return value;
}

function readFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function usage() {
  return [
    'Usage:',
    '  npm run test:task -- --project-output outputs/<PROJECT> --task <TASK_KEY> [--run-id <RUN_ID>] [-- <playwright args>]',
    '  npm run test:task:fe -- --project-output outputs/<PROJECT> --task <TASK_KEY>',
    '  npm run test:task:api -- --project-output outputs/<PROJECT> --task <TASK_KEY>',
  ].join('\n');
}

function splitArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  if (separatorIndex === -1) return { wrapperArgs: [...argv], playwrightArgs: [] };
  return {
    wrapperArgs: argv.slice(0, separatorIndex),
    playwrightArgs: argv.slice(separatorIndex + 1),
  };
}

function main() {
  const { wrapperArgs, playwrightArgs } = splitArgs(process.argv.slice(2));
  const help = readFlag(wrapperArgs, '--help') || readFlag(wrapperArgs, '-h');
  if (help) {
    console.log(usage());
    process.exit(0);
  }

  const projectOutputDir = readOption(wrapperArgs, '--project-output');
  const taskKey = readOption(wrapperArgs, '--task');
  const runId = getRunId(readOption(wrapperArgs, '--run-id'));
  const suite = readOption(wrapperArgs, '--suite');

  if (!isUsableValue(projectOutputDir) || !isUsableValue(taskKey)) {
    throw new Error(`Both --project-output and --task are required.\n${usage()}`);
  }

  if (wrapperArgs.length) {
    throw new Error(`Unknown wrapper argument(s): ${wrapperArgs.join(' ')}\n${usage()}`);
  }

  const taskOutputDir = getTaskOutputDir({ projectOutputDir, taskKey });
  const env = {
    ...process.env,
    PROJECT_OUTPUT_DIR: projectOutputDir,
    TASK_KEY: taskKey,
    TASK_OUTPUT_DIR: taskOutputDir,
  };
  if (runId) env.RUN_ID = runId;
  else delete env.RUN_ID;

  const repoRoot = path.resolve(__dirname, '..', '..');
  const playwrightCli = path.join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!fs.existsSync(playwrightCli)) {
    throw new Error('Cannot find local Playwright CLI. Run npm install before executing task tests.');
  }

  const resolvedPlaywrightArgs = ['test'];
  if (suite === 'fe') resolvedPlaywrightArgs.push('tests/fe');
  else if (suite === 'api') resolvedPlaywrightArgs.push('tests/api');
  else if (suite) throw new Error(`Invalid --suite "${suite}". Use "fe" or "api".`);
  resolvedPlaywrightArgs.push(...playwrightArgs);

  console.log('Playwright task scope:');
  console.log(`PROJECT_OUTPUT_DIR=${projectOutputDir}`);
  console.log(`TASK_KEY=${taskKey}`);
  console.log(`TASK_OUTPUT_DIR=${taskOutputDir}`);
  console.log(`RUN_ID=${runId || 'N/A'}`);
  console.log(`COMMAND=${process.execPath} ${path.relative(repoRoot, playwrightCli)} ${resolvedPlaywrightArgs.join(' ')}`);

  const child = spawn(process.execPath, [playwrightCli, ...resolvedPlaywrightArgs], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(`Failed to start Playwright: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`Playwright terminated with signal ${signal}`);
      process.exit(1);
    }
    process.exit(code || 0);
  });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
