(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var types = window.TradeJournalMentalHealthTypes;
  var tradeStore = window.TradeJournalTradeStore;
  if (!i18n || !types) return;

  var phaseKeyMap = {
    assessment: 'mhPhaseAssessment', formulation: 'mhPhaseFormulation', psychoeducation: 'mhPhasePsychoeducation',
    cognitive: 'mhPhaseCognitive', behavioral: 'mhPhaseBehavioral', monitoring: 'mhPhaseMonitoring', relapse_prevention: 'mhPhaseRelapsePrevention'
  };

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function statChip(label, value) { var chip = el('div', 'mh-stat-chip'); chip.append(el('small', '', label), el('strong', '', value)); return chip; }
  function emotionLabel(name) { var tradeI18n = window.TradeJournalTradeI18n; return tradeI18n ? tradeI18n.t(name) : name; }
  function phaseLabel(phase) { return i18n.t(phaseKeyMap[phase] || phase); }

  function buildActivityLog(profile, trades) {
    var items = [];
    (trades || []).forEach(function (t) {
      (t.emotionLog || []).forEach(function (e) {
        var emotions = (e.dominantEmotions || []).map(emotionLabel).join(' · ');
        items.push({ type: 'emotion', icon: 'heart-pulse', timestamp: e.timestamp, summary: (emotions || '—') + ' · ' + i18n.t('mhStressLabel') + ': ' + e.stressLevel });
      });
    });
    (profile.cognitiveProfile.thoughtRecords || []).forEach(function (r) {
      items.push({ type: 'thought', icon: 'brain', timestamp: r.timestamp, summary: i18n.t('mhThoughtRecordTitle') + ': ' + String(r.automaticThought || '').slice(0, 70) });
    });
    (profile.triggerProfile.triggers || []).forEach(function (t) {
      items.push({ type: 'trigger', icon: 'zap', timestamp: t.lastTriggeredAt, summary: i18n.t('mhAddTrigger') + ': ' + t.description });
    });
    (profile.progressTracking.milestones || []).forEach(function (m) {
      items.push({ type: 'milestone', icon: 'award', timestamp: m.achievedAt, summary: m.title });
    });
    (profile.chatHistory || []).forEach(function (m) {
      items.push({ type: 'chat', icon: 'message-circle', timestamp: m.createdAt, summary: (m.role === 'user' ? '› ' : '‹ ') + String(m.content || '').slice(0, 90) });
    });
    (profile.cognitiveProfile.identifiedBiases || []).forEach(function (b) {
      (b.phaseHistory || []).forEach(function (h) {
        items.push({ type: 'phase', icon: 'route', timestamp: h.enteredAt, summary: i18n.t('mhBias_' + b.type) + ' → ' + phaseLabel(h.phase) });
      });
    });
    if (profile.baseline.completed) items.push({ type: 'baseline', icon: 'flag', timestamp: profile.baseline.assessmentDate, summary: i18n.t('mhBaselineTitle') });
    items.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    return items;
  }

  function activityRows(items, limit) {
    var list = el('div', 'mh-activity-list');
    if (!items.length) { list.append(el('p', 'mh-empty', i18n.t('mhActivityEmpty'))); return list; }
    items.slice(0, limit || items.length).forEach(function (item) {
      var row = el('div', 'mh-activity-row');
      row.append(ico(item.icon), el('small', '', i18n.date(item.timestamp, { dateStyle: 'medium', timeStyle: 'short' })), el('span', '', item.summary));
      list.append(row);
    });
    return list;
  }

  function reportBody(profile, trades) {
    var container = el('div', 'mh-report-body');
    container.append(el('p', 'mh-report-disclaimer', i18n.t('mhReportDisclaimer')));

    var baseline = el('section', 'mh-report-section');
    baseline.append(el('h3', '', i18n.t('mhBaselineTitle')));
    var bGrid = el('div', 'mh-baseline-summary-grid');
    bGrid.append(
      statChip(i18n.t('mhBaselineStress'), profile.baseline.initialStressLevel + '/10'),
      statChip(i18n.t('mhBaselineRegulation'), profile.baseline.initialEmotionalRegulation + '/10'),
      statChip(i18n.t('mhBaselineExperience'), i18n.number(profile.baseline.tradingExperienceYears))
    );
    baseline.append(bGrid);
    if (profile.baseline.selfReportedWeaknesses.length) {
      var weaknesses = el('div', 'mh-weakness-list');
      profile.baseline.selfReportedWeaknesses.forEach(function (w) { weaknesses.append(el('span', 'mh-chip', w)); });
      baseline.append(weaknesses);
    }
    container.append(baseline);

    var emo = el('section', 'mh-report-section');
    emo.append(el('h3', '', i18n.t('mhEmotionalWeatherTitle')));
    var eGrid = el('div', 'mh-baseline-summary-grid');
    eGrid.append(
      statChip(i18n.t('mhStressLabel'), i18n.number(profile.emotionalProfile.averageStressLevel)),
      statChip(i18n.t('mhHealthScoreTitle'), i18n.number(profile.healthReportCache.weeklyScore) + '/100')
    );
    emo.append(eGrid);
    container.append(emo);

    var triggersSection = el('section', 'mh-report-section');
    triggersSection.append(el('h3', '', i18n.t('mhTriggerConstellationTitle')));
    var allTriggers = (profile.triggerProfile.triggers || []).concat(profile.triggerProfile.autoDetectedTriggers || []);
    if (!allTriggers.length) triggersSection.append(el('p', 'mh-empty', i18n.t('mhNoTriggers')));
    else allTriggers.forEach(function (t) {
      var row = el('article', 'mh-evidence-row');
      row.append(el('strong', '', t.description || t.pattern), el('small', '', i18n.t('mhTriggerEvidence') + ': ' + ((t.supportingTradeIds || []).length)));
      triggersSection.append(row);
    });
    container.append(triggersSection);

    var biasSection = el('section', 'mh-report-section');
    biasSection.append(el('h3', '', i18n.t('mhPhaseJourneyTitle')));
    if (!profile.cognitiveProfile.identifiedBiases.length) biasSection.append(el('p', 'mh-empty', i18n.t('mhNoPatternsYet')));
    else profile.cognitiveProfile.identifiedBiases.forEach(function (b) {
      var row = el('article', 'mh-thought-row');
      row.append(el('strong', '', i18n.t('mhBias_' + b.type) + ' — ' + phaseLabel(b.cyclePhase)));
      var hist = el('div', 'mh-phase-history');
      (b.phaseHistory || []).forEach(function (h) { hist.append(el('span', 'mh-chip', i18n.date(h.enteredAt) + ' · ' + phaseLabel(h.phase))); });
      row.append(hist);
      biasSection.append(row);
    });
    container.append(biasSection);

    var thoughtSection = el('section', 'mh-report-section');
    thoughtSection.append(el('h3', '', i18n.t('mhThoughtRecordsListTitle')));
    if (!profile.cognitiveProfile.thoughtRecords.length) thoughtSection.append(el('p', 'mh-empty', i18n.t('mhNoThoughtRecords')));
    else profile.cognitiveProfile.thoughtRecords.forEach(function (r) {
      var row = el('article', 'mh-thought-row');
      row.append(el('time', '', i18n.date(r.timestamp)), el('strong', '', r.automaticThought), el('p', '', r.balancedThought));
      thoughtSection.append(row);
    });
    container.append(thoughtSection);

    var logSection = el('section', 'mh-report-section');
    logSection.append(el('h3', '', i18n.t('mhActivityLog')));
    logSection.append(activityRows(buildActivityLog(profile, trades), 200));
    container.append(logSection);

    return container;
  }

  function open(profile) {
    var trades = tradeStore ? tradeStore.listSync() : [];
    var back = el('div', 'tj-modal-backdrop mh-report-backdrop');
    back.dir = i18n.direction();
    var box = el('section', 'tj-modal mh-report-modal');
    var head = el('header', 'tj-modal-head');
    head.append(el('h2', '', i18n.t('mhFullReport')));
    var printBtn = button(i18n.t('mhPrintReport'), 'tj-secondary', 'printer');
    var downloadBtn = button(i18n.t('mhDownloadReport'), 'tj-secondary', 'download');
    var close = button('', 'tj-icon-button', 'x');
    printBtn.onclick = function () { window.print(); };
    downloadBtn.onclick = function () {
      var blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'trading-mental-health-profile-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.append(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };
    close.onclick = function () { back.remove(); };
    head.append(printBtn, downloadBtn, close);
    box.append(head, reportBody(profile, trades));
    back.append(box);
    document.body.append(back);
    back.addEventListener('click', function (event) { if (event.target === back) back.remove(); });
    document.addEventListener('keydown', function escape(event) { if (event.key === 'Escape') { back.remove(); document.removeEventListener('keydown', escape); } });
    if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(back);
  }

  window.TradeJournalMentalHealthReport = { open: open, buildActivityLog: buildActivityLog };
}());
