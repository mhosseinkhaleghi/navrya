import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// AI-access follow-up: the user's own AI Analysis feature (sessionAiAnalysisModal.jsx ->
// POST /api/sessions/analyze) had no Action Registry action at all - reachable only via 3 manual
// button clicks inside Live Session, and there was no existing mechanism anywhere for "an async
// action finished - now speak a summary of it in Voice Mode." Same convention as
// tests/session-actions.test.mjs (F19/F20): navrya-src has no DOM test harness in this project -
// the real proof is real-browser verification. These are static-source regression guards.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const liveSessionSrc = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');
const analysisModalSrc = await readFile(path.join(root, 'navrya-src', 'sessionAiAnalysisModal.jsx'), 'utf8');
const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

// --- Action Registry: session.analysis.run ---

test('session.analysis.run has no required/optional fields (a single one-shot operation, never a multi-turn form), declares entityAlreadyPersisted, and is only available with a real chart entry that has an image', () => {
  const block = actionBlock('session.analysis.run');
  assert.match(block, /domain: 'sessions'/);
  assert.match(block, /entityAlreadyPersisted: true/);
  assert.match(block, /requiredFields: \[\], optionalFields: \[\]/);
  assert.match(block, /e\.type === 'chart' && \(e\.hasImage \|\| e\.preview \|\| e\.imageBlobId\)/);
});

test('session.analysis.run\'s open() only ensures the Sessions workspace is active - it never itself resolves/creates the target entry (that stays runAiAnalysis()\'s own job, so it can always target the REAL latest chart entry at submit time, not a stale one captured at open())', () => {
  const block = actionBlock('session.analysis.run');
  assert.match(block, /open: \(\) => \{ if \(store\.getState\(\)\.activeId !== 'sessions'\) store\.setActiveId\('sessions'\); \}/);
});

test('session.analysis.run\'s submit() drives the real live session hub (hub.runAiAnalysis()) via the shared pollFor() helper - the exact same pattern chartEntry.create/movementEntry.create already use, never a second hub-lookup mechanism', () => {
  const block = actionBlock('session.analysis.run');
  assert.match(block, /pollFor\(/);
  assert.match(block, /window\.TradeJournalNavryaLiveSessionHub/);
  assert.match(block, /hub\.runAiAnalysis\(\)\.then\(resolve\)\.catch\(\(\) => resolve\(null\)\)/);
});

test('session.analysis.run never touches API keys, auth tokens, or admin credentials', () => {
  const block = actionBlock('session.analysis.run');
  assert.doesNotMatch(block, /apiKey|api_key|authToken|adminKey/i);
});

// --- liveSessionView.jsx: the hub method + shared persistence/narration hook ---

test('runAiAnalysis() targets the session\'s own latest chart entry that has an image - the exact same default sessionAiAnalysisModal.jsx already falls back to when opened with no pinned entry, never a second "which entry" rule', () => {
  const fn = liveSessionSrc.slice(liveSessionSrc.indexOf('runAiAnalysis: () =>'), liveSessionSrc.indexOf('runAiAnalysis: () =>') + 700);
  assert.match(fn, /entries\.find\(\(e\) => e\.type === 'chart' && \(e\.hasImage \|\| e\.preview \|\| e\.imageBlobId\)\)/);
  assert.match(fn, /if \(!target\) \{ resolve\(null\); return; \}/);
});

test('runAiAnalysis() resolves null (never hangs the calling workflow forever) when no chart entry with an image exists yet', () => {
  const fn = liveSessionSrc.slice(liveSessionSrc.indexOf('runAiAnalysis: () =>'), liveSessionSrc.indexOf('runAiAnalysis: () =>') + 700);
  assert.match(fn, /resolve\(null\)/);
});

test('runAiAnalysis() opens the modal in autoRun mode by setting sessionAnalysisAutoRun before sessionAnalysisEntry - the exact same per-entry SessionAiAnalysisModal instance the manual per-entry trigger already opens, never a second, parallel analysis code path', () => {
  const fn = liveSessionSrc.slice(liveSessionSrc.indexOf('runAiAnalysis: () =>'), liveSessionSrc.indexOf('runAiAnalysis: () =>') + 700);
  assert.match(fn, /pendingAnalysisResolverRef\.current = resolve;/);
  assert.match(fn, /liveSessionHubRef\.current\.setSessionAnalysisAutoRun\(true\);/);
  assert.match(fn, /liveSessionHubRef\.current\.setSessionAnalysisEntry\(target\);/);
});

test('applyAnalysisResult() (the real, shared per-entry persistence function) resolves the pending runAiAnalysis() Promise with the real, already-persisted result, then clears sessionAnalysisAutoRun - a no-op for the 3 pre-existing manual trigger paths, which never set the pending ref in the first place', () => {
  const fn = liveSessionSrc.slice(liveSessionSrc.indexOf('function applyAnalysisResult'), liveSessionSrc.indexOf('function applyAnalysisResult') + 1200);
  assert.match(fn, /if \(pendingAnalysisResolverRef\.current\) \{/);
  assert.match(fn, /resolve\(patches\.sessionPatch\.aiSessionAnalysisResult\);/);
  assert.match(fn, /setSessionAnalysisAutoRun\(false\);/);
});

test('closing the auto-run modal before any result lands still resolves runAiAnalysis()\'s own Promise (with null) - never leaves the calling workflow hanging on a dismissed/errored analysis', () => {
  const block = liveSessionSrc.slice(liveSessionSrc.indexOf('{sessionAnalysisEntry && ('), liveSessionSrc.indexOf('{sessionAnalysisEntry && (') + 1200);
  assert.match(block, /onClose=\{\(\) => \{/);
  assert.match(block, /setSessionAnalysisAutoRun\(false\);/);
  assert.match(block, /pendingAnalysisResolverRef\.current[\s\S]{0,120}resolve\(null\);/);
  assert.match(block, /autoRun=\{sessionAnalysisAutoRun\}/);
});

test('announceAnalysisResult() dispatches tradejournal:ai-analysis-ready with the result\'s own thesis.headline, and only when one is actually present (never an empty/malformed event)', () => {
  const fn = liveSessionSrc.slice(liveSessionSrc.indexOf('function announceAnalysisResult'), liveSessionSrc.indexOf('function announceAnalysisResult') + 500);
  assert.match(fn, /const headline = result && result\.thesis && result\.thesis\.headline;/);
  assert.match(fn, /if \(headline\) window\.dispatchEvent\(new CustomEvent\('tradejournal:ai-analysis-ready', \{ detail: \{ headline \} \}\)\);/);
});

test('BOTH real places an analysis result lands - applyAnalysisResult (per-entry, and the one runAiAnalysis() itself uses) and handleAnalysisResult (the whole-session Fate summary flow) - call announceAnalysisResult(), so voice narration works identically regardless of which of the 4 trigger paths (3 manual + this new action) produced the result', () => {
  const applyFn = liveSessionSrc.slice(liveSessionSrc.indexOf('function applyAnalysisResult'), liveSessionSrc.indexOf('function applyAnalysisResult') + 1200);
  const handleFn = liveSessionSrc.slice(liveSessionSrc.indexOf('function handleAnalysisResult'), liveSessionSrc.indexOf('function handleAnalysisResult') + 500);
  assert.match(applyFn, /announceAnalysisResult\(normalizedResult\);/);
  assert.match(handleFn, /announceAnalysisResult\(result\);/);
});

// --- sessionAiAnalysisModal.jsx: autoRun ---

test('SessionAiAnalysisModal accepts an autoRun prop and, on mount, calls the SAME startAnalysis(false) its own "Analyze" button already calls - never a second, duplicated request-building path', () => {
  assert.match(analysisModalSrc, /onAddScenario, onVisualizeScenario, onVisualizeAnalysis, addedScenarioKeys, scenarioVisualizations, analysisVisualization, scenarioTitleFor, scenarioTargets, autoRun \}\)/);
  const fn = analysisModalSrc.slice(analysisModalSrc.indexOf('const autoRunFiredRef'), analysisModalSrc.indexOf('const autoRunFiredRef') + 400);
  assert.match(fn, /if \(autoRun && !autoRunFiredRef\.current\) \{ autoRunFiredRef\.current = true; startAnalysis\(false\); \}/);
});

test('autoRun only ever fires startAnalysis() once per mount (autoRunFiredRef guard) - never re-triggers on every re-render', () => {
  const fn = analysisModalSrc.slice(analysisModalSrc.indexOf('const autoRunFiredRef'), analysisModalSrc.indexOf('const autoRunFiredRef') + 400);
  assert.match(fn, /React\.useRef\(false\)/);
  assert.match(fn, /\}, \[autoRun\]\);/);
});

test('startAnalysis() itself is completely unchanged by autoRun - the same one real network call (session-analysis-client.js\'s analyzeSession()) either a manual click or autoRun triggers, including its own cache-hit-resolves-for-free behavior', () => {
  assert.match(analysisModalSrc, /const outcome = await client\.analyzeSession\(request\);/);
});

// --- chatDockView.jsx: the Voice narration listener ---

test('chatDockView.jsx listens for tradejournal:ai-analysis-ready and only speaks when Voice Mode is genuinely connected right now (reads voiceRef.current.state() fresh, never a stale closed-over voiceState) - never for a typed-only session', () => {
  const fn = dockViewSrc.slice(dockViewSrc.indexOf("function onAnalysisReady"), dockViewSrc.indexOf("window.addEventListener('tradejournal:ai-analysis-ready'"));
  assert.match(fn, /if \(!headline \|\| !voiceRef\.current \|\| !playbackControllerRef\.current\) return;/);
  assert.match(fn, /const currentState = voiceRef\.current\.state\(\);/);
  assert.match(fn, /if \(currentState === VOICE_STATES\.IDLE \|\| currentState === VOICE_STATES\.ERROR\) return;/);
});

test('the spoken headline goes through the same Persian Voice Quality post-processing (voiceText.toSpokenText) every other spoken reply already gets, then the exact same PlaybackController.enqueue() queue - no new, parallel speech mechanism', () => {
  const fn = dockViewSrc.slice(dockViewSrc.indexOf("function onAnalysisReady"), dockViewSrc.indexOf("window.addEventListener('tradejournal:ai-analysis-ready'"));
  assert.match(fn, /const spoken = voiceText \? voiceText\.toSpokenText\(headline, i18n\.language\(\)\) : headline;/);
  assert.match(fn, /playbackControllerRef\.current\.enqueue\(spoken, \{ kind: 'ai-analysis-result', caption: headline \}\);/);
});

test('the listener is registered exactly once, mount-time (empty deps), and cleaned up on unmount - never re-subscribed on every voiceState change', () => {
  const block = dockViewSrc.slice(dockViewSrc.indexOf("function onAnalysisReady"), dockViewSrc.indexOf("function toggleVoice"));
  assert.match(block, /window\.addEventListener\('tradejournal:ai-analysis-ready', onAnalysisReady\);/);
  assert.match(block, /window\.removeEventListener\('tradejournal:ai-analysis-ready', onAnalysisReady\);/);
  assert.match(block, /\}, \[\]\); \/\/ eslint-disable-line react-hooks\/exhaustive-deps/);
});

test('this whole narration path never references /api/ai/chat or core.sendChat - the headline is already-known text produced by the analysis call itself, never a reason to make a second AI call', () => {
  const fn = dockViewSrc.slice(dockViewSrc.indexOf("function onAnalysisReady"), dockViewSrc.indexOf("window.addEventListener('tradejournal:ai-analysis-ready'"));
  assert.doesNotMatch(fn, /sendChat|\/api\/ai\/chat/);
});

// --- action-coverage-matrix.md ---

test('docs/ai/action-coverage-matrix.md documents session.analysis.run', async () => {
  const doc = await readFile(path.join(root, 'docs', 'ai', 'action-coverage-matrix.md'), 'utf8');
  assert.match(doc, /`session\.analysis\.run`/);
  assert.match(doc, /tradejournal:ai-analysis-ready/);
});
