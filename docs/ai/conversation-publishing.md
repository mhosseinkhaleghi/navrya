# Conversation Scenario Publishing & Bundle Delivery (Journey H2, Gate 2; `audio` field added in Gate 3)

How an admin's publish action in Conversation Studio actually reaches a user's browser, with no
app rebuild - the other half of `docs/ai/conversation-studio.md`'s own architecture.

## Version lifecycle

```
create()                 -> v1 draft
publish(v1)               -> v1 published
startNewRevision()         -> v2 draft (seeded from v1's published content); v1 stays live
publish(v2)                -> v2 published, v1 archived (content untouched)
rollback(target: v1)       -> v3 created (copy of v1's content), published immediately; v2 archived
archive()                  -> excluded from the public bundle regardless of publishedVersionId
```

Only one draft can exist per scenario at a time (`conversation_scenarios.draft_version_id` is a
single nullable pointer, not a set) - "Edit"/"New Revision" on an already-published scenario
creates the next draft; a scenario with no published version yet just keeps editing its v1 draft
in place. See `docs/ai/conversation-studio.md` for the full repo-method list
(`repo.conversationScenarios.*`).

## The public bundle: `GET /api/sync/conversation-scenarios`

`server/community/routes.conversation-scenarios-sync.mjs`, mounted alongside every other
`/api/sync/*` domain in `server/community/app.mjs` - real user authentication (`requireAuth()`),
**not** admin-gated (this is public application content, not user data, the same distinction
`/api/sync/patterns`'s seed defaults already draw). Unlike the pre-existing voice-provider config
precedent (`admin_voice_character_configs` -> an `/internal/*` bridge -> `pattern-ai-server.mjs`,
a *different backend process*), the real consumer here is the browser's own ChatDock - so the
applicable existing prefix is `/api/sync/*`, already proxied, already authenticated the same way
every other domain the browser fetches directly already is.

Returns `{version, updatedAt, scenarios: [...]}` - `repo.conversationScenarios
.listPublishedForBundle()` already enforces "published, non-archived only" at the query level, so
this route only shapes the response, never filters further. The row shape is deliberately minimal
(spec section 33): `id`, `scenarioKey`, `domain`, `kind`, `dataQueryRef`, `ctaActionId`,
`allowedProcesses`, `allowedSteps`, `publishedVersion`, `definition` - **no** admin metadata, no
draft content, no authoring prompts, no audit history. `version`/`updatedAt` are derived from the
max `published_at` across the returned rows - informational diagnostics only (surfaced via
`debugLastMatch().bundleVersion`); nothing in this gate uses them to drive push-based
invalidation.

**Gate 3** added one more field to this same row: `audio` - `{[language]: {standard: {url,
mimeType, durationMs}}}`, present only when an approved, hash-current audio asset exists for that
language (see `docs/ai/conversation-voice-assets.md`). This route explicitly whitelists every
field it returns - a repo-layer addition (like this one) does **not** reach the public bundle for
free; it must be added to this route's own mapping too, a real gap this gate hit and fixed (see
`docs/ai/conversation-voice-testing.md`'s bug-fix note).

## Client consumption: a small, self-contained cache, not `server-replica.js`

`server-replica.js`'s existing domains are all per-user, hydration-gated behind
`character-app.jsx`'s own boot gate, and always client-writable - none of that fits a global,
admin-owned, read-only-to-regular-users resource, and coupling it to that gate would risk delaying
first paint for a feature that must degrade to "just fall through to the LLM" on any failure.

Instead, `ai-conversation-router.js` itself owns a small bundle cache:

1. **On script load**, synchronously read `localStorage['tradejournal:conversation-scenarios-
   bundle:v1']` if present - instant, matching a real warm-reload browser. A missing/corrupt entry
   just means an empty scenario list (never a thrown error) - the safe default.
2. **`route()` calls `ensureBundleFresh()`** on every invocation - if more than 5 minutes have
   passed since the last successful fetch (or the cache came from `localStorage`, whose
   `fetchedAt` is reset to `0`, forcing one refresh attempt on first use), it fires a background
   `fetch('/api/sync/conversation-scenarios')`. This is lazy and checked at call time - never a
   polling `setInterval`.
3. **A failed fetch never throws and never clears a still-valid cache** - `route()` itself never
   awaits the network; a refresh in flight or failed is invisible to the caller. A successful
   fetch updates both the in-memory cache and `localStorage` for the next page load.

This means a publish takes effect for a given browser tab within, at most, one 5-minute window
(or immediately on the next full page load/reload) - "no rebuild needed," not "instant push."
Building a push-based invalidation channel (e.g. reusing the voice-provider Redis-version-bump
pattern) was judged unnecessary complexity for a feature whose worst-case staleness is already
bounded and low-stakes (a slightly-stale FAQ answer, never a safety-relevant one).

## Offline / fetch-failure behavior

| Situation | Behavior |
|---|---|
| No cache, fetch not yet resolved | Empty scenario list - every turn falls through to the LLM |
| No cache, fetch fails | Same as above - never a broken ChatDock, never a thrown error surfaced to the user |
| Valid cache, background refresh fails | The still-valid cache keeps serving; the failed refresh is silently retried on the next `route()` call past the 5-minute window |
| Valid cache, background refresh succeeds | Cache and `localStorage` both update; the very next `route()` call already sees the new content |

There is no separate "minimal bootstrap scenario set" - an empty scenario list already **is** the
safe bootstrap state, since every turn it doesn't resolve locally just goes through the existing,
always-available LLM path unchanged.

## Seeding

`server/db/migrations/041_conversation_scenarios.sql` seeds the original 7 Gate-1 scenarios as
real, already-published rows via plain `INSERT ... ON CONFLICT (scenario_key) DO NOTHING` -
idempotent by construction (defense-in-depth on top of the migration runner's own single-execution
tracking via `schema_migrations`). This is the **only** place scenarios are ever auto-created;
there is no browser-side auto-seed anywhere, and an admin's own edits are never at risk of being
overwritten by re-running migrations.
