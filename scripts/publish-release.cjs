'use strict';

/**
 * WULU 全自动发布脚本
 *
 * 用法：
 *   node scripts/publish-release.cjs <version> [--asar <path-to-app.asar>] [--upload-only]
 *
 * 功能：
 *   1. 从 GitHub Releases 获取各平台安装包下载地址（或从本地 release/ 目录上传）
 *   2. 自动生成增量包（新版本 app.asar 压缩为 patch zip）
 *   3. 调用后端 admin API 自动创建/更新版本记录（全自动填下载地址 + 增量包）
 *
 * 环境变量：
 *   WULU_BACKEND_URL  后端地址（默认 https://ai.005656.xyz）
 *   WULU_ADMIN_EMAIL  管理员邮箱（默认 ai@ai.005656.xyz）
 *   WULU_ADMIN_PASS   管理员密码
 *   WULU_SKIP_UPLOAD  跳过文件上传（只更新版本记录），设为 1
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const archiver = require('archiver');

const BACKEND_URL = process.env.WULU_BACKEND_URL || 'https://ai.005656.xyz';
const ADMIN_EMAIL = process.env.WULU_ADMIN_EMAIL || 'ai@ai.005656.xyz';
const ADMIN_PASS = process.env.WULU_ADMIN_PASS || 'Wulu2026Admin';
const SKIP_UPLOAD = process.env.WULU_SKIP_UPLOAD === '1';
const GITHUB_TOKEN = process.env.GH_TOKEN || '';
const GITHUB_REPO = 'wulu318/wulu-superagent';

function log(msg) { console.log(`[Publish] ${msg}`); }

function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 120000,
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function login() {
  const res = await httpsRequest(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }));
  const json = JSON.parse(res.text);
  if (!json.token) throw new Error(`Admin login failed: ${json.error || res.text}`);
  log('Admin login OK');
  return json.token;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** List releases from GitHub (skip nightly/pre-releases). */
async function listGithubReleases() {
  if (!GITHUB_TOKEN) return [];
  const res = await httpsRequest(
    `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`,
    { headers: { 'User-Agent': 'WULU-Publish', Authorization: `Bearer ${GITHUB_TOKEN}` } },
  );
  if (res.status !== 200) {
    log(`GitHub releases fetch failed (${res.status}), continuing with empty list`);
    return [];
  }
  return JSON.parse(res.text).filter((r) => !r.prerelease && !r.draft);
}

/** Find the previous version's asar download URL (for differential builds). */
async function findPreviousAsarUrl(version) {
  const releases = await listGithubReleases();
  for (const r of releases) {
    const v = (r.tag_name || '').replace(/^v/, '');
    if (v === version) continue;
    // Prefer a Windows asset; asar is inside the installer, so we can't
    // fetch it directly — the patch zip is generated at build time instead.
    if (r.assets && r.assets.length) {
      return null;
    }
  }
  return null;
}

/** Upload a file to the backend's public runtime directory via SFTP-like multipart? */
/** We use a simple approach: the file is placed by the caller, then we record its URL. */
async function uploadFileToRuntime(token, localPath, remoteName) {
  if (SKIP_UPLOAD) {
    log(`[skip-upload] ${localPath} -> /runtime/${remoteName}`);
    return `${BACKEND_URL}/runtime/${remoteName}`;
  }
  // Use the admin file-upload endpoint (implemented in admin.js)
  const data = fs.readFileSync(localPath);
  const res = await httpsRequest(`${BACKEND_URL}/api/admin/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      Authorization: `Bearer ${token}`,
      'X-File-Name': encodeURIComponent(remoteName),
      'Content-Length': String(data.length),
    },
  }, data);
  if (res.status !== 200) {
    throw new Error(`Upload failed (${res.status}): ${res.text}`);
  }
  const json = JSON.parse(res.text);
  log(`Uploaded ${remoteName} (${data.length} bytes) -> ${json.url}`);
  return json.url;
}

/** Build an incremental patch zip containing the new app.asar (and manifest). */
async function buildIncrementalPatch(asarPath, version, baseVersion) {
  const patchDir = path.dirname(asarPath);
  const patchFile = path.join(patchDir, `WULU-patch-${baseVersion}-to-${version}.zip`);
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(patchFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    // Manifest describing the patch
    archive.append(JSON.stringify({
      from: baseVersion,
      to: version,
      type: 'asar',
      target: 'resources/app.asar',
      createdAt: new Date().toISOString(),
    }, null, 2), { name: 'patch.json' });
    archive.file(asarPath, { name: 'app.asar' });
    archive.finalize();
  });
  const buf = fs.readFileSync(patchFile);
  return { path: patchFile, size: buf.length, sha256: sha256(buf) };
}

/** Create/update the version record via admin API. */
async function upsertVersion(token, version, payload) {
  // Try update first
  const upd = await httpsRequest(`${BACKEND_URL}/api/admin/versions/${encodeURIComponent(version)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  }, JSON.stringify(payload));
  if (upd.status === 200) {
    log(`Version ${version} updated`);
    return;
  }
  if (upd.status === 404) {
    const cre = await httpsRequest(`${BACKEND_URL}/api/admin/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    }, JSON.stringify(payload));
    if (cre.status !== 200) throw new Error(`Version create failed (${cre.status}): ${cre.text}`);
    log(`Version ${version} created`);
    return;
  }
  throw new Error(`Version update failed (${upd.status}): ${upd.text}`);
}

async function main() {
  const version = process.argv[2];
  if (!version) {
    console.error('Usage: node scripts/publish-release.cjs <version> [--asar <path>] [--upload-only]');
    process.exit(1);
  }

  // Version consistency guard: the tag version must match package.json.
  // A mismatch ships an installer whose About/update-check version differs
  // from the backend version record, breaking update detection.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    if (pkg.version !== version) {
      console.error(`[publish] FATAL: tag version "${version}" != package.json version "${pkg.version}". Bump package.json before tagging.`);
      process.exit(1);
    }
    log(`Version consistency OK: package.json ${pkg.version}`);
  } catch (error) {
    console.error(`[publish] FATAL: cannot read package.json — ${error.message}`);
    process.exit(1);
  }

  const asarFlagIdx = process.argv.indexOf('--asar');
  const asarPath = asarFlagIdx >= 0 ? process.argv[asarFlagIdx + 1] : null;
  const uploadOnly = process.argv.includes('--upload-only');

  log(`Starting publish for version ${version}`);
  const token = await login();

  const payload = {
    version,
    title: process.env.WULU_RELEASE_TITLE || `WULU SuperAgent v${version}`,
    date: process.env.WULU_RELEASE_DATE || new Date().toISOString().slice(0, 10),
    release_notes: process.env.WULU_RELEASE_NOTES || `WULU SuperAgent v${version}\n- 更新说明待补充`,
    is_latest: true,
  };

  // 1. Gather installers from release/ directory (run after CI build)
  const releaseDir = path.resolve('release');
  let winExe = null;
  let macDmg = null;
  if (fs.existsSync(releaseDir)) {
    const entries = fs.readdirSync(releaseDir);
    winExe = entries.find((e) => e.endsWith('.exe') && e.includes('Setup') && !e.includes('arm64'));
    const macExe = entries.find((e) => e.endsWith('.dmg') && e.includes('darwin-arm64'));
    macDmg = macExe;
  }

  if (uploadOnly) {
    log('--upload-only mode: uploading installers and creating version record');
    if (winExe) {
      const url = await uploadFileToRuntime(token, path.join(releaseDir, winExe), `releases/${version}/${winExe}`);
      payload.windows_x64_url = url;
      payload.windows_x64_size = String(fs.statSync(path.join(releaseDir, winExe)).size);
      payload.windows_x64_sha256 = sha256(fs.readFileSync(path.join(releaseDir, winExe)));
    }
    if (macDmg) {
      const url = await uploadFileToRuntime(token, path.join(releaseDir, macDmg), `releases/${version}/${macDmg}`);
      payload.mac_arm_url = url;
      payload.mac_arm_size = String(fs.statSync(path.join(releaseDir, macDmg)).size);
      payload.mac_arm_sha256 = sha256(fs.readFileSync(path.join(releaseDir, macDmg)));
    }
    await upsertVersion(token, version, payload);
    log('Publish complete (upload-only)');
    return;
  }

  // 2. Incremental patch (asar-based)
  if (asarPath && fs.existsSync(asarPath)) {
    let baseVersion = process.env.WULU_PATCH_BASE_VERSION;
    if (!baseVersion) {
      // Auto-detect previous version from backend version list
      try {
        const res = await httpsRequest(`${BACKEND_URL}/api/admin/versions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 200) {
          const list = JSON.parse(res.text).versions || [];
          const prev = list
            .filter((v) => v.version !== version && v.is_active)
            .sort((a, b) => compareVersions(b.version, a.version))[0];
          if (prev) baseVersion = prev.version;
        }
      } catch { /* ignore */ }
    }
    if (baseVersion) {
      const patch = await buildIncrementalPatch(asarPath, version, baseVersion);
      const patchUrl = await uploadFileToRuntime(token, patch.path, `releases/${version}/WULU-patch-${baseVersion}-to-${version}.zip`);
      payload.incremental_base_version = baseVersion;
      payload.incremental_url = patchUrl;
      payload.incremental_size = String(patch.size);
      payload.incremental_sha256 = patch.sha256;
      log(`Incremental patch generated: ${patch.size} bytes, base=${baseVersion}, sha256=${patch.sha256}`);
    } else {
      log('No base version available for incremental patch, skipping');
    }
  }

  // 3. Full installers
  if (winExe) {
    const url = await uploadFileToRuntime(token, path.join(releaseDir, winExe), `releases/${version}/${winExe}`);
    payload.windows_x64_url = url;
    payload.windows_x64_size = String(fs.statSync(path.join(releaseDir, winExe)).size);
    payload.windows_x64_sha256 = sha256(fs.readFileSync(path.join(releaseDir, winExe)));
  }
  if (macDmg) {
    const url = await uploadFileToRuntime(token, path.join(releaseDir, macDmg), `releases/${version}/${macDmg}`);
    payload.mac_arm_url = url;
    payload.mac_arm_size = String(fs.statSync(path.join(releaseDir, macDmg)).size);
    payload.mac_arm_sha256 = sha256(fs.readFileSync(path.join(releaseDir, macDmg)));
  }

  await upsertVersion(token, version, payload);
  log('Publish complete!');
}

main().catch((err) => {
  console.error('[Publish] Failed:', err.message);
  process.exit(1);
});
