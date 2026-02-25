#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(command) {
  return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function escapeShellArg(value) {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const appRoot = process.cwd();
const repoRoot = run('git rev-parse --show-toplevel');
const appRelativeFromRepo = path.relative(repoRoot, appRoot).replace(/\\/g, '/');

const rawChanged = run('git diff --name-only --diff-filter=ACMRTUXB HEAD');
const changedPaths = rawChanged
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => file.startsWith(appRelativeFromRepo + '/'))
  .map((file) => file.slice(appRelativeFromRepo.length + 1))
  .filter((file) => /\.(cjs|mjs|js|jsx|ts|tsx)$/.test(file))
  .filter((file) => fs.existsSync(path.join(appRoot, file)));

if (changedPaths.length === 0) {
  console.log('lint:changed -> no hay archivos JS/TS modificados en este paquete.');
  process.exit(0);
}

const eslintCommand = `npx eslint ${changedPaths.map(escapeShellArg).join(' ')}`;
console.log(`lint:changed -> ejecutando ESLint en ${changedPaths.length} archivo(s).`);
execSync(eslintCommand, { stdio: 'inherit' });
