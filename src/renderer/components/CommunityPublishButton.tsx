import { useState } from 'react';

import type { CommunityKind } from '../../shared/community/constants';
import { getServerApiBaseUrl } from '../services/endpoints';
import { i18nService } from '../services/i18n';

export default function CommunityPublishButton({ kind }: { kind: CommunityKind }) {
  const [opening, setOpening] = useState(false);
  return (
    <button
      type="button"
      disabled={opening}
      className="non-draggable rounded-lg border border-border px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-raised"
      onClick={async () => {
        setOpening(true);
        try {
          const result = await window.electron.api.fetch({ url: `${getServerApiBaseUrl()}/api/community/capabilities`, method: 'GET', headers: { Accept: 'application/json' } });
          if (!result.ok || result.data?.available !== true) throw new Error('Community publishing is unavailable');
          await window.electron.shell.openExternal(`${getServerApiBaseUrl()}/community/?kind=${encodeURIComponent(kind)}`);
        } catch {
          window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('communityUnavailable') }));
        } finally { setOpening(false); }
      }}
      title={i18nService.t('communityPublishHint')}
    >
      {i18nService.t('communityPublish')}
    </button>
  );
}
