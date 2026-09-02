import { getServerApiBaseUrl } from './endpoints';

export interface ClientRemoteConfig {
  RUNTIME_COMPUTER_USE_URL?: string;
  RUNTIME_COMPUTER_USE_SHA256?: string;
  RUNTIME_COMPUTER_USE_SIZE?: string;
  KIT_BUNDLE_COMPUTER_USE_URL?: string;
  KIT_BUNDLE_COMPUTER_USE_SHA256?: string;
  KIT_BUNDLE_COMPUTER_USE_SIZE?: string;
  KIT_ICON_COMPUTER_USE_URL?: string;
  SKIN_KIT_ICON_URL?: string;
}

let cachedConfig: ClientRemoteConfig | null = null;
let fetchPromise: Promise<ClientRemoteConfig> | null = null;

/**
 * Fetch the WULU backend client config (admin-overridable values).
 * Falls back to {} on any error so the client always keeps working
 * with its built-in defaults.
 */
export function fetchClientRemoteConfig(): Promise<ClientRemoteConfig> {
  if (fetchPromise) {
    return fetchPromise;
  }
  fetchPromise = (async () => {
    try {
      const response = await fetch(`${getServerApiBaseUrl()}/api/config`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return {};
      }
      const json = (await response.json()) as {
        data?: { config?: ClientRemoteConfig };
      };
      const config = json?.data?.config;
      cachedConfig = config && typeof config === 'object' ? config : {};
      return cachedConfig;
    } catch {
      cachedConfig = {};
      return cachedConfig;
    }
  })();
  return fetchPromise;
}

/** Synchronous access to the last fetched config (may be null before fetch). */
export function getCachedClientRemoteConfig(): ClientRemoteConfig | null {
  return cachedConfig;
}

/** Force a refresh (e.g. after app_config changes). */
export function resetClientRemoteConfigCache(): void {
  cachedConfig = null;
  fetchPromise = null;
}
