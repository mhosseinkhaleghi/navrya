import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('staging and production are separately publishable environments from dev', async () => {
  const [release, caddy, compose, stagingWorkflow, stagingScript, productionWorkflow, productionScript, devWorkflow] = await Promise.all([
    readFile(path.join(root, 'src', 'release.js'), 'utf8'),
    readFile(path.join(root, 'deploy', 'Caddyfile'), 'utf8'),
    readFile(path.join(root, 'docker-compose.production.yml'), 'utf8'),
    readFile(path.join(root, '.github', 'workflows', 'deploy-staging.yml'), 'utf8'),
    readFile(path.join(root, 'scripts', 'promote-dev-to-staging.sh'), 'utf8'),
    readFile(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8'),
    readFile(path.join(root, 'scripts', 'promote-dev-to-production.sh'), 'utf8'),
    readFile(path.join(root, '.github', 'workflows', 'verify-dev.yml'), 'utf8')
  ]);

  assert.match(release, /admin\.staging\.navrya\.com/);
  assert.match(release, /staging\.navrya\.com/);
  assert.match(caddy, /\{\$APP_HOST:app\.navrya\.com\}/);
  assert.match(caddy, /\{\$ADMIN_HOST:admin\.navrya\.com\}/);
  assert.match(compose, /APP_HOST: \$\{APP_HOST:-app\.navrya\.com\}/);
  assert.match(compose, /ADMIN_HOST: \$\{ADMIN_HOST:-admin\.navrya\.com\}/);
  assert.match(stagingWorkflow, /branches: \[staging\]/);
  assert.match(stagingWorkflow, /STAGING_DEPLOY_ENABLED/);
  assert.match(stagingScript, /refs\/heads\/staging/);
  assert.doesNotMatch(stagingScript, /origin\/main/);
  assert.match(productionWorkflow, /branches: \[main\]/);
  assert.match(productionScript, /origin\/dev/);
  assert.match(productionScript, /origin\/main/);
  assert.match(productionScript, /refs\/heads\/main/);
  assert.doesNotMatch(devWorkflow, /refs\/heads\/main/);
  assert.doesNotMatch(devWorkflow, /deploy\.yml/);
});
