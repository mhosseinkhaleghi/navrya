# TradeJournal Architecture

## 1. Overview

TradeJournal is a local-first trading journal and scenario-planning interface. A user selects one of four gamified trading characters, then works inside a character-themed dashboard to create market sessions, register price patterns, document strategy rules, plan and log trades, track emotions, and review reports. The application prioritizes preserving the four existing dashboard designs while sharing the same behavior and stored data across them.

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
│       ├── ai-*, global-ai-dock* # Global AI Assistant: process registry, settings/usage stores, i18n, dock UI
│       ├── dev-user-switcher.*   # DEV MODE user switcher (Community's identity bootstrap, Section 4)
│       ├── admin-heartbeat.js    # Client heartbeat loop feeding the admin Users tab - Section 7.16
│       ├── community*, marketplace-ui.*, messages-ui.*  # Community: feed/marketplace/messaging UI, store, i18n, types
│       ├── icon-system.*         # Lucide upgrade/render layer
│       └── vendor/               # Vendored Lucide script and license
├── server/
│   ├── pattern-ai-server.mjs     # Multi-provider (OpenAI/Anthropic/Kimi/DeepSeek) JSON API gateway
│   ├── community-api-server.mjs  # Community backend entrypoint (Express, real pg-backed repo, binds a real port)
│   ├── community/                # App factory (app.mjs), routes, dev-mode auth, upload storage - Section 4
│   ├── admin/                    # Admin routes + requireAdmin auth middleware - Section 7.16
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
| `tradejournal:strategies:v2` | Multi-strategy records (`Strategy[]`) |
| `tradejournal:strategy-education:v1` | Read-only legacy singleton source used once by the v2 migration |
| `tradejournal:trades:v1` | Unified trade records |
| `tradejournal:trade-settings:v1` | Fee, account balance, and default risk settings |
| `tradejournal:sessions:v1:{character}` | Character-scoped session records |
| `tradejournal:session-signatures:v1` | Global cross-character signatures for closed sessions |
| `tradejournal:session-similarity-threshold:v1` | User-configurable similarity-alert threshold |
| `tradejournal:character-panels:{character}:{view}` | Panel layout per character and view |
| `tradejournal:psychology-settings:v1` | Protective-nudge toggles: `breathing`, and one reconciled `postTradeReflection` toggle (replaces the earlier separate `revenge`/`cooldown` settings) |
| `tradejournal:mental-health-profile:v2` | The single Trading Mental Health Profile - one profile, not per-character. Holds the original `baseline`/`emotionalProfile`/`triggerProfile`/`behavioralPatterns`/`cognitiveProfile`/`progressTracking`/`activeInterventions`/`healthReportCache`/`chatHistory`/`educationCards` plus v2's `intake`, `psychologicalProfile`, `continuousTracking`, and `redFlags`. Loaded and migrated additively from the legacy `tradejournal:mental-health-profile:v1` key the first time; `baseline` itself is left untouched and a snapshot of it is kept at `intake.legacyBaselineV1` |
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
- `TradeJournalAIProcessRegistry`, `TradeJournalAISettingsStore`, `TradeJournalAIUsage`, `TradeJournalAII18n`, `TradeJournalGlobalAI`

The stores dispatch `tradejournal:patterns-changed`, `tradejournal:strategy-education-changed`, `tradejournal:trades-changed`, and `tradejournal:trade-settings-changed` after writes. The shell listens for the iframe message `tradejournal:character-selected`.

## 4. Backend & Database (Community)

This is the project's **first departure from pure local-first**. Every feature described in Section 3 and in Section 7's earlier entries (Patterns, Strategies, Trades, Sessions, Mental Health) is intentionally still `localStorage`/IndexedDB-only, single-browser, no accounts — that decision is unchanged and deliberate; migrating those features onto a server is explicitly out of scope and a distinct future task. The reason a real backend exists at all is that the Community feature (Section 7.15) is inherently multi-user: a social feed post has to be visible to people other than its author, a marketplace purchase has to be recorded by someone other than the seller, and a message has to reach its recipient. None of that can live in one browser's `localStorage`.

### Stack

- **Database:** PostgreSQL, accessed through `pg` (`node-postgres`) with a plain connection `Pool` — no ORM, consistent with the project's low-dependency style.
- **API server:** `server/community-api-server.mjs`, using Express (unlike the small hand-rolled-`http` AI server) given the number of REST endpoints. It is a **separate process and port** from `server/pattern-ai-server.mjs` — AI-endpoint code and community/account CRUD code are cleanly separated, and adding this backend never touched the AI server.
- **Local dev database:** `docker-compose.yml` at the repo root runs a single `postgres:16-alpine` service (`tradejournal`/`tradejournal`/`tradejournal` user/pass/db, port 5432, named volume). `npm.cmd run db:migrate` (`server/db/migrate.mjs`) applies the plain-SQL files in `server/db/migrations/` in order, tracking applied ones in a `schema_migrations` table it creates itself.
- **File storage:** post images and listing screenshots are decoded from base64 data URLs (the same convention every other upload in this app already uses — never multipart/`FormData`) and written to local disk under `UPLOADS_DIR`, served via a static `/uploads` route. This is deliberately kept behind one small module, `server/community/storage.mjs`, so swapping to S3-compatible object storage later is a contained change (see Known Constraints).

### The injectable-repository pattern (why `npm.cmd test` never needs a live Postgres)

`server/db/repo.pg.mjs` and `server/db/repo.memory.mjs` implement the identical async method surface (`users`, `posts`, `comments`, `listings`, `purchases`, `ratings`, `threads`, `messages`, `reports`, plus the admin-only domains added in 7.16: `sessions`, `usageEvents`, `providerPricing`, `adminKeys`, `auditLog`). `server/community/app.mjs`'s `createApp({repo, uploadsDir})` is a pure factory with zero import-time side effects — it takes whichever repo it's given. `server/community-api-server.mjs` (the process entrypoint) is the only file that binds a real port, and picks its repo based on `DATABASE_URL`: the real `pg`-backed repo when it's set, or `createMemoryRepo()` itself when it's not — a zero-setup local fallback (data resets on restart, logged loudly on startup so it's never mistaken for real persistence) so a developer without Docker/Postgres installed can still run `npm run dev:community-api` and have Community actually work. Every test likewise injects `createMemoryRepo()` directly via `createApp()`, which re-implements the same business-rule invariants in plain JS (unique purchase per buyer/listing, a rating requires a prior purchase, thread `findOrCreate` idempotency, one open session per user) so the full API contract is verified with no database reachable. This mirrors the same philosophy the rest of the test suite already uses — fake `localStorage`/`fetch`/DOM in a `vm` sandbox — applied to the database layer.

### Schema

| Table | Purpose |
|---|---|
| `users` | Account foundation: `id`, `display_name`, `avatar_url`, `bio`, `created_at`, plus `role` (`user`/`moderator`/`admin`, default `user`) and `suspended_at` added in 7.16 for the admin panel. |
| `posts`, `comments` | The social feed. |
| `marketplace_listings` | A published snapshot of a pattern's or strategy's content and real evidence stats (`success_rate_percent`, `sample_size`, `evidence_as_of`), plus `preview_content`/`full_content`, `status` (`draft`/`published`/`delisted`), and `featured` (admin-only boolean, 7.16). |
| `marketplace_purchases` | Always `mock = TRUE` (DB `CHECK` constraint) — no real payment integration exists yet; see Known Constraints. `UNIQUE(listing_id, buyer_id)`. |
| `marketplace_ratings` | `UNIQUE(listing_id, buyer_id)`, and a **composite foreign key** to `marketplace_purchases(listing_id, buyer_id)` — "only a buyer with a real purchase can rate" is enforced at the database level, not just in application code. |
| `dm_threads`, `dm_messages` | Messaging. A thread is always anchored to one `listing_id` + `buyer_id` (`UNIQUE`) — never a general-purpose inbox between arbitrary users. |
| `reports` | Moderation minimum: `target_type` (`post`/`comment`/`listing`/`message`), `target_id` (polymorphic, no FK — validated against the right table in the application layer since Postgres can't cleanly FK across four tables), `status` (`open`/`reviewed`/`dismissed`). |
| `user_sessions` | Admin panel (7.16) heartbeat/presence tracking: `started_at`, `last_heartbeat_at`, `ended_at`. `UNIQUE ... WHERE ended_at IS NULL` enforces one open session per user at the DB level, backing app-level find-open-else-create logic. |
| `ai_usage_events` | Admin panel (7.16): a server-side mirror of each browser's local `tradejournal:ai-usage:v1` ledger, tagged with `user_id` (nullable) and `source` (which feature/endpoint generated it). |
| `provider_pricing` | Admin panel (7.16): natural-key table (`provider` PK) holding admin-set `prompt_price_per_1k`/`completion_price_per_1k`/`monthly_token_budget`, used by the Financial tab's cost/budget math. |
| `admin_ai_keys` | Admin panel (7.16): natural-key table (`provider` PK) holding server-side AI provider keys set from the admin UI. **Stored as plain text** — see Known Constraints. Never returned to the browser; only a masked `{isSet, updatedAt}` shape is. |
| `admin_audit_log` | Admin panel (7.16): one row per mutating admin action (`action`, `target_type`, `target_id`, `details`), written by every `PATCH`/`POST` handler under `/api/admin`. |

### Accounts: dev-mode switcher, not real authentication

`users` is the account foundation, but real authentication (password/OAuth/sessions) is explicitly deferred. `public/pages/shared/dev-user-switcher.js` (`window.TradeJournalDevUserSwitcher`) is the single place a dev-mode user is ever created or switched — **visibly labeled "DEV MODE — not real authentication" in the UI itself**, not just in code comments. A new user is created at **login time, gated on character selection specifically**: `public/pages/select/app.js` (the character chooser) does nothing extra for a returning browser (`tradejournal:dev-user-id` already in `localStorage` — clicking a character's Select button completes the selection immediately, same as before this feature existed). For a fresh browser, clicking a character card's Select button does **not** complete the selection — it opens a one-field "what should we call you" popup instead and remembers which card was clicked (`pendingCharacterCard`); only once that name is submitted and this module's exported `createUser(displayName)` resolves (not a second, duplicated `fetch`) does the originally-clicked character's selection actually complete. The decorative "Continue with Google/Email/Sign up" buttons on the same page are unrelated — they only ever show a front-end demo toast and never touch account creation. A failed create keeps the popup open and shows a diagnostic message: a `TypeError` (fetch never reached a server — almost always because `server/community-api-server.mjs` isn't running) gets a distinct "start the community backend" message pointing at `npm run dev:community-api` (see the root `README.md`), while an HTTP-level rejection shows the real server error code inline instead of a generic dead end. A Settings-page card (also built by `dev-user-switcher.js`) additionally lets a tester **switch** between already-created users; it no longer offers to create one (that create path used to live there and was quietly broken - see Known Constraints). The chosen user id is sent as an `x-dev-user-id` header on every community API call, resolved server-side by `server/community/auth-dev.mjs`'s `devUserAuth(repo)` middleware — the **only** place identity is resolved; every route handler reads `req.currentUser`, never the raw header. A future real-auth swap is designed to be additive: write `auth-real.mjs` with the identical `(repo) => (req,res,next) => {...}` shape (verifying a session/JWT instead of trusting a header), then change the one `app.use(devUserAuth(repo))` line in `server/community-api-server.mjs`. No route file needs to change.

### API surface

All error bodies are `{error: 'CODE'}` (mirrors `pattern-ai-server.mjs`'s existing convention). Base routes: `GET/POST /api/users` (public — bootstraps identity), `GET /api/users/me`, `GET /api/users/:id`, `GET/POST /api/community/posts`, `DELETE /api/community/posts/:id`, `GET/POST /api/community/posts/:id/comments`, `POST /api/community/reports`, `GET/POST /api/marketplace/listings`, `GET /api/marketplace/listings/by-source/:sourceId`, `GET/PATCH /api/marketplace/listings/:id`, `POST /api/marketplace/listings/:id/purchase`, `GET/POST /api/marketplace/listings/:id/ratings`, `GET/POST /api/messages/threads`, `GET /api/messages/threads/:id`, `POST /api/messages/threads/:id/messages`. Every route except the two public `/api/users` ones requires a valid `x-dev-user-id`. Vite proxies `/api/community`, `/api/users`, `/api/marketplace`, `/api/messages`, and `/uploads` to `127.0.0.1:8788` (a distinct port and set of prefixes from the AI server's `127.0.0.1:8787`).

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
    backdrop: 'assets/card-stag-v2.png'
  },
  engineer: {
    accent: '#398cff',
    rgb: '57,140,255',
    backdrop: 'assets/engineer-card-v1.png'
  },
  commander: {
    accent: '#ff5f5e',
    rgb: '255,95,94',
    backdrop: 'assets/commander-card-v1.png'
  },
  sage: {
    accent: '#c362ff',
    rgb: '195,98,255',
    backdrop: 'assets/sage-card-v1.png'
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
- Chooser: four character-card images and `welcome-mountains-v1.png`.

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

There is currently **no XP calculation service, XP store, progression mutation, or persisted level model**. Gamification is visual/static except for rank-label localization. New code must not assume displayed XP values are backed by application data.

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
  - Sessions are character-scoped in localStorage.
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

### 7.7 Multi-strategy Education

- **Purpose:** Manage multiple independent execution/risk playbooks, each with its own AI training, reports, detection history, and trade links.
- **Files:** `strategy-education.types.js`, `strategy-education-store.js`, `strategy-education-i18n.js`, `strategy-education-ai.js`, `strategy-education.js`, `strategy-education.css`, `strategy-education-extras.css`.
- **Route:** list at `#strategies/education`; per-strategy tabs at `#strategies/education/{id}/{details|chat|report|sharing}`.
- **Dependencies:** Pattern Registry's shared visual primitives, IndexedDB image store, AI server, Trade Store/UI, scenario cards.
- **Important details:** The legacy singleton is migrated once without deleting its old key. Every strategy independently owns Position Management, Risk & Capital, Overall Framework, attachments, chat history, AI summary, and detection events. List toggles control selector visibility only. Deleting a strategy sets linked trades' `linkedStrategyId` to `null` and never deletes trades. The report tab filters unified trades by strategy ID and combines them with a configurable 72-hour detection funnel. Sharing now has real behavior: checking `isPublic` opens the marketplace publish flow (Section 7.15), snapshotting this strategy's content and real `detectionStats()` evidence into a new listing - it's no longer just a flag behind "coming soon" copy. AI-from-event uses preview/approve and stores `origin: 'ai_from_event'`. `getRiskDefaults(strategyId)` and `getPositionGuide(strategyId)` never choose a strategy implicitly.

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

### 7.14 Global AI Assistant

- **Purpose:** One persistent, cross-page chat dock that can converse generally, drive any open form through its existing approval pipeline, and turn a pasted trade screenshot into a pre-filled Trade Wizard - replacing the previous non-functional demo chat button.
- **Files:** `ai-process-registry.js`, `ai-settings-store.js`, `ai-usage-store.js`, `ai-settings-ui.js`, `ai-i18n.js`, `global-ai-dock.js`, `global-ai-dock.css`, `ai-settings.css`; server-side, the multi-provider gateway in `pattern-ai-server.mjs` (see section 8).
- **Dependencies:** `TradeJournalAIProcessRegistry` (every fillable flow registers against it), `TradeJournalTradeStore`/`TradeJournalTradeUI`/`TradeJournalTradeCalculator` (screenshot-to-wizard flow), `TradeJournalMentalHealthStore`/`TradeJournalMentalHealthAI`/`TradeJournalMentalHealthSafety` (therapist mode), the AI server's `/api/ai/*` and `/api/trades/extract-fields` routes.
- **Route:** AI settings live at `#ai-settings`, reached from the sidebar's existing "AI" link (`#assistantNav`) - the same manual hash-routing pattern already used by `#community` and `#mindset/profile` (`layer.show(page,'ai-settings')` + a manual `.sidebar nav a` active-class toggle, since `'ai-settings'` isn't in `panel-system.js`'s own `setActiveNav` map). Settings used to self-mount a card inside the generic Settings page (`.panel-settings`, via a `MutationObserver`); that mounting path is gone from `ai-settings-ui.js` entirely - this is a relocation of *where* the existing `buildSection()` UI renders, not a rewrite of what it renders.
- **Important details:**
  - **The sidebar's "AI" link no longer opens the chat dock.** It used to (`global-ai-dock.js`'s `wireAssistantNav()` intercepted the click and called `expand()`); that binding has been removed entirely. Clicking "AI" in the sidebar now navigates to `#ai-settings` like any other sidebar item. The **only** way to open the actual conversation is the dock's own floating launcher button (`data-global-ai-launcher`) - unaffected by this change.
  - **The dock is mounted directly on `document.body`**, the same way the calculator FAB is - never through `TradeJournalPanelLayer.show()`, which one-shot-replaces the page and would destroy a routed panel on every navigation. It carries `data-global-ai-launcher`, the exact attribute `trade-ui.js`'s `ensureGlobalUi()` looks for to position the calculator FAB beside it - removing the old `#openChat` button without this repoint would have silently broken that positioning.
  - **Universal process access (`ai-process-registry.js`):** any flow calls `register(processId, {allowlist, isOpen, activeStep, applyValue})` once, at the top of its own open-function. `isOpen()` is a plain DOM-presence check, so no flow needed new open/close event plumbing. Eight flows are registered: Trade Wizard and the emotion-log popup (`trade-ui.js`), pre-session check-in/post-trade reflection/monthly bias checklist (`mental-health-continuous.js`), the mental-health intake wizard (`mental-health-intake.js`), Pattern stage editing (`pattern-registry.js`), and Strategy field editing (`strategy-education.js`). Each `applyValue` uses whatever mutation mechanism that flow already has - a live closure over not-yet-persisted state for the first five, or the flow's own existing `store.applySuggestion` pipeline for intake/pattern/strategy - the dock never builds a second persistence path.
  - **Therapist mode** is an explicit, always-visible toggle in the dock's header, re-initialized from `ai-settings-store.js`'s `therapistModeDefault` on every page load rather than silently staying sticky. **On**, the dock appends to the mental-health profile's own chat history and calls `TradeJournalMentalHealthAI.chat()` directly, so its unconditional `checkText()` safety gate still runs first, exactly as it does from the Psychology page's own chat card. **Off** (the default), the dock calls the provider-agnostic `/api/ai/chat` gateway with the current `activeOpenProcess()` and never touches `TradeJournalMentalHealthStore` at all.
  - **Screenshot-driven trade entry** is explicit and click-initiated (an "Analyze as trade setup" chip next to the image thumbnail), not auto-detected - consistent with every other AI trigger in the app. It calls `/api/trades/extract-fields`, shows a review card with Apply/Discard before anything touches the wizard, and on Apply runs the exact same three-call sequence the existing calculator's "Log Trade" button already uses (`store.createDraft` → `applyCalculatedToTrade` → `openWizard`), just fed by extracted values. Emotional content in the accompanying message is seeded onto `trade.emotionLog` before the wizard opens, reusing the wizard's existing pre-seeded emotions step.
  - Token usage is recorded from two places: the decorator over the three pre-existing AI clients, and explicit `TradeJournalAIUsage.record()` calls from the dock's own two direct fetches (see section 8's "Usage tracking" note) - both are necessary for the usage totals to be complete.
  - The now-redundant per-page "fill by chat" launcher button in the intake wizard's welcome step was removed (the dock supersedes it); the intake chat surface itself is untouched.

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
  - **The XP & Segmentation tab is a deliberate placeholder**, not an oversight: it renders its route and a static "coming in the next phase" empty state, and calls no endpoint at all - matching this project's existing convention for reserved-but-unimplemented slots (e.g. the standardized psychological test results in the Mental Health Profile).

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
| `POST /api/ai/chat` | `global-ai-dock.js` (therapist mode **off**) | provider/apiKey/model, language, message, trimmed chat history, the currently open registered process (`{id, allowlist}`) if any | `{reply, suggestions[], provider, model, usage}`; when a process is supplied, `suggestions[].path` is constrained to that process's own allowlist via a dynamically-built schema enum |
| `POST /api/ai/test-connection` | `ai-settings-ui.js` ("Test connection") | provider/apiKey/model | `{ok: boolean, provider, model, usage}` |
| `POST /api/trades/extract-fields` | `global-ai-dock.js` (screenshot "Analyze as trade setup") | provider/apiKey/model, language, one chart screenshot data URL | `{direction, entryPrice, stopLoss, takeProfits[], leverage, confidence, provider, model, usage}`, all fields nullable except `confidence` - never a fabricated price |

Pattern and Strategy Education browser clients provide local multilingual fallbacks when the server or key is unavailable. Session entry/fate summaries are fully local demonstration output. Trade screenshot analysis fails softly; psychology analysis reports an unavailable state rather than inventing results.

### Usage tracking and BYO API keys

`ai-usage-store.js` observes token usage two ways: it decorates the three pre-existing AI clients' exported methods (`TradeJournalPatternAI.{generateStages,chat}`, `TradeJournalStrategyEducationAI.{chat,summarize,proposeFromEvent}`, `TradeJournalMentalHealthAI.{chat,educationCard}`) using the same Promise-wrapping pattern already established by `trade-ui.js`'s `details` layering - callers get the byte-identical resolved value, usage is only observed in transit; and the dock records usage explicitly for its own two direct fetch calls (`/api/ai/chat`, `/api/trades/extract-fields`), since those bypass the decorated clients entirely. A response with no `usage` field (local-fallback) is never recorded. "Tokens remaining" is only ever shown against a user-set `monthlyTokenBudget`; with no budget set, the UI says so honestly rather than showing a meaningless number.

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
- **No auth or remote record database:** Character chooser login controls are demonstrative. All journal data is browser-local and not synchronized between devices or browser profiles.
- **Character-scoped sessions:** Pattern, strategy, and trade records are shared in the iframe origin, but sessions are intentionally split into four localStorage keys by character.
- **Local AI placeholders:** Session chart analysis, fate analysis, and the panel prompt builder use deterministic local demo logic; they are not connected to the AI server.
- **Trend analysis provider:** `TradeJournalTrendAnalysisProvider.analyze()` defaults to `[]`; no live market-price or multi-timeframe data provider exists.
- **Session detection overlap:** Trade session detection uses UTC checks in the order London 07:00–16:00, New York 13:00–22:00, Tokyo 00:00–09:00, else Sydney. Overlaps resolve to the first matching range, and DST is not applied.
- **XP/progression:** No calculation or persistence exists. Rank localization only reads the level already rendered in `.level-ring b`.
- **AI accuracy schema drift:** The JSDoc declares `aiPredictionLinks[].matched`, while analytics looks for boolean `aiPredictionLinks[].correct`. Until reconciled, AI accuracy commonly remains “insufficient data.”
- **Status-history schema drift:** The JSDoc declares `{status, timestamp}`, while the runtime store writes `{status, at}`.
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
- **No live API key is configured for any of the four AI providers in this environment:** OpenAI/Anthropic/Kimi/DeepSeek routing in `pattern-ai-server.mjs` is implemented and covered by unit tests against a stubbed `fetch`, but has not been exercised against a real upstream call for any provider, OpenAI included. Treat the gateway as verified-by-contract, not verified-live, until a real key is configured and smoke-tested.
- **BYO API keys are in-memory by default:** a key entered in Settings is lost on page reload unless the user explicitly opts into `persistApiKey`, which then stores it, unencrypted, in `tradejournal:ai-byok:v1` with an inline warning shown at the moment of opt-in.
- **Community has no real authentication yet — this is a named, explicit follow-up, not an oversight.** `dev-user-switcher.js` trusts a client-supplied `x-dev-user-id` header, visibly labeled "DEV MODE — not real authentication" in the UI itself. `server/community/auth-dev.mjs` is designed so a real-auth swap (session/JWT-based) is additive - one new `auth-real.mjs` middleware file plus a one-line change in `server/community-api-server.mjs` - but that real implementation does not exist yet. Do not deploy Community publicly until it does. Moving the dev-mode name step to login time (see Section 4/7.15) changes only *where and how reliably* that temporary name is collected - it does not make it any more real.
- **The Settings-page account-creation path was silently broken before this pass, not by design.** The original `dev-user-switcher.js` resolved its create-user `fetch` on any HTTP response, including error bodies, and never checked `response.ok`; a failed create looked like a silent success and could leave `tradejournal:dev-user-id` set to the literal string `"undefined"`. Fixed by making `createUser()` check `response.ok`/the presence of `body.id` and reject with a real `Error` otherwise; the Settings card's create UI was removed in favor of the login-time name step, and its "switch users" list now tolerates a failed `GET /api/users` instead of throwing.
- **Account creation always fails until the Community backend is actually running** — `npm run dev` alone only starts Vite. The login-time name step's `createUser()` call needs `npm run dev:community-api` running in a separate terminal (documented in the root `README.md`); without it every attempt fails with the diagnostic "could not reach the server" message (a `TypeError` from `fetch`, not a server-side rejection). This is expected/operational, not a code bug - the rest of the app (dashboards, patterns, strategies, trades, mental health) stays fully local-first and needs none of this. **No Docker/Postgres install is required just to unblock this**, though: `server/community-api-server.mjs` falls back to `createMemoryRepo()` whenever `DATABASE_URL` is unset (logged loudly on startup so it's never mistaken for real persistence — data resets on every restart), so `npm run dev:community-api` alone is enough to make account creation and the rest of Community work locally. `docker compose up -d` + `npm run db:migrate` + a `DATABASE_URL` in `.env` are only needed for data that survives a restart.
- **Community uploads (post images, listing screenshots) are local-disk only.** `server/community/storage.mjs` writes under `UPLOADS_DIR` and serves it via a static `/uploads` route - this does not scale across multiple server instances and has no CDN/durability story. It is deliberately kept behind that one small module specifically so swapping to S3-compatible object storage later is a contained change, not a rewrite - but that swap has not been built yet.
- **Community still has no moderation queue for reports specifically.** Reporting (posts/comments/listings/messages → the `reports` table) exists from day one and is fully functional, but nothing currently reads the `open` reports it accumulates - there is no review/dismiss workflow yet, and the Admin Panel (7.16) does not add one (its Marketplace tab covers listing delist/feature, not the `reports` table). This is an explicit, named follow-up: the capability to *collect* reports was prioritized first specifically because it is much harder to retrofit after abuse has already occurred than to act on a growing queue.
- **Marketplace purchases are mock only.** `marketplace_purchases.mock` is hardcoded `TRUE` (with a DB `CHECK` constraint enforcing it) - there is no real payment processor integration. The schema (`price_amount`, `price_currency`, `priceAtPurchase`) is deliberately shaped so a real payment integration (Stripe or similar) can be dropped in later without a schema rewrite, but no such integration exists today. The Admin Panel's Financial tab labels its revenue figure `mock: true` for the same reason.
- **Docker/Postgres were not available in the environment this feature was originally built and tested in.** The schema, migrations, and the real `pg`-backed repository (`server/db/repo.pg.mjs`) are written correctly against Postgres's documented behavior and exercised indirectly (the in-memory repo re-implements the same invariants for the full API contract test suite), but have not been run against a live Postgres instance. Run `docker compose up -d` then `npm.cmd run db:migrate` and smoke-test before depending on this in a real deployment. This applies equally to the Admin Panel's five new tables (7.16, `004_admin.sql`).
- **Admin auth is built but disabled by default - `ADMIN_AUTH_ENFORCED` (unset/`false`).** While disabled, any identified dev-user (i.e. anyone who has ever created a Community account) can use every `/api/admin` route with no role check at all - this is intentional for testing the panel before real accounts/roles exist, but it means the Admin Panel must not be exposed anywhere reachable by untrusted users until this flag is flipped to `true` and real `admin`-role accounts exist. `server/admin/auth-admin.mjs` logs which mode is active on every server startup so this is never silent.
- **Admin-configured AI provider keys are stored as plain text in the `admin_ai_keys` table - there is no secrets-manager or encryption-at-rest yet.** This is an explicit, named follow-up, not a hidden gap: the masking discipline (never returning the raw key to any browser, restricting the one internal server-to-server read path) limits *exposure*, but does not protect the value at rest in the database itself the way a real deployment eventually should.
- **The AI gateway resolves admin-configured keys via an internal HTTP call to the Community API (`/internal/admin-ai-keys`), not a direct database connection - a deliberate choice, not a limitation to fix later.** This was chosen specifically to keep `server/pattern-ai-server.mjs`'s documented "no direct DB access" property intact rather than giving it a second `pg.Pool`; see 7.16 for the full reasoning. The tradeoff: an admin-set key can take up to ~60s (the cache TTL) to take effect, and is invisible to the AI gateway entirely while the Community API is down (falling back to the `.env` tier instead, never breaking the AI feature).
- **The XP & Segmentation tab in the Admin Panel is an intentional placeholder, not an unfinished feature that was cut short.** It renders its route and an honest empty state and calls no endpoint - there is no XP calculation, persistence, or user-segmentation logic anywhere in this codebase yet (see the separate, older "XP/progression" constraint above, which this tab does not change).

## 11. How to Add a New Feature Safely (Checklist)

- [ ] Confirm whether the change belongs in the active iframe runtime or the outer React shell; do not edit only `App.jsx` when the feature belongs to a dashboard.
- [ ] Add shared behavior under `public/pages/shared/`, expose one `window.TradeJournal...` API, and insert its CSS/scripts in the same dependency-safe order in all four character HTML files.
- [ ] Use `TradeJournalPanelLayer` and the existing `--ps-*`/`--sw-*` tokens so Hunter, Engineer, Commander, and Sage retain their own accent and artwork.
- [ ] Add every fixed label to all four actual language dictionaries (`fa`, `ar`, `en`, `es`), set dynamic direction from the current document language, and verify both RTL and LTR layouts.
- [ ] Extend the appropriate existing localStorage store and normalizer; use `TradeJournalImageStore` for blobs and keep a base64 fallback only where current stores already do so.
- [ ] Reuse public integration adapters and events instead of duplicating Pattern, Strategy Education, Trade, or Session data into a parallel store.
- [ ] For AI work, add a server endpoint with strict JSON Schema output, read credentials from environment variables, and keep the core feature usable when the endpoint is unavailable.
- [ ] Run `npm.cmd test`, add focused regression coverage for cross-character/script-order/modal/store behavior, then run `npm.cmd run build`; never hand-edit `dist/`.
