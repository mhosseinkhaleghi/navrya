import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { trainingCopy } from '../navrya-src/analysisProfileTrainingCopy.js';

// Analysis Profile "Chat" and "Preview" tabs (Phase 4). Static-source style, same convention as
// tests/analysis-profile-training-ui.test.mjs / analysis-profile-knowledge-ui.test.mjs (no JSX
// transform in `node --test`).
const root = process.cwd();
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const LANGS = ['fa', 'ar', 'en', 'es'];

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `could not find function ${name}`);
  const next = source.slice(start + 10).search(/\n  (?:async )?function \w+\(|\nexport function |\nfunction |\nasync function /);
  const body = source.slice(start, next > -1 ? start + 10 + next : source.length);
  return body.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
}

// ---- copy --------------------------------------------------------------------------------------

test('every copy key ChatTab/PreviewTab reference exists in all four languages', async () => {
  const known = new Set(Object.keys(trainingCopy.en));
  for (const file of ['analysisProfileChat.jsx', 'analysisProfilePreview.jsx']) {
    const source = await read(file);
    // 'priority' + proposal.priority... is a string CONCATENATION building a key at runtime
    // (priorityMandatory/priorityPreferred/priorityReference) - excluded from the direct scan so it
    // is not mistaken for a literal key "priority", and asserted for real via `mapped` instead.
    const direct = [...source.matchAll(/trt\(\s*lang\s*,\s*'([A-Za-z]+)'(?!\s*\+)/g)].map((m) => m[1]);
    const mapped = [...source.matchAll(/'priority' \+ proposal\.priority/g)].length
      ? ['priorityMandatory', 'priorityPreferred', 'priorityReference'] : [];
    const ternaries = [...source.matchAll(/'([A-Za-z]+Btn)'/g)].map((m) => m[1]);
    for (const key of direct.concat(mapped, ternaries)) assert.ok(known.has(key), `${file} references missing copy key "${key}"`);
  }
});

// ---- Chat tab ------------------------------------------------------------------------------------

test('ChatTab appends a turn in ONE request, only after the AI call already succeeded, and refuses an empty/duplicate send', async () => {
  const source = await read('analysisProfileChat.jsx');
  const send = fnBody(source, 'send');
  assert.equal((send.match(/client\.chat\(/g) || []).length, 1);
  assert.equal((send.match(/appendMessages\(/g) || []).length, 1);
  assert.ok(send.indexOf('client.chat(') < send.indexOf('appendMessages('), 'the message is only stored after the reply is already in hand');
  assert.match(send, /!profiles \|\| !trimmed \|\| sending/);
});

test('ChatTab sends the FULL resolved profile context (getAnalysisContext), never a partial style-only shape', async () => {
  const source = await read('analysisProfileChat.jsx');
  const send = fnBody(source, 'send');
  assert.match(send, /context\.getAnalysisContext\(profile\.id\)/);
  assert.match(send, /profileContext/);
});

test('tokens are recorded the moment the reply lands (a ledger event), separate from any proposal being applied later', async () => {
  const send = fnBody(await read('analysisProfileChat.jsx'), 'send');
  assert.match(send, /recordEvent\(profile\.id, \{ kind: 'ai_analyzed_chat'/);
  assert.match(send, /tokenUsage: result\.usage/);
});

test('applying a concept or understanding proposal goes through applyLearning() with tokenUsage:null (already recorded above), and resolves the proposal status server-side before the local UI update', async () => {
  const source = await read('analysisProfileChat.jsx');
  const apply = fnBody(source, 'applyProposal');
  assert.equal((apply.match(/applyLearning\(/g) || []).length, 1);
  assert.match(apply, /tokenUsage: null/);
  assert.ok(apply.indexOf('resolveProposals(') < apply.indexOf('resolveLocally('), 'the server is the source of truth before the UI reflects it');
});

test('dismissing a proposal never calls applyLearning() or the AI client - only resolveProposals()', async () => {
  const dismiss = fnBody(await read('analysisProfileChat.jsx'), 'dismissProposal');
  assert.doesNotMatch(dismiss, /applyLearning|ingestLearning|client\.chat/);
  assert.match(dismiss, /resolveProposals\(/);
});

test('a resolved proposal (applied or dismissed) shows a status label, not Apply/Dismiss buttons', async () => {
  const source = await read('analysisProfileChat.jsx');
  assert.match(source, /const resolved = proposal\.status !== 'pending';/);
  assert.match(source, /resolved \? \(/);
});

test('the wallet-balance error is distinct from a generic failure - no fake local fallback reply', async () => {
  const source = await read('analysisProfileChat.jsx');
  assert.match(source, /WALLET_INSUFFICIENT_BALANCE/);
  assert.match(source, /chatErrorBalance/);
  assert.doesNotMatch(source, /local-fallback|fallbackReply|mockReply/i);
});

test('clearing the chat asks for confirmation before calling clearMessages()', async () => {
  const clear = fnBody(await read('analysisProfileChat.jsx'), 'clearChat');
  assert.match(clear, /window\.confirm\(/);
  assert.match(clear, /clearMessages\(/);
});

// ---- Preview tab ---------------------------------------------------------------------------------

test('the Engine Brief is computed from the browser twin, never a network call - it is memoized off the resolved profile context', async () => {
  const source = await read('analysisProfilePreview.jsx');
  assert.match(source, /briefTwin\(\)\.build\(profileContext\)|twin\.build\(profileContext\)/);
  assert.doesNotMatch(source, /fetch\(|aiClient\(\)\.chat\(/);
  assert.match(source, /React\.useMemo\(/);
});

test('generating a sample makes exactly one AI call and is clearly optional (a separate button from the free brief)', async () => {
  const generate = fnBody(await read('analysisProfilePreview.jsx'), 'generate');
  assert.equal((generate.match(/client\.preview\(/g) || []).length, 1);
});

test('the sample generator sends the full profile context, and is disabled when the brief is empty (no style chosen yet)', async () => {
  const source = await read('analysisProfilePreview.jsx');
  assert.match(source, /client\.preview\(\{ profileContext,/);
  assert.match(source, /disabled=\{phase === 'working' \|\| brief\.sections\.length === 0\}/);
});

test('"Correct this" reuses EngineLearningPanel with kind:\'correction\' and editable:true - never a second, bespoke correction API call', async () => {
  const source = await read('analysisProfilePreview.jsx');
  assert.match(source, /<EngineLearningPanel/);
  assert.match(source, /kind: 'correction'/);
  assert.match(source, /editable: true/);
  assert.doesNotMatch(source, /\/api\/analysis-profiles\/ingest|ingestLearning\(/, 'Preview itself never calls ingest directly - EngineLearningPanel owns that call');
});

test('every observation is clearly labelled illustrative in its own subtitle copy, and the sample list is capped honestly (whatever the server returned, not invented)', async () => {
  const source = await read('analysisProfilePreview.jsx');
  assert.match(source, /sampleSubtitle/);
  assert.doesNotMatch(source, /observations\.slice\(/, 'the tab must render exactly what the server returned, never truncate or pad it further');
});

// ---- engineLearning.jsx: the editable-preset correction path --------------------------------------

test('engineLearning.jsx: an editable preset (a correction) requires the trader\'s OWN typed text - the material is the preset context PLUS what they typed, never the context alone', async () => {
  const source = await read('engineLearning.jsx');
  assert.match(source, /const requiresTypedText = !preset \|\| preset\.editable;/);
  assert.match(source, /preset\.editable \? String\(preset\.text \|\| ''\)\.trim\(\) \+ \(trimmed \? '\\n\\nTrader\\'s correction: ' \+ trimmed : ''\)/);
  assert.match(fnBody(source, 'teach'), /requiresTypedText && !trimmed/, 'an editable preset with no typed correction must not be sendable');
});

test('a non-editable preset (the Knowledge tab) is unaffected: it can still be sent with no typed text', async () => {
  const source = await read('engineLearning.jsx');
  const teach = fnBody(source, 'teach');
  assert.doesNotMatch(teach, /!preset && !trimmed/, 'the old always-require-preset-only check must be replaced, not left dangling');
});

test('the editable textarea only renders for an editable preset, and the submit button label differs from the fixed teachBtn', async () => {
  const source = await read('engineLearning.jsx');
  assert.match(source, /\{preset\.editable && \(/);
  assert.match(source, /trt\(lang, preset\.editable \? 'correctSubmitBtn' : 'teachBtn'\)/);
});

// ---- wiring --------------------------------------------------------------------------------------

test('the detail pill bar lists Chat and Preview after Memory and before Report, renders both tabs keyed by profile id, and every language labels them', async () => {
  const view = await read('analysisProfilesView.jsx');
  assert.match(view, /\['memory', tr\(lang, 'tabMemory'\)\], \['chat', tr\(lang, 'tabChat'\)\], \['preview', tr\(lang, 'tabPreview'\)\], \['report', tr\(lang, 'tabReport'\)\]/);
  assert.match(view, /dtab === 'chat' && <AnalysisProfileChatTab key=\{profile\.id\}/);
  assert.match(view, /dtab === 'preview' && <PreviewTab key=\{profile\.id\}/);
  for (const lang of LANGS) {
    assert.match(view, new RegExp(`  ${lang}: \\{[\\s\\S]*?tabChat: '[^']+', tabPreview: '[^']+'`), `${lang} must label both new tabs`);
  }
});

test('every character page loads the shared scripts Chat/Preview depend on (store, AI client, brief twin, context)', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.match(html, /analysis-context\.js/);
    assert.match(html, /analysis-profile-store\.js/);
    assert.match(html, /analysis-profile-ai\.js/);
    assert.match(html, /analysis-profile-brief\.js/);
  }
});
