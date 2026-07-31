(function () {
  'use strict';

  var api = window.lucide;
  if (!api || !api.createIcons || !api.icons) return;

  var legacyMap = {
    'i-ai-clean': 'bot',
    'i-book': 'book-open',
    'i-calendar': 'calendar-days',
    'i-chart': 'chart-candlestick',
    'i-chat-clean': 'message-circle',
    'i-chevron': 'chevron-down',
    'i-city-london': 'building-2',
    'i-city-newyork': 'landmark',
    'i-city-sydney': 'sailboat',
    'i-city-tokyo': 'castle',
    'i-clock': 'clock-3',
    'i-crosshair': 'crosshair',
    'i-crown': 'crown',
    'i-crown-clean': 'crown',
    'i-dashboard-clean': 'layout-dashboard',
    'i-filter': 'list-filter',
    'i-forum-clean': 'messages-square',
    'i-gear': 'settings',
    'i-globe': 'languages',
    'i-grid': 'layout-grid',
    'i-journal-clean': 'notebook-tabs',
    'i-leaf': 'feather',
    'i-list': 'list',
    'i-mail': 'mail',
    'i-mind-clean': 'brain-circuit',
    'i-paw': 'footprints',
    'i-plus': 'plus',
    'i-search': 'search',
    'i-send-clean': 'send-horizontal',
    'i-shield': 'shield',
    'i-shield-clean': 'shield-check',
    'i-sort': 'arrow-up-down',
    'i-star': 'star',
    'i-strategy-clean': 'workflow',
    'i-target': 'target',
    'i-trophy': 'trophy'
  };

  var queued = false;

  function icon(name, label, className) {
    var holder = document.createElement('i');
    holder.setAttribute('data-lucide', name);
    holder.className = 'tj-icon-source' + (className ? ' ' + className : '');
    if (label) {
      holder.setAttribute('role', 'img');
      holder.setAttribute('aria-label', label);
    } else {
      holder.setAttribute('aria-hidden', 'true');
    }
    schedule();
    return holder;
  }

  function replaceLegacy(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('svg use[href^="#i-"],svg use[xlink\\:href^="#i-"]').forEach(function (use) {
      var svg = use.closest('svg');
      if (!svg || svg.dataset.tjIconUpgraded === 'true') return;
      var reference = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      var name = legacyMap[reference.replace('#', '')];
      if (!name) return;
      var holder = icon(name, svg.getAttribute('aria-label') || '', (svg.getAttribute('class') || '') + ' tj-icon');
      if (svg.getAttribute('title')) holder.setAttribute('title', svg.getAttribute('title'));
      svg.dataset.tjIconUpgraded = 'true';
      svg.replaceWith(holder);
    });
  }

  function render(root) {
    replaceLegacy(root || document);
    try {
      api.createIcons({
        icons: api.icons,
        root: root && root.querySelectorAll ? root : document,
        attrs: {
          'stroke-width': 2,
          'aria-hidden': 'true',
          focusable: 'false'
        }
      });
    } catch (_) {
      /* A detached fragment can disappear between mutation and render. */
    }
  }

  function schedule(root) {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      render(root || document);
    });
  }

  var observer = new MutationObserver(function (records) {
    var needsRender = records.some(function (record) {
      return Array.prototype.some.call(record.addedNodes || [], function (item) {
        return item.nodeType === 1 && (item.matches('[data-lucide],svg') || item.querySelector('[data-lucide],svg use[href^="#i-"]'));
      });
    });
    if (needsRender) schedule(document);
  });

  window.TradeJournalIcons = {
    icon: icon,
    render: render,
    schedule: schedule,
    map: legacyMap
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      render(document);
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    render(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }
}());
