import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { trainingCopy } from '../navrya-src/analysisProfileTrainingCopy.js';

// Analysis Profile "Knowledge" tab (Phase 3): the browser store's source methods and the AI client's
// readSource / PDF attachment are exercised for real in a vm sandbox (same harness as
// analysis-profile-store.test.mjs / analysis-profile-ai-client.test.mjs); the .jsx files are checked
// statically (no JSX transform in `node --test`).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const LANGS = ['fa', 'ar', 'en', 'es'];

function fnBody(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(start > -1, `could not find function ${name}`);
  const next = text.slice(start + 10).search(/\n  (?:async )?function \w+\(|\nexport function |\nfunction |\nasync function /);
  const body = text.slice(start, next > -1 ? start + 10 + next : text.length);
  return body.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
}

// ---- store: source methods over a stubbed fetch ---------------------------------------------------

async function loadStore(handler) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, method: (options && options.method) || 'GET', body: options && options.body ? JSON.parse(options.body) : undefined, at: calls.length });
    return handler(url, options || {}, calls);
  };
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 't' } }, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout: (fn) => fn(), URL
  };
  Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  for (const file of ['server-replica.js', 'analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-store.js']) {
    vm.runInContext(await source(file), sandbox, { filename: file });
  }
  return { store: sandbox.window.TradeJournalAnalysisProfileStore, calls };
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the store exposes the source methods and whenPersisted', async () => {
  const { store } = await loadStore(() => json(200, { analysisProfiles: [] }));
  for (const name of ['listSources', 'addSource', 'updateSource', 'removeSource', 'uploadSourcePdf', 'queueLinkSources', 'whenPersisted']) {
    assert.equal(typeof store[name], 'function', name);
  }
});

test('the source methods call the nested owner-scoped routes with the right verbs and bodies', async () => {
  const { store, calls } = await loadStore((url, options) => {
    if (options.method === 'DELETE') return { ok: true, status: 204, json: async () => null };
    if (url.endsWith('/sources') && (!options.method || options.method === 'GET')) return json(200, { sources: [{ id: 's1' }] });
    if (options.method === 'POST' && url.endsWith('/api/sync/analysis-profiles')) return json(200, JSON.parse(options.body));
    return json(options.method === 'POST' ? 201 : 200, { id: 's1', ...(options.body ? JSON.parse(options.body) : {}) });
  });
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  await flush();
  assert.deepEqual((await store.listSources(profile.id)).map((s) => s.id), ['s1']);
  await store.addSource(profile.id, { kind: 'website', url: 'https://example.com/a' });
  await store.updateSource(profile.id, 's1', { status: 'taught' });
  await store.uploadSourcePdf(profile.id, { dataUrl: 'data:application/pdf;base64,AAAA', filename: 'a.pdf' });
  await store.removeSource(profile.id, 's1');
  const base = '/api/sync/analysis-profiles/' + profile.id + '/sources';
  const seen = calls.filter((c) => c.url.startsWith(base)).map((c) => `${c.method} ${c.url.slice(base.length) || '/'}`);
  assert.deepEqual(seen, ['GET /', 'POST /', 'PATCH /s1', 'POST /pdf', 'DELETE /s1']);
});

test('a source request that fails rejects with an AnalysisProfileError carrying the server\'s stable code (never swallowed)', async () => {
  const { store } = await loadStore((url, options) => {
    if (url.includes('/sources')) return json(403, { error: 'STORAGE_QUOTA_EXCEEDED' });
    return json(200, options.body ? JSON.parse(options.body) : { analysisProfiles: [] });
  });
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  await assert.rejects(() => store.uploadSourcePdf(profile.id, { dataUrl: 'data:application/pdf;base64,AAAA' }), (error) => error.code === 'STORAGE_QUOTA_EXCEEDED' && error.name === 'AnalysisProfileError');
  await assert.rejects(() => store.listSources(profile.id), (error) => error.code === 'STORAGE_QUOTA_EXCEEDED');
});

test('a child request WAITS for the profile write to land first - creating a profile and immediately adding a source must not 404', async () => {
  let releaseProfileWrite;
  const profileWriteHeld = new Promise((resolve) => { releaseProfileWrite = resolve; });
  let sourcePostedBeforeProfile = false;
  let profileLanded = false;
  const { store } = await loadStore(async (url, options) => {
    if (options.method === 'POST' && url === '/api/sync/analysis-profiles') { await profileWriteHeld; profileLanded = true; return json(200, JSON.parse(options.body)); }
    if (url.includes('/sources')) { if (!profileLanded) sourcePostedBeforeProfile = true; return json(201, { id: 's1' }); }
    return json(200, { analysisProfiles: [] });
  });
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  const added = store.addSource(profile.id, { kind: 'website', url: 'https://example.com/a' });
  await flush();
  assert.equal(sourcePostedBeforeProfile, false, 'the source request must not be sent while the profile write is still in flight');
  releaseProfileWrite();
  await added;
  assert.equal(profileLanded, true);
  assert.equal(sourcePostedBeforeProfile, false);
});

test('whenPersisted resolves immediately for a profile with no write in flight, and never rejects even if the write failed', async () => {
  const { store } = await loadStore((url, options) => (options.method === 'POST' ? json(500, {}) : json(200, { analysisProfiles: [] })));
  await flush();
  assert.equal(await store.whenPersisted('nothing-pending'), true);
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  assert.equal(await store.whenPersisted(profile.id), false, 'a failed write resolves false, it never throws');
});

test('queueLinkSources records each distinct wizard link as a queued source (YouTube vs website by host), skips duplicates and a bad link, and never reads or teaches', async () => {
  const posted = [];
  const { store } = await loadStore(async (url, options) => {
    if (url.includes('/sources') && options.method === 'POST') {
      const body = JSON.parse(options.body); posted.push(body);
      if (body.url === 'https://dup.example.com/') return json(409, { error: 'ANALYSIS_PROFILE_SOURCE_DUPLICATE' });
      return json(201, { id: 's' + posted.length, ...body });
    }
    return json(200, options.body ? JSON.parse(options.body) : { analysisProfiles: [] });
  });
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  const queued = await store.queueLinkSources(profile.id, {
    youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', websiteUrl: 'https://dup.example.com/', referenceUrl: 'https://youtu.be/dQw4w9WgXcQ'
  });
  assert.equal(queued, 1, 'the duplicate (409) and the repeated URL are not counted');
  assert.deepEqual(posted.map((b) => b.kind + ':' + b.url), ['youtube:https://youtu.be/dQw4w9WgXcQ', 'website:https://dup.example.com/']);
  assert.ok(posted.every((b) => b.status === undefined && b.digest === undefined), 'a queued link carries no digest and no status - it is only recorded');
  assert.equal(await store.queueLinkSources(profile.id, { youtubeUrl: '', websiteUrl: 'not a url' }), 0);
  assert.equal(await store.queueLinkSources(profile.id, null), 0);
});

// ---- AI client: readSource + PDF attachment -------------------------------------------------------

async function loadClient({ fetchImpl, settings } = {}) {
  const sandbox = {
    window: { setTimeout: (fn) => fn(), clearTimeout: () => {}, TradeJournalAISettingsStore: settings }, AbortController, console,
    fetch: fetchImpl || (async () => ({ ok: false, status: 500, json: async () => ({}) }))
  };
  vm.createContext(sandbox);
  for (const file of ['analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-ai.js']) {
    vm.runInContext(await source(file), sandbox, { filename: file });
  }
  return sandbox.window.TradeJournalAnalysisProfileAI;
}
const byokSettings = { activeProvider: () => 'openai', getKey: () => 'sk-secret', activeModel: () => 'gpt-x' };

test('readSource posts only the URL and language - it is a FREE route, so the personal API key and model are never sent to it', async () => {
  let captured;
  const client = await loadClient({ settings: byokSettings, fetchImpl: async (url, options) => { captured = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ type: 'website', url: 'https://example.com/a', title: 'T', digest: 'D' }) }; } });
  const result = await client.readSource({ url: '  https://example.com/a  ', language: 'fa' });
  assert.equal(captured.url, '/api/analysis-profiles/read-source');
  assert.deepEqual(captured.body, { url: 'https://example.com/a', language: 'fa' });
  assert.deepEqual({ ...result }, { type: 'website', url: 'https://example.com/a', title: 'T', digest: 'D', transcriptAvailable: undefined });
});

test('readSource reports transcriptAvailable for a YouTube result, and rejects with the server\'s stable code on failure', async () => {
  const yt = await loadClient({ fetchImpl: async () => ({ ok: true, json: async () => ({ type: 'youtube', url: 'https://www.youtube.com/watch?v=x', title: 'V', digest: '', transcriptAvailable: false }) }) });
  const result = await yt.readSource({ url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(result.type, 'youtube');
  assert.equal(result.transcriptAvailable, false, 'the UI uses this to offer the paste-a-transcript fallback');
  const blocked = await loadClient({ fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'SOURCE_ADDRESS_BLOCKED' }) }) });
  await assert.rejects(() => blocked.readSource({ url: 'http://127.0.0.1/' }), (error) => error.code === 'SOURCE_ADDRESS_BLOCKED');
  await assert.rejects(() => blocked.readSource({ url: '   ' }), (error) => error.code === 'SOURCE_URL_INVALID', 'an empty URL is refused locally, before any request');
});

test('ingestLearning with a PDF attachment sends it, needs no typed text, and still carries the personal key (it IS a billed route)', async () => {
  let captured;
  const client = await loadClient({ settings: byokSettings, fetchImpl: async (url, options) => { captured = JSON.parse(options.body); return { ok: true, json: async () => ({ updatedUnderstanding: '', conceptsProposed: [], provider: 'openai', usage: null }) }; } });
  await client.ingestLearning({ kind: 'source', attachment: { dataUrl: 'data:application/pdf;base64,AAAA', fileName: 'x.pdf' }, primaryStyleId: 'price_action' });
  assert.equal(captured.kind, 'source');
  assert.equal(captured.text, '');
  assert.deepEqual({ ...captured.attachment }, { dataUrl: 'data:application/pdf;base64,AAAA', fileName: 'x.pdf' });
  assert.equal(captured.apiKey, 'sk-secret');
});

test('ingestLearning still refuses when there is neither text nor a PDF (a click on nothing can never bill), and sends no attachment key when there is none', async () => {
  let calls = 0; let captured;
  const client = await loadClient({ fetchImpl: async (url, options) => { calls += 1; captured = JSON.parse(options.body); return { ok: true, json: async () => ({ updatedUnderstanding: '', conceptsProposed: [] }) }; } });
  await assert.rejects(() => client.ingestLearning({ kind: 'source', text: '  ', attachment: {} }), (error) => error.code === 'ANALYSIS_PROFILE_INGEST_TEXT_REQUIRED');
  assert.equal(calls, 0);
  await client.ingestLearning({ kind: 'note', text: 'hello' });
  assert.equal('attachment' in captured, false);
});

// ---- copy ------------------------------------------------------------------------------------------

test('every copy key the Knowledge tab can render exists in all four languages - including the ones reached through lookup maps and the error mapper', async () => {
  const text = await read('analysisProfileKnowledge.jsx');
  const known = new Set(Object.keys(trainingCopy.en));
  const direct = [...text.matchAll(/trt\(\s*lang\s*,\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
  const mapped = [...text.matchAll(/: '((?:source|kind)[A-Z][A-Za-z]+)'/g)].map((m) => m[1]);
  const returned = [...text.matchAll(/return '(sourceErr[A-Za-z]+)'/g)].map((m) => m[1]);
  const ternary = [...text.matchAll(/'((?:readBtn|rereadBtn|deletePdfConfirm|deleteSourceConfirm))'/g)].map((m) => m[1]);
  const all = [...new Set([...direct, ...mapped, ...returned, ...ternary])];
  assert.ok(all.length > 25, 'the scan must actually find the tab\'s copy keys');
  for (const key of all) for (const lang of LANGS) assert.ok(trainingCopy[lang][key], `${lang} is missing "${key}"`);
});

test('every failure code the reader, storage layer and gateway can return maps to a real translated message - never a raw code shown to the trader', async () => {
  // Evaluates the REAL mapper (it is plain JS), rather than grepping for code strings.
  const errorKeyFor = new Function(fnBody(await read('analysisProfileKnowledge.jsx'), 'errorKeyFor') + '; return errorKeyFor;')();
  const expected = {
    SOURCE_ADDRESS_BLOCKED: 'sourceErrBlocked', SOURCE_PROTOCOL_UNSUPPORTED: 'sourceErrBlocked', SOURCE_PORT_UNSUPPORTED: 'sourceErrBlocked', SOURCE_URL_INVALID: 'sourceErrBlocked',
    SOURCE_CONTENT_TYPE_UNSUPPORTED: 'sourceErrNotReadable', SOURCE_TOO_LARGE: 'sourceErrTooLarge', SOURCE_TIMEOUT: 'sourceErrTimeout', ANALYSIS_PROFILE_AI_TIMEOUT: 'sourceErrTimeout',
    SOURCE_DNS_FAILED: 'sourceErrUnreachable', SOURCE_TOO_MANY_REDIRECTS: 'sourceErrUnreachable', SOURCE_FETCH_FAILED: 'sourceErrUnreachable', SOURCE_FETCH_FAILED_404: 'sourceErrUnreachable',
    SOURCE_FETCH_FAILED_503: 'sourceErrUnreachable', ANALYSIS_PROFILE_AI_NETWORK_ERROR: 'sourceErrUnreachable', SOURCE_NOT_A_YOUTUBE_URL: 'sourceErrNotVideo',
    ANALYSIS_PROFILE_SOURCE_DUPLICATE: 'sourceErrDuplicate', ANALYSIS_PROFILE_SOURCE_LIMIT: 'sourceErrLimit', STORAGE_QUOTA_EXCEEDED: 'sourceErrQuota',
    INVALID_PDF_TYPE: 'sourceErrPdfType', PDF_TOO_LARGE: 'sourceErrPdfSize', MODEL_PDF_UNSUPPORTED: 'sourceErrPdfProvider'
  };
  for (const [code, key] of Object.entries(expected)) {
    assert.equal(errorKeyFor(code), key, code);
    for (const lang of LANGS) assert.ok(trainingCopy[lang][key], `${lang} must translate ${key}`);
  }
  for (const unknown of ['', undefined, null, 'WHATEVER', 'ANALYSIS_PROFILE_SOURCE_REQUEST_FAILED']) assert.equal(errorKeyFor(unknown), 'sourceErrGeneric', String(unknown));
});

// ---- the tab's cost discipline -----------------------------------------------------------------------

test('adding and reading are free: KnowledgeTab never calls the billed ingest itself, only the reader - teaching is delegated to a teaching job and the review to EngineLearningPanel', async () => {
  const text = await read('analysisProfileKnowledge.jsx');
  assert.doesNotMatch(text, /ingestLearning\(/, 'the tab must never make a billed call directly');
  assert.doesNotMatch(text, /applyLearning\(/, 'nor write learned state itself');
  assert.match(fnBody(text, 'readOne'), /client\.readSource\(/);
  assert.match(fnBody(text, 'teachFrom'), /startTeachJob\(\{/, 'the Teach button on the card starts the job (the only billed step, one explicit click)');
  assert.match(text, /<EngineLearningPanel lang=\{lang\} profile=\{profile\}\s+preset=\{\{\s+title: source\.title/, 'the review opens in the shared panel');
});

test('a link is added THEN read straight away (free), and a queued/wizard link is only read on an explicit click', async () => {
  const text = await read('analysisProfileKnowledge.jsx');
  const add = fnBody(text, 'addLink');
  assert.match(add, /profiles\.addSource\(/);
  assert.match(add, /await readOne\(created\)/);
  assert.match(add, /normalizeHttpUrl\(linkText\)/, 'a bad link is refused before any request');
  assert.doesNotMatch(fnBody(await read('analysisProfilesView.jsx'), 'handleWizardComplete'), /readSource|ingestLearning/, 'the wizard only QUEUES links');
});

test('a failed re-read never destroys a source that already holds content; a failed first read is kept with its reason', async () => {
  const read1 = fnBody(await read('analysisProfileKnowledge.jsx'), 'readOne');
  assert.match(read1, /if \(source\.digest\)/);
  assert.match(read1, /status: 'failed', errorCode: code/);
});

test('the PDF is validated in the browser (type, then size) before any bytes are uploaded, and the file input is reset afterwards', async () => {
  const upload = fnBody(await read('analysisProfileKnowledge.jsx'), 'uploadPdf');
  assert.ok(upload.indexOf('sourceErrPdfType') > -1 && upload.indexOf('sourceErrPdfSize') > -1);
  assert.ok(upload.indexOf('MAX_PDF_BYTES') < upload.indexOf('profiles.uploadSourcePdf('), 'the size check precedes the upload');
  assert.match(upload, /fileInput\.current\.value = ''/);
  assert.match(await read('analysisProfileKnowledge.jsx'), /const MAX_PDF_MB = 15;/, 'matches the server\'s 15 MB savePdf ceiling');
});

test('a stored PDF is downloaded only inside loadAttachment (i.e. on the explicit Teach click), from the owner-gated same-origin URL', async () => {
  const text = await read('analysisProfileKnowledge.jsx');
  assert.equal((text.match(/fetch\(source\.fileUrl/g) || []).length, 1, 'exactly one place downloads the file');
  assert.match(fnBody(text, 'loadPdfAttachment'), /credentials: 'same-origin'/);
  // Both places that hand the file to a teaching job pass it as a callback that only runs when the job starts (or is re-opened for review).
  assert.equal((text.match(/loadAttachment: source\.kind === 'pdf' \? \(\) => loadPdfAttachment\(source\) : undefined/g) || []).length, 2, 'teachFrom + the review panel preset');
  const loadBlock = text.slice(text.indexOf('const load = React.useCallback'), text.indexOf('React.useEffect(() => { load(); }'));
  assert.ok(loadBlock.length > 50 && /listSources/.test(loadBlock), 'located the tab-open loader');
  assert.doesNotMatch(loadBlock, /loadPdfAttachment|fileUrl/, 'opening the tab must never download a PDF');
});

test('a source is marked taught only through the onTaught callback, which EngineLearningPanel invokes only after the job store actually applied the proposal', async () => {
  const engine = await read('engineLearning.jsx');
  const apply = fnBody(engine, 'apply');
  assert.ok(apply.indexOf('applyTeachJob(') > -1 && apply.indexOf('onTaught(') > apply.indexOf('applyTeachJob('), 'onTaught fires after the apply');
  assert.match(apply, /if \(outcome\.saved\) \{[\s\S]*?if \(preset && onTaught\) onTaught\(outcome\.saved\.understanding\.version\);/);
  assert.match(fnBody(await read('analysisProfileKnowledge.jsx'), 'onTaught'), /status: 'taught', taughtUnderstandingVersion: version/);
  assert.match(await read('analysisProfileTeachJobs.js'), /const saved = profiles\.applyLearning\(profileId, \{/, 'the one applyLearning() call lives in the job store');
});

test('the source teach flow reuses the same single-call propose/apply path: kind is "source", the PDF is loaded before the one billed call, and a PDF-unsupported provider is reported honestly', async () => {
  const engine = await read('engineLearning.jsx');
  const jobs = await read('analysisProfileTeachJobs.js');
  const run = fnBody(jobs, 'run');
  assert.equal((run.match(/ingestLearning\(/g) || []).length, 1, 'the job makes exactly one billed call');
  assert.match(engine, /const teachKind = preset \? \(preset\.kind \|\| 'source'\) : kind;/, 'the Knowledge tab relies on the default (no preset.kind override) staying "source"');
  assert.ok(run.indexOf('request.loadAttachment()') > -1 && run.indexOf('request.loadAttachment()') < run.indexOf('ingestLearning('), 'the PDF is loaded before any billed call');
  // The unsupported-PDF-provider case is one of the specific kinds of the shared AI error mapper (analysisProfileAiErrors.js), so the job only has
  // to hand the caught error to it - and the mapper has to know that code.
  assert.match(run, /error: toAiError\(caught\)/);
  assert.match(await read('analysisProfileAiErrors.js'), /MODEL_PDF_UNSUPPORTED/);
  assert.match(jobs, /eventKind: 'taught_' \+ request\.kind/, 'a source teach (kind "source") still records taught_source');
});

test('the new ledger kinds the source flow writes have history labels', async () => {
  const memory = await read('analysisProfileMemory.jsx');
  assert.match(memory, /ai_analyzed_source: 'evtAiAnalyzed'/);
  assert.match(memory, /taught_source: 'evtTaughtSource'/);
});

// ---- wiring ------------------------------------------------------------------------------------------

test('the detail pill bar lists Knowledge between Concepts and Memory, renders KnowledgeTab keyed by profile id, and every language labels it', async () => {
  const view = await read('analysisProfilesView.jsx');
  assert.match(view, /\['concepts', tr\(lang, 'tabConcepts'\)\], \['knowledge', tr\(lang, 'tabKnowledge'\)\], \['memory', tr\(lang, 'tabMemory'\)\]/);
  assert.match(view, /dtab === 'knowledge' && <KnowledgeTab key=\{profile\.id\}/);
  for (const lang of LANGS) assert.match(view, new RegExp(`  ${lang}: \\{[\\s\\S]*?tabMemory: '[^']+',[\\s\\S]*?tabKnowledge: '[^']+'`), `${lang} must label the Knowledge tab`);
});

test('creating a profile with Custom Method links queues them and opens the Knowledge tab; editing, and a profile with no links, behave exactly as before', async () => {
  const handler = fnBody(await read('analysisProfilesView.jsx'), 'handleWizardComplete');
  assert.match(handler, /wizard\.mode === 'edit' && wizard\.existingProfile\) \{ store\.update\(wizard\.existingProfile\.id, draft\); setWizard\(null\); return; \}/);
  assert.match(handler, /store\.queueLinkSources\(created\.id, links\)/);
  assert.match(handler, /links\.youtubeUrl \|\| links\.websiteUrl \|\| links\.referenceUrl/, 'no links -> nothing queued, nothing opened');
  assert.match(handler, /if \(count > 0\) \{ setOpenId\(created\.id\); setDtab\('knowledge'\); setQueuedLinks\(true\); \}/);
});

test('every character page loads the shared scripts the Knowledge tab depends on (store, AI client)', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.match(html, /analysis-profile-store\.js/);
    assert.match(html, /analysis-profile-ai\.js/);
  }
});
