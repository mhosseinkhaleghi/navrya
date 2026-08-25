import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// fix/voice-mode-turn-ux (Part D, "End message"): navrya-src/aiVoiceRealtime.js talks to the
// browser WebRTC/SDK surface that node:test cannot construct (RTCPeerConnection, getUserMedia,
// RealtimeSession) - matching this project's own established convention (see
// tests/ai-voice-realtime-adapter.test.mjs's own header comment), these are static-source
// regression guards for the manual-finish state machine; the real proof is a real browser.

const root = process.cwd();
const source = await readFile(path.join(root, 'navrya-src', 'aiVoiceRealtime.js'), 'utf8');
const dockViewSource = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');

function fn(name, endMarker) {
  const start = source.indexOf(name);
  assert.ok(start > -1, `could not locate ${name} in aiVoiceRealtime.js`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.indexOf('\n  }\n', start);
  return source.slice(start, end > -1 ? end : undefined);
}

// ---- The button appears only in USER_SPEAKING (VoiceConsole.jsx's own mode logic) ----

test('finishUserTurn() only ever succeeds while state is genuinely USER_SPEAKING - every other phase (LISTENING/PROCESSING/ASSISTANT_SPEAKING/etc) is rejected', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.match(body, /if \(state !== VOICE_STATES\.USER_SPEAKING\) return false;/);
});

// ---- One click sends exactly one input_audio_buffer.commit; double-click sends no second commit ----

test('finishUserTurn() sends exactly one raw input_audio_buffer.commit event, with a unique client event id, and rejects a second call while one is already pending (no double-submit)', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.match(body, /if \(pendingManualFinish\) return false; \/\/ already in flight - no double-submit/);
  assert.match(body, /session\.transport\.sendEvent\(\{ type: 'input_audio_buffer\.commit', event_id: clientEventId \}\);/);
  // Exactly one sendEvent call in the whole function body - never a second, defensive send.
  const sendEventCalls = (body.match(/session\.transport\.sendEvent\(/g) || []).length;
  assert.equal(sendEventCalls, 1);
});

// ---- Never sends response.create ----

test('finishUserTurn() never sends response.create/requestResponse - the resulting transcript alone drives NAVRYA\'s own reply through the existing pipeline', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.doesNotMatch(body, /response\.create|requestResponse/);
});

// ---- Preserves the existing Realtime configuration (semantic VAD, create_response:false, interrupt_response:false) ----

test('the session mint configuration (semantic VAD, create_response:false, interrupt_response:false) is untouched by this pass - finishUserTurn() sends only the one commit event, no session.update', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.doesNotMatch(body, /updateSessionConfig|session\.update/);
});

// ---- Immediately changes UI to PROCESSING and disables repeated clicks ----

test('finishUserTurn() immediately sets PROCESSING (a real, structural double-click guard - the precondition check above rejects a second call the instant state is no longer USER_SPEAKING)', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.match(body, /setState\(VOICE_STATES\.PROCESSING\);/);
});

// ---- Tracks connection epoch / manual-turn generation / client event id ----

test('finishUserTurn() captures the connection epoch at call time and the timeout it schedules re-checks it before acting - a reconnect/disconnect during the wait must never let a stale timeout touch a newer connection', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.match(body, /var myEpoch = connectionEpoch;/);
  assert.match(body, /if \(myEpoch !== connectionEpoch \|\| !pendingManualFinish\) return;/);
});

// ---- input_audio_buffer.committed binds its own real item id, never requiring it match speech_started's ----

test('input_audio_buffer.committed binds whatever item id the server reports to the pending manual finish, explicitly without requiring it to equal the earlier speech_started item id', () => {
  const body = fn('TRANSPORT_INPUT_AUDIO_BUFFER_COMMITTED', 'if (event.type === TRANSPORT_SESSION_UPDATED)');
  assert.match(body, /pendingManualFinish\.committedItemId = event\.item_id \|\| null;/);
  assert.match(source, /WITHOUT requiring it to equal activeSpeechItemId/);
});

// ---- One final transcript creates exactly one business turn (dedup preserved) ----

test('the existing completed-item dedup (handledItemIds) is completely unmodified by the manual-finish addition - a manual finish only ever clears pendingManualFinish alongside it, never bypasses or duplicates the dedup check', () => {
  const body = fn('if (event.type === TRANSPORT_TRANSCRIPTION_COMPLETED)', 'if (event.type === TRANSPORT_SPEECH_STARTED)');
  assert.match(body, /if \(pendingManualFinish\) clearPendingManualFinish\(\);/);
  assert.match(body, /if \(!transcript \|\| \(itemId && handledItemIds\[itemId\]\)\) return;/);
  assert.match(body, /if \(itemId\) handledItemIds\[itemId\] = true;/);
  // onFinalTranscript is called exactly once in this whole handler.
  const calls = (body.match(/onFinalTranscript\(/g) || []).length;
  assert.equal(calls, 1);
});

// ---- Normal automatic semantic VAD still works without clicking (untouched) ----

test('the ordinary VAD-driven turn path (speech_started/speech_stopped/transcription-completed) is structurally unaffected when finishUserTurn() is never called - pendingManualFinish stays null throughout', () => {
  const speechStartedBody = fn('if (event.type === TRANSPORT_SPEECH_STARTED)', 'if (event.type === TRANSPORT_SPEECH_STOPPED)');
  assert.doesNotMatch(speechStartedBody, /pendingManualFinish/, 'speech_started handling must not reference the manual-finish state at all - it only tracks activeSpeechItemId');
  const speechStoppedBody = fn('if (event.type === TRANSPORT_SPEECH_STOPPED)', 'if (event.type === TRANSPORT_OUTPUT_AUDIO_BUFFER_STARTED');
  assert.doesNotMatch(speechStoppedBody, /pendingManualFinish/, 'speech_stopped handling is completely untouched by Part D');
});

// ---- The auto-VAD-versus-click race creates no duplicate turn (the known empty-buffer-commit race) ----

test('a manual commit losing the race against the server\'s own auto-commit is only ever swallowed as recoverable with real evidence the auto path is already handling the same turn - any other error always falls through unchanged, and state is never forced (the real transcript pipeline, if it is in flight, remains the sole owner of what happens next)', () => {
  const errorBody = fn("session.on('error', function (e) {", 'await Promise.race([session.connect');
  assert.match(errorBody, /var withinManualFinishGrace = \(Date\.now\(\) - lastManualFinishClearedAt\) < EMPTY_BUFFER_COMMIT_ERROR_GRACE_MS;/);
  assert.match(errorBody, /var manualFinishRaceEvidence = \(pendingManualFinish && pendingManualFinish\.committedItemId\) \|\| withinManualFinishGrace;/);
  assert.match(errorBody, /if \(manualFinishRaceEvidence && looksLikeEmptyBufferCommitError\(e && e\.error\)\)/);
  assert.match(errorBody, /clearPendingManualFinish\(\);\s*\n\s*return;/);
  // The generic ERROR/onError fallback is still reached for every other case.
  assert.match(errorBody, /setState\(VOICE_STATES\.ERROR\);\s*\n\s*onError\(\{ code: transportErrorCode\(e && e\.error\), stage: 'session' \}\);/);
});

test('finishUserTurn() is the ONLY place in this file that ever sends input_audio_buffer.commit - the empty-buffer race detector\'s own premise ("this error shape is always a response to a manual finish") depends on this being true', () => {
  const commitSendCount = (source.match(/type: 'input_audio_buffer\.commit'/g) || []).length;
  assert.equal(commitSendCount, 1);
});

// ---- Ignore a late speech_stopped belonging to the manually committed activation ----

test('a late speech_stopped is already structurally ignored once a manual finish has moved state out of USER_SPEAKING - the pre-existing guard (state === USER_SPEAKING) covers this with no new code needed', () => {
  const body = fn('if (event.type === TRANSPORT_SPEECH_STOPPED)', 'if (event.type === TRANSPORT_OUTPUT_AUDIO_BUFFER_STARTED');
  assert.match(body, /if \(state === VOICE_STATES\.USER_SPEAKING\) setState\(VOICE_STATES\.LISTENING\);/);
});

// ---- Clear pending manual state on reconnect/disconnect/epoch change/New Chat/conversation switch/timeout/fatal error ----

test('teardownTransport() (the shared path both disconnect() and a reconnect-about-to-retry call) always clears any pending manual finish first, before the tracks/session it might reference are torn down', () => {
  const body = fn('function teardownTransport()', 'function scheduleReconnect');
  assert.match(body, /clearPendingManualFinish\(\);/);
  const clearIdx = body.indexOf('clearPendingManualFinish();');
  const sessionCloseIdx = body.indexOf('session.close()');
  assert.ok(clearIdx > -1 && sessionCloseIdx > -1 && clearIdx < sessionCloseIdx, 'must clear pending manual finish BEFORE tearing down the session/tracks it might reference');
});

test('finishUserTurn() schedules a bounded timeout that clears the pending state, restores LISTENING if still PROCESSING, and reports a real error code - never leaves the UI permanently stuck', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.match(body, /pendingManualFinish\.timeoutTimer = setTimeout\(function \(\) \{/);
  assert.match(body, /clearPendingManualFinish\(\);\s*\n\s*if \(state === VOICE_STATES\.PROCESSING\) setState\(VOICE_STATES\.LISTENING\);\s*\n\s*onError\(\{ code: 'VOICE_MANUAL_FINISH_TIMEOUT', stage: 'manual_finish' \}\);/);
  assert.match(body, /\}, MANUAL_FINISH_TIMEOUT_MS\);/);
});

test('cancelManualFinish() is exposed publicly and chatDockView.jsx calls it on New Chat and conversation switch, alongside the existing playback-invalidation it already does for the same "the user moved on" moments', () => {
  assert.match(source, /cancelManualFinish: cancelManualFinish,/);
  const startNewChatBody = dockViewSource.slice(dockViewSource.indexOf('function startNewChat()'), dockViewSource.indexOf('function toggleHistory()'));
  assert.match(startNewChatBody, /if \(voiceRef\.current\) voiceRef\.current\.cancelManualFinish\(\);/);
  const resumeBody = dockViewSource.slice(dockViewSource.indexOf('async function resumeConversation(id)'), dockViewSource.indexOf('// Lets the AI Assistant screen'));
  assert.match(resumeBody, /if \(voiceRef\.current\) voiceRef\.current\.cancelManualFinish\(\);/);
});

// ---- User mute preference is preserved ----

test('the mic hold used while a manual finish is in flight is a separate internal flag from isMuted, and always restores to the real, current mute preference (never a second source of truth, never clobbers a user toggle)', () => {
  const holdBody = fn('function holdMicForManualFinish()', 'function releaseMicHold()');
  assert.match(holdBody, /track\.enabled = false;/);
  const releaseBody = fn('function releaseMicHold()', 'function clearPendingManualFinish()');
  assert.match(releaseBody, /track\.enabled = !isMuted;/, 'must restore to the REAL, current mute preference, never a fixed true/false');
  // mute() itself is completely unmodified by this addition - it still only ever sets isMuted +
  // calls session.mute(), the exact same shape as before this pass.
  const muteBody = fn('function mute(muted) {', 'var VALID_EAGERNESS');
  assert.doesNotMatch(muteBody, /micHeldForManualFinish|pendingManualFinish/, 'mute() must stay completely unaware of the manual-finish hold - the user\'s own toggle always wins immediately');
});

// ---- Preconditions: connected, USER_SPEAKING, active speech generation, no pending commit ----

test('finishUserTurn() checks every documented precondition before sending anything: a real session, USER_SPEAKING, an active speech generation, and no manual commit already pending', () => {
  const body = fn('function finishUserTurn()', 'function cancelManualFinish');
  assert.match(body, /if \(!session\) return false;/);
  assert.match(body, /if \(state !== VOICE_STATES\.USER_SPEAKING\) return false;/);
  assert.match(body, /if \(pendingManualFinish\) return false;/);
  assert.match(body, /if \(!activeSpeechItemId\) return false;/);
});

// ---- chatDockView.jsx wiring: End message never disconnects/closes the conversation ----

test('endVoiceMessage() (chatDockView.jsx\'s "End message" handler) only ever calls voiceRef.current.finishUserTurn() - never disconnect(), never startNewChat(), never touches transcript/activeConversationId', () => {
  const body = dockViewSource.slice(dockViewSource.indexOf('function endVoiceMessage()'), dockViewSource.indexOf('function applySuggestion'));
  assert.match(body, /voiceRef\.current\.finishUserTurn\(\)/);
  assert.doesNotMatch(body, /\.disconnect\(\)|startNewChat|setTranscript|setActiveConversationId/);
});
