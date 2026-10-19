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

function checkVersions(projectRoot = root) {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  const cargo = readFileSync(join(projectRoot, 'Cargo.toml'), 'utf8');
  const packageSection = cargo.split(/^\[package\][ \t]*\r?\n/m)[1]?.split(/^\[/m)[0] || '';
  const crateName = packageSection.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const version = packageSection.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (crateName !== 'xbot-cli') throw new Error('Cargo.toml package name must be xbot-cli');
  if (version !== pkg.version) throw new Error(`Cargo version ${version} differs from npm ${pkg.version}`);
  const cargoLock = readFileSync(join(projectRoot, 'Cargo.lock'), 'utf8');
  const lockedCrates = cargoLock.split(/^\[\[package\]\]\s*\r?\n/m).slice(1)
    .filter(section => section.match(/^name\s*=\s*"([^"]+)"/m)?.[1] === crateName);
  if (lockedCrates.length !== 1) throw new Error('Cargo.lock must contain exactly one xbot-cli package');
  const lockedVersion = lockedCrates[0].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if (lockedVersion !== pkg.version) throw new Error(`Cargo.lock version ${lockedVersion} differs from npm ${pkg.version}`);
  const lock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8'));
  if (lock.name !== pkg.name || lock.packages?.['']?.name !== pkg.name) {
    throw new Error('package-lock.json name differs from package.json');
  }
  if (lock.version !== pkg.version || lock.packages[''].version !== pkg.version) {
    throw new Error('package-lock.json version differs from package.json');
  }
}

module.exports = { root, target, nativePath, manifest, run, npm, checkVersions };
