import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import {
  CommunityAction, CommunityKind, type CommunityReview, type CommunitySource, CommunityStatus, type CommunitySubmission,
} from '../../shared/community/constants';
import { authService } from '../services/auth';
import { communityRequest, communityService, nextCommunityVersion } from '../services/community';
import { i18nService } from '../services/i18n';
import type { RootState } from '../store';
import Modal from './common/Modal';

const Pane = { Submit: 'submit', Mine: 'mine' } as const;
const statusKeys = {
  [CommunityStatus.Pending]: 'communityPending', [CommunityStatus.Approved]: 'communityApproved',
  [CommunityStatus.Rejected]: 'communityRejected', [CommunityStatus.Withdrawn]: 'communityWithdrawn',
};
const kindKeys = { [CommunityKind.Skill]: 'skills', [CommunityKind.Connector]: 'mcpServers', [CommunityKind.Expert]: 'kits' };
const inputClass = 'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary';
const buttonClass = 'rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-surface-raised disabled:opacity-50';

export default function CommunityCreatorPanel({ kind, onClose, onCreate }: { kind: CommunityKind; onClose: () => void; onCreate?: () => void }) {
  const t = (key: string) => i18nService.t(key);
  const loggedIn = useSelector((state: RootState) => state.auth.isLoggedIn || (state.cowork.config.wuluCloudEnabled && Boolean(state.cowork.config.wuluCloudToken)));
  const [pane, setPane] = useState<typeof Pane[keyof typeof Pane]>(Pane.Submit);
  const [items, setItems] = useState<CommunitySubmission[]>([]);
  const [sources, setSources] = useState<CommunitySource[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<CommunitySubmission | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [license, setLicense] = useState('MIT');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; reviews: CommunityReview[] } | null>(null);

  const load = useCallback(async () => {
    if (!loggedIn) { setItems([]); return; }
    setLoading(true); setError('');
    try {
      const local = await window.electron.community.sources(kind); setSources(local.sources);
      const data = await communityService.list(); setItems((data.items || []).filter(item => item.kind === kind));
    } catch (error) { setError(error instanceof Error ? error.message : i18nService.t('communityRequestFailed')); }
    finally { setLoading(false); }
  }, [kind, loggedIn]);
  useEffect(() => { void load(); }, [load]);
  const reset = () => {
    setEditing(null); setSelected([]); setName(''); setDescription(''); setVersion('1.0.0');
    setLicense('MIT'); setTags(''); setError(''); setNotice(''); setPane(Pane.Submit);
  };
  const choose = (source: CommunitySource) => {
    if (kind === CommunityKind.Expert) {
      const next = selected.includes(source.id) ? selected.filter(id => id !== source.id) : [...selected, source.id];
      setSelected(next);
      if (!name) setName(t('communityExpertDefaultName'));
      if (!editing) setDescription(sources.filter(item => next.includes(item.id)).map(item => item.description || item.name).join('\n'));
    } else {
      setSelected([source.id]); setName(source.name); setDescription(source.description || source.name);
      if (!editing) setVersion(source.version);
    }
  };
  const edit = (item: CommunitySubmission) => {
    reset(); setEditing(item); setName(item.payload.name); setDescription(item.payload.description);
    setVersion(item.published ? nextCommunityVersion(item.payload.version) : item.payload.version); setLicense(item.payload.license); setTags(item.payload.tags.join(', '));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const picked = sources.filter(source => selected.includes(source.id));
      if (!picked.length && !editing) throw new Error(t('communitySelectSource'));
      let uploadId = editing?.upload_id || undefined;
      if (kind !== CommunityKind.Connector && picked.length) {
        const packaged = await window.electron.community.uploadBundle(picked.map(source => source.id));
        if (packaged.status === 404) throw new Error(t('communityUnavailable'));
        if (packaged.status === 401) throw new Error(t('communityLoginRequired'));
        if (!packaged.success || !packaged.id) throw new Error(packaged.error || t('communityAutoPackageFailed'));
        uploadId = packaged.id;
      }
      await communityRequest({ action: editing ? CommunityAction.Update : CommunityAction.Submit, id: editing?.id, body: {
        kind, name: name.trim(), description: description.trim(), version: version.trim(), license: license.trim(),
        tags: tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
        ...(kind === CommunityKind.Connector ? { connector: picked[0]?.connector || editing?.payload.connector } : { uploadId }),
        ...(kind === CommunityKind.Expert ? { skills: picked.length ? picked.map(source => ({ id: source.bundleId || source.id, name: source.name, description: source.description })) : editing?.payload.skills } : {}),
        ...(editing ? { revision: editing.revision } : {}),
      } });
      setPane(Pane.Mine); setEditing(null); await load(); setNotice(t('communitySubmitted'));
    } catch (error) { setError(error instanceof Error ? error.message : t('communityRequestFailed')); }
    finally { setBusy(false); }
  };
  const withdraw = async (id: string) => {
    setBusy(true); setError('');
    try { await communityService.withdraw(id); setWithdrawId(null); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : t('communityRequestFailed')); }
    finally { setBusy(false); }
  };
  const showHistory = async (id: string) => {
    setBusy(true); setError('');
    try { const data = await communityService.history(id); setHistory({ id, reviews: data.reviews || [] }); }
    catch (error) { setError(error instanceof Error ? error.message : t('communityRequestFailed')); }
    finally { setBusy(false); }
  };

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} className="mx-4 flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-surface text-foreground shadow-modal">
      <div role="dialog" aria-modal="true" aria-labelledby="community-creator-title" className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div><h2 id="community-creator-title" className="text-lg font-semibold">{t('communityCreatorTitle')} · {t(kindKeys[kind])}</h2><p className="mt-1 text-xs text-secondary">{t('communityClientHint')}</p></div>
          <button type="button" onClick={onClose} disabled={busy} className={buttonClass}>{t('close')}</button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5">
          {!loggedIn ? <div className="space-y-4"><p>{t('communityLoginRequired')}</p><button type="button" className={buttonClass} onClick={() => { void authService.login().catch(() => setError(t('communityRequestFailed'))); }}>{t('login')}</button></div> : <>
            <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('communityCreatorTitle')}>
              <button type="button" disabled={busy} className={buttonClass} aria-pressed={pane === Pane.Submit} onClick={reset}>{t('communityNewSubmission')}</button>
              <button type="button" disabled={busy} className={buttonClass} aria-pressed={pane === Pane.Mine} onClick={() => setPane(Pane.Mine)}>{t('communityMySubmissions')}</button>
              <button type="button" disabled={busy || loading} className={buttonClass} onClick={() => { void load(); }}>{t('communityRefresh')}</button>
            </nav>
            {pane === Pane.Submit ? <form onSubmit={submit} className="space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                <div className="space-y-2"><p className="text-sm font-medium">{t(kind === CommunityKind.Expert ? 'communitySelectExpertSkills' : 'communitySelectSource')}</p>
                  {loading && <p>{t('loading')}</p>}
                  {!loading && sources.length === 0 && <div className="space-y-2"><p className="text-sm text-secondary">{t('communityNoLocalSources')}</p>{onCreate && <button type="button" className={buttonClass} onClick={() => { onClose(); onCreate(); }}>{t('communityCreateSkill')}</button>}</div>}
                  <div className="max-h-52 space-y-2 overflow-y-auto">{sources.map(source => <label key={source.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm"><input type={kind === CommunityKind.Expert ? 'checkbox' : 'radio'} name="community-source" checked={selected.includes(source.id)} onChange={() => choose(source)} className="mt-1" /><span><span className="font-medium">{source.name}</span><span className="mt-1 block text-xs text-secondary">{source.description}</span></span></label>)}</div>
                  {editing && selected.length === 0 && <p className="text-xs text-secondary">{t('communityKeepContent')}</p>}
                  <p className="text-xs text-secondary">{t('communityAutoPackageHint')}</p>
                </div>
                <label className="block text-sm">{t('communityName')}<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label>
                <label className="block text-sm">{t('communityDescription')}<textarea required maxLength={4000} rows={3} value={description} onChange={event => setDescription(event.target.value)} className={inputClass} /></label>
                <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm">{t('communityMoreSettings')}</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm">{t('communityVersion')}<input required value={version} onChange={event => setVersion(event.target.value)} className={inputClass} placeholder="1.0.0" /></label>
                  <label className="block text-sm">{t('communityLicense')}<input required maxLength={80} value={license} onChange={event => setLicense(event.target.value)} className={inputClass} /></label>
                  <label className="block text-sm">{t('communityTags')}<input value={tags} onChange={event => setTags(event.target.value)} className={inputClass} /></label>
                </div></details>
                {editing?.published && <p className="text-xs text-secondary">{t('communityVersionHint')}</p>}
                <p className="text-xs leading-5 text-secondary">{t('communityReviewHint')}</p>
                <button type="submit" disabled={!selected.length && !editing} className={`${buttonClass} bg-primary text-white`}>{busy ? t('communityAutoPackaging') : t('communitySubmitForReview')}</button>
              </fieldset>
            </form> : <div className="space-y-3">
              {loading && <p>{t('loading')}</p>}
              {!loading && items.length === 0 && !error && <p className="text-secondary">{t('communityEmpty')}</p>}
              {items.map(item => <article key={item.id} className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="font-medium">{item.payload.name} · {item.payload.version}</h3>
                <p className="text-xs text-secondary">{t(statusKeys[item.status] || 'communityPending')}{item.published ? ` · ${t('communityPublished')}` : ''}</p>
                <p className="whitespace-pre-wrap text-sm">{item.payload.description}</p>
                {item.review_note && <p className="whitespace-pre-wrap text-sm text-secondary">{t('communityReviewNote')}: {item.review_note}</p>}
                <div className="flex flex-wrap gap-2"><button disabled={busy} type="button" className={buttonClass} onClick={() => edit(item)}>{t('communityEdit')}</button><button disabled={busy} type="button" className={buttonClass} onClick={() => { void showHistory(item.id); }}>{t('communityHistory')}</button><button disabled={busy} type="button" className={buttonClass} onClick={() => setWithdrawId(item.id)}>{t('communityWithdraw')}</button></div>
                {withdrawId === item.id && <div className="space-y-2 rounded-lg bg-surface-raised p-3"><p className="text-sm">{t('communityWithdrawConfirm')}</p><button type="button" disabled={busy} className={buttonClass} onClick={() => { void withdraw(item.id); }}>{t('communityConfirm')}</button><button type="button" className={buttonClass} onClick={() => setWithdrawId(null)}>{t('cancel')}</button></div>}
                {history?.id === item.id && <div className="space-y-2 border-t border-border pt-2">{history.reviews.length === 0 ? <p>{t('communityNoHistory')}</p> : history.reviews.map((review, index) => <p key={index} className="whitespace-pre-wrap text-xs text-secondary">{new Date(review.created_at * 1000).toLocaleString()} · {t('communityRevision')} {review.revision} · {review.note}</p>)}</div>}
              </article>)}
            </div>}
          </>}
          {error && <p role="alert" className="mt-4 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">{error}</p>}
          {notice && <p role="status" className="mt-4 text-sm text-primary">{notice}</p>}
        </div>
      </div>
    </Modal>
  );
}
