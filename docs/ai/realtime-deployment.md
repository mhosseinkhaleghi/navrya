# Realtime Voice — Deployment (Journey E)

## fix/voice-mode-hosted-connection (current) — same-origin SDP relay

**This section is the current, correct state of this document. Everything below "Production
validation status" through "Routing" describes an earlier, Render-era deployment topology that no
longer matches this repository (production now deploys via `docker-compose.production.yml` + Caddy
over SSH, per `.github/workflows/deploy.yml` - not Render) and, separately, described a request
flow this pass changed. It is left in place per this repository's own established convention of
appending corrections rather than rewriting history (see `ARCHITECTURE.md`'s Known Constraints
section for the same pattern) - do not follow the Render-specific instructions below.**

### The bug this fixed

`navrya-src/aiVoiceRealtime.js` constructed `OpenAIRealtimeWebRTC` with no `baseUrl` option. The
installed `@openai/agents-realtime` SDK's own constructor
(`node_modules/@openai/agents-realtime/dist/openaiRealtimeWebRtc.mjs`) defaults to POSTing the
browser's SDP offer **directly** to `https://api.openai.com/v1/realtime/calls` whenever `baseUrl`
is omitted. In production, that direct browser→OpenAI request failed with Chromium
`net::ERR_FAILED` - no HTTP response, no remote SDP answer - even though the server-to-server
ephemeral-credential mint (`POST /api/ai/realtime/session`) worked correctly every time. The UI
also hid the real failure behind one generic `VOICE_SESSION_REQUEST_FAILED` message regardless of
which stage actually failed. See `docs/ai/voice-mode-performance-gap-matrix.md`'s own CORRECTION
section for the full original-misdiagnosis writeup (an earlier pass wrongly attributed the same
symptom to a sandbox-only network restriction).

### Before / after request flow

```text
BEFORE (broken in production):
  Browser --POST ephemeral-session request--> NAVRYA (/api/ai/realtime/session) --> OpenAI (mint)
  Browser --POST SDP offer (Bearer ek_...)---------------------------------------> OpenAI (/v1/realtime/calls)
                                                    ^^^ direct browser->OpenAI, fails in production

AFTER (fixed):
  Browser --POST ephemeral-session request--> NAVRYA (/api/ai/realtime/session) --> OpenAI (mint)
  Browser --POST SDP offer (Bearer ek_...)---> NAVRYA (/api/ai/realtime/call)   --> OpenAI (/v1/realtime/calls)
                                                    ^^^ same-origin from the browser's point of view
```

The browser now only ever talks to its own origin for both the ephemeral-credential mint and the
SDP exchange. `POST /api/ai/realtime/call` (`server/pattern-ai-server.mjs`'s
`handleRealtimeCallRelay`) is a narrow, single-purpose relay - the upstream URL
(`https://api.openai.com/v1/realtime/calls`) is a hardcoded constant, never derived from any
request input, and it is not a general-purpose proxy. It:

1. requires a real, non-suspended NAVRYA session (the same cookie every other `/api/ai/*` route
   requires) - checked before anything else, including before reading the SDP body;
2. requires `Content-Type: application/sdp` and an `Authorization: Bearer ek_...` header (a
   standard `sk-` key, or anything not shaped like an ephemeral credential, is rejected identically
   to a missing header - never a more specific error that would help calibrate an attack);
3. verifies the bearer is a credential **this server minted for this exact user**, via a
   Redis-backed (in-memory in dev/test), single-use lease keyed by the SHA-256 hash of the token
   (`server/community/security/realtime-lease-store.mjs`) - never the raw token stored anywhere.
   `POST /api/ai/realtime/session` writes the lease at mint time; the relay atomically
   reads-and-deletes it (a real Redis `GET`+`DEL` via one `EVAL`, sharing the exact same Redis
   connection `resolveRateLimitStore()` already uses - no second Redis client per process) so a
   captured/replayed token, or two concurrent requests racing the same lease, can never both
   succeed;
4. reads the SDP body through a dedicated ~64 KiB-bounded raw reader - never the general 100 MB
   JSON body reader every other `/api/ai/*` route uses;
5. forwards only a freshly-constructed `Content-Type`/`Authorization` header pair and the raw SDP
   bytes upstream, with a bounded timeout and `redirect: 'manual'` (an upstream 3xx is never
   followed);
6. returns the upstream's `application/sdp` body, status, `Content-Type`, and `Location` header
   (the installed SDK reads `Location` for its own `callId`) with `Cache-Control: no-store`; an
   upstream error is mapped to one of a small set of sanitized codes
   (`REALTIME_UPSTREAM_UNAUTHORIZED`/`_RATE_LIMITED`/`_UNAVAILABLE`/`_ERROR`,
   `REALTIME_RELAY_TIMEOUT`/`_FAILED`) - the raw upstream body is never returned or logged.

**The route intentionally does not go through `checkBasicAuth()`** (the preview-deploy shared
password gate every other route in this file still requires unchanged). The installed SDK sends
this exact request's `Authorization` header as `Bearer ek_...` - it can never simultaneously carry
`Basic` credentials, since the two schemes are mutually exclusive on one header. This route is not
weaker for the carve-out: it requires a verified session cookie *and* a single-use, server-bound
lease, a strictly narrower admission than the one shared password every other route still enforces.

Quota is charged once, at mint time (`POST /api/ai/realtime/session`, the existing
`checkAiQuota()`) - the relay call is part of the same connection attempt and deliberately does
not charge quota a second time.

### Diagnostic decision tree

`navrya-src/aiVoiceRealtime.js`'s `connect()` now classifies a connection failure into one of
twelve sanitized stages (`classifyMintFailureStage`/`classifySdpFailureStage`), surfaced through
`onError({code, stage})` and localized in `public/pages/shared/ai-i18n.js`
(`VOICE_ERROR_STAGE_I18N_KEY` in `navrya-src/chatDockView.jsx`) - never a raw error message,
credential, or upstream body reaches the UI. Use this table to classify a real failure server-side
before changing any code (the same classification this pass used for its own Phase 1):

| Observed server-side result | Meaning | Client-visible stage |
|---|---|---|
| `POST /api/ai/realtime/session` → 401 `AUTH_SESSION_REQUIRED`/`ACCOUNT_SUSPENDED` | App auth/session-cookie problem | `session_auth` |
| `POST /api/ai/realtime/session` → 429 | NAVRYA's own AI-quota ceiling (`AI_QUOTA_PER_USER_PER_HOUR`/`_GLOBAL_`) | `session_quota` |
| `POST /api/ai/realtime/session` → 500/503 with `OPENAI_API_KEY_MISSING` (or `REALTIME_LEASE_STORE_FAILED`) | No server-funded/admin-configured key resolved, or the lease store itself is unreachable | `key_missing` |
| `POST /api/ai/realtime/session` → error `REALTIME_TOKEN_FAILED_401` or `_403` | Invalid/revoked key, project access, model access, or billing | `key_rejected` |
| `POST /api/ai/realtime/session` → error `REALTIME_TOKEN_FAILED_*` mentioning the model | Model not available to this key/project | `model_unavailable` |
| `POST /api/ai/realtime/session` hangs past `CONNECT_TIMEOUT_MS` | Slow/unreachable OpenAI mint endpoint, or a slow network to NAVRYA itself | `token_mint_timeout` |
| `POST /api/ai/realtime/call` → non-2xx (`REALTIME_UPSTREAM_*`) or the browser never gets a Location/callId back | The same-origin relay itself failed the SDP exchange | `sdp_exchange` |
| `POST /api/ai/realtime/call` never responds before the shared deadline | The relay (or its own bounded upstream call) hung | `sdp_relay_timeout` |
| Relay succeeded (real `callId`/Location) but the data channel never opens | ICE/media negotiation itself failed after signaling succeeded - **this is a genuinely different failure class than the SDP relay; do not conflate the two, and do not "fix" it by widening the relay** | `ice_connection` |
| `callId` present, a data channel exists but is not `open` | A data-channel-specific failure after ICE-level connectivity | `data_channel` |
| Everything above succeeded but the session never acknowledged config | A rare edge case worth its own diagnosis, not a wider timeout | `session_ack` |
| `getUserMedia()` denied or never answered | Microphone permission | `microphone_permission` |

Server-side, `GET /health`'s `realtimeConfigured` field (env-key-only, never a network call) is the
cheap first check for "is a server-funded key even configured on this instance" - see
`docs/ai/realtime-deployment.md`'s Observability section below.

### Post-deploy Realtime canary

`node scripts/realtime-canary.mjs --base-url=https://app.navrya.com --email=<address>
--password=<password> [--register]` - a safe, non-destructive, real-HTTP check against a real
deployment: authenticates with a real (ideally throwaway, `--register`-created) account, mints a
real ephemeral credential (proving the full `session_auth → quota → OpenAI mint` chain), and
verifies the relay endpoint's own auth/content-type/lease checks (anonymous rejection, wrong
content type, an unminted/forged bearer) **without ever forwarding the real minted token to
OpenAI** - so it never spends real API quota/cost and can run safely on every deploy. A PASS proves
the deployed relay route is live and enforces auth correctly; it does not and cannot prove
ICE/media/`LISTENING` - only a real browser with a real microphone can prove that (see "What was
NOT built" below).

## Production validation status

**Not fully done.** The specific, evidenced production failure (direct browser→OpenAI SDP POST,
the hidden generic error message, the missing `OPENAI_REALTIME_MODEL` pass-through) is fixed and
covered by automated tests (`tests/realtime-call-relay.test.mjs`,
`tests/realtime-lease-store.test.mjs`, `tests/voice-relay-bundle.test.mjs`, plus updated
static-source coverage in `tests/ai-voice-realtime-adapter.test.mjs`/`ai-voice-chatdock-ux.test.mjs`)
and by real-browser confirmation that the SDP request now goes only to the same-origin relay (see
this pass's own final report for what was and was not verified). **No real OpenAI API key was
available in the environment this fix was built in**, so the full authenticated,
real-microphone, real-OpenAI-upstream walkthrough to `LISTENING` (Phase 6 of the fix's own brief)
has not been run. This project has previously shipped AI Copilot code to production while a
service silently stayed on a stale build (see the Production Repair postmortem elsewhere in this
history, and `tests/voice-relay-bundle.test.mjs`'s own header comment) - do not assume Voice Mode
fully works on `app.navrya.com` until the post-deploy canary above AND a real authenticated
browser session with a real microphone have both been exercised there.

## Environment variables

No new required variable. `OPENAI_API_KEY` (already required for every other `/api/ai/*` route)
is the same key `mintRealtimeClientSecret()` uses to mint ephemeral Realtime credentials - see
`docs/ai/voice-architecture.md`'s "Ephemeral credentials" section for the three-tier resolution
order (per-request override → admin-configured key → this env var) and why the permanent key never
reaches the browser.

One new **optional** variable, documented in `.env.example` and (as of
`fix/voice-mode-hosted-connection`) `.env.production.example`, and passed through in
`docker-compose.production.yml`'s `pattern-ai` service (it was previously missing there entirely -
harmless, since `mintRealtimeClientSecret()` already falls back to a hardcoded default, but with no
way to override it in production without a code change):

```text
OPENAI_REALTIME_MODEL   # Overrides the Realtime model used to mint client secrets.
                         # Unset -> current default (gpt-realtime-2.1, see mintRealtimeClientSecret()
                         # in server/pattern-ai-server.mjs).
```

`REDIS_URL` and `INTERNAL_API_SECRET` (both already required in production by
`server/pattern-ai-server.mjs`'s own startup check) are now also load-bearing for Voice Mode
specifically - the same-origin relay's ephemeral-credential lease store requires a real, shared
Redis instance to work correctly across multiple `pattern-ai` replicas (see
`server/community/security/realtime-lease-store.mjs`).

## Routing (superseded by the Caddy/docker-compose topology above)

**This section describes the old Render-era deployment and does not apply to the current
`docker-compose.production.yml` + Caddy topology - see the top of this document instead.** For the
historical record: `POST /api/ai/realtime/session` is served by `server/pattern-ai-server.mjs` -
the same file, same process, same service as every other `/api/ai/*` route. `render.yaml`'s
`tradejournal-web` static site rewrote the whole `/api/ai/*` prefix to the `tradejournal-ai`
service; this endpoint fell under that existing wildcard automatically. In the current topology,
`deploy/Caddyfile`'s `navrya_api` snippet already routes the entire `/api/ai/*` prefix (among
others) to the `pattern-ai` service - `POST /api/ai/realtime/call` falls under that same existing
wildcard too. **No Caddy config change was needed or made for this new route.**

## HTTPS

`getUserMedia()` (the browser mic-capture API the voice adapter calls) requires a secure context -
HTTPS or `localhost`. Already true for `app.navrya.com` and for local dev (`http://localhost:5173`
is treated as a secure context by browsers specifically for local development). No action needed,
but worth stating explicitly: voice will not work at all if the app is ever reachable over plain
HTTP on a non-localhost host.

## CSP

This project has no `Content-Security-Policy` header or `<meta>` tag configured anywhere today
(confirmed by repository search - not a Journey E gap, a pre-existing state). If one is added in
the future, note for whoever adds it: WebRTC's own ICE/media negotiation path (the actual audio
transport to OpenAI's Realtime servers) is governed by `connect-src` in some browsers for the
signaling piece but the media path itself is largely outside `fetch`/`XHR` CSP directives - the
ephemeral-credential *request* itself (`POST /api/ai/realtime/session`) is a same-origin `fetch`
and needs no special allowance beyond the app's own origin already being covered. **As of
`fix/voice-mode-hosted-connection`, the SDP exchange itself (`POST /api/ai/realtime/call`) is ALSO
a same-origin `fetch`** - if a CSP is ever added, neither AI-Voice-related network call needs a
`connect-src` allowance for `api.openai.com` from the browser's own perspective any more (the
server, not the browser, now talks to OpenAI for the SDP exchange). Re-verify against whatever CSP
is actually deployed once one exists; this has not been tested against a real CSP because none
exists to test against yet.

## Observability

`GET /health` (already existing, unchanged in shape apart from one addition) now also reports a
`version` field - `process.env.RENDER_GIT_COMMIT` (auto-populated by Render, harmless and simply
absent on the current docker-compose topology) truncated to 12 characters, falling back to
`process.env.npm_package_version`, or `null` if neither is set. No secrets, matches the existing
`{ok, model, configured}` shape. As of `fix/voice-mode-hosted-connection`, `/health` also reports
`realtimeConfigured` (Boolean(`process.env.OPENAI_API_KEY`) - the same env-only limitation
`configured` already has; a `true`/admin-configured/BYOK key each independently make Voice Mode
work but are not reflected here, since checking either would need a network call this generic
liveness check deliberately never makes). `mintRealtimeClientSecret()` reports through the same
`reportProviderHealth()` path (`source: 'ai.voice.session'`) every other AI route already uses;
the new relay (`handleRealtimeCallRelay`) reports its own outcomes under `source: 'ai.voice.relay'`
- both visible in the admin panel's existing per-provider health/usage view alongside `ai.chat`,
`trades.analyze`, etc., with no new admin-panel code required.

## What was NOT built

- No new Render service (this deployment no longer uses Render at all - see the top of this
  document).
- No new CSP.
- **No real, authenticated, real-microphone, real-OpenAI-upstream browser walkthrough to
  `LISTENING`** - no OpenAI API key was available in the environment `fix/voice-mode-hosted-connection`
  was built in. What WAS verified: the specific evidenced bug (direct browser→OpenAI SDP POST) is
  fixed and automated-tested at the HTTP/behavioral level, and a real browser was used to confirm
  the SDP request now targets only the same-origin relay endpoint (see that fix's own final
  report for exactly what was and was not run).
- No load/latency testing under production network conditions (only this project's own local dev
  network, where connect times to OpenAI's Realtime API varied from under 1 second to over 100
  seconds - see `docs/ai/voice-testing.md`; production conditions have not been measured and may
  differ). The relay's own `REALTIME_RELAY_TIMEOUT_MS` (10s, server/pattern-ai-server.mjs) has not
  been tuned against real production latency to OpenAI - it is a reasonable starting bound, not a
  measured one.
- No per-owner rate limiting on the relay endpoint beyond the existing per-mint AI quota and the
  lease's own single-use/short-TTL binding - considered sufficient given every relay attempt
  requires a real, already-quota-charged, already-authenticated mint first, but not independently
  load-tested against a malicious high-volume caller.
