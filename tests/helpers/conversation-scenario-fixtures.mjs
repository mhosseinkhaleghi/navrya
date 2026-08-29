// Shared fixture data for Journey H2 Gate 2 tests (the matcher, the router, the admin contract
// route, and the public sync bundle contract) - the exact same 7 scenarios seeded into
// 041_conversation_scenarios.sql, in the published-bundle ROW shape
// (server/community/routes.conversation-scenarios-sync.mjs's own return shape), so every test
// file exercises real, representative content instead of inventing its own toy fixtures that
// could drift from what the real matcher/migration actually contain.

const RESPONSES = {
  'session.purpose': {
    fa: 'سشن یعنی همون فضایی که قبل از ورود به معامله، توش چارت رو می‌بینی، حرکت بازار رو دنبال می‌کنی و سناریوهات رو با دلیل ثبت می‌کنی — به‌جای اینکه سرراست بری تو معامله.',
    ar: 'الجلسة هي المكان الذي تراقب فيه الرسم البياني، وتتابع حركة السوق، وتسجّل سيناريوهاتك بمنطق واضح قبل الدخول في أي صفقة — بدلاً من الدخول مباشرة.',
    en: 'A Session is where you watch the chart, track market movement, and log your scenarios with real reasoning before you ever place a trade — instead of jumping straight into a position.',
    es: 'Una Sesión es donde observas el gráfico, sigues el movimiento del mercado y registras tus escenarios con una razón real antes de entrar en una operación — en lugar de entrar directamente.'
  },
  'pattern.purpose': {
    fa: 'پترن یعنی یک رفتار تکرارشونده‌ی بازار که یک بار با مراحلش ثبتش می‌کنی؛ بعد هر وقت همون رفتار رو توی یه سناریوی جدید دیدی، می‌تونی بهش لینکش کنی و ببینی چقدر واقعاً جواب داده.',
    ar: 'النمط هو سلوك متكرر في السوق تسجّله مرة واحدة بمراحله؛ وفي كل مرة ترى فيها نفس السلوك ضمن سيناريو جديد، يمكنك ربطه به ومعرفة مدى نجاحه فعلياً.',
    en: "A Pattern is a repeatable market behavior you record once, with its own stages; whenever you see that same behavior in a new scenario, you can link it and see how well it's actually performed over time.",
    es: 'Un Patrón es un comportamiento repetible del mercado que registras una vez, con sus propias etapas; cada vez que veas ese mismo comportamiento en un escenario nuevo, puedes vincularlo y ver qué tan bien ha funcionado en realidad.'
  },
  'strategy.purpose': {
    fa: 'استراتژی یعنی همون قانون‌های شخصی خودت برای ورود، خروج و مدیریت ریسک — یک‌بار می‌نویسیش، بعد هر معامله رو بهش لینک می‌کنی تا ببینی چقدر واقعاً طبق پلن پیش رفتی.',
    ar: 'الاستراتيجية هي قواعدك الخاصة للدخول والخروج وإدارة المخاطر — تكتبها مرة واحدة، ثم تربط كل صفقة بها لترى مدى التزامك الفعلي بالخطة.',
    en: 'A Strategy is your own written rules for entry, exit, and risk management — you write it once, then link every trade to it so you can see how closely you actually followed the plan.',
    es: 'Una Estrategia son tus propias reglas para la entrada, la salida y la gestión de riesgo — la escribes una vez y luego vinculas cada operación a ella para ver qué tan bien seguiste realmente el plan.'
  },
  'navrya.ai.what_can_you_do': {
    fa: 'می‌تونم برات فرم‌های بازی که رو صدا یا تایپ پر کنم، یه سشن یا معامله جدید بسازم، سوال‌هات درباره‌ی خود ناوریا رو جواب بدم، و اگه حالت روان‌شناس رو روشن کنی، درباره‌ی احساسات معامله‌گریت هم باهات حرف بزنم.',
    ar: 'يمكنني تعبئة أي نموذج مفتوح لديك عبر الصوت أو الكتابة، ومساعدتك في إنشاء جلسة أو صفقة جديدة، والإجابة عن أسئلتك حول نافريا نفسه، وإذا فعّلت وضع المعالج، التحدث معك عن نفسيتك في التداول.',
    en: 'I can fill in whatever form you have open through voice or text, help you create a new session or trade, answer questions about NAVRYA itself, and — with Therapist mode on — talk through your trading psychology with you.',
    es: 'Puedo completar cualquier formulario que tengas abierto por voz o texto, ayudarte a crear una nueva sesión u operación, responder preguntas sobre NAVRYA en sí, y — con el modo terapeuta activado — hablar contigo sobre tu psicología de trading.'
  },
  'dashboard.purpose': {
    fa: 'داشبورد همون صفحه‌ی اصلیه که خلاصه‌ی وضعیتت رو می‌بینی — معاملات باز، سشن‌های اخیر و دسترسی سریع به بقیه‌ی بخش‌ها، همه توی یه نگاه.',
    ar: 'لوحة التحكم هي شاشتك الرئيسية — ملخص سريع لصفقاتك المفتوحة، جلساتك الأخيرة، ووصول سريع لبقية الأقسام، كل ذلك بنظرة واحدة.',
    en: 'The Dashboard is your home screen — a quick summary of your open trades, recent sessions, and fast access to everything else, all in one glance.',
    es: 'El Panel es tu pantalla principal — un resumen rápido de tus operaciones abiertas, sesiones recientes y acceso rápido a todo lo demás, todo de un vistazo.'
  },
  'trade.open_count_query': {
    fa: 'الان {count} معامله باز داری.', ar: 'لديك حالياً {count} صفقة مفتوحة.',
    en: 'You currently have {count} open trades.', es: 'Actualmente tienes {count} operaciones abiertas.'
  },
  'trade.default_risk_query': {
    fa: 'ریسک پیش‌فرضت الان روی {value}% تنظیمه.', ar: 'مخاطرتك الافتراضية مضبوطة حالياً على {value}%.',
    en: 'Your default risk is currently set to {value}%.', es: 'Tu riesgo predeterminado está configurado actualmente en {value}%.'
  }
};

const SCENARIOS = [
  {
    key: 'session.purpose', domain: 'sessions', kind: 'faq', ctaActionId: 'session.create', surfaceBoost: ['sessions'],
    languages: {
      fa: {
        groups: [['سشن', 'جلسه معاملاتی', 'جلسه', 'session'], ['چیه', 'چیست', 'یعنی چی', 'به چه درد', 'چه کاربرد', 'چه فایده', 'چرا باید', 'چرا لازم', 'فایده اش', 'کاربردش']],
        strong: ['سشن چیه', 'سشن یعنی چی', 'فایده سشن چیه', 'این سشن به چه دردی میخوره', 'سشن به چه درد میخوره', 'سشن چیست', 'session چیه'],
        negative: ['بساز', 'ایجاد کن', 'یکی بساز', 'حذف کن', 'ببند', 'پاک کن', 'فعالم چیه', 'سشن فعالم']
      },
      en: {
        groups: [['session'], ['what is', 'what does', 'purpose of', 'point of', 'why do i need', 'why should i', 'what for', "what's the point"]],
        strong: ['what is a session', 'what does a session do', "what's a session for", 'what is the point of a session', 'why do i need a session'],
        negative: ['create a session', 'make a session', 'start a session', 'delete my session', 'close my session', 'cancel my session', 'which session is active', 'my active session']
      },
      ar: {
        groups: [['جلسة', 'الجلسة'], ['ما هي', 'ما هو', 'ما فائدة', 'لماذا احتاج', 'لماذا أحتاج', 'ما الذي يفعله']],
        strong: ['ما هي الجلسة', 'ما فائدة جلسة التداول', 'لماذا أحتاج إلى إنشاء جلسة'],
        negative: ['أنشئ', 'انشئ جلسة', 'احذف جلستي', 'أغلق جلستي', 'جلستي النشطة']
      },
      es: {
        groups: [['sesion'], ['que es', 'para que sirve', 'por que deberia', 'que hace', 'cual es el punto']],
        strong: ['que es una sesion', 'para que sirve una sesion de trading', 'por que necesito una sesion'],
        negative: ['crea una sesion', 'crea una sesion nueva', 'elimina mi sesion', 'cierra mi sesion', 'mi sesion activa']
      }
    }
  },
  {
    key: 'pattern.purpose', domain: 'strategies', kind: 'faq', ctaActionId: 'pattern.create', surfaceBoost: ['strategies'],
    languages: {
      fa: { groups: [['پترن', 'الگو'], ['چیه', 'چیست', 'یعنی چی', 'چه کاربرد', 'چه فایده']], strong: ['پترن چیه', 'الگو چیه', 'پترن یعنی چی', 'این پترن به چه دردی میخوره'], negative: ['پترن جدید بساز', 'یه پترن جدید بساز', 'ایجاد پترن', 'حذف پترن'] },
      en: { groups: [['pattern'], ['what is', 'what does', 'purpose of', 'point of']], strong: ['what is a pattern', 'what does a pattern do', "what's a pattern for"], negative: ['create a pattern', 'make a pattern', 'add a pattern', 'delete a pattern', 'new pattern'] },
      ar: { groups: [['نمط', 'النمط'], ['ما هو', 'ما هي', 'ما فائدة']], strong: ['ما هو النمط', 'ما فائدة النمط'], negative: ['أنشئ نمطا', 'أنشئ نمطا جديدا', 'احذف النمط'] },
      es: { groups: [['patron'], ['que es', 'para que sirve']], strong: ['que es un patron', 'para que sirve un patron'], negative: ['crea un patron', 'crea un patron nuevo', 'elimina el patron'] }
    }
  },
  {
    key: 'strategy.purpose', domain: 'strategies', kind: 'faq', ctaActionId: 'strategy.create', surfaceBoost: ['strategies'],
    languages: {
      fa: { groups: [['استراتژی'], ['چیه', 'چیست', 'یعنی چی', 'چه کاربرد', 'چه فایده']], strong: ['استراتژی چیه', 'استراتژی یعنی چی', 'این بخش استراتژی چیه'], negative: ['استراتژی جدید بساز', 'یه استراتژی بساز', 'ایجاد استراتژی', 'حذف استراتژی'] },
      en: { groups: [['strategy'], ['what is', 'what does', 'purpose of', 'point of']], strong: ['what is a strategy', 'what does a strategy do', "what's a strategy for"], negative: ['create a strategy', 'make a strategy', 'new strategy', 'delete a strategy'] },
      ar: { groups: [['استراتيجية', 'الاستراتيجية'], ['ما هي', 'ما هو', 'ما فائدة']], strong: ['ما هي الاستراتيجية', 'ما فائدة الاستراتيجية'], negative: ['أنشئ استراتيجية', 'أنشئ استراتيجية جديدة', 'احذف الاستراتيجية'] },
      es: { groups: [['estrategia'], ['que es', 'para que sirve']], strong: ['que es una estrategia', 'para que sirve una estrategia'], negative: ['crea una estrategia', 'crea una estrategia nueva', 'elimina la estrategia'] }
    }
  },
  {
    key: 'navrya.ai.what_can_you_do', domain: 'ai-assistant', kind: 'faq', ctaActionId: null, surfaceBoost: ['ai-assistant'],
    languages: {
      fa: { groups: [['هوش مصنوعی', 'دستیار', 'ناوریا', 'تو'], ['چیکار می‌کنی', 'چیکار میکنی', 'چه کاری می‌تونی', 'چه کارهایی بلدی', 'چیکارا بلدی', 'چیکار میتونی بکنی']], strong: ['تو چیکار می‌تونی بکنی', 'چه کارهایی بلدی', 'دستیار هوش مصنوعی چیکار می‌کنه'], negative: ['یه سشن باز کن', 'برام معامله باز کن', 'یه پترن بساز'] },
      en: { groups: [['you', 'assistant', 'ai', 'navrya'], ['what can you do', 'what do you do', 'what are you capable of', 'how can you help']], strong: ['what can you do', 'what can you help me with', 'what are you capable of'], negative: ['open a session', 'create a session', 'start a trade', 'open the calculator'] },
      ar: { groups: [['أنت', 'المساعد', 'نافريا'], ['ماذا يمكنك أن تفعل', 'بماذا يمكنك مساعدتي', 'ما الذي تستطيع فعله']], strong: ['ماذا يمكنك أن تفعل', 'بماذا تستطيع مساعدتي'], negative: ['افتح جلسة', 'أنشئ صفقة'] },
      es: { groups: [['tu', 'asistente', 'navrya'], ['que puedes hacer', 'en que puedes ayudarme', 'que eres capaz de hacer']], strong: ['que puedes hacer', 'en que puedes ayudarme'], negative: ['abre una sesion', 'crea una operacion'] }
    }
  },
  {
    key: 'dashboard.purpose', domain: 'dashboard', kind: 'faq', ctaActionId: null, surfaceBoost: ['dashboard'],
    languages: {
      fa: { groups: [['داشبورد', 'صفحه اصلی', 'پنل'], ['چیه', 'چیست', 'چیکار می‌کنه', 'چه کاری انجام میده']], strong: ['داشبورد چیه', 'این صفحه چیکار می‌کنه', 'داشبورد چیکار می‌کنه'], negative: [] },
      en: { groups: [['dashboard', 'home screen', 'home page'], ['what is', 'what does', 'purpose of', 'what for']], strong: ['what is the dashboard', 'what does the dashboard do', 'what is this page for'], negative: [] },
      ar: { groups: [['لوحة التحكم', 'الصفحة الرئيسية'], ['ما هي', 'ما هو', 'ماذا تفعل']], strong: ['ما هي لوحة التحكم', 'ماذا تفعل لوحة التحكم'], negative: [] },
      es: { groups: [['panel', 'tablero', 'pantalla principal'], ['que es', 'que hace', 'para que sirve']], strong: ['que es el panel', 'que hace el panel', 'para que sirve esta pagina'], negative: [] }
    }
  },
  {
    key: 'trade.open_count_query', domain: 'trades', kind: 'data_query', dataQueryRef: 'trade.open_count', ctaActionId: null, surfaceBoost: ['dashboard', 'sessions'],
    languages: {
      fa: { groups: [['معامله', 'ترید', 'پوزیشن'], ['چند تا', 'چندتا', 'چند', 'دارم']], strong: ['چند تا معامله باز دارم', 'چند تا ترید باز دارم', 'چند تا پوزیشن باز دارم'], negative: ['ریسک پیش فرض', 'ریسک من چنده'] },
      en: { groups: [['open trade', 'open trades', 'open position', 'open positions'], ['how many', 'what is my', 'count']], strong: ['how many open trades do i have', 'how many open trades', 'how many trades do i have open'], negative: ['default risk', 'my risk', "what's my risk"] },
      ar: { groups: [['صفقة مفتوحة', 'صفقات مفتوحة', 'مركز مفتوح'], ['كم', 'ما عدد']], strong: ['كم صفقة مفتوحة لدي', 'كم عدد الصفقات المفتوحة لدي'], negative: ['المخاطرة الافتراضية', 'مخاطرتي'] },
      es: { groups: [['operacion abierta', 'operaciones abiertas'], ['cuantas', 'cuantos', 'cuanto']], strong: ['cuantas operaciones abiertas tengo', 'cuantas operaciones tengo abiertas'], negative: ['riesgo predeterminado', 'mi riesgo'] }
    }
  },
  {
    key: 'trade.default_risk_query', domain: 'trades', kind: 'data_query', dataQueryRef: 'trade.default_risk', ctaActionId: null, surfaceBoost: ['dashboard', 'sessions'],
    languages: {
      fa: { groups: [['ریسک پیش فرض', 'ریسک پیش‌فرض', 'ریسک من'], ['چنده', 'چقدره', 'چیه']], strong: ['ریسک پیش فرض من چنده', 'ریسک پیش فرضم چقدره', 'ریسک من چنده'], negative: ['چند تا معامله', 'چند تا ترید', 'معامله باز دارم'] },
      en: { groups: [['default risk', 'my risk'], ['what is', 'how much', "what's"]], strong: ['what is my default risk', "what's my default risk", 'how much is my default risk'], negative: ['open trades', 'open positions', 'how many trades'] },
      ar: { groups: [['المخاطرة الافتراضية', 'مخاطرتي'], ['ما هي', 'كم']], strong: ['ما هي مخاطرتي الافتراضية', 'كم هي مخاطرتي الافتراضية'], negative: ['صفقة مفتوحة', 'صفقات مفتوحة'] },
      es: { groups: [['riesgo predeterminado', 'mi riesgo'], ['cual es', 'cuanto es', 'cual']], strong: ['cual es mi riesgo predeterminado', 'cuanto es mi riesgo predeterminado'], negative: ['operaciones abiertas', 'operacion abierta'] }
    }
  }
];

// Returns the 7 scenarios as published-bundle ROWS - the exact shape
// GET /api/sync/conversation-scenarios returns and ai-conversation-matcher.js's
// scenarioFromBundleRow() expects.
export function buildFixtureBundleRows() {
  return SCENARIOS.map((s, idx) => ({
    id: 'convscn-fixture-' + idx, scenarioKey: s.key, domain: s.domain, kind: s.kind,
    dataQueryRef: s.dataQueryRef || null, ctaActionId: s.ctaActionId || null,
    allowedProcesses: null, allowedSteps: null, publishedVersion: 1,
    definition: {
      surfaceBoost: s.surfaceBoost, languages: s.languages,
      responses: {
        fa: { written: RESPONSES[s.key].fa, voiceReply: RESPONSES[s.key].fa },
        en: { written: RESPONSES[s.key].en, voiceReply: RESPONSES[s.key].en },
        ar: { written: RESPONSES[s.key].ar, voiceReply: RESPONSES[s.key].ar },
        es: { written: RESPONSES[s.key].es, voiceReply: RESPONSES[s.key].es }
      }
    }
  }));
}

// A minimal surface_help fixture, for the active-process admission tests - scoped to the
// Strategy editor's Risk Management panel specifically, matching the brief's own worked example
// ("Risk Management یعنی چی؟" while a Strategy form is open).
export function buildSurfaceHelpFixtureRow() {
  return {
    id: 'convscn-fixture-surface-help-1', scenarioKey: 'strategy.risk_management.field_help', domain: 'strategies',
    kind: 'surface_help', dataQueryRef: null, ctaActionId: null,
    allowedProcesses: ['strategy-editor-'], allowedSteps: null, publishedVersion: 1,
    definition: {
      surfaceBoost: null,
      languages: {
        fa: { groups: [['ریسک منیجمنت', 'مدیریت ریسک'], ['یعنی چی', 'چیه', 'چیست']], strong: ['ریسک منیجمنت یعنی چی', 'مدیریت ریسک چیه'], negative: [] },
        en: { groups: [['risk management'], ['what is', 'what does', "what's"]], strong: ['what is risk management', "what's risk management"], negative: [] },
        ar: { groups: [['إدارة المخاطر'], ['ما هي', 'ما هو']], strong: ['ما هي إدارة المخاطر'], negative: [] },
        es: { groups: [['gestion de riesgo', 'gestion del riesgo'], ['que es']], strong: ['que es la gestion de riesgo'], negative: [] }
      },
      responses: {
        fa: { written: 'مدیریت ریسک یعنی همون قوانینی که مشخص می‌کنن چقدر روی هر معامله ریسک می‌کنی و چند تا معامله همزمان باز نگه می‌داری.', voiceReply: 'مدیریت ریسک یعنی همون قوانینی که مشخص می‌کنن چقدر روی هر معامله ریسک می‌کنی.' },
        en: { written: 'Risk management is the set of rules that decide how much you risk on each trade and how many trades you keep open at once.', voiceReply: 'Risk management is the rules for how much you risk per trade.' },
        ar: { written: 'إدارة المخاطر هي مجموعة القواعد التي تحدد مقدار المخاطرة في كل صفقة وعدد الصفقات المفتوحة في نفس الوقت.', voiceReply: 'إدارة المخاطر هي قواعد تحديد مقدار المخاطرة في كل صفقة.' },
        es: { written: 'La gestión de riesgo son las reglas que deciden cuánto arriesgas en cada operación y cuántas operaciones mantienes abiertas a la vez.', voiceReply: 'La gestión de riesgo son las reglas de cuánto arriesgas por operación.' }
      }
    }
  };
}
