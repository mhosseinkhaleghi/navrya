(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var store = window.TradeJournalMentalHealthStore;
  var types = window.TradeJournalMentalHealthTypes;
  var psych = window.TradeJournalPsychologyStore;
  var collector = window.TradeJournalMentalHealthCollector;
  var safety = window.TradeJournalMentalHealthSafety;
  if (!i18n || !store || !types) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }

  function modal(className, title) {
    var back = el('div', 'tj-modal-backdrop'), box = el('section', 'tj-modal ' + (className || '')), head = el('header', 'tj-modal-head'), h = el('h2', '', title), close = button('', 'tj-icon-button', 'x'), closed = false, nativeRemove = back.remove.bind(back);
    back.dir = i18n.direction();
    back.setAttribute('role', 'presentation'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    close.dataset.tjClose = ''; close.setAttribute('aria-label', i18n.t('mhClose'));
    function destroy(event) { if (event) { event.preventDefault(); event.stopPropagation(); } if (closed) return; closed = true; document.removeEventListener('keydown', escape, true); nativeRemove(); }
    function escape(event) { if (event.key === 'Escape') destroy(event); }
    back.remove = destroy;
    close.addEventListener('click', destroy, true);
    back.addEventListener('click', function (event) { if (event.target === back) destroy(event); });
    box.addEventListener('click', function (event) { event.stopPropagation(); });
    document.addEventListener('keydown', escape, true);
    head.append(h, close); box.append(head); back.append(box); document.body.append(back);
    icons(back);
    return { back: back, box: box, close: close, destroy: destroy };
  }

  function guardedSubmit(text, container, onSafe) {
    if (safety && text) {
      var check = safety.checkText(text);
      if (check.flagged) { container.replaceChildren(safety.renderSafetyCard(function () { container.replaceChildren(); })); return; }
    }
    onSafe();
  }

  function rangeField(label, value, min, max) {
    var wrap = el('label', 'tj-range'), head = el('span');
    head.append(document.createTextNode(label), el('b', '', String(value)));
    var input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.value = value;
    input.oninput = function () { head.querySelector('b').textContent = input.value; };
    wrap.append(head, input);
    return { wrap: wrap, get: function () { return Number(input.value); } };
  }
  function textField(label, value, multiline) {
    var wrap = el('label', 'tj-field'); wrap.append(el('span', '', label));
    var input = multiline ? document.createElement('textarea') : document.createElement('input');
    if (multiline) input.rows = 2; else input.type = 'text';
    input.dir = 'auto'; input.value = value || '';
    wrap.append(input);
    return { wrap: wrap, get: function () { return input.value.trim(); } };
  }
  function yesNoField(label, value) {
    var wrap = el('div', 'tj-yesno'); wrap.append(el('strong', '', label));
    var current = value;
    var yes = button(i18n.t('mhYes'), value === true ? 'selected' : ''), no = button(i18n.t('mhNo'), value === false ? 'selected' : '');
    yes.onclick = function () { current = true; yes.classList.add('selected'); no.classList.remove('selected'); };
    no.onclick = function () { current = false; no.classList.add('selected'); yes.classList.remove('selected'); };
    wrap.append(yes, no);
    return { wrap: wrap, get: function () { return current; } };
  }
  function multiSelectField(options, labelPrefix, values) {
    var wrap = el('div', 'mh-choice-grid'), current = (values || []).slice();
    options.forEach(function (opt) {
      var b = button(i18n.t(labelPrefix + opt), current.indexOf(opt) > -1 ? 'selected' : '');
      b.onclick = function () { var idx = current.indexOf(opt); if (idx > -1) current.splice(idx, 1); else current.push(opt); b.classList.toggle('selected'); };
      wrap.append(b);
    });
    return { wrap: wrap, get: function () { return current.slice(); } };
  }
  function choiceField(options, labelPrefix, value) {
    var wrap = el('div', 'mh-choice-grid'), current = value || '';
    var buttons = options.map(function (opt) {
      var b = button(i18n.t(labelPrefix + opt), current === opt ? 'selected' : '');
      b.onclick = function () { current = opt; buttons.forEach(function (x) { x.classList.remove('selected'); }); b.classList.add('selected'); };
      wrap.append(b);
      return b;
    });
    return { wrap: wrap, get: function () { return current; } };
  }

  // ---------------------------------------------------------------------
  // Pre-session check-in - fires once per session, before the first entry's
  // image-upload UI, by wrapping TradeJournalEntryFlow.openEntry.
  // ---------------------------------------------------------------------
  function openPreSessionCheckIn(session, onDone) {
    var m = modal('tj-small-modal mh-checkin-modal', i18n.t('mhPreSessionCheckInTitle'));
    m.box.append(el('p', '', i18n.t('mhPreSessionCheckInHint')));
    var sleep = rangeField(i18n.t('mhSleepQuality'), 5, 1, 10);
    var stress = rangeField(i18n.t('mhCurrentStress'), 5, 1, 10);
    var prove = yesNoField(i18n.t('mhSomethingToProve'), false);
    var event = textField(i18n.t('mhSignificantEventPlaceholder'), '', false);
    m.box.append(sleep.wrap, stress.wrap, prove.wrap, event.wrap);
    var checkinRegistry = window.TradeJournalAIProcessRegistry;
    if (checkinRegistry) checkinRegistry.register('mh-pre-session-checkin', {
      allowlist: ['sleepQuality', 'currentStressLevel', 'significantPersonalEvent'],
      isOpen: function () { return document.body.contains(m.back); },
      activeStep: function () { return 'checkin'; },
      applyValue: function (path, value) {
        var target = path === 'sleepQuality' ? sleep : path === 'currentStressLevel' ? stress : path === 'significantPersonalEvent' ? event : null;
        if (!target) return;
        var input = target.wrap.querySelector('input');
        if (input) input.value = value;
      }
    });
    var actions = el('footer', 'tj-modal-actions'), skip = button(i18n.t('mhSkip'), 'tj-secondary'), save = button(i18n.t('mhSave'), 'tj-primary', 'check');
    skip.onclick = function () { m.back.remove(); if (onDone) onDone(); };
    save.onclick = function () {
      store.addPreSessionCheckIn(store.load(), session.id, { sleepQuality: sleep.get(), currentStressLevel: stress.get(), somethingToProveToday: prove.get(), significantPersonalEvent: event.get() || null });
      m.back.remove(); if (onDone) onDone();
    };
    actions.append(skip, save);
    m.box.append(actions);
    icons(m.back);
  }

  function wrapEntryFlow() {
    var flow = window.TradeJournalEntryFlow;
    if (!flow || flow.__mhWrapped) return;
    var originalOpenEntry = flow.openEntry;
    flow.openEntry = function (api, session, type) {
      var profile = store.load();
      var already = profile.continuousTracking.preSessionCheckIns.some(function (c) { return c.sessionId === session.id; });
      if (!already) {
        openPreSessionCheckIn(session, function () { originalOpenEntry(api, session, type); });
        return;
      }
      originalOpenEntry(api, session, type);
    };
    flow.__mhWrapped = true;
  }
  wrapEntryFlow();

  // ---------------------------------------------------------------------
  // Post-trade reflection - the single unified popup that replaces the earlier
  // standalone revenge-trade warning (wizard) and passive cool-down card.
  // ---------------------------------------------------------------------
  var EMOTIONS = ['anger', 'anxiety', 'calm', 'euphoria', 'regret', 'indifference', 'disappointment', 'confidence'];
  var DEVIATION_LEVELS = ['none', 'slightly', 'yes'];
  var TAKE_AGAIN = ['yes', 'no', 'unsure'];
  var REVENGE_CHOICES = ['rest', 'recover', 'saw_setup'];

  function openPostTradeReflection(trade) {
    var settings = (psych ? psych.settings().postTradeReflection : null) || { enabled: true, cooldownMinutes: 15 };
    if (!settings.enabled) return;
    var navrya = window.TradeJournalNavryaPostTradeReflection;
    if (navrya) { navrya.open(trade); return; }
    var showRevenge = trade.outcome === 'loss';
    var state = { emotionThermometer: [], setupQualityRating: 5, planAdherenceRating: 5, emotionManagementRating: 5, deviatedFromPlan: 'none', deviationReason: '', wouldTakeAgain: 'unsure', revengeChoice: null, sentenceOfTheDay: '' };
    var steps = ['emotion', 'ratings', 'plan', 'sentence'];
    if (showRevenge) steps.splice(3, 0, 'revenge');
    var step = 0;
    var m = modal('tj-wizard mh-posttrade-wizard', i18n.t('mhPostTradeTitle'));
    var content = el('div', 'tj-wizard-content'), actions = el('footer', 'tj-modal-actions');
    var reflectionRegistry = window.TradeJournalAIProcessRegistry;
    if (reflectionRegistry) reflectionRegistry.register('mh-post-trade-reflection', {
      allowlist: ['setupQualityRating', 'planAdherenceRating', 'emotionManagementRating', 'deviationReason', 'sentenceOfTheDay'],
      isOpen: function () { return document.body.contains(m.back); },
      activeStep: function () { return steps[step]; },
      applyValue: function (path, value) {
        state[path] = ['setupQualityRating', 'planAdherenceRating', 'emotionManagementRating'].indexOf(path) > -1 ? Number(value) : value;
        render();
      }
    });

    function emotionView() {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhEmotionThermometer')));
      var field = multiSelectField(EMOTIONS, 'mhEmotion_', state.emotionThermometer);
      view.append(field.wrap); view.getters = { save: function () { state.emotionThermometer = field.get(); } };
      return view;
    }
    function ratingsView() {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhTradeJudgment')));
      var setup = rangeField(i18n.t('mhSetupQuality'), state.setupQualityRating, 1, 10);
      var plan = rangeField(i18n.t('mhPlanAdherence'), state.planAdherenceRating, 1, 10);
      var emo = rangeField(i18n.t('mhEmotionManagement'), state.emotionManagementRating, 1, 10);
      view.append(setup.wrap, plan.wrap, emo.wrap);
      view.getters = { save: function () { state.setupQualityRating = setup.get(); state.planAdherenceRating = plan.get(); state.emotionManagementRating = emo.get(); } };
      return view;
    }
    function planView() {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhKeyQuestion')));
      view.append(el('span', '', i18n.t('mhDeviatedFromPlan')));
      var deviation = choiceField(DEVIATION_LEVELS, 'mhDeviation_', state.deviatedFromPlan);
      var reason = textField(i18n.t('mhDeviationReasonPlaceholder'), state.deviationReason, false);
      view.append(deviation.wrap, reason.wrap);
      view.append(el('span', '', i18n.t('mhWouldTakeAgainQuestion')));
      var again = choiceField(TAKE_AGAIN, 'mhTakeAgain_', state.wouldTakeAgain);
      view.append(again.wrap);
      view.getters = { save: function () { state.deviatedFromPlan = deviation.get(); state.deviationReason = reason.get(); state.wouldTakeAgain = again.get(); } };
      return view;
    }
    function revengeView() {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhRevengeCheckQuestion')));
      var warnArea = el('div');
      var choice = choiceField(REVENGE_CHOICES, 'mhRevengeChoice_', state.revengeChoice);
      var originalOnclicks = [];
      Array.from(choice.wrap.children).forEach(function (b, i) {
        var opt = REVENGE_CHOICES[i], baseOnclick = b.onclick;
        b.onclick = function () { baseOnclick(); warnArea.replaceChildren(opt === 'recover' ? el('p', 'tj-hint', i18n.t('mhRevengeWarningBody', { minutes: settings.cooldownMinutes })) : ''); };
      });
      view.append(choice.wrap, warnArea);
      view.getters = { save: function () { state.revengeChoice = choice.get(); } };
      return view;
    }
    function sentenceView() {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhSentenceOfTheDay')), el('p', 'tj-hint', i18n.t('mhSentenceHint')));
      var sentence = textField(i18n.t('mhSentencePlaceholder'), state.sentenceOfTheDay, true);
      var safetyArea = el('div');
      view.append(sentence.wrap, safetyArea);
      view.getters = { save: function () { state.sentenceOfTheDay = sentence.get(); }, safetyArea: safetyArea, safetyText: function () { return sentence.get(); } };
      return view;
    }
    var viewFns = { emotion: emotionView, ratings: ratingsView, plan: planView, revenge: revengeView, sentence: sentenceView };

    function finish() {
      var data = {
        emotionThermometer: state.emotionThermometer, setupQualityRating: state.setupQualityRating, planAdherenceRating: state.planAdherenceRating, emotionManagementRating: state.emotionManagementRating,
        deviatedFromPlan: state.deviatedFromPlan, deviationReason: state.deviationReason || null, wouldTakeAgain: state.wouldTakeAgain,
        revengeCheck: showRevenge ? { shown: true, choice: state.revengeChoice, cooldownTimerStartedAt: state.revengeChoice === 'recover' ? store.now() : null } : null,
        sentenceOfTheDay: state.sentenceOfTheDay || null
      };
      store.addPostTradeReflection(store.load(), trade.id, data);
      toast(i18n.t('mhPostTradeSaved'), 'success');
      m.back.remove();
    }

    function render() {
      var view = viewFns[steps[step]]();
      content.replaceChildren(view);
      actions.replaceChildren();
      var skip = button(step === 0 ? i18n.t('mhSkip') : i18n.t('mhPrevious'), 'tj-secondary', step === 0 ? 'x' : 'arrow-left');
      skip.onclick = function () { if (step === 0) { m.back.remove(); } else { step -= 1; render(); } };
      var isLast = step === steps.length - 1;
      var next = button(i18n.t(isLast ? 'mhFinish' : 'mhNext'), 'tj-primary', isLast ? 'check-circle' : 'arrow-right');
      next.onclick = function () {
        var proceed = function () {
          if (view.getters && view.getters.save) view.getters.save();
          if (step < steps.length - 1) { step += 1; render(); } else { finish(); }
        };
        if (view.getters && view.getters.safetyText && view.getters.safetyText()) guardedSubmit(view.getters.safetyText(), view.getters.safetyArea, proceed);
        else proceed();
      };
      actions.append(skip, next);
      icons(m.back);
    }
    m.box.append(content, actions);
    render();
  }

  function onTradeClosed(trade) { openPostTradeReflection(trade); }

  // ---------------------------------------------------------------------
  // Monthly bias checklist - recurring, launched from the dedicated profile page, not the intake wizard.
  // ---------------------------------------------------------------------
  function openBiasChecklist(onDone) {
    var profile = store.load();
    var indicators = collector ? collector.computeBiasIndicators(profile) : {};
    var m = modal('tj-wizard mh-bias-checklist', i18n.t('mhBiasChecklistTitle'));
    m.box.append(el('p', 'tj-hint', i18n.t('mhBiasChecklistHint')));
    var byType = {};
    var rows = types.biasChecklistTypes.map(function (type) {
      var existing = profile.psychologicalProfile.biasChecklist.biases.find(function (b) { return b.type === type; });
      var rating = rangeField(i18n.t('mhBias_' + type), existing ? existing.selfRating : 3, 1, 5);
      var example = textField(i18n.t('mhBiasExamplePlaceholder'), existing ? existing.exampleThisMonth : '', true);
      byType[type] = { rating: rating, example: example };
      var wrap = el('div', 'mh-bias-row'); wrap.append(rating.wrap, example.wrap);
      if (indicators[type] != null) wrap.append(el('small', 'mh-local-flag', i18n.t('mhComputedIndicator') + ': ' + indicators[type] + '/10'));
      m.box.append(wrap);
      return { type: type, ratingGet: rating.get, exampleGet: example.get };
    });
    var checklistRegistry = window.TradeJournalAIProcessRegistry;
    if (checklistRegistry) checklistRegistry.register('mh-bias-checklist', {
      allowlist: types.biasChecklistTypes.reduce(function (acc, type) { return acc.concat(['psychologicalProfile.biasChecklist.draftRating.' + type + '.selfRating', 'psychologicalProfile.biasChecklist.draftRating.' + type + '.example']); }, []),
      isOpen: function () { return document.body.contains(m.back); },
      activeStep: function () { return 'checklist'; },
      applyValue: function (path, value) {
        var match = /^psychologicalProfile\.biasChecklist\.draftRating\.([a-z_]+)\.(selfRating|example)$/.exec(path);
        if (!match || !byType[match[1]]) return;
        var field = match[2] === 'selfRating' ? byType[match[1]].rating : byType[match[1]].example;
        var input = field.wrap.querySelector('input, textarea');
        if (input) input.value = value;
      }
    });
    var actions = el('footer', 'tj-modal-actions'), save = button(i18n.t('mhSave'), 'tj-primary', 'check');
    save.onclick = function () {
      var biases = rows.map(function (r) { return { type: r.type, selfRating: r.ratingGet(), exampleThisMonth: r.exampleGet(), computedIndicatorScore: indicators[r.type] != null ? indicators[r.type] : null }; });
      store.saveBiasChecklist(store.load(), biases);
      toast(i18n.t('mhBiasChecklistSaved'), 'success');
      m.back.remove();
      if (onDone) onDone();
    };
    actions.append(save);
    m.box.append(actions);
    icons(m.back);
  }

  window.TradeJournalMentalHealthContinuous = { onTradeClosed: onTradeClosed, openBiasChecklist: openBiasChecklist, openPreSessionCheckIn: openPreSessionCheckIn };
}());
