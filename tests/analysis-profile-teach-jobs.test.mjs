import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  activeTeachCount, applyTeachJob, dismissTeachJob, getTeachJob, isUnderstandingStale, listTeachJobs, openTeachJob, proposalSize, resetTeachJobsForTests,
  retryTeachJob, setTeachNotifier, startTeachJob, subscribeTeachJobs, updateTeachReview
} from '../navrya-src/analysisProfileTeachJobs.js';

// The teaching JOB store: where a "teach the engine" request lives while the trader is somewhere else. What must hold:
//   - it keeps running (and keeps its proposal) with no component alive, and never double-bills;
//   - it only PROPOSES: the profile changes only on an explicit applyTeachJob(), through one applyLearning() call;
//   - tokens are recorded when the call returns, never twice; failures are kept as a stable code with a retry of the same request;
//   - leaving the page while one is running is guarded, and nothing is guarded once it is done.

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const PROFILE = {
  id: 'p1', primaryStyleId: 'price_action', secondaryStyleIds: ['wyckoff'], customMethodNotes: 'my notes',
  concepts: [{ id: 'c1', title: 'Swept level' }, { id: 'c2', title: 'HTF bias' }], understanding: { summary: 'Reads structure first.', version: 3 }
};
const RESULT = {
  conceptsProposed: [
    { title: 'Order block retest', description: 'Wait for a retest.', priority: 'preferred' },
    { title: 'Liquidity grab', description: 'Sweeps precede reversals.', priority: 'mandatory' },
    { title: 'Session bias', description: '', priority: 'reference' }
  ],
  updatedUnderstanding: 'Reads structure first, then liquidity.', usage: { promptTokens: 700, completionTokens: 300 }
};

let calls;
let ingest;
let notified;
let win;

function install(options) {
  const o = options || {};
  calls = { ingest: [], recordEvent: [], applyLearning: [], settle: 0 };
  ingest = deferred();
  const profilesStore = {
    recordEvent: (id, event) => { calls.recordEvent.push([id, event]); return Promise.resolve({}); },
    settleEvents: () => { calls.settle += 1; return Promise.resolve(); },
    applyLearning: (id, change) => { calls.applyLearning.push([id, change]); return { id, understanding: { version: 4 } }; }
  };
  win.TradeJournalAnalysisProfileStore = o.noStore ? undefined : profilesStore;
  win.TradeJournalAnalysisProfileAI = o.noClient ? undefined : { ingestLearning: (request) => { calls.ingest.push(request); return ingest.promise; } };
}

beforeEach(() => {
  resetTeachJobsForTests();
  win = new EventTarget();
  win.CustomEvent = CustomEvent;
  globalThis.window = win;
  notified = [];
  setTeachNotifier((kind, job) => notified.push([kind, job.key, job.title]));
  install();
});
afterEach(() => { resetTeachJobsForTests(); delete globalThis.window; });

const start = (extra) => startTeachJob({ profile: PROFILE, lang: 'en', key: 'source:s1', kind: 'source', tab: 'knowledge', sourceId: 's1', title: 'Liquidity explained', label: 'Liquidity explained', material: 'Sweeps of resting liquidity.', ...(extra || {}) });

// ---- it runs without any component ---------------------------------------------------------------------------------------------

test('a started job is WORKING in the store with no component alive, and finishes into a review proposal that waits there', async () => {
  const job = start();
  assert.equal(job.phase, 'working');
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'working');
  assert.equal(activeTeachCount(), 1);
  await flush();
  assert.equal(calls.ingest.length, 1, 'the one billed call is in flight');
  ingest.resolve(RESULT);
  await flush();
  const done = getTeachJob('p1', 'source:s1');
  assert.equal(done.phase, 'review');
  assert.equal(done.proposal, RESULT);
  assert.equal(activeTeachCount(), 0);
  assert.equal(proposalSize(done), 4, 'three concepts and a rewritten understanding');
  assert.deepEqual(notified, [['ready', 'source:s1', 'Liquidity explained']]);
  assert.deepEqual(done.review, { accepted: [true, true, true], priorities: ['preferred', 'mandatory', 'reference'], understandingText: 'Reads structure first, then liquidity.', applyUnderstanding: true });
});

test('starting a key that is already working returns the running job - the trader can never double-bill by clicking twice or coming back', async () => {
  const first = start();
  const second = start();
  assert.equal(second.startedAt, first.startedAt);
  await flush();
  assert.equal(calls.ingest.length, 1, 'exactly one billed request');
});

test('the request carries the source material, the lens, and a SNAPSHOT of the profile taken when it started - not whatever the profile becomes while it runs', async () => {
  start();
  await flush();
  const request = calls.ingest[0];
  assert.equal(request.kind, 'source');
  assert.equal(request.text, 'Sweeps of resting liquidity.');
  assert.equal(request.language, 'en');
  assert.equal(request.primaryStyleId, 'price_action');
  assert.deepEqual(request.secondaryStyleIds, ['wyckoff']);
  assert.equal(request.customMethodNotes, 'my notes');
  assert.equal(request.currentUnderstanding, 'Reads structure first.');
  assert.deepEqual(request.existingConceptTitles, ['Swept level', 'HTF bias']);
  assert.equal(request.attachment, null);
});

test('a stored PDF is loaded when the job STARTS, before the billed call; if it cannot be loaded nothing is billed and the job fails with a stable code', async () => {
  const order = [];
  start({ key: 'source:pdf', kind: 'source', material: '', loadAttachment: async () => { order.push('load'); return { dataUrl: 'data:application/pdf;base64,AA==', fileName: 'book.pdf' }; } });
  await flush();
  assert.equal(calls.ingest[0].attachment.fileName, 'book.pdf');
  ingest.resolve(RESULT);
  await flush();
  assert.equal(getTeachJob('p1', 'source:pdf').phase, 'review');
  assert.deepEqual(order, ['load']);

  install();
  start({ key: 'source:gone', loadAttachment: async () => { throw Object.assign(new Error('PDF_FILE_UNAVAILABLE'), { code: 'PDF_FILE_UNAVAILABLE' }); } });
  await flush();
  assert.equal(calls.ingest.length, 0, 'no billed call when the file could not be loaded');
  const failed = getTeachJob('p1', 'source:gone');
  assert.equal(failed.phase, 'failed');
  assert.deepEqual(failed.error, { code: 'PDF_FILE_UNAVAILABLE' });
});

// ---- the approval boundary --------------------------------------------------------------------------------------------------------

test('a job only PROPOSES: when it finishes, the profile has not been touched - applyLearning() is called only by an explicit applyTeachJob()', async () => {
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  await flush();
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'review');
  assert.equal(calls.applyLearning.length, 0, 'finishing in the background never applies');
  const outcome = applyTeachJob('p1', 'source:s1');
  assert.equal(calls.applyLearning.length, 1, 'exactly one save');
  assert.equal(outcome.saved.understanding.version, 4);
  assert.equal(getTeachJob('p1', 'source:s1'), null, 'an applied job is gone');
});

test('apply commits exactly what the trader left selected - their edits to which concepts, their priorities and the understanding text - with tokens NOT counted a second time', async () => {
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  updateTeachReview('p1', 'source:s1', { accepted: [true, false, true], priorities: ['mandatory', 'mandatory', 'reference'], understandingText: '  My own wording.  ' });
  applyTeachJob('p1', 'source:s1');
  const [id, change] = calls.applyLearning[0];
  assert.equal(id, 'p1');
  assert.deepEqual(change.conceptsToAdd, [
    { title: 'Order block retest', description: 'Wait for a retest.', priority: 'mandatory', origin: 'ai' },
    { title: 'Session bias', description: '', priority: 'reference', origin: 'ai' }
  ]);
  assert.equal(change.understandingSummary, 'My own wording.');
  assert.equal(change.eventKind, 'taught_source');
  assert.equal(change.eventTitle, 'Liquidity explained');
  assert.equal(change.tokenUsage, null, 'the tokens were recorded when the call returned');
});

test('the token cost is recorded in the learning history the moment the call returns (a discarded proposal still cost tokens), once', async () => {
  start();
  await flush();
  assert.equal(calls.recordEvent.length, 0, 'nothing recorded while the request is still running');
  ingest.resolve(RESULT);
  await flush();
  assert.equal(calls.recordEvent.length, 1);
  const [id, event] = calls.recordEvent[0];
  assert.equal(id, 'p1');
  assert.equal(event.kind, 'ai_analyzed_source');
  assert.deepEqual(event.tokenUsage, { promptTokens: 700, completionTokens: 300 });
  assert.equal(event.understandingVersion, 3);
  dismissTeachJob('p1', 'source:s1');
  assert.equal(calls.recordEvent.length, 1, 'discarding does not record it again');
  assert.equal(calls.applyLearning.length, 0);
});

test('an empty selection applies nothing and clears the job; a running job cannot be dismissed (its request is already billed)', async () => {
  start();
  assert.equal(dismissTeachJob('p1', 'source:s1'), false, 'still working');
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'working');
  await flush();
  ingest.resolve(RESULT);
  await flush();
  updateTeachReview('p1', 'source:s1', { accepted: [false, false, false], applyUnderstanding: false });
  assert.deepEqual(applyTeachJob('p1', 'source:s1'), { empty: true });
  assert.equal(calls.applyLearning.length, 0);
  assert.equal(getTeachJob('p1', 'source:s1'), null);
  assert.equal(applyTeachJob('p1', 'source:s1'), null, 'no such job any more');
});

test('a job that is not in review cannot be applied or edited', async () => {
  start();
  assert.equal(applyTeachJob('p1', 'source:s1'), null, 'still working');
  assert.equal(updateTeachReview('p1', 'source:s1', { accepted: [] }), null);
  assert.equal(calls.applyLearning.length, 0);
});

test('the review edits live on the job, so leaving and coming back restores them', async () => {
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  updateTeachReview('p1', 'source:s1', { accepted: [false, true, true] });
  assert.deepEqual(getTeachJob('p1', 'source:s1').review.accepted, [false, true, true]);
  assert.deepEqual(getTeachJob('p1', 'source:s1').review.priorities, ['preferred', 'mandatory', 'reference'], 'other fields untouched');
});

test('a proposal is stale when the understanding changed after it was written (another job applied, or a manual edit)', async () => {
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  const job = getTeachJob('p1', 'source:s1');
  assert.equal(isUnderstandingStale(job, PROFILE), false);
  assert.equal(isUnderstandingStale(job, { ...PROFILE, understanding: { summary: 'Changed since.', version: 4 } }), true);
  assert.equal(isUnderstandingStale(null, PROFILE), false);
  assert.equal(isUnderstandingStale({ ...job, proposal: null }, PROFILE), false);
});

// ---- failure and retry ----------------------------------------------------------------------------------------------------------------

test('a failed call keeps the stable code and HTTP status (never the error object), notifies, and can be retried with the SAME request', async () => {
  start();
  await flush();
  ingest.reject(Object.assign(new Error('secret detail that must not be kept'), { code: 'WALLET_INSUFFICIENT_BALANCE', status: 402, cause: { apiKey: 'sk-secret' } }));
  await flush();
  const failed = getTeachJob('p1', 'source:s1');
  assert.equal(failed.phase, 'failed');
  assert.deepEqual(failed.error, { code: 'WALLET_INSUFFICIENT_BALANCE', status: 402 });
  assert.doesNotMatch(JSON.stringify(failed.error), /secret|sk-/);
  assert.equal(calls.recordEvent.length, 0, 'a failed call spent nothing that needs recording');
  assert.deepEqual(notified, [['failed', 'source:s1', 'Liquidity explained']]);
  assert.equal(activeTeachCount(), 0);

  ingest = deferred();
  const again = retryTeachJob('p1', 'source:s1', PROFILE);
  assert.equal(again.phase, 'working');
  await flush();
  assert.equal(calls.ingest.length, 2);
  assert.equal(calls.ingest[1].text, calls.ingest[0].text, 'the same material is sent again');
  ingest.resolve(RESULT);
  await flush();
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'review');
});

test('a failed job can also be replaced by a fresh start (the trader edited the text and pressed Teach again), and retry does nothing for a job that is not failed', async () => {
  start({ key: 'note', kind: 'note', material: 'first attempt', rawText: 'first attempt' });
  await flush();
  ingest.reject(Object.assign(new Error('x'), { code: 'ANALYSIS_PROFILE_AI_NETWORK_ERROR' }));
  await flush();
  assert.equal(getTeachJob('p1', 'note').request.rawText, 'first attempt', 'the typed text is kept to restore the box');
  ingest = deferred();
  startTeachJob({ profile: PROFILE, lang: 'en', key: 'note', kind: 'note', title: 'second', label: 'second', material: 'second attempt', rawText: 'second attempt' });
  await flush();
  assert.equal(calls.ingest[1].text, 'second attempt');
  assert.equal(retryTeachJob('p1', 'note', PROFILE).phase, 'working', 'a running job is returned as is');
  assert.equal(calls.ingest.length, 2);
});

test('missing gateway pieces fail the job with a stable code instead of throwing - and never leave a job stuck "working"', async () => {
  install({ noClient: true });
  start();
  await flush();
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'failed');
  assert.equal(getTeachJob('p1', 'source:s1').error.code, 'ANALYSIS_PROFILE_STORE_UNAVAILABLE');
  assert.equal(activeTeachCount(), 0);
});

test('a notifier that throws cannot break a job', async () => {
  setTeachNotifier(() => { throw new Error('toast exploded'); });
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'review');
});

// ---- leaving the page --------------------------------------------------------------------------------------------------------------------

test('while a job is running, leaving the page (reload, closing the tab) is guarded; once nothing is running it is not', async () => {
  const attempt = () => { const event = new Event('beforeunload', { cancelable: true }); win.dispatchEvent(event); return event.defaultPrevented; };
  assert.equal(attempt(), false, 'nothing running: leave freely');
  start();
  assert.equal(attempt(), true, 'a request is in flight: the browser asks first');
  await flush();
  ingest.resolve(RESULT);
  await flush();
  assert.equal(attempt(), false, 'the proposal is safely in memory of the page and nothing is billed in flight - no prompt');
});

test('the guard is installed once for any number of jobs and removed only when the LAST one ends', async () => {
  let added = 0; let removed = 0;
  win.addEventListener = (type) => { if (type === 'beforeunload') added += 1; };
  win.removeEventListener = (type) => { if (type === 'beforeunload') removed += 1; };
  start({ key: 'source:a' });
  start({ key: 'source:b' });
  assert.equal(added, 1);
  assert.equal(activeTeachCount(), 2);
  await flush();
  ingest.resolve(RESULT);
  await flush();
  assert.equal(removed, 1, 'both share the one promise here, so both ended');
});

// ---- who can see it -------------------------------------------------------------------------------------------------------------------

test('jobs are per profile and per key: two profiles, or a note and a source, never see each other\'s', async () => {
  start();
  start({ key: 'note', kind: 'note', material: 'a note' });
  startTeachJob({ profile: { ...PROFILE, id: 'p2' }, lang: 'en', key: 'source:s1', kind: 'source', title: 'Other', label: 'Other', material: 'x' });
  assert.deepEqual(listTeachJobs('p1').map((j) => j.key).sort(), ['note', 'source:s1']);
  assert.deepEqual(listTeachJobs('p2').map((j) => j.title), ['Other']);
  assert.equal(listTeachJobs().length, 3);
  assert.equal(getTeachJob('p2', 'note'), null);
});

test('subscribers hear every change, a throwing subscriber does not silence the rest, and the same is announced on window for anything outside React', async () => {
  const heard = [];
  const unsubscribeBad = subscribeTeachJobs(() => { throw new Error('bad listener'); });
  const unsubscribe = subscribeTeachJobs((job, change) => heard.push([job.key, job.phase, change]));
  const events = [];
  win.addEventListener('tradejournal:analysis-profile-teach-changed', (event) => events.push(event.detail));
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  await flush();
  assert.deepEqual(heard.map((h) => h.slice(0, 2)).filter((h, i, all) => i === 0 || h.join() !== all[i - 1].join()), [['source:s1', 'working'], ['source:s1', 'review']]);
  assert.ok(heard.some((h) => h[2] === 'ledger'), 'the learning history changed (tokens recorded)');
  assert.deepEqual(events[0], { profileId: 'p1', key: 'source:s1', phase: 'working', change: 'phase' });
  assert.ok(events.some((e) => e.phase === 'review'));
  unsubscribe(); unsubscribeBad();
  const count = heard.length;
  openTeachJob('p1', 'source:s1');
  assert.equal(heard.length, count, 'unsubscribed');
});

test('"Review and apply" marks the job open for the tab that shows reviews, and it can be hidden again without losing it', async () => {
  start();
  await flush();
  ingest.resolve(RESULT);
  await flush();
  assert.equal(getTeachJob('p1', 'source:s1').open, false);
  assert.equal(openTeachJob('p1', 'source:s1').open, true);
  assert.equal(openTeachJob('p1', 'source:s1', false).open, false);
  assert.equal(getTeachJob('p1', 'source:s1').phase, 'review', 'hiding it does not discard it');
  assert.equal(openTeachJob('p1', 'nope'), null);
});

// ---- the toast --------------------------------------------------------------------------------------------------------------------------------

test('the default notification is a toast in the job\'s own language that names what finished and what to do next', async () => {
  resetTeachJobsForTests();
  const toasts = [];
  globalThis.document = { body: { append: (node) => toasts.push(node) }, createElement: () => ({ className: '', textContent: '', remove() {} }) };
  win.setTimeout = (fn) => fn;
  const { trainingCopy } = await import('../navrya-src/analysisProfileTrainingCopy.js');
  try {
    for (const lang of ['fa', 'ar', 'en', 'es']) {
      install();
      start({ lang, key: 'source:' + lang, title: 'Liquidity explained' });
      await flush();
      ingest.resolve(RESULT);
      await flush();
    }
    assert.equal(toasts.length, 4);
    assert.ok(toasts[0].textContent.includes('Liquidity explained'));
    for (const [i, lang] of ['fa', 'ar', 'en', 'es'].entries()) assert.equal(toasts[i].textContent, trainingCopy[lang].learnToastReady.replace('{title}', 'Liquidity explained'), lang);
  } finally { delete globalThis.document; }
});
