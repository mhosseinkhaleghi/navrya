(function () {
  'use strict';

  var store = window.TradeJournalTradeStore;
  var ui = window.TradeJournalTradeUI;
  var i18n = window.TradeJournalTradeI18n;
  var layer = window.TradeJournalPanelLayer;
  if (!store || !ui || !i18n) return;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    var node = el('i');
    node.dataset.lucide = name;
    return node;
  }

  function button(label, className, iconName) {
    var node = el('button', className || '', label);
    node.type = 'button';
    if (iconName) node.prepend(icon(iconName));
    return node;
  }

  function paintIcons(root) {
    if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document);
  }

  function sessionName(value) {
    return { tokyo: 'Tokyo', london: 'London', newyork: 'New York', sydney: 'Sydney' }[value] || value || '\u2014';
  }

  function listActive(options) {
    var opts = options || {};
    return store.listSync().filter(function (trade) {
      var isActive = trade.status === 'open' || trade.status === 'hunting';
      var isSession = !opts.sessionId || (trade.source && trade.source.sessionId === opts.sessionId);
      return isActive && isSession;
    });
  }

  function metric(label, value, tone) {
    var box = el('div', 'tj-op-metric ' + (tone || ''));
    box.append(el('small', '', label), el('strong', '', value));
    return box;
  }

  function tradeCard(trade, compact) {
    var card = el('article', 'tj-op-card ' + trade.status);
    var head = el('header');
    var identity = el('div');
    var badges = el('div', 'tj-op-badges');
    identity.append(
      el('strong', '', sessionName(trade.session)),
      el('small', '', i18n.date(trade.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
    );
    badges.append(
      el('span', 'direction ' + trade.direction, i18n.t(trade.direction)),
      el('span', 'status ' + trade.status, ui.statusLabel(trade.status))
    );
    head.append(identity, badges);
    card.append(head);

    var metrics = el('div', 'tj-op-metrics');
    var tp = trade.takeProfits && trade.takeProfits[0] ? trade.takeProfits[0].price : null;
    metrics.append(
      metric(i18n.t('entryPrice'), i18n.number(trade.entryPrice)),
      metric(i18n.t('stopLoss'), i18n.number(trade.stopLoss), 'danger'),
      metric(i18n.t('takeProfit'), i18n.number(tp), 'success')
    );
    card.append(metrics);

    var meta = el('div', 'tj-op-meta');
    meta.append(
      el('span', '', i18n.t('leverage') + ': ' + (trade.leverage ? i18n.number(trade.leverage) + '\u00d7' : '\u2014')),
      el('span', '', 'RR: ' + (trade.rr ? '1:' + i18n.number(trade.rr) : '\u2014'))
    );
    if (trade.emotionLog.length) meta.append(el('span', '', i18n.t('emotionHistory') + ': ' + i18n.number(trade.emotionLog.length)));
    card.append(meta);

    var actions = el('footer', 'tj-op-actions');
    if (trade.status === 'hunting') {
      var open = button(i18n.t('markOpen'), 'primary', 'target');
      var cancel = button(i18n.t('cancelTrade'), 'danger', 'ban');
      open.onclick = function () { store.updateStatus(trade.id, 'open'); };
      cancel.onclick = function () { store.updateStatus(trade.id, 'cancelled'); };
      actions.append(open, cancel);
    } else {
      var emotion = button(i18n.t('logEmotionAction'), 'warning', 'heart-pulse');
      var close = button(i18n.t('closePosition'), 'primary', 'circle-stop');
      emotion.onclick = function () { ui.openEmotion(trade.id, 'mid_trade'); };
      close.onclick = function () { ui.closeTrade(trade.id); };
      actions.append(emotion, close);
    }
    var details = button(compact ? '' : i18n.t('viewDetails'), 'ghost', 'eye');
    details.title = i18n.t('viewDetails');
    details.setAttribute('aria-label', i18n.t('viewDetails'));
    details.onclick = function () { ui.viewTrade(trade.id); };
    actions.append(details);
    card.append(actions);
    return card;
  }

  // The cool-down timer here is only a *reflection* of the one started from the unified Post-Trade
  // Reflection popup (mental-health-continuous.js), never a second, independently-triggered nudge.
  function cooldownCard() {
    var psych = window.TradeJournalPsychologyStore, mh = window.TradeJournalMentalHealthStore;
    if (!psych || !mh) return null;
    var settings = psych.settings().postTradeReflection;
    if (!settings || !settings.enabled) return null;
    var cooldown = mh.activeCooldownTimer(mh.load(), settings);
    if (!cooldown.active) return null;
    var card = el('div', 'tj-cooldown-card');
    var text = el('div');
    var minutes = Math.max(1, Math.ceil(cooldown.remainingMs / 60000));
    text.append(
      el('strong', '', i18n.t('psyCooldownTitle')),
      el('small', '', i18n.t('psyCooldownHint')),
      el('small', '', i18n.t('psyCooldownRemaining', { minutes: i18n.number(minutes) }))
    );
    var dismiss = button(i18n.t('psyCooldownDismiss'), 'ghost', 'x');
    dismiss.onclick = function () { mh.dismissCooldownTimer(mh.load()); refresh(); };
    card.append(text, dismiss);
    return card;
  }

  function render(options) {
    var opts = options || {};
    var wrap = el('section', 'tj-open-positions-module' + (opts.compact ? ' compact' : ''));
    var values = listActive(opts);
    var head = el('header', 'tj-op-head');
    var title = el('div');
    wrap.dataset.sessionId = opts.sessionId || '';
    wrap.dataset.compact = opts.compact ? 'true' : 'false';
    title.append(icon('radio-tower'), el('strong', '', i18n.t('openTrades')));
    head.append(title, el('span', '', i18n.number(values.length)));
    wrap.append(head);
    var cooldown = cooldownCard();
    if (cooldown) wrap.append(cooldown);

    var list = el('div', 'tj-op-list');
    if (!values.length) {
      var empty = el('div', 'tj-op-empty');
      empty.append(icon('circle-dashed'), el('span', '', i18n.t('noTrades')));
      list.append(empty);
    } else {
      values.forEach(function (trade) { list.append(tradeCard(trade, !!opts.compact)); });
    }
    wrap.append(list);
    setTimeout(function () { paintIcons(wrap); }, 0);
    return wrap;
  }

  function mount(container, options) {
    if (!container) return null;
    var node = render(options);
    container.replaceChildren(node);
    return node;
  }

  function refresh() {
    document.querySelectorAll('.tj-open-positions-module').forEach(function (node) {
      var next = render({ sessionId: node.dataset.sessionId || '', compact: node.dataset.compact === 'true' });
      node.replaceWith(next);
    });
  }

  window.addEventListener('tradejournal:trades-changed', refresh);
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  if (window.setInterval) window.setInterval(refresh, 15000);
  window.TradeJournalOpenPositionsModule = { render: render, mount: mount, refresh: refresh, listActive: listActive };

  if (layer) {
    layer.register('dashboard', [{ id: 'active-open-trades', type: 'open-trades', title: i18n.t('openTrades'), description: i18n.t('allTradesSubtitle'), span: 2 }]);
    layer.register('sessions', [{ id: 'session-active-open-trades', type: 'open-trades', title: i18n.t('openTrades'), description: i18n.t('allTradesSubtitle'), span: 2 }]);
  }
}());
