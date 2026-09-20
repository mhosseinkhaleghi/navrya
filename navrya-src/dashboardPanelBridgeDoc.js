// The few facts about the dashboard panel sandbox bridge that BOTH the runtime (a .jsx file,
// navrya-src/dashboardPanelSandbox.jsx) and the prompt builder (plain .js, unit-tested directly by
// node --test) need. Kept in its own plain-JS module so the test runner never has to parse JSX
// just to assert on the generation prompt - the same reason analysisWorkspaceBridgeDoc.js exists
// beside analysisWorkspacePanelRuntime.jsx.
// Bumped from 1 -> 2 when the scriptable postMessage bridge (navrya.getX()) was retired in favor
// of declarative data-navrya-bind/data-navrya-each attributes (see panelSafeRender.js for why: a
// script-capable frame that has ever seen real data cannot be proven safe against self-navigation
// exfiltration, so v2 never gives generated code script execution at all). A v1 panel's stored
// source (a <script> calling navrya.getTradeSummary()) still displays - the sanitizer simply drops
// the <script> tag on render, same as any other disallowed content - but it will show stale/empty
// data until the trader regenerates or edits it, which is the intended, honestly-degraded outcome
// for a fundamentally retired capability, not a crash or a silent lie.
export const BRIDGE_VERSION = 2;

// What the model is told about the size budget. The real, enforced ceiling lives in
// dashboardPanelBuilder.js (MAX_SOURCE_BYTES) and server/pattern-ai-server.mjs (checked before any
// persistence), and migration 076's own CHECK constraint is the final backstop; this is only the
// human-readable form of it used in the prompt.
export const MAX_SOURCE_BYTES_HINT = '12 KB';

// The one allowlist that decides what `data-navrya-bind="..."` / `data-navrya-each="..."` a
// generated dashboard.panel fragment may legally reference - shared, unmodified, by
// dashboardPanelBuilder.js (to describe these exact paths to the model), panelSafeRender.js's
// renderPanelSafely() (to resolve them against a real snapshot), and this target's own tests (to
// prove the schema and the real buildDashboardBridgeSnapshot() shape never drift apart). A path
// NOT listed here can never resolve to a value, no matter what the model writes - see
// panelSafeRender.js's own header comment for why that has to be a fixed allowlist, not a generic
// object walk.
export const DASHBOARD_PANEL_BIND_SCHEMA = {
  scalars: ['tradeSummary.totalTrades', 'tradeSummary.openCount'],
  lists: {
    openPositions: { itemFields: ['id', 'instrument', 'side', 'status', 'entry', 'stop', 'target'] },
    patternStats: { itemFields: ['id', 'title', 'occurrenceRate', 'detectionCount'] },
    'psychologyMirror.tags': { itemFields: ['tag', 'sampleSize', 'winRate'] }
  }
};
