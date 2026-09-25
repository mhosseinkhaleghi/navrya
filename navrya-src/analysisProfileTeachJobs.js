import { toAiError } from './analysisProfileAiErrors.js';
import { trt } from './analysisProfileTrainingCopy.js';
import { showToast } from './toast.js';

// Analysis Profile "teach the engine" JOBS (ARCHITECTURE.md §7.25) - where a teaching request lives while the trader is doing something else.
//
// Before this, the billed AI call and its answer were React state inside EngineLearningPanel: switching to another tab of the profile, or
// back to the list, unmounted the panel and the request (and the tokens it had already cost) vanished. A job here is a plain object in a
// module-level map: it keeps running after any component that started it has gone, and whatever mounts next (the Knowledge tab, the
// Memory tab, the header bar) simply reads its state. It lives as long as the page does - a page reload, or switching character (which
// tears the page down), still stops it; the unload guard below warns before a reload while one is running.
//
// The approval boundary is unchanged and is the point of the two phases: a job only ever PROPOSES. It ends in phase 'review' with the
// engine's proposal (concepts + a rewritten understanding), and nothing reaches the profile until the trader explicitly applies it
// (applyTeachJob -> the one applyLearning() funnel). Running in the background never means applying in the background.
//
//   working  - the ONE billed ingest call is in flight (a stored PDF is downloaded first, on this explicit start, never earlier)
//   review   - the proposal is back and waits for the trader; their edits (accepted / priority / understanding text) live on the job too
//   failed   - the call failed; `error` is the stable { code, status? } the AI error mapper turns into a specific message; retry reuses
//              the same request
//
// Jobs are keyed by (profile id, key): 'source:<id>' for a knowledge source, 'note' for a typed note or correction, 'preset:<title>' for
// the Preview tab's "Correct this". Starting a job whose key is already working returns the running one - it never double-bills.

const jobs = new Map();
const listeners = new Set();
let notifier = null;

function win() { return typeof window !== 'undefined' ? window : null; }
function store() { const w = win(); return w ? w.TradeJournalAnalysisProfileStore : null; }
function aiClient() { const w = win(); return w ? w.TradeJournalAnalysisProfileAI : null; }
function mapKey(profileId, key) { return String(profileId) + '\u0001' + String(key); }
function totalTokens(usage) { return usage ? (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0) : 0; }

/* -------------------------------------------------------------- reading --- */

export function getTeachJob(profileId, key) { return jobs.get(mapKey(profileId, key)) || null; }
export function listTeachJobs(profileId) {
  const out = [];
  jobs.forEach((job) => { if (profileId == null || job.profileId === profileId) out.push(job); });
  return out.sort((a, b) => a.startedAt - b.startedAt);
}
export function activeTeachCount() {
  let n = 0;
  jobs.forEach((job) => { if (job.phase === 'working') n += 1; });
  return n;
}

/* ------------------------------------------------------------ subscribing --- */

// Listeners get (job, change) where change is 'phase' (started / finished / failed / edited / removed) or 'ledger' (the learning history
// changed because tokens were recorded or a proposal was applied). The same is announced on window for anything outside React.
export function subscribeTeachJobs(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit(job, change) {
  listeners.forEach((listener) => { try { listener(job, change || 'phase'); } catch (_) { /* a broken listener must not stop the others */ } });
  const w = win();
  if (w && typeof w.dispatchEvent === 'function' && typeof w.CustomEvent === 'function') {
    try { w.dispatchEvent(new w.CustomEvent('tradejournal:analysis-profile-teach-changed', { detail: { profileId: job.profileId, key: job.key, phase: job.phase, change: change || 'phase' } })); } catch (_) { /* announcing is best effort */ }
  }
}
function put(job) { const next = { ...job }; jobs.set(mapKey(job.profileId, job.key), next); return next; }

/* ------------------------------------------------------ finish notification --- */

// Tells the trader a job finished while they may be looking at something else. The default is a toast in the job's own language; tests (and
// any other host) replace it.
export function setTeachNotifier(fn) { notifier = typeof fn === 'function' ? fn : null; }
function defaultNotify(kind, job) {
  const title = String(job.title || '').slice(0, 60);
  if (kind === 'ready') showToast(trt(job.lang, 'learnToastReady', { title }), 'success', 6000);
  else if (kind === 'failed') showToast(trt(job.lang, 'learnToastFailed', { title }), 'error', 6000);
}
function announce(kind, job) {
  try { (notifier || defaultNotify)(kind, job); } catch (_) { /* a toast must never affect the job */ }
}

/* ---------------------------------------------------------- unload guard --- */

// A running request cannot survive the page going away. While at least one is running, leaving (reload, closing the tab) asks first.
let guardInstalled = false;
function onBeforeUnload(event) {
  if (activeTeachCount() === 0) return undefined;
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (event) event.returnValue = '';
  return '';
}
function syncUnloadGuard() {
  const w = win();
  if (!w || typeof w.addEventListener !== 'function') return;
  const active = activeTeachCount() > 0;
  if (active && !guardInstalled) { w.addEventListener('beforeunload', onBeforeUnload); guardInstalled = true; }
  else if (!active && guardInstalled) { w.removeEventListener('beforeunload', onBeforeUnload); guardInstalled = false; }
}

/* ---------------------------------------------------------------- running --- */

function reviewDefaults(proposal, currentUnderstanding) {
  const proposedUnderstanding = String(proposal.updatedUnderstanding || '').trim();
  return {
    accepted: proposal.conceptsProposed.map(() => true),
    priorities: proposal.conceptsProposed.map((concept) => concept.priority),
    understandingText: proposedUnderstanding,
    applyUnderstanding: Boolean(proposedUnderstanding) && proposedUnderstanding !== currentUnderstanding
  };
}

async function run(startJob, profile) {
  const client = aiClient();
  const profiles = store();
  let job = startJob;
  const request = job.request;
  try {
    if (!client || !profiles) throw Object.assign(new Error('ANALYSIS_PROFILE_STORE_UNAVAILABLE'), { code: 'ANALYSIS_PROFILE_STORE_UNAVAILABLE' });
    // A stored PDF is only downloaded now, on the explicit start - and a failure to load it is reported before any billed call is made.
    const attachment = request.loadAttachment ? await request.loadAttachment() : null;
    const result = await client.ingestLearning({
      kind: request.kind, text: request.material, attachment, language: job.lang, primaryStyleId: profile.primaryStyleId, secondaryStyleIds: profile.secondaryStyleIds,
      customMethodNotes: profile.customMethodNotes, currentUnderstanding: job.understandingAtStart, existingConceptTitles: (profile.concepts || []).map((c) => c.title)
    });
    // The tokens are spent the moment the call returns, whether or not the trader ever applies the result - so the history records them now.
    profiles.recordEvent(profile.id, {
      kind: 'ai_analyzed_' + request.kind, title: request.label.slice(0, 80), detail: request.material || request.label,
      understandingVersion: profile.understanding ? profile.understanding.version : 0, tokenUsage: result.usage || null
    }).catch(() => {});
    job = put({ ...getTeachJob(job.profileId, job.key), phase: 'review', proposal: result, review: reviewDefaults(result, job.understandingAtStart), error: null, finishedAt: Date.now() });
    emit(job);
    announce('ready', job);
    if (typeof profiles.settleEvents === 'function') profiles.settleEvents().then(() => emit(job, 'ledger'), () => {});
  } catch (caught) {
    // Each failure kind (an empty wallet, an expired session, a dead proxy, a PDF-incompatible model, ...) maps to its own message in the UI.
    job = put({ ...getTeachJob(job.profileId, job.key), phase: 'failed', error: toAiError(caught), finishedAt: Date.now() });
    emit(job);
    announce('failed', job);
  } finally {
    syncUnloadGuard();
  }
}

// Starts (or returns the already-running) job. `input`:
//   profile  - the profile being taught (its lens and current understanding are snapshotted now)
//   lang, key, kind ('source' | 'note' | 'correction'), tab ('knowledge' | 'memory' | 'preview' - where the trader reviews it)
//   title    - what the job is called in the UI; label - the ledger title; material - the text sent to the model
//   loadAttachment? - async () => { dataUrl, fileName } for a stored PDF; sourceId?
//   rawText? - what the trader typed (restored into the box after a failure); context? - the fixed text a correction is written against
export function startTeachJob(input) {
  const profile = input.profile;
  const existing = getTeachJob(profile.id, input.key);
  if (existing && existing.phase === 'working') return existing;
  const label = String(input.label || input.title || '').trim();
  const job = put({
    profileId: profile.id, key: input.key, kind: input.kind, tab: input.tab || 'memory', sourceId: input.sourceId || null,
    title: String(input.title || label), lang: input.lang, phase: 'working', startedAt: Date.now(), finishedAt: null,
    proposal: null, review: null, error: null, open: false,
    understandingAtStart: profile.understanding ? String(profile.understanding.summary || '') : '',
    request: { kind: input.kind, material: String(input.material || ''), label, loadAttachment: input.loadAttachment || null, rawText: String(input.rawText || ''), context: String(input.context || '') }
  });
  emit(job);
  syncUnloadGuard();
  run(job, profile);
  return job;
}

// Runs a failed job again with the same request (the trader's Retry), against the profile as it is now.
export function retryTeachJob(profileId, key, profile) {
  const job = getTeachJob(profileId, key);
  if (!job || job.phase !== 'failed') return job;
  return startTeachJob({
    profile, lang: job.lang, key, kind: job.request.kind, tab: job.tab, sourceId: job.sourceId, title: job.title, label: job.request.label,
    material: job.request.material, loadAttachment: job.request.loadAttachment, rawText: job.request.rawText, context: job.request.context
  });
}

/* ----------------------------------------------------------- reviewing --- */

// The trader's edits during review (which concepts to accept, their priorities, the understanding text). Kept on the job, so leaving and
// coming back restores them.
export function updateTeachReview(profileId, key, patch) {
  const job = getTeachJob(profileId, key);
  if (!job || job.phase !== 'review' || !job.review) return null;
  const next = put({ ...job, review: { ...job.review, ...patch } });
  emit(next);
  return next;
}

// "Review and apply" pressed on a card / in the header bar: asks the tab that shows reviews to open this one.
export function openTeachJob(profileId, key, open) {
  const job = getTeachJob(profileId, key);
  if (!job) return null;
  const next = put({ ...job, open: open !== false });
  emit(next);
  return next;
}

// Throws the result away (the trader chose not to apply it). A running job cannot be dismissed: its request is already in flight and billed.
export function dismissTeachJob(profileId, key) {
  const job = getTeachJob(profileId, key);
  if (!job || job.phase === 'working') return false;
  jobs.delete(mapKey(profileId, key));
  emit(job);
  return true;
}

// Has the profile's understanding changed since the engine wrote this proposal (another job was applied, or the trader edited it)? A rewritten
// understanding proposed against the old text would replace the newer one - the review says so before anything is applied.
export function isUnderstandingStale(job, profile) {
  if (!job || !job.proposal) return false;
  const now = profile && profile.understanding ? String(profile.understanding.summary || '') : '';
  return now !== job.understandingAtStart;
}

// The ONLY writer, and only ever from an explicit click: commits the reviewed proposal through exactly one applyLearning() call (one save,
// one history event). Returns { saved } (saved is the updated profile), { empty: true } when nothing was selected, or null for no such job.
export function applyTeachJob(profileId, key) {
  const job = getTeachJob(profileId, key);
  const profiles = store();
  if (!job || job.phase !== 'review' || !job.proposal || !job.review || !profiles) return null;
  const { proposal, review, request } = job;
  const conceptsToAdd = proposal.conceptsProposed
    .map((concept, index) => ({ concept, index }))
    .filter(({ index }) => review.accepted[index])
    .map(({ concept, index }) => ({ title: concept.title, description: concept.description, priority: review.priorities[index] || concept.priority, origin: 'ai' }));
  const understandingChange = review.applyUnderstanding && review.understandingText.trim() ? review.understandingText.trim() : undefined;
  if (!conceptsToAdd.length && !understandingChange) { dismissTeachJob(profileId, key); return { empty: true }; }
  const saved = profiles.applyLearning(profileId, {
    conceptsToAdd, understandingSummary: understandingChange,
    eventKind: 'taught_' + request.kind, eventTitle: request.label.slice(0, 80), eventDetail: request.material || request.label,
    tokenUsage: null // already recorded on the analysis event when the call returned - never counted twice
  });
  jobs.delete(mapKey(profileId, key));
  emit(job);
  if (typeof profiles.settleEvents === 'function') profiles.settleEvents().then(() => emit(job, 'ledger'), () => {});
  return { saved };
}

/* ----------------------------------------------------------- summaries --- */

// How many things a proposal holds (concepts, plus one if it rewrites the understanding) - what "awaiting review" counts.
export function proposalSize(job) {
  if (!job || !job.proposal) return 0;
  return job.proposal.conceptsProposed.length + (String(job.proposal.updatedUnderstanding || '').trim() ? 1 : 0);
}
export function jobTokens(job) { return job && job.proposal ? totalTokens(job.proposal.usage) : 0; }

// Test hook only: forget every job and listener.
export function resetTeachJobsForTests() {
  jobs.clear(); listeners.clear(); notifier = null;
  const w = win();
  if (w && guardInstalled && typeof w.removeEventListener === 'function') w.removeEventListener('beforeunload', onBeforeUnload);
  guardInstalled = false;
}
