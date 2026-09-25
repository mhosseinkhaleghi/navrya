import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { trainingCopy, trDigits, trt } from '../navrya-src/analysisProfileTrainingCopy.js';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// What the trader SEES of a teaching job (analysisProfileTeachActivity.jsx, EngineLearningPanel as a view over the job store, the header bar in
// ProfileDetail): the animation that says "the engine is learning", the bar that follows them across tabs, and a review that is restored when
// the panel is mounted again. The components are RENDERED against the same job-store module instance they read (one bundle), in every language.

const root = process.cwd();
const LANGS = ['fa', 'ar', 'en', 'es'];
const read = async (...parts) => (await readFile(path.join(root, ...parts), 'utf8')).replace(/\r\n/g, '\n');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const PHYSICAL = /(?:margin|padding|border)-(?:left|right)\b|(?:^|[;"\s{])(?:left|right):|text-align:\s*(?:left|right)/;
const withoutOrnaments = (html) => html.replace(/<span aria-hidden="true" style="position:absolute;width:12px;height:12px;pointer-events:none;[^"]*"><\/span>/g, '');

let jsx;
let jobs;
test.before(async () => {
  jsx = await loadJsx({ jobs: 'navrya-src/analysisProfileTeachJobs.js', activity: 'navrya-src/analysisProfileTeachActivity.jsx', engine: 'navrya-src/engineLearning.jsx' });
  jobs = jsx.modules.jobs;
});
test.after(async () => { delete globalThis.window; if (jsx) await jsx.cleanup(); });

const PROFILE = { id: 'p1', primaryStyleId: 'price_action', secondaryStyleIds: [], customMethodNotes: '', concepts: [], understanding: { summary: 'Reads structure first.', version: 2 } };
const RESULT = { conceptsProposed: [{ title: 'Order block retest', description: 'Wait for a retest.', priority: 'preferred' }, { title: 'Liquidity grab', description: '', priority: 'mandatory' }], updatedUnderstanding: 'Reads structure, then liquidity.', usage: { promptTokens: 900, completionTokens: 300 } };

let pending;
function setup() {
  jobs.resetTeachJobsForTests();
  jobs.setTeachNotifier(() => {});
  pending = [];
  globalThis.window = {
    matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, CustomEvent,
    TradeJournalAnalysisProfileStore: { recordEvent: () => Promise.resolve({}), settleEvents: () => Promise.resolve(), applyLearning: () => ({ id: 'p1', understanding: { version: 3 } }), recordNote: () => Promise.resolve() },
    TradeJournalAnalysisProfileAI: { ingestLearning: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) }
  };
}
const start = (key, extra) => jobs.startTeachJob({ profile: PROFILE, lang: 'en', key, kind: 'source', tab: 'knowledge', title: 'Liquidity explained', label: 'Liquidity explained', material: 'Sweeps.', ...(extra || {}) });
async function finish(index, result) { await flush(); pending[index || 0].resolve(result || RESULT); await flush(); await flush(); }
const renderBar = (lang) => jsx.render(jsx.modules.activity.TeachActivityBar, { lang, profileId: 'p1', onOpen: () => {} });
const renderPanel = (lang, extra) => jsx.render(jsx.modules.engine.EngineLearningPanel, { lang, profile: PROFILE, onChanged: () => {}, onTaught: () => {}, ...(extra || {}) });
const sourcePreset = (extra) => ({ title: 'Liquidity explained', text: 'Sweeps.', jobKey: 'source:s1', tab: 'knowledge', sourceId: 's1', onClose: () => {}, ...(extra || {}) });

// ---- the animated "learning" indicator ---------------------------------------------------------------------------------------------------

test('the learning indicator is an activity signal: orb, sweeping line, dots, the REAL elapsed clock and what the trader may do - never a progress percentage', () => {
  setup();
  const job = start('source:s1');
  for (const lang of LANGS) {
    const html = jsx.render(jsx.modules.activity.LearningActivity, { lang, job });
    const text = visibleText(html);
    assert.match(html, /role="status" aria-live="polite" data-learning="working"/);
    for (const cls of ['nv-learn-orb', 'nv-learn-ring', 'nv-learn-core', 'nv-learn-dots', 'nv-learn-line']) assert.ok(html.includes(cls), `${lang}: ${cls}`);
    assert.ok(text.includes(trainingCopy[lang].learnWorkingTitle), lang);
    assert.ok(text.includes(trainingCopy[lang].learnWorkingHint), `${lang}: says it may be left and that a reload stops it`);
    assert.ok(text.includes(trt(lang, 'learnElapsed', { time: trDigits(lang, '0:00') })), `${lang}: real elapsed time`);
    assert.doesNotMatch(html, /aria-valuenow|role="progressbar"|<progress|width:\d+%/, `${lang}: nothing that claims progress`);
    assert.equal(PHYSICAL.test(html), false, `${lang}: logical CSS only`);
  }
});

test('the elapsed clock counts real seconds since the job started and formats minutes', async () => {
  const { formatElapsed } = jsx.modules.activity;
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(7), '0:07');
  assert.equal(formatElapsed(65), '1:05');
  assert.equal(formatElapsed(600), '10:00');
  assert.equal(formatElapsed(-4), '0:00');
  assert.equal(formatElapsed('x'), '0:00');
  setup();
  const job = { ...start('source:s1'), startedAt: Date.now() - 125000 };
  const html = jsx.render(jsx.modules.activity.LearningActivity, { lang: 'en', job });
  assert.match(html, /2:0[4-9]/, 'about two minutes in');
});

test('every animation the stylesheet defines is switched off under prefers-reduced-motion, every referenced keyframe exists, and only logical properties are used', async () => {
  const css = await read('public', 'pages', 'shared', 'navrya', 'teach-activity.css');
  const used = [...css.matchAll(/animation(?:-name)?:\s*([a-z-]+)/g)].map((m) => m[1]).filter((name) => name !== 'none');
  assert.ok(used.length >= 6);
  for (const name of new Set(used)) assert.match(css, new RegExp(`@keyframes ${name} \\{`), `keyframes ${name} must exist`);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.nv-learn-ring', '.nv-learn-core', '.nv-learn-dots span', '.nv-learn-line::after', '[data-source-job="working"]']) assert.ok(reduced.includes(selector), `${selector} is stilled`);
  assert.match(reduced, /animation: none/);
  const beforeKeyframes = css.slice(0, css.indexOf('@keyframes'));
  assert.equal(PHYSICAL.test(beforeKeyframes), false, 'logical properties only in the rules');
  assert.match(css, /\[dir="rtl"\] \.nv-learn-line::after \{ animation-name: nv-learn-sweep-rtl; \}/, 'the sweep runs the other way in RTL');
  assert.ok((await read('public', 'pages', 'shared', 'navrya', 'styles.css')).includes('@import url("teach-activity.css");'));
});

test('every class the teaching UI renders exists in the stylesheet', async () => {
  const css = await read('public', 'pages', 'shared', 'navrya', 'teach-activity.css');
  const files = ['analysisProfileTeachActivity.jsx', 'analysisProfileKnowledge.jsx'];
  const rendered = new Set();
  for (const file of files) for (const m of (await read('navrya-src', file)).replace(/^\s*\/\/.*$/gm, '').matchAll(/\bnv-(?:learn|teachbar)[a-z0-9-]*/g)) rendered.add(m[0]);
  rendered.delete('nv-teachbar-row--');
  assert.ok(rendered.size >= 10, 'saw ' + rendered.size);
  for (const cls of rendered) assert.ok(css.includes('.' + cls), 'rendered but never styled: ' + cls);
});

// ---- the bar that follows the trader through every tab ------------------------------------------------------------------------------------

test('the bar says nothing when there is nothing to say', () => {
  setup();
  assert.equal(renderBar('en'), '');
});

test('while the engine learns the bar shows the animation, what is being learned, the real clock - and that work can go on', () => {
  setup();
  start('source:s1');
  for (const lang of LANGS) {
    const html = renderBar(lang);
    const text = visibleText(html);
    assert.match(html, /data-teach-bar="true" role="region"/);
    assert.match(html, /data-teach-job="source:s1" data-teach-phase="working"/);
    assert.match(html, /class="nv-learn-orb"/);
    assert.ok(text.includes(trt(lang, 'learnBarWorking', { title: 'Liquidity explained' })), lang);
    assert.ok(text.includes(trt(lang, 'learnElapsed', { time: trDigits(lang, '0:00') })), lang);
    assert.ok(html.includes(`aria-label="${trainingCopy[lang].learnBarLabel}"`));
    assert.equal(/<button/.test(html), false, 'nothing to click while it runs');
    assert.equal(PHYSICAL.test(html), false);
  }
});

test('when the proposal is back the bar says so, how many items it holds, that nothing is saved yet, and offers Review and apply', async () => {
  setup();
  start('source:s1');
  await finish(0);
  for (const lang of LANGS) {
    const html = renderBar(lang);
    const text = visibleText(html);
    assert.match(html, /data-teach-phase="review"/);
    assert.ok(text.includes(trt(lang, 'learnBarReady', { title: 'Liquidity explained', n: trDigits(lang, 3) })), `${lang}: 2 concepts + the rewritten understanding`);
    assert.ok(text.includes(trainingCopy[lang].learnReviewBtn), lang);
    assert.equal(/data-learning="working"|nv-learn-orb/.test(html), false, 'no animation once it is waiting for the trader');
  }
});

test('a failed job is shown in the bar with an Open button, and more than three jobs collapse into "+N more"', async () => {
  setup();
  start('source:a', { title: 'A' });
  await flush();
  pending[0].reject(Object.assign(new Error('x'), { code: 'AUTH_SESSION_REQUIRED', status: 401 }));
  await flush();
  const failed = renderBar('en');
  assert.match(failed, /data-teach-phase="failed"/);
  assert.ok(visibleText(failed).includes(trt('en', 'learnBarFailed', { title: 'A' })));
  assert.ok(visibleText(failed).includes(trainingCopy.en.learnBarOpen));

  for (const key of ['b', 'c', 'd', 'e']) start('source:' + key, { title: key.toUpperCase() });
  const many = renderBar('en');
  assert.equal((many.match(/data-teach-job=/g) || []).length, 3);
  assert.ok(visibleText(many).includes(trt('en', 'learnBarMore', { n: '2' })));
});

test('the bar reads only its own profile\'s jobs', () => {
  setup();
  start('source:s1');
  const other = jsx.render(jsx.modules.activity.TeachActivityBar, { lang: 'en', profileId: 'someone-else', onOpen: () => {} });
  assert.equal(other, '');
});

// ---- the panel is a view over the job, restored whenever it mounts --------------------------------------------------------------------------

test('a panel mounted while the engine is still learning shows the animation and the three in-flight steps, and offers no second Teach button', () => {
  setup();
  start('source:s1');
  for (const lang of LANGS) {
    const html = renderPanel(lang, { preset: sourcePreset() });
    const text = visibleText(html);
    assert.match(html, /data-teach-working="true"/);
    assert.match(html, /data-learning="working"/);
    for (const key of ['stepRead', 'stepExtract', 'stepUpdate']) assert.ok(text.includes(trainingCopy[lang][key]), `${lang}.${key}`);
    const labels = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => visibleText(m[1]));
    assert.equal(labels.includes(trainingCopy[lang].teachBtn), false, `${lang}: nothing to press - it is already running (buttons: ${labels.join(' | ')})`);
  }
});

test('a panel mounted after the engine finished shows the review - with the trader\'s earlier edits restored - and applying goes through the store', async () => {
  setup();
  start('source:s1');
  await finish(0);
  jobs.updateTeachReview('p1', 'source:s1', { accepted: [true, false], priorities: ['mandatory', 'reference'], applyUnderstanding: false });
  const html = renderPanel('en', { preset: sourcePreset() });
  const text = visibleText(html);
  assert.ok(text.includes(trainingCopy.en.reviewTitle));
  assert.ok(text.includes('Order block retest') && text.includes('Liquidity grab'));
  assert.match(html, /<input type="checkbox" style="[^"]*" checked=""\/><span[^>]*><span dir="auto"[^>]*>Order block retest/, 'first concept still ticked');
  assert.equal(/<input type="checkbox" style="[^"]*" checked=""\/><span[^>]*><span dir="auto"[^>]*>Liquidity grab/.test(html), false, 'second concept still unticked');
  assert.equal(/<input type="checkbox" style="[^"]*" checked=""\/>Update/.test(html), false, 'the understanding rewrite they turned off stays off');
  assert.match(html, /<option value="mandatory" selected="">/, 'the priority they picked');
  assert.ok(text.includes(trt('en', 'applyBtn', { n: '1' })), 'one item is left selected');
  assert.ok(text.includes(trt('en', 'tokensUsed', { n: '1,200' })));
  assert.ok(text.includes(trainingCopy.en.learnLaterBtn), 'Decide later - hides the panel, keeps the job');
});

test('"Decide later" appears only when the caller can hide the panel, and the stale-understanding warning only when the understanding changed since the proposal was written', async () => {
  setup();
  start('source:s1');
  await finish(0);
  assert.equal(visibleText(renderPanel('en', { preset: sourcePreset({ onClose: undefined }) })).includes(trainingCopy.en.learnLaterBtn), false);
  assert.equal(/data-teach-stale/.test(renderPanel('en', { preset: sourcePreset() })), false, 'the understanding is what the engine was shown');
  const changed = jsx.render(jsx.modules.engine.EngineLearningPanel, { lang: 'en', profile: { ...PROFILE, understanding: { summary: 'Edited by hand.', version: 3 } }, onChanged: () => {}, preset: sourcePreset() });
  assert.match(changed, /role="alert" data-teach-stale="true"/);
  assert.ok(visibleText(changed).includes(trainingCopy.en.learnStale));
});

test('a panel mounted after a failure shows the SPECIFIC reason with a retry, and a typed note is put back in its box', async () => {
  setup();
  start('note', { kind: 'note', tab: 'memory', title: 'wait for the sweep', label: 'wait for the sweep', material: 'wait for the sweep', rawText: 'wait for the sweep' });
  await flush();
  pending[0].reject(Object.assign(new Error('x'), { code: 'WALLET_INSUFFICIENT_BALANCE', status: 402 }));
  await flush();
  for (const lang of LANGS) {
    const html = renderPanel(lang);
    assert.match(html, /data-ai-error-kind="wallet"/, `${lang}: the wallet reason`);
    assert.match(html, /<textarea[^>]*>wait for the sweep<\/textarea>/, `${lang}: what they typed is not lost`);
    assert.ok(visibleText(html).includes(trainingCopy[lang].teachBtn), `${lang}: they can edit and send again`);
  }
});

test('a panel with no job is the plain input it always was', () => {
  setup();
  const note = renderPanel('en');
  assert.match(note, /<textarea/);
  assert.equal(/data-teach-working|data-learning/.test(note), false);
  assert.ok(visibleText(note).includes(trainingCopy.en.saveNoteBtn));
});

// ---- wiring --------------------------------------------------------------------------------------------------------------------------------------

test('ProfileDetail mounts the bar above every tab and Open takes the trader to the tab (and the review) that holds the result', async () => {
  const view = await read('navrya-src', 'analysisProfilesView.jsx');
  assert.match(view, /<TeachActivityBar lang=\{lang\} profileId=\{profile\.id\} onOpen=\{\(job\) => \{ openTeachJob\(profile\.id, job\.key\); setDtab\(job\.tab\); \}\} \/>/);
  assert.ok(view.indexOf('<TeachActivityBar') < view.indexOf('<AiReadinessBar lang={lang} />'), 'above the tab content');
  assert.ok(view.indexOf('<TeachActivityBar') > view.indexOf('tabOverview'), 'below the tab pills');
});

test('a review the trader asked for scrolls into view instead of opening above the fold, and closing the tab does not stop the job', async () => {
  const knowledge = await read('navrya-src', 'analysisProfileKnowledge.jsx');
  assert.match(knowledge, /node\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(knowledge, /openReviewKeys = jobs\.filter\(\(job\) => job\.tab === 'knowledge' && job\.phase === 'review' && job\.open\)/);
  const jobsSource = await read('navrya-src', 'analysisProfileTeachJobs.js');
  assert.doesNotMatch(jobsSource.replace(/^\s*\/\/.*$/gm, ''), /React|useEffect|useState/, 'the store has no component lifecycle to tie a request to');
  const engine = (await read('navrya-src', 'engineLearning.jsx')).replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(engine, /ingestLearning\(|applyLearning\(/, 'the panel neither makes the call nor commits it');
});

test('a correction from the Preview tab is a job too: it is keyed and tabbed, and one running or waiting is listed below the sample when the trader returns', async () => {
  const preview = await read('navrya-src', 'analysisProfilePreview.jsx');
  assert.match(preview, /jobKey: 'correction:' \+ observation\.title, tab: 'preview'/);
  assert.match(preview, /const detachedCorrections = teachJobs\.filter\(\(job\) => job\.tab === 'preview' && job\.key !== shownKey\);/);
  assert.match(preview, /data-preview-corrections="true"/);
  assert.match(preview, /onClose: job\.phase === 'failed' \? \(\) => dismissTeachJob\(profile\.id, job\.key\) : undefined/, 'a review is never discarded by a "close" - only a failure can be cleared');
});

test('every copy key the teaching UI looks up exists in all four languages with the same placeholders', async () => {
  const sources = await Promise.all(['analysisProfileTeachActivity.jsx', 'analysisProfileTeachJobs.js', 'analysisProfileKnowledge.jsx', 'engineLearning.jsx'].map((f) => read('navrya-src', f)));
  const keys = new Set(sources.flatMap((text) => [...text.matchAll(/'((?:learn|srcStep|srcState)[A-Za-z]+)'/g)].map((m) => m[1])));
  for (const key of ['learnBadgeWorking', 'learnBadgeReview', 'srcStepTeachNext', 'srcStepReadNext', 'srcStepLearning', 'srcStepReview', 'srcStateWorking', 'srcStateReview']) keys.add(key);
  assert.ok(keys.size >= 25, 'saw ' + keys.size);
  const placeholders = (text) => (String(text).match(/\{[a-zA-Z]+\}/g) || []).sort().join();
  for (const key of keys) {
    assert.ok(trainingCopy.en[key], `en.${key}`);
    for (const lang of LANGS) {
      assert.ok(trainingCopy[lang][key], `${lang}.${key}`);
      assert.equal(placeholders(trainingCopy[lang][key]), placeholders(trainingCopy.en[key]), `${lang}.${key} placeholders`);
    }
  }
});
