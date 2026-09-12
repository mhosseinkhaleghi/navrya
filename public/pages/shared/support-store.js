(function () {
  'use strict';

  // Fetch wrapper for the Support Tickets domain (/api/sync/support-tickets) - same shape as
  // community-store.js's own request()/get()/post() helpers, minus the legacy x-dev-user-id
  // header (auth-real.mjs never reads it; real identity rides on the session cookie
  // automatically, CSRF via csrf-fetch-patch.js), since this is a newer, real-session-only domain
  // with no dev-mode precedent to stay compatible with.
  function handle(response) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      if (!response.ok) {
        var error = new Error(body.error || 'SUPPORT_REQUEST_FAILED');
        error.status = response.status; error.code = body.error;
        throw error;
      }
      return body;
    });
  }
  function get(path) { return fetch(path).then(handle); }
  function post(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(handle); }

  // Every mutation dispatches this - character-app.jsx's badge poller listens for it as one of
  // its "relevant mutation" refresh triggers (spec section C.1), alongside its own 30s poll.
  function notifyChanged() { window.dispatchEvent(new CustomEvent('tradejournal:support-ticket-changed')); }

  window.TradeJournalSupportStore = {
    listTickets: function () { return get('/api/sync/support-tickets'); },
    createTicket: function (data) { return post('/api/sync/support-tickets', data).then(function (r) { notifyChanged(); return r; }); },
    getTicket: function (id) { return get('/api/sync/support-tickets/' + encodeURIComponent(id)).then(function (r) { notifyChanged(); return r; }); },
    // `data`: { message, images, videos } - images/videos are optional arrays of data URLs,
    // same shape createTicket() accepts.
    replyToTicket: function (id, data) { return post('/api/sync/support-tickets/' + encodeURIComponent(id) + '/messages', data).then(function (r) { notifyChanged(); return r; }); },
    closeTicket: function (id) { return post('/api/sync/support-tickets/' + encodeURIComponent(id) + '/close').then(function (r) { notifyChanged(); return r; }); }
  };
}());
