// Real market-session-window math, using the same UTC windows already documented and used
// elsewhere in this app (trade-store.js's detectSession / ARCHITECTURE.md's session-detection
// table): London 07:00-16:00, New York 13:00-22:00, Tokyo 00:00-09:00, else Sydney. Computed
// live from the current time - never a hardcoded fake string like the page's existing topbar
// clocks or the design system's own '01:35:40' mock default.
const WINDOWS = [
  { market: 'london', start: 7, end: 16 },
  { market: 'new-york', start: 13, end: 22 },
  { market: 'tokyo', start: 0, end: 9 }
];
// Sydney has no fixed window of its own in the existing detection table - it is the fallback
// whenever none of the three explicit windows match, so its "window" for countdown purposes is
// simply "whatever hour range is NOT covered by the other three" is not a single contiguous
// range; Sydney is instead treated as always-open outside those three (matches detectSession()).

function pad(n) { return String(n).padStart(2, '0'); }

export function currentOpenMarket(now) {
  const hour = now.getUTCHours();
  const hit = WINDOWS.find((w) => hour >= w.start && hour < w.end);
  return hit ? hit.market : 'sydney';
}

// Real live local clock per city (fixed standard-time UTC offsets, matching this app's existing
// "DST is not applied" convention - ARCHITECTURE.md's session-detection table already accepts
// this simplification). Replaces the static "07:00-16:00" session-window text on each market
// card with each city's actual current time, ticking every second - the market card's own
// `countdown` prop is exactly the override slot the design system built for this.
const UTC_OFFSET = { london: 0, 'new-york': -5, tokyo: 9, sydney: 10 };

export function cityClock(now, market) {
  const offsetMs = (UTC_OFFSET[market] || 0) * 3600000;
  const local = new Date(now.getTime() + offsetMs);
  return pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes()) + ':' + pad(local.getUTCSeconds());
}

export function marketStates(now) {
  const open = currentOpenMarket(now);
  return ['london', 'new-york', 'tokyo', 'sydney'].map((market) => ({ market, state: market === open ? 'open' : 'default', countdown: cityClock(now, market) }));
}

// Seconds until the next window boundary (any of the three explicit start hours, wrapping to
// tomorrow) - a real countdown to "the next session change", not the exact same thing the
// design system's own NextSessionPanel demo implies but honestly what a live boundary clock
// can compute from this app's own documented windows.
export function nextSessionCountdown(now) {
  const hour = now.getUTCHours(), minute = now.getUTCMinutes(), second = now.getUTCSeconds();
  const startsAt = WINDOWS.map((w) => w.start).sort((a, b) => a - b);
  let nextHour = startsAt.find((h) => h > hour);
  let daysAhead = 0;
  if (nextHour === undefined) { nextHour = startsAt[0]; daysAhead = 1; }
  const nextWindow = WINDOWS.find((w) => w.start === nextHour);
  const secondsUntil = daysAhead * 86400 + (nextHour - hour) * 3600 - minute * 60 - second;
  const h = Math.floor(secondsUntil / 3600), m = Math.floor((secondsUntil % 3600) / 60), s = secondsUntil % 60;
  return {
    city: (nextWindow ? nextWindow.market : 'london').toUpperCase().replace('-', ' '),
    startsIn: pad(h) + ':' + pad(m) + ':' + pad(s)
  };
}

export function utcClock(now) {
  return pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ':' + pad(now.getUTCSeconds());
}

// A real duration formatter (ms elapsed -> HH:MM:SS), distinct from utcClock/cityClock above,
// which are wall-clock formatters. Mirrors session-workspace-logic.js's own clock(ms) helper for
// per-trading-session elapsed/loop timers, exported here since that file is a plain script (not
// a module) and this app-wide "time in app this session" counter has no session record to read
// startedAt from - HeaderApp captures its own mount time instead (see character-app.jsx).
export function elapsedClock(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
}
