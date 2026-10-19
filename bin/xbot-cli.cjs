#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  process.stderr.write('xbot-cli currently supports Windows x64 with ShadowBot installed.\n');
  process.exit(1);
}

// Preserve stdin, terminal detection, output streams, cwd and argument boundaries.
const executable = join(__dirname, '..', 'native', 'win32-x64', 'xbot-cli.exe');
const result = spawnSync(executable, process.argv.slice(2), {
  stdio: 'inherit',
  shell: false,
  windowsHide: true,
});
if (result.error) {
  process.stderr.write(`Unable to start xbot-cli (${result.error.code}). Reinstall the npm package.\n`);
  process.exit(1);
}
process.exit(result.status ?? (result.signal === 'SIGINT' ? 130 : 1));
