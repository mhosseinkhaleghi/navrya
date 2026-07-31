(function () {
  'use strict';

  var store = window.TradeJournalPatternStore;
  var i18n = window.TradeJournalPatternI18n;
  var config = window.TradeJournalPatternAIConfig || {};
  var baseUrl = String(config.baseUrl || '').replace(/\/$/, '');

  var local = {
    fa: {
      stages: ['حرکت اولیه و ایجاد جهت غالب', 'توقف حرکت و شکل‌گیری محدودهٔ تجمع', 'جمع‌آوری نقدینگی یا حرکت فریب', 'تأیید بازگشت به جهت اصلی', 'ادامهٔ حرکت پس از تکمیل ساختار'],
      reply: 'بر اساس توضیحات و مراحل فعلی، ترتیب الگو باید از حرکت اولیه شروع شود، سپس ساختار تجمع و حرکت فریب بررسی شود و در پایان بازگشت به جهت اصلی تأیید گردد. اصلاح شما را می‌توان در تعریف مراحل اعمال کرد.'
    },
    ar: {
      stages: ['الحركة الأولى وتحديد الاتجاه الغالب', 'توقف الحركة وتشكّل نطاق التجميع', 'جمع السيولة أو الحركة الخادعة', 'تأكيد العودة إلى الاتجاه الأصلي', 'استمرار الحركة بعد اكتمال البنية'],
      reply: 'وفقاً للوصف والمراحل الحالية، يبدأ النمط بالحركة الأولى ثم التجميع والحركة الخادعة، وبعدها يجب تأكيد العودة إلى الاتجاه الأصلي. يمكن تطبيق تصحيحك على تعريف المراحل.'
    },
    en: {
      stages: ['Initial move establishes the dominant direction', 'Price pauses and builds an accumulation range', 'Liquidity is collected through a test or false move', 'Price confirms a return to the original direction', 'The move continues after the structure is complete'],
      reply: 'Based on the current description and stages, the pattern should begin with the initial move, develop through accumulation and a liquidity test, then confirm a return to the dominant direction. Your correction can be applied to the stage definition.'
    },
    es: {
      stages: ['El movimiento inicial establece la dirección dominante', 'El precio se detiene y forma una zona de acumulación', 'La liquidez se recoge con una prueba o movimiento falso', 'El precio confirma el regreso a la dirección original', 'El movimiento continúa tras completar la estructura'],
      reply: 'Según la descripción y las etapas actuales, el patrón comienza con el movimiento inicial, pasa por acumulación y una prueba de liquidez, y confirma el regreso a la dirección dominante. Tu corrección puede aplicarse a las etapas.'
    }
  };

  function request(path, payload) {
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 45000);
    return fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then(function (response) {
      if (!response.ok) return response.json().catch(function () { return {}; }).then(function (body) { throw new Error(body.error || 'AI_REQUEST_FAILED'); });
      return response.json();
    }).finally(function () { window.clearTimeout(timeout); });
  }

  function stageObjects(values) {
    return (values || []).map(function (item, index) {
      var text = typeof item === 'string' ? item : (item.text || item.label || '');
      return { id: store.createStage('', index + 1).id, order: index + 1, text: text };
    }).filter(function (item) { return item.text.trim(); });
  }

  async function context(pattern) {
    return {
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      completionThreshold: pattern.completionThreshold,
      stages: pattern.stages.map(function (item) { return { order: item.order, text: item.text }; }),
      images: await store.imageDataUrls(pattern, 6),
      language: i18n.language()
    };
  }

  async function generateStages(pattern) {
    var payload = await context(pattern);
    try {
      var result = await request('/api/patterns/generate-stages', payload);
      return { stages: stageObjects(result.stages), provider: result.provider || 'openai', local: false };
    } catch (error) {
      var fallback = local[i18n.language()] || local.en;
      var existing = pattern.stages.filter(function (item) { return item.text.trim(); }).map(function (item) { return item.text; });
      return { stages: stageObjects(existing.length ? existing : fallback.stages), provider: 'local-fallback', local: true, error: error };
    }
  }

  async function chat(pattern, message) {
    var payload = await context(pattern);
    payload.message = message;
    payload.chatHistory = (pattern.chatHistory || []).slice(-20).map(function (item) { return { role: item.role, content: item.content }; });
    try {
      var result = await request('/api/patterns/chat', payload);
      return { reply: result.reply, suggestedStages: stageObjects(result.suggestedStages || []), provider: result.provider || 'openai', local: false };
    } catch (error) {
      var fallback = local[i18n.language()] || local.en;
      var asksForStages = /مرحله|مراحل|stage|stages|مرحلة|مراحل|etapa|etapas|ترتیب|order/i.test(message);
      return { reply: fallback.reply, suggestedStages: asksForStages ? stageObjects(pattern.stages.length ? pattern.stages : fallback.stages) : [], provider: 'local-fallback', local: true, error: error };
    }
  }

  window.TradeJournalPatternAI = { generateStages: generateStages, chat: chat };
}());
