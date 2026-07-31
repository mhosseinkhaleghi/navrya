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
| Persistence | `localStorage` for records/layout/settings plus IndexedDB for uploaded file blobs |
| Backend | Small Node.js `http` server for AI endpoints only |
| External AI | OpenAI Responses API, called only from the Node server |
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
├── .env.example                  # AI server environment-variable template
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
│       ├── icon-system.*         # Lucide upgrade/render layer
│       └── vendor/               # Vendored Lucide script and license
├── server/
│   └── pattern-ai-server.mjs     # OpenAI-backed JSON API server
├── tests/
│   └── trade-regression.test.mjs # Trade/calculator/modal/integration regression suite
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
| `tradejournal-language` | Character chooser language |
| `{character}-language` | Language of each character dashboard |
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

The stores dispatch `tradejournal:patterns-changed`, `tradejournal:strategy-education-changed`, `tradejournal:trades-changed`, and `tradejournal:trade-settings-changed` after writes. The shell listens for the iframe message `tradejournal:character-selected`.

## 4. Theming & Multi-Character Gamification System

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

## 5. Internationalization (i18n)

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
- `trade-i18n.js` — calculator, wizard, emotions, reports, calendar, and trades.

Each feature i18n module exposes a `window` API with `t()`, current language, direction, and usually locale-aware number/date helpers. Missing feature keys fall back to English or the key name, depending on that module.

### Language persistence and refresh

- The chooser stores `tradejournal-language` and defaults to English.
- Each character stores `{character}-language` and defaults to Persian.
- A language switch updates `lang`, `dir`, fixed copy, market clock formatting, rank labels, and feature views through DOM mutation observers.
- Feature numbers use `Intl.NumberFormat`; dates and clocks use `Intl.DateTimeFormat` with `fa-IR`, `ar-EG`, `en-US`/`en-GB`, or `es-ES`.
- Market clocks use IANA zones: `America/New_York`, `Europe/London`, `Asia/Tokyo`, and `Australia/Sydney`, refreshed every 30 seconds.

## 6. Feature Inventory

### 6.1 React shell and character chooser

- **Purpose:** Select a visual trading persona and preserve the existing dashboard pages without rewriting them as React components.
- **Files:** `index.html`, `src/release.js`, `src/shell.css`, `public/pages/select/*`; `src/App.jsx` and `src/main.jsx` are inactive equivalents.
- **Dependencies:** React globals, `postMessage`, hash navigation, iframe pages.
- **Important details:** The shell supports Vite paths and direct `file://` paths through a protocol-sensitive prefix. Login buttons in the chooser are presentation/demo interactions; no identity provider or session is implemented.

### 6.2 Character dashboards and session library

- **Purpose:** Present the themed header, market clocks, navigation, session cards, quotes, chat launcher, and character statistics.
- **Files:** `public/pages/{hunter,engineer,commander,sage}/index.html`, `styles.css`, `app.js`, `assets/*`.
- **Dependencies:** Character language dictionaries and every shared module loaded at the bottom of each HTML file.
- **Important details:** Dashboard HTML remains the visual baseline. Shared features hide/show the legacy `.content` children instead of replacing the header/sidebar. Search, favorites, language menu, rotating slogans, and list/grid controls are local DOM behaviors.

### 6.3 Icon system

- **Purpose:** Replace legacy SVG symbol references and dynamic icon placeholders with a consistent icon set.
- **Files:** `shared/vendor/lucide.min.js`, `shared/icon-system.js`, `shared/icon-system.css`.
- **Dependencies:** The Lucide global.
- **Important details:** `legacyMap` translates old `#i-*` IDs. A `MutationObserver` schedules icon rendering for newly inserted DOM. Use `data-lucide="icon-name"` or `TradeJournalIcons.icon()` in new dynamic UI.

### 6.4 Block/panel system and Settings

- **Purpose:** Provide resizable, hideable cards for Dashboard, Sessions, and Strategies without changing the character shell.
- **Files:** `shared/panel-system.js`, `shared/panel-system.css`.
- **Dependencies:** Character page DOM, character theme variables, optional `TradeJournalOpenPositionsModule`.
- **Important details:** Panels have `{id, type, title?, description?, span: 1..4, visible?, custom?}`. Layout is stored per character/view. `register(view, panels)` only appends missing IDs. Supported built-in types are `metric`, `focus`, `watch`, `strategy`, `notes`, `ai`, and `open-trades`. The prompt-based panel builder is a local classifier/preview only and has no AI endpoint.

### 6.5 Session creation and workspace

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

### 6.6 Pattern Registry

- **Purpose:** Define reusable market-recognition patterns with stages, thresholds, reference images, and pattern-specific AI training.
- **Files:** `pattern-registry.types.js`, `pattern-registry-store.js`, `pattern-registry-i18n.js`, `pattern-registry-ai.js`, `pattern-registry.js`, `pattern-registry.css`.
- **Route:** list at `#strategies/patterns`; per-pattern tabs at `#strategies/patterns/{id}/{details|chat|report|sharing}`.
- **Dependencies:** IndexedDB image store, Panel Layer, session scenarios, Trade Store usage links, AI server.
- **Important details:** Search is debounced and list rows navigate to a profile without changing editor behavior. Details preserve drag reorder, up/down controls, multi-upload, notes, lightbox, 15 MB validation, auto-save, and manual save. Chat remains pattern-scoped. Report aggregates scenarios from all character stores and linked trades through `TradeJournalTradeReports`; insufficient datasets render localized “insufficient data” text instead of fabricated zeroes. Sharing persists only `isPublic` and has no community/marketplace implementation. Scenario selection stores a snapshot so old sessions remain readable even if the registry later changes.

### 6.7 Multi-strategy Education

- **Purpose:** Manage multiple independent execution/risk playbooks, each with its own AI training, reports, detection history, and trade links.
- **Files:** `strategy-education.types.js`, `strategy-education-store.js`, `strategy-education-i18n.js`, `strategy-education-ai.js`, `strategy-education.js`, `strategy-education.css`, `strategy-education-extras.css`.
- **Route:** list at `#strategies/education`; per-strategy tabs at `#strategies/education/{id}/{details|chat|report|sharing}`.
- **Dependencies:** Pattern Registry's shared visual primitives, IndexedDB image store, AI server, Trade Store/UI, scenario cards.
- **Important details:** The legacy singleton is migrated once without deleting its old key. Every strategy independently owns Position Management, Risk & Capital, Overall Framework, attachments, chat history, AI summary, and detection events. List toggles control selector visibility only. Deleting a strategy sets linked trades' `linkedStrategyId` to `null` and never deletes trades. The report tab filters unified trades by strategy ID and combines them with a configurable 72-hour detection funnel. Sharing currently persists only `isPublic` and deliberately has no marketplace behavior. AI-from-event uses preview/approve and stores `origin: 'ai_from_event'`. `getRiskDefaults(strategyId)` and `getPositionGuide(strategyId)` never choose a strategy implicitly.

### 6.8 Trade calculator

- **Purpose:** Solve interdependent price, risk, position, leverage, margin, fee, and target values and hand them to trade logging.
- **Files:** `trade-calculator.js`, calculator portions of `trade-ui.js`, `trade-system.css`.
- **Dependencies:** Trade settings and explicitly selected Strategy risk defaults.
- **Important details:** `solve(source, manual, defaults)` performs up to eight bidirectional passes while preserving manually locked fields. It calculates SL distance, risk amount/percent, position size, margin/leverage, isolated-margin liquidation, weighted multi-TP RR, round-trip commission, breakeven, commission-adjusted potential profit, and return relative to margin or position size. Insufficient results remain `null`, not `NaN`. The floating calculator button is mounted beside the existing chat launcher.

### 6.9 Trade logging wizard and emotion logging

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

### 6.10 Open Positions module and session integration

- **Purpose:** Render hunting/open trades consistently in panels and session workspaces, with lifecycle actions.
- **Files:** `trade-open-positions.js`, integration code in `trade-ui.js` and `session-card-updates.js`, styles in `trade-system.css`.
- **Dependencies:** Trade Store/UI, Panel Layer, session scenario `source` IDs.
- **Important details:** `TradeJournalOpenPositionsModule` exposes `render`, `mount`, `refresh`, and `listActive`. It registers one `open-trades` panel in both Dashboard and Sessions. Hunting records can become open or cancelled; open records can log emotions or close with exit-price/P&L calculation; every card links to trade details. Session rows resolve a trade by `source.sessionId` and `source.scenarioId`, so score sorting does not break identity.

### 6.11 Reports, trading calendar, and All Trades

- **Purpose:** Derive performance and activity views from the unified Trade store and provide complete trade review/edit access.
- **Files:** `trade-reports.js`, report/calendar/table styles in `trade-system.css`, Trade Store analytics, Trade UI details/editor.
- **Routes:** `#strategies/reports`, `#strategies/trades`.
- **Dependencies:** Trade Store, Pattern Registry names, Strategy tabs, psychology endpoint.
- **Important details:**
  - Shared filters cover week, month, quarter, all time, custom range, and pattern.
  - Metrics show total/status counts, detection-to-open-to-close funnel, pattern-tag share, and AI accuracy only when linked correctness data exists.
  - Equity, pattern win rate, funnel, activity, and AI accuracy are drawn directly on native canvas.
  - The calendar groups trades by local date, colors cells by daily P&L intensity, and opens a day's trade list.
  - All Trades filters by query, date, pattern, status, and direction and opens the common edit/detail dialogs.
  - Psychology analysis sends only closed trades with emotion logs.

### 6.12 Market clocks and localized ranks

- **Purpose:** Keep global session clocks and character vocabulary accurate after language changes.
- **Files:** character `app.js` files and `panel-system.js`.
- **Dependencies:** browser `Intl` implementation and the level number already present in dashboard HTML.
- **Important details:** Clocks use IANA zones, not fixed offsets. Rank names are a seven-item character/language lookup. Neither ranks nor XP are currently computed from user activity.

## 7. AI Integration Points

### Server configuration

`server/pattern-ai-server.mjs` uses Node's built-in `http` module and the OpenAI Responses API at `https://api.openai.com/v1/responses`.

Environment variables:

```text
OPENAI_API_KEY     # Required for remote AI responses
OPENAI_MODEL       # Defaults to gpt-5.6
PATTERN_AI_PORT    # Defaults to 8787
```

The API key is read only from `process.env`; it is never stored in browser state. Requests have a 100 MB body limit and a 90-second upstream timeout. The server binds to `127.0.0.1`, enables JSON CORS responses, and supports `GET /health`. Vite proxies `/api/patterns`, `/api/strategy-education`, and `/api/trades` to port 8787.

All model calls request strict JSON Schema output. The server maps oversized bodies to 413, invalid JSON to 400, missing API key to 503, and other failures to 500.

### Endpoints

| Endpoint | Browser caller | Input | Structured output |
|---|---|---|---|
| `POST /api/patterns/generate-stages` | `pattern-registry-ai.js` | language, pattern identity/description/threshold/stages, up to 6 image data URLs | `{stages: string[], provider, model}`; 1–12 stages |
| `POST /api/patterns/chat` | `pattern-registry-ai.js` | same pattern context, latest message, last 20 chat messages, images | `{reply, suggestedStages: string[], provider, model}` |
| `POST /api/strategy-education/summarize` | `strategy-education-ai.js` | all three education sections plus categorized attachment data/notes | `{summary: {positionManagement, riskManagement, overallFramework}, provider, model}` |
| `POST /api/strategy-education/chat` | `strategy-education-ai.js` | full education context, message, last 24 messages, attachments | `{reply, summary, suggestions[], provider, model}`; suggestions are restricted to known field paths |
| `POST /api/strategy-education/from-event` | `strategy-education-ai.js` | event narrative, optional screenshots, active UI language | structured strategy draft with name, framework, initial execution rules, validation plan, and predicted outcome; UI requires explicit approval before saving |
| `POST /api/trades/analyze` | `trade-ui.js` | language, selected trade context, up to 4 screenshot data URLs | `{summary, observations[], warnings[], provider, model}` |
| `POST /api/trades/psychology-analysis` | `trade-reports.js` | language and up to 500 closed trade records | `{summary, insights[], correlations[], sampleSize, provider, model}` |

Pattern and Strategy Education browser clients provide local multilingual fallbacks when the server or key is unavailable. Session entry/fate summaries are fully local demonstration output. Trade screenshot analysis fails softly; psychology analysis reports an unavailable state rather than inventing results.

## 8. Coding Conventions & Style Rules

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

## 9. Known Constraints, TODOs, and Partially-Implemented Areas

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

## 10. How to Add a New Feature Safely (Checklist)

- [ ] Confirm whether the change belongs in the active iframe runtime or the outer React shell; do not edit only `App.jsx` when the feature belongs to a dashboard.
- [ ] Add shared behavior under `public/pages/shared/`, expose one `window.TradeJournal...` API, and insert its CSS/scripts in the same dependency-safe order in all four character HTML files.
- [ ] Use `TradeJournalPanelLayer` and the existing `--ps-*`/`--sw-*` tokens so Hunter, Engineer, Commander, and Sage retain their own accent and artwork.
- [ ] Add every fixed label to all four actual language dictionaries (`fa`, `ar`, `en`, `es`), set dynamic direction from the current document language, and verify both RTL and LTR layouts.
- [ ] Extend the appropriate existing localStorage store and normalizer; use `TradeJournalImageStore` for blobs and keep a base64 fallback only where current stores already do so.
- [ ] Reuse public integration adapters and events instead of duplicating Pattern, Strategy Education, Trade, or Session data into a parallel store.
- [ ] For AI work, add a server endpoint with strict JSON Schema output, read credentials from environment variables, and keep the core feature usable when the endpoint is unavailable.
- [ ] Run `npm.cmd test`, add focused regression coverage for cross-character/script-order/modal/store behavior, then run `npm.cmd run build`; never hand-edit `dist/`.
