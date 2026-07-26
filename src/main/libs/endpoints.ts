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
    ? 'https://WULU-server.inner.youdao.com'
    : 'https://WULU-server.youdao.com';
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => (
  isTestModeEnabled()
    ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/update'
    : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/update'
);

export const getManualUpdateCheckUrl = (): string => (
  isTestModeEnabled()
    ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/update-manual'
    : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/update-manual'
);

export const getFallbackDownloadUrl = (): string => (
  isTestModeEnabled()
    ? 'https://WULU.inner.youdao.com/#/download-list'
    : 'https://WULU.youdao.com/#/download-list'
);

export const getSkillStoreUrl = (): string => (
  isTestModeEnabled()
    ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/skill-store'
    : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/skill-store'
);

// Portal 页面
const PORTAL_BASE_TEST = 'https://WULU.inner.youdao.com/portal#';
const PORTAL_BASE_PROD = 'https://WULU.youdao.com/portal#';

const getPortalBase = (): string => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => (
  isTestModeEnabled()
    ? 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/test/kit-store'
    : 'https://api-overmind.youdao.com/openapi/get/luna/hardware/WULU/prod/kit-store'
);
