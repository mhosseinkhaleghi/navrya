import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// tradeLogModal.jsx is a heavy JSX/DOM (Canvas, FileReader, Image, localStorage) file with no
// jsdom/React-Testing-Library harness in this repo - the same static-source verification
// convention tests/gemini-live-voice-adapter.test.mjs already uses for this exact class of file.
// These tests prove each of the 9 real-user-walkthrough UX fixes is actually present and wired
// correctly, not merely described in a comment.
const root = process.cwd();
const src = await readFile(path.join(root, 'navrya-src', 'tradeLogModal.jsx'), 'utf8');
const i18n = await readFile(path.join(root, 'public', 'pages', 'shared', 'trade-i18n.js'), 'utf8');

function fn(name, until) {
  const start = src.indexOf('function ' + name);
  assert.ok(start > -1, `function ${name} not found`);
  const untilNeedle = until ? (/^[A-Za-z]/.test(until) && !until.includes(' ') ? 'function ' + until : until) : null;
  const end = untilNeedle ? src.indexOf(untilNeedle, start) : src.length;
  assert.ok(end > start, `boundary "${untilNeedle}" not found after ${name}`);
  return src.slice(start, end);
}

test('i18n: every new key exists in all four languages (fa/ar/en/es), not just one', () => {
  const keys = [
    'logSaving', 'logScreenshotTooLarge', 'logPriceMustBePositive', 'logStopMustDifferFromEntry',
    'logAccountReminder', 'logInstrumentReminder', 'logAccountAndInstrumentReminder',
    'logDiscardConfirm', 'logDraftFoundReminder', 'logDraftRestore', 'logDraftDiscard'
  ];
  keys.forEach((key) => {
    const count = (i18n.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(count, 4, `${key} must appear exactly 4 times (fa/ar/en/es) - found ${count}`);
  });
});

// Fix 1: nothing visible happened when a blocked submit was clicked - the account/instrument
// error Notice sits in the fixed session bar, easy to miss when the trader's eyes are on the
// footer button they just pressed. A toast (this app's own established feedback surface) now
// fires at the exact moment the click is blocked, in addition to the persistent Notice.
test('fix 1: a blocked quickLog()/finish() announces the block via a toast, not just the existing silent Notice state flip', () => {
  const quickLog = fn('quickLog', 'finish');
  const finish = fn('finish(', 'goNext');
  assert.match(quickLog, /if \(accountRequired\) \{ setAccountError\(true\); announceBlockedSubmit\('accountRequiredError'\); return; \}/);
  assert.match(quickLog, /if \(instrumentRequired\) \{ setInstrumentError\(true\); announceBlockedSubmit\('instrumentRequiredError'\); return; \}/);
  assert.match(finish, /if \(accountRequired\) \{ setAccountError\(true\); announceBlockedSubmit\('accountRequiredError'\); return; \}/);
  assert.match(finish, /if \(instrumentRequired\) \{ setInstrumentError\(true\); announceBlockedSubmit\('instrumentRequiredError'\); return; \}/);
  assert.match(src, /function announceBlockedSubmit\(key\) \{[\s\S]*?tradeUi\.toast\(t\(key\), 'danger'\);/);
});

// Fix 2: `disabled` alone during the real async upload+analysis chain looked identical to a
// hung/broken button. `loading` is this app's own established "genuinely working" signal.
test('fix 2: the final Register button uses the real Button loading prop (not disabled alone) and changes its own label while saving', () => {
  assert.match(src, /<Button variant="primary" icon="check" onClick=\{finish\} disabled=\{saving\} loading=\{saving\}>\{saving \? t\('logSaving'\) : t\('registerWithAnalysis'\)\}<\/Button>/);
});

// Fix 3: a batch of full-resolution screenshots dropped together could stall the tab while every
// one was synchronously base64-encoded at native size, with no size limit at all.
test('fix 3: oversized screenshots are rejected with a toast, and every accepted screenshot is downscaled before entering `shots` state', () => {
  const handleFiles = fn('handleFiles', 'const strategyStore');
  assert.match(handleFiles, /const oversized = images\.filter\(\(f\) => f\.size > MAX_SCREENSHOT_BYTES\);/);
  assert.match(handleFiles, /tradeUi\.toast\(t\('logScreenshotTooLarge', \{ count: oversized\.length \}\), 'danger'\);/);
  assert.match(handleFiles, /resizeScreenshotDataUrl\(String\(reader\.result \|\| ''\), SCREENSHOT_MAX_DIMENSION\)\.then/);
  assert.match(src, /const MAX_SCREENSHOT_BYTES = 15 \* 1024 \* 1024;/, 'must mirror the existing 15MB cap already used by communityView.jsx/strategyEducationView.jsx, not a new arbitrary number');
  assert.match(src, /function resizeScreenshotDataUrl\(dataUrl, maxDimension\) \{/);
});

// Fix 4: closing (backdrop click, the X button, or the step-1 Cancel button) discarded every
// typed field with zero confirmation. requestClose() must gate all three real close paths.
test('fix 4: every real close path (backdrop, X button, Cancel button) goes through requestClose(), which confirms only when the wizard is actually dirty', () => {
  assert.match(src, /function requestClose\(\) \{[\s\S]*?if \(dirtyRef\.current && !window\.confirm\(t\('logDiscardConfirm'\)\)\) return;[\s\S]*?onClose\(\);/);
  assert.match(src, /onMouseDown=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) requestClose\(\); \}\}/, 'backdrop click must call requestClose(), not the raw onClose()');
  assert.match(src, /<button type="button" onClick=\{requestClose\} aria-label=\{t\('close'\)\}/, 'the header X button must call requestClose()');
  assert.match(src, /<Button variant="ghost" icon="close" onClick=\{requestClose\}>\{t\('cancel'\)\}<\/Button>/, 'the step-1 footer Cancel button must call requestClose()');
  // The dirty flag must only flip on a genuine field edit, never merely on mount (the very first
  // render of every hook this effect watches is not a real user action).
  assert.match(src, /if \(isFirstDirtyCheckRef\.current\) \{ isFirstDirtyCheckRef\.current = false; return; \}\s*\n\s*dirtyRef\.current = true;/);
  // A successful save must never leave the modal wrongly "dirty" for a close that happens after
  // onSave already ran - not applicable here since onClose() runs synchronously right after a
  // successful save's own toast, before any further interaction is possible; asserting instead
  // that dirty-tracking never blocks the SAVE action itself (only close paths reference it).
  assert.doesNotMatch(fn('quickLog', 'finish'), /dirtyRef/, 'saving must never itself be gated by the dirty flag - only closing without saving is');
  assert.doesNotMatch(fn('finish(', 'goNext'), /dirtyRef/, 'saving must never itself be gated by the dirty flag - only closing without saving is');
});

// Fix 5: entry/stop pricing that could not resolve (zero, or stop equal to entry) rendered every
// cost tile as a bare "—" with no explanation at all.
test('fix 5: an inline reason is shown once both price fields are typed but the calculation is genuinely invalid, never before either is touched', () => {
  const stepStatus = fn('StepStatus', 'StepTimeframes');
  assert.match(stepStatus, /const bothPriceFieldsTyped = trade\.entry !== '' && trade\.stop !== '';/);
  assert.match(stepStatus, /const invalidPriceReason = \(!solved\.valid && bothPriceFieldsTyped\)/);
  assert.match(stepStatus, /'logPriceMustBePositive'/);
  assert.match(stepStatus, /'logStopMustDifferFromEntry'/);
  assert.match(stepStatus, /\{invalidPriceReason && <Notice tone="warning" icon="status">\{t\(invalidPriceReason\)\}<\/Notice>\}/);
});

// Fix 6: dragging a plain text selection inside the chart-note textarea also bubbles a native
// dragover event to the outer Panel, which previously showed the full-screen "drop a screenshot
// here" overlay for an ordinary in-page text drag that has nothing to do with files.
test('fix 6: the drag-over handler only reacts to a real file drag (dataTransfer.types includes "Files"), not any drag at all', () => {
  assert.match(src, /const types = e\.dataTransfer && e\.dataTransfer\.types;\s*\n\s*if \(!types \|\| Array\.prototype\.indexOf\.call\(types, 'Files'\) === -1\) return;\s*\n\s*e\.preventDefault\(\);/);
});

// Fix 7: account/instrument are picked in the persistent session bar, not inside any step body -
// the required "*" only ever turned visually distinct AFTER a failed submit attempt, and Step 1
// itself had no reminder of its own at all.
test('fix 7: the required "*" stands out before any failed attempt, and Step 1 repeats the reminder inline', () => {
  assert.match(src, /\{activeAccounts\.length && !existingRef\.current \? <span style=\{\{ color: 'var\(--warning\)' \}\}> \*<\/span> : ''\}/);
  assert.match(src, /\{t\('instrument'\)\} \{instrumentRequired \? <span style=\{\{ color: 'var\(--warning\)' \}\}>\*<\/span> : '\*'\}/);
  const stepStatus = fn('StepStatus', 'StepTimeframes');
  assert.match(stepStatus, /const needsAccountOrInstrument = accountRequired \|\| instrumentRequired;/);
  assert.match(stepStatus, /accountRequired && instrumentRequired \? t\('logAccountAndInstrumentReminder'\) : accountRequired \? t\('logAccountReminder'\) : t\('logInstrumentReminder'\)/);
  assert.match(src, /<StepStatus t=\{t\} i18n=\{i18n\} trade=\{\{ \.\.\.trade, onQuickLog: quickLog \}\} setField=\{setField\} solved=\{solved\} dirManual=\{dirManual\} accountRequired=\{accountRequired\} instrumentRequired=\{instrumentRequired\} \/>/, 'the required flags must actually reach StepStatus, not just exist unused in the parent');
});

// Fix 8: no autosave/draft-recovery at all - a crashed tab or accidental refresh lost every
// typed field with no way back. Scoped to a brand-new trade only (never an edit of an existing,
// already-persisted one).
test('fix 8: a brand-new trade autosaves a debounced draft to localStorage and offers it back on a later visit; an existing trade being edited is never affected', () => {
  assert.match(src, /const isNewTrade = !existingRef\.current;/);
  assert.match(src, /const DRAFT_STORAGE_KEY = 'tradejournal:tradeLogDraft:v1';/);
  assert.match(src, /function readTradeLogDraft\(\) \{/);
  assert.match(src, /function writeTradeLogDraft\(snapshot\) \{/);
  assert.match(src, /function clearTradeLogDraft\(\) \{/);
  assert.match(src, /function draftHasRealContent\(d\) \{/);
  // Autosave must be skipped for an existing trade and while a recovery banner is unresolved
  // (writing now would silently overwrite the very draft about to be offered back).
  assert.match(src, /if \(!isNewTrade \|\| pendingDraft\) return undefined;/);
  // A successful save must clear the draft it just superseded, in both save paths.
  const quickLog = fn('quickLog', 'finish');
  const finish = fn('finish(', 'goNext');
  assert.match(quickLog, /if \(isNewTrade\) clearTradeLogDraft\(\);/);
  assert.match(finish, /if \(isNewTrade\) clearTradeLogDraft\(\);/);
  // Restoring must mark the wizard dirty again (closing afterward without saving should still warn).
  assert.match(src, /function restoreDraft\(\) \{[\s\S]*?dirtyRef\.current = true;[\s\S]*?setPendingDraft\(null\);/);
  assert.match(src, /function discardDraft\(\) \{\s*\n\s*clearTradeLogDraft\(\);\s*\n\s*setPendingDraft\(null\);/);
  // A draft with every field still at its default must never be offered back.
  assert.match(src, /const \[pendingDraft, setPendingDraft\] = React\.useState\(\(\) => \(draftHasRealContent\(initialDraftRef\.current\) \? initialDraftRef\.current : null\)\);/);
  // The recovery banner itself must be reachable in the render tree.
  assert.match(src, /\{pendingDraft && \([\s\S]*?logDraftFoundReminder[\s\S]*?onClick=\{restoreDraft\}[\s\S]*?onClick=\{discardDraft\}/);
});

// Fix 9: a flagged emotion note showed the safety card but still advanced to the next step
// regardless - the one safety-gated flow in this app that did not actually stop the user, unlike
// logEmotionModal.jsx and postTradeReflectionModal.jsx's own identical goNext() pattern.
test('fix 9: a flagged step-4 note blocks advancing to the next step, matching logEmotionModal.jsx/postTradeReflectionModal.jsx\'s own established safety-gate pattern', () => {
  const goNext = fn('goNext', 'goBack');
  assert.match(goNext, /setSafetyNode\(mhSafety\.renderSafetyCard\(\(\) => setSafetyNode\(null\)\)\);\s*\n\s*return;/, 'must return immediately after showing the safety card, never fall through to setStep()/finish()');
});

// Regression guard: draft state/effects must never be exercised for an existing trade being
// edited - `isNewTrade` gates the initial read, the autosave effect, and the clear-on-save calls,
// all proven above; this test additionally proves the recovery banner's own render condition
// can never fire when editing (pendingDraft's initializer already depends on isNewTrade via
// initialDraftRef, which is null whenever isNewTrade is false).
test('regression guard: initialDraftRef is only ever read for a brand-new trade, never for an existing one being edited', () => {
  assert.match(src, /const initialDraftRef = React\.useRef\(isNewTrade \? readTradeLogDraft\(\) : null\);/);
});
