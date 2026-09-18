import assert from 'node:assert/strict';
import test from 'node:test';
import { lastDayKeys, dayKeyInZone } from '../navrya-src/disciplineDays.js';
import { dayKeyInTimeZone } from '../server/community/ai-discipline.mjs';

// The heatmap's 90 day cells (navrya-src/accountProfileView.jsx DisciplineHeatmapPanel) must be
// 90 DISTINCT, consecutive local calendar days in the server's own day-key format. The previous
// "now minus i x 24h, re-formatted" approach duplicated one key and skipped another across every
// DST change - these instants straddle each real transition.

const ZONES = ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Asia/Tehran', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const INSTANTS = [
  '2026-03-08T12:00:00.000Z', '2026-03-09T12:00:00.000Z', '2026-03-29T12:00:00.000Z', '2026-03-30T12:00:00.000Z',
  '2026-04-05T12:00:00.000Z', '2026-10-25T12:00:00.000Z', '2026-11-01T12:00:00.000Z', '2026-11-02T12:00:00.000Z', '2026-06-15T00:00:00.000Z'
];

function nextDay(key) {
  return new Date(Date.parse(key + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}

test('lastDayKeys returns 90 distinct, strictly consecutive local days ending today, across every DST transition and zone', () => {
  INSTANTS.forEach((iso) => {
    const nowMs = Date.parse(iso);
    ZONES.forEach((zone) => {
      const keys = lastDayKeys(zone, 90, nowMs);
      assert.equal(keys.length, 90, zone + ' ' + iso);
      assert.equal(new Set(keys).size, 90, zone + ' ' + iso + ': every day key must be distinct');
      for (let i = 1; i < keys.length; i += 1) {
        assert.equal(keys[i], nextDay(keys[i - 1]), zone + ' ' + iso + ': day ' + i + ' must directly follow the previous one');
      }
      assert.equal(keys[keys.length - 1], dayKeyInZone(nowMs, zone), zone + ' ' + iso + ': the last cell is today');
    });
  });
});

test('the client day key is byte-identical to the server day key for the same instant and zone', () => {
  INSTANTS.forEach((iso) => {
    ZONES.forEach((zone) => {
      assert.equal(dayKeyInZone(Date.parse(iso), zone), dayKeyInTimeZone(new Date(iso), zone), zone + ' ' + iso);
    });
  });
});

test('an invalid timezone falls back to UTC rather than throwing', () => {
  const nowMs = Date.parse('2026-03-10T15:00:00.000Z');
  assert.deepEqual(lastDayKeys('Not/ARealZone', 3, nowMs), lastDayKeys('UTC', 3, nowMs));
  assert.deepEqual(lastDayKeys(undefined, 3, nowMs), lastDayKeys('UTC', 3, nowMs));
});
