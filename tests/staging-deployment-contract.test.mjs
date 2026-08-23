import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('staging is a separate deployable environment with its own branch and hostnames', async () => {
  const [release, caddy, compose, workflow, promoteScript] = await Promise.all([
    readFile(path.join(root, 'src', 'release.js'), 'utf8'),
    readFile(path.join(root, 'deploy', 'Caddyfile'), 'utf8'),
    readFile(path.join(root, 'docker-compose.production.yml'), 'utf8'),
    readFile(path.join(root, '.github', 'workflows', 'deploy-staging.yml'), 'utf8'),
    readFile(path.join(root, 'scripts', 'promote-dev-to-staging.sh'), 'utf8')
  ]);

  assert.match(release, /admin\.staging\.navrya\.com/);
  assert.match(release, /staging\.navrya\.com/);
  assert.match(caddy, /\{\$APP_HOST:app\.navrya\.com\}/);
  assert.match(caddy, /\{\$ADMIN_HOST:admin\.navrya\.com\}/);
  assert.match(compose, /APP_HOST: \$\{APP_HOST:-app\.navrya\.com\}/);
  assert.match(compose, /ADMIN_HOST: \$\{ADMIN_HOST:-admin\.navrya\.com\}/);
  assert.match(workflow, /branches: \[staging\]/);
  assert.match(workflow, /STAGING_DEPLOY_ENABLED/);
  assert.match(promoteScript, /origin\/main/);
  assert.match(promoteScript, /refs\/heads\/staging/);
});
