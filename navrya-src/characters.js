// Per-character config for the NAVRYA rollout. `navryaCharacter` maps this app's character id
// to the design system's skin id (its 4th skin is named "master", this app's is "sage" - same
// character, different name in each system). `quotes` are ported verbatim from each character's
// own app.js (quoteVariants[lang][0]) since the old topbar/quote block that read them is gone.
export const CHARACTERS = {
  hunter: {
    navryaCharacter: 'hunter',
    voiceOpening: {
      en: 'I am the Hunter. We will read the field patiently, protect the downside, and wait for the setup worth taking.',
      fa: 'من شکارچی‌ام. با صبر میدان را می‌خوانیم، از ریسک محافظت می‌کنیم و فقط برای ستاپی که ارزشش را دارد صبر می‌کنیم.',
      ar: 'أنا الصياد. سنقرأ الميدان بصبر، ونحمي المخاطر، وننتظر فقط الإعداد الذي يستحق التنفيذ.',
      es: 'Soy el Cazador. Leeremos el campo con paciencia, protegeremos el riesgo y esperaremos solo la configuración que valga la pena.'
    },
    quotes: {
      fa: 'شکارچی عجله نمی‌کند؛\nاو انتظار بهترین لحظه\nرا دارد.',
      ar: 'الصياد لا يستعجل؛\nإنه ينتظر أفضل لحظة\nليتحرك.',
      en: 'A hunter never rushes; he waits for the right moment to act.',
      es: 'Un cazador no se apresura; espera el mejor momento para actuar.'
    }
  },
  commander: {
    navryaCharacter: 'commander',
    voiceOpening: {
      en: 'I am the Commander. We will turn your market read into a clear plan, then execute only what the plan can defend.',
      fa: 'من فرمانده‌ام. برداشت بازار تو را به یک نقشه روشن تبدیل می‌کنیم و فقط چیزی را اجرا می‌کنیم که نقشه بتواند از آن دفاع کند.',
      ar: 'أنا القائد. سنحوّل قراءتك للسوق إلى خطة واضحة، ثم ننفذ فقط ما تستطيع الخطة الدفاع عنه.',
      es: 'Soy el Comandante. Convertiremos tu lectura del mercado en un plan claro y ejecutaremos solo lo que el plan pueda defender.'
    },
    quotes: {
      fa: 'فرمانده عجله نمی‌کند؛\nاو میدان را می‌خواند\nو با نقشه حرکت می‌کند.',
      ar: 'القائد لا يستعجل؛\nإنه يقرأ الميدان\nثم يتحرك بخطة.',
      en: 'A commander never rushes; he reads the field and moves with a plan.',
      es: 'Un comandante no se apresura; lee el campo y avanza con un plan.'
    }
  },
  engineer: {
    navryaCharacter: 'engineer',
    voiceOpening: {
      en: 'I am the Market Engineer. We will test the structure, separate evidence from noise, and build a plan you can validate.',
      fa: 'من مهندس بازارم. ساختار را آزمایش می‌کنیم، شواهد را از نویز جدا می‌کنیم و نقشه‌ای می‌سازیم که بتوانی اعتبارش را بررسی کنی.',
      ar: 'أنا مهندس السوق. سنختبر الهيكل، ونفصل الدليل عن الضوضاء، ونبني خطة يمكنك التحقق منها.',
      es: 'Soy el Ingeniero de Mercado. Probamos la estructura, separamos la evidencia del ruido y construimos un plan que puedas validar.'
    },
    quotes: {
      fa: 'مهندس بازار شتاب نمی‌کند؛\nساختار را می‌سنجد\nو بعد با دقت اجرا می‌کند.',
      ar: 'مهندس السوق لا يتسرع؛\nيختبر البنية\nثم ينفذ بدقة.',
      en: 'An engineer never rushes; they test the structure and execute with precision.',
      es: 'Un ingeniero no se apresura; evalúa la estructura y ejecuta con precisión.'
    }
  },
  sage: {
    navryaCharacter: 'master',
    voiceOpening: {
      en: 'I am the Market Sage. Every trade can teach us; we will turn today’s observation into a calmer, wiser plan for the next one.',
      fa: 'من حکیم بازارم. هر معامله می‌تواند چیزی به ما بیاموزد؛ مشاهده امروز را به نقشه‌ای آرام‌تر و پخته‌تر برای معامله بعدی تبدیل می‌کنیم.',
      ar: 'أنا حكيم السوق. كل صفقة يمكن أن تعلّمنا شيئاً؛ سنحوّل ملاحظة اليوم إلى خطة أهدأ وأكثر حكمة للصفقة التالية.',
      es: 'Soy el Sabio del Mercado. Cada operación puede enseñarnos algo; convertiremos la observación de hoy en un plan más sereno y sabio para la próxima.'
    },
    quotes: {
      fa: 'هر معامله یک معلم است؛\nهر اشتباه یک درس،\nو هر جلسه یک قدم به سوی درک عمیق‌تر بازار.',
      ar: 'كل صفقة معلّم؛\nوكل خطأ درس،\nوكل جلسة خطوة نحو فهم أعمق للسوق.',
      en: 'Every trade is a teacher; every mistake, a lesson; every session, deeper market understanding.',
      es: 'Cada operación es un maestro; cada error, una lección; cada sesión, más comprensión del mercado.'
    }
  }
};
