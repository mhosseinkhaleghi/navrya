# Conversation Studio Voice Asset Pipeline (Journey H2, Gate 3)

Status: **Gate 3 complete.** Gates 1-2 removed the LLM call for a matched deterministic scenario
(`docs/ai/conversation-router.md`, `docs/ai/conversation-studio.md`). Gate 3 targets the
*speech-generation* call for the same matched scenarios: an admin can generate a scenario's audio
once, listen to it, approve it, and every subsequent matching Voice turn plays the stored file
instead of calling a live TTS engine again.

## Cost model - stated explicitly, never conflated

A Voice turn has three genuinely separate costs. This gate eliminates exactly one of them, for a
narrow, well-defined class of turn - it is never honest to say "this Voice turn costs zero."

| Leg | Provider (this repo, today) | Eliminated by this gate? |
|---|---|---|
| Speech -> text (transcription) | OpenAI Realtime (`gpt-realtime-2.1` session, `gpt-live-transcribe`) | **No.** Every Voice turn still transcribes the user's speech - this is real, unavoidable, ongoing cost regardless of anything below. |
| Text/context -> answer (LLM) | OpenAI/Anthropic/etc. via `pattern-ai-server.mjs` | Already 0 for a Gate 1/2 local match - unchanged by this gate. |
| Approved answer text -> speech (TTS) | OpenAI Realtime's own `requestResponse()` speak call, or a real ElevenLabs `synthesize()` HTTP call (`server/community/elevenlabs-client.mjs`) | **Yes** - but only for a HIGH-confidence local match whose scenario has approved, hash-current published audio for the user's language. |

The honest claim for a fully-served static Voice FAQ turn is **"LLM generation = 0, TTS
generation = 0, transcription = existing provider cost, unchanged."**

## Section 0 findings (the real repo, not stale docs)

Investigated before any design work, per this gate's own instruction not to assume architecture
from documentation:

- **Transcription and the Realtime session** live in `navrya-src/aiVoiceRealtime.js` (browser) and
  `server/pattern-ai-server.mjs` (token minting) - untouched by this gate.
- **Speech output today** is `aiVoiceRealtime.js`'s `speak(text)`, which branches per-connection on
  a server-resolved `ttsProvider` (never decided client-side): `speakViaOpenAI()` (the Realtime
  session's own `requestResponse()`) or `speakViaElevenLabs()` (a real `POST /api/ai/voice/speak`
  call -> `elevenlabs.synthesize()` -> base64 audio played through a **second**, dedicated
  `<audio>` element, `elevenLabsAudioEl`, deliberately separate from the WebRTC transport's own
  audio element). ElevenLabs is real, already integrated, TTS-only.
- **`ai-voice-playback-controller.js`** only knew `speak(text)` before this gate - there was no
  existing concept anywhere in this codebase of "play a pre-existing audio clip." This is genuinely
  new capability, not a rewire of something that already existed.
- **Storage** (`server/storage/storage.mjs`) is image-only (`sharp` re-encode, `image/*` MIME
  allowlist) - audio needed its own narrow module.
- **Cost tracking already existed and was reused as-is**: `voice_tts_usage_events`
  (`023_voice_providers.sql`) is a per-utterance ledger with a free-text `source` column
  (`'live_voice_mode'|'admin_test'|'admin_validation'`) - a new value, `'studio_audio_generation'`,
  needed zero schema change.
- **Credential/synthesis infrastructure was reused as-is**:
  `repo.voiceProviderCredentials.get(id, {includeDecrypted:true})` +
  `elevenlabs.synthesize(apiKey, voiceId, {text, modelId, languageCode, voiceSettings,
  outputFormat})` is the exact same call the existing admin `/test-sample` route already makes -
  this gate does not invent a second ElevenLabs client.

## Privacy classification - a structural rule, not an admin convention

Only `kind: 'faq'` and `kind: 'surface_help'` scenarios are ever eligible for pre-generated audio.
**`kind: 'data_query'` is rejected at the generation endpoint itself (`400
AUDIO_NOT_ELIGIBLE_FOR_DATA_QUERY`), unconditionally** - its response text is rendered from a live
per-user template variable (`{count}`, `{value}`), so it can never be safely shared as one static
clip. This is enforced in code (`server/admin/routes.conversation-scenarios.mjs`), never left to
admin judgment.

**Hardened during the H2 staging-readiness gate**: `kind !== 'data_query'` alone is a *proxy* for
eligibility, not the real boundary, and relying on it alone would miss a still-mutable draft that
hasn't reached publish-time validation yet. The actual, kind-agnostic rule enforced independently,
right below that check: the STORED spoken text for the exact requested language is scanned via the
shared matcher's own `templateVariablesIn()` (the identical function `validateForPublish()` already
uses for the publish quality gate) - generation is refused (`400
AUDIO_NOT_ELIGIBLE_TEMPLATE_VARIABLES`) if it contains **any** `{variable}` placeholder, regardless
of what `kind` the scenario claims to be. This is the correct structural test because the *only*
code path through which live per-user or Mental-Health-private data could ever enter a Studio
response is a `{variable}` resolved against `DATA_QUERY_RESOLVERS` (or an equivalent future
resolver) - a response with zero such placeholders is, by construction, 100% static admin-authored
text. No Psychology-domain scenario exists yet (Gates 1-2 deliberately excluded that surface), so
there is no live example to test privacy against directly, but this mechanism generalizes
correctly to one if it's ever added, without relying on `kind` staying correctly tagged.

## Data model (`server/db/migrations/042_conversation_audio_assets.sql`)

One table, `conversation_audio_assets`:

- `scenario_id` / `scenario_version_id` - which scenario, and which exact immutable version's
  content this audio was generated from.
- `language`, `variant_key` (default `'standard'` - only value populated/consumed this gate, the
  column exists for a future variant-selection feature).
- `content_hash` - `sha256(spokenText|language|provider|voiceId|modelId)`, server-authoritative,
  never trusted from the browser (`server/community/conversation-audio-identity.mjs`).
- `provider`, `voice_profile_key` (an admin-typed organizational label only - see "No Voice Profile
  registry" below), `voice_id`, `model_id`.
- `file_url`, `mime_type`, `duration_ms`.
- `status`: `preview` -> `approved` -> `archived` (a `CHECK` constraint; rows are never deleted,
  only archived - full history stays queryable).
- `created_by` / `approved_by` / `approved_at`.

**At most one `approved` row per `(scenario_version_id, language, variant_key)`**, enforced by a
Postgres partial unique index (`WHERE status = 'approved'`). Approving a new candidate archives the
previously-approved one for that exact slot in the same transaction
(`repo.conversationAudioAssets.approve()`).

**Staleness is never a stored column** - it is computed at read time by recomputing
`content_hash` against the version's *current* `definition` and comparing (`isStaleFor()` in the
admin route). For an already-**published** version this is always stable, since Gate 2 made
version definitions immutable once published - staleness is structurally a **draft-only** concern.
An admin who keeps editing a draft in one tab while a preview candidate sits unapproved in another
can never approve a candidate that has silently drifted from the current text (`409 AUDIO_STALE`
on approve).

**No Voice Profile registry table this gate**: `voiceProfileKey` is an admin-typed label on the
asset row (organizational/diagnostic only, e.g. `fa_default`) - the actual provider call always
takes an explicit `voiceId`/`modelId`/`credentialId`, resolved through the **existing**
`repo.voiceProviderCredentials`/`elevenlabs.listVoices()`/`listModels()` admin infrastructure, the
same one the Voice Providers tab's own character cards already use. A lighter-weight design than a
full registry, deliberately, for this gate's scope.

## Audio file storage (`server/storage/audio-storage.mjs`)

A narrow sibling of `storage.mjs`, for raw audio bytes rather than images: validate MIME
(`audio/mpeg`/`audio/mp3` only, matching ElevenLabs' `mp3_44100_128` output format), enforce an
8 MB size cap, write under `uploadsDir/conversation-audio/<generated-id>.mp3` using the same
path-traversal-safe generated-filename convention `storage.mjs` already uses, return
`{url, sizeBytes, mimeType}`. Reuses `storage.mjs`'s existing `deleteFile()` directly rather than
duplicating it.

## Admin API (`server/admin/routes.conversation-scenarios.mjs`, scoped under an existing scenario)

| Route | Purpose |
|---|---|
| `GET /:id/versions/:versionId/audio` | Lists every asset for that version, each with a freshly-computed `isStale` flag |
| `POST /:id/versions/:versionId/audio` | Generates a `preview` candidate. Body: `{language, variantKey, credentialId, voiceId, modelId, voiceProfileKey, voiceSettings}`. **Rejects `kind==='data_query'` (400) unconditionally.** Reads the **stored** version's `definition.responses[language].voiceReply`, falling back to `.written` when spoken text is empty (`usedFallbackText` reported back to the admin) - never trusts browser-supplied text for what gets synthesized. Computes `content_hash` server-side, calls `elevenlabs.synthesize()`, records `voice_tts_usage_events` with `source:'studio_audio_generation'` on both success and failure, saves via `audio-storage.mjs`, audits, inserts a `'preview'` row. Never runtime-active on its own. |
| `POST /:id/audio/:assetId/approve` | Human approval (mandatory - generation never auto-approves). Re-verifies `content_hash` against the version's current definition first (`409 AUDIO_STALE` if it no longer matches); archives any previously-approved asset for the same slot in the same transaction; audits. |
| `POST /:id/audio/:assetId/archive` | Manual removal from runtime eligibility without deleting the row/file - a full retention/cleanup policy is documented, not automated, this gate. |

Every mutating route audits scenario/asset/version/language metadata only - never the audio bytes
or the API key.

## Runtime bundle extension

`listPublishedForBundle()` (both `repo.pg.mjs` and `repo.memory.mjs`) joins each bundle row against
`conversation_audio_assets` filtered to `status='approved'`, batched via a new
`approvedAudioByVersionIds()`/`approvedAudioFor()` helper that **re-verifies the content hash
against that row's own definition before ever including it** - defensive, always true for a
genuinely-approved published version, but never trusted blindly. Each row gains:

```json
"audio": { "en": { "standard": { "url": "...", "mimeType": "audio/mpeg", "durationMs": null } } }
```

Never exposes `voiceProfileKey`, provider credential ids, or anything from a non-approved row. The
public sync route (`server/community/routes.conversation-scenarios-sync.mjs`) explicitly whitelists
its response fields and needed its own matching addition (`audio: s.audio || {}`) - the repo-layer
change alone was not sufficient (see `conversation-voice-testing.md`'s bug-fix note).

## Runtime resolver and playback (browser-side)

- **`ai-voice-output-resolver.js`** (new, tiny, pure): `window.TradeJournalAIVoiceOutputResolver
  .resolve({source, hasAudio})` -> `'PUBLISHED_AUDIO' | 'DYNAMIC_TTS' | 'TEXT_ONLY'`. `source !==
  'voice'` always resolves `TEXT_ONLY` - a typed message never autoplays audio, and the written
  reply always still renders regardless of this decision. Kept out of `chatDockView.jsx`'s own
  component body deliberately, so this one delivery decision stays independently testable.
- **`ai-conversation-matcher.js`**: `scenarioFromBundleRow()` carries `audio` through into its
  flattened scenario shape.
- **`ai-conversation-router.js`**: `route()`'s resolution object gains `audioUrl`/`audioMimeType`
  (`null` when unavailable), computed unconditionally - like `voiceReply` already is - whenever the
  matched scenario has `audio[language].standard`. `data_query` resolutions always report `null`
  (structurally excluded, matching the generation-side rule).
- **`chat-dock-core.js`**: threads `audioUrl`/`audioMimeType` through the existing
  router-integration return object - one more field next to `reply`/`voiceReply`.
- **`ai-voice-playback-controller.js`**: `enqueue(text, meta)` accepts an optional `meta.audioUrl`.
  When present and the caller supplied a `playAudioUrl` function, `processNext()` calls it
  **instead of** `speakFn(text)` - entering the exact same queue/epoch/interrupt/`onSettled`
  machinery every other entry uses, never a second, incompatible state machine.
  `onAudioStart` fires optimistically for this branch (there is no separate raw
  `output_audio_buffer.*` event a static file could ever emit). **On any `playAudioUrl` failure,
  the controller's own `.catch()` falls back to `speakFn(entry.text)` for that exact entry** - the
  text is already known, so a broken/missing published file never re-runs `/api/ai/chat`, it only
  changes *how* the already-decided reply gets spoken.
- **`aiVoiceRealtime.js`**: new exported `playAudioUrl(url)` - a **third**, dedicated `<audio>`
  element (`publishedAudioEl`, never reusing `elevenLabsAudioEl` or the WebRTC transport's own
  element), independent of a live `session` (published audio plays exactly like ElevenLabs
  playback already does, without the OpenAI transport). Resolves on a natural `ended`; **rejects**
  on a real failure (decode error, network drop, a 12s stall, a `play()` rejection) - deliberately
  the opposite settlement contract from `playElevenLabsAudio()` (which never rejects, since it has
  nothing further to fall back to at that point): this path *does* have a further fallback
  available (`PlaybackController`'s own `.catch()`), so a broken file must actually surface as a
  failure for that fallback to trigger. `interrupt()`/`teardownTransport()` are both extended to
  stop `publishedAudioStopFn` unconditionally, alongside the two they already stop - barge-in works
  identically regardless of which of the three delivery mechanisms is currently playing.
- **`chatDockView.jsx`**: `submit()`'s returned object gains `audioUrl`/`audioMimeType`, threaded
  straight from `core.sendChat()`'s own result, unconditionally (source-agnostic - the resolver,
  not this function, decides whether to use them). The `PlaybackController.create({...})` call is
  wired with `playAudioUrl: (url) => voiceRef.current.playAudioUrl(url)`, same read-fresh
  convention as the existing `speak`/`interrupt` options. The voice-only `onResult` callback (only
  ever reached for a turn `TurnCoordinator` itself always tags `source:'voice'`) calls the
  resolver once, and only enqueues `audioUrl` when it answers `PUBLISHED_AUDIO` (a missing resolver
  module degrades to the always-safe `DYNAMIC_TTS` decision, never `PUBLISHED_AUDIO` by accident).
  **A typed/text `submit()` never reaches this wiring at all** - structurally, not just via the
  resolver's own `source` check, a typed message can never end up autoplaying audio no matter what
  `result.audioUrl` contains.

## Admin UI (`public/pages/admin/app.js`, inside the Conversation Studio scenario editor)

A "Published audio" panel per relevant scenario version (the published version, when one exists,
and separately the draft version, since they are two independent `scenario_version_id` rows with
independent content hashes/staleness) - and a plain, zero-network explanation instead of any
buttons for a `data_query` scenario, matching the structural exclusion above. Per language: the
spoken text this audio would be generated from (the same voiceReply-falls-back-to-written rule the
server enforces independently), the current approved clip with a play control and a stale badge
when applicable, the latest not-yet-approved preview with Approve/Discard, and a Generate form
(credential select + searchable voice-id datalist + model select, loaded via the exact same
`/api/admin/voice-providers/voices|models?credentialId=` endpoints the Voice Providers tab's own
character cards already use - no new selection mechanism invented).

## Explicitly deferred this gate (not silently dropped)

- **Dynamic/private TTS caching of any kind.** This gate is exclusively admin-published static
  content - no shared cache for `data_query`, LLM-fallback, or any future Psychology response.
  **Confirmed: not built.**
- **A real, live ElevenLabs generation call in this session.** No live credential is configured in
  this sandboxed environment. Automated tests stub `elevenlabs.synthesize()` (mirroring the
  existing `stubElevenLabs()` convention in `tests/admin-voice-providers-contract.test.mjs`) rather
  than hitting the real API - see `conversation-voice-testing.md` for exactly what remains
  unverified and the manual checklist a human should run before relying on this in production.
- **A Voice Profile registry table** / a provider-independent adapter abstraction beyond the label
  field described above.
- **Page-aware static Voice-opening migration into Studio** - explicitly named in the brief as "the
  next coverage candidate," not this gate's job.
- **Asset cleanup/retention automation** - `archive()` exists and is manual; there is no scheduled
  job that prunes old archived rows/files.
- **Break-even financial math** - the brief marked this optional. `voice_tts_usage_events` already
  makes the raw counts (admin generations under `source:'studio_audio_generation'` vs. avoided
  runtime generations) directly measurable without fabricating a pricing model on top.

## Verification

See `docs/ai/conversation-voice-testing.md` for the full automated-test inventory, a real bug found
and fixed during this gate, and the manual real-browser/real-listening checklist (not yet
performed - no live-browser-driving tool or live ElevenLabs credential was available in this
session).
