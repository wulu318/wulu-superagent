'use strict';

const path = require('path');

const config = require('../electron-builder.json');
const { BuildEnv } = require('./build-env.cjs');
const { readBuildKeyfrom } = require('./build-keyfrom.cjs');

// Opt-in web installer (small NSIS stub that downloads the app package from a
// CDN at install time). Default builds are full offline installers; nothing
// changes unless wulu_WEB_INSTALLER=1 is set explicitly.
const WEB_INSTALLER_ENV = BuildEnv.WebInstaller;
const WEB_PKG_BASE_URL_ENV = BuildEnv.WebPkgBaseUrl;
const WEB_PKG_URL_ENV = BuildEnv.WebPkgUrl;

function isWebInstallerEnabled() {
  const value = (process.env[WEB_INSTALLER_ENV] || '').trim().toLowerCase();
  return value === '1' || value === 'true';
}

// Name of the .nsis.7z app package that electron-builder produces; fixed as
// <productName>-<version>-x64.nsis.7z.
function expectedPackageFileName() {
  const version = require('../package.json').version;
  return `${config.productName}-${version}-x64.nsis.7z`;
}

// Returns the complete package download URL baked into the web installer.
// Requires the app-builder-lib patch (patches/app-builder-lib+*.patch) that
// makes an explicit appPackageUrl be used verbatim instead of being treated
// as a directory to which the package file name is appended.
function resolveWebPackageUrl(keyfrom) {
  // Mode 1: exact package URL, for upload-first flows where object storage
  // assigns a random path/name (e.g. NOS). Used verbatim; must be a permanent
  // public link.
  const fullUrl = (process.env[WEB_PKG_URL_ENV] || '').trim().replace(/\/+$/, '');
  if (fullUrl) {
    if (fullUrl.includes('?')) {
      throw new Error(
        `[WebInstaller] ${WEB_PKG_URL_ENV} must be a permanent public URL without query parameters; ` +
          'signed/expiring links cannot be baked into the installer.',
      );
    }
    return fullUrl;
  }

  // Mode 2: pre-agreed CDN directory. The keyfrom marker is baked into the app
  // package (extraResources), so each channel gets its own subdirectory, and
  // the fixed package file name completes the URL.
  const raw = (process.env[WEB_PKG_BASE_URL_ENV] || '').trim().replace(/\/+$/, '');
  if (!raw) {
    throw new Error(
      `[WebInstaller] either ${WEB_PKG_URL_ENV} (exact package URL from object storage) or ` +
        `${WEB_PKG_BASE_URL_ENV} (CDN base directory, e.g. https://cdn.example.com/wulu/win) ` +
        `is required when ${WEB_INSTALLER_ENV}=1.`,
    );
  }
  return `${raw}/${keyfrom}/${expectedPackageFileName()}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function resourceKey(resource) {
  if (typeof resource === 'string') return `string:${resource}`;
  return `${resource?.from || ''}->${resource?.to || ''}`;
}

function mergeExtraResources(platformName) {
  const baseResources = asArray(config.extraResources);
  const platformConfig = config[platformName] || {};
  const platformResources = asArray(platformConfig.extraResources);
  const merged = [];
  const seen = new Set();

  for (const resource of [...baseResources, ...platformResources]) {
    const key = resourceKey(resource);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(resource);
  }

  config[platformName] = {
    ...platformConfig,
    extraResources: merged,
  };
}

const keyfrom = readBuildKeyfrom();

// CI secrets that are unset expand to empty strings, and app-builder-lib's
// getCscLink() treats an empty CSC_LINK/WIN_CSC_LINK as a real value and
// later fails with "cannot resolve ... not a file". Strip empty signing
// envs before electron-builder reads them; ad-hoc/unsigned fallbacks in
// this config take over from there.
for (const signEnv of ['CSC_LINK', 'WIN_CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD']) {
  const value = process.env[signEnv];
  if (value != null && value.trim() === '') {
    delete process.env[signEnv];
  }
}

for (const platformName of ['mac', 'win', 'linux']) {
  mergeExtraResources(platformName);
}

// Sign every Windows binary electron-builder produces (wulu.exe, the
// uninstaller, the installer) through the internal Youdao signing service,
// not just the final Setup.exe: the unsigned inner exe is what security
// software freezes on first execution. The hook skips with a warning when
// YD_SIGN_* credentials are absent, so local packaging still works.
config.win = {
  ...config.win,
  sign: path.join(__dirname, 'win-sign.cjs'),
};

// macOS builds use ad-hoc signing by default: there is no Apple Developer
// certificate in CI, and an ad-hoc signature keeps the app structurally
// valid on Apple Silicon while avoiding a hard failure at package time.
// Once real Developer ID certs are configured (CSC_LINK/CSC_KEY_PASSWORD
// or Apple notarization credentials), this fallback is ignored and the
// app is properly signed and notarized.
if (!process.env.CSC_LINK && !process.env.APPLE_ID && !process.env.CSC_NAME) {
  console.log('[electron-builder-config] No Apple signing identity found; using ad-hoc signature for macOS.');
  config.mac = {
    ...(config.mac || {}),
    identity: null,
  };
  // electron-builder signs the .app inside the DMG by default; with
  // ad-hoc signing the DMG must not carry a detached signature either.
  config.dmg = {
    ...(config.dmg || {}),
    sign: false,
  };
} else {
  console.log('[electron-builder-config] Apple signing identity detected; signing macOS build.');
}

delete config.extraResources;

config.dmg = {
  ...(config.dmg || {}),
  artifactName: `WULU-darwin-\${arch}-\${version}-${keyfrom}.\${ext}`,
};

config.nsis = {
  ...(config.nsis || {}),
  artifactName: `WULU-Setup-\${arch}-\${version}-${keyfrom}.\${ext}`,
};

// Linux artifacts use explicit ASCII names so AppImage/deb/rpm filenames do
// not contain the Chinese productName. Non-ASCII filenames break the
// softprops/action-gh-release asset-metadata API (404 on update) during the
// nightly release upload.
config.linux = {
  ...(config.linux || {}),
  artifactName: `WULU-\${version}-\${arch}.\${ext}`,
};

// Tag-triggered CI builds must not enter electron-builder's publish mode:
// when a git tag is present electron-builder infers a GitHub publish target
// and requires GH_TOKEN ("GitHub Personal Access Token is not set" hard
// failure). Publishing is owned by the workflow's create-release /
// auto-publish steps, so disable it here explicitly.
config.publish = null;

if (isWebInstallerEnabled()) {
  // Build the web installer alongside the full one: both targets share the
  // same intermediate .nsis.7z app package, so the extra cost is one more
  // makensis run. nsisWeb inherits every option from the nsis block.
  config.win = {
    ...config.win,
    target: ['nsis', 'nsis-web'],
  };
  config.nsisWeb = {
    appPackageUrl: resolveWebPackageUrl(keyfrom),
    artifactName: `wulu-WebSetup-\${arch}-\${version}-${keyfrom}.\${ext}`,
  };
  console.log(`[WebInstaller] nsis-web target enabled, app package url: ${config.nsisWeb.appPackageUrl}`);
}

console.log(`[Keyfrom] configured artifact keyfrom as ${keyfrom}`);

module.exports = config;
