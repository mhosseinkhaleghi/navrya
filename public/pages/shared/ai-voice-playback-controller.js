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
  // reply must never be heard. interrupt() (barge-in) does the same, plus stops whatever is
  // playing right now via the injected interrupt() (aiVoiceRealtime.js's own guarded interrupt(),
  // which already settles the underlying speak() promise promptly on a real 'audio_interrupted'
  // event - see that file's own comment).

  function createPlaybackController(options) {
    var opts = options || {};
    var speakFn = opts.speak; // (text) => Promise<void> - normally aiVoiceRealtime.js's own speak()
    var interruptFn = opts.interrupt; // () => void - normally aiVoiceRealtime.js's own interrupt()
    var onSettled = typeof opts.onSettled === 'function' ? opts.onSettled : function () {};
    var nextResponseId = 1;

    var queue = [];
    var current = null;
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
      var settleOnce = function (spoken, reason) {
        if (current !== entry) return; // already settled by a concurrent path (shouldn't happen, defensive)
        current = null;
        onSettled(Object.assign({}, entry, { spoken: spoken, reason: reason || null }));
        processNext();
      };
      var result;
      try {
        result = typeof speakFn === 'function' ? speakFn(entry.text) : Promise.resolve();
      } catch (_err) {
        settleOnce(false, 'error');
        return;
      }
      Promise.resolve(result).then(
        function () { settleOnce(entry.epoch === epoch, entry.epoch === epoch ? null : 'stale-epoch'); },
        function () { settleOnce(false, 'error'); }
      );
    }

    // enqueue(text, meta) - meta: any opaque caller data (turnId, connectionEpoch, ...), carried
    // through unchanged to onSettled(). Returns the assigned responseId. Never returns a Promise
    // the caller is expected to await - this is the whole point of splitting playback out.
    function enqueue(text, meta) {
      if (!text) return null;
      var responseId = 'resp-' + (nextResponseId++);
      var entry = Object.assign({}, meta, { text: text, epoch: epoch, responseId: responseId });
      queue.push(entry);
      processNext();
      return responseId;
    }

    // interrupt() - stop current playback immediately and drop every not-yet-started queued
    // entry (a barge-in means the user has moved on; nothing still queued should play after it).
    function interrupt() {
      if (typeof interruptFn === 'function') interruptFn();
      var dropped = queue.splice(0, queue.length);
      dropped.forEach(function (entry) { onSettled(Object.assign({}, entry, { spoken: false, skipped: true, reason: 'interrupted' })); });
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
      isSpeaking: isSpeaking, queueLength: queueLength, epoch: currentEpoch
    };
  }

  window.TradeJournalAIVoicePlaybackController = { create: createPlaybackController };
}());
