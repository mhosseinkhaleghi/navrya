import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Slice U1-b (execution brief section 9 item 11, "Dock/process controls"): a pure, deterministic
// classifier - real dynamic tests against the actual module, same convention as
// tests/ai-field-fill-bus.test.mjs and ai-proactive-engine's own interpretConfirmationText tests.

const root = process.cwd();
async function intentSandbox() {
  const sandbox = { window: {} };
  const src = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-dock-control-intent.js'), 'utf8');
  vm.runInNewContext(src, sandbox, { filename: 'ai-dock-control-intent.js' });
  return sandbox.window.TradeJournalAIDockControlIntent;
}

test('recognizes the exact six control ids the module declares', async () => {
  const intent = await intentSandbox();
  // Spread into a plain array in THIS realm first - CONTROL_IDS was built inside the vm sandbox,
  // so it carries that context's own Array.prototype; assert.deepEqual (deepStrictEqual) checks
  // prototype identity too, which would otherwise fail even with identical string contents (the
  // same cross-realm caveat tests/ai-workflow-engine.test.mjs's own clone() helper works around).
  assert.deepEqual([...intent.CONTROL_IDS].sort(), ['endVoice', 'history', 'mute', 'newChat', 'regenerate', 'unmute'].sort());
});

test('English phrases resolve to the correct control for all six', async () => {
  const intent = await intentSandbox();
  assert.equal(intent.interpretDockControlText('new chat'), 'newChat');
  assert.equal(intent.interpretDockControlText('start a new chat'), 'newChat');
  assert.equal(intent.interpretDockControlText('show my history'), 'history');
  assert.equal(intent.interpretDockControlText('open history'), 'history');
  assert.equal(intent.interpretDockControlText('end voice'), 'endVoice');
  assert.equal(intent.interpretDockControlText('stop voice mode'), 'endVoice');
  assert.equal(intent.interpretDockControlText('mute'), 'mute');
  assert.equal(intent.interpretDockControlText('mute the mic'), 'mute');
  assert.equal(intent.interpretDockControlText('unmute'), 'unmute');
  assert.equal(intent.interpretDockControlText('unmute the microphone'), 'unmute');
  assert.equal(intent.interpretDockControlText('regenerate'), 'regenerate');
  assert.equal(intent.interpretDockControlText('try again'), 'regenerate');
});

test('Persian, Arabic, and Spanish phrases resolve to the correct control - a representative sample per language, not every listed phrase', async () => {
  const intent = await intentSandbox();
  // Persian
  assert.equal(intent.interpretDockControlText('چت جدید'), 'newChat');
  assert.equal(intent.interpretDockControlText('تاریخچه رو نشون بده'), 'history');
  assert.equal(intent.interpretDockControlText('صدا رو قطع کن'), 'endVoice');
  assert.equal(intent.interpretDockControlText('میکروفون رو قطع کن'), 'mute');
  assert.equal(intent.interpretDockControlText('دوباره بگو'), 'regenerate');
  // Arabic
  assert.equal(intent.interpretDockControlText('محادثة جديدة'), 'newChat');
  assert.equal(intent.interpretDockControlText('أظهر السجل'), 'history');
  assert.equal(intent.interpretDockControlText('أوقف الصوت'), 'endVoice');
  // Spanish
  assert.equal(intent.interpretDockControlText('nuevo chat'), 'newChat');
  assert.equal(intent.interpretDockControlText('mostrar historial'), 'history');
  assert.equal(intent.interpretDockControlText('silenciar el micrófono'), 'mute');
});

test('is case-insensitive and tolerant of surrounding whitespace for latin-script languages', async () => {
  const intent = await intentSandbox();
  assert.equal(intent.interpretDockControlText('  New Chat  '), 'newChat');
  assert.equal(intent.interpretDockControlText('MUTE'), 'mute');
});

test('never partial-matches - an ordinary, longer sentence that happens to mention a keyword is not mistaken for a control command', async () => {
  const intent = await intentSandbox();
  assert.equal(intent.interpretDockControlText('can you show my trade history for this account'), null);
  assert.equal(intent.interpretDockControlText('please mute the sound on my notifications setting'), null);
  assert.equal(intent.interpretDockControlText('I want to start a new trade'), null);
  assert.equal(intent.interpretDockControlText(''), null);
  assert.equal(intent.interpretDockControlText(null), null);
  assert.equal(intent.interpretDockControlText(undefined), null);
});
