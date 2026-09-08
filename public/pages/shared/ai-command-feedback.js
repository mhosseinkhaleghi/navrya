(function () {
  'use strict';
  // Voice Command Learning Profile addendum, sections 6/8. Three deterministic, zero-network
  // phrase classifiers - the exact same posture as ai-workflow-engine.js's own
  // interpretCancelText()/interpretFinishText() and ai-proactive-engine.js's
  // interpretConfirmationText(): a real learning/trust decision must never depend on provider
  // uptime or a model's own free-form judgment. Best-effort phrase coverage across en/fa/ar/es,
  // documented as such rather than overclaiming exhaustive NLU. All three are anchored to the
  // WHOLE trimmed utterance (never a substring match), so an ordinary longer sentence that
  // happens to mention "remember" or "wrong" in passing is never mistaken for one of these.
  //
  // Section 6's hard rule: "learning must NEVER happen silently - only on explicit user approval
  // phrases... never a plain 'yes', never inferred from the absence of complaint, never from a
  // background confidence score." interpretLearningApprovalText() is therefore a DELIBERATELY
  // DIFFERENT, narrower vocabulary than ai-proactive-engine.js's own interpretConfirmationText() -
  // a bare "yes"/"ok" must never resolve here, only an explicit "remember this"/"do that
  // automatically"-shaped phrase. The two must stay disjoint on purpose.
  var LEARNING_APPROVAL_PATTERNS = [
    /^(yes,?\s*)?(remember (this|that)|learn (this|that)|do (this|that) automatically( next time)?|do (this|that) (from now on|every time)|always do (this|that))[.!]?$/i,
    /^(بله,?\s*)?(یادت باشه|به خاطر بسپار|یادش بمون|همیشه همین کارو بکن|از این به بعد همینو انجام بده|این رو یاد بگیر)$/,
    /^(نعم,?\s*)?(تذكر (هذا|ذلك)|احفظ (هذا|ذلك)|افعل (هذا|ذلك) تلقائيًا|افعل (هذا|ذلك) دائمًا|من الآن فصاعدًا افعل (هذا|ذلك))$/,
    /^(s[ií],?\s*)?(recu[eé]rda(lo)?( (esto|eso))?|aprende (esto|eso)|hazlo autom[aá]ticamente( la pr[oó]xima vez)?|hazlo siempre|desde ahora hazlo así)[.!]?$/i
  ];
  function interpretLearningApprovalText(text) {
    var t = String(text || '').trim().replace(/[.!؟?]\s*$/, '');
    if (!t) return false;
    return LEARNING_APPROVAL_PATTERNS.some(function (re) { return re.test(t); });
  }

  // Reinforcement only - "that was right", no new-learning implication (used to raise confidence
  // on a mapping that JUST fired, via applyLearnedCommandOutcome()'s 'success' outcome). Also
  // deliberately narrower than a bare "yes" - a plain confirm word here would wrongly reinforce
  // trust on every unrelated gate confirmation in the whole app.
  var POSITIVE_FEEDBACK_PATTERNS = [
    /^(that'?s (right|correct|it|exactly right)|correct|exactly|perfect|that works)[.!]?$/i,
    /^(درسته|دقیقا همینه|همینو میخواستم|عالی بود|درست بود)$/,
    /^(هذا صحيح|بالضبط|تمام|هذا ما أردته)$/,
    /^(eso es correcto|exacto|perfecto|así es|eso quería)[.!]?$/i
  ];
  function interpretPositiveFeedbackText(text) {
    var t = String(text || '').trim().replace(/[.!؟?]\s*$/, '');
    if (!t) return false;
    return POSITIVE_FEEDBACK_PATTERNS.some(function (re) { return re.test(t); });
  }

  // Negative feedback, section 8's six deterministic reasons. Ordered most-specific-first since a
  // few phrases could otherwise overlap (e.g. "never do that again" is closer to never_automatic
  // than a bare wrong_action). Each reason maps to one specific downstream action (see
  // chat-dock-core.js's own wiring): wrong_action/wrong_target/wrong_value all count as a
  // 'correction' outcome (confidence penalty, see learned-command-normalize.mjs); forget_
  // preference deletes the mapping outright; never_automatic disables it without deleting it;
  // ask_next_time also disables auto-apply but keeps the mapping for a future re-approval.
  var CORRECTION_PATTERNS = [
    { reason: 'forget_preference', re: /^(forget (that|this)( preference)?|remove that (preference|mapping|habit))[.!]?$/i },
    { reason: 'forget_preference', re: /^(فراموشش کن|این عادت رو پاک کن|این ترجیح رو حذف کن)$/ },
    { reason: 'forget_preference', re: /^(انسَ (هذا|ذلك)|احذف هذا التفضيل)$/ },
    { reason: 'forget_preference', re: /^(olv[ií]dalo|elimina esa preferencia)[.!]?$/i },

    { reason: 'never_automatic', re: /^(never do (this|that) automatically( again)?|don'?t do (this|that) (automatically|on your own) (again|anymore))[.!]?$/i },
    { reason: 'never_automatic', re: /^(دیگه این کارو خودکار نکن|این کارو دیگه خودت انجام نده)$/ },
    { reason: 'never_automatic', re: /^(لا تفعل هذا تلقائيًا مرة أخرى|لا تفعل هذا من تلقاء نفسك مرة أخرى)$/ },
    { reason: 'never_automatic', re: /^(nunca hagas eso autom[aá]ticamente( de nuevo)?|no lo hagas solo de nuevo)[.!]?$/i },

    { reason: 'ask_next_time', re: /^(ask me next time|check with me first next time|ask (me )?before doing (this|that) again)[.!]?$/i },
    { reason: 'ask_next_time', re: /^(دفعه بعد ازم بپرس|قبلش ازم بپرس)$/ },
    { reason: 'ask_next_time', re: /^(اسألني في المرة القادمة|اسألني قبل أن تفعل ذلك مرة أخرى)$/ },
    { reason: 'ask_next_time', re: /^(pregúntame la pr[oó]xima vez|preg[uú]ntame antes de hacer eso de nuevo)[.!]?$/i },

    { reason: 'wrong_action', re: /^(wrong action|that'?s not what i (meant|wanted)|not that (one|action))[.!]?$/i },
    { reason: 'wrong_action', re: /^(این اون کاری نبود که میخواستم|کار اشتباهی بود|اشتباه بود)$/ },
    { reason: 'wrong_action', re: /^(هذا ليس ما (قصدته|أردته)|إجراء خاطئ)$/ },
    { reason: 'wrong_action', re: /^(esa no es la acción correcta|no era eso lo que quería)[.!]?$/i },

    { reason: 'wrong_target', re: /^(wrong (one|trade|session|target)|not that (trade|session|one))[.!]?$/i },
    { reason: 'wrong_target', re: /^(اون یکی نبود|معامله اشتباه بود|سشن اشتباه بود)$/ },
    { reason: 'wrong_target', re: /^(ليست هذه الصفقة|ليست هذه الجلسة|هذا ليس الهدف الصحيح)$/ },
    { reason: 'wrong_target', re: /^(esa no es la operación correcta|no era esa sesión)[.!]?$/i },

    { reason: 'wrong_value', re: /^(wrong value|that'?s the wrong (value|number|amount))[.!]?$/i },
    { reason: 'wrong_value', re: /^(مقدارش اشتباهه|عدد اشتباهه)$/ },
    { reason: 'wrong_value', re: /^(القيمة خاطئة|الرقم خاطئ)$/ },
    { reason: 'wrong_value', re: /^(ese es el valor incorrecto|el n[uú]mero está mal)[.!]?$/i }
  ];
  function interpretCorrectionText(text) {
    var t = String(text || '').trim().replace(/[.!؟?]\s*$/, '');
    if (!t) return null;
    for (var i = 0; i < CORRECTION_PATTERNS.length; i++) {
      if (CORRECTION_PATTERNS[i].re.test(t)) return { reason: CORRECTION_PATTERNS[i].reason };
    }
    return null;
  }

  // Section 6 (safe "do that again"): a DIFFERENT, narrower vocabulary than the learning-approval
  // patterns above - "do that again" repeats the immediately preceding eligible action itself,
  // never teaches a phrase->action mapping. The two must stay disjoint on purpose (a user could
  // reasonably want one without the other).
  var REPEAT_PATTERNS = [
    /^(do (that|it) again|repeat (that|it)|same (thing )?again|once more)[.!]?$/i,
    /^(دوباره (همون کارو|همینو) بکن|بازم (همینو|اینو) انجام بده|یه بار دیگه)$/,
    /^(افعل (ذلك|هذا) مرة أخرى|كرر (ذلك|هذا)|مرة أخرى)$/,
    /^(hazlo de nuevo|repite eso|otra vez|lo mismo otra vez)[.!]?$/i
  ];
  function interpretRepeatText(text) {
    var t = String(text || '').trim().replace(/[.!؟?]\s*$/, '');
    if (!t) return false;
    return REPEAT_PATTERNS.some(function (re) { return re.test(t); });
  }

  // Section 8 (chat feedback buttons): the exact canonical phrase each button sends through the
  // ordinary submit() path, per language - "the buttons must call the SAME command-feedback...
  // path used by spoken/text commands... never a second, separate learning mechanism." Every
  // value here is copied VERBATIM from one of this file's own pattern literals above (not a
  // paraphrase) - tests/ai-command-feedback.test.mjs's own "canonical phrases actually match their
  // own classifier" test is the real guard against the two ever drifting apart silently.
  var CANONICAL_FEEDBACK_PHRASES = {
    correct: { en: "that's right", fa: 'درسته', ar: 'هذا صحيح', es: 'exacto' },
    wrongAction: { en: 'wrong action', fa: 'کار اشتباهی بود', ar: 'إجراء خاطئ', es: 'esa no es la acción correcta' },
    wrongTargetOrValue: { en: 'wrong value', fa: 'مقدارش اشتباهه', ar: 'القيمة خاطئة', es: 'ese es el valor incorrecto' },
    rememberThis: { en: 'remember this', fa: 'یادت باشه', ar: 'تذكر هذا', es: 'recuérdalo' }
  };
  function canonicalFeedbackPhrase(intent, language) {
    var byLang = CANONICAL_FEEDBACK_PHRASES[intent];
    if (!byLang) return null;
    return byLang[language] || byLang.en;
  }

  window.TradeJournalAICommandFeedback = {
    interpretLearningApprovalText: interpretLearningApprovalText,
    interpretPositiveFeedbackText: interpretPositiveFeedbackText,
    interpretCorrectionText: interpretCorrectionText,
    interpretRepeatText: interpretRepeatText,
    canonicalFeedbackPhrase: canonicalFeedbackPhrase
  };
}());
