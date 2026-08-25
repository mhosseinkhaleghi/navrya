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

test('ELEVENLABS_VOICE_ID_FA has no default anywhere in the deploy chain - docker-compose.production.yml must not bake in a fallback voice id, so a missing value falls through to the OpenAI voice fallback instead of an admin unknowingly using a stale hardcoded voice id', () => {
  const patternAiBlock = patternAiServiceBlock(composeSource);
  assert.match(
    patternAiBlock,
    /ELEVENLABS_VOICE_ID_FA:\s*\$\{ELEVENLABS_VOICE_ID_FA:-\}/,
    'docker-compose.production.yml must not bake in a fallback voice id here'
  );
});

test('the ElevenLabs request defaults to the real, current model id (eleven_v3) - not eleven_v3_conversational, which is not a valid model id on the current /v1/text-to-speech endpoint', () => {
  assert.match(serverSource, /process\.env\.ELEVENLABS_MODEL_ID_FA \|\| 'eleven_v3'/);
  assert.doesNotMatch(serverSource, /eleven_v3_conversational/, 'the invalid model id should not reappear anywhere in the server source');
  assert.doesNotMatch(composeSource, /eleven_v3_conversational/);
  assert.doesNotMatch(envExampleSource, /eleven_v3_conversational/);
});

// Admin-managed ElevenLabs credentials (023_voice_providers.sql) are encrypted with the SAME
// ENCRYPTION_KEY that already protects users.totp_secret_enc - this feature is a second real
// consumer of that key, not a new secret. The production preflight (.github/workflows/deploy.yml)
// must verify it explicitly now, the same way it already verifies AUTH_TOKEN_SECRET/CSRF_SECRET/
// INTERNAL_API_SECRET/ALLOWED_ORIGINS - mission requirement: "Ensure production preflight
// explicitly verifies ENCRYPTION_KEY because encrypted admin credentials depend on it."
test('the production deploy workflow explicitly preflights ENCRYPTION_KEY before touching any running container, now that encrypted admin voice-provider credentials depend on it', () => {
  const deployWorkflow = readFileSync(path.join(repoRoot, '.github/workflows/deploy.yml'), 'utf8');
  assert.match(
    deployWorkflow,
    /:\s*"\$\{ENCRYPTION_KEY:\?ENCRYPTION_KEY missing/,
    '.github/workflows/deploy.yml must preflight-check ENCRYPTION_KEY the same way it already does for AUTH_TOKEN_SECRET/CSRF_SECRET/INTERNAL_API_SECRET/ALLOWED_ORIGINS'
  );
});

test('ENCRYPTION_KEY is forwarded to community-api (where the encrypted admin_voice_provider_credentials/users.totp_secret_enc columns are actually decrypted) - never to pattern-ai, which stays DB-free by design and only ever receives already-decrypted runtime config over the internal bridge', () => {
  const communityApiStart = composeSource.indexOf('\n  community-api:');
  const redisStart = composeSource.indexOf('\n  redis:');
  assert.ok(communityApiStart !== -1 && redisStart !== -1 && redisStart > communityApiStart);
  const communityApiBlock = composeSource.slice(communityApiStart, redisStart);
  assert.match(communityApiBlock, /ENCRYPTION_KEY:\s*\$\{ENCRYPTION_KEY\}/);
  assert.doesNotMatch(patternAiServiceBlock(composeSource), /ENCRYPTION_KEY/, 'pattern-ai must never receive ENCRYPTION_KEY directly - it has no database access to decrypt anything with it');
});
