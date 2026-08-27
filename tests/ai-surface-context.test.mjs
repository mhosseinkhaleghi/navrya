import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function surfaceSandbox(overrides) {
  const sandbox = { window: { location: { hash: overrides.hash || '' } } };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalAIProcessRegistry: overrides.processRegistry,
    TradeJournalAIContextEngine: overrides.contextEngine,
    TradeJournalAIJourneyEngine: overrides.journeyEngine
  });
  vm.runInNewContext(await source('ai-surface-context.js'), sandbox, { filename: 'ai-surface-context.js' });
  return sandbox.window.TradeJournalAISurfaceContext;
}

test('snapshot() reflects the topmost open process (id/step) and its layer when one is open', async () => {
  const surface = await surfaceSandbox({
    processRegistry: {
      activeOpenProcess: () => ({ id: 'trade-wizard', step: 2 }),
      snapshot: (id) => (id === 'trade-wizard' ? { open: true, step: 2, layer: 'foreground' } : { open: false, step: null, layer: null })
    },
    contextEngine: { snapshot: () => ({ navigation: { activeId: 'sessions' }, activeEntities: { tradeId: 't1' }, workflow: null }) }
  });
  const snap = surface.snapshot();
  assert.equal(snap.processId, 'trade-wizard');
  assert.equal(snap.step, 2);
  assert.equal(snap.layer, 'foreground');
  assert.equal(snap.entities.tradeId, 't1');
});

test('snapshot() prefers a real location.hash page (psychology/ai-assistant/community/account) over navigation.activeId', async () => {
  const surface = await surfaceSandbox({
    hash: '#mindset/intake',
    processRegistry: { activeOpenProcess: () => null },
    contextEngine: { snapshot: () => ({ navigation: { activeId: 'dashboard' }, activeEntities: {}, workflow: null }) }
  });
  assert.equal(surface.snapshot().page, 'psychology', 'a hash route must win over the 3-canvas-view navigation.activeId when both exist');
});

test('snapshot() falls back to navigation.activeId when the hash matches no known page', async () => {
  const surface = await surfaceSandbox({
    hash: '',
    processRegistry: { activeOpenProcess: () => null },
    contextEngine: { snapshot: () => ({ navigation: { activeId: 'strategies' }, activeEntities: {}, workflow: null }) }
  });
  assert.equal(surface.snapshot().page, 'strategies');
});

test('snapshot() only consults the Dashboard fallbackNextStep when nothing is open at all', async () => {
  const nextStep = { id: 'intake', domain: 'psychology', title: 'Complete your intake' };
  const surface = await surfaceSandbox({
    processRegistry: { activeOpenProcess: () => null },
    contextEngine: { snapshot: () => ({ navigation: { activeId: 'dashboard' }, activeEntities: {}, workflow: null }) },
    journeyEngine: { nextBestStep: () => nextStep }
  });
  assert.deepEqual(JSON.parse(JSON.stringify(surface.snapshot().fallbackNextStep)), JSON.parse(JSON.stringify(nextStep)));
});

test('snapshot() never consults fallbackNextStep while a real surface is open (open surface always wins)', async () => {
  let nextStepCalls = 0;
  const surface = await surfaceSandbox({
    processRegistry: {
      activeOpenProcess: () => ({ id: 'session-create', step: null }),
      snapshot: () => ({ open: true, step: null, layer: 'foreground' })
    },
    contextEngine: { snapshot: () => ({ navigation: { activeId: 'sessions' }, activeEntities: {}, workflow: null }) },
    journeyEngine: { nextBestStep: () => { nextStepCalls += 1; return { id: 'intake' }; } }
  });
  const snap = surface.snapshot();
  assert.equal(snap.fallbackNextStep, null);
  assert.equal(nextStepCalls, 0, 'nextBestStep() must never even be called once a real surface is open - zero wasted work, not just an ignored result');
});

test('snapshot() never throws when every dependency (process registry, context engine, journey engine) is absent', async () => {
  const surface = await surfaceSandbox({ processRegistry: undefined, contextEngine: undefined, journeyEngine: undefined });
  const snap = surface.snapshot();
  assert.equal(snap.processId, null);
  assert.equal(snap.layer, null);
  assert.equal(snap.step, null);
  assert.equal(snap.fallbackNextStep, null);
  assert.deepEqual(JSON.parse(JSON.stringify(snap.entities)), {});
});
