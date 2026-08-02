(function () {
  'use strict';

  function query(params) {
    var pairs = Object.keys(params || {}).filter(function (key) { return params[key] !== undefined && params[key] !== null && params[key] !== ''; })
      .map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function handle(response) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      if (!response.ok) {
        var error = new Error(body.error || 'COMMUNITY_REQUEST_FAILED');
        error.status = response.status; error.code = body.error;
        throw error;
      }
      return body;
    });
  }

  function request(method, path, body) {
    var switcher = window.TradeJournalDevUserSwitcher;
    var ready = switcher ? switcher.ensureUser() : Promise.resolve();
    return ready.then(function () {
      var headers = { 'Content-Type': 'application/json' };
      if (switcher) headers['x-dev-user-id'] = switcher.currentUserId();
      return fetch(path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined }).then(handle);
    });
  }

  function get(path) { return request('GET', path); }
  function post(path, body) { return request('POST', path, body || {}); }
  function patchRequest(path, body) { return request('PATCH', path, body || {}); }
  function del(path) { return request('DELETE', path); }

  window.TradeJournalCommunityStore = {
    listUsers: function () { return get('/api/users'); },
    getUser: function (id) { return get('/api/users/' + encodeURIComponent(id)); },

    listPosts: function (params) { return get('/api/community/posts' + query(params)); },
    createPost: function (data) { return post('/api/community/posts', data); },
    removePost: function (id) { return del('/api/community/posts/' + encodeURIComponent(id)); },
    listComments: function (postId) { return get('/api/community/posts/' + encodeURIComponent(postId) + '/comments'); },
    createComment: function (postId, content) { return post('/api/community/posts/' + encodeURIComponent(postId) + '/comments', { content: content }); },
    report: function (targetType, targetId, reason) { return post('/api/community/reports', { targetType: targetType, targetId: targetId, reason: reason }); },

    listListings: function (params) { return get('/api/marketplace/listings' + query(params)); },
    myListings: function () { return get('/api/marketplace/listings' + query({ mine: 'true' })); },
    findListingBySource: function (sourceId) {
      return get('/api/marketplace/listings/by-source/' + encodeURIComponent(sourceId)).catch(function (error) {
        if (error.status === 404) return null;
        throw error;
      });
    },
    getListing: function (id) { return get('/api/marketplace/listings/' + encodeURIComponent(id)); },
    createListing: function (data) { return post('/api/marketplace/listings', data); },
    updateListing: function (id, patch) { return patchRequest('/api/marketplace/listings/' + encodeURIComponent(id), patch); },
    purchaseListing: function (id) { return post('/api/marketplace/listings/' + encodeURIComponent(id) + '/purchase'); },
    listRatings: function (id) { return get('/api/marketplace/listings/' + encodeURIComponent(id) + '/ratings'); },
    rateListing: function (id, rating, reviewText) { return post('/api/marketplace/listings/' + encodeURIComponent(id) + '/ratings', { rating: rating, reviewText: reviewText }); },

    listThreads: function () { return get('/api/messages/threads'); },
    openThread: function (listingId) { return post('/api/messages/threads', { listingId: listingId }); },
    getThread: function (id) { return get('/api/messages/threads/' + encodeURIComponent(id)); },
    sendMessage: function (threadId, content) { return post('/api/messages/threads/' + encodeURIComponent(threadId) + '/messages', { content: content }); }
  };
}());
