---
name: navrya-javascript-engineering
description: Implement, test, and review NAVRYA JavaScript, React, CSS, backend, and generated-view changes in the repository's established patterns. Use for coding, refactoring, bug fixes, tests, code style, linting, i18n, or build work in this repository.
---

# NAVRYA JavaScript Engineering

Use Node.js 22 or newer. This repository uses JavaScript with JSDoc, React 18, Vite, Express, `node:test`, and plain CSS. There is no ESLint, Prettier, TypeScript, or EditorConfig configuration. Do not add a formatter or lint stack unless the task explicitly requests it.

## Implementation rules

- Read the local file and its tests before editing. Match its existing style. Avoid repository-wide formatting changes.
- Use `rg` before adding code. Find and reuse the existing component, helper, adapter, store, event, API route, or test pattern before introducing a new one.
- Character-dashboard modules use strict IIFEs and `window.TradeJournal...` APIs. Do not add ESM imports to only one character page.
- Put domain types in the existing `*.types.js` convention. Normalize stored and server input defensively.
- Persist through the existing store, then dispatch its existing `CustomEvent`. Reuse adapters such as `getRiskDefaults` or `listForScenarios` instead of private storage access.
- Keep a single data path from UI to store to sync/API. Do not duplicate state, transformations, validation, or persistence for the same feature.
- Keep async UI responsive: disable active controls, use translated notices/toasts, and preserve local fallback behavior where it already exists.
- Use Lucide through the existing icon layer. Use theme tokens and logical CSS for RTL/LTR.
- Never edit `dist/` or generated `public/pages/shared/navrya-*-sessions-app.js` files by hand.

## Efficient agent behavior

- Load only the files and documentation required by the task. Use headings and targeted searches before reading large documents.
- Avoid repeated investigation and repeated status summaries. Record durable facts once in `HANDOFF.md` or the applicable skill.
- Prefer a focused extension and regression test over a broad rewrite. Refactor only when it directly removes duplication or is required to preserve a clear single source of truth.

## Validation

Run the narrowest relevant test first, then the required release gate:

```sh
npm test
npm run build
```

Add a focused regression test for every bug fix or changed contract. Test script-order, iframe, store, sync, modal, API, and multilingual behavior through the existing Node test harness when applicable.

## References

- `ARCHITECTURE.md` sections 2, 7, 8, 9, and 12.
- `package.json` for the executable commands.
- `tests/*.test.mjs` for behavior contracts.
- `public/pages/shared/navrya/components/**/*.prompt.md` for visual component contracts.
