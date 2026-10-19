'use strict';

const { readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { nativePath, manifest, run, checkVersions } = require('./common.cjs');

checkVersions();
const pe = readFileSync(nativePath);
const binaryText = pe.toString('latin1').toLowerCase();
for (const localPath of [homedir(), homedir().replaceAll('\\', '/')]) {
  if (binaryText.includes(localPath.toLowerCase())) throw new Error('Executable contains an unremapped build user path.');
}
const offset = pe.readUInt32LE(0x3c);
if (pe.toString('ascii', 0, 2) !== 'MZ' || pe.toString('ascii', offset, offset + 4) !== 'PE\0\0' || pe.readUInt16LE(offset + 4) !== 0x8664) {
  throw new Error('Packaged executable must be a Windows AMD64 PE binary.');
}
const version = run(nativePath, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).stdout.trim();
if (version !== `xbot-cli ${manifest.version}`) throw new Error(`Stale executable: ${version}`);
console.log(`Verified xbot-cli ${manifest.version} Windows x64 binary`);
