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

// NAVRYA chat dock redesign (NavryaChatDock.dc.html): `lines` (the rare screenshot-analysis error
// fallback) is now folded into the same real `effectiveMessages` array `messages` already uses -
// one render path, not two independently maintained ones, so a line-break/markdown fix applied
// once can never silently miss the other.
test('ChatResponsePopover.jsx preserves real line breaks (whiteSpace: pre-line), whether a reply came from a real multi-turn `messages` array or the single-answer `lines` fallback', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');
  assert.match(source, /whiteSpace: 'pre-line'/, 'the message paragraph must preserve real line breaks');
  assert.match(source, /const effectiveMessages = messages && messages\.length/, '`lines` must be unified into the same message-array render path as `messages`, not a separate parallel one');
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

// --- response box sizing + collapse/expand toggle (found via a real user report + screenshot:
// even with the whitespace fix above, a genuinely long, richly-structured reply could still make
// the whole popover dominate a shorter viewport, since its scrollable thread had a fixed-pixel
// cap rather than a viewport-relative one) ---

test('ChatResponsePopover.jsx caps its scrollable message thread with a viewport-relative height, not a fixed pixel value', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');
  assert.doesNotMatch(source, /maxHeight:\s*360\b/, 'must not regress back to a fixed-pixel cap that ignores real viewport height');
  assert.match(source, /maxHeight:\s*'\d+vh'/, 'must use a viewport-relative (vh) cap instead');
});

// NAVRYA chat dock redesign (NavryaChatDock.dc.html): the old plain "collapsed" boolean/chevron
// became a real fold/unfold toggle in the new header, matching the design's own fold affordance -
// same protected behavior (a real toggle, inside the header, that hides the body without
// unmounting the header), renamed to match the new vocabulary.
test('ChatResponsePopover.jsx has a real fold/unfold toggle inside the header, and folding hides the body while keeping the header (and the toggle itself) reachable', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');
  assert.match(source, /const \[folded, setFolded\] = React\.useState\(false\)/, 'must track a real folded/expanded state');
  assert.match(source, /setFolded\(\(f\) => !f\)/, 'the toggle must actually flip the state, not just set it one way');
  assert.match(source, /\{!folded && <div/, 'folding must hide the body content, not just visually shrink it');
  // The toggle button itself must be OUTSIDE the foldable body (i.e. still inside <header>),
  // otherwise folding would hide the only control that could ever unfold it again.
  const headerEnd = source.indexOf('</header>');
  const toggleFnAt = source.indexOf('function toggleFold()');
  const toggleButtonAt = source.indexOf('onClick={toggleFold}');
  assert.ok(toggleFnAt > -1, 'a real toggleFold() function must exist');
  assert.ok(toggleButtonAt > -1 && toggleButtonAt < headerEnd, 'the fold toggle button must live inside the header, before it closes, so it is never hidden by its own folded state');
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
