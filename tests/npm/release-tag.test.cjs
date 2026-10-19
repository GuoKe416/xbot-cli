'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync, realpathSync } = require('node:fs');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { validate } = require('../../scripts/release-artifacts.cjs');

function fixture(t, annotated = true) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'xbot-release-tag-'));
  t.after(() => {
    const target = realpathSync(root);
    assert.equal(dirname(target), parent);
    assert.ok(basename(target).startsWith('xbot-release-tag-'));
    rmSync(target, { recursive: true, force: true });
  });
  function git(...args) {
    const result = spawnSync('git', [
      '-c', 'user.name=Release Test', '-c', 'user.email=release-test@example.invalid',
      '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args,
    ], { cwd: root, encoding: 'utf8', shell: false });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  const pkg = { name: '@guanzhu.me/xbot-cli', version: '0.6.2', repository: { url: 'git+https://github.com/wn0x00/xbot-cli.git' } };
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, packages: { '': { name: pkg.name, version: pkg.version } } }));
  writeFileSync(join(root, 'Cargo.toml'), '[package]\nname = "xbot-cli"\nversion = "0.6.2"\n');
  writeFileSync(join(root, 'Cargo.lock'), 'version = 4\n\n[[package]]\nname = "xbot-cli"\nversion = "0.6.2"\n');
  git('init', '--initial-branch=main');
  git('add', '.');
  git('commit', '-m', 'chore: prepare test release');
  const sha = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', sha);
  git('tag', ...(annotated ? ['-a', 'v0.6.2', '-m', 'Release v0.6.2'] : ['v0.6.2']));
  const env = {
    GITHUB_REPOSITORY: 'wn0x00/xbot-cli', GITHUB_REF_TYPE: 'tag',
    GITHUB_REF_NAME: 'v0.6.2', GITHUB_SHA: sha,
  };
  return { root, git, sha, env };
}

test('manual annotated and lightweight version tags resolve to the main commit', t => {
  for (const annotated of [true, false]) {
    const { root, git, sha, env } = fixture(t, annotated);
    git('checkout', '--detach', 'v0.6.2');
    assert.equal(validate(root, env), sha);
  }
});

test('branch dispatch, wrong version, repository and workflow SHA cannot publish', t => {
  const { root, env } = fixture(t);
  for (const [overrides, error] of [
    [{ GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' }, /requires a version tag/],
    [{ GITHUB_REF_NAME: 'v0.6.3' }, /Tag and package version differ/],
    [{ GITHUB_REF_NAME: 'v0.6.2-beta.1' }, /Tag and package version differ/],
    [{ GITHUB_REPOSITORY: 'someone/xbot-cli' }, /Unexpected GitHub repository/],
    [{ GITHUB_SHA: '0'.repeat(40) }, /Workflow source differs/],
  ]) assert.throws(() => validate(root, { ...env, ...overrides }), error);
});

test('a version tag outside origin/main is rejected even when all versions agree', t => {
  const { root, git, env } = fixture(t);
  git('checkout', '-b', 'unmerged-feature');
  git('commit', '--allow-empty', '-m', 'unmerged change');
  const sha = git('rev-parse', 'HEAD');
  // Only this isolated fixture tag is moved to create the invalid history.
  git('tag', '-f', 'v0.6.2');
  assert.throws(() => validate(root, { ...env, GITHUB_SHA: sha }), /merge-base.*failed/);
});

test('checkout and lockfile drift are rejected before publication', t => {
  const { root, git, env } = fixture(t);
  git('commit', '--allow-empty', '-m', 'after the tag');
  assert.throws(() => validate(root, { ...env, GITHUB_SHA: git('rev-parse', 'HEAD') }), /Checkout differs/);
  git('checkout', '--detach', 'v0.6.2');
  writeFileSync(join(root, 'Cargo.lock'), 'version = 4\n\n[[package]]\nname = "xbot-cli"\nversion = "0.6.1"\n');
  assert.throws(() => validate(root, env), /Cargo.lock version/);
});
