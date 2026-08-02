(function () {
  'use strict';
  var i18n = window.TradeJournalCommunityI18n;
  var store = window.TradeJournalCommunityStore;
  var switcher = window.TradeJournalDevUserSwitcher;
  if (!i18n || !store) return;

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

  function threadRow(thread) {
    var row = el('div', 'tj-thread-row' + (thread.unreadCount ? ' unread' : ''));
    row.onclick = function () { location.hash = '#community/messages/' + encodeURIComponent(thread.id); };
    var main = el('div', 'tj-thread-row-main');
    main.append(el('strong', '', thread.counterparty ? thread.counterparty.displayName : '—'));
    main.append(el('span', 'tj-hint', thread.listingTitle || ''));
    row.append(main);
    if (thread.lastMessage) row.append(el('p', 'tj-thread-last', thread.lastMessage.content));
    if (thread.unreadCount) row.append(el('span', 'tj-thread-unread-badge', String(thread.unreadCount)));
    return row;
  }

  function renderList(container) {
    container.replaceChildren(el('h2', '', i18n.t('messagesTitle')));
    store.listThreads().then(function (threads) {
      if (!threads.length) { container.append(el('p', 'tj-hint', i18n.t('messagesEmpty'))); return; }
      var list = el('div', 'tj-thread-list');
      threads.forEach(function (thread) { list.append(threadRow(thread)); });
      container.append(list);
      icons(list);
    });
  }

  function renderThread(container, threadId) {
    container.replaceChildren(el('h2', '', i18n.t('messagesTitle')));
    store.getThread(threadId).then(function (data) {
      var page = el('div', 'tj-thread-detail');
      var back = button(i18n.t('back'), 'tj-secondary', i18n.direction() === 'rtl' ? 'arrow-right' : 'arrow-left');
      back.onclick = function () { location.hash = '#community/messages'; };
      page.append(back);

      var list = el('div', 'tj-thread-messages');
      data.messages.forEach(function (message) {
        var mine = switcher && switcher.currentUserId() === message.senderId;
        var row = el('div', 'tj-thread-msg-row ' + (mine ? 'mine' : 'theirs'));
        row.append(el('div', 'tj-thread-msg ' + (mine ? 'mine' : 'theirs'), message.content));
        if (!mine) { var reportBtn = button('', 'tj-icon-button', 'flag'); reportBtn.title = i18n.t('reportAction'); reportBtn.onclick = function () { reportFlow('message', message.id); }; row.append(reportBtn); }
        list.append(row);
      });
      page.append(list);

      var form = el('div', 'tj-thread-form');
      var input = document.createElement('textarea'); input.rows = 1; input.placeholder = i18n.t('threadPlaceholder');
      var send = button(i18n.t('threadSend'), 'tj-primary', 'send');
      send.onclick = function () {
        var value = input.value.trim();
        if (!value) return;
        store.sendMessage(threadId, value).then(function () { input.value = ''; renderThread(container, threadId); });
      };
      input.onkeydown = function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send.onclick(); } };
      form.append(input, send);
      page.append(form);

      container.replaceChildren(page);
      icons(page);
      list.scrollTop = list.scrollHeight;
    });
  }

  window.TradeJournalMessages = {
    render: function (container, threadId) { if (threadId) renderThread(container, threadId); else renderList(container); }
  };
}());
