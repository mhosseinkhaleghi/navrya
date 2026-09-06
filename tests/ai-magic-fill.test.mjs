import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey H1: the magic-fill animation seam (useAiFieldFill hook, AiMagicFill wrapper, its shared
// motion sheet). Same convention as this project's other navrya-src/*.jsx test files - there is no
// DOM test harness in this project (React hooks/components are not executed here), so these are
// static-source regression guards for the presentation contract; the real proof of the animation
// actually rendering is real-browser verification (see the Journey H1 final report).

const root = process.cwd();
const hookSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'hooks', 'useAiFieldFill.js'), 'utf8');
const wrapperSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'feedback', 'AiMagicFill.jsx'), 'utf8');
const motionSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'feedback', 'AiMagicFill.motion.js'), 'utf8');
const busSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-field-fill-bus.js'), 'utf8');

test('useAiFieldFill subscribes to TradeJournalAIFieldFillBus for exactly the (processId, path) pair passed in, and unsubscribes on unmount/dep change', () => {
  assert.match(hookSrc, /window\.TradeJournalAIFieldFillBus/);
  assert.match(hookSrc, /bus\.on\(processId, path,/);
  // Slice V1 (visual step/AiMagicFill): cleanup now also clears the retrigger timer added for
  // the rapid-repeated-fill fix below.
  assert.match(hookSrc, /return \(\) => \{ off\(\); if \(timer\) clearTimeout\(timer\); if \(retrigger\) clearTimeout\(retrigger\); \};/);
  assert.match(hookSrc, /\}, \[processId, path\]\);/);
});

test('useAiFieldFill never reads or writes the field value itself - purely a boolean presentation signal', () => {
  assert.doesNotMatch(hookSrc, /\.value\b/);
  assert.match(hookSrc, /const \[justFilled, setJustFilled\] = React\.useState\(false\)/);
  assert.match(hookSrc, /return justFilled;/);
});

// Slice V1 (visual step/AiMagicFill), audit item 5: "use an event identity for rapid repeated
// fills, while preserving boolean-hook compatibility" - a genuinely new fill arriving while a
// previous pulse's animation window is still active must still restart the visible reveal, but
// the hook's own return type/contract must stay exactly the plain boolean it always was.
test('ai-field-fill-bus.js emits a real, monotonically-unique eventId per emit() call - not merely a timestamp two genuinely distinct rapid fills could share', () => {
  assert.match(busSrc, /var nextEventId = 1;/);
  assert.match(busSrc, /var eventId = nextEventId\+\+;/);
  assert.match(busSrc, /eventId: eventId/);
});

test('useAiFieldFill still returns a plain boolean (the exact prior contract) - the retrigger mechanism is a purely internal implementation detail, never a second return value', () => {
  assert.doesNotMatch(hookSrc, /return \[justFilled/, 'must never become a tuple/array return - every existing single-boolean caller must keep working unmodified');
  assert.match(hookSrc, /return justFilled;/);
});

test('a fill arriving while a previous pulse is still active forces a real false->true transition (drop then re-raise) instead of a no-op re-affirm of an already-true boolean', () => {
  const fn = hookSrc.slice(hookSrc.indexOf('const off = bus.on(processId, path,'), hookSrc.indexOf('return () => { off();'));
  assert.match(fn, /if \(justFilledRef\.current\) \{/);
  assert.match(fn, /setJustFilled\(false\);/);
  assert.match(fn, /retrigger = setTimeout\(\(\) => setJustFilled\(true\), 0\);/);
  assert.match(fn, /\} else \{\s*\n\s*setJustFilled\(true\);\s*\n\s*\}/);
});

test('justFilledRef always reflects the truly-current justFilled value - the bus subscription closure itself is only ever created once per (processId, path), so it would otherwise see a stale value forever', () => {
  assert.match(hookSrc, /const justFilledRef = React\.useRef\(false\);/);
  assert.match(hookSrc, /React\.useEffect\(\(\) => \{ justFilledRef\.current = justFilled; \}, \[justFilled\]\);/);
});

test('useAiFieldFill is a no-op (never subscribes, never throws) when the bus, processId, or path is absent', () => {
  assert.match(hookSrc, /if \(!bus \|\| !processId \|\| !path\) return undefined;/);
});

test('AiMagicFill wraps its child with display:contents (never affects a parent flex/grid layout) and toggles a data attribute the shared motion sheet targets', () => {
  assert.match(wrapperSrc, /style=\{\{ display: 'contents' \}\}/);
  assert.match(wrapperSrc, /data-nv-magic-fill=\{active \? 'active' : undefined\}/);
});

test('AiMagicFill.motion.js targets the wrapper\'s own direct child (never the display:contents wrapper itself, which renders no box)', () => {
  assert.match(motionSrc, /\[data-nv-magic-fill="active"\] > \*\{animation:/);
});

test('the magic-fill animation is injected once under a stable id, same convention as components/assistant/motion.js\'s own useAssistantMotion()', () => {
  assert.match(motionSrc, /document\.getElementById\('nv-magic-fill-motion'\)/);
  assert.match(motionSrc, /el\.id = 'nv-magic-fill-motion';/);
});

test('prefers-reduced-motion neutralizes the animation itself but leaves a static, instant highlight - never silence alone', () => {
  const reducedMotionBlock = motionSrc.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/)[0];
  assert.match(reducedMotionBlock, /animation:none!important/);
  assert.match(reducedMotionBlock, /box-shadow:[^;]+!important/, 'a static highlight must remain so success is never communicated by animation alone');
});

test('the glow color is the character\'s own --char-accent token, never a fixed brand color - stays on-theme for every character', () => {
  assert.match(motionSrc, /var\(--char-accent\)/);
  assert.doesNotMatch(motionSrc, /#[0-9a-fA-F]{3,6}/, 'no hardcoded hex color - every color must come from a theme token');
});

test('ai-field-fill-bus.js (the module useAiFieldFill subscribes to) is a pure event emitter with no React/DOM dependency of its own', () => {
  assert.doesNotMatch(busSrc, /import React|React\.|document\.\w|window\.location/, 'a mention of "React" in a code COMMENT for context is fine - an actual dependency is not');
  assert.match(busSrc, /function on\(processId, path, fn\)/);
  assert.match(busSrc, /function emit\(processId, path, meta\)/);
});

// 2026-09-05 ("type, don't glow"): the user's own explicit ask - a free-text field's just-applied
// value reveals character-by-character instead of only glowing, and a choice/toggle/slider/select
// field visibly reads as PRESSED. Both share this one component/stylesheet; which one plays is
// decided purely by whether a real `value` prop was given, never a separate "kind" flag.

test('AiMagicFill branches on a real, non-empty `value` prop - the typewriter-reveal path for free text, the original display:contents/press path for everything else', () => {
  assert.match(wrapperSrc, /export function AiMagicFill\(\{ active, value, children \}\)/);
  assert.match(wrapperSrc, /const hasTextTarget = value !== undefined && value !== null && value !== '';/);
  assert.match(wrapperSrc, /if \(hasTextTarget\) \{/);
});

test('the typewriter-reveal branch renders a position:relative wrapper (sized to the real field\'s own footprint) plus a transient overlay, never touching the real field\'s own controlled value', () => {
  assert.match(wrapperSrc, /style=\{\{ position: 'relative', display: 'block', width: '100%' \}\}/);
  assert.match(wrapperSrc, /className="nv-magic-type-overlay"/);
  assert.match(wrapperSrc, /className="nv-magic-type-caret"/);
});

test('the typewriter reveal is driven by plain React state/timers (useTypewriterReveal), captures `value` only on a genuine false->true transition of `active`, and is presentation-only (revealed text is never read back into any real field)', () => {
  assert.match(wrapperSrc, /function useTypewriterReveal\(active, value\)/);
  assert.match(wrapperSrc, /const justTurnedActive = active && !wasActiveRef\.current;/);
  assert.match(wrapperSrc, /if \(!justTurnedActive\) return undefined;/);
});

test('the reveal speed scales down for long text (capped at a maximum total duration, floored at a minimum per-character delay) - "fast but visible" per the brief, never a fixed 100ms/char for a whole paragraph', () => {
  assert.match(wrapperSrc, /TYPE_MAX_TOTAL_MS/);
  assert.match(wrapperSrc, /TYPE_MIN_CHAR_MS/);
  assert.match(wrapperSrc, /Math\.max\(TYPE_MIN_CHAR_MS, Math\.min\(TYPE_CHAR_MS, TYPE_MAX_TOTAL_MS \/ text\.length\)\)/);
});

test('prefers-reduced-motion is checked in JS for the typewriter path too (CSS alone cannot stop a JS setTimeout stepper) - shows the full text once, briefly, then fades, rather than forcing a stepped reveal', () => {
  assert.match(wrapperSrc, /function prefersReducedMotion\(\)/);
  assert.match(wrapperSrc, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(wrapperSrc, /if \(prefersReducedMotion\(\)\) \{/);
});

test('the shared motion sheet\'s default (no-value) selector plays a real "press" keyframe - a button-press illusion, not merely a glow - so a Voice-driven choice/toggle/tile visibly reads as clicked', () => {
  assert.match(motionSrc, /@keyframes nv-magic-fill-press\{/);
  assert.match(motionSrc, /\[data-nv-magic-fill="active"\] > \*\{animation:nv-magic-fill-press/);
  assert.match(motionSrc, /transform:scale\(/, 'a press illusion needs a real scale transform, not box-shadow alone');
});

test('the typewriter overlay CSS lives in the same shared, once-injected stylesheet as the press keyframe (no second style-injection mechanism), and its caret blinks via a dedicated keyframe', () => {
  assert.match(motionSrc, /\.nv-magic-type-overlay\{/);
  assert.match(motionSrc, /@keyframes nv-magic-type-caret\{/);
  assert.match(motionSrc, /\.nv-magic-type-caret\{[^}]*animation:nv-magic-type-caret/);
});

test('the typewriter overlay respects prefers-reduced-motion in CSS too (no caret blink, no fade transition) - consistent with the JS-level check, belt-and-suspenders', () => {
  const reducedMotionBlocks = motionSrc.match(/@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\}/g) || [];
  const overlayBlock = reducedMotionBlocks.find((b) => b.includes('nv-magic-type'));
  assert.ok(overlayBlock, 'expected a dedicated prefers-reduced-motion block covering the typewriter overlay/caret');
  assert.match(overlayBlock, /\.nv-magic-type-caret\{animation:none/);
});
