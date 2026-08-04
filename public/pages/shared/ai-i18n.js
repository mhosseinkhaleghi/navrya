(function () {
  'use strict';
  var messages = {
    fa: {
      aiSettingsTitle: 'هوش مصنوعی', aiSettingsHelp: 'ارائه‌دهنده، کلید شخصی، حالت صوتی، مصرف توکن و حافظهٔ دستیار را از اینجا مدیریت کن.',
      aiProviderLabel: 'ارائه‌دهنده', aiModelLabel: 'مدل',
      aiProviderOpenAI: 'OpenAI', aiProviderAnthropic: 'Claude', aiProviderKimi: 'Kimi', aiProviderDeepseek: 'DeepSeek',
      aiKeyLabel: 'کلید API شخصی (اختیاری)', aiKeyPlaceholder: 'کلید API خودت را وارد کن',
      aiTestConnection: 'تست اتصال', aiTestConnectionOk: 'اتصال برقرار شد.', aiTestConnectionFailed: 'اتصال ناموفق بود.',
      aiKeyPersistToggle: 'این کلید در مرورگر ذخیره شود', aiKeyPersistWarning: 'این کلید در مرورگرت ذخیره می‌شود و رمزنگاری‌شده نیست.',
      aiVoiceModeLabel: 'حالت صوتی', aiVoiceHandledBy: 'توسط {model} پشتیبانی می‌شود', aiVoiceUnavailable: 'برای این ارائه‌دهنده در دسترس نیست',
      aiUsageTitle: 'مصرف توکن', aiUsageToday: 'امروز', aiUsageMonth: 'این ماه', aiUsageBudgetLabel: 'سقف ماهانه توکن (اختیاری)', aiUsageRemaining: 'باقی‌مانده: {value}', aiUsageNoBudget: 'سقفی تعیین نشده است.',
      aiMemoryTitle: 'حافظهٔ دستیار', aiMemoryHint: 'آنچه دستیار از گفتگوهای قبلی به‌خاطر دارد؛ می‌توانی آن را ببینی، دانلود کنی یا پاک کنی.',
      aiMemoryExport: 'دانلود JSON', aiMemoryClear: 'پاک کردن', aiMemoryClearConfirm: 'تاریخچهٔ گفتگوی این بخش پاک شود؟', aiMemoryEmpty: 'هنوز گفتگویی ثبت نشده است.',
      aiMemoryPatterns: 'الگوها', aiMemoryStrategies: 'استراتژی‌ها', aiMemoryMentalHealth: 'پرونده سلامت روان',
      aiSettingsSaved: 'تنظیمات هوش مصنوعی ذخیره شد.', aiSave: 'ذخیره',
      aiDockLauncherLabel: 'دستیار هوش مصنوعی', aiDockPlaceholder: 'پیامت را بنویس…', aiDockSend: 'ارسال', aiDockAttach: 'پیوست تصویر',
      aiDockMic: 'صحبت کن', aiDockStopListening: 'توقف شنیدن', aiDockListening: 'در حال شنیدن…',
      aiDockEmpty: 'با دستیار هوش مصنوعی گفتگو کن؛ در هر فرم بازی که باشی، می‌تواند به تو کمک کند آن را پر کنی.',
      aiDockTherapistToggle: 'حالت روان‌شناس — این گفتگو در پروندهٔ سلامت روانم ذخیره شود',
      aiDockTherapistOn: 'حالت روان‌شناس: روشن', aiDockTherapistOff: 'حالت روان‌شناس: خاموش', aiDockClose: 'بستن',
      aiScreenshotAnalyzeAction: 'تحلیل به‌عنوان معامله', aiScreenshotReviewTitle: 'مقادیر استخراج‌شده',
      aiScreenshotApply: 'اعمال در ویزارد معامله', aiScreenshotDiscard: 'رد کردن', aiScreenshotNoData: 'هیچ مقداری از این تصویر استخراج نشد.',
      aiDockError: 'مشکلی پیش آمد. دوباره تلاش کن.', aiSuggestionApply: 'اعمال', aiSuggestionDiscard: 'رد کردن'
    },
    ar: {
      aiSettingsTitle: 'الذكاء الاصطناعي', aiSettingsHelp: 'أدر مزوّد الخدمة ومفتاحك الخاص وحالة الصوت واستهلاك التوكنات وذاكرة المساعد من هنا.',
      aiProviderLabel: 'المزوّد', aiModelLabel: 'النموذج',
      aiProviderOpenAI: 'OpenAI', aiProviderAnthropic: 'Claude', aiProviderKimi: 'Kimi', aiProviderDeepseek: 'DeepSeek',
      aiKeyLabel: 'مفتاح API الخاص (اختياري)', aiKeyPlaceholder: 'أدخل مفتاح API الخاص بك',
      aiTestConnection: 'اختبار الاتصال', aiTestConnectionOk: 'تم الاتصال بنجاح.', aiTestConnectionFailed: 'فشل الاتصال.',
      aiKeyPersistToggle: 'حفظ هذا المفتاح في المتصفح', aiKeyPersistWarning: 'سيُحفظ هذا المفتاح في متصفحك وهو غير مشفّر.',
      aiVoiceModeLabel: 'الوضع الصوتي', aiVoiceHandledBy: 'مدعوم بواسطة {model}', aiVoiceUnavailable: 'غير متاح لهذا المزوّد',
      aiUsageTitle: 'استهلاك التوكنات', aiUsageToday: 'اليوم', aiUsageMonth: 'هذا الشهر', aiUsageBudgetLabel: 'الحد الشهري للتوكنات (اختياري)', aiUsageRemaining: 'المتبقي: {value}', aiUsageNoBudget: 'لم يُحدَّد حد أقصى.',
      aiMemoryTitle: 'ذاكرة المساعد', aiMemoryHint: 'ما يتذكره المساعد من المحادثات السابقة؛ يمكنك عرضه أو تنزيله أو مسحه.',
      aiMemoryExport: 'تنزيل JSON', aiMemoryClear: 'مسح', aiMemoryClearConfirm: 'مسح سجل المحادثة لهذا القسم؟', aiMemoryEmpty: 'لا توجد محادثات مسجلة بعد.',
      aiMemoryPatterns: 'الأنماط', aiMemoryStrategies: 'الاستراتيجيات', aiMemoryMentalHealth: 'ملف الصحة النفسية',
      aiSettingsSaved: 'تم حفظ إعدادات الذكاء الاصطناعي.', aiSave: 'حفظ',
      aiDockLauncherLabel: 'مساعد الذكاء الاصطناعي', aiDockPlaceholder: 'اكتب رسالتك…', aiDockSend: 'إرسال', aiDockAttach: 'إرفاق صورة',
      aiDockMic: 'تحدث', aiDockStopListening: 'إيقاف الاستماع', aiDockListening: 'جارٍ الاستماع…',
      aiDockEmpty: 'تحدث مع المساعد - إذا كان لديك نموذج مفتوح، يمكنه مساعدتك في تعبئته.',
      aiDockTherapistToggle: 'وضع المعالج — احفظ هذه المحادثة في ملفي النفسي',
      aiDockTherapistOn: 'وضع المعالج: مفعّل', aiDockTherapistOff: 'وضع المعالج: معطّل', aiDockClose: 'إغلاق',
      aiScreenshotAnalyzeAction: 'تحليل كصفقة', aiScreenshotReviewTitle: 'القيم المستخرجة',
      aiScreenshotApply: 'تطبيق في معالج الصفقة', aiScreenshotDiscard: 'تجاهل', aiScreenshotNoData: 'لم تُستخرج أي قيم من هذه الصورة.',
      aiDockError: 'حدث خطأ ما. حاول مرة أخرى.', aiSuggestionApply: 'تطبيق', aiSuggestionDiscard: 'تجاهل'
    },
    en: {
      aiSettingsTitle: 'AI', aiSettingsHelp: 'Manage the provider, your own API key, voice mode, token usage, and the assistant\'s memory here.',
      aiProviderLabel: 'Provider', aiModelLabel: 'Model',
      aiProviderOpenAI: 'OpenAI', aiProviderAnthropic: 'Claude', aiProviderKimi: 'Kimi', aiProviderDeepseek: 'DeepSeek',
      aiKeyLabel: 'Your own API key (optional)', aiKeyPlaceholder: 'Enter your API key',
      aiTestConnection: 'Test connection', aiTestConnectionOk: 'Connected successfully.', aiTestConnectionFailed: 'Connection failed.',
      aiKeyPersistToggle: 'Remember this key in the browser', aiKeyPersistWarning: 'This will be stored in your browser and is not encrypted.',
      aiVoiceModeLabel: 'Voice mode', aiVoiceHandledBy: 'Handled by {model}', aiVoiceUnavailable: 'Not available for this provider',
      aiUsageTitle: 'Token usage', aiUsageToday: 'Today', aiUsageMonth: 'This month', aiUsageBudgetLabel: 'Monthly token budget (optional)', aiUsageRemaining: 'Remaining: {value}', aiUsageNoBudget: 'No budget set.',
      aiMemoryTitle: 'Assistant memory', aiMemoryHint: 'What the assistant remembers from past conversations - view, export, or clear it.',
      aiMemoryExport: 'Export JSON', aiMemoryClear: 'Clear', aiMemoryClearConfirm: 'Clear the chat history for this section?', aiMemoryEmpty: 'No conversations recorded yet.',
      aiMemoryPatterns: 'Patterns', aiMemoryStrategies: 'Strategies', aiMemoryMentalHealth: 'Mental health profile',
      aiSettingsSaved: 'AI settings saved.', aiSave: 'Save',
      aiDockLauncherLabel: 'AI Assistant', aiDockPlaceholder: 'Write your message…', aiDockSend: 'Send', aiDockAttach: 'Attach image',
      aiDockMic: 'Speak', aiDockStopListening: 'Stop listening', aiDockListening: 'Listening…',
      aiDockEmpty: 'Chat with the assistant - if you have a form open, it can help you fill it in.',
      aiDockTherapistToggle: 'Therapist mode — save this conversation to my psychology profile',
      aiDockTherapistOn: 'Therapist mode: On', aiDockTherapistOff: 'Therapist mode: Off', aiDockClose: 'Close',
      aiScreenshotAnalyzeAction: 'Analyze as trade setup', aiScreenshotReviewTitle: 'Extracted values',
      aiScreenshotApply: 'Apply to Trade Wizard', aiScreenshotDiscard: 'Discard', aiScreenshotNoData: 'No values could be extracted from this image.',
      aiDockError: 'Something went wrong. Try again.', aiSuggestionApply: 'Apply', aiSuggestionDiscard: 'Discard'
    },
    es: {
      aiSettingsTitle: 'IA', aiSettingsHelp: 'Gestiona el proveedor, tu propia clave de API, el modo de voz, el uso de tokens y la memoria del asistente aquí.',
      aiProviderLabel: 'Proveedor', aiModelLabel: 'Modelo',
      aiProviderOpenAI: 'OpenAI', aiProviderAnthropic: 'Claude', aiProviderKimi: 'Kimi', aiProviderDeepseek: 'DeepSeek',
      aiKeyLabel: 'Tu propia clave de API (opcional)', aiKeyPlaceholder: 'Introduce tu clave de API',
      aiTestConnection: 'Probar conexión', aiTestConnectionOk: 'Conexión exitosa.', aiTestConnectionFailed: 'Conexión fallida.',
      aiKeyPersistToggle: 'Recordar esta clave en el navegador', aiKeyPersistWarning: 'Esto se guardará en tu navegador y no está cifrado.',
      aiVoiceModeLabel: 'Modo de voz', aiVoiceHandledBy: 'Gestionado por {model}', aiVoiceUnavailable: 'No disponible para este proveedor',
      aiUsageTitle: 'Uso de tokens', aiUsageToday: 'Hoy', aiUsageMonth: 'Este mes', aiUsageBudgetLabel: 'Presupuesto mensual de tokens (opcional)', aiUsageRemaining: 'Restante: {value}', aiUsageNoBudget: 'No se ha establecido un presupuesto.',
      aiMemoryTitle: 'Memoria del asistente', aiMemoryHint: 'Lo que el asistente recuerda de conversaciones anteriores - míralo, expórtalo o bórralo.',
      aiMemoryExport: 'Exportar JSON', aiMemoryClear: 'Borrar', aiMemoryClearConfirm: '¿Borrar el historial de chat de esta sección?', aiMemoryEmpty: 'Aún no hay conversaciones registradas.',
      aiMemoryPatterns: 'Patrones', aiMemoryStrategies: 'Estrategias', aiMemoryMentalHealth: 'Perfil de salud mental',
      aiSettingsSaved: 'Ajustes de IA guardados.', aiSave: 'Guardar',
      aiDockLauncherLabel: 'Asistente de IA', aiDockPlaceholder: 'Escribe tu mensaje…', aiDockSend: 'Enviar', aiDockAttach: 'Adjuntar imagen',
      aiDockMic: 'Hablar', aiDockStopListening: 'Dejar de escuchar', aiDockListening: 'Escuchando…',
      aiDockEmpty: 'Chatea con el asistente - si tienes un formulario abierto, puede ayudarte a completarlo.',
      aiDockTherapistToggle: 'Modo terapeuta — guardar esta conversación en mi perfil psicológico',
      aiDockTherapistOn: 'Modo terapeuta: Activado', aiDockTherapistOff: 'Modo terapeuta: Desactivado', aiDockClose: 'Cerrar',
      aiScreenshotAnalyzeAction: 'Analizar como operación', aiScreenshotReviewTitle: 'Valores extraídos',
      aiScreenshotApply: 'Aplicar al asistente de operación', aiScreenshotDiscard: 'Descartar', aiScreenshotNoData: 'No se pudo extraer ningún valor de esta imagen.',
      aiDockError: 'Algo salió mal. Inténtalo de nuevo.', aiSuggestionApply: 'Aplicar', aiSuggestionDiscard: 'Descartar'
    }
  };

  function language() { var value = String(document.documentElement.lang || 'fa').toLowerCase(); return messages[value] ? value : value.indexOf('ar') === 0 ? 'ar' : value.indexOf('es') === 0 ? 'es' : value.indexOf('en') === 0 ? 'en' : 'fa'; }
  function t(key, vars) { var value = (messages[language()] && messages[language()][key]) || messages.en[key] || key; Object.keys(vars || {}).forEach(function (name) { value = value.replaceAll('{' + name + '}', vars[name]); }); return value; }
  function locale() { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' }[language()]; }
  function number(value, options) { if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'; return new Intl.NumberFormat(locale(), options || { maximumFractionDigits: 2 }).format(Number(value)); }
  window.TradeJournalAII18n = { t: t, language: language, locale: locale, number: number, direction: function () { return language() === 'fa' || language() === 'ar' ? 'rtl' : 'ltr'; }, messages: messages };
}());
