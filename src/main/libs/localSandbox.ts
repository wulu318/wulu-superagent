import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type LocalSandboxPlatform = 'macos' | 'linux' | 'windows' | 'unsupported';

export type LocalSandboxStatus = {
  platform: LocalSandboxPlatform;
  available: boolean;
  executable?: string;
  reason?: string;
};

export type LocalSandboxCommand = {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

const findExecutable = (names: string[], bundledDir?: string): string | undefined => {
  const searchPath = [
    ...(bundledDir ? [bundledDir] : []),
    ...(process.env.PATH?.split(path.delimiter) ?? []),
  ];
  for (const dir of searchPath) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue searching.
      }
    }
  }
  return undefined;
};

export const getLocalSandboxStatus = (): LocalSandboxStatus => {
  if (process.platform === 'darwin') {
    const executable = findExecutable(['sandbox-exec'], '/usr/bin');
    return executable
      ? { platform: 'macos', available: true, executable }
      : { platform: 'macos', available: false, reason: 'sandbox-exec is unavailable' };
  }
  if (process.platform === 'linux') {
    const executable = findExecutable(
      ['bwrap', 'bubblewrap'],
      path.join(process.resourcesPath ?? '', 'sandbox'),
    );
    return executable
      ? { platform: 'linux', available: true, executable }
      : { platform: 'linux', available: false, reason: 'bubblewrap is unavailable' };
  }
  if (process.platform === 'win32') {
    const executable = findExecutable(
      ['wulu-sandbox.exe'],
      path.join(process.resourcesPath ?? '', 'sandbox'),
    );
    return {
      platform: 'windows',
      available: Boolean(executable),
      executable,
      reason: executable ? undefined : 'bundled Windows sandbox helper is unavailable',
    };
  }
  return { platform: 'unsupported', available: false, reason: 'platform is unsupported' };
};

/** Build a fail-closed, workspace-only command invocation. */
export const buildLocalSandboxCommand = (
  command: string,
  workspace: string,
  env: NodeJS.ProcessEnv = process.env,
): LocalSandboxCommand => {
  const root = path.resolve(workspace);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Sandbox workspace does not exist: ${root}`);
  }
  const status = getLocalSandboxStatus();
  if (!status.available || !status.executable) {
    throw new Error(`Local sandbox unavailable: ${status.reason ?? 'unknown reason'}`);
  }
  if (status.platform === 'macos') {
    const profile = `(version 1) (deny network*) (allow process*) (allow file-read*) (allow file-write* (subpath "${root.replaceAll('"', '\\"')}"))`;
    return { argv: [status.executable, '-p', profile, '/bin/sh', '-c', command], cwd: root, env };
  }
  if (status.platform === 'windows') {
    return {
      argv: [status.executable, '--workspace', root, '--deny-network', '--', 'cmd.exe', '/d', '/s', '/c', command],
      cwd: root,
      env: { ...env, USERPROFILE: root, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' },
    };
  }
  const dev = process.env.WULU_SANDBOX_DEV ?? '/dev';
  return {
    argv: [status.executable, '--die-with-parent', '--unshare-all', '--new-session', '--ro-bind', '/', '/', '--bind', root, root, '--dev-bind', dev, '/dev', '--proc', '/proc', '--chdir', root, '/bin/sh', '-c', command],
    cwd: root,
    env: { ...env, HOME: root, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' },
  };
};
