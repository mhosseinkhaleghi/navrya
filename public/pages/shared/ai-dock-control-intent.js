(function () {
  'use strict';
  // Slice U1-b (execution brief section 9 item 11, "Dock/process controls"): a pure, deterministic
  // classifier for the handful of real ChatDock/Voice controls that previously existed ONLY as
  // real UI buttons (chatDockView.jsx's own startNewChat()/toggleHistory()/endVoice()/mute()/
  // regenerateLastReply()) with no way to reach them by voice or typed command at all. Same
  // "deterministic, zero-network, never left to the model's own free-form JSON extraction on a
  // turn this mechanical" posture as ai-proactive-engine.js's own interpretConfirmationText() and
  // chat-dock-core.js's F37 gate fast-path - a real UI action, not a business decision, so it must
  // never depend on provider uptime or a network round trip.
  //
  // Deliberately narrow, anchored patterns (the whole trimmed utterance, not "contains this word
  // anywhere") - a longer, ordinary sentence that happens to mention "history" or "again" in
  // passing must never be mistaken for a control command. Best-effort phrase coverage across
  // en/fa/ar/es, documented as such rather than overclaiming exhaustive NLU - matching this
  // codebase's own established honesty convention for every other deterministic text classifier.
  var PATTERNS = {
    newChat: [
      /^(start\s+(a\s+)?)?new\s+chat$/i, /^start\s+(a\s+)?new\s+conversation$/i, /^start\s+over$/i,
      /^چت\s*جدید$/, /^گفتگوی\s*جدید$/, /^مکالمه\s*جدید$/, /^از\s*اول\s*شروع\s*کن$/,
      /^محادثة\s*جديدة$/, /^ابدأ\s*من\s*جديد$/,
      /^nuevo\s+chat$/i, /^nueva\s+conversaci[oó]n$/i, /^empezar\s+de\s+nuevo$/i
    ],
    history: [
      /^(show|open)\s+(my\s+)?(chat\s+)?history$/i, /^(show|open)\s+(the\s+)?conversation\s+history$/i,
      /^تاریخچه(\s*ی)?\s*(چت\s*)?(رو|را)?\s*(نشون\s*بده|نمایش\s*بده)$/, /^نمایش\s*تاریخچه$/,
      /^(أظهر|اعرض)\s*(السجل|سجل\s*المحادثات|المحادثات)$/, /^السجل$/,
      /^mostrar\s+(mi\s+)?historial$/i, /^ver\s+(el\s+)?historial(\s+de\s+conversaciones)?$/i
    ],
    endVoice: [
      /^(end|stop|turn\s+off)\s+voice(\s+mode)?$/i,
      /^(صدا|حالت\s*صوتی)\s*(رو|را)?\s*(قطع\s*کن|ببند|خاموش\s*کن|تمام\s*کن)$/,
      /^(أنهِ|أوقف)\s*الصوت$/,
      /^(terminar|detener|apagar)\s+(el\s+)?(modo\s+de\s+)?voz$/i
    ],
    mute: [
      /^mute(\s+(the\s+)?(mic|microphone|yourself))?$/i,
      /^میکروفون\s*(رو|را)?\s*(قطع\s*کن|خاموش\s*کن)$/, /^صدامو?\s*قطع\s*کن$/,
      /^اكتم(\s*الميكروفون)?$/,
      /^silenciar(\s+(el\s+)?(micr[oó]fono))?$/i
    ],
    unmute: [
      /^unmute(\s+(the\s+)?(mic|microphone|yourself))?$/i,
      /^میکروفون\s*(رو|را)?\s*(روشن\s*کن|وصل\s*کن)$/, /^صدامو?\s*وصل\s*کن$/,
      /^(إلغاء\s*كتم(\s*الميكروفون)?|فك\s*الكتم)$/,
      /^(activar(\s+(el\s+)?micr[oó]fono)?|quitar\s+silencio)$/i
    ],
    regenerate: [
      /^regenerate$/i, /^try\s+again$/i, /^say\s+that\s+again$/i, /^(give\s+me\s+)?another\s+answer$/i,
      /^دوباره\s*بگو$/, /^یه\s*جواب\s*دیگه\s*بده$/, /^دوباره\s*امتحان\s*کن$/,
      /^أعد\s*المحاولة$/, /^أعطني\s*إجابة\s*أخرى$/,
      /^regenerar$/i, /^int[eé]ntalo\s+de\s+nuevo$/i, /^dame\s+otra\s+respuesta$/i
    ]
  };
  var CONTROL_IDS = Object.keys(PATTERNS);

  // Returns one of CONTROL_IDS, or null when the trimmed utterance matches none of them. Never
  // partial-matches - the whole trimmed text must resemble the command, not merely mention a
  // keyword within a longer, ordinary sentence.
  function interpretDockControlText(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    for (var i = 0; i < CONTROL_IDS.length; i++) {
      var id = CONTROL_IDS[i];
      var list = PATTERNS[id];
      for (var j = 0; j < list.length; j++) {
        if (list[j].test(t)) return id;
      }
    }
    return null;
  }

  window.TradeJournalAIDockControlIntent = { interpretDockControlText: interpretDockControlText, CONTROL_IDS: CONTROL_IDS };
}());
