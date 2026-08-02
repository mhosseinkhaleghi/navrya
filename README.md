# TradeJournal React

## Character-dashboard panel layer

The panel functionality runs inside the original HTML dashboards for Hunter, Engineer, Commander, and Market Sage. Their existing header, sidebar, imagery, cards, fonts, and color system remain in place.

Use the existing sidebar to open Dashboard, Strategies, or Settings. Each view keeps a device-local panel layout: panels can be shown or hidden and resized from one to four grid columns. The new Settings entry in the existing sidebar opens the panel manager and the AI panel-builder interface.

The panel builder creates a safe local preview while the server is not connected. In the backend phase it must call an authenticated Edge Function such as `/api/panels/generate`; no AI API key should be stored or sent from the browser.

## Session workspace (v5)

The original `New session` control now opens a character-themed session form with optional 5m, 1h, 4h, and daily chart uploads; trading-session, timeframe, Gregorian/Jalali dates, update loop, and grace-period fields. A created session opens inside the original dashboard content area and includes:

- prior-session summary and a local AI-analysis placeholder;
- live elapsed and loop timers, with the selected character's existing artwork in the session header;
- chart log cards, optional notes, chart-local AI feedback, and delete controls;
- a scenario form that records title, evidence, strategy tag, pattern stages, completion, probability, trigger, invalidation issue, execution-plan fields, and occurrence state;
- session-pattern, active-scenario, and similar-session panels.

Session objects are stored under character-specific `localStorage` keys as a temporary client-side schema. Uploaded image previews are kept for the current browser session; the planned backend/data layer should move images to object storage and session/scenario records to the database. The Settings panel registers all session card types so they can be enabled, hidden, and resized alongside other panels.

Market clocks are now refreshed from IANA time zones (New York, London, Tokyo, Sydney), and the level title follows the seven-rank role table for each character and selected language.

## Session Workspace logic alignment (v6)

`public/pages/shared/session-workspace-logic.js` adapts the supplied **SESSION WORKSPACE** workflow to the existing character dashboards rather than introducing another interface. It provides one shared workflow for Hunter, Engineer, Commander, and Market Sage:

- a horizontal timeline for chart, movement, and fate entries, with compact and expanded card modes;
- interval-focused loop accounting, elapsed-session time, grace-period settings, and reopen/close state;
- session dashboard tabs for pattern stages, scenario probability history, and position execution plans;
- editable entry/stop/target fields, open/closed position state, and activity logging;
- session report view, fate summary, carry-forward context, and a local AI-analysis placeholder ready for a server-side provider;
- normalized local records so earlier session data continues to work while a future database schema replaces local storage.

## Logic-study implementation status (v7)

The implementation now also follows the study document's core calculations: activity-log-based loop updates, focus states, grace-period indicator, scenario form completion, scenario occurrence/invalidation activity, pattern-score ordering, the 70% position-protocol gate, and R:R calculation/sorting for position cards. These behaviors stay in the shared workspace layer, so the four character screens keep identical behavior while using their own artwork and accent colors.

## Session visual design system (v8)

`public/pages/shared/session-design-system.css` is the single design-token layer for the session workspace. It maps the character accent (`--ps-accent`) into workspace tokens while retaining shared ink surfaces, semantic success/warning/danger states, market colors, typography, spacing, radii, responsive modal behavior, timers, chart lightbox, custom scrollbars, and read-only treatment. `session-design-system.js` applies market and interaction decorations consistently to each character workspace.

## Updated timeline and scenario cards (v9)

`public/pages/shared/session-card-updates.js` and `session-card-updates.css` implement the updated TimelineEntryCard and ScenarioCard specification across all four character themes. The shared card layer includes accurate IANA market/Tehran clocks, market-colored borders, persistent chart uploads, raw/annotated chart modes, lightbox, structured local AI summaries, related-scenario references, collapsible scenario forms, probability history, pattern stages and the 70% protocol gate, invalidation confirmation, execution plans, occurrence state, read-only handling, local text auto-fill, and Persian/Arabic/English/Spanish labels.

## Chart, movement, and fate entry workflow (v10)

`public/pages/shared/session-entry-flow.js` and `session-entry-flow.css` implement the supplied EntryModal, ImageUpload, toolbar, timeline scrolling, and FateSummaryModal behavior. Chart and fate entries require an image; movements require a description and accept an optional image. Images are validated, previewed, changed or cleared, and stored in IndexedDB. The flow also includes market/timeframe/date fields, Persian-date display, related-scenario selection with invalidated-scenario filtering, pending chart analysis, open-position update logs, fate-based session closing, the second-stage session summary, local structured session analysis, and report handoff. The accompanying typography layer increases card, form, badge, and modal text size and consistently uses the character dashboard's primary UI font.

## Professional icons and multilingual session fixes (v11)

The four character dashboards now share a locally bundled Lucide icon system, including upgraded navigation, settings, city, session action, chart, scenario, AI, and modal icons with consistent sizing and stroke weight. The session workspace is explicitly bound to the selected language direction: Persian and Arabic use RTL, while English and Spanish use LTR. Dashboard sections retain their intended vertical order and uploaded chart cards follow the correct language direction. The fate workflow now falls back safely when IndexedDB is unavailable, opens the required upload/scenario step before the structured AI summary, and persists the summary plus generated analysis for the next session. Arabic and Spanish workspace copy and locale-specific clocks are included alongside Persian and English.

## Pattern Registry (v12)

The existing Strategies area now includes a character-themed Pattern Registry at `#strategies/patterns`. It provides searchable accordion rows, pattern CRUD, independent completion thresholds, ordered/reorderable stages, multi-image IndexedDB storage, image notes/lightbox, debounced auto-save, and persistent per-pattern training chats. Persian and Arabic use RTL, English and Spanish use LTR, and fixed labels plus number formatting follow the active dashboard language.

Registered patterns are exposed to the existing scenario form through `TradeJournalPatternStore.listForScenarios()`. Selecting one snapshots its stages into the scenario, records usage, shows a live stage checklist, and locks the position protocol until that pattern's own threshold is reached.

AI calls are server-side only. Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and run the API next to Vite in a second terminal:

```bash
npm run dev:api
```

The browser calls `/api/patterns/generate-stages` and `/api/patterns/chat`; Vite proxies these routes to the local API server. Without an API server or key, the UI remains usable and clearly switches to its local demonstration fallback.

## Session pattern-stage synchronization (v13)

The Session Dashboard now resolves each scenario's pattern against the Pattern Registry and renders the registered stage labels instead of stringifying stage objects. Legacy string/object completion records are migrated to stable stage IDs, invalid or duplicate completions are removed, progress is capped at 100%, and both pattern and position protocol states use the pattern's own completion threshold.

## Strategy Education (v14)

The existing Strategies area now includes a `#strategies/education` tab beside Pattern Registry. One local-first education record stores position-management rules, structured risk limits, the overall strategy framework, categorized image/PDF/document attachments, and a unified persistent training chat. Form changes auto-save, while explicit save controls remain available.

AI chat suggestions are returned as separate field updates and remain pending until the user approves or rejects each one. The same record exposes `TradeJournalStrategyEducationStore.getRiskDefaults()` and `getPositionGuide()` so calculators and scenario cards can consume the canonical values. Expanded scenarios now show the saved execution guide and risk defaults without merging them into pattern-recognition data.

The API server also provides `/api/strategy-education/summarize` and `/api/strategy-education/chat`. Both reuse `OPENAI_API_KEY` and `OPENAI_MODEL`; without a configured service, the interface uses a multilingual local fallback and keeps all edits functional.

## Unified trades, calculator, reports, and psychology (v15)

The four character dashboards now share one local-first `Trade` record for hunting, open, closed, and cancelled opportunities. The record keeps pricing, bidirectional risk calculations, multi-target plans, commission, linked Pattern Registry IDs, timeframe context, screenshots, outcome/P&L, and an append-only emotion timeline together. This single source feeds:

- a globally available Trade Calculator beside the AI chat control, with visually distinct manual and calculated values;
- the reusable five-step trade wizard and independent mid-trade emotion logger;
- complete position actions in the Session workspace, including hunting-to-open, cancel, emotion, close/P&L, and details;
- the Reports and All Trades tabs in Strategies, with synchronized filters, native charts, and a monthly P&L heatmap calendar;
- account/commission defaults in the existing Settings page;
- `/api/trades/analyze` for optional screenshot review and `/api/trades/psychology-analysis` for structured behavioral analysis.

All labels and number/date formatting use the shared Persian, Arabic, English, and Spanish language state. Persian and Arabic remain RTL; English and Spanish remain LTR. Every screen inherits the selected Hunter, Engineer, Commander, or Market Sage accent and border tokens.

## Position workflow and modal reliability (v16)

Trade and calculator dialogs now use a fixed header/footer with a dedicated scrollable body. Their close controls support click, touch, backdrop click, and Escape, and shared Pattern/Strategy dialog close buttons remain reachable above modal content. The calculator reports commission-adjusted potential profit and margin return for single or weighted multi-target plans.

Session position rows are resolved by scenario identity even after score-based sorting. Logging a trade is available while a pattern protocol is still locked (only a closed session disables it), and hunting/open trades render through the reusable `TradeJournalOpenPositionsModule`. That module supplies open, cancel, emotion, close, and detail actions and can be added to Dashboard or Sessions from the existing panel manager. Regression tests cover calculator math, trade lifecycle, panel registration, all four character entry points, session wiring, modal teardown, and multilingual keys.

یک پروژهٔ React مبتنی بر Vite است که صفحهٔ انتخاب شخصیت و داشبوردهای شکارچی، مهندس، فرمانده و استاد بازار را به یک مسیر یکپارچه وصل می‌کند، بدون تغییر در ظاهر صفحات اصلی.

## اجرا

```bash
npm install
npm run dev
```

با انتخاب یک شخصیت، برنامه به مسیر داشبورد آن نقش منتقل می‌شود. مسیرهای مستقیم نیز به‌صورت زیر هستند:

- `#/dashboard/hunter`
- `#/dashboard/engineer`
- `#/dashboard/commander`
- `#/dashboard/sage`

## بخش انجمن (Community) به یک سرور جداگانه نیاز دارد

`npm run dev` فقط Vite را اجرا می‌کند. صفحهٔ ورود حالا پیش از تکمیل انتخاب شخصیت (وقتی روی یک کارت شخصیت کلیک می‌کنید) یک پاپ‌آپ نام از کاربر می‌گیرد و آن را با فراخوانی `POST /api/users` روی سرور بخش انجمن ثبت می‌کند؛ اگر آن سرور در حال اجرا نباشد، این ساخت حساب همیشه با خطای «اتصال به سرور برقرار نشد» مواجه می‌شود (تفاوت بین «سرور در دسترس نیست» و «سرور درخواست را رد کرد» در پیام خطا مشخص است). برای فعال کردن این بخش، در یک ترمینال جدا:

```bash
npm run dev:community-api   # اجرای سرور بخش انجمن (پورت 8788)
```

**نیازی به نصب Docker یا Postgres نیست.** اگر فایل `.env` وجود نداشته باشد یا `DATABASE_URL` در آن تنظیم نشده باشد، سرور به‌طور خودکار با یک مخزن حافظه‌ای (in-memory) اجرا می‌شود — همان که در تست‌ها استفاده می‌شود — و ساخت حساب/فید/مارکت‌پلیس بلافاصله کار می‌کند؛ فقط با ری‌استارت سرور، داده‌ها پاک می‌شوند (روی کنسول هم پیام هشدار «IN-MEMORY repo» چاپ می‌شود تا این حالت هیچ‌وقت با پایداری واقعی اشتباه گرفته نشود). برای پایداری واقعی (Postgres محلی):

```bash
docker compose up -d        # پایگاه‌داده Postgres محلی
npm run db:migrate          # ساخت جداول
npm run dev:community-api   # اجرای سرور بخش انجمن با DATABASE_URL در .env
```

بدون اجرای `npm run dev:community-api` (چه با Postgres، چه با حالت حافظه‌ای)، بقیهٔ برنامه (داشبوردها، الگوها، استراتژی‌ها، معاملات، پروندهٔ روان) کاملاً محلی و بدون نیاز به سرور کار می‌کند؛ فقط بخش «تالار گفتگو» و ساخت/جابه‌جایی کاربر حالت توسعه به این سرور وابسته‌اند.
