// The few facts about the dashboard panel sandbox bridge that BOTH the runtime (a .jsx file,
// navrya-src/dashboardPanelSandbox.jsx) and the prompt builder (plain .js, unit-tested directly by
// node --test) need. Kept in its own plain-JS module so the test runner never has to parse JSX
// just to assert on the generation prompt - the same reason analysisWorkspaceBridgeDoc.js exists
// beside analysisWorkspacePanelRuntime.jsx.
export const BRIDGE_VERSION = 1;

// What the model is told about the size budget. The real, enforced ceiling lives in
// dashboardPanelBuilder.js (MAX_SOURCE_BYTES) and server/pattern-ai-server.mjs (checked before any
// persistence), and migration 076's own CHECK constraint is the final backstop; this is only the
// human-readable form of it used in the prompt.
export const MAX_SOURCE_BYTES_HINT = '12 KB';
