# Voice/Chat form-interview contract

Voice Mode and typed Chat operate every migrated safe, user-data form as a natural interview:
the user's answer is written into the real, visible form the instant it's supplied (unless the
user has opted into `ask_each`), fields are asked about in the form's own real display order, and
a form's own real label/options/help text is used - never invented terminology, never an LLM
guess of visual order, never brittle DOM scraping.

This is an extension of the existing AI Process Registry (`ai-process-registry.js`) and Workflow
Engine (`ai-workflow-engine.js`) - not a parallel form state, store, or submit path. See
`docs/ai/voice-ui-synchronization.md` for the base Voice-UI sync architecture this builds on, and
`docs/ai/voice-architecture.md` for the Voice transport/channel layer above it.

## The interview descriptor

A process registration (`registry.register(processId, config)`) may declare `interview: { fields:
[...] }`. Each field descriptor:

```js
{
  path,          // the real, allowlisted field path (or a gate name - see role below)
  order,         // a stable number - the form's own real display order
  label,         // the real, rendered label text (never invented terminology)
  help,          // optional real help/hint text
  type,          // 'text' | 'number' | 'choice' | 'boolean' | 'slider' | 'date' | 'action'
  options,       // for 'choice': [{value, label}], the real allowed options
  role,          // 'editable' (default) | 'resolution' | 'gate'
  visibleWhen    // optional, zero-arg function; re-evaluated on every read, never cached
}
```

- **`role: 'editable'`** - a real, writable field. Its `path` MUST also appear in the
  registration's own `allowlist` - the actual security boundary `applyValue()` already enforces.
  `visibleInterviewFields()` never surfaces an editable descriptor whose path isn't allowlisted.
- **`role: 'resolution'`** - identifies a target (e.g. an existing entity's name). Descriptive
  only; resolution has its own action-level mechanism (`open(context, initialFields)`) and is
  never itself an interview-asked field.
- **`role: 'gate'`** - a final action confirmation/start signal (e.g. `save`, `seal`,
  `setupComplete`). Deliberately exempt from the allowlist check - a gate is never written to a
  real form control, only ever consulted by the action's own `submit()`.
- **`visibleWhen`** - a live closure over the same render's own state the registration itself
  closes over (e.g. `() => man.kind === 'personal'`), so a discriminator change (Account kind
  Prop/Personal) is reflected on the very next read, never a one-time snapshot.

`ai-process-registry.js` exposes:

- `visibleInterviewFields(processId)` - every currently visible field descriptor, sorted by
  `order`, subject to the allowlist/role boundary above.
- `interviewFieldMeta(processId, path)` - metadata for exactly one field.
- `isFieldWritable(processId, path)` - plain allowlist membership (used to decide whether a field
  write is even eligible for `ask_each` gating - a resolution-only field never reaches
  `applyValue()` either way, so there is nothing to confirm/decline about it).
- `hasInterview(processId)` - whether a registration declared any interview metadata at all.

## Deterministic next-question order

`chat-dock-core.js`'s `sendChat()` computes `activeProcess.nextQuestion` every turn: the first
visible interview field with no known answer yet, in `order`. This is sent to the server
(`server/pattern-ai-server.mjs`), which instructs the model to ask specifically about that field,
using its real label/options, and to set `nextFieldPath` to it - the existing `prepareForPath()`
mechanism (`docs/ai/voice-ui-synchronization.md`'s "Forward-looking step synchronization") then
moves the real wizard step there before the question is ever shown/spoken. The model still
produces the natural-language wording; the ORDER and FIELD IDENTITY are decided deterministically,
client-side, from the same field definitions the human UI itself renders - never an LLM guess.

## Field-write confirmation preference

Per-user, persisted on the existing companion-state document
(`public/pages/shared/ai-companion-profile.js`): `formWriteConfirmation: 'direct' | 'ask_each'`,
default `'direct'`.

- **`direct`** (default): a valid, supplied field value is applied immediately through the real
  setter (`ai-process-registry.js`'s `applyValue()`), exactly like every pre-existing field write.
- **`ask_each`**: `ai-workflow-engine.js`'s `applyKnownFields()` stages an ordinary field write as
  a **pending candidate** (`{workflowId, actionId, processId, path, value, mode, uiSnapshot,
  expiresAt}`) instead of applying it - `current.known` is left untouched, so the field stays
  genuinely unanswered until explicitly confirmed. `chat-dock-core.js`'s own deterministic fast
  path (mirroring the existing F37 gate-confirmation fast path) resolves it from the RAW user
  text via `ai-proactive-engine.js`'s `interpretConfirmationText()` - a model-supplied `confirm`
  claim is never consulted; there is no such channel for an ordinary field write to begin with.
  Anything other than an unambiguous confirm (reject, a correction, a new topic, a stale/
  diverged/expired candidate) discards it and falls through to ordinary processing of that turn's
  own text.
- Never applies to an action's own `gateField` (a destructive/publish/send/save confirmation keeps
  its own, separate, unweakened policy) or to a resolution-only field.
- Toggled by a deterministic, anchored en/fa/ar/es phrase classifier
  (`interpretFormWriteConfirmationText()`), recognized by `chat-dock-core.js` before any AI call.

**The enforcement is deterministic and client-side.** `server/pattern-ai-server.mjs`'s prompt text
is phrasing guidance only (how to phrase the current turn's reply); it is never itself the
security/workflow control.

## Coverage manifest

`docs/ai/form-interview-coverage.mjs` classifies every real `registry.register(...)` call site in
`navrya-src/` as `interviewable` (declares real `interview.fields`), `excluded` (payment/
credential/admin, or a destructive-only/empty-allowlist context marker - never Voice-fillable by
design), or `pending` (a real, already-fillable form not yet migrated to canonical interview
metadata - an honest, acknowledged gap, not a silent exclusion).
`tests/form-interview-coverage-manifest.test.mjs` fails when a real registration has no manifest
entry at all, or when an `interviewable` entry's own real source does not actually declare
`interview.fields` - so a future fillable form joining the app without being classified fails the
suite, by design.

## Known, honestly-recorded gaps

- Only `mh-intake`, `account-manual-form`, and `session-ai-analysis-form` are fully migrated to
  canonical interview metadata as of this pass. Every other pre-existing fillable form keeps its
  original live field-sync behavior (Voice can still fill it field-by-field) but does not yet
  carry deterministic display-order/label metadata - see the manifest's own `pending` entries.
- `analysisSymbols` (the Free-plan "1 active analysis symbol" entitlement,
  `server/commercial/quota.mjs`) has no real client-side UI feature that claims/tracks an active
  symbol as of this pass (confirmed via repository audit - `server/community/routes.analysis-
  symbols.mjs`'s own header comment already recorded this as unimplemented client-side). The
  subscription-limit preflight (`chat-dock-core.js`'s `planLimitPreflight()`) is real and wired for
  `sessions` (via `session.create`'s `quotaResourceType: 'sessions'`); a symbol-alias
  canonicalization step for `analysisSymbols` was deliberately not built, since there is no real
  feature to attach it to - building one would be inventing new product behavior, which this task
  explicitly forbids.
