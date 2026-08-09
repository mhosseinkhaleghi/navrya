export type Lang = 'en' | 'fa' | 'ar' | 'es';

export type Feature = {
  number: string;
  label: string;
  title: string;
  body: string;
  proof: string;
  rust?: boolean;
};

export type Dictionary = {
  localeName: string;
  skip: string;
  nav: { fieldManual: string; openJournal: string; language: string };
  hero: {
    eyebrow: string;
    line1: string;
    line2: string;
    body: string;
    primary: string;
    secondary: string;
    thesisLabel: string;
    thesis: string;
  };
  opening: { act: string; title: string; line: string };
  draw: { act: string; title: string; line: string; features: Feature[] };
  flight: { act: string; title: string; line: string; features: Feature[] };
  miss: { act: string; title: string; line: string; features: Feature[] };
  field: {
    act: string;
    title: string;
    line: string;
    local: string;
    browser: string;
    desktopLabel: string;
    mobileLabel: string;
    session: string;
    probability: string;
    review: string;
    pattern: string;
  };
  long: {
    act: string;
    title: string;
    body: string;
    gate: string;
    levels: string[];
    thresholds: string[];
    contribution: Feature;
    honestyTitle: string;
    marketplace: string;
    ai: string;
    primary: string;
    secondary: string;
    foot: string;
  };
  scenes: string[];
  rail: string[];
  common: { evidence: string; act: string; close: string };
};

export const dictionaries: Record<Lang, Dictionary> = {
  en: {
    localeName: 'English',
    skip: 'Skip to the field manual',
    nav: {
      fieldManual: 'Hunter field manual',
      openJournal: 'Open the journal',
      language: 'Change language',
    },
    hero: {
      eyebrow: 'NAVRYA · HUNTER PATH',
      line1: "You don't need a better entry.",
      line2: 'You need a better record.',
      body: 'A local-first journal for people who trade Bitcoin intraday and refuse to learn the same lesson twice.',
      primary: 'Start the Hunter record',
      secondary: 'Read the field manual',
      thesisLabel: 'The rule',
      thesis: "A hunter's value is not the kill. It is everything done before the shot, and everything written down after the miss.",
    },
    opening: {
      act: '01 · THE OPENING',
      title: 'There it is.',
      line: 'The setup appears. The urge to shoot appears with it. NAVRYA gives the first one a record before the second one becomes a trade.',
    },
    draw: {
      act: '02 · THE DRAW',
      title: 'The outcome starts before the order.',
      line: 'Preparation is where an impression becomes a falsifiable plan, a reusable pattern, and a playbook with its own rules.',
      features: [
        {
          number: '01',
          label: 'PREPARATION',
          title: 'Write the scenario before the candle',
          body: 'Open a Session, attach 5m through 1D charts, and write the condition that proves the scenario wrong. Probability remains append-only, so every revision stays visible.',
          proof: 'Nothing overwritten. Every probability revision kept.',
        },
        {
          number: '02',
          label: 'MARKET COGNITION',
          title: 'Name the Pattern, then defend it',
          body: 'Build ordered stages, set a completion threshold, and attach reference screenshots up to 15 MB. Each Pattern keeps its own report across scenarios and linked trades.',
          proof: 'Insufficient data stays insufficient. No fabricated zeroes.',
        },
        {
          number: '03',
          label: 'STRATEGY',
          title: 'Keep one playbook for each way you trade',
          body: 'Position management, risk, framework, training, attachments, chat, summary, and detection history stay scoped to their Strategy. Delete one and the trades survive, unlinked.',
          proof: 'A 72-hour detection funnel belongs to each Strategy.',
        },
      ],
    },
    flight: {
      act: '03 · THE FLIGHT',
      title: 'The part everyone mistakes for the whole craft.',
      line: 'Execution moves fast. The rules that contain it should already be standing still.',
      features: [
        {
          number: '04',
          label: 'THE MATH',
          title: 'Size it before you feel it',
          body: 'Enter any two values and the calculator works through stop distance, risk, size, leverage, isolated liquidation, weighted multi-target R:R, commission, and breakeven.',
          proof: 'Up to 8 bidirectional passes. Manually locked fields stay locked.',
        },
        {
          number: '05',
          label: 'EXECUTION',
          title: 'Log the trade you actually took',
          body: 'Capture status, timeframe, observed concepts and Patterns, screenshots, and up to 3 dominant emotions. Stress, focus, and commitment are normalized from 1 to 10.',
          proof: 'Quick-log carries a deliberate negative discipline impact.',
        },
      ],
    },
    miss: {
      act: '04 · THE MISS',
      title: 'You missed.',
      line: 'The market moves on. Your evidence should not. Closing the chart now would throw away the part that can change the next decision.',
      features: [
        {
          number: '06',
          label: 'AFTER THE SHOT',
          title: 'Reflection starts when the trade closes',
          body: 'A post-trade prompt waits until close. A cool-down timer creates distance. A monthly checklist names 7 curated biases without turning reflection into diagnosis.',
          proof: 'A mirror, not a verdict.',
        },
        {
          number: '07',
          label: 'SELF-KNOWLEDGE',
          title: 'Every red flag keeps its receipt',
          body: 'Optional intake becomes continuous tracking for triggers, pre-trade context, and red flags. Every flag carries the trade IDs that produced it.',
          proof: 'Distress language routes to a calm, non-diagnostic card and a professional referral.',
          rust: true,
        },
        {
          number: '08',
          label: 'REVIEW',
          title: 'Follow the whole trail back',
          body: 'Filter week, month, quarter, all-time, custom ranges, or a Pattern. Read the detection-to-open-to-closed funnel, equity curve, activity, and a calendar shaded by daily P&L.',
          proof: 'Reports are drawn on native canvas. Each trade links back to its record.',
        },
      ],
    },
    field: {
      act: '05 · THE FIELD KIT',
      title: 'Four languages. Both directions. One record.',
      line: 'Persian, Arabic, English, and Spanish live in the same journal, with real RTL, Gregorian and Jalali dates, and IANA market clocks for New York, London, Tokyo, and Sydney.',
      local: 'Local-first · works offline',
      browser: 'Charts, Patterns, Sessions, and trades land in your browser first, then sync in the background.',
      desktopLabel: 'SESSION WORKSPACE',
      mobileLabel: 'TRADE WIZARD',
      session: 'SESSION 08:42',
      probability: 'SCENARIO · 68%',
      review: 'REVIEW QUEUED',
      pattern: 'PATTERN · STAGE 03',
    },
    long: {
      act: '06 · THE LONG HUNT',
      title: 'Seven levels. None of them buyable.',
      body: 'Experience lands on complete, verifiable work: a Session closed with an outcome, a trade reviewed, a Pattern resolved against a real scenario. Profit, win rate, and trade count do not level you up.',
      gate: 'XP alone is not mastery. Level 6 also requires that no single domain holds more than 60% of the total.',
      levels: ['Newcomer', 'Market apprentice', 'Analyst', 'Disciplined trader', 'Strategist', 'Trading master', 'Grand market master'],
      thresholds: ['0', '100', '300', '700', '1500', '3000', '6000'],
      contribution: {
        number: '09',
        label: 'CONTRIBUTION',
        title: 'Publish a Pattern with its evidence',
        body: 'A listing pairs occurrence rate with the sample size behind it. Rating requires a real purchase and the database, not the interface, enforces that rule.',
        proof: 'A bare percentage never stands alone.',
      },
      honestyTitle: 'Read this before you continue',
      marketplace: 'Marketplace purchases are mock-only in this version.',
      ai: 'The AI assistant requires your own API key. The key stays in your browser, and form changes always wait for preview and approval.',
      primary: 'Start your first Session',
      secondary: 'Return to the opening',
      foot: 'Local-first · Persian, Arabic, English, Spanish · Built for intraday Bitcoin traders who keep receipts.',
    },
    scenes: [
      'The Hunter stands at the edge of a sunlit forest valley.',
      'A stag appears in the clearing while the Hunter watches.',
      'The Hunter holds a bow at full draw.',
      'An arrow flies horizontally through the forest.',
      'The arrow is buried in a tree while the stag escapes.',
      'The Hunter stands quietly in the deep forest after the shot.',
    ],
    rail: ['Opening', 'Draw', 'Flight', 'Miss', 'Field kit', 'Long hunt'],
    common: { evidence: 'EVIDENCE', act: 'ACT', close: 'Close' },
  },

  fa: {
    localeName: 'فارسی',
    skip: 'رفتن به دفترچه‌ی شکارچی',
    nav: {
      fieldManual: 'دفترچه‌ی شکارچی',
      openJournal: 'باز کردن ژورنال',
      language: 'تغییر زبان',
    },
    hero: {
      eyebrow: 'NAVRYA · مسیر HUNTER',
      line1: 'ورود بهتر مشکل تو نیست.',
      line2: 'ثبت بهتر مشکل توست.',
      body: 'یک ژورنال local-first برای معامله‌گرهای intraday بیت‌کوین که حاضر نیستند یک درس را دوبار با پول واقعی یاد بگیرند.',
      primary: 'ثبت Hunter را شروع کن',
      secondary: 'دفترچه را بخوان',
      thesisLabel: 'قاعده',
      thesis: 'ارزش شکارچی به شکار نیست؛ به تمام کارهای قبل از رها کردن تیر و تمام چیزهایی‌ست که بعد از خطا ثبت می‌کند.',
    },
    opening: {
      act: '01 · گشایش',
      title: 'پیدایش شد.',
      line: 'Setup ظاهر می‌شود و میل شلیک هم با آن می‌آید. NAVRYA اولی را ثبت می‌کند، پیش از آن‌که دومی تبدیل به معامله شود.',
    },
    draw: {
      act: '02 · کشش',
      title: 'نتیجه، قبل از سفارش شروع می‌شود.',
      line: 'در آماده‌سازی، برداشت تو تبدیل می‌شود به سناریوی ابطال‌پذیر، Pattern قابل‌استفاده و Strategy با قواعد مستقل.',
      features: [
        {
          number: '01',
          label: 'آماده‌سازی',
          title: 'سناریو را قبل از کندل بنویس',
          body: 'یک Session باز کن، چارت‌های 5m تا 1D را بچسبان و شرطی را بنویس که سناریو را باطل می‌کند. تاریخچه‌ی احتمال append-only است؛ هیچ بازنویسی گم نمی‌شود.',
          proof: 'هیچ‌چیز overwrite نمی‌شود. تمام تغییرهای احتمال می‌مانند.',
        },
        {
          number: '02',
          label: 'شناخت بازار',
          title: 'Pattern را نام ببر، بعد از آن دفاع کن',
          body: 'مرحله‌ها را مرتب کن، آستانه‌ی تکمیل بساز و تصویر مرجع تا 15 MB اضافه کن. هر Pattern گزارش خودش را بین سناریوها و معامله‌های متصل نگه می‌دارد.',
          proof: 'داده‌ی ناکافی همان داده‌ی ناکافی می‌ماند؛ صفر ساختگی نداریم.',
        },
        {
          number: '03',
          label: 'STRATEGY',
          title: 'برای هر مدل معامله، یک playbook جدا نگه دار',
          body: 'مدیریت پوزیشن، Risk، چارچوب، تمرین، فایل‌ها، chat، summary و تاریخچه‌ی detection در Strategy خودشان می‌مانند. حذف Strategy فقط اتصال معامله را برمی‌دارد.',
          proof: 'هر Strategy قیف detection مستقل 72 ساعته دارد.',
        },
      ],
    },
    flight: {
      act: '03 · پرواز',
      title: 'همان بخشی که همه با کل کار اشتباه می‌گیرند.',
      line: 'Execution سریع است. قواعدی که آن را مهار می‌کنند باید از قبل بی‌حرکت سر جایشان باشند.',
      features: [
        {
          number: '04',
          label: 'محاسبه',
          title: 'قبل از احساس، اندازه را حساب کن',
          body: 'دو مقدار بده تا calculator فاصله‌ی Stop، Risk، حجم، Leverage، liquidation ایزوله، R:R چندهدفه‌ی وزنی، commission و breakeven را حل کند.',
          proof: 'تا 8 دور حل دوطرفه. فیلد قفل‌شده دست‌نخورده می‌ماند.',
        },
        {
          number: '05',
          label: 'EXECUTION',
          title: 'همان معامله‌ای را ثبت کن که واقعاً گرفتی',
          body: 'Status، timeframe، concept و Patternهای دیده‌شده، screenshot و حداکثر 3 احساس غالب را ثبت کن. Stress، focus و commitment از 1 تا 10 نرمال می‌شوند.',
          proof: 'Quick-log عمداً اثر منفی روی discipline score دارد.',
        },
      ],
    },
    miss: {
      act: '04 · خطا',
      title: 'زدی و نخورد.',
      line: 'بازار رد می‌شود؛ مدرک تو نباید رد شود. بستن چارت در این لحظه همان بخشی را دور می‌ریزد که می‌تواند تصمیم بعدی را تغییر دهد.',
      features: [
        {
          number: '06',
          label: 'بعد از شلیک',
          title: 'Reflection با بسته‌شدن معامله شروع می‌شود',
          body: 'پرسش post-trade تا زمان close صبر می‌کند. cool-down فاصله می‌سازد و چک‌لیست ماهانه 7 سوگیری را نام می‌برد، بدون زبان تشخیصی.',
          proof: 'آینه است، نه حکم.',
        },
        {
          number: '07',
          label: 'خودشناسی',
          title: 'هر red flag رسید خودش را نگه می‌دارد',
          body: 'Intake اختیاری به ردیابی پیوسته‌ی triggerها، شرایط pre-trade و red flagها تبدیل می‌شود. کنار هر flag شناسه‌ی معامله‌های سازنده‌ی آن می‌ماند.',
          proof: 'زبان distress به کارت آرام و غیرتشخیصی و ارجاع حرفه‌ای هدایت می‌شود.',
          rust: true,
        },
        {
          number: '08',
          label: 'مرور',
          title: 'تمام رد را تا ابتدا دنبال کن',
          body: 'هفته، ماه، فصل، همه‌ی زمان، بازه‌ی دلخواه یا یک Pattern را فیلتر کن. قیف detection تا open و closed، equity، فعالیت و تقویم شدت P&L را ببین.',
          proof: 'گزارش‌ها روی canvas بومی رسم می‌شوند و هر معامله به پرونده‌اش وصل است.',
        },
      ],
    },
    field: {
      act: '05 · ابزار میدان',
      title: 'چهار زبان. دو جهت. یک ژورنال.',
      line: 'فارسی، عربی، انگلیسی و اسپانیایی در یک ژورنال زندگی می‌کنند؛ با RTL واقعی، تاریخ جلالی و میلادی و ساعت بازار بر پایه‌ی IANA برای نیویورک، لندن، توکیو و سیدنی.',
      local: 'Local-first · آفلاین هم کار می‌کند',
      browser: 'چارت‌ها، Patternها، Sessionها و معامله‌ها اول در مرورگر تو ثبت می‌شوند و بعد در پس‌زمینه sync می‌شوند.',
      desktopLabel: 'محیط SESSION',
      mobileLabel: 'TRADE WIZARD',
      session: 'SESSION 08:42',
      probability: 'سناریو · 68%',
      review: 'REVIEW در صف',
      pattern: 'PATTERN · مرحله 03',
    },
    long: {
      act: '06 · شکار بلند',
      title: 'هفت سطح. هیچ‌کدام خریدنی نیست.',
      body: 'XP فقط روی کار کامل و قابل‌اثبات می‌نشیند: Session بسته‌شده با outcome، معامله‌ی reviewشده و Pattern سنجیده‌شده در برابر سناریوی واقعی. سود، win rate و تعداد معامله سطح تو را بالا نمی‌برند.',
      gate: 'XP به‌تنهایی mastery نیست. سطح 6 علاوه بر آن می‌خواهد سهم هیچ حوزه‌ای بیشتر از 60% کل نباشد.',
      levels: ['تازه‌وارد', 'کارآموز بازار', 'تحلیل‌گر', 'معامله‌گر منضبط', 'استراتژیست', 'استاد معامله‌گری', 'استاد بزرگ بازار'],
      thresholds: ['0', '100', '300', '700', '1500', '3000', '6000'],
      contribution: {
        number: '09',
        label: 'مشارکت',
        title: 'Pattern را همراه مدرکش منتشر کن',
        body: 'هر listing نرخ وقوع را کنار sample size واقعی نشان می‌دهد. Rating فقط بعد از خرید واقعی ممکن است و این قاعده را database اجرا می‌کند، نه UI.',
        proof: 'درصد تنها هیچ‌وقت مدرک نیست.',
      },
      honestyTitle: 'قبل از ادامه این دو خط را بخوان',
      marketplace: 'خریدهای Marketplace در این نسخه فقط mock هستند.',
      ai: 'دستیار AI به API key خودت نیاز دارد. کلید فقط در مرورگر می‌ماند و تغییر فرم همیشه منتظر preview و تأیید تو می‌ماند.',
      primary: 'اولین Session را شروع کن',
      secondary: 'برگرد به گشایش',
      foot: 'Local-first · فارسی، عربی، انگلیسی، اسپانیایی · برای معامله‌گر intraday بیت‌کوین که مدرک نگه می‌دارد.',
    },
    scenes: [
      'شکارچی بر لبه‌ی دره‌ی روشن جنگل ایستاده است.',
      'گوزن در دشت پیدا می‌شود و شکارچی نگاه می‌کند.',
      'شکارچی کمان را تا آخر کشیده است.',
      'تیر افقی از میان جنگل عبور می‌کند.',
      'تیر به درخت نشسته و گوزن دور می‌شود.',
      'شکارچی پس از شلیک در عمق جنگل ایستاده است.',
    ],
    rail: ['گشایش', 'کشش', 'پرواز', 'خطا', 'ابزار میدان', 'شکار بلند'],
    common: { evidence: 'مدرک', act: 'پرده', close: 'بستن' },
  },

  ar: {
    localeName: 'العربية',
    skip: 'الانتقال إلى دليل الصياد',
    nav: {
      fieldManual: 'دليل الصياد',
      openJournal: 'افتح السجل',
      language: 'تغيير اللغة',
    },
    hero: {
      eyebrow: 'NAVRYA · مسار HUNTER',
      line1: 'لا تحتاج إلى دخول أفضل.',
      line2: 'تحتاج إلى سجل أفضل.',
      body: 'سجل local-first لمتداولي Bitcoin خلال اليوم الذين يرفضون دفع ثمن الدرس نفسه مرتين.',
      primary: 'ابدأ سجل Hunter',
      secondary: 'اقرأ الدليل الميداني',
      thesisLabel: 'القاعدة',
      thesis: 'قيمة الصياد ليست في الفريسة، بل في كل ما فعله قبل إطلاق السهم وكل ما كتبه بعد أن أخطأ.',
    },
    opening: {
      act: '01 · الظهور',
      title: 'ها هي.',
      line: 'يظهر Setup وتظهر معه رغبة الإطلاق. يسجل NAVRYA الأول قبل أن يحوّل الثاني الفكرة إلى صفقة.',
    },
    draw: {
      act: '02 · الشد',
      title: 'تبدأ النتيجة قبل الأمر.',
      line: 'في التحضير تتحول الملاحظة إلى سيناريو قابل للإبطال وPattern قابل لإعادة الاستخدام وStrategy بقواعد مستقلة.',
      features: [
        {
          number: '01',
          label: 'التحضير',
          title: 'اكتب السيناريو قبل الشمعة',
          body: 'افتح Session وأرفق مخططات 5m حتى 1D واكتب شرط الإبطال. تاريخ الاحتمال append-only، لذلك تبقى كل مراجعة ظاهرة.',
          proof: 'لا يُستبدل شيء. كل مراجعة محفوظة.',
        },
        {
          number: '02',
          label: 'فهم السوق',
          title: 'سمّ Pattern ثم دافع عنه',
          body: 'رتب المراحل وحدد عتبة الاكتمال وأرفق صوراً مرجعية حتى 15 MB. يحتفظ كل Pattern بتقريره عبر السيناريوهات والصفقات المرتبطة.',
          proof: 'البيانات غير الكافية تبقى غير كافية. لا أصفار مختلقة.',
        },
        {
          number: '03',
          label: 'STRATEGY',
          title: 'Playbook مستقل لكل أسلوب تداول',
          body: 'تبقى إدارة المركز وRisk والإطار والتدريب والمرفقات وchat والملخص وسجل detection داخل Strategy الخاصة بها. حذفها يفصل الصفقات ولا يحذفها.',
          proof: 'لكل Strategy مسار detection مدته 72 ساعة.',
        },
      ],
    },
    flight: {
      act: '03 · الطيران',
      title: 'الجزء الذي يظنه الجميع الحرفة كلها.',
      line: 'التنفيذ سريع. القواعد التي تضبطه يجب أن تكون ثابتة قبله.',
      features: [
        {
          number: '04',
          label: 'الحساب',
          title: 'احسب الحجم قبل أن تشعر به',
          body: 'أدخل قيمتين ليحل calculator مسافة Stop وRisk والحجم وLeverage والتصفية المعزولة وR:R متعدد الأهداف والعمولة ونقطة التعادل.',
          proof: 'حتى 8 تمريرات ثنائية الاتجاه. الحقول المقفلة تبقى مقفلة.',
        },
        {
          number: '05',
          label: 'التنفيذ',
          title: 'سجل الصفقة التي نفذتها فعلاً',
          body: 'سجل الحالة وtimeframe والمفاهيم وPatterns والصور وحتى 3 مشاعر مهيمنة. يُقاس التوتر والتركيز والالتزام من 1 إلى 10.',
          proof: 'Quick-log يخفض أثر الانضباط عمداً.',
        },
      ],
    },
    miss: {
      act: '04 · الإخفاق',
      title: 'أخطأت الهدف.',
      line: 'يمضي السوق. يجب ألا يمضي دليلك معه. إغلاق المخطط الآن يلغي الجزء القادر على تغيير القرار التالي.',
      features: [
        {
          number: '06',
          label: 'بعد الإطلاق',
          title: 'يبدأ Reflection عند إغلاق الصفقة',
          body: 'ينتظر سؤال post-trade حتى الإغلاق. يمنح cool-down مسافة، وتسمّي قائمة شهرية 7 تحيزات مختارة دون لغة تشخيصية.',
          proof: 'مرآة، لا حكم.',
        },
        {
          number: '07',
          label: 'معرفة الذات',
          title: 'كل red flag يحتفظ بدليله',
          body: 'يتحول Intake الاختياري إلى تتبع مستمر للمحفزات وسياق pre-trade وred flags. يحمل كل flag معرفات الصفقات التي أنتجته.',
          proof: 'لغة الضيق تقود إلى بطاقة هادئة غير تشخيصية وإحالة مهنية.',
          rust: true,
        },
        {
          number: '08',
          label: 'المراجعة',
          title: 'اتبع الأثر كله إلى الخلف',
          body: 'رشح بالأسبوع أو الشهر أو الربع أو كل الوقت أو نطاق مخصص أو Pattern. اقرأ مسار detection إلى open ثم closed ومنحنى equity وتقويم شدة P&L.',
          proof: 'التقارير مرسومة على canvas أصلي، وكل صفقة تعود إلى سجلها.',
        },
      ],
    },
    field: {
      act: '05 · عدة الميدان',
      title: 'أربع لغات. اتجاهان. سجل واحد.',
      line: 'الفارسية والعربية والإنجليزية والإسبانية في السجل نفسه، مع RTL حقيقي وتواريخ جلالية وميلادية وساعات IANA لنيويورك ولندن وطوكيو وسيدني.',
      local: 'Local-first · يعمل دون اتصال',
      browser: 'تصل المخططات وPatterns وSessions والصفقات إلى متصفحك أولاً ثم تتزامن في الخلفية.',
      desktopLabel: 'مساحة SESSION',
      mobileLabel: 'TRADE WIZARD',
      session: 'SESSION 08:42',
      probability: 'سيناريو · 68%',
      review: 'REVIEW في الانتظار',
      pattern: 'PATTERN · المرحلة 03',
    },
    long: {
      act: '06 · الصيد الطويل',
      title: 'سبعة مستويات. لا يمكن شراء أي منها.',
      body: 'تصل XP للعمل المكتمل والقابل للتحقق: Session مغلقة بنتيجة، وصفقة تمت مراجعتها، وPattern اختبر أمام سيناريو حقيقي. الربح وwin rate وعدد الصفقات لا ترفع المستوى.',
      gate: 'XP وحدها ليست mastery. المستوى 6 يتطلب أيضاً ألا يتجاوز أي مجال 60% من الإجمالي.',
      levels: ['وافد جديد', 'متدرب السوق', 'محلل', 'متداول منضبط', 'استراتيجي', 'خبير التداول', 'خبير السوق الأكبر'],
      thresholds: ['0', '100', '300', '700', '1500', '3000', '6000'],
      contribution: {
        number: '09',
        label: 'المساهمة',
        title: 'انشر Pattern مع دليله',
        body: 'يعرض كل listing معدل الحدوث مع sample size. يتطلب التقييم شراء حقيقياً وتفرض قاعدة البيانات ذلك، لا الواجهة.',
        proof: 'النسبة المجردة لا تقف وحدها.',
      },
      honestyTitle: 'اقرأ هذا قبل المتابعة',
      marketplace: 'عمليات شراء Marketplace تجريبية فقط في هذه النسخة.',
      ai: 'يحتاج مساعد AI إلى API key خاص بك. يبقى المفتاح في متصفحك وتنتظر تغييرات النماذج المعاينة والموافقة دائماً.',
      primary: 'ابدأ أول Session',
      secondary: 'عد إلى الظهور',
      foot: 'Local-first · فارسية، عربية، إنجليزية، إسبانية · لمتداول Bitcoin اليومي الذي يحتفظ بالدليل.',
    },
    scenes: [
      'يقف الصياد عند حافة وادٍ مضاء في الغابة.',
      'يظهر الأيل في السهل بينما يراقبه الصياد.',
      'يشد الصياد القوس إلى مداه الكامل.',
      'يطير سهم أفقياً عبر الغابة.',
      'ينغرس السهم في شجرة بينما يهرب الأيل.',
      'يقف الصياد بهدوء في عمق الغابة بعد الإطلاق.',
    ],
    rail: ['الظهور', 'الشد', 'الطيران', 'الإخفاق', 'عدة الميدان', 'الصيد الطويل'],
    common: { evidence: 'الدليل', act: 'الفصل', close: 'إغلاق' },
  },

  es: {
    localeName: 'Español',
    skip: 'Ir al manual del cazador',
    nav: {
      fieldManual: 'Manual del cazador',
      openJournal: 'Abrir el journal',
      language: 'Cambiar idioma',
    },
    hero: {
      eyebrow: 'NAVRYA · RUTA HUNTER',
      line1: 'No necesitas una entrada mejor.',
      line2: 'Necesitas un registro mejor.',
      body: 'Un journal local-first para quienes operan Bitcoin intradía y se niegan a pagar dos veces por la misma lección.',
      primary: 'Iniciar el registro Hunter',
      secondary: 'Leer el manual',
      thesisLabel: 'La regla',
      thesis: 'El valor de un cazador no está en la presa. Está en todo lo que hizo antes del tiro y en todo lo que escribió después de fallar.',
    },
    opening: {
      act: '01 · LA APERTURA',
      title: 'Ahí está.',
      line: 'Aparece el Setup y con él las ganas de disparar. NAVRYA registra el primero antes de que las segundas se conviertan en una operación.',
    },
    draw: {
      act: '02 · LA TENSIÓN',
      title: 'El resultado empieza antes de la orden.',
      line: 'En la preparación, una impresión se convierte en escenario falsable, Pattern reutilizable y Strategy con reglas propias.',
      features: [
        {
          number: '01',
          label: 'PREPARACIÓN',
          title: 'Escribe el escenario antes de la vela',
          body: 'Abre una Session, adjunta gráficos de 5m a 1D y escribe la condición que invalida el escenario. La probabilidad es append-only, así que cada revisión queda visible.',
          proof: 'Nada se sobrescribe. Cada cambio de probabilidad queda guardado.',
        },
        {
          number: '02',
          label: 'LECTURA DE MERCADO',
          title: 'Nombra el Pattern y después defiéndelo',
          body: 'Ordena etapas, define un umbral de finalización y adjunta referencias de hasta 15 MB. Cada Pattern conserva su reporte entre escenarios y operaciones vinculadas.',
          proof: 'Los datos insuficientes siguen siendo insuficientes. Sin ceros inventados.',
        },
        {
          number: '03',
          label: 'STRATEGY',
          title: 'Un playbook para cada forma de operar',
          body: 'Gestión de posición, Risk, marco, formación, adjuntos, chat, resumen e historial de detection viven dentro de su Strategy. Al borrarla, las operaciones sobreviven sin vínculo.',
          proof: 'Cada Strategy conserva su embudo de detection de 72 horas.',
        },
      ],
    },
    flight: {
      act: '03 · EL VUELO',
      title: 'La parte que todos confunden con el oficio completo.',
      line: 'La ejecución es rápida. Las reglas que la contienen deben estar quietas de antemano.',
      features: [
        {
          number: '04',
          label: 'EL CÁLCULO',
          title: 'Define el tamaño antes de sentirlo',
          body: 'Introduce dos valores y el calculator resuelve Stop, Risk, tamaño, Leverage, liquidación aislada, R:R ponderado con varios objetivos, comisión y breakeven.',
          proof: 'Hasta 8 pasadas bidireccionales. Los campos bloqueados siguen bloqueados.',
        },
        {
          number: '05',
          label: 'EJECUCIÓN',
          title: 'Registra la operación que sí tomaste',
          body: 'Captura estado, timeframe, conceptos y Patterns observados, imágenes y hasta 3 emociones dominantes. Estrés, enfoque y compromiso se normalizan de 1 a 10.',
          proof: 'Quick-log aplica a propósito un impacto negativo en disciplina.',
        },
      ],
    },
    miss: {
      act: '04 · EL FALLO',
      title: 'Fallaste.',
      line: 'El mercado sigue. Tu evidencia no debería irse con él. Cerrar el gráfico ahora descarta la parte capaz de cambiar la próxima decisión.',
      features: [
        {
          number: '06',
          label: 'DESPUÉS DEL TIRO',
          title: 'La reflexión empieza al cerrar la operación',
          body: 'La pregunta post-trade espera al cierre. Un cool-down crea distancia y una lista mensual nombra 7 sesgos seleccionados sin lenguaje diagnóstico.',
          proof: 'Un espejo, no un veredicto.',
        },
        {
          number: '07',
          label: 'AUTOCONOCIMIENTO',
          title: 'Cada red flag conserva su recibo',
          body: 'El Intake opcional se vuelve seguimiento continuo de detonantes, contexto pre-trade y red flags. Cada flag conserva los IDs de las operaciones que lo justifican.',
          proof: 'El lenguaje de angustia lleva a una tarjeta serena, no diagnóstica, y a una derivación profesional.',
          rust: true,
        },
        {
          number: '08',
          label: 'REVISIÓN',
          title: 'Sigue todo el rastro hacia atrás',
          body: 'Filtra semana, mes, trimestre, todo el tiempo, rango personalizado o Pattern. Revisa el embudo detection-open-closed, equity, actividad y calendario por intensidad de P&L.',
          proof: 'Los reportes se dibujan en canvas nativo. Cada operación vuelve a su registro.',
        },
      ],
    },
    field: {
      act: '05 · EL EQUIPO',
      title: 'Cuatro idiomas. Dos direcciones. Un journal.',
      line: 'Persa, árabe, inglés y español comparten el mismo journal, con RTL real, fechas jalalíes y gregorianas, y relojes IANA para Nueva York, Londres, Tokio y Sídney.',
      local: 'Local-first · funciona sin conexión',
      browser: 'Gráficos, Patterns, Sessions y operaciones llegan primero a tu navegador y luego se sincronizan en segundo plano.',
      desktopLabel: 'ESPACIO DE SESSION',
      mobileLabel: 'TRADE WIZARD',
      session: 'SESSION 08:42',
      probability: 'ESCENARIO · 68%',
      review: 'REVIEW EN COLA',
      pattern: 'PATTERN · ETAPA 03',
    },
    long: {
      act: '06 · LA CACERÍA LARGA',
      title: 'Siete niveles. Ninguno se compra.',
      body: 'La XP llega por trabajo completo y verificable: una Session cerrada con resultado, una operación revisada, un Pattern resuelto contra un escenario real. Ganancia, win rate y cantidad de operaciones no suben tu nivel.',
      gate: 'La XP sola no es mastery. El nivel 6 también exige que ningún dominio supere el 60% del total.',
      levels: ['Recién llegado', 'Aprendiz de mercado', 'Analista', 'Trader disciplinado', 'Estratega', 'Maestro de trading', 'Gran maestro del mercado'],
      thresholds: ['0', '100', '300', '700', '1500', '3000', '6000'],
      contribution: {
        number: '09',
        label: 'CONTRIBUCIÓN',
        title: 'Publica un Pattern con su evidencia',
        body: 'Cada listing une la tasa de ocurrencia con su sample size. Calificar exige una compra real y la base de datos, no la interfaz, hace cumplir la regla.',
        proof: 'Un porcentaje nunca aparece sin muestra.',
      },
      honestyTitle: 'Lee esto antes de seguir',
      marketplace: 'Las compras del Marketplace son simuladas en esta versión.',
      ai: 'El asistente de AI requiere tu propia API key. La clave permanece en tu navegador y los cambios de formularios siempre esperan vista previa y aprobación.',
      primary: 'Iniciar tu primera Session',
      secondary: 'Volver a la apertura',
      foot: 'Local-first · persa, árabe, inglés, español · Para traders intradía de Bitcoin que guardan evidencia.',
    },
    scenes: [
      'El Hunter observa un valle iluminado desde el bosque.',
      'Un ciervo aparece en el claro mientras el Hunter observa.',
      'El Hunter sostiene el arco completamente tensado.',
      'Una flecha vuela horizontalmente por el bosque.',
      'La flecha queda clavada en un árbol mientras el ciervo escapa.',
      'El Hunter permanece en silencio en el bosque después del tiro.',
    ],
    rail: ['Apertura', 'Tensión', 'Vuelo', 'Fallo', 'Equipo', 'Cacería larga'],
    common: { evidence: 'EVIDENCIA', act: 'ACTO', close: 'Cerrar' },
  },
};

export const supportedLanguages: Lang[] = ['fa', 'ar', 'en', 'es'];

export const languageLabels: Record<Lang, string> = {
  fa: 'فارسی',
  ar: 'العربية',
  en: 'English',
  es: 'Español',
};
