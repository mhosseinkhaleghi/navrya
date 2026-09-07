(function () {
  'use strict';
  // Context-aware conversational operation layer, section 4: a validated pending-clarification
  // contract for the conversation coordinator (chat-dock-core.js's own sendChat()). Deliberately
  // its own small, single-slot state module - the SAME established pattern this codebase already
  // uses twice for a different kind of "waiting on the user's very next reply" state
  // (ai-workflow-engine.js's own `current` multi-turn action slot; ai-proactive-engine.js's own
  // `pending` risk-override confirmation slot) - never folded into either of those, since a
  // pending clarification is a genuinely different kind of state again (which ACTION/ENTITY is
  // still undetermined, not "which required fields are still missing" or "which risk field is
  // being held back"). chat-dock-core.js (the real conversation coordinator - it owns
  // conversationId, chatHistory, and sendChat() itself) is the ONLY caller that ever stages,
  // reads, resolves, or clears this state; nothing else touches it directly.
  //
  // A reply such as "yes", "no", "the gold trade", or "the second one" answers THIS pending
  // clarification deterministically - it must never re-run generic action discovery (a plain
  // "yes" is not itself a real action id or entity name any discovery schema could ever match).

  var TTL_MS = 2 * 60 * 1000; // two minutes - long enough for a real human reply, short enough that a genuinely abandoned clarification never lingers into an unrelated later turn.

  var pending = null;
  var nextLocalTurnId = 1; // monotonic fallback turnId for a typed turn, which has no real voice-turn-coordinator turnId of its own.

  function now() { return Date.now(); }
  function nowIso() { return new Date().toISOString(); }

  // candidateEntities: [{id, label}] - a SAFE label only (e.g. a Trade's own direction+instrument,
  // never a raw store object) - matches the "safe labels" requirement verbatim; the caller decides
  // what "safe" means for its own domain (see chat-dock-core.js's own tradeCandidateLabel()).
  function stage(data) {
    var d = data || {};
    pending = {
      clarificationId: 'clar-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      conversationId: d.conversationId || null,
      conversationEpoch: d.conversationEpoch !== undefined ? d.conversationEpoch : null,
      originatingTurnId: d.originatingTurnId !== undefined ? d.originatingTurnId : (nextLocalTurnId++),
      originalUtterance: String(d.originalUtterance || ''),
      candidateActionIds: Array.isArray(d.candidateActionIds) ? d.candidateActionIds.slice() : [],
      candidateEntities: Array.isArray(d.candidateEntities) ? d.candidateEntities.map(function (e) { return { id: e.id, label: e.label }; }) : [],
      knownFields: Object.assign({}, d.knownFields || {}),
      question: String(d.question || ''),
      kind: d.kind || 'generic', // caller-defined discriminator (e.g. 'trade-emotion-consent', 'trade-emotion-select') so the resolver knows what a plain 'confirm' means for THIS clarification
      processId: d.processId || null, // the real registered process this clarification is about, if any - used to invalidate when that form closes
      createdAt: nowIso(),
      expiresAt: new Date(now() + (d.ttlMs || TTL_MS)).toISOString(),
      status: 'pending'
    };
    return pending;
  }

  function isExpired(record) {
    if (!record) return true;
    return new Date(record.expiresAt).getTime() <= now();
  }

  // The caller must call this (or getValid()) at the top of every turn before deciding whether a
  // pending clarification is still live - a stale one is treated exactly like there being none at
  // all, never silently answered against.
  function pruneIfExpired() {
    if (pending && isExpired(pending)) pending = null;
    return pending;
  }

  function getValid() { return pruneIfExpired(); }

  function clear() { pending = null; }

  // Explicit invalidation triggers (section 4): a new conversation starting, Voice Mode ending,
  // the user cancelling, the relevant form closing, the entity changing incompatibly, or the
  // request/turn losing ownership. Each is a plain predicate the caller evaluates with information
  // only IT has (chat-dock-core.js already resolves conversationId/currentWorkflow/
  // activeOpenProcess fresh every turn) - this module only enforces the invariant once told.
  //
  // - conversationId mismatch: a new conversation started.
  // - processId given and the real registered process no longer reports itself open: the relevant
  //   form closed.
  // - explicit cancel: the user said so, or Voice Mode ended (the caller calls clear() directly).
  function invalidateIfStale(context) {
    if (!pending) return null;
    var ctx = context || {};
    if (ctx.conversationId !== undefined && pending.conversationId !== null && ctx.conversationId !== pending.conversationId) { clear(); return null; }
    if (pending.processId && ctx.processRegistry && typeof ctx.processRegistry.query === 'function') {
      var q = ctx.processRegistry.query(pending.processId);
      if (!q || !q.open) { clear(); return null; }
    }
    return pruneIfExpired();
  }

  // --- Deterministic reply interpretation - never the model's own free-form judgment (mirrors
  // ai-proactive-engine.js's own interpretConfirmationText() reasoning: NAVRYA must know exactly
  // what is being confirmed). Reuses that exact same yes/no vocabulary (not a second, drifting
  // copy) for the plain confirm/reject half; adds ordinal ("the second one") and label
  // ("the gold trade") selection on top for a clarification with real candidateEntities. ---

  var ORDINAL_WORDS_EN = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5 };
  var ORDINAL_WORDS_FA = { 'اولی': 1, 'اول': 1, 'دومی': 2, 'دوم': 2, 'سومی': 3, 'سوم': 3, 'چهارمی': 4, 'چهارم': 4, 'پنجمی': 5, 'پنجم': 5 };
  var ORDINAL_NUMBER_PATTERN = /\b(?:number|#)\s*(\d+)\b/i;
  var ORDINAL_NUMBER_PATTERN_FA = /شماره\s*(\d+)/;

  function findOrdinalIndex(text) {
    var t = String(text || '').toLowerCase();
    var word;
    for (word in ORDINAL_WORDS_EN) { if (Object.prototype.hasOwnProperty.call(ORDINAL_WORDS_EN, word) && new RegExp('\\b' + word + '\\b', 'i').test(t)) return ORDINAL_WORDS_EN[word]; }
    for (word in ORDINAL_WORDS_FA) { if (Object.prototype.hasOwnProperty.call(ORDINAL_WORDS_FA, word) && t.indexOf(word) > -1) return ORDINAL_WORDS_FA[word]; }
    var m = ORDINAL_NUMBER_PATTERN.exec(t) || ORDINAL_NUMBER_PATTERN_FA.exec(t);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  // Case-insensitive match against each candidate's own safe label - either a full substring
  // either direction, OR a shared significant word (>= 3 chars, so "the XAUUSD one" still matches
  // a "long XAUUSD" label without requiring the whole label verbatim) - the same "never guess"
  // contract as every real entity-resolution action in this app (F53): zero or more than one
  // candidate matching is ambiguous, never resolved.
  function significantWords(value) {
    return String(value || '').toLowerCase().split(/[^a-z0-9؀-ۿ]+/i).filter(function (w) { return w.length >= 3; });
  }
  function findLabelMatch(text, candidates) {
    var needle = String(text || '').trim().toLowerCase();
    if (!needle) return null;
    var needleWords = significantWords(needle);
    var matches = (candidates || []).filter(function (c) {
      var label = String(c.label || '').toLowerCase();
      if (!label) return false;
      if (label.indexOf(needle) > -1 || needle.indexOf(label) > -1) return true;
      var labelWords = significantWords(label);
      return labelWords.some(function (w) { return needleWords.indexOf(w) > -1; });
    });
    return matches.length === 1 ? matches[0] : null;
  }

  // Returns one of:
  //   { decision: 'confirm' }                          - a plain yes, for a consent-only clarification
  //   { decision: 'reject' }                            - a plain no
  //   { decision: 'select', entity: {id,label} }        - the user identified one specific candidate (ordinal or label/name)
  //   null                                              - ambiguous or unrelated - the caller must ask again, never guess
  function interpretReply(text, record) {
    var t = String(text || '').trim();
    if (!t || !record) return null;
    var candidates = record.candidateEntities || [];
    if (candidates.length > 1) {
      var ordinal = findOrdinalIndex(t);
      if (ordinal !== null && ordinal >= 1 && ordinal <= candidates.length) return { decision: 'select', entity: candidates[ordinal - 1] };
      var byLabel = findLabelMatch(t, candidates);
      if (byLabel) return { decision: 'select', entity: byLabel };
    } else if (candidates.length === 1) {
      // A single-candidate clarification ("is this about your open XAUUSD trade?") is answered by
      // plain yes/no, exactly like a consent-only one - selecting it by name/ordinal still works
      // too (a user may answer either way), but is not required.
      var byLabelSingle = findLabelMatch(t, candidates);
      if (byLabelSingle) return { decision: 'select', entity: byLabelSingle };
    }
    var proactiveEngine = window.TradeJournalAIProactiveEngine;
    var yesNo = proactiveEngine && typeof proactiveEngine.interpretConfirmationText === 'function' ? proactiveEngine.interpretConfirmationText(t) : null;
    if (yesNo === 'confirm') return { decision: 'confirm' };
    if (yesNo === 'reject') return { decision: 'reject' };
    return null;
  }

  window.TradeJournalAIClarificationState = {
    stage: stage,
    getValid: getValid,
    pruneIfExpired: pruneIfExpired,
    clear: clear,
    invalidateIfStale: invalidateIfStale,
    interpretReply: interpretReply,
    isExpired: isExpired
  };
}());
