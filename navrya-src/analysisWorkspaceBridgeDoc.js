// The few facts about the sandboxed panel bridge that BOTH the runtime (a .jsx file) and the
// prompt builder (plain .js, unit-tested directly by node --test) need. Kept in its own plain-JS
// module so the test runner never has to parse JSX just to assert on the generation prompt - the
// same reason this project's other pure logic lives beside, not inside, its React files.
export const BRIDGE_VERSION = 1;

// What the model is told about the size budget. The real, enforced ceiling lives in
// analysisWorkspacePanelStore.js (MAX_SOURCE_BYTES) and is checked before any write; this is only
// the human-readable form of it used in the prompt.
export const MAX_SOURCE_BYTES_HINT = '12 KB';
