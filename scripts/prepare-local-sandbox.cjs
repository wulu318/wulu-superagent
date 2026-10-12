'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'resources', 'sandbox');
fs.mkdirSync(destination, { recursive: true });

if (process.platform === 'linux') {
  try {
    const binary = execFileSync('sh', ['-c', 'command -v bwrap || command -v bubblewrap'], { encoding: 'utf8' }).trim();
    if (binary) fs.copyFileSync(binary, path.join(destination, 'bwrap'));
  } catch {
    console.warn('[sandbox] bwrap is unavailable; Linux package will require a system installation.');
  }
}

if (process.platform === 'win32') {
  const helper = process.env.WULU_SANDBOX_HELPER;
  if (helper && fs.existsSync(helper)) fs.copyFileSync(helper, path.join(destination, 'wulu-sandbox.exe'));
}

console.log(`[sandbox] prepared resources in ${destination}`);
