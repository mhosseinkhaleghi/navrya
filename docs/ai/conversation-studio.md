# Conversation Studio (Journey H2, Gate 2; voice assets added in Gate 3)

The admin-only authoring system for the Deterministic Conversation Router
(`docs/ai/conversation-router.md`). An admin can create, edit, test, publish, and roll back a
multilingual conversation scenario with **zero app rebuild** - the production Router picks up a
newly published scenario the next time its bundle cache refreshes (at most 5 minutes, or
immediately on a fresh page load). Gate 3 (`docs/ai/conversation-voice-assets.md`) added a
per-language, per-version "Published audio" panel to this same editor for generating, listening to,
approving, and archiving pre-generated speech for a scenario's response.

## Responsibility boundary

**Code owns**: safety, permissions/authorization, current app state (page/surface/active
workflow), the Action Registry, actual data queries (`ai-conversation-router.js`'s
`DATA_QUERY_RESOLVERS`), business rules, destructive confirmations, and the matching algorithm
itself (`ai-conversation-matcher.js`).

**Conversation Studio owns**: scenario metadata (key/domain/kind), multilingual trigger data
(concept groups/strong phrases/negative phrases), response wording (written + spoken), a CTA
action *reference* (never execution), and publish/version state. An admin can retune wording and
triggers at runtime; nothing authored here can execute arbitrary code, invent a new data source,
or change what a CTA reference actually does when (in a later gate) something finally calls it.

## Data model

Two tables (`server/db/migrations/041_conversation_scenarios.sql`):

- `conversation_scenarios` - the stable identity. `scenario_key` (e.g. `session.purpose`) is
  unique and immutable after creation - other systems (tests, future Voice audio assets, CTA
  metadata) reference it, never a version-specific id. `kind` is `faq` | `data_query` |
  `surface_help`. `published_version_id`/`draft_version_id` are nullable pointers into the
  versions table (only one draft can exist at a time, enforced by there being only one pointer).
  `allowed_processes`/`allowed_steps` (JSONB arrays) are `surface_help`-only: process-id *prefix*
  matches (e.g. `["strategy-editor-"]`) and an optional step filter.
- `conversation_scenario_versions` - one row per version. `status` is `draft` | `published` |
  `archived`. The entire authored content - `languages`, `responses`, and an optional
  `testCorpus` - lives in one `definition` JSONB column, since nothing server-side queries into an
  individual trigger phrase.

**Publishing a draft archives whatever was previously published** (status flips, content
untouched) - this is what makes "the old version remains unchanged" and rollback both trivially
true with no special-cased logic. **Rollback is never an in-place mutation of a past version** -
it copies the target version's content into a brand-new draft and immediately publishes it,
reusing the exact same publish path (and its full validation gate) rather than a separate,
less-tested "restore" code path.

The two tables have a genuine circular FK dependency (a scenario's `draft_version_id` points at a
version that references that same scenario) - resolved with `DEFERRABLE INITIALLY DEFERRED`
constraints, the standard Postgres technique, so `create()` can insert both rows in one
transaction.

## The one architecture decision this gate hinges on: one matching implementation

The brief's own repeated requirement: the admin Trigger Lab tester and server-side publish
validation must never reimplement matching separately from what production actually runs.

`ai-conversation-matcher.js` (`public/pages/shared/`) is a pure, dependency-free file - no
`window.TradeJournalAII18n`/`TradeJournalTradeStore`/`TradeJournalAISurfaceContext` - exporting
`normalize()`, `matchScenarios()`, `scenarioFromBundleRow()`, `renderTemplate()`, and
`templateVariablesIn()`. The browser Router loads it as a normal `<script>` tag. Server-side,
`server/community/conversation-matcher-bridge.mjs` loads the **exact same source file** via
`vm.runInNewContext` - the identical technique this repo's own test suite already uses hundreds
of times to run browser scripts under Node - so there is no second implementation to drift,
byte-for-byte, not just "kept in sync by a test" (the weaker `profile-xp-rules.js`/`xp-rules.mjs`
precedent, acceptable there only for a handful of flat constants).

## Admin API (`server/admin/routes.conversation-scenarios.mjs`)

Mounted at `/api/admin/conversation-scenarios` inside `routes.mjs`, inheriting `requireAdmin()`
for free from the outer `/api/admin` mount (the same pattern `voice-providers`/`commercial`
already use) - no per-route auth wiring needed.

| Route | Purpose |
|---|---|
| `GET /` | Library list (summary rows, incl. per-language coverage: `complete`/`partial`/`none`) |
| `GET /:id` | Full detail: scenario + draft/published versions + version history |
| `POST /` | Create (v1 draft) |
| `PATCH /:id` | Scenario-level metadata only (`domain`/`ctaActionId`/`allowedProcesses`/`allowedSteps`) - never `scenarioKey`/`kind` |
| `PATCH /:id/draft` | Merge-patch the current draft's `definition` |
| `POST /:id/revision` | Start a new draft, seeded from the currently published content |
| `POST /:id/publish` | Runs the full quality gate (below), then publishes |
| `POST /:id/rollback` | Copy target version's content into a new draft, publish it |
| `POST /:id/archive` / `/unarchive` | Exclude/re-include from the public bundle |
| `POST /:id/test` | Trigger Lab: one utterance through the shared matcher, draft substituted for this scenario's own entry, against every other **published** scenario |
| `POST /:id/test-batch` | Runs the draft's own stored `testCorpus.positive`/`.negative` |
| `GET /:id/collisions` | Checks the draft's own strong phrases + positive corpus against every other published scenario |

Every mutating route calls the existing `audit()` helper with scenario id/version metadata only -
never the full `definition` body (no response text, no trigger phrases in the audit log).

### Publish-time quality gate

`POST /:id/publish` blocks (`422`, `{error, errors, warnings}`) on real errors, never on the
client-side UI's own say-so:

- No language has real trigger groups at all.
- `ctaActionId` isn't in the static safe allowlist (`session.create`, `trade.calculator`,
  `pattern.create`, `strategy.create`, `navigate.to`).
- A response references a `{variable}` the scenario's own kind/resolver doesn't actually provide
  (derived from the real text via `templateVariablesIn()`, never an author-declared list).
- A `testCorpus.positive` example resolves HIGH-confidence to a **different** published scenario
  (checked by literally running it through the shared matcher against the real published set).
- A `testCorpus.negative` example still resolves HIGH-confidence to **this** scenario.

A language with triggers but no response is a **warning**, not a blocker - genuine partial
language coverage is expected and supported (the Router's own "no response for this language ->
fall through" rule handles it safely at runtime).

## Admin UI (`public/pages/admin/app.js`, "Conversation Studio" tab)

Library (search/status/domain via `GET /`) -> click a scenario -> Editor: metadata, a CTA
dropdown, per-language sections (concept groups / strong phrases / negative phrases / written
response / spoken response - each a labeled multi-line field, never a raw JSON blob), a test
corpus (positive/negative examples), version history with Publish/New Revision/Rollback/Archive
buttons, and an inline Trigger Lab (test one utterance, run the stored corpus, check collisions).

**Honest simplification**: trigger authoring uses one line per item (concept groups: one group
per line, alternatives separated by `|`) rather than individual add/remove-button rows per term.
This is plain, labeled text fields rather than a raw JSON textarea (satisfying the brief's own
"not a raw-JSON default workflow" instruction) but is less polished than a fully interactive
per-term editor - a reasonable trade for this gate's scope, easy to upgrade later without any
data-model change.

## Explicitly deferred this gate (see `conversation-router.md`'s own list too)

- **Authoring-AI draft generation**: real cross-service complexity - an admin-only AI call would
  need to run through `pattern-ai-server.mjs` (the only place with provider/key resolution) with
  an admin-role check that gateway doesn't currently perform for any endpoint. The core acceptance
  test for this gate does not require it.
- **Response variant selection logic**: the `definition` schema and admin UI both support multiple
  named variants conceptually, but this gate's editor only authors one response per language
  (the "default" variant) - no selection heuristic exists yet.
- **Voice audio/TTS, ElevenLabs preview**: built in Gate 3 - see
  `docs/ai/conversation-voice-assets.md`. A "Published audio" panel now lives inside this same
  scenario editor, per language, for both the published and draft versions.
- **CTA execution**: `ctaActionId` is authored, validated, and carried through in the Router's
  `route()` return value as inert metadata - nothing calls it yet (Gate 4).
