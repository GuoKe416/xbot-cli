'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdirSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { deflateRawSync } = require('node:zlib');
const { root, manifest: pkg, nativePath, checkVersions } = require('./common.cjs');

const directory = join(root, 'dist', 'release');
const packageFilename = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`;
const zipFilename = `xbot-cli-${pkg.version}-windows-x64.zip`;
const assetNames = [packageFilename, zipFilename, 'SHA256SUMS.txt'];
const digest = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding);

function git(args, projectRoot = root) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function validate(projectRoot = root, env = process.env) {
  checkVersions(projectRoot);
  const source = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(source.name, '@guanzhu.me/xbot-cli', 'Unexpected npm package');
  assert.equal(env.GITHUB_REPOSITORY, 'wn0x00/xbot-cli', 'Unexpected GitHub repository');
  assert.match(source.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Only stable releases may use the latest npm tag');
  assert.equal(env.GITHUB_REF_TYPE, 'tag', 'Publishing requires a version tag');
  assert.equal(env.GITHUB_REF_NAME, `v${source.version}`, 'Tag and package version differ');
  const repository = typeof source.repository === 'string' ? source.repository : source.repository?.url;
  assert.equal(repository?.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, ''),
    `https://github.com/${env.GITHUB_REPOSITORY}`, 'package.json repository differs');
  const commit = git(['rev-parse', 'HEAD'], projectRoot);
  assert.equal(git(['rev-parse', `refs/tags/v${source.version}^{commit}`], projectRoot), commit, 'Checkout differs from release tag');
  assert.equal(env.GITHUB_SHA, commit, 'Workflow source differs from release tag');
  git(['merge-base', '--is-ancestor', commit, 'refs/remotes/origin/main'], projectRoot);
  return commit;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Fixed timestamps and attributes make retrying a build independent of checkout times.
function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, data] of entries) {
    assert.match(name, /^[\w.-]+$/, 'Release ZIP entries must be plain filenames');
    const filename = Buffer.from(name);
    const compressed = deflateRawSync(data, { level: 9 });
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); // DOS date: 1980-01-01.
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    header.copy(central, 6, 4, 30);
    central.writeUInt32LE(offset, 42);
    localParts.push(header, filename, compressed);
    centralParts.push(central, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function prepare() {
  const commit = validate();
  mkdirSync(directory, { recursive: true });
  const tarball = readFileSync(join(root, 'dist', packageFilename));
  writeFileSync(join(directory, packageFilename), tarball);
  writeFileSync(join(directory, zipFilename), zip([
    ['xbot-cli.exe', readFileSync(nativePath)],
    ['README.md', readFileSync(join(root, 'README.md'))],
    ['LICENSE', readFileSync(join(root, 'LICENSE'))],
  ]));
  writeFileSync(join(directory, 'SHA256SUMS.txt'), assetNames.slice(0, 2)
    .map(name => `${digest(readFileSync(join(directory, name)))}  ${name}\n`).join(''));
  const release = {
    schema: 1,
    name: pkg.name,
    version: pkg.version,
    tag: `v${pkg.version}`,
    repository: process.env.GITHUB_REPOSITORY,
    commit,
    npm: { filename: packageFilename, integrity: `sha512-${digest(tarball, 'sha512', 'base64')}` },
    assets: assetNames.map(name => {
      const data = readFileSync(join(directory, name));
      return { name, size: data.length, sha256: digest(data) };
    }),
  };
  const content = `${JSON.stringify(release, null, 2)}\n`;
  writeFileSync(join(directory, 'release-manifest.json'), content);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `manifest_sha256=${digest(content)}\n`);
  console.log(`Prepared ${release.tag}: ${assetNames.join(', ')}`);
  return release;
}

function verify() {
  const content = readFileSync(join(directory, 'release-manifest.json'));
  assert.match(process.env.RELEASE_MANIFEST_SHA256 || '', /^[a-f0-9]{64}$/, 'Expected build manifest checksum is required');
  assert.equal(digest(content), process.env.RELEASE_MANIFEST_SHA256, 'Build manifest checksum mismatch');
  const release = JSON.parse(content);
  assert.equal(release.schema, 1);
  assert.equal(release.name, pkg.name);
  assert.equal(release.version, pkg.version);
  assert.equal(release.tag, process.env.GITHUB_REF_NAME);
  assert.equal(release.repository, process.env.GITHUB_REPOSITORY);
  assert.equal(release.commit, process.env.GITHUB_SHA);
  assert.equal(release.npm.filename, packageFilename);
  assert.deepEqual(release.assets.map(asset => asset.name).sort(), [...assetNames].sort());
  for (const asset of release.assets) {
    const data = readFileSync(join(directory, asset.name));
    assert.equal(data.length, asset.size, `${asset.name}: size mismatch`);
    assert.equal(digest(data), asset.sha256, `${asset.name}: checksum mismatch`);
  }
  assert.equal(release.npm.integrity,
    `sha512-${digest(readFileSync(join(directory, packageFilename)), 'sha512', 'base64')}`, 'npm integrity mismatch');
  return release;
}

if (require.main === module) {
  try {
    const action = { validate, prepare, verify }[process.argv[2]];
    assert.ok(action, 'Usage: node scripts/release-artifacts.cjs validate|prepare|verify');
    action();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { digest, crc32, zip, validate, prepare, verify, directory };
