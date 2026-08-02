(function () {
  'use strict';
  var messages = {
    fa: {
      close: 'بستن', cancel: 'انصراف', save: 'ذخیره', back: 'بازگشت', listingInsufficientData: 'داده کافی نیست',
      communityTitle: 'انجمن', communityHint: 'ایده‌ها، الگوها و استراتژی‌های معاملاتی‌ات را به اشتراک بگذار و مستقیم با فروشنده‌ها گفتگو کن.',
      tabFeed: 'فید', tabMarketplace: 'بازارچه', tabMessages: 'پیام‌ها',
      feedComposerPlaceholder: 'چیزی با انجمن به اشتراک بگذار…', feedPost: 'ارسال', feedAttachImage: 'پیوست تصویر', feedEmpty: 'هنوز پستی ثبت نشده. اولین نفر باش.',
      commentPlaceholder: 'نظرت را بنویس…', commentSend: 'ارسال', commentsEmpty: 'هنوز نظری ثبت نشده.',
      reportAction: 'گزارش', reportReasonPlaceholder: 'چرا این مورد را گزارش می‌کنی؟', reportSubmit: 'ارسال گزارش', reportSubmitted: 'گزارش ثبت شد.',
      marketplaceTitle: 'بازارچه', marketplaceEmpty: 'هنوز آگهی‌ای ثبت نشده.', marketplaceFilterAll: 'همه', marketplaceFilterPatterns: 'الگوها', marketplaceFilterStrategies: 'استراتژی‌ها',
      listingSuccessRate: 'نرخ موفقیت', listingFailureRate: 'نرخ شکست', listingSampleSize: 'معامله', listingPrice: 'قیمت', listingAsOf: 'شواهد تا تاریخ {date}',
      listingPreview: 'پیش‌نمایش رایگان', listingFull: 'محتوای کامل', listingLocked: 'بعد از خرید باز می‌شود', listingBuy: 'خرید (آزمایشی)', listingBought: 'خریداری شد',
      listingRateAction: 'امتیاز به این آگهی', listingRatingsTitle: 'امتیازها و نظرات', listingNoRatings: 'هنوز امتیازی ثبت نشده.', listingMessageSeller: 'پیام به فروشنده', listingCreatorLabel: 'ارائه از',
      publishListingTitle: 'ثبت در بازارچه', editListingTitle: 'ویرایش آگهی', publishTitleLabel: 'عنوان آگهی', publishDescriptionLabel: 'توضیحات', publishPriceLabel: 'قیمت',
      publishCurrencyLabel: 'واحد پول', publishPreviewCountLabel: 'چقدر در پیش‌نمایش رایگان باشد', publishSubmit: 'انتشار', publishSave: 'ذخیره', publishSuccess: 'آگهی منتشر شد.',
      notListedYet: 'هنوز در بازارچه ثبت نشده.', listedBadge: 'در بازارچه ثبت شده', editListing: 'ویرایش آگهی', refreshEvidence: 'به‌روزرسانی شواهد',
      messagesTitle: 'پیام‌ها', messagesEmpty: 'هنوز گفتگویی نیست.', threadPlaceholder: 'پیامت را بنویس…', threadSend: 'ارسال', mockBadge: 'خرید آزمایشی — بدون پرداخت واقعی'
    },
    ar: {
      close: 'إغلاق', cancel: 'إلغاء', save: 'حفظ', back: 'رجوع', listingInsufficientData: 'بيانات غير كافية',
      communityTitle: 'المجتمع', communityHint: 'شارك الأفكار والأنماط والاستراتيجيات، وتحدث مباشرة مع البائعين.',
      tabFeed: 'الخلاصة', tabMarketplace: 'السوق', tabMessages: 'الرسائل',
      feedComposerPlaceholder: 'شارك شيئاً مع المجتمع…', feedPost: 'نشر', feedAttachImage: 'إرفاق صورة', feedEmpty: 'لا توجد منشورات بعد. كن أول من يشارك.',
      commentPlaceholder: 'اكتب تعليقاً…', commentSend: 'إرسال', commentsEmpty: 'لا توجد تعليقات بعد.',
      reportAction: 'إبلاغ', reportReasonPlaceholder: 'لماذا تبلغ عن هذا؟', reportSubmit: 'إرسال البلاغ', reportSubmitted: 'تم إرسال البلاغ.',
      marketplaceTitle: 'السوق', marketplaceEmpty: 'لا توجد إعلانات بعد.', marketplaceFilterAll: 'الكل', marketplaceFilterPatterns: 'الأنماط', marketplaceFilterStrategies: 'الاستراتيجيات',
      listingSuccessRate: 'معدل النجاح', listingFailureRate: 'معدل الفشل', listingSampleSize: 'صفقة', listingPrice: 'السعر', listingAsOf: 'البيانات حتى {date}',
      listingPreview: 'معاينة مجانية', listingFull: 'المحتوى الكامل', listingLocked: 'يُفتح بعد الشراء', listingBuy: 'شراء (تجريبي)', listingBought: 'تم الشراء',
      listingRateAction: 'قيّم هذا الإعلان', listingRatingsTitle: 'التقييمات والمراجعات', listingNoRatings: 'لا توجد تقييمات بعد.', listingMessageSeller: 'مراسلة البائع', listingCreatorLabel: 'بواسطة',
      publishListingTitle: 'إدراج في السوق', editListingTitle: 'تعديل الإعلان', publishTitleLabel: 'عنوان الإعلان', publishDescriptionLabel: 'الوصف', publishPriceLabel: 'السعر',
      publishCurrencyLabel: 'العملة', publishPreviewCountLabel: 'مقدار المعاينة المجانية', publishSubmit: 'نشر', publishSave: 'حفظ', publishSuccess: 'تم نشر الإعلان.',
      notListedYet: 'لم يُدرج في السوق بعد.', listedBadge: 'مُدرج في السوق', editListing: 'تعديل الإعلان', refreshEvidence: 'تحديث البيانات',
      messagesTitle: 'الرسائل', messagesEmpty: 'لا توجد محادثات بعد.', threadPlaceholder: 'اكتب رسالة…', threadSend: 'إرسال', mockBadge: 'شراء تجريبي — بلا دفع حقيقي'
    },
    en: {
      close: 'Close', cancel: 'Cancel', save: 'Save', back: 'Back', listingInsufficientData: 'Insufficient data',
      communityTitle: 'Community', communityHint: 'Share ideas, trade patterns and strategies, and talk directly with sellers.',
      tabFeed: 'Feed', tabMarketplace: 'Marketplace', tabMessages: 'Messages',
      feedComposerPlaceholder: 'Share something with the community…', feedPost: 'Post', feedAttachImage: 'Attach image', feedEmpty: 'No posts yet. Be the first to share something.',
      commentPlaceholder: 'Write a comment…', commentSend: 'Send', commentsEmpty: 'No comments yet.',
      reportAction: 'Report', reportReasonPlaceholder: 'Why are you reporting this?', reportSubmit: 'Submit report', reportSubmitted: 'Report submitted.',
      marketplaceTitle: 'Marketplace', marketplaceEmpty: 'No listings yet.', marketplaceFilterAll: 'All', marketplaceFilterPatterns: 'Patterns', marketplaceFilterStrategies: 'Strategies',
      listingSuccessRate: 'Success rate', listingFailureRate: 'Failure rate', listingSampleSize: 'trades', listingPrice: 'Price', listingAsOf: 'Evidence as of {date}',
      listingPreview: 'Free preview', listingFull: 'Full content', listingLocked: 'Unlocks after purchase', listingBuy: 'Purchase (mock)', listingBought: 'Purchased',
      listingRateAction: 'Rate this listing', listingRatingsTitle: 'Ratings & reviews', listingNoRatings: 'No ratings yet.', listingMessageSeller: 'Message seller', listingCreatorLabel: 'By',
      publishListingTitle: 'List on marketplace', editListingTitle: 'Edit listing', publishTitleLabel: 'Listing title', publishDescriptionLabel: 'Description', publishPriceLabel: 'Price',
      publishCurrencyLabel: 'Currency', publishPreviewCountLabel: 'How much to include in the free preview', publishSubmit: 'Publish', publishSave: 'Save', publishSuccess: 'Listing published.',
      notListedYet: 'Not listed on the marketplace yet.', listedBadge: 'Listed on marketplace', editListing: 'Edit listing', refreshEvidence: 'Refresh evidence',
      messagesTitle: 'Messages', messagesEmpty: 'No conversations yet.', threadPlaceholder: 'Write a message…', threadSend: 'Send', mockBadge: 'Mock purchase — no real payment'
    },
    es: {
      close: 'Cerrar', cancel: 'Cancelar', save: 'Guardar', back: 'Volver', listingInsufficientData: 'Datos insuficientes',
      communityTitle: 'Comunidad', communityHint: 'Comparte ideas, patrones y estrategias, y habla directamente con los vendedores.',
      tabFeed: 'Feed', tabMarketplace: 'Mercado', tabMessages: 'Mensajes',
      feedComposerPlaceholder: 'Comparte algo con la comunidad…', feedPost: 'Publicar', feedAttachImage: 'Adjuntar imagen', feedEmpty: 'Aún no hay publicaciones. Sé el primero en compartir algo.',
      commentPlaceholder: 'Escribe un comentario…', commentSend: 'Enviar', commentsEmpty: 'Aún no hay comentarios.',
      reportAction: 'Reportar', reportReasonPlaceholder: '¿Por qué reportas esto?', reportSubmit: 'Enviar reporte', reportSubmitted: 'Reporte enviado.',
      marketplaceTitle: 'Mercado', marketplaceEmpty: 'Aún no hay anuncios.', marketplaceFilterAll: 'Todos', marketplaceFilterPatterns: 'Patrones', marketplaceFilterStrategies: 'Estrategias',
      listingSuccessRate: 'Tasa de éxito', listingFailureRate: 'Tasa de fallo', listingSampleSize: 'operaciones', listingPrice: 'Precio', listingAsOf: 'Evidencia al {date}',
      listingPreview: 'Vista previa gratuita', listingFull: 'Contenido completo', listingLocked: 'Se desbloquea tras la compra', listingBuy: 'Comprar (simulado)', listingBought: 'Comprado',
      listingRateAction: 'Calificar este anuncio', listingRatingsTitle: 'Calificaciones y reseñas', listingNoRatings: 'Aún no hay calificaciones.', listingMessageSeller: 'Mensaje al vendedor', listingCreatorLabel: 'Por',
      publishListingTitle: 'Publicar en el mercado', editListingTitle: 'Editar anuncio', publishTitleLabel: 'Título del anuncio', publishDescriptionLabel: 'Descripción', publishPriceLabel: 'Precio',
      publishCurrencyLabel: 'Moneda', publishPreviewCountLabel: 'Cuánto incluir en la vista previa gratuita', publishSubmit: 'Publicar', publishSave: 'Guardar', publishSuccess: 'Anuncio publicado.',
      notListedYet: 'Aún no está en el mercado.', listedBadge: 'Publicado en el mercado', editListing: 'Editar anuncio', refreshEvidence: 'Actualizar evidencia',
      messagesTitle: 'Mensajes', messagesEmpty: 'Aún no hay conversaciones.', threadPlaceholder: 'Escribe un mensaje…', threadSend: 'Enviar', mockBadge: 'Compra simulada — sin pago real'
    }
  };

  function language() { var value = String(document.documentElement.lang || 'en').toLowerCase(); return messages[value] ? value : value.indexOf('ar') === 0 ? 'ar' : value.indexOf('es') === 0 ? 'es' : value.indexOf('fa') === 0 ? 'fa' : 'en'; }
  function t(key, vars) { var value = (messages[language()] && messages[language()][key]) || messages.en[key] || key; Object.keys(vars || {}).forEach(function (name) { value = value.replaceAll('{' + name + '}', vars[name]); }); return value; }
  function locale() { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' }[language()]; }
  function number(value, options) { if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'; return new Intl.NumberFormat(locale(), options || { maximumFractionDigits: 2 }).format(Number(value)); }
  function date(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); } catch (_) { return '—'; } }
  window.TradeJournalCommunityI18n = { t: t, language: language, locale: locale, number: number, date: date, direction: function () { return language() === 'fa' || language() === 'ar' ? 'rtl' : 'ltr'; }, messages: messages };
}());
