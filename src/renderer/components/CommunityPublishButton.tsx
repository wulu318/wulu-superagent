import { useState } from 'react';

import type { CommunityKind } from '../../shared/community/constants';
import { i18nService } from '../services/i18n';
import CommunityCreatorPanel from './CommunityCreatorPanel';

export default function CommunityPublishButton({ kind, onCreate }: { kind: CommunityKind; onCreate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="non-draggable rounded-lg border border-border px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface-raised"
        onClick={() => setOpen(true)}
        title={i18nService.t('communityPublishHint')}
      >
        {i18nService.t('communityPublish')}
      </button>
      {open && <CommunityCreatorPanel kind={kind} onClose={() => setOpen(false)} onCreate={onCreate} />}
    </>
  );
}
