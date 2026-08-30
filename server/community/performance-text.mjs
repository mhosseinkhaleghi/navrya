// Journey H2 expressive-dialogue follow-up: the one place "is this expressive performance script
// still just the canonical dialogue, plus supported delivery cues?" is decided. Imported by
// server/admin/routes.conversation-scenarios.mjs for both the Enhance Delivery endpoint (validates
// what the model just generated before ever showing it to the admin as "good") and the publish
// quality gate (the REAL, unbypassable boundary - see validateForPublish()'s own comment on why
// the UI's own checks are a convenience, never the enforcement).
//
// A small, curated allowlist - never derived from a live provider API (ElevenLabs' own /v1/models
// response has no "supports audio tags" field), and deliberately conversational-delivery cues
// only, never sound effects (spec: "gunshots, music, applause, environmental effects" are
// explicitly out of scope).
export const SUPPORTED_AUDIO_TAGS = ['curious', 'excited', 'softly', 'whispers', 'laughs', 'sighs', 'exhales', 'short pause', 'long pause'];

// Playful/laughter tags are never appropriate for these scenario domains, even if a future
// scenario is ever authored there (no Conversation Studio scenario is in one of these domains
// today - Gates 1-2 deliberately kept Studio to product-FAQ/data-query content only). A small,
// deterministic exclusion list, per spec section 9 - never a policy engine.
export const CAUTION_DOMAINS = ['psychology', 'safety', 'risk'];
const PLAYFUL_TAGS = ['laughs', 'excited'];

const TAG_RE = /\[([^\]]*)\]/g;

// Extracts every [tag] span. Returns { strippedText, tagsUsed, invalidTags } - `strippedText` has
// every RECOGNIZED tag removed (so it can be compared against the canonical dialogue); an
// unrecognized tag is left in `invalidTags` and NOT stripped, so a caller can tell the whole
// performanceText is invalid rather than silently reading a made-up cue name aloud.
export function stripPerformanceTags(text) {
  const source = String(text || '');
  const tagsUsed = [];
  const invalidTags = [];
  const strippedText = source.replace(TAG_RE, (match, rawTag) => {
    const tag = String(rawTag || '').trim().toLowerCase();
    if (SUPPORTED_AUDIO_TAGS.indexOf(tag) === -1) { invalidTags.push(tag); return match; }
    tagsUsed.push(tag);
    return ' ';
  });
  return { strippedText, tagsUsed, invalidTags };
}

// A model/version curated allowlist (spec section 5) - Eleven v3 is, as of this writing, the one
// ElevenLabs model with real Audio Tag support; a v2 model (eleven_multilingual_v2,
// eleven_turbo_v2_5, ...) would just read a bracketed tag name aloud verbatim if sent one. Matches
// any current or future `eleven_v3*` model id (e.g. a dated/versioned variant) without needing an
// exhaustive exact-string list.
export function supportsExpressiveAudioTags(modelId) {
  return /^eleven_v3/i.test(String(modelId || '').trim());
}

// Section 3's real enforcement: strips recognized tags, then compares against the canonical
// dialogue using the EXACT SAME normalizer the shared matcher already uses for scoring
// (Unicode/digit/letter folding, punctuation-to-space, whitespace collapse) - permissive of any
// punctuation/whitespace/case the enhancer adds, strict about any added, removed, or reordered
// word. `matcher` is the already-loaded shared matcher (server callers get it via
// getConversationMatcher(); this function itself stays pure/matcher-agnostic).
export function validatePerformanceText(matcher, { performanceText, canonicalSpokenText }) {
  const text = String(performanceText || '').trim();
  if (!text) return { valid: false, reason: 'EMPTY' };
  const { strippedText, invalidTags } = stripPerformanceTags(text);
  if (invalidTags.length) return { valid: false, reason: 'UNSUPPORTED_TAG', invalidTags };
  const normalizedPerformance = matcher.normalize(strippedText);
  const normalizedCanonical = matcher.normalize(canonicalSpokenText);
  if (!normalizedCanonical) return { valid: false, reason: 'NO_CANONICAL_TEXT' };
  if (normalizedPerformance !== normalizedCanonical) return { valid: false, reason: 'DIALOGUE_CHANGED' };
  return { valid: true, reason: null };
}

// Section 27's fallback rule, in one place: a scenario/turn must never break because expressive
// Voice metadata is missing, invalid, or the configured model can't speak it - this always
// resolves to SOME real text to synthesize, just not necessarily the expressive one.
export function effectiveVoiceText(matcher, { performanceText, canonicalSpokenText, modelId }) {
  if (performanceText && supportsExpressiveAudioTags(modelId)) {
    const result = validatePerformanceText(matcher, { performanceText, canonicalSpokenText });
    if (result.valid) return { text: performanceText, usedPerformanceText: true };
  }
  return { text: canonicalSpokenText, usedPerformanceText: false };
}

// The one place "which response set - STANDARD or a specific authored variant - does this exact
// (scenario version, language, variantKey) triple actually mean?" is resolved. `variantKey`
// undefined/null/'standard' (the only value ever stored before this gate, and still the default
// for every scenario that authors no variants) always resolves the scenario's own
// `responses[language]` - today's exact, unchanged shape. Any other key looks it up in
// `variants[language]` by its own `key` field; a key that no longer exists (an admin renamed/
// removed a variant after audio was generated for it) degrades gracefully to the scenario's own
// STANDARD response set (the last line below) rather than throwing or returning nothing - the
// same "never break the scenario" posture as effectiveVoiceText()'s own fallback rule.
export function responseSetFor(definition, language, variantKey) {
  if (variantKey && variantKey !== 'standard') {
    const variants = (definition && definition.variants && definition.variants[language]) || [];
    const found = variants.find((v) => v && v.key === variantKey);
    if (found) return found;
  }
  return (definition && definition.responses && definition.responses[language]) || {};
}

// Spec section 11: the actual text that was/will be sent to ElevenLabs for this exact (version,
// language, variant) triple, and whatever fallback happened along the way, reported honestly
// rather than silently - `usedWrittenFallback` mirrors conversation-audio-identity.mjs's older,
// STANDARD-only spokenTextFor()'s own written-fallback rule; `usedPerformanceText` is new.
// Subsumes that older function for every real caller in this gate - see this module's own header.
export function effectiveVoiceTextFor(matcher, definition, language, variantKey, modelId) {
  const responseSet = responseSetFor(definition, language, variantKey);
  const spokenReply = String(responseSet.voiceReply || '').trim();
  const written = String(responseSet.written || '').trim();
  const canonicalSpokenText = spokenReply || written;
  const usedWrittenFallback = !spokenReply && !!written;
  if (!canonicalSpokenText) return { text: '', usedWrittenFallback, usedPerformanceText: false };
  const picked = effectiveVoiceText(matcher, { performanceText: responseSet.performanceText, canonicalSpokenText, modelId });
  return { text: picked.text, usedWrittenFallback, usedPerformanceText: picked.usedPerformanceText };
}
