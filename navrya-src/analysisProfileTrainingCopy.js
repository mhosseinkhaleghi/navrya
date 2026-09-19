// Copy for the Analysis Profile "training" UI (Concepts tab, Memory tab, the engine-learning
// panel) - one dictionary in all four languages shared by the three components, instead of three
// near-identical per-file dictionaries. Same tr()/digits() helpers convention every view in this
// domain (analysisProfilesView.jsx, analysisProfileOnboarding.jsx) already follows.

export const trainingCopy = {
  fa: {
    conceptsTitle: 'مفاهیم', conceptsSubtitle: 'چیزهای مشخصی که موتور هنگام خواندن چارت با این پروفایل باید دنبالشان بگردد. مفاهیم «اجباری» در هر تحلیل حتماً بررسی می‌شوند.',
    conceptsCount: '{n} مفهوم · {m} اجباری',
    addConcept: 'افزودن مفهوم', addConceptTitlePlaceholder: 'مثلاً: سطح‌های سوییپ‌شده', addConceptDescPlaceholder: 'توضیح کوتاه (اختیاری)', addConceptSubmit: 'افزودن',
    conceptDuplicate: 'این مفهوم از قبل وجود دارد.', conceptLimit: 'به سقف {n} مفهوم رسیده‌ای.',
    starterBtn: 'افزودن مفاهیم پایه ({n})', starterHint: 'رایگان — از فهرست مرجع داخلی همین سبک.', starterNone: 'همه مفاهیم پایه‌ی این سبک قبلاً اضافه شده‌اند.', starterDescription: 'مفهوم پایه‌ی «{style}».',
    suggestBtn: 'پیشنهاد با هوش مصنوعی', suggestLoading: 'در حال ساخت پیشنهاد…', suggestHint: 'این کار توکن هوش مصنوعی مصرف می‌کند — با کلید API خودت رایگان است.',
    suggestAddSelected: 'افزودن موارد انتخاب‌شده ({n})', suggestDismiss: 'رد کردن پیشنهادها',
    aiErrorBalance: 'موجودی کافی نیست.', aiErrorGeneric: 'انجام نشد. دوباره تلاش کن.',
    colConcept: 'مفهوم', colPriority: 'اهمیت', colOrigin: 'منبع', colEnabled: 'فعال',
    priorityMandatory: 'اجباری', priorityPreferred: 'ترجیحی', priorityReference: 'مرجع',
    priorityHelp: 'اجباری: در هر تحلیل حتماً بررسی شود · ترجیحی: در صورت ارتباط · مرجع: کم‌اهمیت‌تر',
    originUser: 'تو', originAi: 'هوش مصنوعی', originSource: 'منبع', originChat: 'گفتگو', originStarter: 'پایه',
    enabledOn: 'فعال — به موتور داده می‌شود', enabledOff: 'غیرفعال — به موتور داده نمی‌شود',
    editConcept: 'ویرایش', saveConcept: 'ذخیره', cancel: 'انصراف', deleteConcept: 'حذف', deleteConceptConfirm: 'این مفهوم حذف شود؟',
    sortPriority: 'به ترتیب اهمیت', sortNewest: 'جدیدترین', sortAlpha: 'الفبایی',
    emptyConcepts: 'هنوز مفهومی ثبت نشده', emptyConceptsBody: 'یک مفهوم اضافه کن، مفاهیم پایه‌ی سبکت را بگیر، یا از هوش مصنوعی پیشنهاد بخواه.',
    memoryTitle: 'حافظه‌ی موتور', memorySubtitle: 'موتور با هر چیزی که به آن یاد می‌دهی، درک خودش از سبک تحلیل تو را دقیق‌تر می‌کند. همه‌ی تحلیل‌های چارتِ این پروفایل از همین درک و مفاهیم استفاده می‌کنند.',
    understandingTitle: 'موتور الان چه می‌داند', understandingEmpty: 'هنوز چیزی یاد نگرفته. یک یادداشت بنویس و به موتور آموزش بده.',
    understandingVersion: 'نسخه‌ی {n}', understandingUpdated: 'آخرین بروزرسانی: {date}', editUnderstanding: 'ویرایش دستی', saveUnderstanding: 'ذخیره',
    teachTitle: 'به موتور آموزش بده', teachPlaceholder: 'بنویس چطور چارت را می‌خوانی، چه چیزی برایت مهم است، یا چه چیزی را اشتباه فهمیده…',
    teachKindNote: 'یادداشت', teachKindCorrection: 'اصلاح', teachBtn: 'آموزش به موتور', saveNoteBtn: 'فقط ذخیره (بدون آموزش)',
    teachHint: 'آموزش از توکن هوش مصنوعی مصرف می‌کند — با کلید API خودت رایگان است. «فقط ذخیره» هیچ توکنی مصرف نمی‌کند.', noteSaved: 'یادداشت ذخیره شد.',
    workingLabel: 'موتور در حال یادگیری است…',
    stepRead: 'خواندن آنچه نوشتی', stepExtract: 'استخراج مفاهیم', stepUpdate: 'به‌روزرسانی درک موتور',
    resultRead: 'نوشته‌ات خوانده شد', resultConcepts: '{n} مفهوم پیدا شد', resultConceptsNone: 'مفهوم تازه‌ای پیدا نشد',
    resultUnderstandingChanged: 'تغییر در درک پیشنهاد شد', resultUnderstandingSame: 'درک موتور تغییری نکرد', tokensUsed: '{n} توکن مصرف شد',
    reviewTitle: 'مرور آنچه موتور یاد گرفت', reviewNothing: 'موتور چیز تازه‌ای برای افزودن پیدا نکرد.',
    proposedUnderstanding: 'درک پیشنهادی (قابل ویرایش)', applyUnderstanding: 'درک موتور را به این تغییر بده',
    applyBtn: 'اعمال ({n})', discardBtn: 'دور انداختن', applied: 'یاد گرفت. درک موتور اکنون نسخه‌ی {n} است.',
    historyTitle: 'تاریخچه‌ی یادگیری', historyEmpty: 'هنوز رویدادی ثبت نشده.', historyEvents: '{n} رویداد', historyTokens: 'توکن مصرف‌شده برای آموزش: {n}', historyAi: '{n} مورد با هوش مصنوعی',
    evtConceptAdded: 'مفهوم اضافه شد', evtStarter: 'مفاهیم پایه اضافه شد', evtAiAccepted: 'پیشنهادهای هوش مصنوعی پذیرفته شد',
    evtAiSuggested: 'هوش مصنوعی مفاهیم پیشنهاد داد', evtAiAnalyzed: 'موتور نوشته‌ات را تحلیل کرد',
    evtTaughtNote: 'یادداشت آموخته شد', evtTaughtCorrection: 'اصلاح اعمال شد', evtUnderstandingEdited: 'درک موتور دستی ویرایش شد', evtNote: 'یادداشت', evtOther: 'یادگیری',
    tokens: 'توکن'
  },
  ar: {
    conceptsTitle: 'المفاهيم', conceptsSubtitle: 'أشياء محددة يجب أن يبحث عنها المحرّك عند قراءة الرسم البياني بهذا الملف. المفاهيم «الإلزامية» تُعالَج في كل تحليل.',
    conceptsCount: '{n} مفهوم · {m} إلزامي',
    addConcept: 'إضافة مفهوم', addConceptTitlePlaceholder: 'مثال: مستويات تم اكتساحها', addConceptDescPlaceholder: 'وصف قصير (اختياري)', addConceptSubmit: 'إضافة',
    conceptDuplicate: 'هذا المفهوم موجود بالفعل.', conceptLimit: 'وصلت إلى حد {n} مفهوماً.',
    starterBtn: 'إضافة المفاهيم الأساسية ({n})', starterHint: 'مجاني - من القائمة المرجعية المدمجة لهذا النمط.', starterNone: 'كل المفاهيم الأساسية لهذا النمط مضافة بالفعل.', starterDescription: 'مفهوم أساسي في «{style}».',
    suggestBtn: 'اقتراح بالذكاء الاصطناعي', suggestLoading: 'جارٍ إنشاء الاقتراحات…', suggestHint: 'يستخدم هذا رموز الذكاء الاصطناعي - مجاني إذا استخدمت مفتاح API الخاص بك.',
    suggestAddSelected: 'إضافة المحدد ({n})', suggestDismiss: 'تجاهل الاقتراحات',
    aiErrorBalance: 'الرصيد غير كافٍ.', aiErrorGeneric: 'تعذّر التنفيذ. حاول مجدداً.',
    colConcept: 'المفهوم', colPriority: 'الأهمية', colOrigin: 'المصدر', colEnabled: 'مفعّل',
    priorityMandatory: 'إلزامي', priorityPreferred: 'مفضّل', priorityReference: 'مرجعي',
    priorityHelp: 'إلزامي: يُفحص في كل تحليل · مفضّل: عند الصلة · مرجعي: أقل أهمية',
    originUser: 'أنت', originAi: 'ذكاء اصطناعي', originSource: 'مصدر', originChat: 'محادثة', originStarter: 'أساسي',
    enabledOn: 'مفعّل - يُمرَّر إلى المحرّك', enabledOff: 'معطّل - لا يُمرَّر إلى المحرّك',
    editConcept: 'تعديل', saveConcept: 'حفظ', cancel: 'إلغاء', deleteConcept: 'حذف', deleteConceptConfirm: 'حذف هذا المفهوم؟',
    sortPriority: 'حسب الأهمية', sortNewest: 'الأحدث', sortAlpha: 'أبجدياً',
    emptyConcepts: 'لا توجد مفاهيم بعد', emptyConceptsBody: 'أضف مفهوماً، أو خذ المفاهيم الأساسية لنمطك، أو اطلب اقتراحات من الذكاء الاصطناعي.',
    memoryTitle: 'ذاكرة المحرّك', memorySubtitle: 'مع كل ما تعلّمه للمحرّك يصبح فهمه لأسلوب تحليلك أدق. كل تحليلات الرسم البياني لهذا الملف تستخدم هذا الفهم وهذه المفاهيم.',
    understandingTitle: 'ما يفهمه المحرّك الآن', understandingEmpty: 'لم يتعلم شيئاً بعد. اكتب ملاحظة وعلّمها للمحرّك.',
    understandingVersion: 'الإصدار {n}', understandingUpdated: 'آخر تحديث: {date}', editUnderstanding: 'تعديل يدوي', saveUnderstanding: 'حفظ',
    teachTitle: 'علّم المحرّك', teachPlaceholder: 'اكتب كيف تقرأ الرسم البياني، وما المهم لديك، أو ما الذي فهمه المحرّك خطأً…',
    teachKindNote: 'ملاحظة', teachKindCorrection: 'تصحيح', teachBtn: 'علّم المحرّك', saveNoteBtn: 'حفظ فقط (بدون تعليم)',
    teachHint: 'التعليم يستهلك رموز الذكاء الاصطناعي - مجاني إذا استخدمت مفتاح API الخاص بك. «حفظ فقط» لا يستهلك أي رموز.', noteSaved: 'تم حفظ الملاحظة.',
    workingLabel: 'المحرّك يتعلّم الآن…',
    stepRead: 'قراءة ما كتبته', stepExtract: 'استخراج المفاهيم', stepUpdate: 'تحديث فهمه',
    resultRead: 'تمت قراءة ما كتبته', resultConcepts: 'تم العثور على {n} مفهوم', resultConceptsNone: 'لا مفاهيم جديدة',
    resultUnderstandingChanged: 'تغيير مقترح في الفهم', resultUnderstandingSame: 'الفهم دون تغيير', tokensUsed: 'استُهلك {n} رمز',
    reviewTitle: 'راجع ما تعلّمه المحرّك', reviewNothing: 'لم يجد المحرّك شيئاً جديداً لإضافته.',
    proposedUnderstanding: 'الفهم المقترح (قابل للتعديل)', applyUnderstanding: 'حدّث فهم المحرّك إلى هذا',
    applyBtn: 'تطبيق ({n})', discardBtn: 'تجاهل', applied: 'تعلّم. فهم المحرّك الآن في الإصدار {n}.',
    historyTitle: 'سجل التعلّم', historyEmpty: 'لا أحداث مسجلة بعد.', historyEvents: '{n} حدث', historyTokens: 'الرموز المستهلكة في التعليم: {n}', historyAi: '{n} بمساعدة الذكاء الاصطناعي',
    evtConceptAdded: 'أُضيف مفهوم', evtStarter: 'أُضيفت المفاهيم الأساسية', evtAiAccepted: 'قُبلت اقتراحات الذكاء الاصطناعي',
    evtAiSuggested: 'اقترح الذكاء الاصطناعي مفاهيم', evtAiAnalyzed: 'حلّل المحرّك ما كتبته',
    evtTaughtNote: 'تم تعلّم ملاحظة', evtTaughtCorrection: 'طُبّق تصحيح', evtUnderstandingEdited: 'عُدّل فهم المحرّك يدوياً', evtNote: 'ملاحظة', evtOther: 'تعلّم',
    tokens: 'رمز'
  },
  en: {
    conceptsTitle: 'Concepts', conceptsSubtitle: 'Specific things the engine should look for when it reads a chart with this profile. Mandatory concepts are addressed in every analysis.',
    conceptsCount: '{n} concepts · {m} mandatory',
    addConcept: 'Add concept', addConceptTitlePlaceholder: 'e.g. Swept liquidity levels', addConceptDescPlaceholder: 'Short description (optional)', addConceptSubmit: 'Add',
    conceptDuplicate: 'That concept already exists.', conceptLimit: 'You have reached the limit of {n} concepts.',
    starterBtn: 'Add starter concepts ({n})', starterHint: "Free - from your style's built-in reference list.", starterNone: 'Every starter concept for this style is already added.', starterDescription: 'Core concept of {style}.',
    suggestBtn: 'Suggest with AI', suggestLoading: 'Generating suggestions…', suggestHint: 'This uses AI tokens - free if you use your own API key.',
    suggestAddSelected: 'Add selected ({n})', suggestDismiss: 'Dismiss suggestions',
    aiErrorBalance: 'Insufficient balance.', aiErrorGeneric: "That didn't work. Try again.",
    colConcept: 'Concept', colPriority: 'Priority', colOrigin: 'Origin', colEnabled: 'Enabled',
    priorityMandatory: 'Mandatory', priorityPreferred: 'Preferred', priorityReference: 'Reference',
    priorityHelp: 'Mandatory: checked in every analysis · Preferred: when relevant · Reference: minor',
    originUser: 'You', originAi: 'AI', originSource: 'Source', originChat: 'Chat', originStarter: 'Built-in',
    enabledOn: 'Enabled - given to the engine', enabledOff: 'Disabled - not given to the engine',
    editConcept: 'Edit', saveConcept: 'Save', cancel: 'Cancel', deleteConcept: 'Delete', deleteConceptConfirm: 'Delete this concept?',
    sortPriority: 'By priority', sortNewest: 'Newest', sortAlpha: 'A-Z',
    emptyConcepts: 'No concepts yet', emptyConceptsBody: "Add one, take your style's starter concepts, or ask the AI for suggestions.",
    memoryTitle: 'Engine memory', memorySubtitle: "Everything you teach the engine sharpens its understanding of how you analyse. Every chart analysis with this profile uses this understanding and these concepts.",
    understandingTitle: 'What the engine understands now', understandingEmpty: "It hasn't learned anything yet. Write a note and teach it.",
    understandingVersion: 'v{n}', understandingUpdated: 'Updated {date}', editUnderstanding: 'Edit by hand', saveUnderstanding: 'Save',
    teachTitle: 'Teach the engine', teachPlaceholder: 'Write how you read a chart, what matters to you, or what it got wrong…',
    teachKindNote: 'Note', teachKindCorrection: 'Correction', teachBtn: 'Teach the engine', saveNoteBtn: 'Save without teaching',
    teachHint: 'Teaching uses AI tokens - free if you use your own API key. "Save without teaching" spends none.', noteSaved: 'Note saved.',
    workingLabel: 'The engine is learning…',
    stepRead: 'Reading what you wrote', stepExtract: 'Extracting concepts', stepUpdate: 'Updating its understanding',
    resultRead: 'Read what you wrote', resultConcepts: '{n} concepts found', resultConceptsNone: 'No new concepts',
    resultUnderstandingChanged: 'Understanding change proposed', resultUnderstandingSame: 'Understanding unchanged', tokensUsed: '{n} tokens used',
    reviewTitle: 'Review what the engine learned', reviewNothing: 'The engine found nothing new to add.',
    proposedUnderstanding: 'Proposed understanding (editable)', applyUnderstanding: "Update the engine's understanding to this",
    applyBtn: 'Apply ({n})', discardBtn: 'Discard', applied: "Learned. The engine's understanding is now v{n}.",
    historyTitle: 'Learning history', historyEmpty: 'Nothing recorded yet.', historyEvents: '{n} events', historyTokens: 'Tokens spent teaching: {n}', historyAi: '{n} AI-assisted',
    evtConceptAdded: 'Concept added', evtStarter: 'Starter concepts added', evtAiAccepted: 'AI suggestions accepted',
    evtAiSuggested: 'AI suggested concepts', evtAiAnalyzed: 'The engine analysed what you wrote',
    evtTaughtNote: 'Note learned', evtTaughtCorrection: 'Correction applied', evtUnderstandingEdited: 'Understanding edited by hand', evtNote: 'Note', evtOther: 'Learning',
    tokens: 'tokens'
  },
  es: {
    conceptsTitle: 'Conceptos', conceptsSubtitle: 'Cosas concretas que el motor debe buscar al leer un gráfico con este perfil. Los conceptos obligatorios se abordan en cada análisis.',
    conceptsCount: '{n} conceptos · {m} obligatorios',
    addConcept: 'Añadir concepto', addConceptTitlePlaceholder: 'p. ej.: Niveles de liquidez barridos', addConceptDescPlaceholder: 'Descripción breve (opcional)', addConceptSubmit: 'Añadir',
    conceptDuplicate: 'Ese concepto ya existe.', conceptLimit: 'Has alcanzado el límite de {n} conceptos.',
    starterBtn: 'Añadir conceptos básicos ({n})', starterHint: 'Gratis - de la lista de referencia integrada de tu estilo.', starterNone: 'Todos los conceptos básicos de este estilo ya están añadidos.', starterDescription: 'Concepto básico de {style}.',
    suggestBtn: 'Sugerir con IA', suggestLoading: 'Generando sugerencias…', suggestHint: 'Esto usa tokens de IA - gratis si usas tu propia clave API.',
    suggestAddSelected: 'Añadir seleccionados ({n})', suggestDismiss: 'Descartar sugerencias',
    aiErrorBalance: 'Saldo insuficiente.', aiErrorGeneric: 'No funcionó. Inténtalo de nuevo.',
    colConcept: 'Concepto', colPriority: 'Prioridad', colOrigin: 'Origen', colEnabled: 'Activo',
    priorityMandatory: 'Obligatorio', priorityPreferred: 'Preferido', priorityReference: 'Referencia',
    priorityHelp: 'Obligatorio: se revisa en cada análisis · Preferido: cuando es relevante · Referencia: menor',
    originUser: 'Tú', originAi: 'IA', originSource: 'Fuente', originChat: 'Chat', originStarter: 'Integrado',
    enabledOn: 'Activo - se entrega al motor', enabledOff: 'Desactivado - no se entrega al motor',
    editConcept: 'Editar', saveConcept: 'Guardar', cancel: 'Cancelar', deleteConcept: 'Eliminar', deleteConceptConfirm: '¿Eliminar este concepto?',
    sortPriority: 'Por prioridad', sortNewest: 'Más recientes', sortAlpha: 'A-Z',
    emptyConcepts: 'Aún no hay conceptos', emptyConceptsBody: 'Añade uno, toma los conceptos básicos de tu estilo o pide sugerencias a la IA.',
    memoryTitle: 'Memoria del motor', memorySubtitle: 'Todo lo que le enseñas al motor afina su comprensión de cómo analizas. Cada análisis de gráfico con este perfil usa esta comprensión y estos conceptos.',
    understandingTitle: 'Lo que el motor entiende ahora', understandingEmpty: 'Aún no ha aprendido nada. Escribe una nota y enséñasela.',
    understandingVersion: 'v{n}', understandingUpdated: 'Actualizado {date}', editUnderstanding: 'Editar a mano', saveUnderstanding: 'Guardar',
    teachTitle: 'Enseña al motor', teachPlaceholder: 'Escribe cómo lees un gráfico, qué te importa o qué entendió mal…',
    teachKindNote: 'Nota', teachKindCorrection: 'Corrección', teachBtn: 'Enseñar al motor', saveNoteBtn: 'Guardar sin enseñar',
    teachHint: 'Enseñar usa tokens de IA - gratis si usas tu propia clave API. "Guardar sin enseñar" no gasta ninguno.', noteSaved: 'Nota guardada.',
    workingLabel: 'El motor está aprendiendo…',
    stepRead: 'Leyendo lo que escribiste', stepExtract: 'Extrayendo conceptos', stepUpdate: 'Actualizando su comprensión',
    resultRead: 'Leyó lo que escribiste', resultConcepts: '{n} conceptos encontrados', resultConceptsNone: 'Sin conceptos nuevos',
    resultUnderstandingChanged: 'Cambio de comprensión propuesto', resultUnderstandingSame: 'Comprensión sin cambios', tokensUsed: '{n} tokens usados',
    reviewTitle: 'Revisa lo que aprendió el motor', reviewNothing: 'El motor no encontró nada nuevo que añadir.',
    proposedUnderstanding: 'Comprensión propuesta (editable)', applyUnderstanding: 'Actualizar la comprensión del motor a esto',
    applyBtn: 'Aplicar ({n})', discardBtn: 'Descartar', applied: 'Aprendido. La comprensión del motor ahora es v{n}.',
    historyTitle: 'Historial de aprendizaje', historyEmpty: 'Aún no hay nada registrado.', historyEvents: '{n} eventos', historyTokens: 'Tokens gastados enseñando: {n}', historyAi: '{n} con ayuda de IA',
    evtConceptAdded: 'Concepto añadido', evtStarter: 'Conceptos básicos añadidos', evtAiAccepted: 'Sugerencias de IA aceptadas',
    evtAiSuggested: 'La IA sugirió conceptos', evtAiAnalyzed: 'El motor analizó lo que escribiste',
    evtTaughtNote: 'Nota aprendida', evtTaughtCorrection: 'Corrección aplicada', evtUnderstandingEdited: 'Comprensión editada a mano', evtNote: 'Nota', evtOther: 'Aprendizaje',
    tokens: 'tokens'
  }
};

export function trt(lang, key, vars) {
  let value = (trainingCopy[lang] && trainingCopy[lang][key]) || trainingCopy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.split('{' + name + '}').join(vars[name]); });
  return value;
}
export function trDigits(lang, value) {
  const text = String(value);
  if (lang === 'fa') return text.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (lang === 'ar') return text.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
  return text;
}
export function trDate(lang, iso) {
  if (!iso) return '—';
  const locale = { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[lang] || 'en-GB';
  try { return new Date(iso).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return String(iso); }
}
