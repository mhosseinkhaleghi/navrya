(function () {
  'use strict';
  // Voice Command Learning Profile addendum, section 7. Holds exactly one thing: the most recent
  // submit ai-workflow-engine.js's own runSubmit() actually ran, and whether it succeeded - the
  // deliberately small, honest subset of a "canonical action receipt" this app's CURRENT submit()/
  // resultContext() contract can actually support (see ai-workflow-engine.js's own recordReceipt()
  // comment for why the full targetType/targetId/reversible/summary shape is not attempted here).
  //
  // A single last-receipt slot, not a history list: section 7's own eligibility rule is "the
  // LATEST eligible receipt only" - "do that again"/"that was right" always refer to the thing
  // that just happened, never an arbitrary older one, so there is nothing a list would add.
  var last = null;
  var RECEIPT_STALE_MS = 5 * 60 * 1000; // 5 minutes - long enough for a real "that was right" follow-up, short enough that a much later, unrelated remark can never reach back into it

  function makeReceiptId() { return 'receipt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function record(entry) {
    last = {
      receiptId: makeReceiptId(),
      actionId: entry.actionId,
      processId: entry.processId || null,
      known: entry.known || {},
      triggerText: entry.triggerText || null,
      riskLevel: entry.riskLevel || 'low',
      hasGate: !!entry.hasGate,
      // Known up front when this run was itself triggered by an already-enabled learned mapping
      // (Phase G's resolution-time match sets this directly); otherwise null until/unless a LATER
      // "remember this" approval creates a brand-new mapping and calls tagLearnedCommandId().
      learnedCommandId: entry.learnedCommandId || null,
      result: entry.result, // 'success' | 'failed' | 'cancelled' | 'unknown_outcome'
      startedAt: entry.startedAt || Date.now(),
      completedAt: Date.now()
    };
    // Section 8 (chat feedback buttons): the real submit this receipt describes almost always
    // finishes well AFTER the reply/popover for its own turn was already shown (scheduleSubmit()'s
    // own ~3s grace window in ai-workflow-engine.js) - a UI that wants to show feedback controls
    // once a receipt genuinely lands (never speculatively, before it exists) needs an event to
    // react to rather than polling. Fired for every record() call, not only eligible ones - a
    // listener is expected to re-check lastEligibleReceipt() itself before deciding to show anything.
    try { if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('tradejournal:action-receipt-recorded', { detail: { receiptId: last.receiptId } })); } catch (_) { /* best-effort */ }
    return last;
  }

  function tagLearnedCommandId(receiptId, learnedCommandId) {
    if (last && last.receiptId === receiptId) last.learnedCommandId = learnedCommandId || null;
  }

  function rawLast() { return last; }

  // The one real gate every consumer (reinforcement, "remember this", "do that again") must go
  // through - never read `last` directly. Excludes: anything that did not actually succeed
  // (nothing to reinforce or repeat), riskLevel 'high' or a declared confirmation gate (deletes,
  // publishes, messages, cancellations - "never auto-repeat/learn a destructive or consequential
  // action" per section 9's own exclusion list), and anything stale enough that a fresh remark
  // plausibly refers to something else entirely by now.
  function lastEligibleReceipt() {
    if (!last) return null;
    if (last.result !== 'success') return null;
    if (last.riskLevel === 'high' || last.hasGate) return null;
    if (Date.now() - last.completedAt > RECEIPT_STALE_MS) return null;
    return last;
  }

  function clear() { last = null; }

  window.TradeJournalAIActionReceipts = {
    record: record, tagLearnedCommandId: tagLearnedCommandId, lastEligibleReceipt: lastEligibleReceipt, rawLast: rawLast, clear: clear,
    RECEIPT_STALE_MS: RECEIPT_STALE_MS
  };
}());
