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

  var DESTINATION = { TRANSIENT: 'TRANSIENT', TRADE_LOG: 'TRADE_LOG', SESSION_CONTEXT: 'SESSION_CONTEXT', PSYCHOLOGY_PROFILE: 'PSYCHOLOGY_PROFILE', CHAT_ONLY: 'CHAT_ONLY' };

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
    if (!relevant) {
      return { relevant: false, secondarySignals: [], destination: DESTINATION.CHAT_ONLY };
    }

    var secondarySignals = [{
      type: 'emotion', value: emotion, domain: 'psychology', source: 'explicit_user_statement', status: 'USER_STATED'
    }];
    if (lossRef) {
      secondarySignals.push({ type: 'behavioral_context', value: 'recent_losses', countHint: lossRef.countHint, requiresVerification: true, status: 'USER_STATED' });
    }

    // Destination policy (section 34): a real in-flight trade workflow -> TRADE_LOG (attached to
    // the trade once it exists - see chat-dock-core.js's own handling, since a still-being-planned
    // trade has no id to attach to yet); an active Session with no trade workflow -> SESSION_CONTEXT
    // (relevant to a pre-session check-in, never force-created here); otherwise CHAT_ONLY - the
    // signal is still returned (useful as evidence for the Proactive Engine THIS turn) but nothing
    // is written to any profile.
    var destination = DESTINATION.CHAT_ONLY;
    if (context.hasActiveTradeWorkflow) destination = DESTINATION.TRADE_LOG;
    else if (context.activeSessionId) destination = DESTINATION.SESSION_CONTEXT;

    return { relevant: true, secondarySignals: secondarySignals, destination: destination };
  }

  window.TradeJournalAISignalRouter = { DESTINATION: DESTINATION, classify: classify };
}());
