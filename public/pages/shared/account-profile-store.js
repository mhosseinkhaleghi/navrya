(function () {
  'use strict';
  var switcher = window.TradeJournalDevUserSwitcher;

  function handle(response) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      if (!response.ok) {
        var error = new Error(body.error || 'PROFILE_REQUEST_FAILED');
        error.status = response.status; error.code = body.error;
        throw error;
      }
      return body;
    });
  }
  // Mirrors community-store.js's request() exactly: waits for a bootstrapped dev-mode identity
  // before attaching x-dev-user-id, same soft dependency on TradeJournalDevUserSwitcher.
  function request(method, path, body) {
    var ready = switcher ? switcher.ensureUser() : Promise.resolve();
    return ready.then(function () {
      var headers = { 'Content-Type': 'application/json' };
      if (switcher) headers['x-dev-user-id'] = switcher.currentUserId();
      return fetch(path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined }).then(handle);
    });
  }

  function getProfile() { return request('GET', '/api/users/me/profile'); }
  function updateProfile(patch) {
    return request('PATCH', '/api/users/me/profile', patch).then(function (profile) {
      if (profile.displayName && profile.avatarDataUrl) {
        award(ONBOARDING_SENT_KEY, 'once:profile_completed', 'profile_completed', {}, null, null);
      }
      return profile;
    });
  }
  function getXpEvents() { return request('GET', '/api/users/me/xp-events'); }
  function getMastery() { return request('GET', '/api/users/me/mastery'); }
  function getAchievements() { return request('GET', '/api/users/me/achievements'); }
  function unlockAchievement(key, evidence) { return request('POST', '/api/users/me/achievements/' + encodeURIComponent(key) + '/unlock', { evidence: evidence }).catch(function () {}); }
  function getSubscriptions() { return request('GET', '/api/users/me/subscriptions'); }

  // ------------------------------------------------------------------------------------------
  // XP sync-queue registration (ARCHITECTURE.md Section 11.16's offline-mode requirement). Every
  // recordXp() call is enqueued the same way every other migrated module's writes are (Section
  // 7.18), instead of the previous raw fetch()+.catch(()=>{}) which silently lost the award if
  // the request failed - now it retries with backoff and survives a reload. The server is fully
  // authoritative on points/domain/caps; the client only ever sends the event's identity.
  // ------------------------------------------------------------------------------------------
  (function () {
    var queue = window.TradeJournalSyncQueue;
    if (!queue) return;
    function devUser() { return window.TradeJournalDevUserSwitcher; } // looked up live, see session-workspace-logic.js's identical comment
    queue.registerModule('xp-events', function (entry) {
      var uid = devUser() && devUser().currentUserId();
      if (!uid) throw new Error('NO_CURRENT_USER'); // stays queued, retried once a user exists
      return fetch('/api/users/me/xp-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid }, body: JSON.stringify(entry.payload)
      }).then(function (response) { if (!response.ok) throw new Error('SYNC_FAILED'); });
    });
  }());

  function recordXp(type, meta, options) {
    var opts = options || {};
    var payload = { type: type, sourceType: opts.sourceType || null, sourceId: opts.sourceId || null, dedupeKey: opts.dedupeKey || null, meta: meta || {} };
    var queue = window.TradeJournalSyncQueue;
    if (queue) { queue.enqueue('xp-events', opts.dedupeKey || (type + ':' + Date.now()), payload); return; }
    request('POST', '/api/users/me/xp-events', payload).catch(function () {});
  }

  // ------------------------------------------------------------------------------------------
  // XP/achievement triggers. Every trigger here reads an EXISTING store fresh each time
  // (mirrors mental-health-collector.js's recompute() discipline - no parallel store of raw
  // trade/session/pattern/strategy/community data is kept). A small localStorage-persisted
  // "already sent" dedupe-key set per domain is this module's own fast client-side skip - the
  // server's (user_id, dedupe_key) unique constraint is the real authority, so a false negative
  // here just costs one harmless extra network round-trip, never a double-award.
  // ------------------------------------------------------------------------------------------
  var rules = window.TradeJournalProfileXPRules;
  var achievementDefs = window.TradeJournalProfileAchievements;

  function sentSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { return new Set(); }
  }
  function saveSentSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (_) { /* no-op if storage is unavailable */ }
  }
  function award(sentKey, dedupeKey, type, meta, sourceType, sourceId) {
    if (rules && rules.POINTS_BY_TYPE && !(type in rules.POINTS_BY_TYPE)) return; // guards a typo'd type at the source
    var sent = sentSet(sentKey);
    if (sent.has(dedupeKey)) return;
    sent.add(dedupeKey);
    saveSentSet(sentKey, sent);
    recordXp(type, meta, { sourceType: sourceType, sourceId: sourceId, dedupeKey: dedupeKey });
  }
  function monthTag(date) {
    var d = date || new Date();
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  var ONBOARDING_SENT_KEY = 'tradejournal:account-profile-xp-sent-onboarding:v1';
  var SESSION_SENT_KEY = 'tradejournal:account-profile-xp-sent-session:v1';
  var PATTERN_SENT_KEY = 'tradejournal:account-profile-xp-sent-pattern:v1';
  var STRATEGY_SENT_KEY = 'tradejournal:account-profile-xp-sent-strategy:v1';
  var TRADE_SENT_KEY = 'tradejournal:account-profile-xp-sent-trade:v1';
  var PSYCH_SENT_KEY = 'tradejournal:account-profile-xp-sent-psych:v1';
  var COMMUNITY_SENT_KEY = 'tradejournal:account-profile-xp-sent-community:v1';
  // These two survive from the pre-engine implementation purely as achievement-evidence
  // bookkeeping (listing/purchase ids seen so far) - unrelated to the new per-domain XP dedupe.
  var LISTING_SYNC_KEY = 'tradejournal:account-profile-listing-ids:v1';
  var PURCHASE_SYNC_KEY = 'tradejournal:account-profile-purchase-ids:v1';

  // ============================== SESSION DOMAIN ==============================
  // Sessions live in one shared account-wide bucket, not a per-character one - reads the same
  // key session-workspace-logic.js/sessionsAdapter.js write to (tradejournal:sessions:v1:shared),
  // so XP/achievements count every session regardless of which character created it.
  function allSessions() {
    try {
      var raw = localStorage.getItem('tradejournal:sessions:v1:shared');
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(function (s) { return s && s.id; }) : [];
    } catch (_) { return []; }
  }
  // "Complete" heuristics below approximate session-card-updates.js's own (unexported)
  // formCompletion()/completion() checks rather than duplicating their exact private logic -
  // documented judgment call, since no shared accessor exposes that computation.
  function scenarioComplete(scenario) {
    if (!scenario) return false;
    var plan = scenario.executionPlan || {};
    return !!(scenario.description && scenario.evidence && (scenario.invalidationTagIds || []).length &&
      scenario.trigger && (scenario.probabilityHistory || []).length && plan.actionPlan && plan.positionType && (plan.entryPrices || []).length);
  }
  function executionPlanRecorded(scenario) {
    var plan = (scenario && scenario.executionPlan) || {};
    return !!((plan.entryPrices || []).length && plan.stopLoss && plan.takeProfit);
  }

  function onSessionsChangedXp() {
    var sessions = allSessions();
    if (sessions.length) award(SESSION_SENT_KEY, 'once:first_session_bonus', 'first_session_bonus', {}, null, null);

    sessions.forEach(function (session) {
      if (session.market && session.timeframe && session.date) {
        award(SESSION_SENT_KEY, 'session.created:' + session.id, 'session_created', { sessionId: session.id }, 'session', session.id);
      }
      var chartCount = 0, movementCount = 0;
      (session.entries || []).forEach(function (entry) {
        if (!entry || !entry.id) return;
        if (entry.type === 'chart' && entry.hasImage && entry.note) {
          chartCount += 1;
          if (chartCount <= 3) award(SESSION_SENT_KEY, 'session.entry:' + entry.id, 'session_chart_entry_added', { sessionId: session.id, entryId: entry.id }, 'session', session.id);
        }
        if (entry.type === 'movement' && entry.movementNote) {
          movementCount += 1;
          if (movementCount <= 3) award(SESSION_SENT_KEY, 'session.entry:' + entry.id, 'session_movement_entry_added', { sessionId: session.id, entryId: entry.id }, 'session', session.id);
        }
        (entry.scenarios || []).forEach(function (scenario) {
          if (!scenario || !scenario.id) return;
          if (scenarioComplete(scenario)) {
            award(SESSION_SENT_KEY, 'session.scenario:' + scenario.id, 'session_scenario_created', { sessionId: session.id, scenarioId: scenario.id }, 'session', session.id);
          }
          var updates = Math.max(0, (scenario.probabilityHistory || []).length - 1);
          for (var n = 1; n <= Math.min(updates, 3); n += 1) {
            award(SESSION_SENT_KEY, 'session.prob:' + scenario.id + ':' + n, 'session_probability_updated', { sessionId: session.id, scenarioId: scenario.id }, 'session', session.id);
          }
          var patternId = scenario.pattern && scenario.pattern.patternTagId;
          if (patternId) {
            award(SESSION_SENT_KEY, 'session.patternlink:' + scenario.id, 'session_pattern_linked', { sessionId: session.id, scenarioId: scenario.id, patternId: patternId }, 'session', session.id);
            award(PATTERN_SENT_KEY, 'pattern.used:' + patternId + ':' + scenario.id, 'pattern_used_in_scenario', { patternId: patternId, scenarioId: scenario.id }, 'pattern', patternId);
            // Confirmed (occurred===true) and Invalidated (confirmedInvalidationTagIds) pay the
            // exact same type/points and share one dedupe key - so a user cannot farm XP by
            // flip-flopping a scenario's outcome, and both outcomes are rewarded equally
            // (ARCHITECTURE.md Section 11.5's explicit "must pay equal XP" rule).
            if (scenario.occurred === true || (scenario.confirmedInvalidationTagIds || []).length > 0) {
              award(PATTERN_SENT_KEY, 'pattern.outcome:' + patternId + ':' + scenario.id, 'pattern_outcome_recorded', { patternId: patternId, scenarioId: scenario.id }, 'pattern', patternId);
            }
          }
          if (executionPlanRecorded(scenario)) {
            award(SESSION_SENT_KEY, 'session.plan:' + scenario.id, 'session_execution_plan_recorded', { sessionId: session.id, scenarioId: scenario.id }, 'session', session.id);
          }
        });
      });
      if (session.fateSummary) {
        award(SESSION_SENT_KEY, 'session.fate:' + session.id, 'session_fate_recorded', { sessionId: session.id }, 'session', session.id);
      }
      if (session.status === 'closed' && session.fateSummary && session.fateSummary.note) {
        award(SESSION_SENT_KEY, 'session.closed:' + session.id, 'session_closed_with_summary', { sessionId: session.id }, 'session', session.id);
      }
    });
    checkAchievements();
  }

  // ============================== PATTERN DOMAIN ==============================
  function onPatternsChangedXp() {
    var store = window.TradeJournalPatternStore;
    if (!store || !store.listSync) return;
    var patterns = store.listSync();
    if (patterns.length) award(PATTERN_SENT_KEY, 'once:first_pattern_bonus', 'first_pattern_bonus', {}, null, null);

    patterns.forEach(function (pattern) {
      if (!pattern || !pattern.id) return;
      if (pattern.name && pattern.description && (pattern.stages || []).length >= 3) {
        award(PATTERN_SENT_KEY, 'pattern.created:' + pattern.id, 'pattern_created', { patternId: pattern.id }, 'pattern', pattern.id);
      }
      (pattern.referenceScreenshots || []).forEach(function (shot) {
        if (shot && shot.id && shot.note) award(PATTERN_SENT_KEY, 'pattern.shot:' + shot.id, 'pattern_screenshot_added', { patternId: pattern.id, screenshotId: shot.id }, 'pattern', pattern.id);
      });
      var reportKey = 'pattern.report:' + pattern.id;
      var sent = sentSet(PATTERN_SENT_KEY);
      if (!sent.has(reportKey)) {
        // Introduces the 5-real-sample minimum ARCHITECTURE.md Section 11.5 assumes but the
        // Pattern Registry's own scenarioReport() doesn't gate on (it flips hasData true at 1
        // sample) - re-verified server-side too (routes.profile.mjs), never trusted from here alone.
        if (store.scenarioReport) {
          var report = store.scenarioReport(pattern.id);
          if (report && report.hasData && (report.scenarios || []).length >= 5) {
            award(PATTERN_SENT_KEY, reportKey, 'pattern_report_generated', { patternId: pattern.id }, 'pattern', pattern.id);
          }
        }
      } else {
        // A save() after the report was already generated counts as "revised based on the
        // report" - a documented proxy (no real "viewed report then edited" correlation exists
        // in the data model), capped once a month via the dedupe key itself.
        award(PATTERN_SENT_KEY, 'pattern.revised:' + pattern.id + ':' + monthTag(), 'pattern_revised_after_report', { patternId: pattern.id }, 'pattern', pattern.id);
      }
    });
    checkAchievements();
  }

  // ============================== STRATEGY DOMAIN ==============================
  function positionManagementComplete(s) {
    var p = s.positionManagement || {};
    return !!(p.entryRules && p.stopLossRules && p.exitTargetRules && p.positionSizingRules);
  }
  function riskManagementComplete(s) {
    var r = s.riskManagement || {};
    return r.maxRiskPerTradePercent != null && r.dailyDrawdownLimitPercent != null && r.totalDrawdownLimitPercent != null;
  }
  function overallFrameworkComplete(s) {
    var o = s.overallFramework || {};
    return !!(o.description && o.description.trim().length >= 40);
  }
  function onStrategiesChangedXp() {
    var store = window.TradeJournalStrategyEducationStore;
    if (!store || !store.listSync) return;
    var strategies = store.listSync();
    if (strategies.length) award(STRATEGY_SENT_KEY, 'once:first_strategy_bonus', 'first_strategy_bonus', {}, null, null);

    strategies.forEach(function (strategy) {
      if (!strategy || !strategy.id) return;
      if (strategy.name) award(STRATEGY_SENT_KEY, 'strategy.created:' + strategy.id, 'strategy_created', { strategyId: strategy.id }, 'strategy', strategy.id);
      if (positionManagementComplete(strategy)) award(STRATEGY_SENT_KEY, 'strategy.positionManagement:' + strategy.id, 'strategy_position_management_completed', { strategyId: strategy.id }, 'strategy', strategy.id);
      if (riskManagementComplete(strategy)) award(STRATEGY_SENT_KEY, 'strategy.riskManagement:' + strategy.id, 'strategy_risk_management_completed', { strategyId: strategy.id }, 'strategy', strategy.id);
      if (overallFrameworkComplete(strategy)) award(STRATEGY_SENT_KEY, 'strategy.overallFramework:' + strategy.id, 'strategy_overall_framework_completed', { strategyId: strategy.id }, 'strategy', strategy.id);

      ['positionManagement', 'riskManagement', 'overallFramework'].forEach(function (section) {
        ((strategy[section] || {}).attachments || []).forEach(function (att) {
          if (att && att.id && att.note) award(STRATEGY_SENT_KEY, 'strategy.attach:' + att.id, 'strategy_attachment_added', { strategyId: strategy.id, attachmentId: att.id }, 'strategy', strategy.id);
        });
      });

      (strategy.detectionEvents || []).forEach(function (evt) {
        if (!evt || !evt.id) return;
        award(STRATEGY_SENT_KEY, 'strategy.detect:' + evt.id, 'strategy_detection_recorded', { strategyId: strategy.id, eventId: evt.id }, 'strategy', strategy.id);
        if (evt.status === 'confirmed' || evt.status === 'invalidated') {
          award(STRATEGY_SENT_KEY, 'strategy.detectresolve:' + evt.id, 'strategy_detection_resolved', { strategyId: strategy.id, eventId: evt.id }, 'strategy', strategy.id);
        }
      });

      var tradeStore = window.TradeJournalTradeStore;
      if (tradeStore && tradeStore.listSync) {
        var linkedCount = tradeStore.listSync().filter(function (t) { return t.linkedStrategyId === strategy.id; }).length;
        var cycles = Math.floor(linkedCount / 5);
        for (var c = 1; c <= cycles; c += 1) {
          award(STRATEGY_SENT_KEY, 'strategy.revisit:' + strategy.id + ':' + c, 'strategy_revisited_after_trades', { strategyId: strategy.id }, 'strategy', strategy.id);
        }
      }
    });
    checkAchievements();
  }

  // ============================== TRADE DOMAIN ==============================
  function tradeOpenedFromHunting(trade) {
    var seenHunting = false;
    return (trade.statusHistory || []).some(function (entry) {
      if (entry.status === 'hunting') seenHunting = true;
      return seenHunting && entry.status === 'open';
    });
  }
  function onTradesChangedXp() {
    var tradeStore = window.TradeJournalTradeStore;
    if (!tradeStore || !tradeStore.listSync) return;
    var trades = tradeStore.listSync();
    if (trades.length) award(TRADE_SENT_KEY, 'once:first_trade_bonus', 'first_trade_bonus', {}, null, null);

    trades.forEach(function (trade) {
      if (!trade || !trade.id) return;
      if (trade.entryPrice != null && trade.stopLoss != null && (trade.takeProfits || []).length && trade.direction) {
        award(TRADE_SENT_KEY, 'trade.plan:' + trade.id, 'trade_plan_created', { tradeId: trade.id }, 'trade', trade.id);
      }
      if (trade.positionSize != null && trade.rr != null) {
        award(TRADE_SENT_KEY, 'trade.calc:' + trade.id, 'trade_calculation_valid', { tradeId: trade.id }, 'trade', trade.id);
      }
      if ((trade.linkedPatternIds || []).length || trade.linkedStrategyId) {
        award(TRADE_SENT_KEY, 'trade.link:' + trade.id, 'trade_linked', { tradeId: trade.id }, 'trade', trade.id);
      }
      if (tradeOpenedFromHunting(trade)) {
        award(TRADE_SENT_KEY, 'trade.opened:' + trade.id, 'trade_opened_from_hunting', { tradeId: trade.id }, 'trade', trade.id);
      }
      if ((trade.emotionLog || []).some(function (e) { return e.stage === 'mid_trade'; })) {
        award(TRADE_SENT_KEY, 'trade.emotion:' + trade.id, 'trade_mid_emotion_logged', { tradeId: trade.id }, 'trade', trade.id);
      }
      // Entry-vs-exit screenshot tagging doesn't exist (a flat, untagged array) - awarded
      // per-screenshot instead, capped at 2 total by PER_SOURCE_MAX server-side, so total points
      // (2x1=2) match the spec's combined entry+exit value without needing a stage distinction.
      (trade.screenshots || []).forEach(function (shot) {
        if (shot && shot.id) award(TRADE_SENT_KEY, 'trade.shot:' + shot.id, 'trade_screenshot_added', { tradeId: trade.id, screenshotId: shot.id }, 'trade', trade.id);
      });
      if (trade.status === 'closed' && trade.exitPrice != null && trade.pnl != null) {
        award(TRADE_SENT_KEY, 'trade.closed:' + trade.id, 'trade_closed_with_pnl', { tradeId: trade.id }, 'trade', trade.id);
      }
    });
    checkAchievements();
  }

  // ============================== PSYCHOLOGY DOMAIN ==============================
  // Also the source of trade_post_review_completed (Trade domain) and strategy_linked_to_trade
  // (Strategy domain) - both ride the same real action (a Post-Trade Reflection actually
  // completed for a trade), deliberately double/triple-tagged across domains exactly the way
  // ARCHITECTURE.md Section 11.7/11.8 itself splits "Post-Trade Review" (6 XP, Trade) from
  // "Post-Trade Reflection" (4 XP, Psychology) as two separate line items for the one action.
  function onMentalHealthChangedXp() {
    var mhStore = window.TradeJournalMentalHealthStore;
    var tradeStore = window.TradeJournalTradeStore;
    if (!mhStore) return;
    var profile;
    try { profile = mhStore.load(); } catch (_) { return; }
    if (!profile) return;

    if (profile.intake && profile.intake.completed) {
      award(PSYCH_SENT_KEY, 'once:intake_completed', 'intake_completed', {}, null, null);
    }

    ((profile.continuousTracking || {}).preSessionCheckIns || []).forEach(function (c) {
      if (c && c.id) award(PSYCH_SENT_KEY, 'psych.checkin:' + c.id, 'psych_checkin', { sessionId: c.sessionId }, null, null);
    });
    ((profile.continuousTracking || {}).preTradeContext || []).forEach(function (c) {
      if (c && c.id) award(PSYCH_SENT_KEY, 'psych.checkin:' + c.id, 'psych_checkin', { tradeId: c.tradeId }, null, null);
    });
    ((profile.continuousTracking || {}).postTradeReflections || []).forEach(function (r) {
      if (!r || !r.tradeId) return;
      award(TRADE_SENT_KEY, 'trade.review:' + r.tradeId, 'trade_post_review_completed', { tradeId: r.tradeId }, 'trade', r.tradeId);
      award(PSYCH_SENT_KEY, 'psych.reflection:' + r.tradeId, 'psych_post_trade_reflection', { tradeId: r.tradeId }, 'trade', r.tradeId);
      var trade = tradeStore && tradeStore.find ? tradeStore.find(r.tradeId) : null;
      if (trade && trade.linkedStrategyId) {
        award(STRATEGY_SENT_KEY, 'strategy.tradelink:' + r.tradeId, 'strategy_linked_to_trade', { strategyId: trade.linkedStrategyId, tradeId: r.tradeId }, 'strategy', trade.linkedStrategyId);
      }
    });
    ((profile.progressTracking || {}).weeklySnapshots || []).forEach(function (snap) {
      if (snap && snap.weekStart) award(PSYCH_SENT_KEY, 'psych.weekly:' + snap.weekStart, 'psych_weekly_checkin', { weekStart: snap.weekStart }, null, null);
    });
    var checklist = (profile.psychologicalProfile || {}).biasChecklist;
    if (checklist && checklist.lastAssessedAt) {
      award(PSYCH_SENT_KEY, 'psych.bias:' + monthTag(new Date(checklist.lastAssessedAt)), 'psych_monthly_bias_checklist', {}, null, null);
    }
    ((profile.cognitiveProfile || {}).thoughtRecords || []).forEach(function (t) {
      if (t && t.id) award(PSYCH_SENT_KEY, 'psych.tot:' + t.id, 'psych_thought_or_trigger', { thoughtRecordId: t.id }, null, null);
    });
    ((profile.triggerProfile || {}).triggers || []).forEach(function (t) {
      if (t && t.id) award(PSYCH_SENT_KEY, 'psych.tot:' + t.id, 'psych_thought_or_trigger', { triggerId: t.id }, null, null);
    });
    Object.keys(profile.educationCards || {}).forEach(function (biasType) {
      var card = profile.educationCards[biasType];
      if (card && card.viewedAt && card.personalResponse) {
        award(PSYCH_SENT_KEY, 'psych.card:' + biasType + ':' + card.generatedAt, 'psych_education_card_response', { biasType: biasType }, null, null);
      }
    });

    checkAchievements();
  }

  // ============================== COMMUNITY DOMAIN ==============================
  function onCommunityPostPublished(event) {
    var postId = event && event.detail && event.detail.postId;
    if (!postId) return;
    award(COMMUNITY_SENT_KEY, 'community.post:' + postId, 'community_post_published', { postId: postId }, null, null);
  }
  function onListingRated(event) {
    var detail = event && event.detail;
    if (!detail || !detail.listingId || !detail.reviewText) return;
    award(COMMUNITY_SENT_KEY, 'community.rating:' + detail.listingId, 'listing_rated_with_review', { listingId: detail.listingId }, null, null);
  }
  function onListingPublished(event) {
    var detail = event && event.detail || {};
    var listingId = detail.listingId;
    if (!listingId) return;
    if (detail.type === 'pattern' && detail.sourceId) {
      award(PATTERN_SENT_KEY, 'pattern.published:' + detail.sourceId, 'pattern_published', { patternId: detail.sourceId, listingId: listingId }, 'pattern', detail.sourceId);
    } else if (detail.type === 'strategy' && detail.sourceId) {
      award(STRATEGY_SENT_KEY, 'strategy.published:' + detail.sourceId, 'strategy_published', { strategyId: detail.sourceId, listingId: listingId }, 'strategy', detail.sourceId);
    } else {
      // Subscriptions/unrecognized listing types keep the original, generic community-domain award.
      award(COMMUNITY_SENT_KEY, 'community.published:' + listingId, 'listing_published', { listingId: listingId }, null, null);
    }
    var ids = sentSet(LISTING_SYNC_KEY); ids.add(listingId); saveSentSet(LISTING_SYNC_KEY, ids);
    checkAchievements();
  }
  function onListingEvidenceRefreshed(event) {
    var detail = event && event.detail;
    if (!detail || detail.type !== 'pattern' || !detail.sourceId) return;
    award(PATTERN_SENT_KEY, 'pattern.evidence:' + detail.sourceId + ':' + monthTag(), 'pattern_evidence_refreshed', { patternId: detail.sourceId }, 'pattern', detail.sourceId);
  }
  function onListingPurchased(event) {
    var listingId = event && event.detail && event.detail.listingId;
    if (!listingId) return;
    var ids = sentSet(PURCHASE_SYNC_KEY);
    ids.add(listingId);
    saveSentSet(PURCHASE_SYNC_KEY, ids);
    checkAchievements();
  }
  // Best-effort poll for "did anyone rate one of my listings" - there is no server-side push for
  // this (confirmed: rateListing() dispatches nothing the seller could subscribe to), so this
  // diffs against a locally-remembered "seen rating ids" set on load, same inferred-not-pushed
  // approach documented in the implementation plan.
  function checkSellerRatings() {
    var community = window.TradeJournalCommunityStore;
    if (!community || !community.myListings) return;
    community.myListings().then(function (listings) {
      return Promise.all((listings || []).map(function (listing) {
        return community.listRatings(listing.id).then(function (ratings) {
          (ratings || []).forEach(function (rating) {
            if (rating && rating.id) award(COMMUNITY_SENT_KEY, 'community.received:' + rating.id, 'seller_rating_received', { listingId: listing.id, ratingId: rating.id }, null, null);
          });
        });
      }));
    }).catch(function () { /* Community backend unreachable - try again next load */ });
  }

  // ============================== ACHIEVEMENTS ==============================
  // The store keeps one overwritten biasChecklist object, not a history array, so "count" here
  // is really "has it ever been completed" (0 or 1) - the real field path (psychologicalProfile.
  // biasChecklist.lastAssessedAt), replacing the previous implementation's two guessed paths.
  function biasChecklistCount(profile) {
    var checklist = profile && profile.psychologicalProfile && profile.psychologicalProfile.biasChecklist;
    return checklist && checklist.lastAssessedAt ? 1 : 0;
  }
  function sessionsWithLesson() {
    return allSessions().filter(function (s) { return s.fateSummary && s.fateSummary.note; }).map(function (s) { return s.id; });
  }

  function buildSnapshot() {
    var tradeStore = window.TradeJournalTradeStore;
    var mhStore = window.TradeJournalMentalHealthStore;
    var mhProfile = mhStore ? mhStore.load() : null;
    return {
      closedTrades: tradeStore && tradeStore.psychologyDataset ? tradeStore.psychologyDataset() : [],
      completedSessionIds: allSessions().filter(function (s) { return s.fateSummary; }).map(function (s) { return s.id; }),
      sessionIdsWithLesson: sessionsWithLesson(),
      ownedListingIds: Array.from(sentSet(LISTING_SYNC_KEY)),
      intakeCompleted: Boolean(mhProfile && mhProfile.intake && mhProfile.intake.completed),
      biasChecklistCompletedCount: biasChecklistCount(mhProfile),
      purchaseIds: Array.from(sentSet(PURCHASE_SYNC_KEY))
    };
  }

  function checkAchievements() {
    if (!achievementDefs) return;
    var earned = achievementDefs.checkAll(buildSnapshot());
    // unlockAchievement() is idempotent server-side (tested), so re-submitting an
    // already-unlocked key on every recompute is harmless - simpler than tracking "already
    // known unlocked" client-side too.
    earned.forEach(function (item) { unlockAchievement(item.key, item.evidence); });
  }

  // Real current/target counts for the achievements whose check() is a simple length-vs-target
  // comparison, reusing the exact same snapshot fields checkAll() already reads - used only for
  // a progress percentage in nextGoal() below, never to decide unlock (that's still check()'s job).
  function achievementProgress(key, snapshot) {
    var targets = {
      first_trade_closed: [(snapshot.closedTrades || []).length, 1], ten_trades_closed: [(snapshot.closedTrades || []).length, 10],
      fifty_trades_closed: [(snapshot.closedTrades || []).length, 50], first_session_completed: [(snapshot.completedSessionIds || []).length, 1],
      first_listing_published: [(snapshot.ownedListingIds || []).length, 1], first_purchase: [(snapshot.purchaseIds || []).length, 1],
      ten_sessions_closed: [(snapshot.completedSessionIds || []).length, 10], twenty_five_sessions_closed: [(snapshot.completedSessionIds || []).length, 25],
      fifty_sessions_closed: [(snapshot.completedSessionIds || []).length, 50], ten_sessions_with_lesson: [(snapshot.sessionIdsWithLesson || []).length, 10],
      intake_completed: [snapshot.intakeCompleted ? 1 : 0, 1], bias_checklist_completed: [snapshot.biasChecklistCompletedCount || 0, 1]
    };
    var pair = targets[key];
    return pair ? Math.max(0, Math.min(100, Math.round((pair[0] / pair[1]) * 100))) : 0;
  }

  // Real "what should I do next" guidance for the sidebar's reward/goal widget (previously
  // decorative, always showing the same hardcoded "250 XP / 73%" chest regardless of the trader's
  // actual state). first_session_completed/first_trade_closed are prioritized ahead of
  // DEFINITIONS' own order since they're the two most fundamental onboarding actions; once every
  // achievement is unlocked, falls back to real XP-to-next-level.
  function nextGoal() {
    if (!achievementDefs) return Promise.resolve(null);
    return getAchievements().then(function (unlocked) {
      var unlockedKeys = {};
      unlocked.forEach(function (a) { unlockedKeys[a.achievementKey] = true; });
      var defs = achievementDefs.definitions.filter(function (d) { return !d.serverOnly; });
      var priority = ['first_session_completed', 'first_trade_closed'];
      var ordered = priority.map(function (k) { return defs.find(function (d) { return d.key === k; }); })
        .concat(defs.filter(function (d) { return priority.indexOf(d.key) === -1; }))
        .filter(Boolean);
      var snapshot = buildSnapshot();
      var next = ordered.find(function (d) { return !unlockedKeys[d.key]; });
      if (next) return { kind: 'achievement', key: next.key, labelKey: next.labelKey, points: next.points, progress: achievementProgress(next.key, snapshot) };
      return getProfile().then(function (profile) {
        if (!rules) return null;
        var nextThreshold = rules.xpForNextLevel(profile.xpTotal);
        if (nextThreshold == null) return { kind: 'maxLevel' };
        var currentThreshold = rules.LEVEL_THRESHOLDS[rules.levelForXp(profile.xpTotal) - 1];
        var span = nextThreshold - currentThreshold;
        return { kind: 'level', xpToGo: nextThreshold - profile.xpTotal, progress: span > 0 ? Math.round(((profile.xpTotal - currentThreshold) / span) * 100) : 100 };
      });
    }).catch(function () { return null; });
  }

  window.addEventListener('tradejournal:trades-changed', onTradesChangedXp);
  window.addEventListener('tradejournal:sessions-changed', onSessionsChangedXp);
  window.addEventListener('tradejournal:patterns-changed', onPatternsChangedXp);
  window.addEventListener('tradejournal:strategy-education-changed', onStrategiesChangedXp);
  window.addEventListener('tradejournal:mental-health-changed', onMentalHealthChangedXp);
  window.addEventListener('tradejournal:listing-published', onListingPublished);
  window.addEventListener('tradejournal:listing-purchased', onListingPurchased);
  window.addEventListener('tradejournal:listing-evidence-refreshed', onListingEvidenceRefreshed);
  window.addEventListener('tradejournal:community-post-published', onCommunityPostPublished);
  window.addEventListener('tradejournal:listing-rated', onListingRated);
  window.setTimeout(function () {
    onTradesChangedXp(); onSessionsChangedXp(); onPatternsChangedXp(); onStrategiesChangedXp();
    onMentalHealthChangedXp(); checkSellerRatings(); checkAchievements();
  }, 0);

  window.TradeJournalAccountProfileStore = {
    getProfile: getProfile, updateProfile: updateProfile, recordXp: recordXp, getXpEvents: getXpEvents,
    getMastery: getMastery, getAchievements: getAchievements, unlockAchievement: unlockAchievement,
    getSubscriptions: getSubscriptions, checkAchievements: checkAchievements, nextGoal: nextGoal
  };
}());
