import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

// Found via real testing: the richer, higher-verbosity system prompt (server/pattern-ai-server.mjs)
// reliably produces real '\n' paragraph/list breaks and occasional '**bold**' markdown - this app
// has no markdown renderer anywhere, and a bare <p> tag's default white-space:normal collapses
// every '\n' into a single space, so a genuinely well-structured reply rendered as one dense
// run-on sentence with stray asterisks and dashes crammed together (confirmed via a real screenshot
// and the raw network response - the model's own reply text did contain '\n\n' and '**...**').
// This codebase has no DOM/React test harness (the real proof is the real-browser
// before/after screenshot, not a unit test) - these are lightweight static-source guards against
// silently reintroducing the regression, the same convention already established for the
// panel-system.js unmount fix and the ChatDock/Modal spacing fix.

test('ChatResponsePopover.jsx preserves real line breaks (whiteSpace: pre-line) on both message-rendering paths', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');
  const occurrences = source.match(/whiteSpace:\s*'pre-line'/g) || [];
  assert.ok(occurrences.length >= 2, 'both the multi-turn `messages` path and the single-answer `lines` path must preserve real line breaks - found ' + occurrences.length);
});

test('ChatResponsePopover.jsx strips literal markdown bold/header tokens before rendering, on both paths', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');
  assert.match(source, /function stripMarkdownTokens/, 'the markdown-token-stripping helper must exist');
  const calls = source.match(/stripMarkdownTokens\(/g) || [];
  assert.ok(calls.length >= 3, 'must be defined once and called from both render paths (>= 2 call sites plus the definition itself)');
});

// Pure-logic proof of the actual stripping behavior, re-derived from the file's own real source
// (never hand-duplicated) so a change to the real regex is what this test actually exercises, not
// a parallel reimplementation that could silently drift from it.
test('stripMarkdownTokens() removes markdown bold/underline/header markers without mangling ordinary text', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');
  const match = /function stripMarkdownTokens\(text\) \{[\s\S]*?\n\}/.exec(source);
  assert.ok(match, 'could not locate the real stripMarkdownTokens function body in the source file');
  // eslint-disable-next-line no-new-func
  const stripMarkdownTokens = new Function('String', match[0] + '\nreturn stripMarkdownTokens;')(String);
  assert.equal(stripMarkdownTokens('Set **entry** to 64250.'), 'Set entry to 64250.');
  assert.equal(stripMarkdownTokens('__Stop-loss__ is required.'), 'Stop-loss is required.');
  assert.equal(stripMarkdownTokens('# Trade summary\nDetails below.'), 'Trade summary\nDetails below.');
  assert.equal(stripMarkdownTokens('The risk is 2% of 1000 USD.'), 'The risk is 2% of 1000 USD.', 'ordinary text with no markdown must pass through unchanged');
});

// --- server-side prompt content (grounding + plain-text instruction) ---

test('the dock system prompt explicitly forbids markdown syntax and asks for real line breaks instead', async () => {
  const source = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  const match = /const DOCK_STYLE_INSTRUCTION = '([\s\S]*?)';/.exec(source);
  assert.ok(match, 'could not find DOCK_STYLE_INSTRUCTION');
  assert.match(match[1], /never markdown syntax/i);
  assert.match(match[1], /real paragraph breaks/i);
});

test('the dock system prompt grounds NAVRYA as a journal/planning tool, never a live broker/exchange - so "open a position" maps to the real action, not generic exchange advice', async () => {
  const source = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  const match = /const DOCK_STYLE_INSTRUCTION = '([\s\S]*?)';/.exec(source);
  assert.ok(match);
  assert.match(match[1], /never connected to a live broker or exchange/i);
  assert.match(match[1], /never reply as a generic crypto\/trading assistant/i);
});

// --- trade.calculator's own real alias coverage (found via a real user report: "open long trade
// position for btc" / "open a long position" did not always map to the action) ---

test('trade.calculator\'s real registered aliases cover the "open a(n) [long/short] position" phrasing', async () => {
  const source = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
  const match = /id: 'trade\.calculator'[\s\S]*?aliases: \[([\s\S]*?)\]/.exec(source);
  assert.ok(match, 'could not find trade.calculator\'s real aliases array');
  assert.match(match[1], /'open a position'/);
  assert.match(match[1], /'open a long position'/);
  assert.match(match[1], /'open a short position'/);
});
