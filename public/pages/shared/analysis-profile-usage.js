/**
 * Analysis Profile usage - the pure math behind the profile's Report tab (ARCHITECTURE.md §7.25,
 * Phase 5). `window.TradeJournalAnalysisProfileUsage.compute(input)` turns REAL recorded data into the
 * report's numbers; it reads nothing itself (no stores, no network, no clock except the `now` it is
 * handed), so it is deterministic and unit-testable in a bare vm sandbox.
 *
 * Inputs (all plain data):
 *   profileId  - the profile being reported on
 *   analyses   - the server-authoritative runs (GET /api/sync/analysis-profiles/:id/usage): when, which
 *                model, the server-clock market session, the rebuilt mandatory-concept coverage
 *   sessions   - the trader's session records; scenarios stamped `aiSource.analysisProfileId` are the ones
 *                this profile's analyses produced
 *   trades     - the trader's trades; one is "linked" when its source.scenarioId is such a scenario
 *   events     - the profile's learning-ledger events (training tokens)
 *   concepts   - the profile's concepts (titles for the per-concept bars)
 *   timeZone   - IANA zone the trader's calendar days are read in; now - the reference instant
 *
 * Honesty rules this file follows: every number is derived from a real record or is null (never a
 * placeholder zero that reads as "measured and nothing happened"); accuracy is confirmed / (confirmed +
 * invalidated) - scenarios still open are NOT counted as either; a sample below SMALL_SAMPLE resolved
 * scenarios is flagged so the UI can say so; analyses run before attribution existed carry no profile id
 * and are simply absent (trackingSince says where the data begins).
 *
 * Calendar days are computed as INTEGER day numbers in the chosen time zone (Y-M-D read through Intl,
 * then Date.UTC of those parts), never as "milliseconds / 86400000" - an hour that changes length across a
 * DST switch, or a trader west of UTC whose evening is already "tomorrow" in UTC, must land on the right
 * weekday and in the right week (the failure this codebase has already had once).
 */
(function () {
  'use strict';

  var SESSIONS = ['London', 'New York', 'Tokyo', 'Sydney'];
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; // Monday-first, matching a trading week
  var SMALL_SAMPLE = 10;
  var TREND_WEEKS = 12;
  var R_BUCKETS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

  // Strict on purpose: `new Date(null).getTime()` is 0 (and `new Date(true)` is 1), so a missing timestamp would silently become
  // "1 January 1970" and be counted as a real - very old - instant. Only a Date, a finite number or a non-empty string is a time.
  function toMs(value) {
    var ms;
    if (Object.prototype.toString.call(value) === '[object Date]') ms = value.getTime(); // works across realms, unlike instanceof
    else if (typeof value === 'number') ms = value;
    else if (typeof value === 'string' && value.trim()) ms = new Date(value).getTime();
    else return null;
    return isFinite(ms) ? ms : null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function pct(part, whole) { return whole ? Math.round((part / whole) * 100) : null; }
  function round1(n) { return Math.round(n * 10) / 10; }

  // An unknown / malformed zone falls back to UTC rather than throwing inside a report.
  function safeZone(timeZone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: timeZone }); return timeZone || 'UTC'; } catch (_) { return 'UTC'; }
  }

  // Integer calendar-day number of an instant, in `timeZone`.
  function dayNumber(ms, timeZone) {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)).split('-');
    return Math.round(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) / 86400000);
  }
  // 0 = Monday ... 6 = Sunday, in `timeZone`.
  function weekdayIndex(ms, timeZone) {
    return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: timeZone, weekday: 'short' }).format(new Date(ms)));
  }
  // Whole calendar weeks between an instant and `now`, in `timeZone` (0 = the last 7 calendar days, including today).
  function weeksAgo(ms, nowMs, timeZone) {
    return Math.floor((dayNumber(nowMs, timeZone) - dayNumber(ms, timeZone)) / 7);
  }

  // ---- scenarios -------------------------------------------------------------------------------------------------

  function scenarioOutcome(scenario) {
    if (scenario.occurred === true || scenario.status === 'confirmed') return 'confirmed';
    if (scenario.status === 'invalidated' || arr(scenario.invalidationTagIds).length) return 'invalidated';
    return 'open';
  }
  function lastOf(list) { return list.length ? list[list.length - 1] : null; }
  // Best available moment a scenario was resolved: its last AI evaluation, else its last logged probability. A
  // scenario the trader resolved by hand carries no dedicated timestamp, so this is "when it was last touched" -
  // documented rather than presented as an exact resolution time.
  function resolvedAtMs(scenario) {
    var evaluation = scenario.lastEvaluation && scenario.lastEvaluation.evaluatedAt;
    var history = lastOf(arr(scenario.evaluationHistory));
    var probability = lastOf(arr(scenario.probabilityHistory));
    var candidates = [toMs(evaluation), toMs(history && history.evaluatedAt), toMs(probability && probability.loggedAt)];
    for (var i = 0; i < candidates.length; i += 1) if (candidates[i] != null) return candidates[i];
    return null;
  }

  function attributedScenarios(sessions, profileId) {
    var out = [];
    arr(sessions).forEach(function (session) {
      arr(session && session.entries).forEach(function (entry) {
        arr(entry && entry.scenarios).forEach(function (scenario) {
          if (scenario && scenario.aiSource && scenario.aiSource.analysisProfileId === profileId) out.push({ scenario: scenario, session: session, entry: entry });
        });
      });
    });
    return out;
  }

  function weeklyAccuracy(resolved, nowMs, timeZone) {
    var buckets = [];
    for (var i = 0; i < TREND_WEEKS; i += 1) buckets.push({ total: 0, confirmed: 0 });
    resolved.forEach(function (item) {
      var ms = resolvedAtMs(item.scenario);
      if (ms == null) return;
      var ago = weeksAgo(ms, nowMs, timeZone);
      if (ago < 0 || ago >= TREND_WEEKS) return;
      var bucket = buckets[TREND_WEEKS - 1 - ago];
      bucket.total += 1;
      if (item.outcome === 'confirmed') bucket.confirmed += 1;
    });
    // A quiet week carries the previous week's rate forward (a drop to 0% on a week with nothing resolved would be a lie);
    // weeklyResolved says which weeks actually had data.
    var rates = []; var last = 0;
    buckets.forEach(function (b) { if (b.total) last = Math.round((b.confirmed / b.total) * 100); rates.push(last); });
    return { rates: rates, weeklyResolved: buckets.map(function (b) { return b.total; }) };
  }

  // ---- concept adherence -----------------------------------------------------------------------------------------------

  function adherence(analyses, concepts) {
    var titleById = {};
    arr(concepts).forEach(function (c) { if (c && c.id) titleById[c.id] = c.title; });
    var byConcept = {}; var order = [];
    var total = { slots: 0, applied: 0, notVisible: 0, notApplicable: 0, unaddressed: 0 };
    var runsWithCoverage = 0;
    arr(analyses).forEach(function (row) {
      var coverage = arr(row.conceptCoverage);
      if (!coverage.length) return;
      runsWithCoverage += 1;
      coverage.forEach(function (item) {
        var id = String(item.conceptId);
        if (!byConcept[id]) { byConcept[id] = { conceptId: id, title: titleById[id] || id, total: 0, applied: 0, notVisible: 0, notApplicable: 0, unaddressed: 0 }; order.push(id); }
        var slot = byConcept[id];
        slot.total += 1; total.slots += 1;
        if (item.status === 'applied') { slot.applied += 1; total.applied += 1; }
        else if (item.status === 'not_visible') { slot.notVisible += 1; total.notVisible += 1; }
        else if (item.status === 'not_applicable') { slot.notApplicable += 1; total.notApplicable += 1; }
        else { slot.unaddressed += 1; total.unaddressed += 1; }
      });
    });
    return {
      runsWithCoverage: runsWithCoverage, slots: total.slots, applied: total.applied, notVisible: total.notVisible, notApplicable: total.notApplicable, unaddressed: total.unaddressed,
      // appliedRate: how often a mandatory concept was actually applied; checkedRate: how often the engine reported on it at all
      // (applied, or honestly not visible / not applicable) - the difference is the engine skipping a mandatory concept.
      appliedRate: pct(total.applied, total.slots), checkedRate: total.slots ? pct(total.slots - total.unaddressed, total.slots) : null,
      perConcept: order.map(function (id) { var c = byConcept[id]; c.appliedRate = pct(c.applied, c.total); c.checkedRate = pct(c.total - c.unaddressed, c.total); return c; })
    };
  }

  // ---- trades ----------------------------------------------------------------------------------------------------------

  function tradeStats(trades, scenarioIds) {
    var linked = arr(trades).filter(function (t) { return t && t.source && t.source.scenarioId && scenarioIds[t.source.scenarioId]; });
    var closed = linked.filter(function (t) { return t.status === 'closed'; });
    var wins = closed.filter(function (t) { return t.outcome === 'win'; }).length;
    var rrs = closed.map(function (t) { return t.rr; }).filter(function (v) { return v !== null && v !== undefined && isFinite(Number(v)); }).map(Number);
    var buckets = R_BUCKETS.map(function (r) { return { r: r, count: 0 }; });
    rrs.forEach(function (rr) {
      var nearest = buckets[0]; var best = Infinity;
      buckets.forEach(function (b) { var d = Math.abs(b.r - rr); if (d < best) { best = d; nearest = b; } });
      nearest.count += 1;
    });
    return {
      linked: linked.length, closed: closed.length, wins: wins, winRate: pct(wins, closed.length),
      avgR: rrs.length ? round1(rrs.reduce(function (a, b) { return a + b; }, 0) / rrs.length) : null,
      rDistribution: { buckets: buckets, counted: rrs.length }
    };
  }

  // ---- heatmap / markets -----------------------------------------------------------------------------------------------

  function heatmap(analyses, timeZone) {
    var table = SESSIONS.map(function () { return [0, 0, 0, 0, 0, 0, 0]; });
    var placed = 0; var unplaced = 0;
    arr(analyses).forEach(function (row) {
      var ms = toMs(row.occurredAt);
      var si = SESSIONS.indexOf(row.activeMarketSession);
      if (ms == null || si < 0) { unplaced += 1; return; }
      var day = weekdayIndex(ms, timeZone);
      if (day < 0) { unplaced += 1; return; }
      table[si][day] += 1; placed += 1;
    });
    var max = 0;
    table.forEach(function (row) { row.forEach(function (v) { if (v > max) max = v; }); });
    return { sessions: SESSIONS.slice(), weekdays: WEEKDAYS.slice(), table: table, placed: placed, unplaced: unplaced, max: max };
  }

  function topBy(items, keyOf, limit) {
    var counts = {}; var order = [];
    items.forEach(function (item) {
      var key = keyOf(item);
      if (!key) return;
      if (!(key in counts)) { counts[key] = 0; order.push(key); }
      counts[key] += 1;
    });
    return order.map(function (key) { return { key: key, count: counts[key] }; })
      .sort(function (a, b) { return b.count - a.count || (a.key < b.key ? -1 : 1); }).slice(0, limit || 5);
  }

  function tokens(events) {
    var total = 0; var aiEvents = 0;
    arr(events).forEach(function (e) {
      var usage = e && e.tokenUsage;
      var n = usage ? (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0) : 0;
      if (n > 0) { total += n; aiEvents += 1; }
    });
    return { total: total, aiEvents: aiEvents, events: arr(events).length };
  }

  // ---- the report ---------------------------------------------------------------------------------------------------------

  function compute(input) {
    var opts = input || {};
    var zone = safeZone(opts.timeZone);
    var nowMs = toMs(opts.now) != null ? toMs(opts.now) : Date.now();
    var analyses = arr(opts.analyses).filter(function (row) { return row && toMs(row.occurredAt) != null; })
      .sort(function (a, b) { return toMs(a.occurredAt) - toMs(b.occurredAt); });

    var attributed = attributedScenarios(opts.sessions, opts.profileId).map(function (item) {
      return { scenario: item.scenario, session: item.session, entry: item.entry, outcome: scenarioOutcome(item.scenario) };
    });
    var confirmed = attributed.filter(function (i) { return i.outcome === 'confirmed'; }).length;
    var invalidated = attributed.filter(function (i) { return i.outcome === 'invalidated'; }).length;
    var resolved = confirmed + invalidated;
    var scenarioIds = {};
    attributed.forEach(function (i) { scenarioIds[i.scenario.id] = true; });

    var sessionById = {};
    arr(opts.sessions).forEach(function (s) { if (s && s.id) sessionById[s.id] = s; });
    var entryTimeframe = function (row) {
      var session = sessionById[row.sessionId];
      if (!session) return '';
      var entry = arr(session.entries).find(function (e) { return e && e.id === row.entryId; });
      return (entry && entry.timeframe) || session.timeframe || '';
    };

    var byType = { initial: 0, update: 0, scenario_evaluation: 0, other: 0 };
    analyses.forEach(function (row) { if (row.analysisType in byType && row.analysisType !== 'other') byType[row.analysisType] += 1; else byType.other += 1; });

    var trend = weeklyAccuracy(attributed.filter(function (i) { return i.outcome !== 'open'; }), nowMs, zone);

    return {
      empty: analyses.length === 0,
      timeZone: zone,
      trackingSince: analyses.length ? new Date(toMs(analyses[0].occurredAt)).toISOString() : null,
      analyses: { total: analyses.length, byType: byType },
      scenarios: {
        added: attributed.length, confirmed: confirmed, invalidated: invalidated, open: attributed.length - resolved, resolved: resolved,
        accuracy: pct(confirmed, resolved), smallSample: resolved > 0 && resolved < SMALL_SAMPLE, smallSampleThreshold: SMALL_SAMPLE
      },
      funnel: [
        { key: 'analyses', v: analyses.length }, { key: 'scenarios', v: attributed.length },
        { key: 'resolved', v: resolved }, { key: 'confirmed', v: confirmed }
      ],
      accuracyTrend: trend.rates, weeklyResolved: trend.weeklyResolved,
      adherence: adherence(analyses, opts.concepts),
      trades: tradeStats(opts.trades, scenarioIds),
      tokens: tokens(opts.events),
      heatmap: heatmap(analyses, zone),
      topInstruments: topBy(analyses, function (row) { var s = sessionById[row.sessionId]; return s && s.instrument; }, 5),
      topTimeframes: topBy(analyses, entryTimeframe, 5)
    };
  }

  window.TradeJournalAnalysisProfileUsage = {
    compute: compute,
    // exposed for tests and for other reports that need the same calendar-day arithmetic
    helpers: { dayNumber: dayNumber, weekdayIndex: weekdayIndex, weeksAgo: weeksAgo, scenarioOutcome: scenarioOutcome, resolvedAtMs: resolvedAtMs, safeZone: safeZone },
    SESSIONS: SESSIONS, WEEKDAYS: WEEKDAYS, SMALL_SAMPLE: SMALL_SAMPLE, TREND_WEEKS: TREND_WEEKS
  };
}());
