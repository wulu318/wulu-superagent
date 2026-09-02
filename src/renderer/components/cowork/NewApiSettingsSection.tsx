import React, { useCallback, useState } from 'react';

import { i18nService } from '../../services/i18n';

interface NewApiSettingsSectionProps {
  newApiEnabled: boolean;
  newApiBaseUrl: string;
  newApiApiKey: string;
  onNewApiEnabledChange: (value: boolean) => void;
  onNewApiBaseUrlChange: (value: string) => void;
  onNewApiApiKeyChange: (value: string) => void;
}

const NewApiSettingsSection: React.FC<NewApiSettingsSectionProps> = ({
  newApiEnabled,
  newApiBaseUrl,
  newApiApiKey,
  onNewApiEnabledChange,
  onNewApiBaseUrlChange,
  onNewApiApiKeyChange,
}) => {
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [loginResult, setLoginResult] = useState<{
    user?: { username: string; displayName: string; email: string };
    quota?: { usedQuota: number; totalQuota: number };
  } | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleTestLogin = useCallback(async () => {
    if (!newApiBaseUrl.trim() || !newApiApiKey.trim()) {
      setLoginStatus('error');
      setLoginError(i18nService.t('newApiMissingFields'));
      return;
    }
    setLoginStatus('loading');
    setLoginError(null);
    setLoginResult(null);
    try {
      const { coworkService } = await import('../../services/cowork');
      const result = await coworkService.newApiLogin({
        baseUrl: newApiBaseUrl.trim(),
        apiKey: newApiApiKey.trim(),
      });
      if (result.success) {
        setLoginStatus('success');
        setLoginResult({
          user: result.user,
          quota: result.quota
            ? { usedQuota: result.quota.usedQuota, totalQuota: result.quota.totalQuota }
            : undefined,
        });
      } else {
        setLoginStatus('error');
        setLoginError(result.error ?? i18nService.t('newApiLoginFailed'));
      }
    } catch (err) {
      setLoginStatus('error');
      setLoginError(err instanceof Error ? err.message : String(err));
    }
  }, [newApiBaseUrl, newApiApiKey]);

  const formatQuota = (used: number, total: number): string => {
    if (total <= 0) return '--';
    const usedK = (used / 1000).toFixed(1);
    const totalK = (total / 1000).toFixed(1);
    return `${usedK}K / ${totalK}K`;
  };

  return (
    <div className="space-y-4">
      {/* Master Switch */}
      <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">
              {i18nService.t('newApiEnabled')}
            </div>
            <div className="text-xs text-secondary mt-0.5">
              {i18nService.t('newApiEnabledHint')}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={newApiEnabled}
            onClick={() => onNewApiEnabledChange(!newApiEnabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              newApiEnabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                newApiEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {newApiEnabled && (
        <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {i18nService.t('newApiBaseUrl')}
            </label>
            <input
              type="text"
              value={newApiBaseUrl}
              onChange={(e) => onNewApiBaseUrlChange(e.target.value)}
              placeholder="https://api.example.com"
              className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
            />
            <div className="text-xs text-secondary mt-1">
              {i18nService.t('newApiBaseUrlHint')}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              {i18nService.t('newApiApiKey')}
            </label>
            <input
              type="password"
              value={newApiApiKey}
              onChange={(e) => onNewApiApiKeyChange(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
            />
            <div className="text-xs text-secondary mt-1">
              {i18nService.t('newApiApiKeyHint')}
            </div>
          </div>

          {/* Test Login */}
          <div className="pt-2">
            <button
              type="button"
              disabled={loginStatus === 'loading'}
              onClick={handleTestLogin}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loginStatus === 'loading' && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {i18nService.t('newApiTestLogin')}
            </button>
          </div>

          {/* Login Result */}
          {loginStatus === 'success' && loginResult && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-3 space-y-1">
              <div className="text-xs font-medium text-green-600 dark:text-green-400">
                {i18nService.t('newApiLoginSuccess')}
              </div>
              {loginResult.user && (
                <div className="text-xs text-secondary">
                  {loginResult.user.displayName} ({loginResult.user.username})
                  {loginResult.user.email ? ` - ${loginResult.user.email}` : ''}
                </div>
              )}
              {loginResult.quota && (
                <div className="text-xs text-secondary">
                  {i18nService.t('newApiQuota')}: {formatQuota(loginResult.quota.usedQuota, loginResult.quota.totalQuota)}
                </div>
              )}
            </div>
          )}

          {loginStatus === 'error' && loginError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-3">
              <div className="text-xs text-red-600 dark:text-red-400">{loginError}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NewApiSettingsSection;
