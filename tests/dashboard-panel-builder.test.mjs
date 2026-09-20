import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGenerationPrompt, parseGeneration, titleFromPrompt, byteLength,
  UNAVAILABLE_MARKER, MAX_SOURCE_BYTES, MAX_PROMPT_CHARS
} from '../navrya-src/dashboardPanelBuilder.js';

// Every constraint asserted here is a real property of navrya-src/dashboardPanelSandbox.jsx (see
// tests/dashboard-panel-studio-sandbox.test.mjs for the matching runtime-side assertions), so this
// prompt can never silently drift away from what the sandbox actually enforces - the same
// technique tests/analysis-workspace-panel.test.mjs already uses for the Analysis Workspace target.

test('the generation prompt states every real runtime constraint the dashboard sandbox actually enforces', () => {
  const prompt = buildGenerationPrompt({ prompt: 'show my win rate', lang: 'en' });
  assert.match(prompt, /NO network access/i);
  assert.match(prompt, /fetch, XHR,\s*\n?\s*WebSocket/i);
  assert.match(prompt, /No frameworks or libraries are available/i);
  assert.match(prompt, /READ-ONLY/);
  assert.match(prompt, /NO price or candle data/i);
  assert.match(prompt, /NO news feed/i);
  assert.match(prompt, /identity, email, API keys, sessions, or wallet balance/i);
  ['getTradeSummary', 'getOpenPositions', 'getPatternStats', 'getPsychologyMirror', 'onUpdate'].forEach((method) => {
    assert.match(prompt, new RegExp('navrya\\.' + method), `prompt does not document navrya.${method}`);
  });
  assert.match(prompt, /Never invent or placeholder a number/i);
  assert.match(prompt, /show my win rate$/);
});

test('the prompt asks for output in the trader\'s own language, falling back to English', () => {
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'fa' }), /user-visible text in Persian/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'ar' }), /user-visible text in Arabic/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'es' }), /user-visible text in Spanish/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'en' }), /user-visible text in English/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'zz' }), /user-visible text in English/, 'unknown language falls back to English');
});

test('the honesty rule is in the prompt, and a revision carries the previous source instead of asking for a blind rewrite', () => {
  const fresh = buildGenerationPrompt({ prompt: 'show me live prices', lang: 'en' });
  assert.match(fresh, /HONESTY RULE/);
  assert.match(fresh, new RegExp(UNAVAILABLE_MARKER));
  assert.doesNotMatch(fresh, /REVISION/);

  const revision = buildGenerationPrompt({ prompt: 'make it bigger', lang: 'en', previousSource: '<div id="old">x</div>' });
  assert.match(revision, /This is a REVISION/);
  assert.match(revision, /<div id="old">x<\/div>/);
  assert.match(revision, /complete updated fragment \(not a diff\)/);
});

test('an honest refusal is never mistaken for panel source', () => {
  const parsed = parseGeneration(UNAVAILABLE_MARKER + ' No wallet data exists in this sandbox.');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'unavailable');
  assert.equal(parsed.message, 'No wallet data exists in this sandbox.');
});

test('a refusal is still caught when the model wraps it in a fence', () => {
  const parsed = parseGeneration('```\n' + UNAVAILABLE_MARKER + ' needs raw candles\n```');
  assert.equal(parsed.reason, 'unavailable');
  assert.equal(parsed.message, 'needs raw candles');
});

test('a markdown fence around the whole reply is stripped, but markup inside the fragment is untouched', () => {
  const parsed = parseGeneration('```html\n<div class="x"><script>navrya.getOpenPositions()</script></div>\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, '<div class="x"><script>navrya.getOpenPositions()</script></div>');
});

test('prose with no markup is refused rather than injected into the sandbox as a bare paragraph', () => {
  assert.deepEqual(parseGeneration('Sure! Here is how you could build that panel.'), { ok: false, reason: 'empty' });
  assert.deepEqual(parseGeneration(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parseGeneration(null), { ok: false, reason: 'empty' });
});

test('titleFromPrompt keeps short prompts verbatim and truncates long ones', () => {
  assert.equal(titleFromPrompt('  win rate   panel '), 'win rate panel');
  const long = titleFromPrompt('x'.repeat(80));
  assert.ok(long.length <= 43, `title too long: ${long.length}`);
  assert.match(long, /…$/);
});

test('byteLength measures UTF-8 bytes, not characters - a Persian panel must not slip past the ceiling', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('میز'), 6);
});

test('the exported size ceilings match migration 076\'s own CHECK constraints', () => {
  assert.equal(MAX_SOURCE_BYTES, 12 * 1024);
  assert.equal(MAX_PROMPT_CHARS, 400);
});
