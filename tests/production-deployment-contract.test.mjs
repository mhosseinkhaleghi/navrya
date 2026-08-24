import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = await readFile(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');

test('production deploy cold-builds and force-recreates the static web service', () => {
  assert.match(workflow, /build --no-cache web/);
  assert.match(workflow, /up -d --no-deps --force-recreate web/);
});

test('production deploy proves the running web bundle matches the freshly built image', () => {
  assert.match(workflow, /built_web_hash=/);
  assert.match(workflow, /running_web_hash=/);
  assert.match(workflow, /test "\$running_web_hash" = "\$built_web_hash"/);
});
