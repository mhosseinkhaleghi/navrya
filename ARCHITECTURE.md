# NAVRYA Architecture

## 1. Overview

NAVRYA is a local-first trading journal and scenario-planning interface. A user selects one of four gamified trading characters, then works inside a character-themed dashboard to create market sessions, register price patterns, document strategy rules, plan and log trades, track emotions, and review reports. The application prioritizes preserving the four existing dashboard designs while sharing the same behavior and stored data across them.

### Technology stack

| Area | Actual implementation |
|---|---|
| Shell | React 18.3.1 and ReactDOM 18.3.1 |
| Build/dev server | Vite 5.4.10 with `@vitejs/plugin-react` |
| Dashboard runtime | Static HTML/CSS plus classic browser JavaScript IIFEs and DOM APIs |
| Language | JavaScript with JSDoc typedefs; no TypeScript compiler |
| Icons | Locally vendored Lucide build, upgraded through `icon-system.js` |
| Charts | Native `<canvas>` drawing; no charting dependency |
| Persistence | `localStorage` for records/layout/settings plus IndexedDB for uploaded file blobs, for every feature except Community |
| AI backend | Small Node.js `http` server for AI endpoints only |
| External AI | Multi-provider gateway (OpenAI, Anthropic, Kimi, DeepSeek) called only from the Node server; OpenAI remains the default when no provider/key is specified |
| Community backend | Express + PostgreSQL (`pg`), a separate process/port from the AI server - the project's first real database (Section 4) |
| Tests | Node's built-in `node:test` runner |

The architecture is intentionally local-first: all core workflows remain usable without authentication, a database server, or an AI key. The Node server enriches selected workflows but is not the source of truth for user records.

### Important runtime shape

This is a hybrid application, not a conventional component-only React SPA:

1. `index.html` loads vendored React globals and `src/release.js`.
2. `src/release.js` renders a full-viewport `<iframe>`.
3. The iframe displays either the character chooser or one static character dashboard.
4. Shared feature scripts run inside each dashboard iframe and expose APIs on `window`.

`src/App.jsx` and `src/main.jsx` contain the module-based equivalent, but the current `index.html` does **not** import `src/main.jsx`. The production entry used by both Vite and direct `file://` opening is `src/release.js`.

## 2. Folder & File Structure Map

```text
tradejournal-react/
├── index.html                    # Active shell entry; loads vendored React and release.js
├── package.json                  # Vite, API, build, preview, and test scripts
├── vite.config.js                # React plugin, relative base, and /api proxy rules
├── .env.example                  # AI server + Community backend environment-variable template
├── docker-compose.yml            # Local Postgres for the Community backend (Section 4)
├── README.md                     # Incremental implementation notes and run instructions
├── src/
│   ├── release.js                # Active classic-script React shell and hash router
│   ├── App.jsx                   # Module-based shell equivalent; currently not loaded by index.html
│   ├── main.jsx                  # Conventional Vite entry; currently not loaded by index.html
│   └── shell.css                 # Full-viewport shell/iframe layout
├── vendor/
│   ├── react.production.min.js   # React global used by release.js
│   └── react-dom.production.min.js
├── public/pages/
│   ├── select/                   # Character chooser/login presentation and its assets
│   ├── admin/                    # Admin panel - standalone top-level page like select/, Section 7.16
│   ├── hunter/                   # Hunter dashboard HTML, CSS, behavior, and raster assets
│   ├── engineer/                 # Engineer dashboard HTML, CSS, behavior, and raster assets
│   ├── commander/                # Commander dashboard HTML, CSS, behavior, and raster assets
│   ├── sage/                     # Market Sage dashboard HTML, CSS, behavior, and raster assets
│   └── shared/
│       ├── panel-system.*        # Shared panel canvas, panel manager, character theme bridge
│       ├── session-*.{js,css}    # Session creation, workspace, cards, entry/fate flow, locale fixes
│       ├── pattern-registry*     # Pattern types, store, AI client, i18n, UI, and CSS
│       ├── strategy-education*   # Strategy education types, store, AI, i18n, UI, and CSS
│       ├── trade-*               # Trade model/store, calculator, UI, reports, open-position module
│       ├── mental-health-*       # Trading Mental Health Profile: intake, continuous tracking, AI, i18n, page
│       ├── ai-*, chat-dock-core* # Global AI Assistant: process registry, settings/usage stores, i18n, dock request/orchestration logic (UI is the NAVRYA ChatDock React tree, Section 2's Character page contract and navrya-src/chatDockView.jsx)
│       ├── dev-user-switcher.*   # DEV MODE user switcher (Community's identity bootstrap, Section 4)
│       ├── admin-heartbeat.js    # Client heartbeat loop feeding the admin Users tab - Section 7.16
│       ├── community*, marketplace-ui.*, messages-ui.*  # Community: feed/marketplace/messaging UI, store, i18n, types
│       ├── icon-system.*         # Lucide upgrade/render layer
│       └── vendor/               # Vendored Lucide script and license
├── server/
│   ├── pattern-ai-server.mjs     # Multi-provider (OpenAI/Anthropic/Kimi/DeepSeek) JSON API gateway
│   ├── community-api-server.mjs  # Community backend entrypoint (Express, real pg-backed repo, binds a real port)
│   ├── community/                # App factory (app.mjs), routes (incl. trading-sessions - 7.18), dev-mode auth - Section 4
│   ├── admin/                    # Admin routes + requireAdmin auth middleware - Section 7.16
│   ├── storage/                  # Generalized (Community + every 7.18 module) base64-data-URL image uploader
│   └── db/                       # Postgres pool, id generator, pg/in-memory repo implementations, migrations
├── tests/
│   └── *.test.mjs                # Per-feature regression suites (trade, mental-health, AI gateway/dock, community, etc.)
├── dist/                         # Generated Vite build output; do not edit
└── node_modules/                 # Installed dependencies; do not edit
```

### Character page contract

Every `public/pages/{character}/index.html` loads its own `styles.css` and `app.js`, followed by the shared CSS and scripts in a strict dependency order. In particular:

- `app.js` must run before `panel-system.js` so it can set `window.TradeJournalPanelCharacter`.
- Type and i18n files load before their stores and UIs.
- `trade-store.js` and `trade-calculator.js` load before `trade-ui.js`.
- `trade-ui.js` loads before `trade-open-positions.js` and `trade-reports.js`.
- `session-entry-flow.js` provides `TradeJournalImageStore`, which pattern, strategy, and trade stores reuse.

The four character entry pages currently contain the same shared script sequence. The regression suite checks this order.

### Naming conventions

- React component files use PascalCase (`App.jsx`).
- Shared browser feature files use lowercase kebab-case (`trade-open-positions.js`).
- Each browser module is generally an IIFE and exports one `window.TradeJournal...` API.
- CSS classes are feature-prefixed: `panel-`, `sw-`, `swe-`, `pr-`, `se-`, and `tj-`.
- Stored IDs combine a semantic prefix, base-36 time, and random suffix, for example `pattern-...`, `stage-...`, and `trade-...`.
- Feature folders are not used under `shared`; related files are grouped by a common filename prefix.

## 3. Data Layer & State Management

### Persistence strategy

There is no Redux, Zustand, React Context, remote application database, or authentication state. State is managed by:

- mutable in-memory objects while a view/modal is open;
- `localStorage` as the synchronous record store;
- IndexedDB for potentially large uploaded blobs;
- `CustomEvent`, `MutationObserver`, and `hashchange` listeners for cross-module refreshes;
- APIs exposed on `window` for direct feature-to-feature calls.

This approach keeps all four static dashboards interoperable without introducing a second application framework inside the iframe.

### Storage keys

| Key/database | Contents |
|---|---|
| `tradejournal:patterns:v1` | Pattern Registry records |
| `tradejournal:strategies:v2` | Multi-strategy records (`Strategy[]`). As of Section 7.18 Module 3, this is a write-through cache of the server-canonical `strategies`/etc. tables (Postgres), not the sole source of truth - still read/written synchronously exactly as before, reconciled from the server in the background |
| `tradejournal:strategy-education:v1` | Read-only legacy singleton source used once by the v2 migration |
| `tradejournal:trades:v1` | Unified trade records. As of Section 7.18 Module 4, this is a write-through cache of the server-canonical `trades`/etc. tables (Postgres), not the sole source of truth - still read/written synchronously exactly as before, reconciled from the server in the background |
| `tradejournal:trade-settings:v1` | Fee, account balance, and default risk settings |
| `tradejournal:sessions:v1:{character}` | Character-scoped session records. As of Section 7.18 Module 1, this is a write-through cache of the server-canonical `trading_sessions`/etc. tables (Postgres), not the sole source of truth - still read/written synchronously exactly as before, reconciled from the server in the background |
| `tradejournal:sync-queue:v1` | Section 7.18: the shared offline-write outbox (`window.TradeJournalSyncQueue`) every migrated module's store enqueues to - pending `{module, recordId, action, payload, attempts, nextAttemptAt}` entries awaiting delivery |
| `tradejournal:sessions-migrated:v1:{character}:{userId}` | Section 7.18 Module 1: idempotency flag marking that this character/user's pre-existing local sessions have already been pushed to the server once |
| `tradejournal:patterns-migrated:v1:{userId}` | Section 7.18 Module 2: idempotency flag marking that this user's first-activation server-check (adopt server patterns, or push local ones up if the server had none) has already run once |
| `tradejournal:strategies-migrated:v1:{userId}` | Section 7.18 Module 3: idempotency flag marking that this user's first-activation server-check (adopt server strategies, or push local ones up if the server had none) has already run once |
| `tradejournal:trades-migrated:v1:{userId}` | Section 7.18 Module 4: idempotency flag marking that this user's first-activation server-check (adopt server trades, or push local ones up if the server had none) has already run once |
| `tradejournal:mental-health-migrated:v1:{userId}` | Section 7.18 Module 5: idempotency flag marking that this user's first-activation server-check (adopt the server profile, or push the local one up if the server had none) has already run once |
| `tradejournal:session-signatures:v1` | Global cross-character signatures for closed sessions |
| `tradejournal:session-similarity-threshold:v1` | User-configurable similarity-alert threshold |
| `tradejournal:character-panels:{character}:{view}` | Panel layout per character and view |
| `tradejournal:psychology-settings:v1` | Protective-nudge toggles: `breathing`, and one reconciled `postTradeReflection` toggle (replaces the earlier separate `revenge`/`cooldown` settings) |
| `tradejournal:mental-health-profile:v2` | The single Trading Mental Health Profile - one profile, not per-character. Holds the original `baseline`/`emotionalProfile`/`triggerProfile`/`behavioralPatterns`/`cognitiveProfile`/`progressTracking`/`activeInterventions`/`healthReportCache`/`chatHistory`/`educationCards` plus v2's `intake`, `psychologicalProfile`, `continuousTracking`, and `redFlags`. Loaded and migrated additively from the legacy `tradejournal:mental-health-profile:v1` key the first time; `baseline` itself is left untouched and a snapshot of it is kept at `intake.legacyBaselineV1`. As of Section 7.18 Module 5, this is a write-through cache of the server-canonical `mental_health_profiles` table, not the sole source of truth - still read/written synchronously exactly as before, reconciled from the server in the background |
| `tradejournal:mental-health-compliance:v1` | Lightweight cool-down offered/dismissed tally behind `behavioralPatterns.cooldownComplianceRate` |
| `tradejournal:ai-settings:v1` | Global AI Assistant settings: active provider, per-provider model, `persistApiKey` toggle, optional `monthlyTokenBudget`, `therapistModeDefault`. The BYO API key itself is never stored here |
| `tradejournal:ai-byok:v1` | Only written when `persistApiKey` is explicitly opted in; a per-provider key map. Empty/absent otherwise - the key is in-memory-only by default |
| `tradejournal:ai-usage:v1` | Daily/monthly token usage buckets (`{promptTokens, completionTokens, totalTokens, byProvider}`), observed by decorating the existing AI clients plus explicit recording from the dock's own gateway/extraction calls |
| `tradejournal-language` | Character chooser language |
| `{character}-language` | Language of each character dashboard |
| `tradejournal:dev-user-id` | The dev-mode switcher's chosen "current user" id, sent as the `x-dev-user-id` header on Community API calls (Section 4). Everything else about that user - posts, listings, messages - lives in Postgres, not localStorage |
| IndexedDB `tradejournal-images-v1`, store `images` | Session, pattern, strategy, and trade blobs by blob ID |

If IndexedDB storage fails, pattern, strategy, entry, and trade upload flows fall back to base64 `dataUrl` values embedded in their local records.

### Pattern model

Source: `public/pages/shared/pattern-registry.types.js`.

```ts
interface PatternStage {
  id: string;
  order: number;
  text: string;
}

interface PatternScreenshot {
  id: string;
  fileName: string;
  blobId?: string;
  dataUrl?: string;
  uploadedAt: string;
  note?: string;
}

interface PatternChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  suggestedStages?: PatternStage[];
}

interface Pattern {
  id: string;
  name: string;
  description: string;
  completionThreshold: number;
  stages: PatternStage[];
  referenceScreenshots: PatternScreenshot[];
  usageCount: number;
  chatHistory: PatternChatMessage[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
```

`pattern-registry-store.js` seeds eight patterns when no array exists. It normalizes legacy `positionThreshold`, stage `label`, missing IDs, and `isPublic`. `usageCount` is the maximum of the stored count and a scan of every character's session scenarios. `listForScenarios()` deliberately exposes a smaller snapshot with `{id, name, completionThreshold, positionThreshold, stages[]}`. `scenarioReport(patternId)` aggregates linked scenarios from all four character session keys and returns nullable metrics with an explicit `hasData` flag.

### Strategy Education model

Source: `public/pages/shared/strategy-education.types.js`.

```ts
type StrategyAttachmentCategory =
  | 'positionManagement'
  | 'riskManagement'
  | 'overallFramework';

interface StrategyAttachment {
  id: string;
  category: StrategyAttachmentCategory;
  fileName: string;
  blobId?: string;
  dataUrl?: string;
  mimeType: string;
  size: number;
  note?: string;
  uploadedAt: string;
}

interface StrategyFieldSuggestion {
  id: string;
  path: string;
  section: StrategyAttachmentCategory;
  value: string | number | null;
  mode: 'append' | 'replace';
  status: 'pending' | 'applied' | 'rejected';
  createdAt: string;
}

interface StrategyChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  suggestions?: StrategyFieldSuggestion[];
}

interface StrategyDetectionEvent {
  id: string;
  strategyId: string;
  detectedAt: string;
  source: { type: 'session' | 'trade' | 'manual'; sessionId?: string; scenarioId?: string; tradeId?: string };
  predictedOutcome: string;
  status: 'pending' | 'confirmed' | 'invalidated';
  resolvedAt: string | null;
  note?: string;
}

interface Strategy {
  id: string;
  name: string;
  active: boolean;
  isPublic: boolean;
  origin: 'manual' | 'ai_from_event';
  positionManagement: {
    entryRules: string;
    stopLossRules: string;
    exitTargetRules: string;
    positionSizingRules: string;
    freeNotes: string;
    attachments: StrategyAttachment[];
  };
  riskManagement: {
    maxRiskPerTradePercent: number | null;
    dailyDrawdownLimitPercent: number | null;
    totalDrawdownLimitPercent: number | null;
    maxConcurrentTrades: number | null;
    maxProfitCapPerTrade: number | null;
    freeNotes: string;
    attachments: StrategyAttachment[];
  };
  overallFramework: {
    description: string;
    attachments: StrategyAttachment[];
  };
  chatHistory: StrategyChatMessage[];
  aiUnderstandingSummary: {
    positionManagement: string;
    riskManagement: string;
    overallFramework: string;
    updatedAt: string;
  };
  detectionEvents: StrategyDetectionEvent[];
  createdAt: string;
  updatedAt: string;
}
```

The store persists an array under `tradejournal:strategies:v2`. On first load only, it migrates the legacy `strategy-education-singleton` into a generated strategy ID, preserves its content, and marks it active. Numeric fields are normalized to non-negative values; `maxConcurrentTrades` is rounded. Chat, summaries, attachments, and detection events are scoped by strategy ID. Suggestions modify a field only after explicit approval. Integration adapters require an explicit ID: `getRiskDefaults(strategyId)` and `getPositionGuide(strategyId)`. With no ID they return empty values rather than selecting a global strategy.

### Trade model

Source: `public/pages/shared/trade.types.js`.

```ts
type TradeStatus = 'hunting' | 'open' | 'closed' | 'cancelled';
type TradeDirection = 'long' | 'short';
type TradeEntryMode = 'quick' | 'full';

interface TradeTakeProfit {
  price: number;
  portionPercent: number;
}

interface TradeEmotionLog {
  id: string;
  timestamp: string;
  stage: 'entry' | 'mid_trade' | 'exit';
  dominantEmotions: string[];
  stressLevel: number;
  focusQuality: number;
  planCommitment: number;
  wouldTakeIfNotForced: boolean | null;
  note: string;
}

interface TradeScreenshot {
  id: string;
  blobId?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
  uploadedAt: string;
}

interface TradeTimeframeTrend {
  timeframe: string;
  direction: 'bullish' | 'bearish' | null;
  momentumStrength: number | null;
  source: 'ai' | 'user';
}

interface Trade {
  id: string;
  status: TradeStatus;
  direction: TradeDirection;
  entryMode: TradeEntryMode;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfits: TradeTakeProfit[];
  slDistancePercent: number | null;
  riskPercent: number | null;
  riskAmount: number | null;
  leverage: number | null;
  positionSize: number | null;
  marginRequired: number | null;
  liquidationPrice: number | null;
  rr: number | null;
  marginMode: 'isolated' | 'cross';
  commission: {
    feeType: 'taker' | 'maker';
    feePercent: number;
    totalCommission: number;
  };
  breakevenPercent: number | null;
  exitPrice: number | null;
  outcome: 'win' | 'loss' | 'breakeven' | null;
  pnl: number | null;
  pnlPercent: number | null;
  session: 'tokyo' | 'london' | 'newyork' | 'sydney';
  primaryTimeframe: string | null;
  timeframeTrends: TradeTimeframeTrend[];
  conceptTags: string[];
  linkedPatternIds: string[];
  linkedStrategyId: string | null;
  chartNote: string;
  emotionLog: TradeEmotionLog[];
  screenshots: TradeScreenshot[];
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  closedAt: string | null;
  statusHistory: { status: TradeStatus; timestamp: string }[];
  source?: { character?: string; sessionId?: string; scenarioId?: string };
  aiPredictionLinks?: {
    id: string;
    patternId?: string;
    matched: boolean | null;
  }[];
  aiInitialAnalysis?: {
    summary: string;
    observations: string[];
    warnings: string[];
  };
}
```

The runtime store additionally writes `disciplineImpact` and writes status history timestamps under `at`, not `timestamp`. See the known constraints section for this schema drift.

Trade settings default to taker fee `0.06`, maker fee `0.02`, and risk `1%`. Selecting an active strategy in the calculator or trade wizard explicitly loads that strategy's risk value and stores its ID in `linkedStrategyId`; there is no global strategy default. Adding/removing `linkedPatternIds` increments/decrements Pattern Registry usage through `recordUsage()`.

### Session data shape

Session objects are not declared in a dedicated typedef file. The active shape is established and migrated by `session-system.js`, `session-workspace-logic.js`, `session-card-updates.js`, and `session-entry-flow.js`:

```ts
interface SessionRecord {
  id: string;
  name?: string;
  market: 'London' | 'NewYork' | 'Tokyo' | 'Sydney' | string;
  timeframe: string;
  date: string;
  jalali: string;
  startedAt: number | string;
  closedAt?: number | string | null;
  status: 'open' | 'closed';
  updateIntervalMinutes: number;
  gracePeriodMinutes: number;
  entries: SessionEntry[];
  activityLog: SessionActivity[];
  fateSummary?: object;
  previousSessionSummary?: object;
  aiSessionAnalysis?: string;
  aiSessionAnalysisResult?: object;
  finalEntryId?: string;
}

interface SessionEntry {
  id: string;
  sessionId?: string;
  type: 'chart' | 'movement' | 'fate';
  createdAt: number | string;
  hasImage?: boolean;
  imageBlobId?: string;
  preview?: string;
  timeframe: string;
  market: string;
  tradingSession?: string;
  gregorianDate?: string;
  note?: string;
  movementNote?: string;
  relatedScenarioIds?: string[];
  scenarios: SessionScenario[];
  aiAnalysisResult?: object;
}

interface SessionScenario {
  id: string;
  title: string;
  description?: string;
  evidence?: string;
  issue?: string;
  trigger?: string;
  occurred?: boolean;
  probabilityHistory: { value: number; loggedAt: number }[];
  pattern?: {
    patternTagId?: string;
    name: string;
    completionThreshold: number;
    stages: { id: string; index: number; label: string }[];
    completedStageIds: string[];
  };
  executionPlan: {
    actionPlan?: string;
    positionType?: string | null;
    entryPrices: number[];
    stopLoss?: number | null;
    takeProfit?: number | null;
    positionStatus?: 'open' | 'closed' | null;
    openedAt?: number;
    closedAt?: number;
  };
}
```

Earlier records using `charts`, top-level `scenarios`, `loop`, `grace`, string stages, or legacy execution fields are normalized at read/open time rather than migrated in a separate database step.

### Public browser APIs and events

Core globals include:

- `TradeJournalPanelLayer`
- `TradeJournalSessions` and `TradeJournalWorkspace`
- `TradeJournalImageStore` and `TradeJournalEntryFlow`
- `TradeJournalPatternStore`, `TradeJournalPatternAI`, `TradeJournalPatternRegistry`
- `TradeJournalStrategyEducationStore`, `TradeJournalStrategyEducationAI`, `TradeJournalStrategyEducation`
- `TradeJournalTradeStore`, `TradeJournalTradeCalculator`, `TradeJournalTradeUI`
- `TradeJournalOpenPositionsModule` and `TradeJournalTradeReports`
- `TradeJournalIcons`
- `TradeJournalAIProcessRegistry`, `TradeJournalAISettingsStore`, `TradeJournalAIUsage`, `TradeJournalAII18n`, `TradeJournalChatDockCore`
- `TradeJournalSyncQueue` (Section 7.18: the shared offline-write outbox every local-first-to-server module registers a sender with)

The stores dispatch `tradejournal:patterns-changed`, `tradejournal:strategy-education-changed`, `tradejournal:trades-changed`, and `tradejournal:trade-settings-changed` after writes. The shell listens for the iframe message `tradejournal:character-selected`.

## 4. Backend & Database (Community)

This was the project's **first departure from pure local-first** - originally, every feature described in Section 3 and in Section 7's earlier entries (Patterns, Strategies, Trades, Sessions, Mental Health) was intentionally `localStorage`/IndexedDB-only, single-browser, no accounts, with migrating those features onto a server explicitly out of scope. **That has since changed: Section 7.18 is a now-in-progress migration of exactly those features onto this same backend**, module by module (Sessions, Patterns, Strategy Education, Trade Store, and Mental Health Profile - all five modules complete). Until each module's turn comes, it stays exactly as originally described here - local-only, no server counterpart. See 7.18 for the full design (write-through cache, sync queue, per-module schema/routes). The reason a real backend existed at all *originally* is that the Community feature (Section 7.15) is inherently multi-user: a social feed post has to be visible to people other than its author, a marketplace purchase has to be recorded by someone other than the seller, and a message has to reach its recipient - none of that could live in one browser's `localStorage`. 7.18 reuses that same backend/repo/app-factory pattern for a different reason (durability/cross-device/analysis), not because those features are newly multi-user.

### Stack

- **Database:** PostgreSQL, accessed through `pg` (`node-postgres`) with a plain connection `Pool` — no ORM, consistent with the project's low-dependency style.
- **API server:** `server/community-api-server.mjs`, using Express (unlike the small hand-rolled-`http` AI server) given the number of REST endpoints. It is a **separate process and port** from `server/pattern-ai-server.mjs` — AI-endpoint code and community/account CRUD code are cleanly separated, and adding this backend never touched the AI server.
- **Local dev database:** `docker-compose.yml` at the repo root runs a single `postgres:16-alpine` service (`tradejournal`/`tradejournal`/`tradejournal` user/pass/db, port 5432, named volume). `npm.cmd run db:migrate` (`server/db/migrate.mjs`) applies the plain-SQL files in `server/db/migrations/` in order, tracking applied ones in a `schema_migrations` table it creates itself.
- **File storage:** post images and listing screenshots are decoded from base64 data URLs (the same convention every other upload in this app already uses — never multipart/`FormData`) and written to local disk under `UPLOADS_DIR`, served via a static `/uploads` route. This is deliberately kept behind one small module, `server/storage/storage.mjs` (moved and generalized from the Community-only `server/community/storage.mjs` as of Section 7.18, with a `category` param replacing the old `subdir` name so every migrated module's images land in their own organized subfolder), so swapping to S3-compatible object storage later is a contained change (see Known Constraints).

### The injectable-repository pattern (why `npm.cmd test` never needs a live Postgres)

`server/db/repo.pg.mjs` and `server/db/repo.memory.mjs` implement the identical async method surface (`users`, `posts`, `comments`, `listings`, `purchases`, `ratings`, `threads`, `messages`, `reports`, plus the admin-only domains added in 7.16: `sessions`, `usageEvents`, `providerPricing`, `adminKeys`, `auditLog`, plus `xpEvents` and `achievements` added in 7.17). `server/community/app.mjs`'s `createApp({repo, uploadsDir})` is a pure factory with zero import-time side effects — it takes whichever repo it's given. `server/community-api-server.mjs` (the process entrypoint) is the only file that binds a real port, and picks its repo based on `DATABASE_URL`: the real `pg`-backed repo when it's set, or `createMemoryRepo()` itself when it's not — a zero-setup local fallback (data resets on restart, logged loudly on startup so it's never mistaken for real persistence) so a developer without Docker/Postgres installed can still run `npm run dev:community-api` and have Community actually work. Every test likewise injects `createMemoryRepo()` directly via `createApp()`, which re-implements the same business-rule invariants in plain JS (unique purchase per buyer/listing, a rating requires a prior purchase, thread `findOrCreate` idempotency, one open session per user) so the full API contract is verified with no database reachable. This mirrors the same philosophy the rest of the test suite already uses — fake `localStorage`/`fetch`/DOM in a `vm` sandbox — applied to the database layer.

### Schema

| Table | Purpose |
|---|---|
| `users` | Account foundation: `id`, `display_name`, `avatar_url`, `bio`, `created_at`, plus `role` (`user`/`moderator`/`admin`, default `user`) and `suspended_at` added in 7.16 for the admin panel. 7.17 (Account Profile) adds `email`/`email_verified`/`phone`/`phone_verified` (verification flags default `false` - no real verification provider exists), `profile_role` (`trader`/`mentor`/`teacher`, default `trader` - a separate column from the admin `role` above, never conflated with it), `kyc_status` (`not_started`/`pending`/`verified`/`rejected`, default `not_started`, admin-write-only), `xp_total` (a maintained running total, not recomputed by summing `user_xp_events` on every read), and `avatar_data_url`. |
| `posts`, `comments` | The social feed. |
| `marketplace_listings` | A published snapshot of a pattern's or strategy's content and real evidence stats (`success_rate_percent`, `sample_size`, `evidence_as_of`), plus `preview_content`/`full_content`, `status` (`draft`/`published`/`delisted`), and `featured` (admin-only boolean, 7.16). `type` (`pattern`/`strategy`) widened in 7.17 to also allow `'subscription'`, reusing this same column rather than adding a parallel `listing_type` - subscriptions ride the existing `marketplace_purchases`/`mock:true` pipeline unchanged. |
| `user_xp_events` | Account Profile (7.17): one row per XP-earning event (`type`, `points`, `meta` jsonb, `occurred_at`). Server-clamped - a client's submitted `points` is always capped at the canonical value for that `type` (`server/community/xp-rules.mjs`), never trusted as-is. |
| `user_achievements` | Account Profile (7.17): `UNIQUE(user_id, achievement_key)` makes unlock idempotent (a repeat unlock attempt is a harmless no-op, same pattern as `ALREADY_PURCHASED`), `evidence` jsonb records what earned it (real trade/session/listing/purchase IDs or a real count - never a speculative unlock). |
| `marketplace_purchases` | Always `mock = TRUE` (DB `CHECK` constraint) — no real payment integration exists yet; see Known Constraints. `UNIQUE(listing_id, buyer_id)`. |
| `marketplace_ratings` | `UNIQUE(listing_id, buyer_id)`, and a **composite foreign key** to `marketplace_purchases(listing_id, buyer_id)` — "only a buyer with a real purchase can rate" is enforced at the database level, not just in application code. |
| `dm_threads`, `dm_messages` | Messaging. A thread is always anchored to one `listing_id` + `buyer_id` (`UNIQUE`) — never a general-purpose inbox between arbitrary users. |
| `reports` | Moderation minimum: `target_type` (`post`/`comment`/`listing`/`message`), `target_id` (polymorphic, no FK — validated against the right table in the application layer since Postgres can't cleanly FK across four tables), `status` (`open`/`reviewed`/`dismissed`). |
| `user_sessions` | Admin panel (7.16) heartbeat/presence tracking: `started_at`, `last_heartbeat_at`, `ended_at`. `UNIQUE ... WHERE ended_at IS NULL` enforces one open session per user at the DB level, backing app-level find-open-else-create logic. |
| `ai_usage_events` | Admin panel (7.16): a server-side mirror of each browser's local `tradejournal:ai-usage:v1` ledger, tagged with `user_id` (nullable) and `source` (which feature/endpoint generated it). |
| `provider_pricing` | Admin panel (7.16): natural-key table (`provider` PK) holding admin-set `prompt_price_per_1k`/`completion_price_per_1k`/`monthly_token_budget`, used by the Financial tab's cost/budget math. |
| `admin_ai_keys` | Admin panel (7.16): natural-key table (`provider` PK) holding server-side AI provider keys set from the admin UI. **Stored as plain text** — see Known Constraints. Never returned to the browser; only a masked `{isSet, updatedAt}` shape is. |
| `admin_audit_log` | Admin panel (7.16): one row per mutating admin action (`action`, `target_type`, `target_id`, `details`), written by every `PATCH`/`POST` handler under `/api/admin`. |
| `ai_provider_health_events` | Admin panel (7.16): append-only log of every `callProvider()` outcome (success or failure, `ok`/`error_code`/`latency_ms`/`source`) reported by `pattern-ai-server.mjs` - powers the AI tab's per-provider health status and recent-events feed. |
| `ai_chat_history` | Section 7.14: one row per **conversation** (not per user) for the global AI assistant dock - `title`, `provider`, a single `messages` jsonb array, and a running `total_tokens`. Real per-user auth now exists app-wide, so conversations follow the trader across devices/browsers, matching real ChatGPT/Claude; BYO API keys remain the one thing that stays client-only (a credential is a different concern than conversation text). |
| `trading_sessions` | Section 7.18 Module 1: the server-canonical parent row per trading-journal session (mirrors `SessionRecord`). Named `trading_sessions`, not `sessions` - that name is already `user_sessions`/`repo.sessions` above (an unrelated concept, admin heartbeat/presence). Scoped by `user_id` alone, not `(user_id, character)` - see 7.18's reasoning; `character` is a plain column. |
| `trading_session_entries` | Section 7.18 Module 1: one row per `SessionEntry` (chart/movement/fate), FK to `trading_sessions`, cascade-deleted with it. Real columns for everything queried elsewhere (`type`, `timeframe`, `market`, image references); `related_scenario_ids` stays jsonb. |
| `trading_session_scenarios` | Section 7.18 Module 1: one row per `SessionScenario`, FK to both its parent `trading_session_entries` row and (denormalized) `trading_sessions` for cross-entry queries. `title`, `occurred`, and `pattern_tag_id` are real columns on purpose - the Pattern Registry report and admin/gamification work already query across scenarios by these fields; `probability_history`/`pattern`/`execution_plan` stay jsonb since nothing queries into them directly yet. |
| `trading_session_activity_log` | Section 7.18 Module 1: one row per session activity-log entry, FK to `trading_sessions`, cascade-deleted with it. |
| `patterns` | Section 7.18 Module 2: the server-canonical parent row per Pattern Registry pattern (mirrors `pattern-registry.types.js`'s `Pattern`). Flatter than `trading_sessions` - no nested-array-of-nested-arrays, so most fields are real columns directly on this table. |
| `pattern_stages` | Section 7.18 Module 2: one row per `PatternStage`, FK to `patterns`, cascade-deleted with it. Column is `stage_order`, not `order` - a reserved SQL keyword. |
| `pattern_screenshots` | Section 7.18 Module 2: one row per `PatternScreenshot`, FK to `patterns`, cascade-deleted with it. `image_url` mirrors `trading_session_entries.image_url` - populated once the screenshot's blob uploads via the generalized storage module (`category: 'pattern'`). |
| `pattern_chat_messages` | Section 7.18 Module 2: one row per `PatternChatMessage`, FK to `patterns`, cascade-deleted with it. `suggested_stages` stays jsonb. |
| `strategies` | Section 7.18 Module 3: the server-canonical parent row per Strategy Education strategy (mirrors the client's `Strategy`). Flatter still than `patterns` - all three sections' (`positionManagement`/`riskManagement`/`overallFramework`) scalar fields are real columns directly on this table; `ai_understanding_summary` stays jsonb. |
| `strategy_attachments` | Section 7.18 Module 3: one row per attachment across all three sections, FK to `strategies`, cascade-deleted with it. A `category` CHECK column (`position_management`/`risk_management`/`overall_framework`) tags which section it belongs to instead of three separate tables, since the three sections' attachments are otherwise identical in shape. `image_url` mirrors `pattern_screenshots.image_url` - populated once an image-type attachment uploads via the generalized storage module (`category: 'strategy'`); non-image attachments (pdf/txt/docx) never populate this column and stay local-only (see 7.18 Module 3's reasoning). |
| `strategy_chat_messages` | Section 7.18 Module 3: one row per chat message, FK to `strategies`, cascade-deleted with it. `suggestions` stays jsonb. |
| `strategy_detection_events` | Section 7.18 Module 3: one row per detection event, FK to `strategies`, cascade-deleted with it. `source` stays jsonb. |
| `trades` | Section 7.18 Module 4: the server-canonical parent row per Trade (mirrors `trade.types.js`). Every scalar the client's own `filter()`/`analytics()` functions read individually is a real column; `linked_pattern_ids`/`linked_strategy_id` are plain (no FK - see 7.18's reasoning); the remaining nested/compound fields (`take_profits`, `commission`, `timeframe_trends`, `concept_tags`, `status_history`, `ai_prediction_links`, `ai_initial_analysis`) stay jsonb. |
| `trade_screenshots` | Section 7.18 Module 4: one row per `TradeScreenshot`, FK to `trades`, cascade-deleted with it. `image_url` mirrors `pattern_screenshots.image_url`/`strategy_attachments.file_url` - populated once the screenshot's blob uploads via the generalized storage module (`category: 'trade'`). |
| `trade_emotion_log` | Section 7.18 Module 4: one row per `TradeEmotionLog` entry, FK to `trades`, cascade-deleted with it. Its own child table (not jsonb) since Module 5 (Mental Health Profile) is expected to query per-emotion fields directly once it lands. `occurred_at` maps to the client's `timestamp` field name - the one place that translation happens. |
| `mental_health_profiles` | Section 7.18 Module 5 (final module): one row per user, `user_id` itself the primary key (never a separate generated id - there is exactly one profile per user by construction). The entire client profile object is stored verbatim in a single `profile` jsonb column - no per-section columns, no child tables - since nothing anywhere queries into any of its ~14 nested sections individually. The only migrated module with no associated upload/image table. |

### Accounts: dev-mode switcher, not real authentication

`users` is the account foundation, but real authentication (password/OAuth/sessions) is explicitly deferred. `public/pages/shared/dev-user-switcher.js` (`window.TradeJournalDevUserSwitcher`) is the single place a dev-mode user is ever created or switched — **visibly labeled "DEV MODE — not real authentication" in the UI itself**, not just in code comments. A new user is created at **login time, gated on character selection specifically**: `public/pages/select/app.js` (the character chooser) does nothing extra for a returning browser (`tradejournal:dev-user-id` already in `localStorage` — clicking a character's Select button completes the selection immediately, same as before this feature existed). For a fresh browser, clicking a character card's Select button does **not** complete the selection — it opens a one-field "what should we call you" popup instead and remembers which card was clicked (`pendingCharacterCard`); only once that name is submitted and this module's exported `createUser(displayName)` resolves (not a second, duplicated `fetch`) does the originally-clicked character's selection actually complete. The decorative "Continue with Google/Email/Sign up" buttons on the same page are unrelated — they only ever show a front-end demo toast and never touch account creation. A failed create keeps the popup open and shows a diagnostic message: a `TypeError` (fetch never reached a server — almost always because `server/community-api-server.mjs` isn't running) gets a distinct "start the community backend" message pointing at `npm run dev:community-api` (see the root `README.md`), while an HTTP-level rejection shows the real server error code inline instead of a generic dead end. A Settings-page card (also built by `dev-user-switcher.js`) additionally lets a tester **switch** between already-created users; it no longer offers to create one (that create path used to live there and was quietly broken - see Known Constraints). The chosen user id is sent as an `x-dev-user-id` header on every community API call, resolved server-side by `server/community/auth-dev.mjs`'s `devUserAuth(repo)` middleware — the **only** place identity is resolved; every route handler reads `req.currentUser`, never the raw header. A future real-auth swap is designed to be additive: write `auth-real.mjs` with the identical `(repo) => (req,res,next) => {...}` shape (verifying a session/JWT instead of trusting a header), then change the one `app.use(devUserAuth(repo))` line in `server/community-api-server.mjs`. No route file needs to change.

### API surface

All error bodies are `{error: 'CODE'}` (mirrors `pattern-ai-server.mjs`'s existing convention). Base routes: `GET/POST /api/users` (public — bootstraps identity), `GET /api/users/me`, `GET /api/users/:id`, `GET/POST /api/community/posts`, `DELETE /api/community/posts/:id`, `GET/POST /api/community/posts/:id/comments`, `POST /api/community/reports`, `GET/POST /api/marketplace/listings`, `GET /api/marketplace/listings/by-source/:sourceId`, `GET/PATCH /api/marketplace/listings/:id`, `POST /api/marketplace/listings/:id/purchase`, `GET/POST /api/marketplace/listings/:id/ratings`, `GET/POST /api/messages/threads`, `GET /api/messages/threads/:id`, `POST /api/messages/threads/:id/messages`. 7.17 (Account Profile) adds `GET/PATCH /api/users/me/profile`, `GET/POST /api/users/me/xp-events`, `GET /api/users/me/achievements`, `POST /api/users/me/achievements/:key/unlock`, `GET /api/users/me/subscriptions` - all two-segment paths under `/api/users`, so none can ever collide with the single-segment `GET /api/users/:id` above regardless of mount order. Every route except the two public `/api/users` ones requires a valid `x-dev-user-id`. Vite proxies `/api/community`, `/api/users`, `/api/marketplace`, `/api/messages`, `/api/admin`, and `/uploads` to `127.0.0.1:8788` (a distinct port and set of prefixes from the AI server's `127.0.0.1:8787`).

## 5. Theming & Multi-Character Gamification System

### Character selection and routing

The chooser posts `{type: 'tradejournal:character-selected', character}` to its parent. The shell converts that message to one of these hash routes:

- `#/dashboard/hunter`
- `#/dashboard/engineer`
- `#/dashboard/commander`
- `#/dashboard/sage`

The selected dashboard is loaded in a new iframe instance. Character selection is navigation only; it is not an authentication or user-profile system.

### Runtime character themes

`public/pages/shared/panel-system.js` defines the actual shared theme map:

```js
const themes = {
  hunter: {
    accent: '#79df59',
    rgb: '121,223,89',
    backdrop: 'assets/card-stag-v2.webp'
  },
  engineer: {
    accent: '#398cff',
    rgb: '57,140,255',
    backdrop: 'assets/engineer-card-v1.webp'
  },
  commander: {
    accent: '#ff5f5e',
    rgb: '255,95,94',
    backdrop: 'assets/commander-card-v1.webp'
  },
  sage: {
    accent: '#c362ff',
    rgb: '195,98,255',
    backdrop: 'assets/sage-card-v1.webp'
  }
};
```

Each character's `app.js` assigns `window.TradeJournalPanelCharacter`. `panel-system.js` then publishes:

- `--ps-accent`
- `--ps-accent-rgb`
- `--ps-line`
- `--ps-backdrop`

Shared feature CSS consumes those variables. The session design layer maps them to `--sw-primary`, `--sw-primary-rgb`, `--sw-primary-soft`, and `--sw-primary-line`, while semantic success/warning/danger and market colors stay common across characters.

The theme is selected by which character page is loaded. There is no persisted runtime theme switch independent of character selection; the Settings theme card is informational.

### Character-specific assets

Assets live beside each static dashboard at `public/pages/{character}/assets/`. CSS and the shared theme map use paths relative to the character page, so a shared feature should reference `assets/...`, not a path rooted in another character folder.

Current principal assets:

- Hunter: archer/forest hero and sidebar art, stag card art, London/New York/Sydney/main charts.
- Engineer: engineer hero, menu-top, sidebar, quote, card, and main chart art.
- Commander: commander hero/card/sidebar, charts, plus retained Hunter/forest source assets.
- Sage: sage hero, menu-top, quote, card, and main chart art.
- Chooser: four character-card images and `welcome-mountains-v1.webp`.

When adding a character-sensitive background, add a correctly named equivalent to every character asset folder and then map it in `panel-system.js` or character CSS. Do not hardcode one character's directory into shared code.

### Fonts

Character styles import Google Fonts and set `--ui-font` dynamically:

| Language | Font stack |
|---|---|
| Persian | Vazirmatn, Tahoma, Arial, sans-serif |
| Arabic | Tajawal, Arial, sans-serif |
| English | DM Sans, Arial, sans-serif |
| Spanish | Manrope, Arial, sans-serif |

Shared modules inherit `--ui-font`. Numeric/time values often force LTR/tabular numerals for stable layout.

### XP and ranks

The dashboard HTML contains static level, XP, streak, and progress values. `panel-system.js` reads the numeric text inside `.level-ring b`, clamps it to levels 1–7, and localizes the corresponding rank name for the active character and language.

This paragraph describes the **legacy** `.level-ring b` element only, which is not present in current character HTML (NAVRYA superseded it) and has no live data behind it. A real, server-backed XP calculation service, store, and progression model **does** exist as of Section 7.17 (Account Profile) and Section 11 (the XP engine) - `panel-system.js`'s `syncRank()` (still reading that now-absent legacy element) is simply dead relative to it, not evidence that XP itself is unimplemented. The NAVRYA header (`navrya-src/character-app.jsx`) reads the real `xpTotal`/level directly (Section 11.17).

## 6. Internationalization (i18n)

### Supported languages

The actual project supports four languages:

- `fa` — Persian, RTL
- `ar` — Arabic, RTL
- `en` — English, LTR
- `es` — Spanish, LTR

Direction is applied dynamically to the dashboard root (`document.documentElement.dir`). User-authored inputs in the Pattern Registry and related editors use `dir="auto"` where appropriate.

### Translation locations

There is no single centralized translation package. Translation dictionaries are distributed by runtime scope:

- `public/pages/select/app.js` — chooser/login presentation.
- `public/pages/{character}/app.js` — character header, navigation, cards, clocks, slogans.
- `panel-system.js` — panel manager and rank tables.
- `session-system.js` and `session-workspace-i18n.js` — session copy and cross-language phrase mapping.
- `pattern-registry-i18n.js` — Pattern Registry.
- `strategy-education-i18n.js` — Strategy Education.
- `trade-i18n.js` — calculator, wizard, emotions, reports, calendar, trades, and the short-term Psychology (`#mindset`) page.
- `mental-health-i18n.js` — the Trading Mental Health Profile: intake, scenario assessment, bias checklist, continuous tracking, red flags, and the dedicated profile page.

Each feature i18n module exposes a `window` API with `t()`, current language, direction, and usually locale-aware number/date helpers. Missing feature keys fall back to English or the key name, depending on that module.

### Language persistence and refresh

- The chooser stores `tradejournal-language` and defaults to English.
- Each character stores `{character}-language` and defaults to Persian.
- A language switch updates `lang`, `dir`, fixed copy, market clock formatting, rank labels, and feature views through DOM mutation observers.
- Feature numbers use `Intl.NumberFormat`; dates and clocks use `Intl.DateTimeFormat` with `fa-IR`, `ar-EG`, `en-US`/`en-GB`, or `es-ES`.
- Market clocks use IANA zones: `America/New_York`, `Europe/London`, `Asia/Tokyo`, and `Australia/Sydney`, refreshed every 30 seconds.

## 7. Feature Inventory

### 7.1 React shell and character chooser

- **Purpose:** Select a visual trading persona and preserve the existing dashboard pages without rewriting them as React components.
- **Files:** `index.html`, `src/release.js`, `src/shell.css`, `public/pages/select/*`; `src/App.jsx` and `src/main.jsx` are inactive equivalents.
- **Dependencies:** React globals, `postMessage`, hash navigation, iframe pages.
- **Important details:** The shell supports Vite paths and direct `file://` paths through a protocol-sensitive prefix. Login buttons in the chooser are presentation/demo interactions; no identity provider or session is implemented.

### 7.2 Character dashboards and session library

- **Purpose:** Present the themed header, market clocks, navigation, session cards, quotes, chat launcher, and character statistics.
- **Files:** `public/pages/{hunter,engineer,commander,sage}/index.html`, `styles.css`, `app.js`, `assets/*`.
- **Dependencies:** Character language dictionaries and every shared module loaded at the bottom of each HTML file.
- **Important details:** Dashboard HTML remains the visual baseline. Shared features hide/show the legacy `.content` children instead of replacing the header/sidebar. Search, favorites, language menu, rotating slogans, and list/grid controls are local DOM behaviors.

### 7.3 Icon system

- **Purpose:** Replace legacy SVG symbol references and dynamic icon placeholders with a consistent icon set.
- **Files:** `shared/vendor/lucide.min.js`, `shared/icon-system.js`, `shared/icon-system.css`.
- **Dependencies:** The Lucide global.
- **Important details:** `legacyMap` translates old `#i-*` IDs. A `MutationObserver` schedules icon rendering for newly inserted DOM. Use `data-lucide="icon-name"` or `TradeJournalIcons.icon()` in new dynamic UI.

### 7.4 Block/panel system and Settings

- **Purpose:** Provide resizable, hideable cards for Dashboard, Sessions, and Strategies without changing the character shell.
- **Files:** `shared/panel-system.js`, `shared/panel-system.css`.
- **Dependencies:** Character page DOM, character theme variables, optional `TradeJournalOpenPositionsModule`.
- **Important details:** Panels have `{id, type, title?, description?, span: 1..4, visible?, custom?}`. Layout is stored per character/view. `register(view, panels)` only appends missing IDs. Supported built-in types are `metric`, `focus`, `watch`, `strategy`, `notes`, `ai`, and `open-trades`. The prompt-based panel builder is a local classifier/preview only and has no AI endpoint.

### 7.5 Session creation and workspace

- **Purpose:** Create a trading session and maintain its chart/movement timeline, scenario reasoning, loop discipline, positions, and final handoff.
- **Files:** `session-system.*`, `session-workspace-logic.*`, `session-workspace-i18n.js`, `session-design-system.*`, `session-card-updates.*`, `session-entry-flow.*`, `session-library.*`, `session-signature.types.js`, `session-signature-store.js`, `session-signature-engine.js`, `session-signature-i18n.js`, `session-signature-ui.js`, `session-signature.css`, `session-locale-layout.css`, `session-behavior-fixes.js`.
- **Dependencies:** `TradeJournalPanelLayer`, Pattern Registry snapshots, `TradeJournalImageStore`, Strategy Education adapters, and Trade UI/store.
- **Important details:**
  - Sessions are character-scoped in the localStorage cache (unchanged). The server-canonical copy (Section 7.18 Module 1) is scoped by `user_id` alone, not by character - see that section for why.
  - New-session fields include optional 5m/1h/4h/1D uploads, market, main timeframe, Gregorian/Jalali dates, update interval, and grace period.
  - The workspace provides previous-session summary, live elapsed/loop rings, Timeline/Report views, activity-log loop accounting, compact/expanded timeline cards, and session reopening.
  - Chart and fate entries require an image; movements require text and accept an optional image.
  - Session entry images are stored in IndexedDB, with base64 fallback.
  - The session dashboard has Patterns, Scenarios, and Positions tabs. Pattern stages resolve against the live Pattern Registry and normalize legacy string/object stages to stable IDs.
  - Scenario probability is append-only in `probabilityHistory`; pattern completion gates the position protocol against each pattern's own threshold.
  - The second-stage fate summary records move/spike direction, lessons, structured local analysis, scenario outcomes, and carry-forward text for the next session.
  - The library replaces design placeholders with stored sessions when real records exist. It resolves the newest image entry through `TradeJournalImageStore`, revokes object URLs on rerender, and exposes open, report, reopen, duplicate, and delete actions through `TradeJournalWorkspace`.
  - Closing and summarizing a session upserts a global `SessionSignature`. A one-time idempotent backfill scans all four character stores, while deliberately skipping open or unsummarized sessions.
  - `TradeJournalSessionSignatureEngine.compare()` is deterministic: market 45%, movement-prefix similarity 35%, pattern overlap 12%, and strategy overlap 8%. `TradeJournalSessionSimilarityProvider` is the replacement seam for a future remote/AI implementation.
  - The Similar Sessions panel compares the live partial signature after every workspace refresh, displays the top three historical matches, and shows a non-blocking alert above the configurable threshold (70% by default).
  - Session chart/summary AI is currently local deterministic demonstration logic, not an API call.

### 7.6 Pattern Registry

- **Purpose:** Define reusable market-recognition patterns with stages, thresholds, reference images, and pattern-specific AI training.
- **Files:** `pattern-registry.types.js`, `pattern-registry-store.js`, `pattern-registry-i18n.js`, `pattern-registry-ai.js`, `pattern-registry.js`, `pattern-registry.css`.
- **Route:** list at `#strategies/patterns`; per-pattern tabs at `#strategies/patterns/{id}/{details|chat|report|sharing}`.
- **Dependencies:** IndexedDB image store, Panel Layer, session scenarios, Trade Store usage links, AI server.
- **Important details:** Search is debounced and list rows navigate to a profile without changing editor behavior. Details preserve drag reorder, up/down controls, multi-upload, notes, lightbox, 15 MB validation, auto-save, and manual save. Chat remains pattern-scoped. Report aggregates scenarios from all character stores and linked trades through `TradeJournalTradeReports`; insufficient datasets render localized “insufficient data” text instead of fabricated zeroes. Sharing now has real behavior: checking `isPublic` opens the marketplace publish flow (Section 7.15), snapshotting this pattern's content and real `scenarioReport()` evidence into a new listing - it's no longer just a flag behind "coming soon" copy. Scenario selection stores a snapshot so old sessions remain readable even if the registry later changes.
- **Server-backed as of Section 7.18 Module 2:** `localStorage` (`tradejournal:patterns:v1`) is now a write-through cache of the server-canonical `patterns`/`pattern_stages`/`pattern_screenshots`/`pattern_chat_messages` tables, not the sole source of truth - every public method on `TradeJournalPatternStore` keeps its exact existing signature and stays synchronous; see 7.18 for the sync design, including how the 8 seeded-default patterns are kept from duplicating a different browser's already-synced real ones on first activation.

### 7.7 Multi-strategy Education

- **Purpose:** Manage multiple independent execution/risk playbooks, each with its own AI training, reports, detection history, and trade links.
- **Files:** `strategy-education.types.js`, `strategy-education-store.js`, `strategy-education-i18n.js`, `strategy-education-ai.js`, `strategy-education.js`, `strategy-education.css`, `strategy-education-extras.css`.
- **Route:** list at `#strategies/education`; per-strategy tabs at `#strategies/education/{id}/{details|chat|report|sharing}`.
- **Dependencies:** Pattern Registry's shared visual primitives, IndexedDB image store, AI server, Trade Store/UI, scenario cards.
- **Important details:** The legacy singleton is migrated once without deleting its old key. Every strategy independently owns Position Management, Risk & Capital, Overall Framework, attachments, chat history, AI summary, and detection events. List toggles control selector visibility only. Deleting a strategy sets linked trades' `linkedStrategyId` to `null` and never deletes trades. The report tab filters unified trades by strategy ID and combines them with a configurable 72-hour detection funnel. Sharing now has real behavior: checking `isPublic` opens the marketplace publish flow (Section 7.15), snapshotting this strategy's content and real `detectionStats()` evidence into a new listing - it's no longer just a flag behind "coming soon" copy. AI-from-event uses preview/approve and stores `origin: 'ai_from_event'`. `getRiskDefaults(strategyId)` and `getPositionGuide(strategyId)` never choose a strategy implicitly.
- **Server-backed as of Section 7.18 Module 3:** `localStorage` (`tradejournal:strategies:v2`) is now a write-through cache of the server-canonical `strategies`/`strategy_attachments`/`strategy_chat_messages`/`strategy_detection_events` tables, not the sole source of truth - every public method on `TradeJournalStrategyStore` keeps its exact existing signature and stays synchronous; see 7.18 for the sync design. Only image-type attachments sync to the server today - non-image attachments (pdf/txt/docx) stay local-only, since the shared storage module only validates image data URLs.

### 7.8 Trade calculator

- **Purpose:** Solve interdependent price, risk, position, leverage, margin, fee, and target values and hand them to trade logging.
- **Files:** `trade-calculator.js`, calculator portions of `trade-ui.js`, `trade-system.css`.
- **Dependencies:** Trade settings and explicitly selected Strategy risk defaults.
- **Important details:** `solve(source, manual, defaults)` performs up to eight bidirectional passes while preserving manually locked fields. It calculates SL distance, risk amount/percent, position size, margin/leverage, isolated-margin liquidation, weighted multi-TP RR, round-trip commission, breakeven, commission-adjusted potential profit, and return relative to margin or position size. Insufficient results remain `null`, not `NaN`. The floating calculator button is mounted beside the existing chat launcher.

### 7.9 Trade logging wizard and emotion logging

- **Purpose:** Create a complete Trade record from any trade-launch point and append psychology observations throughout its lifecycle.
- **Files:** `trade.types.js`, `trade-store.js`, `trade-ui.js`, `trade-i18n.js`, `trade-system.css`.
- **Dependencies:** Calculator, Pattern Registry, image store, optional trend provider, AI trade-analysis endpoint.
- **Important details:**
  - The wizard has status, timeframe, observed concepts/patterns, emotions, and screenshot stages.
  - Quick logging skips later steps and applies a negative `disciplineImpact`.
  - Timeframes are `1m`, `5m`, `15m`, `1h`, `4h`, and `1D`.
  - `window.TradeJournalTrendAnalysisProvider` is injectable. Its current default `analyze()` returns an empty array, leaving manual trend entry usable.
  - Concept tags and Pattern Registry selections are stored on the Trade and update pattern usage.
  - Emotion logs are append-only, limited to three dominant emotions, with stress/focus/commitment normalized to 1–10.
  - Modal teardown supports close-button click/touch, backdrop click, Escape, and deterministic cleanup.
  - If a full trade has screenshots, `/api/trades/analyze` may attach `aiInitialAnalysis`; an unavailable endpoint does not prevent the trade from being saved.
- **Server-backed as of Section 7.18 Module 4:** `localStorage` (`tradejournal:trades:v1`) is now a write-through cache of the server-canonical `trades`/`trade_screenshots`/`trade_emotion_log` tables, not the sole source of truth - every public method on `TradeJournalTradeStore` keeps its exact existing signature and stays synchronous; see 7.18 for the sync design. This module also fixed the two named schema-drift bugs (`statusHistory`'s `{status,at}` → `{status,timestamp}`; `aiPredictionLinks`'s `matched` → `correct`).

### 7.10 Open Positions module and session integration

- **Purpose:** Render hunting/open trades consistently in panels and session workspaces, with lifecycle actions.
- **Files:** `trade-open-positions.js`, integration code in `trade-ui.js` and `session-card-updates.js`, styles in `trade-system.css`.
- **Dependencies:** Trade Store/UI, Panel Layer, session scenario `source` IDs.
- **Important details:** `TradeJournalOpenPositionsModule` exposes `render`, `mount`, `refresh`, and `listActive`. It registers one `open-trades` panel in both Dashboard and Sessions. Hunting records can become open or cancelled; open records can log emotions or close with exit-price/P&L calculation; every card links to trade details. Session rows resolve a trade by `source.sessionId` and `source.scenarioId`, so score sorting does not break identity.

### 7.11 Reports, trading calendar, and All Trades

- **Purpose:** Derive performance and activity views from the unified Trade store and provide complete trade review/edit access.
- **Files:** `trade-reports.js`, report/calendar/table styles in `trade-system.css`, Trade Store analytics, Trade UI details/editor.
- **Routes:** `#strategies/reports`, `#strategies/trades`.
- **Dependencies:** Trade Store, Pattern Registry names, Strategy tabs, psychology endpoint.
- **Important details:**
  - Shared filters cover week, month, quarter, all time, custom range, and pattern.
  - Metrics show total/status counts, detection-to-open-to-close funnel, pattern-tag share, and AI accuracy only when linked correctness data exists.
  - Equity, pattern win rate, funnel, activity, and AI accuracy are drawn directly on native canvas.
  - The calendar groups trades by local date, colors cells by daily P&L intensity, and opens a day's trade list.
  - All Trades filters by query, date, pattern, status, and direction and opens the common edit/detail dialogs. Its table includes a compact mood column (up to two dominant emotions from the trade's last `emotionLog[]` entry, display-only) between P&L and actions, clickable to the same detail view as the row's eye icon.
  - Psychology analysis sends only closed trades with emotion logs.

### 7.12 Market clocks and localized ranks

- **Purpose:** Keep global session clocks and character vocabulary accurate after language changes.
- **Files:** character `app.js` files and `panel-system.js`.
- **Dependencies:** browser `Intl` implementation and the level number already present in dashboard HTML.
- **Important details:** Clocks use IANA zones, not fixed offsets. Rank names are a seven-item character/language lookup. Neither ranks nor XP are currently computed from user activity.

### 7.13 Psychology page and Trading Mental Health Profile

- **Purpose:** Give a trader a longitudinal, self-reflection view of their own trading behavior, derived entirely from data the app already has (plus an explicit, skippable intake). This is a self-reflection tool, not a diagnostic or clinical instrument - every AI prompt and every piece of copy is written to avoid diagnostic language, and free-text input is screened for distress before anything else happens.
- **Files:** `psychology-store.js`, `psychology-ui.js`, `psychology.css` (the short-term `#mindset` page - emotional mirror, tag mirror, discipline streak/score, trade journeys, AI weekly narrative, protective-nudge settings); `mental-health.types.js`, `mental-health-i18n.js`, `mental-health-safety.js`, `mental-health-store.js`, `mental-health-collector.js`, `mental-health-cycle.js`, `mental-health-ai.js`, `mental-health-cards.js`, `mental-health-charts.js`, `mental-health-scheduler.js`, `mental-health-report.js`, `mental-health-continuous.js`, `mental-health-intake.js`, `mental-health-profile-page.js`, `mental-health.css` (the longer-term Trading Mental Health Profile).
- **Route:** the `#mindset` sidebar link (already present in every character's static HTML) is wired directly by `psychology-ui.js`, not through `panel-system.js`'s route table. The dedicated profile page is a **real hash route**, `#mindset/profile` (defaulting to the `intake` tab) and `#mindset/profile/{intake|psychological|continuous|redflags}`, following the exact `history.replaceState` + `layer.show(page,'psychology')` + regex `route()` + `hashchange` pattern already used by `pattern-registry.js` - not a modal overlay. The intake/post-trade/check-in popups remain self-contained overlays, not hash routes.
- **Dependencies:** Trade Store (`emotionLog[]`, `disciplineImpact`, `entryMode`, `closedAt`/`outcome`), `trade-ui.js`'s wizard and `closeTrade()` (small, defensive hooks - the feature works unchanged if these shared files are absent), `session-entry-flow.js`'s `TradeJournalEntryFlow.openEntry` (wrapped, never edited directly), the AI server.
- **Important details:**
  - The Psychology page's four tabs (Overview, Trade Journeys, AI Insights, Protective Settings) are local/deterministic except AI Insights, which calls `/api/trades/psychology-analysis`. `mental-health-ui.js` contributes two more tabs ("My Profile", "Growth Path") that `psychology-ui.js` only renders if that module is present.
  - The dedicated profile page (`mental-health-profile-page.js`) is opened via `TradeJournalMentalHealthProfilePage.open(tab)` from the launcher on "My Profile," and has its own four tabs: Intake, Psychological Profile, Continuous Tracking (now including a **pre-trade context** timeline card alongside check-ins/reflections/reports), Red Flags.
  - **"Baseline" is retired as an active gate/UI concept.** The assessment→formulation phase gate and the scheduler both now read `intake.completed`/`intake.completedAt` instead of `baseline.completed`/`baseline.assessmentDate`; the standalone baseline form, its summary card, and the "baseline vs now" comparison chart are all removed in favor of a small intake nudge shown until intake is completed. **The underlying `baseline` data itself is untouched** - `mental-health-report.js`'s archival display still reads it, and existing profiles are not migrated or deleted.
  - `TradingMentalHealthProfile.version` is `2`. Migration from v1 is additive only: `baseline`/`emotionalProfile` are left exactly as v1 wrote them, and `intake` is a new, parallel structure that everything gate-related now reads instead. Anything without a clean v2 home is preserved verbatim under `intake.legacyBaselineV1`, never surfaced in normal UI.
  - Demographics collects a `gender` field (choice-based, alongside marital status and occupation type, all converted from free text to `choiceField()` controls) and constrained numeric steppers for age/years-trading; markets traded combines a checkbox preset row (Forex/Crypto/Stocks/Commodities/Indices/Futures & Options) with the existing free-text "add another" chip flow into one de-duplicated list.
  - Two Tier-2 nudges from the original build - the standalone wizard-time revenge-trade warning and the passive open-positions cool-down card - were retired and unified into one Post-Trade Reflection popup (`mental-health-continuous.js`), triggered from `trade-ui.js`'s `closeTrade()` once a trade is actually closed, not while logging the next one. `psychology-store.js` no longer exposes `checkRevengeWarning`/`coolDownState`; the open-positions cool-down card now reads `TradeJournalMentalHealthStore.activeCooldownTimer()` against `continuousTracking.postTradeReflections`.
  - The monthly bias checklist (7 curated biases) is a separate, explicitly recurring flow (`openBiasChecklist()`), distinct from the one-time intake wizard and from the full 9-value `BiasType` enum used by auto-detection/education cards.
  - Auto-detected triggers, red flags, and bias-phase evidence are all deterministic and local (`mental-health-collector.js`); every surfaced item always carries the trade IDs or profile fields that justify it.
  - `mental-health-safety.js`'s `checkText()` is the single place distress language is detected; a flagged input both shows the calm, non-diagnostic card and records a `pervasive_distress_signs` red flag, so the mandatory professional-referral rule for `borrowed_money`/`escalating_revenge_trading`/`pervasive_distress_signs` is backed by real, queryable data rather than a one-off UI moment.
  - Conversational form-filling reuses Strategy Education's `StrategyFieldSuggestion` preview-and-approve pattern exactly: suggestions target a known-path allowlist (client `mental-health.types.js`, server `mentalHealthPaths`) and never auto-apply, including for the v2 intake fields and the scenario-assessment draft-response staging object.
  - Export (`mental-health-report.js`) is a `@media print`-friendly full view plus a raw JSON download button - there is no single-file PDF-generation library involved.
  - **Server-backed as of Section 7.18 Module 5 (final module):** `localStorage` (`tradejournal:mental-health-profile:v2`) is now a write-through cache of the server-canonical `mental_health_profiles` table, not the sole source of truth - every public method on `TradeJournalMentalHealthStore` keeps its exact existing signature and stays synchronous; see 7.18 for the sync design. Unlike every other migrated module, this one syncs a single whole-document profile, not a list of records with their own ids.

### 7.14 Global AI Assistant

- **Purpose:** One persistent, cross-page chat dock that can converse generally, drive any open form through its existing approval pipeline, and turn a pasted trade screenshot into a pre-filled Trade Wizard. The UI is the NAVRYA-design-system `ChatDock` (a fixed bottom-centre command bar with a reply popover, model quick-switch, and mascot), replacing the earlier corner-launcher-plus-panel `global-ai-dock.js` build entirely - the request/orchestration logic that build had is preserved almost verbatim in `chat-dock-core.js`, only de-coupled from its old DOM-building so it stays independently unit-testable and the new React UI can call into it directly.
- **Files:** `ai-process-registry.js`, `ai-settings-store.js`, `ai-usage-store.js`, `ai-settings-ui.js`, `ai-i18n.js`, `ai-settings.css`, `chat-dock-core.js` (the DOM-free fetch/mental-health-routing/screenshot-extraction logic, `window.TradeJournalChatDockCore`); the UI itself is `navrya-src/chatDockView.jsx` plus the component library under `public/pages/shared/navrya/components/assistant/` (`ChatDock.jsx`, `ChatResponsePopover.jsx`, `ModelSwitcher.jsx`, `DockButton.jsx`, `motion.js`), compiled into each character's `navrya-{character}-sessions-app.js` bundle (Section 2's NAVRYA design-system pilot) and mounted by `character-app.jsx` into `#navryaChatDockRoot`; server-side, the multi-provider gateway in `pattern-ai-server.mjs` (see section 8).
- **Dependencies:** `TradeJournalAIProcessRegistry` (every fillable flow registers against it), `TradeJournalTradeStore`/`TradeJournalTradeUI`/`TradeJournalTradeCalculator` (screenshot-to-wizard flow), `TradeJournalMentalHealthStore`/`TradeJournalMentalHealthAI`/`TradeJournalMentalHealthSafety` (therapist mode), the AI server's `/api/ai/*` and `/api/trades/extract-fields` routes.
- **Route:** AI settings live at `#ai-settings`, reached from the sidebar's existing "AI" link (`#assistantNav`) - the same manual hash-routing pattern already used by `#community` and `#mindset/profile` (`layer.show(page,'ai-settings')` + a manual `.sidebar nav a` active-class toggle, since `'ai-settings'` isn't in `panel-system.js`'s own `setActiveNav` map). Settings used to self-mount a card inside the generic Settings page (`.panel-settings`, via a `MutationObserver`); that mounting path is gone from `ai-settings-ui.js` entirely - this is a relocation of *where* the existing `buildSection()` UI renders, not a rewrite of what it renders.
- **Important details:**
  - **The sidebar's "AI" link does not open the chat dock.** It navigates to `#ai-settings` like any other sidebar item. The **only** way to open the actual conversation is the dock itself, always visible at the bottom of every character dashboard.
  - **The dock is mounted once per character page, alongside the header/sidebar React roots**, in `character-app.jsx`'s `mount()` - unconditional, not gated behind `sessionsAdapter.resetOnce()` like the session-scoped roots, since it holds no session data of its own. Its input pill carries `data-navrya-chat-dock`, the attribute `trade-ui.js`'s `ensureGlobalUi()` looks for to position the calculator FAB beside it.
  - **Universal process access (`ai-process-registry.js`):** any flow calls `register(processId, {allowlist, isOpen, activeStep, applyValue})` once, at the top of its own open-function. `isOpen()` is a plain DOM-presence check (or, for the React-component flows added since, a `mountedRef`/live-prop check - see below), so no flow needed new open/close event plumbing. Eight flows were registered originally: Trade Wizard and the emotion-log popup (`trade-ui.js`), pre-session check-in/post-trade reflection/monthly bias checklist (`mental-health-continuous.js`), the mental-health intake wizard (`mental-health-intake.js`), Pattern stage editing (`pattern-registry.js`), and Strategy field editing (`strategy-education.js`). Each `applyValue` uses whatever mutation mechanism that flow already has - a live closure over not-yet-persisted state for the first five, or the flow's own existing `store.applySuggestion` pipeline for intake/pattern/strategy - the dock never builds a second persistence path.
  - **Coverage was later extended to essentially every remaining form in the app** (`navrya-src/`): `trade-close-position`, `trade-calculator`, `publish-flow`, `messages-compose`/`messages-thread-reply`, `community-new-post`/`community-comment-{postId}`, `marketplace-rate-{listingId}`, `account-profile-identity`/`account-profile-role`, `session-entry-{id}`/`session-scenario-{id}` (`sessionEntryCardsView.jsx`), `live-session-chart-entry`/`live-session-fate-entry`/`live-session-fate-summary`/`live-session-entry-{id}`/`live-session-scenario-{id}` (`liveSessionView.jsx`, a second, parallel session workspace), and `settings-ai-panel-builder`/`settings-region-language`/`settings-trading-defaults`. Two proven templates, never a third: a `mountedRef`+`useEffect` registration routed through the component's own `useState` setters (the large majority - genuine singleton modals/tabs, mount/unmount already is the open/close signal), or a live-prop `isOpen` (e.g. `marketplaceView.jsx`'s `RatingsPanel`, `liveSessionView.jsx`'s `ScenarioEditor`) that re-registers on the relevant prop's own dependency array when the component itself stays mounted while collapsed. **Most importantly, `strategiesHubView.jsx`'s `StrategyDetailsTab`/`PatternDetailsTab` now register under the exact same `strategy-editor-{id}`/`pattern-editor-{id}` ids (and the same allowlists) the legacy `strategy-education.js`/`pattern-registry.js` files already used** - `panel-system.js` routes through `TradeJournalNavryaCanvas` first, so this hub, not the legacy DOM detail page, is what most users actually reach; without this, those two flows' AI-fill support risked never firing in practice. Deliberately left unregistered: `reportFlow.jsx`'s abuse-report reason field (an AI-drafted moderation report would undermine it as a genuine user signal) and `tradeDetailsModal.jsx`/`marketplaceView.jsx`'s storefront (view-only, or fully delegate to an already-registered flow).
  - **Multi-instance forms needed one registry-level fix.** `activeOpenProcess()` originally returned the *first* registered id whose `isOpen()` was true - correct while every flow was a singleton modal, ambiguous once several genuinely-simultaneous instances exist (`community-comment-{postId}`, `session-scenario-{id}`, `live-session-scenario-{id}`). `register()` now stamps each registration with a monotonic order counter; `activeOpenProcess()` picks the highest-order match among every currently-open registration instead of the first. Re-registering (which the live-prop pattern above does on every relevant render) bumps a process back to the front, so "most recently touched" wins - a strict superset of the old behavior, since a true singleton flow never has more than one open candidate for order to matter.
  - **Therapist mode** is an explicit toggle in the dock's button row (a `psychology`-icon `DockButton`), re-initialized from `ai-settings-store.js`'s `therapistModeDefault` on every page load rather than silently staying sticky. **On**, `chat-dock-core.js`'s `sendChat()` appends to the mental-health profile's own chat history and calls `TradeJournalMentalHealthAI.chat()` directly, so its unconditional `checkText()` safety gate still runs first, exactly as it does from the Psychology page's own chat card - a flagged message renders `TradeJournalMentalHealthSafety.renderSafetyCard()`'s real DOM node inside the reply popover (embedded via a ref, not re-implemented in JSX). **Off** (the default), it calls the provider-agnostic `/api/ai/chat` gateway with the current `activeOpenProcess()` and never touches `TradeJournalMentalHealthStore` at all.
  - **The model quick-switch** (`ModelSwitcher`, four glyph chips next to the add button) selects `ai-settings-store.js`'s active `provider` directly (`openai`/`anthropic`/`kimi`/`deepseek`) - the same catalog `#ai-settings` uses, just one click away instead of a full settings visit. Each engine renders its real mark from `public/pages/shared/navrya/assets/models/{id}.webp` (project-owner-supplied); OpenAI's and Kimi's black-on-white marks are knocked out to white (`model.knockout`) so they read on the dark dock, while Anthropic's and DeepSeek's already-coloured marks keep their own brand colour.
  - **Screenshot-driven trade entry** is explicit and click-initiated (choosing an image via the dock's add button), not auto-detected - consistent with every other AI trigger in the app. It calls `/api/trades/extract-fields` and shows a review card (in the same reply popover, `state="review"`) with Apply/Discard before anything touches the wizard; on Apply it runs the exact same three-call sequence the existing calculator's "Log Trade" button already uses (`store.createDraft` → `applyCalculatedToTrade` → `openWizard`), just fed by extracted values. Emotional content in the accompanying message is seeded onto `trade.emotionLog` before the wizard opens, reusing the wizard's existing pre-seeded emotions step. Unlike the retired build, one image is analyzed immediately on selection rather than queued behind a separate manual "Analyze" click - the new bar has no room for a multi-image attachment strip, and the artifact this UI is based on doesn't show one either.
  - Token usage is recorded from two places: the decorator over the three pre-existing AI clients, and explicit `TradeJournalAIUsage.record()` calls from `chat-dock-core.js`'s own two direct fetches (see section 8's "Usage tracking" note) - both are necessary for the usage totals to be complete.
  - **The dock is a real, continuing, server-synced multi-turn conversation, not a one-shot popover.** Originally every question replaced the previous answer and `ai-chat-history-store.js` treated "one question + its answer" as its own disconnected history card (local-only, `localStorage`) - both fixed in the same pass that added real per-user auth-backed persistence (`ai_chat_history`, above). `chatDockView.jsx` now tracks an `activeConversationId`: the first message of a fresh session calls `historyStore.startConversation(...)` (creates the row); every subsequent message in that same session calls `historyStore.appendExchange(conversationId, ...)` instead. `ChatResponsePopover.jsx` renders the accumulating `messages` list as a real scrollable thread (auto-scrolling to the latest turn) rather than a single flat `lines[]` snapshot, mirroring the exact pattern `strategy-education.js`'s/`pattern-registry.js`'s/`mental-health-ui.js`'s own chat views already established for their own `chatHistory` arrays. Two new dock actions: **New Chat** (`DockButton`, clears the thread and the conversation id) and **History** (a compact resume dropdown over `historyStore.listFor(provider)` - full browse/rename/delete stays on the AI Assistant screen, `aiAssistantView.jsx`, whose own `ChatRow` list gained a "Continue in dock" action that hands the conversation id to the dock via a `tradejournal:ai-resume-conversation` `CustomEvent`, the same cross-root-sync convention `tradejournal:ai-settings-changed` already established for provider selection). A history-sync failure is always best-effort and never blocks or changes the actual AI reply the user is waiting on (mirrors `ai-usage-store.js`'s `reportToServer()`).
  - Therapist-mode dock messages are unaffected by any of this - they already persist as a real, continuously-growing thread inside the mental-health profile's own `chatHistory` (`mental-health-ui.js`'s `chatCard()`), a separate, pre-existing system this redesign deliberately left untouched.
  - The now-redundant per-page "fill by chat" launcher button in the intake wizard's welcome step was removed (the dock supersedes it); the intake chat surface itself is untouched.
  - **This section describes the ChatDock as it existed through the "fill an already-open form" era.** Four later journeys (below, Section 7.19) built real conversational *actions* on top of this same dock/process-registry foundation - the dock can now discover and start a brand-new flow from a plain sentence ("Start a New York session"), enforce real deterministic safety rules before a risky field ever reaches the UI, and answer real product questions grounded in NAVRYA's own current architecture - all additive, all still calling into the exact `TradeJournalAIProcessRegistry`/`chat-dock-core.js` machinery documented here.

### 7.15 Community (social feed, marketplace, messaging)

- **Purpose:** The first server-backed feature in the app - a social feed, a marketplace where patterns/strategies can be listed with real evidence stats and purchased (mock transactions only), and scoped buyer/seller messaging. Everything else in the app remains local-first (Section 3); Community had to be server-backed because a post, a purchase, or a message is inherently visible to more than one browser.
- **Files:** browser: `dev-user-switcher.js/.css`, `community.types.js`, `community-i18n.js`, `community-store.js`, `marketplace-ui.js/.css`, `messages-ui.js/.css`, `community-ui.js/.css`; server: everything under `server/db/` and `server/community/`, plus `server/community-api-server.mjs` (see Section 4 for the full breakdown).
- **Route:** `#community` (repointed from the previously-dead `#forum` sidebar link — the `forum` i18n label itself is unchanged), with `#community/feed[/:postId]`, `#community/marketplace[/:listingId]`, `#community/messages[/:threadId]` — mounted via `layer.show(page,'community')` plus a manual `.sidebar nav a` active-class toggle (the same pattern `mental-health-profile-page.js` already established for a route outside `panel-system.js`'s `setActiveNav` map).
- **Dependencies:** `TradeJournalPanelLayer`, `TradeJournalDevUserSwitcher` (identity bootstrap before any community view renders), the `/api/community`, `/api/marketplace`, `/api/messages`, `/api/users` endpoints (Section 4). The marketplace's publish flow additionally depends on `TradeJournalPatternStore.scenarioReport()` and `TradeJournalStrategyEducationStore.detectionStats()` for real evidence numbers.
- **Important details:**
  - **The Pattern/Strategy "sharing" tabs now do something real.** Both `pattern-registry.js`'s and `strategy-education.js`'s `sharingView()` used to just flip a local `isPublic` flag behind "coming soon" copy. Checking the toggle now opens `marketplace-ui.js`'s shared `openPublishFlow()` modal, which snapshots that specific pattern's/strategy's current content plus its real evidence numbers (`scenarioReport().occurrenceRate`/`.detectionCount` for a pattern, `detectionStats().confirmationRate`/`.total` for a strategy — the exact same numbers their own report tabs already show, never fabricated) into a new `marketplace_listings` row. The sharing tab shows a live "listed on marketplace" status with Edit/Refresh-evidence actions once published. `sharingSoon`/`comingSoon` copy is now only shown as the defensive fallback if the marketplace module fails to load.
  - **Storefront cards never show a bare percentage.** Success rate is always paired with the underlying sample size on the same line (e.g. "78% · 42 trades") and a derived failure rate — the same "insufficient data over fabricated numbers" standard already applied everywhere else in this app (Pattern/Strategy reports, trade psychology dashboards).
  - **Purchases are always `mock: true`.** No real payment integration exists; `marketplace_purchases.mock` has a DB `CHECK (mock = TRUE)` constraint so this can never silently drift even if a future client bug tried to send otherwise.
  - **Ratings require a real purchase**, enforced at the database level via a composite foreign key from `marketplace_ratings(listing_id, buyer_id)` to `marketplace_purchases(listing_id, buyer_id)`, not just an application-layer check.
  - **Messaging threads are always anchored to a listing** (`dm_threads.listing_id`), never a general-purpose inbox between arbitrary users - this narrows the abuse surface for the first version.
  - **Reporting exists from day one** (posts, comments, listings, messages all have a "Report" action writing to the `reports` table) even though there is no moderation queue/admin UI yet to act on them (see Known Constraints) - adding the capability after abuse has already happened would be much harder than building it in now.
  - Uploads (post images, listing screenshots) reuse this app's existing convention (base64 data URL in the JSON body, `image/*` + 15MB validation) rather than introducing multipart/`multer`.
  - **Dev-mode account creation now happens at login, gated specifically on character selection, not from Settings.** `public/pages/select/app.js` (the character chooser) wires the name step to each character card's own Select button, not to the page's decorative login buttons: for a fresh browser (no `tradejournal:dev-user-id` in `localStorage`), clicking a character's Select button opens a one-field "what should we call you" popup and holds that click's card as `pendingCharacterCard` instead of completing the selection; only after `dev-user-switcher.js`'s exported `createUser()` resolves (the one and only place a user is ever created - `select/app.js` does not duplicate the `POST /api/users` call) does that exact character's selection complete. A returning browser (id already stored) is unaffected and completes the selection immediately, same as before this feature existed. The "Continue with Google/Email/Sign up" buttons on the same page were never part of this gate - they only show a front-end demo toast. A failed create leaves the popup open with a diagnostic message distinguishing "the request never reached a server" (`TypeError` - the Community backend likely isn't running; points at `npm run dev:community-api`, documented in the root `README.md`) from "a server responded and rejected it" (shows the real server error code inline). The Settings-page card (`dev-user-switcher.js`'s `buildCard()`) is now switch-only - its "create a new user" inputs were removed, since that path is what was actually broken (see Known Constraints for what was wrong with it).

### 7.16 Admin Panel

- **Purpose:** An operator surface for the Community backend - who has signed up, server-side AI provider keys/pricing/budgets, basic infrastructure health, marketplace moderation (delist/feature), and a mock-revenue/AI-cost financial view. It's the first feature in this app built specifically for operators rather than traders.
- **Files:** browser: `public/pages/admin/{index.html,app.js,styles.css}` (a standalone top-level page, structured like `public/pages/select/` - own neutral CSS tokens, own inline 4-language `translations`, no `--ps-accent`/character theme, no `TradeJournalPanelLayer`), plus `public/pages/shared/admin-heartbeat.js` (loaded on the four character pages, not the admin page itself); server: `server/admin/{auth-admin.mjs,routes.mjs}`, `server/community/routes.internal.mjs`, the `004_admin.sql` migration, and the `sessions`/`usageEvents`/`providerPricing`/`adminKeys`/`auditLog` additions to both repo files (Section 4).
- **Route:** **`#/admin` is an outer-shell route** (`src/release.js`'s `pages` map and `pageFromHash()`), not a character-iframe route - the admin page is its own iframe, loaded the same way `select/index.html` is. Reaching it from inside a character page (the Settings-page discoverability link, in `dev-user-switcher.js`'s card) requires `target="_top"`, since a plain same-document `<a href="#/admin">` would only change that character iframe's own internal hash and never navigate the real browser URL - there's no existing generic cross-iframe navigation contract in this codebase (the only precedent, `select/app.js`'s character-selection `postMessage`, is narrowly single-purpose). Once on the admin page itself, its six tabs are hash-routed *inside that page's own document* at `#/admin/{users|ai|technical|xp|marketplace|financial}` - a second, independent hash from the outer `#/admin`, the same two-level relationship `#mindset/profile/intake` already has relative to the outer `#/dashboard/hunter`.
- **Dependencies:** `TradeJournalDevUserSwitcher` (identity bootstrap - the admin page still authenticates via the same `x-dev-user-id` header as every other Community route, `requireAdmin` only adds a role check on top of `devUserAuth`), the `/api/admin/*` and `/api/users/heartbeat`/`/api/users/usage-report` endpoints, and (server-side only) `server/pattern-ai-server.mjs`'s internal call to `/internal/admin-ai-keys`.
- **Important details:**
  - **Admin auth is built but disabled by default.** `server/admin/auth-admin.mjs`'s `requireAdmin(repo)` mirrors `auth-dev.mjs`'s exact `(repo) => (req,res,next) => {...}` shape. Gated by `ADMIN_AUTH_ENFORCED` (default unset/`false`, logged loudly either way at startup): disabled, `req.currentUser` (already resolved by `devUserAuth`, which always runs first) is treated as admin with no role check; enforced, a non-`admin`-role user gets `403 ADMIN_ROLE_REQUIRED`. The public `GET /api/admin/config` (`{authEnforced}`, mounted before `devUserAuth` so it needs no identity at all) is what the admin page's own login/gate screen reads to decide between showing a "TEST MODE" banner + "Continue in test mode" button, or a real login gate - the same frontend code works unmodified once enforcement is flipped on later.
  - **Server-side AI keys are stored as plain text in `admin_ai_keys`, never sent back to the browser.** `GET/POST /api/admin/ai/keys` only ever returns `{provider, isSet, updatedAt}` - the raw `apiKey` column is read server-side in exactly one place, `server/community/routes.internal.mjs`'s `/internal/admin-ai-keys`, which only `pattern-ai-server.mjs` calls (protected by an optional shared-secret header, `INTERNAL_API_SECRET`, left open in local/zero-setup dev consistent with this app's existing "both servers bind to 127.0.0.1 only" stance). No encryption-at-rest exists yet - see Known Constraints.
  - **The AI gateway (`pattern-ai-server.mjs`) still never touches Postgres directly.** Its `callProvider`'s key resolution gained a middle tier - **client override → admin-configured key (fetched from the Community API's `/internal/admin-ai-keys`, cached in memory for 60s) → `.env` var** - implemented as a small internal HTTP call rather than a second `pg.Pool`, specifically to preserve the AI gateway's documented DB-free property. On any failure to reach the Community API, this soft-fails to the last-known-good cache (or empty on first failure) and falls through to the `.env` tier - an admin-set key simply isn't seen until the Community API is reachable again, it never breaks the AI feature itself.
  - **Heartbeat-based presence, not a general analytics platform.** `admin-heartbeat.js` posts to `POST /api/users/heartbeat` every 45s from any character page (covers the dashboards, Community, and the Mental Health profile, since all three are hash-routes inside the same character iframe - one script tag per character page is enough). `repo.sessions.heartbeat(userId)` finds-or-creates one open (`ended_at IS NULL`) session per user; `repo.sessions.sweepStale(135000)` (3x the heartbeat interval) runs lazily at the top of `GET /api/admin/users`, no cron. "Online" = an open session heartbeated within that window; "hours online" sums `COALESCE(ended_at, last_heartbeat_at) - started_at` across all sessions.
  - **The Financial tab never fabricates a number.** Mock marketplace revenue is explicitly labeled `mock: true` in the API response itself, not just in UI copy. AI cost-by-provider and remaining-budget-by-provider each return `{cost: null, reason: 'NO_PRICING_SET'}` / `{remaining: null, reason: 'NO_BUDGET_SET'}` per provider until an admin configures pricing/budget for it via the AI tab - the same "insufficient data over fabricated numbers" standard already applied to Pattern/Strategy reports, trade psychology, and marketplace storefront cards.
  - **Every mutating `/api/admin` route writes exactly one `admin_audit_log` row** (`action`, `target_type`, `target_id`, `details`) - implemented as one `audit()` helper called explicitly at the end of each handler, deliberately excluding key material from `details` even when the mutation is "set an AI key."
  - **The XP & Segmentation tab was a deliberate placeholder through 7.17, and is now a real, DB-backed rule editor (Section 11.19).** A trader's own level/XP/achievements/subscriptions still surface only in the Users tab's per-row detail view (below), unchanged - this tab is specifically for editing the XP *rules themselves* (point values, caps, mastery-gate thresholds), not for browsing individual users. "User segmentation" (cohort analytics) is still not implemented; only the rule-editing half of this tab's name is real.
  - **The Users tab's expandable detail row (per user) is a superset of role/suspend now.** `userDetailRow()` in `app.js` fetches the fully-enriched `GET /api/admin/users/:id` (7.17: identity, KYC status + an editable dropdown wired to `PATCH /api/admin/users/:id/kyc`, product `profile_role`, level/XP, a compact achievements list, a compact subscriptions list) rather than reusing the lightweight row already in the `GET /api/admin/users` list response - the list response deliberately stays lightweight (paginated, sortable, no per-row join cost) and the one-time detail fetch only happens for the single row a support agent actually expands. It now also lists that one user's token usage broken down **by provider** (`usageByProvider`, from `repo.usageEvents.aggregateByUserAndProvider(userId)`), not just the list row's single lifetime total.
  - **Per-provider AI health tracking (7.16 follow-up).** `ai_provider_health_events` is a new append-only log (`016_ai_provider_health.sql`, `repo.<backend>.providerHealth`) of every `callProvider()` outcome in `pattern-ai-server.mjs` - success or failure, with `latencyMs` and a real `errorCode` (`OPENAI_401`, `*_API_KEY_MISSING`, a timeout message, etc.), plus a short `source` label (`'trades.analyze'`, `'ai.chat'`, ...) identifying which of the 12 gateway endpoints made the call. Reported via a new, fire-and-forget internal route (`POST /internal/ai-health-event`, same shared-secret shape as `/internal/admin-ai-keys`) so the gateway's DB-free property is preserved - a health-report failure/timeout can never delay or change the real AI response. `GET /api/admin/ai/health` derives a per-provider status at read time (`unconfigured`/`unknown`/`healthy`/`degraded`/`idle`/`disconnected` - never stored) from the latest event plus a rolling 24h window, and returns a flat `recent` feed (last 50 events, all providers) for the AI tab's activity table. The AI tab additionally gained a "Test now" per-provider action (calls `/api/ai/test-connection` with no key override, so it resolves through the exact same admin-configured/env tier a real trader call would, then re-reads health), a 14-day usage trend, and a top-users-by-tokens table (reusing `GET /api/admin/users?sort=totalTokensUsed`, no new join logic).
  - **`ai_usage_events.source` is now populated for every gateway endpoint, not just 9 of 12.** `/api/trades/analyze`, `/api/trades/psychology-analysis`, and `/api/ai/test-connection` previously never recorded a usage row at all; `chat-dock-core.js`'s two direct calls (`/api/ai/chat`, `/api/trades/extract-fields`) previously recorded `source: 'unknown'`. All five now pass an explicit, namespaced source string, matching the `namespace.method` shape `ai-usage-store.js`'s `decorate()` already auto-derives for the three legacy AI clients.

### 7.17 Account Profile (XP, levels, achievements, subscriptions, KYC)

- **Purpose:** The first *real* XP/level/achievement system in this app, server-backed so the Admin Panel can see it (Section 4's `users`/`user_xp_events`/`user_achievements`), with a trader-facing profile page inside each character dashboard as the surface. Separate concern from the still-purely-decorative dashboard-header XP ring (`.level-ring b`, unchanged, still static presentation data - see Known Constraints) and from KYC/subscriptions, which reuse existing server-backed pipelines rather than inventing new ones.
- **Files:** browser: `profile-xp-rules.js`, `profile-achievements.js`, `account-profile.types.js`, `account-profile-i18n.js`, `account-profile-store.js`, `account-profile-ui.js`, `account-profile.css` (all under `public/pages/shared/`); server: `server/community/xp-rules.mjs`, `server/community/achievement-rules.mjs`, `server/community/routes.profile.mjs`, the `xpEvents`/`achievements` repo domains and extended `mapUser()` (Section 4), the `005_account_profile.sql` migration, and the `GET /api/admin/users/:id` enrichment + `PATCH /api/admin/users/:id/kyc` in `server/admin/routes.mjs` (7.16).
- **Route:** `#account/profile[/identity|level|achievements|subscriptions|role]`, mounted via `layer.show(page,'account-profile')` - the same "route outside `panel-system.js`'s `setActiveNav` map" pattern `mental-health-profile-page.js` and Community already use, with `route()`/`render()`/`open(tab)`/`history.replaceState`/a `hashchange` listener/an initial `setTimeout(render,0)` copied from `mental-health-profile-page.js`'s exact shape.
- **Sidebar entry point: the existing `.user-chip` button, not a new sidebar link.** Every character's sidebar already ends with a `<button class="user-chip">` showing static per-character flavor text (avatar image, a title, a subtitle) - given `id="userChip"` on all four character pages, it is now populated on load with the real signed-in user's `displayName`, `Level {n}` (from `profile-xp-rules.js`'s `levelForXp(xpTotal)`), and `avatarDataUrl` (falling back to the existing character-hero image if none is set), and wired to navigate to `#account/profile` on click. This was a deliberate, user-directed change from an earlier plan to add a new sibling sidebar `<a>` - the existing chip already occupied exactly the right spot.
- **Dependencies:** `TradeJournalPanelLayer`, `TradeJournalDevUserSwitcher` (identity), the `/api/users/me/profile`, `/api/users/me/xp-events`, `/api/users/me/achievements`, `/api/users/me/subscriptions` endpoints (Section 4). XP/achievement triggers additionally read (never duplicate) `TradeJournalTradeStore`, the per-character `tradejournal:sessions:v1:{character}` localStorage key, `TradeJournalMentalHealthStore`, and two new `community-store.js` events (below).
- **Important details:**
  - **`profile_role` (`trader`/`mentor`/`teacher`) is completely separate from the admin `role` column (`user`/`moderator`/`admin`) and is never conflated with it anywhere - two different columns, two different purposes, two different i18n key namespaces (`role*` vs `profileRole*`) even in the Admin Panel's own translations object.** The Role tab explicitly labels this "a product label you choose for yourself, not a verified credential."
  - **KYC is a manual, admin-only 4-state status** (`not_started`/`pending`/`verified`/`rejected`) - there is no real identity-verification provider integrated. `repo.users.updateKyc()` is the *only* code path that ever writes `kyc_status`; the trader-facing `PATCH /api/users/me/profile` structurally never reads `kycStatus` from its request body (not merely stripped - never looked at), and `repo.users.updateProfile()`'s own column list cannot write that column either way. Two independent layers, not one.
  - **XP points and achievement evidence are never trusted from the client.** `POST /api/users/me/xp-events` clamps `points` down to `POINTS_BY_TYPE[type]` (`xp-rules.mjs`) regardless of what the client sends - a client requesting 999999 XP for a `trade_closed` event is still only credited 5. `POST /api/users/me/achievements/:key/unlock` independently re-validates the submitted `evidence` against that achievement's own `minEvidence()` rule (`achievement-rules.mjs`) before granting anything - e.g. `ten_trades_closed` requires `evidence.tradeIds.length >= 10` server-side, not just claimed.
  - **XP/level thresholds and per-type point values are declared once each in two files kept in sync by a test, not one shared module** - `public/pages/shared/profile-xp-rules.js` (browser) and `server/community/xp-rules.mjs` (server) are independent, byte-parallel declarations (this project has no browser/server shared-module bundling), and `tests/account-profile-xp-rules-sync.test.mjs` fails loudly the moment one is edited without the other. 7 levels, thresholds `[0,100,300,700,1500,3000,6000]` XP.
  - **`xp_total` is a maintained running column, not recomputed by summing `user_xp_events` on every read** - `repo.xpEvents.record()` updates it transactionally in the same call that inserts the event row, the same "maintain a running total rather than aggregate on read" choice `marketplace_listings.sample_size` already makes.
  - **`level_5_reached` is worth 0 XP on purpose** - it's a badge for *already having* 1500 XP; awarding additional points for reaching it would double-count the XP that got the trader there in the first place. It and `five_day_login_streak` (worth 40 XP, computed from `repo.sessions.consecutiveLoginDays()`) are the only two achievements marked `serverOnly: true` in `profile-achievements.js` - granted only as a side effect of `GET /api/users/me/achievements`, since neither is something a browser tab can fully observe on its own (cross-day login history, or a total that depends on server-clamped events from potentially-other sessions).
  - **XP/achievement triggers read existing stores fresh on every check, mirroring `mental-health-collector.js`'s `recompute()` discipline - no parallel copy of trade/session/listing data is kept.** `account-profile-store.js` reacts to the existing `tradejournal:trades-changed`/`tradejournal:sessions-changed`/`tradejournal:mental-health-changed` events plus two new ones this feature adds to `community-store.js` (`tradejournal:listing-published`, `tradejournal:listing-purchased`, dispatched from `createListing`/`purchaseListing` on success). A small per-trigger-type localStorage "already synced" ID set (e.g. `tradejournal:account-profile-xp-synced-trades:v1`) is this module's own bookkeeping to avoid re-awarding XP for the same real-world event across reloads - not a second copy of the underlying trade/session/listing data itself.
  - **Subscriptions are a `marketplace_listings.type = 'subscription'` row, riding the exact same `marketplace_purchases`/`mock:true` pipeline every other listing purchase already uses** - not a parallel billing system. `GET /api/users/me/subscriptions` is just `purchases.listByBuyer` joined to `listings.get` and filtered to `type === 'subscription'`.
  - **The bias-checklist-completion achievement's evidence source was originally a best-effort, unverified field-path guess - fixed during the Section 11 XP engine pass.** `account-profile-store.js`'s `biasChecklistCount()` now reads the real field (`profile.psychologicalProfile.biasChecklist.lastAssessedAt`, confirmed against `mental-health-store.js`) instead of the two originally-guessed paths (`psychologicalProfile.biasChecklistHistory` / a top-level `biasChecklistHistory`, neither of which actually existed in the store's shape) - the achievement now genuinely unlocks rather than silently never firing.
  - **Section 11 (below) replaced this system's original 4-event `POINTS_BY_TYPE` (`trade_closed`/`session_closed`/`listing_published`/`intake_completed`) with the full domain/dedupe/cap engine described there, while keeping `LEVEL_THRESHOLDS`, `xp_total`, and the achievements table exactly as built here.** The two legacy types are still declared (so old `user_xp_events` rows stay resolvable) but are no longer emitted by the client - `session_closed_with_summary`/`trade_closed_with_pnl` supersede them with real server-side ownership/state verification.

### 7.18 Global Data Sync (local-first-to-server migration) - **COMPLETE, all 5 modules**

- **Purpose:** Move every user's Pattern, Strategy, Trade, Session, and Mental Health records from being purely browser-local (Section 3) to also being server-backed in Postgres, so this data is durable across devices/browsers and reachable for analysis - the same motivation Community (7.15) already established for its own data, now extended to the rest of the app. This was a large, multi-module migration, built one module at a time, each left fully tested and documented before the next started, per its own build brief. **All five modules are complete and tested: Module 1 (Sessions + images), Module 2 (Pattern Registry), Module 3 (Strategy Education), Module 4 (Trade Store), and Module 5 (Mental Health Profile). Every feature described in Section 3 now has a server-backed counterpart; nothing remains purely local-first except BYO AI API keys, which are explicitly and permanently excluded (see below).**
- **Files (shared infrastructure, used by every module):** `server/storage/storage.mjs` (generalized from the Community-only `server/community/storage.mjs`, moved here - `category` replaces the old `subdir` name 1:1, same behavior); `public/pages/shared/sync-queue.js` (`window.TradeJournalSyncQueue`, the one offline-write outbox every module's store enqueues to - see below).
- **Files (Module 1 - Sessions):** `server/db/migrations/006_trading_sessions.sql`; the `tradingSessions` domain in `repo.pg.mjs`/`repo.memory.mjs`; `server/community/routes.trading-sessions.mjs` (mounted at `/api/sync/sessions`); the sync-registration block added to `session-workspace-logic.js` (top of the file, right after `list()`/`persist()`); the extended, additive `category` param on `TradeJournalImageStore.saveImage()` in `session-entry-flow.js`.
- **Files (Module 2 - Pattern Registry):** `server/db/migrations/007_patterns.sql`; the `patterns` domain in `repo.pg.mjs`/`repo.memory.mjs`; `server/community/routes.patterns.mjs` (mounted at `/api/sync/patterns`); the sync-registration block added to `pattern-registry-store.js` (right after `write()`); `addScreenshots()`'s `TradeJournalImageStore.saveImage()` call now passes `'pattern'` as its category.
- **Files (Module 3 - Strategy Education):** `server/db/migrations/008_strategies.sql`; the `strategies` domain in `repo.pg.mjs`/`repo.memory.mjs`; `server/community/routes.strategies.mjs` (mounted at `/api/sync/strategies`); the sync-registration block added to `strategy-education-store.js` (right after `write()`); `addAttachments()`'s `TradeJournalImageStore.saveImage()` call now passes `'strategy'` as its category, but only for image-type files (see below).
- **Files (Module 4 - Trade Store):** `server/db/migrations/009_trades.sql`; the `trades` domain in `repo.pg.mjs`/`repo.memory.mjs`; `server/community/routes.trades.mjs` (mounted at `/api/sync/trades`); the sync-registration block added to `trade-store.js` (right after `write()`); `addScreenshots()`'s `TradeJournalImageStore.saveImage()` call now passes `'trade'` as its category, unconditionally (every trade screenshot is already image-only, unlike Strategy Education's mixed attachments - see below); the two named schema-drift fixes (`trade-store.js`'s `statusHistory()` now writes `{status,timestamp}` instead of `{status,at}`; `trade.types.js`'s `aiPredictionLinks` JSDoc now declares `correct`, matching what `analytics()` already read); a small cross-module addition to `strategy-education-store.js`'s `orphanLinkedTrades()` (see below).
- **Files (Module 5 - Mental Health Profile, final module):** `server/db/migrations/010_mental_health_profiles.sql`; the `mentalHealthProfile` domain in `repo.pg.mjs`/`repo.memory.mjs`; `server/community/routes.mental-health.mjs` (mounted at `/api/sync/mental-health`, the only router that takes just `repo` - no `uploadsDir`, no `/images` route, since this feature has no user-uploaded files); the sync-registration block added to `mental-health-store.js` (right after `write()`, the single mutation funnel every one of this store's public functions already goes through).
- **Decisions from the original brief, written down here as instructed:**
  - **localStorage/IndexedDB become a write-through offline cache, not the source of truth - never "offline no longer works."** Every write still lands in localStorage first (instant, unchanged UI), then is pushed to the server in the background via the sync queue. Reads stay exactly as synchronous as they always were everywhere in this codebase (`list()`/`find()` never became `async`, and no calling module's public API changed) - "the read prefers server data when reachable" is implemented as **reconciliation ahead of read time**, not inside it: on page load and on the browser's `online` event, the client pulls the server's full list and merges it into the local cache (server wins per-record on conflict), so by the time any synchronous read runs, the cache already reflects the server's view as closely as the last successful reconciliation allowed. This was a deliberate choice over making every read async, which would have cascaded into every render function in `session-workspace-logic.js`/`session-entry-flow.js`/`session-card-updates.js` for no behavioral benefit the user would notice.
  - **BYO AI API keys are explicitly excluded from this migration and stay client-only**, per `ai-settings-store.js`'s existing design (Section 8/7.14) - a credential is not analysis data, and moving it server-side under the still-fake dev-mode auth (next bullet) would be pure added risk with no analytical benefit.
  - **Security flag - repeated here at full strength on purpose:** with all five modules now complete, the server holds the full breadth of a real user's sensitive data - trade history, session screenshots, pattern/strategy libraries, and their mental-health profile (intake, biases, red flags, chat history) - all reachable via the same still-spoofable `x-dev-user-id` header Community (7.15) already uses, with real authentication still explicitly deferred (see Known Constraints). **This app must not be deployed publicly until real authentication replaces the dev-mode header.** This was already true for Community; it is now true for the entire app's data, not just a subset - the risk this migration was always accumulating has now fully materialized, not reset.
  - **Sync-queue outbox storage is localStorage, not IndexedDB**, despite the original brief calling for an "IndexedDB-backed outbox." Deliberate substitution: outbox entries are small structured JSON (a session/pattern/trade payload plus a few fields), never raw image bytes - those still go through `TradeJournalImageStore`'s existing IndexedDB blob store, referenced by id, never embedded in an outbox entry. Using localStorage means `sync-queue.js` reuses the exact fake-localStorage sandbox this project's entire test suite already relies on (`tests/sync-queue.test.mjs`), instead of requiring a real or polyfilled IndexedDB (a new dependency this project has otherwise avoided everywhere) just to unit-test retry/backoff logic.
  - **New routes live under `/api/sync/*`, not `/api/sessions`, `/api/patterns`, `/api/strategy-education`, `/api/trades`, or `/api/mental-health`.** Those exact prefixes are already claimed end-to-end by `vite.config.js`'s proxy rules, routed to the AI-only gateway (`server/pattern-ai-server.mjs`, a different port/process, Section 8) for its existing analysis endpoints - reusing them here would either collide or require Vite to split sub-paths of the same prefix across two backends. `/api/sync/*` is one new prefix with one new proxy rule (`vite.config.js`), routed to the Community/Postgres server (port 8788) alongside `/api/community`, `/api/marketplace`, etc. - no ambiguity, and the AI gateway's documented "never touches Postgres directly" property (7.16) stays intact.
  - **Sessions are scoped by `user_id` alone in the new schema, not `(user_id, character)`.** The four separate `tradejournal:sessions:v1:{character}` localStorage keys were a client-storage-key artifact, not a real data boundary worth preserving server-side - `session-signature-store.js` already treats signatures as cross-character/global (one key, no per-character split, Section 7.5), so collapsing sessions the same way is more consistent, not less. `character` is still a real column on `trading_sessions` for filtering/display, just never part of a uniqueness constraint.
  - **The new `trading_sessions`/`trading_session_entries`/`trading_session_scenarios`/`trading_session_activity_log` tables are named "trading_*", never plain `sessions`.** `sessions`/`user_sessions` is already the Admin Panel's login/presence-heartbeat domain (7.16, `repo.sessions`) - a completely unrelated concept that happens to share the English word "session." Reusing that name for trading-journal sessions would have collided with `repo.sessions` on the very same repo object.
  - **Per-module upsert always deletes and reinserts every child row (entries/scenarios/activity log) wholesale, rather than diffing the incoming array against what's stored.** The nested arrays can freely add/remove/reorder between syncs; this is a background write (never the interactive save path a user waits on), so the extra round-trip inside one transaction costs nothing a user would notice, in exchange for never getting a diff subtly wrong.
  - **Every migrated module's images: the upload and the owning record's upsert are two independent, eventually-consistent operations, not one atomic step.** `TradeJournalImageStore.saveImage(id, blob, category)` keeps writing to IndexedDB synchronously exactly as before (unaffected either way), and - only when a `category` is given - separately enqueues the same blob (as a base64 data URL) to the sync queue under a `{category}-images` module (`'session-images'`, `'pattern-images'`, ...; the module name is derived from `category`, not hardcoded, since this one shared function now backs every migrated module's own image category). Once that upload resolves, its sender patches the resolved `/uploads/...` URL onto whichever local record still references that blob id and re-enqueues that one record, so the link reaches the server on the next sync round rather than requiring the image upload and the record save to be sequenced perfectly. A record created and never touched again keeps its image safely on the server disk either way; only its own back-reference (`image_url` on a session entry, or a pattern's screenshot row) may lag until something else about that record is saved.
  - **Module 2 refined the "first activation" sequencing Module 1 established, because Pattern Registry has a wrinkle Sessions doesn't: `seedPatterns()` auto-populates 8 default patterns into an empty local cache.** Blindly pushing local patterns up on first activation (Module 1's approach, safe there because Sessions has no auto-seed) would duplicate a different browser's already-synced real patterns alongside a fresh set of local defaults. So Module 2's `migrateOrAdopt()` checks the server *first*: if it already has patterns for this user, the local cache is replaced outright with the server's copy (`write(result.patterns)`); only if the server is genuinely empty does it push whatever local patterns exist - including the freshly seeded defaults - up as this user's starting set. This is a strictly safer sequencing that Module 1 could also adopt if a future need arises, but Sessions has no seeding behavior to protect against, so it wasn't required there.
  - **`usageCount`'s cross-character-session scan and `scenarioReport()`'s cross-store aggregation (`pattern-registry-store.js`) were deliberately left reading from the local `tradejournal:sessions:v1:{character}` caches, unchanged, rather than rewritten to query the server's `trading_session_scenarios` table directly.** Both functions are called synchronously, deep inside `normalize()`/report-rendering call chains; making them query the server would make them `async`, cascading into every caller in `pattern-registry.js` for the same reason Section 0's "reads stay synchronous" decision exists in the first place. Since Module 1 already keeps those same local session caches reconciled from the server in the background, these two functions transparently benefit from that freshness without any code change of their own - "simpler, not harder" is realized at the system level (no separate migration/sync logic needed for these two functions), not by making them hit the network inline. `trading_session_scenarios.pattern_tag_id` already has an index (added in Module 1, anticipating exactly this) if a later pass wants to add a real server-side aggregate endpoint instead.
  - **The one-time local-to-server migration is per-`(character, user)`, gated by a `tradejournal:sessions-migrated:v1:{character}:{userId}` localStorage flag, and pushes through the same idempotent upsert-by-id endpoint the regular sync path uses** - there is no separate "migration" code path on the server to keep correct, and re-running it (e.g. a second tab racing the flag write) is always safe by construction.
  - **`getRiskDefaults(strategyId)`/`getPositionGuide(strategyId)` (`strategy-education-store.js`) were deliberately left exactly as-is - explicit ID required, no implicit global default, reading synchronously from the local cache.** This is the same "no code change needed, benefits transparently from Module 1/2's reconciliation" reasoning as Pattern Registry's `usageCount`/`scenarioReport()` above, applied to a function whose *contract* (never silently choosing a strategy) was also an explicit, deliberate design decision from earlier in the project - Module 3 preserves both properties unchanged.
  - **Module 3's `addAttachments()` only syncs image-type attachments to the server; non-image attachments (pdf/txt/docx, all valid client-side per `allowed()`) stay local-only (IndexedDB blob + local record, exactly as before).** `server/storage/storage.mjs`'s `saveImage()` only ever validated `image/*` data URLs (Section 1) - genuinely supporting arbitrary file types server-side (validation, mime-allowlisting, storage-path conventions) is a real, separate expansion of that shared module that no module has needed until now, so it was deliberately left out of scope here rather than silently bolted on. `TradeJournalImageStore.saveImage(id, blob, category)`'s call site in `strategy-education-store.js` passes `'strategy'` only when `/^image\//.test(file.type)`, `undefined` otherwise - the existing local-only fallback path (already there for when the image store itself is unavailable) is what non-image files continue to use.
  - **A real bug was caught and fixed while wiring this module, not just a hypothetical risk: `strategy-education-store.js`'s `attachment()` factory rebuilds a fixed-field object on every `normalize()` call (unlike Sessions'/Patterns' equivalent normalization, which mutates existing objects in place without rebuilding them) - so the `'strategy-images'` sender's patched-in `fileUrl` would have been silently dropped on the very next save if `attachment()` weren't updated to explicitly carry it through, the same way it already does for `blobId`/`dataUrl`.** Worth re-checking this exact failure mode (a normalize/factory function that reconstructs an object from a fixed field list) before wiring image-URL patch-back into any future module.
  - **Module 4 fixed the two schema-drift bugs named in this module's build brief, at the source rather than papering over them at a read site.** `trade-store.js`'s internal `statusHistory(item,status,timestamp)` helper now pushes `{status,timestamp}` entries (was `{status,at}`); `trade.types.js`'s JSDoc now declares `aiPredictionLinks[].correct` (was `.matched`), matching what `analytics()` already read - so a currently-dead metric (`aiAccuracy` has always shown "insufficient data" in the Reports tab, because nothing has ever written an `aiPredictionLinks` entry under either name) at least has a single, internally-consistent field name going forward, ready for whichever future pass actually starts populating it. Both fields were confirmed (via a repo-wide grep) to have no other reader anywhere in the codebase, so renaming the runtime side for `statusHistory` and the doc side for `aiPredictionLinks` carried zero migration risk for existing data. Because both fields are stored as opaque jsonb on the `trades` row (see the migration file's reasoning), the server never re-encodes their field names - there is no second place left for this drift to reappear.
  - **`trades.linked_pattern_ids`/`trades.linked_strategy_id` are plain `TEXT`/jsonb, not foreign keys into `patterns`/`strategies`.** Same convention as `trading_session_scenarios.pattern_tag_id` (Module 1): a loose, application-level cross-reference between independent domain tables, not a hard DB constraint - avoids any migration-ordering dependency between the five modules and matches how `reports.target_id` already treats polymorphic references elsewhere in this schema.
  - **Since a strategy deletion can no longer rely on a DB-level `ON DELETE SET NULL` to keep a linked trade's `linkedStrategyId` in sync server-side (the point above), `strategy-education-store.js`'s existing `orphanLinkedTrades(strategyId)` function - which already walked `tradejournal:trades:v1` client-side and nulled out matching trades - now also calls `window.TradeJournalSyncQueue.enqueue('trades', trade.id, trade)` for each trade it just orphaned.** Without this, the server's copy of an orphaned trade would keep pointing at a deleted strategy id until that trade happened to be saved again for an unrelated reason. This is the one place Module 4 touches a file outside its own module.
  - **Every trade screenshot is already image-only by validation - `addScreenshots()` rejects any non-image file before it ever reaches the image store - so, unlike Strategy Education's mixed attachment types, there is no per-file category gating; `'trade'` is passed to `TradeJournalImageStore.saveImage()` unconditionally.**
  - **`screenshots` and `emotionLog` are each their own child table server-side (`trade_screenshots`, `trade_emotion_log`), not jsonb on the parent row, even though the repo.pg.mjs upsert already uses the established delete-then-reinsert pattern either way.** Screenshots need their own rows for the same blob-id/image-url correlation every other migrated module's images use. `emotionLog` gets the same treatment because Mental Health Profile (Module 5, below) was already anticipated to eventually want per-emotion fields (stage, stress level, timestamp) queryable in their own right, the same way the Pattern Registry report already queries `trading_session_scenarios` by name instead of reaching into a jsonb blob - in the end Module 5 still reads trade emotion data client-side only (see below), but the real columns cost nothing and remain available if a future pass adds a server-side aggregate. Every other nested/compound field (`takeProfits`, `commission`, `timeframeTrends`, `conceptTags`, `statusHistory`, `aiPredictionLinks`, `aiInitialAnalysis`) stays jsonb, since nothing queries into them individually today.
  - **Mental Health Profile is structurally unlike every other module: one profile document per user, not a list of records with their own ids - every one of `mental-health-store.js`'s ~15 mutation functions (`addMessage`, `addRedFlag`, `commitDraftTrigger`, ...) already funnels through a single `write(profile)` call, so that one call site is the only enqueue hook this module needed, unlike the create()/save()/remove() trio every list-shaped module required.** The server mirrors this: `mental_health_profiles` is one row per `user_id` (the primary key itself, not a separate generated id), and the entire client profile object is stored verbatim in a single `profile` jsonb column - see the migration file's reasoning for why splitting this into per-section columns or child tables (the pattern every other module used) would have added mapping surface across ~14 nested sections for no query benefit, since nothing anywhere queries into any of them individually.
  - **This is the only migrated module with no images anywhere in it, so `routes.mental-health.mjs` is the only router that takes just `repo`, not `(repo, uploadsDir)` - there is no `/images` sub-route.** It also has no `GET /:id`/`DELETE /:id` - there is exactly one profile per user, addressed implicitly by `req.currentUser.id` alone, never by a separate record id in the URL.
  - **Because there is no per-record id to merge by, "server wins on conflict" (the rule every list-shaped module uses during steady-state reconciliation) doesn't translate directly - it became "whichever copy's `lastUpdatedAt` is newer wins" instead.** A per-id merge is safe for a list because an unsynced local record and a synced server record can coexist side by side; a single-document profile has no such luxury - blindly preferring the server on every `online`-event reconcile would risk clobbering an offline edit made moments earlier. The one-time first-activation check (`migrateOrAdopt()`) is deliberately simpler and does NOT compare timestamps - it adopts the server's copy outright if one exists (same "adopt vs. push" sequencing as every other module), since a first activation has no prior local edit worth protecting yet by definition.
  - **`mental-health-store.js`'s internal `USER_ID = 'local-trader'` constant (an inert, hardcoded tag written into the profile JSON itself, unrelated to which dev-mode user is actually active) is left completely untouched by this migration.** Real ownership is enforced entirely server-side by `req.currentUser.id` (the same `devUserAuth` mechanism every other module already uses) via the `x-dev-user-id` header set at sync time - the profile blob's own internal `userId` field is never read or trusted for ownership, on either side. Reconciling that internal constant with the real multi-user identity system was out of scope for this migration (making the data server-backed), not something this pass silently fixed.
- **Migration complete: nothing from Section 3 remains local-only except BYO AI API keys, which are permanently excluded by design (see above), not merely not-yet-migrated.** `TradeJournalImageStore`'s public API (`saveImage`/`loadImageUrl`/`deleteImage`) is unchanged for every one of its existing call sites; only each migrated module's own call site (`session-entry-flow.js`, `pattern-registry-store.js`, `strategy-education-store.js`, `trade-store.js`) passes the new, optional third argument.

### 7.19 AI Copilot: Conversational Actions, Proactive Rules, and the Knowledge Base (Journeys A–D)

- **Purpose:** Four gated vertical slices, built in order, each fully working and real-browser-verified before the next started, that turned the ChatDock (7.14) from "fill an already-open form" into a real, context-aware action runtime: **Journey A** (discover and start a brand-new flow from a plain sentence - "Start a New York session"), **Journey B** (the same for trade planning - "I want to take BTC long"), **Journey C** (a deterministic proactive-safety layer that intervenes when a requested action conflicts with the user's own real rules or shows a verified behavioral-risk pattern), and **Journey D** (an application-owned Knowledge Base so the AI can explain NAVRYA itself, retrieve a user's own real records on demand, and answer product questions grounded in the real, current app rather than a model's general training). Full design detail lives under `docs/ai/` (`proactive-engine.md`, `signal-routing.md`, `deterministic-extraction.md`, `knowledge-base.md`, `context-builder.md`, `domain-registry.md`, `entity-relationships.md`) - this section is the map of what exists and how the pieces fit, not a restatement of each doc's own detail.
- **Files:** `ai-context-engine.js`, `ai-action-registry.js`, `ai-workflow-engine.js`, `ai-trade-actions.js` (Journeys A/B); `ai-proactive-engine.js`, `ai-signal-router.js` (Journey C); `ai-deterministic-extraction.js`, `ai-knowledge-registry.js`, `ai-user-memory.js`, `ai-context-builder.js` (Journey D) - all under `public/pages/shared/`, all the same classic-script `window.TradeJournal*` IIFE convention as every other shared module, loaded on all four character pages after `ai-process-registry.js` and before `chat-dock-core.js`. Three real `registerAction()` calls live in `navrya-src/character-app.jsx`: `session.create`, `trade.calculator`, `navigate.to`.
- **Core principle - the model interprets, NAVRYA decides:** every one of these four journeys keeps the LLM in exactly one role - turning natural language into structured field values and a conversational reply. Every decision that has to be reliable (which action matched, whether a required field is still missing, whether a requested risk conflicts with a real rule, which page a domain word refers to, what a user's own real Strategy/Session/Trade data actually is) is computed in plain, deterministic JS against real app data, never inferred by a model call.

**Journeys A/B - Context Engine, Action Registry, Workflow Engine**

- `ai-context-engine.js`'s `snapshot()` reads `window.TradeJournalNavryaStore.getState()` for `navigation.activeId`, the real live-session id (`TradeJournalNavryaLiveSession.getActiveSessionId()`), and the active Scenario (resolved from whichever `live-session-scenario-{id}` process is currently open, never a new state channel of its own) - `{navigation, activeEntities, workflow}`.
- `ai-action-registry.js`'s `registerAction({id, domain, description, aliases, requiredFields, optionalFields, riskLevel, available, open, normalizeField, submit, resultContext})` is a small, additive second registry alongside `ai-process-registry.js` (untouched) - `open()`/`submit()`/`resultContext()` only ever call real, already-existing entry points (`store.setActiveId()`, a process's own registered `submit()`, `openLiveSession()`), never a parallel persistence path. `catalogFor(context)` returns the subset whose `available(context)` is true, trimmed to exactly what the server-side model needs (never the functions themselves, which never leave the client).
- `ai-workflow-engine.js` is deterministic, in-memory, one-workflow-at-a-time slot state: `start(actionId, context)` opens the real UI and seeds `known`; `applyKnownFields(fields, context)` live-syncs each field straight into the real, already-open UI via `TradeJournalAIProcessRegistry.applyValue()` (no manual "Apply" click, unlike the pre-existing `suggestions[]` popover flow, which stays manual for its own use case) and recomputes `missing`; once `missing` is empty, a short cancelable grace window (`SUBMIT_GRACE_MS`, ~3s in production - long enough for a same-breath correction like "no wait, make that 5 minutes" to still land) elapses before it calls the action's own `submit()` then `resultContext()`. `pruneIfAbandoned()` clears a workflow whose target UI the user closed by hand before ever completing it, so a later, genuinely new request is still recognized.
- `chat-dock-core.js`'s `sendChat()` offers `availableActions` only when nothing is already open (`activeProcess`/`availableActions` are mutually exclusive server-side, matching an "ASK/DO/GUIDE" inference); a matched `action.id` starts the workflow and live-applies whatever the model already extracted this turn; a workflow already in flight auto-applies each further turn's `suggestions` the same way, instead of surfacing them for manual approval.
- **Registered actions today:** `session.create` (`requiredFields: [city, timeframe]`, targets `NewSessionDialog.jsx`), `trade.calculator` (`requiredFields: [direction, entryPrice, stopLoss, riskPercent, takeProfits]`, targets the real Trade Calculator - the one Trade UI surface with live `linkedStrategyId`/`linkedPatternIds`/source-session support), `navigate.to` (Journey D, below).

**Journey C - Proactive Rule Engine + Psychology Signal Router**

- `ai-proactive-engine.js`'s `evaluate({context, intendedAction, proposedFields})` runs five deterministic rules against real store data (`buildTradeContext()` reads `TradeJournalTradeStore`/`TradeJournalStrategyEducationStore`/`TradeJournalMentalHealthStore` live) under a five-level severity model - `INFO`/`NUDGE`/`WARNING` never block a field; `CONFIRM_OVERRIDE`/`BLOCKED` do, held back from the real, visible UI until an explicit confirm. Rule A (`strategy-risk-limit`) is the one most users will meet: a requested `riskPercent` above the linked Strategy's own real `maxRiskPerTradePercent` stages a pending confirmation instead of silently applying. `chat-dock-core.js`'s `runProactiveCheck()` runs this before every `applyKnownFields()` call; a pending confirmation resolves at the very top of `sendChat()`, **before the network call**, so a confirm/reject decision never depends on provider uptime.
- `ai-signal-router.js`'s `classify({text, context})` deterministically routes a trading-relevant emotional/behavioral signal in the message (never every emotional sentence - privacy-minimizing by construction) to one of `TRANSIENT`/`TRADE_LOG`/`SESSION_CONTEXT`/`PSYCHOLOGY_PROFILE`/`CHAT_ONLY`, gated first through the same `mental-health-safety.js` check every other psychology-adjacent text in the app already runs.
- Internal-only allowlist fields (`sourceSessionId`/`sourceScenarioId`/`pendingEmotionSignal`/`riskOverride` - set only by this orchestrator itself, never by the model) are filtered out of what `chat-dock-core.js` ever sends to the server (`modelFacingAllowlist()`) - found via real testing: sending them invited the model to "helpfully" fabricate its own diagnosis text into `pendingEmotionSignal`.

**Journey D, Section 0 - closing a real model-reliability gap deterministically**

- `ai-deterministic-extraction.js` recognizes a small, bounded set of high-confidence structured values (risk %, long/short, labeled entry/stop/target, known timeframes/Session cities, EN+FA) straight out of the user's own literal words, with zero network call, and merges it on top of the model's own extraction (deterministic wins for any path it found). Closes a real, observed gap: a model could intermittently decline to extract an obvious value it perceived as unsafe even under explicit instruction not to - verified 3/3 in real browser runs where the model declined every time and NAVRYA still recovered the exact value with zero retries. See `docs/ai/deterministic-extraction.md`.

**Journey D - the Knowledge Base (three layers, never collapsed together)**

- **LAYER A - product knowledge** (`ai-knowledge-registry.js`): 12 real, application-owned domain registrations (Dashboard, Sessions, Trade Planning, Strategies, Patterns, Reports, Psychology, AI Assistant, Community, Account, Settings, Character), each built by reading the real, current repository - not this document - with an honestly-documented `notes` field wherever the real UI has a gap (`reports` is legacy/unreachable from any current navigation; Community purchases are an explicit, disclosed mock). A deterministic, no-embeddings lexical `search()` matches a query's own words against each domain's curated `title`/`terms`/`entities` only (never free-text `description`, which was found to cause false-positive matches on generic prose words). `actionsKnowledge()` is generated live from the real Action Registry, never hand-duplicated. `npm run ai:knowledge:build`/`ai:knowledge:check` snapshot this registry into a versioned, content-hashed JSON artifact under `public/pages/shared/ai-knowledge/` for CI staleness-checking only - the running app always loads the live registry directly, never this generated file (see `docs/ai/domain-registry.md` for why).
- **LAYER B - user domain memory** (`ai-user-memory.js`): five structured retrieval functions (`getRelevantStrategies/Patterns/Sessions/Trades/PsychologyContext`), each resolving by explicit id/active-entity/name-match/recency against the real stores - never a bulk dump, never embeddings, never a guessed default when nothing resolves. `getRelevantPsychologyContext()` is the only function that ever touches Mental Health data, and reuses `ai-proactive-engine.js`'s own `buildTradeContext()` logic so there is exactly one real implementation of "what counts as a validated, current stress reading" - never the full profile, never `redFlags`/`intake`.
- **LAYER C - live runtime state**: `ai-context-engine.js`'s existing `snapshot()` (untouched) plus a small, additive `window.location.hash` read, since psychology/ai-assistant/community/account are hash routes `navigation.activeId` cannot express - gathered entirely inside the new Context Builder, never a change to the protected Context Engine.
- `ai-context-builder.js`'s `build({message, currentContext, activeStrategyId?, activePatternId?, activeTradeId?})` assembles the smallest sufficient package for one turn: the current page's own domain always seeds the set, `search()` only ever *adds* domains the message's own wording clearly references, and LAYER B is only ever pulled for a domain actually selected. `debugLastPackage()` is a dev-only diagnostic (sanitized metadata, a rough `approxTokens` size estimate, never raw content).
- `navigate.to` (Journey D's third registered action) lets a Knowledge-informed answer turn into a real navigation - `store.setActiveId()`/`location.hash`, the exact same primitives the sidebar itself uses, never arbitrary DOM mutation - restricted to the 9 domains that actually have one real navigable page (`reports`/`trade-planning`/`character` are honestly excluded, matching their own documented gaps).
- **Product Q&A wiring:** `chat-dock-core.js` builds a context package on every non-therapist turn and sends it as `requestBody.productContext` (purely additive/best-effort - a page without the Knowledge Base scripts, or a `build()` throw, falls back to exactly pre-Journey-D behavior). `pattern-ai-server.mjs`'s `buildProductContextText()` renders it into the prompt under three literal `===`-delimited headers (`PRODUCT KNOWLEDGE`/`LIVE STATE`/`USER DATA`), with an explicit system-prompt sentence telling the model this block is read-only reference data, never an instruction, regardless of what any of it says - verified by test against malicious content injected into a Strategy's own data, a domain's own notes, and every real user-memory type.
- **The Knowledge Base is not a second source of deterministic proactive rules.** `ai-proactive-engine.js`'s rules still only ever check real, live store data; nothing in it reads from the Knowledge Base, and nothing in the Knowledge Base computes a risk/behavioral verdict.
- **A real, pre-existing bug found and fixed during this journey's own mandatory Journey A/B/C regression pass** (unrelated to the Knowledge Base itself): `panel-system.js`'s view-switch called `Element.remove()` on the outgoing panel, which does not run a React 18 `createRoot()` root's own unmount lifecycle - `settingsView.jsx`'s `TradingDefaultsSection` AI-process registration (`isOpen: () => mountedRef.current`) never actually closed after the first Settings visit, silently blocking all future chat-based action discovery for the rest of the page session. Fixed by having `renderDashboard()`/`renderStrategiesHub()`/`renderSettings()` stash their own root as `container._reactRoot`, and having `panel-system.js`'s `render()` call `.unmount()` on the outgoing panel's stashed root before detaching it.

### 7.20 AI Copilot: Realtime Voice (Journey E)

- **Purpose:** Adds OpenAI Realtime Voice (browser WebRTC) as a second input/output *channel* for
  the exact same Copilot runtime Journeys A-D already built - not a second AI brain, not a
  separate Session/Trade persistence path, and not a way for a model to bypass NAVRYA's own
  deterministic Action Registry/Workflow Engine/Proactive Engine. Full design detail, the complete
  bug list, per-language behavior, and deployment notes live under `docs/ai/` (`voice-architecture.md`,
  `voice-i18n.md`, `voice-testing.md`, `realtime-deployment.md`) - this section is the map of what
  exists and how it fits, matching Section 7.19's own convention.
- **Files:** `navrya-src/aiVoiceRealtime.js` (`window.TradeJournalAIVoiceRealtime`, the browser
  WebRTC transport adapter, built on the official `@openai/agents-realtime` npm SDK - a new
  dependency, not a hand-rolled WebRTC/SDP implementation), wired into `navrya-src/chatDockView.jsx`
  (the mic button that already existed as a cosmetic no-op now drives a real voice session);
  server-side, `mintRealtimeClientSecret()`/`POST /api/ai/realtime/session` in
  `server/pattern-ai-server.mjs`.
- **Core principle, one level more specific than 7.19's:** the Realtime session itself is given
  **zero tools** and an instruction that it must never answer, decide, or act - it is a
  transcription-and-playback transport only. A finalized spoken turn
  (`conversation.item.input_audio_transcription.completed` - never the interim `.delta` event, an
  absolute rule) is handed to `chatDockView.jsx`'s existing `submit()`, the exact function a typed
  message already goes through: same Context Engine snapshot, same Action Registry catalog, same
  Workflow Engine, same Proactive Engine, same Knowledge Base, same `activeConversationId`/
  transcript/popover state. Once that resolves with NAVRYA's own reply, the adapter tells the
  Realtime session to speak that exact text verbatim - never lets the model improvise its own
  answer. `turn_detection.create_response`/`interrupt_response` are both `false` at session-mint
  time specifically so the API only reports finalized turn boundaries; NAVRYA always decides
  whether and what to speak, never the model unprompted.
- **Ephemeral credentials:** the permanent `OPENAI_API_KEY` never reaches the browser.
  `mintRealtimeClientSecret()` resolves a key the same three-tier way `callProvider()` already
  does for every other AI route, then mints a short-lived (`ek_...`, 10-minute) client secret via
  OpenAI's current `POST /v1/realtime/client_secrets` endpoint, with the full session config
  (model, voice, audio format, transcription vocabulary hints, turn detection, instructions,
  `tools: []`) baked in server-side so a compromised browser session can't widen its own
  permissions by reconnecting with different options.
- **Voice replies are shorter than written replies.** Reading a full written-Q&A-length answer
  back verbatim via TTS took over a minute in real testing. `dockChat()` accepts
  `source: 'voice'` and, only then, its structured-output schema also requires a `voiceReply`
  field - a short, TTS-phrased rendering of the same answer, same language - alongside the
  unchanged `reply` (the written transcript entry is completely unaffected).
- **A pre-existing, cross-cutting bug this journey found (not voice-specific):**
  `ai-deterministic-extraction.js`'s extractors (timeframe, risk %, entry/stop/target, Session
  city) each returned the *first* regex/list match, not the *last* - so a self-correcting message
  ("15 minutes... no, 5 minutes," spoken **or typed**) could resolve to the superseded value even
  when the model's own extraction was correct, since a deterministic match unconditionally
  overrides the model's. Fixed with a shared `lastRegexMatch()` helper used by every extractor.
  See `docs/ai/voice-architecture.md` for the full writeup.
- **Four languages (English, Persian, Arabic, Spanish) - the same four `ai-i18n.js` already
  supports, reusing `document.documentElement.lang` directly; no separate voice-language
  preference exists.** See `docs/ai/voice-i18n.md` for the full per-language verification table
  and one real per-language bug (Arabic field values transliterated instead of staying in
  NAVRYA's own canonical English form - fixed at the prompt layer, so it generalizes to any
  language, not a hardcoded value map).
- **Verification status: all six planned gates (E0 connection, E1 Session Voice ×4 languages, E2
  Trade Voice, E3 correction+interruption, E4 Proactive Voice, E5 text/voice continuity) are
  complete, each verified against the real OpenAI Realtime API with real synthesized speech in a
  real browser - never a simulated text event standing in for audio.** Full methodology and the
  complete per-gate bug list are in `docs/ai/voice-testing.md`.
- **Explicitly not built in this pass** (see `docs/ai/voice-i18n.md`/`realtime-deployment.md` for
  the honest gap list): a dedicated `voice.*` i18n key set for a per-state voice UI (the mic
  button reuses the pre-existing `aiDockMic`/`aiDockListening` keys; the adapter's internal
  ten-state machine exists and is tested, but the UI only visibly distinguishes two states);
  dedicated RTL viewport testing of the voice UI; per-language voice/TTS selection (one voice,
  `cedar`, used for all four languages); and production validation (everything above was verified
  against local dev servers only).
- **Persian Voice Quality pass** (later, separate from the six E0-E5 gates above): a naturalness-
  focused pass added a per-language voice map (Persian now resolves to `marin`, chosen after a real
  human-listened Cedar-vs-Marin A/B across a smoke test and a 10-category validation set - see
  `voice-ab-scratch/`; English/Arabic/Spanish stay on `cedar`), a Persian-only `voiceReply`
  spoken-style contract, Persian-only Realtime prosody instructions, a deterministic voice-only
  number/markup/pronunciation post-processing layer (`ai-voice-text.js`), and fixed a real,
  pre-existing bug where Journey C's proactive-safety
  messages were hardcoded English regardless of language. Full detail in
  `docs/ai/persian-voice-quality.md`.

### 7.21 AI Copilot: Universal Domain Coverage & Destructive-Action Safety (Journey F)

- **Purpose:** Extends Journeys A/B's Action Registry across essentially every remaining safe,
  product-backed workflow - Pattern/Strategy create+edit, Session Scenario/Entry, the full Trade
  lifecycle (open/cancel/close/emotion-log), Community/Marketplace/Messaging drafting and
  publish/send, Account Profile and Settings - and, as its own final gate (F37), adds genuinely
  irreversible destructive actions (`pattern.delete`, `strategy.delete`, `session.delete`,
  `scenario.delete`, `entry.delete`, `trade.delete`) with an explicit, deterministic confirmation
  architecture. Full detail lives under `docs/ai/`: `action-coverage-matrix.md` (the complete
  per-workflow inventory - what exists, what's action-startable, what's intentionally excluded and
  why), `universal-actions.md` (the ASK/DO/GUIDE model as it actually falls out of the existing
  mechanism, no separate classifier), and `action-safety.md`/`action-testing.md` (the destructive-
  action confirmation architecture and how it was verified). This section is the map, matching
  7.19/7.20's own convention - not a restatement.
- **No new mechanism.** Every one of these ~30 actions is built entirely from Journeys A/B/C's own
  primitives (`ai-action-registry.js`'s `registerAction()`, `ai-workflow-engine.js`'s
  start/applyKnownFields/submit lifecycle, `ai-context-engine.js`'s active-entity resolution) - this
  gate is domain breadth and one new safety primitive (the confirmation gate field), never a second
  runtime.
- **Destructive actions never call a store's delete method directly from the model.** Every one
  resolves an exact target (currently active, or by exact name - never guessed), requires an
  explicit boolean gate field (`confirm`/`confirmDelete`) that only a real, later "yes" can set, and
  re-verifies the target is *still* the one being confirmed - immediately before calling the exact
  same real delete method the human-facing, already-`window.confirm()`-gated button reaches. Full
  architecture, including the four real interaction bugs found and fixed via real-browser testing
  (an explicit `false` silently treated as "known"; a single registration's own `isOpen()` being an
  unsafe re-verification signal; two distinct stale-registration bugs that permanently blocked
  future action discovery once triggered; a missing synthetic gate field on a real form's allowlist
  that silently broke non-English confirmation) is in `action-safety.md`.
- **Explicitly excluded from this entire gate, structurally, not just by prompt instruction:**
  password, API key, admin/authorization role, billing/subscription, brokerage/exchange trade
  execution, and account deletion. None of these fields exist in any action's allowlist, and none
  of the real registrations these actions target expose them to `applyValue` at all.
- **Verification status:** all six destructive actions verified end-to-end in a real browser
  (real store data, real `/api/ai/chat` calls against a real model), including English, Persian,
  Arabic, and Spanish confirmation phrasing, and confirmation-channel switching (voice-sourced
  `sendChat({source:'voice'})` calls confirming a text-started workflow and vice versa). See
  `action-testing.md` for the full methodology and the honest list of what this pass did and did
  not cover (a real-microphone voice pass and the full literal 36-step continuous script were judged
  out of this gate's own scope, given equivalent coverage from shorter targeted scripts and Journey
  E's own independent real-audio verification of the shared voice transport).

### 7.22 AI Copilot: Latency Optimization

- **Purpose:** A measurement-first pass to make NAVRYA's AI Copilot feel dramatically faster
  without adding capability, redesigning the Copilot architecture, or weakening action correctness/
  safety/answer quality/multilingual behavior/Voice continuity. Full detail, real before/after
  measurements, and the honest list of what was measured-but-not-implemented live in
  `docs/ai/latency-architecture.md` and `docs/ai/latency-testing.md` - this section is the map.
- **Central, measured finding:** for any turn that genuinely needs the model, provider generation
  time is 85-95% of total latency - client-side processing (context snapshot, action catalog,
  proactive check, workflow apply) measures in single-digit-to-low-double-digit milliseconds
  regardless of turn type. The optimizations below are therefore split into eliminating the AI call
  entirely for a narrow, provably-safe class of turns, and lightening the AI call itself when a
  cheaper reasoning/verbosity tier suffices - not client-side micro-tuning, which measurement
  showed was never the bottleneck.
- **A new, deterministic single-missing-field slot fast path** (`chat-dock-core.js`, alongside the
  pre-existing F37 gate-field confirm/reject fast path): a workflow already waiting on exactly one
  non-gate required field, answered with a short (<= 24 chars), unambiguous bare value from a
  small explicit field whitelist, resolves with zero network calls - reusing
  `ai-deterministic-extraction.js`'s existing EN/FA token extractors plus a new, language-agnostic
  `extractBareNumber()`, and still routing through `runProactiveCheck()`/the Workflow
  Engine/Process Registry exactly as the model-driven path does. Measured: session creation's
  timeframe slot went from ~1963ms (real model call) to ~4ms (zero calls) across 5/5 repetitions.
- **Adaptive submit grace**: an explicit gate-field confirmation (destructive delete, publish,
  send) now completes with zero grace delay - `SUBMIT_GRACE_MS`'s ~3000ms correction window has no
  "same-breath correction" to protect once a deliberate yes/no has already been given - saved and
  restored per-call, every other action's own grace window is unaffected. Measured: a destructive
  confirmation's own final-persistence time dropped from ~3129ms to ~112ms.
- **A third reasoning/verbosity tier**: fresh action discovery (`availableActions`) now shares the
  same light `low`/`medium` tier `activeProcess` continuation already used, instead of the heavier
  `medium`/`high` tier it previously shared with genuine Q&A. Genuine open-ended Q&A is
  deliberately, structurally unaffected - the one turn type this pass never touches, so answer
  quality/depth stays exactly what it was.
- **History persistence is now genuinely fire-and-forget**: `appendExchange()` (every turn after a
  conversation's first) was found still `await`ed despite the architecture's own stated intent -
  two sequential network round trips added to every ongoing-conversation turn. Now
  `.catch()`-guarded and never awaited; `startConversation()` (the one-time-per-conversation first
  call) stays awaited on purpose, since its result is genuinely needed synchronously.
- **Deliberately measured but not implemented**: candidate action-catalog reduction and chat-
  history trimming for the model's own context (both showed real, measured opportunity, but neither
  showed strong enough evidence to justify the added risk in this pass); Q&A streaming (would need
  fragile partial-JSON-schema parsing against this app's strict structured-output contract).
- **New dev-only diagnostic**: `window.TradeJournalChatDockCore.debugLastLatency()` - a per-turn
  breakdown (client/context/network/provider/workflow/grace/render timings, turn-type
  classification, action-catalog/schema/history size counts) reusing the same duration-only,
  never-content privacy posture `debugLastTurn()` already established, plus a `serverTiming` object
  threaded back from `server/pattern-ai-server.mjs`'s `dockChat()` that reuses `callProvider()`'s
  own existing health-event latency measurement rather than a second one.
- **Verification status**: real-browser before/after A/B measurement via `git stash`
  (reverted code vs. optimized code, same environment, same provider/model), 8 new dynamic unit
  tests, and a real-browser safety regression pass (the exact Journey C Persian phrase, FA
  destructive confirmation, switched-target safety under the new zero-grace path). See
  `latency-testing.md` for the full results table and every honestly-reported limitation.

### 7.23 AI Copilot: Journey Engine & Companion Orchestration (Journey G) - **Gate 1**

- **Purpose:** A deterministic layer on top of Journeys A-F's action/proactive/knowledge stack that
  answers *"where is this trader in their own NAVRYA journey, and what's the smallest useful next
  step?"*, and surfaces that answer as a compact Companion card inside the existing ChatDock -
  never a second AI runtime, never a psychological-profiling system, never a nagging coach. Built
  as one gated slice (matching how Journeys A-F were each merged), covering the brief's core
  architecture and its required first vertical slice (fresh user → welcome → optional Intake →
  Pattern education → first Pattern), plus a phase-generic engine that also naturally serves an
  existing user, an active Trade, and a due Post-Trade Reflection - the engine ranks *any* eligible
  step deterministically, it doesn't special-case "fresh" vs. "returning" users.
- **Files:** `public/pages/shared/ai-journey-steps.js` (the deterministic step registry),
  `ai-journey-engine.js` (`window.TradeJournalAIJourneyEngine` - snapshot/evaluate/nextBestStep/
  companionContext, zero model calls), `ai-companion-profile.js`
  (`window.TradeJournalAICompanionProfile` - the one small persisted preferences/dismissals
  document), `ai-companion-orchestrator.js` (`window.TradeJournalAICompanionOrchestrator` - event-
  driven glue, never a poller); `public/pages/shared/navrya/components/assistant/CompanionCard.jsx`
  plus its wiring into `navrya-src/chatDockView.jsx`; a small `initiativePreference` toggle in
  `navrya-src/settingsView.jsx`; Journey step executor registrations in `character-app.jsx`'s
  `mount()`; server: `server/db/migrations/018_companion_state.sql`, the `companionState` repo
  domain (`repo.pg.mjs`/`repo.memory.mjs`), `server/community/routes.companion.mjs` (mounted at
  `/api/sync/companion-state`), and `buildCompanionContextText()`/the `companionContext` wiring in
  `server/pattern-ai-server.mjs`'s `dockChat()`. Full detail in `docs/ai/journey-engine.md`,
  `companion-profile.md`, `companion-orchestration.md`, `companion-testing.md` - this section is
  the map, matching Section 7.19-7.22's own convention.
- **Repository-authoritative correction found while building this gate:** this document (and the
  brief this gate was built from) assumed the dev-mode `x-dev-user-id` header was still the
  current identity mechanism. It is not - `server/community/auth-real.mjs`/`routes.auth.mjs`/
  `auth-tokens.mjs` (migration `013_real_auth.sql`) already replaced it with real, signed session
  tokens, wire-compatible on the same header name so ~30 existing call sites needed no change (see
  `auth-real.mjs`'s own comment). Every reference elsewhere in this document to "dev-mode identity"
  / "no real authentication" is accordingly stale and should be read in that light; a full audit
  of this document's own dev-mode framing was out of scope for this gate.
- **State is derived, never trusted.** `ai-journey-steps.js`'s step registry reads real,
  already-loaded stores directly (Pattern/Strategy/Trade/Session/Mental-Health-intake) for every
  `completed()`/`available()` check - no duplicate completion flag anywhere. `ai-companion-profile.js`
  persists only what genuinely cannot be derived: a one-time walkthrough flag, dismissed/snoozed
  step ids, an explicit user-chosen `currentGoal`, and a communication-preference profile (never a
  psychological label, never read from or written to Mental Health data). Mirrors
  `mental_health_profiles`' one-row-per-user/single-jsonb-column shape exactly - see
  `018_companion_state.sql`.
- **`nextBestStep()`'s priority order** (§13 of the brief): a pending Proactive Engine confirmation
  or an in-flight `TradeJournalAIWorkflowEngine` workflow blocks the Companion entirely (returns
  `null`) - safety and real in-progress work always outrank onboarding. Above onboarding sit two
  contextual, real-lifecycle steps: an open Trade needing attention, and a due Post-Trade
  Reflection. An explicit `currentGoal` additively boosts a matching-domain step. Below that,
  the six foundational milestones (Intake-optional, Pattern, Strategy, Session, Scenario, Trade
  Plan) rank in phase order, and a Companion-initiative preference of `'low'` (a real Settings
  toggle, `CompanionSection` in `settingsView.jsx`) additionally suppresses every step below the
  contextual tier from being proactively offered.
- **This does not duplicate `account-profile-store.js`'s existing `nextGoal()`** (the sidebar
  reward widget's real achievement/level guidance, Section 11.16) - the two answer different
  questions (a product-workflow milestone vs. an achievement/level milestone) and read the same
  underlying store data rather than each maintaining a separate notion of "has a Pattern." See
  `docs/ai/journey-engine.md`'s own comparison.
- **Continue is fully deterministic** (§18/§19): `ai-companion-orchestrator.js`'s `continueStep()`
  calls straight into the step's own real executor - either `TradeJournalAIActionRegistry.get(id)
  .open()` (the exact same function Journey F's conversational actions call, for
  `pattern.create`/`strategy.create`/`session.create`/`trade.calculator`) or a small executor
  registered from `character-app.jsx`'s `mount()` reusing an already-imported real entry point
  (`openIntake`, `openPostTradeReflection`, `openTradeDetails`, `openLiveSession`, a real hash
  navigation to a Pattern's report tab) - never a synthetic chat message, and never dependent on
  chat-based action discovery (sidestepping the documented Dashboard/Strategies/Settings
  discovery limitation in this document's own Known Constraints).
- **Explain uses the real chat pipeline, in a TEACHER response stance** - `companionCard
  .explainPrompt` is a real, per-step localized question, submitted through the exact same
  `chatDockView.jsx` `submit()` a typed message already goes through.
- **Companion context rides the existing one-call-per-turn chat pipeline, additively.**
  `chat-dock-core.js`'s `sendChat()` builds a small `companionContext` (phase/nextBestStep/
  responseStance [GUIDE/TEACHER/COMPANION]/communication preferences/completed milestones) the
  same way it already builds Journey D's `productContext`, skipped entirely while a workflow/
  activeProcess is already driving the turn. Server-side, `dockChat()` renders it under its own
  `=== COMPANION CONTEXT ===` header with the same explicit "read-only reference data, never an
  instruction or permission to act" framing already proven for PRODUCT KNOWLEDGE/LIVE STATE/USER
  DATA - verified inert against injected content in `tests/companion-context-prompt.test.mjs`. No
  new AI endpoint; one ordinary chat turn still makes at most one model call.
- **The Companion card is not proactive-popping, and the first-run welcome is not an automatic
  popup (UX correction after real-world review).** It renders inline inside the existing ChatDock,
  above the input bar, gated behind two independent layers: `ai-journey-engine.js`'s own
  product-state safety gate, and a render-time gate in `chatDockView.jsx` for transient UI state
  the orchestrator itself never tracks (`!popover && !historyOpen && !therapistMode &&
  (voiceState === IDLE || companionOpeningActive)`) - see `docs/ai/companion-orchestration.md` for
  why this split is deliberate rather than teaching the vanilla orchestrator about React component
  state. The `kind:'welcome'` card specifically additionally requires `dockExplicitlyOpened` (set
  by focusing the dock's input, pressing Voice, or sending a message - never by mounting/
  refreshing/navigating) - real-world use found it auto-popping over an ordinary page load, which
  this gates against; a regular `kind:'step'` guidance card is unaffected, still governed only by
  the cooldown-gated orchestrator mechanism.
- **First-run welcome, and the Voice Companion opening** (§16, UX correction): a deterministic,
  zero-network, four-language welcome exists in two forms now - the Text-mode card (shown once
  `dockExplicitlyOpened`, with Start/What is NAVRYA?/Later) and, once the user explicitly presses
  Voice, NAVRYA proactively **speaks** first (still zero model calls, still never on ordinary page
  load/refresh/navigation - pressing Voice is the one consent boundary). The spoken opening is
  context-aware, not just onboarding: an active open Trade > a due Post-Trade Reflection > a
  genuinely open Session > the one-time fresh-user welcome > a short neutral "what do you want to
  work on today?" for an otherwise-caught-up returning user - the same contextual-beats-onboarding
  priority `nextBestStep()` already uses. A user's spoken reply is classified deterministically
  (EN/FA, zero model calls for Start/Later; one ordinary call for Explain/anything ambiguous,
  including AR/ES) via `ai-companion-orchestrator.js`'s `interpretVoiceOpeningReply()`/
  `resolveVoiceOpeningChoice()` - see `docs/ai/companion-orchestration.md`'s own dedicated section.
- **Zero model calls for Journey evaluation** (§38/§39): every `ai-journey-engine.js`/
  `ai-companion-orchestrator.js` function is synchronous and reads only already-loaded stores -
  proven directly in `tests/ai-journey-engine.test.mjs` via a sandboxed `fetch` that throws if
  ever invoked.
- **Explicitly deferred this gate, reported as gaps rather than built partially/dishonestly:**
  a fully isolated Demo/Tutorial Pattern-Strategy sandbox (§31 of the brief - would require a real,
  separate parallel-data path with no XP/sync/report/risk-rule effects; judged too large to build
  safely alongside everything else in this gate); the brief's literal 60-scenario real-browser
  interactive script (no live-browser-driving tool was available this session - see
  `docs/ai/companion-testing.md`'s explicit list of what a human should still walk through);
  per-language Persian-Voice-specific Companion phrasing tuning beyond passing `companionContext`
  through the existing, untouched Realtime transport; and three of the four communication-
  preference fields (`experienceLevel`/`explanationDepth`/`teachingPreference`) are real, synced,
  and already read by `companionContext()`, but have no Settings UI yet beyond
  `initiativePreference` - see `docs/ai/companion-profile.md`.

## 8. AI Integration Points

### Server configuration

`server/pattern-ai-server.mjs` uses Node's built-in `http` module and is a **multi-provider gateway**: every handler builds a provider-agnostic `{input, text:{format}}` payload and calls a single `callProvider(provider, apiKeyOverride, modelOverride, payload)` dispatcher, which resolves the key (client-supplied override, scoped to that one call, else the matching env var), resolves the model, and dispatches to one of three low-level callers:

- `callOpenAI` - OpenAI's Responses API (`https://api.openai.com/v1/responses`), native strict JSON Schema output.
- `callAnthropic` - Anthropic's Messages API, `x-api-key`/`anthropic-version` headers; structured output is obtained via forced tool-use (one tool built from the schema, `tool_choice` pinned to it) since Anthropic has no native strict-schema mode.
- `callOpenAICompatible` - shared by Kimi (`api.moonshot.cn`) and DeepSeek (`api.deepseek.com`), both OpenAI-compatible chat-completions APIs using `response_format:{type:'json_object'}` (valid JSON only, not schema-enforced) compensated by an in-prompt required-keys instruction plus a post-parse `assertRequiredKeys` check that throws `SCHEMA_VALIDATION_FAILED` on a miss. DeepSeek has no vision support, so image parts are dropped with an honest in-text note instead of being silently ignored; Kimi keeps them as `image_url` parts.

Every path normalizes its result into the same envelope before returning: `{data, usage: {promptTokens, completionTokens, totalTokens} | null, provider, model}`. Anthropic never reports `total_tokens` directly, so it is computed as the sum. `usage` is `null`, never estimated, whenever a provider doesn't report it. `callOpenAI`, `callAnthropic`, and `callOpenAICompatible` are also named exports, purely for direct unit testing with a stubbed `fetch`.

Environment variables:

```text
OPENAI_API_KEY       # Required for remote OpenAI responses
OPENAI_MODEL         # Defaults to gpt-5.6
ANTHROPIC_API_KEY    # Optional - enables the Claude provider
ANTHROPIC_MODEL      # Defaults to claude-sonnet-4-5
KIMI_API_KEY         # Optional - enables the Kimi provider
KIMI_MODEL           # Defaults to moonshot-v1-8k
DEEPSEEK_API_KEY     # Optional - enables the DeepSeek provider
DEEPSEEK_MODEL       # Defaults to deepseek-chat
OPENAI_REALTIME_MODEL # Optional - overrides the Realtime Voice model (Section 7.20); defaults to gpt-realtime-2.1
PATTERN_AI_PORT      # Defaults to 8787
```

Every browser AI request can carry `provider`, `apiKey`, and `model` fields. `apiKey` is a per-request override (from `ai-settings-store.js`'s in-memory-by-default BYO key) and is never retained server-side after that call. `pattern-registry-ai.js`, `strategy-education-ai.js`, and `mental-health-ai.js` never send a `provider` field, so they keep hitting the OpenAI default exactly as before this gateway existed - none of their calling code changed.

API keys are read only from `process.env` (or the per-request override); they are never stored in browser state beyond the opt-in BYOK path. Requests have a 100 MB body limit and a 90-second upstream timeout. The server binds to `127.0.0.1`, enables JSON CORS responses, and supports `GET /health`. Vite proxies `/api/patterns`, `/api/strategy-education`, `/api/trades`, and `/api/ai` to port 8787.

All model calls request strict JSON Schema output (or the closest equivalent the provider supports, per above). The server maps oversized bodies to 413, invalid JSON to 400, a missing API key (`/_API_KEY_MISSING$/`, any provider) to 503, and other failures to 500.

### Endpoints

| Endpoint | Browser caller | Input | Structured output |
|---|---|---|---|
| `POST /api/patterns/generate-stages` | `pattern-registry-ai.js` | language, pattern identity/description/threshold/stages, up to 6 image data URLs | `{stages: string[], provider, model}`; 1–12 stages |
| `POST /api/patterns/chat` | `pattern-registry-ai.js` | same pattern context, latest message, last 20 chat messages, images | `{reply, suggestedStages: string[], provider, model}` |
| `POST /api/strategy-education/summarize` | `strategy-education-ai.js` | all three education sections plus categorized attachment data/notes | `{summary: {positionManagement, riskManagement, overallFramework}, provider, model}` |
| `POST /api/strategy-education/chat` | `strategy-education-ai.js` | full education context, message, last 24 messages, attachments | `{reply, summary, suggestions[], provider, model}`; suggestions are restricted to known field paths |
| `POST /api/strategy-education/from-event` | `strategy-education-ai.js` | event narrative, optional screenshots, active UI language | structured strategy draft with name, framework, initial execution rules, validation plan, and predicted outcome; UI requires explicit approval before saving |
| `POST /api/trades/analyze` | `trade-ui.js` | language, selected trade context, up to 4 screenshot data URLs | `{summary, observations[], warnings[], provider, model}` |
| `POST /api/trades/psychology-analysis` | `trade-reports.js`, `psychology-ui.js` | language and up to 500 closed trade records | `{summary, insights[], correlations[], triggers[], sampleSize, provider, model}`; `triggers[]` (time-of-day/day-of-week/gap-since-last-trade/entry-mode/emotion-repeat) is an additive, backward-compatible field - older callers reading only `summary`/`insights`/`correlations` are unaffected |
| `POST /api/mental-health/chat` | `mental-health-ai.js` | language, message, trimmed chat history, a light profile-context summary (baseline/intake summaries, active biases, recent triggers, draft thought-record/trigger/scenario-response) | `{reply, distressFlag, suggestions[], provider, model}`; suggestions are restricted to a known field-path allowlist (`mentalHealthPaths`) covering both the v1 draft objects and the v2 intake/scenario-draft paths |
| `POST /api/mental-health/education-card` | `mental-health-cards.js` | language, `biasType`, the user's own evidence numbers (never raw trade content) | `{title, explanation, whyItMattersForYou, practicalSteps[], imagePrompt, provider, model}` |
| `POST /api/ai/chat` | `chat-dock-core.js` (therapist mode **off**) | provider/apiKey/model, language, message, trimmed chat history, the currently open registered process (`{id, allowlist}`) if any; when nothing is open, `availableActions[]` (the real Action Registry's own catalog, Section 7.19) instead; either way, an optional `productContext` (Section 7.19's Knowledge Base - narrowed product knowledge/user memory/live state for THIS turn); an optional `source: 'voice'` (Section 7.20) when the turn originated from a finalized spoken transcript; an optional `companionContext` (Section 7.23's Journey Engine - phase/nextBestStep/responseStance/communication preferences, skipped while a workflow/activeProcess is already driving the turn) | `{reply, suggestions[], action, provider, model, usage}`; `suggestions[].path`/`action.fields[].path` are constrained via a dynamically-built schema enum; `action` is `{id, fields[]}` or `null`; when `source: 'voice'` was sent, also `voiceReply` - a shorter, TTS-phrased rendering of `reply` for the Realtime session to speak, never used for the written transcript |
| `POST /api/ai/test-connection` | `ai-settings-ui.js` ("Test connection") | provider/apiKey/model | `{ok: boolean, provider, model, usage}` |
| `POST /api/ai/realtime/session` | `navrya-src/aiVoiceRealtime.js` (Section 7.20) | apiKey (personal-key override), language | `{value, expiresAt, model, voice, language}` - `value` is a short-lived (`ek_...`, 10 min) OpenAI Realtime client secret; the permanent server key never leaves this endpoint |
| `POST /api/trades/extract-fields` | `chat-dock-core.js` (screenshot analysis) | provider/apiKey/model, language, one chart screenshot data URL | `{direction, entryPrice, stopLoss, takeProfits[], leverage, confidence, provider, model, usage}`, all fields nullable except `confidence` - never a fabricated price |

Pattern and Strategy Education browser clients provide local multilingual fallbacks when the server or key is unavailable. Session entry/fate summaries are fully local demonstration output. Trade screenshot analysis fails softly; psychology analysis reports an unavailable state rather than inventing results.

### Usage tracking and BYO API keys

`ai-usage-store.js` observes token usage two ways: it decorates the three pre-existing AI clients' exported methods (`TradeJournalPatternAI.{generateStages,chat}`, `TradeJournalStrategyEducationAI.{chat,summarize,proposeFromEvent}`, `TradeJournalMentalHealthAI.{chat,educationCard}`) using the same Promise-wrapping pattern already established by `trade-ui.js`'s `details` layering - callers get the byte-identical resolved value, usage is only observed in transit; and explicit `TradeJournalAIUsage.record({..., source})` calls at every other call site that bypasses those three decorated clients: the dock's own two direct fetches (`/api/ai/chat` → `'chatDock.chat'`, `/api/trades/extract-fields` → `'chatDock.extractFields'`), `trade-ui.js`'s initial trade analysis (`/api/trades/analyze` → `'trades.analyze'`), the psychology-analysis button in both `trade-reports.js` and `psychology-ui.js` (`/api/trades/psychology-analysis` → `'trades.psychologyAnalysis'`), and `ai-settings-ui.js`'s "Test connection" button (`/api/ai/test-connection` → `'ai.testConnection'`) - every one of the 12 gateway endpoints now records a `source`-tagged usage row, not just 9 of them. A response with no `usage` field (local-fallback) is never recorded. "Tokens remaining" is only ever shown against a user-set `monthlyTokenBudget`; with no budget set, the UI says so honestly rather than showing a meaningless number.

Server-side, `pattern-ai-server.mjs`'s `callProvider` also reports a **health event** (`ok`, `latencyMs`, `errorCode` on failure, the same `source` label) for every call, success or failure, via `POST /internal/ai-health-event` - see Section 7.16's "Per-provider AI health tracking" for the full design. This is a separate signal from token usage: a call can fail (bad key, timeout, rate limit) before ever producing a `usage` envelope, and until this pass such a failure left no trace anywhere.

A BYO API key lives in memory only (`ai-settings-store.js`'s module-level `sessionKeys`) unless the user explicitly opts into `persistApiKey`, at which point it is written to the separate `tradejournal:ai-byok:v1` key with an inline warning that it will be stored unencrypted in the browser. Voice mode is shown as available only for providers whose catalog entry sets `supportsVoice: true` (OpenAI only, today) - other providers show a genuinely `disabled` control, not just muted styling.

## 9. Coding Conventions & Style Rules

### JavaScript conventions

- Shared dashboard features use `'use strict'` IIFEs and publish one namespaced `window` API.
- Do not introduce module imports into character pages without changing every HTML script entry and test contract.
- DOM builders such as `el()`, `make()`, `button()`, and `field()` are local to each module; there is no universal component library inside the iframe.
- Types are documented with JSDoc in `*.types.js`; runtime stores still normalize every external/stored value defensively.
- Feature state is usually a small mutable object followed by a complete feature rerender.
- Persist before requesting a dependent rerender. Dispatch the module's existing `CustomEvent` after a store write.
- Reuse existing public adapters (`listForScenarios`, `getRiskDefaults`, `findBySource`) rather than reading another module's private schema directly.

### Styling conventions

- Preserve the character page as the outer visual system.
- Consume `--ps-accent`, `--ps-accent-rgb`, `--ps-line`, and `--ui-font` in shared features.
- Session-specific changes should extend `session-design-system.css` tokens instead of hardcoding a character color.
- Use semantic success/warning/danger colors for outcomes; character accent is for identity and primary actions.
- Use logical CSS properties (`margin-inline`, `padding-inline`, `text-align:start`) where possible so RTL/LTR both work.
- User-authored text should use `dir="auto"`; timestamps and market numbers should remain LTR/tabular where layout requires it.
- Dynamic icons should use the Lucide layer, not emoji or new inline icon packs.

### Async, loading, and error behavior

- Browser AI clients use `AbortController` timeouts and convert failures to local mode or a translated toast.
- Upload stores validate MIME type and size before persistence.
- Async action buttons are disabled and relabeled during processing.
- Feature UIs use translated toast/status messages rather than throwing uncaught errors into the page.
- Trade modal code uses the common `modal()` function inside `trade-ui.js`; new trade dialogs should reuse it to preserve close/backdrop/Escape behavior.
- Pattern, Strategy Education, Session, and Trade each have their own modal implementation. There is no cross-feature universal modal base yet.

### Formatting and tooling

- No ESLint, Prettier, EditorConfig, TypeScript, or jsconfig configuration exists.
- The existing style is mixed: modern `const`/arrow syntax in character code and compact ES5-compatible `var`/function syntax in many shared modules.
- Preserve the local file's style when editing; avoid repository-wide formatting churn.
- Tests run with `npm.cmd test` on Windows or `npm test` where PowerShell script execution permits it.

## 10. Known Constraints, TODOs, and Partially-Implemented Areas

- **Hybrid shell:** `index.html` bypasses `src/main.jsx`; modifying only `App.jsx` will not affect the active app. `release.js` and `App.jsx` can drift.
- **Static dashboard content:** Many header/session-card statistics, XP values, progress rings, dates, and chart examples are hardcoded presentation data.
- **No auth or remote record database (superseded by Section 7.18, now complete):** Character chooser login controls are demonstrative. **Every data domain described in Section 3 - Sessions, Patterns, Strategy Education, Trade Store, and Mental Health Profile (Section 7.18 Modules 1-5) - is now server-backed in Postgres**, with localStorage/IndexedDB kept as a write-through offline cache, not the source of truth. The only thing that remains genuinely local-only is BYO AI API keys, which are permanently excluded by design (see 7.18). Real *authentication* is a separate, still-open gap - see the dev-mode header constraint below.
- **Character-scoped sessions - now only a client-cache detail, not the data model.** Pattern, strategy, and trade records are shared in the iframe origin; sessions used to be intentionally split into four `localStorage` keys by character, and still are, client-side (that cache shape is unchanged). Server-side (7.18 Module 1), `trading_sessions` is scoped by `user_id` alone - the four-way character split was a client-storage-key artifact, not a boundary worth preserving in the canonical store, and collapsing it is more consistent with `session-signature-store.js`'s existing cross-character treatment of the same data.
- **Local AI placeholders:** Session chart analysis, fate analysis, and the panel prompt builder use deterministic local demo logic; they are not connected to the AI server.
- **Trend analysis provider:** `TradeJournalTrendAnalysisProvider.analyze()` defaults to `[]`; no live market-price or multi-timeframe data provider exists.
- **Session detection overlap:** Trade session detection uses UTC checks in the order London 07:00–16:00, New York 13:00–22:00, Tokyo 00:00–09:00, else Sydney. Overlaps resolve to the first matching range, and DST is not applied.
- **XP/progression (legacy `.level-ring b` fallback only, not present in current markup):** `panel-system.js`'s `syncRank()` still reads `.level-ring b`'s DOM text, but that element doesn't exist in any current character page (NAVRYA superseded it) - this is dead code relative to real data, not evidence XP itself is unwired. The real, server-backed XP/level/achievement/mastery system (7.17, extended by Section 11's engine) is surfaced at `#account/profile`, the Admin Panel's Users-tab detail view, and the NAVRYA character header itself (`navrya-src/character-app.jsx` reads real `xpTotal`/level on every load, Section 11.17).
- **A handful of Section 11 XP event types are scored by a documented proxy, not the literal action described**, since the exact concept doesn't exist in the underlying data model: `trade_screenshot_added` can't distinguish entry vs. exit screenshots (no `stage` field on `TradeScreenshot`); `pattern_revised_after_report`/`strategy_rules_revised` treat any save after a report exists as a "revision" (no real viewed-report-then-edited correlation is tracked); `strategy_*_completed` uses a required-non-empty-subfields heuristic (no completion flag exists on `Strategy`). See Section 11's "Implementation status" for the full list, including entirely deferred items (the Reports domain, disciplined trade cancellation, Cool-down follow-through, Red Flag action plans).
- **Untyped session schema:** Session shape is distributed across several normalizers instead of one authoritative typedef/store module.
- **Base64 fallback size:** If IndexedDB fails, large blobs are embedded in localStorage and may exceed browser quota.
- **Object URLs:** IndexedDB reads create object URLs. Most AI conversion paths revoke them, but not every display path has centralized lifecycle management.
- **External fonts:** Character styles import Google Fonts. Offline use falls back to the declared system font stack.
- **Encoding corruption:** Several Persian, Arabic, Spanish, punctuation, and symbol literals in source files are visibly mojibake-encoded. The app contains correct strings in some newer dictionaries, but encoding is not consistently clean across legacy files.
- **Distributed i18n:** Translation keys are repeated across character and feature dictionaries; there is no compile-time missing-key check.
- **No universal modal/component base:** Similar modal/upload UI is implemented separately in several features, increasing consistency risk.
- **No server authentication/rate limiting:** The local AI server enables permissive CORS and expects local binding; it is not production-hardened.
- **Generated output:** `dist/` is build output and may be stale relative to source. Always edit source, then rebuild.
- **Standardized psychological tests are placeholders:** Big Five, Risk Tolerance Scale, BIS-11, and SOGS each have a reserved `StandardizedTestResult` slot and an honest "not yet added" card on the Psychological Profile tab; none of them are actually administered or scored yet.
- **Mental Health Profile export is print + JSON, not a generated PDF file:** the report view's "Print / PDF" button uses the browser's native print dialog against a `@media print` stylesheet; the only direct file download is the profile's raw JSON, not a formatted PDF.
- **Most bias `computedIndicatorScore` values are null:** only `overconfidence` (from overtrading episodes) and `gambler_fallacy` (from detected loss streaks) have a real objective proxy from trade data today; the other five monthly-checklist biases rely on the trader's self-rating alone, by design rather than by oversight.
- **Bias auto-detection/linking only covers three `BiasType` values:** `revenge_trading`, `overconfidence`, and `gambler_fallacy` are automatically linked to supporting trade evidence; the other six (including the newer `identity_outcome_fusion`) only enter `identifiedBiases`/the 7-phase cycle if a trader records them through the monthly checklist or chat.
- **"Baseline" is retired as an active gate/UI concept, not deleted:** the intake/formulation gate, the scheduler, and the profile page's UI all read `intake.completed` now. Existing `baseline` data is left in place and still feeds `mental-health-report.js`'s archival display - there is intentionally no migration or deletion step.
- **The Mental Health Profile page is a real route, not an overlay:** `#mindset/profile[/tab]` follows the same hash-routing pattern as Pattern/Strategy detail pages. Refreshing on that URL re-opens the correct tab directly.
- **Voice mode is provider-dependent and only OpenAI supports it today:** the Settings AI section shows a genuinely `disabled` checkbox (not just muted styling) for every other provider, per the catalog's `supportsVoice` flag. No provider's voice capability is actually wired into the dock itself yet - only the Settings display is honest about current support.
- **OpenAI is now smoke-tested live end-to-end; Anthropic/Kimi/DeepSeek are still only verified-by-contract.** A real OpenAI key was set through the admin-configured-key path (`POST /api/admin/ai/keys`, the same route the browser AI tab uses) against a local in-memory-repo Community API, then exercised through the AI gateway with no client-side key override - proving the full `admin key → /internal/admin-ai-keys → callProvider → OpenAI` chain, a real `/api/patterns/generate-stages` call, the negative case (a deliberately wrong key producing a real `OPENAI_...` error surfaced cleanly), and the new health-event/usage-event pipelines (Section 7.16) both landing correct data from that live traffic. The raw key was never written to any file or committed - it lived only in a shell environment variable for the duration of that check. Anthropic/Kimi/DeepSeek routing remains implemented and unit-tested against a stubbed `fetch` only, never exercised against a real upstream call for any of the three.
- **BYO API keys are in-memory by default:** a key entered in Settings is lost on page reload unless the user explicitly opts into `persistApiKey`, which then stores it, unencrypted, in `tradejournal:ai-byok:v1` with an inline warning shown at the moment of opt-in.
- **Real authentication now exists — the "dev-mode header" framing throughout this document is stale wherever it appears; this is the one paragraph corrected in place, the rest are left for a later full pass.** `server/community/auth-real.mjs` + `routes.auth.mjs` + `auth-tokens.mjs` (migration `013_real_auth.sql`) replaced `auth-dev.mjs` entirely: real email/password registration (scrypt-hashed, `PASSWORD_TOO_SHORT`/`EMAIL_TAKEN` validated) and login, real Google OAuth (`google-auth-library`, `email_verified` enforced, deliberately not auto-linked to an existing password account), and a minimal hand-rolled HMAC-SHA256-signed session token (30 days, no refresh, no `alg` field to ever confuse-attack) issued as `{user, token}`. The header name `x-dev-user-id` is kept purely as a wire-compat detail (~30 existing call sites) - it now carries the signed token, not a raw id, and `requireAuth(repo)` verifies it on every route. The client stores the token in `localStorage` under `tradejournal:auth-token` (`dev-user-switcher.js`, filename/global names unchanged for the same reason). Residual, real gaps: no rate limiting on `/api/auth/*` (brute-force is possible), no email-verification flow, no token revocation/refresh (a copied token is valid for the rest of its 30 days), and - separately - `ADMIN_AUTH_ENFORCED` still defaults to disabled (see below). None of these are "still dev-mode," but none of them should be mistaken for a hardened auth system either.
- **Phase 1 of a local-first-to-server-authoritative migration (in progress) closed a real cross-user data-isolation bug: a new account, on a browser a different account had already used, could see that other account's Sessions/Patterns/Strategies/Trades/Mental Health/Companion data.** Root cause: every one of those six client caches is a single browser-global `localStorage` key with no owner tag, and `logout()` only ever cleared the auth token, never the caches themselves - so a second login on the same browser simply read the first user's leftover bytes. `public/pages/shared/user-scope-guard.js` (the first shared `<script>` on every character page, loaded immediately after `app.js` and before every other shared module, so it always runs before any store's own first read) stamps a single `tradejournal:owner-user-id:v1` key with the CURRENT USER'S ID and, on any mismatch - including "no stamp recorded at all," fail-closed - deletes every Phase 1-scoped key outright (never merely hides it in memory) before purging the shared sync outbox (a pending write must never be sent under a different account's token), sweeping the per-user migration-flag keys for any embedded id, and clearing the IndexedDB image object store (`TradeJournalImageStore.clearAll()`, called directly if already loaded, or via a one-shot pending-flag `session-entry-flow.js` itself consumes once it loads, since it hasn't loaded yet at real boot time - this fires from BOTH the boot-time mismatch path and the explicit logout path, since a mismatch-without-a-prior-logout - one account simply continuing to use a browser another account signed into before - is the actual leak scenario, not just a logout nicety; treating this as fire-and-forget hygiene rather than something a render waits on is only valid because the localStorage purge it follows is already synchronous and complete - if that purge were ever incomplete, an orphaned reference could survive alongside an orphaned blob). The stamped identity is the token's own decoded `sub` claim (read client-side without verifying the signature - a real API call still requires a valid signature via `requireAuth`; this decode only ever drives a same-browser purge/no-purge choice, never an authorization decision), not the raw token string: an earlier version of this file compared raw tokens directly, which meant an ordinary re-login or token rotation for the SAME account (a fresh token is minted on every login) was indistinguishable from a different account and destroyed that account's own unsent `tradejournal:sync-queue:v1` entries - fixed before this phase was signed off. `dev-user-switcher.js`'s `logout()` now calls this purge directly, ahead of clearing the token itself, so neither the credential nor the guard's own stamp survives a real logout. This superseded and removed `ai-companion-profile.js`'s own bespoke `_ownerUserId` mechanism (which only ever hid a mismatched document in memory, not deleted it) - Journey G's Companion state is now just one more key this shared guard covers. **Honest limitations:** this is still a client-side stopgap, not the full replica Phase 2+ will build - the five domain caches remain the write-through pattern Section 7.18 already describes, and language/theme/panel-layout/AI-settings preferences are deliberately out of scope for this pass (a wrong preference leaking between two accounts on one browser is real but far lower severity, and is deferred to the phase that replaces `localStorage` for those too). Because the fail-closed rule purges on ANY missing stamp, every browser that already had cached data before this shipped gets one forced full reconcile-from-server on its very next load - safe, since all six domains are already server-synced, except for the edge case of a write still sitting unsent in the outbox at that exact moment, which is lost rather than delivered under the wrong account (a genuine re-login no longer triggers this at all, per the fix above - only an actual account change does). See `tests/user-scope-guard.test.mjs` for per-domain isolation coverage (Strategies/Trades/Mental Health/Companion state, proven end-to-end against the real stores with real signed tokens; Sessions is covered at the key level only, since `session-workspace-logic.js` has never been vm-sandbox-testable in this project's own suite - see that test file's header comment; Patterns graduated out of this file's scope in Phase 2, below).
- **Phase 2 (in progress) builds the real server-replica infrastructure the Phase 1 stopgap above was always meant to be superseded by, and migrates Patterns onto it as the first domain.** `public/pages/shared/server-replica.js` (loaded right after `user-scope-guard.js` on every character page, before any domain store) is a generic, in-memory-only replica factory - `registerListDomain(name, {hydrateUrl, writeUrl, deleteUrlFor, extractList})` for array-shaped domains, `registerDocumentDomain(...)` for a single-document domain (Mental Health's eventual home). No domain-specific logic lives in this file; `normalize()`/business rules stay entirely inside each domain's own store. Its contract: `list()`/`find()`/`get()` are synchronous and always return a deep clone (never a live reference into the replica's own state - a caller mutating what it got back, which every existing `normalize()` in this codebase does by mutating its argument in place, must never corrupt the replica); `hydrate()` is idempotent and fetches the account's real data once auth exists (never before - `isHydrated()` stays `false` rather than looking like a genuinely empty account); `upsert()`/`remove()` apply optimistically and synchronously, then push the write in the background, rolling back and showing a small translated toast on failure. Per-record writes are internally serialized (not globally, not per-domain - only writes to the exact same record id queue behind each other) specifically so a create-immediately-followed-by-save on the same not-yet-confirmed record (create()+save() is a real, common call pattern in this codebase) can never roll back to another still-pending write's own unconfirmed guess - see `tests/server-replica.test.mjs` for the concurrency proofs. No localStorage, no IndexedDB, and no disk fallback anywhere in this file.
  - **Boot gate:** `navrya-src/character-app.jsx`'s `mount()` already gated its three primary React roots (Sidebar/Header/Sessions) behind `sessionsAdapter.resetOnce().finally(...)` - Phase 2 extended that same gate to `Promise.all([sessionsAdapter.resetOnce(), TradeJournalServerReplica.allReady()])`, so no migrated domain's data can ever render as false-empty before its hydration settles. A genuine hydration failure (`failedDomains().length`) renders a small honest, translated error banner directly into those same root elements instead of the normal UI, rather than silently proceeding with an empty replica. This is the real, documented boot-gate hook point for every future domain migration - no second mechanism should be built.
  - **Patterns (`pattern-registry-store.js`) is migrated end to end**: `read()`/`write()` no longer touch `localStorage.patterns:v1` at all - `read()` calls `replica().list()` directly; `save()`/`create()` apply optimistically via `replica().upsert()` (still synchronous returns, unchanged public contract) with the write's own promise `.catch()`-guarded so a real failure never surfaces as an unhandled rejection; `remove()` stays `async` (unchanged) and awaits `replica().remove()`. The old sync-queue-based `migrateOrAdopt()`/`reconcileFromServer()`/one-time-migration-flag block (~85 lines) is gone entirely - hydration/reconciliation is now just "GET once at boot." **Image pipeline** also moved off IndexedDB for Patterns specifically: `addScreenshots()` uploads directly to the existing `POST /api/sync/patterns/images` endpoint and stores the returned `/uploads/...` URL as `imageUrl` on the screenshot record; a failed upload falls back to embedding the raw `dataUrl` on the record itself (which still reaches the server via the pattern's own `save()`, so there is no "unsynced local-only blob" risk the old IndexedDB+sync-queue pipeline had). `screenshotUrl()` now prefers `imageUrl`, then `dataUrl`, and only falls back to the legacy `blobId`/`TradeJournalImageStore` path for a screenshot added before this migration. `seedPatterns()` (previously described in this document and in the original bug report) had already been removed from the codebase before this task began - a brand-new account's registry was already genuinely empty; Phase 2 did not need to remove any seeding.
  - **Cross-account isolation for Patterns is now structural, not enforced by a purge mechanism at all**: there is no `localStorage` key left to leak, and a fresh page load (a fresh module/script execution) always starts with a fresh, empty in-memory replica hydrated from that account's own server data. `tests/patterns-sync.test.mjs` proves this directly (`fetchImpl` scoped per simulated account, never sharing state across two separate `loadPatterns()` calls against the same fake `localStorage`).
  - **Strategy Education (`strategy-education-store.js`) is migrated end to end the same way**: `readRaw()`/`listSync()` read `replica().list()` directly; `create()`/`save()` apply optimistically via `replica().upsert()`; `remove()` stays `async` and awaits `replica().remove()`, then still calls `orphanLinkedTrades()` exactly as before (unaffected - Trade Store isn't migrated yet, so that function still reads/writes `tradejournal:trades:v1` directly). The old sync-queue-based `migrateOrAdopt()`/`reconcileFromServer()`/legacy-v1-singleton-migration block is gone. **The pre-v2 (`tradejournal:strategy-education:v1`) singleton migration path was deliberately NOT ported to the replica model** - it only ever mattered for a browser that had never had Section 7.18's original migration run against it, which should be no real account's current state now that 7.18 is complete app-wide; a genuinely dormant pre-7.18 browser would lose that one legacy record, an accepted, documented gap. `getRiskDefaults(strategyId)`/`getPositionGuide(strategyId)` are unchanged - still `find(id)` underneath, so their "explicit id required, never an implicit global default" contract carries over automatically. **Image pipeline**: image-type attachments now upload directly to `POST /api/sync/strategies/images` and store the real URL as `fileUrl` (falling back to an embedded `dataUrl` on upload failure, same as Patterns); non-image attachments (pdf/txt/docx) are unaffected and still use local-only IndexedDB storage, since the shared storage module has never validated non-image data URLs - IndexedDB is therefore not yet fully eliminated for this domain. **A real pre-existing bug was fixed as a side effect**: `attachmentUrl()` never actually read the `fileUrl` field the old sync's image-upload sender patched onto a record - a successfully-synced image attachment was always displayed from its local `blobId`/IndexedDB copy instead of its real server URL. It now correctly prefers `fileUrl` first.
  - **Trade Store (`trade-store.js`) is migrated end to end the same way**: `read()` reads `replica().list()` directly; `save()` applies optimistically via `replica().upsert()` (still synchronous-return, still computes `recordPatternDelta()` exactly as before - Patterns' own `recordUsage()` already benefits transparently from being migrated itself); `remove()` stays its original NON-async, fire-and-forget shape (it never awaited image deletion before, so it doesn't await the replica write either - `.catch()`-guarded the same way `save()`/`create()` are elsewhere). The old sync-queue-based `migrateOrAdopt()`/`reconcileFromServer()` block is gone. **`tradejournal:trade-settings:v1` is deliberately left untouched** - it is a Group B preference (fee/risk defaults), out of scope for this domain-store migration and deferred to the later phase that moves preferences off `localStorage`. **Image pipeline**: `addScreenshots()` now uploads directly to `POST /api/sync/trades/images` and stores the real URL as `imageUrl` (falling back to an embedded `dataUrl` on failure, identical shape to Patterns/Strategies); every trade screenshot is already image-only by validation, so there is no per-file branching the way Strategy Education needed.
  - **A real regression was caught and fixed while migrating Trade Store, not left for a later bug report**: `strategy-education-store.js`'s `orphanLinkedTrades()` (called from `remove()` when a strategy is deleted) used to read/write `tradejournal:trades:v1` directly - the moment Trade Store itself stopped writing that key, this would have silently become a permanent no-op (an always-empty array to iterate), meaning deleting a strategy would stop clearing `linkedStrategyId` off any trade that referenced it, with no error or symptom anywhere. Caught specifically because a real end-to-end test (not one that manually re-seeded the now-defunct key) exposed it. Fixed by routing `orphanLinkedTrades()` through the real `window.TradeJournalTradeStore` public API (`listSync()`/`save()`) instead - a genuine simplification too, since `tradeStore.save()` already applies optimistically and pushes to the server itself, so the function no longer needs its own sync-queue push at all. Looked up live, matching this file's existing "look up `TradeJournalDevUserSwitcher` live, never cache it" convention, since load order between the two stores isn't guaranteed either way.
  - **Mental Health Profile (`mental-health-store.js`) is migrated the same way, using `registerDocumentDomain` (the single-document counterpart to the four list-shaped domains above)**: `load()` reads `replica().get()` directly (normalized, so a genuinely fresh account still gets real, honest v2 defaults rather than an error); `write()` (the one real mutation funnel every one of this store's ~15 public functions already goes through - `addMessage`, `addRedFlag`, `commitDraftTrigger`, ...) applies optimistically via `replica().set()`. The old sync-queue-based `migrateOrAdopt()`/`reconcileFromServer()`/"whichever copy has the newer `lastUpdatedAt` wins" block is gone entirely - **there is no periodic reconciliation left in this architecture at all** (nothing persists locally to reconcile against; a fresh page load simply re-hydrates from the server, which is now the only source of truth). **`USER_ID = 'local-trader'`, the internal, inert tag written into the profile document itself, is deliberately left completely untouched by this migration**, exactly as Section 7.18 Module 5 originally decided - real ownership has only ever come from the server session (`req.currentUser.id`), never this field. The v1→v2 additive-migration logic inside `normalize()` (baseline left untouched, `intake.legacyBaselineV1` preserved) is also unchanged - it now only ever runs against whatever shape the server itself returns, since there is no more local v1 key to read; a genuinely dormant pre-7.18 browser holding an unmigrated v1 document that was never pushed to the server loses it, the same accepted, documented gap as Strategy Education's own retired legacy-singleton path. This is the final of the five Section 7.18 domains, and the fourth (of six total, including Companion state) migrated in this phase.
  - **Journey G's Companion state (`ai-companion-profile.js`) is migrated the same way as Mental Health, using `registerDocumentDomain`** - the sixth and final domain migrated in this phase (the five Section 7.18 domains plus this one). Also found and fixed a real response-shape inconsistency between the two existing single-document routes while wiring this: `routes.mental-health.mjs`'s `POST /` returns the saved document directly, but `routes.companion.mjs`'s own `POST /` wraps it as `{state: saved}` - `server-replica.js`'s `registerDocumentDomain` gained a new `extractSaved` config option (defaulting to "the response body itself," matching the more common shape) specifically so each registration can say which its own write endpoint actually returns, rather than this shared module guessing wrong for one of the two. This also fully retires `ai-companion-profile.js`'s own bespoke `_ownerUserId` mechanism from Phase 1 (already removed from the file; see that phase's own note) - there is no more sync-queue, no periodic `online`-event reconciliation, and no ownership-check concept needed for this domain at all, since a fresh in-memory replica per page load is never shared between accounts by construction.
  - **Not yet migrated in this pass**: Sessions remains on the Phase 1 stopgap (write-through `localStorage` + `user-scope-guard.js` purge) exactly as described above - explicitly the hardest remaining domain, since `session-workspace-logic.js` cannot be vm-sandbox-tested at all (see its own test file's header comment) and, unlike every other domain, at least five other files read its raw `tradejournal:sessions:v1:shared` localStorage key directly rather than going through one store's public API - `pattern-registry-store.js`'s own `scenarioUsage()`/`scenarioReport()` are two of those direct readers, unaffected by every migration so far since Sessions itself hasn't moved yet. Group B preferences (language, panel layout, AI/app/psychology settings, session signatures, the account-profile XP dedupe bookkeeping) remain local-only too, deliberately deferred per this task's own original scoping. The sync-queue outbox now serves only Sessions. **Sessions itself graduated out of this gap in Phase 3, below** - the seven direct-reader files listed there are exactly the ones this paragraph was warning about.
  - **A scoped enforcement test exists for exactly what this phase actually migrated** (`tests/no-localstorage-in-replica-domains.test.mjs`): asserts `server-replica.js` and the five now-fully-migrated store files (Patterns, Strategy Education, Mental Health Profile, Companion state, plus Trade Store's own domain) have zero unexpected `localStorage`/`sessionStorage`/`indexedDB` calls, with an explicit, narrow allowlist for the two still-deliberately-local exceptions (`server-replica.js`'s own one auth-token read; `pattern-registry-store.js`'s cross-domain Sessions scan; `trade-store.js`'s own Group B settings). **This is deliberately not a whole-repository sweep** - Sessions and every Group B preference are still extensively, legitimately localStorage-backed, so a repo-wide "zero localStorage outside one allowlist" test today would either have to allowlist most of the codebase (little real protection) or misrepresent how much of this migration is complete. This narrower test is a real regression guard for the six domains that are done, honestly scoped to just that. **Extended again in Phase 3** to cover Sessions itself (`pattern-registry-store.js`'s cross-domain Sessions scan allowance was removed entirely - it now asserts zero calls, same as the fully-migrated files - and `session-workspace-logic.js`/`ai-journey-steps.js` were added).
- **Phase 3 (complete) migrates Sessions onto the same server-replica.js infrastructure, the domain Phase 2 explicitly left as the hardest remaining case, and fixes every one of that phase's direct raw-localStorage readers to go through a real public API instead.** `session-workspace-logic.js` registers `registerListDomain('sessions', {hydrateUrl: '/api/sync/sessions', writeUrl: '/api/sync/sessions', deleteUrlFor, extractList: body => body.sessions || []})` and calls `replica().hydrate()` at load time, same as every other list-shaped domain; `list()`/`save()`/`removeSession()` now read/write through `replica()` instead of `persist()`/raw `localStorage`. The old sync-queue-based `queue.registerModule('sessions', ...)` sender, `mergeServerSessions()`/`reconcileFromServer()`, and the `online`-event listener are gone entirely - `hydrate()` is now the only pull from the server, matching every other migrated domain (no more periodic reconciliation for Sessions either). A dead `Storage.prototype.setItem` monkeypatch + `#newSession` click listener (a leftover auto-open-the-new-session hook for the old vanilla-DOM "New Session" button) was also removed - confirmed dead in the live NAVRYA app by a repo-wide search: no element with that id exists anywhere in the current UI, and the localStorage write it watched for no longer happens either now that `save()` writes through the replica.
  - **One piece of the old sync-queue pipeline has no server-replica.js equivalent and was kept, adapted to the replica**: `queue.registerModule('session-images', ...)` still exists, because it patches an uploaded chart image's resolved URL into whichever session/entry still carries the matching `imageBlobId` - a partial patch into a nested field, not a whole-record upsert, which `server-replica.js`'s generic contract has no primitive for. It now scans `replica().list()` instead of local storage and calls `replica().upsert(matched)` once it finds the right session, instead of the old `persist()`+`queue.enqueue('sessions', ...)` pair. `session-entry-flow.js`'s IndexedDB-based image-capture trigger itself (`TradeJournalImageStore.saveImage(id, blob, 'session')`) is completely unchanged - a deliberate, documented deviation from Patterns/Strategies/Trade Store's simpler "upload immediately, no IndexedDB" pattern, to avoid touching that large, untested, DOM-heavy file for this migration.
  - **A real one-time local-to-server migration step was kept, not dropped, specifically because Sessions (unlike every other domain migrated so far) already had its own bidirectional sync-queue-based mechanism before this phase, meaning real pre-existing local-only data could still be sitting in a browser that hasn't loaded the app since that mechanism last ran.** `migrateExistingLocalSessions()` (still gated by the same `tradejournal:sessions-migrated:v1:{character}:{userId}` flag Section 7.18 originally introduced) now reads whatever is still sitting in the legacy local `tradejournal:sessions:v1:shared` key, `replica().upsert()`s each one individually (idempotent by id, safe to repeat), then clears that key so it is never read again. `migrateLegacyPerCharacterSessions()` (the even older four-per-character-key merge into that shared key) is unchanged and still runs first, feeding this new step - together these are the only two functions in `session-workspace-logic.js` that still touch `localStorage` at all, and both are one-time, pre-replica local-data recovery, never an ongoing cache (see `tests/no-localstorage-in-replica-domains.test.mjs`'s own scoped test for this file).
  - **`sessionsAdapter.js` (the ES-module read path the NAVRYA React UI itself uses, via `navrya-src/store.js`) is migrated the same way**: `readSessions()` now returns `TradeJournalServerReplica.domain('sessions').list()` directly (the domain is already registered by the time this module's own code runs, since `session-workspace-logic.js` loads first in every character page's script order); `createSession()` applies optimistically via `replica().upsert()` and returns immediately, matching every other migrated domain's save()/create() contract, rather than awaiting the network write the way the old direct-localStorage version implicitly never did either; `sanitizeSessions()` now deletes each unusable record individually through `replica().remove()` instead of bulk-overwriting the whole local list (there is no bulk write in server-replica.js's contract, only per-record upsert/remove, same as every other domain). The old per-browser `migrateLegacyPerCharacterSessions()`/`SHARED_KEY`/`storageKey()` machinery this file used to duplicate (the exact same merge `session-workspace-logic.js` already performs) is gone - one real implementation instead of two. **`resetOnce()` is kept as a guarded no-op**: it used to clear a demo/seed-data bug's leftover localStorage session records on a fresh install; nothing writes session data to localStorage any more (a fresh account now starts genuinely empty from the server, the same as every other migrated domain), so the seeding bug it fixed cannot recur - the `RESET_KEY` guard itself is kept only so `character-app.jsx`'s existing boot gate (`Promise.all([sessionsAdapter.resetOnce(), TradeJournalServerReplica.allReady()])`) keeps working unchanged.
  - **Every direct raw-`localStorage` reader of the Sessions key that Phase 2 explicitly flagged as unmigrated is fixed** - `pattern-registry-store.js`'s `scenarioUsage()`/`scenarioReport()`, `account-profile-store.js`'s `allSessions()`, `ai-journey-steps.js`'s `sessionsCache()`, `navrya-src/accountProfileView.jsx`'s `allSessions()`, and `navrya-src/strategiesHubView.jsx`'s `allSessions()` all now read `window.TradeJournalWorkspace.list()` - `session-workspace-logic.js`'s own public API, the same real source every other cross-domain Sessions reader in this app already used before, rather than five+ independent raw-localStorage reads of the same key. `session-signature-store.js`'s `backfill()` (a defensive recovery scan for closed sessions somehow missed by the live `captureClosedSession()` capture path) was fixed the same way for its live-bucket branch specifically - deferred behind `TradeJournalServerReplica.allReady()` so it never runs before the replica has actually hydrated, re-reading its own signature list fresh at that point rather than reusing a pre-hydration snapshot; its four-per-character legacy-key branch is untouched (still genuinely dead-in-practice defensive code, same as `session-workspace-logic.js`'s own legacy merge). `session-signature-store.js` itself (its own `tradejournal:session-signatures:v1` key) is Group B, out of scope for this phase, same as before.
  - **Cross-account isolation for Sessions is now structural, the same as every other migrated domain**: there is no `localStorage` key left for a fresh account to leak from, and a fresh page load always starts with a fresh, empty in-memory replica hydrated from that account's own server data. `tests/trading-sessions-api-contract.test.mjs` already proved the server-side half of this directly ("a session belonging to another user cannot be fetched, upserted, or deleted"); `session-workspace-logic.js` itself still can't be vm-sandbox-tested (unchanged limitation - it still registers a `MutationObserver` and drives `setInterval` render loops), so `tests/trading-sessions-sync.test.mjs` stays static source-assertion style for its own wiring, same convention as before Phase 3, updated to match the new replica-based source.
  - **Honest gap carried forward, not resolved by this phase**: `public/pages/shared/session-system.js` is a separate, older, apparently-dead-but-unconfirmed parallel session implementation using its own incompatible per-character storage key, discovered while investigating this migration. It was deliberately left completely untouched - resolving whether it is truly dead was out of scope for a storage-layer migration, and touching a system whose liveness is genuinely uncertain would have been a real regression risk for no confirmed benefit. Flagged here as a pre-existing risk, not a new one this phase introduced.
- **The Settings-page account-creation path was silently broken before this pass, not by design.** The original `dev-user-switcher.js` resolved its create-user `fetch` on any HTTP response, including error bodies, and never checked `response.ok`; a failed create looked like a silent success and could leave `tradejournal:dev-user-id` set to the literal string `"undefined"`. Fixed by making `createUser()` check `response.ok`/the presence of `body.id` and reject with a real `Error` otherwise; the Settings card's create UI was removed in favor of the login-time name step, and its "switch users" list now tolerates a failed `GET /api/users` instead of throwing.
- **Account creation always fails until the Community backend is actually running** — `npm run dev` alone only starts Vite. The login-time name step's `createUser()` call needs `npm run dev:community-api` running in a separate terminal (documented in the root `README.md`); without it every attempt fails with the diagnostic "could not reach the server" message (a `TypeError` from `fetch`, not a server-side rejection). This is expected/operational, not a code bug - the rest of the app (dashboards, patterns, strategies, trades, mental health) stays fully local-first and needs none of this. **No Docker/Postgres install is required just to unblock this**, though: `server/community-api-server.mjs` falls back to `createMemoryRepo()` whenever `DATABASE_URL` is unset (logged loudly on startup so it's never mistaken for real persistence — data resets on every restart), so `npm run dev:community-api` alone is enough to make account creation and the rest of Community work locally. `docker compose up -d` + `npm run db:migrate` + a `DATABASE_URL` in `.env` are only needed for data that survives a restart.
- **Every upload (Community's post images/listing screenshots, and Section 7.18's session chart images) is local-disk only.** `server/storage/storage.mjs` writes under `UPLOADS_DIR` and serves it via a static `/uploads` route - this does not scale across multiple server instances and has no CDN/durability story. It is deliberately kept behind that one small module specifically so swapping to S3-compatible object storage later is a contained change, not a rewrite - but that swap has not been built yet.
- **Community still has no moderation queue for reports specifically.** Reporting (posts/comments/listings/messages → the `reports` table) exists from day one and is fully functional, but nothing currently reads the `open` reports it accumulates - there is no review/dismiss workflow yet, and the Admin Panel (7.16) does not add one (its Marketplace tab covers listing delist/feature, not the `reports` table). This is an explicit, named follow-up: the capability to *collect* reports was prioritized first specifically because it is much harder to retrofit after abuse has already occurred than to act on a growing queue.
- **Marketplace purchases are mock only.** `marketplace_purchases.mock` is hardcoded `TRUE` (with a DB `CHECK` constraint enforcing it) - there is no real payment processor integration. The schema (`price_amount`, `price_currency`, `priceAtPurchase`) is deliberately shaped so a real payment integration (Stripe or similar) can be dropped in later without a schema rewrite, but no such integration exists today. The Admin Panel's Financial tab labels its revenue figure `mock: true` for the same reason.
- **Docker/Postgres were not available in the environment this feature was originally built and tested in.** The schema, migrations, and the real `pg`-backed repository (`server/db/repo.pg.mjs`) are written correctly against Postgres's documented behavior and exercised indirectly (the in-memory repo re-implements the same invariants for the full API contract test suite), but have not been run against a live Postgres instance. Run `docker compose up -d` then `npm.cmd run db:migrate` and smoke-test before depending on this in a real deployment. This applies equally to the Admin Panel's five new tables (7.16, `004_admin.sql`).
- **Admin auth is built but disabled by default - `ADMIN_AUTH_ENFORCED` (unset/`false`).** While disabled, any identified dev-user (i.e. anyone who has ever created a Community account) can use every `/api/admin` route with no role check at all - this is intentional for testing the panel before real accounts/roles exist, but it means the Admin Panel must not be exposed anywhere reachable by untrusted users until this flag is flipped to `true` and real `admin`-role accounts exist. `server/admin/auth-admin.mjs` logs which mode is active on every server startup so this is never silent.
- **Admin-configured AI provider keys are stored as plain text in the `admin_ai_keys` table - there is no secrets-manager or encryption-at-rest yet.** This is an explicit, named follow-up, not a hidden gap: the masking discipline (never returning the raw key to any browser, restricting the one internal server-to-server read path) limits *exposure*, but does not protect the value at rest in the database itself the way a real deployment eventually should.
- **The AI gateway resolves admin-configured keys via an internal HTTP call to the Community API (`/internal/admin-ai-keys`), not a direct database connection - a deliberate choice, not a limitation to fix later.** This was chosen specifically to keep `server/pattern-ai-server.mjs`'s documented "no direct DB access" property intact rather than giving it a second `pg.Pool`; see 7.16 for the full reasoning. The tradeoff: an admin-set key can take up to ~60s (the cache TTL) to take effect, and is invisible to the AI gateway entirely while the Community API is down (falling back to the `.env` tier instead, never breaking the AI feature).
- **The XP & Segmentation tab is now a real, DB-backed rule editor (Section 11.19), not the placeholder it used to be** - but "segmentation" (user-cohort analytics/filtering) genuinely still doesn't exist; only the rule-editing half of the tab's name became real. A trader's own per-user XP/level/achievements still surface only in the Users tab's per-row detail view, unchanged.
- **KYC verification is entirely manual and admin-only - there is no real identity-verification provider.** `kyc_status` (7.17) only ever moves between its four states because an admin explicitly changed it via `PATCH /api/admin/users/:id/kyc`; nothing in this codebase performs actual document/identity verification. Treat "verified" as "an admin asserted this," not as a cryptographically or provider-backed guarantee.
- **The `five_day_login_streak` achievement is computed from `user_sessions` heartbeat data (7.16's presence tracking), not a dedicated login-event log.** `repo.sessions.consecutiveLoginDays()` derives distinct calendar days with at least one session from the same table the Admin Panel's "hours online"/"is online" figures already use - if that heartbeat data is ever pruned or the presence-tracking feature changes shape, this achievement's evidence source changes with it silently, since there is no independent login history it reads instead.
- **The Knowledge Base's `activeStrategyId`/`activePatternId`/`activeTradeId` context is resolved from real, live UI state (Section 7.19, closed in the Journey A-D stabilization checkpoint).** `ai-context-builder.js` resolves all three from `TradeJournalAIProcessRegistry.openIdsWithPrefix()` by default (mirroring `ai-context-engine.js`'s own `activeScenarioId()`) - `navrya-src/tradeDetailsModal.jsx` gained a new, additive `'trade-details-' + trade.id` registration (it previously registered nothing at all, having no fillable field of its own) alongside the pre-existing `strategy-editor-{id}`/`pattern-editor-{id}` registrations `strategiesHubView.jsx` already made. "This trade"/"this strategy"/"that pattern" now resolve to whichever real detail view is genuinely open; with nothing open, memory stays empty rather than guessed. The Context Engine itself (Journey A/B/C, protected) was not changed - this resolution lives entirely inside the Knowledge Base's own module, same as its `window.location.hash` read.
- **A brand-new action (including `navigate.to`) cannot be discovered via chat while the user is genuinely on the Dashboard/Strategies/Settings canvas page itself.** Each of those three pages registers its own inline AI-fillable section (e.g. Settings' trading defaults) that is a real, legitimately open process for as long as it's mounted - correctly blocking discovery of anything new, the same rule that already governs every other open form. Found and confirmed real (not a test artifact) while real-browser-verifying Journey D; `navigate.to` and Journey A/B's own action discovery all work correctly from Sessions or any hash-routed page, where no such competing registration exists.
- **The `panel-system.js` React-root-unmount fix (Section 7.19) covers the three views it mounts (`dashboard`/`strategies`/`settings`) - other pages mounted through different routers (hash-routed pages, standalone modals) were not audited for the same "`Element.remove()` without `root.unmount()`" pattern as part of this pass.** Each of those uses its own mount/render function, so the same class of bug is possible elsewhere but was not specifically searched for beyond the one concretely observed via real testing.

## 11. XP & Seven-Level Mastery System (Section 11 Engine) — **IMPLEMENTED**, a small number of items deferred

**Status: implemented**, superseding 7.17's original 4-event XP system. The event catalog, domain tagging, dedupe keys, per-source/per-day caps, server-side ownership/state verification, mastery gates, domain balance, and streaks described below are real and covered by `tests/account-profile-xp-rules-sync.test.mjs`, `tests/account-profile-repo-memory.test.mjs`, and `tests/xp-engine-caps.test.mjs`. The 7-level thresholds `[0,100,300,700,1500,3000,6000]` XP from 7.17 are unchanged (no migration needed). Whenever XP scoring is discussed elsewhere in this document (Section 5's "XP and ranks", Section 7.17), this section is now the as-built state, not a future target.

### Implementation status

- **Fully implemented, real hooks:** every event type in Sections 11.3–11.8, 11.10–11.12 that has a genuine underlying action in the app - the full domain/dedupe/cap engine (`profile-xp-rules.js`/`xp-rules.mjs`, `routes.profile.mjs`, `repo.pg.mjs`/`repo.memory.mjs`'s extended `xpEvents` domain, `mastery-rules.mjs`), all six domain triggers in `account-profile-store.js`, the mastery-gate endpoint (`GET /api/users/me/mastery`) and its UI block in `account-profile-ui.js`'s Level tab, streak milestones, the offline pending-XP-sync indicator (Section 11.16), real next-goal guidance in the NAVRYA sidebar/header (Section 11.17), and admin-editable rule overrides for every point value/cap/mastery threshold (Section 11.19).
- **Small, deliberately-scoped product additions made to unblock a real hook**, not just XP plumbing: a "Run weekly check-in now" button wired to the previously-dead `captureWeeklySnapshot()` (`mental-health-ui.js`), and an optional personal-response note next to the Education Card's "Mark Viewed" button (`mental-health-cards.js`, `EducationCard.personalResponse`).
- **A few event types are approximated by a documented proxy** where the exact data model doesn't distinguish the real thing: `pattern_revised_after_report`/`strategy_rules_revised` treat any save after a report/detection exists as a "revision," capped monthly by the dedupe key itself; `trade_screenshot_added` drops the entry-vs-exit distinction (no `stage` field exists on `TradeScreenshot`) and pays per-screenshot up to a 2-shot cap instead; `strategy_position/risk/overallFramework_completed` use a required-non-empty-subfields heuristic since no completion flag exists on `Strategy`.
- **Still deferred, not built this pass** (each is a missing UI/data concept, not just missing XP wiring - unchanged from the original plan):
  - The entire Reports & performance-review domain (Section 11.9): Weekly/Monthly Review, Action Items, block-of-10 trade review, Pattern/Strategy report "decisions." No existing product surface to hook into; mastery-gate requirements that would depend on it (Weekly/Monthly Review counts) are omitted from `mastery-rules.mjs`'s `LEVEL_REQUIREMENTS` rather than faked.
  - Session: "Review Similar Sessions and write a lesson" (the similarity panel is read-only).
  - Pattern: "Edit and approve AI-suggested Stages" (Generate Stages overwrites `pattern.stages` directly; no suggest/approve step exists).
  - Trade: a *disciplined* cancel distinct from an arbitrary one (no cancel-reason field on `Trade`).
  - Psychology: "follow through on a Cool-down" (no persisted natural-elapse-vs-dismissed distinction), "build an Action Plan after a warning" (Red Flags have no resolve/action-plan concept), "review the weekly analysis and pick one action" (`renderInsightResult()` is pure display, no accept/apply mechanic).

### 11.1 Core principle

XP must not be awarded for "every click." It is recorded only when a user completes a useful, complete, and verifiable action. Opening the Session page earns nothing; creating an incomplete Session earns almost nothing; closing a Session with a scenario and a written outcome earns the real reward. Sending many messages to the AI earns nothing; using an AI suggestion to actually complete a valid Pattern can. A winning or profitable trade earns nothing; following the plan, honestly logging a mistake, and reviewing the trade does. The goal is for XP to reward trading-quality behavior, not trading volume.

### 11.2 The six XP domains

Every scorable activity falls into one of six domains, and no single domain should be able to carry a user to the top levels alone (enforced by the domain-balance rule in 11.13):

| Domain | App areas |
|---|---|
| Preparation | Profile, Intake, Session, scenario planning |
| Market cognition | Pattern Registry, pattern stages, Similar Sessions |
| Strategy | Strategy Education, risk management, execution rules |
| Trade execution | Calculator, Trade Wizard, Open Positions, closing a trade |
| Psychology & review | Emotion Log, Mental Health, Reflection, Reports |
| Learning & contribution | Community, Marketplace, documented content publishing, Rating |

### 11.3 Onboarding and account XP

| Activity | XP | Limit |
|---|---:|---|
| Complete profile (name, avatar, role) | 10 | once |
| Complete the initial app walkthrough | 5 | once |
| Complete the initial Mental Health Intake form | 25 | once, optional |
| Complete the first Session | 10 (bonus) | once |
| Complete the first full Trade | 10 (bonus) | once |
| Create the first valid Pattern | 15 (bonus) | once |
| Complete the first Strategy | 20 (bonus) | once |

Choosing a character, language, or theme, or simply opening a page, earns nothing.

### 11.4 Session and scenario XP

| Activity | XP | Condition |
|---|---:|---|
| Create a Session with complete Market, Timeframe, and Date | 2 | once per Session |
| Add a Chart Entry with an image and description | 2 | max 3 per Session |
| Add a Movement Entry with a meaningful description | 2 | max 3 per Session |
| Create one complete Scenario | 3 | max 3 Scenarios per Session |
| Update Probability at a later time | 1 | max 3 per Session |
| Link a Pattern to a Scenario | 2 | max 3 per Session |
| Record Entry, Stop Loss, and Take Profit in an Execution Plan | 3 | max two plans |
| Record Fate and mark scenario outcomes | 5 | once |
| Close the Session with a Summary and Lessons | 8 | once |
| Review Similar Sessions and write one lesson | 3 | once |

**Max XP per Session: 30.** Duplicating, reopening, or repeatedly editing a Session does not create new XP.

Session milestone bonuses (outside the per-Session cap):

| Milestone | XP |
|---|---:|
| Close 10 complete Sessions | 25 |
| Close 25 complete Sessions | 50 |
| Close 50 complete Sessions | 100 |
| Complete 10 Sessions without ever skipping Fate and Summary | 40 |

### 11.5 Pattern Registry XP

| Activity | XP | Condition |
|---|---:|---|
| Create a Pattern with name, description, threshold, and at least three Stages | 10 | once |
| Add a reference screenshot with a note | 2 | up to three images count |
| Edit and approve AI-suggested Stages | 3 | once per Pattern |
| Use a Pattern in a real Scenario | 2 | per unique Scenario |
| Mark a Pattern's outcome Confirmed | 3 | per unique Scenario |
| Mark a Pattern's outcome Invalidated | 3 | same value as Confirmed |
| Generate the first Report after at least five samples | 10 | once |
| Revise a Pattern based on Report data | 5 | once a month |
| Publish a Pattern to the Marketplace with evidence | 8 | once |
| Refresh a listing's evidence | 2 | once a month |

**Confirming and invalidating a Pattern must pay equal XP.** If invalidation paid less, a user would be incentivized to mark every Pattern "successful" purely to farm XP. Sending a Pattern Chat message or clicking Generate Stages by itself earns nothing.

### 11.6 Strategy Education XP

| Activity | XP | Condition |
|---|---:|---|
| Create an initial Strategy | 5 | once |
| Complete Position Management | 8 | once |
| Complete Risk Management | 8 | once |
| Complete the Overall Framework | 6 | once |
| Add an attachment with a description | 1 | up to three count |
| Link the Strategy to a reviewed Trade | 2 | per unique Trade |
| Record a Detection Event | 2 | per unique event |
| Resolve a Detection as Confirmed or Invalidated | 3 | per unique event |
| Revisit a Strategy after at least five new Trades | 10 | after each new cycle |
| Revise rules based on a Report | 6 | once a month |
| Publish the Strategy to the Marketplace | 10 | once |

A complete Strategy can generate roughly 30-40 XP in its first cycle, but repeatedly editing the same fields afterward pays nothing new.

### 11.7 Trade planning, execution, and risk-management XP

| Activity | XP | Condition |
|---|---:|---|
| Create a complete Trade Plan (Entry, SL, TP, Direction) | 5 | once |
| Correctly calculate Position Size and Risk with the Calculator | 2 | numbers must be valid |
| Link the Trade to a Pattern or Strategy | 2 | once |
| Convert a Hunting trade to Open after completing the Plan | 2 | once |
| Record a Mid-Trade Emotion Log | 3 | once |
| Add an entry screenshot | 1 | once |
| Add an exit screenshot | 1 | once |
| Close the trade with an Exit Price and P&L | 4 | once |
| Complete the Post-Trade Review | 6 | once |
| Cancel a trade for Invalidation or a risk-limit breach | 5 | rewarded as disciplined behavior |

**Max XP per Trade: 18. Max recurring trade XP per day: 40.** A Quick Trade earns only 2 XP up front; if its missing fields are completed later, it can earn the rest of the same trade's XP retroactively.

What must **never** earn XP: trade profit, profit percentage, whether the trade was a win, using higher leverage, the number of trades placed per day, opening the Calculator repeatedly, repeatedly editing prices, or closing and reopening the same trade. Paying XP for profit or wins would push users toward overtrading and hiding losses.

### 11.8 Psychology and self-awareness XP

| Activity | XP | Limit |
|---|---:|---|
| Complete a Pre-Trade or Pre-Session check-in | 2 | max twice a day |
| Complete a Post-Trade Reflection | 4 | per unique Trade |
| Complete a Weekly Check-in | 8 | once a week |
| Complete the Monthly Bias Checklist | 15 | once a month |
| Complete a Thought Record or Trigger Analysis | 5 | max twice a week |
| Follow through on a suggested Cool-down | 6 | per unique event |
| Build an Action Plan after a behavioral warning | 5 | once a week |
| Read an Education Card and record a personal response | 2 | max three times a week |
| Review the weekly psychology analysis and pick one action | 5 | once a week |

**Max daily psychology XP: 20.** Weekly and monthly awards sit outside this daily cap.

The following must never earn XP: number of Therapist Mode messages, recording a Red Flag by itself, using distressing words, viewing a Safety Card, or requesting professional help. The safety and mental-health areas must never be turned into a points game.

### 11.9 Reports and performance-review XP

| Activity | XP | Limit |
|---|---:|---|
| Complete a Weekly Review with one Action Item | 8 | once a week |
| Complete a Monthly Review | 15 | once a month |
| Review each block of 10 Trades and record a conclusion | 12 | per new block of 10 |
| Execute the previous week's Action Item | 10 | once a week |
| Review a Pattern Report and record a decision | 5 | once a month per Pattern |
| Review a Strategy Report and record a decision | 6 | once a month per Strategy |
| Compare a Session against Similar Sessions and record a Lesson | 3 | per unique Session |

Opening the Reports page, changing a filter, viewing a chart, or exporting a file earns nothing.

### 11.10 Community and Marketplace XP

Deliberately low-value, so a user cannot level up by spamming Community:

| Activity | XP | Limit |
|---|---:|---|
| Publish an educational post with real evidence | 3 | max twice a week |
| Publish a Pattern to the Marketplace | 8 | counted under the Pattern domain (11.5) |
| Publish a Strategy to the Marketplace | 10 | counted under the Strategy domain (11.6) |
| Leave a Rating with a written explanation after a Purchase | 3 | per unique Purchase |
| Receive a verified Rating from a real buyer | 2 | max 10 XP a month |

No XP for: sending a message, a mock purchase, post count, comment count, reporting other users, changing a Profile Role, KYC, or buying a subscription. A Comment should not generate XP until real Like, Helpful Vote, or moderation actions exist.

### 11.11 AI-interaction XP

Using AI by itself never earns XP:

| AI interaction | XP |
|---|---:|
| Sending a message to the AI | 0 |
| Analyzing a chart image | 0 |
| Generate Stages | 0 |
| Extracting Entry/Stop Loss | 0 |
| Accepting a suggestion without completing the underlying flow | 0 |
| Using a suggestion to complete a valid Pattern | same as that Pattern's own XP (11.5) |
| Using image extraction to complete a Trade Plan | same as that Trade's own XP (11.7) |
| Turning an AI suggestion into a complete Strategy | same as that Strategy's own XP (11.6) |

This is what stops a user from farming XP by sending hundreds of AI messages.

### 11.12 Streaks

A login streak alone must never earn XP — the user must have performed one useful activity that day: completing a Session, completing a Trade Review, recording a Reflection, a Weekly Review, completing a Pattern or Strategy, or disciplined closing/cancelling of a Trade.

| Streak | XP |
|---|---:|
| 3 days of useful activity | 10 |
| 5 days of useful activity | 25 |
| 7 days of useful activity | 40 |
| 4 balanced weeks | 75 |
| 30 days of regular (not necessarily consecutive) activity | 100 |

Losing a streak must never subtract previously earned XP. There is no negative XP and no level demotion anywhere in this system.

### 11.13 Seven mastery levels and per-level gates

The existing thresholds (7.17) are kept as-is on purpose, to avoid a migration:

| Level | Title | XP range |
|---:|---|---:|
| 1 | Newcomer | 0-99 |
| 2 | Market apprentice | 100-299 |
| 3 | Analyst | 300-699 |
| 4 | Disciplined trader | 700-1499 |
| 5 | Strategist | 1500-2999 |
| 6 | Trading master | 3000-5999 |
| 7 | Grand market master | 6000+ |

**XP alone must never be sufficient to level up.** Each level also requires a handful of mastery requirements, so a user cannot buy a level with volume alone:

- **Level 1 - Newcomer (0 XP):** every essential capability is unlocked from day one — Session creation, Trade logging, the Calculator, Emotion logging, the safety/psychology areas, and basic reports.
- **Level 2 - Market apprentice (100 XP):** at least 2 closed Sessions, 3 reviewed Trades, 2 Reflections, and 1 complete Trade Plan. Suggested unlocks: Scenario Templates, Pattern Linking, a basic weekly report, daily missions.
- **Level 3 - Analyst (300 XP):** at least 5 complete Sessions, 10 reviewed Trades, 1 Pattern with three Stages, 5 Post-Trade Reflections. Suggested unlocks: advanced Pattern Registry, Similar Sessions, Pattern Report, trend comparison, advanced All-Trades filters.
- **Level 4 - Disciplined trader (700 XP):** at least 10 complete Sessions, 20 reviewed Trades, 1 complete Strategy, 2 Weekly Reviews, and at least 100 XP from the Psychology & review domain. Suggested unlocks: multi-strategy analytics, Strategy Detection Events, risk presets, a discipline dashboard, an advanced psychology report.
- **Level 5 - Strategist (1500 XP):** at least 20 complete Sessions, 35 reviewed Trades, 3 valid Patterns each used in at least two Scenarios with a recorded outcome, 2 Strategy revisions, 1 Monthly Review. Suggested unlocks: Marketplace publishing, evidence reports, experimental AI pattern detection, personal challenges, strategy comparison.
- **Level 6 - Trading master (3000 XP):** at least 35 complete Sessions, 60 reviewed Trades, 10 Pattern resolutions, 6 Weekly Reviews, 3 Monthly Psychology checks, and **no single domain accounting for more than 60% of total XP**. Suggested unlocks: mentor mode, advanced comparative reports, publishing public templates, building a learning path, multi-period performance analysis.
- **Level 7 - Grand market master (6000 XP):** at least 60 complete Sessions, 100 reviewed Trades, 20 Pattern resolutions, 10 Strategy review cycles, 12 Weekly Reviews, **at least 15% of total XP from the Reflection domain, at least 15% from the Planning domain, and no single domain above 50% of total XP**. Suggested unlocks: a Prestige badge, mentor/teacher tools, building missions for other users, publishing a full playbook, a long-term mastery report, a custom rank title.

No level's requirements may include profit, win rate, or daily trade count. A user who only logs trades without Reflections, Sessions, or a Strategy can accumulate enough XP but never open the mastery gate — the UI should say so explicitly, e.g. *"You have enough XP; complete one Weekly Review and two more Reflections to advance."*

### 11.14 Suggested progression pace

For an active but reasonable user:

| Level | Approximate time |
|---|---|
| Level 2 | 3-7 days |
| Level 3 | 2-3 weeks |
| Level 4 | 1-2 months |
| Level 5 | 3-4 months |
| Level 6 | 6-8 months |
| Level 7 | 10-14 months |

### 11.15 Abuse-prevention rules

**Idempotency.** Every scorable event needs a unique dedupe key that pays XP exactly once, for example:

```text
session.closed:{sessionId}
trade.reviewed:{tradeId}
pattern.resolved:{patternId}:{scenarioId}
strategy.review:{strategyId}:{reviewCycle}
bias.monthly:{YYYY-MM}
report.weekly:{YYYY-WW}
```

**Daily caps.**

| Domain | Suggested cap |
|---|---:|
| Recurring Trade XP | 40 XP/day |
| Session XP | 35 XP/day |
| Recurring Psychology XP | 20 XP/day |
| Community XP | 5 XP/day |
| All recurring activity combined | 80 XP/day |

Achievements, the Monthly Review, and one-time bonuses sit outside the daily cap.

**Server-side validation.** The client must never determine the XP amount — it only sends the event type and a source id, e.g.:

```js
{
  type: "trade_post_review_completed",
  sourceType: "trade",
  sourceId: "trade-123",
  dedupeKey: "trade.reviewed:trade-123"
}
```

The server must: (1) verify the Trade exists, (2) verify ownership, (3) verify it isn't closed/cancelled in a way that invalidates the event, (4) verify the Reflection actually exists, (5) read the canonical XP value from the rule table, (6) apply the daily cap, (7) reject a duplicate event, and (8) increment `xp_total` transactionally.

### 11.16 Technical implementation (relative to the original 7.17 implementation)

- **Rule files.** `public/pages/shared/profile-xp-rules.js` and `server/community/xp-rules.mjs` gained the full new event catalog plus `DOMAIN_BY_TYPE`/`PER_SOURCE_MAX`/`PER_TYPE_PERIOD_CAP`/`DOMAIN_DAILY_CAP`/`RECURRING_DAILY_CAP_TOTAL`/`SOURCE_TOTAL_CAP` on both sides — `tests/account-profile-xp-rules-sync.test.mjs` now asserts every one of these exports byte-identical, not just the original four.
- **XP event shape.** `user_xp_events` rows now carry `domain`, `source_type`, `source_id`, and `dedupe_key` (`server/db/repo.pg.mjs`'s `mapXpEvent`/`xpEvents.record`).
- **Database.** `server/db/migrations/011_xp_engine.sql` adds `domain`/`source_type`/`source_id`/`dedupe_key` to `user_xp_events` plus a **partial** unique index `UNIQUE (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL` — partial, not `NOT NULL`, so pre-engine rows (which have no dedupe key) are exempt rather than requiring a backfill. A dedupe-key collision (Postgres unique-violation `23505`, or an equivalent check in the memory repo) returns `{duplicate:true}` from `xpEvents.record()` instead of throwing, so a client re-sending the same key after a reload is a harmless no-op, not an error.
- **Wiring to existing events**, plus new ones this pass added: `tradejournal:patterns-changed` and `tradejournal:strategy-education-changed` are now consumed by `account-profile-store.js` (previously dispatched but unused); `tradejournal:sessions-changed` is now actually dispatched from `session-workspace-logic.js`'s `save()` (previously only `removeSession()` fired it); `community-store.js` gained `tradejournal:community-post-published` and `tradejournal:listing-rated`, and widened `tradejournal:listing-published`'s detail to carry `type`/`sourceId` so XP routes to the right domain without an extra fetch. **Idempotency is achieved via the dedupe-key mechanism above, not literal before/after diffing** — a deliberate deviation from this section's original wording: each trigger recomputes eligible XP from the fresh store state on every event fire and re-derives the same dedupe key for an already-awarded action, which the server's unique index (and a fast client-side "already sent" `Set`, mirroring the original per-trigger sync-ID-set pattern) both already treat as a no-op. This achieves the same guarantee (an event firing again is never sufficient to award XP again) with less bookkeeping than tracking a full previous-vs-new record diff.
- **Server-side ownership/state verification** (`routes.profile.mjs`'s `verifySourceAndState`): every event whose `sourceType` maps to a Section 7.18 repo domain (session/pattern/strategy/trade) is re-fetched via `repo.<domain>.get(userId, sourceId)` — already scoped by owner, so "doesn't exist" and "belongs to someone else" return the identical `404 SOURCE_NOT_FOUND`, never leaking which. A handful of types additionally assert a real state transition (`session_closed_with_summary` needs `status==='closed'` plus a `fateSummary.note`; `trade_closed_with_pnl` needs `status==='closed'` plus a real `exitPrice`/`pnl`); `pattern_report_generated` is verified against a real count of `trading_session_scenarios` rows (`repo.tradingSessions.countScenariosForPattern`), not the client's own `scenarioReport()` count.
- **Offline mode.** `recordXp()` (`account-profile-store.js`) no longer does a raw `fetch()` with `.catch(()=>{})` (which silently lost an offline-earned award) — it now enqueues through a new `TradeJournalSyncQueue` module, `'xp-events'`, the same offline-outbox-with-backoff mechanism every other Section 7.18 module already uses. The Level tab shows *"N XP pending sync"* via the already-existing `TradeJournalSyncQueue.pendingCount('xp-events')` accessor.
- **Mastery gates** (Section 11.13/11.18): `server/community/mastery-rules.mjs` (server-only, no client copy — the gate is always computed server-side and returned via `GET /api/users/me/mastery`, never recomputed client-side) plus new repo methods (`countByType`, `sourceCountsForType`, `sourceIdsWithAllTypes`, `domainBreakdown`, `usefulActivityDays`) backing the snapshot it evaluates against.

### 11.17 Wiring real XP into the dashboard header ring — already done via NAVRYA, legacy path untouched

Verified rather than built: the **NAVRYA** character header (`navrya-src/character-app.jsx`, `navrya-src/store.js`'s `refreshProfile()`) already calls `TradeJournalAccountProfileStore.getProfile()` on load and computes `level`/`xpMax` from the real `xpTotal` via `TradeJournalProfileXPRules.levelForXp`/`xpForNextLevel` — the exact progress formula this section originally called for:

```text
progress =
  (currentXp - currentLevelThreshold)
  / (nextLevelThreshold - currentLevelThreshold)
```

This is real for every character page today, not a gap. The **only** thing that remains purely static is `panel-system.js`'s legacy `.level-ring b`/`syncRank()` fallback path — and that element isn't even present in the current character HTML markup (NAVRYA superseded it), so there is nothing live left to wire there; adding a fetch call for markup that no longer exists would be dead code, not a real fix. Section 5's "XP and ranks" and Section 10's Known Constraints describe this same legacy-only caveat.

### 11.18 Final model

Level-up should always be evaluated as three conditions together, never XP alone:

```text
Level Up =
  XP threshold met
  AND mastery requirements met (11.13)
  AND domain balance satisfied (11.13, Levels 6-7)
```

This is specifically what closes off every farming path a single-condition (XP-only) gate would otherwise allow: logging many incomplete trades, sending many AI messages, creating duplicate Patterns, spamming Community, logging in daily with no activity, marking every Pattern "successful," or placing many trades purely to accumulate XP. What the system rewards instead is one consistent behavior loop: **proper planning → disciplined execution → honest logging → review and learning.**

### 11.19 Admin-editable XP configuration (Admin Panel "XP & Segmentation" tab) - **IMPLEMENTED**

Every number in Sections 11.3-11.13 (point values, per-source/per-day/per-period caps, mastery-gate thresholds, achievement points) is now admin-editable at runtime, stored in Postgres, without a code deploy - built on explicit user direction to make the rule tables "کامل - قوانین در دیتابیس قابل‌ویرایش بشن" (fully database-editable), not just a reporting dashboard.

- **The boundary: numbers are editable, verification logic never is.** An admin can retune how generous the system is (e.g. raise `session_created` from 2 to 5 points, lower Level 4's `closedSessions` requirement from 10 to 5), but never inject a brand-new, unverified XP source - `LEVEL_THRESHOLDS`, which types exist, which domain each belongs to, and what counts as valid evidence for an achievement/state check all stay in code. `isKnownXpConfigTarget()` (`server/admin/routes.mjs`) enforces this: every write is checked against the real code-declared defaults first: an admin cannot invent `points:made_up_type` or `mastery:2:not_a_real_requirement`.
- **Storage: one generic table, not six typed ones.** `xp_config_overrides` (`server/db/migrations/012_xp_config_overrides.sql`) is a natural-key `{config_key, value jsonb}` store, namespaced by prefix (`points:{type}`, `domainCap:{domain}`, `recurringCap`, `sourceCap:{type}`, `periodCap:{type}`, `sourceTotalCap:{sourceType}`, `achievementPoints:{key}`, `mastery:{level}:{requirementKey}` - the last one splits on `:` to represent nested requirements like `domainXpMin:psychology`). Chosen over one typed table per category (the `provider_pricing`/`admin_ai_keys` pattern from 7.16) since these categories have genuinely different shapes and, in total, are well under a hundred small rows - `repo.xpConfig` (`repo.pg.mjs`/`repo.memory.mjs`) is a single `list()`/`set()`/`remove()` domain, not six.
- **`server/community/xp-config.mjs`'s `getEffectiveXpConfig(repo)`** merges these overrides on top of the `xp-rules.mjs`/`mastery-rules.mjs`/`achievement-rules.mjs` code defaults, **TTL-cached in-process (30s)** - `POST /me/xp-events` is a real hot path that used to read these values as free constant lookups; reading Postgres on every single XP award would have been a regression. Every admin write route calls `invalidateXpConfigCache()` immediately after, so the cache only ever risks being stale for a few seconds under concurrent traffic, never for a whole TTL window after an admin's own edit. Unlike `admin_ai_keys`' internal-HTTP-plus-shared-secret bridge to the separate AI gateway process (7.16), no cross-process bridge is needed here - `routes.profile.mjs` and the admin routes share the same process/pool.
- **`routes.profile.mjs` and `mastery-rules.mjs` both now take the effective, override-merged config as a parameter** (`blockersForLevel(level, snapshot, requirementsTable)`, `evaluateGate(xpLevel, snapshot, requirementsTable)` - `requirementsTable` defaults to the static `LEVEL_REQUIREMENTS` export when omitted, so existing callers/tests are unaffected) rather than reaching for the module-level constants directly - this is what makes an admin's edit real, not just a display value in the admin UI.
- **`level_5_reached`/`five_day_login_streak`'s points, previously hardcoded inline in `routes.profile.mjs`, are now also admin-editable** via `xp-config.mjs`'s `SERVER_ONLY_ACHIEVEMENT_POINTS`, merged the same way as every other achievement's points.
- **Admin UI (`public/pages/admin/app.js`'s `xpTab()`):** one editable table per category (`xpConfigTable()`, a shared row-builder), each row showing Default | Current | an edit input (+ a day/week selector for period caps) | Save | Reset - Reset is disabled once a row isn't overridden. Mirrors the AI tab's "two independent save actions, no bulk submit, toast-on-save" convention (7.16) rather than inventing a new admin-UI pattern.
- **`GET /api/admin/xp/config`** returns every category in one response (points/domainCaps/recurringCap/sourceCaps/periodCaps/sourceTotalCaps/achievementPoints/masteryRequirements), each row flagged `overridden` with its default and current effective value - **`POST`**/**`DELETE`** take `{category, key, value}` / `?category&key` and both call `invalidateXpConfigCache()` plus write an `admin_audit_log` row (the same `audit()` helper 7.16 already established), same as every other admin write in this codebase.

## 12. How to Add a New Feature Safely (Checklist)

- [ ] Confirm whether the change belongs in the active iframe runtime or the outer React shell; do not edit only `App.jsx` when the feature belongs to a dashboard.
- [ ] Add shared behavior under `public/pages/shared/`, expose one `window.TradeJournal...` API, and insert its CSS/scripts in the same dependency-safe order in all four character HTML files.
- [ ] Use `TradeJournalPanelLayer` and the existing `--ps-*`/`--sw-*` tokens so Hunter, Engineer, Commander, and Sage retain their own accent and artwork.
- [ ] Add every fixed label to all four actual language dictionaries (`fa`, `ar`, `en`, `es`), set dynamic direction from the current document language, and verify both RTL and LTR layouts.
- [ ] Extend the appropriate existing localStorage store and normalizer; use `TradeJournalImageStore` for blobs and keep a base64 fallback only where current stores already do so.
- [ ] Reuse public integration adapters and events instead of duplicating Pattern, Strategy Education, Trade, or Session data into a parallel store.
- [ ] For AI work, add a server endpoint with strict JSON Schema output, read credentials from environment variables, and keep the core feature usable when the endpoint is unavailable.
- [ ] Run `npm.cmd test`, add focused regression coverage for cross-character/script-order/modal/store behavior, then run `npm.cmd run build`; never hand-edit `dist/`.
