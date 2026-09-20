// Deterministic mapping from the trader's ACTUAL active AI provider (TradeJournalAISettingsStore)
// to the Vibe Coding Panel Studio's "coding profile" UX identity ("Codex" / "Claude Code").
//
// "Codex" and "Claude Code" are display identities layered on top of the real, existing
// OpenAI/Anthropic calls this repo already makes (server/pattern-ai-server.mjs) - never a real
// external coding-agent process, never an invented model id, never a claim that an ordinary
// provider call is a real dedicated coding-agent session. The UI must always show the real
// provider/model alongside this label (e.g. "Codex · OpenAI · GPT-5.6 Luna").
//
// Plain, dependency-free ESM - directly importable by `node --test` with zero JSX transform, and
// by server/pattern-ai-server.mjs as the one authoritative source for the SSE `engine` event, so
// the client-shown label and the server-emitted label can never drift apart. Same convention
// navrya-src/analysisWorkspacePanelBuilder.js already established for this project's other
// plain-JS-beside-JSX modules.
const CODING_ENGINES = {
  openai: { id: 'codex', label: 'Codex' },
  anthropic: { id: 'claude-code', label: 'Claude Code' }
};

// Returns { codingEngineId, codingEngineLabel } for a supported provider, or null for anything
// else (gemini/kimi/deepseek/unrecognized/undefined) - fail-closed, never a guessed default.
export function resolveCodingEngine(provider) {
  const entry = CODING_ENGINES[provider];
  return entry ? { codingEngineId: entry.id, codingEngineLabel: entry.label } : null;
}

export function isSupportedProvider(provider) {
  return Object.prototype.hasOwnProperty.call(CODING_ENGINES, provider);
}

export const SUPPORTED_PROVIDERS = Object.keys(CODING_ENGINES);
