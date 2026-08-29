import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);

async function resolverSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await readFile(shared('ai-voice-output-resolver.js'), 'utf8'), sandbox, { filename: 'ai-voice-output-resolver.js' });
  return sandbox.window.TradeJournalAIVoiceOutputResolver;
}

test('a typed (non-voice) turn always resolves TEXT_ONLY, even when audio is available', async () => {
  const r = await resolverSandbox();
  assert.equal(r.resolve({ source: 'text', hasAudio: true }), 'TEXT_ONLY');
  assert.equal(r.resolve({ source: undefined, hasAudio: true }), 'TEXT_ONLY');
  assert.equal(r.resolve({}), 'TEXT_ONLY');
});

test('a voice turn with approved audio resolves PUBLISHED_AUDIO', async () => {
  const r = await resolverSandbox();
  assert.equal(r.resolve({ source: 'voice', hasAudio: true }), 'PUBLISHED_AUDIO');
});

test('a voice turn with no approved audio falls back to DYNAMIC_TTS', async () => {
  const r = await resolverSandbox();
  assert.equal(r.resolve({ source: 'voice', hasAudio: false }), 'DYNAMIC_TTS');
  assert.equal(r.resolve({ source: 'voice' }), 'DYNAMIC_TTS');
});
