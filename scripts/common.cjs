'use strict';

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const root = join(__dirname, '..');
const target = 'x86_64-pc-windows-msvc';
const nativePath = join(root, 'native', 'win32-x64', 'xbot-cli.exe');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status ?? result.signal}${result.stderr ? `\n${result.stderr}` : ''}`);
  }
  return result;
}

function npm(args, options = {}) {
  const cli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return run(process.execPath, [cli, ...args], options);
}

function checkVersions() {
  const cargo = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const version = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (version !== manifest.version) throw new Error(`Cargo version ${version} differs from npm ${manifest.version}`);
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  if (lock.name !== manifest.name || lock.packages[''].name !== manifest.name) {
    throw new Error('package-lock.json name differs from package.json');
  }
  if (lock.version !== manifest.version || lock.packages[''].version !== manifest.version) {
    throw new Error('package-lock.json version differs from package.json');
  }
}

module.exports = { root, target, nativePath, manifest, run, npm, checkVersions };
