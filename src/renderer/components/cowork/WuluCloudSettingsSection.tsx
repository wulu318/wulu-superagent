import React, { useCallback, useState } from 'react';

import { i18nService } from '../../services/i18n';

interface WuluCloudSettingsSectionProps {
  wuluCloudEnabled: boolean;
  wuluCloudEmail: string;
  wuluCloudToken: string;
  onWuluCloudEnabledChange: (value: boolean) => void;
  onWuluCloudEmailChange: (value: string) => void;
  onWuluCloudTokenChange: (value: string) => void;
}

const WuluCloudSettingsSection: React.FC<WuluCloudSettingsSectionProps> = ({
  wuluCloudEnabled: _wuluCloudEnabled,
  wuluCloudEmail: _wuluCloudEmail,
  wuluCloudToken,
  onWuluCloudEnabledChange,
  onWuluCloudEmailChange,
  onWuluCloudTokenChange,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(_wuluCloudEmail || '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloudUser, setCloudUser] = useState<{
    id: string; email: string; displayName: string; role: string;
    planId: string | null; quotaRemaining: number; quotaTotal: number;
  } | null>(null);
  const [subscription, setSubscription] = useState<{
    active: boolean; planName?: string; quotaMonthly?: number; expiresAt?: number;
  } | null>(null);

  const isLoggedIn = wuluCloudToken.length > 0;

  // On mount, if we have a token, try to fetch profile
  React.useEffect(() => {
    if (wuluCloudToken) {
      loadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const { coworkService } = await import('../../services/cowork');
      const [profileResult, subResult] = await Promise.all([
        coworkService.wuluCloudGetProfile(wuluCloudToken),
        coworkService.wuluCloudGetSubscription(wuluCloudToken),
      ]);
      if (profileResult.success && profileResult.user) {
        setCloudUser(profileResult.user);
      }
      if (subResult.success && subResult.subscription) {
        setSubscription(subResult.subscription);
      }
    } catch {
      // Token might be expired, ignore
    }
  }, [wuluCloudToken]);

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setStatus('error');
      setErrorMsg(i18nService.t('wuluCloudMissingFields'));
      return;
    }
    setStatus('loading');
    setErrorMsg(null);
    try {
      const { coworkService } = await import('../../services/cowork');
      const result = await coworkService.wuluCloudLogin({ email: email.trim(), password });
      if (result.success && result.token) {
        setStatus('success');
        onWuluCloudEnabledChange(true);
        onWuluCloudEmailChange(email.trim());
        onWuluCloudTokenChange(result.token);
        if (result.user) setCloudUser(result.user);
        // Load subscription
        const subResult = await coworkService.wuluCloudGetSubscription(result.token);
        if (subResult.success && subResult.subscription) {
          setSubscription(subResult.subscription);
        }
      } else {
        setStatus('error');
        setErrorMsg(result.error || i18nService.t('wuluCloudLoginFailed'));
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [email, password, onWuluCloudEnabledChange, onWuluCloudEmailChange, onWuluCloudTokenChange]);

  const handleRegister = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setStatus('error');
      setErrorMsg(i18nService.t('wuluCloudMissingFields'));
      return;
    }
    if (password.length < 6) {
      setStatus('error');
      setErrorMsg(i18nService.t('wuluCloudPasswordTooShort'));
      return;
    }
    setStatus('loading');
    setErrorMsg(null);
    try {
      const { coworkService } = await import('../../services/cowork');
      const result = await coworkService.wuluCloudRegister({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      if (result.success && result.token) {
        setStatus('success');
        onWuluCloudEnabledChange(true);
        onWuluCloudEmailChange(email.trim());
        onWuluCloudTokenChange(result.token);
        setCloudUser(result.user ? { ...result.user, planId: null, quotaRemaining: 0, quotaTotal: 0 } : null);
      } else {
        setStatus('error');
        setErrorMsg(result.error || i18nService.t('wuluCloudRegisterFailed'));
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [email, password, displayName, onWuluCloudEnabledChange, onWuluCloudEmailChange, onWuluCloudTokenChange]);

  const handleLogout = useCallback(() => {
    onWuluCloudEnabledChange(false);
    onWuluCloudTokenChange('');
    setCloudUser(null);
    setSubscription(null);
    setStatus('idle');
    setPassword('');
  }, [onWuluCloudEnabledChange, onWuluCloudTokenChange]);

  const formatTimestamp = (ts: number | undefined): string => {
    if (!ts) return '--';
    return new Date(ts * 1000).toLocaleDateString();
  };

  const formatTokens = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${n}`;
  };

  return (
    <div className="space-y-4">
      {/* Cloud Mode Section */}
      <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">☁️</span>
          <span className="text-sm font-medium text-foreground">
            {i18nService.t('wuluCloudModeTitle')}
          </span>
        </div>
        <div className="text-xs text-secondary mb-3">
          {i18nService.t('wuluCloudModeDesc')}
        </div>

        {isLoggedIn && cloudUser ? (
          /* Logged in state */
          <div className="space-y-3">
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-3 space-y-1">
              <div className="text-xs font-medium text-green-600 dark:text-green-400">
                {i18nService.t('wuluCloudLoginSuccess')}
              </div>
              <div className="text-xs text-secondary">
                {cloudUser.displayName} ({cloudUser.email})
              </div>
              {subscription && subscription.active && (
                <>
                  <div className="text-xs text-secondary">
                    {i18nService.t('wuluCloudSubscription')}: {subscription.planName || 'Free'}
                  </div>
                  <div className="text-xs text-secondary">
                    {i18nService.t('wuluCloudQuotaRemaining')}: {formatTokens(cloudUser.quotaRemaining)} / {formatTokens(cloudUser.quotaTotal)} {i18nService.t('wuluCloudQuotaTokens')}
                  </div>
                  {subscription.expiresAt && (
                    <div className="text-xs text-secondary">
                      {i18nService.t('wuluCloudExpiresAt')}: {formatTimestamp(subscription.expiresAt)}
                    </div>
                  )}
                </>
              )}
              {!subscription?.active && (
                <div className="text-xs text-secondary">
                  {i18nService.t('wuluCloudNoSubscription')}
                </div>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border border-red-500/30 text-red-600 hover:bg-red-500/5 transition-colors"
              >
                {i18nService.t('wuluCloudLogout')}
              </button>
            </div>
          </div>
        ) : (
          /* Not logged in — login/register form */
          <div className="space-y-3">
            {/* Toggle login/register */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('login'); setStatus('idle'); setErrorMsg(null); }}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  mode === 'login' ? 'bg-primary text-white' : 'border border-border text-secondary hover:bg-current/5'
                }`}
              >
                {i18nService.t('wuluCloudLogin')}
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setStatus('idle'); setErrorMsg(null); }}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  mode === 'register' ? 'bg-primary text-white' : 'border border-border text-secondary hover:bg-current/5'
                }`}
              >
                {i18nService.t('wuluCloudRegister')}
              </button>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {i18nService.t('wuluCloudEmail')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {i18nService.t('wuluCloudPassword')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
              />
            </div>

            {/* Display Name (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  {i18nService.t('wuluCloudEmail') !== i18nService.t('wuluCloudPassword') ? 'Display Name' : 'Display Name'}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface"
                />
              </div>
            )}

            {/* Submit button */}
            <div className="pt-1">
              <button
                type="button"
                disabled={status === 'loading'}
                onClick={mode === 'login' ? handleLogin : handleRegister}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {status === 'loading' && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {mode === 'login' ? i18nService.t('wuluCloudLogin') : i18nService.t('wuluCloudRegister')}
              </button>
            </div>

            {/* Error */}
            {status === 'error' && errorMsg && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-3">
                <div className="text-xs text-red-600 dark:text-red-400">{errorMsg}</div>
              </div>
            )}

            {/* Success (register) */}
            {status === 'success' && mode === 'register' && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-3">
                <div className="text-xs text-green-600 dark:text-green-400">
                  {i18nService.t('wuluCloudRegisterSuccess')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-secondary">— {i18nService.t('wuluOfflineModeTitle')} —</span>
        <div className="flex-1 border-t border-border" />
      </div>

      {/* Offline Mode description */}
      <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🔌</span>
          <span className="text-sm font-medium text-foreground">
            {i18nService.t('wuluOfflineModeTitle')}
          </span>
        </div>
        <div className="text-xs text-secondary">
          {i18nService.t('wuluOfflineModeDesc')}
        </div>
      </div>
    </div>
  );
};

export default WuluCloudSettingsSection;
