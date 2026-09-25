// Pure helpers behind the Knowledge tab's source cards (ARCHITECTURE.md §7.25): how one knowledge source (website / YouTube / PDF) is
// described on a card. No DOM, no store, no network - plain data in, plain data out - so every state and every hostile input is testable.
//
// What the card is allowed to show, by design:
//   - only text taken from the source record, rendered as text (never as HTML) by the component;
//   - the hostname is derived from the URL the trader pasted, purely for display: nothing is fetched from that host, and no favicon or
//     preview image is ever requested (an external request per card would leak which sources a trader keeps, and a page could then
//     control what the card looks like);
//   - a link is only made clickable for http(s) URLs.

const STATES = ['queued', 'ready', 'taught', 'failed', 'missing'];

function text(value) { return String(value == null ? '' : value).trim(); }

// The URL as an http(s) URL object, or null for anything else (javascript:, data:, file:, garbage, empty).
function parseHttp(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch (_) { return null; }
}

// The address a card may link to: the normalised URL string for http(s), otherwise null (the card then shows plain text, never a link).
export function safeHttpUrl(value) {
  const url = parseHttp(value);
  return url ? url.href : null;
}

// The host for display. `URL` already returns an internationalised name in its ASCII (punycode) form, which is what is shown: a look-alike
// host cannot pass for another one. A leading "www." is dropped for readability only. null when there is no usable http(s) URL.
export function sourceHostname(value) {
  const url = parseHttp(value);
  if (!url || !url.hostname) return null;
  return url.hostname.replace(/^www\./i, '');
}

// The stored size as a value + unit, or null when the size is unknown (not recorded is shown as nothing, never as "0 MB").
export function formatSourceSize(bytes) {
  const n = typeof bytes === 'number' ? bytes : Number(bytes);
  if (bytes == null || bytes === '' || !Number.isFinite(n) || n < 0) return null;
  if (n >= 1024 * 1024) return { value: (n / (1024 * 1024)).toFixed(2), unit: 'MB' };
  if (n === 0) return { value: '0', unit: 'KB' };
  return { value: String(Math.max(1, Math.round(n / 1024))), unit: 'KB' }; // anything under 1 KB reads as 1 KB, never as 0
}

// The teaching job (analysisProfileTeachJobs.js) running or waiting for this source, or null. Jobs are keyed 'source:<id>'.
export function jobForSource(jobs, sourceId) {
  const key = 'source:' + sourceId;
  return (Array.isArray(jobs) ? jobs : []).find((job) => job && job.key === key) || null;
}

// One of learning | review | queued | ready | taught | failed | missing:
//   - a teaching job in flight (learning) or back and waiting for the trader's approval (review) is what the card is ABOUT right now, so it wins;
//   - a PDF whose stored file is gone and that was never taught can never be taught -> missing (a taught one keeps `taught`: what it taught
//     is already in the profile; the card still flags the missing file separately);
//   - anything else follows the record's own status, defaulting to queued for an unknown value.
// A failed job is not a state of its own: the card keeps its record state and shows the error beside a retry.
export function sourceCardState(source, job) {
  if (job && job.phase === 'working') return 'learning';
  if (job && job.phase === 'review') return 'review';
  const s = source || {};
  const status = STATES.indexOf(s.status) > -1 && s.status !== 'missing' ? s.status : 'queued';
  if (s.kind === 'pdf' && s.fileAvailable === false && status !== 'taught') return 'missing';
  return status;
}

// The Add -> Read -> Teach progress of a source, as three steps each `done | current | todo | failed`.
//   link (website / YouTube): added -> read -> taught. "read" is done only once there is a digest to teach from (a YouTube link that was
//     fetched but has no captions still needs the trader's transcript, so it is not "read" yet).
//   PDF: added -> stored -> taught. A PDF is never read server-side; it is "stored" while its file is available.
//   The last step follows the teaching job too: working (the engine is learning), review (waiting for approval), failed (the last attempt failed).
export function sourceSteps(source, job) {
  const s = source || {};
  const state = sourceCardState(s);
  const isPdf = s.kind === 'pdf';
  const middle = isPdf ? 'stored' : 'read';
  let middleState;
  if (isPdf) middleState = s.fileAvailable === false ? 'failed' : state === 'failed' ? 'failed' : 'done';
  else if (state === 'failed') middleState = 'failed';
  else middleState = text(s.digest) || state === 'taught' ? 'done' : 'current';
  let taughtState;
  if (job && job.phase === 'working') taughtState = 'working';
  else if (job && job.phase === 'review') taughtState = 'review';
  else if (job && job.phase === 'failed' && state !== 'taught') taughtState = 'failed';
  else if (state === 'taught') taughtState = 'done';
  else if (middleState === 'done') taughtState = 'current';
  else taughtState = 'todo';
  return [
    { key: 'added', state: 'done' },
    { key: middle, state: middleState },
    { key: 'taught', state: taughtState }
  ];
}

// How many sources are in each state, for the summary chips above the cards (states with none are simply absent). With the teaching jobs
// passed in, a source being learned from or awaiting approval is counted there instead of under its record status, so the total still adds up.
export function summarizeSourceStates(sources, jobs) {
  const counts = { learning: 0, review: 0, queued: 0, ready: 0, taught: 0, failed: 0, missing: 0 };
  (Array.isArray(sources) ? sources : []).forEach((source) => { if (source) counts[sourceCardState(source, jobForSource(jobs, source.id))] += 1; });
  return counts;
}

// Every state a card can be in, in the order the summary lists them.
export const SOURCE_STATES = ['learning', 'review', 'queued', 'ready', 'taught', 'failed', 'missing'];
