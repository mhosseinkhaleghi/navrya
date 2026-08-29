-- Journey H2, Gate 2: Conversation Studio persistence.
--
-- Two tables: conversation_scenarios (the stable identity - scenario_key never changes once
-- created) and conversation_scenario_versions (immutable once published; a version's own
-- content lives in one JSONB `definition` column - languages/triggers/responses - since nothing
-- server-side ever needs to query into an individual trigger phrase; the admin Trigger Lab and
-- the production Router both read the whole `definition` and hand it to the shared matcher).
--
-- conversation_scenarios is created first with plain nullable published/draft pointer columns
-- (no FK yet) specifically to avoid a circular FK dependency with conversation_scenario_versions,
-- which references conversation_scenarios(id) directly. The two back-reference FK constraints are
-- added via ALTER TABLE once both tables exist - the same "additive column/constraint via a later
-- statement in the same file" shape 004_admin.sql already used for marketplace_listings.featured.
--
-- Publishing a draft archives whatever was previously published (status flips to 'archived',
-- content untouched) - this is what makes "the old version remains unchanged" and rollback both
-- trivially true without any special-cased logic. Rollback is never an in-place mutation of a
-- past version; it always creates a brand-new draft copying the target version's content, then
-- publishes it through the exact same path.

CREATE TABLE IF NOT EXISTS conversation_scenarios (
  id                     TEXT PRIMARY KEY,
  scenario_key           TEXT UNIQUE NOT NULL,
  domain                 TEXT,
  kind                   TEXT NOT NULL CHECK (kind IN ('faq','data_query','surface_help')),
  data_query_ref         TEXT,
  cta_action_id          TEXT,
  allowed_processes      JSONB,
  allowed_steps          JSONB,
  published_version_id   TEXT,
  draft_version_id       TEXT,
  archived_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversation_scenarios_domain_idx ON conversation_scenarios (domain);
CREATE INDEX IF NOT EXISTS conversation_scenarios_kind_idx ON conversation_scenarios (kind);

CREATE TABLE IF NOT EXISTS conversation_scenario_versions (
  id                TEXT PRIMARY KEY,
  scenario_id       TEXT NOT NULL REFERENCES conversation_scenarios(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  definition        JSONB NOT NULL,
  published_at      TIMESTAMPTZ,
  created_by        TEXT REFERENCES users(id),
  published_by      TEXT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_scenario_versions_number_idx ON conversation_scenario_versions (scenario_id, version_number);
CREATE INDEX IF NOT EXISTS conversation_scenario_versions_status_idx ON conversation_scenario_versions (scenario_id, status);

-- DEFERRABLE INITIALLY DEFERRED: create() inserts the scenario row (with draft_version_id
-- already pointing at the version about to be created) and the version row (which itself
-- requires the scenario to already exist) in the same transaction - a genuine circular
-- reference between the two tables. Deferring the check to COMMIT (standard Postgres technique
-- for exactly this shape) means both rows exist by the time either FK is actually validated.
ALTER TABLE conversation_scenarios
  ADD CONSTRAINT conversation_scenarios_published_version_fkey FOREIGN KEY (published_version_id) REFERENCES conversation_scenario_versions(id) DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT conversation_scenarios_draft_version_fkey FOREIGN KEY (draft_version_id) REFERENCES conversation_scenario_versions(id) DEFERRABLE INITIALLY DEFERRED;

-- Seed the 7 Gate-1 scenarios as real, published-v1 rows - content copied verbatim from the
-- Gate-1 hardcoded SCENARIOS array (ai-conversation-router.js) and the convRouter* ai-i18n.js
-- strings, so a fresh database reproduces the exact same tested runtime behavior. Idempotent by
-- scenario_key/id (ON CONFLICT DO NOTHING) as a defensive second layer on top of the migration
-- runner's own single-execution tracking (server/db/migrate.mjs's schema_migrations table) - see
-- ARCHITECTURE.md's "no browser-side auto-seed" convention, matching Section 7.18's own patterns
-- default seeding.

-- session.purpose
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-0', 'session.purpose', 'sessions', 'faq', NULL, 'session.create')
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-0', id, 1, 'published', $seed0${"surfaceBoost":["sessions"],"languages":{"fa":{"groups":[["سشن","جلسه معاملاتی","جلسه","session"],["چیه","چیست","یعنی چی","به چه درد","چه کاربرد","چه فایده","چرا باید","چرا لازم","فایده اش","کاربردش"]],"strong":["سشن چیه","سشن یعنی چی","فایده سشن چیه","این سشن به چه دردی میخوره","سشن به چه درد میخوره","سشن چیست","session چیه"],"negative":["بساز","ایجاد کن","یکی بساز","حذف کن","ببند","پاک کن","فعالم چیه","سشن فعالم"]},"en":{"groups":[["session"],["what is","what does","purpose of","point of","why do i need","why should i","what for","what's the point"]],"strong":["what is a session","what does a session do","what's a session for","what is the point of a session","why do i need a session"],"negative":["create a session","make a session","start a session","delete my session","close my session","cancel my session","which session is active","my active session"]},"ar":{"groups":[["جلسة","الجلسة"],["ما هي","ما هو","ما فائدة","لماذا احتاج","لماذا أحتاج","ما الذي يفعله"]],"strong":["ما هي الجلسة","ما فائدة جلسة التداول","لماذا أحتاج إلى إنشاء جلسة"],"negative":["أنشئ","انشئ جلسة","احذف جلستي","أغلق جلستي","جلستي النشطة"]},"es":{"groups":[["sesion"],["que es","para que sirve","por que deberia","que hace","cual es el punto"]],"strong":["que es una sesion","para que sirve una sesion de trading","por que necesito una sesion"],"negative":["crea una sesion","crea una sesion nueva","elimina mi sesion","cierra mi sesion","mi sesion activa"]}},"responses":{"fa":{"written":"سشن یعنی همون فضایی که قبل از ورود به معامله، توش چارت رو می‌بینی، حرکت بازار رو دنبال می‌کنی و سناریوهات رو با دلیل ثبت می‌کنی — به‌جای اینکه سرراست بری تو معامله.","voiceReply":"سشن یعنی همون فضایی که قبل از ورود به معامله، توش چارت رو می‌بینی، حرکت بازار رو دنبال می‌کنی و سناریوهات رو با دلیل ثبت می‌کنی — به‌جای اینکه سرراست بری تو معامله."},"en":{"written":"A Session is where you watch the chart, track market movement, and log your scenarios with real reasoning before you ever place a trade — instead of jumping straight into a position.","voiceReply":"A Session is where you watch the chart, track market movement, and log your scenarios with real reasoning before you ever place a trade — instead of jumping straight into a position."},"ar":{"written":"الجلسة هي المكان الذي تراقب فيه الرسم البياني، وتتابع حركة السوق، وتسجّل سيناريوهاتك بمنطق واضح قبل الدخول في أي صفقة — بدلاً من الدخول مباشرة.","voiceReply":"الجلسة هي المكان الذي تراقب فيه الرسم البياني، وتتابع حركة السوق، وتسجّل سيناريوهاتك بمنطق واضح قبل الدخول في أي صفقة — بدلاً من الدخول مباشرة."},"es":{"written":"Una Sesión es donde observas el gráfico, sigues el movimiento del mercado y registras tus escenarios con una razón real antes de entrar en una operación — en lugar de entrar directamente.","voiceReply":"Una Sesión es donde observas el gráfico, sigues el movimiento del mercado y registras tus escenarios con una razón real antes de entrar en una operación — en lugar de entrar directamente."}}}$seed0$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'session.purpose'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-0'
  WHERE scenario_key = 'session.purpose' AND published_version_id IS NULL;

-- pattern.purpose
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-1', 'pattern.purpose', 'strategies', 'faq', NULL, 'pattern.create')
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-1', id, 1, 'published', $seed1${"surfaceBoost":["strategies"],"languages":{"fa":{"groups":[["پترن","الگو"],["چیه","چیست","یعنی چی","چه کاربرد","چه فایده"]],"strong":["پترن چیه","الگو چیه","پترن یعنی چی","این پترن به چه دردی میخوره"],"negative":["پترن جدید بساز","یه پترن جدید بساز","ایجاد پترن","حذف پترن"]},"en":{"groups":[["pattern"],["what is","what does","purpose of","point of"]],"strong":["what is a pattern","what does a pattern do","what's a pattern for"],"negative":["create a pattern","make a pattern","add a pattern","delete a pattern","new pattern"]},"ar":{"groups":[["نمط","النمط"],["ما هو","ما هي","ما فائدة"]],"strong":["ما هو النمط","ما فائدة النمط"],"negative":["أنشئ نمطا","أنشئ نمطا جديدا","احذف النمط"]},"es":{"groups":[["patron"],["que es","para que sirve"]],"strong":["que es un patron","para que sirve un patron"],"negative":["crea un patron","crea un patron nuevo","elimina el patron"]}},"responses":{"fa":{"written":"پترن یعنی یک رفتار تکرارشونده‌ی بازار که یک بار با مراحلش ثبتش می‌کنی؛ بعد هر وقت همون رفتار رو توی یه سناریوی جدید دیدی، می‌تونی بهش لینکش کنی و ببینی چقدر واقعاً جواب داده.","voiceReply":"پترن یعنی یک رفتار تکرارشونده‌ی بازار که یک بار با مراحلش ثبتش می‌کنی؛ بعد هر وقت همون رفتار رو توی یه سناریوی جدید دیدی، می‌تونی بهش لینکش کنی و ببینی چقدر واقعاً جواب داده."},"en":{"written":"A Pattern is a repeatable market behavior you record once, with its own stages; whenever you see that same behavior in a new scenario, you can link it and see how well it's actually performed over time.","voiceReply":"A Pattern is a repeatable market behavior you record once, with its own stages; whenever you see that same behavior in a new scenario, you can link it and see how well it's actually performed over time."},"ar":{"written":"النمط هو سلوك متكرر في السوق تسجّله مرة واحدة بمراحله؛ وفي كل مرة ترى فيها نفس السلوك ضمن سيناريو جديد، يمكنك ربطه به ومعرفة مدى نجاحه فعلياً.","voiceReply":"النمط هو سلوك متكرر في السوق تسجّله مرة واحدة بمراحله؛ وفي كل مرة ترى فيها نفس السلوك ضمن سيناريو جديد، يمكنك ربطه به ومعرفة مدى نجاحه فعلياً."},"es":{"written":"Un Patrón es un comportamiento repetible del mercado que registras una vez, con sus propias etapas; cada vez que veas ese mismo comportamiento en un escenario nuevo, puedes vincularlo y ver qué tan bien ha funcionado en realidad.","voiceReply":"Un Patrón es un comportamiento repetible del mercado que registras una vez, con sus propias etapas; cada vez que veas ese mismo comportamiento en un escenario nuevo, puedes vincularlo y ver qué tan bien ha funcionado en realidad."}}}$seed1$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'pattern.purpose'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-1'
  WHERE scenario_key = 'pattern.purpose' AND published_version_id IS NULL;

-- strategy.purpose
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-2', 'strategy.purpose', 'strategies', 'faq', NULL, 'strategy.create')
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-2', id, 1, 'published', $seed2${"surfaceBoost":["strategies"],"languages":{"fa":{"groups":[["استراتژی"],["چیه","چیست","یعنی چی","چه کاربرد","چه فایده"]],"strong":["استراتژی چیه","استراتژی یعنی چی","این بخش استراتژی چیه"],"negative":["استراتژی جدید بساز","یه استراتژی بساز","ایجاد استراتژی","حذف استراتژی"]},"en":{"groups":[["strategy"],["what is","what does","purpose of","point of"]],"strong":["what is a strategy","what does a strategy do","what's a strategy for"],"negative":["create a strategy","make a strategy","new strategy","delete a strategy"]},"ar":{"groups":[["استراتيجية","الاستراتيجية"],["ما هي","ما هو","ما فائدة"]],"strong":["ما هي الاستراتيجية","ما فائدة الاستراتيجية"],"negative":["أنشئ استراتيجية","أنشئ استراتيجية جديدة","احذف الاستراتيجية"]},"es":{"groups":[["estrategia"],["que es","para que sirve"]],"strong":["que es una estrategia","para que sirve una estrategia"],"negative":["crea una estrategia","crea una estrategia nueva","elimina la estrategia"]}},"responses":{"fa":{"written":"استراتژی یعنی همون قانون‌های شخصی خودت برای ورود، خروج و مدیریت ریسک — یک‌بار می‌نویسیش، بعد هر معامله رو بهش لینک می‌کنی تا ببینی چقدر واقعاً طبق پلن پیش رفتی.","voiceReply":"استراتژی یعنی همون قانون‌های شخصی خودت برای ورود، خروج و مدیریت ریسک — یک‌بار می‌نویسیش، بعد هر معامله رو بهش لینک می‌کنی تا ببینی چقدر واقعاً طبق پلن پیش رفتی."},"en":{"written":"A Strategy is your own written rules for entry, exit, and risk management — you write it once, then link every trade to it so you can see how closely you actually followed the plan.","voiceReply":"A Strategy is your own written rules for entry, exit, and risk management — you write it once, then link every trade to it so you can see how closely you actually followed the plan."},"ar":{"written":"الاستراتيجية هي قواعدك الخاصة للدخول والخروج وإدارة المخاطر — تكتبها مرة واحدة، ثم تربط كل صفقة بها لترى مدى التزامك الفعلي بالخطة.","voiceReply":"الاستراتيجية هي قواعدك الخاصة للدخول والخروج وإدارة المخاطر — تكتبها مرة واحدة، ثم تربط كل صفقة بها لترى مدى التزامك الفعلي بالخطة."},"es":{"written":"Una Estrategia son tus propias reglas para la entrada, la salida y la gestión de riesgo — la escribes una vez y luego vinculas cada operación a ella para ver qué tan bien seguiste realmente el plan.","voiceReply":"Una Estrategia son tus propias reglas para la entrada, la salida y la gestión de riesgo — la escribes una vez y luego vinculas cada operación a ella para ver qué tan bien seguiste realmente el plan."}}}$seed2$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'strategy.purpose'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-2'
  WHERE scenario_key = 'strategy.purpose' AND published_version_id IS NULL;

-- navrya.ai.what_can_you_do
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-3', 'navrya.ai.what_can_you_do', 'ai-assistant', 'faq', NULL, NULL)
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-3', id, 1, 'published', $seed3${"surfaceBoost":["ai-assistant"],"languages":{"fa":{"groups":[["هوش مصنوعی","دستیار","ناوریا","تو"],["چیکار می‌کنی","چیکار میکنی","چه کاری می‌تونی","چه کارهایی بلدی","چیکارا بلدی","چیکار میتونی بکنی"]],"strong":["تو چیکار می‌تونی بکنی","چه کارهایی بلدی","دستیار هوش مصنوعی چیکار می‌کنه"],"negative":["یه سشن باز کن","برام معامله باز کن","یه پترن بساز"]},"en":{"groups":[["you","assistant","ai","navrya"],["what can you do","what do you do","what are you capable of","how can you help"]],"strong":["what can you do","what can you help me with","what are you capable of"],"negative":["open a session","create a session","start a trade","open the calculator"]},"ar":{"groups":[["أنت","المساعد","نافريا"],["ماذا يمكنك أن تفعل","بماذا يمكنك مساعدتي","ما الذي تستطيع فعله"]],"strong":["ماذا يمكنك أن تفعل","بماذا تستطيع مساعدتي"],"negative":["افتح جلسة","أنشئ صفقة"]},"es":{"groups":[["tu","asistente","navrya"],["que puedes hacer","en que puedes ayudarme","que eres capaz de hacer"]],"strong":["que puedes hacer","en que puedes ayudarme"],"negative":["abre una sesion","crea una operacion"]}},"responses":{"fa":{"written":"می‌تونم برات فرم‌های بازی که رو صدا یا تایپ پر کنم، یه سشن یا معامله جدید بسازم، سوال‌هات درباره‌ی خود ناوریا رو جواب بدم، و اگه حالت روان‌شناس رو روشن کنی، درباره‌ی احساسات معامله‌گریت هم باهات حرف بزنم.","voiceReply":"می‌تونم برات فرم‌های بازی که رو صدا یا تایپ پر کنم، یه سشن یا معامله جدید بسازم، سوال‌هات درباره‌ی خود ناوریا رو جواب بدم، و اگه حالت روان‌شناس رو روشن کنی، درباره‌ی احساسات معامله‌گریت هم باهات حرف بزنم."},"en":{"written":"I can fill in whatever form you have open through voice or text, help you create a new session or trade, answer questions about NAVRYA itself, and — with Therapist mode on — talk through your trading psychology with you.","voiceReply":"I can fill in whatever form you have open through voice or text, help you create a new session or trade, answer questions about NAVRYA itself, and — with Therapist mode on — talk through your trading psychology with you."},"ar":{"written":"يمكنني تعبئة أي نموذج مفتوح لديك عبر الصوت أو الكتابة، ومساعدتك في إنشاء جلسة أو صفقة جديدة، والإجابة عن أسئلتك حول نافريا نفسه، وإذا فعّلت وضع المعالج، التحدث معك عن نفسيتك في التداول.","voiceReply":"يمكنني تعبئة أي نموذج مفتوح لديك عبر الصوت أو الكتابة، ومساعدتك في إنشاء جلسة أو صفقة جديدة، والإجابة عن أسئلتك حول نافريا نفسه، وإذا فعّلت وضع المعالج، التحدث معك عن نفسيتك في التداول."},"es":{"written":"Puedo completar cualquier formulario que tengas abierto por voz o texto, ayudarte a crear una nueva sesión u operación, responder preguntas sobre NAVRYA en sí, y — con el modo terapeuta activado — hablar contigo sobre tu psicología de trading.","voiceReply":"Puedo completar cualquier formulario que tengas abierto por voz o texto, ayudarte a crear una nueva sesión u operación, responder preguntas sobre NAVRYA en sí, y — con el modo terapeuta activado — hablar contigo sobre tu psicología de trading."}}}$seed3$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'navrya.ai.what_can_you_do'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-3'
  WHERE scenario_key = 'navrya.ai.what_can_you_do' AND published_version_id IS NULL;

-- dashboard.purpose
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-4', 'dashboard.purpose', 'dashboard', 'faq', NULL, NULL)
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-4', id, 1, 'published', $seed4${"surfaceBoost":["dashboard"],"languages":{"fa":{"groups":[["داشبورد","صفحه اصلی","پنل"],["چیه","چیست","چیکار می‌کنه","چه کاری انجام میده"]],"strong":["داشبورد چیه","این صفحه چیکار می‌کنه","داشبورد چیکار می‌کنه"],"negative":[]},"en":{"groups":[["dashboard","home screen","home page"],["what is","what does","purpose of","what for"]],"strong":["what is the dashboard","what does the dashboard do","what is this page for"],"negative":[]},"ar":{"groups":[["لوحة التحكم","الصفحة الرئيسية"],["ما هي","ما هو","ماذا تفعل"]],"strong":["ما هي لوحة التحكم","ماذا تفعل لوحة التحكم"],"negative":[]},"es":{"groups":[["panel","tablero","pantalla principal"],["que es","que hace","para que sirve"]],"strong":["que es el panel","que hace el panel","para que sirve esta pagina"],"negative":[]}},"responses":{"fa":{"written":"داشبورد همون صفحه‌ی اصلیه که خلاصه‌ی وضعیتت رو می‌بینی — معاملات باز، سشن‌های اخیر و دسترسی سریع به بقیه‌ی بخش‌ها، همه توی یه نگاه.","voiceReply":"داشبورد همون صفحه‌ی اصلیه که خلاصه‌ی وضعیتت رو می‌بینی — معاملات باز، سشن‌های اخیر و دسترسی سریع به بقیه‌ی بخش‌ها، همه توی یه نگاه."},"en":{"written":"The Dashboard is your home screen — a quick summary of your open trades, recent sessions, and fast access to everything else, all in one glance.","voiceReply":"The Dashboard is your home screen — a quick summary of your open trades, recent sessions, and fast access to everything else, all in one glance."},"ar":{"written":"لوحة التحكم هي شاشتك الرئيسية — ملخص سريع لصفقاتك المفتوحة، جلساتك الأخيرة، ووصول سريع لبقية الأقسام، كل ذلك بنظرة واحدة.","voiceReply":"لوحة التحكم هي شاشتك الرئيسية — ملخص سريع لصفقاتك المفتوحة، جلساتك الأخيرة، ووصول سريع لبقية الأقسام، كل ذلك بنظرة واحدة."},"es":{"written":"El Panel es tu pantalla principal — un resumen rápido de tus operaciones abiertas, sesiones recientes y acceso rápido a todo lo demás, todo de un vistazo.","voiceReply":"El Panel es tu pantalla principal — un resumen rápido de tus operaciones abiertas, sesiones recientes y acceso rápido a todo lo demás, todo de un vistazo."}}}$seed4$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'dashboard.purpose'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-4'
  WHERE scenario_key = 'dashboard.purpose' AND published_version_id IS NULL;

-- trade.open_count_query
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-5', 'trade.open_count_query', 'trades', 'data_query', 'trade.open_count', NULL)
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-5', id, 1, 'published', $seed5${"surfaceBoost":["dashboard","sessions"],"languages":{"fa":{"groups":[["معامله","ترید","پوزیشن"],["چند تا","چندتا","چند","دارم"]],"strong":["چند تا معامله باز دارم","چند تا ترید باز دارم","چند تا پوزیشن باز دارم"],"negative":["ریسک پیش فرض","ریسک من چنده"]},"en":{"groups":[["open trade","open trades","open position","open positions"],["how many","what is my","count"]],"strong":["how many open trades do i have","how many open trades","how many trades do i have open"],"negative":["default risk","my risk","what's my risk"]},"ar":{"groups":[["صفقة مفتوحة","صفقات مفتوحة","مركز مفتوح"],["كم","ما عدد"]],"strong":["كم صفقة مفتوحة لدي","كم عدد الصفقات المفتوحة لدي"],"negative":["المخاطرة الافتراضية","مخاطرتي"]},"es":{"groups":[["operacion abierta","operaciones abiertas"],["cuantas","cuantos","cuanto"]],"strong":["cuantas operaciones abiertas tengo","cuantas operaciones tengo abiertas"],"negative":["riesgo predeterminado","mi riesgo"]}},"responses":{"fa":{"written":"الان {count} معامله باز داری.","voiceReply":"الان {count} معامله باز داری."},"en":{"written":"You currently have {count} open trades.","voiceReply":"You currently have {count} open trades."},"ar":{"written":"لديك حالياً {count} صفقة مفتوحة.","voiceReply":"لديك حالياً {count} صفقة مفتوحة."},"es":{"written":"Actualmente tienes {count} operaciones abiertas.","voiceReply":"Actualmente tienes {count} operaciones abiertas."}}}$seed5$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'trade.open_count_query'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-5'
  WHERE scenario_key = 'trade.open_count_query' AND published_version_id IS NULL;

-- trade.default_risk_query
INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id)
  VALUES ('convscn-seed-6', 'trade.default_risk_query', 'trades', 'data_query', 'trade.default_risk', NULL)
  ON CONFLICT (scenario_key) DO NOTHING;
INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at)
  SELECT 'convscnver-seed-6', id, 1, 'published', $seed6${"surfaceBoost":["dashboard","sessions"],"languages":{"fa":{"groups":[["ریسک پیش فرض","ریسک پیش‌فرض","ریسک من"],["چنده","چقدره","چیه"]],"strong":["ریسک پیش فرض من چنده","ریسک پیش فرضم چقدره","ریسک من چنده"],"negative":["چند تا معامله","چند تا ترید","معامله باز دارم"]},"en":{"groups":[["default risk","my risk"],["what is","how much","what's"]],"strong":["what is my default risk","what's my default risk","how much is my default risk"],"negative":["open trades","open positions","how many trades"]},"ar":{"groups":[["المخاطرة الافتراضية","مخاطرتي"],["ما هي","كم"]],"strong":["ما هي مخاطرتي الافتراضية","كم هي مخاطرتي الافتراضية"],"negative":["صفقة مفتوحة","صفقات مفتوحة"]},"es":{"groups":[["riesgo predeterminado","mi riesgo"],["cual es","cuanto es","cual"]],"strong":["cual es mi riesgo predeterminado","cuanto es mi riesgo predeterminado"],"negative":["operaciones abiertas","operacion abierta"]}},"responses":{"fa":{"written":"ریسک پیش‌فرضت الان روی {value}% تنظیمه.","voiceReply":"ریسک پیش‌فرضت الان روی {value}% تنظیمه."},"en":{"written":"Your default risk is currently set to {value}%.","voiceReply":"Your default risk is currently set to {value}%."},"ar":{"written":"مخاطرتك الافتراضية مضبوطة حالياً على {value}%.","voiceReply":"مخاطرتك الافتراضية مضبوطة حالياً على {value}%."},"es":{"written":"Tu riesgo predeterminado está configurado actualmente en {value}%.","voiceReply":"Tu riesgo predeterminado está configurado actualmente en {value}%."}}}$seed6$::jsonb, now()
  FROM conversation_scenarios WHERE scenario_key = 'trade.default_risk_query'
  ON CONFLICT (id) DO NOTHING;
UPDATE conversation_scenarios SET published_version_id = 'convscnver-seed-6'
  WHERE scenario_key = 'trade.default_risk_query' AND published_version_id IS NULL;


