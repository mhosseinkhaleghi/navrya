(function () {
  'use strict';

  var icons = window.TradeJournalIcons;
  if (!icons) return;

  var glyphs = /^[\s▧✦⚑◎◉◒●○✓×↗↻◌◈→⌕⌃⌄⌫+←↔↕▣›‹⚙⚠]+/u;

  function nodes(root, selector) {
    var result = [];
    if (root && root.nodeType === 1 && root.matches(selector)) result.push(root);
    if (root && root.querySelectorAll) result = result.concat(Array.from(root.querySelectorAll(selector)));
    return result;
  }

  function iconize(element, name, iconOnly) {
    if (!element || element.dataset.tjDecorated === name) return;
    var label = String(element.textContent || '').replace(glyphs, '').trim();
    element.replaceChildren(icons.icon(name, '', 'tj-control-icon'));
    if (!iconOnly && label) element.append(document.createTextNode(label));
    element.dataset.tjDecorated = name;
  }

  function decorate(root) {
    nodes(root, '.session-entry-action').forEach(function (button) {
      var siblings = Array.from(button.parentElement.querySelectorAll('.session-entry-action'));
      var index = siblings.indexOf(button);
      iconize(button, button.classList.contains('gold') ? 'flag' : index === 1 ? 'activity' : 'image-plus');
    });

    nodes(root, '.sw-timeline-nav').forEach(function (nav) {
      Array.from(nav.querySelectorAll('button')).forEach(function (button, index) {
        iconize(button, index === 0 ? 'panels-top-left' : index === 1 ? 'maximize-2' : index === 2 ? 'chevron-left' : 'chevron-right', index > 1);
      });
    });

    nodes(root, '.swc-type-icon').forEach(function (holder) {
      var value = holder.textContent;
      iconize(holder, value.indexOf('⚑') > -1 ? 'flag' : value.indexOf('✦') > -1 ? 'activity' : 'chart-candlestick', true);
    });
    nodes(root, '.swc-badge.market').forEach(function (badge) {
      var value = badge.textContent;
      var name = /NewYork/i.test(value) ? 'landmark' : /Sydney/i.test(value) ? 'sailboat' : /Tokyo/i.test(value) ? 'castle' : 'building-2';
      iconize(badge, name);
    });
    nodes(root, '.swe-upload-icon').forEach(function (holder) { iconize(holder, 'image-plus', true); });
    nodes(root, '.session-back').forEach(function (button) { iconize(button, 'arrow-left'); });
    nodes(root, '.sw-meta-side .session-quiet').forEach(function (button) { iconize(button, 'settings', true); });
    nodes(root, '.swe-close,.sw-modal-close').forEach(function (button) { iconize(button, 'x', true); });
    nodes(root, '.sw-entry-delete,.swc-delete,.chart-card > header button').forEach(function (button) { iconize(button, 'trash-2', true); });
    nodes(root, '.swc-chevron').forEach(function (button) { iconize(button, button.textContent.indexOf('⌃') > -1 ? 'chevron-up' : 'chevron-down', true); });
    nodes(root, '.swc-ai-button,.swc-ai-toggle,.chart-analysis,.swc-chart-switch button:last-child').forEach(function (button) { iconize(button, 'sparkles'); });
    nodes(root, '.swe-ai-button,.swe-ai-ready,.swe-session-ai-title h4').forEach(function (holder) { iconize(holder, 'sparkles'); });
    nodes(root, '.swc-add-scenario,.add-scenario').forEach(function (button) { iconize(button, 'plus'); });
    nodes(root, '.swc-entry-note > span').forEach(function (holder) { iconize(holder, 'message-square-text'); });
    nodes(root, '.swc-related > span,.swe-related h4').forEach(function (holder) { iconize(holder, 'link-2'); });
    nodes(root, '.swe-check').forEach(function (holder) { iconize(holder, holder.textContent.indexOf('✓') > -1 ? 'circle-check-big' : 'circle', true); });
    nodes(root, '.swe-upload-section > h4').forEach(function (holder) { iconize(holder, 'image-plus'); });
    nodes(root, '.sw-prev > header span').forEach(function (holder) { iconize(holder, 'flag'); });
    nodes(root, '.sw-dashboard > header span').forEach(function (holder) { iconize(holder, 'layout-dashboard'); });
    nodes(root, '.swc-section h4').forEach(function (holder) {
      if (/^\s*◎/.test(holder.textContent)) iconize(holder, 'layers-3');
      else if (/^\s*✦/.test(holder.textContent)) iconize(holder, 'wand-sparkles');
    });
    nodes(root, '.swc-protocol > span').forEach(function (holder) { iconize(holder, holder.parentElement.classList.contains('open') ? 'shield-check' : 'lock-keyhole', true); });
    nodes(root, '.swc-zoom').forEach(function (holder) { iconize(holder, 'zoom-in'); });
    nodes(root, '.swe-upload-actions button:first-child,.swe-analysis-top button').forEach(function (button) { iconize(button, 'refresh-cw'); });
    nodes(root, '.swe-upload-actions button:last-child').forEach(function (button) { iconize(button, 'trash-2'); });
    nodes(root, '.swe-ai-start > span').forEach(function (holder) { iconize(holder, 'sparkles', true); });
    nodes(root, '.swe-ai-start button').forEach(function (button) { iconize(button, 'sparkles'); });
    nodes(root, '.swe-ai-loading').forEach(function (holder) { iconize(holder, 'loader-circle'); holder.classList.add('tj-icon-loading'); });
    nodes(root, '.swe-outcome').forEach(function (holder) { iconize(holder, holder.classList.contains('occurred') ? 'circle-check-big' : 'circle'); });
    nodes(root, '.swe-lesson').forEach(function (holder) { iconize(holder, 'lightbulb'); });
    nodes(root, '.swe-carry h4').forEach(function (holder) { iconize(holder, 'arrow-right'); });
    nodes(root, '.sw-stage').forEach(function (button) { iconize(button, button.classList.contains('done') ? 'circle-check-big' : 'circle'); });
    nodes(root, '.sw-scenario-flags button').forEach(function (button) { iconize(button, button.classList.contains('danger') ? 'shield-x' : button.classList.contains('on') ? 'circle-check-big' : 'circle'); });

    nodes(root, '.session-stat-tabs').forEach(function (tabs) {
      Array.from(tabs.children).forEach(function (item, index) {
        if (item.tagName === 'SPAN') iconize(item, index === 0 ? 'layers-3' : index === 1 ? 'target' : 'gallery-horizontal');
      });
    });

    icons.schedule(document);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('.sw-timeline-nav button');
    if (!button) return;
    var nav = button.closest('.sw-timeline-nav');
    var buttons = Array.from(nav.querySelectorAll('button'));
    var buttonIndex = buttons.indexOf(button);
    if (buttonIndex < 2) return;
    var timeline = nav.parentElement.querySelector('.sw-timeline');
    if (!timeline) return;
    var cards = Array.from(timeline.querySelectorAll(':scope > .sw-entry'));
    if (!cards.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var current = Number(timeline.dataset.tjActiveCard || 0);
    current += buttonIndex === 2 ? -1 : 1;
    current = Math.max(0, Math.min(cards.length - 1, current));
    timeline.dataset.tjActiveCard = String(current);
    cards[current].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, true);

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (item) {
        if (item.nodeType === 1) decorate(item);
      });
    });
  });

  function start() {
    decorate(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}());
