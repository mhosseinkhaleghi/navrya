(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  if (!i18n) return;

  var patterns = [
    { category: 'self_harm', regex: /kill myself|suicid|end my life|don'?t want to live|hurt myself|self.?harm/i },
    { category: 'self_harm', regex: /خودکشی|به زندگیم پایان|دیگه نمی‌خوام زندگی کنم|به خودم آسیب/ },
    { category: 'self_harm', regex: /الانتحار|أنهي حياتي|أؤذي نفسي/ },
    { category: 'self_harm', regex: /suicid|quiero acabar con todo|hacerme daño|no quiero vivir/i },
    { category: 'hopelessness', regex: /i can'?t cope|hopeless|no point anymore|give up on everything|can'?t take it anymore/i },
    { category: 'hopelessness', regex: /دیگه نمی‌تونم تحمل کنم|امیدی نیست|همه چیز بی‌فایده|دیگه نمی‌کشم/ },
    { category: 'hopelessness', regex: /لا أستطيع التحمل|لا فائدة|فقدت الأمل|لم أعد أحتمل/ },
    { category: 'hopelessness', regex: /no puedo más|no tiene sentido|he perdido la esperanza/i },
    { category: 'financial_catastrophe', regex: /lost everything|can'?t pay (my )?rent|bankrupt|ruined my family|lost it all/i },
    { category: 'financial_catastrophe', regex: /همه چیزم رو از دست دادم|نمی‌تونم اجاره رو بدم|خانواده‌ام رو نابود کردم|ورشکست شدم/ },
    { category: 'financial_catastrophe', regex: /خسرت كل شيء|لا أستطيع دفع الإيجار|دمرت عائلتي|أفلست/ },
    { category: 'financial_catastrophe', regex: /lo perdí todo|no puedo pagar el alquiler|arruiné a mi familia|estoy en quiebra/i }
  ];

  // Centralized here (rather than in every chat/thought-record/intake call site) so a flagged input
  // always leaves a real, queryable trace in the profile's red flags, backing Section 0's mandatory
  // professional-referral rule with actual data instead of a one-off UI card nobody can look back at.
  function recordRedFlag(category, text) {
    var mhStore = window.TradeJournalMentalHealthStore;
    if (!mhStore) return;
    try { mhStore.addRedFlag(mhStore.load(), 'pervasive_distress_signs', category + ':' + String(text).slice(0, 60)); } catch (_) {}
  }

  function checkText(text) {
    var value = String(text || '');
    if (!value.trim()) return { flagged: false, matchedCategory: null };
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].regex.test(value)) {
        recordRedFlag(patterns[i].category, value);
        return { flagged: true, matchedCategory: patterns[i].category };
      }
    }
    return { flagged: false, matchedCategory: null };
  }

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }

  function renderSafetyCard(onDismiss) {
    var card = el('div', 'mh-safety-card');
    card.setAttribute('role', 'status');
    card.append(el('strong', '', i18n.t('mhSafetyTitle')), el('p', '', i18n.t('mhSafetyBody')));
    var close = el('button', 'mh-safety-dismiss', i18n.t('mhSafetyContinue'));
    close.type = 'button';
    close.onclick = function () { card.remove(); if (onDismiss) onDismiss(); };
    card.append(close);
    return card;
  }

  window.TradeJournalMentalHealthSafety = { checkText: checkText, renderSafetyCard: renderSafetyCard };
}());
