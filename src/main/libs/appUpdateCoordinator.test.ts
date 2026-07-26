import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AppUpdateSource, AppUpdateStatus } from '../../shared/appUpdate/constants';
import type { SqliteStore } from '../sqliteStore';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn(),
  getVersion: vi.fn(),
  fetch: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  cancelActiveDownload: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: mocks.getPath,
    getVersion: mocks.getVersion,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  session: {
    defaultSession: {
      fetch: mocks.fetch,
    },
  },
}));

vi.mock('./appUpdateInstaller', () => ({
  cancelActiveDownload: mocks.cancelActiveDownload,
  downloadUpdate: mocks.downloadUpdate,
  installUpdate: mocks.installUpdate,
}));

vi.mock('./endpoints', () => ({
  getUpdateCheckUrl: () => 'https://updates.example.com/auto',
  getManualUpdateCheckUrl: () => 'https://updates.example.com/manual',
  getFallbackDownloadUrl: () => 'https://updates.example.com/download-list',
}));

vi.mock('./keyfromAttribution', () => ({
  getKeyfromAttribution: () => ({ firstKeyfrom: 'none', latestKeyfrom: 'none' }),
}));

import { APP_UPDATE_READY_FILE_KEY_PREFIX, AppUpdateCoordinator } from './appUpdateCoordinator';

const READY_VERSION = '2.0.0';

function createStoreStub(): SqliteStore {
  const map = new Map<string, unknown>();
  return {
    get: (key: string) => map.get(key),
    set: (key: string, value: unknown) => {
      map.set(key, value);
    },
    delete: (key: string) => {
      map.delete(key);
    },
  } as unknown as SqliteStore;
}

function readyFileStoreKey(source: AppUpdateSource): string {
  return `${APP_UPDATE_READY_FILE_KEY_PREFIX}:${source}`;
}

function seedReadyFile(store: SqliteStore, updatesDir: string, source: AppUpdateSource): string {
  fs.mkdirSync(updatesDir, { recursive: true });
  const filePath = path.join(updatesDir, `WULU-update-${source}-1.exe`);
  const bytes = 'installer-bytes';
  fs.writeFileSync(filePath, bytes);
  const fileHash = crypto.createHash('sha256').update(bytes).digest('hex');
  store.set(readyFileStoreKey(source), {
    version: READY_VERSION,
    filePath,
    fileHash,
    info: {
      latestVersion: READY_VERSION,
      date: '2026-06-10',
      changeLog: {
        zh: { title: '', content: [] },
        en: { title: '', content: [] },
      },
      url: `https://updates.example.com/WULU-${READY_VERSION}.exe`,
    },
  });
  return filePath;
}

describe('AppUpdateCoordinator', () => {
  let tmpDir: string;
  let updatesDir: string;

  beforeEach(() => {
    mocks.getPath.mockReset();
    mocks.getVersion.mockReset();
    mocks.fetch.mockReset();
    mocks.downloadUpdate.mockReset();
    mocks.installUpdate.mockReset();
    mocks.cancelActiveDownload.mockReset();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'WULU-update-test-'));
    updatesDir = path.join(tmpDir, 'updates');
    mocks.getPath.mockReturnValue(tmpDir);
    mocks.getVersion.mockReturnValue('1.0.0');
    mocks.cancelActiveDownload.mockReturnValue(false);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns to Ready and keeps the verified installer when install fails', async () => {
    const store = createStoreStub();
    const filePath = seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);
    expect(coordinator.getState().status).toBe(AppUpdateStatus.Ready);

    mocks.installUpdate.mockRejectedValue(new Error('The operation was canceled by the user.'));

    const result = await coordinator.installReadyUpdate();

    expect(result.success).toBe(false);
    expect(result.state.status).toBe(AppUpdateStatus.Ready);
    expect(result.state.readyFilePath).toBe(filePath);
    expect(result.state.errorMessage).toBe('The operation was canceled by the user.');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('falls back to Available when the installer is gone after a failed install', async () => {
    const store = createStoreStub();
    const filePath = seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);

    mocks.installUpdate.mockImplementation(async () => {
      fs.unlinkSync(filePath);
      throw new Error('Update file not found');
    });

    const result = await coordinator.installReadyUpdate();

    expect(result.success).toBe(false);
    expect(result.state.status).toBe(AppUpdateStatus.Available);
    expect(result.state.readyFilePath).toBeNull();
    expect(result.state.errorMessage).toBe('Update file not found');
    expect(store.get(readyFileStoreKey(AppUpdateSource.Auto))).toBeUndefined();
  });

  test('manual check reuses an installer downloaded by the auto flow', async () => {
    const store = createStoreStub();
    const filePath = seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);

    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          value: {
            version: READY_VERSION,
            date: '2026-06-10',
            changeLog: {
              ch: { title: '', content: [] },
              en: { title: '', content: [] },
            },
            macIntel: { url: `https://updates.example.com/WULU-${READY_VERSION}.dmg` },
            macArm: { url: `https://updates.example.com/WULU-${READY_VERSION}.dmg` },
            windowsX64: { url: `https://updates.example.com/WULU-${READY_VERSION}.exe` },
          },
        },
      }),
    });

    const result = await coordinator.checkNow({ manual: true });

    expect(result.success).toBe(true);
    expect(result.updateFound).toBe(true);
    expect(result.state.status).toBe(AppUpdateStatus.Ready);
    expect(result.state.source).toBe(AppUpdateSource.Manual);
    expect(result.state.readyFilePath).toBe(filePath);
    expect(mocks.downloadUpdate).not.toHaveBeenCalled();
  });

  test('restores installIncomplete after an install attempt that never completed', async () => {
    const store = createStoreStub();
    seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);
    mocks.installUpdate.mockResolvedValue(undefined);

    const result = await coordinator.installReadyUpdate();
    expect(result.success).toBe(true);

    const restored = new AppUpdateCoordinator(store);
    const state = restored.getState();
    expect(state.status).toBe(AppUpdateStatus.Ready);
    expect(state.installIncomplete).toBe(true);
  });

  test('reports a completed update once when relaunched as the attempted version', async () => {
    const store = createStoreStub();
    seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);
    mocks.installUpdate.mockResolvedValue(undefined);
    await coordinator.installReadyUpdate();

    // The installer finished and relaunched the app as the new version.
    mocks.getVersion.mockReturnValue(READY_VERSION);
    const relaunched = new AppUpdateCoordinator(store);

    expect(relaunched.getState().status).toBe(AppUpdateStatus.Idle);
    expect(relaunched.consumeCompletedUpdateVersion()).toBe(READY_VERSION);
    expect(relaunched.consumeCompletedUpdateVersion()).toBeNull();
    expect(store.get(readyFileStoreKey(AppUpdateSource.Auto))).toBeUndefined();
  });

  test('does not report a completed update without a prior install attempt', () => {
    const store = createStoreStub();
    seedReadyFile(store, updatesDir, AppUpdateSource.Auto);

    // App is already on the ready version, but no install was ever launched
    // (e.g. the user updated manually with the wizard from a browser download).
    mocks.getVersion.mockReturnValue(READY_VERSION);
    const coordinator = new AppUpdateCoordinator(store);

    expect(coordinator.consumeCompletedUpdateVersion()).toBeNull();
  });

  test('forwards the enterprise Defender-exclusion opt-out to the installer', async () => {
    const store = createStoreStub();
    store.set('enterprise_config', { disableDefenderExclusion: true });
    seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);
    mocks.installUpdate.mockResolvedValue(undefined);

    await coordinator.installReadyUpdate();

    expect(mocks.installUpdate).toHaveBeenCalledWith(
      expect.any(String),
      { noDefenderExclusion: true },
    );
  });

  test('does not request the Defender opt-out without enterprise config', async () => {
    const store = createStoreStub();
    seedReadyFile(store, updatesDir, AppUpdateSource.Auto);
    const coordinator = new AppUpdateCoordinator(store);
    mocks.installUpdate.mockResolvedValue(undefined);

    await coordinator.installReadyUpdate();

    expect(mocks.installUpdate).toHaveBeenCalledWith(
      expect.any(String),
      { noDefenderExclusion: false },
    );
  });
});
