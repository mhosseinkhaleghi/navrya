import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static/structural regression coverage for task B.1/B.2 - the header's real wallet balance -
// mirroring the existing "static source inspection" convention (see accounts-static.test.mjs)
// since this codebase's node:test harness does not render navrya-src React components in a DOM.
const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test('useWalletBalance() fetches the real GET /api/sync/wallet endpoint - the same one accountProfileView.jsx already uses, never a second/parallel wallet read', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  const fnIdx = src.indexOf('function useWalletBalance()');
  assert.ok(fnIdx > -1, 'useWalletBalance must exist');
  const fn = src.slice(fnIdx, fnIdx + 1200);
  assert.match(fn, /fetch\('\/api\/sync\/wallet'\)/);
  assert.match(fn, /totalBalanceMicroUsd/);
});

test('useWalletBalance() refreshes on the navrya:wallet-changed event and on focus/visibilitychange, per task B.2', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  const fnIdx = src.indexOf('function useWalletBalance()');
  const fn = src.slice(fnIdx, fnIdx + 1200);
  assert.match(fn, /navrya:wallet-changed/);
  assert.match(fn, /visibilitychange/);
  assert.match(fn, /addEventListener\('focus'/);
});

test('useMetrics() wires HONOUR to the real wallet balance instead of a hardcoded placeholder', async () => {
  const src = await read('navrya-src', 'character-app.jsx');
  const fnIdx = src.indexOf('function useMetrics(');
  const fn = src.slice(fnIdx, fnIdx + 900);
  assert.match(fn, /icon:\s*'honour'.*walletBalance/s);
  assert.doesNotMatch(fn, /icon:\s*'honour',\s*label:\s*t\.honour,\s*value:\s*'—'/, 'HONOUR must no longer be a hardcoded em-dash');
});

test('Subscription tab wallet-affecting actions (top-up, storage purchase, upgrade) dispatch navrya:wallet-changed so the header refetches', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /function notifyWalletChanged\(\)\s*\{\s*window\.dispatchEvent\(new CustomEvent\('navrya:wallet-changed'\)\)/);
  const occurrences = (src.match(/notifyWalletChanged\(\);/g) || []).length;
  assert.ok(occurrences >= 3, 'top-up, storage purchase, and upgrade confirmation must each notify the header');
});
