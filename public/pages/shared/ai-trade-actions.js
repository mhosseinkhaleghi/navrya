(function () {
  'use strict';
  // Pure, framework-agnostic normalization/resolution helpers for Journey B's trade.calculator AI
  // action. Kept here, not inline in navrya-src/character-app.jsx (where the action is actually
  // registered), for one reason only: character-app.jsx is JSX and has no plain node:test + vm
  // sandbox harness, unlike every other AI Copilot module (ai-context-engine.js,
  // ai-workflow-engine.js, ...). These are pure functions with no window.TradeJournal* reads of
  // their own beyond the lookup lists explicitly passed in, so character-app.jsx's own
  // normalizeField(path, value) just forwards to normalizeField() below, passing the real
  // TradeJournalStrategyEducationStore.listActive()/TradeJournalPatternStore.listForScenarios()
  // results it already has in scope - a single source of truth, testable here and used there.

  function normalizeDirection(raw) {
    var text = String(raw || '').trim().toLowerCase();
    if (/^(long|buy|bull|bullish)$/.test(text)) return 'long';
    if (/^(short|sell|bear|bearish)$/.test(text)) return 'short';
    return null;
  }

  function normalizeMarginMode(raw) {
    var text = String(raw || '').trim().toLowerCase();
    if (text === 'cross') return 'cross';
    if (text === 'isolated' || text === 'iso') return 'isolated';
    return null;
  }

  // Strips currency symbols/commas/units ("$66,000", "66000 usd") down to a plain positive
  // number, the same tolerant parsing tradeCalculatorModal.jsx's own toNum() already applies to
  // manually typed fields - a spoken/extracted price is untrusted input exactly like a typed one.
  function normalizeNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    var n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function normalizeLeverage(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    var n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n >= 1 ? n : null;
  }

  // Accepts one target ("66000") or several in the same message ("66000, 68000 and 70000") -
  // split evenly across the supplied count with the rounding remainder on the last target, the
  // exact same convention tradeCalculatorModal.jsx's own screenshot-extraction path already uses
  // (`const n = extraction.takeProfits.length, equal = Math.round(100 / n)`), just producing
  // {price, portionPercent} (the calculator's AI allowlist shape) instead of that path's own
  // {price, portion} local-state shape.
  function normalizeTakeProfits(raw) {
    var parts = String(raw === null || raw === undefined ? '' : raw)
      .split(/[,/]| and /i)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    var prices = parts.map(normalizeNumber).filter(function (n) { return n !== null; });
    if (!prices.length) return null;
    var n = prices.length, equal = Math.round(100 / n);
    return prices.map(function (price, i) {
      return { price: price, portionPercent: i === n - 1 ? 100 - equal * (n - 1) : equal };
    });
  }

  // Real Strategy/Pattern resolution by name against a caller-supplied list of {id, name} records
  // (the real TradeJournalStrategyEducationStore.listActive()/TradeJournalPatternStore.
  // listForScenarios() results) - never a guessed id. An unmatched name returns null (or, for
  // patterns, since the field is a list, still null - not an empty array - so
  // ai-workflow-engine.js's applyKnownFields() leaves it as a missing/unapplied field rather than
  // linking a fabricated record or silently clearing a real one). Exact (case-insensitive) name
  // match wins; otherwise the first saved name containing the spoken text.
  function resolveStrategyId(raw, list) {
    var name = String(raw || '').trim().toLowerCase();
    if (!name) return null;
    var items = list || [];
    var exact = items.find(function (s) { return String(s.name || '').trim().toLowerCase() === name; });
    var found = exact || items.find(function (s) { return String(s.name || '').trim().toLowerCase().indexOf(name) > -1; });
    return found ? found.id : null;
  }

  function resolvePatternIds(raw, list) {
    var name = String(raw || '').trim().toLowerCase();
    if (!name) return null;
    var items = list || [];
    var exact = items.find(function (p) { return String(p.name || '').trim().toLowerCase() === name; });
    var found = exact || items.find(function (p) { return String(p.name || '').trim().toLowerCase().indexOf(name) > -1; });
    return found ? [found.id] : null;
  }

  // Instrument Catalog domain: same trim/strip-whitespace/uppercase/validate algorithm as
  // instrument-catalog.types.js (client) and instrument-normalize.mjs (server) - duplicated
  // here, not imported, for the same reason every other normalizeXxx() in this file is
  // self-contained (this module's own header: "no window.TradeJournal* reads of their own
  // beyond the lookup lists explicitly passed in", so it stays testable in a bare vm sandbox).
  var INSTRUMENT_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9._-]{0,18}[A-Z0-9])?$/;
  function normalizeInstrumentCode(raw) {
    var text = String(raw == null ? '' : raw).trim().replace(/\s+/g, '').toUpperCase();
    return INSTRUMENT_CODE_PATTERN.test(text) ? text : null;
  }
  // Same strict "resolve against the user's real catalog, or leave unfilled" contract as
  // resolveAccountId directly above - never invents/adds a new catalog entry from spoken text
  // alone (that is only ever an explicit InstrumentPicker "Add" action); a code that normalizes
  // fine but isn't actually in this user's catalog still resolves to null.
  function resolveInstrument(raw, list) {
    var code = normalizeInstrumentCode(raw);
    if (!code) return null;
    var found = (list || []).find(function (item) { return item.code === code; });
    return found ? found.code : null;
  }
  // Accepts one instrument or several in the same message ("XAU and BTC"), same separator
  // convention as normalizeTakeProfits() above - used by pattern.create/pattern.edit's
  // multi-instrument field.
  function resolveInstruments(raw, list) {
    var parts = Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/[,/]| and /i).map(function (s) { return s.trim(); }).filter(Boolean);
    var resolved = [];
    parts.forEach(function (part) {
      var code = resolveInstrument(part, list);
      if (code && resolved.indexOf(code) === -1) resolved.push(code);
    });
    return resolved;
  }

  // Account resolution is deliberately STRICTER than resolveStrategyId/resolvePatternIds above:
  // this app's product brief requires account names to "resolve deterministically; ambiguous
  // matches must ask the user, never guess" - unlike a Strategy/Pattern link (a soft tag), an
  // account is a real money/ownership boundary, so a >1-match "first one wins" guess here would
  // be a real misattribution risk, not just a mildly wrong label. An exact case-insensitive match
  // on `firm` wins only when it is the SINGLE exact match; a >1 exact match (two accounts
  // deliberately named the same) or a >1 partial match both resolve to null - never a guess.
  function resolveAccountId(raw, list) {
    var name = String(raw || '').trim().toLowerCase();
    if (!name) return null;
    var items = list || [];
    var exact = items.filter(function (a) { return String(a.firm || '').trim().toLowerCase() === name; });
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) return null;
    var partial = items.filter(function (a) { return String(a.firm || '').trim().toLowerCase().indexOf(name) > -1; });
    return partial.length === 1 ? partial[0].id : null;
  }

  // lookups: {strategies: [{id,name}], patterns: [{id,name}]} - only read for the two fields that
  // need them, so a caller with neither store available can still normalize every other field.
  function normalizeField(path, value, lookups) {
    var look = lookups || {};
    if (path === 'direction') return normalizeDirection(value);
    if (path === 'marginMode') return normalizeMarginMode(value);
    if (path === 'entryPrice' || path === 'stopLoss' || path === 'accountBalance' || path === 'riskAmount' || path === 'riskPercent') return normalizeNumber(value);
    if (path === 'leverage') return normalizeLeverage(value);
    if (path === 'takeProfits') return normalizeTakeProfits(value);
    if (path === 'linkedStrategyId') return resolveStrategyId(value, look.strategies);
    if (path === 'linkedPatternIds') return resolvePatternIds(value, look.patterns);
    if (path === 'accountId') return resolveAccountId(value, look.accounts);
    if (path === 'instrument') return resolveInstrument(value, look.instrumentCatalog);
    if (path === 'instruments') return resolveInstruments(value, look.instrumentCatalog);
    return value;
  }

  window.TradeJournalAITradeActions = {
    normalizeDirection: normalizeDirection,
    normalizeMarginMode: normalizeMarginMode,
    normalizeNumber: normalizeNumber,
    normalizeLeverage: normalizeLeverage,
    normalizeTakeProfits: normalizeTakeProfits,
    resolveStrategyId: resolveStrategyId,
    resolvePatternIds: resolvePatternIds,
    resolveAccountId: resolveAccountId,
    resolveInstrument: resolveInstrument,
    resolveInstruments: resolveInstruments,
    normalizeField: normalizeField
  };
}());
