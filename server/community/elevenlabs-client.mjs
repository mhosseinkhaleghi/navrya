// Server-to-server ElevenLabs API client. Used by (a) the admin voice-provider routes
// (server/admin/routes.voice-providers.mjs) for validation/voices/models/subscription/usage, and
// (b) pattern-ai-server.mjs for the real-time TTS call the live Voice Mode makes - imported
// directly the same way pattern-ai-server.mjs already imports other server/community/* utility
// modules (crypto-util.mjs, rate-limit.mjs) that are not themselves a database dependency.
//
// Hardcoded upstream host only - this is deliberately NOT a general proxy (mission requirement:
// "Hardcode allowed upstream ElevenLabs hosts; never create a general proxy"). Every function here
// builds its own fixed path; nothing here ever accepts an arbitrary URL/host from a caller.

const ELEVENLABS_HOST = 'https://api.elevenlabs.io';
const DEFAULT_TIMEOUT_MS = 15000;
const TTS_TIMEOUT_MS = 30000;

// A thrown error's own `.code` is always one of this small, closed set - every caller (admin
// routes, pattern-ai's runtime TTS call, tests) switches on `.code`, never on a raw message
// string, and nothing here ever attaches the raw upstream response body to the error (mission:
// "Sanitize all upstream errors" / "never log or return raw upstream bodies").
export class ElevenLabsError extends Error {
  constructor(code, status, safeDetail) {
    super(code);
    this.code = code;
    this.status = status || null;
    this.safeDetail = safeDetail || null; // short, hand-picked-safe text only - never upstream body text
  }
}

// 401 = the key itself is invalid/expired/revoked. 403 = the key is real but restricted (a
// scope-limited key, or an IP-allowlist mismatch) - mission requirement: "Treat 403 as restricted
// scope or IP allowlist failure, not automatically as an invalid key." These map to two distinct
// error codes so callers never conflate them.
function classifyStatus(status) {
  if (status === 401) return 'INVALID_CREDENTIAL';
  if (status === 403) return 'RESTRICTED_SCOPE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'REQUEST_FAILED';
}

async function elevenLabsRequest(apiKey, path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, headers } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new ElevenLabsError('CREDENTIAL_MISSING', null);
  let response;
  try {
    response = await fetch(ELEVENLABS_HOST + path, {
      method,
      headers: Object.assign({ 'xi-api-key': key }, body ? { 'Content-Type': 'application/json' } : {}, headers || {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    // Never the raw network error message (could embed the key-bearing URL in some client
    // implementations) - a fixed, sanitized code only.
    throw new ElevenLabsError(error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR', null);
  }
  if (!response.ok) {
    // Deliberately drain and discard the body - never surfaced to any caller, never logged. See
    // mission: "it never logs or returns raw upstream bodies."
    await response.text().catch(() => '');
    throw new ElevenLabsError(classifyStatus(response.status), response.status);
  }
  return response;
}

// GET /v1/user - the official credential/account validation endpoint (mission-specified; never
// /v1/usage/character-stats, which is deprecated).
export async function validateCredential(apiKey) {
  const response = await elevenLabsRequest(apiKey, '/v1/user');
  const data = await response.json();
  return { ok: true, subscriptionTier: data.subscription && data.subscription.tier || null };
}

// GET /v1/user/subscription - subscription tier/status and the nominal character allowance.
// "Nominal" is load-bearing: when overage billing is enabled, character_limit - character_count
// is NOT a guaranteed hard stop (mission requirement) - the caller labels it accordingly, this
// function only ever passes the raw reported fields through unmodified/unlabeled.
export async function getSubscription(apiKey) {
  const response = await elevenLabsRequest(apiKey, '/v1/user/subscription');
  const data = await response.json();
  return {
    tier: data.tier ?? null,
    status: data.status ?? null,
    characterCount: data.character_count ?? null,
    characterLimit: data.character_limit ?? null,
    nextResetUnix: data.next_character_count_reset_unix ?? null,
    allowedToUseOverage: Boolean(data.allowed_to_use_rns || data.can_extend_character_limit || data.allowed_to_use_overage)
  };
}

// POST /v1/workspace/analytics/query/usage-by-product-over-time - detailed usage. Requires
// workspace_analytics_full_read; a restricted key throws RESTRICTED_SCOPE (403) here specifically,
// which the calling admin route interprets as "usage permission unavailable" (never as "TTS is
// broken" - mission: "Keep TTS health separate from analytics health").
export async function getUsageByProductOverTime(apiKey, { startUnix, endUnix, breakdownBy = 'voice' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const response = await elevenLabsRequest(apiKey, '/v1/workspace/analytics/query/usage-by-product-over-time', {
    method: 'POST',
    body: {
      start_unix: startUnix || now - 30 * 24 * 60 * 60,
      end_unix: endUnix || now,
      breakdown_by: breakdownBy,
      include_workspace_metrics: false
    }
  });
  return response.json();
}

// GET /v2/voices - the current (non-deprecated) voices listing endpoint. Maps to a small, safe
// subset only - the admin UI's searchable voice selector never needs anything beyond this.
export async function listVoices(apiKey) {
  const response = await elevenLabsRequest(apiKey, '/v2/voices');
  const data = await response.json();
  const voices = Array.isArray(data.voices) ? data.voices : [];
  return voices.map((voice) => ({
    voiceId: voice.voice_id, name: voice.name, category: voice.category || null,
    labels: voice.labels || {}, previewUrl: voice.preview_url || null
  }));
}

export async function getVoice(apiKey, voiceId) {
  const response = await elevenLabsRequest(apiKey, `/v1/voices/${encodeURIComponent(voiceId)}`);
  const voice = await response.json();
  return { voiceId: voice.voice_id, name: voice.name, category: voice.category || null, labels: voice.labels || {}, previewUrl: voice.preview_url || null };
}

// GET /v1/models - filtered by the model's own reported can_do_text_to_speech flag and language
// metadata (mission: "Do not rely only on hardcoded model names" / "Filter the returned models
// using can_do_text_to_speech and the model's returned language metadata").
export async function listModels(apiKey) {
  const response = await elevenLabsRequest(apiKey, '/v1/models');
  const models = await response.json();
  return (Array.isArray(models) ? models : [])
    .filter((model) => model.can_do_text_to_speech)
    .map((model) => ({
      modelId: model.model_id, name: model.name || model.model_id,
      languages: Array.isArray(model.languages) ? model.languages.map((l) => (typeof l === 'string' ? l : l.language_id)) : [],
      canDoTextToSpeech: true
    }));
}

// POST /v1/text-to-speech/{voice_id} - the real synthesis call, used both by the admin
// "generate a short test sample" action and by pattern-ai-server.mjs's live-Voice-Mode runtime
// path. Sends language_code when supported (mission: "For Persian synthesis, send language_code=fa
// where supported") - never assumed mandatory, since not every model/voice combination accepts it.
export async function synthesize(apiKey, voiceId, { text, modelId, languageCode, voiceSettings, outputFormat = 'mp3_44100_128' } = {}) {
  if (!voiceId) throw new ElevenLabsError('VOICE_ID_MISSING', null);
  const trimmedText = String(text || '').trim();
  if (!trimmedText) throw new ElevenLabsError('TEXT_REQUIRED', null);
  const requestBody = { text: trimmedText, model_id: modelId || 'eleven_v3' };
  if (languageCode) requestBody.language_code = languageCode;
  if (voiceSettings && typeof voiceSettings === 'object') requestBody.voice_settings = voiceSettings;
  const response = await elevenLabsRequest(apiKey, `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: 'POST', body: requestBody, timeoutMs: TTS_TIMEOUT_MS
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  // Real upstream character-cost accounting when the header is present - never assumed to equal
  // trimmedText.length 1:1 (mission: "Never assume one character always equals one credit because
  // model, plan and custom voice rates can differ"). Falls back to the requested text length only
  // as a last-resort estimate when the header is genuinely absent, and the caller is expected to
  // treat that as an estimate, not a confirmed cost.
  const headerCost = response.headers.get('character-cost') || response.headers.get('x-character-cost');
  const characterCost = headerCost != null ? Number(headerCost) : null;
  return { buffer, characterCost, estimatedCharacters: trimmedText.length, contentType: response.headers.get('content-type') || 'audio/mpeg' };
}

export { ELEVENLABS_HOST };
