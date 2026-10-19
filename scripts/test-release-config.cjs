'use strict';

// Offline simulation using the same release-please version bundled in the Action.
// Install the test tooling outside the project, then pass that directory:
// npm install --prefix <temp-directory> --ignore-scripts --no-audit --no-fund release-please@17.3.0 ajv@8
// node scripts/test-release-config.cjs <temp-directory>
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
if (!process.argv[2]) throw new Error('Usage: node scripts/test-release-config.cjs <directory containing release-please 17.3.0 and ajv dependencies>');
const dependency = createRequire(resolve(process.argv[2], 'package.json'));
const { Manifest, setLogger } = dependency('release-please');
assert.equal(dependency('release-please/package.json').version, '17.3.0', 'Use the version bundled with the pinned Action');
const Ajv = dependency('ajv');
const toml = dependency('@iarna/toml');
const root = join(__dirname, '..');
const source = path => readFileSync(join(root, path), 'utf8');
const config = JSON.parse(source('release-please-config.json'));
const schema = dependency('release-please/schemas/config.json');
const validate = new Ajv({ strict: false, validateFormats: false }).compile(schema);
assert.equal(validate(config), true, JSON.stringify(validate.errors));
setLogger({ info() {}, warn() {}, debug() {}, trace() {}, error() {} });
const previous = JSON.parse(source('.release-please-manifest.json'))['.'];
const [major, minor, patch] = previous.split('.').map(Number);
const nextPatch = `${major}.${minor}.${patch + 1}`;
const nextMinor = `${major}.${minor + 1}.0`;
const nextBreaking = major === 0 ? nextMinor : `${major + 1}.0.0`;

async function simulate(message, expected) {
  let mergedPullRequest;
  const github = {
    repository: { owner: 'wn0x00', repo: 'xbot-cli', defaultBranch: 'main' },
    async getFileContentsOnBranch(path) { return { parsedContent: source(path) }; },
    async getFileJson(path) { return JSON.parse(source(path)); },
    async *releaseIterator() {
      yield { tagName: `v${previous}`, sha: 'previous', notes: 'Previous release' };
    },
    async *mergeCommitIterator() {
      yield { sha: 'newcommit', message, files: ['src/main.rs'] };
      yield { sha: 'previous', message: `chore: release ${previous}`, files: ['package.json'] };
    },
    async *pullRequestIterator() {
      if (mergedPullRequest) yield mergedPullRequest;
    },
  };
  const manifest = await Manifest.fromManifest(github, 'main');
  const candidates = await manifest.buildPullRequests();
  if (expected === null) {
    assert.equal(candidates.length, 0);
    console.log(`${message}: no release`);
    return;
  }
  assert.equal(candidates.length, 1);
  const pr = candidates[0];
  assert.equal(pr.headRefName, 'release-please--branches--main');
  assert.equal(pr.title.toString(), `chore(main): release ${expected}`);
  const files = {};
  for (const path of ['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock', '.release-please-manifest.json']) {
    const update = pr.updates.find(update => update.path === path);
    assert.ok(update, `missing release update for ${path}`);
    files[path] = update.updater.updateContent(source(path));
  }
  assert.equal(JSON.parse(files['package.json']).version, expected);
  const npmLock = JSON.parse(files['package-lock.json']);
  assert.equal(npmLock.version, expected);
  assert.equal(npmLock.packages[''].version, expected);
  assert.equal(toml.parse(files['Cargo.toml']).package.version, expected);
  assert.equal(JSON.parse(files['.release-please-manifest.json'])['.'], expected);
  const beforeLock = source('Cargo.lock');
  const expectedLock = beforeLock.replace(/(name = "xbot-cli"\r?\nversion = ")[^"]+/, (_, prefix) => prefix + expected);
  if (files['Cargo.lock'] !== expectedLock) {
    const actualLines = files['Cargo.lock'].split('\n');
    const expectedLines = expectedLock.split('\n');
    for (let index = 0; index < Math.max(actualLines.length, expectedLines.length); index++) {
      if (actualLines[index] !== expectedLines[index]) console.log('DIFF', index + 1, actualLines[index], expectedLines[index]);
    }
  }
  assert.equal(files['Cargo.lock'], expectedLock, 'Cargo.lock update must change only the xbot-cli version');
  const before = toml.parse(beforeLock).package.filter(crate => crate.name !== 'xbot-cli');
  const after = toml.parse(files['Cargo.lock']).package.filter(crate => crate.name !== 'xbot-cli');
  assert.deepEqual(after, before);
  assert.equal(toml.parse(files['Cargo.lock']).package.find(crate => crate.name === 'xbot-cli').version, expected);
  const mergeSha = '1234567890abcdef1234567890abcdef12345678';
  mergedPullRequest = {
    number: 1,
    title: pr.title.toString(),
    body: pr.body.toString(),
    headBranchName: pr.headRefName,
    baseBranchName: 'main',
    labels: pr.labels,
    files: pr.updates.map(update => update.path),
    sha: mergeSha,
  };
  const releases = await manifest.buildReleases();
  assert.equal(releases.length, 1, 'The generated PR must remain recognizable after merge');
  assert.equal(releases[0].tag.toString(), `v${expected}`);
  assert.equal(releases[0].sha, mergeSha, 'Release must point to the exact merged commit');
  assert.match(releases[0].notes, /Bug Fixes|Features|BREAKING CHANGES/);
  console.log(`${message}: ${expected}; five files synchronized; ${before.length} Cargo dependencies unchanged; merged PR resolves to v${expected} at the exact merge commit`);
}
(async () => {
  await simulate('fix(cli): repair argument validation', nextPatch);
  await simulate('feat(cli): add command discovery', nextMinor);
  await simulate('feat(cli)!: change output contract', nextBreaking);
  await simulate('docs: clarify agent usage', null);
  await simulate('chore(ci): configure release automation', null);
  console.log('Release Please 17.3.0 schema and actual manifest/updaters verified without GitHub mutations.');
})().catch(error => { console.error(error); process.exitCode = 1; });
