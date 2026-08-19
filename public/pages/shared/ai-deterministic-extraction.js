(function () {
  'use strict';
  // Journey D, step 0: a small, deterministic, provider-independent extractor for high-confidence
  // structured trading values, so an obvious literal instruction ("increase risk to 4%", "ریسک رو
  // بکن ۴ درصد") never depends on the model choosing to extract it. Found the hard way in Journey
  // C's own real browser testing: a well-aligned model can intermittently decline to extract a
  // value it perceives as unsafe, even when explicitly told extraction and policy are different
  // jobs - that is provider behavior, not something a system prompt can fully guarantee. This
  // module is the fix: NAVRYA itself recognizes its own users' literal words for a SMALL, bounded
  // set of unambiguous forms, and that recognition never touches a network call.
  //
  // Deliberately narrow - this is NOT a second intent-understanding layer. It only ever
  // recognizes a value when the surrounding words make the field unambiguous (an explicit label
  // - "risk", "entry", "stop", a known timeframe token, a known Session city name). A bare number
  // with no label is never claimed by this module; ambiguous multi-number sentences are left to
  // the model's own, real language understanding. See docs/ai/knowledge-base.md for how this
  // composes with model extraction in chat-dock-core.js's own merge step.

  // Persian-indic digits (۰-۹) -> plain ASCII, so "۴" parses as 4. Applied before every numeric
  // regex below - a real, common form NAVRYA's own Persian users type numbers in.
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function faToAsciiDigits(text) {
    return String(text || '').replace(/[۰-۹]/g, function (ch) { return String(FA_DIGITS.indexOf(ch)); });
  }

  function toNum(raw) {
    var n = parseFloat(String(raw).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // Found via real Journey E voice testing: a self-correcting message ("15 minutes... no, 5
  // minutes") was extracted as 15m, not 5m - every extractor below used a plain .exec(), which
  // only ever finds the FIRST match in the text. A self-correction states the user's real intent
  // LAST; extractDeterministicFields must agree with that (and with the model's own semantic
  // reading - see mergeWithModelFields()'s own comment on why deterministic wins the merge), or an
  // earlier, superseded value silently overrides what the user actually meant to say. Runs each
  // pattern with its own 'g' flag and returns whichever match (across every given pattern) starts
  // latest in the text.
  function lastRegexMatch(text, patterns) {
    var best = null;
    patterns.forEach(function (pattern) {
      var flags = pattern.flags.indexOf('g') > -1 ? pattern.flags : pattern.flags + 'g';
      var global = new RegExp(pattern.source, flags);
      var m;
      while ((m = global.exec(text))) {
        if (!best || m.index >= best.index) best = m;
        if (m.index === global.lastIndex) global.lastIndex++; // never loop forever on a zero-width match
      }
    });
    return best;
  }

  // ---- risk percentage: "risk to/of/at 4%", "4% risk", "ریسک ... ۴ درصد" ----
  var RISK_PATTERNS = [
    /risk\D{0,12}?(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\D{0,12}?risk/i
  ];
  var RISK_PATTERN_FA = /ریسک[^0-9]{0,12}?(\d+(?:\.\d+)?)\s*درصد/;

  function extractRiskPercent(text) {
    var m = lastRegexMatch(text, RISK_PATTERNS);
    if (m) { var n = toNum(m[1]); if (n !== null && n > 0) return n; }
    var mfa = lastRegexMatch(text, [RISK_PATTERN_FA]);
    if (mfa) { var nfa = toNum(mfa[1]); if (nfa !== null && nfa > 0) return nfa; }
    return null;
  }

  // ---- direction: long/short, buy/sell, EN + common FA trading transliterations ----
  var LONG_PATTERN = /\b(long|buy|bullish)\b/i;
  var SHORT_PATTERN = /\b(short|sell|bearish)\b/i;
  var LONG_PATTERN_FA = /لانگ|خرید/;
  var SHORT_PATTERN_FA = /شورت|فروش/;

  function extractDirection(text) {
    var isShort = SHORT_PATTERN.test(text) || SHORT_PATTERN_FA.test(text);
    var isLong = LONG_PATTERN.test(text) || LONG_PATTERN_FA.test(text);
    if (isLong && !isShort) return 'long';
    if (isShort && !isLong) return 'short';
    return null; // both or neither present - genuinely ambiguous, left to the model
  }

  // ---- entry/stop/target: only ever claimed when an explicit label word sits right next to
  // the number - never a bare number picked out of a sentence with several of them ----
  var LABEL_PATTERNS = {
    entryPrice: [/entry\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i, /(\d[\d,]*(?:\.\d+)?)\D{0,4}?entry/i],
    stopLoss: [/stop[\s-]?loss\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i, /\bstop\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i],
    takeProfits: [/take[\s-]?profit\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i, /\btarget\D{0,12}?(\d[\d,]*(?:\.\d+)?)/i, /\btp\D{0,6}?(\d[\d,]*(?:\.\d+)?)/i]
  };
  var LABEL_PATTERNS_FA = {
    entryPrice: [/(?:قیمت\s*)?ورود[^0-9]{0,12}?(\d[\d,]*(?:\.\d+)?)/],
    stopLoss: [/حد\s*ضرر[^0-9]{0,12}?(\d[\d,]*(?:\.\d+)?)/, /استاپ[^0-9]{0,12}?(\d[\d,]*(?:\.\d+)?)/],
    takeProfits: [/هدف[^0-9]{0,12}?(\d[\d,]*(?:\.\d+)?)/, /تارگت[^0-9]{0,12}?(\d[\d,]*(?:\.\d+)?)/]
  };

  function extractLabeledPrice(text, field) {
    var patterns = (LABEL_PATTERNS[field] || []).concat(LABEL_PATTERNS_FA[field] || []);
    var m = lastRegexMatch(text, patterns);
    if (m) { var n = toNum(m[1]); if (n !== null && n > 0) return n; }
    return null;
  }

  // ---- timeframes: the real TIMEFRAMES list (NewSessionDialog.jsx) plus natural phrasing ----
  var TIMEFRAME_TOKENS = ['5m', '15m', '1h', '4h', '1D'];
  var TIMEFRAME_WORD_PATTERN = /(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b/i;
  var TIMEFRAME_WORD_PATTERN_FA = /(\d+)\s*(دقیقه|ساعت|روز)/;

  function extractTimeframe(text) {
    var lower = text.toLowerCase();
    var tokenMatches = [];
    TIMEFRAME_TOKENS.forEach(function (token) {
      var re = new RegExp('\\b' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      var m;
      while ((m = re.exec(text))) tokenMatches.push({ index: m.index, token: token });
    });
    if (tokenMatches.length) {
      tokenMatches.sort(function (a, b) { return a.index - b.index; });
      return tokenMatches[tokenMatches.length - 1].token;
    }
    var m = lastRegexMatch(lower, [TIMEFRAME_WORD_PATTERN]);
    if (m) {
      var unit = /^m/.test(m[2]) ? 'm' : /^h/.test(m[2]) ? 'h' : 'D';
      var candidate = m[1] + unit;
      return TIMEFRAME_TOKENS.indexOf(candidate) > -1 ? candidate : null;
    }
    var mfa = lastRegexMatch(faToAsciiDigits(text), [TIMEFRAME_WORD_PATTERN_FA]);
    if (mfa) {
      var unitFa = mfa[2] === 'دقیقه' ? 'm' : mfa[2] === 'ساعت' ? 'h' : 'D';
      var candidateFa = mfa[1] + unitFa;
      return TIMEFRAME_TOKENS.indexOf(candidateFa) > -1 ? candidateFa : null;
    }
    return null;
  }

  // ---- known market/Session city names (NewSessionDialog.jsx's own SESSION_CITIES) ----
  var SESSION_CITIES = ['London', 'New York', 'Tokyo', 'Sydney'];
  var SESSION_CITY_ALIASES_FA = { 'نیویورک': 'New York', 'لندن': 'London', 'توکیو': 'Tokyo', 'سیدنی': 'Sydney' };

  function extractSessionCity(text) {
    var cityMatches = [];
    SESSION_CITIES.forEach(function (city) {
      var re = new RegExp(city.replace(/\s+/g, '\\s*'), 'gi');
      var m;
      while ((m = re.exec(text))) cityMatches.push({ index: m.index, city: city });
    });
    Object.keys(SESSION_CITY_ALIASES_FA).forEach(function (alias) {
      var idx = text.indexOf(alias);
      while (idx > -1) { cityMatches.push({ index: idx, city: SESSION_CITY_ALIASES_FA[alias] }); idx = text.indexOf(alias, idx + 1); }
    });
    if (!cityMatches.length) return null;
    cityMatches.sort(function (a, b) { return a.index - b.index; });
    return cityMatches[cityMatches.length - 1].city;
  }

  // context: {domain} - e.g. {domain:'trade'} narrows which fields are worth attempting (a
  // Session-creation turn has no reason to look for stopLoss). Omit for "try everything safe."
  // Returns a plain {path: value} map - only ever the fields it actually found, deterministically.
  function extractDeterministicFields(text, context) {
    var raw = String(text || '');
    if (!raw.trim()) return {};
    var normalized = faToAsciiDigits(raw);
    var domain = context && context.domain;
    var out = {};

    if (!domain || domain === 'trade') {
      var risk = extractRiskPercent(normalized);
      if (risk !== null) out.riskPercent = risk;
      var direction = extractDirection(normalized);
      if (direction) out.direction = direction;
      var entry = extractLabeledPrice(normalized, 'entryPrice');
      if (entry !== null) out.entryPrice = entry;
      var stop = extractLabeledPrice(normalized, 'stopLoss');
      if (stop !== null) out.stopLoss = stop;
      var target = extractLabeledPrice(normalized, 'takeProfits');
      if (target !== null) out.takeProfits = target;
    }
    if (!domain || domain === 'session') {
      var timeframe = extractTimeframe(normalized);
      if (timeframe) out.timeframe = timeframe;
      var city = extractSessionCity(raw);
      if (city) out.city = city;
    }
    return out;
  }

  // Merges a deterministic extraction on top of the model's own {path,value}[] fields array -
  // deterministic wins for any path it found (it is a direct, unambiguous parse of the user's own
  // literal words, more reliable than an LLM's interpretation for this narrow, well-defined set),
  // and fills in a path the model omitted entirely. Never removes a model-supplied field the
  // deterministic layer didn't itself recognize (e.g. linkedStrategyId, a genuinely
  // semantic/free-form value this module never attempts).
  function mergeWithModelFields(modelFields, text, context) {
    var deterministic = extractDeterministicFields(text, context);
    var byPath = {};
    (modelFields || []).forEach(function (f) { if (f && f.path) byPath[f.path] = f; });
    Object.keys(deterministic).forEach(function (path) {
      byPath[path] = { path: path, value: deterministic[path], mode: 'replace', source: 'deterministic' };
    });
    return Object.keys(byPath).map(function (path) { return byPath[path]; });
  }

  window.TradeJournalAIDeterministicExtraction = {
    extractDeterministicFields: extractDeterministicFields,
    mergeWithModelFields: mergeWithModelFields
  };
}());
