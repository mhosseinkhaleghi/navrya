# ElevenLabs Voice Providers (Admin -> AI)

`server/admin/routes.voice-providers.mjs` (admin CRUD, step-up-gated)
`server/community/elevenlabs-client.mjs` (server-to-server ElevenLabs API client)
`server/community/routes.internal.mjs` -> `GET /internal/voice-provider-config` (decrypted runtime bridge)
`server/pattern-ai-server.mjs` -> `resolveElevenLabsForLanguage()`, `speakWithVoiceProvider()`, `POST /api/ai/voice/speak`
`navrya-src/aiVoiceRealtime.js` -> `speakViaElevenLabs()` / `speak()`
`public/pages/admin/app.js` -> Voice Providers section inside the AI tab

Lets an admin manage ElevenLabs credentials and per-language voice routing for the live Voice
Mode from the Admin UI, with changes taking effect immediately - no redeploy, no SSH, no restart.
This is a real production integration, not an isolated test card: OpenAI remains the sole
conversation brain (VAD, transcription, reasoning, workflow) for every language regardless of this
feature; only which engine renders NAVRYA's already-decided reply text to audio can change, per
language, when an admin has configured and enabled it. See `docs/ai/voice-architecture.md` for the
"one brain, not two conversations" design this feature does not touch.

## Runtime precedence

`resolveElevenLabsForLanguage(language)` (`server/pattern-ai-server.mjs`) decides which config (if
any) applies, in this exact order, for every real speak call:

1. **An enabled, valid admin-managed configuration** for the language (`admin_voice_language_configs`,
   joined against its selected `admin_voice_provider_credentials` row, fetched via the internal
   bridge below).
2. **An explicitly-enabled emergency environment fallback** - only when
   `ELEVENLABS_EMERGENCY_ENV_FALLBACK=true` *and* the language's env vars
   (`ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID_FA`, Persian only today) are actually set. This tier
   is deliberately opt-in: once a real admin-managed configuration exists, a stale or forgotten env
   var must never silently override it.
3. **OpenAI's existing Realtime voice** - the fallback of last resort, used whenever neither tier
   above resolves to something usable, and also the target of every runtime fallback described
   below.

## Data model (migration `023_voice_providers.sql`)

- **`admin_voice_provider_credentials`** - one row per named credential profile (e.g. "Primary
  ElevenLabs Account"). `api_key_encrypted` is AES-256-GCM (`server/community/security/crypto-util.mjs`,
  keyed by `ENCRYPTION_KEY`) - the same primitive already protecting `users.totp_secret_enc`, not a
  new one. `key_hint` stores only the last four characters, for display. `validation_status`
  (`unknown`/`valid`/`invalid`/`restricted`) and `validated_at` are set by the validate action, never
  guessed.
- **`admin_voice_language_configs`** - one row per language code (`fa`/`ar`/`en`/`es`, PK), pointing
  at a credential, voice, model, and `enabled` flag. `credential_id` is `ON DELETE SET NULL` - deleting
  a credential a language depends on disables that language's ElevenLabs routing rather than leaving
  a dangling reference.
- **`voice_tts_usage_events`** - append-only local usage/health ledger (language, source
  `admin_test`/`live_voice_mode`, character count, real upstream character cost when reported,
  success/error code, latency), the basis for the health/usage panel and never fabricated.

The API key is decrypted in exactly one place: the internal bridge below, which runs inside
`community-api` (the only process holding `ENCRYPTION_KEY`). It is never decrypted in, logged by, or
returned from any admin HTTP response - every admin-facing credential shape only ever carries
`keyHint`.

## Admin UI (Admin -> AI -> Voice Providers)

No separate top-level nav tab - this lives inside the existing AI tab, alongside LLM provider
key/pricing management (never merged into `KNOWN_PROVIDERS`; ElevenLabs has its own credential/
health/usage domain entirely).

**Credential profiles**: add a named profile (label + key, step-up reauth required to save/replace/
delete), validate without spending any TTS credits (`GET /v1/user`), see a masked last-4-character
hint and validation badge (`Valid`/`Invalid`/`Restricted`/`Not validated yet`), refresh quota on
demand (lazy - never fetched automatically for every credential on page load), and delete as an
explicit, separate, confirmed action (never implied by leaving the key field blank on an update -
blank retains the existing key).

**Per-language routing**: for each of fa/ar/en/es - enable/disable, pick a credential, pick a voice
(a single input backed by a native `<datalist>`, populated by "Load voices"; also accepts a manual
voice ID - both are the same field, so they can never drift out of sync), pick a model ("Load
models", filtered server-side to `can_do_text_to_speech`), see the configured OpenAI fallback, save,
and generate a short paid test sample with an explicit credits-consumed warning next to the trigger.

**Health & usage**: per-language status (`Ready`/`Disabled`/`Not configured`/`Invalid credential`/
`Degraded`), request count/success rate/avg latency over the last 24h from real local usage data,
last success/error. Upstream subscription/quota (tier, character count/limit, nominal remaining
allowance, next reset, overage) is shown only on explicit "Refresh quota" (its own upstream call) and
is reported as "Usage permission unavailable" - never as "disconnected" - when the credential lacks
workspace analytics permission; TTS itself is never marked unhealthy for a missing analytics scope.

Full fa/ar/en/es translations (60 keys, parity-checked across all four blocks), RTL-aware inputs for
fa/ar test text, and the same responsive grid the rest of the admin app already uses.

## Recommended ElevenLabs API key permissions

Create a **restricted** key (Workspace -> API Keys) scoped to only what this integration actually
calls:

- Text to Speech - required (`POST /v1/text-to-speech/{voice_id}`)
- Voices - read - required (`GET /v2/voices`, `GET /v1/voices/{voice_id}`)
- Models - read - required (`GET /v1/models`)
- User - read - required (`GET /v1/user`, used by validate)
- Workspace Analytics - read - optional; enables the subscription/quota/usage-by-product panel. A
  key without it still works for speech - see the health-separation note above.

Never grant write-level workspace/user-management permissions to a key used here - nothing in this
integration ever needs them, and `elevenlabs-client.mjs` only ever calls the specific endpoints
listed in its own module comment against a hardcoded `https://api.elevenlabs.io` host (never a
general proxy).

## Fallback and circuit breaker

`speakWithVoiceProvider()` (`server/pattern-ai-server.mjs`) never throws an HTTP error for an
ordinary fallback condition - it always resolves `200 {fallback: true, reason}` so the client can
fall back to the existing OpenAI voice path exactly once, with the same reply text, never producing
two audio outputs for one response. Fallback reasons: `UNSUPPORTED_LANGUAGE`, `TEXT_REQUIRED`,
`TEXT_TOO_LONG` (>2000 chars), `CIRCUIT_OPEN`, `NOT_CONFIGURED`, or a sanitized upstream error code
(`INVALID_CREDENTIAL`, `RESTRICTED_SCOPE`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`,
`UPSTREAM_ERROR`). A client-side fetch failure (network error, non-2xx, malformed body) is treated
identically by `aiVoiceRealtime.js`'s `speakViaElevenLabs()`.

A simple per-language, in-process circuit breaker (`elevenLabsCircuit` in `pattern-ai-server.mjs`)
opens after 3 consecutive failures and cools down for 30 seconds before allowing another real
attempt - bounding how long a genuinely broken credential/upstream keeps adding latency to every
reply before every call short-circuits straight to `{fallback: true, reason: 'CIRCUIT_OPEN'}`.

## Live Voice Mode integration

`mintRealtimeClientSecret()` reports `ttsProvider` (`'elevenlabs'`/`'openai'`) and `elevenLabs`
(`{voiceId, modelId}` or `null` - never the API key) alongside the existing OpenAI ephemeral
credential, decided server-side via the same `resolveElevenLabsForLanguage()` precedence. When it
resolves to ElevenLabs, `aiVoiceRealtime.js`'s `speak()` calls the same-origin, session-authenticated
`POST /api/ai/voice/speak` (key stays server-side always) instead of the OpenAI
`session.transport.requestResponse()` path, and plays the returned audio through a separate
`<audio>` element - never the WebRTC transport's own. Synthetic `output_audio_buffer.started/
stopped/cleared` events are relayed through the exact same callback the real WebRTC path uses, so
`PlaybackController`'s caption and settlement logic (`public/pages/shared/ai-voice-playback-controller.js`)
works unmodified regardless of which engine actually spoke. Barge-in and disconnect both stop
whichever engine is currently playing (see `interrupt()`/`teardownTransport()` in
`aiVoiceRealtime.js`).

## Cache invalidation across replicas

The internal bridge (`GET /internal/voice-provider-config`, `community-api`) is the only place the
API key is decrypted. `pattern-ai-server.mjs` caches its response for 10 seconds
(`VOICE_CONFIG_CACHE_TTL_MS`) to avoid hitting it on every single speak call; every admin write
(`server/admin/routes.voice-providers.mjs`) bumps a Redis-backed version counter
(`voice_provider_config:version`) so a change is observable well within that same short window
across every production `pattern-ai` replica, without requiring a push-based invalidation mechanism
this codebase does not otherwise have. In local dev without `REDIS_URL`, the plain 10s TTL still
bounds staleness.

## Emergency environment fallback

`ELEVENLABS_EMERGENCY_ENV_FALLBACK`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID_FA`,
`ELEVENLABS_MODEL_ID_FA`, `ELEVENLABS_LANGUAGE_CODE_FA` remain as bootstrap/emergency-only
compatibility (`.env.example`, `.env.production.example`, `docker-compose.production.yml`). They are
fully inert unless the flag is explicitly `true`, and even then only ever apply when no enabled
admin-managed configuration exists for that language (tier 2 of the precedence above). Only Persian
has an emergency voice ID today - see `emergencyEnvVoiceIdFor()`'s own comment for why adding another
language means one more literal `process.env.ELEVENLABS_VOICE_ID_<LANG>` branch there, never a
dynamic lookup.

## Key rotation / deletion

Rotating a key: PATCH the credential with a new `apiKey` (step-up reauth required) - the old
ciphertext is replaced atomically; a replacement that fails validation does not retroactively break
whatever was working before the PATCH (the previous ciphertext is only ever overwritten by a
successful write, never by a failed validation attempt). Deleting a credential a language still
points at sets that language's `credential_id` to `NULL` (FK `ON DELETE SET NULL`) - the language
falls back to OpenAI voice on its next speak call until an admin selects a new credential for it,
never a dangling/broken reference.

## Production verification checklist

1. Confirm `ENCRYPTION_KEY` is set on `community-api` (never on `pattern-ai` - it stays DB-free by
   design) - `.github/workflows/deploy.yml` refuses to deploy if it is missing from the server's
   `.env`.
2. Log in to `/admin` as an admin user, open AI -> Voice Providers.
3. Add a credential with the real (rotated, never-previously-committed) ElevenLabs key, save, reload
   the page, and confirm only the masked `keyHint` reappears - never the real key.
4. Click Validate - confirm a `Valid` badge and, optionally, Refresh quota for a real subscription
   snapshot.
5. Load voices/models for that credential, save a language config (Persian: voice
   `buzGl6hokx2gx74EYLO0`, model `eleven_v3`), and generate a test sample - confirm real audio plays.
6. Open the live app as a non-admin user with Persian enabled and start Voice Mode - confirm the
   assistant's spoken reply audibly comes from the configured ElevenLabs voice, captions still
   appear, and barge-in still cuts it off immediately.
7. Disable the language (or delete the credential) and confirm Voice Mode falls back to the existing
   OpenAI voice with no interruption to the rest of the conversation.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Credential saves but Validate shows `Invalid` | Key is wrong/revoked, or lacks the User read permission above |
| Validate shows `Restricted` | Key is real but missing a required permission scope (see table above) - not a bad key |
| "Usage permission unavailable" on Refresh quota | Key lacks Workspace Analytics read - TTS itself is unaffected |
| A language stays on OpenAI voice despite an enabled config | Check the language's health status in the admin panel first - `unconfigured` means no credential selected, `invalid_credential` means the selected credential's last validation failed |
| Config change doesn't seem to apply for up to ~10s | Expected - `VOICE_CONFIG_CACHE_TTL_MS`; a Redis-backed version bump usually surfaces it sooner across replicas, but the cache is never instant by design |
| Everything falls back even with a valid credential | Check for an open circuit breaker (3 consecutive failures within the last 30s) - it clears automatically on its own cooldown |
