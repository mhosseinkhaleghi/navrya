(function () {
  'use strict';
  var i18n = window.TradeJournalMentalHealthI18n;
  var store = window.TradeJournalMentalHealthStore;
  var safety = window.TradeJournalMentalHealthSafety;
  if (!i18n || !store) return;

  // Slice R1 (request ownership/cancellation), audit finding C9: this real 60s timeout controller
  // had no way for a caller to compose in its own "the conversation moved on" signal - an
  // externalSignal (optional; every existing caller before this pass never passed one, and keeps
  // this function's exact prior behavior) is composed alongside it via a plain listener, not
  // AbortSignal.any() - this file runs as a classic browser <script>, and a manual listener needs
  // no baseline beyond AbortController itself, already required for the pre-existing 60s timeout.
  // Either source can end the same real fetch, whichever fires first; the 60s ceiling is never
  // shortened or removed.
  function request(path, payload, externalSignal) {
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 60000);
    var onExternalAbort = function () { controller.abort(); };
    if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort);
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal })
      .then(function (response) {
        if (!response.ok) return response.json().catch(function () { return {}; }).then(function (body) { throw new Error(body.error || 'AI_REQUEST_FAILED'); });
        return response.json();
      })
      .finally(function () {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      });
  }

  function suggestion(path, value, section, mode) { return { id: store.uid('mh-proposal'), path: path, section: section, value: value, mode: mode || 'append', status: 'pending', createdAt: new Date().toISOString() }; }

  function context(profile) {
    return {
      baselineCompleted: profile.baseline.completed,
      baselineSummary: { stress: profile.baseline.initialStressLevel, regulation: profile.baseline.initialEmotionalRegulation, experienceYears: profile.baseline.tradingExperienceYears, weaknesses: profile.baseline.selfReportedWeaknesses },
      activeBiases: profile.cognitiveProfile.identifiedBiases.map(function (b) { return { type: b.type, phase: b.cyclePhase, status: b.status }; }),
      recentTriggers: profile.triggerProfile.triggers.slice(-5).map(function (t) { return { description: t.description, type: t.triggerType }; }),
      draftThoughtRecord: profile.cognitiveProfile.draftThoughtRecord,
      draftTrigger: profile.triggerProfile.draftTrigger
    };
  }

  function localReply(count) {
    var lang = i18n.language();
    if (lang === 'fa') return count ? i18n.number(count) + ' پیشنهاد آماده شد؛ هیچ‌کدام بدون تأیید تو اعمال نمی‌شود.' : 'این را یادداشت کردم. هوش مصنوعی هم‌اکنون در دسترس نیست.';
    if (lang === 'ar') return count ? i18n.number(count) + ' اقتراحات جاهزة؛ لن يُطبّق أي منها دون موافقتك.' : 'تم تسجيل ذلك. الذكاء الاصطناعي غير متاح حالياً.';
    if (lang === 'es') return count ? i18n.number(count) + ' sugerencias listas; ninguna se aplicará sin tu aprobación.' : 'Anotado. La IA no está disponible ahora mismo.';
    return count ? i18n.number(count) + ' suggestions are ready for your review; none apply without your approval.' : 'Noted. AI is unavailable right now.';
  }

  // The offline fallback deliberately makes no field guesses here (unlike strategy-education's regex
  // extractor) - misreading an emotional statement is both more likely and more consequential in this
  // feature, so when the AI is unreachable the chat still replies, just without proposing any changes.
  function localSuggestions() { return []; }

  async function chat(profile, message, externalSignal) {
    if (safety) {
      var check = safety.checkText(message);
      if (check.flagged) return { flagged: true, reply: '', suggestions: [], provider: 'safety-gate', local: false };
    }
    var payload = { language: i18n.language(), message: message, chatHistory: (profile.chatHistory || []).slice(-24).map(function (m) { return { role: m.role, content: m.content }; }), context: context(profile) };
    try {
      var result = await request('/api/mental-health/chat', payload, externalSignal);
      return {
        flagged: !!result.distressFlag, reply: String(result.reply || ''),
        suggestions: (result.suggestions || []).map(function (s) { return suggestion(s.path, s.value, s.section, s.mode); }),
        provider: result.provider || 'openai', local: false, usage: result.usage || null
      };
    } catch (error) {
      var suggestions = localSuggestions(profile, message);
      return { flagged: false, reply: localReply(suggestions.length), suggestions: suggestions, provider: 'local-fallback', local: true, error: error, usage: null };
    }
  }

  function localEducationCard(biasType, evidence) {
    var lang = i18n.language(), label = i18n.t('mhBias_' + biasType);
    var body = {
      fa: { explanation: label + ' یک الگوی رفتاری قابل مشاهده در معاملات است، نه یک بیماری. هدف این کارت فقط افزایش آگاهی است.', why: 'این الگو در ' + i18n.number(evidence.frequency) + ' مورد از معاملات اخیر تو دیده شده است.', steps: ['قبل از معامله بعدی یک نفس عمیق بکش.', 'یادداشت کن چه چیزی این لحظه را تحریک کرد.', 'در صورت تمایل یک ثبت فکر بنویس.'] },
      ar: { explanation: label + ' نمط سلوكي يمكن ملاحظته في التداول، وليس مرضاً. هذه البطاقة فقط لزيادة الوعي.', why: 'ظهر هذا النمط في ' + i18n.number(evidence.frequency) + ' من صفقاتك الأخيرة.', steps: ['خذ نفساً عميقاً قبل الصفقة التالية.', 'سجل ما الذي أثار هذه اللحظة.', 'اكتب تسجيل فكرة إذا رغبت.'] },
      es: { explanation: label + ' es un patrón de comportamiento observable en tus operaciones, no una condición médica. Esta tarjeta solo busca aumentar la conciencia.', why: 'Este patrón apareció en ' + i18n.number(evidence.frequency) + ' de tus operaciones recientes.', steps: ['Respira hondo antes de la próxima operación.', 'Anota qué desencadenó este momento.', 'Escribe un registro de pensamiento si quieres.'] },
      en: { explanation: label + ' is an observable behavioral pattern in your trading, not a medical condition. This card exists only to build awareness.', why: 'This pattern showed up in ' + i18n.number(evidence.frequency) + ' of your recent trades.', steps: ['Take one slow breath before the next trade.', 'Note what triggered this moment.', 'Write a thought record if you want to.'] }
    };
    var copy = body[lang] || body.en;
    return { title: label, explanation: copy.explanation, whyItMattersForYou: copy.why, practicalSteps: copy.steps, imagePrompt: '' };
  }

  async function educationCard(biasType, evidence) {
    var payload = { language: i18n.language(), biasType: biasType, evidence: evidence };
    try {
      var result = await request('/api/mental-health/education-card', payload);
      return { title: result.title, explanation: result.explanation, whyItMattersForYou: result.whyItMattersForYou, practicalSteps: result.practicalSteps || [], imagePrompt: result.imagePrompt || '', provider: result.provider || 'openai', local: false, usage: result.usage || null };
    } catch (error) {
      return Object.assign(localEducationCard(biasType, evidence), { provider: 'local-fallback', local: true, error: error, usage: null });
    }
  }

  window.TradeJournalMentalHealthAI = { chat: chat, educationCard: educationCard, suggestion: suggestion };
}());
