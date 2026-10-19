'use strict';

const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync } = require('node:fs');
const { join, resolve, relative } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, manifest, run, npm } = require('./common.cjs');

run(process.execPath, [join(__dirname, 'build.cjs')]);
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', dist], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).stdout)[0];
const expected = ['LICENSE', 'README.md', 'bin/xbot-cli.cjs', 'native/win32-x64/xbot-cli.exe', 'package.json'].sort();
assert.deepEqual(packed.files.map(file => file.path).sort(), expected, 'Unexpected npm package content');
const tarball = join(dist, packed.filename);
const scratch = mkdtempSync(join(tmpdir(), 'xbot-cli package test '));
const prefix = join(scratch, 'install prefix');
const workdir = join(scratch, 'user workspace');
mkdirSync(workdir, { recursive: true });

try {
  // Local tarball, no dependencies, and lifecycle scripts disabled: no compiler or download.
  npm(['install', '--global', '--prefix', prefix, '--ignore-scripts', '--offline', '--no-audit', '--no-fund', tarball]);
  const launcher = join(prefix, 'node_modules', ...manifest.name.split('/'), 'bin', 'xbot-cli.cjs');
  const shim = join(prefix, 'xbot-cli.cmd');
  assert.ok(existsSync(shim), 'npm must create its command shim');
  const shimResult = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `& '${shim.replaceAll("'", "''")}' --version; exit $LASTEXITCODE`], {
    cwd: workdir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(shimResult.stdout.trim(), `xbot-cli ${manifest.version}`);
  function invoke(args, input) {
    const result = spawnSync(process.execPath, [launcher, ...args], {
      cwd: workdir, input, encoding: 'utf8', shell: false,
      env: { ...process.env, XBOT_SHELL_CLI: join(scratch, 'missing-backend.exe') },
    });
    assert.ifError(result.error);
    return result;
  }
  assert.equal(invoke(['--version']).stdout.trim(), `xbot-cli ${manifest.version}`);
  for (const args of [[], ['app']]) {
    const result = invoke(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
  }
  const error = invoke(['app', 'open', '--json']);
  assert.equal(error.status, 2);
  assert.equal(error.stdout, '');
  assert.equal(JSON.parse(error.stderr).error.code, 'BAD_ARGS');
  const discovery = invoke(['schema', 'flow', 'code', 'write']);
  assert.equal(JSON.parse(discovery.stdout).data.name, 'flow code write');
  const preview = invoke(['flow', 'code', 'write', 'main', '--file', '-', '--dry-run', '--json'], 'print("npm stdin")\n');
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).data.dry_run, true);
  const skill = invoke(['install', '--skills', '--json']);
  assert.equal(skill.status, 0, skill.stderr);
  assert.ok(existsSync(join(workdir, '.agents', 'skills', 'xbot-app-dev', 'SKILL.md')));
  assert.match(invoke(['guide', 'cli-contract']).stdout, /^# /);
  const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  console.log(`Package installation verified: ${relative(root, tarball)}`);
  console.log(`SHA256 ${digest}`);
} finally {
  const safeRoot = resolve(tmpdir());
  const target = resolve(scratch);
  if (!target.startsWith(`${safeRoot}\\`) || !target.includes('xbot-cli package test ')) {
    throw new Error(`Refusing to remove unexpected test directory: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}
