import express from 'express';
import { asyncHandler } from './errors.mjs';
import { resolveSessionByRawId } from './security/session-service.mjs';
import { resolveRedisClient } from './security/rate-limit.mjs';
import { resolveUserEntitlements } from '../commercial/entitlement-resolver.mjs';
import { reserveForAiCall, settleAiCall, releaseAiCall } from '../commercial/wallet-service.mjs';

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'kimi', 'deepseek'];
const VOICE_CONFIG_VERSION_KEY = 'voice_provider_config:version';

// Server-to-server only - never called by a browser. pattern-ai-server.mjs (a plain node:http
// server with zero Postgres coupling by design) polls /admin-ai-keys to resolve admin-configured
// AI provider keys, and calls /session-introspect to verify a real user session before serving
// ANY AI endpoint (ADR-0001 section 6) - without either route touching the database directly
// itself. Protected by a shared secret header rather than requireAuth, since there is no
// browser/cookie identity on either call at all - this is process-to-process.
//
// INTERNAL_API_SECRET unset is refused outright in production (fail closed - see the instruction
// "missing internal-service authentication must fail startup in production"). Local/test-only, it
// is left open and logged once, matching this app's existing zero-setup-dev conventions.
export function router(repo) {
  if (!process.env.INTERNAL_API_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: INTERNAL_API_SECRET must be set in production - it protects the session-introspection bridge the AI gateway uses to verify every caller is a real, non-suspended user.');
  }
  const app = express.Router();
  let warnedOpen = false;

  // Shared by every route below - same secret, same "open in local dev, logged once" behavior.
  function secretOk(req) {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      if (!warnedOpen) {
        warnedOpen = true;
        console.warn('[internal] INTERNAL_API_SECRET is not set - /internal/* routes are reachable without a secret (local-only; production refuses to start this way)'); // eslint-disable-line no-console
      }
      return true;
    }
    return req.header('x-internal-secret') === secret;
  }

  app.get('/admin-ai-keys', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const rows = await repo.adminKeys.list();
    const byProvider = {};
    rows.forEach((row) => { byProvider[row.provider] = row.apiKey; });
    const result = {};
    KNOWN_PROVIDERS.forEach((provider) => { result[provider] = byProvider[provider] || null; });
    res.json(result);
  }));

  // The AI-gateway session-introspection bridge (ADR-0001 section 6). Takes the RAW session id
  // the gateway parsed off its own incoming request's Cookie header (never a whole cookie header
  // string, and never logged) and returns only the minimal shape the gateway needs to enforce
  // identity/suspension - never the session record itself, never any other user field.
  app.post('/session-introspect', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const rawSessionId = (req.body || {}).sessionId;
    if (!rawSessionId) return res.json({ valid: false });
    const record = await resolveSessionByRawId(repo, rawSessionId);
    if (!record) return res.json({ valid: false });
    const user = await repo.users.get(record.userId);
    if (!user || user.suspendedAt) return res.json({ valid: false, suspended: Boolean(user && user.suspendedAt) });
    res.json({ valid: true, userId: user.id, role: user.role });
  }));

  // pattern-ai-server.mjs's runtime ElevenLabs config bridge - the ONE place a decrypted
  // ElevenLabs API key is allowed to leave this process, and only to the DB-free AI gateway over
  // this shared-secret-protected, server-to-server hop (same "never touches Postgres/
  // ENCRYPTION_KEY itself" boundary the existing /admin-ai-keys route already established -
  // decryption happens HERE, where ENCRYPTION_KEY actually lives, never in pattern-ai). `version`
  // is the Redis-backed invalidation counter admin writes bump (server/admin/
  // routes.voice-providers.mjs's bumpVoiceConfigVersion()) - pattern-ai's own cache compares this
  // against its last-seen value to refetch almost immediately after an admin change, across every
  // replica, without needing a shared pub/sub channel. Falls back to Date.now() (never a fixed
  // constant) when Redis is unavailable, so a dev/test environment without REDIS_URL still gets a
  // monotonically-changing value every call - correct behavior there is simply "always refetch",
  // which is fine at dev/test scale.
  app.get('/voice-provider-config', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    let version;
    try {
      const client = resolveRedisClient();
      version = client ? Number(await client.get(VOICE_CONFIG_VERSION_KEY)) || 0 : Date.now();
    } catch (_) { version = Date.now(); }
    // Keyed by character+gender (server/admin/routes.voice-providers.mjs's own domain, replacing
    // the old per-language-only voiceLanguageConfigs) - a character's voice is the same across
    // every language now; the actual reply's real language is still sent to ElevenLabs as
    // language_code at synthesis time, just no longer part of the admin config key.
    const [configs, credentials] = await Promise.all([repo.voiceCharacterConfigs.list(), repo.voiceProviderCredentials.list()]);
    const characters = {};
    for (const config of configs) {
      const key = config.character + ':' + config.gender;
      if (!config.enabled || !config.credentialId) { characters[key] = { enabled: false }; continue; }
      const credentialMeta = credentials.find((c) => c.id === config.credentialId);
      // Fail closed: an enabled config pointing at a disabled/missing/never-validated-successfully
      // credential is reported as not-enabled to the runtime bridge, never silently synthesized -
      // the caller (pattern-ai) falls back exactly as it would for "no config at all".
      if (!credentialMeta || !credentialMeta.enabled) { characters[key] = { enabled: false }; continue; }
      let decrypted;
      try {
        decrypted = await repo.voiceProviderCredentials.get(config.credentialId, { includeDecrypted: true });
      } catch (_) {
        // decryptSecret() throws on a wrong/missing ENCRYPTION_KEY or a malformed envelope - fail
        // closed for this one entry rather than 500ing the whole bridge response, so a single
        // corrupted row can never take down every other character/gender's own working config.
        characters[key] = { enabled: false };
        continue;
      }
      characters[key] = {
        enabled: true, provider: config.provider, apiKey: decrypted.apiKey, voiceId: config.voiceId, modelId: config.modelId,
        character: config.character, gender: config.gender, voiceSettings: config.voiceSettings || {},
        fallbackProvider: config.fallbackProvider, fallbackVoice: config.fallbackVoice
      };
    }
    res.json({ version, characters });
  }));

  // pattern-ai-server.mjs fires this after every callProvider() outcome (success or failure) so
  // the Admin AI tab can show real per-provider health/uptime instead of just token totals - see
  // ARCHITECTURE.md 7.16 follow-up and 016_ai_provider_health.sql. Deliberately tolerant: a
  // malformed/missing field never 400s here, since the caller never awaits this request and must
  // never see a health-reporting failure surface as an AI-response failure.
  app.post('/ai-health-event', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const body = req.body || {};
    const record = await repo.providerHealth.record({
      provider: body.provider, ok: Boolean(body.ok), errorCode: body.errorCode || null,
      latencyMs: body.latencyMs, source: body.source || null
    });
    res.status(201).json(record);
  }));

  // Same fire-and-forget pattern as /ai-health-event above, for the SEPARATE voice_tts_usage_events
  // domain (never the LLM ai_provider_health_events/usage_events tables - ElevenLabs is a voice
  // provider, not an LLM token provider). pattern-ai-server.mjs's live-Voice-Mode speak path and
  // its admin test-TTS path both call this after every real ElevenLabs request, success or
  // failure - the caller never awaits it, so a malformed/missing field here must never surface as
  // a failure on the actual voice/speak response the user is waiting on.
  app.post('/voice-tts-usage-event', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const body = req.body || {};
    const record = await repo.voiceTtsUsage.record({
      languageCode: body.languageCode, provider: body.provider || 'elevenlabs', credentialId: body.credentialId || null,
      source: body.source || 'live_voice_mode', characters: body.characters, characterCost: body.characterCost,
      success: Boolean(body.success), errorCode: body.errorCode || null, latencyMs: body.latencyMs
    });
    res.status(201).json(record);
  }));

  // Commercial System Slice 1's Wallet bridge - server/pattern-ai-server.mjs (deliberately
  // DB-free) calls these three around every platform-key-funded provider call
  // (reserve -> callProvider() -> settle on success / release on failure or thrown error, per
  // spec section 27), and /entitlements to check the `ai` feature flag before even attempting a
  // reservation. Same secretOk() gate as every other route in this file - server-to-server only.
  app.post('/wallet/reserve', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const body = req.body || {};
    const result = await reserveForAiCall(repo, { userId: body.userId, feature: body.feature, provider: body.provider, model: body.model, payload: body.payload });
    res.json(result);
  }));

  app.post('/wallet/settle', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const body = req.body || {};
    const result = await settleAiCall(repo, { reservationId: body.reservationId, provider: body.provider, model: body.model, feature: body.feature, usage: body.usage });
    res.json(result);
  }));

  app.post('/wallet/release', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const body = req.body || {};
    const result = await releaseAiCall(repo, body.reservationId);
    res.json(result);
  }));

  app.get('/entitlements/:userId', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    res.json(await resolveUserEntitlements(req.params.userId, repo));
  }));

  return app;
}
