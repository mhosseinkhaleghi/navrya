import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const port = 8799;

// This is the exact scenario a developer hits with no Docker/Postgres installed at all: they
// run `npm run dev:community-api` with no .env/DATABASE_URL, then the login page's name step
// calls POST /api/users and it must actually succeed - not fail with "could not reach the
// server" forever. Spawns the real entrypoint as a child process (not createApp() directly)
// so this proves the fallback wired into server/community-api-server.mjs itself, not just the
// repo layer in isolation.
test('running the community server with no DATABASE_URL configured lets a real user be created end-to-end via the in-memory fallback', async () => {
  const env = { ...process.env, COMMUNITY_API_PORT: String(port) };
  delete env.DATABASE_URL;
  const child = spawn(process.execPath, [path.join(root, 'server', 'community-api-server.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start in time. stdout=' + stdout + ' stderr=' + stderr)), 10000);
      const timerHandle = setInterval(() => {
        if (stdout.includes('Community API server:')) { clearInterval(timerHandle); clearTimeout(timer); resolve(); }
      }, 50);
      child.on('exit', (code) => { clearInterval(timerHandle); clearTimeout(timer); reject(new Error('server exited early with code ' + code + '. stdout=' + stdout + ' stderr=' + stderr)); });
    });

    assert.match(stdout, /IN-MEMORY repo/, 'the fallback must announce itself in the log, never silently masquerade as real persistence');

    const response = await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Fallback Tester' })
    });
    const body = await response.json();
    assert.equal(response.status, 201, 'account creation must succeed with no DB configured, not fail with a network/offline error');
    assert.equal(body.displayName, 'Fallback Tester');
    assert.ok(body.id, 'a real user id must be returned so the browser can persist it and unlock Community');
  } finally {
    child.kill();
  }
});
