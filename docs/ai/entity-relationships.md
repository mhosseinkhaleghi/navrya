# Entity Relationship Graph (Journey D)

The real, verified cross-entity relationships NAVRYA's own data actually has — read from the real
schema/type files and registration call sites, not invented. Each domain's own `relationships`
field in `ai-knowledge-registry.js` carries its own slice of this graph; this doc is the assembled
whole, for anyone (human or AI) trying to understand how NAVRYA's real entities connect.

```
Session
 ├─ has many → SessionEntry {id, timeframe, hasImage, scenarios[]}
 │              └─ has many → Scenario {id, title, occurred, strategy, pattern:{patternTagId, stages[], completionThreshold}}
 │                             └─ Scenario.pattern.patternTagId ──────────────→ Pattern
 │
 └─ Trade.source.{sessionId, scenarioId} ←───────────────────────────────────── Trade
                                                                                  (a Trade started from a Scenario carries
                                                                                   this back-link; a Trade started any
                                                                                   other way has source: null)

Strategy {id, name, positionManagement, riskManagement:{maxRiskPerTradePercent,
          maxConcurrentTrades,...}, overallFramework}
 ├─ has many → StrategyDetectionEvent {id, strategyId, source, predictedOutcome, status}
 ├─ Trade.linkedStrategyId ─────────────────────────────────────────────────── Trade
 │              (a Strategy's own real riskManagement numbers are exactly what
 │               ai-proactive-engine.js's Rule A checks a requested trade risk against)
 └─ can be published as → MarketplaceListing {type:'strategy', sourceId: Strategy.id}

Pattern {id, name, description, completionThreshold, stages:[{id,order,text}], usageCount}
 ├─ Trade.linkedPatternIds ─────────────────────────────────────────────────── Trade (many-to-many)
 └─ can be published as → MarketplaceListing {type:'pattern', sourceId: Pattern.id}

Trade {id, status, direction, entryPrice, stopLoss, takeProfits[], riskPercent,
       linkedStrategyId, linkedPatternIds[], source, emotionLog[]}
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

- **No `Trade.symbol`/instrument field exists** anywhere in the real `Trade` model — a Trade is
  sized and risk-managed, never tied to a specific instrument name (already documented in Journey
  B's own report; repeated here since it is a real, structural absence from this graph, not an
  oversight).
- **`reports`** (legacy Reports/All Trades/Trading Calendar) has no live entities of its own — the
  real, current app replaced it with the Dashboard's own chart panel and the Strategies Hub's
  Positions tab.
- **Community content (`CommunityPost`, `CommunityComment`, `DmMessage`) is untrusted data**, not a
  verified entity relationship the way the rest of this graph is — see `knowledge-base.md`'s own
  prompt-injection-boundary section for why it is never treated as an instruction.
