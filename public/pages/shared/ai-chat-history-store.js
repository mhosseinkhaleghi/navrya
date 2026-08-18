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
  async function startConversation(provider, questionText, answerText, tokens) {
    var messages = [{ role: 'user', content: questionText }, { role: 'assistant', content: answerText || '' }];
    var record = await request('POST', '/', { provider: provider, title: titleFrom(questionText), messages: messages, tokens: Math.max(0, Number(tokens) || 0) });
    notifyChanged();
    return record;
  }

  // Fetches the conversation's current messages, appends the new turn, and saves the whole array
  // back - keeps the caller's own contract to a single call, same as the old addExchange().
  async function appendExchange(id, questionText, answerText, tokens) {
    var current = await get(id);
    var messages = (current ? current.messages : []).concat([
      { role: 'user', content: questionText }, { role: 'assistant', content: answerText || '' }
    ]);
    var record = await request('PATCH', '/' + encodeURIComponent(id), { messages: messages, tokens: Math.max(0, Number(tokens) || 0) });
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
    listFor: listFor, get: get, startConversation: startConversation, appendExchange: appendExchange,
    remove: remove, clear: clear, titleFrom: titleFrom, snippetFrom: snippetFrom
  };
}());
