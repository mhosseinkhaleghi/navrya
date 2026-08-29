// Journey H2, Gate 3: the one real, shared implementation of "what text does this audio asset
// represent, and what is its content-identity hash" - imported directly by repo.pg.mjs,
// repo.memory.mjs, and server/admin/routes.conversation-scenarios.mjs (all genuine Node ES
// modules under server/, so a real shared import is possible here - unlike the browser/server
// split elsewhere in this codebase, which has no bundling and keeps independent copies by
// necessity). There is exactly one implementation of "is this audio still current" anywhere in
// the server.
import { createHash } from 'node:crypto';

// Spec section 8: audio is generated from spokenResponse, never automatically from the longer
// writtenResponse - but an explicit, documented fallback to writtenResponse is used when no
// spoken text has been authored yet, so an admin who hasn't filled in a spoken-specific variant
// can still generate a first pass. `usedFallback` tells the caller which happened, so the UI/API
// response can say so honestly rather than silently.
export function spokenTextFor(definition, language) {
  const response = (definition && definition.responses && definition.responses[language]) || {};
  const spoken = String(response.voiceReply || '').trim();
  if (spoken) return { text: spoken, usedFallback: false };
  const written = String(response.written || '').trim();
  return { text: written, usedFallback: Boolean(written) };
}

// Server-authoritative content identity (spec section 5/6): the spoken text actually used, the
// language, the provider, and the exact voice/model identifiers - never irrelevant metadata
// (admin notes, generation timestamps, request ids). A different voice or model always produces a
// different hash, so approving a new candidate under a different voice never silently reinterprets
// old audio as still matching.
export function computeAudioContentHash({ text, language, provider, voiceId, modelId }) {
  const canonical = [String(text || '').trim(), String(language || ''), String(provider || ''), String(voiceId || ''), String(modelId || '')].join('');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
