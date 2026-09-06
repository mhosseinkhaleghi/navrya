import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(path.join(repoRoot, 'docker-compose.production.yml'), 'utf8');
const productionEnv = readFileSync(path.join(repoRoot, '.env.production.example'), 'utf8');

test('production forwards AI_WALLET_ENFORCED with a safe false default', () => {
  assert.match(compose, /AI_WALLET_ENFORCED:\s*\$\{AI_WALLET_ENFORCED:-false\}/);
  assert.match(productionEnv, /^AI_WALLET_ENFORCED=false$/m);
});

// AI billing operational fix - the Admin "billing readiness" status (routes.commercial.mjs's GET
// /billing-readiness) needs to read this SAME flag from the community-api process too (it only
// ever reached pattern-ai before). Scoped per-service (not just "the string appears somewhere in
// the file") so this actually proves both services receive it, never a second/different flag.
function serviceBlock(composeText, serviceName) {
  const start = composeText.indexOf('\n  ' + serviceName + ':');
  assert.ok(start > -1, `service "${serviceName}" must exist in docker-compose.production.yml`);
  const nextServiceMatch = composeText.slice(start + 1).match(/\n  [a-z][a-z0-9_-]*:\n/);
  const end = nextServiceMatch ? start + 1 + nextServiceMatch.index : composeText.length;
  return composeText.slice(start, end);
}

test('both pattern-ai and community-api services receive AI_WALLET_ENFORCED - the same flag, never a second one', () => {
  const patternAiBlock = serviceBlock(compose, 'pattern-ai');
  const communityApiBlock = serviceBlock(compose, 'community-api');
  assert.match(patternAiBlock, /AI_WALLET_ENFORCED:\s*\$\{AI_WALLET_ENFORCED:-false\}/);
  assert.match(communityApiBlock, /AI_WALLET_ENFORCED:\s*\$\{AI_WALLET_ENFORCED:-false\}/);
});

test('production forwards Gemini credentials only to the AI gateway and documents the matching server-side variables', () => {
  const patternAiBlock = serviceBlock(compose, 'pattern-ai');
  const communityApiBlock = serviceBlock(compose, 'community-api');
  assert.match(patternAiBlock, /GEMINI_API_KEY:\s*\$\{GEMINI_API_KEY:-\}/);
  assert.match(patternAiBlock, /GEMINI_MODEL:\s*\$\{GEMINI_MODEL:-gemini-3\.1-pro-preview\}/);
  assert.match(patternAiBlock, /GEMINI_LIVE_MODEL:\s*\$\{GEMINI_LIVE_MODEL:-gemini-3\.5-transcribe-live\}/);
  assert.match(patternAiBlock, /GEMINI_TTS_MODEL:\s*\$\{GEMINI_TTS_MODEL:-gemini-3\.1-flash-tts-preview\}/);
  assert.doesNotMatch(communityApiBlock, /GEMINI_API_KEY/);
  assert.match(productionEnv, /^GEMINI_API_KEY=$/m);
  assert.match(productionEnv, /^GEMINI_MODEL=gemini-3\.1-pro-preview$/m);
  assert.match(productionEnv, /^GEMINI_LIVE_MODEL=gemini-3\.5-transcribe-live$/m);
  assert.match(productionEnv, /^GEMINI_TTS_MODEL=gemini-3\.1-flash-tts-preview$/m);
});
