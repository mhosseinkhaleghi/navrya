import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice Mode performance pass - "two tabs" scenario (requirement 10). Each browser tab runs its
// own independent module instances (createVoiceSession()/TurnCoordinator/PlaybackController are
// all factory functions returning fresh closures, never a shared window-global singleton), so
// cross-tab interference is structurally unlikely - this proves that directly, rather than
// leaving it as inference: two independently-created TurnCoordinator/PlaybackController pairs,
// exercised concurrently, must never observe or affect each other's state.

const root = process.cwd();
const turnCoordinatorSource = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-voice-turn-coordinator.js'), 'utf8');
const playbackControllerSource = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-voice-playback-controller.js'), 'utf8');

function loadModules() {
  const window = {};
  vm.runInNewContext(turnCoordinatorSource, { window, Object, Promise }, { filename: 'ai-voice-turn-coordinator.js' });
  vm.runInNewContext(playbackControllerSource, { window, Object, Promise }, { filename: 'ai-voice-playback-controller.js' });
  return { createTurnCoordinator: window.TradeJournalAIVoiceTurnCoordinator.create, createPlaybackController: window.TradeJournalAIVoicePlaybackController.create };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

test('two independent "tabs" (two separate TurnCoordinator instances) never observe or block each other\'s turns - concurrent submit() calls on different instances run independently, not serialized against one another', async () => {
  const { createTurnCoordinator } = loadModules();
  const tabAOrder = [];
  const tabBOrder = [];
  const gateA = { resolve: null };
  const gateAPromise = new Promise((r) => { gateA.resolve = r; });

  const coordinatorA = createTurnCoordinator({
    submit: async (text) => { tabAOrder.push('start:' + text); await gateAPromise; tabAOrder.push('end:' + text); return { reply: text }; },
    getEpoch: () => 0
  });
  const coordinatorB = createTurnCoordinator({
    submit: async (text) => { tabBOrder.push('start:' + text); tabBOrder.push('end:' + text); return { reply: text }; },
    getEpoch: () => 0
  });

  // Tab A's own turn is deliberately held open (gated) - if the two coordinators shared any
  // module-level state, Tab B's turn would be blocked behind it. It must not be.
  const pendingA = coordinatorA.handleFinalTranscript('tab-a-turn', {});
  await coordinatorB.handleFinalTranscript('tab-b-turn', {});
  assert.deepEqual(tabBOrder, ['start:tab-b-turn', 'end:tab-b-turn'], 'Tab B must complete its own turn without waiting on Tab A\'s still-open one');
  gateA.resolve();
  await pendingA;
  assert.deepEqual(tabAOrder, ['start:tab-a-turn', 'end:tab-a-turn']);
});

test('two independent "tabs" (two separate PlaybackController instances) speak concurrently, never sharing a queue - one tab\'s long reply never delays the other tab\'s own playback', async () => {
  const { createPlaybackController } = loadModules();
  const spokenA = [];
  const spokenB = [];
  const controllerA = createPlaybackController({ speak: (text) => { spokenA.push(text); return sleep(50); } });
  const controllerB = createPlaybackController({ speak: (text) => { spokenB.push(text); return sleep(5); } });

  controllerA.enqueue('long reply in tab A', {});
  controllerB.enqueue('short reply in tab B', {});
  await sleep(10);
  assert.deepEqual(spokenB, ['short reply in tab B'], 'Tab B\'s own short reply must have started (and can finish) without waiting for Tab A\'s longer one');
  await sleep(60);
  assert.deepEqual(spokenA, ['long reply in tab A']);
});

test('invalidating one "tab"\'s PlaybackController (e.g. its own New Chat) never touches a different tab\'s own queue', async () => {
  const { createPlaybackController } = loadModules();
  const settledA = [];
  const spokenB = [];
  const controllerA = createPlaybackController({ speak: () => sleep(50), interrupt: () => {}, onSettled: (e) => settledA.push(e) });
  const controllerB = createPlaybackController({ speak: (text) => { spokenB.push(text); return Promise.resolve(); } });

  controllerA.enqueue('queued in tab A', {});
  controllerA.invalidate(); // Tab A's own New Chat
  controllerB.enqueue('unaffected in tab B', {});
  await sleep(5);
  assert.deepEqual(spokenB, ['unaffected in tab B'], 'Tab B must be completely unaffected by Tab A\'s own invalidate()');
});
