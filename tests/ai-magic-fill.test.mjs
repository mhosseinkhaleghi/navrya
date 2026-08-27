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
  assert.match(hookSrc, /return \(\) => \{ off\(\); if \(timer\) clearTimeout\(timer\); \};/);
  assert.match(hookSrc, /\}, \[processId, path\]\);/);
});

test('useAiFieldFill never reads or writes the field value itself - purely a boolean presentation signal', () => {
  assert.doesNotMatch(hookSrc, /\.value\b/);
  assert.match(hookSrc, /const \[justFilled, setJustFilled\] = React\.useState\(false\)/);
  assert.match(hookSrc, /return justFilled;/);
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
