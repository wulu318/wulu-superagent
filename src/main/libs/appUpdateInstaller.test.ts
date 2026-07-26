import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openPath: vi.fn(),
  showItemInFolder: vi.fn(),
  quit: vi.fn(),
  relaunch: vi.fn(),
  getPath: vi.fn(),
}));

const cpMocks = vi.hoisted(() => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: mocks.getPath,
    quit: mocks.quit,
    relaunch: mocks.relaunch,
  },
  session: {
    defaultSession: {
      fetch: vi.fn(),
    },
  },
  shell: {
    openPath: mocks.openPath,
    showItemInFolder: mocks.showItemInFolder,
  },
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: cpMocks.exec,
    execFile: cpMocks.execFile,
    spawn: cpMocks.spawn,
  };
});

import { APP_UPDATE_ELEVATION_DECLINED_ERROR } from '../../shared/appUpdate/constants';
import {
  buildMacSwapInstallCommand,
  buildMacSwapPaths,
  buildWindowsInstallerLaunchScript,
  findAttachedDevEntries,
  installUpdate,
  MAC_SWAP_BACKUP_INFIX,
  MAC_SWAP_ROLLED_BACK_EXIT_CODE,
  MAC_SWAP_STAGING_INFIX,
  parseHdiutilAttachOutput,
  WINDOWS_NO_DEFENDER_EXCLUSION_ARG,
  WINDOWS_UAC_DECLINED_EXIT_CODE,
} from './appUpdateInstaller';

const INSTALLER_PATH = 'C:\\Users\\test\\AppData\\Roaming\\WULU\\updates\\WULU-update-manual-1.exe';

describe('Windows update install', () => {
  const originalPlatform = process.platform;

  const mockSilentLaunchResult = (error: Error | null, stderr = '') => {
    cpMocks.execFile.mockImplementation(
      (
        _file: string,
        _args: string[],
        _opts: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        setImmediate(() => callback(error, '', stderr));
        return {} as never;
      },
    );
  };

  beforeEach(() => {
    mocks.openPath.mockReset();
    mocks.showItemInFolder.mockReset();
    mocks.quit.mockReset();
    cpMocks.execFile.mockReset();
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1024 } as fs.Stats);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.restoreAllMocks();
  });

  test('launches the update-mode installer through PowerShell and quits on success', async () => {
    mockSilentLaunchResult(null);

    await installUpdate(INSTALLER_PATH);

    expect(cpMocks.execFile).toHaveBeenCalledOnce();
    const [file, args] = cpMocks.execFile.mock.calls[0] as [string, string[]];
    expect(file).toBe('powershell.exe');
    expect(args).toContain('-NoProfile');
    expect(args).toContain('-NonInteractive');
    const script = args[args.length - 1];
    expect(script).toContain(`-FilePath '${INSTALLER_PATH}'`);
    expect(script).toContain(`'--force-run','--updated'`);
    expect(script).not.toContain(`'/S'`);
    expect(mocks.quit).toHaveBeenCalledOnce();
    // The wizard path must not run: silent launch succeeded.
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
  });

  test('maps a declined UAC prompt to the stable marker and stays running', async () => {
    mockSilentLaunchResult(
      Object.assign(new Error('powershell exited with 1223'), {
        code: WINDOWS_UAC_DECLINED_EXIT_CODE,
      }),
      'Der Vorgang wurde durch den Benutzer abgebrochen.',
    );

    await expect(installUpdate(INSTALLER_PATH)).rejects.toThrow(
      APP_UPDATE_ELEVATION_DECLINED_ERROR,
    );

    // No interactive fallback: it would raise a second elevation prompt.
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('falls back to the interactive installer when PowerShell is unavailable', async () => {
    mockSilentLaunchResult(
      Object.assign(new Error('spawn powershell.exe ENOENT'), { code: 'ENOENT' }),
    );
    mocks.openPath.mockResolvedValue('');

    await installUpdate(INSTALLER_PATH);

    expect(mocks.openPath).toHaveBeenCalledWith(INSTALLER_PATH);
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
  });

  test('reveals the installer in Explorer when the fallback launch also fails', async () => {
    mockSilentLaunchResult(Object.assign(new Error('blocked'), { code: 1 }));
    mocks.openPath.mockResolvedValue('Access is denied.');

    await expect(installUpdate(INSTALLER_PATH)).rejects.toThrow('Access is denied.');

    expect(mocks.showItemInFolder).toHaveBeenCalledWith(INSTALLER_PATH);
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('rejects when the installer file is missing', async () => {
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    vi.spyOn(fs.promises, 'stat').mockRejectedValue(enoent);

    await expect(installUpdate(INSTALLER_PATH)).rejects.toThrow('Update file not found');

    expect(cpMocks.execFile).not.toHaveBeenCalled();
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('forwards the enterprise no-exclusion switch to the installer', async () => {
    mockSilentLaunchResult(null);

    await installUpdate(INSTALLER_PATH, { noDefenderExclusion: true });

    const [, args] = cpMocks.execFile.mock.calls[0] as [string, string[]];
    const script = args[args.length - 1];
    expect(script).toContain(`'--force-run','--updated','${WINDOWS_NO_DEFENDER_EXCLUSION_ARG}'`);
  });

  test('omits the no-exclusion switch by default', async () => {
    mockSilentLaunchResult(null);

    await installUpdate(INSTALLER_PATH);

    const [, args] = cpMocks.execFile.mock.calls[0] as [string, string[]];
    const script = args[args.length - 1];
    expect(script).not.toContain(WINDOWS_NO_DEFENDER_EXCLUSION_ARG);
  });
});

describe('buildWindowsInstallerLaunchScript', () => {
  test('escapes single quotes in the installer path for PowerShell', () => {
    const script = buildWindowsInstallerLaunchScript("C:\\Users\\o'brien\\updates\\setup.exe");

    expect(script).toContain(`-FilePath 'C:\\Users\\o''brien\\updates\\setup.exe'`);
  });

  test('converts a declined elevation into the dedicated exit code', () => {
    const script = buildWindowsInstallerLaunchScript(INSTALLER_PATH);

    expect(script).toContain(`$native -eq ${WINDOWS_UAC_DECLINED_EXIT_CODE}`);
    expect(script).toContain(`exit ${WINDOWS_UAC_DECLINED_EXIT_CODE}`);
    expect(script).toContain("$ErrorActionPreference = 'Stop'");
  });
});

describe('hdiutil plist parsing', () => {
  test('extracts the mount point and dev entries from an APFS attach result', () => {
    // Real-world shape: entity order is not device order.
    const json = JSON.stringify({
      'system-entities': [
        { 'content-hint': 'GUID_partition_scheme', 'dev-entry': '/dev/disk4' },
        { 'dev-entry': '/dev/disk5s1', 'mount-point': '/Volumes/WULU', 'volume-kind': 'apfs' },
        { 'content-hint': 'EF57347C-0000-11AA-AA11-00306543ECAC', 'dev-entry': '/dev/disk5' },
        { 'content-hint': 'Apple_APFS', 'dev-entry': '/dev/disk4s1' },
      ],
    });

    const result = parseHdiutilAttachOutput(json);

    expect(result.mountPoint).toBe('/Volumes/WULU');
    expect(result.devEntries).toEqual(['/dev/disk4', '/dev/disk5s1', '/dev/disk5', '/dev/disk4s1']);
  });

  test('extracts the mount point from an HFS attach result', () => {
    const json = JSON.stringify({
      'system-entities': [
        { 'content-hint': 'GUID_partition_scheme', 'dev-entry': '/dev/disk4' },
        { 'content-hint': 'Apple_HFS', 'dev-entry': '/dev/disk4s1', 'mount-point': '/Volumes/WULU 1' },
      ],
    });

    const result = parseHdiutilAttachOutput(json);

    expect(result.mountPoint).toBe('/Volumes/WULU 1');
  });

  test('reports no mount point when the volume failed to mount', () => {
    const json = JSON.stringify({
      'system-entities': [
        { 'content-hint': 'GUID_partition_scheme', 'dev-entry': '/dev/disk4' },
        { 'content-hint': 'Apple_HFS', 'dev-entry': '/dev/disk4s1' },
      ],
    });

    const result = parseHdiutilAttachOutput(json);

    expect(result.mountPoint).toBeUndefined();
    expect(result.devEntries).toEqual(['/dev/disk4', '/dev/disk4s1']);
  });

  test('preserves special characters in mount points', () => {
    const mountPoint = '/Volumes/龙虾 Test & Vol';
    const json = JSON.stringify({
      'system-entities': [{ 'dev-entry': '/dev/disk4s1', 'mount-point': mountPoint }],
    });

    expect(parseHdiutilAttachOutput(json).mountPoint).toBe(mountPoint);
  });

  test('treats malformed output as no mount point', () => {
    expect(parseHdiutilAttachOutput('not json')).toEqual({ mountPoint: undefined, devEntries: [] });
    expect(parseHdiutilAttachOutput('')).toEqual({ mountPoint: undefined, devEntries: [] });
    expect(parseHdiutilAttachOutput('{}')).toEqual({ mountPoint: undefined, devEntries: [] });
  });

  test('finds dev entries of an attached image by image path', () => {
    const json = JSON.stringify({
      images: [
        {
          'image-path': '/tmp/other.dmg',
          'system-entities': [{ 'dev-entry': '/dev/disk9' }],
        },
        {
          'image-path': '/tmp/update.dmg',
          'system-entities': [{ 'dev-entry': '/dev/disk4' }, { 'dev-entry': '/dev/disk4s1' }],
        },
      ],
    });

    expect(findAttachedDevEntries(json, '/tmp/update.dmg')).toEqual(['/dev/disk4', '/dev/disk4s1']);
    expect(findAttachedDevEntries(json, '/tmp/missing.dmg')).toEqual([]);
    expect(findAttachedDevEntries('not json', '/tmp/update.dmg')).toEqual([]);
  });
});

describe('mac swap builders', () => {
  test('places staging and backup next to the target app, hidden and not .app-suffixed', () => {
    const swapPaths = buildMacSwapPaths('/Applications/Wulu AI.app', 1234);

    expect(path.dirname(swapPaths.staging)).toBe('/Applications');
    expect(path.dirname(swapPaths.backup)).toBe('/Applications');
    expect(path.basename(swapPaths.staging)).toBe(`.Wulu AI.app${MAC_SWAP_STAGING_INFIX}1234`);
    expect(path.basename(swapPaths.backup)).toBe(`.Wulu AI.app${MAC_SWAP_BACKUP_INFIX}1234`);
    expect(swapPaths.staging.endsWith('.app')).toBe(false);
    expect(swapPaths.backup.endsWith('.app')).toBe(false);
  });

  test('builds a staged-copy, guarded-backup, rollback and cleanup sequence', () => {
    const target = '/Applications/WULU.app';
    const swapPaths = buildMacSwapPaths(target, 7);

    const cmd = buildMacSwapInstallCommand('/Volumes/WULU/WULU.app', target, swapPaths);

    const cpIndex = cmd.indexOf(`cp -R '/Volumes/WULU/WULU.app' '${swapPaths.staging}'`);
    const backupIndex = cmd.indexOf(`mv '${target}' '${swapPaths.backup}'`);
    const swapIndex = cmd.indexOf(`mv '${swapPaths.staging}' '${target}'`);
    const rollbackIndex = cmd.indexOf(`mv '${swapPaths.backup}' '${target}'`);
    expect(cpIndex).toBe(0);
    expect(backupIndex).toBeGreaterThan(cpIndex);
    expect(swapIndex).toBeGreaterThan(backupIndex);
    expect(rollbackIndex).toBeGreaterThan(swapIndex);
    expect(cmd).toContain(`exit ${MAC_SWAP_ROLLED_BACK_EXIT_CODE}`);
    expect(cmd).toContain(`[ ! -e '${target}' ]`);
    expect(cmd).toContain(`rm -rf '${swapPaths.backup}'`);
  });

  test('single-quotes paths containing spaces and quotes', () => {
    const target = `/Applications/It's "Wulu".app`;
    const swapPaths = buildMacSwapPaths(target, 7);

    const cmd = buildMacSwapInstallCommand('/Volumes/src.app', target, swapPaths);

    expect(cmd).toContain(`'/Applications/It'\\''s "Wulu".app'`);
  });
});

describe('macOS DMG install', () => {
  const originalPlatform = process.platform;
  const originalResourcesPath = (process as { resourcesPath?: string }).resourcesPath;
  const USER_DATA = '/Users/test/Library/Application Support/WULU';
  const DMG_PATH = `${USER_DATA}/updates/WULU-update-auto-1.dmg`;
  const TARGET_APP = '/Applications/WULU.app';

  const attachNoMountJson = JSON.stringify({
    'system-entities': [
      { 'content-hint': 'GUID_partition_scheme', 'dev-entry': '/dev/disk4' },
      { 'content-hint': 'Apple_HFS', 'dev-entry': '/dev/disk4s1' },
    ],
  });

  const attachMountedJson = (mountPoint: string) =>
    JSON.stringify({
      'system-entities': [
        { 'content-hint': 'GUID_partition_scheme', 'dev-entry': '/dev/disk4' },
        { 'content-hint': 'Apple_HFS', 'dev-entry': '/dev/disk4s1', 'mount-point': mountPoint },
      ],
    });

  /** Responds to consecutive `hdiutil attach` calls; other commands succeed with empty output. */
  let attachResponders: Array<(cmd: string) => string>;
  let attachCommands: string[];
  let detachCommands: string[];
  /** Every command passed to exec, in call order. */
  let execCommands: string[];
  /** Per-test hook to fail or answer specific commands; undefined falls through to defaults. */
  let execOverride: ((cmd: string) => { error?: Error; stdout?: string } | undefined) | null;
  /** readdir result for the target app's parent directory. */
  let applicationsEntries: string[];

  const respondNoMount = () => attachNoMountJson;
  const respondMountedAtVolumes = () => attachMountedJson('/Volumes/WULU');
  const respondMountedAtRequestedPoint = (cmd: string) => {
    const match = cmd.match(/-mountpoint '([^']+)'/);
    return attachMountedJson(match ? match[1] : '/Volumes/unexpected');
  };

  const isSwapInCommand = (cmd: string) =>
    cmd.startsWith('mv ') && cmd.includes(MAC_SWAP_STAGING_INFIX) && cmd.endsWith(`'${TARGET_APP}'`);
  const isRollbackCommand = (cmd: string) =>
    cmd.startsWith('mv ') && cmd.includes(MAC_SWAP_BACKUP_INFIX) && cmd.endsWith(`'${TARGET_APP}'`);

  const failPrivilegedInstall = (message: string) => {
    cpMocks.execFile.mockImplementation(
      (
        _file: string,
        _args: string[],
        _opts: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        setImmediate(() => callback(new Error(message), '', ''));
        return {} as never;
      },
    );
  };

  /** plutil stand-in that echoes stdin, so exec fixtures can be JSON directly. */
  const fakePlutilProcess = () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter & { setEncoding: (encoding: string) => void };
      stderr: EventEmitter & { setEncoding: (encoding: string) => void };
      stdin: { on: (event: string, listener: () => void) => void; end: (data?: string) => void };
    };
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
    child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => {} });
    child.stdin = {
      on: () => {},
      end: (data?: string) => {
        setImmediate(() => {
          child.stdout.emit('data', data ?? '');
          child.emit('close', 0);
        });
      },
    };
    return child;
  };

  beforeEach(() => {
    mocks.openPath.mockReset();
    mocks.showItemInFolder.mockReset();
    mocks.quit.mockReset();
    mocks.relaunch.mockReset();
    mocks.getPath.mockReset();
    mocks.getPath.mockReturnValue(USER_DATA);
    cpMocks.exec.mockReset();
    cpMocks.execFile.mockReset();
    cpMocks.spawn.mockReset();

    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'resourcesPath', {
      value: `${TARGET_APP}/Contents/Resources`,
      configurable: true,
    });

    attachResponders = [];
    attachCommands = [];
    detachCommands = [];
    execCommands = [];
    execOverride = null;
    applicationsEntries = ['WULU.app'];

    cpMocks.exec.mockImplementation(
      (
        cmd: string,
        _opts: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        execCommands.push(cmd);
        const finish = (error: Error | null, stdout = '') =>
          setImmediate(() => callback(error, stdout, ''));
        const override = execOverride?.(cmd);
        if (override) {
          finish(override.error ?? null, override.stdout ?? '');
        } else if (cmd.startsWith('hdiutil attach')) {
          attachCommands.push(cmd);
          const responder = attachResponders.shift() ?? respondNoMount;
          finish(null, responder(cmd));
        } else if (cmd.startsWith('hdiutil detach')) {
          detachCommands.push(cmd);
          finish(null, '');
        } else {
          finish(null, '');
        }
        return {} as never;
      },
    );
    cpMocks.execFile.mockImplementation(
      (
        _file: string,
        _args: string[],
        _opts: unknown,
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        setImmediate(() => callback(null, '', ''));
        return {} as never;
      },
    );
    cpMocks.spawn.mockImplementation(() => fakePlutilProcess() as never);

    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 1024 } as fs.Stats);
    vi.spyOn(fs.promises, 'lstat').mockResolvedValue({} as fs.Stats);
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'rmdir').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    vi.spyOn(fs.promises, 'readdir').mockImplementation(((dir: fs.PathLike) => {
      const dirPath = String(dir);
      if (dirPath.endsWith(path.join('Contents', 'MacOS'))) {
        return Promise.resolve(['WULU']);
      }
      if (dirPath === path.dirname(TARGET_APP)) {
        return Promise.resolve(applicationsEntries);
      }
      return Promise.resolve(['WULU.app']);
    }) as never);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  test('mounts, swap-installs and relaunches on the happy path', async () => {
    attachResponders = [respondMountedAtVolumes];

    await installUpdate(DMG_PATH);

    expect(attachCommands).toHaveLength(1);
    expect(attachCommands[0]).toContain('-plist');
    expect(attachCommands[0]).not.toContain('-mountpoint');

    // Staged copy runs first, then backup move, then the swap-in rename.
    const cpIndex = execCommands.findIndex(
      (cmd) => cmd.startsWith('cp -R') && cmd.includes(MAC_SWAP_STAGING_INFIX),
    );
    const backupIndex = execCommands.findIndex(
      (cmd) => cmd.startsWith(`mv '${TARGET_APP}'`) && cmd.includes(MAC_SWAP_BACKUP_INFIX),
    );
    const swapIndex = execCommands.findIndex(isSwapInCommand);
    expect(cpIndex).toBeGreaterThanOrEqual(0);
    expect(backupIndex).toBeGreaterThan(cpIndex);
    expect(swapIndex).toBeGreaterThan(backupIndex);
    // The destructive rm -rf of the old install is gone; the backup is
    // removed via fs.rm only after the new version is in place.
    expect(execCommands.some((cmd) => cmd.startsWith('rm -rf'))).toBe(false);
    expect(fs.promises.rm).toHaveBeenCalledWith(
      expect.stringContaining(MAC_SWAP_BACKUP_INFIX),
      { recursive: true, force: true },
    );

    expect(detachCommands).toHaveLength(1);
    expect(detachCommands[0]).toContain('/Volumes/WULU');
    expect(fs.promises.unlink).toHaveBeenCalledWith(DMG_PATH);
    expect(cpMocks.execFile).not.toHaveBeenCalled();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(fs.promises.mkdir).not.toHaveBeenCalled();
  });

  test('detaches the stale attachment and retries with an explicit mount point', async () => {
    attachResponders = [respondNoMount, respondMountedAtRequestedPoint];

    await installUpdate(DMG_PATH);

    expect(attachCommands).toHaveLength(2);
    expect(attachCommands[1]).toContain('-mountpoint');
    expect(attachCommands[1]).toContain(`${USER_DATA}/updates/mnt-`);
    // Stale attachment from the failed first attach is torn down before the retry.
    expect(detachCommands.some((cmd) => cmd.includes('/dev/disk4'))).toBe(true);
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(mocks.quit).toHaveBeenCalledOnce();
    // The explicit mount point directory is removed after detach.
    expect(fs.promises.rmdir).toHaveBeenCalled();
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  test('opens the DMG in Finder and rejects when the volume never mounts', async () => {
    attachResponders = [respondNoMount, respondNoMount];
    mocks.openPath.mockResolvedValue('');

    await expect(installUpdate(DMG_PATH)).rejects.toThrow(
      'Failed to determine mount point from hdiutil output',
    );

    expect(attachCommands).toHaveLength(2);
    expect(mocks.openPath).toHaveBeenCalledWith(DMG_PATH);
    expect(detachCommands.length).toBeGreaterThan(0);
    expect(fs.promises.rmdir).toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  test('falls back to revealing the DMG when Finder cannot open it', async () => {
    attachResponders = [respondNoMount, respondNoMount];
    mocks.openPath.mockResolvedValue('No application knows how to open this file.');

    await expect(installUpdate(DMG_PATH)).rejects.toThrow(
      'Failed to determine mount point from hdiutil output',
    );

    expect(mocks.showItemInFolder).toHaveBeenCalledWith(DMG_PATH);
  });

  test('leaves the current app untouched when the staging copy fails everywhere', async () => {
    attachResponders = [respondMountedAtVolumes];
    execOverride = (cmd) =>
      cmd.startsWith('cp -R') ? { error: new Error('No space left on device') } : undefined;
    failPrivilegedInstall('execution error: User canceled. (-128)');

    await expect(installUpdate(DMG_PATH)).rejects.toThrow(
      /insufficient permissions[\s\S]*current version untouched/,
    );

    // The current install is never moved or deleted.
    expect(execCommands.some((cmd) => cmd.startsWith(`mv '${TARGET_APP}'`))).toBe(false);
    expect(execCommands.some((cmd) => cmd.startsWith('rm -rf'))).toBe(false);
    // The failed staging copy is cleaned up.
    expect(fs.promises.rm).toHaveBeenCalledWith(
      expect.stringContaining(MAC_SWAP_STAGING_INFIX),
      { recursive: true, force: true },
    );
    // The image is detached on failure.
    expect(detachCommands.length).toBeGreaterThan(0);
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('rolls back the backup and retries with privileges when the swap-in fails', async () => {
    attachResponders = [respondMountedAtVolumes];
    execOverride = (cmd) => (isSwapInCommand(cmd) ? { error: new Error('swap blocked') } : undefined);

    await installUpdate(DMG_PATH);

    const swapIndex = execCommands.findIndex(isSwapInCommand);
    const rollbackIndex = execCommands.findIndex(isRollbackCommand);
    expect(swapIndex).toBeGreaterThanOrEqual(0);
    expect(rollbackIndex).toBeGreaterThan(swapIndex);
    expect(cpMocks.execFile).toHaveBeenCalledOnce();
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  test('reports rolled back when the privileged swap also fails after a rollback', async () => {
    attachResponders = [respondMountedAtVolumes];
    execOverride = (cmd) => (isSwapInCommand(cmd) ? { error: new Error('swap blocked') } : undefined);
    failPrivilegedInstall(
      `execution error: 该命令退出时状态为非零。 (${MAC_SWAP_ROLLED_BACK_EXIT_CODE})`,
    );

    await expect(installUpdate(DMG_PATH)).rejects.toThrow(/rolled back to current version/);

    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('skips the backup step when no app exists at the target path', async () => {
    attachResponders = [respondMountedAtVolumes];
    const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
    vi.mocked(fs.promises.lstat).mockRejectedValue(enoent);

    await installUpdate(DMG_PATH);

    expect(execCommands.some((cmd) => cmd.startsWith(`mv '${TARGET_APP}'`))).toBe(false);
    expect(execCommands.findIndex(isSwapInCommand)).toBeGreaterThanOrEqual(0);
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  test('surfaces the backup path when the rollback itself fails', async () => {
    attachResponders = [respondMountedAtVolumes];
    execOverride = (cmd) => {
      if (isSwapInCommand(cmd)) {
        return { error: new Error('swap blocked') };
      }
      if (isRollbackCommand(cmd)) {
        return { error: new Error('rollback blocked') };
      }
      return undefined;
    };

    await expect(installUpdate(DMG_PATH)).rejects.toThrow(
      /previous version preserved at .*\.backup-/,
    );

    // No privileged retry on a stranded backup: the filesystem state is unexpected.
    expect(cpMocks.execFile).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  test('cleans up leftover staging and backup directories before installing', async () => {
    attachResponders = [respondMountedAtVolumes];
    applicationsEntries = [
      `.WULU.app${MAC_SWAP_STAGING_INFIX}1`,
      `.WULU.app${MAC_SWAP_BACKUP_INFIX}2`,
      'WULU.app',
      'Other.app',
    ];

    await installUpdate(DMG_PATH);

    expect(fs.promises.rm).toHaveBeenCalledWith(
      `/Applications/.WULU.app${MAC_SWAP_STAGING_INFIX}1`,
      { recursive: true, force: true },
    );
    expect(fs.promises.rm).toHaveBeenCalledWith(
      `/Applications/.WULU.app${MAC_SWAP_BACKUP_INFIX}2`,
      { recursive: true, force: true },
    );
    expect(fs.promises.rm).not.toHaveBeenCalledWith('/Applications/Other.app', expect.anything());
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  test('passes the composite swap command to osascript for the privileged path', async () => {
    attachResponders = [respondMountedAtVolumes];
    execOverride = (cmd) =>
      cmd.startsWith('cp -R') ? { error: new Error('Operation not permitted') } : undefined;

    await installUpdate(DMG_PATH);

    expect(cpMocks.execFile).toHaveBeenCalledOnce();
    const [file, args] = cpMocks.execFile.mock.calls[0] as [string, string[]];
    expect(file).toBe('osascript');
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('do shell script "');
    expect(args[1]).toContain('with administrator privileges');
    expect(args[1]).toContain('cp -R ');
    expect(args[1]).toContain(`exit ${MAC_SWAP_ROLLED_BACK_EXIT_CODE}`);
    expect(mocks.quit).toHaveBeenCalledOnce();
  });
});
