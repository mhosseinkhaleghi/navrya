import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Objects built inside the vm sandbox carry that realm's own Object.prototype, so
// assert.deepEqual (node:assert/strict's deepStrictEqual, prototype-sensitive) reports "same
// structure but not reference-equal" even when every field matches - the same caveat
// tests/ai-process-registry.test.mjs's own comments call out.
const clone = value => JSON.parse(JSON.stringify(value));

async function engineSandbox(overrides) {
  const sandbox = { window: {} };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalNavryaStore: overrides.store,
    TradeJournalAIWorkflowEngine: overrides.workflowEngine,
    TradeJournalNavryaLiveSession: overrides.liveSession,
    TradeJournalAIProcessRegistry: overrides.processRegistry
  });
  vm.runInNewContext(await source('ai-context-engine.js'), sandbox, { filename: 'ai-context-engine.js' });
  return sandbox.window.TradeJournalAIContextEngine;
}

test('snapshot() reads navigation.activeId from window.TradeJournalNavryaStore when present', async () => {
  const engine = await engineSandbox({ store: { getState: () => ({ activeId: 'sessions' }) } });
  assert.equal(engine.snapshot().navigation.activeId, 'sessions');
});

test('snapshot() returns a safe empty snapshot (never throws) when no store is mounted on this page', async () => {
  const engine = await engineSandbox({});
  const snapshot = engine.snapshot();
  assert.equal(snapshot.navigation.activeId, null);
  assert.deepEqual(clone(snapshot.activeEntities), { sessionId: null, scenarioId: null, entryId: null, tradeId: null, patternId: null, strategyId: null, postId: null, listingId: null });
  assert.equal(snapshot.workflow, null);
});

test('snapshot() includes the current AI workflow state when a workflow engine is present', async () => {
  const workflowState = { workflowId: 'wf-1', actionId: 'session.create' };
  const engine = await engineSandbox({ workflowEngine: { current: () => workflowState } });
  assert.equal(engine.snapshot().workflow, workflowState);
});

test('snapshot() never exposes anything beyond navigation/activeEntities/workflow (no raw store dump)', async () => {
  const engine = await engineSandbox({ store: { getState: () => ({ activeId: 'sessions', sessions: [{ id: 's1', secret: 'nope' }], profile: { private: true } }) } });
  const snapshot = engine.snapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), ['activeEntities', 'navigation', 'workflow']);
  assert.deepEqual(Object.keys(snapshot.navigation), ['activeId']);
});

// Journey B (trade planning) needs real entity resolution: a Trade started from an active
// Session/Scenario must inherit that real source relationship, matching how liveSessionView.jsx's
// own "Start Trade" button already threads source.sessionId/scenarioId through openLogWizard().

test('snapshot() resolves activeEntities.sessionId from TradeJournalNavryaLiveSession.getActiveSessionId()', async () => {
  const engine = await engineSandbox({ liveSession: { getActiveSessionId: () => 'session-123' } });
  assert.equal(engine.snapshot().activeEntities.sessionId, 'session-123');
});

test('snapshot() reports sessionId: null when no live session is open, or the hook is absent', async () => {
  const withHook = await engineSandbox({ liveSession: { getActiveSessionId: () => null } });
  assert.equal(withHook.snapshot().activeEntities.sessionId, null);
  const withoutHook = await engineSandbox({});
  assert.equal(withoutHook.snapshot().activeEntities.sessionId, null);
});

// scenarioId resolves from the currently active AI process (liveSessionView.jsx registers each
// expanded scenario card as 'live-session-scenario-' + scenario.id), not a separate state channel.

test('snapshot() resolves activeEntities.scenarioId from an active "live-session-scenario-{id}" process, only when a session is also active', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => 'session-123' },
    processRegistry: { activeOpenProcess: () => ({ id: 'live-session-scenario-scenario-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.scenarioId, 'scenario-abc');
});

test('snapshot() reports scenarioId: null when the active process is not a scenario card', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => 'session-123' },
    processRegistry: { activeOpenProcess: () => ({ id: 'trade-calculator', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.scenarioId, null);
});

test('snapshot() reports scenarioId: null when nothing is open at all', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => 'session-123' },
    processRegistry: { activeOpenProcess: () => null }
  });
  assert.equal(engine.snapshot().activeEntities.scenarioId, null);
});

test('snapshot() never resolves a scenarioId without a real active session, even if a scenario process is somehow still registered as open', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => null },
    processRegistry: { activeOpenProcess: () => ({ id: 'live-session-scenario-scenario-abc', allowlist: [], step: null }) }
  });
  const snapshot = engine.snapshot();
  assert.equal(snapshot.activeEntities.sessionId, null);
  assert.equal(snapshot.activeEntities.scenarioId, null);
});

// Journey F, F19/F20: entryId resolves the exact same way scenarioId does - a Scenario belongs to
// an Entry, not directly to a Session (liveSessionView.jsx's own addScenario(entry)), and
// EntryDetailPanel's own comment already documents only one is ever mounted/registered at a time
// ("the parent renders this with key={entry.id}... React genuinely remounts a fresh instance per
// selected entry"), so activeOpenProcess() correctly picks whichever one is currently shown.

test('snapshot() resolves activeEntities.entryId from an active "live-session-entry-{id}" process, only when a session is also active', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => 'session-123' },
    processRegistry: { activeOpenProcess: () => ({ id: 'live-session-entry-entry-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.entryId, 'entry-abc');
});

test('snapshot() reports entryId: null when the active process is not an entry panel', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => 'session-123' },
    processRegistry: { activeOpenProcess: () => ({ id: 'live-session-scenario-scenario-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.entryId, null);
});

test('snapshot() never resolves an entryId without a real active session, even if an entry process is somehow still registered as open', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => null },
    processRegistry: { activeOpenProcess: () => ({ id: 'live-session-entry-entry-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.entryId, null);
});

// Journey F, F22: tradeId resolves from the real 'trade-details-{id}' process (the Trade Details
// view) - unlike scenarioId/entryId, never gated on an active Session, since a Trade can be
// viewed with no Session workspace open at all.

test('snapshot() resolves activeEntities.tradeId from an active "trade-details-{id}" process, with no active session required', async () => {
  const engine = await engineSandbox({
    liveSession: { getActiveSessionId: () => null },
    processRegistry: { activeOpenProcess: () => ({ id: 'trade-details-trade-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.tradeId, 'trade-abc');
});

test('snapshot() reports tradeId: null when the active process is not a Trade Details view', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'live-session-scenario-scenario-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.tradeId, null);
});

test('snapshot() reports tradeId: null when nothing is open at all', async () => {
  const engine = await engineSandbox({ processRegistry: { activeOpenProcess: () => null } });
  assert.equal(engine.snapshot().activeEntities.tradeId, null);
});

// Journey F, F27-31: patternId/strategyId/postId/listingId all follow the exact same
// activeOpenProcess()-prefix pattern as tradeId - no active-Session requirement either (a Pattern,
// Strategy, Community post, or Marketplace listing can all be viewed with no Session open).

test('snapshot() resolves activeEntities.patternId from an active "pattern-editor-{id}" process, with no active session required', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'pattern-editor-pattern-abc', allowlist: ['name'], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.patternId, 'pattern-abc');
});

test('snapshot() reports patternId: null when the active process is not a Pattern editor', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'strategy-editor-strategy-abc', allowlist: ['name'], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.patternId, null);
});

test('snapshot() resolves activeEntities.strategyId from an active "strategy-editor-{id}" process', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'strategy-editor-strategy-abc', allowlist: ['name'], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.strategyId, 'strategy-abc');
});

test('snapshot() resolves activeEntities.postId from an active "community-comment-{id}" process (the post whose comments are expanded)', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'community-comment-post-abc', allowlist: ['draft'], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.postId, 'post-abc');
});

test('snapshot() reports postId: null when the active process is not a Community comment panel', async () => {
  const engine = await engineSandbox({ processRegistry: { activeOpenProcess: () => null } });
  assert.equal(engine.snapshot().activeEntities.postId, null);
});

test('snapshot() resolves activeEntities.listingId from a dedicated "marketplace-listing-{id}" process, never the conditional "marketplace-rate-{id}" (whose isOpen() reflects rating eligibility, not "is this listing being viewed")', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'marketplace-listing-listing-abc', allowlist: [], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.listingId, 'listing-abc');
});

test('snapshot() reports listingId: null when the active process is "marketplace-rate-{id}" instead of "marketplace-listing-{id}"', async () => {
  const engine = await engineSandbox({
    processRegistry: { activeOpenProcess: () => ({ id: 'marketplace-rate-listing-abc', allowlist: ['ratingValue'], step: null }) }
  });
  assert.equal(engine.snapshot().activeEntities.listingId, null);
});
