(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var store = window.TradeJournalMentalHealthStore;
  var collector = window.TradeJournalMentalHealthCollector;
  var cycle = window.TradeJournalMentalHealthCycle;
  var ai = window.TradeJournalMentalHealthAI;
  var cardsEngine = window.TradeJournalMentalHealthCards;
  var charts = window.TradeJournalMentalHealthCharts;
  var scheduler = window.TradeJournalMentalHealthScheduler;
  var safety = window.TradeJournalMentalHealthSafety;
  var types = window.TradeJournalMentalHealthTypes;
  var tradeStore = window.TradeJournalTradeStore;
  if (!i18n || !store || !collector || !cycle || !ai || !cardsEngine || !charts || !scheduler || !types || !tradeStore) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }
  function lastEmotion(trade) { var log = trade.emotionLog || []; return log.length ? log[log.length - 1] : null; }

  function guardedSubmit(text, container, onSafe) {
    if (safety) {
      var check = safety.checkText(text);
      if (check.flagged) { container.replaceChildren(safety.renderSafetyCard(function () { container.replaceChildren(); })); return; }
    }
    onSafe();
  }

  function textField(label, value, multiline) {
    var wrap = el('label', 'tj-field'); wrap.append(el('span', '', label));
    var input = multiline ? document.createElement('textarea') : document.createElement('input');
    if (multiline) input.rows = 2; else input.type = 'text';
    input.dir = 'auto'; input.value = value || '';
    wrap.append(input);
    return { wrap: wrap, input: input };
  }
  function selectField(label, options, value) {
    var wrap = el('label', 'tj-field'); wrap.append(el('span', '', label));
    var input = document.createElement('select');
    options.forEach(function (opt) { input.append(new Option(opt, opt, false, opt === value)); });
    wrap.append(input);
    return { wrap: wrap, input: input };
  }
  function infoIcon(text) { var span = el('span', 'tj-info-icon'); span.tabIndex = 0; span.setAttribute('role', 'note'); span.setAttribute('aria-label', text); span.dataset.tooltip = text; span.append(ico('info')); return span; }
  function chartCard(title, drawFn, infoText) {
    var card = el('article', 'tj-chart-card'), head = el('div', 'tj-chart-head'), heading = el('h3', '', title);
    if (infoText) heading.append(infoIcon(infoText));
    head.append(heading);
    var canvasWrap = el('div', 'psy-canvas-wrap'), canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 260;
    var tooltip = el('div', 'psy-chart-tooltip'); tooltip.style.display = 'none';
    canvasWrap.append(canvas, tooltip);
    card.append(head, canvasWrap);
    setTimeout(function () { drawFn(canvas, tooltip); }, 0);
    return card;
  }

  // ---------------------------------------------------------------------
  // Intake nudge (baseline is retired as an active concept - existing
  // baseline data is left untouched, but intake.completed is now the
  // canonical gate and Intake is the canonical entry point).
  // ---------------------------------------------------------------------
  function intakeNudge(profile, refresh) {
    var wrap = el('section', 'mh-card');
    wrap.append(el('strong', '', i18n.t('mhIntakeNotCompleted')));
    var startIntake = button(i18n.t('mhStartIntake'), 'tj-primary', 'clipboard-list');
    startIntake.onclick = function () { if (window.TradeJournalMentalHealthIntake) window.TradeJournalMentalHealthIntake.open(refresh); };
    wrap.append(startIntake);
    icons(wrap);
    return wrap;
  }

  function checkInCard(due) {
    var card = el('section', 'mh-card mh-checkin-card');
    card.append(el('strong', '', i18n.t('mhCheckInDue')), el('p', '', i18n.t('mhCheckInHint')));
    var dismiss = button(i18n.t('mhCheckInDismiss'), 'tj-secondary');
    dismiss.onclick = function () { card.remove(); };
    card.append(dismiss);
    return card;
  }

  // ---------------------------------------------------------------------
  // Chat (shared by both tabs; reuses the strategy-education suggestion pattern)
  // ---------------------------------------------------------------------
  function suggestionCard(profile, item, onChange) {
    var box = el('div', 'mh-proposal'), compare = el('div', 'mh-proposal-compare'), cur = el('div'), next = el('div');
    cur.append(el('small', '', i18n.t('mhCurrentValue')), el('p', '', String(store.getPath(profile, item.path) || '—')));
    next.append(el('small', '', i18n.t('mhProposedValue')), el('p', '', String(item.value == null ? '—' : item.value)));
    compare.append(cur, next);
    var actions = el('div', 'mh-proposal-actions'), reject = button(i18n.t('mhReject'), 'tj-secondary', 'x'), apply = button(i18n.t('mhApply'), 'tj-primary', 'check');
    reject.onclick = function () { store.applySuggestion(profile, item, 'rejected'); toast(i18n.t('mhSuggestionRejected'), ''); onChange(); };
    apply.onclick = function () { store.applySuggestion(profile, item, 'applied'); toast(i18n.t('mhSuggestionApplied'), 'success'); onChange(); };
    actions.append(reject, apply);
    box.append(compare, actions);
    return box;
  }

  function chatCard(profile, refresh) {
    var card = el('section', 'mh-card mh-chat-card');
    card.append(el('h3', '', i18n.t('mhChatTitle')));
    var messages = el('div', 'mh-chat-messages');
    function paintMessages() {
      messages.replaceChildren();
      (profile.chatHistory || []).forEach(function (message) {
        var bubble = el('div', 'mh-chat-bubble ' + message.role, message.content);
        (message.suggestions || []).forEach(function (item) {
          if (item.status === 'pending') bubble.append(suggestionCard(profile, item, function () { profile = store.load(); paintMessages(); }));
        });
        messages.append(bubble);
      });
      messages.scrollTop = messages.scrollHeight;
    }
    paintMessages();
    var safetyArea = el('div');
    var form = el('div', 'mh-chat-form');
    var input = document.createElement('textarea'); input.rows = 2; input.dir = 'auto'; input.placeholder = i18n.t('mhChatPlaceholder');
    var send = button(i18n.t('mhChatSend'), 'tj-primary', 'send');
    send.onclick = async function () {
      var value = input.value.trim();
      if (!value || send.disabled) return;
      if (safety) {
        var check = safety.checkText(value);
        if (check.flagged) { safetyArea.replaceChildren(safety.renderSafetyCard(function () { safetyArea.replaceChildren(); })); input.value = ''; return; }
      }
      profile = store.addMessage(profile, 'user', value); input.value = ''; paintMessages(); send.disabled = true;
      try {
        var result = await ai.chat(profile, value);
        if (result.flagged) { safetyArea.replaceChildren(safety.renderSafetyCard(function () { safetyArea.replaceChildren(); })); send.disabled = false; return; }
        profile = store.addMessage(profile, 'assistant', result.reply, result.suggestions);
        if (result.local) toast(i18n.t('mhAiUnavailable'), 'warning');
        paintMessages();
      } catch (_) { toast(i18n.t('mhAiUnavailable'), 'danger'); } finally { send.disabled = false; }
    };
    form.append(input, send);
    card.append(messages, safetyArea, form);
    icons(card);
    return card;
  }

  // ---------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------
  function triggerForm(profile, refresh) {
    var card = el('section', 'mh-card'), heading = el('h3', '', i18n.t('mhAddTrigger'));
    heading.append(infoIcon(i18n.t('mhInfoTriggers')));
    card.append(heading);
    var draft = profile.triggerProfile.draftTrigger;
    var desc = textField(i18n.t('mhTriggerDescription'), draft.description, true);
    var type = selectField(i18n.t('mhTriggerType'), types.triggerTypes, draft.triggerType);
    var action = textField(i18n.t('mhTriggerAction'), draft.recommendedAction, true);
    var safetyArea = el('div');
    var save = button(i18n.t('mhSaveTrigger'), 'tj-primary', 'check');
    save.onclick = function () {
      if (!desc.input.value.trim()) return;
      guardedSubmit(desc.input.value, safetyArea, function () {
        profile.triggerProfile.draftTrigger.description = desc.input.value.trim();
        profile.triggerProfile.draftTrigger.triggerType = type.input.value;
        profile.triggerProfile.draftTrigger.recommendedAction = action.input.value.trim();
        profile = store.save(profile);
        profile = store.commitDraftTrigger(profile);
        toast(i18n.t('mhSaveTrigger'), 'success');
        refresh();
      });
    };
    card.append(desc.wrap, type.wrap, action.wrap, safetyArea, save);
    return card;
  }

  // ---------------------------------------------------------------------
  // Thought records
  // ---------------------------------------------------------------------
  function currentCognitivePhaseBias(profile) {
    var bias = profile.cognitiveProfile.identifiedBiases.find(function (b) { return b.cyclePhase === 'cognitive'; });
    return bias ? bias.type : null;
  }

  function thoughtRecordSection(profile, refresh) {
    var wrap = el('section', 'mh-card'), heading = el('h3', '', i18n.t('mhThoughtRecordTitle'));
    heading.append(infoIcon(i18n.t('mhInfoThoughtRecords')));
    wrap.append(heading, el('p', 'tj-hint', i18n.t('mhOptionalReflection')));
    var draft = profile.cognitiveProfile.draftThoughtRecord;
    var automatic = textField(i18n.t('mhAutomaticThought'), draft.automaticThought, true);
    var emotion = textField(i18n.t('mhEmotionFelt'), draft.emotion, false);
    var forE = textField(i18n.t('mhEvidenceFor'), draft.evidenceFor, true);
    var against = textField(i18n.t('mhEvidenceAgainst'), draft.evidenceAgainst, true);
    var balanced = textField(i18n.t('mhBalancedThought'), draft.balancedThought, true);
    var safetyArea = el('div');
    var save = button(i18n.t('mhSaveThoughtRecord'), 'tj-primary', 'check');
    save.onclick = function () {
      var combined = [automatic.input.value, emotion.input.value, forE.input.value, against.input.value, balanced.input.value].join(' ');
      guardedSubmit(combined, safetyArea, function () {
        profile.cognitiveProfile.draftThoughtRecord = {
          automaticThought: automatic.input.value.trim(), emotion: emotion.input.value.trim(),
          evidenceFor: forE.input.value.trim(), evidenceAgainst: against.input.value.trim(), balancedThought: balanced.input.value.trim()
        };
        profile = store.save(profile);
        profile = store.commitDraftThoughtRecord(profile, null, currentCognitivePhaseBias(profile));
        toast(i18n.t('mhThoughtRecordSaved'), 'success');
        refresh();
      });
    };
    wrap.append(automatic.wrap, emotion.wrap, forE.wrap, against.wrap, balanced.wrap, safetyArea, save);

    var list = el('div', 'mh-thought-list');
    list.append(el('h4', '', i18n.t('mhThoughtRecordsListTitle')));
    if (!profile.cognitiveProfile.thoughtRecords.length) list.append(el('p', 'mh-empty', i18n.t('mhNoThoughtRecords')));
    else profile.cognitiveProfile.thoughtRecords.slice(-10).reverse().forEach(function (record) {
      var row = el('article', 'mh-thought-row');
      row.append(el('time', '', i18n.date(record.timestamp)), el('strong', '', record.automaticThought), el('p', '', record.balancedThought));
      list.append(row);
    });
    wrap.append(list);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Education cards
  // ---------------------------------------------------------------------
  function educationCardView(profile, bias, refresh) {
    var wrap = el('section', 'mh-card mh-education-card');
    var card = profile.educationCards[bias.type];
    var heading = el('h3', '', i18n.t('mhEducationCardTitle') + ' · ' + i18n.t('mhBias_' + bias.type));
    heading.append(infoIcon(i18n.t('mhInfoEducationCard')));
    wrap.append(heading);
    if (!card) {
      wrap.append(el('p', '', i18n.t('mhGeneratingCard')));
      cardsEngine.ensureCard(profile, bias.type, false).then(function () { refresh(); });
      return wrap;
    }
    var visual = document.createElement('img'); visual.className = 'mh-education-visual'; visual.alt = '';
    visual.src = card.imageUrl || cardsEngine.fallbackVisual(bias.type);
    wrap.append(visual);
    if (card.local) wrap.append(el('small', 'mh-local-flag', i18n.t('mhCardUnavailable')));
    wrap.append(el('strong', '', card.title), el('p', '', card.explanation));
    wrap.append(el('h4', '', i18n.t('mhWhyItMatters')), el('p', '', card.whyItMattersForYou));
    var steps = el('ul', 'mh-steps');
    (card.practicalSteps || []).forEach(function (step) { steps.append(el('li', '', step)); });
    wrap.append(el('h4', '', i18n.t('mhPracticalSteps')), steps);
    var actions = el('div', 'mh-card-actions');
    var regen = button(i18n.t('mhRegenerateCard'), 'tj-secondary', 'refresh-ccw');
    regen.onclick = function () { regen.disabled = true; cardsEngine.ensureCard(profile, bias.type, true).then(function () { refresh(); }); };
    actions.append(regen);
    if (!card.viewedAt) {
      var viewed = button(i18n.t('mhMarkViewed'), 'tj-primary', 'eye');
      viewed.onclick = function () { cardsEngine.markViewed(bias.type); cycle.advanceAll(store.load()); refresh(); };
      actions.append(viewed);
    }
    wrap.append(actions);
    icons(wrap);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function reportButton(profile) {
    var btn = button(i18n.t('mhFullReport'), 'tj-secondary', 'file-text');
    btn.onclick = function () { if (window.TradeJournalMentalHealthReport) window.TradeJournalMentalHealthReport.open(store.load()); };
    return btn;
  }

  function activityLogCard(profile, trades) {
    var card = el('section', 'mh-card');
    var heading = el('h3', '', i18n.t('mhActivityLog'));
    heading.append(infoIcon(i18n.t('mhInfoActivityLog')));
    card.append(heading);
    if (window.TradeJournalMentalHealthReport) {
      var items = window.TradeJournalMentalHealthReport.buildActivityLog(profile, trades).slice(0, 12);
      if (!items.length) card.append(el('p', 'mh-empty', i18n.t('mhActivityEmpty')));
      else {
        var list = el('div', 'mh-activity-list');
        items.forEach(function (item) {
          var row = el('div', 'mh-activity-row');
          row.append(el('small', '', i18n.date(item.timestamp, { dateStyle: 'medium', timeStyle: 'short' })), el('span', '', item.summary));
          list.append(row);
        });
        card.append(list);
      }
    }
    card.append(reportButton(profile));
    return card;
  }

  function renderProfileTab(refresh) {
    var wrap = el('div', 'psy-tab-view mh-tab-view');
    var recomputed = collector.recompute();
    var profile = cycle.advanceAll(recomputed.profile).profile;
    var allTrades = tradeStore.listSync();

    if (window.TradeJournalMentalHealthProfilePage) {
      var launcher = el('section', 'mh-card mh-profile-page-launcher');
      launcher.append(el('strong', '', i18n.t('mhProfilePageTitle')), el('p', 'tj-hint', i18n.t('mhProfilePageHint')));
      var open = button(i18n.t('mhOpenProfilePage'), 'tj-primary', 'user-round');
      open.onclick = function () { window.TradeJournalMentalHealthProfilePage.open(); };
      launcher.append(open);
      wrap.append(launcher);
    }

    if (!profile.intake.completed) wrap.append(intakeNudge(profile, refresh));

    var weatherEntries = [];
    allTrades.forEach(function (t) {
      (t.emotionLog || []).forEach(function (e) {
        weatherEntries.push({ timestamp: e.timestamp, label: i18n.date(e.timestamp, { month: 'short', day: 'numeric' }), stress: Number(e.stressLevel), stage: e.stage, dominantEmotions: e.dominantEmotions || [] });
      });
    });
    weatherEntries.sort(function (a, b) { return new Date(a.timestamp) - new Date(b.timestamp); });
    weatherEntries = weatherEntries.slice(-40);
    wrap.append(chartCard(i18n.t('mhEmotionalWeatherTitle'), function (canvas, tooltip) { charts.drawEmotionalWeather(canvas, weatherEntries, tooltip); }, i18n.t('mhInfoWeather')));

    var closed = allTrades.filter(function (t) { return t.status === 'closed'; });

    var scoreCard = el('section', 'mh-card'), scoreHeading = el('h3', '', i18n.t('mhHealthScoreTitle'));
    scoreHeading.append(infoIcon(i18n.t('mhInfoHealthScore')));
    scoreCard.append(scoreHeading, charts.buildHealthScoreTile(closed.length ? profile.healthReportCache.weeklyScore : null, recomputed.weeklyExplanation));
    wrap.append(scoreCard);

    var due = scheduler.dueItems(profile, new Date());
    if (due.length) wrap.append(checkInCard(due));

    wrap.append(activityLogCard(profile, allTrades));
    wrap.append(chatCard(profile, refresh));
    return wrap;
  }

  function renderGrowthTab(refresh) {
    var wrap = el('div', 'psy-tab-view mh-tab-view');
    var profile = cycle.advanceAll(store.load()).profile;

    var allTriggers = profile.triggerProfile.triggers.concat(profile.triggerProfile.autoDetectedTriggers);
    var evidencePanel = el('div', 'mh-evidence-panel');
    wrap.append(chartCard(i18n.t('mhTriggerConstellationTitle'), function (canvas) {
      charts.drawTriggerConstellation(canvas, allTriggers, function (trigger) {
        evidencePanel.replaceChildren(el('strong', '', i18n.t('mhTriggerEvidence')));
        var list = el('div', 'mh-evidence-list');
        (trigger.supportingTradeIds || []).forEach(function (id) {
          var trade = tradeStore.find(id);
          if (!trade) return;
          var row = el('div', 'mh-evidence-row');
          row.append(el('span', '', i18n.date(trade.createdAt)), el('span', '', trade.direction), el('span', '', trade.outcome || '—'));
          list.append(row);
        });
        evidencePanel.append(list);
      });
    }, i18n.t('mhInfoTriggers')));
    wrap.append(evidencePanel);
    wrap.append(triggerForm(profile, refresh));

    wrap.append(chartCard(i18n.t('mhPhaseJourneyTitle'), function (canvas) { charts.drawPhaseJourney(canvas, profile.cognitiveProfile.identifiedBiases, types.supportPhases); }, i18n.t('mhInfoPhaseJourney')));

    profile.cognitiveProfile.identifiedBiases.forEach(function (bias) {
      if (types.supportPhases.indexOf(bias.cyclePhase) >= types.supportPhases.indexOf('psychoeducation')) wrap.append(educationCardView(profile, bias, refresh));
    });

    wrap.append(thoughtRecordSection(profile, refresh));
    wrap.append(chatCard(profile, refresh));
    return wrap;
  }

  window.TradeJournalMentalHealthUI = { renderProfileTab: renderProfileTab, renderGrowthTab: renderGrowthTab };
}());
