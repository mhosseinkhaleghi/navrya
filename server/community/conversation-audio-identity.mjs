// Journey H2, Gate 3: the shared implementation of an audio asset's content-identity hash -
// imported directly by repo.pg.mjs, repo.memory.mjs, and
// server/admin/routes.conversation-scenarios.mjs (all genuine Node ES modules under server/, so a
// real shared import is possible here - unlike the browser/server split elsewhere in this
// codebase, which has no bundling and keeps independent copies by necessity). There is exactly
// one implementation of "is this audio still current" anywhere in the server.
//
// H2 expressive/context follow-up: this file's own `spokenTextFor()` (STANDARD-only, no variant
// or performanceText awareness) has been removed - subsumed by
// server/community/performance-text.mjs's richer `responseSetFor()`/`effectiveVoiceTextFor()`,
// which resolve the right response set (STANDARD or a specific authored variant) and the right
// text (a valid `performanceText` when the model supports it, else the plain canonical text)
// before this file's own hash function is ever called. This file now owns only the hash itself.
import { createHash } from 'node:crypto';

// Server-authoritative content identity (spec section 5/6): the effective text actually sent to
// the provider, the language, the provider, and the exact voice/model identifiers - never
// irrelevant metadata (admin notes, generation timestamps, request ids). A different voice, model,
// or performance direction always produces a different hash, so approving a new candidate under a
// different voice/tag never silently reinterprets old audio as still matching.
export function computeAudioContentHash({ text, language, provider, voiceId, modelId }) {
  const canonical = [String(text || '').trim(), String(language || ''), String(provider || ''), String(voiceId || ''), String(modelId || '')].join('');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
