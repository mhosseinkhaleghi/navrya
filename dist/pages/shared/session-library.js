(function () {
  'use strict';

  var layer = window.TradeJournalPanelLayer;
  var content = document.querySelector('.content');
  if (!layer || !content) return;

  var SESSION_KEY_PREFIX = 'tradejournal:sessions:v1:';
  var RESET_KEY = 'tradejournal:session-library-empty-reset:v1';
  var CHARACTERS = ['hunter', 'engineer', 'commander', 'sage'];
  var objectUrls = [];
  var state = { filter: 'all', sort: 'newest', view: 'grid', query: '', visible: true };

  var messages = {
    fa: {
      open: 'ادامه / باز کردن', report: 'مشاهده گزارش', reopen: 'بازگشایی', duplicate: 'تکرار / کپی', remove: 'حذف', confirm: 'این سشن حذف شود؟',
      entries: 'ورودی', scenarios: 'سناریو', closed: 'بسته', active: 'فعال', all: 'همه سشن‌ها', activeOnly: 'سشن‌های فعال', closedOnly: 'سشن‌های بسته', withCharts: 'دارای چارت',
      newest: 'جدیدترین', oldest: 'قدیمی‌ترین', market: 'بر اساس بازار', mostEntries: 'بیشترین ورودی', filterLabel: 'فیلتر سشن‌ها', sortLabel: 'مرتب‌سازی سشن‌ها',
      emptyTitle: 'هنوز سشنی ثبت نشده است', emptyText: 'برای شروع، دکمه «سشن جدید» را بزنید. سشن‌های ثبت‌شده بعداً به‌صورت کارت در این بخش نمایش داده می‌شوند.', noMatches: 'سشنی مطابق جستجو یا فیلتر انتخاب‌شده پیدا نشد.', grid: 'نمای شبکه‌ای', list: 'نمای فهرستی'
    },
    ar: {
      open: 'متابعة / فتح', report: 'عرض التقرير', reopen: 'إعادة الفتح', duplicate: 'تكرار / نسخ', remove: 'حذف', confirm: 'حذف هذه الجلسة؟',
      entries: 'إدخالات', scenarios: 'سيناريوهات', closed: 'مغلقة', active: 'نشطة', all: 'كل الجلسات', activeOnly: 'الجلسات النشطة', closedOnly: 'الجلسات المغلقة', withCharts: 'تحتوي على رسم',
      newest: 'الأحدث', oldest: 'الأقدم', market: 'حسب السوق', mostEntries: 'الأكثر إدخالات', filterLabel: 'تصفية الجلسات', sortLabel: 'ترتيب الجلسات',
      emptyTitle: 'لم يتم تسجيل أي جلسة بعد', emptyText: 'اضغط «جلسة جديدة» للبدء. ستظهر الجلسات المسجلة هنا كبطاقات.', noMatches: 'لا توجد جلسة تطابق البحث أو عامل التصفية.', grid: 'عرض شبكي', list: 'عرض قائمة'
    },
    en: {
      open: 'Continue / open', report: 'View report', reopen: 'Reopen', duplicate: 'Repeat / copy', remove: 'Delete', confirm: 'Delete this session?',
      entries: 'entries', scenarios: 'scenarios', closed: 'Closed', active: 'Active', all: 'All sessions', activeOnly: 'Active sessions', closedOnly: 'Closed sessions', withCharts: 'With charts',
      newest: 'Newest', oldest: 'Oldest', market: 'By market', mostEntries: 'Most entries', filterLabel: 'Filter sessions', sortLabel: 'Sort sessions',
      emptyTitle: 'No sessions yet', emptyText: 'Select “New session” to begin. Saved sessions will appear here as cards.', noMatches: 'No session matches the current search or filter.', grid: 'Grid view', list: 'List view'
    },
    es: {
      open: 'Continuar / abrir', report: 'Ver informe', reopen: 'Reabrir', duplicate: 'Repetir / copiar', remove: 'Eliminar', confirm: '¿Eliminar esta sesión?',
      entries: 'entradas', scenarios: 'escenarios', closed: 'Cerrada', active: 'Activa', all: 'Todas las sesiones', activeOnly: 'Sesiones activas', closedOnly: 'Sesiones cerradas', withCharts: 'Con gráficos',
      newest: 'Más recientes', oldest: 'Más antiguas', market: 'Por mercado', mostEntries: 'Más entradas', filterLabel: 'Filtrar sesiones', sortLabel: 'Ordenar sesiones',
      emptyTitle: 'Aún no hay sesiones', emptyText: 'Pulsa «Nueva sesión» para comenzar. Las sesiones guardadas aparecerán aquí como tarjetas.', noMatches: 'Ninguna sesión coincide con la búsqueda o el filtro.', grid: 'Vista de cuadrícula', list: 'Vista de lista'
    }
  };

  function language() {
    var value = String(document.documentElement.lang || 'fa').toLowerCase();
    return messages[value] ? value : 'en';
  }

  function t(key) { return messages[language()][key] || key; }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconButton(label, className, iconName) {
    var node = el('button', className || '', label);
    node.type = 'button';
    if (iconName) { var icon = el('i'); icon.dataset.lucide = iconName; node.prepend(icon); }
    return node;
  }

  function storageKey(character) { return SESSION_KEY_PREFIX + character; }

  function readSessions() {
    try {
      var parsed = JSON.parse(localStorage.getItem(storageKey(layer.character))) || [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function entryCount(session) { return (session.entries || session.charts || []).length; }

  function scenarioCount(session) {
    var count = 0;
    (session.entries || []).forEach(function (entry) { count += (entry.scenarios || []).length; });
    if (!session.entries && Array.isArray(session.scenarios)) count = session.scenarios.length;
    return count;
  }

  function hasChart(session) {
    return (session.entries || []).some(function (entry) { return entry.hasImage && (entry.imageBlobId || entry.preview); }) ||
      (session.charts || []).some(function (chart) { return Boolean(chart.preview); });
  }

  function isUsable(session) {
    return Boolean(session && session.id && (session.name || session.market || session.date || session.startedAt || entryCount(session) || scenarioCount(session)));
  }

  function sanitizeSessions(values) {
    var usable = values.filter(isUsable);
    if (usable.length !== values.length) {
      localStorage.setItem(storageKey(layer.character), JSON.stringify(usable));
      window.dispatchEvent(new CustomEvent('tradejournal:sessions-changed', { detail: { character: layer.character, count: usable.length } }));
    }
    return usable;
  }

  function imageEntry(session) {
    var entries = (session.entries || []).slice().reverse();
    var entry = entries.find(function (item) { return item.hasImage && (item.imageBlobId || item.preview); });
    if (entry) return entry;
    var charts = (session.charts || []).slice().reverse();
    var chart = charts.find(function (item) { return item.preview; });
    return chart ? { preview: chart.preview, hasImage: true } : null;
  }

  function releaseUrls() {
    objectUrls.forEach(function (url) { if (String(url).indexOf('blob:') === 0) URL.revokeObjectURL(url); });
    objectUrls = [];
  }

  async function hydrateImage(image, entry) {
    if (!entry) return;
    if (entry.imageBlobId && window.TradeJournalImageStore) {
      try {
        var url = await window.TradeJournalImageStore.loadImageUrl(entry.imageBlobId);
        if (!url) return;
        if (!document.body.contains(image)) { if (String(url).indexOf('blob:') === 0) URL.revokeObjectURL(url); return; }
        image.src = url; objectUrls.push(url); return;
      } catch (_) { /* Keep the fallback. */ }
    }
    if (entry.preview) image.src = entry.preview;
  }

  function sessionTimestamp(session) {
    var value = session.startedAt || session.createdAt || session.date || session.gregorianDate || 0;
    var time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function filterAndSort(values) {
    var query = state.query.trim().toLocaleLowerCase(language());
    var result = values.filter(function (session) {
      if (state.filter === 'open' && session.status === 'closed') return false;
      if (state.filter === 'closed' && session.status !== 'closed') return false;
      if (state.filter === 'charts' && !hasChart(session)) return false;
      if (!query) return true;
      var scenarios = [];
      (session.entries || []).forEach(function (entry) { (entry.scenarios || []).forEach(function (scenario) { scenarios.push(scenario.title || ''); }); });
      return JSON.stringify([session.name, session.market, session.timeframe, session.date, session.gregorianDate, session.jalali, session.status, scenarios]).toLocaleLowerCase(language()).indexOf(query) > -1;
    });
    result.sort(function (a, b) {
      if (state.sort === 'oldest') return sessionTimestamp(a) - sessionTimestamp(b);
      if (state.sort === 'market') return String(a.market || '').localeCompare(String(b.market || ''), language());
      if (state.sort === 'entries') return entryCount(b) - entryCount(a) || sessionTimestamp(b) - sessionTimestamp(a);
      return sessionTimestamp(b) - sessionTimestamp(a);
    });
    return result;
  }

  function card(session, featured) {
    var card = el('article', 'session-card sl-session-card ' + (featured ? 'sl-featured' : ''));
    var media = el('div', 'sl-card-media');
    var image = document.createElement('img');
    var body = el('div', 'sl-card-body');
    var head = el('div', 'sl-card-head');
    var title = el('h3', '', (session.name || session.market || 'Session') + ' — ' + (session.date || session.gregorianDate || ''));
    var status = el('span', 'sl-status ' + (session.status === 'closed' ? 'closed' : 'open'), session.status === 'closed' ? t('closed') : t('active'));
    var source = imageEntry(session);
    image.alt = session.market || 'Session chart';
    head.append(title, status);
    body.append(head, el('div', 'sl-tags', (session.market || '—') + ' · ' + (session.timeframe || '—')), el('p', 'sl-meta', entryCount(session) + ' ' + t('entries') + ' · ' + scenarioCount(session) + ' ' + t('scenarios')));

    var actions = el('div', 'sl-card-actions');
    var open = iconButton(t('open'), 'sl-primary', 'folder-open');
    var report = iconButton(t('report'), '', 'chart-no-axes-combined');
    var duplicate = iconButton(t('duplicate'), '', 'copy');
    var remove = iconButton(t('remove'), 'sl-danger', 'trash-2');
    open.onclick = function () { if (window.TradeJournalWorkspace) window.TradeJournalWorkspace.open(session.id); };
    report.onclick = function () { if (window.TradeJournalWorkspace) window.TradeJournalWorkspace.openReport(session.id); };
    duplicate.onclick = function () { if (window.TradeJournalWorkspace) window.TradeJournalWorkspace.duplicate(session.id); };
    remove.onclick = function () { if (window.confirm(t('confirm')) && window.TradeJournalWorkspace) window.TradeJournalWorkspace.remove(session.id); };
    actions.append(open, report);
    if (session.status === 'closed') {
      var reopen = iconButton(t('reopen'), '', 'rotate-ccw');
      reopen.onclick = function () { if (window.TradeJournalWorkspace) window.TradeJournalWorkspace.reopen(session.id); };
      actions.append(reopen);
    }
    actions.append(duplicate, remove); body.append(actions);
    if (source) {
      media.classList.add('has-image'); media.append(image); hydrateImage(image, source);
    } else {
      var placeholder = el('span', 'sl-no-chart'); var placeholderIcon = el('i'); placeholderIcon.dataset.lucide = 'image-off'; placeholder.append(placeholderIcon); media.append(placeholder);
    }
    card.append(media, body); return card;
  }

  function hideTemplates() {
    Array.from(content.querySelectorAll(':scope > .featured-card, :scope > .cards-grid, :scope > .week-label')).forEach(function (node) {
      node.classList.add('sl-hidden-template'); node.setAttribute('aria-hidden', 'true');
    });
  }

  function updateControlLabels() {
    var filterLabel = content.querySelector('[data-session-filter-label]');
    var sortLabel = content.querySelector('[data-session-sort-label]');
    if (filterLabel) filterLabel.textContent = t(state.filter === 'open' ? 'activeOnly' : state.filter === 'closed' ? 'closedOnly' : state.filter === 'charts' ? 'withCharts' : 'all');
    if (sortLabel) sortLabel.textContent = t(state.sort === 'oldest' ? 'oldest' : state.sort === 'market' ? 'market' : state.sort === 'entries' ? 'mostEntries' : 'newest');
  }

  function attachToolbar() {
    var toolbar = content.querySelector(':scope > .toolbar');
    if (!toolbar) return;
    var filterWrap = toolbar.querySelector('.tool-select:not(.sort)');
    var sortWrap = toolbar.querySelector('.tool-select.sort');
    var search = toolbar.querySelector('.search-box input');
    var toggles = toolbar.querySelectorAll('.view-toggle button');

    function addSelect(wrap, type, options) {
      if (!wrap) return;
      var select = wrap.querySelector('select[data-session-control]') || document.createElement('select'); select.dataset.sessionControl = type;
      select.className = 'sl-toolbar-select'; select.setAttribute('aria-label', t(type === 'filter' ? 'filterLabel' : 'sortLabel'));
      select.replaceChildren();
      options.forEach(function (option) { select.append(new Option(t(option[1]), option[0])); });
      select.value = state[type]; select.onchange = function () { state[type] = select.value; updateControlLabels(); render(); };
      var label = wrap.querySelector('span'); if (label) label.dataset[type === 'filter' ? 'sessionFilterLabel' : 'sessionSortLabel'] = '';
      if (!select.parentNode) wrap.append(select);
    }
    addSelect(filterWrap, 'filter', [['all', 'all'], ['open', 'activeOnly'], ['closed', 'closedOnly'], ['charts', 'withCharts']]);
    addSelect(sortWrap, 'sort', [['newest', 'newest'], ['oldest', 'oldest'], ['market', 'market'], ['entries', 'mostEntries']]);
    if (search && !search.dataset.sessionSearchBound) {
      search.dataset.sessionSearchBound = 'true';
      search.addEventListener('input', function () { state.query = search.value; render(); });
    }
    Array.from(toggles).forEach(function (button, index) {
      button.dataset.sessionView = index === 0 ? 'grid' : 'list'; button.setAttribute('aria-label', t(index === 0 ? 'grid' : 'list'));
      if (!button.dataset.sessionViewBound) {
        button.dataset.sessionViewBound = 'true';
        button.addEventListener('click', function () { state.view = button.dataset.sessionView; render(); });
      }
      button.classList.toggle('selected', button.dataset.sessionView === state.view);
    });
    updateControlLabels();
  }

  function emptyState(filteredOut) {
    var box = el('section', 'sl-empty-state');
    var mark = el('span', 'sl-empty-icon'); var icon = el('i'); icon.dataset.lucide = filteredOut ? 'search-x' : 'calendar-plus'; mark.append(icon);
    box.append(mark, el('h3', '', filteredOut ? t('noMatches') : t('emptyTitle')));
    if (!filteredOut) box.append(el('p', '', t('emptyText')));
    return box;
  }

  function render() {
    hideTemplates(); attachToolbar(); releaseUrls();
    var existing = content.querySelector('[data-session-library]'); if (existing) existing.remove();
    if (!state.visible) return;
    var all = sanitizeSessions(readSessions());
    var filtered = filterAndSort(all);
    var library = el('section', 'sl-library sl-view-' + state.view); library.dataset.sessionLibrary = '';
    if (!filtered.length) library.append(emptyState(all.length > 0));
    else if (state.view === 'list') {
      var list = el('div', 'sl-grid sl-list'); filtered.forEach(function (session) { list.append(card(session, false)); }); library.append(list);
    } else {
      library.append(card(filtered[0], true));
      var grid = el('div', 'sl-grid'); filtered.slice(1).forEach(function (session) { grid.append(card(session, false)); }); library.append(grid);
    }
    var toolbar = content.querySelector(':scope > .toolbar'); if (toolbar) toolbar.insertAdjacentElement('afterend', library);
    if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(library);
  }

  function suspend() {
    state.visible = false; releaseUrls();
    var library = content.querySelector('[data-session-library]'); if (library) library.remove();
    content.classList.add('sl-library-suspended');
  }

  function resume() {
    state.visible = true; content.classList.remove('sl-library-suspended');
    window.setTimeout(render, 0);
  }

  async function resetOnce() {
    if (localStorage.getItem(RESET_KEY)) return;
    var blobIds = [];
    CHARACTERS.forEach(function (character) {
      try {
        var sessions = JSON.parse(localStorage.getItem(storageKey(character))) || [];
        sessions.forEach(function (session) { (session.entries || []).forEach(function (entry) { if (entry.imageBlobId) blobIds.push(entry.imageBlobId); }); });
      } catch (_) { /* Continue clearing the remaining stores. */ }
    });
    if (window.TradeJournalImageStore) {
      await Promise.all(blobIds.map(function (id) { return window.TradeJournalImageStore.deleteImage(id).catch(function () {}); }));
    }
    CHARACTERS.forEach(function (character) { localStorage.removeItem(storageKey(character)); });
    localStorage.removeItem('tradejournal:session-signatures:v1');
    localStorage.setItem(RESET_KEY, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('tradejournal:sessions-changed', { detail: { reset: true } }));
  }

  var sessionNav = document.querySelector('.sidebar nav a[href="#library"]');
  if (sessionNav) sessionNav.addEventListener('click', resume);
  window.addEventListener('tradejournal:sessions-changed', function () { if (state.visible) render(); });
  window.addEventListener('beforeunload', releaseUrls);
  new MutationObserver(function () { if (state.visible) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });

  window.TradeJournalSessionLibrary = { render: render, suspend: suspend, resume: resume, resetOnce: resetOnce };
  hideTemplates(); attachToolbar();
  resetOnce().finally(function () { resume(); });
}());
