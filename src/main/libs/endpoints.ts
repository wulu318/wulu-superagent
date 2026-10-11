import { app } from 'electron';

import { HtmlSharePublicRoute } from '../../shared/htmlShare/constants';
import type { SqliteStore } from '../sqliteStore';

let cachedTestMode: boolean | null = null;

/**
 * Read testMode from store and cache it.
 * Call once at startup and again whenever app_config changes.
 */
export function refreshEndpointsTestMode(store: SqliteStore): void {
  const appConfig = store.get<any>('app_config');
  cachedTestMode = appConfig?.app?.testMode === true;
}

/**
 * Whether the app is in test mode.
 * Uses cached value after init; falls back to !app.isPackaged before init.
 */
export const isTestModeEnabled = (): boolean => {
  return cachedTestMode ?? !app.isPackaged;
};

/**
 * Server API base URL — switches based on testMode.
 * Used for auth exchange/refresh, models, proxy, etc.
 */
export const getServerApiBaseUrl = (): string => {
  const configured = process.env.WULU_SERVER_API_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return 'https://ai.005656.xyz';
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => `${getServerApiBaseUrl()}/api/update/check`;

export const getManualUpdateCheckUrl = (): string => `${getServerApiBaseUrl()}/api/update/check-manual`;

export const getFallbackDownloadUrl = (): string => `${getServerApiBaseUrl()}/download-list`;

export const getSkillStoreUrl = (): string => `${getServerApiBaseUrl()}/api/skill-store`;

// Portal 页面
const getPortalBase = (): string => `${getServerApiBaseUrl()}/portal#`;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => `${getServerApiBaseUrl()}/api/kit-store`;
