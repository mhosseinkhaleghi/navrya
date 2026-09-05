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
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var nextTurnId = 1;
    var generation = 0;
    var resetReasons = {};

    var queue = Promise.resolve();

    function reasonFor(staleGeneration) {
      return resetReasons[staleGeneration] || 'stale-generation';
    }

    function isCurrent(meta) {
      if (!meta) return false;
      return meta.generation === generation && meta.epochAtEnqueue === getEpoch();
    }

    // A Promise cannot be forcibly detached from the chain it already belongs to. Resetting the
    // coordinator therefore creates a NEW generation with a fresh resolved queue: a replacement
    // turn dispatches immediately even if an abandoned provider request never settles. Every old
    // link checks its captured generation before calling submit() and again before publishing its
    // result, so the detached chain can neither execute a queued side effect nor surface a late
    // reply. The caller separately aborts the underlying request when it has an AbortController.
    function reset(reason) {
      resetReasons[generation] = reason || 'reset';
      generation += 1;
      queue = Promise.resolve();
      return generation;
    }

    // handleFinalTranscript(text, extraMeta) - assigns a turnId, enqueues submit() strictly after
    // the PREVIOUS turn's own submit() resolves (never after that previous turn's playback).
    // Returns the same Promise the internal queue link awaits, mainly for tests; callers are never
    // expected to await it themselves (onResult() is the real completion signal).
    function handleFinalTranscript(text, extraMeta) {
      var turnId = nextTurnId++;
      var epochAtEnqueue = getEpoch();
      var generationAtEnqueue = generation;
      var meta = Object.assign({}, extraMeta, {
        turnId: turnId,
        epochAtEnqueue: epochAtEnqueue,
        generation: generationAtEnqueue,
        queuedAt: now()
      });
      var turnPromise = queue.catch(function () {}).then(function () {
        if (generationAtEnqueue !== generation) {
          onResult(null, Object.assign({}, meta, {
            discarded: true,
            ok: false,
            reason: reasonFor(generationAtEnqueue)
          }));
          return null;
        }
        var submitResult;
        meta.routeAt = now();
        meta.submitStartedAt = meta.routeAt;
        try {
          submitResult = typeof submitFn === 'function' ? submitFn(text, meta) : null;
        } catch (syncError) {
          submitResult = Promise.reject(syncError);
        }
        return Promise.resolve(submitResult).then(
          function (result) {
            meta.submitEndedAt = now();
            var stillCurrent = isCurrent(meta);
            onResult(stillCurrent ? result : null, Object.assign({}, meta, {
              discarded: !stillCurrent,
              ok: true,
              reason: stillCurrent ? null : reasonFor(generationAtEnqueue)
            }));
            return result;
          },
          function (error) {
            meta.submitEndedAt = now();
            onResult(null, Object.assign({}, meta, {
              discarded: true,
              ok: false,
              error: error,
              reason: generationAtEnqueue === generation ? 'submit-failed' : reasonFor(generationAtEnqueue)
            }));
            return null;
          }
        );
      });
      queue = turnPromise.then(function () {}, function () {});
      return turnPromise;
    }

    return {
      handleFinalTranscript: handleFinalTranscript,
      reset: reset,
      generation: function () { return generation; },
      isCurrent: isCurrent
    };
  }

  window.TradeJournalAIVoiceTurnCoordinator = { create: createTurnCoordinator };
}());
