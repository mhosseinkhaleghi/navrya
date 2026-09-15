import assert from 'node:assert/strict';
import test from 'node:test';
import { currentMarketSession } from '../server/community/market-session-clock.mjs';

// Same priority/hour-range rule as public/pages/shared/navrya/components/sessions/
// NewSessionDialog.jsx's own liveTradingSession() (kept as its own copy, per that file's own
// comment) - real, reproduced production bug this exists to fix: Media Drive's activeMarketSession
// used to be read from whichever Live Session record a chart was linked to (session.market), which
// is just whatever city the trader picked when they opened that session - not necessarily the
// real market live right now, at the actual moment the chart was captured.
function utc(hour, minute = 0) { return new Date(Date.UTC(2026, 0, 1, hour, minute)); }

test('London (07:00-16:00 UTC) takes priority over its own overlap with New York', () => {
  assert.equal(currentMarketSession(utc(9, 35)), 'London');
  assert.equal(currentMarketSession(utc(7, 0)), 'London');
  assert.equal(currentMarketSession(utc(13, 0)), 'London', 'the London/New York overlap resolves to London, checked first');
  assert.equal(currentMarketSession(utc(15, 59)), 'London');
});

test('New York (13:00-22:00 UTC), once London has genuinely closed', () => {
  assert.equal(currentMarketSession(utc(16, 0)), 'New York');
  assert.equal(currentMarketSession(utc(21, 59)), 'New York');
});

test('Tokyo (00:00-09:00 UTC) takes priority over its own overlap with Sydney', () => {
  assert.equal(currentMarketSession(utc(0, 0)), 'Tokyo');
  assert.equal(currentMarketSession(utc(6, 59)), 'Tokyo', 'the Sydney/Tokyo overlap resolves to Tokyo, checked before the Sydney fallback');
});

test('Sydney is the fallback for every remaining hour (22:00-24:00 UTC)', () => {
  assert.equal(currentMarketSession(utc(22, 0)), 'Sydney');
  assert.equal(currentMarketSession(utc(23, 59)), 'Sydney');
});

test('defaults to the real wall clock (new Date()) when no explicit time is passed', () => {
  const result = currentMarketSession();
  assert.ok(['London', 'New York', 'Tokyo', 'Sydney'].includes(result));
});
