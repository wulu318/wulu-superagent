import { ArrowPathIcon } from '@heroicons/react/20/solid';
import React, { useCallback, useEffect, useState } from 'react';

import { getServerApiBaseUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';

type FeatureStatus = { configured: boolean; missing?: string[] };
type StatusData = { image: FeatureStatus; video: FeatureStatus; realtimeAsr: FeatureStatus; speech?: FeatureStatus; transcription?: FeatureStatus };

const MediaServiceStatusSection: React.FC = () => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await window.electron?.auth?.getAccessToken();
      if (!token) throw new Error(i18nService.t('mediaStatusLoginRequired'));
      const endpoint = `${getServerApiBaseUrl()}/api/media/status`;
      let response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        await window.electron.auth.refreshToken();
        const refreshedToken = await window.electron.auth.getAccessToken();
        if (refreshedToken) response = await fetch(endpoint, { headers: { Authorization: `Bearer ${refreshedToken}` } });
      }
      const body = await response.json() as { code?: number; data?: StatusData; message?: string };
      if (!response.ok || body.code !== 0 || !body.data) {
        throw new Error(body.message || (response.status === 401 ? i18nService.t('mediaStatusLoginRequired') : `HTTP ${response.status}`));
      }
      setData(body.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const rows = [
    ['mediaStatusImage', data?.image],
    ['mediaStatusVideo', data?.video],
    ['mediaStatusAsr', data?.realtimeAsr],
    ['mediaStatusSpeech', data?.speech],
    ['mediaStatusTranscription', data?.transcription],
  ] as const;

  return (
    <section className="space-y-3 rounded-xl border border-border px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{i18nService.t('mediaStatusTitle')}</h3>
        <p className="mt-1 text-xs text-secondary">{i18nService.t('mediaStatusHint')}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:opacity-60">
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? i18nService.t('loading') : i18nService.t('mediaStatusRefresh')}
        </button>
      </div>
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="shrink-0 text-xs font-medium text-primary hover:underline disabled:opacity-60">
            {i18nService.t('mediaStatusRetry')}
          </button>
        </div>
      )}
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([labelKey, status]) => (
          <div key={labelKey} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
            <span className="text-foreground">{i18nService.t(labelKey)}</span>
            <span className={status?.configured ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
              {status ? i18nService.t(status.configured ? 'mediaStatusReady' : 'mediaStatusNeedsConfig') : '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MediaServiceStatusSection;
