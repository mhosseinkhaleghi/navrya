(function () {
  'use strict';
  var i18n = window.TradeJournalCommunityI18n;
  var store = window.TradeJournalCommunityStore;
  var switcher = window.TradeJournalDevUserSwitcher;
  var layer = window.TradeJournalPanelLayer;
  if (!i18n || !store || !switcher || !layer) return;

  var MAX_IMAGE_BYTES = 15 * 1024 * 1024; // mirrors session-entry-flow.js's existing client-side cap

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i', 'tj-icon'); node.dataset.lucide = name; return node; }
  function button(label, className, iconName) { var b = el('button', className || '', label); b.type = 'button'; if (iconName) b.prepend(ico(iconName)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }

  function modal(className, title) {
    var back = el('div', 'tj-modal-backdrop'), box = el('section', 'tj-modal ' + (className || '')), head = el('header', 'tj-modal-head'), h = el('h2', '', title), close = button('', 'tj-icon-button', 'x'), closed = false, nativeRemove = back.remove.bind(back);
    back.dir = i18n.direction(); back.setAttribute('role', 'presentation'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    close.dataset.tjClose = ''; close.setAttribute('aria-label', i18n.t('close'));
    function destroy(event) { if (event) { event.preventDefault(); event.stopPropagation(); } if (closed) return; closed = true; document.removeEventListener('keydown', escape, true); nativeRemove(); }
    function escape(event) { if (event.key === 'Escape') destroy(event); }
    back.remove = destroy;
    close.addEventListener('click', destroy, true);
    back.addEventListener('click', function (event) { if (event.target === back) destroy(event); });
    box.addEventListener('click', function (event) { event.stopPropagation(); });
    document.addEventListener('keydown', escape, true);
    head.append(h, close); box.append(head); back.append(box); document.body.append(back);
    window.setTimeout(function () { try { close.focus({ preventScroll: true }); } catch (_) { close.focus(); } }, 0);
    icons(back);
    return { back: back, box: box, close: close, destroy: destroy };
  }

  function reportFlow(targetType, targetId) {
    var m = modal('tj-report-modal', i18n.t('reportAction'));
    var reasonInput = document.createElement('textarea'); reasonInput.rows = 3; reasonInput.placeholder = i18n.t('reportReasonPlaceholder');
    var actions = el('footer', 'tj-modal-actions');
    var submit = button(i18n.t('reportSubmit'), 'tj-primary', 'flag');
    submit.onclick = function () {
      var reason = reasonInput.value.trim();
      if (!reason) { reasonInput.focus(); return; }
      store.report(targetType, targetId, reason).then(function () { toast(i18n.t('reportSubmitted'), 'success'); m.back.remove(); }).catch(function (error) { toast(error.code || 'FAILED', 'danger'); });
    };
    actions.append(submit);
    m.box.append(reasonInput, actions);
    icons(m.box);
  }

  function reportButton(targetType, targetId) {
    var b = button('', 'tj-icon-button', 'flag');
    b.title = i18n.t('reportAction');
    b.onclick = function () { reportFlow(targetType, targetId); };
    return b;
  }

  function fileToDataUrl(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result || '')); }; reader.onerror = function () { reject(reader.error); }; reader.readAsDataURL(file); }); }

  function commentsSection(post) {
    var toggle = button(i18n.number(post.commentCount) + ' • ' + i18n.t('tabFeed'), 'tj-secondary', 'message-square');
    toggle.textContent = ''; toggle.append(ico('message-square'), document.createTextNode(' ' + i18n.number(post.commentCount)));
    var area = el('div', 'tj-post-comments'); area.hidden = true;
    var loaded = false;
    function load() {
      store.listComments(post.id).then(function (comments) {
        var list = el('div', 'tj-comment-list');
        if (!comments.length) list.append(el('p', 'tj-hint', i18n.t('commentsEmpty')));
        comments.forEach(function (comment) {
          var row = el('div', 'tj-comment-row');
          row.append(el('strong', '', comment.author ? comment.author.displayName : '—'), el('span', '', comment.content), reportButton('comment', comment.id));
          list.append(row);
        });
        var form = el('div', 'tj-comment-form');
        var input = document.createElement('input'); input.type = 'text'; input.placeholder = i18n.t('commentPlaceholder');
        var send = button(i18n.t('commentSend'), 'tj-secondary');
        send.onclick = function () {
          var value = input.value.trim(); if (!value) return;
          store.createComment(post.id, value).then(function () { input.value = ''; load(); });
        };
        form.append(input, send);
        area.replaceChildren(list, form);
        icons(area);
      });
    }
    toggle.onclick = function () { area.hidden = !area.hidden; if (!area.hidden && !loaded) { loaded = true; load(); } };
    return { toggle: toggle, area: area };
  }

  function postCard(post) {
    var card = el('article', 'tj-post-card');
    var head = el('div', 'tj-post-head');
    head.append(el('strong', '', post.author ? post.author.displayName : '—'), el('span', 'tj-hint', i18n.date(post.createdAt)), reportButton('post', post.id));
    card.append(head);
    if (post.content) card.append(el('p', 'tj-post-content', post.content));
    (post.images || []).forEach(function (src) { var img = document.createElement('img'); img.className = 'tj-post-image'; img.src = src; card.append(img); });
    var comments = commentsSection(post);
    card.append(comments.toggle, comments.area);
    return card;
  }

  function composer(onPosted) {
    var wrap = el('div', 'tj-feed-composer');
    var textarea = document.createElement('textarea'); textarea.rows = 2; textarea.placeholder = i18n.t('feedComposerPlaceholder');
    var thumbRow = el('div', 'tj-feed-composer-thumbs');
    var pendingImages = [];
    function renderThumbs() {
      thumbRow.replaceChildren();
      pendingImages.forEach(function (src, index) {
        var item = el('div', 'tj-feed-composer-thumb');
        var img = document.createElement('img'); img.src = src;
        var remove = button('', 'tj-icon-button', 'x'); remove.onclick = function () { pendingImages.splice(index, 1); renderThumbs(); };
        item.append(img, remove);
        thumbRow.append(item);
      });
      icons(thumbRow);
    }
    var fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.hidden = true;
    fileInput.onchange = function () {
      var files = Array.from(fileInput.files || []).slice(0, Math.max(0, 4 - pendingImages.length));
      Promise.all(files.filter(function (file) { return /^image\//.test(file.type) && file.size <= MAX_IMAGE_BYTES; }).map(fileToDataUrl)).then(function (urls) {
        pendingImages = pendingImages.concat(urls);
        renderThumbs();
      });
      fileInput.value = '';
    };
    var attachBtn = button(i18n.t('feedAttachImage'), 'tj-secondary', 'image');
    attachBtn.onclick = function () { fileInput.click(); };
    var postBtn = button(i18n.t('feedPost'), 'tj-primary', 'send');
    postBtn.onclick = function () {
      var content = textarea.value.trim();
      if (!content && !pendingImages.length) return;
      postBtn.disabled = true;
      store.createPost({ content: content, images: pendingImages.slice() }).then(function () {
        textarea.value = ''; pendingImages = []; renderThumbs();
        if (onPosted) onPosted();
      }).catch(function (error) { toast(error.code || 'FAILED', 'danger'); }).finally(function () { postBtn.disabled = false; });
    };
    var actionsRow = el('div', 'tj-feed-composer-actions');
    actionsRow.append(attachBtn, fileInput, postBtn);
    wrap.append(textarea, thumbRow, actionsRow);
    return wrap;
  }

  var feedPollTimer = null;
  function clearFeedPoll() { if (feedPollTimer) { window.clearInterval(feedPollTimer); feedPollTimer = null; } }

  function renderFeed(container) {
    clearFeedPoll();
    var list = el('div', 'tj-feed-list');
    container.append(composer(loadFirstPage), list);
    function paint(posts) {
      list.replaceChildren();
      if (!posts.length) { list.append(el('p', 'tj-hint', i18n.t('feedEmpty'))); return; }
      posts.forEach(function (post) { list.append(postCard(post)); });
      icons(list);
    }
    function loadFirstPage() { store.listPosts({ limit: 20 }).then(function (data) { paint(data.posts); }); }
    loadFirstPage();
    feedPollTimer = window.setInterval(loadFirstPage, 25000); // light polling only while the feed tab is mounted, no WebSocket requirement
  }

  function route() {
    var match = window.location.hash.match(/^#community(?:\/(feed|marketplace|messages))?(?:\/([^/]+))?$/);
    if (!match) return null;
    return { tab: match[1] || 'feed', itemId: match[2] ? decodeURIComponent(match[2]) : null };
  }

  function renderPage(tab, itemId) {
    var navrya = window.TradeJournalNavryaCommunity;
    var page;
    if (navrya && navrya.render) {
      page = navrya.render(tab, itemId);
    } else {
      page = el('section', 'panel-page tj-community-page');
      page.dir = i18n.direction();
      var head = el('header', 'pr-page-header');
      head.append(el('h2', '', i18n.t('communityTitle')), el('p', '', i18n.t('communityHint')));
      var nav = el('nav', 'tj-community-tabs');
      [['feed', 'tabFeed', 'rss'], ['marketplace', 'tabMarketplace', 'store'], ['messages', 'tabMessages', 'mail']].forEach(function (item) {
        var b = button(i18n.t(item[1]), tab === item[0] ? 'active' : '', item[2]);
        b.onclick = function () { location.hash = '#community/' + item[0]; };
        nav.append(b);
      });
      var body = el('div', 'tj-community-body');
      page.append(head, nav, body);
      if (tab === 'marketplace' && window.TradeJournalMarketplace) window.TradeJournalMarketplace.render(body, itemId);
      else if (tab === 'messages' && window.TradeJournalMessages) window.TradeJournalMessages.render(body, itemId);
      else renderFeed(body);
    }
    layer.show(page, 'community');
    document.querySelectorAll('.sidebar nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#community'); });
    icons(page);
  }

  function render() {
    var current = route();
    if (!current) return;
    switcher.ensureUser().then(function () { renderPage(current.tab, current.itemId); });
  }

  window.addEventListener('hashchange', function () { if (location.hash.indexOf('#community') === 0) render(); });
  window.setTimeout(function () { if (location.hash.indexOf('#community') === 0) render(); }, 0);

  window.TradeJournalCommunity = { route: route, render: render };
}());
