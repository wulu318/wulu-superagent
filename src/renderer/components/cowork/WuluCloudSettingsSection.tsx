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
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationHint, setVerificationHint] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cloudUser, setCloudUser] = useState<{
    id: string; email: string; displayName: string; role: string;
    planId: string | null; quotaRemaining: number; quotaTotal: number;
  } | null>(null);
  const [subscription, setSubscription] = useState<{
    active: boolean; planName?: string; quotaMonthly?: number; expiresAt?: number;
  } | null>(null);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; description: string; priceMonthly: number; quotaMonthly: number; modelAccess: string[] }> | null>(null);
  const [usage, setUsage] = useState<{ daily: Array<Record<string, unknown>>; models: Array<Record<string, unknown>> } | null>(null);
  const [cloudMemories, setCloudMemories] = useState<Array<Record<string, unknown>>>([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [cloudDataError, setCloudDataError] = useState('');

  const isLoggedIn = wuluCloudToken.length > 0;

  // On mount, if we have a token, try to fetch profile
  React.useEffect(() => {
    import('../../services/cowork').then(({ coworkService }) => coworkService.wuluCloudGetPlans())
      .then((result) => { if (result.success) setPlans(result.plans || []); else setCloudDataError(result.error || 'Failed to load plans'); })
      .catch((error) => setCloudDataError(String(error)));
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
      const [usageResult, memoriesResult] = await Promise.all([
        coworkService.wuluCloudGetUsage({ token: wuluCloudToken }),
        coworkService.wuluCloudListMemory({ token: wuluCloudToken }),
      ]);
      if (usageResult.success && usageResult.data) setUsage(usageResult.data);
      if (memoriesResult.success && memoriesResult.data) setCloudMemories(memoriesResult.data);
      const dataError = usageResult.error || memoriesResult.error || '';
      setCloudDataError(dataError);
      if (!profileResult.success || !subResult.success) {
        setErrorMsg(profileResult.error || subResult.error || i18nService.t('wuluCloudProfileLoadFailed'));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : i18nService.t('wuluCloudProfileLoadFailed'));
    }
  }, [wuluCloudToken]);

  React.useEffect(() => {
    if (wuluCloudToken) void loadProfile();
    else { setCloudUser(null); setSubscription(null); setUsage(null); setCloudMemories([]); }
  }, [wuluCloudToken, loadProfile]);

  const addCloudMemory = useCallback(async () => {
    const content = memoryDraft.trim();
    if (!content) return;
    const { coworkService } = await import('../../services/cowork');
    const result = await coworkService.wuluCloudCreateMemory({ token: wuluCloudToken, content });
    if (result.success) {
      setMemoryDraft('');
      const refreshed = await coworkService.wuluCloudListMemory({ token: wuluCloudToken });
      if (refreshed.success && refreshed.data) setCloudMemories(refreshed.data);
    } else {
      setCloudDataError(result.error || 'Failed to save cloud memory');
    }
  }, [memoryDraft, wuluCloudToken]);

  const deleteCloudMemory = useCallback(async (id: string) => {
    const { coworkService } = await import('../../services/cowork');
    const result = await coworkService.wuluCloudDeleteMemory({ token: wuluCloudToken, id });
    if (result.success) setCloudMemories(items => items.filter(item => item.id !== id));
    else setCloudDataError(result.error || 'Failed to delete cloud memory');
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
        const saved = await coworkService.updateConfig({ wuluCloudEnabled: true, wuluCloudEmail: email.trim(), wuluCloudToken: result.token });
        if (!saved) throw new Error(i18nService.t('coworkConfigSaveFailed'));
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
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setStatus('error');
      setErrorMsg('Password must be at least 8 characters and contain a letter and a number.');
      return;
    }
    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setStatus('error');
      setErrorMsg('Enter the 6-digit email verification code.');
      return;
    }
    setStatus('loading');
    setErrorMsg(null);
    try {
      const { coworkService } = await import('../../services/cowork');
      const result = await coworkService.wuluCloudRegister({
        email: email.trim(),
        password,
        verificationCode: verificationCode.trim(),
        displayName: displayName.trim() || undefined,
      });
      if (result.success && result.token) {
        const saved = await coworkService.updateConfig({ wuluCloudEnabled: true, wuluCloudEmail: email.trim(), wuluCloudToken: result.token });
        if (!saved) throw new Error(i18nService.t('coworkConfigSaveFailed'));
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
  }, [email, password, displayName, verificationCode, onWuluCloudEnabledChange, onWuluCloudEmailChange, onWuluCloudTokenChange]);

  const handleSendVerificationCode = useCallback(async () => {
    if (!email.trim()) {
      setStatus('error');
      setErrorMsg(i18nService.t('wuluCloudMissingFields'));
      return;
    }
    setSendingCode(true);
    setErrorMsg(null);
    setVerificationHint('');
    try {
      const { coworkService } = await import('../../services/cowork');
      const result = await coworkService.wuluCloudSendVerificationCode({ email: email.trim() });
      if (!result.success) throw new Error(result.error || 'Could not send verification code');
      setVerificationHint(result.code
        ? i18nService.t('wuluCloudDevCode').replace('{code}', result.code)
        : i18nService.t('wuluCloudCodeSent').replace('{minutes}', String(Math.ceil((result.expiresIn || 600) / 60))));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingCode(false);
    }
  }, [email]);

  const handleLogout = useCallback(async () => {
    const { authService } = await import('../../services/auth');
    await authService.logout();
    onWuluCloudEnabledChange(false);
    onWuluCloudTokenChange('');
    setCloudUser(null);
    setSubscription(null);
    setStatus('idle');
    setPassword('');
  }, [onWuluCloudEnabledChange, onWuluCloudTokenChange]);

  const formatTimestamp = (ts: number | undefined): string => {
    if (!ts) return '--';
    return new Date(ts < 10_000_000_000 ? ts * 1000 : ts).toLocaleDateString();
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
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="text-xs font-medium text-foreground">{i18nService.t('wuluCloudUsageAndMemory')}</div>
              {cloudDataError && <div className="text-xs text-red-500">{cloudDataError}</div>}
              {usage && <div className="text-xs text-secondary">{i18nService.t('wuluCloudRecentUsage')}: {usage.daily.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0).toLocaleString()} tokens · {usage.models.length} models</div>}
              <div className="flex gap-2">
                <input value={memoryDraft} onChange={event => setMemoryDraft(event.target.value)} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs" placeholder={i18nService.t('wuluCloudMemoryPlaceholder')} />
                <button type="button" onClick={addCloudMemory} className="rounded border border-border px-2 text-xs">{i18nService.t('wuluCloudSaveMemory')}</button>
              </div>
              <div className="max-h-32 space-y-1 overflow-auto">
                {cloudMemories.map(item => (
                  <div key={String(item.id)} className="flex items-start justify-between gap-2 text-xs text-secondary">
                    <span className="line-clamp-2">{String(item.content || '')}</span>
                    <button type="button" onClick={() => deleteCloudMemory(String(item.id))} className="shrink-0 text-red-500">{i18nService.t('wuluCloudDeleteMemory')}</button>
                  </div>
                ))}
                {!cloudMemories.length && <div className="text-xs text-secondary">{i18nService.t('wuluCloudNoMemories')}</div>}
              </div>
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

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Email verification code / 邮箱验证码</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 digits"
                    className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm border-border bg-surface font-mono"
                  />
                  <button type="button" disabled={sendingCode} onClick={handleSendVerificationCode} className="rounded-lg border border-border px-3 py-2 text-xs text-foreground disabled:opacity-50">
                    {sendingCode ? 'Sending…' : 'Send code'}
                  </button>
                </div>
                {verificationHint && <div className="mt-1 text-xs text-green-600 dark:text-green-400">{verificationHint}</div>}
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

      <div className="space-y-2 rounded-xl border px-4 py-4 border-border">
        <div className="text-sm font-medium text-foreground">Plans / 套餐</div>
          {plans === null ? (
          <div className="text-xs text-secondary">Loading plans…</div>
        ) : plans.length === 0 ? (
          <div className="text-xs text-secondary">Could not load plans from the backend.</div>
        ) : plans.map((plan) => (
          <div key={plan.id} className="rounded-lg border border-border px-3 py-2">
            <div className="flex justify-between gap-3 text-xs">
              <span className="font-medium text-foreground">{plan.name}</span>
              <span className="text-secondary">{plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}/month`}</span>
            </div>
            <div className="mt-1 text-xs text-secondary">{formatTokens(plan.quotaMonthly)} quota · {plan.modelAccess.join(', ') || 'All models'}</div>
            {plan.priceMonthly > 0 && <div className="mt-1 text-xs text-amber-600">Paid checkout is not configured yet.</div>}
          </div>
        ))}
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
