/**
 * @typedef {{id:string,code:string,displayName:string|null,createdAt:string,updatedAt:string}} InstrumentCatalogEntry
 */
(function () {
  'use strict';
  // Instrument Catalog domain (025_instrument_catalog.sql). One normalization spec, implemented
  // twice - here for the unbundled classic-script client, and again in
  // server/db/instrument-normalize.mjs for server code (that file cannot be imported from here -
  // this page is plain browser JS, not a bundled/Node module). Keep both algorithms identical:
  // trim -> strip internal whitespace -> uppercase -> validate. Deliberately no alias table -
  // "BTC" never becomes "BTCUSDT" here or anywhere else; an unrecognized/invalid code returns
  // null rather than a guess.
  var CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9._-]{0,18}[A-Z0-9])?$/;

  function normalizeCode(raw) {
    var text = String(raw == null ? '' : raw).trim().replace(/\s+/g, '').toUpperCase();
    return CODE_PATTERN.test(text) ? text : null;
  }

  function isValidCode(code) { return normalizeCode(code) !== null; }

  window.TradeJournalInstrumentCatalogTypes = Object.freeze({
    InstrumentCatalogEntry: 'InstrumentCatalogEntry',
    normalizeCode: normalizeCode,
    isValidCode: isValidCode,
    CODE_PATTERN: CODE_PATTERN
  });
}());
