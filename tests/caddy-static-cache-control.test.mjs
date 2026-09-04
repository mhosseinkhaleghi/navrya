import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// PRODUCTION INCIDENT FIX (2026-09-04): confirmed live, twice - a browser served a stale,
// already-fixed-server-side JS bundle (navrya-{character}-sessions-app.js, admin/index.html's own
// app.js) well after a real deploy had already landed the fix, because these files are served
// under a fixed, never-versioned filename (Vite's public/ passthrough copies them into dist/
// byte-identical every deploy - no content hash, no query string) with no Cache-Control header at
// all, leaving browsers to their own heuristic caching. deploy/Caddyfile's navrya_static block
// must force revalidation on every load.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const caddyfile = await readFile(path.join(root, 'deploy', 'Caddyfile'), 'utf8');

test('the static file-serving block sends Cache-Control: no-cache, forcing every load to revalidate with the server rather than trusting a browser\'s own heuristic cache', () => {
  const staticBlock = caddyfile.slice(caddyfile.indexOf('(navrya_static) {'), caddyfile.indexOf('{$APP_HOST'));
  assert.match(staticBlock, /header Cache-Control "no-cache"/);
});

test('the Cache-Control fix is no-cache, never no-store - a real deploy must still be visible on the very next load, but this must not disable Caddy file_server\'s own cheap conditional-GET/ETag revalidation for an unchanged file', () => {
  // Checks the real directive LINE only (not doesNotMatch across the whole block) - this same
  // block's own explanatory comment prose legitimately says "no-cache (NOT no-store)", which would
  // otherwise self-fail a bare doesNotMatch(staticBlock, /no-store/) scan.
  const staticBlock = caddyfile.slice(caddyfile.indexOf('(navrya_static) {'), caddyfile.indexOf('{$APP_HOST'));
  const headerLineMatch = /header Cache-Control "([^"]*)"/.exec(staticBlock);
  assert.ok(headerLineMatch, 'could not find the real header Cache-Control directive line');
  assert.equal(headerLineMatch[1], 'no-cache');
});

test('the header directive is inside the navrya_static block\'s own handle{}, alongside file_server and try_files - not accidentally scoped to the API/uploads reverse-proxy block, which must never gain a caching header for dynamic responses', () => {
  const staticBlock = caddyfile.slice(caddyfile.indexOf('(navrya_static) {'), caddyfile.indexOf('{$APP_HOST'));
  // The real directive lines are unadorned, tab-indented, start-of-line - distinct from this same
  // block's own explanatory comment prose, which mentions `file_server` (backtick-wrapped) earlier
  // as plain text. Matching the real directive shape specifically avoids that self-match.
  const headerIdx = staticBlock.search(/\r?\n\t\theader Cache-Control/);
  const fileServerIdx = staticBlock.search(/\r?\n\t\tfile_server/);
  const tryFilesIdx = staticBlock.search(/\r?\n\t\ttry_files/);
  assert.ok(headerIdx > -1 && fileServerIdx > -1 && tryFilesIdx > -1);
  assert.ok(tryFilesIdx < headerIdx && headerIdx < fileServerIdx, 'header must sit between try_files and file_server, inside the same handle{} block');

  const apiBlock = caddyfile.slice(caddyfile.indexOf('(navrya_api) {'), caddyfile.indexOf('(navrya_static) {'));
  assert.doesNotMatch(apiBlock, /Cache-Control/, 'the API/uploads reverse-proxy block must never get a static-caching header - those are real, dynamic, per-request responses');
});
