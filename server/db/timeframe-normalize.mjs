// Canonical server-side TIMEFRAMES contract for the Media Drive domain (media_assets.timeframe).
// Before this file, NO server module validated a timeframe value at all - three DIVERGING
// client-side copies exist (navrya-src/liveSessionView.jsx's own 10-value TIMEFRAMES,
// public/pages/shared/navrya/components/sessions/NewSessionDialog.jsx's separate 5-value subset,
// and public/pages/shared/session-workspace-logic.js's own lowercase 10-value copy). This picks
// the 10-value set the Live Session domain (this feature's own real scope) and the legacy
// session-entry-flow already agree on - unifying NewSessionDialog's separate, narrower set is a
// distinct, pre-existing, out-of-scope gap, not touched here.
export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W'];

/**
 * @param {unknown} raw
 * @returns {string|null} the exact canonical value, or null when raw is not a real, known timeframe.
 */
export function normalizeTimeframe(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return TIMEFRAMES.indexOf(value) > -1 ? value : null;
}
