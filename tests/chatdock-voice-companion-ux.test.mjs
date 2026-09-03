import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey G UX correction - chatDockView.jsx's own wiring for the Voice Companion opening and the
// no-auto-popup-on-load fix. chatDockView.jsx is a React component with no DOM/render harness in
// this repo's test suite (mirrors tests/ai-voice-chatdock-ux.test.mjs's/ai-voice-realtime-adapter.
// test.mjs's own "chatDockView.jsx wiring" convention: source-structure assertions, not a render).
const root = process.cwd();
const dockViewSource = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const voiceRealtimeSource = await readFile(path.join(root, 'navrya-src', 'aiVoiceRealtime.js'), 'utf8');
const chatDockSource = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx'), 'utf8');
const i18nSource = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js'), 'utf8');

// --- Item 1: no automatic first-run popup on ordinary app load ---

test('dockExplicitlyOpened starts false - the dock never assumes it has been engaged with just because it mounted', () => {
  assert.match(dockViewSource, /const \[dockExplicitlyOpened, setDockExplicitlyOpened\] = React\.useState\(false\)/);
});

test('the WELCOME card specifically requires dockExplicitlyOpened; a real step card is unaffected', () => {
  const gate = dockViewSource.slice(dockViewSource.indexOf('const companionCardAllowed'), dockViewSource.indexOf('const reviewActions'));
  assert.match(gate, /companionCard\.kind !== 'welcome' \|\| dockExplicitlyOpened/);
});

test('dockExplicitlyOpened is set true by three real explicit gestures: focusing the input, pressing Voice, and sending any message - never by mounting/refreshing/navigating', () => {
  assert.match(dockViewSource, /onInputFocus=\{\(\) => setDockExplicitlyOpened\(true\)\}/, 'input focus');
  const toggleVoiceBody = dockViewSource.slice(dockViewSource.indexOf('function toggleVoice()'), dockViewSource.indexOf('function toggleVoiceMute'));
  assert.match(toggleVoiceBody, /setDockExplicitlyOpened\(true\)/, 'pressing Voice');
  const submitBody = dockViewSource.slice(dockViewSource.indexOf('async function submit(value, options)'), dockViewSource.indexOf('const submitRef'));
  assert.match(submitBody, /setDockExplicitlyOpened\(true\)/, 'sending a message');
  // Never set from the mount-time Companion-card-refresh effect itself.
  const refreshEffect = dockViewSource.slice(dockViewSource.indexOf('function refreshCompanion()'), dockViewSource.indexOf('function onModelChange'));
  assert.doesNotMatch(refreshEffect, /setDockExplicitlyOpened/);
});

test('ChatDock.jsx exposes the real onInputFocus prop, fired alongside (never replacing) its own existing local `focused` styling state', () => {
  assert.match(chatDockSource, /onInputFocus/);
  assert.match(chatDockSource, /onFocus=\{\(\) => \{ setFocused\(true\); if \(onInputFocus\) onInputFocus\(\); \}\}/);
});

// --- Items 2/7: Voice initiates the first-run conversation; the real trigger point ---

test('deliverCompanionOpening() is triggered from exactly one place: the CONNECTING -> LISTENING transition, watched via a real voiceState effect - never from a mount-time effect', () => {
  const effect = dockViewSource.slice(dockViewSource.indexOf('const previousVoiceStateRef'), dockViewSource.indexOf('function toggleVoice()'));
  assert.match(effect, /voiceState === VOICE_STATES\.LISTENING && previous === VOICE_STATES\.CONNECTING\) deliverCompanionOpening\(\)/);
  assert.match(effect, /\}, \[voiceState\]\);/, 'a real effect dependent on voiceState, not an empty-deps mount effect');
  // Must not appear anywhere in the mount-time Companion-refresh effect or the voice-session-
  // creation effect (both empty-deps, i.e. real mount-time code).
  const refreshEffect = dockViewSource.slice(dockViewSource.indexOf('function refreshCompanion()'), dockViewSource.indexOf('function onModelChange'));
  assert.doesNotMatch(refreshEffect, /deliverCompanionOpening/);
  const sessionCreateEffect = dockViewSource.slice(dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"), dockViewSource.indexOf('const previousVoiceStateRef'));
  assert.doesNotMatch(sessionCreateEffect, /deliverCompanionOpening\(\)/);
});

test('no duplicate opening: openingDeliveredForConnectionRef guards a second call within the same connection, and is reset back to false on IDLE/ERROR so a genuinely NEW connect() gets a fresh opening', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('function deliverCompanionOpening()'), dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"));
  assert.match(fn, /if \(openingDeliveredForConnectionRef\.current\) return;/);
  assert.match(fn, /openingDeliveredForConnectionRef\.current = true;/);
  const effect = dockViewSource.slice(dockViewSource.indexOf('const previousVoiceStateRef'), dockViewSource.indexOf('function toggleVoice()'));
  assert.match(effect, /voiceState === VOICE_STATES\.IDLE \|\| voiceState === VOICE_STATES\.ERROR\) openingDeliveredForConnectionRef\.current = false/);
});

// --- Item 6: consent boundary - Voice must be explicitly started before ANY spoken opening ---

test('deliverCompanionOpening is only ever reachable through connect(), which is only ever called from the user\'s own explicit toggleVoice() press - never from a mount effect, never unconditionally', () => {
  // connect() is called in exactly one place in this file.
  const connectCalls = dockViewSource.match(/voiceRef\.current\.connect\(\)/g) || [];
  assert.equal(connectCalls.length, 1);
  const toggleVoiceBody = dockViewSource.slice(dockViewSource.indexOf('function toggleVoice()'), dockViewSource.indexOf('function toggleVoiceMute'));
  assert.match(toggleVoiceBody, /voiceRef\.current\.connect\(\)/, 'the one connect() call lives inside toggleVoice(), the user\'s own button handler');
});

// --- Item 9: visual CompanionCard synchronized during the opening, never a new overlay ---

test('the render gate lets the CompanionCard show DURING companionOpeningActive even though voiceState is not idle, and reuses the exact existing CompanionCard component (no new overlay)', () => {
  const gate = dockViewSource.slice(dockViewSource.indexOf('const companionCardAllowed'), dockViewSource.indexOf('const reviewActions'));
  assert.match(gate, /voiceState === VOICE_STATES\.IDLE \|\| companionOpeningActive/);
  assert.match(dockViewSource, /<CompanionCard\b/, 'the same, already-existing CompanionCard component is reused');
  assert.equal((dockViewSource.match(/<CompanionCard\b/g) || []).length, 1, 'exactly one CompanionCard render site - no second, parallel overlay component');
});

test('for the fresh-welcome opening specifically, the visual card is captured BEFORE voiceOpening() marks the walkthrough seen, so the real Start/What is NAVRYA?/Later card still shows synchronized with the spoken greeting', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('function deliverCompanionOpening()'), dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"));
  const preOpeningIndex = fn.indexOf('var preOpeningCard = orchestrator.currentCard();');
  const voiceOpeningIndex = fn.indexOf('var opening = orchestrator.voiceOpening();');
  assert.ok(preOpeningIndex > -1 && voiceOpeningIndex > -1 && preOpeningIndex < voiceOpeningIndex, 'currentCard() must be captured before voiceOpening() runs (and may mark the walkthrough seen)');
  assert.match(fn, /opening\.kind === 'freshWelcome' && preOpeningCard \? preOpeningCard : orchestrator\.currentCard\(\)/);
});

// --- Item 8: interruption reuses the EXISTING barge-in path - no second interruption system ---

// Voice Mode performance pass: the opening's speech now goes through
// playbackControllerRef.current.enqueue() (the same call every real turn's reply uses) instead of
// a direct, awaited voiceRef.current.speak() - PlaybackController is what actually calls speak()
// internally (see ai-voice-playback-controller.js). aiVoiceRealtime.js's own barge-in handling is
// unchanged either way - it interrupts ANY ASSISTANT_SPEAKING playback regardless of what
// initiated it.
test('the Voice Companion opening is delivered via the exact same PlaybackController every real turn\'s reply already speaks through, so it is interruptible by the SAME existing barge-in handling - no new interruption code was added anywhere', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('function deliverCompanionOpening()'), dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"));
  assert.match(fn, /playbackControllerRef\.current\.enqueue\(toSpeak, \{ kind: 'companion-opening', caption: opening\.text \}\)/);
  assert.doesNotMatch(fn, /voiceRef\.current\.speak\(/, 'deliverCompanionOpening() must never call speak() directly - only through PlaybackController, like every other reply');
  // fix/voice-mode-turn-ux (Part B): aiVoiceRealtime.js's own barge-in handling now notifies the
  // caller via onBargeIn() (routed to PlaybackController.interrupt() - the controller-owned path)
  // instead of calling its own transport-level interrupt() directly, but the coverage is identical:
  // it already fires for ANY ASSISTANT_SPEAKING playback, this opening included, since speak() sets
  // that exact state for every call, not a special one for the opening.
  assert.match(voiceRealtimeSource, /if \(wasAssistantSpeaking\) onBargeIn\(\);/);
  assert.doesNotMatch(voiceRealtimeSource, /companion|opening/i, 'aiVoiceRealtime.js stays a pure, Companion-unaware transport - no business rules were added to it');
});

// Voice Mode performance pass: PlaybackController's own internal one-at-a-time queue (see
// tests/ai-voice-playback-controller.test.mjs) is what now guarantees the opening's speech and any
// later real turn's reply never overlap - both are enqueue()'d onto the SAME controller instance,
// so PlaybackController's own serialization (never voiceTurnQueue, which no longer exists) is what
// prevents a barge-in-triggered second speak() call from overlapping this one.
test('the opening is routed through the SAME PlaybackController every real voice turn already serializes speech through, so a barge-in mid-opening can never overlap a second speak() call', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('function deliverCompanionOpening()'), dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"));
  assert.match(fn, /playbackControllerRef\.current\.enqueue\(/);
  assert.doesNotMatch(dockViewSource, /voiceTurnQueue\.current/, 'the old coupled queue variable must be fully removed (a historical mention in a comment explaining the redesign is fine, an actual live reference is not)');
});

// --- Item 10: exactly one turn is ever treated as a reply to a Companion opening ---

test('awaitingCompanionOpeningReplyRef is set true only inside deliverCompanionOpening, and is read-and-cleared exactly once at the top of onVoiceTranscript - so only the ONE next transcript is ever special', () => {
  const setCalls = dockViewSource.match(/awaitingCompanionOpeningReplyRef\.current = true;/g) || [];
  assert.equal(setCalls.length, 1);
  const onVoiceTranscriptBody = dockViewSource.slice(dockViewSource.indexOf('function onVoiceTranscript(transcriptText)'), dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"));
  assert.match(onVoiceTranscriptBody, /const wasAwaitingCompanionOpeningReply = awaitingCompanionOpeningReplyRef\.current;\s*\n\s*awaitingCompanionOpeningReplyRef\.current = false;/);
});

// --- Item 16: safety priority ---

test('Therapist Mode suppresses the proactive Voice Companion opening entirely - checked before the orchestrator is ever consulted', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('function deliverCompanionOpening()'), dockViewSource.indexOf("const useGeminiLive = providerId === 'gemini';"));
  const therapistCheckIndex = fn.indexOf('if (therapistMode) return;');
  const orchestratorReadIndex = fn.indexOf('window.TradeJournalAICompanionOrchestrator');
  assert.ok(therapistCheckIndex > -1 && orchestratorReadIndex > -1 && therapistCheckIndex < orchestratorReadIndex, 'Therapist Mode must be checked BEFORE the orchestrator is ever consulted');
});

// --- Item 15: Persian voice configuration is untouched ---

test('this pass never touched voice/model selection - the current validated per-language voice map in the server gateway is unchanged', async () => {
  const serverSource = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.match(serverSource, /fa:\s*'marin'/, 'Persian still resolves to the validated marin voice (Persian Voice Quality gate) - untouched by this UX pass');
});

// --- Item 17: EN/FA/AR/ES coverage for every new voice-opening string ---

test('every voiceOpening* i18n key exists, with a real (non-empty) value, in all four supported languages', () => {
  const keys = ['voiceOpeningFreshWelcome', 'voiceOpeningReturningNeutral', 'voiceOpeningActiveSession', 'voiceOpeningActiveTrade', 'voiceOpeningDueReflection', 'voiceOpeningStartAck', 'voiceOpeningLaterAck'];
  const blocks = { fa: i18nSource.indexOf('fa: {'), ar: i18nSource.indexOf('ar: {'), en: i18nSource.indexOf('en: {'), es: i18nSource.indexOf('es: {') };
  const order = ['fa', 'ar', 'en', 'es'].sort((a, b) => blocks[a] - blocks[b]);
  order.forEach((lang, i) => {
    const start = blocks[lang];
    const end = i + 1 < order.length ? blocks[order[i + 1]] : i18nSource.length;
    const block = i18nSource.slice(start, end);
    keys.forEach((key) => {
      const match = new RegExp(key + ":\\s*'([^']+)'").exec(block);
      assert.ok(match, `${key} missing in ${lang} block`);
      assert.ok(match[1].trim().length > 0, `${key} is empty in ${lang} block`);
    });
  });
});
