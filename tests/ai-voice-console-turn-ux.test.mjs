import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// fix/voice-mode-turn-ux (Parts C/D/E): VoiceConsole.jsx/ChatDock.jsx/ChatResponsePopover.jsx are
// JSX with no DOM/layout test harness in this project (real CSS box-model/getBoundingClientRect
// geometry cannot be computed in node:test - see the final report's own real-browser evidence for
// what these static-source guards cannot prove). Matching this project's established convention
// for browser-only component files, these are static-source regression guards for the logic
// change itself.

const root = process.cwd();
const voiceConsoleSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'VoiceConsole.jsx'), 'utf8');
const chatDockSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx'), 'utf8');
const responsePopoverSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatResponsePopover.jsx'), 'utf8');

// ---- Part D: button modes ----

test('the centre pill button is real/active in exactly two live phases - ASSISTANT_SPEAKING ("Stop reply") and USER_SPEAKING ("End message") - and disabled everywhere else (PROCESSING/LISTENING/etc)', () => {
  assert.match(voiceConsoleSrc, /const mainActionable = replying \|\| userSpeaking;/);
  assert.match(voiceConsoleSrc, /const mainActionHandler = replying \? onVoiceInterrupt : userSpeaking \? onVoiceEndMessage : undefined;/);
});

test('"End message" is wired to a distinct callback (onVoiceEndMessage) from "Stop reply" (onVoiceInterrupt) - they are never the same function, so End message can never accidentally interrupt playback or vice versa', () => {
  assert.match(voiceConsoleSrc, /onVoiceInterrupt, onVoiceEndMessage,/);
  assert.doesNotMatch(voiceConsoleSrc, /onVoiceEndMessage\s*=\s*onVoiceInterrupt/);
});

test('the button label/aria-label/icon all switch together for every mode (icon AND text AND handler in lockstep - no decoy control, matching this codebase\'s own "no decoy buttons" rule)', () => {
  assert.match(voiceConsoleSrc, /const mainActionLabel = replying \? strings\.stopReply : userSpeaking \? strings\.endMessage : \(thinking && voiceManualFinishPending \? strings\.endingMessage : phaseLabel\);/);
  assert.match(voiceConsoleSrc, /const mainActionIcon = replying \? 'square' : userSpeaking \? 'send' : 'check';/);
  assert.match(voiceConsoleSrc, /onClick=\{mainActionable \? mainActionHandler : undefined\} aria-label=\{mainActionLabel\} disabled=\{!mainActionable\}/);
});

test('the PROCESSING label distinguishes a manual "End message" click from an ordinary VAD-driven turn reaching PROCESSING the normal way, without any change to the button\'s disabled-processing rendering itself', () => {
  assert.match(voiceConsoleSrc, /thinking && voiceManualFinishPending \? strings\.endingMessage : phaseLabel/);
});

// "End message" never disconnecting/closing the conversation is verified precisely at the source
// of that behavior - chatDockView.jsx's endVoiceMessage() calls ONLY finishUserTurn(), never
// disconnect()/startNewChat() - see tests/ai-voice-manual-finish.test.mjs's own dedicated test.
// This test only confirms VoiceConsole.jsx itself never invents a second, competing action for
// the same button - onVoiceEndMessage is a distinct prop from the close control (onVoiceToggle).
test('the main action button\'s userSpeaking handler (onVoiceEndMessage) is a distinct prop from the console\'s own close control (onVoiceToggle, used by the header/footer close buttons) - VoiceConsole never substitutes one for the other', () => {
  assert.match(voiceConsoleSrc, /onVoiceToggle, onVoiceMuteToggle, onVoiceInterrupt, onVoiceEndMessage, onMinimize,/);
  assert.match(voiceConsoleSrc, /userSpeaking \? onVoiceEndMessage : undefined;/);
  assert.doesNotMatch(voiceConsoleSrc, /userSpeaking \? onVoiceToggle/, 'End message mode must never be wired to the close/disconnect control');
});

// ---- Part C: caption visibility ----

test('the reply caption stays visible through ASSISTANT_SPEAKING, LISTENING, and INTERRUPTED - not only the transient assistant_speaking moment - and is gated on captionsOn/no error state, matching every other caption box\'s own convention', () => {
  assert.match(voiceConsoleSrc, /const showReply = !denied && !errored && captionsOn && !!voiceReplyCaption &&\s*\n\s*\(voiceState === 'assistant_speaking' \|\| voiceState === 'listening' \|\| voiceState === 'interrupted'\);/);
});

test('the "heard" listening-placeholder box is suppressed whenever a real reply caption is already being shown in its place - the two never stack redundantly', () => {
  assert.match(voiceConsoleSrc, /const showHeard = !denied && !errored && !replying && captionsOn && !showReply;/);
});

test('the caption is rendered directly from voiceReplyCaption, never a local re-typed/reset copy - the previous typewriter effect (which reset to \'\' the instant assistant_speaking ended) is gone', () => {
  assert.doesNotMatch(voiceConsoleSrc, /replyShown/, 'the old typewriter state must be fully removed, not merely unused');
  assert.doesNotMatch(voiceConsoleSrc, /setInterval/, 'no char-by-char reveal timer should remain in this file');
  assert.match(voiceConsoleSrc, /<CaptionBox label=\{strings\.replyLabel\} text=\{voiceReplyCaption\} caret=\{false\} tone="reply" \/>/);
});

// ---- Part E: same-origin measured geometry (structural - real pixel alignment needs a real browser) ----

test('the response/companion/history surface is positioned from the REAL, measured dock-row rect (getBoundingClientRect), not an independently-recomputed centering that assumed a fixed 66px mascot allowance', () => {
  assert.match(chatDockSrc, /const \[dockSurfaceRect, setDockSurfaceRect\] = React\.useState\(null\);/);
  assert.match(chatDockSrc, /const rect = el\.getBoundingClientRect\(\);/);
  assert.match(chatDockSrc, /setDockSurfaceRect\(\{ left: rect\.left, width: rect\.width \}\);/);
  assert.match(chatDockSrc, /\?\s*\{ left: dockSurfaceRect\.left, width: dockSurfaceRect\.width \}/, 'once measured, the surface must be pinned to the REAL row rect, not a recomputed maxWidth/margin centering');
});

test('the geometry measurement re-runs on a real ResizeObserver AND a window resize/orientation listener - a ResizeObserver alone would miss a pure re-center (same box size, new position) on viewport resize', () => {
  const effectBlock = chatDockSrc.slice(chatDockSrc.indexOf('const [dockSurfaceRect, setDockSurfaceRect]'), chatDockSrc.indexOf('const dotColor ='));
  assert.match(effectBlock, /new ResizeObserver\(measure\)/);
  assert.match(effectBlock, /window\.addEventListener\('resize', measure\)/);
  assert.match(effectBlock, /window\.addEventListener\('orientationchange', measure\)/);
});

test('the dock row and the response surface both carry stable data selectors for real-browser geometry verification', () => {
  assert.match(chatDockSrc, /data-navrya-assistant="dock-surface"/);
  assert.match(chatDockSrc, /data-navrya-assistant="response-surface"/);
});

test('z-index separation is preserved exactly as before - the response surface stays at its existing lower layer (70), the dock row stays above modals (150); this fix only changes horizontal positioning, never the stacking order', () => {
  assert.match(chatDockSrc, /zIndex: 70, pointerEvents: 'none'/);
  assert.match(chatDockSrc, /zIndex: 150,/);
});

// NAVRYA chat dock redesign: the gap was deliberately shrunk from 12px to a near-hairline
// PANEL_TO_DOCK_GAP_PX (6px) - paired with the same corner radius on both surfaces - so the two
// independently-z-indexed elements (still two elements, for the real modal-collision fix this
// same file documents - never merged into one) read as one connected panel, matching the design's
// own continuous-panel look. The row itself still starts at bottom:24, unchanged.
test('the response surface sits a small, deliberate PANEL_TO_DOCK_GAP_PX above the dock row (bottom: 24 + rowHeight + PANEL_TO_DOCK_GAP_PX, where the row itself starts at bottom:24), not the old 12px gap', () => {
  assert.match(chatDockSrc, /var PANEL_TO_DOCK_GAP_PX = 6;/);
  assert.match(chatDockSrc, /bottom: 24 \+ rowHeight \+ PANEL_TO_DOCK_GAP_PX, boxSizing: 'border-box'/);
});

test('the response body is now its own bounded, scrollable region covering EVERY section (lines/meta/suggestions/review), not only the messages thread - a header stays outside this wrapper and therefore always reachable', () => {
  assert.match(responsePopoverSrc, /maxHeight: '60vh', overflowY: 'auto', boxSizing: 'border-box' \}\}>/);
  // The header (with its fold/close controls) is rendered as a sibling BEFORE this scrollable
  // wrapper in the JSX, i.e. outside it - never scrolled away with the body. Matched on the same
  // full literal pattern as the assertion above (not the bare "maxHeight: '60vh'" substring,
  // which - since the NAVRYA chat dock redesign added a real height-stage tier table using that
  // same '60vh' value for its own FULL tier - now also appears earlier in the file, before
  // <header, and would otherwise falsely resolve to that unrelated declaration instead of this
  // wrapper).
  const headerIdx = responsePopoverSrc.indexOf('<header');
  const scrollWrapperIdx = responsePopoverSrc.indexOf("maxHeight: '60vh', overflowY: 'auto', boxSizing: 'border-box' }}>");
  assert.ok(headerIdx > -1 && scrollWrapperIdx > headerIdx, 'the header must be declared before (outside) the scrollable body wrapper');
});

test('VoiceConsole\'s own meter/caption content area is bounded and scrollable for a short viewport, while the header and footer controls (mute/main action/captions toggle) stay outside that wrapper and therefore always reachable', () => {
  assert.match(voiceConsoleSrc, /maxHeight: '46vh', overflowY: 'auto', boxSizing: 'border-box' \}\}>/);
  const scrollWrapperIdx = voiceConsoleSrc.indexOf("maxHeight: '46vh'");
  const footerControlsIdx = voiceConsoleSrc.indexOf("aria-label={voiceMuted ? strings.unmute : strings.mute}");
  assert.ok(scrollWrapperIdx > -1 && footerControlsIdx > scrollWrapperIdx, 'the footer mute/main-action controls must be declared after (outside) the scrollable content wrapper');
});
