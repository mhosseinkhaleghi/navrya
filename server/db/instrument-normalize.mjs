// Instrument Catalog domain (025_instrument_catalog.sql). One normalization spec, implemented
// twice - here for server code (repo.pg.mjs, repo.memory.mjs, routes.instrument-catalog.mjs) and
// again, necessarily separately, in public/pages/shared/instrument-catalog.types.js for the
// unbundled classic-script client (that file cannot import this one - see that file's own
// header comment). Keep both algorithms identical: trim -> strip internal whitespace -> uppercase
// -> validate. Deliberately no alias table - "BTC" never becomes "BTCUSDT" here or anywhere else;
// an unrecognized/invalid code returns null rather than a guess.
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,18}[A-Z0-9]$/;

export function normalizeInstrumentCode(raw) {
  const text = String(raw == null ? '' : raw).trim().replace(/\s+/g, '').toUpperCase();
  return CODE_PATTERN.test(text) ? text : null;
}

export function normalizeInstrumentCodes(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const code = normalizeInstrumentCode(item);
    if (code && !seen.has(code)) { seen.add(code); out.push(code); }
  }
  return out;
}
