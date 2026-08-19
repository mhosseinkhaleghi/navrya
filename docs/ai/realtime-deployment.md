# Realtime Voice — Deployment (Journey E)

## Production validation status

**Not done.** Everything in this document (and every PASS in `docs/ai/voice-testing.md`) was
verified against local dev servers (`npm run dev` + `npm run dev:api`) only. This project has
previously shipped AI Copilot code to `main` while the live `tradejournal-ai` Render service
stayed on a stale build for an extended period (see the Production Repair postmortem elsewhere in
this history) - a real, prior incident, not a hypothetical. Do not assume `/api/ai/realtime/session`
works on `app.navrya.com` until it has actually been exercised there.

## Environment variables

No new required variable. `OPENAI_API_KEY` (already required for every other `/api/ai/*` route)
is the same key `mintRealtimeClientSecret()` uses to mint ephemeral Realtime credentials - see
`docs/ai/voice-architecture.md`'s "Ephemeral credentials" section for the three-tier resolution
order (per-request override → admin-configured key → this env var) and why the permanent key never
reaches the browser.

One new **optional** variable, documented in `.env.example`:

```text
OPENAI_REALTIME_MODEL   # Overrides the Realtime model used to mint client secrets.
                         # Unset -> current default (gpt-realtime-2.1, see mintRealtimeClientSecret()
                         # in server/pattern-ai-server.mjs). Not set in render.yaml; add it there
                         # (or on the tradejournal-ai service's Environment tab) only if a different
                         # Realtime model needs to be pinned in production.
```

## Routing

`POST /api/ai/realtime/session` is served by `server/pattern-ai-server.mjs` - the same file, same
process, same service as every other `/api/ai/*` route. `render.yaml`'s `tradejournal-web` static
site already rewrites the whole `/api/ai/*` prefix to the `tradejournal-ai` service
(`REPLACE_WITH_AI_SERVICE_URL/api/ai/*`, filled in during the documented first-deploy setup step);
this new endpoint falls under that existing wildcard automatically. **No new service, no new
route, no `render.yaml` change was needed or made.**

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
and needs no special allowance beyond the app's own origin already being covered. Re-verify against
whatever CSP is actually deployed once one exists; this has not been tested against a real CSP
because none exists to test against yet.

## Observability

`GET /health` (already existing, unchanged in shape apart from one addition) now also reports a
`version` field - `process.env.RENDER_GIT_COMMIT` (auto-populated by Render) truncated to 12
characters, falling back to `process.env.npm_package_version`, or `null` if neither is set. No
secrets, matches the existing `{ok, model, configured}` shape. `mintRealtimeClientSecret()` reports
through the same `reportProviderHealth()` path (`source: 'ai.voice.session'`) every other AI route
already uses - visible in the admin panel's existing per-provider health/usage view alongside
`ai.chat`, `trades.analyze`, etc., with no new admin-panel code required.

## What was NOT built

- No new Render service.
- No new CSP.
- No production smoke test of the actual deployed `/api/ai/realtime/session` endpoint.
- No load/latency testing under production network conditions (only this project's own local dev
  network, where connect times to OpenAI's Realtime API varied from under 1 second to over 100
  seconds - see `docs/ai/voice-testing.md`; production conditions have not been measured and may
  differ).
