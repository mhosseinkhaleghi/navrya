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
