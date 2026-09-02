import path from 'path';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';

type PluginConfig = {
  enabled: boolean;
  workingDirectory: string;
};

const FILE_PATH_ARG_KEYS = ['path', 'file_path', 'filePath', 'filepath', 'file'];
const FILE_OLDPATH_ARG_KEYS = ['oldPath', 'old_path'];
const EDIT_ARRAY_ARG_KEYS = ['edits', 'operations', 'changes'];
const PATCH_TEXT_ARG_KEYS = ['input', 'patch'];

// --- apply_patch envelope markers (mirrors the gateway's own extractor) ---
const ADD_FILE_MARKER = '*** Add File: ';
const DELETE_FILE_MARKER = '*** Delete File: ';
const UPDATE_FILE_MARKER = '*** Update File: ';
const MOVE_TO_MARKER = '*** Move to: ';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const parsePluginConfig = (value: unknown): PluginConfig => {
  const raw = isRecord(value) ? value : {};
  return {
    enabled: raw.enabled !== false,
    workingDirectory: typeof raw.workingDirectory === 'string' ? raw.workingDirectory.trim() : '',
  };
};

const readPatchText = (params: Record<string, unknown>): string | null => {
  const rawInput = params.input;
  if (typeof rawInput === 'string') return rawInput;
  if (isRecord(rawInput) && typeof rawInput.input === 'string') return rawInput.input;
  const rawPatch = params.patch;
  if (typeof rawPatch === 'string') return rawPatch;
  return null;
};

/**
 * Walk an apply_patch envelope and return every destination path found.
 * Mirrors the gateway's `extractApplyPatchTargetPaths`: recognizes
 * `*** Add File:`, `*** Update File:` (plus the optional `*** Move to:`
 * sub-marker that immediately follows), and `*** Delete File:`.
 */
const extractPatchPaths = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const paths: string[] = [];
  const seen = new Set<string>();
  const pushPath = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    paths.push(trimmed);
  };
  const readMarkerPath = (line: string, marker: string): string | null => {
    const startTrimmed = line.trimStart();
    if (!startTrimmed.startsWith('***')) return null;
    if (!startTrimmed.startsWith(marker)) return null;
    const candidate = startTrimmed.slice(marker.length).trimEnd();
    return candidate || null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const addPath = readMarkerPath(line, ADD_FILE_MARKER);
    if (addPath !== null) {
      pushPath(addPath);
      while (index + 1 < lines.length && lines[index + 1].startsWith('+')) index += 1;
      continue;
    }
    const deletePath = readMarkerPath(line, DELETE_FILE_MARKER);
    if (deletePath !== null) {
      pushPath(deletePath);
      continue;
    }
    const updatePath = readMarkerPath(line, UPDATE_FILE_MARKER);
    if (updatePath !== null) {
      pushPath(updatePath);
      let lookahead = index + 1;
      while (lookahead < lines.length && lines[lookahead].trim() === '') lookahead += 1;
      const movePath = readMarkerPath(lines[lookahead], MOVE_TO_MARKER);
      if (movePath !== null) {
        pushPath(movePath);
        lookahead += 1;
      }
      while (lookahead < lines.length) {
        if (lines[lookahead].trim() === '') {
          lookahead += 1;
          continue;
        }
        if (lines[lookahead].startsWith('***')) break;
        lookahead += 1;
      }
      index = lookahead - 1;
    }
  }
  return paths;
};

/**
 * Extract every path referenced by a tool call's parameters.
 * - Direct path params: path / file_path / filePath / filepath / file
 * - Rename old-path params: oldPath / old_path
 * - `edit`-style array params: edits / edit / changes (each item may carry
 *   `path` / `filePath` / `file`)
 * - `apply_patch` style: `input` / `patch` text in envelope grammar
 */
const extractPaths = (params: Record<string, unknown>): string[] => {
  const paths: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) paths.push(value.trim());
  };

  for (const key of FILE_PATH_ARG_KEYS) push(params[key]);
  for (const key of FILE_OLDPATH_ARG_KEYS) push(params[key]);

  for (const key of EDIT_POOL_ARG_KEYS) {
    const raw = params[key];
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (!isRecord(item)) continue;
      for (const subKey of FILE_PATH_ARG_KEYS) push(item[subKey]);
      for (const subKey of FILE_OLDPATH_ARG_KEYS) push(item[subKey]);
    }
  }

  const patchText = readPatchText(params);
  if (patchText) {
    paths.push(...extractPatchPaths(patchText));
  }

  return paths;
};

const isInsideWorkdir = (filePath: string, workdir: string): boolean => {
  if (!workdir) return true;
  const resolved = path.resolve(workdir, filePath);
  const normalizedWorkdir = path.resolve(workdir);
  const rel = path.relative(normalizedWorkdir, resolved);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

const plugin = {
  id: 'workspace-boundary',
  name: 'WorkspaceBoundary',
  description: 'Approves file tool calls that access paths outside the working directory.',
  configSchema: {
    parse(value: unknown): PluginConfig {
      return parsePluginConfig(value);
    },
  },
  register(api: OpenClawPluginApi) {
    const config = parsePluginConfig(api.pluginConfig);
    if (!config.enabled || !config.workingDirectory) {
      api.logger.info('[workspace-boundary] skipped: plugin not enabled or workingDirectory not set.');
      return;
    }

    const workdir = path.resolve(config.workingDirectory);

    // Session-scoped set of paths allowed via "allow-always"
    const sessionAllowList = new Map<string, Set<string>>();

    const getAllowList = (sessionKey: string | undefined): Set<string> | null => {
      if (!sessionKey) return null;
      if (!sessionAllowList.has(sessionKey)) {
        sessionAllowList.set(sessionKey, new Set());
      }
      return sessionAllowList.get(sessionKey)!;
    };

    api.registerHook('before_tool_call', (event: any, ctx: any) => {
      const params = event.params;
      if (!isRecord(params)) return;

      const filePaths = extractPaths(params);
      if (filePaths.length === 0) return;

      const sessionKey = ctx?.sessionKey;
      const allowList = getAllowList(sessionKey);

      const outsidePaths: string[] = [];
      for (const p of filePaths) {
        if (isInsideWorkdir(p, workdir)) continue;
        const resolved = path.resolve(workdir, p);
        if (allowList?.has(resolved)) continue;
        outsidePaths.push(p);
      }

      if (outsidePaths.length === 0) return;

      const description = outsidePaths.length === 1
        ? `Path: ${outsidePaths[0]}\nThis path is outside the working directory (${workdir}).`
        : `Paths outside the working directory (${workdir}):\n${outsidePaths.map((p) => `  - ${p}`).join('\n')}`;

      return {
        requireApproval: {
          title: 'Working directory boundary',
          description,
          severity: 'warning' as const,
          timeoutMs: 120_000,
          timeoutBehavior: 'deny' as const,
          allowedDecisions: ['allow-once', 'allow-always', 'deny'],
          pluginId: 'workspace-boundary',
          onResolution: (decision: string) => {
            if (decision === 'allow-always' && allowList) {
              for (const p of outsidePaths) {
                allowList.add(path.resolve(workdir, p));
              }
            }
          },
        },
      };
    });

    api.registerHook('session_end', (event: any, ctx: any) => {
      const sessionKey = ctx?.sessionKey;
      if (sessionKey && sessionAllowList.has(sessionKey)) {
        sessionAllowList.delete(sessionKey);
      }
    });

    api.logger.info(`[workspace-boundary] registered hooks (workdir=${workdir}).`);
  },
};

export default plugin;