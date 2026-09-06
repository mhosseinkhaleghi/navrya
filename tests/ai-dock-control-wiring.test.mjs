import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U1-b (execution brief section 9 item 11, "Dock/process controls"). chat-dock-core.js only
// ever recognizes the intent and picks a localized ack - it has no access to chatDockView.jsx's
// own React-closure functions (startNewChat/endVoice/toggleHistory/regenerateLastReply/
// voiceRef.current.mute). navrya-src has no DOM test harness in this project (same established
// convention as every other chatDockView.jsx test file) - these are static-source regression
// guards for the wiring itself; tests/chat-dock-core.test.mjs already dynamically proves the
// classifier/fast-path half.

const root = process.cwd();
const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');

function dockControlBlock() {
  const start = dockViewSrc.indexOf("if (result.kind === 'dockControl') {");
  const end = dockViewSrc.indexOf("if (result.kind === 'safety') {", start);
  assert.ok(start > -1 && end > -1, 'could not find the dockControl branch in submit()');
  return dockViewSrc.slice(start, end);
}

test('the dockControl branch is checked before discarded/safety, right after the null-result guard - a meta chat/voice command must never be mistaken for a conversational reply', () => {
  const nullGuardIdx = dockViewSrc.indexOf('if (!result) return null;');
  const discardedIdx = dockViewSrc.indexOf("if (result.kind === 'discarded') return result;");
  const dockControlIdx = dockViewSrc.indexOf("if (result.kind === 'dockControl') {");
  const safetyIdx = dockViewSrc.indexOf("if (result.kind === 'safety') {");
  assert.ok(nullGuardIdx < discardedIdx && discardedIdx < dockControlIdx && dockControlIdx < safetyIdx);
});

test('newChat calls the real startNewChat() directly - the reset itself is the visible confirmation, never a lingering ack message an immediate transcript-clear would just orphan', () => {
  const block = dockControlBlock();
  const sub = block.slice(block.indexOf("result.control === 'newChat'"), block.indexOf("result.control === 'endVoice'"));
  assert.match(sub, /startNewChat\(\);/);
  assert.match(sub, /return \{ kind: 'dockControl', reply: '', voiceReply: '' \};/);
});

test('endVoice calls the real endVoice() directly and never tries to speak the ack through the transport it just tore down (voiceReply: null)', () => {
  const block = dockControlBlock();
  const sub = block.slice(block.indexOf("result.control === 'endVoice'"), block.indexOf("result.control === 'regenerate'"));
  assert.match(sub, /endVoice\(\);/);
  assert.match(sub, /voiceReply: null/);
});

test('regenerate resolves the real last USER turn from the live transcriptRef (never a stale closure) and calls the exact same regenerateLastReply() the real "Regenerate" button already uses - fire-and-forget, since the real new answer arrives through that call\'s own full turn', () => {
  const block = dockControlBlock();
  const sub = block.slice(block.indexOf("result.control === 'regenerate'"), block.indexOf("result.control === 'history'"));
  assert.match(sub, /for \(let ri = transcriptRef\.current\.length - 1; ri >= 0; ri--\)/);
  assert.match(sub, /transcriptRef\.current\[ri\]\.role === 'user'/);
  assert.match(sub, /if \(lastUserText\) regenerateLastReply\(lastUserText\);/);
  assert.match(sub, /return \{ kind: 'discarded', reply: '', voiceReply: '' \};/, 'must never also emit its own ack - the recursive submit() call owns the real result');
});

test('history only OPENS (never blindly toggles closed) - a "show my history" request must not close an already-open panel, unlike the manual button\'s own toggle behavior', () => {
  const block = dockControlBlock();
  assert.match(block, /if \(result\.control === 'history'\) \{ if \(!historyOpen\) toggleHistory\(\); \}/);
});

test('mute/unmute call voiceRef.current.mute() with the EXACT requested direction (true/false) - never the manual button\'s own blind toggleVoiceMute(), which could not honor a specific spoken direction', () => {
  const block = dockControlBlock();
  assert.match(block, /else if \(result\.control === 'mute'\) \{ if \(voiceRef\.current\) voiceRef\.current\.mute\(true\); \}/);
  assert.match(block, /else if \(result\.control === 'unmute'\) \{ if \(voiceRef\.current\) voiceRef\.current\.mute\(false\); \}/);
  assert.doesNotMatch(block, /toggleVoiceMute\(\)/, 'must never use the blind toggle for a directional spoken/typed request');
});

test('history/mute/unmute write a real transcript entry and popover so a TYPED dock-control command is actually visible - typed submit() has no external consumer of its return value, unlike a voice turn routed through TurnCoordinator', () => {
  const block = dockControlBlock();
  assert.match(block, /const controlTranscript = transcriptRef\.current\.concat\(\[/);
  assert.match(block, /replaceTranscript\(controlTranscript\);/);
  assert.match(block, /setPopover\(\{ open: true, state: 'answer', messages: controlTranscript,/);
});

test('the dock-control classifier module (ai-dock-control-intent.js) is loaded on all four character pages, before chat-dock-core.js', async () => {
  for (const character of ['commander', 'engineer', 'hunter', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const intentIdx = html.indexOf('ai-dock-control-intent.js');
    const coreIdx = html.indexOf('chat-dock-core.js');
    assert.ok(intentIdx > -1, `${character}/index.html must load ai-dock-control-intent.js`);
    assert.ok(intentIdx < coreIdx, `${character}/index.html must load ai-dock-control-intent.js before chat-dock-core.js`);
  }
});

test('every one of the six new aiDockControl* reply keys exists, with a real (non-empty, non-key-name) value, in all four supported languages', async () => {
  const src = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js'), 'utf8');
  const keys = ['aiDockControlNewChat', 'aiDockControlHistory', 'aiDockControlEndVoice', 'aiDockControlMute', 'aiDockControlUnmute', 'aiDockControlRegenerate'];
  for (const key of keys) {
    const matches = src.match(new RegExp(key + ": '([^']+)'", 'g')) || [];
    assert.equal(matches.length, 4, `${key} must have exactly one value per supported language (fa/ar/en/es)`);
    for (const m of matches) {
      const value = /: '([^']+)'/.exec(m)[1];
      assert.notEqual(value, key, `${key} must have a real translated value, not the key name itself`);
    }
  }
});
