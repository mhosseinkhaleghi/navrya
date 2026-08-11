(function () {
  'use strict';
  // History for the global AI assistant dock (chat-dock-core.js) AND the AI Assistant screen's
  // per-engine "Chat history" module - each engine keeps its own list of titled conversation
  // cards (not one flat cross-engine message log). v2 replaces the v1 shape (a single
  // ever-growing { role, content } log with no engine or conversation boundary at all) -
  // deliberately not migrated: the shapes are fundamentally different (one flat log vs many
  // titled per-engine threads) and v1's raw log was never itself a resumable unit the user could
  // recognise, so a one-time reset here costs nothing real. No server sync: no server route for
  // this ever existed (the old v1 sync calls always 404'd silently), so this stays local-only,
  // same as ai-settings-store.js/ai-usage-store.js.
  var KEY = 'tradejournal:ai-chat-history:v2';

  function uid() { return 'aichat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function today() { return new Date().toISOString().slice(0, 10); }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_) { return {}; }
  }

  function write(all) {
    localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('tradejournal:ai-chat-history-changed'));
    return all;
  }

  function listFor(provider) {
    var all = load();
    return Array.isArray(all[provider]) ? all[provider] : [];
  }

  function snippetFrom(text) {
    var s = String(text || '').trim();
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  }
  function titleFrom(text) {
    var s = String(text || '').trim();
    return s.length > 60 ? s.slice(0, 60) + '…' : (s || 'Untitled conversation');
  }

  // One dock question + its answer = one new conversation card, prepended - mirrors the design
  // handoff's interaction contract exactly ("Ask from the ChatDock" appends a new conversation),
  // not a single growing thread.
  function addExchange(provider, question, answerText, speakerLabel, tokens) {
    var all = load();
    var list = Array.isArray(all[provider]) ? all[provider] : [];
    var entry = {
      id: uid(), title: titleFrom(question), snippet: snippetFrom(answerText || question),
      date: today(), messages: 2, tokens: Math.max(0, Number(tokens) || 0),
      lines: [{ who: 'TRADER', text: question }, { who: String(speakerLabel || provider).toUpperCase(), text: answerText || '' }]
    };
    all[provider] = [entry].concat(list);
    write(all);
    return entry;
  }

  // The AI Assistant screen's manual "New conversation" button - an empty draft card, opened
  // straight away so the trader can see it before anything has been asked yet.
  function newDraft(provider, systemLine) {
    var all = load();
    var list = Array.isArray(all[provider]) ? all[provider] : [];
    var entry = {
      id: uid(), title: 'Untitled conversation', snippet: systemLine || '', date: today(), messages: 0, tokens: 0,
      lines: systemLine ? [{ who: 'NAVRYA', text: systemLine }] : []
    };
    all[provider] = [entry].concat(list);
    write(all);
    return entry;
  }

  function remove(provider, id) {
    var all = load();
    var list = Array.isArray(all[provider]) ? all[provider] : [];
    all[provider] = list.filter(function (c) { return c.id !== id; });
    write(all);
  }

  function clear(provider) {
    var all = load();
    all[provider] = [];
    write(all);
  }

  window.TradeJournalAiChatHistoryStore = {
    load: load, listFor: listFor, addExchange: addExchange, newDraft: newDraft, remove: remove, clear: clear
  };
}());
