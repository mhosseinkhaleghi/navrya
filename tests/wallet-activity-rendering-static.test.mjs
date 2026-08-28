import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static/structural regression coverage (same convention as accounts-static.test.mjs - this
// codebase's node:test harness does not execute JSX) for Wallet Activity's "why did my balance
// move" composition (task B.3/E.3): date/time, direction+amount, the AI feature/provider/model
// reason, and paid-vs-promo impact.
const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test('ledgerEntryDisplay() composes an AI_SETTLEMENT reason from feature/provider/model, never a raw/blank string', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const fnIdx = src.indexOf('function ledgerEntryDisplay(');
  const fn = src.slice(fnIdx, fnIdx + 1600);
  assert.match(fn, /entry\.type === 'AI_SETTLEMENT'/);
  assert.match(fn, /subLedgerAiUsage'.*feature:/s);
  assert.match(fn, /\[entry\.provider, entry\.model\]\.filter\(Boolean\)\.join\(' · '\)/, 'provider and model must both feed the subtitle shown under the reason');
});

test('ledgerEntryDisplay() reports a paid-vs-promo impact qualifier, not just the net amount', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const fnIdx = src.indexOf('function ledgerEntryDisplay(');
  const fn = src.slice(fnIdx, fnIdx + 2400);
  assert.match(fn, /subImpactBoth/);
  assert.match(fn, /subImpactPromo/);
  assert.match(fn, /subImpactPaid/);
  assert.match(fn, /amountLabel:\s*\(isCredit \? '\+' : '-'\) \+ fmtMicroUsd/, 'the amount must always show its real sign, never an unsigned/ambiguous number');
});

test('WalletActivityCard renders the reason, dated subtitle, signed amount, and impact qualifier for every entry', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const fnIdx = src.indexOf('function WalletActivityCard(');
  const fn = src.slice(fnIdx, fnIdx + 3200);
  assert.match(fn, /\{d\.title\}/);
  assert.match(fn, /\{d\.subtitle\}/);
  assert.match(fn, /fmtDateTime\(entry\.createdAt\)/);
  assert.match(fn, /\{d\.amountLabel\}/);
  assert.match(fn, /\{d\.impact\}/, 'the paid/promo impact qualifier must actually be rendered, not just computed');
});
