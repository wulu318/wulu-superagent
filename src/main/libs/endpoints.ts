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
  return isTestModeEnabled()
    ? 'https://ai.005656.xyz'
    : 'https://ai.005656.xyz';
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => (
  isTestModeEnabled()
    ? 'https://ai.005656.xyz/api/update/check'
    : 'https://ai.005656.xyz/api/update/check'
);

export const getManualUpdateCheckUrl = (): string => (
  isTestModeEnabled()
    ? 'https://ai.005656.xyz/api/update/check-manual'
    : 'https://ai.005656.xyz/api/update/check-manual'
);

export const getFallbackDownloadUrl = (): string => (
  isTestModeEnabled()
    ? 'https://wulu-superagent.com/#/download-list'
    : 'https://wulu-superagent.com/#/download-list'
);

export const getSkillStoreUrl = (): string => (
  isTestModeEnabled()
    ? 'https://ai.005656.xyz/api/skill-store'
    : 'https://ai.005656.xyz/api/skill-store'
);

// Portal 页面
const PORTAL_BASE_TEST = 'https://wulu-superagent.com/portal#';
const PORTAL_BASE_PROD = 'https://wulu-superagent.com/portal#';

const getPortalBase = (): string => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => (
  isTestModeEnabled()
    ? 'https://ai.005656.xyz/api/kit-store'
    : 'https://ai.005656.xyz/api/kit-store'
);
