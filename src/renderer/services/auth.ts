import { ProviderName } from '@shared/providers';

import { store } from '../store';
import {
  setAuthLoading,
  setLoggedIn,
  setLoggedOut,
  setProfileSummary,
  updateQuota,
  type UserProfile,
  type UserQuota,
} from '../store/slices/authSlice';
import type { Model } from '../store/slices/modelSlice';
import {
  clearServerModels,
  setServerModels,
} from '../store/slices/modelSlice';

interface AuthStateRefreshResult {
  isLoggedIn: boolean;
  user: UserProfile | null;
  quota: UserQuota | null;
}

export interface PricingCatalogTextModel {
  modelId?: string;
  modelName?: string;
  provider?: string;
  providerLabel?: string;
  description?: string;
  supportsImage?: boolean;
  supportsThinking?: boolean;
  contextWindow?: number | null;
  costMultiplier?: number;
}

export interface PricingCatalogResponse {
  textModels?: PricingCatalogTextModel[];
  imageModels?: unknown[];
  videoModels?: unknown[];
}

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const readPositiveNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
);

type AuthRendererLogLevel = 'debug' | 'info' | 'warn';

const writeAuthRendererLog = (
  level: AuthRendererLogLevel,
  message: string,
  error?: unknown,
): void => {
  if (level === 'warn') {
    if (error === undefined) {
      console.warn(`[Auth] ${message}`);
    } else {
      console.warn(`[Auth] ${message}:`, error);
    }
  } else if (level === 'debug') {
    console.debug(`[Auth] ${message}`);
  } else {
    console.log(`[Auth] ${message}`);
  }

  try {
    window.electron?.log?.fromRenderer?.(level, 'AuthService', message);
  } catch {
    // Logging is best-effort and must never interrupt authentication.
  }
};

export function mapPricingCatalogTextModelsToServerModels(
  textModels: PricingCatalogTextModel[],
): Model[] {
  return textModels.flatMap((model): Model[] => {
    const modelId = readString(model.modelId);
    if (!modelId) return [];

    const modelName = readString(model.modelName) || modelId;
    const provider = readString(model.providerLabel)
      || readString(model.provider)
      || 'WULU';
    const contextWindow = readPositiveNumber(model.contextWindow);
    const costMultiplier = readPositiveNumber(model.costMultiplier);

    return [{
      id: modelId,
      name: modelName,
      provider,
      providerKey: ProviderName.WULUServer,
      isServerModel: true,
      supportsImage: model.supportsImage === true,
      supportsThinking: model.supportsThinking === true,
      description: readString(model.description) || undefined,
      costMultiplier,
      contextWindow,
      accessible: false,
    }];
  });
}

export function mapPricingCatalogToPublicServerModels(
  catalog: PricingCatalogResponse,
): Model[] {
  return mapPricingCatalogTextModelsToServerModels(
    Array.isArray(catalog.textModels) ? catalog.textModels : [],
  );
}

class AuthService {
  private unsubCallback: (() => void) | null = null;
  private unsubQuotaChanged: (() => void) | null = null;
  private unsubWindowState: (() => void) | null = null;
  private lastRefreshTime = 0;
  private loginAttemptSequence = 0;

  /**
   * Initialize: try to restore login state from persisted token.
   */
  async init() {
    // Clean up any existing listeners to prevent stacking on repeated init()
    this.destroy();

    store.dispatch(setAuthLoading(true));

    // Listen for OAuth callback from protocol handler
    this.unsubCallback = window.electron.auth.onCallback(async ({ code }) => {
      await this.handleCallback(code);
    });

    try {
      const pendingCode = await window.electron.auth.getPendingCallback();
      let handledPendingCode = false;
      if (pendingCode) {
        handledPendingCode = await this.handleCallback(pendingCode);
      }
      if (!handledPendingCode) {
        await this.refreshAuthState({ clearOnFailure: true });
      }
    } catch {
      store.dispatch(setLoggedOut());
      store.dispatch(clearServerModels());
      await this.loadPublicPricingCatalogModels();
    }

    // Listen for quota changes (e.g. after cowork session using server model)
    this.unsubQuotaChanged = window.electron.auth.onQuotaChanged(() => {
      this.refreshQuota();
      void this.fetchProfileSummary();
      this.loadServerModels();
    });

    // Refresh quota and models when Electron window gains focus — user may have purchased on portal
    this.unsubWindowState = window.electron.window.onStateChanged((state) => {
      if (state.isFocused && store.getState().auth.isLoggedIn) {
        const now = Date.now();
        if (now - this.lastRefreshTime > 30_000) {
          this.lastRefreshTime = now;
          this.refreshQuota();
          void this.fetchProfileSummary();
          this.loadServerModels();
        }
      }
    });
  }

  /**
   * Initiate login (opens system browser).
   */
  async login() {
    const attemptId = ++this.loginAttemptSequence;
    writeAuthRendererLog('info', `login attempt ${attemptId} started`);

    try {
      const loginUrl = await this.fetchLoginUrl();
      const result = await window.electron.auth.login(loginUrl);
      if (result.success) {
        writeAuthRendererLog('info', `login attempt ${attemptId} handed off to the system browser`);
      } else {
        writeAuthRendererLog('warn', `login attempt ${attemptId} could not open the system browser`);
      }
    } catch (error) {
      writeAuthRendererLog('warn', `login attempt ${attemptId} failed before browser handoff`, error);
      throw error;
    }
  }

  /**
   * Fetch login URL from overmind, fallback to Portal login page.
   */
  private async fetchLoginUrl(): Promise<string> {
    const { getLoginOvermindUrl } = await import('./endpoints');
    const url = getLoginOvermindUrl();
    try {
      const response = await window.electron.api.fetch({
        url,
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (response.ok && typeof response.data === 'object' && response.data !== null) {
        const value = (response.data as any)?.data?.value;
        if (typeof value === 'string' && value.trim()) {
          writeAuthRendererLog('debug', 'resolved login URL from overmind');
          return value.trim();
        }
      }
    } catch (e) {
      writeAuthRendererLog('warn', 'failed to resolve login URL from overmind', e);
    }
    // Fallback: use Portal login page directly
    const { getPortalLoginUrl } = await import('./endpoints');
    writeAuthRendererLog('info', 'using fallback portal login URL');
    return getPortalLoginUrl();
  }

  /**
   * Handle OAuth callback with auth code.
   */
  async handleCallback(code: string): Promise<boolean> {
    writeAuthRendererLog('info', 'received login callback; starting token exchange');
    try {
      const result = await window.electron.auth.exchange(code);
      if (result.success) {
        writeAuthRendererLog('info', 'login callback exchange succeeded');
        store.dispatch(setLoggedIn({ user: result.user, quota: result.quota }));
        await this.loadServerModels();
        void this.fetchProfileSummary();
        this.refreshQuota();
        return true;
      }
      writeAuthRendererLog('warn', 'login callback exchange was rejected');
    } catch (e) {
      writeAuthRendererLog('warn', 'login callback exchange failed', e);
    }
    return false;
  }

  /**
   * Refresh the full auth snapshot from persisted tokens.
   */
  async refreshAuthState(
    options: { clearOnFailure?: boolean } = {},
  ): Promise<AuthStateRefreshResult> {
    try {
      const result = await window.electron.auth.getUser();
      if (result.success && result.user) {
        store.dispatch(setLoggedIn({ user: result.user, quota: result.quota }));
        await this.loadServerModels();
        void this.fetchProfileSummary();
        return { isLoggedIn: true, user: result.user, quota: result.quota ?? null };
      }
    } catch {
      // handled below
    }

    if (options.clearOnFailure) {
      store.dispatch(setLoggedOut());
      store.dispatch(clearServerModels());
      await this.loadPublicPricingCatalogModels();
    }

    const current = store.getState().auth;
    return {
      isLoggedIn: current.isLoggedIn,
      user: current.user,
      quota: current.quota,
    };
  }

  /**
   * Logout.
   */
  async logout() {
    await window.electron.auth.logout();
    store.dispatch(setLoggedOut());
    store.dispatch(clearServerModels());
    await this.loadPublicPricingCatalogModels();
  }

  /**
   * Refresh quota information.
   */
  async refreshQuota() {
    try {
      const result = await window.electron.auth.getQuota();
      if (result.success) {
        store.dispatch(updateQuota(result.quota));
      }
    } catch {
      // ignore
    }
  }

  /**
   * Fetch profile summary (credits breakdown).
   */
  async fetchProfileSummary() {
    try {
      const result = await window.electron.auth.getProfileSummary();
      if (result.success && result.data) {
        store.dispatch(setProfileSummary(result.data));
      }
    } catch {
      // ignore
    }
  }

  async claimCreditsFinalReward(campaignCode: string) {
    const result = await window.electron.auth.claimCreditsFinalReward(campaignCode);
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Claim failed');
    }
    await Promise.all([this.refreshQuota(), this.fetchProfileSummary()]);
    return result.data;
  }

  /**
   * Get current access token (for proxy API calls).
   */
  async getAccessToken(): Promise<string | null> {
    try {
      return await window.electron.auth.getAccessToken();
    } catch {
      return null;
    }
  }

  destroy() {
    this.unsubCallback?.();
    this.unsubCallback = null;
    this.unsubQuotaChanged?.();
    this.unsubQuotaChanged = null;
    this.unsubWindowState?.();
    this.unsubWindowState = null;
  }

  /**
   * Load available models from server and dispatch to store.
   */
  private async loadServerModels() {
    try {
      const modelsResult = await window.electron.auth.getModels();
      if (modelsResult.success && modelsResult.models) {
        const serverModels: Model[] = modelsResult.models.map((m: { modelId: string; modelName: string; provider: string; apiFormat: string; supportsImage?: boolean; supportsThinking?: boolean; contextWindow?: number; explicitContextCache?: boolean; costMultiplier?: number; description?: string; accessible?: boolean; restrictionHint?: string }) => ({
          id: m.modelId,
          name: m.modelName,
          provider: m.provider,
          providerKey: 'WULU-server',
          isServerModel: true,
          serverApiFormat: m.apiFormat,
          supportsImage: m.supportsImage ?? false,
          supportsThinking: m.supportsThinking ?? false,
          contextWindow: m.contextWindow,
          explicitContextCache: m.explicitContextCache ?? false,
          description: m.description,
          costMultiplier: m.costMultiplier,
          accessible: m.accessible ?? true,
          restrictionHint: m.restrictionHint ?? undefined,
        }));
        store.dispatch(setServerModels(serverModels));
        console.debug(`[Auth] loaded ${serverModels.length} server model(s) into renderer state`);
      } else {
        console.debug('[Auth] server model load returned no models');
      }
    } catch (error) {
      console.warn('[Auth] failed to load server models:', error);
    }
  }

  /**
   * Load public pricing catalog models for unauthenticated read-only display.
   */
  private async loadPublicPricingCatalogModels() {
    try {
      const catalogResult = await window.electron.auth.getPricingCatalog();
      if (!catalogResult.success || !catalogResult.textModels) {
        return;
      }
      const serverModels = mapPricingCatalogToPublicServerModels({
        textModels: catalogResult.textModels,
      });
      store.dispatch(setServerModels(serverModels));
    } catch {
      // ignore — public catalog is optional
    }
  }
}

export const authService = new AuthService();
