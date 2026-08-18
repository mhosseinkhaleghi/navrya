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
    normalizeField: normalizeField
  };
}());
