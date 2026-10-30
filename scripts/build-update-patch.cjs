'use strict';
// An asar patch is only compatible when Electron and every external resource
// are identical. Native modules, Python, skills and OpenClaw require a full
// installer when they change. Never guess compatibility for older releases.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { compareVersions, buildIncrementalPatch } = require('./publish-release.cjs');

const METADATA = 'WULU-update-win32-x64.json';
const COMPATIBILITY = 'wulu-update-compatibility.json';
const PLATFORM = 'win32-x64';

async function digestFile(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function digestTar(filename) {
  const entries = [];
  // Tar headers contain checkout/build timestamps. Compare the installed
  // paths, modes, link targets and file contents rather than those timestamps.
  await require('tar').t({ file: filename, onReadEntry(entry) {
    const hash = crypto.createHash('sha256');
    entry.on('data', chunk => hash.update(chunk));
    entry.on('end', () => entries.push([entry.path, entry.type, entry.mode & 0o777, entry.linkpath || '', hash.digest('hex')]));
  } });
  entries.sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  return crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

async function writeCompatibility(resources, electronVersion) {
  const hash = crypto.createHash('sha256').update(`electron:${electronVersion}\n`);
  async function walk(directory, relative = '') {
    for (const name of (await fs.promises.readdir(directory)).sort()) {
      if (!relative && (name === 'app.asar' || name === COMPATIBILITY)) continue;
      const filename = path.join(directory, name), key = relative ? `${relative}/${name}` : name;
      const stat = await fs.promises.lstat(filename);
      if (stat.isSymbolicLink()) throw new Error(`Unsupported linked update resource: ${key}`);
      if (stat.isDirectory()) await walk(filename, key);
      else if (stat.isFile()) hash.update(`${key}\0${await (name.endsWith('.tar') ? digestTar(filename) : digestFile(filename))}\n`);
    }
  }
  await walk(resources);
  const metadata = { protocol: 2, platform: PLATFORM, resourceFingerprint: hash.digest('hex') };
  fs.writeFileSync(path.join(resources, COMPATIBILITY), JSON.stringify(metadata));
  return metadata;
}

function compatibleBase(current, previous) {
  return previous?.protocol === 2 && previous.platform === PLATFORM
    && previous.resourceFingerprint === current.resourceFingerprint
    && compareVersions(previous.version, current.version) < 0;
}

async function main() {
  const root = path.resolve(process.argv[2] || 'release/win-unpacked');
  const version = require('../package.json').version;
  const resources = path.join(root, 'resources');
  const metadata = JSON.parse(fs.readFileSync(path.join(resources, COMPATIBILITY), 'utf8'));
  metadata.version = version;
  metadata.asarSha256 = await digestFile(path.join(resources, 'app.asar'));
  const output = path.resolve('release');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wulu-patch-base-'));
  try {
    const releases = JSON.parse(execFileSync('gh', ['release', 'list', '--repo', 'wulu318/wulu-superagent', '--limit', '20', '--json', 'tagName,isPrerelease,isDraft'], { encoding: 'utf8' }));
    const previous = releases.filter(r => !r.isDraft && !r.isPrerelease && /^v\d+\.\d+\.\d+$/.test(r.tagName) && compareVersions(r.tagName.slice(1), version) < 0)
      .sort((a, b) => compareVersions(b.tagName.slice(1), a.tagName.slice(1)))[0];
    if (previous) {
      let base;
      try {
        execFileSync('gh', ['release', 'download', previous.tagName, '--repo', 'wulu318/wulu-superagent', '--pattern', METADATA, '--dir', temporary], { stdio: ['ignore', 'ignore', 'pipe'] });
        base = JSON.parse(fs.readFileSync(path.join(temporary, METADATA), 'utf8'));
      } catch { console.log('[Patch] Previous release has no verified compatibility metadata; full installer required.'); }
      if (base && base.version === previous.tagName.slice(1) && compatibleBase(metadata, base)) {
        const patch = await buildIncrementalPatch(path.join(resources, 'app.asar'), version, base.version, metadata);
        const name = `WULU-patch-${PLATFORM}-${base.version}-to-${version}.zip`;
        fs.renameSync(patch.path, path.join(output, name));
        metadata.patch = { name, baseVersion: base.version, size: patch.size, sha256: patch.sha256 };
        console.log(`[Patch] Generated ${name}`);
      } else if (base) console.log('[Patch] External resources changed; full installer required.');
    }
    fs.writeFileSync(path.join(output, METADATA), JSON.stringify(metadata, null, 2));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (require.main === module) main().catch(error => { console.error('[Patch]', error.message); process.exitCode = 1; });
module.exports = { writeCompatibility, compatibleBase, digestFile, digestTar, METADATA, COMPATIBILITY, PLATFORM };
