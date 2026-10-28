const assert = require('node:assert/strict');
const { test } = require('node:test');
const { compareVersions, releaseAssetsPayload } = require('./publish-release.cjs');

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
