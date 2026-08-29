(function () {
  'use strict';
  // ai-voice-output-resolver.js — Journey H2, Gate 3.
  //
  // The smallest possible provider-independent runtime decision: given this turn's source and
  // whether a published, approved audio asset is available for it, which delivery mechanism
  // should actually speak it? Kept out of navrya-src/chatDockView.jsx's own component body
  // (spec section 25 - "do not put this branching logic randomly inside many React components")
  // specifically so it stays a small, pure, independently-testable function.
  //
  // - 'PUBLISHED_AUDIO': play the pre-generated file - zero new speech-generation call.
  // - 'DYNAMIC_TTS': fall back to the existing live TTS engine (OpenAI Realtime speak or
  //   ElevenLabs synthesize(), whichever aiVoiceRealtime.js's speak() already selects) - the
  //   normal Voice path, unchanged.
  // - 'TEXT_ONLY': never speak anything - a typed message must never autoplay audio (spec
  //   section 26/27), regardless of whether published audio happens to exist for it. The written
  //   reply is unaffected either way; this only ever governs the SPOKEN delivery decision.
  function resolve(context) {
    var source = context && context.source;
    if (source !== 'voice') return 'TEXT_ONLY';
    return (context && context.hasAudio) ? 'PUBLISHED_AUDIO' : 'DYNAMIC_TTS';
  }

  window.TradeJournalAIVoiceOutputResolver = { resolve: resolve };
}());
