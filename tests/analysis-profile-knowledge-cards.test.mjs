import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  SOURCE_STATES, formatSourceSize, safeHttpUrl, sourceCardState, sourceHostname, sourceSteps, summarizeSourceStates
} from '../navrya-src/analysisProfileKnowledgeCards.js';
import { trDigits, trainingCopy, trt } from '../navrya-src/analysisProfileTrainingCopy.js';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// The Knowledge tab's source cards: the pure rules (state, progress, host, size, link safety) and the real components rendered in every
// language. The security stance is part of the contract: source text is only ever text, a link is only clickable for http(s), nothing is
// requested from a source's host (no favicon, no preview image), and a PDF is never fetched to draw its card.

const root = process.cwd();
const LANGS = ['fa', 'ar', 'en', 'es'];
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const PHYSICAL = /(?:margin|padding|border)-(?:left|right)\b|(?:^|[;"\s])(?:left|right):|text-align:\s*(?:left|right)/;
const withoutOrnaments = (html) => html.replace(/<span aria-hidden="true" style="position:absolute;width:12px;height:12px;pointer-events:none;[^"]*"><\/span>/g, '');
const stepStates = (source) => sourceSteps(source).map((s) => s.key + ':' + s.state);

let jsx;
test.before(async () => { jsx = await loadJsx({ knowledge: 'navrya-src/analysisProfileKnowledge.jsx' }); });
test.after(async () => { delete globalThis.window; if (jsx) await jsx.cleanup(); });

const noop = () => {};
const card = (source, lang, extra) => {
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  return jsx.render(jsx.modules.knowledge.SourceCard, { lang, source, busy: undefined, teaching: false, transcript: '', onTranscript: noop, onSaveTranscript: noop, onRead: noop, onTeach: noop, onDelete: noop, ...(extra || {}) });
};
const site = (over) => ({ id: 's1', kind: 'website', status: 'ready', url: 'https://www.example.com/articles/liquidity?utm=1', title: 'Liquidity explained', digest: 'Sweeps of resting liquidity precede reversals.', createdAt: '2026-08-01T10:00:00.000Z', ...over });
const video = (over) => ({ id: 's2', kind: 'youtube', status: 'ready', url: 'https://youtu.be/abc123', title: 'Market structure', digest: 'BOS and CHoCH.', createdAt: '2026-08-02T10:00:00.000Z', ...over });
const pdf = (over) => ({ id: 's3', kind: 'pdf', status: 'ready', fileName: 'liquidity-book.pdf', fileUrl: '/uploads/private/x.pdf', fileAvailable: true, fileSizeBytes: 1_572_864, createdAt: '2026-08-03T10:00:00.000Z', ...over });

// ---- link safety and host --------------------------------------------------------------------------------------------------

test('only http(s) addresses are ever linkable; javascript:, data:, file:, ftp:, garbage and empty are not', () => {
  assert.equal(safeHttpUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeHttpUrl('  http://example.com  '), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com', 'mailto:a@b.co', 'vbscript:x', '//example.com', 'example.com', 'http://', '', '   ', null, undefined, 42]) {
    assert.equal(safeHttpUrl(bad), null, String(bad));
  }
});

test('the displayed host is the real host: userinfo tricks, ports and paths are dropped, www is trimmed, and an internationalised name shows in its safe ASCII form', () => {
  assert.equal(sourceHostname('https://www.example.com/a/b'), 'example.com');
  assert.equal(sourceHostname('https://docs.example.com:8443/x'), 'docs.example.com');
  assert.equal(sourceHostname('https://google.com@evil.example/login'), 'evil.example', 'text before @ is credentials, not the host');
  assert.equal(sourceHostname('https://google.com.evil.example/'), 'google.com.evil.example');
  assert.match(sourceHostname('https://пример.рф/'), /^xn--/, 'a look-alike name is shown as punycode, so it cannot pass for another host');
  assert.equal(sourceHostname('javascript:alert(1)'), null);
  assert.equal(sourceHostname('not a url'), null);
  assert.equal(sourceHostname(''), null);
});

test('a size is shown as MB or KB with its real value; unknown is null - never "0 MB"', () => {
  assert.deepEqual(formatSourceSize(1_572_864), { value: '1.50', unit: 'MB' });
  assert.deepEqual(formatSourceSize(15 * 1024 * 1024), { value: '15.00', unit: 'MB' });
  assert.deepEqual(formatSourceSize(300 * 1024), { value: '300', unit: 'KB' });
  assert.deepEqual(formatSourceSize(200), { value: '1', unit: 'KB' }, 'a tiny file never reads as 0');
  assert.deepEqual(formatSourceSize(0), { value: '0', unit: 'KB' });
  assert.deepEqual(formatSourceSize('2097152'), { value: '2.00', unit: 'MB' });
  for (const unknown of [null, undefined, '', NaN, -5, 'abc', Infinity]) assert.equal(formatSourceSize(unknown), null, String(unknown));
});

// ---- state and progress ------------------------------------------------------------------------------------------------------

test('the card state follows the record: queued / ready / taught / failed, an unknown status is queued, and a PDF whose file is gone (and was never taught) is missing', () => {
  for (const status of ['queued', 'ready', 'taught', 'failed']) assert.equal(sourceCardState(site({ status })), status);
  assert.equal(sourceCardState(site({ status: 'weird' })), 'queued');
  assert.equal(sourceCardState(site({ status: 'missing' })), 'queued', '"missing" is derived, never a stored status');
  assert.equal(sourceCardState(undefined), 'queued');
  assert.equal(sourceCardState(pdf()), 'ready');
  assert.equal(sourceCardState(pdf({ fileAvailable: false })), 'missing');
  assert.equal(sourceCardState(pdf({ fileAvailable: false, status: 'queued' })), 'missing');
  assert.equal(sourceCardState(pdf({ fileAvailable: false, status: 'taught' })), 'taught', 'what a taught PDF taught is already in the profile');
  assert.equal(sourceCardState(pdf({ fileAvailable: false, status: 'failed' })), 'missing');
  assert.equal(sourceCardState(site({ fileAvailable: false })), 'ready', 'fileAvailable only matters for a PDF');
});

test('link progress is Add -> Read -> Taught: read is done only once there is something to teach from', () => {
  assert.deepEqual(stepStates(site({ status: 'queued', digest: '' })), ['added:done', 'read:current', 'taught:todo']);
  assert.deepEqual(stepStates(site({ status: 'failed', digest: '' })), ['added:done', 'read:failed', 'taught:todo']);
  assert.deepEqual(stepStates(site({ status: 'ready' })), ['added:done', 'read:done', 'taught:current']);
  assert.deepEqual(stepStates(site({ status: 'taught' })), ['added:done', 'read:done', 'taught:done']);
  assert.deepEqual(stepStates(video({ status: 'ready', digest: '' })), ['added:done', 'read:current', 'taught:todo'], 'a video fetched without captions still needs the transcript');
  assert.deepEqual(stepStates(site({ status: 'taught', digest: '' })), ['added:done', 'read:done', 'taught:done']);
});

test('PDF progress is Add -> Stored -> Taught: a stored file is ready to teach, a missing one can never be', () => {
  assert.deepEqual(stepStates(pdf()), ['added:done', 'stored:done', 'taught:current']);
  assert.deepEqual(stepStates(pdf({ status: 'taught' })), ['added:done', 'stored:done', 'taught:done']);
  assert.deepEqual(stepStates(pdf({ fileAvailable: false })), ['added:done', 'stored:failed', 'taught:todo']);
  assert.deepEqual(stepStates(pdf({ fileAvailable: false, status: 'taught' })), ['added:done', 'stored:failed', 'taught:done']);
  assert.deepEqual(stepStates(pdf({ status: 'failed' })), ['added:done', 'stored:failed', 'taught:todo']);
});

test('the per-state summary counts every source once and tolerates junk', () => {
  const counts = summarizeSourceStates([site({ status: 'taught' }), site({ status: 'ready' }), video({ status: 'queued' }), site({ status: 'failed' }), pdf({ fileAvailable: false }), pdf(), null, undefined]);
  assert.deepEqual(counts, { queued: 1, ready: 2, taught: 1, failed: 1, missing: 1 });
  assert.deepEqual(summarizeSourceStates(undefined), { queued: 0, ready: 0, taught: 0, failed: 0, missing: 0 });
  assert.deepEqual(SOURCE_STATES, ['queued', 'ready', 'taught', 'failed', 'missing']);
});

// ---- the rendered cards ------------------------------------------------------------------------------------------------------------

test('each kind is visually and textually distinct: its own label, icon tile colour and data attribute', () => {
  const html = { website: card(site(), 'en'), youtube: card(video(), 'en'), pdf: card(pdf(), 'en') };
  for (const [kind, markup] of Object.entries(html)) assert.match(markup, new RegExp(`data-source-kind="${kind}"`));
  assert.ok(visibleText(html.website).includes(trainingCopy.en.sourceKindWebsite));
  assert.ok(visibleText(html.youtube).includes(trainingCopy.en.sourceKindYoutube));
  assert.ok(visibleText(html.pdf).includes(trainingCopy.en.sourceKindPdf));
  const tones = Object.values(html).map((markup) => /color-mix\(in srgb, (var\(--[a-z-]+\)) 13%/.exec(markup)[1]);
  assert.equal(new Set(tones).size, 3, 'three different kind colours: ' + tones.join(', '));
});

test('a website card shows title, host (isolated LTR), a safe link, the digest preview, its progress and Added date - in every language', () => {
  for (const lang of LANGS) {
    const html = card(site(), lang);
    const text = visibleText(html);
    assert.match(html, /<bdi dir="ltr" data-source-host="true">example\.com<\/bdi>/);
    assert.match(html, /<a href="https:\/\/www\.example\.com\/articles\/liquidity\?utm=1" target="_blank" rel="noopener noreferrer nofollow"/);
    assert.ok(text.includes('Liquidity explained') && text.includes('Sweeps of resting liquidity'));
    assert.ok(text.includes(trainingCopy[lang].digestLabel));
    assert.ok(text.includes(trainingCopy[lang].sourceStatusReady));
    for (const key of ['srcStepAdded', 'srcStepRead', 'srcStepTaught']) assert.ok(text.includes(trainingCopy[lang][key]), `${lang}.${key}`);
    assert.match(html, /data-step="read" data-step-state="done"/);
    assert.match(html, /data-step="taught" data-step-state="current"/);
    assert.ok(text.includes(trainingCopy[lang].teachFromSourceBtn) && text.includes(trainingCopy[lang].rereadBtn) && text.includes(trainingCopy[lang].deleteSource));
    assert.equal(PHYSICAL.test(withoutOrnaments(html)), false, `${lang}: logical CSS only`);
  }
});

test('a queued link says it has not been read and offers Read - not Teach (there is nothing to teach from yet)', () => {
  for (const lang of LANGS) {
    const html = card(site({ status: 'queued', digest: '' }), lang);
    const text = visibleText(html);
    assert.match(html, /data-source-state="queued"/);
    assert.ok(text.includes(trainingCopy[lang].srcNotReadYet));
    assert.ok(text.includes(trainingCopy[lang].readBtn));
    assert.equal(text.includes(trainingCopy[lang].teachFromSourceBtn), false);
  }
});

test('a failed link shows why (a translated reason, not a raw code) as an alert, and can be read again', () => {
  const html = card(site({ status: 'failed', digest: '', errorCode: 'SOURCE_TIMEOUT' }), 'en');
  assert.match(html, /role="alert"/);
  assert.match(html, /data-source-state="failed"/);
  assert.ok(visibleText(html).includes(trainingCopy.en.sourceErrTimeout));
  assert.doesNotMatch(visibleText(html), /SOURCE_TIMEOUT/);
  assert.ok(visibleText(html).includes(trainingCopy.en.readBtn));
  assert.match(html, /data-step="read" data-step-state="failed"/);
});

test('a YouTube card without captions asks for the transcript and is not "read"', () => {
  const html = card(video({ digest: '' }), 'en');
  assert.ok(visibleText(html).includes(trainingCopy.en.noTranscriptTitle));
  assert.match(html, /<textarea/);
  assert.match(html, /data-step="read" data-step-state="current"/);
});

test('a PDF card shows its file name, size and date, says it is private, and offers Teach - with no Read (a PDF is not read server-side)', () => {
  for (const lang of LANGS) {
    const html = card(pdf(), lang);
    const text = visibleText(html);
    assert.match(html, /data-source-kind="pdf"/);
    assert.ok(text.includes('liquidity-book.pdf'));
    assert.ok(text.includes(trDigits(lang, '1.50') + ' MB'), `${lang}: size ${text}`);
    assert.ok(text.includes(trainingCopy[lang].srcPdfPrivate));
    assert.ok(text.includes(trainingCopy[lang].teachFromSourceBtn));
    const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => visibleText(m[1]));
    assert.equal(buttons.some((label) => label === trainingCopy[lang].readBtn || label === trainingCopy[lang].rereadBtn), false, `${lang}: no Read button: ${buttons.join(' | ')}`);
    assert.ok(text.includes(trainingCopy[lang].srcStepStored));
    assert.equal(/<a /.test(html), false, 'a PDF card never links out (its file is owner-gated and only fetched on Teach)');
  }
});

test('a PDF whose file is gone is marked missing: the warning is shown, nothing can be taught from it, and only Delete remains', () => {
  for (const lang of LANGS) {
    const html = card(pdf({ fileAvailable: false }), lang);
    const text = visibleText(html);
    assert.match(html, /data-source-state="missing"/);
    assert.ok(text.includes(trainingCopy[lang].srcStatusMissing) && text.includes(trainingCopy[lang].fileRemoved));
    assert.equal(text.includes(trainingCopy[lang].teachFromSourceBtn), false);
    assert.equal(text.includes(trainingCopy[lang].srcPdfPrivate), false, 'no "stored privately" claim about a file that is not there');
    assert.ok(text.includes(trainingCopy[lang].deleteSource));
    assert.match(html, /data-step="stored" data-step-state="failed"/);
  }
});

test('a taught source shows its taught date and the understanding version it produced, and can be taught again', () => {
  const html = card(site({ status: 'taught', taughtAt: '2026-09-01T09:00:00.000Z', taughtUnderstandingVersion: 4 }), 'en');
  const text = visibleText(html);
  assert.match(html, /data-source-state="taught"/);
  assert.ok(text.includes(trt('en', 'srcTaughtOn', { date: 'x' }).split('x')[0].trim()), 'says "Taught <date>"');
  assert.ok(text.includes(trt('en', 'understandingVersion', { n: '4' })));
  assert.match(html, /data-step="taught" data-step-state="done"/);
  assert.ok(text.includes(trainingCopy.en.teachFromSourceBtn));
});

test('the card being taught from is marked, and its Teach button is disabled while it is open; a busy card cannot be acted on twice', () => {
  const teaching = card(site(), 'en', { teaching: true });
  assert.match(teaching, /data-teaching="true"/);
  assert.match(teaching, /data-teaching-note="true"/);
  assert.match(teaching, /<button[^>]*disabled[^>]*>[^<]*(?:<[^>]+>[^<]*)*?Teach/i);
  const busy = card(site(), 'en', { busy: 'reading' });
  assert.ok((busy.match(/<button[^>]*disabled/g) || []).length >= 3, 'teach, read and delete are all disabled while reading');
  const idle = card(site(), 'en');
  assert.equal(/data-teaching=/.test(idle), false);
});

test('the footer (progress + actions) is pinned to the bottom so cards of different content length line up in an equal-height row', () => {
  const html = card(site(), 'en');
  assert.match(html, /data-source-footer="true" style="[^"]*margin-block-start:auto/);
  assert.match(html, /^<li style="list-style:none;display:flex;min-width:0">/);
});

// ---- hostile content ------------------------------------------------------------------------------------------------------------------

test('source text is only ever text: markup in a title, digest, file name or error is escaped and never becomes an element', () => {
  const attack = '<img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">x</a>';
  const html = card(site({ title: attack, digest: attack }), 'en') + card(pdf({ fileName: attack }), 'en') + card(video({ title: attack, digest: '', status: 'ready' }), 'en');
  assert.equal(/<img/i.test(html), false);
  assert.equal(/<script/i.test(html), false);
  assert.equal(/<a href="javascript/i.test(html), false);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'the text is shown, escaped');
  assert.ok(visibleText(html).includes('<script>alert(2)</script>'));
});

test('an unsafe or non-http address is shown as plain text and never as a link', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd']) {
    const html = card(site({ url }), 'en');
    assert.equal(/<a /.test(html), false, url);
    assert.equal(/data-source-host/.test(html), false, 'no host is invented for it');
    assert.ok(visibleText(html).includes(url), 'the trader can still see what was stored');
  }
});

test('no card requests anything from a source: no image, no favicon, no iframe, no fetch - and the PDF file is fetched only on an explicit Teach', async () => {
  const html = ['website', 'youtube', 'pdf'].map((kind) => card(kind === 'website' ? site() : kind === 'youtube' ? video() : pdf(), 'en')).join('');
  assert.equal(/<img|<iframe|<object|<embed|<video|<audio|<link |favicon|s2\/favicons|srcset|background-image|url\(/i.test(html), false, 'nothing that loads an external resource');
  const source = await read('analysisProfileKnowledge.jsx');
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /dangerouslySetInnerHTML|innerHTML|favicon|<img/i);
  const cardSource = code.slice(code.indexOf('export function SourceCard('), code.indexOf('export function SourceSummary('));
  assert.doesNotMatch(cardSource, /fetch\(|loadPdfAttachment|readSource|listSources/, 'drawing a card never touches the network');
  assert.equal((code.match(/fetch\(/g) || []).length, 1, 'the only fetch in the tab is the owner-gated PDF download on Teach');
  assert.match(code, /async function loadPdfAttachment\(source\) \{\n\s+const response = await fetch\(source\.fileUrl, \{ credentials: 'same-origin' \}\);/);
});

// ---- the list ---------------------------------------------------------------------------------------------------------------------------

test('the summary chips list each non-empty state once with its count, in the reader\'s digits, and nothing for empty states', () => {
  const sources = [site({ status: 'taught' }), site({ status: 'taught' }), video({ status: 'queued', digest: '' }), pdf({ fileAvailable: false })];
  for (const lang of LANGS) {
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    const html = jsx.render(jsx.modules.knowledge.SourceSummary, { lang, sources });
    assert.match(html, /role="group"/);
    assert.equal((html.match(/data-summary-state="/g) || []).length, 3);
    assert.match(html, /data-summary-state="taught"/);
    assert.equal(/data-summary-state="failed"|data-summary-state="ready"/.test(html), false);
    assert.ok(visibleText(html).includes(trainingCopy[lang].sourceStatusTaught + ' ' + trDigits(lang, 2)), lang);
  }
});

test('the cards sit in a stretching, wrapping grid, and the loading / error / empty states stay compact panels', async () => {
  const source = await read('analysisProfileKnowledge.jsx');
  assert.match(source, /data-source-grid="true" style=\{\{ margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat\(auto-fill,minmax\(min\(100%,320px\),1fr\)\)', gap: 14, alignItems: 'stretch' \}\}/);
  assert.match(source, /phase === 'loading' && <Panel/);
  assert.match(source, /phase === 'error' && \(\n\s+<Panel/);
  assert.match(source, /phase === 'ready' && sources\.length === 0 && \(\n\s+<Panel/);
  assert.match(source, /<SourceSummary lang=\{lang\} sources=\{sources\} \/>/);
});

test('add / read / teach behaviour is untouched: the same handlers drive the cards, and Teach still opens the single propose -> review -> apply panel', async () => {
  const source = await read('analysisProfileKnowledge.jsx');
  assert.match(source, /onRead=\{\(\) => readOne\(source\)\} onTeach=\{\(\) => setTeachingId\(source\.id\)\} onDelete=\{\(\) => removeOne\(source\)\}/);
  assert.match(source, /<EngineLearningPanel key=\{teaching\.id\}/);
  assert.match(source, /if \(!profiles \|\| !window\.confirm\(trt\(lang, source\.kind === 'pdf' \? 'deletePdfConfirm' : 'deleteSourceConfirm'\)\)\) return;/);
  assert.match(source, /const atLimit = sources\.length >= SOURCE_LIMIT;/);
});

test('every copy key the cards look up exists in all four languages', async () => {
  const source = await read('analysisProfileKnowledge.jsx');
  const keys = new Set([...source.matchAll(/'((?:src|source)[A-Za-z]+)'/g)].map((m) => m[1]));
  for (const key of ['srcStatusMissing', 'srcStepAdded', 'srcStepRead', 'srcStepStored', 'srcStepTaught', 'srcStateDone', 'srcStateCurrent', 'srcStateTodo', 'srcStateFailed']) keys.add(key);
  assert.ok(keys.size >= 20);
  for (const lang of LANGS) for (const key of keys) assert.ok(trainingCopy[lang][key], `${lang}.${key}`);
});
