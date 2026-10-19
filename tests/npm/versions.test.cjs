'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { root, checkVersions } = require('../../scripts/common.cjs');

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'xbot-version-contract-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const file of ['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock']) {
    writeFileSync(join(directory, file), readFileSync(join(root, file)));
  }
  return directory;
}

test('build accepts synchronized npm and Rust versions with unrelated dependency versions', () => {
  assert.doesNotThrow(() => checkVersions());
});

test('build rejects a stale Rust lockfile even when both manifests agree', t => {
  const directory = fixture(t);
  const path = join(directory, 'Cargo.lock');
  writeFileSync(path, readFileSync(path, 'utf8').replace(
    /(name = "xbot-cli"\r?\nversion = ")[^"]+/, '$10.0.0',
  ));
  assert.throws(() => checkVersions(directory), /Cargo\.lock version 0\.0\.0 differs/);
});

test('build rejects a missing or duplicate root crate in Cargo.lock', t => {
  const directory = fixture(t);
  const path = join(directory, 'Cargo.lock');
  const original = readFileSync(path, 'utf8');
  writeFileSync(path, original.replace('name = "xbot-cli"', 'name = "another-crate"'));
  assert.throws(() => checkVersions(directory), /exactly one xbot-cli/);
  writeFileSync(path, `${original}\n[[package]]\nname = "xbot-cli"\nversion = "0.0.0"\n`);
  assert.throws(() => checkVersions(directory), /exactly one xbot-cli/);
});

test('build rejects stale npm lockfile versions and a different npm scope', t => {
  const directory = fixture(t);
  const path = join(directory, 'package-lock.json');
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  lock.packages[''].version = '0.0.0';
  writeFileSync(path, JSON.stringify(lock));
  assert.throws(() => checkVersions(directory), /package-lock.json version differs/);
  lock.packages[''].version = lock.version;
  lock.name = '@wrong/xbot-cli';
  writeFileSync(path, JSON.stringify(lock));
  assert.throws(() => checkVersions(directory), /package-lock.json name differs/);
});
