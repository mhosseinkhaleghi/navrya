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

// Real live local clock per city. FIXED (production bug): this used to be a hardcoded,
// standard-time-only UTC offset table (london: 0, new-york: -5, tokyo: 9, sydney: 10) that never
// accounted for Daylight Saving Time - London/New York both observe DST (BST/EDT), so for roughly
// half the year (whenever either is actually in DST) this showed both cities' clocks a full hour
// behind their real local time. Tokyo has no DST at all and Sydney's DST season didn't overlap
// the specific date this was found on, which is exactly why the bug looked like it only affected
// "some" cities rather than all four - it affects whichever of the four are currently observing
// DST at any given moment, which changes across the year. Real IANA timezone data (via
// Intl.DateTimeFormat) tracks every zone's actual DST transitions automatically, forever - no
// hardcoded offset table can ever do this correctly for more than part of the year.
const MARKET_TIMEZONE = { london: 'Europe/London', 'new-york': 'America/New_York', tokyo: 'Asia/Tokyo', sydney: 'Australia/Sydney' };

// One Intl.DateTimeFormat instance per (market, hour12) pair, reused across every tick - this
// runs once a second per mounted header, and constructing a new Intl.DateTimeFormat is real,
// measurable overhead compared to calling .format() on an already-built one.
const cityClockFormatters = {};
function cityClockFormatter(market, hour12) {
  const cacheKey = market + '|' + hour12;
  if (!cityClockFormatters[cacheKey]) {
    cityClockFormatters[cacheKey] = new Intl.DateTimeFormat('en-GB', {
      timeZone: MARKET_TIMEZONE[market] || 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12
    });
  }
  return cityClockFormatters[cacheKey];
}

// Replaces the static "07:00-16:00" session-window text on each market card with each city's
// actual current local time, ticking every second - the market card's own `countdown` prop is
// exactly the override slot the design system built for this. `hour12` is the second production
// bug this fixes: Settings' Region & Language "12-hour/24-hour" toggle (region.clock24) was
// stored but never actually read anywhere - toggling it visibly changed nothing. Defaults to
// false (24-hour) so any caller that doesn't pass it keeps the exact prior display shape.
export function cityClock(now, market, hour12 = false) {
  const formatted = cityClockFormatter(market, hour12).format(now);
  // Intl's own 12-hour output is lowercase ('4:49:02 pm') - uppercased to match this header's
  // existing all-caps label convention (city names, "OPEN", etc.), nothing else changed.
  return hour12 ? formatted.toUpperCase() : formatted;
}

export function marketStates(now, hour12 = false) {
  const open = currentOpenMarket(now);
  return ['london', 'new-york', 'tokyo', 'sydney'].map((market) => ({ market, state: market === open ? 'open' : 'default', countdown: cityClock(now, market, hour12) }));
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
