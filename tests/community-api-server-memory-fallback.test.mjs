import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const port = 8799;

// This is the exact scenario a developer hits with no Docker/Postgres installed at all: they
// run `npm run dev:community-api` with no .env/DATABASE_URL, then the select page's register
// form calls POST /api/auth/register and it must actually succeed - not fail with "could not
// reach the server" forever. Spawns the real entrypoint as a child process (not createApp()
// directly) so this proves the fallback wired into server/community-api-server.mjs itself, not
// just the repo layer in isolation.
test('running the community server with no DATABASE_URL configured lets a real account be registered end-to-end via the in-memory fallback', async () => {
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
        // Wait for the IN-MEMORY-repo line itself, not the earlier "Community API server:" line -
        // that one prints first but is not what the assertion below checks, so waiting on it only
        // was a race: under load, the very next log chunk (this line) could still be in flight.
        if (stdout.includes('IN-MEMORY repo')) { clearInterval(timerHandle); clearTimeout(timer); resolve(); }
      }, 50);
      child.on('exit', (code) => { clearInterval(timerHandle); clearTimeout(timer); reject(new Error('server exited early with code ' + code + '. stdout=' + stdout + ' stderr=' + stderr)); });
    });

    assert.match(stdout, /IN-MEMORY repo/, 'the fallback must announce itself in the log, never silently masquerade as real persistence');

    const response = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fallback-tester@example.com', password: 'abcd', displayName: 'Fallback Tester' })
    });
    const body = await response.json();
    assert.equal(response.status, 201, 'account creation must succeed with no DB configured, not fail with a network/offline error');
    assert.equal(body.user.displayName, 'Fallback Tester');
    assert.ok(body.user.id, 'a real user id must be returned');
    assert.ok(body.token, 'a real session token must be returned so the browser can persist it and unlock the rest of the app');
  } finally {
    child.kill();
  }
});
