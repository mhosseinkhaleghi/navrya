import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Regression guard for a real gap: server/pattern-ai-server.mjs can read a new ELEVENLABS_* env
// var, but docker-compose.production.yml's `pattern-ai` service only forwards vars it explicitly
// lists under `environment:` - anything missing there is silently dropped even if it's set in the
// real server-side .env (the actual production secret source - see .env.production.example and
// .github/workflows/deploy.yml, which SSHes in and reads that file directly; there is no Render
// dashboard or other cloud secret manager in the live deploy path). This mirrors the same class of
// fix already made once for OPENAI_REALTIME_MODEL (see that variable's own comment in
// docker-compose.production.yml) - this test exists so the next ELEVENLABS_* (or similarly
// provider-shaped) variable doesn't repeat it silently.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSource = readFileSync(path.join(repoRoot, 'server/pattern-ai-server.mjs'), 'utf8');
const composeSource = readFileSync(path.join(repoRoot, 'docker-compose.production.yml'), 'utf8');
const envExampleSource = readFileSync(path.join(repoRoot, '.env.production.example'), 'utf8');

function patternAiServiceBlock(compose) {
  const start = compose.indexOf('\n  pattern-ai:');
  const end = compose.indexOf('\n  community-api:');
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the pattern-ai service block in docker-compose.production.yml - has its structure changed?');
  return compose.slice(start, end);
}

function elevenLabsVarsReadByServer(source) {
  const names = new Set();
  for (const match of source.matchAll(/process\.env\.(ELEVENLABS_[A-Z_]+)/g)) names.add(match[1]);
  return [...names].sort();
}

test('every ELEVENLABS_* var the AI gateway actually reads is forwarded by docker-compose.production.yml\'s pattern-ai service, so a value set in the real production .env is never silently dropped', () => {
  const varNames = elevenLabsVarsReadByServer(serverSource);
  assert.ok(varNames.length >= 5, 'sanity check: expected the server to reference several ELEVENLABS_* vars (API key, enabled flag, voice/model/language/output-format) - found ' + varNames.length + '. Did testElevenLabsFaTts() move or get renamed?');
  const patternAiBlock = patternAiServiceBlock(composeSource);
  for (const name of varNames) {
    assert.match(
      patternAiBlock,
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*\\$\\{' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(:-|\\})'),
      `${name} is read by server/pattern-ai-server.mjs but is missing from docker-compose.production.yml's pattern-ai environment block - it will be set in the server .env but never reach the running container`
    );
  }
});

test('every ELEVENLABS_* var wired into docker-compose.production.yml is documented in .env.production.example, so an operator populating the real server .env has every key in front of them', () => {
  const composeVars = [...new Set(Array.from(composeSource.matchAll(/\$\{(ELEVENLABS_[A-Z_]+)/g), (m) => m[1]))];
  assert.ok(composeVars.length > 0, 'sanity check: expected at least one ELEVENLABS_* var in docker-compose.production.yml');
  for (const name of composeVars) {
    assert.match(envExampleSource, new RegExp('^' + name + '=', 'm'), `${name} is wired in docker-compose.production.yml but missing from .env.production.example`);
  }
});

test('ELEVENLABS_VOICE_ID_FA has no default anywhere in the deploy chain - not in server code, not in docker-compose.production.yml - so a missing value fails loudly (ELEVENLABS_VOICE_ID_FA_MISSING) instead of the endpoint silently using a stale hardcoded voice id', () => {
  assert.match(
    serverSource,
    /const voiceId = process\.env\.ELEVENLABS_VOICE_ID_FA;\s*\n\s*if \(!voiceId\) throw new Error\('ELEVENLABS_VOICE_ID_FA_MISSING'\);/,
    'server/pattern-ai-server.mjs no longer treats ELEVENLABS_VOICE_ID_FA as required with no default - if this changed intentionally, update this test and docker-compose.production.yml together'
  );
  const patternAiBlock = patternAiServiceBlock(composeSource);
  assert.match(
    patternAiBlock,
    /ELEVENLABS_VOICE_ID_FA:\s*\$\{ELEVENLABS_VOICE_ID_FA:-\}/,
    'docker-compose.production.yml must not bake in a fallback voice id here - ELEVENLABS_VOICE_ID_FA must come from the real server .env or fail closed'
  );
});

test('the ElevenLabs request defaults to the real, current model id (eleven_v3) - not eleven_v3_conversational, which is not a valid model id on the current /v1/text-to-speech endpoint', () => {
  assert.match(serverSource, /process\.env\.ELEVENLABS_MODEL_ID_FA \|\| 'eleven_v3'/);
  assert.doesNotMatch(serverSource, /eleven_v3_conversational/, 'the invalid model id should not reappear anywhere in the server source');
  assert.doesNotMatch(composeSource, /eleven_v3_conversational/);
  assert.doesNotMatch(envExampleSource, /eleven_v3_conversational/);
});
