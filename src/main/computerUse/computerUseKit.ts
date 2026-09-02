import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import {
  ComputerUseKitBundle,
  ComputerUseKitBundleIntegrity,
  ComputerUseKitId,
  ComputerUseKitMetadata,
  ComputerUseSkillId,
} from '../../shared/computerUse/constants';
import {
  type InstalledKitRecord,
  type InstalledKitSkills,
  type KitSkillMetadata,
  KitStoreKey,
} from '../../shared/kit/constants';
import { getCachedClientRemoteConfig } from '../libs/clientRemoteConfig';
import type { SqliteStore } from '../sqliteStore';
import { ComputerUseRuntime } from './computerUseRuntime';

const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_STATE_KEY = 'skills_state';
const DEFAULT_COMPUTER_USE_KIT_ICON_URL = 'https://ai.005656.xyz/runtime/computer-use-kit.png';
const COMPUTER_USE_MCP_REF = {
  id: ComputerUseKitId.BuiltIn,
  name: 'Computer Use',
  description: 'Built-in local Windows desktop control MCP server.',
};

// ─── Admin-overridable values ─────────────────────────────────────

export function resolveComputerUseKitBundleUrl(): string {
  const remote = getCachedClientRemoteConfig();
  return remote?.KIT_BUNDLE_COMPUTER_USE_URL?.trim() || ComputerUseKitBundle.BuiltIn;
}

export function resolveComputerUseKitBundleSha256(): string {
  const remote = getCachedClientRemoteConfig();
  return remote?.KIT_BUNDLE_COMPUTER_USE_SHA256?.trim() || ComputerUseKitBundleIntegrity.Sha256;
}

export function resolveComputerUseKitBundleSize(): number {
  const remote = getCachedClientRemoteConfig();
  const value = remote?.KIT_BUNDLE_COMPUTER_USE_SIZE?.trim();
  if (value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return ComputerUseKitBundleIntegrity.SizeBytes;
}

export function resolveComputerUseKitIconUrl(): string {
  const remote = getCachedClientRemoteConfig();
  return remote?.KIT_ICON_COMPUTER_USE_URL?.trim() || DEFAULT_COMPUTER_USE_KIT_ICON_URL;
}

type InstalledKitsMap = Record<string, InstalledKitRecord>;
type SkillStateMap = Record<string, { enabled: boolean }>;

export function isComputerUseKitSupportedPlatform(): boolean {
  return process.platform === ComputerUseRuntime.Platform
    && process.arch === ComputerUseRuntime.Arch;
}

export function buildComputerUseMarketplaceKit(): Record<string, unknown> {
  return {
    id: ComputerUseKitId.BuiltIn,
    name: ComputerUseKitMetadata.Name,
    description: ComputerUseKitMetadata.Description,
    icon: resolveComputerUseKitIconUrl(),
    author: 'WULU',
    version: ComputerUseRuntime.Version,
    tryAsking: [
      {
        en: 'Open Notepad and type a short note',
        zh: '打开记事本并输入一段简短笔记',
      },
      {
        en: 'List the desktop applications I can control',
        zh: '列出可以操作的桌面应用',
      },
    ],
    skills: {
      bundle: ComputerUseKitBundle.BuiltIn,
      bundleSha256: ComputerUseKitBundleIntegrity.Sha256,
      bundleSizeBytes: ComputerUseKitBundleIntegrity.SizeBytes,
      list: [
        {
          id: ComputerUseSkillId.BuiltIn,
          name: ComputerUseKitMetadata.SkillName,
          description: ComputerUseKitMetadata.SkillDescription,
        },
      ],
    },
    mcpServers: [COMPUTER_USE_MCP_REF],
    connectors: [],
  };
}

export function getInstalledKitsMap(store: SqliteStore): InstalledKitsMap {
  return store.get<InstalledKitsMap>(KitStoreKey.Installed) ?? {};
}

export function isComputerUseKitInstalled(store: SqliteStore): boolean {
  return isComputerUseKitSupportedPlatform()
    && Boolean(getInstalledKitsMap(store)[ComputerUseKitId.BuiltIn]);
}

export function buildInstalledComputerUseKitRecord(
  skillIds: string[],
  metadata: Record<string, KitSkillMetadata>,
): InstalledKitRecord {
  const skills: InstalledKitSkills = {
    skillIds,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
  return {
    id: ComputerUseKitId.BuiltIn,
    version: ComputerUseRuntime.Version,
    installedAt: Date.now(),
    skills,
    mcpServers: [COMPUTER_USE_MCP_REF],
    connectors: [],
  };
}

function getUserComputerUseSkillDir(): string {
  return path.join(app.getPath('userData'), SKILLS_DIR_NAME, ComputerUseSkillId.BuiltIn);
}

export function removeComputerUseSkillArtifacts(store: SqliteStore): void {
  fs.rmSync(getUserComputerUseSkillDir(), { recursive: true, force: true });
  const stateMap = store.get<SkillStateMap>(SKILL_STATE_KEY) ?? {};
  delete stateMap[ComputerUseSkillId.BuiltIn];
  store.set(SKILL_STATE_KEY, stateMap);
}
