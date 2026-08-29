(function () {
  'use strict';
  // ai-conversation-matcher.js — Journey H2, Gate 2: the shared deterministic matching engine.
  //
  // Extracted out of ai-conversation-router.js (Gate 1) specifically so there is exactly ONE
  // matching implementation, used by all three real consumers: the production Router
  // (ai-conversation-router.js, browser), the admin Conversation Studio's Trigger Lab tester, and
  // server-side publish-time validation/collision checks. The server side loads this exact file
  // via `vm.runInNewContext` (server/community/conversation-matcher-bridge.mjs) - the same
  // technique this repo's own test suite already uses to run browser scripts under Node - so
  // there is no second copy of the scoring algorithm anywhere, byte-for-byte.
  //
  // Deliberately dependency-free: no window.TradeJournalAII18n, no TradeJournalTradeStore, no
  // TradeJournalAISurfaceContext. Pure functions operating on plain data the caller supplies -
  // normalize(text), matchScenarios(text, scenarios, surfaceContext), scenarioFromBundleRow(row),
  // renderTemplate(text, vars). See docs/ai/conversation-trigger-engine.md for the full design.

  // --- Multilingual normalization (unchanged from Gate 1) ---------------------------------------
  var FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function digitsToAscii(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var faIdx = FA_DIGITS.indexOf(ch);
      var arIdx = faIdx === -1 ? AR_DIGITS.indexOf(ch) : -1;
      if (faIdx !== -1) out += String(faIdx);
      else if (arIdx !== -1) out += String(arIdx);
      else out += ch;
    }
    return out;
  }
  var LETTER_VARIANTS = [
    [/ي/g, 'ی'], [/ك/g, 'ک'], [/ى/g, 'ی'], [/ة/g, 'ه']
  ];
  var ARABIC_DIACRITICS = /[ً-ْٰـ]/g;
  var ZWNJ_RE = /‌/g;
  var LATIN_ACCENTS = [
    [/[áàäâ]/g, 'a'], [/[éèëê]/g, 'e'], [/[íìïî]/g, 'i'], [/[óòöô]/g, 'o'], [/[úùüû]/g, 'u']
  ];
  var APOSTROPHE_RE = /['’‘]/g;
  var PUNCT_RE = /[!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~“”«»،؛؟٫٬…¡¿]/g;

  function collapseRepeats(text) { return text.replace(/(.)\1{2,}/g, '$1'); }

  function normalize(raw) {
    var text = String(raw === null || raw === undefined ? '' : raw);
    try { text = text.normalize('NFKC'); } catch (_e) { /* older engines: no-op */ }
    text = digitsToAscii(text);
    for (var i = 0; i < LETTER_VARIANTS.length; i++) text = text.replace(LETTER_VARIANTS[i][0], LETTER_VARIANTS[i][1]);
    text = text.replace(ARABIC_DIACRITICS, '');
    text = text.replace(ZWNJ_RE, ' ');
    text = text.toLowerCase();
    for (var j = 0; j < LATIN_ACCENTS.length; j++) text = text.replace(LATIN_ACCENTS[j][0], LATIN_ACCENTS[j][1]);
    text = text.replace(APOSTROPHE_RE, '');
    text = text.replace(PUNCT_RE, ' ');
    text = collapseRepeats(text);
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  // --- Scoring (unchanged from Gate 1) -----------------------------------------------------------
  var GROUP_FULL_SCORE = 70;
  var STRONG_PHRASE_BONUS = 40;
  var SURFACE_BOOST = 10;
  var HIGH_SCORE_THRESHOLD = 70;
  var HIGH_MARGIN_THRESHOLD = 20;
  var MEDIUM_SCORE_THRESHOLD = 35;

  function normalizeList(list) { return (list || []).map(normalize).filter(Boolean); }

  function scoreLanguageRule(normalizedText, rule) {
    var negativeTerms = normalizeList(rule && rule.negative);
    for (var n = 0; n < negativeTerms.length; n++) {
      if (normalizedText.indexOf(negativeTerms[n]) !== -1) return { score: 0, veto: true, reasons: ['negative:' + negativeTerms[n]] };
    }
    var groups = (rule && rule.groups) || [];
    var matched = 0;
    var reasons = [];
    for (var g = 0; g < groups.length; g++) {
      var terms = normalizeList(groups[g]);
      var hit = terms.some(function (term) { return normalizedText.indexOf(term) !== -1; });
      if (hit) { matched++; reasons.push('group' + g); }
    }
    var groupScore = groups.length ? (matched / groups.length) * GROUP_FULL_SCORE : 0;
    var strongTerms = normalizeList(rule && rule.strong);
    var strongHit = strongTerms.some(function (term) { return normalizedText.indexOf(term) !== -1; });
    if (strongHit) reasons.push('strong-phrase');
    return { score: groupScore + (strongHit ? STRONG_PHRASE_BONUS : 0), veto: false, reasons: reasons, matchedGroups: matched, totalGroups: groups.length };
  }

  function scoreScenario(scenario, normalizedText, surfacePage) {
    var bestScore = 0;
    var bestReasons = [];
    var languages = scenario.languages || {};
    Object.keys(languages).forEach(function (lang) {
      var result = scoreLanguageRule(normalizedText, languages[lang]);
      if (!result.veto && result.score > bestScore) { bestScore = result.score; bestReasons = result.reasons.map(function (r) { return lang + ':' + r; }); }
    });
    if (bestScore > 0 && surfacePage && scenario.surfaceBoost && scenario.surfaceBoost.indexOf(surfacePage) !== -1) {
      bestScore += SURFACE_BOOST;
      bestReasons = bestReasons.concat(['surface-boost:' + surfacePage]);
    }
    return { scenario: scenario, score: bestScore, reasons: bestReasons };
  }

  function confidenceBand(score, margin) {
    if (score >= HIGH_SCORE_THRESHOLD && margin >= HIGH_MARGIN_THRESHOLD) return 'HIGH';
    if (score >= MEDIUM_SCORE_THRESHOLD) return 'MEDIUM';
    return 'LOW';
  }

  // The single entry point every consumer (Router, Trigger Lab, publish validation) calls.
  // `scenarios` is an array of flattened scenario configs (see scenarioFromBundleRow below) -
  // this function has zero knowledge of how they were persisted or fetched.
  function matchScenarios(text, scenarios, surfaceContext) {
    var normalizedText = normalize(text);
    var surfacePage = (surfaceContext && surfaceContext.page) ? String(surfaceContext.page).toLowerCase() : null;
    if (!normalizedText) {
      return { normalizedText: normalizedText, candidates: [], winner: null, confidenceBand: 'LOW', scoreMargin: 0 };
    }
    var candidates = (scenarios || [])
      .map(function (scenario) { return scoreScenario(scenario, normalizedText, surfacePage); })
      .filter(function (c) { return c.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
    var winner = candidates[0] || null;
    var runnerUpScore = candidates[1] ? candidates[1].score : 0;
    var margin = winner ? winner.score - runnerUpScore : 0;
    var band = confidenceBand(winner ? winner.score : 0, margin);
    return { normalizedText: normalizedText, candidates: candidates, winner: winner, confidenceBand: band, scoreMargin: margin };
  }

  // Flattens one published-bundle row (server/community/routes.conversation-scenarios-sync.mjs's
  // own shape - {id, scenarioKey, domain, kind, dataQueryRef, ctaActionId, allowedProcesses,
  // allowedSteps, publishedVersion, definition:{surfaceBoost, languages, responses}}) into the
  // flat shape matchScenarios()/the Router actually score against. `scenarioKey` (the stable,
  // human-chosen id like 'session.purpose'), never the generated DB row id, is what every
  // consumer (debug output, tests, CTA metadata) reports as "the scenario" - matching this
  // engine's pre-Studio (Gate 1) contract exactly.
  function scenarioFromBundleRow(row) {
    var definition = (row && row.definition) || {};
    return {
      scenarioKey: row.scenarioKey, domain: row.domain, kind: row.kind,
      dataQueryRef: row.dataQueryRef || null, ctaActionId: row.ctaActionId || null,
      allowedProcesses: row.allowedProcesses || null, allowedSteps: row.allowedSteps || null,
      surfaceBoost: definition.surfaceBoost || null, languages: definition.languages || {}, responses: definition.responses || {},
      // Journey H2, Gate 3: {[language]: {[variantKey]: {url, mimeType, durationMs}}} - only ever
      // present for an approved, hash-current asset (the server already enforces this before the
      // bundle is ever built) - a missing entry here always means "no published audio," never an
      // error.
      audio: (row && row.audio) || {}
    };
  }

  // Safe template substitution (spec section 23/26): only ever replaces `{varName}` for a name
  // explicitly present in `vars` - never arbitrary object traversal, never an expression, never
  // JS. A name with no matching key in `vars` is left as literal text (never silently blanked),
  // so a misconfigured scenario fails loudly and visibly rather than rendering a hole.
  function renderTemplate(text, vars) {
    var source = String(text === null || text === undefined ? '' : text);
    var values = vars || {};
    return source.replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match;
    });
  }

  // Every `{word}` placeholder actually referenced in a response string, for publish-time
  // validation (spec section 29: "Invalid template variable" blocks publish) - never trusts an
  // author-declared list, always derived from the real text.
  function templateVariablesIn(text) {
    var names = [];
    String(text || '').replace(/\{(\w+)\}/g, function (match, name) { if (names.indexOf(name) === -1) names.push(name); return match; });
    return names;
  }

  window.TradeJournalAIConversationMatcher = {
    normalize: normalize, matchScenarios: matchScenarios, scenarioFromBundleRow: scenarioFromBundleRow,
    renderTemplate: renderTemplate, templateVariablesIn: templateVariablesIn,
    HIGH_SCORE_THRESHOLD: HIGH_SCORE_THRESHOLD, HIGH_MARGIN_THRESHOLD: HIGH_MARGIN_THRESHOLD, MEDIUM_SCORE_THRESHOLD: MEDIUM_SCORE_THRESHOLD
  };
}());
