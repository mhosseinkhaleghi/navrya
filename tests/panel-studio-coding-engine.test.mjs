import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCodingEngine, isSupportedProvider, SUPPORTED_PROVIDERS } from '../navrya-src/codingEngine.js';

test('openai resolves to the Codex coding profile', () => {
  assert.deepEqual(resolveCodingEngine('openai'), { codingEngineId: 'codex', codingEngineLabel: 'Codex' });
});

test('anthropic resolves to the Claude Code coding profile', () => {
  assert.deepEqual(resolveCodingEngine('anthropic'), { codingEngineId: 'claude-code', codingEngineLabel: 'Claude Code' });
});

test('every other provider fails closed to null - never a guessed/default mapping', () => {
  ['gemini', 'kimi', 'deepseek', 'unknown', '', undefined, null].forEach((provider) => {
    assert.equal(resolveCodingEngine(provider), null, `provider ${provider} must not resolve to a coding engine`);
  });
});

test('isSupportedProvider / SUPPORTED_PROVIDERS agree with the resolver', () => {
  assert.equal(isSupportedProvider('openai'), true);
  assert.equal(isSupportedProvider('anthropic'), true);
  assert.equal(isSupportedProvider('gemini'), false);
  assert.deepEqual(SUPPORTED_PROVIDERS.slice().sort(), ['anthropic', 'openai']);
});
