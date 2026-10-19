'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { root, checkVersions } = require('./common.cjs');

const files = ['package.json', 'package-lock.json', 'Cargo.toml', 'Cargo.lock'];

function parseVersion(version) {
  if (typeof version !== 'string' || version !== version.trim() || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Version must be a stable X.Y.Z version, for example 0.6.2 (without v).');
  }
  const parts = version.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) throw new Error('Version numbers are too large.');
  return parts;
}

function replaceVersion(section, version, label) {
  const matches = [...section.matchAll(/^(version\s*=\s*")[^"]+("[^\r\n]*)$/gm)];
  if (matches.length !== 1) throw new Error(`${label} must contain exactly one version field.`);
  return section.replace(matches[0][0], `${matches[0][1]}${version}${matches[0][2]}`);
}

function updateCargoManifest(source, version) {
  const sections = source.split(/(?=^\[)/m);
  const indices = sections.flatMap((section, index) => /^\[package\][ \t]*\r?\n/.test(section) ? [index] : []);
  if (indices.length !== 1) throw new Error('Cargo.toml must contain exactly one [package] section.');
  const index = indices[0];
  sections[index] = replaceVersion(sections[index], version, 'Cargo.toml [package]');
  return sections.join('');
}

function updateCargoLock(source, version) {
  const sections = source.split(/(?=^\[\[package\]\])/m);
  const indices = sections.flatMap((section, index) => /^name\s*=\s*"xbot-cli"[ \t]*\r?$/m.test(section) ? [index] : []);
  if (indices.length !== 1) throw new Error('Cargo.lock must contain exactly one xbot-cli package.');
  const index = indices[0];
  sections[index] = replaceVersion(sections[index], version, 'Cargo.lock xbot-cli');
  return sections.join('');
}

function serializeJson(value, original) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const indentation = original.match(/\r?\n([ \t]+)"/)?.[1] || 2;
  return JSON.stringify(value, null, indentation).replace(/\n/g, newline) + (/\r?\n$/.test(original) ? newline : '');
}

function setVersion(version, projectRoot = root) {
  const next = parseVersion(version);
  checkVersions(projectRoot);
  const originals = new Map(files.map(file => [file, fs.readFileSync(join(projectRoot, file), 'utf8')]));
  const pkg = JSON.parse(originals.get('package.json'));
  if (pkg.name !== '@guanzhu.me/xbot-cli') throw new Error('package.json name must be @guanzhu.me/xbot-cli.');
  const current = parseVersion(pkg.version);
  const changedPart = next.findIndex((part, index) => part !== current[index]);
  if (changedPart === -1) return { previous: pkg.version, version, changed: false };
  if (next[changedPart] < current[changedPart]) throw new Error(`Cannot decrease version from ${pkg.version} to ${version}.`);

  const previous = pkg.version;
  pkg.version = version;
  const lock = JSON.parse(originals.get('package-lock.json'));
  lock.version = version;
  lock.packages[''].version = version;
  const updated = new Map([
    ['package.json', serializeJson(pkg, originals.get('package.json'))],
    ['package-lock.json', serializeJson(lock, originals.get('package-lock.json'))],
    ['Cargo.toml', updateCargoManifest(originals.get('Cargo.toml'), version)],
    ['Cargo.lock', updateCargoLock(originals.get('Cargo.lock'), version)],
  ]);

  // Prepare every replacement before changing a tracked file. Keep the original
  // contents until all replacements and the final consistency check succeed.
  const staged = new Map();
  const committed = [];
  try {
    for (const [file, contents] of updated) {
      const path = join(projectRoot, file);
      const temporary = `${path}.${randomUUID()}.tmp`;
      staged.set(file, temporary);
      fs.writeFileSync(temporary, contents, { flag: 'wx', mode: fs.statSync(path).mode });
    }
    for (const [file, original] of originals) {
      if (fs.readFileSync(join(projectRoot, file), 'utf8') !== original) {
        throw new Error(`${file} changed while preparing the version update; retry after saving your edits.`);
      }
    }
    for (const file of files) {
      fs.renameSync(staged.get(file), join(projectRoot, file));
      committed.push(file);
    }
    checkVersions(projectRoot);
  } catch (error) {
    const failures = [];
    for (const file of committed) {
      try {
        fs.writeFileSync(join(projectRoot, file), originals.get(file));
      } catch (rollbackError) {
        failures.push(`${file}: ${rollbackError.message}`);
      }
    }
    if (failures.length) throw new Error(`${error.message}\nRollback failed; restore these files from Git: ${failures.join('; ')}`, { cause: error });
    throw error;
  } finally {
    for (const temporary of staged.values()) fs.rmSync(temporary, { force: true });
  }
  return { previous, version, changed: true };
}

function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Usage: npm run release:version -- <X.Y.Z>\n\nSynchronize the npm and Rust manifests and lockfiles for a stable release.\nExample: npm run release:version -- 0.6.2\n\nExisting versions must agree. Downgrades and prereleases are rejected.\nThis command does not create a commit or tag, or publish anything.');
    return;
  }
  if (args.length !== 1) throw new Error('Usage: npm run release:version -- <X.Y.Z> (use --help for details).');
  const result = setVersion(args[0]);
  console.log(result.changed
    ? `Updated npm and Rust versions: ${result.previous} -> ${result.version}. Review and commit the changes before tagging v${result.version}.`
    : `Version ${result.version} is already synchronized; no files changed.`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { setVersion };
