import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice UX fix (2026-09-13, real user report): a voice-originated turn is hands-free by design -
// requiring the user to reach for the mouse to click "Apply" on every extracted field (the same
// review step a typed turn shows) defeated that. Text turns are completely unaffected: chat-dock-
// core.js/server dockChat()'s own "suggestions are previews, never already applied, the user must
// approve" contract (its own system-prompt instructions - see server/pattern-ai-server.mjs) still
// holds there exactly as before. navrya-src/chatDockView.jsx has no DOM/render harness in this
// project - matching the established convention for this file, this is a static-source regression
// guard for the logic change itself.
const root = process.cwd();
const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const serverSrc = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');

test('a voice-originated turn with an open process auto-applies every extracted suggestion via the SAME core.applySuggestion() call a manual click would make - never a reimplementation', () => {
  assert.match(dockViewSrc, /const autoApplyVoiceSuggestions = source === 'voice' && rawSuggestions\.length > 0 && !!result\.activeProcess;/);
  assert.match(dockViewSrc, /if \(autoApplyVoiceSuggestions\) \{\s*\r?\n\s*rawSuggestions\.forEach\(\(s\) => \{ try \{ core\.applySuggestion\(result\.activeProcess\.id, s\.path, s\.value, s\.mode\); \} catch \(_\) \{\} \}\);/);
});

test('a text-originated turn is completely unaffected - the popover still receives the raw, un-applied suggestions array for manual Apply/Discard exactly as before', () => {
  assert.match(dockViewSrc, /suggestions: autoApplyVoiceSuggestions \? \[\] : rawSuggestions\.map\(\(s, i\) => \(\{ id: s\.id \|\| 'sugg-' \+ i, \.\.\.s \}\)\),/);
});

test('a voice turn\'s auto-applied fields are still shown to the user - as plain meta chips, the same convention an AI-discovered workflow\'s own already-applied fields already use - never hidden/silent', () => {
  assert.match(dockViewSrc, /\.concat\(autoApplyVoiceSuggestions \? rawSuggestions\.map\(\(s\) => `\$\{s\.path\}: \$\{s\.value\}`\) : \[\]\),/);
});

test('auto-apply requires a real open process (result.activeProcess) - a voice turn with suggestions but no target process still falls back to the manual review path rather than guessing where to apply them', () => {
  assert.match(dockViewSrc, /rawSuggestions\.length > 0 && !!result\.activeProcess;/);
});

// The server's own "suggestions are previews, never already applied" contract (dockChat()'s system
// prompts) is untouched by this fix - it still governs what the MODEL is told to produce; this
// change only affects what the BROWSER does with an already-returned suggestion for a voice turn.
test('the server-side "suggestions are previews, must never be described as already applied" instruction is untouched - this fix only changes client-side handling of an already-returned suggestion', () => {
  assert.match(serverSrc, /Suggestions are previews and must never be described as already applied\./);
  assert.match(serverSrc, /never claim a suggestion has already been saved - the user must approve it before it applies\./);
});
