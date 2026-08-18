import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const scriptPath = path.join(root, 'scripts', 'ai-knowledge-build.mjs');
// Windows requires a file:// URL for a dynamic import() of an absolute path (a bare "C:\..."
// string is parsed as a URL scheme, not a drive letter, and throws ERR_UNSUPPORTED_ESM_URL_SCHEME).
const { loadRegistry, buildArtifact, readExistingArtifact, outPath } = await import(pathToFileURL(scriptPath).href);

// --- pure builder logic: determinism + real-source reflection ---

test('buildArtifact() is deterministic - the same real registry produces the same contentHash on every call', async () => {
  const registry = await loadRegistry();
  const first = buildArtifact(registry);
  const second = buildArtifact(registry);
  assert.equal(first.contentHash, second.contentHash);
  assert.deepEqual(first.domains, second.domains);
});

test('buildArtifact() reflects exactly the real ai-knowledge-registry.js domain list - never a hand-duplicated subset', async () => {
  const registry = await loadRegistry();
  const artifact = buildArtifact(registry);
  const realIds = registry.listDomains().map((d) => d.id).sort();
  const artifactIds = artifact.domains.map((d) => d.id).sort();
  assert.deepEqual(artifactIds, realIds);
});

test('buildArtifact() carries version 1 and a real, non-empty hex contentHash', async () => {
  const registry = await loadRegistry();
  const artifact = buildArtifact(registry);
  assert.equal(artifact.version, 1);
  assert.match(artifact.contentHash, /^[0-9a-f]{16}$/);
});

// --- the CLI itself, exercised for real (child_process) - proves `npm run ai:knowledge:check` ---
// --- actually gates on a real content change, not just on the pure function in isolation ---

test('the committed artifact in the repo is not stale - "ai:knowledge:check" passes against it right now', () => {
  // If this fails, someone edited ai-knowledge-registry.js without re-running
  // "npm run ai:knowledge:build" and committing the refreshed artifact - exactly the drift this
  // gate exists to catch.
  assert.doesNotThrow(() => execFileSync('node', [scriptPath, 'check'], { cwd: root, stdio: 'pipe' }));
});

test('"ai:knowledge:check" fails (non-zero exit) against a deliberately stale/corrupted artifact, and is restored afterward', async () => {
  const original = await readFile(outPath, 'utf8');
  try {
    const corrupted = JSON.parse(original);
    corrupted.contentHash = 'deadbeefdeadbeef';
    await writeFile(outPath, JSON.stringify(corrupted, null, 2) + '\n', 'utf8');
    assert.throws(() => execFileSync('node', [scriptPath, 'check'], { cwd: root, stdio: 'pipe' }), /Command failed/);
  } finally {
    await writeFile(outPath, original, 'utf8');
  }
});

test('"ai:knowledge:check" fails cleanly (never throws an unrelated error) when the artifact file is missing entirely', async () => {
  const original = await readFile(outPath, 'utf8');
  const fs = await import('node:fs/promises');
  try {
    await fs.rm(outPath);
    assert.throws(() => execFileSync('node', [scriptPath, 'check'], { cwd: root, stdio: 'pipe' }), /Command failed/);
  } finally {
    await writeFile(outPath, original, 'utf8');
  }
});

test('readExistingArtifact() returns a real parsed object once the artifact has been built', async () => {
  const existing = await readExistingArtifact();
  assert.ok(existing);
  assert.ok(Array.isArray(existing.domains) && existing.domains.length > 0);
});
