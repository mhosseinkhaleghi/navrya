(function () {
  'use strict';
  var tradeStore = window.TradeJournalTradeStore;
  var mhStore = window.TradeJournalMentalHealthStore;
  if (!tradeStore || !mhStore) return;

  var COMPLIANCE_KEY = 'tradejournal:mental-health-compliance:v1';
  var STALE_MS = 60 * 60 * 1000;

  function lastEmotion(trade) { var log = trade.emotionLog || []; return log.length ? log[log.length - 1] : null; }
  function mean(values) { return values.length ? values.reduce(function (s, v) { return s + v; }, 0) / values.length : 0; }
  function stdev(values) { if (values.length < 2) return 0; var m = mean(values); return Math.sqrt(mean(values.map(function (v) { return (v - m) * (v - m); }))); }
  function clampInt(value, min, max) { return Math.min(max, Math.max(min, Math.round(Number(value) || min))); }
  function dayKey(value) { var d = new Date(value); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  function allEmotionEntries(trades) {
    var out = [];
    trades.forEach(function (t) { (t.emotionLog || []).forEach(function (e) { out.push(Object.assign({}, e, { tradeId: t.id })); }); });
    return out;
  }

  function detectHighStressTriggers(entries) {
    var highStress = entries.filter(function (e) { return Number(e.stressLevel) >= 8; });
    if (highStress.length < 3) return [];
    var ids = Array.from(new Set(highStress.map(function (e) { return e.tradeId; })));
    return [{ pattern: 'high_stress', confidence: Math.min(0.95, 0.35 + highStress.length * 0.08), supportingTradeIds: ids }];
  }

  function computeEmotionalProfile(trades, now) {
    var thirtyAgo = now.getTime() - 30 * 86400000, fifteenAgo = now.getTime() - 15 * 86400000;
    // Uses every logged emotion entry (entry/mid_trade/exit across every trade), not just one per trade,
    // so the trend and averages genuinely reflect the full emotion log rather than a single snapshot.
    var recent = allEmotionEntries(trades).filter(function (e) { return new Date(e.timestamp).getTime() >= thirtyAgo; });
    var stressValues = recent.map(function (e) { return Number(e.stressLevel); }).filter(function (v) { return Number.isFinite(v); });
    var emotionCounts = {};
    recent.forEach(function (e) { (e.dominantEmotions || []).forEach(function (name) { emotionCounts[name] = (emotionCounts[name] || 0) + 1; }); });
    var negative = ['revenge', 'angry', 'afraid', 'anxious', 'fatigued', 'restless', 'overconfident'], positive = ['calm', 'confident', 'excited'];
    function topNames(list) { return Object.keys(emotionCounts).filter(function (n) { return list.indexOf(n) > -1; }).sort(function (a, b) { return emotionCounts[b] - emotionCounts[a]; }).slice(0, 3); }
    function halfAvg(before) {
      var half = recent.filter(function (e) { var time = new Date(e.timestamp).getTime(); return before ? time < fifteenAgo : time >= fifteenAgo; });
      var values = half.map(function (e) { return Number(e.stressLevel); }).filter(function (v) { return Number.isFinite(v); });
      return { avg: mean(values), count: half.length };
    }
    var firstHalf = halfAvg(true), secondHalf = halfAvg(false), trend = 'stable';
    if (firstHalf.count && secondHalf.count) {
      if (secondHalf.avg < firstHalf.avg - 0.5) trend = 'improving';
      else if (secondHalf.avg > firstHalf.avg + 0.5) trend = 'worsening';
    }
    return {
      dominantNegativeEmotions: topNames(negative), dominantPositiveEmotions: topNames(positive),
      emotionalVolatilityScore: Math.round(stdev(stressValues) * 100) / 100,
      averageStressLevel: Math.round(mean(stressValues) * 100) / 100,
      stressTrend: trend
    };
  }

  function complianceTally() { try { return Object.assign({ cooldownOffered: 0, cooldownDismissed: 0, cooldownOfferedIds: [] }, JSON.parse(localStorage.getItem(COMPLIANCE_KEY) || '{}')); } catch (_) { return { cooldownOffered: 0, cooldownDismissed: 0, cooldownOfferedIds: [] }; } }
  function saveTally(tally) { localStorage.setItem(COMPLIANCE_KEY, JSON.stringify(tally)); }
  function noteCooldownOffered(tradeId) { var tally = complianceTally(); if (tally.cooldownOfferedIds.indexOf(tradeId) > -1) return; tally.cooldownOfferedIds.push(tradeId); tally.cooldownOffered += 1; saveTally(tally); }
  function noteCooldownDismissed() { var tally = complianceTally(); tally.cooldownDismissed += 1; saveTally(tally); }
  function cooldownComplianceRate() { var tally = complianceTally(); return tally.cooldownOffered ? Math.round((1 - tally.cooldownDismissed / tally.cooldownOffered) * 1000) / 10 : 0; }

  function computeBehavioralPatterns(trades, closedSorted) {
    var revengeTradeIds = [];
    for (var i = 1; i < closedSorted.length; i++) {
      var prev = closedSorted[i - 1], cur = closedSorted[i], entry = lastEmotion(cur);
      if (!entry) continue;
      var minutesSince = (new Date(cur.createdAt) - new Date(prev.closedAt)) / 60000;
      if (prev.outcome === 'loss' && minutesSince >= 0 && minutesSince <= 30 && (entry.dominantEmotions || []).some(function (n) { return n === 'revenge' || n === 'angry'; })) revengeTradeIds.push(cur.id);
    }
    var byDay = {};
    trades.forEach(function (t) { if (!t.createdAt) return; var key = dayKey(t.createdAt); (byDay[key] = byDay[key] || []).push(t); });
    var overtradingTradeIds = [];
    Object.keys(byDay).forEach(function (key) { if (byDay[key].length > 5) overtradingTradeIds = overtradingTradeIds.concat(byDay[key].map(function (t) { return t.id; })); });
    var withEmotion = closedSorted.map(lastEmotion).filter(Boolean);
    var planDeviationRate = withEmotion.length ? withEmotion.filter(function (e) { return Number(e.planCommitment) < 5; }).length / withEmotion.length * 100 : 0;
    return {
      metrics: {
        revengeTradingFrequency: revengeTradeIds.length,
        overTradingEpisodes: Object.keys(byDay).filter(function (key) { return byDay[key].length > 5; }).length,
        planDeviationRate: Math.round(planDeviationRate * 10) / 10,
        cooldownComplianceRate: cooldownComplianceRate(),
        preChecklistCompletionRate: 0
      },
      revengeTradeIds: revengeTradeIds, overtradingTradeIds: overtradingTradeIds
    };
  }

  function makeTrigger(pattern, tradeList, confidence) { return { pattern: pattern, confidence: Math.min(0.95, confidence), supportingTradeIds: tradeList.map(function (t) { return t.id; }) }; }

  function detectLossStreakTriggers(closedSorted) {
    var triggers = [], run = [];
    closedSorted.forEach(function (t) {
      if (t.outcome === 'loss') { run.push(t); return; }
      if (run.length >= 3) triggers.push(makeTrigger('loss_streak', run, 0.3 + run.length * 0.12));
      run = [];
    });
    if (run.length >= 3) triggers.push(makeTrigger('loss_streak', run, 0.3 + run.length * 0.12));
    return triggers;
  }

  function detectTimeOfDayTriggers(closed) {
    var buckets = {};
    closed.forEach(function (t) { var hour = new Date(t.createdAt).getHours(); (buckets[hour] = buckets[hour] || []).push(t); });
    var overallRate = closed.length ? closed.filter(function (t) { return t.outcome === 'win'; }).length / closed.length : 0;
    var triggers = [];
    Object.keys(buckets).forEach(function (hour) {
      var list = buckets[hour];
      if (list.length < 5) return;
      var rate = list.filter(function (t) { return t.outcome === 'win'; }).length / list.length;
      if (overallRate - rate >= 0.2) triggers.push(makeTrigger('time_of_day:' + hour, list, 0.4 + (overallRate - rate)));
    });
    return triggers;
  }

  function detectGapAfterLossTriggers(closedSorted) {
    var quick = [];
    for (var i = 1; i < closedSorted.length; i++) {
      var prev = closedSorted[i - 1], cur = closedSorted[i];
      if (prev.outcome !== 'loss') continue;
      var minutes = (new Date(cur.createdAt) - new Date(prev.closedAt)) / 60000;
      if (minutes >= 0 && minutes <= 15) quick.push(cur);
    }
    if (quick.length < 3) return [];
    var lossShare = quick.filter(function (t) { return t.outcome === 'loss'; }).length / quick.length;
    if (lossShare < 0.5) return [];
    return [makeTrigger('gap_since_last_trade', quick, 0.35 + quick.length * 0.08)];
  }

  // Only the two biases with a genuine objective proxy in today's data get a computed number; every
  // other entry in the checklist stays null rather than presenting an invented indicator as real signal.
  function computeBiasIndicators(profile) {
    var overTradingEpisodes = profile.behavioralPatterns.overTradingEpisodes || 0;
    var lossStreakCount = (profile.triggerProfile.autoDetectedTriggers || []).filter(function (t) { return t.pattern === 'loss_streak'; }).length;
    return {
      overconfidence: overTradingEpisodes > 0 ? Math.min(10, overTradingEpisodes * 2) : null,
      gambler_fallacy: lossStreakCount > 0 ? Math.min(10, lossStreakCount * 3) : null
    };
  }

  function detectRedFlags(profile) {
    var flags = [];
    var transparency = profile.intake.transparencyMatrix;
    if (transparency.lossKnownToFamily === false) flags.push({ type: 'hiding_losses', evidence: 'transparency_matrix:loss_not_known_to_family' });
    if (profile.intake.financialContext.borrowedMoneyForTrading === true) flags.push({ type: 'borrowed_money', evidence: 'intake:borrowed_money_for_trading' });
    if (profile.behavioralPatterns.revengeTradingFrequency >= 3) flags.push({ type: 'escalating_revenge_trading', evidence: 'revenge_trading_frequency:' + profile.behavioralPatterns.revengeTradingFrequency });
    var identityBias = (profile.psychologicalProfile.biasChecklist.biases || []).find(function (b) { return b.type === 'identity_outcome_fusion'; });
    var scenarioE = (profile.psychologicalProfile.scenarioAssessment.responses || []).find(function (r) { return r.scenarioId === 'E_identity'; });
    if (identityBias && identityBias.selfRating >= 4 && scenarioE && /fused|not_made_for_trading/.test(scenarioE.choice || '')) {
      flags.push({ type: 'identity_outcome_fusion', evidence: 'self_rating:' + identityBias.selfRating + '+scenario_E:' + scenarioE.choice });
    }
    return flags;
  }

  function computeWeeklyScore(profile, closed, now) {
    var weekAgo = now.getTime() - 7 * 86400000;
    var weekTrades = closed.filter(function (t) { return new Date(t.closedAt || t.createdAt).getTime() >= weekAgo; });
    if (!weekTrades.length) return { score: profile.healthReportCache.weeklyScore || 0, explanation: null };
    var withEmotion = weekTrades.map(lastEmotion).filter(Boolean);
    var avgCommitment = withEmotion.length ? mean(withEmotion.map(function (e) { return Number(e.planCommitment); })) : 5;
    var avgStress = withEmotion.length ? mean(withEmotion.map(function (e) { return Number(e.stressLevel); })) : 5;
    var winRate = weekTrades.filter(function (t) { return t.outcome === 'win'; }).length / weekTrades.length * 100;
    var commitmentScore = avgCommitment / 10 * 100, calmScore = (10 - avgStress) / 10 * 100;
    var score = Math.max(0, Math.min(100, Math.round(commitmentScore * 0.45 + calmScore * 0.35 + Math.min(100, winRate) * 0.2)));
    var delta = score - (profile.healthReportCache.weeklyScore || score);
    return { score: score, explanation: { avgCommitment: avgCommitment, avgStress: avgStress, winRate: winRate, delta: delta } };
  }

  function recompute(now) {
    now = now || new Date();
    var trades = tradeStore.listSync();
    var closed = trades.filter(function (t) { return t.status === 'closed'; });
    var closedSorted = closed.slice().sort(function (a, b) { return new Date(a.closedAt) - new Date(b.closedAt); });
    var profile = mhStore.load();

    profile.emotionalProfile = Object.assign(profile.emotionalProfile, computeEmotionalProfile(trades, now));
    var behavioral = computeBehavioralPatterns(trades, closedSorted);
    profile.behavioralPatterns = Object.assign(profile.behavioralPatterns, behavioral.metrics);

    var byStress = {};
    closed.forEach(function (t) { var e = lastEmotion(t); if (!e) return; var key = String(clampInt(e.stressLevel, 1, 10)); (byStress[key] = byStress[key] || []).push(t); });
    var winRateByStressLevel = {};
    Object.keys(byStress).forEach(function (key) { var list = byStress[key]; winRateByStressLevel[key] = Math.round(list.filter(function (t) { return t.outcome === 'win'; }).length / list.length * 1000) / 10; });
    var psychStore = window.TradeJournalPsychologyStore;
    var mirror = psychStore ? psychStore.emotionalMirror(closed, 3) : [];
    var overallWinRate = closed.length ? closed.filter(function (t) { return t.outcome === 'win'; }).length / closed.length * 100 : 0;
    var correlations = mirror.filter(function (r) { return !r.insufficient; }).map(function (r) { return { emotion: r.emotion, winRateDelta: Math.round((r.winRate - overallWinRate) * 10) / 10, sampleSize: r.sampleSize }; });
    var weekly = computeWeeklyScore(profile, closed, now);
    profile.healthReportCache = Object.assign(profile.healthReportCache, { lastGeneratedAt: now.toISOString(), winRateByStressLevel: winRateByStressLevel, emotionOutcomeCorrelations: correlations, weeklyScore: weekly.score });

    profile.triggerProfile.autoDetectedTriggers = detectLossStreakTriggers(closedSorted).concat(detectTimeOfDayTriggers(closed)).concat(detectGapAfterLossTriggers(closedSorted)).concat(detectHighStressTriggers(allEmotionEntries(trades)));

    profile = mhStore.save(profile);

    // Bias linkage: only wired for the three signals with an unambiguous mapping onto a BiasType.
    // revengeTradeIds -> revenge_trading directly; overtrading days -> overconfidence (opening far more
    // trades than usual reflects overestimating one's edge); loss-streak evidence -> gambler_fallacy
    // (chasing a streak expecting it to turn). Other detected metrics are left as behavioral data only.
    if (behavioral.revengeTradeIds.length) profile = mhStore.ensureBias(profile, 'revenge_trading', behavioral.revengeTradeIds);
    if (behavioral.overtradingTradeIds.length) profile = mhStore.ensureBias(profile, 'overconfidence', behavioral.overtradingTradeIds);
    var lossStreakEvidence = profile.triggerProfile.autoDetectedTriggers.filter(function (t) { return t.pattern === 'loss_streak'; }).reduce(function (ids, t) { return ids.concat(t.supportingTradeIds); }, []);
    if (lossStreakEvidence.length) profile = mhStore.ensureBias(profile, 'gambler_fallacy', lossStreakEvidence);

    detectRedFlags(profile).forEach(function (flag) { profile = mhStore.addRedFlag(profile, flag.type, flag.evidence); });

    return { profile: profile, weeklyExplanation: weekly.explanation };
  }

  function ensureFresh(now) {
    now = now || new Date();
    var profile = mhStore.load();
    var last = profile.healthReportCache.lastGeneratedAt ? new Date(profile.healthReportCache.lastGeneratedAt).getTime() : 0;
    if (now.getTime() - last > STALE_MS) return recompute(now).profile;
    return profile;
  }

  function captureWeeklySnapshot(now) {
    now = now || new Date();
    var result = recompute(now), profile = result.profile;
    var closed = tradeStore.listSync().filter(function (t) { return t.status === 'closed'; });
    var weekAgo = now.getTime() - 7 * 86400000;
    var weekTrades = closed.filter(function (t) { return new Date(t.closedAt || t.createdAt).getTime() >= weekAgo; });
    var withEmotion = weekTrades.map(lastEmotion).filter(Boolean);
    var weekStart = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    profile.progressTracking.weeklySnapshots.push({
      weekStart: weekStart,
      avgStress: withEmotion.length ? mean(withEmotion.map(function (e) { return Number(e.stressLevel); })) : 0,
      planCommitmentAvg: withEmotion.length ? mean(withEmotion.map(function (e) { return Number(e.planCommitment); })) : 0,
      emotionalTradesCount: withEmotion.length,
      winRate: weekTrades.length ? weekTrades.filter(function (t) { return t.outcome === 'win'; }).length / weekTrades.length * 100 : 0,
      progressScore: profile.healthReportCache.weeklyScore
    });
    profile.progressTracking.overallProgressScore = profile.healthReportCache.weeklyScore;
    return mhStore.save(profile);
  }

  window.addEventListener('tradejournal:trades-changed', function () { recompute(); });

  window.TradeJournalMentalHealthCollector = {
    recompute: recompute, ensureFresh: ensureFresh, captureWeeklySnapshot: captureWeeklySnapshot,
    noteCooldownOffered: noteCooldownOffered, noteCooldownDismissed: noteCooldownDismissed,
    computeBiasIndicators: computeBiasIndicators, detectRedFlags: detectRedFlags
  };
}());
