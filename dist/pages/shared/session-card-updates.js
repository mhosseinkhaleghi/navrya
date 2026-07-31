(function () {
  const expandedScenarios = Object.create(null);
  const entryUi = Object.create(null);
  const patternCatalog = [
    { id: 'utad-wyckoff', name: 'UTAD WYCKOFF', positionThreshold: 70, stages: [
      { id: 'utad-1', index: 1, label: 'حرکت اسپایک قوی' },
      { id: 'utad-2', index: 2, label: 'حرکت تجمعی و خلاف جهت' },
      { id: 'utad-3', index: 3, label: 'رسیدن به نقطه شروع حرکت اسپایکی' },
      { id: 'utad-4', index: 4, label: 'توزیع در جهت روند اسپایک اولیه' }
    ] },
    { id: 'acc-higher-timeframe', name: 'ACC روند تایم بزرگ', positionThreshold: 70, stages: [
      { id: 'acc-1', index: 1, label: 'حرکت اسپایکی' },
      { id: 'acc-2', index: 2, label: 'ایجاد یک کف یا سقف جدید' },
      { id: 'acc-3', index: 3, label: 'ACC / Consolidation اولیه' },
      { id: 'acc-4', index: 4, label: 'ACC / Consolidation میانی' },
      { id: 'acc-5', index: 5, label: 'ACC / Consolidation نهایی' },
      { id: 'acc-6', index: 6, label: 'خروج قوی و تأیید ساختار' }
    ] },
    { id: 'breakout-retest', name: 'Breakout / Retest', positionThreshold: 70, stages: [
      { id: 'br-1', index: 1, label: 'شکست سطح' },
      { id: 'br-2', index: 2, label: 'بازگشت به سطح' },
      { id: 'br-3', index: 3, label: 'تأیید جهت' }
    ] }
  ];
  const markets = {
    London: { zone: 'Europe/London', icon: '◎' },
    NewYork: { zone: 'America/New_York', icon: '◈' },
    Sydney: { zone: 'Australia/Sydney', icon: '◒' },
    Tokyo: { zone: 'Asia/Tokyo', icon: '◉' }
  };
  const copy = {
    fa: {
      chart: 'چارت', movement: 'حرکت', fate: 'سرنوشت سشن', ai: 'تحلیل AI', raw: 'چارت خام', annotated: 'تحلیل AI', zoom: 'بزرگ‌نمایی', note: 'یادداشت', notePlaceholder: 'یادداشت اختیاری برای این چارت...', marketTime: 'سشن', tehran: 'تهران', related: 'سناریوهای مرتبط', addScenario: 'افزودن سناریو', aiTitle: 'تحلیل هوش مصنوعی این ورودی', view: 'مشاهده', close: 'بستن', matchedPatterns: 'الگوهای منطبق', assessments: 'ارزیابی سناریوهای قبلی', suggestions: 'سناریوهای پیشنهادی', valid: 'معتبر', violated: 'نقض شده', noDescription: 'بدون شرح', complete: 'تکمیل', pattern: 'الگو', occurred: 'اتفاق افتاد', laterRefs: 'ارجاع بعدی', title: 'عنوان', description: 'شرح سناریو', evidence: 'شواهد سناریو', patternTag: 'تگ الگو', noPattern: 'بدون الگو', patternStages: 'مراحل الگو', patternCompletion: 'درصد تکمیل الگو', protocolOpen: 'پروتکل پوزیشن باز شد', protocolLocked: 'پروتکل پوزیشن قفل است', protocolNeed: '۷۰٪ تکمیل الگو لازم است', invalidation: 'بی‌اعتباری سناریو', invalidationPlaceholder: 'دلایل را با کاما جدا کنید', invalidationNote: 'یادداشت اختیاری در مورد ابطال...', problem: 'مشکل سناریو', trigger: 'تریگر سناریو', probability: 'درصد احتمال', history: 'تاریخچه احتمال', invalidated: 'دلیل ابطال تأیید شده', execution: 'نقشه اجرا', actionPlan: 'اکشن پلن', actionPlaceholder: 'نحوه اجرای پوزیشن...', positionType: 'نوع پوزیشن', long: 'خرید (لانگ)', short: 'فروش (شورت)', entries: 'قیمت ورود (با کاما جدا کنید)', stop: 'حد ضرر', target: 'حد سود', optional: 'اختیاری', occurredAction: 'این سناریو اتفاق افتاد', autoFill: 'پر کردن خودکار از متن', autoFillPlaceholder: 'متن را اینجا پیست کنید تا فیلدها خودکار پر شوند', parse: 'تجزیه و پر کردن خودکار', parsing: 'در حال تجزیه...', deleteConfirm: 'این سناریو حذف شود؟', entryDeleteConfirm: 'این ورودی تایم‌لاین حذف شود؟', invalidationTitle: 'انتخاب دلیل بی‌اعتباری', invalidationBody: 'احتمال این سناریو به صفر رسیده است. دلیل‌های بی‌اعتباری را مشخص کنید.', confirmInvalidation: 'تأیید دلیل ابطال', cancel: 'انصراف', newScenario: 'افزودن سناریو', save: 'ذخیره سناریو', scenarioTitle: 'سناریو جدید', carried: 'منتقل‌شده از', aiDemo: 'تحلیل محلی: ساختار چارت با سناریوهای فعال مقایسه شد. پیش از ورود، تریگر، سطح ابطال و تکمیل الگو را بررسی کنید.', suggested: 'سناریوی ادامه حرکت', localProvider: 'تحلیل محلی نمایشی', noImage: 'تصویری برای این ورودی ثبت نشده است'
    },
    ar: {
      chart: 'الرسم البياني', movement: 'الحركة', fate: 'مصير الجلسة', ai: 'تحليل AI', raw: 'الرسم الخام', annotated: 'تحليل AI', zoom: 'تكبير', note: 'ملاحظة', notePlaceholder: 'ملاحظة اختيارية لهذا الرسم...', marketTime: 'الجلسة', tehran: 'طهران', related: 'السيناريوهات المرتبطة', addScenario: 'إضافة سيناريو', aiTitle: 'تحليل الذكاء الاصطناعي لهذا الإدخال', view: 'عرض', close: 'إغلاق', matchedPatterns: 'الأنماط المتطابقة', assessments: 'تقييم السيناريوهات السابقة', suggestions: 'سيناريوهات مقترحة', valid: 'صالح', violated: 'منقوض', noDescription: 'بدون وصف', complete: 'مكتمل', pattern: 'النمط', occurred: 'حدث', laterRefs: 'مراجع لاحقة', title: 'العنوان', description: 'وصف السيناريو', evidence: 'أدلة السيناريو', patternTag: 'وسم النمط', noPattern: 'بدون نمط', patternStages: 'مراحل النمط', patternCompletion: 'اكتمال النمط', protocolOpen: 'بروتوكول الصفقة مفتوح', protocolLocked: 'بروتوكول الصفقة مقفل', protocolNeed: 'يلزم اكتمال 70٪', invalidation: 'إبطال السيناريو', invalidationPlaceholder: 'افصل الأسباب بفواصل', invalidationNote: 'ملاحظة اختيارية عن الإبطال...', problem: 'مشكلة السيناريو', trigger: 'محفز السيناريو', probability: 'نسبة الاحتمال', history: 'سجل الاحتمال', invalidated: 'تم تأكيد سبب الإبطال', execution: 'خطة التنفيذ', actionPlan: 'خطة العمل', actionPlaceholder: 'كيفية تنفيذ الصفقة...', positionType: 'نوع الصفقة', long: 'شراء (Long)', short: 'بيع (Short)', entries: 'أسعار الدخول', stop: 'وقف الخسارة', target: 'هدف الربح', optional: 'اختياري', occurredAction: 'هذا السيناريو حدث', autoFill: 'الملء التلقائي من النص', autoFillPlaceholder: 'الصق النص هنا لملء الحقول تلقائياً', parse: 'تحليل وملء تلقائي', parsing: 'جارٍ التحليل...', deleteConfirm: 'حذف هذا السيناريو؟', entryDeleteConfirm: 'حذف إدخال الخط الزمني؟', invalidationTitle: 'اختيار سبب الإبطال', invalidationBody: 'وصل احتمال هذا السيناريو إلى صفر. حدد أسباب الإبطال.', confirmInvalidation: 'تأكيد الإبطال', cancel: 'إلغاء', newScenario: 'إضافة سيناريو', save: 'حفظ السيناريو', scenarioTitle: 'سيناريو جديد', carried: 'منقول من', aiDemo: 'تحليل محلي: تمت مقارنة بنية الرسم بالسيناريوهات النشطة. تحقق من المحفز والإبطال واكتمال النمط قبل الدخول.', suggested: 'سيناريو استمرار الحركة', localProvider: 'تحليل محلي تجريبي', noImage: 'لا توجد صورة لهذا الإدخال'
    },
    en: {
      chart: 'Chart', movement: 'Movement', fate: 'Session fate', ai: 'AI analysis', raw: 'Raw chart', annotated: 'AI analysis', zoom: 'Zoom', note: 'Note', notePlaceholder: 'Optional note for this chart...', marketTime: 'Session', tehran: 'Tehran', related: 'Related scenarios', addScenario: 'Add scenario', aiTitle: 'AI analysis for this entry', view: 'View', close: 'Close', matchedPatterns: 'Matched patterns', assessments: 'Previous scenario assessments', suggestions: 'Suggested scenarios', valid: 'Valid', violated: 'Violated', noDescription: 'No description', complete: 'Complete', pattern: 'Pattern', occurred: 'Occurred', laterRefs: 'later references', title: 'Title', description: 'Scenario description', evidence: 'Scenario evidence', patternTag: 'Pattern tag', noPattern: 'No pattern', patternStages: 'Pattern stages', patternCompletion: 'Pattern completion', protocolOpen: 'Position protocol unlocked', protocolLocked: 'Position protocol locked', protocolNeed: '70% pattern completion required', invalidation: 'Scenario invalidation', invalidationPlaceholder: 'Separate reasons with commas', invalidationNote: 'Optional invalidation note...', problem: 'Scenario weakness', trigger: 'Scenario trigger', probability: 'Probability', history: 'Probability history', invalidated: 'Invalidation reason confirmed', execution: 'Execution plan', actionPlan: 'Action plan', actionPlaceholder: 'How the position should be executed...', positionType: 'Position type', long: 'Buy (Long)', short: 'Sell (Short)', entries: 'Entry prices (comma separated)', stop: 'Stop loss', target: 'Take profit', optional: 'Optional', occurredAction: 'This scenario occurred', autoFill: 'Auto-fill from text', autoFillPlaceholder: 'Paste text here to fill the fields automatically', parse: 'Parse and auto-fill', parsing: 'Parsing...', deleteConfirm: 'Delete this scenario?', entryDeleteConfirm: 'Delete this timeline entry?', invalidationTitle: 'Choose invalidation reason', invalidationBody: 'This scenario probability reached zero. Confirm its invalidation reasons.', confirmInvalidation: 'Confirm invalidation', cancel: 'Cancel', newScenario: 'Add scenario', save: 'Save scenario', scenarioTitle: 'New scenario', carried: 'Carried from', aiDemo: 'Local analysis: the chart structure was compared with active scenarios. Verify the trigger, invalidation and pattern completion before entry.', suggested: 'Continuation scenario', localProvider: 'Local demo analysis', noImage: 'No image is attached to this entry'
    },
    es: {
      chart: 'Gráfico', movement: 'Movimiento', fate: 'Destino de la sesión', ai: 'Análisis IA', raw: 'Gráfico original', annotated: 'Análisis IA', zoom: 'Ampliar', note: 'Nota', notePlaceholder: 'Nota opcional para este gráfico...', marketTime: 'Sesión', tehran: 'Teherán', related: 'Escenarios relacionados', addScenario: 'Añadir escenario', aiTitle: 'Análisis de IA de esta entrada', view: 'Ver', close: 'Cerrar', matchedPatterns: 'Patrones coincidentes', assessments: 'Evaluación de escenarios previos', suggestions: 'Escenarios sugeridos', valid: 'Válido', violated: 'Invalidado', noDescription: 'Sin descripción', complete: 'Completo', pattern: 'Patrón', occurred: 'Ocurrió', laterRefs: 'referencias posteriores', title: 'Título', description: 'Descripción del escenario', evidence: 'Evidencias', patternTag: 'Etiqueta de patrón', noPattern: 'Sin patrón', patternStages: 'Etapas del patrón', patternCompletion: 'Progreso del patrón', protocolOpen: 'Protocolo de posición abierto', protocolLocked: 'Protocolo de posición bloqueado', protocolNeed: 'Se requiere 70% del patrón', invalidation: 'Invalidación del escenario', invalidationPlaceholder: 'Separa las razones con comas', invalidationNote: 'Nota opcional de invalidación...', problem: 'Debilidad del escenario', trigger: 'Activador del escenario', probability: 'Probabilidad', history: 'Historial de probabilidad', invalidated: 'Razón de invalidación confirmada', execution: 'Plan de ejecución', actionPlan: 'Plan de acción', actionPlaceholder: 'Cómo ejecutar la posición...', positionType: 'Tipo de posición', long: 'Compra (Long)', short: 'Venta (Short)', entries: 'Precios de entrada', stop: 'Stop loss', target: 'Take profit', optional: 'Opcional', occurredAction: 'Este escenario ocurrió', autoFill: 'Autocompletar desde texto', autoFillPlaceholder: 'Pega texto aquí para completar los campos', parse: 'Analizar y autocompletar', parsing: 'Analizando...', deleteConfirm: '¿Eliminar este escenario?', entryDeleteConfirm: '¿Eliminar esta entrada?', invalidationTitle: 'Elegir razón de invalidación', invalidationBody: 'La probabilidad llegó a cero. Confirma las razones de invalidación.', confirmInvalidation: 'Confirmar invalidación', cancel: 'Cancelar', newScenario: 'Añadir escenario', save: 'Guardar escenario', scenarioTitle: 'Nuevo escenario', carried: 'Transferido desde', aiDemo: 'Análisis local: la estructura se comparó con los escenarios activos. Verifica el activador, la invalidación y el patrón antes de entrar.', suggested: 'Escenario de continuación', localProvider: 'Análisis local de demostración', noImage: 'No hay imagen adjunta a esta entrada'
    }
  };

  function language() {
    const value = (document.documentElement.lang || 'fa').toLowerCase();
    return copy[value] ? value : (value.indexOf('ar') === 0 ? 'ar' : value.indexOf('es') === 0 ? 'es' : value.indexOf('fa') === 0 ? 'fa' : 'en');
  }
  function tr(key) { return copy[language()][key] || copy.en[key] || key; }
  function el(tag, cls, value) { const node = document.createElement(tag); if (cls) node.className = cls; if (value !== undefined) node.textContent = value; return node; }
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function availablePatterns() {
    const registry = window.TradeJournalPatternStore;
    if (registry && typeof registry.listForScenarios === 'function') {
      const values = registry.listForScenarios();
      if (values && values.length) return values;
    }
    return patternCatalog;
  }
  function recordPatternUsage(patternId, delta) {
    const registry = window.TradeJournalPatternStore;
    if (registry && typeof registry.recordUsage === 'function') registry.recordUsage(patternId, delta || 1);
  }
  function educationCopy(key) {
    const values = {
      positionGuide: { fa:'راهنمای مدیریت پوزیشن', ar:'دليل إدارة الصفقة', en:'Position management guide', es:'Guía de gestión de posición' }, riskDefaults: { fa:'پیش‌فرض‌های ریسک', ar:'قيم المخاطر الافتراضية', en:'Risk defaults', es:'Valores de riesgo' },
      entry: { fa:'ورود', ar:'الدخول', en:'Entry', es:'Entrada' }, stop: { fa:'حد ضرر', ar:'وقف الخسارة', en:'Stop loss', es:'Stop loss' }, exit: { fa:'خروج', ar:'الخروج', en:'Exit', es:'Salida' }, sizing: { fa:'حجم', ar:'الحجم', en:'Sizing', es:'Tamaño' }, noGuide: { fa:'هنوز قانون اجرایی ثبت نشده است.', ar:'لم تُسجل قواعد تنفيذ بعد.', en:'No execution rules have been recorded yet.', es:'Aún no hay reglas de ejecución.' },
      maxRisk: { fa:'ریسک/معامله', ar:'مخاطرة/صفقة', en:'Risk/trade', es:'Riesgo/op.' }, daily: { fa:'افت روزانه', ar:'تراجع يومي', en:'Daily DD', es:'DD diario' }, total: { fa:'افت کل', ar:'تراجع كلي', en:'Total DD', es:'DD total' }, trades: { fa:'حد معاملات', ar:'حد الصفقات', en:'Max trades', es:'Máx. operaciones' }, profit: { fa:'سقف سود', ar:'سقف الربح', en:'Profit cap', es:'Tope beneficio' }
    };
    return (values[key] && values[key][language()]) || key;
  }
  function strategyEducationReference(strategyId) {
    const education = window.TradeJournalStrategyEducationStore;
    if (!education || !strategyId || !education.find(strategyId)) return null;
    const guide = education.getPositionGuide(strategyId), risk = education.getRiskDefaults(strategyId);
    const values = [[educationCopy('entry'),guide.entryRules],[educationCopy('stop'),guide.stopLossRules],[educationCopy('exit'),guide.exitTargetRules],[educationCopy('sizing'),guide.positionSizingRules]].filter(function(item){return String(item[1]||'').trim();});
    const section = el('section','swc-section swc-education-guide'); section.append(el('h4','', '◈ '+educationCopy('positionGuide')));
    if (!values.length) section.append(el('p','swc-guide-empty',educationCopy('noGuide'))); else { const list=el('div','swc-guide-list'); values.forEach(function(item){const row=el('div');row.append(el('b','',item[0]),el('span','',item[1]));row.lastChild.dir='auto';list.append(row);});section.append(list); }
    const chips=el('div','swc-risk-defaults'); [[educationCopy('maxRisk'),risk.maxRiskPerTradePercent,'%'],[educationCopy('daily'),risk.dailyDrawdownLimitPercent,'%'],[educationCopy('total'),risk.totalDrawdownLimitPercent,'%'],[educationCopy('trades'),risk.maxConcurrentTrades,''],[educationCopy('profit'),risk.maxProfitCapPerTrade,'%']].forEach(function(item){if(item[1]!==null&&item[1]!==undefined)chips.append(badge('accent',item[0]+': '+new Intl.NumberFormat(localeCode(),{maximumFractionDigits:2}).format(Number(item[1]))+item[2]));});
    if(chips.childNodes.length)section.append(el('small','swc-risk-title',educationCopy('riskDefaults')),chips);return section;
  }
  function patternRequirement(threshold) {
    const value = new Intl.NumberFormat(localeCode()).format(Number(threshold || 0)) + '%';
    return ({ fa: value + ' تکمیل الگو لازم است', ar: 'يلزم اكتمال النمط بنسبة ' + value, es: 'Se requiere ' + value + ' del patrón', en: value + ' pattern completion required' })[language()];
  }
  function marketName(entry, session) { return entry.tradingSession || entry.market || session.tradingSession || session.market || 'London'; }
  function currentProbability(scenario) { const h = scenario.probabilityHistory || []; return Number(h.length ? h[h.length - 1].value : 0); }
  function patternFor(scenario) {
    if (!scenario.pattern) return null;
    const match = availablePatterns().find(function (item) { return item.id === scenario.pattern.patternTagId || item.name === scenario.pattern.name; });
    if (match) return match;
    const snapshot = scenario.pattern.stages || [];
    return {
      id: scenario.pattern.patternTagId,
      name: scenario.pattern.name || '',
      positionThreshold: Number(scenario.pattern.completionThreshold || 70),
      stages: snapshot.map(function (item, index) { return typeof item === 'string' ? { id: 'snapshot-' + index, index: index + 1, label: item } : { id: item.id || 'snapshot-' + index, index: item.index || index + 1, label: item.label || item.text || '' }; })
    };
  }
  function patternCompletion(scenario) {
    const tag = patternFor(scenario);
    const stages = tag ? tag.stages : ((scenario.pattern && scenario.pattern.stages) || []);
    if (!stages.length) return 0;
    return Math.round((((scenario.pattern && scenario.pattern.completedStageIds) || []).length / stages.length) * 100);
  }
  function formCompletion(scenario) {
    const plan = scenario.executionPlan || {};
    let filled = 0;
    if ((scenario.description || '').trim()) filled++;
    if ((scenario.evidence || '').trim()) filled++;
    if ((scenario.invalidationTagIds || []).length) filled++;
    if ((scenario.problem || '').trim()) filled++;
    if ((scenario.trigger || '').trim()) filled++;
    if ((scenario.probabilityHistory || []).length) filled++;
    if ((plan.actionPlan || '').trim()) filled++;
    if (plan.positionType) filled++;
    if ((plan.entryPrices || []).length) filled++;
    return Math.round((filled / 8) * 100);
  }
  function localeCode() { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[language()]; }
  function clockInZone(value, zone) {
    try { return new Intl.DateTimeFormat(localeCode(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(new Date(value)); }
    catch (_) { return '--:--'; }
  }
  function normalizeScenario(scenario, entry, index) {
    scenario.id = scenario.id || uid('scenario');
    scenario.entryId = scenario.entryId || entry.id;
    scenario.index = Number.isFinite(scenario.index) ? scenario.index : index + 1;
    scenario.title = scenario.title || tr('scenarioTitle');
    scenario.description = scenario.description || '';
    scenario.evidence = scenario.evidence || '';
    scenario.invalidationTagIds = scenario.invalidationTagIds || [];
    scenario.invalidationNote = scenario.invalidationNote || '';
    scenario.problem = scenario.problem || '';
    scenario.trigger = scenario.trigger || '';
    scenario.probabilityHistory = scenario.probabilityHistory || [{ value: Number(scenario.probability || 50), loggedAt: new Date(entry.createdAt || Date.now()).toISOString() }];
    scenario.executionPlan = scenario.executionPlan || { actionPlan: '', positionType: null, entryPrices: [] };
    scenario.executionPlan.entryPrices = scenario.executionPlan.entryPrices || [];
    scenario.occurred = Boolean(scenario.occurred);
    if (scenario.pattern) {
      const match = patternFor(scenario) || availablePatterns()[0];
      scenario.pattern.patternTagId = scenario.pattern.patternTagId || match.id;
      scenario.pattern.name = scenario.pattern.name || match.name;
      scenario.pattern.stages = scenario.pattern.stages || match.stages.map(function (stage) { return stage.label; });
      scenario.pattern.completionThreshold = Number(scenario.pattern.completionThreshold || match.positionThreshold || 70);
      scenario.pattern.completedStageIds = scenario.pattern.completedStageIds || [];
      scenario.pattern.completedStageIds = scenario.pattern.completedStageIds.map(function (value) {
        const byId = match.stages.find(function (stage) { return stage.id === value; });
        if (byId) return byId.id;
        const byLabel = match.stages.find(function (stage) { return stage.label === value; });
        return byLabel ? byLabel.id : value;
      });
    }
    scenario.formCompletionPercent = formCompletion(scenario);
    return scenario;
  }
  function normalizeSession(session) {
    session.tradingSession = session.tradingSession || session.market || 'London';
    session.entries = session.entries || [];
    session.entries.forEach(function (entry) {
      entry.sessionId = entry.sessionId || session.id;
      entry.createdAt = entry.createdAt || Date.now();
      entry.type = entry.type || 'chart';
      entry.tradingSession = entry.tradingSession || entry.market || session.tradingSession;
      entry.market = entry.market || entry.tradingSession;
      entry.hasImage = entry.hasImage !== undefined ? entry.hasImage : Boolean(entry.preview || entry.imageBlobId);
      entry.relatedScenarioIds = entry.relatedScenarioIds || [];
      entry.scenarios = entry.scenarios || [];
      entry.scenarios.forEach(function (scenario, index) { normalizeScenario(scenario, entry, index); });
    });
    return session;
  }
  function allScenarios(session) {
    return session.entries.reduce(function (items, entry) { return items.concat((entry.scenarios || []).map(function (scenario, index) { return normalizeScenario(scenario, entry, index); })); }, []);
  }
  function laterReferences(session, scenarioId) { return session.entries.filter(function (entry) { return (entry.relatedScenarioIds || []).indexOf(scenarioId) > -1; }).length; }
  function saveAndOpen(api, session, type, detail, scenarioId, counts) {
    if (type) api.log(session, type, detail, scenarioId || null, counts !== false);
    api.save(session);
    api.open(session.id);
  }
  function inputField(label, value, type, onChange, readOnly, placeholder) {
    const wrap = el('label', 'swc-field');
    wrap.append(el('span', '', label));
    const input = document.createElement(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type || 'text';
    input.value = value === null || value === undefined ? '' : value;
    input.disabled = readOnly;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('change', function () { onChange(input.value); });
    wrap.append(input);
    return wrap;
  }
  function badge(cls, value) { return el('span', 'swc-badge ' + cls, value); }
  function marketClass(name) { return 'swc-market-' + String(name || 'London').toLowerCase(); }
  function probabilityClass(value) { return value === 0 ? 'danger' : value < 40 ? 'warning' : 'success'; }
  function addProbability(api, session, scenario, next) {
    const previous = currentProbability(scenario);
    const value = Math.max(0, Math.min(100, Math.round(Number(next) || 0)));
    if (previous === value) return;
    scenario.probabilityHistory.push({ value: value, loggedAt: new Date().toISOString() });
    if (value === 0 && previous > 0 && scenario.pattern) scenario.pattern.completedStageIds = [];
    api.log(session, 'probability_changed', previous + '% → ' + value + '%', scenario.id, true);
    api.save(session);
    if (value === 0 && previous > 0 && !(scenario.confirmedInvalidationTagIds || []).length) openInvalidationModal(api, session, scenario);
    else api.open(session.id);
  }
  function openInvalidationModal(api, session, scenario) {
    api.modal(tr('invalidationTitle'), function (body) {
      body.append(el('p', 'swc-modal-copy', tr('invalidationBody')));
      const field = inputField(tr('invalidation'), (scenario.invalidationTagIds || []).join(', '), 'text', function () {}, false, tr('invalidationPlaceholder'));
      field.classList.add('swc-invalidation-picker');
      body.append(field);
    }, function (body, overlay) {
      const input = body.querySelector('.swc-invalidation-picker input');
      const values = String(input.value || '').split(/[,،]/).map(function (item) { return item.trim(); }).filter(Boolean);
      scenario.confirmedInvalidationTagIds = values.length ? values : (scenario.invalidationTagIds || []).slice();
      api.log(session, 'invalidation_confirmed', tr('confirmInvalidation'), scenario.id, true);
      api.save(session);
      overlay.remove();
      api.open(session.id);
    }, tr('confirmInvalidation'));
  }
  function makeAiResult(session, entry) {
    const scenarios = allScenarios(session);
    const patterns = [];
    scenarios.forEach(function (scenario) {
      const pattern = patternFor(scenario);
      if (pattern && !patterns.some(function (item) { return item.patternName === pattern.name; })) patterns.push({ patternName: pattern.name, confidence: Math.max(40, patternCompletion(scenario)) });
    });
    return {
      provider: 'local-demo',
      chartSummary: tr('aiDemo'),
      patterns: patterns,
      newScenarios: [{ title: tr('suggested'), probability: 55 }],
      scenarioAssessments: scenarios.slice(0, 3).map(function (scenario) { return { scenarioTitle: scenario.title, stillValid: currentProbability(scenario) > 0, note: scenario.trigger || '' }; }),
      annotations: entry.hasImage ? [
        { label: 'Trigger', x: 63, y: 38, color: '#34d399', type: 'point' },
        { label: 'Invalidation', x: 37, y: 68, color: '#fb7185', type: 'zone', w: 22, h: 13 }
      ] : []
    };
  }
  function renderAnnotations(media, annotations) {
    const overlay = el('div', 'swc-annotations');
    annotations.forEach(function (annotation) {
      const mark = el('span', 'swc-annotation ' + (annotation.type || 'point'), annotation.label || '');
      mark.style.left = Number(annotation.x || 0) + '%';
      mark.style.top = Number(annotation.y || 0) + '%';
      mark.style.setProperty('--annotation-color', annotation.color || '#60a5fa');
      if (annotation.w) mark.style.width = Number(annotation.w) + '%';
      if (annotation.h) mark.style.height = Number(annotation.h) + '%';
      overlay.append(mark);
    });
    media.append(overlay);
  }
  function openLightbox(src, result, showAnnotations) {
    const box = el('div', 'sw-lightbox swc-lightbox');
    const close = el('button', '', '×');
    const frame = el('div', 'swc-lightbox-frame');
    const image = document.createElement('img'); image.src = src; image.alt = tr('chart'); frame.append(image);
    if (showAnnotations && result && result.annotations) renderAnnotations(frame, result.annotations);
    close.onclick = function () { box.remove(); };
    box.onclick = function (event) { if (event.target === box) box.remove(); };
    box.append(close, frame); document.body.append(box);
  }
  function renderAiSummary(api, session, entry) {
    const result = entry.aiAnalysisResult;
    if (!result) return null;
    const state = entryUi[entry.id] || (entryUi[entry.id] = {});
    const wrap = el('section', 'swc-ai-summary');
    const toggle = el('button', 'swc-ai-toggle', '✦ ' + tr('aiTitle'));
    toggle.append(el('span', '', state.aiOpen ? tr('close') : tr('view')));
    toggle.onclick = function () { state.aiOpen = !state.aiOpen; api.open(session.id); };
    wrap.append(toggle);
    if (!state.aiOpen) return wrap;
    const body = el('div', 'swc-ai-body');
    if (result.chartSummary) body.append(el('p', '', result.chartSummary));
    function section(title, items, renderer) {
      if (!items || !items.length) return;
      const block = el('div', 'swc-ai-block'); block.append(el('b', '', title));
      const list = el('div', 'swc-ai-list'); items.forEach(function (item) { list.append(renderer(item)); }); block.append(list); body.append(block);
    }
    section(tr('matchedPatterns'), result.patterns, function (item) { return badge('accent', item.patternName + ' · ' + item.confidence + '%'); });
    section(tr('assessments'), result.scenarioAssessments, function (item) { const row = el('div', 'swc-ai-assessment ' + (item.stillValid ? 'valid' : 'violated')); row.append(el('i'), el('span', '', item.scenarioTitle + ' — ' + (item.stillValid ? tr('valid') : tr('violated')) + (item.note ? ' · ' + item.note : ''))); return row; });
    section(tr('suggestions'), result.newScenarios, function (item) { return el('div', 'swc-ai-suggestion', item.title + ' · ' + item.probability + '%'); });
    body.append(el('small', 'swc-ai-provider', tr('localProvider')));
    wrap.append(body);
    return wrap;
  }
  function renderScenarioCard(api, session, entry, scenario) {
    normalizeScenario(scenario, entry, entry.scenarios.indexOf(scenario));
    const readOnly = session.status === 'closed';
    const open = Boolean(expandedScenarios[scenario.id]);
    const probability = currentProbability(scenario);
    const completion = formCompletion(scenario);
    const pattern = patternFor(scenario);
    const patternPercent = patternCompletion(scenario);
    const threshold = Number((pattern && pattern.positionThreshold) || (scenario.pattern && scenario.pattern.completionThreshold) || 70);
    const unlocked = patternPercent >= threshold;
    const card = el('article', 'swc-scenario-card' + (open ? ' is-open' : ''));
    const head = el('header', 'swc-scenario-head');
    const chevron = el('button', 'swc-chevron', open ? '⌃' : '⌄');
    const title = el('strong', '', scenario.title);
    head.append(chevron, title, badge('probability ' + probabilityClass(probability), probability + '%'));
    if (pattern) head.append(badge(unlocked ? 'success' : 'neutral', (unlocked ? '◉ ' : '● ') + patternPercent + '% ' + tr('pattern')));
    head.append(badge('neutral', completion + '% ' + tr('complete')));
    if (scenario.occurred) head.append(badge('success', '✓ ' + tr('occurred')));
    if (scenario.carriedOverFrom) head.append(badge('warning', tr('carried') + ' ' + scenario.carriedOverFrom.tradingSession));
    const references = laterReferences(session, scenario.id); if (references) head.append(el('small', 'swc-reference-count', references + ' ' + tr('laterRefs')));
    if (!readOnly) { const remove = el('button', 'swc-delete', '×'); remove.onclick = function (event) { event.stopPropagation(); if (!window.confirm(tr('deleteConfirm'))) return; entry.scenarios = entry.scenarios.filter(function (item) { return item.id !== scenario.id; }); saveAndOpen(api, session, 'scenario_deleted', tr('deleteConfirm'), scenario.id, false); }; head.append(remove); }
    head.onclick = function (event) { if (event.target.closest('.swc-delete')) return; expandedScenarios[scenario.id] = !open; api.open(session.id); };
    card.append(head);
    if (!open) return card;
    const body = el('div', 'swc-scenario-body');
    function update(patch, logType, detail) { Object.assign(scenario, patch); scenario.formCompletionPercent = formCompletion(scenario); saveAndOpen(api, session, logType || null, detail || '', scenario.id, logType ? true : false); }
    body.append(
      inputField(tr('title'), scenario.title, 'text', function (value) { update({ title: value }); }, readOnly),
      inputField(tr('description'), scenario.description, 'textarea', function (value) { update({ description: value }); }, readOnly),
      inputField(tr('evidence'), scenario.evidence, 'textarea', function (value) { update({ evidence: value }); }, readOnly)
    );
    const patternBox = el('section', 'swc-section'); patternBox.append(el('h4', '', '◎ ' + tr('patternTag')));
    const select = document.createElement('select'); select.disabled = readOnly; select.append(new Option(tr('noPattern'), ''));
    availablePatterns().forEach(function (item) { select.append(new Option(item.name + ' (' + item.stages.length + ')', item.id, false, pattern && pattern.id === item.id)); });
    select.onchange = function () { const selected = availablePatterns().find(function (item) { return item.id === select.value; }); const previousId = scenario.pattern && scenario.pattern.patternTagId; scenario.pattern = selected ? { patternTagId: selected.id, name: selected.name, completionThreshold: Number(selected.positionThreshold || selected.completionThreshold || 70), stages: selected.stages.map(function (stage) { return { id: stage.id, index: stage.index, label: stage.label }; }), completedStageIds: [] } : undefined; if (selected && selected.id !== previousId) recordPatternUsage(selected.id, 1); saveAndOpen(api, session, 'pattern_attached', selected ? selected.name : tr('noPattern'), scenario.id, true); };
    patternBox.append(select);
    if (pattern) {
      const meta = el('div', 'swc-pattern-meta'); meta.append(el('span', '', tr('patternStages')), el('b', '', tr('patternCompletion') + ': ' + patternPercent + '%')); patternBox.append(meta);
      const stages = el('div', 'swc-pattern-stages'); pattern.stages.forEach(function (stage) { const done = scenario.pattern.completedStageIds.indexOf(stage.id) > -1; const button = el('button', done ? 'done' : '', (done ? '✓ ' : '○ ') + stage.index + ' · ' + stage.label); button.disabled = readOnly; button.onclick = function () { const ids = scenario.pattern.completedStageIds; const at = ids.indexOf(stage.id); if (at > -1) ids.splice(at, 1); else ids.push(stage.id); saveAndOpen(api, session, 'pattern_stage_toggled', stage.label, scenario.id, true); }; stages.append(button); }); patternBox.append(stages);
      const protocol = el('div', 'swc-protocol ' + (unlocked ? 'open' : 'locked')); protocol.append(el('span', '', unlocked ? '◉' : '●'), el('b', '', unlocked ? tr('protocolOpen') : tr('protocolLocked')), el('small', '', patternRequirement(threshold))); patternBox.append(protocol);
    }
    body.append(patternBox);
    const linkedTrade = window.TradeJournalTradeStore && window.TradeJournalTradeStore.findBySource ? window.TradeJournalTradeStore.findBySource(session.id, scenario.id) : null;
    const linkedStrategyId = (linkedTrade && linkedTrade.linkedStrategyId) || (scenario.executionPlan && scenario.executionPlan.linkedStrategyId) || scenario.linkedStrategyId || null;
    const educationReference = strategyEducationReference(linkedStrategyId); if (educationReference) body.append(educationReference);
    const invalidationBox = el('section', 'swc-section'); invalidationBox.append(el('h4', '', '⚠ ' + tr('invalidation')));
    invalidationBox.append(inputField(tr('invalidation'), (scenario.invalidationTagIds || []).join(', '), 'text', function (value) { update({ invalidationTagIds: value.split(/[,،]/).map(function (item) { return item.trim(); }).filter(Boolean) }); }, readOnly, tr('invalidationPlaceholder')));
    invalidationBox.append(inputField('', scenario.invalidationNote || '', 'textarea', function (value) { update({ invalidationNote: value }, 'note_edited', tr('invalidationNote')); }, readOnly, tr('invalidationNote'))); body.append(invalidationBox);
    body.append(inputField(tr('problem'), scenario.problem, 'textarea', function (value) { update({ problem: value }); }, readOnly), inputField(tr('trigger'), scenario.trigger, 'textarea', function (value) { update({ trigger: value }); }, readOnly));
    const probabilityBox = el('section', 'swc-probability-box'); const probabilityHead = el('div', 'swc-section-head'); probabilityHead.append(el('span', '', '% ' + tr('probability')), el('b', probabilityClass(probability), probability + '%')); probabilityBox.append(probabilityHead);
    const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = '100'; range.value = probability; range.disabled = readOnly; range.style.setProperty('--swc-probability', probability + '%'); range.className = probabilityClass(probability); range.onchange = function () { addProbability(api, session, scenario, range.value); }; probabilityBox.append(range);
    if (scenario.probabilityHistory.length > 1) { const history = el('div', 'swc-history'); history.append(el('span', '', '↺ ' + tr('history'))); scenario.probabilityHistory.slice(-6).forEach(function (item, index, sliced) { const previous = index ? Number(sliced[index - 1].value) : Number(item.value); const trend = Number(item.value) - previous; history.append(badge('neutral', item.value + '% ' + (trend > 0 ? '↑' : trend < 0 ? '↓' : '•') + ' ' + clockInZone(item.loggedAt, 'Asia/Tehran'))); }); probabilityBox.append(history); }
    if ((scenario.confirmedInvalidationTagIds || []).length) probabilityBox.append(el('div', 'swc-invalidated', '⚠ ' + tr('invalidated') + ': ' + scenario.confirmedInvalidationTagIds.join('، '))); body.append(probabilityBox);
    const plan = scenario.executionPlan; const execution = el('section', 'swc-section swc-execution'); const executionHead = el('div', 'swc-section-head'); executionHead.append(el('h4', '', tr('execution'))); if (unlocked) executionHead.append(badge('success', '◉ ' + tr('protocolOpen'))); execution.append(executionHead);
    execution.append(inputField(tr('actionPlan'), plan.actionPlan || '', 'textarea', function (value) { plan.actionPlan = value; saveAndOpen(api, session, null); }, readOnly, tr('actionPlaceholder')));
    const position = el('div', 'swc-position-type'); position.append(el('span', '', tr('positionType'))); ['Long', 'Short'].forEach(function (value) { const button = el('button', plan.positionType === value ? (value === 'Long' ? 'long active' : 'short active') : '', value === 'Long' ? tr('long') : tr('short')); button.disabled = readOnly; button.onclick = function () { plan.positionType = value; saveAndOpen(api, session, 'position_edited', tr('positionType'), scenario.id, true); }; position.append(button); }); execution.append(position);
    const priceGrid = el('div', 'swc-price-grid'); priceGrid.append(
      inputField(tr('entries'), (plan.entryPrices || []).join(', '), 'text', function (value) { plan.entryPrices = value.split(',').map(function (item) { return Number(item.trim()); }).filter(function (value) { return !Number.isNaN(value); }); saveAndOpen(api, session, 'position_edited', tr('entries'), scenario.id, true); }, readOnly),
      inputField(tr('stop'), plan.stopLoss, 'number', function (value) { plan.stopLoss = value ? Number(value) : null; saveAndOpen(api, session, 'position_edited', tr('stop'), scenario.id, true); }, readOnly, tr('optional')),
      inputField(tr('target'), plan.takeProfit, 'number', function (value) { plan.takeProfit = value ? Number(value) : null; saveAndOpen(api, session, 'position_edited', tr('target'), scenario.id, true); }, readOnly, tr('optional'))
    ); execution.append(priceGrid); body.append(execution);
    const occurred = el('button', 'swc-occurred ' + (scenario.occurred ? 'active' : ''), (scenario.occurred ? '✓ ' : '○ ') + tr('occurredAction')); occurred.disabled = readOnly; occurred.onclick = function () { scenario.occurred = !scenario.occurred; session.finalOutcomeScenarioId = scenario.occurred ? scenario.id : (session.finalOutcomeScenarioId === scenario.id ? null : session.finalOutcomeScenarioId); saveAndOpen(api, session, 'occurred_toggled', tr('occurredAction'), scenario.id, true); }; body.append(occurred);
    if (!readOnly) {
      const autofill = el('section', 'swc-section swc-autofill'); autofill.append(el('h4', '', '✦ ' + tr('autoFill'))); const paste = document.createElement('textarea'); paste.placeholder = tr('autoFillPlaceholder'); const parse = el('button', 'session-primary', tr('parse')); parse.onclick = function () { const value = paste.value.trim(); if (!value) return; const lines = value.split(/\n+/); const lookup = function (pattern) { const line = lines.find(function (item) { return pattern.test(item); }); return line ? line.replace(/^.*?[:：]/, '').trim() : ''; }; scenario.description = lookup(/شرح|description|descripci[oó]n|الوصف/i) || scenario.description || value; scenario.evidence = lookup(/شواهد|evidence|evidencia|أدلة/i) || scenario.evidence; scenario.problem = lookup(/مشکل|problem|problema|مشكلة/i) || scenario.problem; scenario.trigger = lookup(/تریگر|trigger|activador|محفز/i) || scenario.trigger; const probMatch = value.match(/(?:احتمال|probability|probabilidad|احتمال)\D{0,8}(\d{1,3})/i); if (probMatch) scenario.probabilityHistory.push({ value: Math.max(0, Math.min(100, Number(probMatch[1]))), loggedAt: new Date().toISOString() }); scenario.rawPastedText = value; saveAndOpen(api, session, 'scenario_autofilled', tr('autoFill'), scenario.id, true); }; autofill.append(paste, parse); body.append(autofill);
    }
    card.append(body); return card;
  }
  function openScenarioModal(api, session, entry) {
    const fields = {};
    api.modal(tr('newScenario'), function (body) {
      const grid = el('div', 'sw-modal-grid swc-new-scenario');
      function add(name, label, type, value, wide) { const item = api.field(label, type, value, wide); fields[name] = item; grid.append(item.wrap); }
      add('title', tr('title'), 'text', tr('scenarioTitle'), true); add('description', tr('description'), 'textarea', '', true); add('evidence', tr('evidence'), 'textarea', '', true); add('problem', tr('problem'), 'textarea', '', true); add('trigger', tr('trigger'), 'textarea', '', true); add('invalidation', tr('invalidation'), 'text', '', true);
      fields.pattern = api.field(tr('patternTag'), 'select'); fields.pattern.input.append(new Option(tr('noPattern'), '')); availablePatterns().forEach(function (item) { fields.pattern.input.append(new Option(item.name, item.id)); }); grid.append(fields.pattern.wrap);
      add('probability', tr('probability'), 'range', '50'); fields.probability.input.min = '0'; fields.probability.input.max = '100'; add('plan', tr('actionPlan'), 'textarea', '', true);
      fields.position = api.field(tr('positionType'), 'select'); fields.position.input.append(new Option('—', ''), new Option('Long', 'Long'), new Option('Short', 'Short')); grid.append(fields.position.wrap);
      add('entries', tr('entries'), 'text', ''); add('stop', tr('stop'), 'number', ''); add('target', tr('target'), 'number', ''); body.append(grid);
    }, function (_, overlay) {
      const selected = availablePatterns().find(function (item) { return item.id === fields.pattern.input.value; });
      const scenario = normalizeScenario({ id: uid('scenario'), entryId: entry.id, index: entry.scenarios.length + 1, title: fields.title.input.value || tr('scenarioTitle'), description: fields.description.input.value, evidence: fields.evidence.input.value, invalidationTagIds: fields.invalidation.input.value.split(/[,،]/).map(function (item) { return item.trim(); }).filter(Boolean), invalidationNote: '', problem: fields.problem.input.value, trigger: fields.trigger.input.value, probabilityHistory: [{ value: Number(fields.probability.input.value), loggedAt: new Date().toISOString() }], executionPlan: { actionPlan: fields.plan.input.value, positionType: fields.position.input.value || null, entryPrices: fields.entries.input.value.split(',').map(function (item) { return Number(item.trim()); }).filter(function (value) { return !Number.isNaN(value); }), stopLoss: fields.stop.input.value ? Number(fields.stop.input.value) : null, takeProfit: fields.target.input.value ? Number(fields.target.input.value) : null, positionStatus: null }, occurred: false, pattern: selected ? { patternTagId: selected.id, name: selected.name, completionThreshold: Number(selected.positionThreshold || selected.completionThreshold || 70), stages: selected.stages.map(function (stage) { return { id: stage.id, index: stage.index, label: stage.label }; }), completedStageIds: [] } : undefined }, entry, entry.scenarios.length);
      if (selected) recordPatternUsage(selected.id, 1);
      entry.scenarios.push(scenario); api.log(session, 'scenario_added', tr('newScenario'), scenario.id, true); api.save(session); overlay.remove(); expandedScenarios[scenario.id] = true; api.open(session.id);
    }, tr('save'));
  }
  function renderEntry(payload) {
    const api = payload.api, session = normalizeSession(payload.session), entry = payload.entry;
    const readOnly = session.status === 'closed';
    const state = entryUi[entry.id] || (entryUi[entry.id] = { showAnnotated: true });
    if(entry.imageBlobId&&!state.imageLoadDone&&!state.loadingImage&&window.TradeJournalImageStore){state.loadingImage=true;window.TradeJournalImageStore.loadImageUrl(entry.imageBlobId).then(function(url){state.loadingImage=false;state.imageLoadDone=true;state.loadedUrl=url||'';api.open(session.id);}).catch(function(){state.loadingImage=false;state.imageLoadDone=true;state.loadedUrl='';});}
    const market = marketName(entry, session), marketData = markets[market] || markets.London;
    const card = el('article', 'sw-entry sw-entry-v2 ' + marketClass(market)); card.dataset.market = market;
    const head = el('header', 'swc-entry-head'); const title = el('div', 'sw-entry-title');
    const icon = entry.type === 'movement' ? '✦' : entry.type === 'fate' ? '⚑' : '▧';
    title.append(el('span', 'swc-type-icon', icon), el('b', '', entry.type === 'movement' ? tr('movement') : entry.type === 'fate' ? tr('fate') : tr('chart')), badge('market', marketData.icon + ' ' + market), badge('neutral tnum', entry.timeframe || session.timeframe || '5m'));
    const tools = el('div', 'swc-head-tools');
    if (entry.hasImage || entry.preview) { const ai = el('button', 'swc-ai-button', '✦ ' + tr('ai')); ai.onclick = function () { entry.aiAnalysisResult = makeAiResult(session, entry); api.log(session, 'ai_analysis', tr('aiTitle'), null, false); api.save(session); api.open(session.id); }; tools.append(ai); }
    if (!readOnly) { const remove = el('button', 'sw-entry-delete', '×'); remove.onclick = function () { if (!window.confirm(tr('entryDeleteConfirm'))) return; if(entry.imageBlobId&&window.TradeJournalImageStore)window.TradeJournalImageStore.deleteImage(entry.imageBlobId); session.entries = session.entries.filter(function (item) { return item.id !== entry.id; }); saveAndOpen(api, session, 'entry_deleted', tr('entryDeleteConfirm'), null, false); }; tools.append(remove); }
    head.append(title, tools); card.append(head);
    const src = entry.preview || entry.imageUrl || state.loadedUrl || null;
    if (src) {
      const media = el('div', 'sw-entry-media swc-entry-media'); const image = document.createElement('img'); image.src = src; image.alt = tr('chart'); media.append(image);
      if (state.showAnnotated && entry.aiAnalysisResult && entry.aiAnalysisResult.annotations) renderAnnotations(media, entry.aiAnalysisResult.annotations);
      if (entry.aiAnalysisResult && entry.aiAnalysisResult.annotations && entry.aiAnalysisResult.annotations.length) { const switcher = el('div', 'swc-chart-switch'); const raw = el('button', state.showAnnotated ? '' : 'active', tr('raw')); const analyzed = el('button', state.showAnnotated ? 'active' : '', '✦ ' + tr('annotated')); raw.onclick = function (event) { event.stopPropagation(); state.showAnnotated = false; api.open(session.id); }; analyzed.onclick = function (event) { event.stopPropagation(); state.showAnnotated = true; api.open(session.id); }; switcher.append(raw, analyzed); media.append(switcher); }
      const zoom = el('span', 'swc-zoom', '⌕ ' + tr('zoom')); media.append(zoom); media.onclick = function () { openLightbox(src, entry.aiAnalysisResult, state.showAnnotated); }; card.append(media);
    } else if (entry.type === 'movement') {
      const movement = document.createElement('textarea'); movement.className = 'swc-movement-note'; movement.value = entry.movementNote || entry.note || ''; movement.disabled = readOnly; movement.onchange = function () { entry.movementNote = movement.value; saveAndOpen(api, session, 'note_edited', tr('note'), null, false); }; card.append(movement);
    } else card.append(el('div', 'swc-no-image', tr('noImage')));
    if (entry.type === 'chart' || src) { const note = el('label', 'swc-entry-note'); note.append(el('span', '', '▢ ' + tr('note'))); const area = document.createElement('textarea'); area.value = entry.note || ''; area.placeholder = tr('notePlaceholder'); area.disabled = readOnly; area.onchange = function () { entry.note = area.value; saveAndOpen(api, session, 'note_edited', tr('note'), null, false); }; note.append(area); card.append(note); }
    const clocks = el('div', 'swc-entry-clocks'); clocks.append(el('span', 'market', '● ' + tr('marketTime') + ': ' + clockInZone(entry.createdAt, marketData.zone)), el('span', 'tnum', tr('tehran') + ': ' + clockInZone(entry.createdAt, 'Asia/Tehran'))); card.append(clocks);
    const aiSummary = renderAiSummary(api, session, entry); if (aiSummary) card.append(aiSummary);
    const related = (entry.relatedScenarioIds || []).map(function (scenarioId) { return allScenarios(session).find(function (scenario) { return scenario.id === scenarioId; }); }).filter(Boolean);
    if (related.length) { const block = el('section', 'swc-related'); block.append(el('span', '', '↗ ' + tr('related'))); const list = el('div'); related.forEach(function (scenario) { list.append(badge('accent', scenario.title + ' · ' + currentProbability(scenario) + '%')); }); block.append(list); card.append(block); }
    const scenarios = entry.scenarios.slice().sort(function (a, b) { return currentProbability(b) - currentProbability(a); });
    if (scenarios.length) { const list = el('div', 'swc-scenario-list'); scenarios.forEach(function (scenario) { list.append(renderScenarioCard(api, session, entry, scenario)); }); card.append(list); }
    if (!readOnly) { const add = el('button', 'swc-add-scenario', '+ ' + tr('addScenario')); add.onclick = function () { openScenarioModal(api, session, entry); }; card.append(add); }
    return card;
  }
  window.TradeJournalSessionCards = { normalizeSession: normalizeSession, renderEntry: renderEntry, patternCatalog: patternCatalog, availablePatterns: availablePatterns };
}());
