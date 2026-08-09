(function () {
  'use strict';
  // History for the global AI assistant dock (chat-dock-core.js), which previously had no
  // persistence at all - the transcript lived only in chatDockView.jsx's React state and was
  // lost on every close/reload. Deliberately much smaller than mental-health-store.js's sync
  // block (no offline migrate-or-adopt flag, no per-field merge) because this is a single
  // ever-growing, append-only log with no conflicting edits possible - "union of local and
  // server messages, deduped by id" is a correct merge for that shape, unlike a document with
  // independently-editable fields.
  var KEY = 'tradejournal:ai-chat-history:v1';

  function uid() { return 'aichat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var messages = raw ? JSON.parse(raw) : [];
      return Array.isArray(messages) ? messages : [];
    } catch (_) { return []; }
  }

  function writeLocal(messages) {
    localStorage.setItem(KEY, JSON.stringify(messages));
    window.dispatchEvent(new CustomEvent('tradejournal:ai-chat-history-changed'));
    return messages;
  }

  function currentUserId() {
    var switcher = window.TradeJournalDevUserSwitcher;
    return switcher ? switcher.currentUserId() : '';
  }

  function syncToServer(messages) {
    var uidValue = currentUserId();
    if (!uidValue) return;
    fetch('/api/sync/ai-chat-history', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uidValue },
      body: JSON.stringify({ messages: messages })
    }).catch(function () { /* offline - the local copy stands; next addMessage() retries the whole array */ });
  }

  // Called once per page load (see the bottom of this file) - fetches the server copy and
  // unions it with whatever is already local, deduped by id, so a message added on one device/
  // tab is visible after switching to another without ever dropping one added while offline.
  function reconcileFromServer() {
    var uidValue = currentUserId();
    if (!uidValue) return;
    fetch('/api/sync/ai-chat-history', { headers: { 'x-dev-user-id': uidValue } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (result) {
        if (!result || !Array.isArray(result.messages)) return;
        var local = load();
        var seen = {};
        var merged = [];
        local.concat(result.messages).forEach(function (message) {
          if (message && message.id && !seen[message.id]) { seen[message.id] = true; merged.push(message); }
        });
        merged.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
        writeLocal(merged);
      })
      .catch(function () { /* offline - the local cache stands as-is until the next reconnect */ });
  }

  function addMessage(role, content) {
    var messages = load();
    messages.push({ id: uid(), role: role, content: String(content || ''), createdAt: now() });
    writeLocal(messages);
    syncToServer(messages);
    return messages;
  }

  function clear() {
    writeLocal([]);
    syncToServer([]);
  }

  window.setTimeout(reconcileFromServer, 0);
  window.addEventListener('online', reconcileFromServer);

  window.TradeJournalAiChatHistoryStore = { load: load, addMessage: addMessage, clear: clear };
}());
