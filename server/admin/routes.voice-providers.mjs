import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import { rateLimit, sessionKey, resolveRedisClient } from '../community/security/rate-limit.mjs';
import * as elevenlabs from '../community/elevenlabs-client.mjs';
import { ElevenLabsError } from '../community/elevenlabs-client.mjs';

// No single canonical language-registry module exists in this repo (confirmed by inspection -
// REALTIME_LANGUAGES in pattern-ai-server.mjs, the admin/select apps' own languageNames maps, and
// landing/src/content.ts's supportedLanguages each independently declare the same 4-language
// list, since this codebase has no browser/server shared-module bundling - see
// ARCHITECTURE.md 7.17's own documented "kept in sync by a test, not one shared module"
// precedent). Following that same established precedent here: one more independent, explicitly
// commented constant, not a new shared registry.
const SUPPORTED_LANGUAGES = ['fa', 'ar', 'en', 'es'];
const VOICE_CONFIG_VERSION_KEY = 'voice_provider_config:version';

// Bumped on every credential/language-config write so pattern-ai-server.mjs's runtime config
// bridge (server/community/routes.internal.mjs's /internal/voice-provider-config, cached
// in-process there) can detect a change across every replica almost immediately, rather than
// waiting out a fixed TTL - mission requirement: "Invalidate or version the cache immediately
// after an admin update... account for multiple production replicas using an existing shared
// invalidation mechanism/Redis if required." Silently a no-op when Redis is unavailable (local
// dev without REDIS_URL) - the bridge's own short TTL fallback still bounds staleness in that case.
async function bumpVoiceConfigVersion() {
  try {
    const client = resolveRedisClient();
    if (client) await client.incr(VOICE_CONFIG_VERSION_KEY);
  } catch (_) { /* best-effort only - never blocks the actual admin write */ }
}

function assertSupportedLanguage(languageCode) {
  if (!SUPPORTED_LANGUAGES.includes(languageCode)) throw new ApiError(400, 'UNSUPPORTED_LANGUAGE');
}

// Maps a thrown ElevenLabsError to an HTTP status + sanitized error code - the ONLY place upstream
// failure detail is allowed to touch an HTTP response, and even here it is always the fixed
// `.code`, never `.safeDetail`/raw body text (mission: "never appear in ... error messages").
function statusForElevenLabsError(error) {
  if (error.code === 'INVALID_CREDENTIAL') return 401;
  if (error.code === 'RESTRICTED_SCOPE') return 403;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'TIMEOUT' || error.code === 'NETWORK_ERROR' || error.code === 'UPSTREAM_ERROR') return 502;
  return 400;
}

// Voice-only validation rate limiter (separate from the paid-TTS one below) - GET /v1/user is a
// free, read-only call, but still worth bounding against an admin fat-fingering "validate" in a
// tight loop against a real upstream service.
const validateLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, keyFn: sessionKey('voice-provider-validate') });
// Paid-TTS test-sample limiter - deliberately tighter, since every call spends real money.
const testSampleLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, keyFn: sessionKey('voice-provider-test-sample') });
const catalogLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, keyFn: sessionKey('voice-provider-catalog') });

export function router(repo) {
  const app = express.Router();

  async function audit(req, action, targetType, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
  }

  // --- Credential profiles (masked responses only - see mapVoiceCredential in repo.pg.mjs/
  // repo.memory.mjs, which never includes apiKey unless includeDecrypted is explicitly passed,
  // and this route file never passes it) ---

  app.get('/credentials', asyncHandler(async (req, res) => {
    res.json(await repo.voiceProviderCredentials.list());
  }));

  // Step-up required: a real production credential, same posture as POST /ai/keys.
  app.post('/credentials', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!String(body.apiKey || '').trim()) throw new ApiError(400, 'VALIDATION_FAILED');
    const record = await repo.voiceProviderCredentials.create({
      provider: 'elevenlabs', label: body.label, apiKey: body.apiKey, updatedBy: req.currentUser.id
    });
    await bumpVoiceConfigVersion();
    // No key material in the audit trail - just the fact that a profile was created, by whom.
    await audit(req, 'voiceProvider.credential.create', 'voiceProviderCredential', record.id, { label: record.label });
    res.status(201).json(record);
  }));

  // Step-up required. A blank/omitted apiKey retains the existing key (repo layer's own
  // documented behavior) - this route only ever forwards what the client actually sent.
  app.patch('/credentials/:id', requireRecentReauth(), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const record = await repo.voiceProviderCredentials.replace(req.params.id, {
      label: body.label, apiKey: body.apiKey, enabled: body.enabled, updatedBy: req.currentUser.id
    });
    await bumpVoiceConfigVersion();
    await audit(req, 'voiceProvider.credential.update', 'voiceProviderCredential', req.params.id, {
      keyReplaced: Boolean(body.apiKey && String(body.apiKey).trim()), labelChanged: body.label != null, enabledChanged: body.enabled != null
    });
    res.json(record);
  }));

  // Explicit, separate delete action (never implied by PATCH with a blank key) - step-up required.
  app.delete('/credentials/:id', requireRecentReauth(), asyncHandler(async (req, res) => {
    const deleted = await repo.voiceProviderCredentials.delete(req.params.id);
    if (!deleted) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    await bumpVoiceConfigVersion();
    await audit(req, 'voiceProvider.credential.delete', 'voiceProviderCredential', req.params.id, {});
    res.json({ deleted: true });
  }));

  // Validates without generating any paid audio (GET /v1/user only) - mission requirement.
  app.post('/credentials/:id/validate', validateLimiter, asyncHandler(async (req, res) => {
    const credential = await repo.voiceProviderCredentials.get(req.params.id, { includeDecrypted: true });
    if (!credential) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    try {
      const result = await elevenlabs.validateCredential(credential.apiKey);
      const updated = await repo.voiceProviderCredentials.recordValidation(req.params.id, { status: 'valid', error: null });
      await audit(req, 'voiceProvider.credential.validate', 'voiceProviderCredential', req.params.id, { status: 'valid' });
      res.json({ ...updated, subscriptionTier: result.subscriptionTier });
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      // A 403 here means the key is real but scope-restricted, NOT invalid (mission requirement) -
      // recorded as its own distinct status so the admin UI can show a different, accurate badge.
      const status = error.code === 'RESTRICTED_SCOPE' ? 'restricted' : 'invalid';
      const updated = await repo.voiceProviderCredentials.recordValidation(req.params.id, { status, error: error.code });
      await audit(req, 'voiceProvider.credential.validate', 'voiceProviderCredential', req.params.id, { status });
      res.json(updated);
    }
  }));

  // Subscription/quota snapshot - real upstream numbers, honestly labeled (see
  // elevenlabs-client.mjs's getSubscription() comment on "nominal", never a guaranteed hard stop).
  app.get('/credentials/:id/subscription', asyncHandler(async (req, res) => {
    const credential = await repo.voiceProviderCredentials.get(req.params.id, { includeDecrypted: true });
    if (!credential) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    try {
      const subscription = await elevenlabs.getSubscription(credential.apiKey);
      res.json({
        ...subscription,
        nominalRemainingAllowance: subscription.characterLimit != null && subscription.characterCount != null
          ? subscription.characterLimit - subscription.characterCount : null,
        overageEnabled: subscription.allowedToUseOverage
      });
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      res.status(statusForElevenLabsError(error)).json({ error: error.code });
    }
  }));

  // Detailed upstream analytics - kept entirely separate from local usage (below) and from TTS
  // health, since a key lacking workspace_analytics_full_read must never be reported as
  // "disconnected" for TTS purposes (mission: "Keep TTS health separate from analytics health" /
  // "Show 'Usage permission unavailable' rather than marking TTS disconnected").
  app.get('/credentials/:id/upstream-usage', asyncHandler(async (req, res) => {
    const credential = await repo.voiceProviderCredentials.get(req.params.id, { includeDecrypted: true });
    if (!credential) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
    try {
      const usage = await elevenlabs.getUsageByProductOverTime(credential.apiKey);
      res.json({ available: true, usage });
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      if (error.code === 'RESTRICTED_SCOPE') return res.json({ available: false, reason: 'ANALYTICS_PERMISSION_UNAVAILABLE' });
      res.status(statusForElevenLabsError(error)).json({ error: error.code });
    }
  }));

  // Real, locally-measured NAVRYA usage (voice_tts_usage_events) - never fabricated, always shown
  // regardless of what the upstream analytics call above can or cannot report (mission: "Continue
  // displaying locally measured NAVRYA usage" / "Never fabricate a zero balance").
  app.get('/usage', asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const [byLanguage, recent] = await Promise.all([
      repo.voiceTtsUsage.aggregateByLanguage({ since }), repo.voiceTtsUsage.recent({ limit: 50 })
    ]);
    res.json({ byLanguage, recent, days });
  }));

  // --- Per-language configuration ---

  app.get('/languages', asyncHandler(async (req, res) => {
    const rows = await repo.voiceLanguageConfigs.list();
    const byLanguage = {};
    rows.forEach((row) => { byLanguage[row.languageCode] = row; });
    // Always returns one entry per SUPPORTED_LANGUAGES, even for a language with no saved config
    // yet, so the admin UI never has to special-case "not configured" vs. "configured but empty".
    res.json(SUPPORTED_LANGUAGES.map((languageCode) => byLanguage[languageCode] || {
      languageCode, provider: 'elevenlabs', credentialId: null, voiceId: null, modelId: null, enabled: false,
      voiceSettings: {}, fallbackProvider: 'openai', fallbackVoice: null, updatedBy: null, createdAt: null, updatedAt: null
    }));
  }));

  app.put('/languages/:code', asyncHandler(async (req, res) => {
    assertSupportedLanguage(req.params.code);
    const body = req.body || {};
    if (body.credentialId) {
      const credential = await repo.voiceProviderCredentials.get(body.credentialId);
      if (!credential) throw new ApiError(400, 'CREDENTIAL_NOT_FOUND');
    }
    const record = await repo.voiceLanguageConfigs.upsert({
      languageCode: req.params.code, provider: 'elevenlabs', credentialId: body.credentialId || null,
      voiceId: body.voiceId || null, modelId: body.modelId || null, enabled: Boolean(body.enabled),
      voiceSettings: body.voiceSettings || {}, fallbackProvider: body.fallbackProvider || 'openai',
      fallbackVoice: body.fallbackVoice || null, updatedBy: req.currentUser.id
    });
    await bumpVoiceConfigVersion();
    await audit(req, 'voiceProvider.language.save', 'voiceLanguageConfig', req.params.code, {
      enabled: record.enabled, voiceId: record.voiceId, modelId: record.modelId, hasCredential: Boolean(record.credentialId)
    });
    res.json(record);
  }));

  // --- Voice/model catalogs (proxied through the admin-selected credential) ---

  app.get('/voices', catalogLimiter, asyncHandler(async (req, res) => {
    const credential = await repo.voiceProviderCredentials.get(req.query.credentialId, { includeDecrypted: true });
    if (!credential) throw new ApiError(400, 'CREDENTIAL_NOT_FOUND');
    try {
      const voices = await elevenlabs.listVoices(credential.apiKey);
      const search = String(req.query.search || '').trim().toLowerCase();
      res.json(search ? voices.filter((v) => v.name.toLowerCase().includes(search)) : voices);
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      res.status(statusForElevenLabsError(error)).json({ error: error.code });
    }
  }));

  app.get('/models', catalogLimiter, asyncHandler(async (req, res) => {
    const credential = await repo.voiceProviderCredentials.get(req.query.credentialId, { includeDecrypted: true });
    if (!credential) throw new ApiError(400, 'CREDENTIAL_NOT_FOUND');
    try {
      res.json(await elevenlabs.listModels(credential.apiKey));
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      res.status(statusForElevenLabsError(error)).json({ error: error.code });
    }
  }));

  // Validates a voice/model/language combination is real and mutually compatible, without
  // spending a paid TTS call: the voice must exist for this credential, and (when the model
  // reports language metadata at all) the language must be in the model's own supported list.
  app.post('/validate-combo', catalogLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    assertSupportedLanguage(body.languageCode);
    const credential = await repo.voiceProviderCredentials.get(body.credentialId, { includeDecrypted: true });
    if (!credential) throw new ApiError(400, 'CREDENTIAL_NOT_FOUND');
    try {
      const [voice, models] = await Promise.all([
        elevenlabs.getVoice(credential.apiKey, body.voiceId),
        elevenlabs.listModels(credential.apiKey)
      ]);
      const model = models.find((m) => m.modelId === body.modelId);
      if (!model) return res.json({ valid: false, reason: 'MODEL_NOT_FOUND_OR_NOT_TTS_CAPABLE' });
      const languageSupported = model.languages.length === 0 || model.languages.includes(body.languageCode);
      res.json({ valid: languageSupported, reason: languageSupported ? null : 'MODEL_DOES_NOT_SUPPORT_LANGUAGE', voice, model });
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      if (error.code === 'INVALID_CREDENTIAL') return res.json({ valid: false, reason: 'INVALID_CREDENTIAL' });
      res.status(statusForElevenLabsError(error)).json({ error: error.code });
    }
  }));

  // --- Health (TTS health kept separate from analytics permission, per language) ---

  app.get('/health', asyncHandler(async (req, res) => {
    const [credentials, configs, usage] = await Promise.all([
      repo.voiceProviderCredentials.list(), repo.voiceLanguageConfigs.list(),
      repo.voiceTtsUsage.aggregateByLanguage({ since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() })
    ]);
    const usageByLanguage = {};
    usage.forEach((row) => { usageByLanguage[row.languageCode] = row; });
    const credentialsById = {};
    credentials.forEach((row) => { credentialsById[row.id] = row; });

    const languages = SUPPORTED_LANGUAGES.map((languageCode) => {
      const config = configs.find((c) => c.languageCode === languageCode) || null;
      const credential = config && config.credentialId ? credentialsById[config.credentialId] : null;
      const dayUsage = usageByLanguage[languageCode] || { requestCount: 0, successRatePercent: null, avgLatencyMs: 0, lastSuccessAt: null, lastErrorCode: null };
      let status;
      if (!config || !config.enabled) status = 'disabled';
      else if (!credential) status = 'unconfigured';
      else if (credential.validationStatus === 'invalid') status = 'invalid_credential';
      else if (dayUsage.requestCount > 0 && dayUsage.successRatePercent != null && dayUsage.successRatePercent < 80) status = 'degraded';
      else status = 'ready';
      return {
        languageCode, status, enabled: Boolean(config && config.enabled),
        credentialLabel: credential ? credential.label : null, credentialValidationStatus: credential ? credential.validationStatus : null,
        voiceId: config ? config.voiceId : null, modelId: config ? config.modelId : null,
        fallbackProvider: config ? config.fallbackProvider : 'openai', fallbackVoice: config ? config.fallbackVoice : null,
        last24h: dayUsage, dataSource: 'local', lastRefreshedAt: new Date().toISOString()
      };
    });
    res.json({ languages });
  }));

  // Admin-only, rate-limited, short test sample. Explicitly records that this call spends real
  // credits (mission: "clearly records that a paid test consumed credits") - both in the audit
  // log and in the usage table (source: 'admin_test').
  app.post('/test-sample', testSampleLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    assertSupportedLanguage(body.languageCode);
    const credential = await repo.voiceProviderCredentials.get(body.credentialId, { includeDecrypted: true });
    if (!credential) throw new ApiError(400, 'CREDENTIAL_NOT_FOUND');
    const text = String(body.text || '').trim().slice(0, 300);
    if (!text) throw new ApiError(400, 'TEXT_REQUIRED');
    const startedAt = Date.now();
    try {
      const result = await elevenlabs.synthesize(credential.apiKey, body.voiceId, {
        text, modelId: body.modelId, languageCode: body.languageCode, voiceSettings: body.voiceSettings, outputFormat: 'mp3_44100_128'
      });
      await repo.voiceTtsUsage.record({
        languageCode: body.languageCode, provider: 'elevenlabs', credentialId: credential.id, source: 'admin_test',
        characters: result.estimatedCharacters, characterCost: result.characterCost, success: true, latencyMs: Date.now() - startedAt
      });
      await audit(req, 'voiceProvider.testSample.generate', 'voiceProviderCredential', credential.id, {
        languageCode: body.languageCode, characters: result.estimatedCharacters, creditsConsumed: true
      });
      res.json({ ok: true, audioBase64: result.buffer.toString('base64'), mimeType: result.contentType, characterCost: result.characterCost });
    } catch (error) {
      if (!(error instanceof ElevenLabsError)) throw error;
      await repo.voiceTtsUsage.record({
        languageCode: body.languageCode, provider: 'elevenlabs', credentialId: credential.id, source: 'admin_test',
        characters: text.length, characterCost: null, success: false, errorCode: error.code, latencyMs: Date.now() - startedAt
      });
      res.status(statusForElevenLabsError(error)).json({ error: error.code });
    }
  }));

  return app;
}

export { SUPPORTED_LANGUAGES };
