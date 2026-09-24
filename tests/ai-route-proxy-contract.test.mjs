import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Every path the stateless AI server (server/pattern-ai-server.mjs) answers must be routed to it by BOTH the production reverse proxy
// (deploy/Caddyfile `@ai`) and the Vite dev proxy. A route that exists on the AI server but is missing from either list falls through to
// the community API and comes back as `NOT_FOUND / HTTP 404` - exactly how the whole Analysis Profile AI surface (suggest, ingest, chat,
// preview, read-source) failed on production while every unit test, which talks to the handlers directly, stayed green.

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

async function aiServerPaths() {
  const source = await read('server', 'pattern-ai-server.mjs');
  const paths = new Set();
  for (const match of source.matchAll(/request\.url === '(\/api\/[^']+)'/g)) paths.add(match[1]);
  for (const match of source.matchAll(/^\s*'(\/api\/[^']+)': '[A-Za-z]+',?$/gm)) paths.add(match[1]);
  return [...paths];
}
const prefixOf = (url) => '/api/' + url.split('/')[2];

// Caddy's `path` matcher: a trailing `*` is a prefix match, anything else must match exactly.
function caddyMatches(pattern, url) { return pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : url === pattern; }
async function caddyAiPatterns() {
  const caddyfile = await read('deploy', 'Caddyfile');
  const line = caddyfile.split('\n').find((l) => /^\s*@ai path /.test(l));
  assert.ok(line, 'the @ai matcher exists');
  return line.trim().split(/\s+/).slice(2);
}

test('the AI server answers a known, non-trivial set of API prefixes (so this contract cannot pass by scanning nothing)', async () => {
  const prefixes = new Set((await aiServerPaths()).map(prefixOf));
  for (const expected of ['/api/ai', '/api/analysis-profiles', '/api/mental-health', '/api/patterns', '/api/sessions', '/api/strategy-education', '/api/trades']) {
    assert.ok(prefixes.has(expected), `${expected} should be dispatched by the AI server`);
  }
});

test('production: every path the AI server answers is routed to it by Caddy, not to the community API', async () => {
  const patterns = await caddyAiPatterns();
  for (const url of await aiServerPaths()) {
    assert.ok(patterns.some((p) => caddyMatches(p, url)), `${url} is served by pattern-ai but is not in deploy/Caddyfile @ai (${patterns.join(' ')}) - it would 404 on production`);
  }
});

test('development: every AI server prefix is proxied to the AI port by Vite', async () => {
  const vite = await read('vite.config.js');
  for (const prefix of new Set((await aiServerPaths()).map(prefixOf))) {
    assert.match(vite, new RegExp(`'${prefix}': 'http://127\\.0\\.0\\.1:8787'`), `${prefix} must be proxied to 8787 in vite.config.js`);
  }
});

test('the five Analysis Profile AI routes the browser calls are all AI-server routes reachable through Caddy', async () => {
  const client = await read('public', 'pages', 'shared', 'analysis-profile-ai.js');
  const called = [...new Set([...client.matchAll(/'(\/api\/analysis-profiles\/[a-z-]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(called, ['/api/analysis-profiles/chat', '/api/analysis-profiles/ingest', '/api/analysis-profiles/preview', '/api/analysis-profiles/read-source', '/api/analysis-profiles/suggest']);
  const served = new Set(await aiServerPaths());
  const patterns = await caddyAiPatterns();
  for (const url of called) {
    assert.ok(served.has(url), `${url} must be dispatched by the AI server`);
    assert.ok(patterns.some((p) => caddyMatches(p, url)), `${url} must be routed to the AI server by Caddy`);
  }
});

test('the profile STORE routes (community API, under /api/sync) are not swallowed by the AI prefix', async () => {
  const patterns = await caddyAiPatterns();
  for (const url of ['/api/sync/analysis-profiles', '/api/sync/analysis-profiles/p1/usage', '/api/sync/analysis-profiles/p1/sources', '/api/sync/analysis-profiles/p1/messages']) {
    assert.equal(patterns.some((p) => caddyMatches(p, url)), false, `${url} must keep going to community-api`);
  }
});
