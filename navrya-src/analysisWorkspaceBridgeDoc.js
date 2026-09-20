// The few facts about the sandboxed panel bridge that BOTH the runtime (a .jsx file) and the
// prompt builder (plain .js, unit-tested directly by node --test) need. Kept in its own plain-JS
// module so the test runner never has to parse JSX just to assert on the generation prompt - the
// same reason this project's other pure logic lives beside, not inside, its React files.
// Bumped from 1 -> 2 for the same reason, and at the same time, as dashboardPanelBridgeDoc.js's own
// BRIDGE_VERSION: the scriptable postMessage bridge (navrya.getX()) is retired in favor of
// declarative data-navrya-bind/data-navrya-each attributes - see panelSafeRender.js's header
// comment for the full security writeup. A v1 panel's stored source still displays; its <script>
// tag is simply dropped on render like any other disallowed content, so it degrades to stale/empty
// data until regenerated or edited, rather than crashing or fabricating a value.
export const BRIDGE_VERSION = 2;

// What the model is told about the size budget. The real, enforced ceiling lives in
// analysisWorkspacePanelStore.js (MAX_SOURCE_BYTES) and is checked before any write; this is only
// the human-readable form of it used in the prompt.
export const MAX_SOURCE_BYTES_HINT = '12 KB';

// The one allowlist deciding what `data-navrya-bind="..."` / `data-navrya-each="..."` a generated
// Analysis Workspace fragment may legally reference - shared, unmodified, by
// analysisWorkspacePanelBuilder.js (to describe these exact paths to the model),
// panelSafeRender.js's renderPanelSafely() (to resolve them against a real snapshot), and this
// target's own tests (to prove the schema and the real buildSnapshot() shape never drift apart).
export const ANALYSIS_WORKSPACE_BIND_SCHEMA = {
  scalars: [
    'context.instrument', 'context.timeframe', 'context.market', 'context.status',
    'context.startedAt', 'context.elapsedMinutes', 'context.loopMinutes', 'context.language',
    'context.direction', 'context.entryCount', 'context.scenarioCount', 'context.openPositionCount',
    'chart.symbol', 'chart.interval', 'chart.embeddable', 'chart.note'
  ],
  lists: {
    entries: { itemFields: ['id', 'index', 'type', 'createdAt', 'timeframe', 'note', 'hasImage', 'scenarioCount'] },
    scenarios: { itemFields: ['id', 'entryId', 'title', 'side', 'probability', 'occurred', 'patternTitle', 'completionPercent'] },
    positions: { itemFields: ['id', 'instrument', 'side', 'status', 'entry', 'stop', 'target'] }
  }
};
