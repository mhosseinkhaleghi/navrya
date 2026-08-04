// Per-character config for the NAVRYA rollout. `navryaCharacter` maps this app's character id
// to the design system's skin id (its 4th skin is named "master", this app's is "sage" - same
// character, different name in each system). `quotes` are ported verbatim from each character's
// own app.js (quoteVariants[lang][0]) since the old topbar/quote block that read them is gone.
export const CHARACTERS = {
  hunter: {
    navryaCharacter: 'hunter',
    quotes: {
      fa: 'شکارچی عجله نمی‌کند؛\nاو انتظار بهترین لحظه\nرا دارد.',
      ar: 'الصياد لا يستعجل؛\nإنه ينتظر أفضل لحظة\nليتحرك.',
      en: 'A hunter never rushes; he waits for the right moment to act.',
      es: 'Un cazador no se apresura; espera el mejor momento para actuar.'
    }
  },
  commander: {
    navryaCharacter: 'commander',
    quotes: {
      fa: 'فرمانده عجله نمی‌کند؛\nاو میدان را می‌خواند\nو با نقشه حرکت می‌کند.',
      ar: 'القائد لا يستعجل؛\nإنه يقرأ الميدان\nثم يتحرك بخطة.',
      en: 'A commander never rushes; he reads the field and moves with a plan.',
      es: 'Un comandante no se apresura; lee el campo y avanza con un plan.'
    }
  },
  engineer: {
    navryaCharacter: 'engineer',
    quotes: {
      fa: 'مهندس بازار شتاب نمی‌کند؛\nساختار را می‌سنجد\nو بعد با دقت اجرا می‌کند.',
      ar: 'مهندس السوق لا يتسرع؛\nيختبر البنية\nثم ينفذ بدقة.',
      en: 'An engineer never rushes; they test the structure and execute with precision.',
      es: 'Un ingeniero no se apresura; evalúa la estructura y ejecuta con precisión.'
    }
  },
  sage: {
    navryaCharacter: 'master',
    quotes: {
      fa: 'هر معامله یک معلم است؛\nهر اشتباه یک درس،\nو هر جلسه یک قدم به سوی درک عمیق‌تر بازار.',
      ar: 'كل صفقة معلّم؛\nوكل خطأ درس،\nوكل جلسة خطوة نحو فهم أعمق للسوق.',
      en: 'Every trade is a teacher; every mistake, a lesson; every session, deeper market understanding.',
      es: 'Cada operación es un maestro; cada error, una lección; cada sesión, más comprensión del mercado.'
    }
  }
};
