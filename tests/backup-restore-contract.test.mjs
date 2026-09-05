import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Launch-readiness audit fix (P0-1, docs/PUBLIC-LAUNCH-READINESS-AUDIT.md): before scripts/
// backup.sh and scripts/restore.sh existed, NEITHER PostgreSQL nor the uploads volume had any
// backup mechanism at all. This suite proves two different things, deliberately kept separate:
//
//   1. Static structure (this repo's own established convention for infra-as-code files that
//      can't be fully exercised in CI - see tests/dockerfile-app-image-contract.test.mjs): the
//      Dockerfile/Compose wiring has the shape it needs to have, and the scripts contain the
//      safety properties they claim to.
//   2. REAL, EXECUTABLE proof (no pg_dump/restic binary required to be installed anywhere this
//      suite runs) that the fail-closed guards in both scripts actually fire, in real bash, in
//      the exact order that matters - every guard in both scripts runs BEFORE the first
//      pg_dump/restic invocation, so a missing/misconfigured environment is proven to fail loudly
//      with the right message rather than silently doing nothing or crashing on a missing binary.

async function runScript(scriptName, args, env) {
  try {
    const { stdout, stderr } = await execFileAsync('bash', [path.join(root, 'scripts', scriptName), ...args], { env });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

// A minimal, explicit environment for every run below - PATH so bash/coreutils resolve, plus
// SystemRoot on Windows (Git Bash needs it) - never the ambient process.env, so a real
// DATABASE_URL/RESTIC_* value happening to be set in whatever shell runs `npm test` can never
// mask what this suite is actually proving.
function baseEnv(overrides) {
  const env = { PATH: process.env.PATH || '' };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return { ...env, ...overrides };
}

// ---- backup.sh: static structure ----------------------------------------------------------

test('backup.sh: fails closed under set -euo pipefail, never continues past an unhandled error', async () => {
  const source = await readFile(path.join(root, 'scripts', 'backup.sh'), 'utf8');
  assert.match(source, /^set -euo pipefail$/m);
});

test('backup.sh: refuses to run without RESTIC_REPOSITORY, RESTIC_PASSWORD, and DATABASE_URL', async () => {
  const source = await readFile(path.join(root, 'scripts', 'backup.sh'), 'utf8');
  assert.match(source, /: "\$\{RESTIC_REPOSITORY:\?/);
  assert.match(source, /: "\$\{RESTIC_PASSWORD:\?/);
  assert.match(source, /: "\$\{DATABASE_URL:\?/);
});

test('backup.sh: rejects a suspiciously small pg_dump output instead of treating it as a valid backup', async () => {
  const source = await readFile(path.join(root, 'scripts', 'backup.sh'), 'utf8');
  assert.match(source, /DUMP_SIZE.*-lt 1024/s);
});

test('backup.sh: applies a real, bounded retention policy (never keeps every snapshot forever, never deletes everything)', async () => {
  const source = await readFile(path.join(root, 'scripts', 'backup.sh'), 'utf8');
  assert.match(source, /--keep-daily/);
  assert.match(source, /--keep-weekly/);
  assert.match(source, /--keep-monthly/);
  assert.match(source, /restic forget/);
});

test('backup.sh: verifies repository integrity after every run, not just "upload and hope"', async () => {
  const source = await readFile(path.join(root, 'scripts', 'backup.sh'), 'utf8');
  assert.match(source, /restic check/);
});

// ---- backup.sh: real executable proof of the guard order --------------------------------

test('backup.sh: exits non-zero with the right message when RESTIC_REPOSITORY is missing (before any restic/pg_dump call)', async () => {
  const result = await runScript('backup.sh', [], baseEnv({}));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /RESTIC_REPOSITORY must be set/);
});

test('backup.sh: exits non-zero with the right message when RESTIC_PASSWORD is missing', async () => {
  const result = await runScript('backup.sh', [], baseEnv({ RESTIC_REPOSITORY: 's3:example.com/bucket' }));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /RESTIC_PASSWORD must be set/);
});

test('backup.sh: exits non-zero with the right message when DATABASE_URL is missing, even with a real-looking restic config', async () => {
  const result = await runScript('backup.sh', [], baseEnv({
    RESTIC_REPOSITORY: 's3:example.com/bucket', RESTIC_PASSWORD: 'a-fake-but-non-empty-password'
  }));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /DATABASE_URL must be set/);
  // Proves the guard genuinely ran before any real command - had it fallen through, the next
  // failure would be "pg_dump: command not found" or a DNS/connection error, never this message.
  assert.doesNotMatch(result.stderr, /command not found/);
});

// ---- restore.sh: static structure ---------------------------------------------------------

test('restore.sh: fails closed under set -euo pipefail', async () => {
  const source = await readFile(path.join(root, 'scripts', 'restore.sh'), 'utf8');
  assert.match(source, /^set -euo pipefail$/m);
});

test('restore.sh: never restores into a target matching the live DATABASE_URL/UPLOADS_DIR without an explicit, deliberate confirmation', async () => {
  const source = await readFile(path.join(root, 'scripts', 'restore.sh'), 'utf8');
  const confirmMatches = source.match(/RESTORE INTO PRODUCTION/g) || [];
  // Once for the postgres branch, once for the uploads branch - not a single shared check that
  // could be silently bypassed by only one of the two restore paths.
  assert.ok(confirmMatches.length >= 2, 'both the postgres and uploads restore paths must require the same explicit confirmation string');
});

// ---- restore.sh: real executable proof of the guard order --------------------------------

test('restore.sh: exits non-zero with the right message when RESTIC_REPOSITORY/RESTIC_PASSWORD are missing', async () => {
  const result = await runScript('restore.sh', ['list'], baseEnv({}));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /RESTIC_REPOSITORY must be set/);
});

test('restore.sh: prints usage and exits non-zero for an unknown/missing action, once repository config is present', async () => {
  const result = await runScript('restore.sh', [], baseEnv({
    RESTIC_REPOSITORY: 's3:example.com/bucket', RESTIC_PASSWORD: 'a-fake-but-non-empty-password'
  }));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Usage:/);
});

test('restore.sh postgres: refuses without RESTORE_DATABASE_URL', async () => {
  const result = await runScript('restore.sh', ['postgres'], baseEnv({
    RESTIC_REPOSITORY: 's3:example.com/bucket', RESTIC_PASSWORD: 'a-fake-but-non-empty-password'
  }));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /RESTORE_DATABASE_URL must be set/);
});

test('restore.sh postgres: refuses to target a RESTORE_DATABASE_URL identical to the live DATABASE_URL without RESTORE_CONFIRM - proven BEFORE restic/pg_restore run (neither is installed in this test environment)', async () => {
  const sameUrl = 'postgres://user:pass@prod-host:5432/navrya';
  const result = await runScript('restore.sh', ['postgres'], baseEnv({
    RESTIC_REPOSITORY: 's3:example.com/bucket', RESTIC_PASSWORD: 'a-fake-but-non-empty-password',
    DATABASE_URL: sameUrl, RESTORE_DATABASE_URL: sameUrl
  }));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Refusing to overwrite production/);
  assert.doesNotMatch(result.stderr, /command not found/);
});

test('restore.sh postgres: RESTORE_CONFIRM=\'RESTORE INTO PRODUCTION\' deliberately lifts the same-target guard (the script proceeds to the next real step - restic, which then fails because it is not installed here, proving the guard itself is what changed, nothing else)', async () => {
  const sameUrl = 'postgres://user:pass@prod-host:5432/navrya';
  const result = await runScript('restore.sh', ['postgres'], baseEnv({
    RESTIC_REPOSITORY: 's3:example.com/bucket', RESTIC_PASSWORD: 'a-fake-but-non-empty-password',
    DATABASE_URL: sameUrl, RESTORE_DATABASE_URL: sameUrl, RESTORE_CONFIRM: 'RESTORE INTO PRODUCTION'
  }));
  assert.notEqual(result.code, 0);
  assert.doesNotMatch(result.stderr, /Refusing to overwrite production/);
});

test('restore.sh uploads: refuses to target a RESTORE_UPLOADS_DIR identical to the live UPLOADS_DIR without RESTORE_CONFIRM', async () => {
  const sameDir = '/uploads';
  const result = await runScript('restore.sh', ['uploads'], baseEnv({
    RESTIC_REPOSITORY: 's3:example.com/bucket', RESTIC_PASSWORD: 'a-fake-but-non-empty-password',
    UPLOADS_DIR: sameDir, RESTORE_UPLOADS_DIR: sameDir
  }));
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Refusing to overwrite production/);
});

// ---- Dockerfile / docker-compose.production.yml wiring -----------------------------------

test('Dockerfile: a dedicated backup stage exists with pg_dump + restic, never based on the app/node stages', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
  const backupStage = dockerfile.slice(dockerfile.indexOf('AS backup'));
  assert.match(dockerfile, /FROM alpine:[\d.]+ AS backup/);
  assert.match(backupStage, /postgresql\d+-client/);
  assert.match(backupStage, /\brestic\b/);
  assert.match(backupStage, /COPY scripts\/backup\.sh scripts\/restore\.sh/);
  // Runs as a real non-root user, matching the `app` stage's own `USER node` convention.
  assert.match(backupStage, /USER (?!root)\w+/);
});

test('docker-compose.production.yml: the backup service is a one-shot job (restart: \'no\'), never restart: unless-stopped like the long-running services', async () => {
  const compose = await readFile(path.join(root, 'docker-compose.production.yml'), 'utf8');
  const backupService = compose.slice(compose.indexOf('\n  backup:'), compose.indexOf('\nvolumes:'));
  assert.match(backupService, /target: backup/);
  assert.match(backupService, /restart: 'no'/);
  assert.match(backupService, /uploads_data:\/uploads:ro/, 'the uploads volume must be mounted read-only for the backup job');
  assert.match(backupService, /condition: service_healthy/);
});

test('docker-compose.production.yml: every backup credential defaults to empty (:-), never hard-required (:?) - a hard requirement at the Compose level would break `up -d` for every OTHER service the moment backups are not yet configured', async () => {
  const compose = await readFile(path.join(root, 'docker-compose.production.yml'), 'utf8');
  const backupService = compose.slice(compose.indexOf('\n  backup:'), compose.indexOf('\nvolumes:'));
  for (const name of ['RESTIC_REPOSITORY', 'RESTIC_PASSWORD', 'BACKUP_AWS_ACCESS_KEY_ID', 'BACKUP_AWS_SECRET_ACCESS_KEY']) {
    const pattern = new RegExp(`\\$\\{${name}:\\?`);
    assert.doesNotMatch(backupService, pattern, `${name} must not use the hard-required :? form at the Compose level`);
  }
});

test('.env.production.example: documents the real backup env vars, never a placeholder that silently omits them', async () => {
  const example = await readFile(path.join(root, '.env.production.example'), 'utf8');
  assert.match(example, /RESTIC_REPOSITORY/);
  assert.match(example, /RESTIC_PASSWORD/);
});
