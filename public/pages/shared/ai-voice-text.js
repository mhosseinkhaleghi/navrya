(function () {
  'use strict';
  // Persian Voice Quality gate: a deterministic, VOICE-ONLY text post-processing layer, applied
  // at the exact point chatDockView.jsx hands text to aiVoiceRealtime.js's speak() - never touches
  // the written `reply` shown in the ChatDock transcript (section 12 of the gate: only the spoken
  // rendering may change register/markup/number-spelling, never the written one). Pure string
  // transforms, zero network calls, zero model calls (section 35 - "no extra AI call") - safe to
  // run on every voice turn regardless of whether the text came from the model's own voiceReply, a
  // Journey C proactive-safety message, or one of chat-dock-core.js's own deterministic
  // zero-network acknowledgements (aiDockSlotFilled/aiDockConfirmationAccepted/Cancelled).
  //
  // Three independent passes, always in this order (toSpokenText()):
  //   1. stripMarkupForSpeech - defensive, all languages: strips markdown/URLs/braces that would
  //      otherwise be read aloud literally if a model reply slipped past its own "no markdown"
  //      instruction (DOCK_STYLE_INSTRUCTION in server/pattern-ai-server.mjs already asks for
  //      plain text - this is the belt-and-suspenders half, not a replacement for that prompt rule).
  //   2. normalizeNumbersForSpeech - Persian only, until a real listening pass justifies more.
  //      Spells out a SMALL, well-defined, NAVRYA-owned closed set of numeric forms (the fixed
  //      TIMEFRAME_TOKENS enum, whole/half/quarter percents, comma-grouped or bare-4-to-6-digit
  //      whole-number prices, simple N:M ratios) into natural Persian words. Deliberately
  //      conservative (gate section 14: "if exact spoken normalization is uncertain, leave the
  //      precise representation alone - correctness beats naturalness") - anything outside this
  //      closed set (an odd multi-decimal price like 64250.75, a percent that isn't a clean
  //      half/quarter, a ratio with an irregular fraction) is left EXACTLY as written, never
  //      guessed at. See tests/ai-voice-text.test.mjs for the exact regression cases this promises.
  //   3. applyPronunciationMap - Persian only: a small, deliberately short substitution table for
  //      the few acronyms whose default TTS reading is close to universally worse than NAVRYA's
  //      own established Persian community term (see PRONUNCIATION_MAP_FA below) - not a general
  //      transliteration engine, and not applied to a proper noun (a Session city, "OpenAI") where
  //      the natural code-switched English pronunciation is not a defect (see docs/ai/voice-i18n.md
  //      on Arabic field values staying canonical English while the reply speaks them naturally).
  //
  // Every pass is a no-op for input it doesn't recognize - this module never throws, and the worst
  // case is the original text unchanged.

  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function faDigitsToAscii(text) {
    return String(text || '').replace(/[۰-۹]/g, function (ch) { return String(FA_DIGITS.indexOf(ch)); });
  }

  // ---- 1. markup stripping (language-independent - markdown looks the same in every language) ----
  function stripMarkupForSpeech(text) {
    var out = String(text || '');
    out = out.replace(/```[\s\S]*?```/g, function (m) { return m.replace(/`/g, ''); });
    out = out.replace(/`([^`]*)`/g, '$1');
    out = out.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2');
    out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');
    out = out.replace(/^\s*[-*•]\s+/gm, '');
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    out = out.replace(/https?:\/\/\S+/g, '');
    out = out.replace(/[{}[\]]/g, '');
    out = out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return out;
  }

  // ---- 2. number normalization (Persian only) ----
  var ONES_FA = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  var TEENS_FA = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  var TENS_FA = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  var HUNDREDS_FA = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];

  // Converts a non-negative INTEGER to standard-written Persian words (never called with a
  // fractional value - every caller below already validated that). Deliberately standard, not
  // colloquial ("پانصد", not "پونصد") - gate section 10: "sound like an educated contemporary
  // Iranian Persian speaker," not slang.
  function faIntegerToWords(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    if (n === 0) return 'صفر';
    function threeDigits(chunk) {
      var out = [];
      var h = Math.floor(chunk / 100), rest = chunk % 100;
      if (h) out.push(HUNDREDS_FA[h]);
      if (rest >= 10 && rest < 20) out.push(TEENS_FA[rest - 10]);
      else {
        var t = Math.floor(rest / 10), o = rest % 10;
        if (t) out.push(TENS_FA[t]);
        if (o) out.push(ONES_FA[o]);
      }
      return out.join(' و ');
    }
    var parts = [];
    var billions = Math.floor(n / 1000000000); n %= 1000000000;
    var millions = Math.floor(n / 1000000); n %= 1000000;
    var thousands = Math.floor(n / 1000); n %= 1000;
    if (billions) parts.push(threeDigits(billions) + ' میلیارد');
    if (millions) parts.push(threeDigits(millions) + ' میلیون');
    if (thousands) parts.push(thousands === 1 ? 'هزار' : threeDigits(thousands) + ' هزار');
    if (n) parts.push(threeDigits(n));
    return parts.join(' و ');
  }

  // A value with no fractional part, or exactly a half - the only two shapes safe to convert
  // unambiguously outside the closed percent set below (used by the ratio pass). Anything else
  // (any other decimal) returns null so the caller leaves the original numeral untouched.
  function safeNumberWord(raw) {
    var n = parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    if (Number.isInteger(n)) return faIntegerToWords(n);
    var whole = Math.floor(n);
    var frac = Math.round((n - whole) * 100) / 100;
    if (frac === 0.5) return faIntegerToWords(whole) + ' و نیم';
    return null;
  }

  // Percent -> words for exactly the closed, unambiguous fraction set (whole / half / quarter /
  // three-quarters). Any other fractional percent (0.05%, 4.37%, ...) returns null - gate section
  // 14's own rule: correctness beats naturalness, leave it as the precise written numeral.
  function faPercentToWords(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    var whole = Math.floor(n);
    var frac = Math.round((n - whole) * 100) / 100;
    var fracWord = frac === 0 ? '' : frac === 0.5 ? 'نیم' : frac === 0.25 ? 'ربع' : frac === 0.75 ? 'سه ربع' : null;
    if (fracWord === null) return null;
    if (whole === 0 && fracWord) return fracWord;
    var wholeWord = faIntegerToWords(whole);
    return fracWord ? (wholeWord + ' و ' + fracWord) : wholeWord;
  }

  var TIMEFRAME_WORDS_FA = { '5m': 'پنج دقیقه', '15m': 'پانزده دقیقه', '1h': 'یک ساعت', '4h': 'چهار ساعت', '1D': 'یک روز' };

  function normalizeNumbersForSpeech(text, language) {
    // Conservative by design: every rule below was tuned and verified against Persian's own
    // number-naming conventions (see tests/ai-voice-text.test.mjs) - extending this to EN/AR/ES
    // without the same per-language verification would risk exactly the "blindly transform
    // arbitrary numbers" failure mode gate section 13 warns against, for languages this pass never
    // set out to touch (section 32/33 - no EN/AR/ES regression).
    if (language !== 'fa') return String(text || '');
    var out = faDigitsToAscii(String(text || ''));

    // Closed-set timeframe tokens first - zero ambiguity, NAVRYA's own fixed enum.
    out = out.replace(/\b(5m|15m|1h|4h|1[Dd])\b/g, function (m) {
      var key = /[Dd]$/.test(m) ? '1D' : m;
      return TIMEFRAME_WORDS_FA[key] || m;
    });

    // Ratios (1:2, 1:3.5) - only when both sides are unambiguous (integer, or exactly a half).
    out = out.replace(/\b(\d+)\s*:\s*(\d+(?:\.\d+)?)\b/g, function (m, a, b) {
      var left = safeNumberWord(a);
      var right = safeNumberWord(b);
      return (left === null || right === null) ? m : (left + ' به ' + right);
    });

    // Percents - "0.5%", "1 %", "0.5٪", "1.25 درصد".
    out = out.replace(/(\d+(?:\.\d+)?)\s*(%|٪|درصد)/g, function (m, num) {
      var words = faPercentToWords(parseFloat(num));
      return words === null ? m : (words + ' درصد');
    });

    // Prices - comma-grouped (any size, always unambiguous - NAVRYA is the only thing that groups
    // digits with commas here) or a bare 4-6 digit whole number never immediately followed by a
    // decimal point+digit (a decimal price like 64250.75 is left fully untouched - both the
    // integer and fractional parts - rather than spelling out only half of it).
    out = out.replace(/(?:[$€£]\s*)?\b\d{1,3}(?:,\d{3})+\b/g, function (m) {
      var n = parseInt(m.replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? faIntegerToWords(n) : m;
    });
    out = out.replace(/(?:[$€£]\s*)?\b\d{4,6}\b(?!\s*[.,]\d)/g, function (m) {
      var n = parseInt(m.replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? faIntegerToWords(n) : m;
    });

    return out;
  }

  // ---- 3. pronunciation map (Persian only, deliberately short) ----
  // Candidates NOT included here (SL/TP/RR/OpenAI/New York/Strategy/Pattern) are left to the
  // model's/TTS's own natural code-switched pronunciation pending a real listening pass - see
  // docs/ai/persian-voice-quality.md's "Trading pronunciation dictionary" section for why each one
  // was left out rather than guessed at.
  var PRONUNCIATION_MAP_FA = { BTC: 'بیت‌کوین', ETH: 'اتریوم' };
  function applyPronunciationMap(text, language) {
    if (language !== 'fa') return String(text || '');
    var out = String(text || '');
    Object.keys(PRONUNCIATION_MAP_FA).forEach(function (term) {
      out = out.replace(new RegExp('\\b' + term + '\\b', 'g'), PRONUNCIATION_MAP_FA[term]);
    });
    return out;
  }

  function toSpokenText(text, language) {
    var out = stripMarkupForSpeech(text);
    out = normalizeNumbersForSpeech(out, language);
    out = applyPronunciationMap(out, language);
    return out;
  }

  // ---- context-aware deterministic acknowledgements (gate section 22/23) ----
  // Only ever called for the SPOKEN rendering - chat-dock-core.js's own zero-network paths keep
  // their existing i18n text (aiDockSlotFilled/aiDockConfirmationAccepted/Cancelled) as the
  // written `reply` unconditionally (gate section 12: never make the written UI colloquial).
  // Returns null for any language/field this table does not (yet) cover - the caller then falls
  // back to the existing generic reply text for BOTH channels, so EN/AR/ES and any Persian field
  // not listed here are byte-for-byte unchanged from before this module existed (section 32/33).
  var FA_SLOT_PHRASES = {
    timeframe: function (v) { return 'اوکی، شد ' + v + '.'; },
    defaultTimeframe: function (v) { return 'اوکی، شد ' + v + '.'; },
    riskPercent: function (v) { return 'ریسکت شد ' + v + '%.'; },
    defaultRiskPercent: function (v) { return 'ریسکت شد ' + v + '%.'; },
    entryPrice: function (v) { return 'ورودت شد ' + v + '.'; },
    stopLoss: function (v) { return 'استاپت شد ' + v + '.'; },
    exitPrice: function (v) { return 'قیمت خروج شد ' + v + '.'; },
    leverageCap: function (v) { return 'سقف اهرمت شد ' + v + '.'; },
    maxTradesPerSession: function (v) { return 'سقف تعداد معاملاتت شد ' + v + '.'; },
    city: function (v) { return 'بازارش شد ' + v + '.'; },
    direction: function (v) { return 'جهتش شد ' + v + '.'; }
  };
  function spokenSlotFilled(field, value, language) {
    if (language === 'fa' && FA_SLOT_PHRASES[field]) return FA_SLOT_PHRASES[field](String(value));
    return null;
  }
  function spokenConfirmation(kind, language) {
    if (language !== 'fa') return null;
    return kind === 'cancelled' ? 'باشه، لغوش کردم.' : 'باشه، تأیید شد.';
  }

  window.TradeJournalAIVoiceText = {
    toSpokenText: toSpokenText,
    stripMarkupForSpeech: stripMarkupForSpeech,
    normalizeNumbersForSpeech: normalizeNumbersForSpeech,
    applyPronunciationMap: applyPronunciationMap,
    spokenSlotFilled: spokenSlotFilled,
    spokenConfirmation: spokenConfirmation,
    faIntegerToWords: faIntegerToWords,
    faPercentToWords: faPercentToWords
  };
}());
