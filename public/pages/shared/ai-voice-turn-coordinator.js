(function () {
  'use strict';
  // Voice Mode performance pass (feature/voice-mode-performance): TurnCoordinator owns sequencing
  // of finalized voice turns through the business pipeline (submit() -> chat-dock-core.js's
  // sendChat() -> Context Engine/Action Registry/Workflow Engine/Proactive Engine - the SAME
  // pipeline a typed message already uses). It serializes submit() calls relative to EACH OTHER
  // ONLY, never against playback (see ai-voice-playback-controller.js) - preserving the
  // pre-existing "one utterance -> one Copilot turn" guarantee (two finalized transcripts racing
  // sendChat()'s own "is a workflow already open" check produced duplicate action-discovery turns
  // before chatDockView.jsx's old voiceTurnQueue existed - see docs/ai/voice-architecture.md) while
  // removing the coupling that made an already-finalized SECOND turn wait for the FIRST turn's own
  // speech to finish playing before its own submit() even started.
  //
  // getEpoch()/turnId: every turn is stamped with the caller's own conversationEpoch (read fresh
  // both when the turn is enqueued and again once submit() resolves) and a locally-assigned,
  // monotonic turnId. If the epoch changed while submit() was in flight - New Chat, a conversation
  // switch, anything that means "the user has moved on" - onResult() is still called (so the
  // caller can log/clean up), but with `discarded: true` and a null result, so a stale reply can
  // never mutate the new conversation's transcript/UI or reach the playback queue.

  function createTurnCoordinator(options) {
    var opts = options || {};
    var submitFn = opts.submit; // (text, meta) => Promise<result>
    var onResult = typeof opts.onResult === 'function' ? opts.onResult : function () {};
    var getEpoch = typeof opts.getEpoch === 'function' ? opts.getEpoch : function () { return 0; };
    var nextTurnId = 1;

    var queue = Promise.resolve();

    // handleFinalTranscript(text, extraMeta) - assigns a turnId, enqueues submit() strictly after
    // the PREVIOUS turn's own submit() resolves (never after that previous turn's playback).
    // Returns the same Promise the internal queue link awaits, mainly for tests; callers are never
    // expected to await it themselves (onResult() is the real completion signal).
    function handleFinalTranscript(text, extraMeta) {
      var turnId = nextTurnId++;
      var epochAtEnqueue = getEpoch();
      var meta = Object.assign({}, extraMeta, { turnId: turnId, epochAtEnqueue: epochAtEnqueue });
      var turnPromise = queue.catch(function () {}).then(function () {
        var submitResult;
        try {
          submitResult = typeof submitFn === 'function' ? submitFn(text, meta) : null;
        } catch (syncError) {
          submitResult = Promise.reject(syncError);
        }
        return Promise.resolve(submitResult).then(
          function (result) {
            var stillCurrent = getEpoch() === epochAtEnqueue;
            onResult(stillCurrent ? result : null, Object.assign({}, meta, { discarded: !stillCurrent, ok: true }));
            return result;
          },
          function (error) {
            onResult(null, Object.assign({}, meta, { discarded: true, ok: false, error: error }));
            return null;
          }
        );
      });
      queue = turnPromise.then(function () {}, function () {});
      return turnPromise;
    }

    return { handleFinalTranscript: handleFinalTranscript };
  }

  window.TradeJournalAIVoiceTurnCoordinator = { create: createTurnCoordinator };
}());
