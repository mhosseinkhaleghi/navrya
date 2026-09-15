// Real-clock trading-session detection for Media Drive's activeMarketSession field. Deliberately
// its own tiny copy of public/pages/shared/navrya/components/sessions/NewSessionDialog.jsx's own
// liveTradingSession() - same priority order, same UTC hour ranges - kept as a separate copy the
// same way that file's own comment explains (a reusable design-system client component and a
// server .mjs module cannot share one file anyway). London/New York's overlap (13:00-16:00) keeps
// London (checked first); Sydney/Tokyo's overlap (00:00-07:00) resolves to Tokyo (checked before
// the Sydney fallback) - identical resolution to the client copy, so the two never disagree.
//
// Why this exists at all (real user correction, 2026-09-15): a media asset's activeMarketSession
// used to be read from whichever Live Session record it was linked to (session.market) - but that
// is whatever city the trader picked when THEY opened that session, not necessarily the real
// market that is actually live right now at capture time (a session can stay open for hours, or a
// trader can screenshot a chart well after their own session's own city has closed). This always
// computes the real, current session from the server's own clock instead, independent of any
// session's stored label.
export function currentMarketSession(now = new Date()) {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const inRange = (start, end) => (start < end ? (hour >= start && hour < end) : (hour >= start || hour < end));
  if (inRange(7, 16)) return 'London';
  if (inRange(13, 22)) return 'New York';
  if (inRange(0, 9)) return 'Tokyo';
  return 'Sydney';
}
