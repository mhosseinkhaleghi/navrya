import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice Mode performance pass (task requirement 9): New Chat/conversation-switch isolation for
// voice. chatDockView.jsx is JSX with no DOM/render harness in this repo (same "static-source
// regression guard" convention as tests/ai-voice-chatdock-ux.test.mjs and
// tests/chatdock-voice-companion-ux.test.mjs) - the underlying epoch-discard/invalidate mechanism
// itself is proven with real behavioral tests in tests/ai-voice-turn-coordinator.test.mjs and
// tests/ai-voice-playback-controller.test.mjs; this file proves chatDockView.jsx actually WIRES
// New Chat/conversation-switch into that mechanism, not just that the mechanism exists in isolation.

const dockViewSource = await readFile(path.join(process.cwd(), 'navrya-src', 'chatDockView.jsx'), 'utf8');

test('startNewChat() bumps conversationEpochRef and invalidates the playback queue - a mid-flight voice turn or an already-queued reply from the conversation just left behind must never reach the new one', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('function startNewChat()'), dockViewSource.indexOf('async function toggleHistory()'));
  assert.match(fn, /conversationEpochRef\.current \+= 1;/);
  assert.match(fn, /if \(playbackControllerRef\.current\) playbackControllerRef\.current\.invalidate\(\);/);
  // Must also still release the pre-existing workflow/confirmation state (chat-dock-core.js's
  // resetConversationState(), added in the prior auth-hardening pass) - this pass is additive to
  // that guarantee, never a replacement for it.
  assert.match(fn, /core\.resetConversationState\(\)/);
});

test('resumeConversation() (switching to a different past conversation) performs the same epoch bump/invalidate - it is the same kind of "moved on" event as New Chat', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('async function resumeConversation(id)'), dockViewSource.indexOf('React.useEffect(() => {\n    function onResume'));
  assert.match(fn, /conversationEpochRef\.current \+= 1;/);
  assert.match(fn, /if \(playbackControllerRef\.current\) playbackControllerRef\.current\.invalidate\(\);/);
});

test('TurnCoordinator reads conversationEpochRef fresh (a live getter, not a value captured once) - so a New Chat that happens while a voice turn\'s own submit() is in flight is still seen when that turn resolves', () => {
  const mountEffect = dockViewSource.slice(dockViewSource.indexOf('turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create('), dockViewSource.indexOf('return () => { if (voiceRef.current)'));
  assert.match(mountEffect, /getEpoch: \(\) => conversationEpochRef\.current/);
});

test('conversationEpochRef starts at 0 and is a ref (not React state) - it must be readable synchronously from inside plain callbacks (TurnCoordinator\'s getEpoch, PlaybackController entries) without waiting for a re-render', () => {
  assert.match(dockViewSource, /const conversationEpochRef = React\.useRef\(0\);/);
});

test('transcript and conversation id use synchronous canonical refs in submit(), so two fast turns never read a render-time closure or create two conversations', () => {
  assert.match(dockViewSource, /const transcriptRef = React\.useRef\(\[\]\);/);
  assert.match(dockViewSource, /const activeConversationIdRef = React\.useRef\(null\);/);
  const submit = dockViewSource.slice(dockViewSource.indexOf('async function submit(value, options)'), dockViewSource.indexOf('// Always points at the current render'));
  assert.match(submit, /transcript: transcriptRef\.current/);
  assert.match(submit, /conversationId: activeConversationIdRef\.current/);
  assert.doesNotMatch(submit, /\btranscript, conversationId: activeConversationId\b/);
  assert.match(submit, /transcriptRef\.current = nextTranscript;/);
  assert.match(submit, /activeConversationIdRef\.current = result\.conversationId;/);
});

test('every move-on path resets both the request coordinator and the provider request itself, not playback alone', () => {
  const startNewChat = dockViewSource.slice(dockViewSource.indexOf('function startNewChat()'), dockViewSource.indexOf('async function toggleHistory()'));
  assert.match(startNewChat, /cancelPendingVoiceWork\('new-chat'/);
  const resume = dockViewSource.slice(dockViewSource.indexOf('async function resumeConversation(id)'), dockViewSource.indexOf('// Lets the AI Assistant screen'));
  assert.match(resume, /cancelPendingVoiceWork\('conversation-switch'/);
  const end = dockViewSource.slice(dockViewSource.indexOf('function endVoice()'), dockViewSource.indexOf('function toggleVoiceMute()'));
  assert.match(end, /cancelPendingVoiceWork\('voice-disconnect'/);
});
