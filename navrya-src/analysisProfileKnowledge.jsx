import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { EngineLearningPanel } from './engineLearning.jsx';
import { AiErrorNotice } from './analysisProfileAiStatus.jsx';
import { LearningActivity, useTeachJobs } from './analysisProfileTeachActivity.jsx';
import { dismissTeachJob, jobTokens, openTeachJob, proposalSize, startTeachJob } from './analysisProfileTeachJobs.js';
import { classifyAiError, aiErrorText } from './analysisProfileAiErrors.js';
import { SOURCE_STATES, formatSourceSize, jobForSource, safeHttpUrl, sourceCardState, sourceHostname, sourceSteps, summarizeSourceStates } from './analysisProfileKnowledgeCards.js';
import { trt, trDigits, trDate } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Knowledge" tab (ARCHITECTURE.md §7.25): the website / YouTube / PDF material a
// trader teaches this profile from. Three honest stages, each with its own cost:
//   1. ADD    - record a link (or upload a PDF). Free. A PDF is stored privately and counts toward the
//               trader's storage quota; a link is only recorded.
//   2. READ   - a link is fetched server-side (SSRF-hardened, POST /api/analysis-profiles/read-source)
//               into a title and a BOUNDED text digest. Free - no model is involved.
//   3. TEACH  - the digest (or, for a PDF, the file itself) goes through the SAME propose -> review ->
//               apply flow as a typed note. This is the only step that spends AI tokens, and only on an
//               explicit click on the card. The click starts a teaching JOB (analysisProfileTeachJobs.js)
//               that keeps running while the trader is on another tab or page section; the card shows it
//               learning, then waiting for approval, and the review opens in EngineLearningPanel.
// Sources are loaded lazily, only when this tab opens (never part of the boot-time replica hydrate).
// Each source is a card (SourceCard): its kind, status, host or file, digest and Add -> Read -> Teach progress - see
// analysisProfileKnowledgeCards.js for the pure rules behind them.

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

// Each kind of source has its own colour and icon so a card is recognisable at a glance; the status has its own (semantic) colour,
// so the two are never confused. Colour is never the only signal: every state is also written out.
const KIND_TONE = { youtube: 'var(--char-accent)', website: 'var(--info)', pdf: 'var(--gold-warm)' };
const STATE_TONE = { learning: 'var(--char-accent)', review: 'var(--gold-warm)', queued: 'var(--text-dim)', ready: 'var(--char-accent)', taught: 'var(--success)', failed: 'var(--danger)', missing: 'var(--danger)' };
const STATE_LABEL = { ...STATUS_LABEL, missing: 'srcStatusMissing', learning: 'learnBadgeWorking', review: 'learnBadgeReview' };
const CHIP_TONE = { learning: 'accent', review: 'gold', queued: 'neutral', ready: 'accent', taught: 'success', failed: 'danger', missing: 'danger' };
const STEP_LABEL = { added: 'srcStepAdded', read: 'srcStepRead', stored: 'srcStepStored', taught: 'srcStepTaught' };
const STEP_STATE_LABEL = { done: 'srcStateDone', current: 'srcStateCurrent', todo: 'srcStateTodo', failed: 'srcStateFailed', working: 'srcStateWorking', review: 'srcStateReview' };
const STEP_TONE = { done: 'var(--success)', current: 'var(--char-accent)', todo: 'var(--text-disabled)', failed: 'var(--danger)', working: 'var(--char-accent)', review: 'var(--gold-warm)' };

// The steps' wording follows their state: a step still to do names the action ("Teach the engine"), a finished one says what happened
// ("Taught"), so "Taught" is never shown for something that has not happened yet.
function stepLabelKey(step) {
  if (step.key === 'taught') return { done: 'srcStepTaught', working: 'srcStepLearning', review: 'srcStepReview' }[step.state] || 'srcStepTeachNext';
  if (step.key === 'read') return step.state === 'done' ? 'srcStepRead' : 'srcStepReadNext';
  return STEP_LABEL[step.key];
}

function StatusBadge({ lang, state }) {
  return <span data-source-status={state} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid currentColor', color: STATE_TONE[state], whiteSpace: 'nowrap', flex: 'none' }}>{trt(lang, STATE_LABEL[state])}</span>;
}

function StepMark({ state }) {
  if (state === 'done') return <span style={{ color: STEP_TONE.done, display: 'grid', placeItems: 'center' }}><Icon name="check" size={13} /></span>;
  if (state === 'failed') return <span style={{ color: STEP_TONE.failed, display: 'grid', placeItems: 'center' }}><Icon name="close" size={13} /></span>;
  // The engine is learning: the same pulsing orb as the card's activity block, small enough for the step line.
  if (state === 'working') return <span className="nv-learn-orb nv-learn-orb--mini" aria-hidden="true"><span className="nv-learn-ring"></span><span className="nv-learn-core"></span></span>;
  return (
    <span aria-hidden="true" style={{ width: 11, height: 11, margin: 1, borderRadius: '50%', boxSizing: 'border-box', display: 'grid', placeItems: 'center', border: '1.5px solid ' + STEP_TONE[state] }}>
      {(state === 'current' || state === 'review') && <span style={{ width: 4, height: 4, borderRadius: '50%', background: STEP_TONE[state], display: 'block' }}></span>}
    </span>
  );
}

// Add -> Read (or Stored, for a PDF) -> Taught. The connectors are decoration; each step names its state in text for assistive tech.
function ProgressSteps({ lang, source, job }) {
  const steps = sourceSteps(source, job);
  return (
    <ol aria-label={trt(lang, 'srcStepsLabel')} data-source-steps="true" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
      {steps.map((step, i) => {
        const label = trt(lang, stepLabelKey(step));
        const stateText = trt(lang, STEP_STATE_LABEL[step.state]);
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <li role="presentation" aria-hidden="true" style={{ flex: 1, height: 1, minWidth: 8, background: steps[i - 1].state === 'done' ? STEP_TONE.done : 'var(--border-hairline)' }}></li>}
            <li data-step={step.key} data-step-state={step.state} aria-label={label + ': ' + stateText} title={label + ': ' + stateText}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: STEP_TONE[step.state], whiteSpace: 'nowrap' }}>
              <StepMark state={step.state} />{label}
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

const fieldStyle = {
  boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)',
  background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, outline: 'none'
};

// One source as a card. Everything on it is text from the source record rendered as text (never HTML); the host is only printed, and
// no icon or preview image is ever requested from it. A PDF's file is not fetched here either - only when teaching starts.
//
// `job` is the teaching job for this source (analysisProfileTeachJobs.js), which is what makes the card say the truth about the engine:
//   none    - Teach starts the job right here (one explicit click; the panel is not a second step somewhere off-screen)
//   working - an animated "the engine is learning" block with the real elapsed time; the trader is free to leave, it keeps going
//   review  - the engine is done and its proposal waits for approval: what it found, and a clear "Review and apply"
//   failed  - the specific reason (wallet, session, proxy, ...) beside a retry
export function SourceCard({ lang, source, job, busy, transcript, onTranscript, onSaveTranscript, onRead, onTeach, onReview, onDismiss, onDelete }) {
  const isPdf = source.kind === 'pdf';
  const state = sourceCardState(source, job);
  const working = Boolean(job && job.phase === 'working');
  const awaiting = Boolean(job && job.phase === 'review');
  const tone = KIND_TONE[source.kind] || KIND_TONE.website;
  const hasContent = isPdf ? source.fileAvailable !== false : Boolean(source.digest);
  const needsTranscript = source.kind === 'youtube' && source.status !== 'queued' && source.status !== 'failed' && !source.digest;
  const canRead = !isPdf && !busy && !working;
  const host = isPdf ? null : sourceHostname(source.url);
  const link = isPdf ? null : safeHttpUrl(source.url);
  const heading = source.title || source.fileName || host || source.url;
  const size = isPdf ? formatSourceSize(source.fileSizeBytes) : null;
  const dated = source.status === 'taught' && source.taughtAt ? trt(lang, 'srcTaughtOn', { date: trDate(lang, source.taughtAt) }) : source.createdAt ? trt(lang, 'srcAddedOn', { date: trDate(lang, source.createdAt) }) : null;
  const canTeach = (source.status === 'ready' || source.status === 'taught') && hasContent && !working && !awaiting;
  return (
    <li style={{ listStyle: 'none', display: 'flex', minWidth: 0 }}>
      <Panel variant={working || awaiting ? 'active' : 'base'} padding="16px 18px" fill style={{ flex: 1, minWidth: 0 }}
        data-source-card="true" data-source-kind={source.kind} data-source-state={state} data-source-job={job ? job.phase : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" style={{ flex: 'none', width: 44, height: 44, borderRadius: 11, display: 'grid', placeItems: 'center', color: tone,
              border: '1px solid color-mix(in srgb, ' + tone + ' 45%, transparent)', background: 'color-mix(in srgb, ' + tone + ' 13%, transparent)' }}>
              <Icon name={KIND_ICON[source.kind] || 'link'} size={22} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: tone }}>{trt(lang, KIND_LABEL[source.kind] || 'sourceKindWebsite')}</span>
              {host && <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><bdi dir="ltr" data-source-host="true">{host}</bdi></span>}
              {isPdf && (size || source.createdAt) && (
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {[size ? trDigits(lang, size.value) + ' ' + size.unit : null, source.createdAt ? trDate(lang, source.createdAt) : null].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <StatusBadge lang={lang} state={state} />
          </div>

          <span dir="auto" style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.6, color: 'var(--text-primary)', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{heading}</span>

          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" title={trt(lang, 'openLink')}
              style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{link}</a>
          )}
          {!isPdf && !link && source.url && <span dir="ltr" style={{ fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.url}</span>}

          {!isPdf && source.digest && (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{trt(lang, 'digestLabel')}</span>
              <span dir="auto" style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{source.digest}</span>
            </span>
          )}
          {!isPdf && !source.digest && source.status !== 'failed' && <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{trt(lang, 'srcNotReadYet')}</span>}
          {isPdf && source.fileAvailable !== false && <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{trt(lang, 'srcPdfPrivate')}</span>}
          {source.status === 'failed' && <span role="alert" style={{ fontSize: 11.5, color: 'var(--danger)' }}>{errorText(lang, source.errorCode)}</span>}
          {isPdf && source.fileAvailable === false && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{trt(lang, 'fileRemoved')}</span>}

          {needsTranscript && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.06)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold-warm)' }}>{trt(lang, 'noTranscriptTitle')}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.8 }}>{trt(lang, 'noTranscriptBody')}</span>
              <textarea value={transcript || ''} onChange={(e) => onTranscript(e.target.value)} rows={4} dir="auto" maxLength={8000}
                placeholder={trt(lang, 'transcriptPlaceholder')} style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.8, width: '100%' }} />
              <span><Button variant="secondary" size="sm" icon="check" disabled={!String(transcript || '').trim() || Boolean(busy)} onClick={onSaveTranscript}>{trt(lang, 'saveTranscriptBtn')}</Button></span>
            </div>
          )}

          {working && <LearningActivity lang={lang} job={job} />}
          {awaiting && (
            <div data-source-review="true" role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.07)' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gold-warm)' }}>{trt(lang, proposalSize(job) ? 'learnReviewReady' : 'learnReviewEmpty', { n: trDigits(lang, proposalSize(job)) })}</span>
              <span style={{ fontSize: 11.5, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                {trt(lang, 'learnReviewNote')}{jobTokens(job) > 0 ? ' ' + trt(lang, 'tokensUsed', { n: trDigits(lang, jobTokens(job).toLocaleString('en-US')) }) : ''}
              </span>
            </div>
          )}
          {job && job.phase === 'failed' && <AiErrorNotice lang={lang} error={job.error} onRetry={onTeach} busy={false} />}

          <div data-source-footer="true" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBlockStart: 'auto', paddingBlockStart: 12, borderBlockStart: '1px solid var(--border-hairline)' }}>
            <ProgressSteps lang={lang} source={source} job={job} />
            {(dated || (source.status === 'taught' && source.taughtUnderstandingVersion != null)) && (
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 10px', fontSize: 10.5, color: 'var(--text-dim)' }}>
                {dated && <span>{dated}</span>}
                {source.status === 'taught' && source.taughtUnderstandingVersion != null && <span>{trt(lang, 'understandingVersion', { n: trDigits(lang, source.taughtUnderstandingVersion) })}</span>}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {awaiting && <Button variant="primary" size="sm" icon="check" onClick={onReview}>{trt(lang, 'learnReviewBtn')}</Button>}
              {awaiting && <Button variant="ghost" size="sm" icon="close" onClick={onDismiss}>{trt(lang, 'discardBtn')}</Button>}
              {canTeach && <Button variant="primary" size="sm" icon="sparkle" disabled={Boolean(busy)} onClick={onTeach}>{trt(lang, 'teachFromSourceBtn')}</Button>}
              {!isPdf && (
                <Button variant="ghost" size="sm" icon="refresh-cw" loading={busy === 'reading'} disabled={!canRead || awaiting} onClick={onRead}>
                  {busy === 'reading' ? trt(lang, 'reading') : trt(lang, source.status === 'queued' || source.status === 'failed' ? 'readBtn' : 'rereadBtn')}
                </Button>
              )}
              <Button variant="ghost" size="sm" icon="trash" disabled={Boolean(busy) || working} onClick={onDelete}>{trt(lang, 'deleteSource')}</Button>
            </div>
            {canTeach && !job && <span style={{ fontSize: 10.5, lineHeight: 1.7, color: 'var(--text-dim)' }}>{trt(lang, 'sourceTeachHint')}</span>}
          </div>
        </div>
      </Panel>
    </li>
  );
}

// How many sources are in each state, next to the total. States nobody is in are simply not listed.
export function SourceSummary({ lang, sources, jobs }) {
  const counts = summarizeSourceStates(sources, jobs);
  return (
    <div role="group" aria-label={trt(lang, 'srcSummaryLabel')} data-source-summary="true" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {SOURCE_STATES.filter((state) => counts[state] > 0).map((state) => (
        <Chip key={state} tone={CHIP_TONE[state]} data-summary-state={state}>{trt(lang, STATE_LABEL[state])} {trDigits(lang, counts[state])}</Chip>
      ))}
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
  // Teaching jobs live outside this component (they keep running when the trader leaves the tab); this is just a view of them.
  const jobs = useTeachJobs(profile.id);
  const openReviewKeys = jobs.filter((job) => job.tab === 'knowledge' && job.phase === 'review' && job.open).map((job) => job.key);
  const seenOpen = React.useRef(new Set());
  const reviewAnchors = React.useRef({});
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
      dismissTeachJob(profile.id, 'source:' + source.id);
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

  // The ONE click that spends tokens: starts the teaching job for this source right here - no second panel somewhere off-screen to find.
  function teachFrom(source) {
    const title = source.title || source.fileName || source.url;
    startTeachJob({
      profile, lang, key: 'source:' + source.id, kind: 'source', tab: 'knowledge', sourceId: source.id, title, label: title,
      material: source.kind === 'pdf' ? '' : source.digest,
      loadAttachment: source.kind === 'pdf' ? () => loadPdfAttachment(source) : undefined
    });
  }

  // A review the trader just asked for scrolls into view, so it is never open somewhere above the fold.
  React.useEffect(() => {
    const fresh = openReviewKeys.filter((key) => !seenOpen.current.has(key));
    seenOpen.current = new Set(openReviewKeys);
    const node = fresh.length ? reviewAnchors.current[fresh[0]] : null;
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openReviewKeys.join('|')]);

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

      {sources.filter((source) => openReviewKeys.indexOf('source:' + source.id) > -1).map((source) => (
        <div key={source.id} ref={(node) => { reviewAnchors.current['source:' + source.id] = node; }} data-review-anchor={source.id} style={{ scrollMarginBlockStart: 16 }}>
          <EngineLearningPanel lang={lang} profile={profile}
            preset={{
              title: source.title || source.fileName || source.url, text: source.kind === 'pdf' ? '' : source.digest, jobKey: 'source:' + source.id, tab: 'knowledge', sourceId: source.id,
              loadAttachment: source.kind === 'pdf' ? () => loadPdfAttachment(source) : undefined, onClose: () => openTeachJob(profile.id, 'source:' + source.id, false)
            }}
            onTaught={(version) => onTaught(source, version)} />
        </div>
      ))}

      <section aria-label={trt(lang, 'sourcesCount', { n: trDigits(lang, sources.length) })} data-sources-section="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'sourcesCount', { n: trDigits(lang, sources.length) })}</span>
          {phase === 'ready' && sources.length > 0 && <SourceSummary lang={lang} sources={sources} jobs={jobs} />}
        </div>
        {phase === 'loading' && <Panel padding="14px 18px"><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'reading')}</span></Panel>}
        {phase === 'error' && (
          <Panel padding="14px 18px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--danger)' }}>{trt(lang, 'sourcesLoadFailed')}</span>
              <Button variant="ghost" size="sm" icon="refresh-cw" onClick={load}>{trt(lang, 'retryBtn')}</Button>
            </div>
          </Panel>
        )}
        {phase === 'ready' && sources.length === 0 && (
          <Panel padding="18px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{trt(lang, 'sourcesEmpty')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'sourcesEmptyBody')}</span>
            </div>
          </Panel>
        )}
        {sources.length > 0 && (
          <ul data-source-grid="true" style={{ margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,320px),1fr))', gap: 14, alignItems: 'stretch' }}>
            {sources.map((source) => (
              <SourceCard key={source.id} lang={lang} source={source} job={jobForSource(jobs, source.id)} busy={busy[source.id]}
                transcript={transcripts[source.id]} onTranscript={(value) => setTranscripts((prev) => ({ ...prev, [source.id]: value }))}
                onSaveTranscript={() => saveTranscript(source)} onRead={() => readOne(source)} onTeach={() => teachFrom(source)}
                onReview={() => openTeachJob(profile.id, 'source:' + source.id)} onDismiss={() => dismissTeachJob(profile.id, 'source:' + source.id)} onDelete={() => removeOne(source)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
