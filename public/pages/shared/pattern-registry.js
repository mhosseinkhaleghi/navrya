(function () {
  'use strict';

  var layer = window.TradeJournalPanelLayer;
  var store = window.TradeJournalPatternStore;
  var i18n = window.TradeJournalPatternI18n;
  var ai = window.TradeJournalPatternAI;
  var icons = window.TradeJournalIcons;
  if (!layer || !store || !i18n) return;

  var state = { query: '', searchTimer: null, draggedStageId: null, open: false, patternId: null, tab: 'details' };
  var autosaveTimers = Object.create(null);
  var liveUrls = [];

  function el(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function icon(name, label, className) {
    return icons ? icons.icon(name, label || '', className || '') : el('span', 'pr-icon-fallback', '•');
  }

  function control(label, className, iconName) {
    var button = el('button', className || '');
    button.type = 'button';
    if (iconName) button.append(icon(iconName));
    if (label) button.append(document.createTextNode(label));
    return button;
  }

  function fieldLabel(key) { return el('span', 'pr-field-label', i18n.t(key)); }

  function stop(event) { event.preventDefault(); event.stopPropagation(); }

  function releaseUrls() {
    liveUrls.forEach(function (url) { if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url); });
    liveUrls = [];
  }

  function toast(message, tone) {
    var current = document.querySelector('.pr-toast');
    if (current) current.remove();
    var box = el('div', 'pr-toast ' + (tone || 'success'));
    box.setAttribute('role', 'status');
    box.append(icon(tone === 'danger' ? 'circle-alert' : 'circle-check-big'), document.createTextNode(message));
    document.body.append(box);
    window.setTimeout(function () { box.classList.add('show'); }, 10);
    window.setTimeout(function () { box.classList.remove('show'); window.setTimeout(function () { box.remove(); }, 220); }, 2600);
  }

  function saveSoon(pattern) {
    window.clearTimeout(autosaveTimers[pattern.id]);
    autosaveTimers[pattern.id] = window.setTimeout(function () {
      store.save(pattern);
      var status = document.querySelector('[data-pattern-save-status="' + pattern.id + '"]');
      if (status) status.textContent = i18n.t('autoSaved');
    }, 1100);
  }

  function saveNow(pattern, rerender) {
    window.clearTimeout(autosaveTimers[pattern.id]);
    store.save(pattern);
    toast(i18n.t('saved'));
    if (rerender) render();
  }

  function stats(pattern) {
    var values = [
      ['history', i18n.t('usage', { count: i18n.number(pattern.usageCount) })],
      ['lock-keyhole', i18n.t('thresholdBadge', { count: i18n.number(pattern.completionThreshold) })],
      ['images', i18n.t('images', { count: i18n.number(pattern.referenceScreenshots.length) })],
      ['list-ordered', i18n.t('stages', { count: i18n.number(pattern.stages.length) })]
    ];
    var wrap = el('div', 'pr-stats');
    values.forEach(function (item) { var badge = el('span', 'pr-stat'); badge.append(icon(item[0]), document.createTextNode(item[1])); wrap.append(badge); });
    return wrap;
  }

  function header() {
    var wrap = el('header', 'pr-page-header');
    var title = el('div', 'pr-title');
    var mark = el('span', 'pr-title-icon'); mark.append(icon('target'));
    var copy = el('div'); copy.append(el('h2', '', i18n.t('patterns')), el('p', '', i18n.t('subtitle')));
    title.append(mark, copy);
    var back = control(i18n.t('back'), 'pr-secondary', 'arrow-left');
    back.onclick = function () {
      state.open = false;
      history.replaceState(null, '', '#strategies');
      layer.render('strategies');
    };
    wrap.append(title, back);
    return wrap;
  }

  function moduleTabs() {
    if (window.TradeJournalStrategyTabs) return window.TradeJournalStrategyTabs.make('patterns');
    var nav = el('nav', 'se-module-tabs');
    var patterns = control(i18n.t('patternRegistry'), 'active', 'target');
    var educationLabel = window.TradeJournalStrategyEducationI18n ? window.TradeJournalStrategyEducationI18n.t('education') : 'Strategy Education';
    var education = control(educationLabel, '', 'graduation-cap');
    education.onclick = function () { if (window.TradeJournalStrategyEducation) window.TradeJournalStrategyEducation.open(); };
    nav.append(patterns, education);
    return nav;
  }

  function toolbar() {
    var wrap = el('div', 'pr-toolbar');
    var add = control(i18n.t('addPattern'), 'pr-primary', 'plus');
    add.onclick = function () {
      var pattern = store.create();
      openProfile(pattern.id, 'details');
      window.setTimeout(function () { var input = document.querySelector('[data-pattern-name="' + pattern.id + '"]'); if (input) input.focus(); }, 20);
    };
    var search = el('label', 'pr-search');
    search.append(icon('search'));
    var input = document.createElement('input'); input.type = 'search'; input.placeholder = i18n.t('search'); input.value = state.query; input.dir = 'auto';
    input.oninput = function () {
      window.clearTimeout(state.searchTimer);
      var value = input.value;
      state.searchTimer = window.setTimeout(function () { state.query = value; render(); }, 220);
    };
    search.append(input);
    wrap.append(add, search);
    return wrap;
  }

  function patternRow(pattern) {
    var card = el('article', 'pr-pattern-card');
    card.dataset.patternId = pattern.id;
    var row = el('div', 'pr-pattern-row');
    var main = control('', 'pr-pattern-main');
    var target = el('span', 'pr-target'); target.append(icon('target'));
    var copy = el('div', 'pr-pattern-copy'); copy.append(el('strong', '', pattern.name || i18n.t('unnamed')), stats(pattern)); copy.firstChild.dir = 'auto';
    main.append(target, copy);
    main.onclick = function () { openProfile(pattern.id, 'details'); };
    var tools = el('div', 'pr-row-tools');
    var chat = control('', 'pr-icon-button', 'message-circle'); chat.title = i18n.t('chat'); chat.setAttribute('aria-label', i18n.t('chat'));
    chat.onclick = function (event) { stop(event); openProfile(pattern.id, 'chat'); };
    var toggle = control('', 'pr-icon-button', i18n.direction() === 'rtl' ? 'chevron-left' : 'chevron-right'); toggle.setAttribute('aria-label', i18n.t('details'));
    toggle.onclick = function (event) { stop(event); openProfile(pattern.id, 'details'); };
    tools.append(chat, toggle);
    row.append(main, tools);
    card.append(row);
    return card;
  }

  function inputField(key, value, type) {
    var wrap = el('label', 'pr-field'); wrap.append(fieldLabel(key));
    var input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type || 'text';
    input.value = value || ''; input.dir = 'auto';
    wrap.append(input);
    return { wrap: wrap, input: input };
  }

  function thresholdEditor(pattern) {
    var block = el('section', 'pr-editor-section pr-threshold');
    var heading = el('div', 'pr-section-heading');
    var label = el('h3'); label.append(icon('lock-keyhole'), document.createTextNode(i18n.t('threshold')));
    var output = el('output', 'pr-threshold-value', i18n.number(pattern.completionThreshold) + '%');
    heading.append(label, output); block.append(heading);
    var range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1'; range.value = String(pattern.completionThreshold); range.setAttribute('aria-label', i18n.t('threshold'));
    range.style.setProperty('--pr-progress', pattern.completionThreshold + '%');
    range.oninput = function () { pattern.completionThreshold = Number(range.value); output.textContent = i18n.number(pattern.completionThreshold) + '%'; range.style.setProperty('--pr-progress', range.value + '%'); saveSoon(pattern); };
    var scale = el('div', 'pr-range-scale'); scale.append(el('span', '', i18n.number(0) + '%'), el('span', '', i18n.number(50) + '%'), el('span', '', i18n.number(100) + '%'));
    block.append(range, scale, el('p', 'pr-help', i18n.t('thresholdHelp')));
    return block;
  }

  function reorder(pattern, fromId, toId) {
    var from = pattern.stages.findIndex(function (item) { return item.id === fromId; });
    var to = pattern.stages.findIndex(function (item) { return item.id === toId; });
    if (from < 0 || to < 0 || from === to) return;
    var moved = pattern.stages.splice(from, 1)[0]; pattern.stages.splice(to, 0, moved);
    pattern.stages.forEach(function (item, index) { item.order = index + 1; });
    store.save(pattern); render();
  }

  function stageList(pattern) {
    var section = el('section', 'pr-editor-section');
    var head = el('div', 'pr-section-heading');
    var title = el('h3'); title.append(icon('layers-3'), document.createTextNode(i18n.t('patternStages'))); head.append(title, el('small', '', i18n.t('reorderHint'))); section.append(head);
    var list = el('ol', 'pr-stage-list');
    pattern.stages.forEach(function (stage, index) {
      var item = el('li', 'pr-stage'); item.draggable = true; item.dataset.stageId = stage.id;
      item.ondragstart = function () { state.draggedStageId = stage.id; item.classList.add('dragging'); };
      item.ondragend = function () { state.draggedStageId = null; item.classList.remove('dragging'); };
      item.ondragover = function (event) { event.preventDefault(); item.classList.add('drag-over'); };
      item.ondragleave = function () { item.classList.remove('drag-over'); };
      item.ondrop = function (event) { event.preventDefault(); item.classList.remove('drag-over'); reorder(pattern, state.draggedStageId, stage.id); };
      var handle = el('span', 'pr-drag'); handle.append(icon('grip-vertical'));
      var number = el('span', 'pr-stage-number', i18n.number(index + 1));
      var input = document.createElement('input'); input.type = 'text'; input.value = stage.text; input.dir = 'auto'; input.setAttribute('aria-label', i18n.t('patternStages') + ' ' + i18n.number(index + 1)); input.oninput = function () { stage.text = input.value; saveSoon(pattern); };
      var actions = el('div', 'pr-stage-actions');
      var up = control('', 'pr-mini-button', 'chevron-up'); up.title = i18n.t('moveUp'); up.disabled = index === 0; up.onclick = function () { reorder(pattern, stage.id, pattern.stages[index - 1].id); };
      var down = control('', 'pr-mini-button', 'chevron-down'); down.title = i18n.t('moveDown'); down.disabled = index === pattern.stages.length - 1; down.onclick = function () { reorder(pattern, stage.id, pattern.stages[index + 1].id); };
      var remove = control('', 'pr-mini-button danger', 'trash-2'); remove.title = i18n.t('remove'); remove.onclick = function () { pattern.stages = pattern.stages.filter(function (value) { return value.id !== stage.id; }); pattern.stages.forEach(function (value, position) { value.order = position + 1; }); store.save(pattern); render(); };
      actions.append(up, down, remove); item.append(handle, number, input, actions); list.append(item);
    });
    section.append(list);
    var addRow = el('div', 'pr-add-stage'); var input = document.createElement('input'); input.type = 'text'; input.dir = 'auto'; input.placeholder = i18n.t('newStage');
    var add = control(i18n.t('addStage'), 'pr-secondary', 'plus');
    function addStage() { var value = input.value.trim(); if (!value) return; pattern.stages.push(store.createStage(value, pattern.stages.length + 1)); store.save(pattern); render(); }
    add.onclick = addStage; input.onkeydown = function (event) { if (event.key === 'Enter') { event.preventDefault(); addStage(); } };
    addRow.append(input, add); section.append(addRow);
    return section;
  }

  async function hydrateImages(scope) {
    var images = Array.from(scope.querySelectorAll('img[data-pattern-image]'));
    await Promise.all(images.map(async function (image) {
      var pattern = store.find(image.dataset.patternId); if (!pattern) return;
      var screenshot = pattern.referenceScreenshots.find(function (item) { return item.id === image.dataset.patternImage; });
      var url = await store.screenshotUrl(screenshot); if (!url) return; image.src = url; liveUrls.push(url);
    }));
  }

  function lightbox(patternId, screenshotId) {
    var pattern = store.find(patternId); if (!pattern) return;
    var screenshot = pattern.referenceScreenshots.find(function (item) { return item.id === screenshotId; });
    var overlay = el('div', 'pr-modal-backdrop pr-lightbox');
    var objectUrl = '';
    function dismiss() { if (objectUrl.indexOf('blob:') === 0) URL.revokeObjectURL(objectUrl); overlay.remove(); }
    var close = control('', 'pr-modal-close', 'x'); close.setAttribute('aria-label', i18n.t('close')); close.onclick = dismiss;
    var image = document.createElement('img'); image.alt = screenshot.fileName || i18n.t('zoom');
    overlay.append(close, image); overlay.onclick = function (event) { if (event.target === overlay) dismiss(); };
    document.body.append(overlay);
    store.screenshotUrl(screenshot).then(function (url) { objectUrl = url || ''; image.src = objectUrl; });
  }

  function gallery(pattern) {
    var section = el('section', 'pr-editor-section');
    var heading = el('div', 'pr-section-heading'); var title = el('h3'); title.append(icon('images'), document.createTextNode(i18n.t('referenceImages'))); heading.append(title); section.append(heading);
    var layout = el('div', 'pr-image-layout');
    var upload = el('label', 'pr-upload'); var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.multiple = true; input.hidden = true;
    var uploadIcon = el('span'); uploadIcon.append(icon('image-plus')); upload.append(uploadIcon, el('b', '', i18n.t('uploadTitle')), el('small', '', i18n.t('uploadHint')), input);
    async function files(values) {
      var list = Array.from(values || []); if (!list.length) return; upload.classList.add('loading');
      try { await store.addScreenshots(pattern.id, list); render(); }
      catch (error) { upload.classList.remove('loading'); toast(i18n.t(error.message === 'INVALID_IMAGE_TYPE' ? 'imageTypeError' : error.message === 'IMAGE_TOO_LARGE' ? 'imageSizeError' : 'uploadError'), 'danger'); }
    }
    input.onchange = function () { files(input.files); };
    upload.ondragover = function (event) { event.preventDefault(); upload.classList.add('dragging'); };
    upload.ondragleave = function () { upload.classList.remove('dragging'); };
    upload.ondrop = function (event) { event.preventDefault(); upload.classList.remove('dragging'); files(event.dataTransfer.files); };
    layout.append(upload);
    var thumbs = el('div', 'pr-gallery');
    pattern.referenceScreenshots.forEach(function (image) {
      var figure = el('figure', 'pr-thumb'); var preview = document.createElement('img'); preview.alt = image.fileName; preview.dataset.patternId = pattern.id; preview.dataset.patternImage = image.id; preview.onclick = function () { lightbox(pattern.id, image.id); };
      var remove = control('', 'pr-thumb-remove', 'x'); remove.title = i18n.t('remove'); remove.onclick = async function () { await store.removeScreenshot(pattern.id, image.id); render(); };
      var note = document.createElement('input'); note.type = 'text'; note.dir = 'auto'; note.value = image.note || ''; note.placeholder = i18n.t('screenshotNote'); note.oninput = function () { image.note = note.value; saveSoon(pattern); };
      figure.append(preview, remove, note); thumbs.append(figure);
    });
    layout.append(thumbs); section.append(layout); return section;
  }

  function editor(pattern) {
    var form = el('div', 'pr-editor');
    var fields = el('div', 'pr-editor-fields');
    var name = inputField('patternName', pattern.name, 'text'); name.input.placeholder = i18n.t('patternNamePlaceholder'); name.input.dataset.patternName = pattern.id;
    name.input.oninput = function () { pattern.name = name.input.value; saveSoon(pattern); var card = form.closest('.pr-pattern-card'); var title = card && card.querySelector('.pr-pattern-copy strong'); if (title) title.textContent = pattern.name || i18n.t('unnamed'); var profileTitle = document.querySelector('.pr-profile-title strong'); if (profileTitle) profileTitle.textContent = pattern.name || i18n.t('unnamed'); };
    var description = inputField('description', pattern.description, 'textarea'); description.input.placeholder = i18n.t('descriptionPlaceholder'); description.input.oninput = function () { pattern.description = description.input.value; saveSoon(pattern); };
    description.wrap.append(el('small', 'pr-help', i18n.t('descriptionHelp'))); fields.append(name.wrap, description.wrap); form.append(fields, thresholdEditor(pattern), stageList(pattern), gallery(pattern));
    var patternRegistry = window.TradeJournalAIProcessRegistry, patternTypes = window.TradeJournalPatternTypes;
    if (patternRegistry && patternTypes) patternRegistry.register('pattern-editor-' + pattern.id, {
      allowlist: (patternTypes.patternStagePaths || []).slice(),
      isOpen: function () { return document.body.contains(form); },
      activeStep: function () { return 'details'; },
      applyValue: function (path, value) {
        var target = path === 'name' ? name : path === 'description' ? description : null;
        if (!target) return;
        target.input.value = value;
        target.input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    var aiRow = el('div', 'pr-ai-row'); var generate = control(i18n.t('writeWithAI'), 'pr-ai-button', 'sparkles');
    generate.onclick = async function () {
      generate.disabled = true; generate.classList.add('loading'); generate.replaceChildren(icon('loader-circle'), document.createTextNode(i18n.t('generating')));
      try { if (!ai) throw new Error('AI_SERVICE_MISSING'); var result = await ai.generateStages(pattern); if (!result.stages.length) throw new Error('NO_STAGES'); pattern.stages = result.stages; store.save(pattern); if (result.local) toast(i18n.t('aiUnavailable'), 'warning'); else toast(i18n.t('saved')); render(); }
      catch (_) { generate.disabled = false; toast(i18n.t('aiError'), 'danger'); }
    };
    var chat = control(i18n.t('chat'), 'pr-secondary', 'message-circle'); chat.onclick = function () { openProfile(pattern.id, 'chat'); }; aiRow.append(generate, chat); form.append(aiRow);
    var footer = el('footer', 'pr-editor-footer'); var remove = control(i18n.t('deletePattern'), 'pr-danger', 'trash-2'); remove.onclick = function () { confirmDelete(pattern.id); };
    var status = el('small', 'pr-save-status', ''); status.dataset.patternSaveStatus = pattern.id;
    var save = control(i18n.t('saveChanges'), 'pr-primary', 'save'); save.onclick = function () { if (!pattern.name.trim()) { toast(i18n.t('invalidName'), 'danger'); name.input.focus(); return; } saveNow(pattern, true); };
    footer.append(remove, status, save); form.append(footer); return form;
  }

  // Hardened the same way trade-ui.js's modal() already is (Escape-key close, backdrop-click
  // close, a guaranteed single teardown even if a caller's own close handler also calls
  // overlay.remove()) - previously this had none of that, so an interrupted open/close cycle
  // (e.g. navigating away mid-async) could leave a full-viewport backdrop behind, silently
  // intercepting clicks meant for whatever opens next (see trade-system.css's z-index comment
  // for the other half of this fix). Every existing caller already calls modal.overlay.remove()
  // in its own close/cancel/confirm handlers, so overriding what that does is a transparent
  // upgrade - no call site needs to change.
  function modalShell(className) {
    var overlay = el('div', 'pr-modal-backdrop'); var box = el('section', 'pr-modal ' + (className || '')); overlay.append(box); document.body.append(overlay);
    var closed = false;
    var nativeRemove = overlay.remove.bind(overlay);
    function destroy() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKeydown, true);
      nativeRemove();
    }
    function onKeydown(event) { if (event.key === 'Escape') destroy(); }
    document.addEventListener('keydown', onKeydown, true);
    overlay.remove = destroy;
    overlay.addEventListener('click', function (event) { if (event.target === overlay) destroy(); });
    box.addEventListener('click', function (event) { event.stopPropagation(); });
    return { overlay: overlay, box: box };
  }

  function confirmDelete(patternId) {
    var modal = modalShell('pr-confirm'); var head = el('header'); var title = el('h3'); title.append(icon('triangle-alert'), document.createTextNode(i18n.t('deleteConfirmTitle'))); head.append(title); var body = el('div', 'pr-modal-body'); body.append(el('p', '', i18n.t('deleteConfirmBody'))); var footer = el('footer');
    var cancel = control(i18n.t('cancel'), 'pr-secondary'); cancel.onclick = function () { modal.overlay.remove(); };
    var confirm = control(i18n.t('confirmDelete'), 'pr-danger', 'trash-2'); confirm.onclick = async function () { confirm.disabled = true; await store.remove(patternId); modal.overlay.remove(); state.patternId = null; state.tab = 'details'; history.replaceState(null, '', '#strategies/patterns'); render(); };
    footer.append(cancel, confirm); modal.box.append(head, body, footer); modal.overlay.onclick = function (event) { if (event.target === modal.overlay) modal.overlay.remove(); };
  }

  function understanding(pattern) {
    var box = el('section', 'pr-understanding'); var title = el('h4'); title.append(icon('sparkles'), document.createTextNode(i18n.t('currentUnderstanding'))); box.append(title);
    if (pattern.description.trim()) box.append(el('p', '', pattern.description));
    if (pattern.stages.length) { var list = el('ol'); pattern.stages.forEach(function (stage) { var item = el('li', '', stage.text); item.dir = 'auto'; list.append(item); }); box.append(list); }
    if (!pattern.description.trim() && !pattern.stages.length) box.append(el('p', '', i18n.t('noUnderstanding')));
    box.append(el('small', '', i18n.t('localSummary'))); return box;
  }

  function openChat(patternId) {
    var pattern = store.find(patternId); if (!pattern) return;
    var modal = modalShell('pr-chat'); modal.overlay.dir = i18n.direction();
    var head = el('header'); var title = el('h3', '', i18n.t('chatTitle', { name: pattern.name || i18n.t('unnamed') })); title.dir = 'auto'; var close = control('', 'pr-modal-close', 'x'); close.setAttribute('aria-label', i18n.t('close')); close.onclick = function () { modal.overlay.remove(); render(); }; head.append(title, close);
    var body = el('div', 'pr-chat-body'); body.append(understanding(pattern)); var messages = el('div', 'pr-chat-messages'); body.append(messages);
    var footer = el('footer', 'pr-chat-compose'); var input = document.createElement('textarea'); input.rows = 1; input.dir = 'auto'; input.placeholder = i18n.t('chatPlaceholder'); var send = control(i18n.t('send'), 'pr-primary', 'send-horizontal'); var hint = el('small', '', i18n.t('enterToSend')); footer.append(input, send, hint); modal.box.append(head, body, footer);

    function paintMessages() {
      messages.replaceChildren();
      var history = pattern.chatHistory || [];
      if (!history.length) messages.append(el('div', 'pr-chat-welcome', i18n.t('chatWelcome')));
      history.forEach(function (message) {
        var bubble = el('article', 'pr-chat-message ' + message.role); bubble.dir = 'auto'; var meta = el('small', '', message.role === 'user' ? i18n.t('user') : i18n.t('assistant')); bubble.append(meta, el('p', '', message.content));
        if (message.suggestedStages && message.suggestedStages.length) { var apply = control(i18n.t('applyStages'), 'pr-apply-stages', 'wand-sparkles'); apply.onclick = function () { pattern.stages = message.suggestedStages.map(function (stage, index) { return { id: stage.id || store.createStage('', index + 1).id, order: index + 1, text: stage.text }; }); store.save(pattern); toast(i18n.t('stagesApplied')); modal.box.querySelector('.pr-understanding').replaceWith(understanding(pattern)); }; bubble.append(apply); }
        messages.append(bubble);
      });
      messages.scrollTop = messages.scrollHeight;
    }

    async function sendMessage() {
      var value = input.value.trim(); if (!value || send.disabled) return;
      pattern.chatHistory.push({ id: 'chat-' + Date.now().toString(36), role: 'user', content: value, createdAt: new Date().toISOString() }); store.save(pattern); input.value = ''; paintMessages(); send.disabled = true; send.replaceChildren(icon('loader-circle'), document.createTextNode(i18n.t('loading')));
      try {
        if (!ai) throw new Error('AI_SERVICE_MISSING');
        var result = await ai.chat(pattern, value); var reply = { id: 'chat-' + Date.now().toString(36) + '-ai', role: 'assistant', content: result.reply, createdAt: new Date().toISOString() };
        if (result.suggestedStages && result.suggestedStages.length) reply.suggestedStages = result.suggestedStages;
        pattern.chatHistory.push(reply); store.save(pattern); if (result.local) toast(i18n.t('aiUnavailable'), 'warning'); paintMessages();
      } catch (_) { toast(i18n.t('aiError'), 'danger'); }
      send.disabled = false; send.replaceChildren(icon('send-horizontal'), document.createTextNode(i18n.t('send'))); input.focus();
    }
    send.onclick = sendMessage; input.onkeydown = function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } };
    modal.overlay.onclick = function (event) { if (event.target === modal.overlay) { modal.overlay.remove(); render(); } }; paintMessages(); input.focus();
  }

  function profileHeader(pattern) {
    var wrap = el('header', 'pr-profile-header');
    var back = control(i18n.t('profileBack'), 'pr-secondary', i18n.direction() === 'rtl' ? 'arrow-right' : 'arrow-left');
    back.onclick = function () { state.patternId = null; history.replaceState(null, '', '#strategies/patterns'); render(); };
    var title = el('div', 'pr-profile-title'); var mark = el('span', 'pr-target'); mark.append(icon('target'));
    var copy = el('div'); var name = el('strong', '', pattern.name || i18n.t('unnamed')); name.dir = 'auto'; copy.append(name, stats(pattern)); title.append(mark, copy);
    wrap.append(title, back); return wrap;
  }

  function profileTabs(pattern) {
    var nav = el('nav', 'pr-profile-tabs');
    [['details', 'details', 'sliders-horizontal'], ['chat', 'chat', 'message-circle'], ['report', 'report', 'chart-no-axes-combined'], ['sharing', 'sharing', 'share-2']].forEach(function (item) {
      var button = control(i18n.t(item[1]), state.tab === item[0] ? 'active' : '', item[2]);
      button.onclick = function () { openProfile(pattern.id, item[0]); }; nav.append(button);
    });
    return nav;
  }

  function chatView(pattern) {
    var wrap = el('section', 'pr-chat pr-profile-chat');
    var head = el('header'); var title = el('h3', '', i18n.t('chatTitle', { name: pattern.name || i18n.t('unnamed') })); title.dir = 'auto'; head.append(title);
    var body = el('div', 'pr-chat-body'); body.append(understanding(pattern)); var messages = el('div', 'pr-chat-messages'); body.append(messages);
    var footer = el('footer', 'pr-chat-compose'); var input = document.createElement('textarea'); input.rows = 1; input.dir = 'auto'; input.placeholder = i18n.t('chatPlaceholder'); var send = control(i18n.t('send'), 'pr-primary', 'send-horizontal'); footer.append(input, send, el('small', '', i18n.t('enterToSend'))); wrap.append(head, body, footer);
    function paintMessages() {
      messages.replaceChildren(); var history = pattern.chatHistory || [];
      if (!history.length) messages.append(el('div', 'pr-chat-welcome', i18n.t('chatWelcome')));
      history.forEach(function (message) {
        var bubble = el('article', 'pr-chat-message ' + message.role); bubble.dir = 'auto'; bubble.append(el('small', '', message.role === 'user' ? i18n.t('user') : i18n.t('assistant')), el('p', '', message.content));
        if (message.suggestedStages && message.suggestedStages.length) { var apply = control(i18n.t('applyStages'), 'pr-apply-stages', 'wand-sparkles'); apply.onclick = function () { pattern.stages = message.suggestedStages.map(function (stage, index) { return { id: stage.id || store.createStage('', index + 1).id, order: index + 1, text: stage.text }; }); store.save(pattern); toast(i18n.t('stagesApplied')); var current = wrap.querySelector('.pr-understanding'); if (current) current.replaceWith(understanding(pattern)); }; bubble.append(apply); }
        messages.append(bubble);
      }); messages.scrollTop = messages.scrollHeight;
    }
    async function sendMessage() {
      var value = input.value.trim(); if (!value || send.disabled) return;
      pattern.chatHistory.push({ id: 'chat-' + Date.now().toString(36), role: 'user', content: value, createdAt: new Date().toISOString() }); store.save(pattern); input.value = ''; paintMessages(); send.disabled = true; send.replaceChildren(icon('loader-circle'), document.createTextNode(i18n.t('loading')));
      try { if (!ai) throw new Error('AI_SERVICE_MISSING'); var result = await ai.chat(pattern, value); var reply = { id: 'chat-' + Date.now().toString(36) + '-ai', role: 'assistant', content: result.reply, createdAt: new Date().toISOString() }; if (result.suggestedStages && result.suggestedStages.length) reply.suggestedStages = result.suggestedStages; pattern.chatHistory.push(reply); store.save(pattern); if (result.local) toast(i18n.t('aiUnavailable'), 'warning'); paintMessages(); }
      catch (_) { toast(i18n.t('aiError'), 'danger'); }
      send.disabled = false; send.replaceChildren(icon('send-horizontal'), document.createTextNode(i18n.t('send'))); input.focus();
    }
    send.onclick = sendMessage; input.onkeydown = function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }; paintMessages(); return wrap;
  }

  function reportMetric(label, value, iconName) { var card = el('article', 'pr-report-metric'); var top = el('span'); top.append(icon(iconName), document.createTextNode(label)); card.append(top, el('strong', '', value)); return card; }

  function reportView(pattern) {
    var report = store.scenarioReport ? store.scenarioReport(pattern.id) : { hasData: false };
    var trades = window.TradeJournalTradeReports && window.TradeJournalTradeReports.patternSummary ? window.TradeJournalTradeReports.patternSummary(pattern.id) : { hasData: false };
    var missing = i18n.t('insufficientData'); var wrap = el('section', 'pr-report-view');
    var metrics = el('div', 'pr-report-metrics');
    metrics.append(
      reportMetric(i18n.t('detections'), report.hasData ? i18n.number(report.detectionCount) : missing, 'scan-search'),
      reportMetric(i18n.t('averageCompletion'), report.hasData && report.averageCompletion !== null ? i18n.number(report.averageCompletion) + '%' : missing, 'list-checks'),
      reportMetric(i18n.t('occurrenceRate'), report.hasData && report.occurrenceRate !== null ? i18n.number(report.occurrenceRate) + '%' : missing, 'badge-check'),
      reportMetric(i18n.t('linkedTrades'), trades.hasData ? i18n.number(trades.tradeCount) : missing, 'candlestick-chart'),
      reportMetric(i18n.t('winRate'), trades.hasData && trades.winRate !== null ? i18n.number(trades.winRate) + '%' : missing, 'trophy'),
      reportMetric(i18n.t('averageRr'), trades.hasData && trades.averageRr !== null ? i18n.number(trades.averageRr) : missing, 'scale')
    );
    wrap.append(metrics);
    var reports = window.TradeJournalTradeReports;
    if (reports && reports.canvasCard) {
      var funnel = report.hasData ? [{ label: i18n.t('detected'), value: report.detectionCount }, { label: i18n.t('stagesCompleted'), value: report.fullyCompletedCount }, { label: i18n.t('occurred'), value: report.scenarios.filter(function (row) { return row.occurred; }).length }] : [];
      wrap.append(reports.canvasCard(i18n.t('detectionFunnel'), 'funnel', funnel));
    } else if (!report.hasData) wrap.append(el('p', 'pr-report-empty', missing));
    return wrap;
  }

  function sharingView(pattern) {
    var section = el('section', 'pr-sharing'); var row = el('label', 'pr-sharing-toggle'); var input = document.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(pattern.isPublic);
    var marketplace = window.TradeJournalMarketplace, communityStore = window.TradeJournalCommunityStore;
    var status = el('div', 'pr-marketplace-status');

    // Real evidence only - the same numbers the report tab already shows, never fabricated.
    function evidenceSnapshot() {
      var report = store.scenarioReport(pattern.id);
      return { successRatePercent: report.hasData ? report.occurrenceRate : null, sampleSize: report.hasData ? report.detectionCount : 0, evidenceAsOf: new Date().toISOString() };
    }
    function buildContent(previewCount) {
      return {
        previewContent: { name: pattern.name, description: pattern.description, stages: pattern.stages.slice(0, previewCount) },
        fullContent: { name: pattern.name, description: pattern.description, stages: pattern.stages, completionThreshold: pattern.completionThreshold }
      };
    }
    function openFlow(existingListing) {
      if (!marketplace) return;
      marketplace.openPublishFlow({
        type: 'pattern', sourceId: pattern.id, suggestedTitle: pattern.name, evidence: evidenceSnapshot(),
        maxPreviewItems: pattern.stages.length, buildContent: buildContent, existingListing: existingListing || null, onPublished: paintStatus
      });
    }
    function paintStatus() {
      if (!marketplace) { status.replaceChildren(el('p', '', i18n.t('sharingSoon'))); return; }
      marketplace.findListingBySource(pattern.id).then(function (listing) {
        status.replaceChildren();
        if (!listing) { status.append(el('p', 'tj-hint', i18n.t('notListedYet'))); return; }
        status.append(el('span', 'pr-marketplace-badge', i18n.t('listedBadge')));
        var editBtn = control(i18n.t('editListing'), 'tj-secondary'); editBtn.onclick = function () { openFlow(listing); };
        var refreshBtn = control(i18n.t('refreshEvidence'), 'tj-secondary'); refreshBtn.onclick = function () {
          var evidence = evidenceSnapshot();
          communityStore.updateListing(listing.id, evidence).then(function () { toast(i18n.t('saved')); paintStatus(); });
        };
        status.append(editBtn, refreshBtn);
      });
    }
    input.onchange = function () { pattern.isPublic = input.checked; store.save(pattern); toast(i18n.t('saved')); if (input.checked) openFlow(); };
    row.append(input, el('span', '', i18n.t('publicPattern')));
    section.append(row, status);
    paintStatus();
    return section;
  }

  function openProfile(patternId, tab) {
    state.patternId = patternId; state.tab = ['details', 'chat', 'report', 'sharing'].indexOf(tab) > -1 ? tab : 'details';
    history.replaceState(null, '', '#strategies/patterns/' + encodeURIComponent(patternId) + '/' + state.tab); render();
  }

  function renderProfile(patternId, tab) {
    releaseUrls(); state.open = true; state.patternId = patternId; state.tab = tab;
    var pattern = store.find(patternId); if (!pattern) { history.replaceState(null, '', '#strategies/patterns'); return renderList(); }
    var navrya = window.TradeJournalNavryaPatternRegistry;
    var page;
    if (navrya && navrya.render) {
      page = navrya.render('profile', patternId, tab);
    } else {
      page = el('section', 'panel-page pattern-registry-page pr-profile-page'); page.dir = i18n.direction(); page.dataset.route = '/strategies/patterns/' + pattern.id + '/' + tab;
      page.append(profileHeader(pattern), moduleTabs(), profileTabs(pattern));
      if (tab === 'chat') page.append(chatView(pattern)); else if (tab === 'report') page.append(reportView(pattern)); else if (tab === 'sharing') page.append(sharingView(pattern)); else page.append(editor(pattern));
    }
    layer.show(page, 'strategies');
    if (!navrya || !navrya.render) hydrateImages(page);
    if (icons) icons.schedule(document);
  }

  function renderList() {
    releaseUrls(); state.open = true;
    state.patternId = null;
    var navrya = window.TradeJournalNavryaPatternRegistry;
    var page;
    if (navrya && navrya.render) {
      page = navrya.render('list');
    } else {
      page = el('section', 'panel-page pattern-registry-page'); page.dir = i18n.direction(); page.dataset.route = '/strategies/patterns';
      page.append(header(), moduleTabs(), toolbar());
      var list = el('section', 'pr-list'); var patterns = store.listSync(); var query = state.query.trim().toLocaleLowerCase(i18n.locale());
      var filtered = query ? patterns.filter(function (pattern) { return pattern.name.toLocaleLowerCase(i18n.locale()).indexOf(query) > -1; }) : patterns;
      if (!filtered.length) { var empty = el('div', 'pr-empty'); empty.append(icon('scan-search'), el('strong', '', i18n.t(query ? 'emptySearch' : 'empty'))); list.append(empty); }
      else filtered.forEach(function (pattern) { list.append(patternRow(pattern)); });
      page.append(list);
    }
    layer.show(page, 'strategies');
    if (window.location.hash !== '#strategies/patterns') history.replaceState(null, '', '#strategies/patterns');
    if (!navrya || !navrya.render) hydrateImages(page);
    if (icons) icons.schedule(document);
  }

  function route() {
    var match = window.location.hash.match(/^#strategies\/patterns\/([^/]+)\/(details|chat|report|sharing)$/);
    return match ? { patternId: decodeURIComponent(match[1]), tab: match[2] } : null;
  }

  function render() { var current = route(); if (current) renderProfile(current.patternId, current.tab); else renderList(); }

  function open() { history.replaceState(null, '', '#strategies/patterns'); renderList(); }

  window.TradeJournalPatternRegistry = { open: open, render: render, label: function () { return i18n.t('patternRegistry'); } };
  layer.register('strategies', [{ id: 'strategy-pattern-registry', type: 'strategy', title: i18n.t('patternRegistry'), description: i18n.t('registryDescription'), span: 2 }]);
  window.addEventListener('hashchange', function () { if (window.location.hash.indexOf('#strategies/patterns') === 0) render(); });
  new MutationObserver(function () { if (state.open && document.querySelector('.pattern-registry-page')) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  if (window.location.hash.indexOf('#strategies/patterns') === 0) window.setTimeout(render, 0);
}());
