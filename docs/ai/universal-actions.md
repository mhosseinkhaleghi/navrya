# Universal Copilot Actions (Journey F)

What "Universal Copilot" means in this codebase, how ASK/DO/GUIDE is actually decided, and where
the full action inventory lives. This is the map; the exhaustive per-action table is
`docs/ai/action-coverage-matrix.md` (not duplicated here - that file is the single source of truth
for which actions exist, their real target process, and why every excluded workflow was excluded).

## ASK / DO / GUIDE, as it actually works

There is no explicit three-way classifier anywhere in the code - "ASK/DO/GUIDE" is the observable
*behavior* that falls out of the existing, real mechanism (Journeys A/B, `ARCHITECTURE.md` 7.19),
not a fourth system layered on top of it:

- **DO**: the user's message resolves to exactly one Action Registry action with every
  `requiredFields` either already known or extractable from the message, and (for a gated action)
  a real, later confirmation. The workflow starts, fills the real UI live, and submits through the
  action's own `submit()` once complete.
- **ASK**: the message matches an action, but a required field - most often the exact target
  entity, per F53's "never guess" rule - is missing or ambiguous (zero or more than one name
  match). The model's reply asks for the missing piece; nothing opens or mutates until it's
  supplied.
- **GUIDE**: no action matches at all (a "how do I..." product question, or a request for
  functionality this gate deliberately excludes - see `action-safety.md`). The reply is
  conversational, drawn from Journey D's Knowledge Base or the model's own reasoning, and no
  `action` is ever returned.

All three share one code path (`chat-dock-core.js`'s `sendChat()` → `dockChatFormatFor()` in
`server/pattern-ai-server.mjs`) and one JSON schema. The server never decides ASK vs DO vs GUIDE
itself - it only ever returns `{reply, action}` (`action` null for GUIDE, `action.fields` partial
for ASK, complete for DO); the *deterministic* enforcement of "don't guess" and "don't act without
confirmation" happens entirely client-side, inside each action's own `open()`/`submit()` and inside
`ai-workflow-engine.js` - never trusted from the model's own judgment alone.

## Domains with startable actions today

Sessions, Patterns, Strategies, Trades (lifecycle: open/cancel/close/emotion-log/delete),
Scenarios/Entries (within a Session), Community (post/comment - drafting only, see below),
Marketplace (publish/rate/message seller), Messaging (compose/reply), Account/Profile, Settings
(trading defaults/language/AI provider). Each row's exact `requiredFields`, target process, and
gate field (if any) is in `action-coverage-matrix.md`'s "Existing Action Registry" table.

## What "Universal" does *not* mean

Universal means "the same runtime works the same way across every domain and every supported
language/voice channel" - it does not mean "every store method becomes a chat action." Section 1
of the Journey F gate was explicit: implement only genuine, reachable, product-backed workflows.
Concretely excluded, with reasons documented in `action-coverage-matrix.md`: Community post/comment
delete, message delete, Marketplace listing unpublish (none has a real delete/unpublish UI in the
product today - the store exposes `removePost()` but nothing calls it), and account deletion
(no such flow exists in the product at all). "Do not implement anything merely because a Store
exposes `delete()`" is the literal standing rule for any future domain added here.

## Bulk/autonomous actions are explicitly not supported

There is no "delete all my losing sessions," no batch confirmation, no action that resolves to more
than one entity. Every destructive action's `available()`/target-resolution requires an exact,
already-active or exactly-named single entity (F53) - see `action-safety.md` for the full
confirmation architecture this rests on.
