import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { EngineLearningPanel } from './engineLearning.jsx';
import { classifyAiError, aiErrorText } from './analysisProfileAiErrors.js';
import { trt, trDigits, trDate } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Knowledge" tab (ARCHITECTURE.md §7.25): the website / YouTube / PDF material a
// trader teaches this profile from. Three honest stages, each with its own cost:
//   1. ADD    - record a link (or upload a PDF). Free. A PDF is stored privately and counts toward the
//               trader's storage quota; a link is only recorded.
//   2. READ   - a link is fetched server-side (SSRF-hardened, POST /api/analysis-profiles/read-source)
//               into a title and a BOUNDED text digest. Free - no model is involved.
//   3. TEACH  - the digest (or, for a PDF, the file itself) goes through the SAME propose -> review ->
//               apply flow as a typed note (EngineLearningPanel with a `preset`). This is the only
//               step that spends AI tokens, and only on an explicit click.
// Sources are loaded lazily, only when this tab opens (never part of the boot-time replica hydrate).

const MAX_PDF_MB = 15;
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
const SOURCE_LIMIT = 40;

function store() { return window.TradeJournalAnalysisProfileStore; }
function aiClient() { return window.TradeJournalAnalysisProfileAI; }

const KIND_LABEL = { youtube: 'sourceKindYoutube', website: 'sourceKindWebsite', pdf: 'sourceKindPdf' };
const KIND_ICON = { youtube: 'youtube', website: 'globe', pdf: 'file-text' };
const STATUS_LABEL = { queued: 'sourceStatusQueued', ready: 'sourceStatusReady', taught: 'sourceStatusTaught', failed: 'sourceStatusFailed' };

// The stable codes the reader / storage / gateway return -> translated copy. Anything unrecognised is
// a generic failure, never a raw code shown to the trader.
function errorKeyFor(code) {
  const value = String(code || '');
  if (/^SOURCE_(ADDRESS_BLOCKED|PROTOCOL_UNSUPPORTED|PORT_UNSUPPORTED|URL_INVALID)$/.test(value)) return 'sourceErrBlocked';
  if (value === 'SOURCE_CONTENT_TYPE_UNSUPPORTED') return 'sourceErrNotReadable';
  if (value === 'SOURCE_TOO_LARGE') return 'sourceErrTooLarge';
  if (value === 'SOURCE_TIMEOUT' || value === 'ANALYSIS_PROFILE_AI_TIMEOUT') return 'sourceErrTimeout';
  if (/^SOURCE_(DNS_FAILED|TOO_MANY_REDIRECTS|FETCH_FAILED(_\d+)?)$/.test(value) || value === 'ANALYSIS_PROFILE_AI_NETWORK_ERROR') return 'sourceErrUnreachable';
  if (value === 'SOURCE_NOT_A_YOUTUBE_URL') return 'sourceErrNotVideo';
  if (value === 'ANALYSIS_PROFILE_SOURCE_DUPLICATE') return 'sourceErrDuplicate';
  if (value === 'ANALYSIS_PROFILE_SOURCE_LIMIT') return 'sourceErrLimit';
  if (value === 'STORAGE_QUOTA_EXCEEDED') return 'sourceErrQuota';
  if (value === 'INVALID_PDF_TYPE') return 'sourceErrPdfType';
  if (value === 'PDF_TOO_LARGE') return 'sourceErrPdfSize';
  if (value === 'MODEL_PDF_UNSUPPORTED') return 'sourceErrPdfProvider';
  return 'sourceErrGeneric';
}
function errorText(lang, code, status) {
  const key = errorKeyFor(code);
  // A code that is not one of the source-specific ones may still be a specific AI/connectivity failure (an expired session,
  // a dead proxy, a timeout, a quota): say which instead of the catch-all.
  if (key === 'sourceErrGeneric' && classifyAiError(code, status) !== 'generic') return aiErrorText(lang, code, status);
  return trt(lang, key, { n: trDigits(lang, key === 'sourceErrPdfSize' ? MAX_PDF_MB : SOURCE_LIMIT) });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}
// Some browsers/OSes report an empty or generic MIME for a .pdf file; the server checks the real
// bytes, so the declared type is normalised here rather than trusted from the picker.
const asPdfDataUrl = (dataUrl) => dataUrl.replace(/^data:[^,]*,/, 'data:application/pdf;base64,');

function StatusBadge({ lang, source }) {
  const tone = source.status === 'failed' ? 'var(--danger)' : source.status === 'taught' ? 'var(--success)' : source.status === 'ready' ? 'var(--char-accent)' : 'var(--text-dim)';
  return <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid currentColor', color: tone }}>{trt(lang, STATUS_LABEL[source.status] || 'sourceStatusQueued')}</span>;
}

const fieldStyle = {
  boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)',
  background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, outline: 'none'
};

function SourceRow({ lang, source, busy, transcript, onTranscript, onSaveTranscript, onRead, onTeach, onDelete, teaching }) {
  const isPdf = source.kind === 'pdf';
  const hasContent = isPdf ? source.fileAvailable !== false : Boolean(source.digest);
  const needsTranscript = source.kind === 'youtube' && source.status !== 'queued' && source.status !== 'failed' && !source.digest;
  const canRead = !isPdf && !busy;
  const heading = source.title || source.fileName || source.url;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderBottom: '1px solid var(--border-hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ flex: 'none', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--char-accent)', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
          <Icon name={KIND_ICON[source.kind] || 'link'} size={16} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{heading}</span>
            <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border-hairline)', color: 'var(--text-dim)' }}>{trt(lang, KIND_LABEL[source.kind] || 'sourceKindWebsite')}</span>
            <StatusBadge lang={lang} source={source} />
            {source.status === 'taught' && source.taughtUnderstandingVersion != null && (
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'understandingVersion', { n: trDigits(lang, source.taughtUnderstandingVersion) })}</span>
            )}
          </span>
          {!isPdf && source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" dir="ltr" title={trt(lang, 'openLink')}
              style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{source.url}</a>
          )}
          {isPdf && source.fileSizeBytes != null && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trDigits(lang, (source.fileSizeBytes / (1024 * 1024)).toFixed(2))} MB · {trDate(lang, source.createdAt)}</span>
          )}
          {source.status === 'failed' && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{errorText(lang, source.errorCode)}</span>}
          {isPdf && source.fileAvailable === false && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{trt(lang, 'fileRemoved')}</span>}
          {!isPdf && source.digest && (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{trt(lang, 'digestLabel')}</span>
              <span dir="auto" style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.digest}</span>
            </span>
          )}
        </span>
      </div>

      {needsTranscript && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.06)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-warm)' }}>{trt(lang, 'noTranscriptTitle')}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>{trt(lang, 'noTranscriptBody')}</span>
          <textarea value={transcript || ''} onChange={(e) => onTranscript(e.target.value)} rows={4} dir="auto" maxLength={8000}
            placeholder={trt(lang, 'transcriptPlaceholder')} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.8, width: '100%' }} />
          <span><Button variant="secondary" size="sm" icon="check" disabled={!String(transcript || '').trim() || Boolean(busy)} onClick={onSaveTranscript}>{trt(lang, 'saveTranscriptBtn')}</Button></span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingInlineStart: 44 }}>
        {(source.status === 'ready' || source.status === 'taught') && hasContent && (
          <Button variant="primary" size="sm" icon="sparkle" disabled={Boolean(busy) || teaching} onClick={onTeach}>{trt(lang, 'teachFromSourceBtn')}</Button>
        )}
        {!isPdf && (
          <Button variant="ghost" size="sm" icon="refresh-cw" loading={busy === 'reading'} disabled={!canRead} onClick={onRead}>
            {busy === 'reading' ? trt(lang, 'reading') : trt(lang, source.status === 'queued' || source.status === 'failed' ? 'readBtn' : 'rereadBtn')}
          </Button>
        )}
        <Button variant="ghost" size="sm" icon="trash" disabled={Boolean(busy)} onClick={onDelete}>{trt(lang, 'deleteSource')}</Button>
      </div>
    </div>
  );
}

export function KnowledgeTab({ profile, lang, queued }) {
  const profiles = store();
  const [sources, setSources] = React.useState([]);
  const [phase, setPhase] = React.useState('loading'); // loading | ready | error
  const [busy, setBusy] = React.useState({});
  const [linkText, setLinkText] = React.useState('');
  const [linkBusy, setLinkBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [message, setMessage] = React.useState(null); // { tone: 'error' | 'ok', text }
  const [teachingId, setTeachingId] = React.useState(null);
  const [transcripts, setTranscripts] = React.useState({});
  const aliveRef = React.useRef(true);
  const fileInput = React.useRef(null);
  React.useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = React.useCallback(() => {
    if (!profiles) return;
    setPhase('loading');
    profiles.listSources(profile.id)
      .then((list) => { if (aliveRef.current) { setSources(list); setPhase('ready'); } })
      .catch(() => { if (aliveRef.current) setPhase('error'); });
  }, [profiles, profile.id]);
  React.useEffect(() => { load(); }, [load]);

  const replaceSource = (updated) => setSources((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
  const setBusyFor = (id, value) => setBusy((prev) => { const next = { ...prev }; if (value) next[id] = value; else delete next[id]; return next; });
  const say = (tone, text) => setMessage(text ? { tone, text } : null);

  async function readOne(source) {
    const client = aiClient();
    if (!client || !profiles || source.kind === 'pdf') return;
    setBusyFor(source.id, 'reading');
    try {
      const result = await client.readSource({ url: source.url, language: lang });
      const updated = await profiles.updateSource(profile.id, source.id, {
        status: source.status === 'taught' ? 'taught' : 'ready', title: result.title || source.title, digest: result.digest, errorCode: ''
      });
      if (aliveRef.current) replaceSource(updated);
    } catch (error) {
      const code = error && error.code ? String(error.code) : 'ANALYSIS_PROFILE_SOURCE_REQUEST_FAILED';
      if (!aliveRef.current) return;
      if (source.digest) {
        // A re-read that failed must not destroy a source that already holds usable content.
        say('error', errorText(lang, code));
      } else {
        try { replaceSource(await profiles.updateSource(profile.id, source.id, { status: 'failed', errorCode: code })); }
        catch (_) { replaceSource({ ...source, status: 'failed', errorCode: code }); }
      }
    } finally { if (aliveRef.current) setBusyFor(source.id, null); }
  }

  async function addLink() {
    if (!profiles || linkBusy) return;
    const url = profiles.helpers.normalizeHttpUrl(linkText);
    if (!url) { say('error', trt(lang, 'invalidLink')); return; }
    setLinkBusy(true); say(null);
    try {
      const kind = profiles.helpers.isYoutubeUrl(url) ? 'youtube' : 'website';
      const created = await profiles.addSource(profile.id, { kind, url });
      if (!aliveRef.current) return;
      setSources((prev) => [created, ...prev]);
      setLinkText('');
      await readOne(created); // reading is free, so a freshly added link is read straight away
    } catch (error) {
      if (aliveRef.current) say('error', errorText(lang, error && error.code));
    } finally { if (aliveRef.current) setLinkBusy(false); }
  }

  async function uploadPdf(file) {
    if (!profiles || !file) return;
    if ((file.type && file.type !== 'application/pdf') || (!file.type && !/\.pdf$/i.test(file.name))) { say('error', trt(lang, 'sourceErrPdfType')); return; }
    if (file.size > MAX_PDF_BYTES) { say('error', trt(lang, 'sourceErrPdfSize', { n: trDigits(lang, MAX_PDF_MB) })); return; }
    setUploading(true); say(null);
    try {
      const created = await profiles.uploadSourcePdf(profile.id, { dataUrl: asPdfDataUrl(await readFileAsDataUrl(file)), filename: file.name });
      if (aliveRef.current) setSources((prev) => [created, ...prev]);
    } catch (error) {
      if (aliveRef.current) say('error', errorText(lang, error && error.code));
    } finally {
      if (aliveRef.current) setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function saveTranscript(source) {
    const text = String(transcripts[source.id] || '').trim();
    if (!profiles || !text) return;
    setBusyFor(source.id, 'saving');
    try {
      replaceSource(await profiles.updateSource(profile.id, source.id, { digest: text.slice(0, 8000), status: source.status === 'taught' ? 'taught' : 'ready', errorCode: '' }));
      setTranscripts((prev) => { const next = { ...prev }; delete next[source.id]; return next; });
    } catch (error) { if (aliveRef.current) say('error', errorText(lang, error && error.code)); }
    finally { if (aliveRef.current) setBusyFor(source.id, null); }
  }

  async function removeOne(source) {
    if (!profiles || !window.confirm(trt(lang, source.kind === 'pdf' ? 'deletePdfConfirm' : 'deleteSourceConfirm'))) return;
    setBusyFor(source.id, 'deleting');
    try {
      await profiles.removeSource(profile.id, source.id);
      if (!aliveRef.current) return;
      setSources((prev) => prev.filter((s) => s.id !== source.id));
      if (teachingId === source.id) setTeachingId(null);
    } catch (error) { if (aliveRef.current) say('error', errorText(lang, error && error.code)); }
    finally { if (aliveRef.current) setBusyFor(source.id, null); }
  }

  // The stored PDF is only downloaded when the trader presses "Teach" (see EngineLearningPanel's
  // preset), from the owner-gated private URL - never on tab open, never server-to-server.
  async function loadPdfAttachment(source) {
    const response = await fetch(source.fileUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('PDF_FILE_UNAVAILABLE');
    return { dataUrl: asPdfDataUrl(await readFileAsDataUrl(await response.blob())), fileName: source.fileName || 'source.pdf' };
  }

  function onTaught(source, version) {
    if (!profiles) return;
    profiles.updateSource(profile.id, source.id, { status: 'taught', taughtUnderstandingVersion: version })
      .then((updated) => { if (aliveRef.current) replaceSource(updated); })
      .catch(() => {});
  }

  const teaching = teachingId ? sources.find((s) => s.id === teachingId) : null;
  const atLimit = sources.length >= SOURCE_LIMIT;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)', maxWidth: 760 }}>{trt(lang, 'knowledgeSubtitle')}</p>
      {queued && <span style={{ fontSize: 12, color: 'var(--success)' }}>{trt(lang, 'queuedNotice')}</span>}

      <Panel padding="18px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'addLinkTitle')}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="url" value={linkText} onChange={(e) => setLinkText(e.target.value)} dir="ltr" disabled={linkBusy || atLimit}
              onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }} placeholder={trt(lang, 'addLinkPlaceholder')} style={{ ...fieldStyle, flex: '1 1 260px', height: 44 }} />
            <Button variant="primary" size="md" icon="plus" loading={linkBusy} disabled={!linkText.trim() || linkBusy || atLimit} onClick={addLink}>{trt(lang, 'addLinkBtn')}</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => uploadPdf(e.target.files && e.target.files[0])} />
            <Button variant="secondary" size="sm" icon="upload" loading={uploading} disabled={uploading || atLimit} onClick={() => fileInput.current && fileInput.current.click()}>{trt(lang, 'uploadPdfBtn')}</Button>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'uploadPdfHint', { n: trDigits(lang, MAX_PDF_MB) })}</span>
          </div>
          {atLimit && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{trt(lang, 'sourceErrLimit', { n: trDigits(lang, SOURCE_LIMIT) })}</span>}
          <div aria-live="polite">{message && <span style={{ fontSize: 12, color: message.tone === 'error' ? 'var(--danger)' : 'var(--success)' }}>{message.text}</span>}</div>
        </div>
      </Panel>

      {teaching && (
        <EngineLearningPanel key={teaching.id} lang={lang} profile={profile}
          preset={{
            title: teaching.title || teaching.fileName || teaching.url, text: teaching.kind === 'pdf' ? '' : teaching.digest,
            loadAttachment: teaching.kind === 'pdf' ? () => loadPdfAttachment(teaching) : undefined, onClose: () => setTeachingId(null)
          }}
          onTaught={(version) => onTaught(teaching, version)} />
      )}

      <Panel padding="18px 20px">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'sourcesCount', { n: trDigits(lang, sources.length) })}</span>
          </div>
          {phase === 'loading' && <span style={{ fontSize: 12, color: 'var(--text-dim)', padding: '12px 0' }}>{trt(lang, 'reading')}</span>}
          {phase === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--danger)' }}>{trt(lang, 'sourcesLoadFailed')}</span>
              <Button variant="ghost" size="sm" icon="refresh-cw" onClick={load}>{trt(lang, 'retryBtn')}</Button>
            </div>
          )}
          {phase === 'ready' && sources.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{trt(lang, 'sourcesEmpty')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'sourcesEmptyBody')}</span>
            </div>
          )}
          {sources.map((source) => (
            <SourceRow key={source.id} lang={lang} source={source} busy={busy[source.id]} teaching={teachingId === source.id}
              transcript={transcripts[source.id]} onTranscript={(value) => setTranscripts((prev) => ({ ...prev, [source.id]: value }))}
              onSaveTranscript={() => saveTranscript(source)} onRead={() => readOne(source)} onTeach={() => setTeachingId(source.id)} onDelete={() => removeOne(source)} />
          ))}
        </div>
      </Panel>
    </div>
  );
}
