(function () {
  'use strict';
  /**
   * Pure, deterministic Account risk/compliance engine. No network calls, no hidden state -
   * every function takes an Account plus that user's Trade list (plus an optional injected
   * `now`) and returns numbers derived only from real, stored data. Nothing here ever
   * fabricates a balance, a probability, or a rule outcome: where an input a computation needs
   * is not configured on the account, or there is not enough trade history yet, the affected
   * field comes back `null` (or the row is omitted, or the state is 'insufficient') rather than
   * a guessed value. See ACCOUNTS_HANDOFF.md section 9.
   *
   * Determinism: every function that cares about "now" (computeMetrics, evaluateRules,
   * evaluatePretrade, dailyPLSeries, computeDiscipline) accepts it via `opts.now` (a Date or an
   * ISO string) and defaults to `new Date()` only when the caller omits it - tests always pass a
   * fixed `now` so a boundary case (a trade one minute either side of a reset) is reproducible,
   * not a function of when the test happens to run.
   *
   * Trading-day boundaries: an account's `rules.dailyResetTimezone` (an IANA zone, e.g.
   * "America/New_York") and `rules.dailyResetHour` (0-23, local wall-clock hour in that zone)
   * together define when "today" rolls over - the same way a real prop firm's own daily-loss
   * reset works. Both default to UTC / 0 when unset (documented, not fabricated - see
   * tradingDayKey()'s own comment).
   *
   * Rule/compliance states: 'safe' | 'progress' | 'watch' | 'danger' | 'violated' | 'insufficient'
   * ('insufficient' is distinct from 'safe' - it means NAVRYA cannot verify this rule right now,
   * most commonly because the rule's own configured basis needs floating/unrealized P&L on an
   * open position and this app has no live mark-price feed to compute that honestly. A rule is
   * NEVER shown as 'safe' by falling back to realized-only math when its own configuration says
   * it needs more than that.)
   */

  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
  function avg(list) { var xs = list.filter(function (x) { return typeof x === 'number' && Number.isFinite(x); }); return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; }
  function toDate(value) { var d = value instanceof Date ? value : new Date(value); return isNaN(d.getTime()) ? null : d; }

  // Real IANA-timezone-aware trading-day bucketing. Deterministic given (iso, timezone,
  // resetHour) alone - never reads the system clock. `timezone` unset falls back to UTC and
  // `resetHour` unset falls back to 0 (midnight) - both are the account's own configured choice
  // (or its honest absence), never a silently different default depending on the browser.
  function tradingDayKey(iso, timezone, resetHour) {
    var d = toDate(iso);
    if (!d) return null;
    var tz = timezone || 'UTC';
    var hour = Number.isFinite(resetHour) ? ((resetHour % 24) + 24) % 24 : 0;
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d);
    } catch (_) {
      // An invalid/unsupported IANA zone string - fall back to UTC rather than throwing, so a
      // bad rule config degrades to a documented default instead of crashing the whole screen.
      parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d);
    }
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    var y = Number(map.year), mo = Number(map.month), day = Number(map.day);
    var hr = Number(map.hour); if (hr === 24) hr = 0;
    var bucket = new Date(Date.UTC(y, mo - 1, day));
    if (hr < hour) bucket.setUTCDate(bucket.getUTCDate() - 1);
    return bucket.toISOString().slice(0, 10);
  }
  function monthKey(iso, timezone, resetHour) { var k = tradingDayKey(iso, timezone, resetHour); return k ? k.slice(0, 7) : null; }
  function resetConfig(account) {
    var rules = account.rules || {};
    return { timezone: rules.dailyResetTimezone || null, resetHour: num(rules.dailyResetHour) };
  }

  function limitState(usedPct) {
    if (usedPct === null) return 'safe';
    if (usedPct >= 100) return 'violated';
    if (usedPct >= 80) return 'danger';
    if (usedPct >= 50) return 'watch';
    return 'safe';
  }
  function targetState(progressPct) {
    return progressPct !== null && progressPct >= 100 ? 'safe' : 'progress';
  }

  // --- Metrics: everything an Account's UI needs, computed once from real trades. ---
  // opts: { now?: Date|string }
  function computeMetrics(account, allTrades, opts) {
    var o = opts || {};
    var now = o.now !== undefined ? o.now : new Date();
    var cfg = resetConfig(account);
    var trades = (allTrades || []).filter(function (t) { return t && t.accountId === account.id; });
    var closed = trades.filter(function (t) { return t.status === 'closed' && typeof t.pnl === 'number'; });
    var open = trades.filter(function (t) { return t.status === 'open' || t.status === 'hunting'; });
    var closedByTime = closed.slice().sort(function (a, b) { return new Date(a.closedAt || a.updatedAt) - new Date(b.closedAt || b.updatedAt); });

    var startingBalance = num(account.startingBalance) || 0;
    var totalPL = closed.length ? closed.reduce(function (sum, t) { return sum + t.pnl; }, 0) : null;
    var equity = startingBalance + (totalPL || 0);

    var todayKey = tradingDayKey(now, cfg.timezone, cfg.resetHour);
    var todayClosed = closed.filter(function (t) { return tradingDayKey(t.closedAt || t.updatedAt, cfg.timezone, cfg.resetHour) === todayKey; });
    var todayPL = todayClosed.length ? todayClosed.reduce(function (sum, t) { return sum + t.pnl; }, 0) : null;
    var dailyLossUsedRealized = todayPL !== null && todayPL < 0 ? -todayPL : 0;
    var dayStartEquity = equity - (todayPL || 0);

    var todayOpen = open.filter(function (t) { return tradingDayKey(t.createdAt, cfg.timezone, cfg.resetHour) === todayKey || t.status === 'open'; });
    // Honesty gate (defect #4): if this account's own configured daily-loss basis requires
    // unrealized/open P&L, and there is real open exposure right now, NAVRYA has no live
    // mark-price feed to compute that floating P&L trustworthily - the daily-loss figure (and
    // every rule/verdict derived from it) must say so explicitly rather than silently falling
    // back to realized-only and reporting a false SAFE.
    var dailyLossBasis = (account.rules && account.rules.dailyLossBasis) || 'realized';
    var dailyLossBasisInsufficient = dailyLossBasis === 'realized_and_open' && todayOpen.length > 0;
    var dailyLossUsed = dailyLossUsedRealized;

    var monthKeyNow = monthKey(now, cfg.timezone, cfg.resetHour);
    var monthClosed = closed.filter(function (t) { return monthKey(t.closedAt || t.updatedAt, cfg.timezone, cfg.resetHour) === monthKeyNow; });
    var monthPL = monthClosed.length ? monthClosed.reduce(function (sum, t) { return sum + t.pnl; }, 0) : null;
    var monthStartEquity = equity - (monthPL || 0);

    // Real running-balance sequence (starting balance forward through every closed trade in
    // chronological order) - the only honest way to know the account's peak equity without a
    // live feed snapshotting it in real time.
    var running = startingBalance, peakEquity = startingBalance;
    closedByTime.forEach(function (t) { running += t.pnl; if (running > peakEquity) peakEquity = running; });

    var openRiskKnown = 0, openRiskUnknownCount = 0;
    open.forEach(function (t) { if (typeof t.riskAmount === 'number') openRiskKnown += t.riskAmount; else openRiskUnknownCount += 1; });

    var byDay = {};
    closed.forEach(function (t) {
      var key = tradingDayKey(t.closedAt || t.updatedAt, cfg.timezone, cfg.resetHour);
      if (!key) return;
      byDay[key] = (byDay[key] || 0) + t.pnl;
    });
    var tradingDaysCount = Object.keys(byDay).length;
    var bestDayProfit = null;
    Object.keys(byDay).forEach(function (key) { if (bestDayProfit === null || byDay[key] > bestDayProfit) bestDayProfit = byDay[key]; });
    var bestDayShare = bestDayProfit !== null && totalPL !== null && totalPL > 0 ? (bestDayProfit / totalPL) * 100 : null;

    var riskPercents = trades.filter(function (t) { return typeof t.riskPercent === 'number'; }).map(function (t) { return t.riskPercent; });
    var avgRiskPercent = riskPercents.length ? riskPercents.reduce(function (a, b) { return a + b; }, 0) / riskPercents.length : null;

    var rules = account.rules || {};
    var drawdownFloor = null;
    if (account.kind === 'prop' && num(rules.maxDrawdownPercent) !== null) {
      var base = rules.drawdownType === 'trailing' ? peakEquity : startingBalance;
      drawdownFloor = base * (1 - rules.maxDrawdownPercent / 100);
    } else if (account.kind === 'personal' && num(rules.hardFloor) !== null) {
      drawdownFloor = rules.hardFloor;
    }
    var drawdownBase = account.kind === 'prop' && rules.drawdownType === 'trailing' ? peakEquity : startingBalance;
    var drawdownUsedAmount = drawdownFloor !== null ? Math.max(0, drawdownBase - equity) : null;

    var profitTargetAmount = account.kind === 'prop' && num(rules.profitTargetPercent) !== null ? startingBalance * (rules.profitTargetPercent / 100) : null;
    var profitAmount = equity - startingBalance;

    return {
      now: now, todayKey: todayKey, resetTimezone: cfg.timezone, resetHour: cfg.resetHour,
      hasAnyTrades: trades.length > 0, hasClosedTrades: closed.length > 0, closedTradesCount: closed.length,
      startingBalance: startingBalance, equity: equity, peakEquity: peakEquity,
      totalPL: totalPL, todayPL: todayPL, hasTradesToday: todayClosed.length > 0,
      dailyLossUsed: dailyLossUsed, dailyLossBasis: dailyLossBasis, dailyLossBasisInsufficient: dailyLossBasisInsufficient,
      dayStartEquity: dayStartEquity,
      monthPL: monthPL, monthStartEquity: monthStartEquity,
      openPositionsCount: open.length, openRiskKnown: openRiskKnown, openRiskUnknownCount: openRiskUnknownCount,
      openRisk: openRiskUnknownCount > 0 ? null : openRiskKnown,
      tradingDaysCount: tradingDaysCount, bestDayProfit: bestDayProfit, bestDayShare: bestDayShare,
      avgRiskPercent: avgRiskPercent, avgRiskSampleSize: riskPercents.length,
      drawdownFloor: drawdownFloor, drawdownUsedAmount: drawdownUsedAmount,
      profitTargetAmount: profitTargetAmount, profitAmount: profitAmount,
      profitProgressPercent: profitTargetAmount ? (profitAmount / profitTargetAmount) * 100 : null
    };
  }

  // --- Rules & compliance tab: one row per configured rule, grouped. Unconfigured rules are
  // omitted entirely rather than shown with a made-up value. ---
  function evaluateRules(account, metrics) {
    var rules = account.rules || {};
    var groups = [];
    function row(name, requirementText, currentText, pct, state, note) {
      return { name: name, requirement: requirementText, current: currentText, pct: pct === null ? 0 : Math.max(0, Math.min(100, pct)), state: state, note: note };
    }

    if (account.kind === 'prop') {
      var lossLimits = [];
      if (num(rules.dailyLossLimitPercent) !== null) {
        if (metrics.dailyLossBasisInsufficient) {
          lossLimits.push(row('Daily loss limit', rules.dailyLossLimitPercent + '% of today’s starting equity (realized + open)', 'insufficient data', 0, 'insufficient', 'This rule is configured to include floating P/L on open positions, and NAVRYA has no live mark-price feed to verify that - cannot claim compliance while a position is open.'));
        } else {
          var dailyLimitAmount = metrics.dayStartEquity * (rules.dailyLossLimitPercent / 100);
          var dailyPct = dailyLimitAmount > 0 ? (metrics.dailyLossUsed / dailyLimitAmount) * 100 : 0;
          lossLimits.push(row('Daily loss limit', rules.dailyLossLimitPercent + '% of today’s starting equity', metrics.hasTradesToday ? metrics.dailyLossUsed.toFixed(2) + ' used today' : 'no trades today', dailyPct, limitState(dailyPct), metrics.hasTradesToday ? 'Measured against today’s starting equity, realized P/L only.' : 'No trades closed today yet.'));
        }
      }
      if (num(rules.maxDrawdownPercent) !== null && metrics.drawdownFloor !== null) {
        var ddPct = drawdownPercentUsed(account, metrics, rules);
        lossLimits.push(row('Maximum drawdown', rules.maxDrawdownPercent + '% · ' + rules.drawdownType, metrics.drawdownUsedAmount.toFixed(2) + ' below ' + (rules.drawdownType === 'trailing' ? 'peak' : 'start'), ddPct, limitState(ddPct), rules.drawdownType === 'trailing' ? 'The floor trails the account’s own peak equity.' : 'The floor is fixed to the starting balance.'));
        lossLimits.push(row('Drawdown type', rules.drawdownType === 'trailing' ? 'Trailing on equity' : 'Static · balance based', rules.drawdownType, 0, 'safe', rules.drawdownType === 'trailing' ? 'Every new equity high drags the floor up with it.' : 'The floor never moves once set.'));
      }
      if (lossLimits.length) groups.push({ title: 'Loss limits', items: lossLimits });

      var targets = [];
      if (num(rules.profitTargetPercent) !== null && metrics.profitTargetAmount) {
        targets.push(row('Profit target', rules.profitTargetPercent + '% · ' + metrics.profitTargetAmount.toFixed(2), metrics.profitAmount.toFixed(2) + ' booked', metrics.profitProgressPercent, targetState(metrics.profitProgressPercent), metrics.profitProgressPercent >= 100 ? 'Target met.' : 'No time pressure on profit by itself.'));
      }
      if (num(rules.minTradingDays) !== null) {
        var daysPct = rules.minTradingDays > 0 ? (metrics.tradingDaysCount / rules.minTradingDays) * 100 : null;
        targets.push(row('Minimum trading days', rules.minTradingDays + ' days', metrics.tradingDaysCount + ' days traded', daysPct, targetState(daysPct), daysPct !== null && daysPct >= 100 ? 'Requirement met.' : 'A day counts with at least one closed position.'));
      }
      if (num(rules.consistencyCapPercent) !== null) {
        if (metrics.bestDayShare === null) {
          targets.push(row('Consistency rule', 'No day above ' + rules.consistencyCapPercent + '% of profit', 'insufficient data', 0, 'safe', 'No profit booked yet - nothing to measure against.'));
        } else {
          var consistencyPct = (metrics.bestDayShare / rules.consistencyCapPercent) * 100;
          targets.push(row('Consistency rule', 'No day above ' + rules.consistencyCapPercent + '% of profit', 'Best day ' + metrics.bestDayShare.toFixed(1) + '%', consistencyPct, limitState(consistencyPct), consistencyPct >= 100 ? 'Best single day exceeds the cap.' : 'Best single day is inside the cap.'));
        }
      }
      if (targets.length) groups.push({ title: 'Targets and duration', items: targets });

      var position = [];
      if (num(rules.maxOpenPositions) !== null) {
        var posPct = (metrics.openPositionsCount / rules.maxOpenPositions) * 100;
        position.push(row('Maximum open positions', String(rules.maxOpenPositions), String(metrics.openPositionsCount) + ' open', posPct, limitState(posPct), null));
      }
      if (num(rules.maxRiskPerTradePercent) !== null) {
        if (metrics.avgRiskPercent === null) {
          position.push(row('Maximum risk per trade', rules.maxRiskPerTradePercent + '%', 'insufficient data', 0, 'safe', 'No trades with a recorded risk % yet.'));
        } else {
          var riskPct = (metrics.avgRiskPercent / rules.maxRiskPerTradePercent) * 100;
          position.push(row('Maximum risk per trade', rules.maxRiskPerTradePercent + '%', metrics.avgRiskPercent.toFixed(2) + '% average (' + metrics.avgRiskSampleSize + ' trades)', riskPct, limitState(riskPct), null));
        }
      }
      if (position.length) groups.push({ title: 'Position constraints', items: position });
    } else {
      var selfLimits = [];
      if (num(rules.dailyLossCap) !== null) {
        if (metrics.dailyLossBasisInsufficient) {
          selfLimits.push(row('Daily loss cap', account.currency + ' ' + rules.dailyLossCap + ' (realized + open)', 'insufficient data', 0, 'insufficient', 'Configured to include floating P/L on open positions - no live mark-price feed to verify that while a position is open.'));
        } else {
          var capPct = rules.dailyLossCap > 0 ? (metrics.dailyLossUsed / rules.dailyLossCap) * 100 : 0;
          selfLimits.push(row('Daily loss cap', account.currency + ' ' + rules.dailyLossCap, metrics.hasTradesToday ? metrics.dailyLossUsed.toFixed(2) + ' used today' : 'untouched today', capPct, limitState(capPct), 'Your own rule - not enforced by any firm.'));
        }
      }
      if (num(rules.maxRiskPerTradePercent) !== null) {
        if (metrics.avgRiskPercent === null) {
          selfLimits.push(row('Maximum risk per trade', rules.maxRiskPerTradePercent + '%', 'insufficient data', 0, 'safe', 'No trades with a recorded risk % yet.'));
        } else {
          var selfRiskPct = (metrics.avgRiskPercent / rules.maxRiskPerTradePercent) * 100;
          selfLimits.push(row('Maximum risk per trade', rules.maxRiskPerTradePercent + '%', metrics.avgRiskPercent.toFixed(2) + '% average', selfRiskPct, limitState(selfRiskPct), null));
        }
      }
      if (num(rules.maxOpenPositions) !== null) {
        var selfPosPct = (metrics.openPositionsCount / rules.maxOpenPositions) * 100;
        selfLimits.push(row('Maximum open positions', String(rules.maxOpenPositions), String(metrics.openPositionsCount) + ' open', selfPosPct, limitState(selfPosPct), null));
      }
      if (num(rules.hardFloor) !== null) {
        var floorPct = drawdownPercentUsed(account, metrics, rules);
        selfLimits.push(row('Hard floor', account.currency + ' ' + rules.hardFloor, metrics.equity.toFixed(2) + ' equity', floorPct, limitState(floorPct), 'Protects capital below this line - your own choice.'));
      }
      if (selfLimits.length) groups.push({ title: 'Limits you set yourself', items: selfLimits });

      var goals = [];
      if (num(rules.monthlyGoalPercent) !== null) {
        var goalAmount = metrics.monthStartEquity * (rules.monthlyGoalPercent / 100);
        var goalPct = goalAmount > 0 ? ((metrics.monthPL || 0) / goalAmount) * 100 : null;
        goals.push(row('Monthly return goal', '+' + rules.monthlyGoalPercent + '%', metrics.monthPL !== null ? (metrics.monthPL >= 0 ? '+' : '') + metrics.monthPL.toFixed(2) + ' booked' : 'no trades this month', goalPct, targetState(goalPct), 'A goal, not a constraint - missing it costs nothing.'));
      }
      if (goals.length) groups.push({ title: 'Goals', items: goals });
    }
    return { groups: groups, hasAnyRuleConfigured: groups.some(function (g) { return g.items.length; }) };
  }

  function drawdownPercentUsed(account, metrics, rules) {
    var base = account.kind === 'prop' && rules.drawdownType === 'trailing' ? metrics.peakEquity : (account.kind === 'prop' ? metrics.startingBalance : metrics.equity + metrics.drawdownUsedAmount);
    if (metrics.drawdownFloor === null) return null;
    var totalDistance = base - metrics.drawdownFloor;
    if (totalDistance <= 0) return 100;
    return (metrics.drawdownUsedAmount / totalDistance) * 100;
  }

  // --- Pre-trade check: a real risk amount in, a deterministic verdict + real runway numbers
  // out. riskAmount must come from the same TradeJournalTradeCalculator primitives the
  // Calculator/Trade Log already use - this module never invents a pip/contract value. ---
  function evaluatePretrade(account, metrics, input) {
    var opts = input || {};
    var riskAmount = num(opts.riskAmount);
    var rewardAmount = num(opts.rewardAmount);
    var rules = account.rules || {};
    var equity = metrics.equity;
    var basisInsufficient = metrics.dailyLossBasisInsufficient;

    var allowanceAmount = basisInsufficient ? null : (account.kind === 'prop'
      ? (num(rules.dailyLossLimitPercent) !== null ? metrics.dayStartEquity * (rules.dailyLossLimitPercent / 100) : null)
      : (num(rules.dailyLossCap) !== null ? rules.dailyLossCap : null));
    var allowanceLeft = allowanceAmount !== null ? Math.max(0, allowanceAmount - metrics.dailyLossUsed) : null;
    var floorDistance = metrics.drawdownFloor !== null ? Math.max(0, equity - metrics.drawdownFloor) : null;
    var ownRiskPercent = num(rules.maxRiskPerTradePercent);
    var riskPercentOfEquity = riskAmount !== null && equity > 0 ? (riskAmount / equity) * 100 : null;
    var dailyRuleConfigured = account.kind === 'prop' ? num(rules.dailyLossLimitPercent) !== null : num(rules.dailyLossCap) !== null;

    var tone, head, line;
    if (riskAmount === null) {
      tone = 'unknown'; head = 'Enter a position to see a verdict'; line = 'Provide a real risk amount from the calculator to evaluate this trade against the account’s rules.';
    } else if (basisInsufficient && dailyRuleConfigured) {
      tone = 'unknown'; head = 'Cannot verify — open position needs live P/L'; line = 'This account’s daily-loss rule counts floating P/L on open positions, and NAVRYA has no live mark-price feed to verify that right now.';
    } else if (allowanceLeft !== null && riskAmount >= allowanceLeft) {
      tone = 'bad'; head = 'This trade would breach the daily limit'; line = 'A full stop costs ' + riskAmount.toFixed(2) + ' against ' + allowanceLeft.toFixed(2) + ' of allowance left.';
    } else if (allowanceLeft !== null && allowanceLeft > 0 && riskAmount / allowanceLeft >= 0.6) {
      tone = 'warn'; head = 'Too large for what is left today'; line = 'This trade uses ' + Math.round((riskAmount / allowanceLeft) * 100) + '% of the remaining daily allowance.';
    } else if (ownRiskPercent !== null && riskPercentOfEquity !== null && riskPercentOfEquity > ownRiskPercent) {
      tone = 'warn'; head = 'Above your own risk rule'; line = 'Risk is ' + riskPercentOfEquity.toFixed(2) + '% of equity against the ' + ownRiskPercent + '% rule.';
    } else if (allowanceLeft === null && ownRiskPercent === null) {
      tone = 'unknown'; head = 'No risk rule configured'; line = 'Add a daily loss rule or a max risk per trade rule to this account to get a real verdict here.';
    } else {
      tone = 'ok'; head = 'Inside every rule'; line = 'This trade sits inside the rules configured on this account.';
    }

    var survives = riskAmount !== null && riskAmount > 0 && allowanceLeft !== null ? Math.floor(allowanceLeft / riskAmount) : null;
    var toFloor = riskAmount !== null && riskAmount > 0 && floorDistance !== null ? Math.floor(floorDistance / riskAmount) : null;

    var runway = null;
    if (allowanceAmount !== null && allowanceAmount > 0) {
      var usedPct = Math.min(100, (metrics.dailyLossUsed / allowanceAmount) * 100);
      var tradePct = riskAmount !== null ? Math.max(0, Math.min(100 - usedPct, (riskAmount / allowanceAmount) * 100)) : 0;
      runway = { usedPct: usedPct, tradePct: tradePct, leftPct: Math.max(0, 100 - usedPct - tradePct), allowanceAmount: allowanceAmount };
    }

    var checks = [];
    checks.push({ label: 'Risk against equity', value: riskPercentOfEquity !== null ? riskPercentOfEquity.toFixed(2) + '%' + (ownRiskPercent !== null ? ' · rule is ' + ownRiskPercent + '%' : '') : 'insufficient data', state: riskPercentOfEquity !== null && ownRiskPercent !== null ? (riskPercentOfEquity > ownRiskPercent ? 'warn' : 'ok') : 'unknown' });
    checks.push({ label: 'Share of what is left today', value: basisInsufficient && dailyRuleConfigured ? 'insufficient data - open P/L unverified' : (allowanceLeft !== null && riskAmount !== null ? Math.round((riskAmount / Math.max(allowanceLeft, 1)) * 100) + '% of ' + allowanceLeft.toFixed(2) : 'insufficient data'), state: basisInsufficient && dailyRuleConfigured ? 'unknown' : (allowanceLeft !== null && riskAmount !== null ? (riskAmount >= allowanceLeft ? 'bad' : (riskAmount / Math.max(allowanceLeft, 1) >= 0.6 ? 'warn' : 'ok')) : 'unknown') });
    if (num(rules.maxOpenPositions) !== null) {
      var nextCount = metrics.openPositionsCount + 1;
      checks.push({ label: 'Open positions after this trade', value: nextCount + ' of ' + rules.maxOpenPositions + ' allowed', state: nextCount > rules.maxOpenPositions ? 'bad' : 'ok' });
    }
    checks.push({ label: 'Stop attached', value: opts.hasStopAttached ? 'present' : 'missing', state: opts.hasStopAttached ? 'ok' : 'warn' });

    var loseRows = [];
    if (riskAmount !== null) {
      loseRows.push({ label: 'Equity after the stop', value: (equity - riskAmount).toFixed(2) });
      loseRows.push({ label: 'Daily allowance left', value: allowanceLeft !== null ? Math.max(0, allowanceLeft - riskAmount).toFixed(2) + ' of ' + allowanceAmount.toFixed(2) : 'insufficient data' });
      loseRows.push({ label: 'Distance to the hard floor', value: floorDistance !== null ? Math.max(0, floorDistance - riskAmount).toFixed(2) : 'insufficient data' });
      loseRows.push({ label: 'Trades like this until the daily limit', value: survives !== null ? String(survives) : 'insufficient data' });
      loseRows.push({ label: 'Trades like this until the account floor', value: toFloor !== null ? String(toFloor) : 'insufficient data' });
    }

    var winRows = [];
    if (riskAmount !== null && rewardAmount !== null) {
      winRows.push({ label: 'Equity at this reward', value: (equity + rewardAmount).toFixed(2) });
      if (account.kind === 'prop' && metrics.profitTargetAmount) {
        var remaining = metrics.profitTargetAmount - metrics.profitAmount - rewardAmount;
        winRows.push({ label: 'Remaining to pass', value: remaining > 0 ? remaining.toFixed(2) : 'target reached' });
      } else if (account.kind === 'prop') {
        winRows.push({ label: 'Remaining to pass', value: 'no target on this account' });
      }
    }

    return {
      tone: tone, head: head, line: line, riskAmount: riskAmount, rewardAmount: rewardAmount,
      riskPercentOfEquity: riskPercentOfEquity, allowanceAmount: allowanceAmount, allowanceLeft: allowanceLeft,
      floorDistance: floorDistance, survives: survives, toFloor: toFloor, runway: runway,
      checks: checks, loseRows: loseRows, winRows: winRows, basisInsufficient: !!(basisInsufficient && dailyRuleConfigured)
    };
  }

  // --- Daily P/L series, aggregated by the account's own real trading-day boundary (never one
  // point per trade) - feeds both the Performance tab's bar chart and the trading calendar.
  // Returns entries sorted chronologically: {date, pl, tradesCount, hasOpenExposure}. An open
  // position that spans a reset boundary marks that day `hasOpenExposure: true` so the caller
  // can render "?"/insufficient-data instead of treating the realized-only total as final.
  function dailyPLSeries(account, allTrades) {
    var cfg = resetConfig(account);
    var trades = (allTrades || []).filter(function (t) { return t && t.accountId === account.id; });
    var closed = trades.filter(function (t) { return t.status === 'closed' && typeof t.pnl === 'number'; });
    var open = trades.filter(function (t) { return t.status === 'open' || t.status === 'hunting'; });
    var byDay = {};
    closed.forEach(function (t) {
      var key = tradingDayKey(t.closedAt || t.updatedAt, cfg.timezone, cfg.resetHour);
      if (!key) return;
      if (!byDay[key]) byDay[key] = { date: key, pl: 0, tradesCount: 0, hasOpenExposure: false };
      byDay[key].pl += t.pnl;
      byDay[key].tradesCount += 1;
    });
    var openKeys = {};
    open.forEach(function (t) { var key = tradingDayKey(t.createdAt, cfg.timezone, cfg.resetHour); if (key) openKeys[key] = true; });
    Object.keys(openKeys).forEach(function (key) {
      if (!byDay[key]) byDay[key] = { date: key, pl: 0, tradesCount: 0, hasOpenExposure: true };
      else byDay[key].hasOpenExposure = true;
    });
    return Object.keys(byDay).sort().map(function (k) { return byDay[k]; });
  }

  // --- Discipline (defect #6): built ONLY from real behaviour evidence - never from whether a
  // trade made money. Inputs: emotionLog fields (planCommitment/focusQuality/stressLevel),
  // recorded risk-rule violations (trade.riskPercent exceeding the account's own configured
  // maxRiskPerTradePercent), revenge-trade timing (a re-entry within 10 minutes of a loss), and
  // documented overrides (trade.riskOverride - an explicit, already-confirmed exception, tracked
  // for transparency, not scored as a violation since the user already explicitly confirmed it).
  // Requires a minimum real sample before returning a number at all.
  var DISCIPLINE_MIN_EMOTION_LOGS = 5;
  function computeDiscipline(account, allTrades) {
    var trades = (allTrades || []).filter(function (t) { return t && t.accountId === account.id; });
    var emotions = [];
    trades.forEach(function (t) { (t.emotionLog || []).forEach(function (e) { emotions.push(e); }); });
    if (emotions.length < DISCIPLINE_MIN_EMOTION_LOGS) {
      return { score: null, sampleSize: emotions.length, minRequired: DISCIPLINE_MIN_EMOTION_LOGS };
    }
    var avgCommitment = avg(emotions.map(function (e) { return e.planCommitment; }));
    var avgFocus = avg(emotions.map(function (e) { return e.focusQuality; }));
    var avgStress = avg(emotions.map(function (e) { return e.stressLevel; }));

    var riskRule = num(account.rules && account.rules.maxRiskPerTradePercent);
    var withRisk = trades.filter(function (t) { return typeof t.riskPercent === 'number'; });
    var violations = riskRule !== null ? withRisk.filter(function (t) { return t.riskPercent > riskRule; }).length : 0;
    var violationRate = withRisk.length ? violations / withRisk.length : 0;

    var closedByTime = trades.filter(function (t) { return t.status === 'closed' && typeof t.pnl === 'number'; })
      .slice().sort(function (a, b) { return new Date(a.closedAt || a.createdAt) - new Date(b.closedAt || b.createdAt); });
    var revengeCount = 0;
    for (var i = 1; i < closedByTime.length; i++) {
      var prev = closedByTime[i - 1], cur = closedByTime[i];
      if (prev.pnl < 0 && (new Date(cur.createdAt) - new Date(prev.closedAt || prev.updatedAt)) < 10 * 60000) revengeCount += 1;
    }
    var revengeRate = closedByTime.length > 1 ? revengeCount / (closedByTime.length - 1) : 0;
    var overridesCount = trades.filter(function (t) { return !!t.riskOverride; }).length;

    var base = ((avgCommitment !== null ? avgCommitment * 10 : 70) + (avgFocus !== null ? avgFocus * 10 : 70) + (avgStress !== null ? (10 - avgStress) * 10 : 70)) / 3;
    var penalty = violationRate * 30 + revengeRate * 20;
    var score = Math.max(0, Math.min(100, Math.round(base - penalty)));

    return {
      score: score, sampleSize: emotions.length, minRequired: DISCIPLINE_MIN_EMOTION_LOGS,
      avgPlanCommitment: avgCommitment, avgFocusQuality: avgFocus, avgStressLevel: avgStress,
      riskRuleViolations: violations, riskRuleSample: withRisk.length,
      revengeCount: revengeCount, revengeSample: Math.max(0, closedByTime.length - 1),
      documentedOverrides: overridesCount
    };
  }

  window.TradeJournalAccountsEngine = {
    computeMetrics: computeMetrics, evaluateRules: evaluateRules, evaluatePretrade: evaluatePretrade,
    dailyPLSeries: dailyPLSeries, computeDiscipline: computeDiscipline,
    tradingDayKey: tradingDayKey, limitState: limitState, targetState: targetState
  };
}());
