(function () {
  'use strict';
  // Same shape/helpers as community-i18n.js (t/number/date/time/direction), a separate file
  // because Support Tickets is its own nav-level feature, not a Community sub-tab.
  var messages = {
    fa: {
      close: 'بستن', cancel: 'انصراف', save: 'ذخیره', back: 'بازگشت', loading: 'در حال بارگذاری…', errorGeneric: 'مشکلی پیش آمد.', retry: 'تلاش دوباره',
      supportTitle: 'پشتیبانی', supportHint: 'یک تیکت جدید ثبت کن یا وضعیت گفتگوهای قبلی‌ات را دنبال کن.',
      newTicketAction: 'تیکت جدید', ticketSubjectLabel: 'موضوع', ticketSubjectPlaceholder: 'موضوع را خلاصه بنویس…',
      ticketCategoryLabel: 'دسته‌بندی', ticketMessageLabel: 'پیام', ticketMessagePlaceholder: 'مشکلت را با جزئیات توضیح بده…',
      categoryTechnical: 'فنی', categoryBilling: 'مالی و صورتحساب', categoryAccount: 'حساب کاربری', categoryOther: 'سایر',
      statusOpen: 'در انتظار پاسخ', statusWaitingUser: 'در انتظار پاسخ شما', statusResolved: 'حل‌شده', statusClosed: 'بسته‌شده',
      ticketsEmptyTitle: 'هنوز تیکتی ثبت نشده', ticketsEmptyBody: 'اگر سوالی داری یا به مشکلی برخوردی، اولین تیکت خودت را ثبت کن.',
      submitTicket: 'ثبت تیکت', replyPlaceholder: 'پاسخت را بنویس…', replySend: 'ارسال',
      closeTicketAction: 'بستن تیکت', closeTicketConfirm: 'این تیکت بسته شود؟', ticketClosedNotice: 'این تیکت بسته شده و امکان پاسخ جدید در آن نیست.',
      unreadLabel: 'پاسخ جدید', conversationLabel: 'گفتگو', createdAtLabel: 'ایجادشده در {date}', lastActivityLabel: 'آخرین فعالیت {date}',
      youLabel: 'شما', staffLabel: 'پشتیبانی نوریا', subjectRequired: 'موضوع را وارد کن.', messageRequired: 'پیام را وارد کن.',
      ticketListLabel: 'تیکت‌های من', backToList: 'بازگشت به فهرست'
    },
    ar: {
      close: 'إغلاق', cancel: 'إلغاء', save: 'حفظ', back: 'رجوع', loading: 'جارٍ التحميل…', errorGeneric: 'حدث خطأ ما.', retry: 'إعادة المحاولة',
      supportTitle: 'الدعم', supportHint: 'أنشئ تذكرة جديدة أو تابع محادثاتك السابقة.',
      newTicketAction: 'تذكرة جديدة', ticketSubjectLabel: 'الموضوع', ticketSubjectPlaceholder: 'لخّص الموضوع…',
      ticketCategoryLabel: 'التصنيف', ticketMessageLabel: 'الرسالة', ticketMessagePlaceholder: 'اشرح مشكلتك بالتفصيل…',
      categoryTechnical: 'تقني', categoryBilling: 'الفواتير والدفع', categoryAccount: 'الحساب', categoryOther: 'أخرى',
      statusOpen: 'بانتظار الرد', statusWaitingUser: 'بانتظار ردك', statusResolved: 'تم الحل', statusClosed: 'مغلقة',
      ticketsEmptyTitle: 'لا توجد تذاكر بعد', ticketsEmptyBody: 'إذا كان لديك سؤال أو واجهت مشكلة، أنشئ تذكرتك الأولى.',
      submitTicket: 'إرسال التذكرة', replyPlaceholder: 'اكتب ردك…', replySend: 'إرسال',
      closeTicketAction: 'إغلاق التذكرة', closeTicketConfirm: 'هل تريد إغلاق هذه التذكرة؟', ticketClosedNotice: 'هذه التذكرة مغلقة ولا يمكن الرد عليها.',
      unreadLabel: 'رد جديد', conversationLabel: 'المحادثة', createdAtLabel: 'أُنشئت في {date}', lastActivityLabel: 'آخر نشاط {date}',
      youLabel: 'أنت', staffLabel: 'فريق دعم نافريا', subjectRequired: 'أدخل الموضوع.', messageRequired: 'أدخل الرسالة.',
      ticketListLabel: 'تذاكري', backToList: 'العودة إلى القائمة'
    },
    en: {
      close: 'Close', cancel: 'Cancel', save: 'Save', back: 'Back', loading: 'Loading…', errorGeneric: 'Something went wrong.', retry: 'Retry',
      supportTitle: 'Support', supportHint: 'File a new ticket or follow up on your previous conversations with support.',
      newTicketAction: 'New ticket', ticketSubjectLabel: 'Subject', ticketSubjectPlaceholder: 'Summarize the issue…',
      ticketCategoryLabel: 'Category', ticketMessageLabel: 'Message', ticketMessagePlaceholder: 'Describe your issue in detail…',
      categoryTechnical: 'Technical', categoryBilling: 'Billing', categoryAccount: 'Account', categoryOther: 'Other',
      statusOpen: 'Awaiting reply', statusWaitingUser: 'Waiting on you', statusResolved: 'Resolved', statusClosed: 'Closed',
      ticketsEmptyTitle: 'No tickets yet', ticketsEmptyBody: 'If you have a question or ran into a problem, file your first ticket.',
      submitTicket: 'Submit ticket', replyPlaceholder: 'Write your reply…', replySend: 'Send',
      closeTicketAction: 'Close ticket', closeTicketConfirm: 'Close this ticket?', ticketClosedNotice: 'This ticket is closed and can no longer receive replies.',
      unreadLabel: 'New reply', conversationLabel: 'Conversation', createdAtLabel: 'Created {date}', lastActivityLabel: 'Last activity {date}',
      youLabel: 'You', staffLabel: 'NAVRYA Support', subjectRequired: 'Enter a subject.', messageRequired: 'Enter a message.',
      ticketListLabel: 'My tickets', backToList: 'Back to list'
    },
    es: {
      close: 'Cerrar', cancel: 'Cancelar', save: 'Guardar', back: 'Volver', loading: 'Cargando…', errorGeneric: 'Algo salió mal.', retry: 'Reintentar',
      supportTitle: 'Soporte', supportHint: 'Abre un ticket nuevo o da seguimiento a tus conversaciones anteriores con soporte.',
      newTicketAction: 'Nuevo ticket', ticketSubjectLabel: 'Asunto', ticketSubjectPlaceholder: 'Resume el problema…',
      ticketCategoryLabel: 'Categoría', ticketMessageLabel: 'Mensaje', ticketMessagePlaceholder: 'Describe tu problema en detalle…',
      categoryTechnical: 'Técnico', categoryBilling: 'Facturación', categoryAccount: 'Cuenta', categoryOther: 'Otro',
      statusOpen: 'Esperando respuesta', statusWaitingUser: 'Esperando tu respuesta', statusResolved: 'Resuelto', statusClosed: 'Cerrado',
      ticketsEmptyTitle: 'Aún no hay tickets', ticketsEmptyBody: 'Si tienes una pregunta o un problema, abre tu primer ticket.',
      submitTicket: 'Enviar ticket', replyPlaceholder: 'Escribe tu respuesta…', replySend: 'Enviar',
      closeTicketAction: 'Cerrar ticket', closeTicketConfirm: '¿Cerrar este ticket?', ticketClosedNotice: 'Este ticket está cerrado y ya no puede recibir respuestas.',
      unreadLabel: 'Respuesta nueva', conversationLabel: 'Conversación', createdAtLabel: 'Creado el {date}', lastActivityLabel: 'Última actividad {date}',
      youLabel: 'Tú', staffLabel: 'Soporte NAVRYA', subjectRequired: 'Ingresa un asunto.', messageRequired: 'Ingresa un mensaje.',
      ticketListLabel: 'Mis tickets', backToList: 'Volver a la lista'
    }
  };

  function language() { var value = String(document.documentElement.lang || 'en').toLowerCase(); return messages[value] ? value : value.indexOf('ar') === 0 ? 'ar' : value.indexOf('es') === 0 ? 'es' : value.indexOf('fa') === 0 ? 'fa' : 'en'; }
  function t(key, vars) { var value = (messages[language()] && messages[language()][key]) || messages.en[key] || key; Object.keys(vars || {}).forEach(function (name) { value = value.replaceAll('{' + name + '}', vars[name]); }); return value; }
  function locale() { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' }[language()]; }
  function date(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch (_) { return '—'; } }
  window.TradeJournalSupportI18n = { t: t, language: language, locale: locale, date: date, direction: function () { return language() === 'fa' || language() === 'ar' ? 'rtl' : 'ltr'; }, messages: messages };
}());
