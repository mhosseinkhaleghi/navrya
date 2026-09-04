import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function runWithoutGit(metadata) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'navrya-build-version-'));
  try {
    await mkdir(path.join(dir, 'public'));
    await copyFile(new URL('scripts/write-version.mjs', root), path.join(dir, 'write-version.mjs'));
    await copyFile(new URL('package.json', root), path.join(dir, 'package.json'));
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (/^path$/i.test(key) || key.startsWith('NAVRYA_BUILD_')) delete env[key];
    }
    env.PATH = '';
    Object.assign(env, metadata);
    const result = spawnSync(process.execPath, ['write-version.mjs'], { cwd: dir, env, encoding: 'utf8' });
    const version = result.status === 0 ? JSON.parse(await readFile(path.join(dir, 'public/version.json'), 'utf8')) : null;
    return { result, version };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('version generation works with no Git binary or .git using exact build metadata', async () => {
  const { result, version } = await runWithoutGit({ NAVRYA_BUILD_COMMIT: 'db931c2678ec4163e311fe6d06248921fd38433a', NAVRYA_BUILD_COMMIT_COUNT: '1234' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(version, { version: '1.12.34', commit: 'db931c2', dirty: false });
});

test('partial or invalid build metadata fails closed instead of inventing a release version', async () => {
  for (const metadata of [
    { NAVRYA_BUILD_COMMIT: 'db931c2' },
    { NAVRYA_BUILD_COMMIT_COUNT: '1234' },
    { NAVRYA_BUILD_COMMIT: 'not-a-commit', NAVRYA_BUILD_COMMIT_COUNT: '1234' },
    { NAVRYA_BUILD_COMMIT: 'db931c2', NAVRYA_BUILD_COMMIT_COUNT: '-1' }
  ]) {
    const { result } = await runWithoutGit(metadata);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /valid release metadata/);
  }
});

test('Docker and every documented release build pass both version metadata fields', async () => {
  const dockerfile = await readFile(new URL('Dockerfile', root), 'utf8');
  assert.match(dockerfile, /ARG NAVRYA_BUILD_COMMIT\r?\nARG NAVRYA_BUILD_COMMIT_COUNT\r?\nRUN npm run build/);
  for (const file of ['.github/workflows/deploy.yml', '.github/workflows/deploy-staging.yml', 'scripts/rollback.sh', 'DEPLOYMENT.md']) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.match(source, /--build-arg NAVRYA_BUILD_COMMIT=/, file);
    assert.match(source, /--build-arg NAVRYA_BUILD_COMMIT_COUNT=/, file);
    if (file.startsWith('.github/')) {
      assert.match(source, /ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=10 /, file);
    }
  }
  const workflow = await readFile(new URL('.github/workflows/deploy.yml', root), 'utf8');
  assert.match(workflow, /NAVRYA_BUILD_COMMIT="\$DEPLOY_SHA"/);
  assert.match(workflow, /git rev-list --count "\$DEPLOY_SHA"/);
});
