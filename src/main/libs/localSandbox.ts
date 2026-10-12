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

const findExecutable = (names: string[]): string | undefined => {
  const searchPath = process.env.PATH?.split(path.delimiter) ?? [];
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
    const executable = findExecutable(['sandbox-exec']);
    return executable
      ? { platform: 'macos', available: true, executable }
      : { platform: 'macos', available: false, reason: 'sandbox-exec is unavailable' };
  }
  if (process.platform === 'linux') {
    const executable = findExecutable(['bwrap', 'bubblewrap']);
    return executable
      ? { platform: 'linux', available: true, executable }
      : { platform: 'linux', available: false, reason: 'bubblewrap is unavailable' };
  }
  if (process.platform === 'win32') {
    return {
      platform: 'windows',
      available: false,
      reason: 'Windows restricted-token backend is not installed',
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
  const dev = process.env.WULU_SANDBOX_DEV ?? '/dev';
  return {
    argv: [status.executable, '--die-with-parent', '--unshare-all', '--new-session', '--ro-bind', '/', '/', '--bind', root, root, '--dev-bind', dev, '/dev', '--proc', '/proc', '--chdir', root, '/bin/sh', '-c', command],
    cwd: root,
    env: { ...env, HOME: root, HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' },
  };
};
