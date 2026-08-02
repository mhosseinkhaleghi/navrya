(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var store = window.TradeJournalMentalHealthStore;
  var types = window.TradeJournalMentalHealthTypes;
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
    return { wrap: wrap, get: function () { return input.value.trim(); } };
  }
  function numberField(label, value, min, max) {
    var wrap = el('label', 'tj-field'); wrap.append(el('span', '', label));
    var input = document.createElement('input'); input.type = 'number'; input.value = value == null ? '' : value;
    if (min != null) input.min = min; if (max != null) input.max = max; input.step = 1;
    wrap.append(input);
    return { wrap: wrap, get: function () { return input.value === '' ? null : Number(input.value); } };
  }
  function rangeField(label, value, min, max, leftLabel, rightLabel) {
    var wrap = el('label', 'tj-range'), head = el('span');
    head.append(document.createTextNode(label), el('b', '', String(value)));
    var input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.value = value;
    input.oninput = function () { head.querySelector('b').textContent = input.value; };
    wrap.append(head, input);
    if (leftLabel || rightLabel) { var ends = el('div', 'mh-range-ends'); ends.append(el('small', '', leftLabel || ''), el('small', '', rightLabel || '')); wrap.append(ends); }
    return { wrap: wrap, get: function () { return Number(input.value); } };
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

  var SCENARIOS = [
    { id: 'A_stop_loss', measuresConstruct: 'loss_aversion_discipline', choices: ['move_stop_back', 'wait_it_hits', 'quick_reanalysis', 'pray'] },
    { id: 'B_revenge', measuresConstruct: 'revenge_trading', slider: true, sliderLeft: 'mhScenarioBCalm', sliderRight: 'mhScenarioBAngry', choices: ['sleep', 'open_to_recover', 'journal', 'other'], hasFreeText: true },
    { id: 'C_fomo', measuresConstruct: 'fomo', choices: ['disciplined_no_stop', 'was_clear_should_enter', 'next_time_for_sure', 'no_fomo_repeat'] },
    { id: 'D_patience', measuresConstruct: 'overtrading_patience', slider: true, sliderLeft: 'mhScenarioDEasy', sliderRight: 'mhScenarioDHard', choices: ['wait', 'open_test_trade', 'lower_timeframe_for_stop', 'exit_market'] },
    { id: 'E_identity', measuresConstruct: 'identity_outcome_fusion', choices: ['bad_month_review_system', 'not_made_for_trading', 'market_manipulated', 'must_change_strategy', 'only_losing_thats_all'] }
  ];
  var MOTIVATIONS = ['quick_money', 'freedom', 'complexity_challenge', 'escape_job', 'social_influence', 'analytical_confidence'];
  var LOSS_REACTIONS = ['revenge_same_day', 'shock_avoidance', 'analytical_review', 'anxiety_worry', 'blame_market', 'sought_support'];
  var CAPITAL_TYPES = ['surplus', 'essential', 'mixed'];
  var GENDERS = ['male', 'female', 'prefer_not_to_say'];
  var MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed', 'prefer_not_to_say'];
  var OCCUPATION_TYPES = ['full_time_trader', 'part_time_trader', 'employed', 'self_employed', 'student', 'retired', 'other'];
  var MARKET_PRESETS = ['forex', 'crypto', 'stocks', 'commodities', 'indices', 'futures_options'];

  function openIntake(onFinish) {
    var step = 1;
    var views = [welcomeView, demographicsView, financialView, historyView, motivationView, transparencyView];
    SCENARIOS.forEach(function (scenario) { views.push(function (profile) { return scenarioView(profile, scenario); }); });
    views.push(summaryView);
    var total = views.length;
    var m = modal('tj-wizard mh-intake-wizard', i18n.t('mhIntakeTitle'));
    var stepsNav = el('nav', 'tj-wizard-steps'), content = el('div', 'tj-wizard-content'), actions = el('footer', 'tj-modal-actions');
    var marketsDraft = null;
    var intakeRegistry = window.TradeJournalAIProcessRegistry;
    if (intakeRegistry) intakeRegistry.register('mh-intake', {
      allowlist: (types.intakePaths || []).slice(),
      isOpen: function () { return document.body.contains(m.back); },
      activeStep: function () { return step; },
      // Persisted flow: routes through the exact same draft-then-approve store.applySuggestion
      // pipeline the chat-based intake filling already uses - not a second write path.
      applyValue: function (path, value, mode) {
        if ((types.intakePaths || []).indexOf(path) === -1) return;
        var profile = store.load();
        var suggestionId = store.uid('mh-dock');
        profile = store.addMessage(profile, 'assistant', '', [{ id: suggestionId, path: path, value: value, section: path.split('.')[0], mode: mode === 'append' ? 'append' : 'replace', status: 'pending', createdAt: store.now() }]);
        store.applySuggestion(profile, { id: suggestionId }, 'applied');
        render();
      }
    });

    function stepNav() {
      stepsNav.replaceChildren();
      for (var i = 1; i <= total; i++) { var span = el('span', step === i ? 'active' : step > i ? 'done' : '', String(i)); stepsNav.append(span); }
    }

    function welcomeView() {
      var view = el('div', 'tj-wizard-pane');
      view.append(el('h3', '', i18n.t('mhIntakeWelcomeTitle')), el('p', '', i18n.t('mhIntakeWelcomeBody')));
      view.getters = {};
      return view;
    }

    function demographicsView(profile) {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhIntakeStep2Title')));
      var age = numberField(i18n.t('mhAge'), profile.intake.demographics.age, 18, 100);
      var gender = choiceField(GENDERS, 'mhGender_', profile.intake.demographics.gender);
      var marital = choiceField(MARITAL_STATUSES, 'mhMaritalStatus_', profile.intake.demographics.maritalStatus);
      var occupation = choiceField(OCCUPATION_TYPES, 'mhOccupationType_', profile.intake.demographics.primaryOccupation);
      var fullTime = yesNoField(i18n.t('mhFullTimeTrader'), profile.intake.demographics.isFullTimeTrader);
      view.append(age.wrap, el('span', '', i18n.t('mhGender')), gender.wrap, el('span', '', i18n.t('mhMaritalStatus')), marital.wrap, el('span', '', i18n.t('mhOccupation')), occupation.wrap, fullTime.wrap);
      view.getters = { save: function (p) { p.intake.demographics = { age: age.get(), gender: gender.get() || null, maritalStatus: marital.get() || null, primaryOccupation: occupation.get() || null, isFullTimeTrader: fullTime.get() }; } };
      return view;
    }

    function financialView(profile) {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhIntakeStep3Title')), el('p', 'tj-hint', i18n.t('mhFinancialContextHint')));
      var type = choiceField(CAPITAL_TYPES, 'mhCapitalType_', profile.intake.financialContext.capitalType);
      var allocation = rangeField(i18n.t('mhCapitalAllocation'), profile.intake.financialContext.capitalAllocationPercent || 0, 0, 100, i18n.t('mhAllocationLow'), i18n.t('mhAllocationHigh'));
      var borrowed = yesNoField(i18n.t('mhBorrowedMoney'), profile.intake.financialContext.borrowedMoneyForTrading);
      view.append(el('span', '', i18n.t('mhCapitalType')), type.wrap, allocation.wrap, borrowed.wrap);
      view.getters = { save: function (p) { p.intake.financialContext = { capitalType: type.get() || null, capitalAllocationPercent: allocation.get(), borrowedMoneyForTrading: borrowed.get() }; } };
      return view;
    }

    function historyView(profile) {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhIntakeStep4Title')));
      var years = numberField(i18n.t('mhYearsTrading'), profile.intake.tradingHistory.yearsTrading, 0, 60);
      marketsDraft = (profile.intake.tradingHistory.marketsTraded || []).slice();
      var marketsWrap = el('div', 'mh-weakness-list');
      var presetWrap = el('div', 'mh-market-presets');
      var presetInputs = MARKET_PRESETS.map(function (key) {
        var label = i18n.t('mhMarketsPreset_' + key), wrap = el('label', 'mh-market-preset-item');
        var box = document.createElement('input'); box.type = 'checkbox'; box.checked = marketsDraft.indexOf(label) > -1;
        box.onchange = function () {
          var idx = marketsDraft.indexOf(label);
          if (box.checked && idx === -1) marketsDraft.push(label);
          else if (!box.checked && idx > -1) marketsDraft.splice(idx, 1);
          renderMarkets();
        };
        wrap.append(box, document.createTextNode(label)); presetWrap.append(wrap);
        return { label: label, box: box };
      });
      function syncPresets() { presetInputs.forEach(function (p) { p.box.checked = marketsDraft.indexOf(p.label) > -1; }); }
      function renderMarkets() { marketsWrap.replaceChildren(); marketsDraft.forEach(function (mkt, idx) { var chip = el('span', 'mh-chip', mkt); var rm = button('', 'tj-icon-button', 'x'); rm.onclick = function () { marketsDraft.splice(idx, 1); renderMarkets(); }; chip.append(rm); marketsWrap.append(chip); }); syncPresets(); }
      renderMarkets();
      var marketInput = document.createElement('input'); marketInput.type = 'text'; marketInput.dir = 'auto'; marketInput.placeholder = i18n.t('mhMarketsPlaceholder');
      var addMarket = button(i18n.t('mhAdd'), 'tj-secondary', 'plus');
      addMarket.onclick = function () { var value = marketInput.value.trim(); if (value && marketsDraft.indexOf(value) === -1) { marketsDraft.push(value); renderMarkets(); } marketInput.value = ''; };
      var winAmount = numberField(i18n.t('mhLargestWinAmount'), profile.intake.tradingHistory.largestWin.amount);
      var winPercent = numberField(i18n.t('mhLargestWinPercent'), profile.intake.tradingHistory.largestWin.percent);
      var lossAmount = numberField(i18n.t('mhLargestLossAmount'), profile.intake.tradingHistory.largestLoss.amount);
      var lossPercent = numberField(i18n.t('mhLargestLossPercent'), profile.intake.tradingHistory.largestLoss.percent);
      var marginCalls = numberField(i18n.t('mhMarginCalls'), profile.intake.tradingHistory.marginCallOrZeroedCount);
      view.append(years.wrap, el('span', '', i18n.t('mhMarketsTraded')), presetWrap, marketsWrap, marketInput, addMarket, winAmount.wrap, winPercent.wrap, lossAmount.wrap, lossPercent.wrap, marginCalls.wrap);
      view.getters = { save: function (p) { p.intake.tradingHistory = { yearsTrading: years.get(), marketsTraded: marketsDraft.slice(), largestWin: { amount: winAmount.get(), percent: winPercent.get() }, largestLoss: { amount: lossAmount.get(), percent: lossPercent.get() }, marginCallOrZeroedCount: marginCalls.get() }; } };
      return view;
    }

    function motivationView(profile) {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhIntakeStep5Title')));
      view.append(el('span', '', i18n.t('mhMotivationQuestion')));
      var motivation = choiceField(MOTIVATIONS, 'mhMotivation_', profile.intake.motivationForTrading);
      view.append(motivation.wrap);
      view.append(el('span', '', i18n.t('mhFirstLossQuestion')));
      var reaction = choiceField(LOSS_REACTIONS, 'mhLossReaction_', profile.intake.firstBigLossReaction);
      view.append(reaction.wrap);
      view.getters = { save: function (p) { p.intake.motivationForTrading = motivation.get() || null; p.intake.firstBigLossReaction = reaction.get() || null; } };
      return view;
    }

    function transparencyView(profile) {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhIntakeStep6Title')), el('p', 'tj-hint', i18n.t('mhTransparencyHint')));
      var m1 = yesNoField(i18n.t('mhProfitKnown'), profile.intake.transparencyMatrix.profitKnownToFamily);
      var m2 = yesNoField(i18n.t('mhLossKnown'), profile.intake.transparencyMatrix.lossKnownToFamily);
      var m3 = yesNoField(i18n.t('mhCapitalKnown'), profile.intake.transparencyMatrix.capitalKnownToFamily);
      var m4 = yesNoField(i18n.t('mhActivityKnown'), profile.intake.transparencyMatrix.tradingActivityKnownToFamily);
      view.append(m1.wrap, m2.wrap, m3.wrap, m4.wrap);
      view.getters = { save: function (p) { p.intake.transparencyMatrix = { profitKnownToFamily: m1.get(), lossKnownToFamily: m2.get(), capitalKnownToFamily: m3.get(), tradingActivityKnownToFamily: m4.get() }; } };
      return view;
    }

    function scenarioView(profile, scenario) {
      var view = el('div', 'tj-wizard-pane');
      view.append(el('h3', '', i18n.t('mhScenario_' + scenario.id + '_title')), el('p', '', i18n.t('mhScenario_' + scenario.id + '_body')));
      var existing = profile.psychologicalProfile.scenarioAssessment.responses.find(function (r) { return r.scenarioId === scenario.id; });
      var choice = choiceField(scenario.choices, 'mhScenarioChoice_' + scenario.id + '_', existing ? existing.choice : '');
      view.append(choice.wrap);
      var slider = null;
      if (scenario.slider) { slider = rangeField(i18n.t('mhScenarioIntensity'), existing && existing.sliderValue != null ? existing.sliderValue : 5, 1, 10, i18n.t(scenario.sliderLeft), i18n.t(scenario.sliderRight)); view.append(slider.wrap); }
      var freeText = null, safetyArea = null;
      if (scenario.hasFreeText) { freeText = textField(i18n.t('mhScenarioFreeText'), existing ? existing.freeText : '', true); safetyArea = el('div'); view.append(freeText.wrap, safetyArea); }
      view.getters = {
        save: function (p) {
          var proceed = function () {
            p.psychologicalProfile.scenarioAssessment.draftResponse = { choice: choice.get(), sliderValue: slider ? slider.get() : null, freeText: freeText ? freeText.get() : null };
          };
          if (freeText && freeText.get()) guardedSubmit(freeText.get(), safetyArea, proceed); else proceed();
        },
        commit: function (p) { return store.commitDraftScenarioResponse(p, scenario.id, scenario.measuresConstruct); }
      };
      return view;
    }

    function summaryView(profile) {
      var view = el('div', 'tj-wizard-pane'); view.append(el('h3', '', i18n.t('mhIntakeStep8Title')), el('p', 'tj-hint', i18n.t('mhIntakeSummaryHint')));
      var rows = [
        [i18n.t('mhAge'), profile.intake.demographics.age], [i18n.t('mhMaritalStatus'), profile.intake.demographics.maritalStatus ? i18n.t('mhMaritalStatus_' + profile.intake.demographics.maritalStatus) : null],
        [i18n.t('mhCapitalType'), profile.intake.financialContext.capitalType ? i18n.t('mhCapitalType_' + profile.intake.financialContext.capitalType) : '—'],
        [i18n.t('mhYearsTrading'), profile.intake.tradingHistory.yearsTrading],
        [i18n.t('mhMotivationQuestion'), profile.intake.motivationForTrading ? i18n.t('mhMotivation_' + profile.intake.motivationForTrading) : '—'],
        [i18n.t('mhScenarioAssessmentTitle'), profile.psychologicalProfile.scenarioAssessment.responses.length + ' / ' + SCENARIOS.length]
      ];
      var grid = el('div', 'mh-baseline-summary-grid');
      rows.forEach(function (row) { var chip = el('div', 'mh-stat-chip'); chip.append(el('small', '', row[0]), el('strong', '', row[1] == null || row[1] === '' ? '—' : String(row[1]))); grid.append(chip); });
      view.append(grid);
      view.getters = {};
      return view;
    }

    function render() {
      var profile = store.load();
      content.replaceChildren(views[step - 1](profile));
      stepNav();
      actions.replaceChildren();
      var prev = button(i18n.t(step === 1 ? 'mhCancel' : 'mhPrevious'), 'tj-secondary', step === 1 ? 'x' : 'arrow-left');
      prev.onclick = function () { if (step === 1) { m.back.remove(); } else { step -= 1; render(); } };
      var isScenario = step >= 7 && step <= 11;
      var next = button(i18n.t(step === total ? 'mhFinish' : 'mhNext'), 'tj-primary', step === total ? 'check-circle' : 'arrow-right');
      next.onclick = function () {
        var current = content.firstChild;
        var live = store.load();
        if (current && current.getters && current.getters.save) current.getters.save(live);
        live = store.save(live);
        if (isScenario && current.getters.commit) live = current.getters.commit(live);
        if (step < total) { step += 1; render(); return; }
        var finished = store.load();
        finished.intake.completed = true;
        finished.intake.completedAt = store.now();
        finished.intake.filledVia = finished.intake.filledVia === 'chat' ? 'mixed' : 'form';
        store.save(finished);
        toast(i18n.t('mhIntakeSaved'), 'success');
        m.back.remove();
        if (onFinish) onFinish();
      };
      actions.append(prev, next);
      icons(m.back);
    }

    m.box.append(stepsNav, content, actions);
    render();
    return m.back;
  }

  window.TradeJournalMentalHealthIntake = { open: openIntake };
}());
