import assert from 'node:assert/strict';
import test from 'node:test';
import { cityClock, marketStates } from '../navrya-src/marketAdapter.js';

// Production bug fix, reported live via screenshot: the header's market clocks (London/New York/
// Tokyo/Sydney) were showing times off by roughly an hour. Root cause: cityClock() used a
// hardcoded, standard-time-only UTC offset table (london: 0, 'new-york': -5, tokyo: 9,
// sydney: 10) that never accounted for Daylight Saving Time - for whichever of London/New York
// (both DST-observing zones) happens to currently be in DST, the displayed clock was a full hour
// behind real local time. This had zero test coverage before this file - exactly why it shipped
// unnoticed. Now backed by real IANA timezone data (Intl.DateTimeFormat), which tracks every
// zone's actual DST transitions automatically, for any date, forever.

test('London during BST (September) shows the real DST-adjusted local time, not the old fixed GMT offset', () => {
  // The exact reported bug: at this UTC instant the old code showed London as 15:49:02 (UTC+0,
  // GMT) when the real London time (BST, UTC+1) is 16:49:02 - a full hour behind.
  const ref = new Date('2026-09-06T15:49:02Z');
  assert.equal(cityClock(ref, 'london'), '16:49:02');
});

test('London during GMT (January, no DST) still shows the correct standard-time offset', () => {
  const ref = new Date('2026-01-15T12:00:00Z');
  assert.equal(cityClock(ref, 'london'), '12:00:00');
});

test('New York during EDT (September) shows the real DST-adjusted local time, not the old fixed EST offset', () => {
  const ref = new Date('2026-09-06T15:49:02Z');
  assert.equal(cityClock(ref, 'new-york'), '11:49:02');
});

test('New York during EST (January, no DST) still shows the correct standard-time offset', () => {
  const ref = new Date('2026-01-15T12:00:00Z');
  assert.equal(cityClock(ref, 'new-york'), '07:00:00');
});

test('Tokyo has no DST year-round - correct in both September and January', () => {
  assert.equal(cityClock(new Date('2026-09-06T15:49:02Z'), 'tokyo'), '00:49:02');
  assert.equal(cityClock(new Date('2026-01-15T12:00:00Z'), 'tokyo'), '21:00:00');
});

test('Sydney is correctly on standard time (AEST, UTC+10) in September, and daylight time (AEDT, UTC+11) in January - a fixed offset table cannot ever get both right', () => {
  // Before October's AEDT transition - AEST, UTC+10.
  assert.equal(cityClock(new Date('2026-09-06T15:49:02Z'), 'sydney'), '01:49:02');
  // Southern Hemisphere summer - AEDT, UTC+11. The old hardcoded `sydney: 10` would show this one
  // hour behind too, the exact same bug class as London/New York, just on the opposite calendar
  // half.
  assert.equal(cityClock(new Date('2026-01-15T12:00:00Z'), 'sydney'), '23:00:00');
});

test('the 12/24-hour Settings toggle (region.clock24) actually changes the displayed format - it was persisted but never read by anything before this fix', () => {
  const ref = new Date('2026-09-06T15:49:02Z'); // 16:49:02 real London time
  assert.equal(cityClock(ref, 'london', false), '16:49:02', '24-hour (default) is unchanged');
  assert.equal(cityClock(ref, 'london', true), '04:49:02 PM', '12-hour must actually render as 12-hour, uppercase to match the header\'s existing label style');
});

test('12-hour midnight/noon edges render as 12, not 0, matching real-world 12-hour clock convention', () => {
  // Tokyo local midnight for this UTC instant (00:00:00 JST -> 15:00:00 UTC the prior day).
  assert.equal(cityClock(new Date('2026-09-05T15:00:00Z'), 'tokyo', true), '12:00:00 AM');
});

test('marketStates() threads hour12 through to every city, not just one', () => {
  const ref = new Date('2026-09-06T15:49:02Z');
  const states24 = marketStates(ref);
  const states12 = marketStates(ref, true);
  assert.equal(states24.find((m) => m.market === 'london').countdown, '16:49:02');
  assert.equal(states12.find((m) => m.market === 'london').countdown, '04:49:02 PM');
  assert.equal(states12.find((m) => m.market === 'new-york').countdown, '11:49:02 AM');
});
