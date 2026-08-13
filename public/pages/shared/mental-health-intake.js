(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var store = window.TradeJournalMentalHealthStore;
  var types = window.TradeJournalMentalHealthTypes;
  var safety = window.TradeJournalMentalHealthSafety;
  if (!i18n || !store || !types) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; node.setAttribute('aria-hidden', 'true'); return node; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }

  // The design system's fourth accent is keyed "master" (characters.css); this app's routing
  // has always called that character "sage" - see navrya-src/characters.js for the same mapping,
  // ported here verbatim since this plain script can't import an ES module.
  var CHAR_META = {
    hunter: { navryaId: 'hunter', title: 'THE HUNTER', quotes: { en: 'A hunter never rushes; he waits for the right moment to act.', fa: 'شکارچی عجله نمی‌کند؛\nاو انتظار بهترین لحظه\nرا دارد.', ar: 'الصياد لا يستعجل؛\nإنه ينتظر أفضل لحظة\nليتحرك.', es: 'Un cazador no se apresura; espera el mejor momento para actuar.' } },
    engineer: { navryaId: 'engineer', title: 'THE MARKET ENGINEER', quotes: { en: 'An engineer never rushes; they test the structure and execute with precision.', fa: 'مهندس بازار شتاب نمی‌کند؛\nساختار را می‌سنجد\nو بعد با دقت اجرا می‌کند.', ar: 'مهندس السوق لا يتسرع؛\nيختبر البنية\nثم ينفذ بدقة.', es: 'Un ingeniero no se apresura; evalúa la estructura y ejecuta con precisión.' } },
    commander: { navryaId: 'commander', title: 'THE COMMANDER', quotes: { en: 'A commander never rushes; he reads the field and moves with a plan.', fa: 'فرمانده عجله نمی‌کند؛\nاو میدان را می‌خواند\nو با نقشه حرکت می‌کند.', ar: 'القائد لا يستعجل؛\nإنه يقرأ الميدان\nثم يتحرك بخطة.', es: 'Un comandante no se apresura; lee el campo y avanza con un plan.' } },
    sage: { navryaId: 'master', title: 'THE MARKET SAGE', quotes: { en: 'Every trade is a teacher; every mistake, a lesson; every session, deeper market understanding.', fa: 'هر معامله یک معلم است؛\nهر اشتباه یک درس،\nو هر جلسه یک قدم به سوی درک عمیق‌تر بازار.', ar: 'كل صفقة معلّم؛\nوكل خطأ درس،\nوكل جلسة خطوة نحو فهم أعمق للسوق.', es: 'Cada operación es un maestro; cada error, una lección; cada sesión, más comprensión del mercado.' } }
  };
  function currentCharacter() {
    var layer = window.TradeJournalPanelLayer;
    var appChar = (layer && layer.character) || 'hunter';
    return CHAR_META[appChar] ? appChar : 'hunter';
  }

  var AGE_MIN = 16, AGE_MAX = 80, AGE_TICK = 26;

  // Deterministic decorative visuals (stop-loss/patience candlesticks, FOMO bars, losing-month
  // grid) - ported byte-for-byte from the design handoff's TradingIntake.dc.html. Pure display,
  // seeded so every trader sees the same illustrative scene; nothing here is collected as data.
  function seededCandles(seed, n, drift, vol) {
    var x = seed, price = 100, out = [];
    for (var i = 0; i < n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      var r = ((x >> 9) % 1000) / 1000 - 0.5;
      var open = price;
      price = price + drift + r * vol;
      out.push({ o: open, c: price, hi: Math.max(open, price) + Math.abs(r) * vol * 0.7, lo: Math.min(open, price) - Math.abs(r) * vol * 0.7 });
    }
    return out;
  }
  function layoutCandles(raw, pad) {
    var his = raw.map(function (c) { return c.hi; }), los = raw.map(function (c) { return c.lo; });
    var hi = Math.max.apply(null, his), lo = Math.min.apply(null, los);
    var span = (hi - lo) || 1, top = hi + span * pad, range = span * (1 + pad * 2);
    var n = raw.length, slot = 100 / n;
    function pct(v) { return ((top - v) / range) * 100; }
    return raw.map(function (c, i) {
      var bt = pct(Math.max(c.o, c.c)), bb = pct(Math.min(c.o, c.c));
      return {
        left: (i * slot + slot * 0.2).toFixed(2) + '%', w: (slot * 0.6).toFixed(2) + '%',
        wt: pct(c.hi).toFixed(2) + '%', wh: (pct(c.lo) - pct(c.hi)).toFixed(2) + '%',
        bt: bt.toFixed(2) + '%', bh: Math.max(0.8, bb - bt).toFixed(2) + '%',
        up: c.c >= c.o
      };
    });
  }
  function renderCandles(container, layout) {
    layout.forEach(function (c) {
      var slot = el('span'); slot.style.cssText = 'position:absolute;top:0;bottom:0;left:' + c.left + ';width:' + c.w;
      var wick = el('span', 'mhw-candle-wick'); wick.style.top = c.wt; wick.style.height = c.wh;
      var body = el('span', 'mhw-candle-body ' + (c.up ? 'is-up' : 'is-down')); body.style.top = c.bt; body.style.height = c.bh;
      slot.append(wick, body);
      container.append(slot);
    });
  }

  function guardedSubmit(text, container, onSafe) {
    if (safety) {
      var check = safety.checkText(text);
      if (check.flagged) { container.replaceChildren(safety.renderSafetyCard(function () { container.replaceChildren(); })); return; }
    }
    onSafe();
  }

  var SCENARIOS = [
    { id: 'A_stop_loss', measuresConstruct: 'loss_aversion_discipline', field: 'sc1', choices: [['move_stop_back', 'move-horizontal'], ['wait_it_hits', 'clock'], ['quick_reanalysis', 'search'], ['pray', 'sparkles']] },
    { id: 'B_revenge', measuresConstruct: 'revenge_trading', field: 'sc2', slider: true, sliderLeft: 'mhScenarioBCalm', sliderRight: 'mhScenarioBAngry', heatQuestion: 'mhHeatQuestionB', choices: [['sleep', 'moon'], ['open_to_recover', 'rotate-ccw'], ['journal', 'pencil'], ['other', 'more-horizontal']], hasFreeText: true },
    { id: 'C_fomo', measuresConstruct: 'fomo', field: 'sc3', choices: [['disciplined_no_stop', 'award'], ['was_clear_should_enter', 'zap'], ['next_time_for_sure', 'rotate-ccw'], ['no_fomo_repeat', 'shield-check']] },
    { id: 'D_patience', measuresConstruct: 'overtrading_patience', field: 'sc4', slider: true, sliderLeft: 'mhScenarioDEasy', sliderRight: 'mhScenarioDHard', heatQuestion: 'mhHeatQuestionD', choices: [['wait', 'hourglass'], ['open_test_trade', 'flask-conical'], ['lower_timeframe_for_stop', 'search'], ['exit_market', 'door-open']] },
    { id: 'E_identity', measuresConstruct: 'identity_outcome_fusion', field: 'sc5', choices: [['bad_month_review_system', 'clipboard-check'], ['not_made_for_trading', 'cloud-rain'], ['market_manipulated', 'shield-alert'], ['must_change_strategy', 'layers'], ['only_losing_thats_all', 'moon']] }
  ];
  var MOTIVATIONS = [['quick_money', 'zap'], ['freedom', 'key'], ['complexity_challenge', 'puzzle'], ['escape_job', 'door-open'], ['social_influence', 'users'], ['analytical_confidence', 'compass']];
  var LOSS_REACTIONS = [['revenge_same_day', 'rotate-ccw'], ['shock_avoidance', 'eye-off'], ['analytical_review', 'clipboard-check'], ['anxiety_worry', 'cloud-rain'], ['blame_market', 'award'], ['sought_support', 'message-circle']];
  var CAPITAL_TYPES = [['surplus', 'coins'], ['essential', 'shield-alert'], ['mixed', 'scale']];
  var GENDERS = [['male', 'user'], ['female', 'user-round'], ['prefer_not_to_say', 'eye-off']];
  var MARITAL_STATUSES = [['single', 'user'], ['married', 'users'], ['divorced', 'unlink'], ['widowed', 'heart-crack'], ['prefer_not_to_say', 'eye-off']];
  var OCCUPATION_TYPES = [['full_time_trader', 'zap'], ['part_time_trader', 'clock'], ['employed', 'briefcase'], ['self_employed', 'store'], ['student', 'graduation-cap'], ['retired', 'armchair'], ['other', 'more-horizontal']];
  var MARKET_PRESETS = ['forex', 'crypto', 'stocks', 'commodities', 'indices', 'futures_options'];

  var CHAPTER_STEPS = [[1], [2, 3, 4], [5, 6, 7], [8, 9, 10, 11, 12], [13]];
  var CHAPTER_KEYS = ['mhChapterOrientation', 'mhChapterContext', 'mhChapterHistory', 'mhChapterScenarios', 'mhChapterSeal'];
  var TOTAL_STEPS = 13;

  function stepMeta(step) {
    var t = i18n.t;
    switch (step) {
      case 1: return { title: t('mhIntakeWelcomeTitle'), hint: t('mhIntakeWelcomeBody') };
      case 2: return { title: t('mhIntakeStep2Title'), hint: t('mhStepAboutYouHint') };
      case 3: return { title: t('mhIntakeStep3Title'), hint: t('mhFinancialContextHint') };
      case 4: return { title: t('mhStepExperienceTitle'), hint: t('mhStepExperienceHint') };
      case 5: return { title: t('mhStepExtremesTitle'), hint: t('mhStepExtremesHint') };
      case 6: return { title: t('mhIntakeStep5Title'), hint: '' };
      case 7: return { title: t('mhIntakeStep6Title'), hint: t('mhTransparencyHint') };
      case 8: return { title: t('mhScenario_A_stop_loss_title'), hint: t('mhScenario_A_stop_loss_body') };
      case 9: return { title: t('mhScenario_B_revenge_title'), hint: t('mhScenario_B_revenge_body') };
      case 10: return { title: t('mhScenario_C_fomo_title'), hint: t('mhScenario_C_fomo_body') };
      case 11: return { title: t('mhScenario_D_patience_title'), hint: t('mhScenario_D_patience_body') };
      case 12: return { title: t('mhScenario_E_identity_title'), hint: t('mhScenario_E_identity_body') };
      case 13: return { title: t('mhIntakeStep8Title'), hint: t('mhIntakeSummaryHint') };
      default: return { title: '', hint: '' };
    }
  }

  function openIntake(onFinish) {
    var t = i18n.t;
    var character = currentCharacter();
    var meta = CHAR_META[character];
    var lang = i18n.language();
    var step = 1;
    var sealed = false;
    var intakeRegistry = window.TradeJournalAIProcessRegistry;

    var backdrop = el('div', 'mhw-backdrop');
    backdrop.dir = i18n.direction();
    var modal = el('div', 'mhw-modal');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', t('mhIntakeTitle'));
    modal.dataset.character = meta.navryaId;
    ['tl', 'tr', 'bl', 'br'].forEach(function (pos) { modal.append(el('span', 'mhw-corner mhw-corner-' + pos)); });

    var headIcon = el('div', 'mhw-head-icon'); headIcon.append(ico('brain'));
    var headText = el('div', 'mhw-head-text');
    headText.append(el('span', 'mhw-head-eyebrow', t('mhIntakeEyebrow')), el('h2', 'mhw-head-title', t('mhIntakeTitle')));
    var headMeta = el('div', 'mhw-head-meta');
    var headStep = el('span', 'mhw-head-step'), headChapter = el('span', 'mhw-head-chapter');
    headMeta.append(headStep, headChapter);
    var closeBtn = el('button', 'mhw-close'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', t('mhClose')); closeBtn.append(ico('x'));
    var head = el('div', 'mhw-head');
    head.append(headIcon, headText, el('span', 'mhw-head-spacer'), headMeta, closeBtn);

    var chaptersRow = el('div', 'mhw-chapters');
    var chapterEls = CHAPTER_STEPS.map(function (steps, idx) {
      var chip = el('div', 'mhw-chapter');
      var label = el('span', 'mhw-chapter-label', t(CHAPTER_KEYS[idx]));
      var segs = el('div', 'mhw-chapter-segs');
      var segEls = steps.map(function () { var seg = el('span', 'mhw-seg'); segs.append(seg); return seg; });
      chip.style.flex = String(steps.length);
      chip.append(label, segs);
      chaptersRow.append(chip);
      return { steps: steps, chip: chip, label: label, segs: segEls };
    });

    var body = el('div', 'mhw-body');
    var bodyFrame = el('div', 'mhw-body-frame'); bodyFrame.append(body, el('span', 'mhw-body-fade'));
    var foot = el('div', 'mhw-foot');

    modal.append(head, chaptersRow, bodyFrame, foot);
    backdrop.append(modal);

    if (intakeRegistry) intakeRegistry.register('mh-intake', {
      allowlist: (types.intakePaths || []).slice(),
      isOpen: function () { return document.body.contains(backdrop); },
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

    function destroy(event) {
      if (event) { event.preventDefault(); event.stopPropagation(); }
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    }
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) destroy(event); });
    modal.addEventListener('click', function (event) { event.stopPropagation(); });
    closeBtn.addEventListener('click', destroy);

    function onKeyDown(event) {
      if (event.key === 'Escape') { destroy(event); return; }
      var tag = event.target && event.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (event.key === 'ArrowRight' && !event.metaKey) { if (step !== 2 && step !== 3) goNext(); }
      if (event.key === 'ArrowLeft' && !event.metaKey) { if (step !== 2 && step !== 3) goPrev(); }
    }
    document.addEventListener('keydown', onKeyDown, true);

    function goTo(n) { step = Math.max(1, Math.min(TOTAL_STEPS, n)); sealed = false; render(); }
    // Both persist the currently visible step's fields before moving - Previous never loses
    // what you just filled in, and Next/Skip never re-ask a question you already answered.
    function goNext() { commitStep(); if (step >= TOTAL_STEPS) { finish(); } else { goTo(step + 1); } }
    function goPrev() { commitStep(); goTo(step - 1); }

    // ---------------- reusable field widgets (self-contained: own local selection state,
    // read at save() time - mirrors the original form's uncontrolled-input pattern) ----------------
    // Choice tiles keyed off an i18n prefix (e.g. 'mhGender_' + 'male' -> mhGender_male).
    function choiceTiles(labelKey, noteText, options, prefix, currentValue, basis) {
      var wrap = el('div', 'mhw-tiles');
      var headRow = el('div', 'mhw-tiles-head');
      headRow.append(el('span', 'mhw-tiles-label', t(labelKey)), el('span', 'mhw-tiles-spacer'));
      if (noteText) headRow.append(el('span', 'mhw-tiles-note', noteText));
      var grid = el('div', 'mhw-tile-grid');
      var current = currentValue || '';
      var entries = options.map(function (opt) {
        var key = opt[0], iconName = opt[1];
        var btn = el('button', 'mhw-tile'); btn.type = 'button';
        if (basis) btn.style.flexBasis = basis;
        var iconEl = ico(iconName), labelEl = el('span', '', t(prefix + key));
        btn.append(iconEl, labelEl);
        function sync() { btn.classList.toggle('is-selected', current === key); }
        sync();
        btn.addEventListener('click', function () { current = current === key ? '' : key; entries.forEach(function (e) { e.sync(); }); });
        grid.append(btn);
        return { key: key, btn: btn, sync: sync };
      });
      wrap.append(headRow, grid);
      return { wrap: wrap, get: function () { return current; } };
    }

    function switchRow(labelText, value) {
      var wrap = el('div', 'mhw-switch-row');
      var current = value;
      var listeners = [];
      var group = el('div', 'mhw-switch-group');
      var yes = el('button', 'mhw-switch-option', t('mhYes')); yes.type = 'button';
      var no = el('button', 'mhw-switch-option', t('mhNo')); no.type = 'button';
      function sync() { yes.classList.toggle('is-selected', current === true); no.classList.toggle('is-selected', current === false); listeners.forEach(function (fn) { fn(current); }); }
      yes.addEventListener('click', function () { current = current === true ? null : true; sync(); });
      no.addEventListener('click', function () { current = current === false ? null : false; sync(); });
      sync();
      group.append(yes, no);
      wrap.append(el('span', 'mhw-switch-label', labelText), group);
      // onChange listeners attach after construction (see transparencyPanel) - sync() above
      // already ran once during construction with no listeners yet, which is fine: there is
      // nothing dependent on this switch's initial value that needs notifying before it exists.
      return { wrap: wrap, get: function () { return current; }, onChange: function (fn) { listeners.push(fn); } };
    }

    function dialRow(labelText, value, lowLabel, highLabel) {
      var wrap = el('div', 'mhw-dial');
      var current = value == null ? 5 : value;
      var headRow = el('div', 'mhw-dial-head');
      var valueEl = el('span', 'mhw-dial-value', String(current));
      headRow.append(el('span', 'mhw-dial-label', labelText), el('span', 'mhw-tiles-spacer'), valueEl, el('span', 'mhw-dial-max', t('mhOutOfTen')));
      var notches = el('div', 'mhw-dial-notches');
      var notchEls = [];
      for (var i = 1; i <= 10; i++) {
        (function (n) {
          var notch = el('button', 'mhw-notch'); notch.type = 'button'; notch.setAttribute('aria-label', labelText + ' ' + n);
          var bar = el('span'); bar.style.height = (34 + n * 6.4).toFixed(0) + '%';
          notch.append(bar);
          notch.addEventListener('click', function () { current = n; sync(); });
          notches.append(notch); notchEls.push(notch);
        }(i));
      }
      function sync() { valueEl.textContent = String(current); notchEls.forEach(function (n, idx) { n.classList.toggle('is-lit', idx < current); }); }
      sync();
      var ends = el('div', 'mhw-dial-ends'); ends.append(el('span', '', lowLabel), el('span', '', highLabel));
      wrap.append(headRow, notches, ends);
      return { wrap: wrap, get: function () { return current; } };
    }

    function ageSlider(initial) {
      var current = Math.max(AGE_MIN, Math.min(AGE_MAX, initial || 34));
      var wrap = el('div', 'mhw-age');
      var head = el('div', 'mhw-age-head');
      var text = el('div', 'mhw-age-text');
      text.append(el('span', 'mhw-age-label', t('mhAge')), el('span', 'mhw-age-hint', t('mhAgeSliderHint')));
      var valueEl = el('span', 'mhw-age-value', String(current));
      head.append(text, el('span', 'mhw-age-spacer'), valueEl, el('span', 'mhw-age-unit', t('mhAgeYearsUnit')));
      var track = el('div', 'mhw-age-track'); track.tabIndex = 0; track.setAttribute('role', 'slider'); track.setAttribute('aria-label', t('mhAge'));
      track.setAttribute('aria-valuemin', String(AGE_MIN)); track.setAttribute('aria-valuemax', String(AGE_MAX));
      var ticksWrap = el('div', 'mhw-age-ticks');
      var tickEls = [];
      for (var n = AGE_MIN; n <= AGE_MAX; n++) {
        (function (age) {
          var tick = el('div', 'mhw-age-tick');
          if (age % 5 === 0) tick.classList.add('is-major');
          tick.append(el('span', 'mhw-age-tick-mark'), el('span', 'mhw-age-tick-label'));
          ticksWrap.append(tick);
          tickEls.push({ age: age, el: tick });
        }(n));
      }
      track.append(ticksWrap, el('span', 'mhw-age-centerline'), el('span', 'mhw-age-fade'));
      wrap.append(head, track);

      function sync() {
        valueEl.textContent = String(current);
        track.setAttribute('aria-valuenow', String(current));
        ticksWrap.style.transform = 'translateX(' + (-((current - AGE_MIN) * AGE_TICK + AGE_TICK / 2)) + 'px)';
        tickEls.forEach(function (item) {
          var isCurrent = item.age === current;
          item.el.classList.toggle('is-current', isCurrent);
          item.el.querySelector('.mhw-age-tick-label').textContent = (isCurrent || item.age % 5 === 0) ? String(item.age) : '';
        });
      }
      function setAge(v) { current = Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(v))); sync(); }
      sync();

      var dragX0 = 0, dragAge0 = 0, dragging = false;
      function moveDrag(e) { setAge(dragAge0 - (e.clientX - dragX0) / AGE_TICK); }
      function endDrag() { dragging = false; window.removeEventListener('pointermove', moveDrag); window.removeEventListener('pointerup', endDrag); }
      track.addEventListener('pointerdown', function (e) { dragging = true; dragX0 = e.clientX; dragAge0 = current; window.addEventListener('pointermove', moveDrag); window.addEventListener('pointerup', endDrag); });
      var wheelAcc = 0;
      track.addEventListener('wheel', function (e) {
        e.preventDefault();
        var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        wheelAcc += d;
        var steps = Math.trunc(wheelAcc / AGE_TICK);
        if (steps) { wheelAcc -= steps * AGE_TICK; setAge(current + steps); }
      }, { passive: false });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setAge(current - 1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); setAge(current + 1); }
      });
      var teardown = function () { endDrag(); };
      return { wrap: wrap, get: function () { return current; }, teardown: teardown };
    }

    function yearsRungs(initial) {
      var current = initial == null ? 0 : initial;
      var wrap = el('div', 'mhw-years');
      var head = el('div', 'mhw-years-head');
      var text = el('div', 'mhw-years-text'); text.append(el('span', 'mhw-years-label', t('mhYearsTrading')), el('span', 'mhw-years-hint', t('mhYearsHint')));
      var valueEl = el('span', 'mhw-years-value', '');
      head.append(text, el('span', 'mhw-years-spacer'), valueEl);
      var rungsWrap = el('div', 'mhw-rungs');
      var rungEls = [];
      for (var y = 0; y <= 10; y++) {
        (function (year) {
          var rung = el('button', 'mhw-rung'); rung.type = 'button';
          rung.setAttribute('aria-label', year === 10 ? t('mhYearsTenPlus') : t('mhYearsPlural', { n: year }));
          var bar = el('span', 'mhw-rung-bar'); bar.style.height = (26 + year * 6.6).toFixed(0) + '%';
          rung.append(bar, el('span', 'mhw-rung-label', year === 0 ? '<1' : (year === 10 ? '10+' : String(year))));
          rung.addEventListener('click', function () { current = year; sync(); });
          rungsWrap.append(rung); rungEls.push(rung);
        }(y));
      }
      function yearsText() {
        if (current === 0) return t('mhYearsUnderOne');
        if (current >= 10) return t('mhYearsTenPlus');
        return current === 1 ? t('mhYearsOne') : t('mhYearsPlural', { n: current });
      }
      function sync() {
        valueEl.textContent = yearsText();
        rungEls.forEach(function (rung, idx) { rung.classList.toggle('is-selected', idx === current); rung.classList.toggle('is-lit', idx < current); });
      }
      sync();
      wrap.append(head, rungsWrap);
      return { wrap: wrap, get: function () { return current; } };
    }

    function instrumentPicker(selectedKeys, customList) {
      var selected = (selectedKeys || []).slice();
      var custom = (customList || []).slice();
      var wrap = el('div', 'mhw-instruments');
      var head = el('div', 'mhw-instruments-head');
      head.append(el('span', 'mhw-tiles-label', t('mhMarketsTraded')), el('span', 'mhw-tiles-spacer'));
      var countEl = el('span', 'mhw-instrument-count');
      head.append(countEl);
      var grid = el('div', 'mhw-instrument-grid');
      var presetEls = MARKET_PRESETS.map(function (key) {
        var label = t('mhMarketsPreset_' + key);
        var pill = el('button', 'mhw-instrument-pill'); pill.type = 'button';
        pill.append(el('span', '', label));
        function sync() { pill.classList.toggle('is-selected', selected.indexOf(label) > -1); }
        pill.addEventListener('click', function () {
          var idx = selected.indexOf(label);
          if (idx > -1) selected.splice(idx, 1); else selected.push(label);
          sync(); syncCount();
        });
        sync();
        grid.append(pill);
        return { label: label, sync: sync };
      });
      function renderCustom() {
        grid.querySelectorAll('.mhw-instrument-pill.is-custom').forEach(function (n) { n.remove(); });
        custom.forEach(function (name) {
          var pill = el('div', 'mhw-instrument-pill is-custom is-selected');
          var text = el('span'); text.dir = 'auto'; text.textContent = name;
          var remove = el('button', 'mhw-instrument-remove'); remove.type = 'button'; remove.setAttribute('aria-label', t('mhAdd') + ' – ' + name); remove.append(ico('x'));
          remove.addEventListener('click', function () { custom = custom.filter(function (n2) { return n2 !== name; }); renderCustom(); syncCount(); icons(grid); });
          pill.append(text, remove);
          grid.append(pill);
        });
        icons(grid);
      }
      function syncCount() {
        var n = selected.length + custom.length;
        countEl.textContent = n ? t('mhInstrumentsSelectedCount', { n: n }) : t('mhInstrumentsHint');
      }
      renderCustom(); syncCount();
      var addRow = el('div', 'mhw-instrument-add-row');
      var input = el('input', 'mhw-instrument-input'); input.type = 'text'; input.dir = 'auto'; input.placeholder = t('mhMarketsPlaceholder');
      var addBtn = el('button', 'mhw-btn-add', t('mhAdd')); addBtn.type = 'button'; addBtn.prepend(ico('plus'));
      function addCustom() {
        var v = input.value.trim();
        if (v && custom.indexOf(v) === -1 && presetEls.every(function (p) { return p.label !== v; })) custom.push(v);
        input.value = '';
        renderCustom(); syncCount();
      }
      addBtn.addEventListener('click', addCustom);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
      addRow.append(input, addBtn);
      wrap.append(head, grid, addRow);
      return { wrap: wrap, get: function () { return { symbols: selected.slice(), custom: custom.slice() }; } };
    }

    function shareRange(initial) {
      var current = initial == null ? 20 : initial;
      var wrap = el('div', 'mhw-range-block');
      var head = el('div', 'mhw-range-head');
      var valueEl = el('span', 'mhw-range-value', current + '%');
      head.append(el('span', 'mhw-tiles-label', t('mhCapitalAllocation')), el('span', 'mhw-tiles-spacer'), valueEl);
      var input = el('input', 'mhw-range-input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(current);
      input.setAttribute('aria-label', t('mhCapitalAllocation'));
      var ends = el('div', 'mhw-range-ends'); ends.append(el('span', '', t('mhAllocationLow')), el('span', '', t('mhAllocationHigh')));
      var warning = el('div', 'mhw-range-warning'); warning.append(ico('shield-alert'), el('span', '', t('mhAllocationWarning')));
      function sync() {
        valueEl.textContent = current + '%';
        input.style.setProperty('--mhw-fill', current + '%');
        // Not the `hidden` attribute: .mhw-range-warning's unconditional `display:flex` rule
        // has equal specificity to the UA stylesheet's `[hidden]{display:none}` and, being an
        // author rule, wins the tie - `hidden` alone silently fails to hide it.
        warning.style.display = current < 60 ? 'none' : 'flex';
      }
      input.addEventListener('input', function () { current = Number(input.value); sync(); });
      sync();
      wrap.append(head, input, ends, warning);
      icons(wrap);
      return { wrap: wrap, get: function () { return current; } };
    }

    function marginCounter(initial) {
      var current = initial || 0;
      var wrap = el('div', 'mhw-margin-row');
      var text = el('div', 'mhw-margin-text'); text.append(el('strong', '', t('mhMarginCalls')));
      var pips = el('div', 'mhw-margin-pips');
      var pipEls = [];
      for (var i = 0; i < 6; i++) { var pip = el('span', 'mhw-pip'); pips.append(pip); pipEls.push(pip); }
      var counter = el('div', 'mhw-margin-counter');
      var minusBtn = el('button', 'mhw-margin-btn'); minusBtn.type = 'button'; minusBtn.setAttribute('aria-label', t('mhMarginCalls')); minusBtn.append(ico('minus'));
      var valueEl = el('span', 'mhw-margin-value', String(current));
      var plusBtn = el('button', 'mhw-margin-btn'); plusBtn.type = 'button'; plusBtn.setAttribute('aria-label', t('mhMarginCalls')); plusBtn.append(ico('plus'));
      counter.append(minusBtn, valueEl, plusBtn);
      var labelEl = el('span', 'mhw-margin-label');
      function sync() {
        valueEl.textContent = String(current);
        pipEls.forEach(function (pip, idx) { pip.classList.toggle('is-on', idx < Math.min(6, current)); });
        labelEl.textContent = current === 0 ? t('mhMarginNever') : (current === 1 ? t('mhMarginOnce') : t('mhMarginTimes', { n: current }));
      }
      minusBtn.addEventListener('click', function () { current = Math.max(0, current - 1); sync(); });
      plusBtn.addEventListener('click', function () { current = Math.min(99, current + 1); sync(); });
      sync();
      wrap.append(text, el('span', 'mhw-margin-spacer'), pips, counter, labelEl);
      return { wrap: wrap, get: function () { return current; } };
    }

    function familySummary(getters) {
      var wrap = el('div', 'mhw-family-row');
      var text = el('div', 'mhw-family-text'); text.append(el('strong', '', t('mhDisclosureTitle')), el('span', '', t('mhDisclosureHint')));
      var pips = el('div', 'mhw-family-pips');
      var pipEls = [];
      for (var i = 0; i < 4; i++) { var pip = el('span', 'mhw-family-pip'); pips.append(pip); pipEls.push(pip); }
      var countEl = el('span', 'mhw-family-count');
      var labelEl = el('span', 'mhw-family-label');
      function sync() {
        var n = getters.filter(function (g) { return g.get() === true; }).length;
        pipEls.forEach(function (pip, idx) { pip.classList.toggle('is-on', idx < n); });
        countEl.textContent = t('mhDisclosureCount', { n: n });
        labelEl.textContent = n === 0 ? t('mhDisclosureNone') : (n === 4 ? t('mhDisclosureFull') : t('mhDisclosurePartial'));
      }
      sync();
      wrap.append(text, el('span', 'mhw-family-spacer'), pips, countEl, labelEl);
      return { wrap: wrap, sync: sync };
    }

    function noteField(value) {
      var wrap = el('div', 'mhw-note');
      wrap.append(el('span', 'mhw-note-label', t('mhScenarioFreeText')));
      var textarea = el('textarea'); textarea.dir = 'auto'; textarea.rows = 3; textarea.value = value || ''; textarea.placeholder = t('mhScenarioFreeText');
      wrap.append(textarea);
      return { wrap: wrap, get: function () { return textarea.value.trim(); } };
    }

    // ---------------- step renderers ----------------
    function introPanel() {
      var panel = el('div', 'mhw-panel mhw-intro');
      var side = el('div', 'mhw-intro-side');
      var portrait = el('img', 'mhw-intro-portrait'); portrait.src = '../shared/navrya/assets/portraits/portrait-' + meta.navryaId + '.webp'; portrait.alt = '';
      var quote = el('div', 'mhw-intro-quote'); var quoteP = el('p'); quoteP.textContent = '“' + (meta.quotes[lang] || meta.quotes.en) + '”'; quote.append(quoteP);
      side.append(portrait, el('span', 'mhw-intro-char-title', meta.title), quote);
      var cards = el('div', 'mhw-intro-cards');
      [['clock', 'mhIntakeInfo1Label', 'mhIntakeInfo1Text'], ['eye-off', 'mhIntakeInfo2Label', 'mhIntakeInfo2Text'], ['pencil', 'mhIntakeInfo3Label', 'mhIntakeInfo3Text']].forEach(function (row) {
        var card = el('div', 'mhw-intro-card');
        var iconBox = el('div', 'mhw-intro-card-icon'); iconBox.append(ico(row[0]));
        var textBox = el('div', 'mhw-intro-card-text'); textBox.append(el('span', 'mhw-intro-card-label', t(row[1])), el('span', 'mhw-intro-card-body', t(row[2])));
        card.append(iconBox, textBox);
        cards.append(card);
      });
      panel.append(side, cards);
      return { el: panel, getters: {} };
    }

    function demographicsPanel(profile) {
      var panel = el('div', 'mhw-panel');
      var d = profile.intake.demographics;
      var gender = choiceTiles('mhGender', '', GENDERS, 'mhGender_', d.gender, '176px');
      var marital = choiceTiles('mhMaritalStatus', '', MARITAL_STATUSES, 'mhMaritalStatus_', d.maritalStatus, '176px');
      var occupation = choiceTiles('mhOccupation', '', OCCUPATION_TYPES, 'mhOccupationType_', d.primaryOccupation, '176px');
      var age = ageSlider(d.age);
      var fullTime = switchRow(t('mhFullTimeTrader'), d.isFullTimeTrader);
      panel.append(age.wrap, gender.wrap, marital.wrap, occupation.wrap, fullTime.wrap);
      return {
        el: panel, teardown: age.teardown,
        getters: { save: function (p) { p.intake.demographics = { age: age.get(), gender: gender.get() || null, maritalStatus: marital.get() || null, primaryOccupation: occupation.get() || null, isFullTimeTrader: fullTime.get() }; } }
      };
    }

    function financialPanel(profile) {
      var panel = el('div', 'mhw-panel');
      var f = profile.intake.financialContext;
      var type = choiceTiles('mhCapitalType', '', CAPITAL_TYPES, 'mhCapitalType_', f.capitalType, '240px');
      var share = shareRange(f.capitalAllocationPercent || 0);
      var borrowed = switchRow(t('mhBorrowedMoney'), f.borrowedMoneyForTrading);
      panel.append(type.wrap, share.wrap, borrowed.wrap);
      return { el: panel, getters: { save: function (p) { p.intake.financialContext = { capitalType: type.get() || null, capitalAllocationPercent: share.get(), borrowedMoneyForTrading: borrowed.get() }; } } };
    }

    function experiencePanel(profile) {
      var panel = el('div', 'mhw-panel');
      var h = profile.intake.tradingHistory;
      var years = yearsRungs(h.yearsTrading);
      // marketsTraded is stored as a flat string[] mixing preset labels and free text (same
      // shape the original historyView used) - split it back into "matches a current-language
      // preset label" vs "everything else" so returning presets show up selected, not as
      // removable custom chips.
      var presetLabels = MARKET_PRESETS.map(function (k) { return t('mhMarketsPreset_' + k); });
      var existingMarkets = h.marketsTraded || [];
      var selectedPresets = existingMarkets.filter(function (v) { return presetLabels.indexOf(v) > -1; });
      var customMarkets = existingMarkets.filter(function (v) { return presetLabels.indexOf(v) === -1; });
      var instruments = instrumentPicker(selectedPresets, customMarkets);
      panel.append(years.wrap, instruments.wrap);
      return { el: panel, getters: { save: function (p) { var picked = instruments.get(); p.intake.tradingHistory.yearsTrading = years.get(); p.intake.tradingHistory.marketsTraded = picked.symbols.concat(picked.custom); } } };
    }

    function extremesPanel(profile) {
      var panel = el('div', 'mhw-panel');
      var h = profile.intake.tradingHistory;
      var grid = el('div', 'mhw-extremes-grid');
      var winCard = el('div', 'mhw-extreme-card is-win');
      var winHead = el('div', 'mhw-extreme-card-head'); winHead.append(ico('trending-up'), el('span', '', t('mhLargestWinTitle')));
      var winFields = el('div', 'mhw-extreme-fields');
      var winAmt = el('div', 'mhw-field-mini'); var winAmtInput = el('input'); winAmtInput.inputMode = 'decimal'; winAmtInput.value = h.largestWin.amount == null ? '' : h.largestWin.amount; winAmtInput.placeholder = 'e.g. 4,200'; winAmt.append(el('span', '', t('mhAmountLabel')), winAmtInput);
      var winPct = el('div', 'mhw-field-mini'); var winPctInput = el('input'); winPctInput.inputMode = 'decimal'; winPctInput.value = h.largestWin.percent == null ? '' : h.largestWin.percent; winPctInput.placeholder = 'e.g. 18'; winPct.append(el('span', '', t('mhPercentLabel')), winPctInput);
      winFields.append(winAmt, winPct); winCard.append(winHead, winFields);
      var lossCard = el('div', 'mhw-extreme-card is-loss');
      var lossHead = el('div', 'mhw-extreme-card-head'); lossHead.append(ico('trending-down'), el('span', '', t('mhLargestLossTitle')));
      var lossFields = el('div', 'mhw-extreme-fields');
      var lossAmt = el('div', 'mhw-field-mini'); var lossAmtInput = el('input'); lossAmtInput.inputMode = 'decimal'; lossAmtInput.value = h.largestLoss.amount == null ? '' : h.largestLoss.amount; lossAmtInput.placeholder = 'e.g. 2,600'; lossAmt.append(el('span', '', t('mhAmountLabel')), lossAmtInput);
      var lossPct = el('div', 'mhw-field-mini'); var lossPctInput = el('input'); lossPctInput.inputMode = 'decimal'; lossPctInput.value = h.largestLoss.percent == null ? '' : h.largestLoss.percent; lossPctInput.placeholder = 'e.g. 11'; lossPct.append(el('span', '', t('mhPercentLabel')), lossPctInput);
      lossFields.append(lossAmt, lossPct); lossCard.append(lossHead, lossFields);
      grid.append(winCard, lossCard);
      var margin = marginCounter(h.marginCallOrZeroedCount);
      panel.append(grid, margin.wrap);
      icons(panel);
      return {
        el: panel, getters: {
          save: function (p) {
            p.intake.tradingHistory.largestWin = { amount: winAmtInput.value === '' ? null : Number(winAmtInput.value), percent: winPctInput.value === '' ? null : Number(winPctInput.value) };
            p.intake.tradingHistory.largestLoss = { amount: lossAmtInput.value === '' ? null : Number(lossAmtInput.value), percent: lossPctInput.value === '' ? null : Number(lossPctInput.value) };
            p.intake.tradingHistory.marginCallOrZeroedCount = margin.get();
          }
        }
      };
    }

    function motivationPanel(profile) {
      var panel = el('div', 'mhw-panel');
      var motivation = choiceTiles('mhMotivationQuestion', '', MOTIVATIONS, 'mhMotivation_', profile.intake.motivationForTrading, '240px');
      var reaction = choiceTiles('mhFirstLossQuestion', '', LOSS_REACTIONS, 'mhLossReaction_', profile.intake.firstBigLossReaction, '240px');
      panel.append(motivation.wrap, reaction.wrap);
      return { el: panel, getters: { save: function (p) { p.intake.motivationForTrading = motivation.get() || null; p.intake.firstBigLossReaction = reaction.get() || null; } } };
    }

    function transparencyPanel(profile) {
      var panel = el('div', 'mhw-panel');
      var m = profile.intake.transparencyMatrix;
      var s1 = switchRow(t('mhActivityKnown'), m.tradingActivityKnownToFamily);
      var s2 = switchRow(t('mhCapitalKnown'), m.capitalKnownToFamily);
      var s3 = switchRow(t('mhProfitKnown'), m.profitKnownToFamily);
      var s4 = switchRow(t('mhLossKnown'), m.lossKnownToFamily);
      var summary = familySummary([s1, s2, s3, s4]);
      [s1, s2, s3, s4].forEach(function (s) { s.onChange(function () { summary.sync(); }); });
      panel.append(s1.wrap, s2.wrap, s3.wrap, s4.wrap, summary.wrap);
      return { el: panel, getters: { save: function (p) { p.intake.transparencyMatrix = { tradingActivityKnownToFamily: s1.get(), capitalKnownToFamily: s2.get(), profitKnownToFamily: s3.get(), lossKnownToFamily: s4.get() }; } } };
    }

    function scenarioPanel(profile, scenario) {
      var panel = el('div', 'mhw-panel');
      var existing = profile.psychologicalProfile.scenarioAssessment.responses.find(function (r) { return r.scenarioId === scenario.id; });
      if (scenario.id === 'A_stop_loss') {
        var chart = el('div', 'mhw-candles');
        chart.append(el('span', 'mhw-candle-grid'));
        renderCandles(chart, layoutCandles(seededCandles(7, 26, -0.55, 2.6), 0.18));
        var entryLine = el('span', 'mhw-stop-entry-line'); entryLine.style.top = '26%';
        var entryLabel = el('span', 'mhw-stop-entry-label', 'Entry'); entryLabel.style.top = 'calc(26% - 20px)';
        var stopLine = el('span', 'mhw-stop-loss-line'); stopLine.style.top = '78%';
        var stopLabel = el('span', 'mhw-stop-loss-label', 'Stop · −3.0%'); stopLabel.style.top = 'calc(78% + 6px)';
        var badge = el('span', 'mhw-stop-badge'); badge.append(el('span', 'mhw-stop-badge-dot'), el('span', '', '−2.8%'));
        var foot = el('span', 'mhw-stop-foot', 'XAU/USD · M15');
        chart.append(entryLine, entryLabel, stopLine, stopLabel, badge, foot);
        panel.append(chart);
      } else if (scenario.id === 'B_revenge') {
        var row = el('div', 'mhw-streak-row');
        [['14:20', '−1.2 R', 'XAU/USD'], ['17:05', '−0.8 R', 'NAS 100'], ['20:40', '−1.5 R', 'BTC/USD']].forEach(function (item) {
          var card = el('div', 'mhw-streak-card is-loss');
          card.append(el('small', '', item[0]), el('strong', '', item[1]), el('span', '', item[2]));
          row.append(card);
        });
        var timeCard = el('div', 'mhw-streak-card is-time'); timeCard.append(ico('moon'), el('strong', '', '22:00'), el('small', '', 'New York · closing'));
        row.append(timeCard);
        panel.append(row);
      } else if (scenario.id === 'C_fomo') {
        var fomoRow = el('div', 'mhw-fomo-row');
        var info = el('div', 'mhw-fomo-info'); info.append(el('small', '', "A friend's position"), el('strong', '', 'SOL / USDT'), el('span', '', 'Entered Tuesday'));
        var barsWrap = el('div', 'mhw-fomo-bars');
        seededCandles(41, 14, 2.2, 1.4).forEach(function (c, i) { var bar = el('span', 'mhw-fomo-bar'); bar.style.height = Math.round(26 + i * 5.2) + '%'; barsWrap.append(bar); });
        var stat = el('div', 'mhw-fomo-stat'); stat.append(el('strong', '', '+40%'), el('span', '', '4 days'));
        fomoRow.append(info, barsWrap, stat);
        panel.append(fomoRow);
      } else if (scenario.id === 'D_patience') {
        var patience = el('div', 'mhw-candles is-short');
        patience.append(el('span', 'mhw-candle-grid'));
        renderCandles(patience, layoutCandles(seededCandles(23, 30, 0, 1.5), 0.55));
        var band = el('span', 'mhw-range-band');
        var rangeLabel = el('span', 'mhw-range-label', 'Range · 7 days · no setup');
        var rangeFoot = el('span', 'mhw-range-foot', 'EUR/USD · H1');
        patience.append(band, rangeLabel, rangeFoot);
        panel.append(patience);
      } else if (scenario.id === 'E_identity') {
        var monthRow = el('div', 'mhw-month-row');
        var monthGrid = el('div', 'mhw-month-grid');
        seededCandles(59, 28, -0.25, 3).forEach(function (c) {
          var d = c.c - c.o;
          var cell = el('span', 'mhw-month-cell ' + (d > 0.7 ? 'is-win' : d < -0.7 ? 'is-loss' : ''));
          monthGrid.append(cell);
        });
        var monthInfo = el('div', 'mhw-month-info'); monthInfo.append(el('small', '', 'July · closed'), el('strong', '', '−6.4%'), el('span', '', '18 trades · 6 green · 12 red'));
        monthRow.append(monthGrid, monthInfo);
        panel.append(monthRow);
      }
      // The scenario question's step head already shows the scenario body copy (see stepMeta());
      // this row only needs a "measures: construct" note above the actual answer tiles.
      var qWrap = el('div', 'mhw-tiles');
      var qHead = el('div', 'mhw-tiles-head'); qHead.append(el('span', 'mhw-tiles-label', t('mhMeasures') + ': ' + t('mhConstruct_' + scenario.measuresConstruct)));
      var qGrid = el('div', 'mhw-tile-grid');
      var currentChoice = existing ? existing.choice : '';
      var choiceEntries = scenario.choices.map(function (opt) {
        var key = opt[0], iconName = opt[1];
        var btn = el('button', 'mhw-tile'); btn.type = 'button'; btn.style.flexBasis = '240px';
        var iconEl = ico(iconName), labelEl = el('span', '', t('mhScenarioChoice_' + scenario.id + '_' + key));
        btn.append(iconEl, labelEl);
        function sync() { btn.classList.toggle('is-selected', currentChoice === key); }
        sync();
        btn.addEventListener('click', function () { currentChoice = currentChoice === key ? '' : key; choiceEntries.forEach(function (e) { e.sync(); }); });
        qGrid.append(btn);
        return { key: key, sync: sync };
      });
      qWrap.append(qHead, qGrid);
      panel.append(qWrap);

      var slider = null;
      if (scenario.slider) { slider = dialRow(t(scenario.heatQuestion), existing && existing.sliderValue != null ? existing.sliderValue : 5, t(scenario.sliderLeft), t(scenario.sliderRight)); panel.append(slider.wrap); }
      var note = null, safetyArea = null;
      if (scenario.hasFreeText) { note = noteField(existing ? existing.freeText : ''); safetyArea = el('div'); panel.append(note.wrap, safetyArea); }
      icons(panel);
      return {
        el: panel,
        getters: {
          save: function (p) {
            var proceed = function () { p.psychologicalProfile.scenarioAssessment.draftResponse = { choice: currentChoice, sliderValue: slider ? slider.get() : null, freeText: note ? note.get() : null }; };
            if (note && note.get()) guardedSubmit(note.get(), safetyArea, proceed); else proceed();
          },
          commit: function (p) { return store.commitDraftScenarioResponse(p, scenario.id, scenario.measuresConstruct); }
        }
      };
    }

    // ---------------- archetype (computed from stored scenario responses, never sent to the
    // server as a new field - purely a friendly read-out of data already saved) ----------------
    function responseChoice(profile, scenarioId) {
      var r = profile.psychologicalProfile.scenarioAssessment.responses.find(function (x) { return x.scenarioId === scenarioId; });
      return r ? r.choice : null;
    }
    function archetypeFor(profile) {
      var answered = profile.psychologicalProfile.scenarioAssessment.responses.length;
      if (answered < 3) return { title: t('mhArchetypePendingTitle'), body: t('mhArchetypePendingBody', { answered: answered }) };
      var score = 0;
      if (responseChoice(profile, 'A_stop_loss') === 'quick_reanalysis') score++;
      var sc2 = responseChoice(profile, 'B_revenge'); if (sc2 === 'journal' || sc2 === 'sleep') score++;
      if (responseChoice(profile, 'C_fomo') === 'disciplined_no_stop') score++;
      if (responseChoice(profile, 'D_patience') === 'wait') score++;
      if (responseChoice(profile, 'E_identity') === 'bad_month_review_system') score++;
      var table = [
        { title: t('mhArchetypeImpulseTitle'), body: t('mhArchetypeImpulseBody') },
        { title: t('mhArchetypeReactiveTitle'), body: t('mhArchetypeReactiveBody') },
        { title: t('mhArchetypeMeasuredTitle'), body: t('mhArchetypeMeasuredBody') },
        { title: t('mhArchetypeSteadyTitle'), body: t('mhArchetypeSteadyBody') },
        { title: t('mhArchetypePatientTitle'), body: t('mhArchetypePatientBody') },
        { title: t('mhArchetypePatientTitle'), body: t('mhArchetypePatientBody') }
      ];
      return table[score];
    }

    function summaryPanel(profile) {
      var panel = el('div', 'mhw-panel mhw-summary');
      var card = el('div', 'mhw-summary-card'); card.append(el('span', 'mhw-summary-texture'));
      var portrait = el('img', 'mhw-summary-portrait'); portrait.src = '../shared/navrya/assets/portraits/portrait-' + meta.navryaId + '.webp'; portrait.alt = '';
      var arche = archetypeFor(profile);
      var xpPoints = 15; // POINTS_BY_TYPE.intake_completed (server/community/xp-rules.mjs) - real, not decorative.
      var xpChip = el('div', 'mhw-xp-chip'); xpChip.append(ico('gift'), el('span', '', t('mhXpOnSeal', { points: xpPoints })));
      card.append(portrait, el('span', 'mhw-summary-readsas', t('mhReadsAs')), el('span', 'mhw-summary-archetype', arche.title), el('span', 'mhw-summary-note', arche.body), xpChip);

      var right = el('div', 'mhw-summary-right');
      var tiles = el('div', 'mhw-summary-tiles');
      var a = profile.intake, hist = a.tradingHistory, fam = a.transparencyMatrix;
      var famCount = [fam.tradingActivityKnownToFamily, fam.capitalKnownToFamily, fam.profitKnownToFamily, fam.lossKnownToFamily].filter(function (v) { return v === true; }).length;
      var rows = [
        [t('mhAge'), a.demographics.age != null ? String(a.demographics.age) : '—', 2],
        [t('mhMaritalStatus'), a.demographics.maritalStatus ? t('mhMaritalStatus_' + a.demographics.maritalStatus) : '—', 2],
        [t('mhOccupation'), a.demographics.primaryOccupation ? t('mhOccupationType_' + a.demographics.primaryOccupation) : '—', 2],
        [t('mhCapitalType'), a.financialContext.capitalType ? t('mhCapitalType_' + a.financialContext.capitalType) : '—', 3],
        [t('mhInTradingLabel'), (a.financialContext.capitalAllocationPercent || 0) + '%', 3],
        [t('mhYearsTrading'), hist.yearsTrading != null ? String(hist.yearsTrading) : '—', 4],
        [t('mhMarketsTraded'), (hist.marketsTraded || []).length ? t('mhInstrumentsSelectedCount', { n: hist.marketsTraded.length }) : '—', 4],
        [t('mhLargestWinTitle'), hist.largestWin.amount || hist.largestWin.percent ? [hist.largestWin.amount, hist.largestWin.percent ? hist.largestWin.percent + '%' : ''].filter(Boolean).join(' · ') : '—', 5],
        [t('mhLargestLossTitle'), hist.largestLoss.amount || hist.largestLoss.percent ? [hist.largestLoss.amount, hist.largestLoss.percent ? hist.largestLoss.percent + '%' : ''].filter(Boolean).join(' · ') : '—', 5],
        [t('mhMarginCalls'), hist.marginCallOrZeroedCount ? (hist.marginCallOrZeroedCount === 1 ? t('mhMarginOnce') : t('mhMarginTimes', { n: hist.marginCallOrZeroedCount })) : t('mhMarginNever'), 5],
        [t('mhFirstDrewYouLabel'), a.motivationForTrading ? t('mhMotivation_' + a.motivationForTrading) : '—', 6],
        [t('mhDisclosureTitle'), t('mhDisclosureCount', { n: famCount }), 7],
        [t('mhScenariosAnsweredLabel'), profile.psychologicalProfile.scenarioAssessment.responses.length + ' / ' + SCENARIOS.length, 8]
      ];
      rows.forEach(function (row) {
        var tile = el('div', 'mhw-summary-tile');
        var body = el('div', 'mhw-summary-tile-body'); body.append(el('small', '', row[0]), el('span', '', row[1]));
        var editBtn = el('button', 'mhw-summary-edit'); editBtn.type = 'button'; editBtn.setAttribute('aria-label', t('mhSave')); editBtn.append(ico('pencil'));
        editBtn.addEventListener('click', function () { goTo(row[2]); });
        tile.append(body, editBtn);
        tiles.append(tile);
      });
      var footnote = el('div', 'mhw-summary-footnote'); footnote.append(ico('pencil'), el('span', '', t('mhIntakeInfo3Text')));
      right.append(tiles, footnote);
      panel.append(card, right);
      icons(panel);
      return { el: panel, getters: {} };
    }

    function sealedPanel(profile) {
      var panel = el('div', 'mhw-sealed');
      var check = el('div', 'mhw-sealed-check'); check.append(ico('check'));
      var arche = archetypeFor(profile);
      var xp = el('div', 'mhw-sealed-xp'); xp.append(ico('gift'), el('span', '', t('mhXpBadge', { points: 15 })), el('span', 'mhw-sealed-divider'), el('span', '', t('mhPsychologyUnlocked')));
      panel.append(check, el('span', 'mhw-sealed-eyebrow', t('mhSealedTitle')), el('span', 'mhw-sealed-archetype', arche.title), el('span', 'mhw-sealed-note', arche.body), xp);
      icons(panel);
      return { el: panel, getters: {} };
    }

    var activePanel = null;
    function stepPanel(profile) {
      if (sealed) return sealedPanel(profile);
      if (step === 1) return introPanel();
      if (step === 2) return demographicsPanel(profile);
      if (step === 3) return financialPanel(profile);
      if (step === 4) return experiencePanel(profile);
      if (step === 5) return extremesPanel(profile);
      if (step === 6) return motivationPanel(profile);
      if (step === 7) return transparencyPanel(profile);
      if (step >= 8 && step <= 12) return scenarioPanel(profile, SCENARIOS[step - 8]);
      return summaryPanel(profile);
    }

    // Callers (goNext()) always run commitStep() immediately before this, so the current step's
    // fields are already persisted - this only needs to flip the completed flag on top of that.
    function finish() {
      var finished = store.load();
      finished.intake.completed = true;
      finished.intake.completedAt = store.now();
      finished.intake.filledVia = finished.intake.filledVia === 'chat' ? 'mixed' : 'form';
      store.save(finished);
      toast(t('mhIntakeSaved'), 'success');
      sealed = true;
      render();
      if (onFinish) onFinish();
    }

    function render() {
      var profile = store.load();
      if (activePanel && activePanel.teardown) activePanel.teardown();
      activePanel = stepPanel(profile);
      var stack = el('div', 'mhw-stack');
      if (!sealed) {
        var meta = stepMeta(step);
        var stepHead = el('div', 'mhw-step-head');
        stepHead.append(el('h3', 'mhw-step-title', meta.title));
        if (meta.hint) stepHead.append(el('p', 'mhw-step-hint', meta.hint));
        stack.append(stepHead);
      }
      stack.append(activePanel.el);
      body.replaceChildren(stack);
      body.scrollTop = 0;

      headStep.textContent = (step < 10 ? '0' + step : String(step)) + ' / ' + TOTAL_STEPS;
      var activeChapterIdx = CHAPTER_STEPS.findIndex(function (steps) { return steps.indexOf(step) > -1; });
      headChapter.textContent = sealed ? t('mhChapterSeal') : t(CHAPTER_KEYS[activeChapterIdx]);
      chapterEls.forEach(function (ch, idx) {
        ch.chip.classList.toggle('is-active', idx === activeChapterIdx && !sealed);
        ch.segs.forEach(function (seg, i) {
          var n = ch.steps[i];
          seg.classList.toggle('is-done', n < step || sealed);
          seg.classList.toggle('is-current', n === step && !sealed);
        });
      });
      chaptersRow.style.display = sealed ? 'none' : 'flex'; // same reason as the range warning above

      foot.replaceChildren();
      if (sealed) {
        var done = el('button', 'mhw-btn mhw-btn-primary'); done.type = 'button'; done.append(ico('check'), el('span', '', t('mhDone')));
        done.addEventListener('click', destroy);
        foot.append(el('span', 'mhw-foot-spacer'), el('span', 'mhw-foot-note', t('mhFootNoteSaved')), done);
      } else {
        if (step > 1 && step < TOTAL_STEPS) {
          var skip = el('button', 'mhw-btn mhw-btn-ghost'); skip.type = 'button'; skip.append(ico('chevron-right'), el('span', '', t('mhSkip')));
          skip.addEventListener('click', goNext);
          foot.append(skip);
        }
        foot.append(el('span', 'mhw-foot-spacer'));
        foot.append(el('span', 'mhw-foot-note', step === TOTAL_STEPS ? t('mhFootNoteSealing', { points: 15 }) : t('mhFootNoteOptional')));
        if (step > 1) {
          var prev = el('button', 'mhw-btn mhw-btn-secondary'); prev.type = 'button'; prev.append(ico('arrow-left'), el('span', '', t('mhPrevious')));
          prev.addEventListener('click', goPrev);
          foot.append(prev);
        }
        var nextLabel = step === 1 ? t('mhBeginIntake') : (step === TOTAL_STEPS ? t('mhSealProfile') : (step === TOTAL_STEPS - 1 ? t('mhReview') : t('mhNext')));
        var next = el('button', 'mhw-btn mhw-btn-primary'); next.type = 'button';
        var nextSpan = el('span', '', nextLabel); next.append(nextSpan, ico(step === TOTAL_STEPS ? 'check' : 'arrow-right'));
        next.addEventListener('click', goNext);
        foot.append(next);
      }
      icons(modal);
    }

    // Persists the currently visible step's fields into the store. Called by goNext()/goPrev()
    // (both defined above, ahead of this - function declarations hoist, so the forward
    // reference is fine) before they actually move the step.
    function commitStep() {
      var live = store.load();
      var current = activePanel;
      if (!current || !current.getters || !current.getters.save) return;
      current.getters.save(live);
      live = store.save(live);
      if (step >= 8 && step <= 12 && current.getters.commit) current.getters.commit(live);
    }

    document.body.append(backdrop);
    render();
    return backdrop;
  }

  window.TradeJournalMentalHealthIntake = { open: openIntake };
}());
