const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compareVersions, releaseAssetsPayload, releasePatchPayload } = require('./publish-release.cjs');

const assets = [
  'WULU-Setup-x64-2026.10.28-official.exe',
  'WULU-darwin-arm64-2026.10.28-official.dmg',
  'WULU-2026.10.28-x86_64.AppImage',
  'WULU-2026.10.28-arm64.AppImage',
].map(name => ({ name, digest: `sha256:${'a'.repeat(64)}`, size: 1234, browser_download_url: `https://github.com/example/${name}` }));

test('synchronizes all four installers with their actual asset hashes and sizes', () => {
  const payload = releaseAssetsPayload({ assets, draft: false, prerelease: false });
  for (const platform of ['windows_x64', 'mac_arm', 'linux_x64', 'linux_arm64']) {
    assert.equal(payload[`${platform}_size`], '1234');
    assert.equal(payload[`${platform}_sha256`], 'a'.repeat(64));
  }
  assert.match(payload.windows_x64_url, /Setup-x64/);
  assert.match(payload.linux_arm64_url, /arm64\.AppImage/);
});

test('does not activate a release with missing installers or missing hashes', () => {
  assert.throws(() => releaseAssetsPayload({ assets: assets.slice(1) }), /Missing installer/);
  assert.throws(() => releaseAssetsPayload({ assets: assets.map(a => ({ ...a, digest: null })) }), /SHA256/);
});

test('does not synchronize drafts or preview builds to stable updates', () => {
  assert.throws(() => releaseAssetsPayload({ assets, draft: true }), /stable/);
  assert.throws(() => releaseAssetsPayload({ assets, prerelease: true }), /stable/);
});

test('compares calendar versions numerically when finding patch bases', () => {
  assert.equal(compareVersions('2026.10.13', '2026.9.2'), 1);
  assert.equal(compareVersions('2026.10.13', '2026.10.13'), 0);
  assert.equal(compareVersions('2026.10.2', '2026.10.13'), -1);
});

test('only registers a patch whose release asset matches platform, base, size and hash', () => {
  const name = 'WULU-patch-win32-x64-2026.10.29-to-2026.10.30.zip';
  const patch = { name, baseVersion: '2026.10.29', size: 42, sha256: 'a'.repeat(64) };
  const release = { assets: [{ name, size: 42, digest: `sha256:${patch.sha256}`, browser_download_url: 'https://github.com/example/patch.zip' }] };
  const metadata = { protocol: 2, platform: 'win32-x64', version: '2026.10.30', patch };
  assert.equal(releasePatchPayload(release, metadata, metadata.version).incremental_platform, 'win32-x64');
  assert.throws(() => releasePatchPayload(release, { ...metadata, platform: 'darwin-arm64' }, metadata.version), /metadata/);
  assert.throws(() => releasePatchPayload(release, { ...metadata, patch: { ...patch, sha256: 'b'.repeat(64) } }, metadata.version), /integrity/);
  assert.equal(releasePatchPayload(release, { ...metadata, patch: undefined }, metadata.version).incremental_url, '');
});

test('compatibility fingerprint includes native resources and excludes only the asar and metadata', async t => {
  const fs = require('fs'), path = require('path'), os = require('os');
  const { writeCompatibility, compatibleBase } = require('./build-update-patch.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wulu-compatibility-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, 'app.asar'), 'old app');
  fs.writeFileSync(path.join(directory, 'runtime.bin'), 'runtime 1');
  const old = await writeCompatibility(directory, '40.2.1');
  fs.writeFileSync(path.join(directory, 'app.asar'), 'new app');
  const current = await writeCompatibility(directory, '40.2.1');
  assert.deepEqual(current, old);
  assert.equal(compatibleBase({ ...current, version: '2026.10.30' }, { ...old, version: '2026.10.29' }), true);
  fs.writeFileSync(path.join(directory, 'runtime.bin'), 'runtime 2');
  const changed = await writeCompatibility(directory, '40.2.1');
  assert.notEqual(changed.resourceFingerprint, old.resourceFingerprint);
  assert.equal(compatibleBase({ ...changed, version: '2026.10.30' }, { ...old, version: '2026.10.29' }), false);
  assert.equal(compatibleBase({ ...current, version: '2026.10.30' }, { version: '2026.10.13' }), false);
});

test('runtime tar timestamps do not prevent a compatible patch, but file changes do', async t => {
  const fs = require('fs'), path = require('path'), os = require('os'), tar = require('tar');
  const { digestTar } = require('./build-update-patch.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wulu-tar-fingerprint-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'runtime.js'); fs.writeFileSync(file, 'same runtime');
  const first = path.join(directory, 'first.tar'), second = path.join(directory, 'second.tar');
  await tar.c({ file: first, cwd: directory, mtime: new Date('2026-01-01') }, ['runtime.js']);
  await tar.c({ file: second, cwd: directory, mtime: new Date('2026-10-30') }, ['runtime.js']);
  assert.equal(await digestTar(first), await digestTar(second));
  fs.writeFileSync(file, 'changed runtime');
  await tar.c({ file: second, cwd: directory }, ['runtime.js']);
  assert.notEqual(await digestTar(first), await digestTar(second));
});
