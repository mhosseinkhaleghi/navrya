// Pure day-key helpers for the AI Analysis Discipline heatmap (accountProfileView.jsx). Kept out
// of that JSX file so the calendar arithmetic can be unit-tested directly under node:test. The key
// format - YYYY-MM-DD in the user's IANA timezone, via the en-CA locale - is exactly the one
// server/community/ai-discipline.mjs's dayKeyInTimeZone() emits, so a day drawn here lines up with
// the server's own qualifying-day computation.

export function dayKeyInZone(instantMs, timeZone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (_) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  return formatter.format(new Date(instantMs));
}

// The last `count` consecutive LOCAL calendar days ending today, oldest first. Neighbouring days
// come from plain calendar arithmetic on the YYYY-MM-DD key in UTC - never from subtracting 24h
// multiples from "now" and re-formatting, which across a DST change (a 23h or 25h local day)
// duplicates one day key and skips another.
export function lastDayKeys(timeZone, count, nowMs) {
  const todayUtcMs = Date.parse(dayKeyInZone(nowMs, timeZone) + 'T00:00:00Z');
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(new Date(todayUtcMs - i * 86400000).toISOString().slice(0, 10));
  }
  return keys;
}
