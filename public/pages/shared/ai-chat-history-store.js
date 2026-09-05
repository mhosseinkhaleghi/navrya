(function () {
  'use strict';
  // Real, server-synced, resumable conversations for the global AI assistant dock
  // (chat-dock-core.js) AND the AI Assistant screen's per-engine "Chat history" module - each
  // engine's list is still a client-side filter over the same server list, same split as before.
  // Replaces the old v2 local-only shape ("one dock question + its answer = one new disconnected
  // conversation card", localStorage-only) with real growing conversations backed by
  // /api/sync/ai-chat-history (server/community/routes.ai-chat-history.mjs,
  // 017_ai_conversations.sql) - real per-user auth now exists app-wide, so history follows the
  // trader across devices/browsers, matching real ChatGPT/Claude. No offline write-through cache
  // here (unlike the Section 7.18 sync-queue modules): there is no "offline chat" use case to
  // preserve - a sync failure just means history is temporarily unavailable, never that anything
  // already answered is lost, since the live conversation lives in the dock's own state until
  // it's saved.

  function snippetFrom(text) {
    var s = String(text || '').trim();
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  }
  function titleFrom(text) {
    var s = String(text || '').trim();
    return s.length > 60 ? s.slice(0, 60) + '…' : (s || 'Untitled conversation');
  }

  function authHeaders() {
    var switcher = window.TradeJournalDevUserSwitcher;
    var token = switcher && switcher.currentUserId();
    return token ? { 'Content-Type': 'application/json', 'x-dev-user-id': token } : null;
  }

  function notifyChanged() { window.dispatchEvent(new CustomEvent('tradejournal:ai-chat-history-changed')); }
  var pendingWrites = {};

  function newConversationId() {
    return 'aiConv-client-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function messagesForTurn(questionText, answerText, turnId) {
    var messages = [{ role: 'user', content: questionText }, { role: 'assistant', content: answerText || '' }];
    if (turnId) messages.forEach(function (message) { message.turnId = String(turnId); });
    return messages;
  }

  function enqueueWrite(id, work) {
    var previous = pendingWrites[id] || Promise.resolve();
    var task = previous.catch(function () { /* a prior best-effort write must not wedge later ones */ }).then(work);
    pendingWrites[id] = task;
    task.then(function () { if (pendingWrites[id] === task) delete pendingWrites[id]; }, function () { if (pendingWrites[id] === task) delete pendingWrites[id]; });
    return task;
  }

  async function request(method, path, body) {
    var headers = authHeaders();
    if (!headers) throw new Error('NOT_SIGNED_IN');
    var response = await fetch('/api/sync/ai-chat-history' + path, {
      method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (response.status === 204) return null;
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error((result && result.error) || 'AI_CHAT_HISTORY_REQUEST_FAILED');
    return result;
  }

  // Lightweight per-conversation summaries (no messages), filtered to one provider client-side -
  // the server already returns everything sorted newest-first.
  async function listFor(provider) {
    var result = await request('GET', '/');
    var all = (result && result.conversations) || [];
    return provider ? all.filter(function (c) { return c.provider === provider; }) : all;
  }

  async function get(id) { return request('GET', '/' + encodeURIComponent(id)); }

  // Creates the conversation with its first exchange already in it - called once, after the
  // dock's first successful reply in a fresh session.
  async function startConversation(provider, questionText, answerText, tokens, options) {
    var turnId = options && options.turnId;
    var conversationId = options && options.conversationId;
    var messages = messagesForTurn(questionText, answerText, turnId);
    var body = { provider: provider, title: titleFrom(questionText), messages: messages, tokens: Math.max(0, Number(tokens) || 0) };
    if (conversationId) body.id = String(conversationId);
    if (turnId) body.turnId = String(turnId);
    var write = function () { return request('POST', '/', body); };
    var record = conversationId ? await enqueueWrite(String(conversationId), write) : await write();
    notifyChanged();
    return record;
  }

  // Sends only this turn's own new messages - the server appends them onto the real, current
  // stored conversation atomically (jsonb concatenation server-side, see
  // routes.ai-chat-history.mjs/repo.pg.mjs's own comments), rather than this function first GETing
  // the conversation, concatenating client-side, and PATCHing the whole array back. That older
  // shape was a lost-update race: two near-simultaneous calls (two tabs, or a slow request
  // straddling a fast one) could each read the same base array and each overwrite the other's
  // appended turn. Sending only the delta removes the race entirely, and also removes the GET
  // round trip this used to make on every single ongoing-conversation turn.
  async function appendExchange(id, questionText, answerText, tokens, options) {
    var turnId = options && options.turnId;
    var newMessages = messagesForTurn(questionText, answerText, turnId);
    var body = { messages: newMessages, tokens: Math.max(0, Number(tokens) || 0) };
    if (turnId) body.turnId = String(turnId);
    var record = await enqueueWrite(String(id), function () { return request('PATCH', '/' + encodeURIComponent(id), body); });
    notifyChanged();
    return record;
  }

  async function remove(id) {
    await request('DELETE', '/' + encodeURIComponent(id));
    notifyChanged();
  }

  // Bulk "Clear" action (AI Assistant screen) - no dedicated bulk-delete route; conversation
  // counts per engine are small, so a sequential loop is simple and safe.
  async function clear(provider) {
    var conversations = await listFor(provider);
    for (var i = 0; i < conversations.length; i++) {
      await request('DELETE', '/' + encodeURIComponent(conversations[i].id));
    }
    notifyChanged();
  }

  window.TradeJournalAiChatHistoryStore = {
    listFor: listFor, get: get, startConversation: startConversation, appendExchange: appendExchange, newConversationId: newConversationId,
    remove: remove, clear: clear, titleFrom: titleFrom, snippetFrom: snippetFrom
  };
}());
