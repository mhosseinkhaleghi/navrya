(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var store = window.TradeJournalMentalHealthStore;
  var types = window.TradeJournalMentalHealthTypes;
  var charts = window.TradeJournalMentalHealthCharts;
  var collector = window.TradeJournalMentalHealthCollector;
  var safety = window.TradeJournalMentalHealthSafety;
  var tradeStore = window.TradeJournalTradeStore;
  var layer = window.TradeJournalPanelLayer;
  if (!i18n || !store || !types || !charts || !tradeStore || !layer) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }
  function statChip(label, value) { var chip = el('div', 'mh-stat-chip'); chip.append(el('small', '', label), el('strong', '', value == null || value === '' ? '—' : String(value))); return chip; }
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

  function inlineEditRow(path, label, kind, refresh) {
    var profile = store.load(), row = el('div', 'mh-editable-row');
    var value = store.getPath(profile, path);
    row.append(el('small', '', label), el('span', '', kind === 'boolean' ? (value == null ? '—' : value ? i18n.t('mhYes') : i18n.t('mhNo')) : (value == null || value === '' ? '—' : String(value))));
    var editBtn = button('', 'tj-icon-button', 'pencil');
    editBtn.onclick = function () {
      row.replaceChildren();
      var input;
      if (kind === 'boolean') { input = document.createElement('select'); input.append(new Option(i18n.t('mhYes'), 'true', false, value === true), new Option(i18n.t('mhNo'), 'false', false, value === false)); }
      else { input = document.createElement('input'); input.type = kind === 'number' ? 'number' : 'text'; input.dir = 'auto'; input.value = value == null ? '' : value; }
      var save = button(i18n.t('mhSave'), 'tj-primary', 'check');
      save.onclick = function () { var p = store.load(); store.setPath(p, path, input.value); store.save(p); if (refresh) refresh(); };
      row.append(el('small', '', label), input, save);
    };
    row.append(editBtn);
    return row;
  }

  // ---------------------------------------------------------------------
  // Intake tab
  // ---------------------------------------------------------------------
  function intakeTab(profile, refresh) {
    var wrap = el('div', 'psy-tab-view mh-tab-view');
    var openBtn = button(profile.intake.completed ? i18n.t('mhEditIntake') : i18n.t('mhStartIntake'), 'tj-primary', 'clipboard-list');
    openBtn.onclick = function () { if (window.TradeJournalMentalHealthIntake) window.TradeJournalMentalHealthIntake.open(refresh); };
    wrap.append(openBtn);
    if (!profile.intake.completed) { wrap.append(el('p', 'mh-empty', i18n.t('mhIntakeNotCompleted'))); return wrap; }

    var summary = el('section', 'mh-card'), heading = el('h3', '', i18n.t('mhIntakeSummaryTitle'));
    heading.append(infoIcon(i18n.t('mhInfoIntake')));
    summary.append(heading);
    var grid = el('div', 'mh-baseline-summary-grid');
    grid.append(
      statChip(i18n.t('mhAge'), profile.intake.demographics.age),
      statChip(i18n.t('mhCapitalType'), profile.intake.financialContext.capitalType ? i18n.t('mhCapitalType_' + profile.intake.financialContext.capitalType) : null),
      statChip(i18n.t('mhYearsTrading'), profile.intake.tradingHistory.yearsTrading),
      statChip(i18n.t('mhMotivationQuestion'), profile.intake.motivationForTrading ? i18n.t('mhMotivation_' + profile.intake.motivationForTrading) : null)
    );
    summary.append(grid);
    summary.append(
      inlineEditRow('intake.demographics.age', i18n.t('mhAge'), 'number', refresh),
      inlineEditRow('intake.financialContext.capitalAllocationPercent', i18n.t('mhCapitalAllocation'), 'number', refresh),
      inlineEditRow('intake.financialContext.borrowedMoneyForTrading', i18n.t('mhBorrowedMoney'), 'boolean', refresh),
      inlineEditRow('intake.tradingHistory.yearsTrading', i18n.t('mhYearsTrading'), 'number', refresh)
    );
    wrap.append(summary);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Psychological Profile tab
  // ---------------------------------------------------------------------
  function standardizedTestCard(key, title) {
    var card = el('article', 'mh-card mh-test-card');
    card.append(el('strong', '', title), el('p', 'mh-empty', i18n.t('mhTestNotYetAdded')));
    return card;
  }

  function scenarioResultsCard(profile) {
    var card = el('section', 'mh-card'), heading = el('h3', '', i18n.t('mhScenarioAssessmentTitle'));
    heading.append(infoIcon(i18n.t('mhInfoScenarioAssessment')));
    card.append(heading);
    var responses = profile.psychologicalProfile.scenarioAssessment.responses;
    if (!responses.length) { card.append(el('p', 'mh-empty', i18n.t('mhScenarioAssessmentEmpty'))); return card; }
    responses.forEach(function (r) {
      var row = el('article', 'mh-thought-row');
      row.append(el('strong', '', i18n.t('mhScenario_' + r.scenarioId + '_title')), el('small', '', i18n.t('mhMeasures') + ': ' + i18n.t('mhConstruct_' + r.measuresConstruct)));
      row.append(el('p', '', r.choice ? i18n.t('mhScenarioChoice_' + r.scenarioId + '_' + r.choice) : '—'));
      if (r.sliderValue != null) row.append(el('small', '', i18n.t('mhScenarioIntensity') + ': ' + r.sliderValue + '/10'));
      if (r.freeText) row.append(el('p', 'tj-hint', r.freeText));
      card.append(row);
    });
    return card;
  }

  function psychologicalProfileTab(profile, refresh) {
    var wrap = el('div', 'psy-tab-view mh-tab-view');
    wrap.append(scenarioResultsCard(profile));

    var launchChecklist = button(profile.psychologicalProfile.biasChecklist.lastAssessedAt ? i18n.t('mhRedoBiasChecklist') : i18n.t('mhStartBiasChecklist'), 'tj-secondary', 'clipboard-check');
    launchChecklist.onclick = function () { if (window.TradeJournalMentalHealthContinuous) window.TradeJournalMentalHealthContinuous.openBiasChecklist(refresh); };
    wrap.append(launchChecklist);
    wrap.append(chartCard(i18n.t('mhBiasRadarTitle'), function (canvas) { charts.drawBiasRadar(canvas, profile.psychologicalProfile.biasChecklist.biases, types.biasChecklistTypes); }, i18n.t('mhInfoBiasRadar')));

    var testsSection = el('section', 'mh-card'), testsHeading = el('h3', '', i18n.t('mhStandardizedTestsTitle'));
    testsHeading.append(infoIcon(i18n.t('mhInfoStandardizedTests')));
    testsSection.append(testsHeading);
    var testsGrid = el('div', 'mh-tests-grid');
    testsGrid.append(standardizedTestCard('bigFive', i18n.t('mhTestBigFive')), standardizedTestCard('riskToleranceScale', i18n.t('mhTestRiskTolerance')), standardizedTestCard('bis11Impulsivity', i18n.t('mhTestBis11')), standardizedTestCard('sogsGamblingScreen', i18n.t('mhTestSogs')));
    testsSection.append(testsGrid);
    wrap.append(testsSection);
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Continuous Tracking tab
  // ---------------------------------------------------------------------
  function timelineCard(title, items, renderItem, infoText) {
    var card = el('section', 'mh-card'), heading = el('h3', '', title);
    if (infoText) heading.append(infoIcon(infoText));
    card.append(heading);
    if (!items.length) { card.append(el('p', 'mh-empty', i18n.t('mhNoData'))); return card; }
    var list = el('div', 'mh-activity-list');
    items.slice(-15).reverse().forEach(function (item) { list.append(renderItem(item)); });
    card.append(list);
    return card;
  }

  function continuousTrackingTab(profile) {
    var wrap = el('div', 'psy-tab-view mh-tab-view');
    wrap.append(timelineCard(i18n.t('mhPreSessionCheckIns'), profile.continuousTracking.preSessionCheckIns, function (c) {
      var row = el('div', 'mh-activity-row');
      row.append(el('small', '', i18n.date(c.createdAt, { dateStyle: 'medium', timeStyle: 'short' })), el('span', '', i18n.t('mhSleepQuality') + ': ' + c.sleepQuality + ' · ' + i18n.t('mhCurrentStress') + ': ' + c.currentStressLevel));
      return row;
    }, i18n.t('mhInfoPreSessionCheckIns')));

    wrap.append(timelineCard(i18n.t('mhPreTradeContextTitle'), profile.continuousTracking.preTradeContext, function (c) {
      var row = el('div', 'mh-activity-row');
      var parts = [i18n.t('mhSleepQuality') + ': ' + c.sleepQuality];
      if (c.significantPersonalEvent) parts.push(c.significantPersonalEvent);
      row.append(el('small', '', i18n.date(c.createdAt, { dateStyle: 'medium', timeStyle: 'short' })), el('span', '', parts.join(' · ')));
      return row;
    }, i18n.t('mhInfoPreTradeContext')));

    wrap.append(timelineCard(i18n.t('mhPostTradeReflections'), profile.continuousTracking.postTradeReflections, function (r) {
      var row = el('div', 'mh-activity-row');
      row.append(el('small', '', i18n.date(r.createdAt, { dateStyle: 'medium', timeStyle: 'short' })), el('span', '', i18n.t('mhSetupQuality') + ': ' + r.setupQualityRating + ' · ' + i18n.t('mhPlanAdherence') + ': ' + r.planAdherenceRating));
      return row;
    }, i18n.t('mhInfoPostTradeReflections')));

    var sentences = profile.continuousTracking.postTradeReflections.filter(function (r) { return r.sentenceOfTheDay; });
    wrap.append(timelineCard(i18n.t('mhSentencesTitle'), sentences, function (r) {
      var row = el('div', 'mh-activity-row');
      row.append(el('small', '', i18n.date(r.createdAt)), el('span', '', r.sentenceOfTheDay));
      return row;
    }, i18n.t('mhInfoSentences')));

    var reports = profile.continuousTracking.monthlyCorrelationReports;
    wrap.append(timelineCard(i18n.t('mhMonthlyReportsTitle'), reports, function (r) {
      var row = el('div', 'mh-activity-row');
      row.append(el('small', '', r.month), el('span', '', i18n.t('mhPlanAdherenceScore') + ': ' + r.planAdherenceScore));
      return row;
    }, i18n.t('mhInfoMonthlyReports')));
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Red Flags tab
  // ---------------------------------------------------------------------
  function redFlagCard(flag) {
    var card = el('article', 'mh-card mh-redflag-card');
    card.append(el('strong', '', i18n.t('mhRedFlag_' + flag.type)), el('small', '', i18n.date(flag.detectedAt)));
    if (flag.professionalReferralShown && safety) card.append(safety.renderSafetyCard());
    return card;
  }

  function redFlagsTab(profile) {
    var wrap = el('div', 'psy-tab-view mh-tab-view');
    var heading = el('h3', '', i18n.t('mhRedFlagsTitle'));
    heading.append(infoIcon(i18n.t('mhInfoRedFlags')));
    wrap.append(heading);
    if (!profile.redFlags.active.length) { wrap.append(el('p', 'mh-card mh-empty', i18n.t('mhRedFlagsClear'))); return wrap; }
    profile.redFlags.active.forEach(function (flag) { wrap.append(redFlagCard(flag)); });
    if (profile.redFlags.resolved.length) {
      wrap.append(el('h4', '', i18n.t('mhRedFlagsResolved')));
      profile.redFlags.resolved.forEach(function (flag) { wrap.append(redFlagCard(flag)); });
    }
    return wrap;
  }

  // ---------------------------------------------------------------------
  // Page shell - a real route (#mindset/profile[/tab]), not a modal overlay.
  // Mirrors pattern-registry.js's openProfile/route/render/hashchange shape.
  // ---------------------------------------------------------------------
  var TABS = ['intake', 'psychological', 'continuous', 'redflags'];
  var state = { tab: 'intake' };

  function renderPage() {
    var profile = collector ? collector.recompute().profile : store.load();
    var page = el('section', 'panel-page psy-page mh-profile-page');
    page.dir = i18n.direction();

    var head = el('header', 'pr-page-header'), left = el('div', 'pr-title'), mark = el('span', 'pr-title-icon'), copy = el('div');
    mark.append(ico('user-round'));
    copy.append(el('h2', '', i18n.t('mhProfilePageTitle')), el('p', '', i18n.t('mhProfilePageHint')));
    left.append(mark, copy);
    var back = button(i18n.t('mhBack'), 'pr-secondary', i18n.direction() === 'rtl' ? 'arrow-right' : 'arrow-left');
    back.onclick = function () { history.replaceState(null, '', '#mindset'); if (window.TradeJournalPsychology) window.TradeJournalPsychology.render(); };
    head.append(left, back);

    var nav = el('nav', 'psy-tabs');
    [['intake', 'mhTabIntake', 'clipboard-list'], ['psychological', 'mhTabPsychological', 'brain-circuit'], ['continuous', 'mhTabContinuous', 'activity'], ['redflags', 'mhTabRedFlags', 'flag']].forEach(function (item) {
      var b = button(i18n.t(item[1]), state.tab === item[0] ? 'active' : '', item[2]);
      b.onclick = function () { history.replaceState(null, '', '#mindset/profile/' + item[0]); state.tab = item[0]; renderPage(); };
      nav.append(b);
    });

    var body = el('div', 'mh-profile-page-body');
    body.append(
      state.tab === 'intake' ? intakeTab(profile, renderPage) :
      state.tab === 'psychological' ? psychologicalProfileTab(profile, renderPage) :
      state.tab === 'continuous' ? continuousTrackingTab(profile) : redFlagsTab(profile)
    );

    page.append(head, nav, body);
    layer.show(page, 'psychology');
    document.querySelectorAll('.sidebar nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#mindset'); });
    icons(page);
  }

  function route() {
    var match = location.hash.match(/^#mindset\/profile(?:\/(intake|psychological|continuous|redflags))?$/);
    return match ? (match[1] || 'intake') : null;
  }

  function render() {
    var tab = route();
    if (!tab) return;
    state.tab = tab;
    renderPage();
  }

  function open(tab) {
    var initial = TABS.indexOf(tab) > -1 ? tab : 'intake';
    history.replaceState(null, '', '#mindset/profile/' + initial);
    state.tab = initial;
    render();
  }

  window.addEventListener('hashchange', function () { if (location.hash.indexOf('#mindset/profile') === 0) render(); });
  window.setTimeout(function () { if (location.hash.indexOf('#mindset/profile') === 0) render(); }, 0);

  window.TradeJournalMentalHealthProfilePage = { open: open, render: render, route: route, continuousTrackingTab: continuousTrackingTab };
}());
