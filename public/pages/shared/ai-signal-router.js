(function () {
  'use strict';
  // Journey C: decides (a) whether a message carries a trading-relevant behavioral/emotional
  // signal at all, and (b) where, if anywhere, that signal may be persisted - never how to
  // interpret it clinically (mental-health-safety.js remains the sole authority on that; see its
  // own comment on why this module never bypasses it). Classification here is deliberately
  // deterministic, keyword-based EN+FA matching, not a model call - every one of Journey C's own
  // required scenarios (section 22-31 of the spec) uses EXPLICIT emotion words ("angry"/"عصبانی")
  // that section 33's own guidance says need no semantic guesswork. A future pass could layer an
  // optional model-provided hint on top (the `modelHint` param below is a reserved, currently-
  // unused extension point for exactly that) without changing this module's own contract.
  //
  // Prefers false negatives over invasive over-collection (section 7): an ambiguous or
  // UI-directed complaint ("this modal is making me angry") is classified irrelevant rather than
  // guessed into a trading-psychology record.

  // TRADE_EMOTION_CANDIDATE (context-aware conversational operation layer, section 5): a real,
  // permitted OPEN trade exists (window.TradeJournalAIUserMemory.getRelevantTrades() - a public,
  // privacy-scoped adapter, never this router reading window.TradeJournalTradeStore directly) even
  // though nothing else ties this message to trading yet. This is deliberately NOT the same as
  // TRADE_LOG: the caller (chat-dock-core.js) must always pose a clarification/consent question
  // for this destination before ever writing anything - a real open trade existing is grounds to
  // ASK, never grounds to assume (section 5's own "never assume an ordinary emotional statement
  // concerns trading").
  var DESTINATION = { TRANSIENT: 'TRANSIENT', TRADE_LOG: 'TRADE_LOG', SESSION_CONTEXT: 'SESSION_CONTEXT', PSYCHOLOGY_PROFILE: 'PSYCHOLOGY_PROFILE', CHAT_ONLY: 'CHAT_ONLY', TRADE_EMOTION_CANDIDATE: 'TRADE_EMOTION_CANDIDATE' };

  // UI-directed complaints ("this modal/popup/page/button is annoying") are never trading
  // psychology, no matter how strongly worded, and win over any emotion keyword also present.
  var UI_TARGET_PATTERN = /\b(this|the)\s+(modal|popup|dialog|page|app|button|window|form|ui)\b/i;
  var UI_TARGET_PATTERN_FA = /(این\s*)?(پنجره|مودال|صفحه|دکمه|فرم|اپ)/;

  var ANGER_PATTERN = /\b(angry|anger|furious|mad|pissed|rage|irritated)\b/i;
  var ANGER_PATTERN_FA = /عصبانی|خشمگین|عصبانیت/;
  var STRESS_PATTERN = /\b(stressed|stress|anxious|anxiety|panic(?:ked|king)?|overwhelmed)\b/i;
  var STRESS_PATTERN_FA = /استرس|مضطرب|نگران/;
  var FRUSTRATION_PATTERN_FA = /اعصاب.*خورد/; // "اعصابمو خورد کرده" - idiom for "got on my nerves"

  var LOSS_REFERENCE_PATTERN = /\b(lost|losing|losses?)\b/i;
  var LOSS_REFERENCE_PATTERN_FA = /ضرر|باخت(م|ه)?/;
  var LOSS_COUNT_PATTERN = /\b(two|2|couple of|a pair of)\b.{0,20}\b(loss|losses|trades?)\b/i;
  var LOSS_COUNT_PATTERN_FA = /دو\s*تا/;

  // Explicit trading-domain vocabulary - presence alongside an emotion word is what makes an
  // otherwise-generic sentence count as trading-relevant even with no active workflow open at all.
  var TRADING_VOCAB_PATTERN = /\b(risk|entry|stop|target|position|trade|leverage|strategy|session)\b/i;
  var TRADING_VOCAB_PATTERN_FA = /ریسک|معامله|ورود|حد ضرر|استراتژی|پوزیشن/;

  function detectEmotion(text) {
    if (ANGER_PATTERN.test(text) || ANGER_PATTERN_FA.test(text)) return 'anger';
    if (STRESS_PATTERN.test(text) || STRESS_PATTERN_FA.test(text) || FRUSTRATION_PATTERN_FA.test(text)) return 'stress';
    return null;
  }

  function detectLossReference(text) {
    if (!(LOSS_REFERENCE_PATTERN.test(text) || LOSS_REFERENCE_PATTERN_FA.test(text))) return null;
    var countHint = LOSS_COUNT_PATTERN.test(text) || LOSS_COUNT_PATTERN_FA.test(text) ? 2 : null;
    return { mentioned: true, countHint: countHint };
  }

  // Section 5: real, permitted (activeEntities.tradeId means a VISIBLE Trade Details form, not
  // every stored trade whose status happens to be 'open' - this reads the real Trade Store's own
  // open positions instead) open trades, bounded and honestly marked truncated - "a one-item
  // truncated result is not proof that only one trade exists" (section 5's own requirement).
  // REQUEST_LIMIT is one more than the largest count this module itself ever needs to distinguish
  // (zero / one / more-than-one) plus real headroom for a trader with several simultaneous
  // positions - if the store still returns exactly this many, the result is flagged truncated
  // rather than silently presented as complete.
  var OPEN_TRADE_REQUEST_LIMIT = 6;
  function openTradeCandidates() {
    var memory = window.TradeJournalAIUserMemory;
    if (!memory || typeof memory.getRelevantTrades !== 'function') return { items: [], truncated: false };
    var items;
    try { items = memory.getRelevantTrades(null, { status: 'open', recentCount: OPEN_TRADE_REQUEST_LIMIT }) || []; } catch (_e) { return { items: [], truncated: false }; }
    return { items: items, truncated: items.length >= OPEN_TRADE_REQUEST_LIMIT };
  }

  // An EXPLICIT, unambiguous mention of one candidate's own real instrument code in the same
  // message ("my open XAUUSD trade") resolves the target directly - "explicit requests ... should
  // skip redundant questions when the entity and requested operation are unambiguous" (section 5).
  // Exact, case-insensitive substring match against the trade's own real instrument only - never a
  // fuzzy/aliased guess; two or more candidates sharing the same mentioned instrument is left
  // unresolved (never guessed - F53) so the caller still asks which one.
  function resolveExplicitTradeMention(text, candidates) {
    var t = String(text || '').toUpperCase();
    var matches = candidates.filter(function (c) { return c.instrument && t.indexOf(String(c.instrument).toUpperCase()) > -1; });
    return matches.length === 1 ? matches[0] : null;
  }

  // context: {hasActiveTradeWorkflow, activeSessionId, therapistMode}. Therapist mode already
  // routes through its own, separate, untouched safety-gated path (chat-dock-core.js's own A6
  // branch) - this router never runs there at all, so no explicit check is needed here; it is
  // simply never called from that branch.
  function classify(input) {
    var text = String((input && input.text) || '');
    var context = (input && input.context) || {};
    if (!text.trim()) return { relevant: false, secondarySignals: [], destination: DESTINATION.CHAT_ONLY };

    var isUiTarget = UI_TARGET_PATTERN.test(text) || UI_TARGET_PATTERN_FA.test(text);
    var emotion = detectEmotion(text);
    var lossRef = detectLossReference(text);

    if (isUiTarget || !emotion) {
      return { relevant: false, secondarySignals: [], destination: DESTINATION.CHAT_ONLY };
    }

    // Trading relevance (section 7): an active AI trade workflow already being worked on, OR
    // an active Session (an emotional statement made while genuinely inside a trading Session is
    // plausibly relevant pre-session context, even with no explicit trading noun - "I'm anxious
    // before New York opens" names a Session city, not a risk/entry/stop term), OR explicit
    // trading vocabulary in the same message, OR a loss reference (inherently trade-domain
    // language) alongside the emotion.
    var hasTradingVocab = TRADING_VOCAB_PATTERN.test(text) || TRADING_VOCAB_PATTERN_FA.test(text);
    var relevant = !!context.hasActiveTradeWorkflow || !!context.activeSessionId || hasTradingVocab || !!lossRef;

    var secondarySignals = [{
      type: 'emotion', value: emotion, domain: 'psychology', source: 'explicit_user_statement', status: 'USER_STATED'
    }];
    if (lossRef) {
      secondarySignals.push({ type: 'behavioral_context', value: 'recent_losses', countHint: lossRef.countHint, requiresVerification: true, status: 'USER_STATED' });
    }

    // Destination policy (section 34, extended by section 5): a real in-flight trade workflow ->
    // TRADE_LOG (attached to the trade once it exists - see chat-dock-core.js's own handling,
    // since a still-being-planned trade has no id to attach to yet); an active Session with no
    // trade workflow -> SESSION_CONTEXT (relevant to a pre-session check-in, never force-created
    // here). Neither applies -> before ever falling back to CHAT_ONLY (this app's own previous
    // dead end for "relevant, via trading vocabulary alone, but nowhere real to attach it" and for
    // a bare emotional statement with no trading vocabulary at all), check whether a real,
    // permitted OPEN trade exists to ask about - a real open trade existing is grounds to ASK
    // (TRADE_EMOTION_CANDIDATE), never grounds to assume or silently write anything.
    if (context.hasActiveTradeWorkflow) {
      return { relevant: true, secondarySignals: secondarySignals, destination: DESTINATION.TRADE_LOG };
    }
    if (context.activeSessionId) {
      return { relevant: true, secondarySignals: secondarySignals, destination: DESTINATION.SESSION_CONTEXT };
    }
    var openTrades = openTradeCandidates();
    if (openTrades.items.length) {
      var explicitMatch = resolveExplicitTradeMention(text, openTrades.items);
      return {
        relevant: true, secondarySignals: secondarySignals, destination: DESTINATION.TRADE_EMOTION_CANDIDATE,
        // resolvedTradeId: the message named exactly one candidate's own real instrument - the
        // caller may skip the "which trade" question outright (still asks consent unless the
        // message itself already expressed one - see chat-dock-core.js's own handling).
        resolvedTradeId: explicitMatch ? explicitMatch.id : null,
        openTradeCandidates: openTrades.items,
        openTradeCandidatesTruncated: openTrades.truncated
      };
    }
    if (!relevant) {
      return { relevant: false, secondarySignals: [], destination: DESTINATION.CHAT_ONLY };
    }
    return { relevant: true, secondarySignals: secondarySignals, destination: DESTINATION.CHAT_ONLY };
  }

  window.TradeJournalAISignalRouter = { DESTINATION: DESTINATION, classify: classify };
}());
