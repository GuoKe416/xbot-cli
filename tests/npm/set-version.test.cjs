'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, dirname, join } = require('node:path');
const { root, checkVersions } = require('../../scripts/common.cjs');
const { setVersion } = require('../../scripts/set-version.cjs');

const files = ['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock'];

function fixture(t) {
  const parent = fs.realpathSync(tmpdir());
  const directory = fs.mkdtempSync(join(parent, 'xbot-set-version-'));
  t.after(() => {
    const resolved = fs.realpathSync(directory);
    assert.equal(dirname(resolved), parent);
    assert.ok(basename(resolved).startsWith('xbot-set-version-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  for (const file of files) fs.copyFileSync(join(root, file), join(directory, file));
  return directory;
}

function snapshot(directory) {
  return Object.fromEntries(files.map(file => [file, fs.readFileSync(join(directory, file), 'utf8')]));
}

function jsonWithoutVersions(source, lock = false) {
  const value = JSON.parse(source);
  delete value.version;
  if (lock) delete value.packages[''].version;
  return value;
}

function replace(directory, file, change) {
  const path = join(directory, file);
  fs.writeFileSync(path, change(fs.readFileSync(path, 'utf8')));
}

test('release version updates all five version fields and preserves dependencies and formatting', t => {
  const directory = fixture(t);
  // A dependency with the same old version must remain unchanged.
  const old = JSON.parse(fs.readFileSync(join(directory, 'package.json'), 'utf8')).version;
  replace(directory, 'package-lock.json', source => {
    const lock = JSON.parse(source);
    lock.packages['node_modules/example'] = { version: old, integrity: 'unchanged' };
    return JSON.stringify(lock, null, 2) + '\n';
  });
  replace(directory, 'Cargo.lock', source => `${source}\n[[package]]\nname = "example"\nversion = "${old}"\n`);
  const before = snapshot(directory);
  const next = `${Number(old.split('.')[0]) + 1}.0.0`;
  assert.deepEqual(setVersion(next, directory), { previous: old, version: next, changed: true });
  checkVersions(directory);
  const after = snapshot(directory);
  assert.deepEqual(jsonWithoutVersions(after['package.json']), jsonWithoutVersions(before['package.json']));
  assert.deepEqual(jsonWithoutVersions(after['package-lock.json'], true), jsonWithoutVersions(before['package-lock.json'], true));
  assert.equal(after['Cargo.toml'].replace(`version = "${next}"`, `version = "${old}"`), before['Cargo.toml']);
  assert.equal(after['Cargo.lock'].replace(`name = "xbot-cli"\nversion = "${next}"`, `name = "xbot-cli"\nversion = "${old}"`).replace(`name = "xbot-cli"\r\nversion = "${next}"`, `name = "xbot-cli"\r\nversion = "${old}"`), before['Cargo.lock']);
  assert.deepEqual(fs.readdirSync(directory).sort(), [...files].sort());
});

test('invalid stable versions and downgrades leave every file unchanged', t => {
  const directory = fixture(t);
  const before = snapshot(directory);
  for (const version of ['v0.6.2', '0.6', '01.2.3', '1.2.3-beta.1', '1.2.3+build.1', '1.2.3\n', '9007199254740992.0.0', '0.0.0']) {
    assert.throws(() => setVersion(version, directory), /Version|Cannot decrease/);
    assert.deepEqual(snapshot(directory), before);
  }
});

test('an already synchronized version is a no-op', t => {
  const directory = fixture(t);
  const before = snapshot(directory);
  const version = JSON.parse(before['package.json']).version;
  assert.deepEqual(setVersion(version, directory), { previous: version, version, changed: false });
  assert.deepEqual(snapshot(directory), before);
});

test('stale npm or Cargo locks are rejected before writing', t => {
  for (const file of ['package-lock.json', 'Cargo.lock']) {
    const directory = fixture(t);
    replace(directory, file, source => file === 'Cargo.lock'
      ? source.replace(/(name = "xbot-cli"\r?\nversion = ")[^"]+/, '$10.0.0')
      : source.replace(/("version": ")[^"]+/, '$10.0.0'));
    const before = snapshot(directory);
    assert.throws(() => setVersion('99.0.0', directory), /version.*differs/);
    assert.deepEqual(snapshot(directory), before);
  }
});

test('duplicate root crate or version fields are rejected before writing', t => {
  for (const file of ['Cargo.lock', 'Cargo.toml']) {
    const directory = fixture(t);
    replace(directory, file, source => file === 'Cargo.lock'
      ? `${source}\n[[package]]\nname = "xbot-cli"\nversion = "0.0.0"\n`
      : source.replace(/^version = "([^"]+)"/m, '$&\nversion = "$1"'));
    const before = snapshot(directory);
    assert.throws(() => setVersion('99.0.0', directory), /exactly one/);
    assert.deepEqual(snapshot(directory), before);
  }
});

test('a failed file replacement rolls earlier replacements back and removes staging files', t => {
  const directory = fixture(t);
  const before = snapshot(directory);
  const renameSync = fs.renameSync;
  let replacements = 0;
  t.mock.method(fs, 'renameSync', (...args) => {
    if (++replacements === 2) throw new Error('simulated replacement failure');
    return renameSync(...args);
  });
  assert.throws(() => setVersion('99.0.0', directory), /simulated replacement failure/);
  assert.deepEqual(snapshot(directory), before);
  assert.deepEqual(fs.readdirSync(directory).sort(), [...files].sort());
});
