# Entity Relationship Graph (Journey D)

The real, verified cross-entity relationships NAVRYA's own data actually has — read from the real
schema/type files and registration call sites, not invented. Each domain's own `relationships`
field in `ai-knowledge-registry.js` carries its own slice of this graph; this doc is the assembled
whole, for anyone (human or AI) trying to understand how NAVRYA's real entities connect.

```
InstrumentCatalogEntry {id, code, displayName}  (user-owned; code is unique per user after normalization)
 ├─ Session.instrument ──────────────────────────────────────────────────────── one exact code, or null (unclassified)
 ├─ Trade.instrument ─────────────────────────────────────────────────────────── one exact code, or null (unclassified)
 └─ Pattern.instruments[] ───────────────────────────────────────────────────── zero or more exact codes ([] = unassigned/legacy)
    (a code is only ever added explicitly through an InstrumentPicker - never inferred from a
     name, city, or market; two entities are only ever compared/matched/reported on together when
     their instrument is exactly equal - market/city is never a substitute)

Session {id, name, market, instrument, timeframe, date, status, entries[]}
 ├─ has many → SessionEntry {id, timeframe, hasImage, scenarios[]}
 │              └─ has many → Scenario {id, title, occurred, strategy, pattern:{patternTagId, stages[], completionThreshold}}
 │                             └─ Scenario.pattern.patternTagId ──────────────→ Pattern (only a Pattern whose
 │                                                                                instruments include this Session's own instrument)
 ├─ has one (derived, server-side) → SessionSignature {id, sessionId, character, market, instrument,
 │              timeframe, date, movementSequence[], patternIds[], strategyIds[], scenarioOutcomes[],
 │              tradeSummary, fateSummaryText} - the real record session-signature-engine.js compares
 │              sessions by; instrument equality is a hard eligibility gate (fail closed - a signature
 │              or live session with no instrument never matches anything), market/city is only ever a
 │              secondary score component
 │
 └─ Trade.source.{sessionId, scenarioId} ←───────────────────────────────────── Trade
                                                                                  (a Trade started from a Scenario carries
                                                                                   this back-link and MUST share that
                                                                                   Session's own instrument - the server
                                                                                   rejects a mismatch; a Trade started any
                                                                                   other way has source: null)

Strategy {id, name, positionManagement, riskManagement:{maxRiskPerTradePercent,
          maxConcurrentTrades,...}, overallFramework}
 ├─ has many → StrategyDetectionEvent {id, strategyId, source, predictedOutcome, status}
 ├─ Trade.linkedStrategyId ─────────────────────────────────────────────────── Trade
 │              (a Strategy's own real riskManagement numbers are exactly what
 │               ai-proactive-engine.js's Rule A checks a requested trade risk against)
 └─ can be published as → MarketplaceListing {type:'strategy', sourceId: Strategy.id}

Pattern {id, name, description, completionThreshold, instruments[], stages:[{id,order,text}], usageCount}
 ├─ Trade.linkedPatternIds ─────────────────────────────────────────────────── Trade (many-to-many, only
 │                                                                              among Patterns sharing the Trade's instrument)
 └─ can be published as → MarketplaceListing {type:'pattern', sourceId: Pattern.id}

Trade {id, status, direction, instrument, entryPrice, stopLoss, takeProfits[], riskPercent,
       linkedStrategyId, linkedPatternIds[], accountId, source, emotionLog[]}
 └─ Trade.emotionLog ────────────────────────────────────────────────────────→ feeds the
                                                                                 Psychology domain's
                                                                                 tag mirror (never the
                                                                                 reverse - Psychology
                                                                                 never writes a Trade)

MarketplaceListing {type: pattern|strategy, sourceId, priceAmount}
 ├─ MarketplaceListing.sourceId ────────────────────────────────────────────── the seller's own Strategy or Pattern
 ├─ has → MarketplacePurchase (mock: true - explicit, disclosed payment mock, real DB row otherwise)
 │         └─ surfaces in the buyer's own Account Profile "subscriptions" view
 └─ DmThread.listingId ─────────────────────────────────────────────────────── a message thread about this listing

TradingMentalHealthProfile {intake, continuousTracking, redFlags:{active[],resolved[]}, ...}
 └─ reads Trade.emotionLog + Session pre-session check-ins as real evidence (read-only; this
     profile is never a source of automatic Trade/Session field values)

AccountProfile {displayName, email, profileRole, kycStatus, xpTotal, level}
 ├─ has many → XpEvent {type, points, occurredAt}   (also the Character domain's own XP ledger - one real ledger, two views onto it)
 └─ has many → Achievement {achievementKey, unlockedAt, evidence}
```

## What this graph is used for

- **`ai-user-memory.js`** (LAYER B) walks exactly these real links when resolving "this session" /
  "this pattern" / "this strategy" / "this trade" — always by real id or a real name match, never a
  bulk dump, never a guessed default.
- **Cross-domain product questions** ("How do Sessions, Patterns, Strategies and Trades connect?")
  are answered from this same real structure via `ai-knowledge-registry.js`'s own `relationships`
  fields — never a model-invented explanation of how NAVRYA's data model works.
- **Deliberately not used for prediction**: nothing here feeds `ai-proactive-engine.js`'s rules
  beyond the one real link that rule set already used before Journey D
  (`Trade.linkedStrategyId → Strategy.riskManagement`) — the Knowledge Base adds *understanding*
  of the graph, never a new source of deterministic proactive rules (see `knowledge-base.md`'s own
  "Knowledge Base is not a second rule engine" section).

## Known real gaps in this graph (not silently omitted)

- **A record created before the Instrument Catalog domain shipped has no instrument** — `Session.
  instrument`/`Trade.instrument` are `null` and `Pattern.instruments` is `[]` for anything that
  predates this domain, or that a user has deliberately left unclassified. Such a record stays
  fully viewable, but is excluded from similarity, pattern selection, and any instrument-scoped
  report until it is explicitly classified — never defaulted or guessed onto a real instrument.
- **`reports`** (legacy Reports/All Trades/Trading Calendar) has no live entities of its own — the
  real, current app replaced it with the Dashboard's own chart panel and the Strategies Hub's
  Positions tab.
- **Community content (`CommunityPost`, `CommunityComment`, `DmMessage`) is untrusted data**, not a
  verified entity relationship the way the rest of this graph is — see `knowledge-base.md`'s own
  prompt-injection-boundary section for why it is never treated as an instruction.
