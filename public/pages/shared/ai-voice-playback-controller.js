(function () {
  'use strict';
  // Voice Mode performance pass (feature/voice-mode-performance): PlaybackController owns ONLY
  // assistant speech playback - nothing about business logic, workflows, or ChatDock state. Split
  // out of chatDockView.jsx's old voiceTurnQueue, which chained submit() (business/inference) and
  // speak() (playback) into a single serial promise per turn - meaning a SECOND already-finalized
  // transcript's own submit() could not even START until the FIRST turn's speech had finished
  // playing. TurnCoordinator (ai-voice-turn-coordinator.js) now owns submit() sequencing on its
  // own, independent timeline; this module owns speak() sequencing on its own, and the two are
  // connected only by chatDockView.jsx handing a finished turn's text to enqueue() - a
  // fire-and-forget call the business queue never awaits.
  //
  // Entries are tagged with an opaque `epoch` (the caller's own conversationEpoch, or any other
  // caller-defined generation counter) at enqueue time. invalidate() bumps the controller's own
  // internal epoch and drops every queued-but-not-yet-started entry without speaking it - used for
  // "the user has moved on" moments (New Chat, a reconnect, a newer correction) where a stale
  // reply must never be heard. interrupt() (barge-in, "Stop reply", teardown - see below) does the
  // same, plus stops whatever is playing right now.
  //
  // fix/voice-mode-turn-ux: this module is now also the SINGLE, controller-owned place a real
  // interruption is decided and the CURRENT entry is ever settled - never aiVoiceRealtime.js's own
  // transport-level interrupt() called directly by a caller (that was the original bug: a direct
  // call bypassed this queue entirely, leaving queued replies alive). It also now tracks real,
  // raw-event-driven playback lifecycle (notifyAudioBufferStarted/Stopped/Cleared, fed by
  // aiVoiceRealtime.js's own transport_event relay of output_audio_buffer.started/stopped/cleared)
  // instead of ever trusting the SDK's own high-level audio_stopped/audio_start, which are derived
  // from response.output_audio.done - a generation-complete signal, not a real "the browser has
  // finished playing the buffered audio" signal. See docs/ai/voice-architecture.md and this
  // module's own tests for the full reasoning.

  function createPlaybackController(options) {
    var opts = options || {};
    var speakFn = opts.speak; // (text) => Promise<void> - normally aiVoiceRealtime.js's own speak()
    var interruptFn = opts.interrupt; // () => void - normally aiVoiceRealtime.js's own interrupt()
    var onSettled = typeof opts.onSettled === 'function' ? opts.onSettled : function () {};
    // Fires exactly once per entry, the moment ITS OWN real output-audio buffer genuinely starts
    // (notifyAudioBufferStarted below) - never at enqueue time, never at speak()-call time. This is
    // what lets the caller (chatDockView.jsx) publish a caption exactly when that entry's audio is
    // actually about to be heard (Part C), rather than the instant a later business result becomes
    // ready while an earlier reply is still playing/queued.
    var onAudioStart = typeof opts.onAudioStart === 'function' ? opts.onAudioStart : function () {};
    var nextResponseId = 1;

    var queue = [];
    var current = null; // a clean, plain data entry - never mutated with internal bookkeeping fields
    // Internal bookkeeping for `current` only, kept OUT of the entry object itself so onSettled()/
    // onAudioStart() (which both spread `current` into a plain object for the caller) never leak a
    // closure/function reference. Cleared alongside `current` whenever it's reassigned.
    var currentInternal = null;
    var epoch = 0;

    function processNext() {
      if (current || !queue.length) return;
      var entry = queue.shift();
      if (entry.epoch !== epoch) {
        onSettled(Object.assign({}, entry, { spoken: false, skipped: true, reason: 'stale-epoch' }));
        processNext();
        return;
      }
      current = entry;
      var audioStarted = false;
      var settled = false;
      var interrupted = false;
      var settleOnce = function (spoken, reason) {
        if (settled || current !== entry) return; // idempotent - a real event AND the natural speak()-promise fallback can both race to call this
        settled = true;
        current = null;
        currentInternal = null;
        onSettled(Object.assign({}, entry, { spoken: spoken, reason: reason || null }));
        processNext();
      };
      currentInternal = {
        markAudioStarted: function () { if (audioStarted) return false; audioStarted = true; return true; },
        hasAudioStarted: function () { return audioStarted; },
        markInterrupted: function () { if (interrupted) return false; interrupted = true; return true; },
        settleOnce: settleOnce
      };
      var result;
      try {
        result = typeof speakFn === 'function' ? speakFn(entry.text) : Promise.resolve();
      } catch (_err) {
        settleOnce(false, 'error');
        return;
      }
      // Kept as a genuine safety net (never the primary settlement path any more - see
      // notifyAudioBufferStopped/Cleared/interrupt below) for a genuinely lost/never-fired raw
      // event: aiVoiceRealtime.js's own speak() still resolves this promise on the SDK's high-level
      // audio_stopped/audio_interrupted/error, or its own bounded 12s watchdog. settleOnce()'s own
      // `current !== entry` guard means this can NEVER fire late against a newer entry.
      Promise.resolve(result).then(
        function () { settleOnce(entry.epoch === epoch, entry.epoch === epoch ? null : 'stale-epoch'); },
        function () { settleOnce(false, 'error'); }
      );
    }

    // Opportunistic correlation only (per aiVoiceRealtime.js's own grounding against the installed
    // SDK: some output_audio_buffer.* events include a real response_id, some don't - see that
    // file's own comment). If EITHER side has no id to compare, this never blocks - the entry
    // identity check in every notify* function below (`current`/`currentInternal` already only
    // ever refer to the one truly active entry) is the real safety net; response_id is an
    // additional layer when the server happens to provide it, not the sole mechanism.
    function responseIdMatches(responseId) {
      if (!responseId || !current || !current.realtimeResponseId) return true;
      return String(responseId) === String(current.realtimeResponseId);
    }

    // Called once aiVoiceRealtime.js observes the real response.created event for the response
    // `current` is speaking - binds the two id spaces (this controller's own local 'resp-N' id,
    // used for caller-facing diagnostics, is left completely untouched) so later
    // notifyAudioBufferStarted/Stopped/Cleared calls can correlate against a real server id when
    // one is available. Only ever binds once per entry (a stale/duplicate response.created for an
    // already-bound entry is a no-op).
    function setCurrentResponseId(responseId) {
      if (!current || !responseId || current.realtimeResponseId) return;
      current.realtimeResponseId = responseId;
    }

    function notifyAudioBufferStarted(responseId) {
      if (!current || !currentInternal || !responseIdMatches(responseId)) return;
      if (!currentInternal.markAudioStarted()) return; // idempotent - a duplicate started event must never re-publish the caption
      onAudioStart(Object.assign({}, current));
    }

    function notifyAudioBufferStopped(responseId) {
      if (!current || !currentInternal || !responseIdMatches(responseId)) return;
      // Valid event ordering only (task requirement: started-before-stopped for the active
      // generation) - a stopped event for an entry that never even reported started is ignored
      // rather than treated as proof playback finished.
      if (!currentInternal.hasAudioStarted()) return;
      currentInternal.settleOnce(true, null);
    }

    function notifyAudioBufferCleared(responseId) {
      if (!current || !currentInternal || !responseIdMatches(responseId)) return;
      // 'cleared' is acknowledgement/telemetry for an interruption already handled synchronously
      // by interrupt() below - this is a defensive fallback for the case where a cleared event
      // genuinely arrives while `current` is still active for some other reason, never the primary
      // way a barge-in/stop-reply is noticed.
      currentInternal.settleOnce(false, 'cleared');
    }

    // interrupt() - the ONE controller-owned, idempotent interruption path for barge-in, the
    // "Stop reply" button, and teardown alike (fix/voice-mode-turn-ux). Settles the current entry
    // LOCALLY AND IMMEDIATELY - it never waits for a corresponding audio_interrupted/cleared event,
    // which the installed WebRTC transport is not guaranteed to ever send (see aiVoiceRealtime.js's
    // own grounding). Drops every not-yet-started queued entry (a barge-in/stop means the user has
    // moved on; nothing still queued should play after it).
    function interrupt() {
      var entry = current;
      var internal = currentInternal;
      if (entry && internal) {
        if (internal.markInterrupted() && typeof interruptFn === 'function') interruptFn();
      } else if (typeof interruptFn === 'function') {
        // Nothing local is actively playing right now - still call through for safety/idempotency
        // at the transport layer; aiVoiceRealtime.js's own interrupt() already no-ops harmlessly if
        // there is genuinely nothing to cancel.
        interruptFn();
      }
      var dropped = queue.splice(0, queue.length);
      dropped.forEach(function (e) { onSettled(Object.assign({}, e, { spoken: false, skipped: true, reason: 'interrupted' })); });
      if (entry && internal) internal.settleOnce(false, 'interrupted');
    }

    // enqueue(text, meta) - meta: any opaque caller data (turnId, connectionEpoch, caption, ...),
    // carried through unchanged to onSettled()/onAudioStart(). Returns the assigned responseId
    // (this controller's OWN local id, unrelated to the real server response id - see
    // setCurrentResponseId()). Never returns a Promise the caller is expected to await - this is
    // the whole point of splitting playback out.
    function enqueue(text, meta) {
      if (!text) return null;
      var responseId = 'resp-' + (nextResponseId++);
      var entry = Object.assign({}, meta, { text: text, epoch: epoch, responseId: responseId });
      queue.push(entry);
      processNext();
      return responseId;
    }

    // invalidate() - bump the epoch and interrupt current/queued playback. Use on New Chat,
    // conversation switch, disconnect, or any other "everything queued is now stale" moment.
    function invalidate() {
      epoch += 1;
      interrupt();
    }

    function isSpeaking() { return !!current; }
    function queueLength() { return queue.length; }
    function currentEpoch() { return epoch; }

    return {
      enqueue: enqueue, interrupt: interrupt, invalidate: invalidate,
      isSpeaking: isSpeaking, queueLength: queueLength, epoch: currentEpoch,
      notifyAudioBufferStarted: notifyAudioBufferStarted,
      notifyAudioBufferStopped: notifyAudioBufferStopped,
      notifyAudioBufferCleared: notifyAudioBufferCleared,
      setCurrentResponseId: setCurrentResponseId
    };
  }

  window.TradeJournalAIVoicePlaybackController = { create: createPlaybackController };
}());
