/**
 * Analysis Style Registry — Analysis Profiles domain (see ARCHITECTURE.md §7.25).
 *
 * A centralized, extensible catalog of "how a trader reads a chart" — the analytical lens an
 * AnalysisProfile points at. This is product/domain reference data, not a user record: it lives in
 * version-controlled code, not one database row per style per user (see §19 of the brief this file
 * implements). `id` is the stable identifier every AnalysisProfile/Strategy/future-AI consumer
 * stores; `name`/`shortDescription` are the only per-language display text (§22 - style categories,
 * names and short descriptions are the localized surface; `coreConcepts`/`analysisPrinciples`/
 * `limitations`/`futurePromptGuidance` are internal structured metadata, English only, never shown
 * as primary UI copy - the same "future-facing metadata, not used to run chart AI yet" status the
 * brief gives `futurePromptGuidance` applies to all four).
 *
 * IMPORTANT - non-goal boundary: `futurePromptGuidance`/`analysisPrinciples` are read by nothing in
 * this codebase yet. No LLM call, no prompt construction, no scenario generation lives here or
 * anywhere in the Analysis Profiles domain. See `analysis-context.js` for the one documented future
 * integration seam.
 *
 * Do NOT hand-duplicate a style's recommended/optional focus text elsewhere - every style
 * references stable ids from `analysis-focus-registry.js`; that file owns the actual focus
 * definitions (§9: "Styles reference Focus IDs. Focus definitions are not duplicated per style.").
 */
(function () {
  'use strict';

  var VERSION = 1;

  // Nine style families (§7 of the brief). id + per-language label only - the grouping itself
  // carries no other behavior.
  var CATEGORIES = [
    { id: 'price_structure', name: { fa: 'قیمت و ساختار', ar: 'السعر والبنية', en: 'Price & Structure', es: 'Precio y estructura' } },
    { id: 'liquidity_institutional', name: { fa: 'نقدینگی و نهادی', ar: 'السيولة والمؤسسي', en: 'Liquidity & Institutional', es: 'Liquidez e institucional' } },
    { id: 'auction_volume_orderflow', name: { fa: 'حراج، حجم و جریان سفارش', ar: 'المزاد والحجم وتدفق الأوامر', en: 'Auction, Volume & Order Flow', es: 'Subasta, volumen y flujo de órdenes' } },
    { id: 'pattern_families', name: { fa: 'خانواده‌های الگوی قیمتی', ar: 'عائلات الأنماط السعرية', en: 'Price Pattern Families', es: 'Familias de patrones de precio' } },
    { id: 'cycle_structural', name: { fa: 'چرخه بازار و نظریه‌های ساختاری', ar: 'دورة السوق والنظريات البنيوية', en: 'Market Cycle / Structural Theories', es: 'Ciclo de mercado / teorías estructurales' } },
    { id: 'indicator_mathematical', name: { fa: 'اندیکاتور و ریاضی', ar: 'المؤشرات والرياضيات', en: 'Indicator / Mathematical', es: 'Indicadores / matemático' } },
    { id: 'systematic_behavior', name: { fa: 'رفتار سیستماتیک بازار', ar: 'سلوك السوق المنهجي', en: 'Systematic Market Behavior', es: 'Comportamiento sistemático del mercado' } },
    { id: 'quant_statistical', name: { fa: 'کمی و آماری', ar: 'كمي وإحصائي', en: 'Quant / Statistical', es: 'Cuantitativo / estadístico' } },
    { id: 'special_generic', name: { fa: 'عمومی و ویژه', ar: 'عام وخاص', en: 'Special / Generic', es: 'Especial / genérico' } }
  ];

  function s(id, category, name, shortDescription, extra) {
    var base = {
      id: id,
      category: category,
      name: name,
      shortDescription: shortDescription,
      coreConcepts: [],
      recommendedFocusIds: [],
      optionalFocusIds: [],
      requiredInputs: ['chart_image'],
      supportedInputs: ['chart_image'],
      relatedStyleIds: [],
      analysisPrinciples: [],
      limitations: [],
      futurePromptGuidance: [],
      version: VERSION
    };
    return Object.assign(base, extra || {});
  }

  var DEFS = [
    // ---- PRICE & STRUCTURE ----------------------------------------------------------------
    s('price_action', 'price_structure',
      { fa: 'پرایس اکشن', ar: 'حركة السعر', en: 'Price Action', es: 'Price Action' },
      { fa: 'خواندن مستقیم حرکت قیمت، بدون تکیه بر اندیکاتور.', ar: 'قراءة حركة السعر مباشرة دون الاعتماد على المؤشرات.', en: 'Reading raw price movement directly, without relying on indicators.', es: 'Lectura directa del movimiento del precio, sin depender de indicadores.' },
      {
        coreConcepts: ['structure', 'momentum', 'rejection/acceptance', 'breakout/retest'],
        recommendedFocusIds: ['market_structure', 'key_levels', 'momentum', 'rejection', 'acceptance', 'breakout', 'retest'],
        optionalFocusIds: ['compression', 'expansion', 'candlestick_behavior', 'volatility', 'failed_breakout', 'multi_timeframe', 'invalidation', 'confirmation'],
        relatedStyleIds: ['classical_ta', 'trend_analysis', 'market_structure_analysis'],
        analysisPrinciples: ['Structure before indicators', 'Levels are zones, not lines', 'Reaction at a level matters more than the level itself'],
        limitations: ['Highly subjective without a written rule set', 'No native volume/liquidity read'],
        futurePromptGuidance: ['Anchor the read on structure and the most recent reaction at a key level before naming a bias.']
      }),
    s('classical_ta', 'price_structure',
      { fa: 'تحلیل تکنیکال کلاسیک', ar: 'التحليل الفني الكلاسيكي', en: 'Classical Technical Analysis', es: 'Análisis técnico clásico' },
      { fa: 'روندها، سطوح و الگوهای کلاسیک نمودار.', ar: 'الاتجاهات والمستويات وأنماط الرسم البياني الكلاسيكية.', en: 'Trends, levels and classical chart patterns.', es: 'Tendencias, niveles y patrones clásicos del gráfico.' },
      {
        coreConcepts: ['trend', 'support/resistance', 'chart patterns', 'volume confirmation'],
        recommendedFocusIds: ['trend', 'support_resistance', 'key_levels', 'chart_patterns'],
        optionalFocusIds: ['trend_strength', 'volume', 'candlestick_behavior', 'multi_timeframe'],
        relatedStyleIds: ['dow_theory', 'trend_analysis', 'classical_chart_patterns'],
        analysisPrinciples: ['Trend is the primary bias filter', 'Patterns are read as continuation or reversal signatures'],
        limitations: ['Pattern recognition is subjective without strict rules'],
        futurePromptGuidance: ['State the prevailing trend before evaluating any pattern against it.']
      }),
    s('dow_theory', 'price_structure',
      { fa: 'نظریه داو', ar: 'نظرية داو', en: 'Dow Theory', es: 'Teoría de Dow' },
      { fa: 'اصول کلاسیک روند، تأیید و حجم.', ar: 'المبادئ الكلاسيكية للاتجاه والتأكيد والحجم.', en: 'Classical principles of trend, confirmation and volume.', es: 'Principios clásicos de tendencia, confirmación y volumen.' },
      {
        coreConcepts: ['primary/secondary/minor trend', 'confirmation', 'volume must confirm trend'],
        recommendedFocusIds: ['trend', 'trend_strength', 'volume'],
        optionalFocusIds: ['market_phase', 'multi_timeframe', 'key_levels'],
        relatedStyleIds: ['classical_ta', 'trend_analysis'],
        analysisPrinciples: ['A trend remains in effect until a clear reversal signal', 'Volume should confirm the trend'],
        limitations: ['Lagging by design', 'Says little about intraday timing'],
        futurePromptGuidance: ['Classify the timeframe of trend being discussed (primary/secondary/minor) explicitly.']
      }),
    s('support_resistance_analysis', 'price_structure',
      { fa: 'تحلیل حمایت و مقاومت', ar: 'تحليل الدعم والمقاومة', en: 'Support / Resistance Analysis', es: 'Análisis de soporte y resistencia' },
      { fa: 'شناسایی و اعتبارسنجی سطوح کلیدی قیمتی.', ar: 'تحديد المستويات السعرية الرئيسية والتحقق من صحتها.', en: 'Identifying and validating key price levels.', es: 'Identificación y validación de niveles de precio clave.' },
      {
        coreConcepts: ['horizontal levels', 'level strength', 'flip (S becomes R)'],
        recommendedFocusIds: ['key_levels', 'support_resistance', 'rejection', 'retest'],
        optionalFocusIds: ['dynamic_levels', 'breakout', 'failed_breakout', 'multi_timeframe'],
        relatedStyleIds: ['price_action', 'supply_demand_analysis', 'trendline_channel_analysis'],
        analysisPrinciples: ['A level gains weight with confirmed reactions, not just touches'],
        limitations: ['Zone width is subjective without a defined tolerance rule'],
        futurePromptGuidance: ['Describe each level as a zone with a confirmed reaction, never a single exact price.']
      }),
    s('supply_demand_analysis', 'price_structure',
      { fa: 'عرضه و تقاضا', ar: 'العرض والطلب', en: 'Supply & Demand', es: 'Oferta y demanda' },
      { fa: 'نواحی عدم تعادل عرضه/تقاضا که قیمت به آن‌ها واکنش نشان می‌دهد.', ar: 'مناطق اختلال العرض/الطلب التي يتفاعل معها السعر.', en: 'Supply/demand imbalance zones price tends to react from.', es: 'Zonas de desequilibrio oferta/demanda desde las que el precio suele reaccionar.' },
      {
        coreConcepts: ['fresh vs. tested zone', 'base-to-move', 'zone strength'],
        recommendedFocusIds: ['supply_demand', 'key_levels', 'rejection', 'displacement'],
        optionalFocusIds: ['imbalance', 'retest', 'multi_timeframe', 'exhaustion'],
        relatedStyleIds: ['support_resistance_analysis', 'order_block_analysis', 'liquidity_analysis'],
        analysisPrinciples: ['A fresh, untested zone carries more weight than one already mitigated'],
        limitations: ['Zone boundaries vary between practitioners'],
        futurePromptGuidance: ['Note whether a zone is fresh or already tested before assigning it weight.']
      }),
    s('trend_analysis', 'price_structure',
      { fa: 'تحلیل روند', ar: 'تحليل الاتجاه', en: 'Trend Analysis', es: 'Análisis de tendencia' },
      { fa: 'جهت، قدرت و تداوم روند قیمت.', ar: 'اتجاه وقوة واستمرارية الاتجاه السعري.', en: 'Direction, strength and continuation of the price trend.', es: 'Dirección, fuerza y continuidad de la tendencia del precio.' },
      {
        coreConcepts: ['higher-highs/higher-lows', 'trend strength', 'trend exhaustion'],
        recommendedFocusIds: ['trend', 'trend_strength', 'market_structure'],
        optionalFocusIds: ['exhaustion', 'multi_timeframe', 'divergence', 'moving_average_structure'],
        relatedStyleIds: ['dow_theory', 'trend_following', 'moving_average_analysis'],
        analysisPrinciples: ['Trend direction is judged from swing structure, not a single indicator'],
        limitations: ['No native entry-timing mechanism on its own'],
        futurePromptGuidance: ['State trend direction and strength as two separate judgments, not one.']
      }),
    s('trendline_channel_analysis', 'price_structure',
      { fa: 'خط روند و کانال', ar: 'خط الاتجاه والقناة', en: 'Trendline / Channel Analysis', es: 'Líneas de tendencia y canales' },
      { fa: 'مرزهای زاویه‌دار حرکت قیمت و شکست/بازآزمایی آن‌ها.', ar: 'حدود مائلة لحركة السعر واختراقها/إعادة اختبارها.', en: 'Angled boundaries of price movement and their break/retest.', es: 'Límites angulares del movimiento del precio y su ruptura/reprueba.' },
      {
        coreConcepts: ['trendline validity', 'channel boundaries', 'break and retest'],
        recommendedFocusIds: ['key_levels', 'breakout', 'retest', 'trend'],
        optionalFocusIds: ['failed_breakout', 'trend_strength', 'multi_timeframe'],
        relatedStyleIds: ['trend_analysis', 'breakout_analysis'],
        analysisPrinciples: ['A trendline needs at least two prior touches to be considered valid'],
        limitations: ['Line placement is subjective; small angle changes shift the read']
      }),
    s('breakout_analysis', 'price_structure',
      { fa: 'تحلیل شکست سطح', ar: 'تحليل الاختراق', en: 'Breakout Analysis', es: 'Análisis de ruptura' },
      { fa: 'شکست معتبر سطوح کلیدی و ادامه یا شکست آن.', ar: 'الاختراق الصحيح للمستويات الرئيسية واستمراره أو فشله.', en: 'Valid breaks of key levels and their continuation or failure.', es: 'Rupturas válidas de niveles clave y su continuación o fallo.' },
      {
        coreConcepts: ['breakout confirmation', 'retest', 'false breakout/trap'],
        recommendedFocusIds: ['breakout', 'retest', 'key_levels', 'expansion'],
        optionalFocusIds: ['failed_breakout', 'trap', 'volume', 'volatility'],
        relatedStyleIds: ['trendline_channel_analysis', 'breakout_expansion', 'range_trading_analysis'],
        analysisPrinciples: ['A breakout is confirmed by follow-through, not the break candle alone'],
        limitations: ['False breakouts are common in low-liquidity or ranging conditions']
      }),
    s('market_structure_analysis', 'price_structure',
      { fa: 'تحلیل ساختار بازار / رنج', ar: 'تحليل بنية السوق / النطاق', en: 'Range / Market Structure Analysis', es: 'Estructura de mercado / rango' },
      { fa: 'نقشه‌برداری ساختار بازار: روند، رنج و نقاط چرخش.', ar: 'رسم خريطة بنية السوق: اتجاه ونطاق ونقاط تحول.', en: 'Mapping market structure: trend, range and turning points.', es: 'Mapeo de la estructura del mercado: tendencia, rango y puntos de giro.' },
      {
        coreConcepts: ['swing highs/lows', 'range boundaries', 'structure break'],
        recommendedFocusIds: ['market_structure', 'range', 'key_levels', 'trend'],
        optionalFocusIds: ['bos', 'choch', 'multi_timeframe', 'market_phase'],
        relatedStyleIds: ['price_action', 'range_trading_analysis', 'structure_shift_analysis'],
        analysisPrinciples: ['Structure is read from confirmed swing points, never anticipated ones'],
        limitations: ['Swing-point definitions vary between traders']
      }),

    // ---- LIQUIDITY & INSTITUTIONAL ---------------------------------------------------------
    s('smc', 'liquidity_institutional',
      { fa: 'مفاهیم پول هوشمند (SMC)', ar: 'مفاهيم المال الذكي (SMC)', en: 'Smart Money Concepts / SMC', es: 'Smart Money Concepts (SMC)' },
      { fa: 'ردیابی نقدینگی، عدم تعادل و رفتار احتمالی پول نهادی.', ar: 'تتبع السيولة والاختلال والسلوك المحتمل للمال المؤسسي.', en: 'Tracking liquidity, imbalance and probable institutional footprint.', es: 'Seguimiento de liquidez, desequilibrio y huella institucional probable.' },
      {
        coreConcepts: ['liquidity pools', 'displacement', 'order blocks', 'premium/discount'],
        recommendedFocusIds: ['liquidity', 'liquidity_sweep', 'market_structure', 'displacement', 'fair_value_gap', 'order_block', 'premium_discount'],
        optionalFocusIds: ['bos', 'choch', 'multi_timeframe', 'imbalance'],
        requiredInputs: ['chart_image'], supportedInputs: ['chart_image', 'multi_timeframe_charts'],
        relatedStyleIds: ['ict', 'liquidity_analysis', 'order_block_analysis', 'structure_shift_analysis', 'imbalance_fvg_analysis'],
        analysisPrinciples: ['Price is drawn toward resting liquidity before a genuine directional move'],
        limitations: ['Overlaps heavily with ICT - shares most Focus concepts rather than being independently distinct', 'No verified access to real institutional order flow'],
        futurePromptGuidance: ['Frame every liquidity claim as probability, never as confirmed institutional intent.']
      }),
    s('ict', 'liquidity_institutional',
      { fa: 'مفاهیم ICT', ar: 'مفاهيم ICT', en: 'ICT Concepts', es: 'Conceptos ICT' },
      { fa: 'زمان‌بندی سشن، نقدینگی و ساختار به سبک ICT.', ar: 'توقيت الجلسات والسيولة والبنية بأسلوب ICT.', en: 'Session timing, liquidity and structure in the ICT vocabulary.', es: 'Timing de sesión, liquidez y estructura con el vocabulario ICT.' },
      {
        coreConcepts: ['killzones', 'liquidity sweep', 'fair value gap', 'order block'],
        recommendedFocusIds: ['liquidity', 'liquidity_sweep', 'fair_value_gap', 'order_block', 'displacement', 'premium_discount'],
        optionalFocusIds: ['market_structure', 'bos', 'choch', 'multi_timeframe'],
        relatedStyleIds: ['smc', 'liquidity_analysis', 'imbalance_fvg_analysis', 'order_block_analysis'],
        analysisPrinciples: ['Session timing shapes when a liquidity draw is most probable'],
        limitations: ['Shares most concepts with SMC rather than being a separately verified discipline'],
        futurePromptGuidance: ['Note the active trading session/killzone context when it materially affects the read.']
      }),
    s('liquidity_analysis', 'liquidity_institutional',
      { fa: 'تحلیل نقدینگی', ar: 'تحليل السيولة', en: 'Liquidity Analysis', es: 'Análisis de liquidez' },
      { fa: 'استخرهای نقدینگی و احتمال جاروب شدن آن‌ها.', ar: 'برك السيولة واحتمال جرفها.', en: 'Liquidity pools and their probability of being swept.', es: 'Pools de liquidez y su probabilidad de ser barridos.' },
      {
        coreConcepts: ['equal highs/lows', 'stop clusters', 'sweep-and-reverse'],
        recommendedFocusIds: ['liquidity', 'liquidity_pool', 'liquidity_sweep', 'stop_run'],
        optionalFocusIds: ['premium_discount', 'key_levels', 'multi_timeframe'],
        relatedStyleIds: ['smc', 'ict', 'order_flow'],
        analysisPrinciples: ['Obvious equal highs/lows are the most probable liquidity targets'],
        limitations: ['A sweep is only confirmed after the fact, never guaranteed in advance']
      }),
    s('structure_shift_analysis', 'liquidity_institutional',
      { fa: 'تحلیل تغییر ساختار (BOS/CHOCH)', ar: 'تحليل تحول البنية (BOS/CHOCH)', en: 'Market Structure Shift / BOS / CHOCH analysis', es: 'Cambio de estructura (BOS/CHOCH)' },
      { fa: 'شناسایی شکست ساختار و تغییر جهت آن.', ar: 'تحديد كسر البنية وتغيّر اتجاهها.', en: 'Identifying a structural break and its change of character.', es: 'Identificación de ruptura de estructura y su cambio de carácter.' },
      {
        coreConcepts: ['break of structure', 'change of character', 'confirmation swing'],
        recommendedFocusIds: ['bos', 'choch', 'market_structure', 'structure_shift'],
        optionalFocusIds: ['multi_timeframe', 'liquidity_sweep', 'trend'],
        relatedStyleIds: ['smc', 'ict', 'market_structure_analysis'],
        analysisPrinciples: ['CHOCH requires a confirmed break against the prior structure, not just a pause'],
        limitations: ['BOS/CHOCH labeling is not standardized across practitioners']
      }),
    s('imbalance_fvg_analysis', 'liquidity_institutional',
      { fa: 'تحلیل عدم تعادل / شکاف ارزش منصفانه', ar: 'تحليل الاختلال / فجوة القيمة العادلة', en: 'Imbalance / Fair Value Gap analysis', es: 'Desequilibrio / Fair Value Gap' },
      { fa: 'نواحی حرکت یک‌طرفه قیمت که ممکن است دوباره پر شوند.', ar: 'مناطق حركة السعر أحادية الاتجاه التي قد تُملأ لاحقاً.', en: 'One-sided price-move zones that may later be revisited.', es: 'Zonas de movimiento unidireccional del precio que pueden revisarse después.' },
      {
        coreConcepts: ['fair value gap', 'imbalance fill', 'displacement leg'],
        recommendedFocusIds: ['fair_value_gap', 'imbalance', 'displacement'],
        optionalFocusIds: ['retest', 'multi_timeframe', 'key_levels'],
        relatedStyleIds: ['smc', 'ict', 'order_block_analysis'],
        analysisPrinciples: ['A gap formed by strong displacement carries more weight than a minor one'],
        limitations: ['Not every gap fills, and timing of a fill is not predictable']
      }),
    s('order_block_analysis', 'liquidity_institutional',
      { fa: 'تحلیل بر مبنای اردر بلاک', ar: 'تحليل مبني على الأوردر بلوك', en: 'Order Block based analysis', es: 'Análisis basado en order blocks' },
      { fa: 'آخرین ناحیه مخالف قبل از یک حرکت جهت‌دار قوی.', ar: 'آخر منطقة معاكسة قبل حركة اتجاهية قوية.', en: 'The last opposing-side zone before a strong directional move.', es: 'La última zona opuesta antes de un movimiento direccional fuerte.' },
      {
        coreConcepts: ['order block validity', 'mitigation', 'displacement origin'],
        recommendedFocusIds: ['order_block', 'displacement', 'key_levels'],
        optionalFocusIds: ['fair_value_gap', 'retest', 'multi_timeframe'],
        relatedStyleIds: ['smc', 'ict', 'supply_demand_analysis'],
        analysisPrinciples: ['An unmitigated order block carries more weight than one already tested'],
        limitations: ['Order block identification is not standardized across practitioners']
      }),
    s('premium_discount_analysis', 'liquidity_institutional',
      { fa: 'چارچوب پرمیوم/دیسکانت', ar: 'إطار البريميوم/الخصم', en: 'Premium / Discount framework', es: 'Marco de premium/descuento' },
      { fa: 'تقسیم رنج به نواحی گران/ارزان برای بهبود زمان‌بندی ورود.', ar: 'تقسيم النطاق إلى مناطق غالية/رخيصة لتحسين توقيت الدخول.', en: 'Splitting a range into expensive/cheap zones to refine entry timing.', es: 'Dividir un rango en zonas caras/baratas para afinar el timing de entrada.' },
      {
        coreConcepts: ['equilibrium', 'premium zone', 'discount zone'],
        recommendedFocusIds: ['premium_discount', 'key_levels', 'range'],
        optionalFocusIds: ['liquidity', 'multi_timeframe'],
        relatedStyleIds: ['smc', 'ict', 'liquidity_analysis'],
        analysisPrinciples: ['Entries in the direction of bias are favored from the discount/premium side of the range'],
        limitations: ['Range boundaries must already be well-defined for this to be meaningful']
      }),

    // ---- AUCTION / VOLUME / ORDER FLOW -----------------------------------------------------
    s('order_flow', 'auction_volume_orderflow',
      { fa: 'جریان سفارش (Order Flow)', ar: 'تدفق الأوامر', en: 'Order Flow', es: 'Order Flow' },
      { fa: 'خواندن دلتا و جذب سفارش‌ها در لحظه.', ar: 'قراءة الدلتا وامتصاص الأوامر لحظياً.', en: 'Reading delta and order absorption in real time.', es: 'Lectura del delta y la absorción de órdenes en tiempo real.' },
      {
        coreConcepts: ['delta', 'absorption', 'aggressive vs. passive flow'],
        recommendedFocusIds: ['delta', 'cumulative_delta', 'absorption', 'imbalance_orderflow', 'volume', 'key_levels'],
        optionalFocusIds: ['exhaustion', 'multi_timeframe'],
        requiredInputs: ['visible_orderflow_chart'], supportedInputs: ['visible_orderflow_chart', 'footprint_data'],
        relatedStyleIds: ['footprint_analysis', 'auction_market_theory', 'delta_analysis', 'cumulative_delta_analysis'],
        analysisPrinciples: ['Absorption at a level is weighed more heavily than the raw price level alone'],
        limitations: ['Requires order-flow/footprint data most retail charting does not show by default'],
        futurePromptGuidance: ['Never claim an order-flow read from a plain candlestick screenshot with no visible flow/footprint data.']
      }),
    s('footprint_analysis', 'auction_volume_orderflow',
      { fa: 'تحلیل فوت‌پرینت', ar: 'تحليل الفوت‌برنت', en: 'Footprint Analysis', es: 'Análisis de footprint' },
      { fa: 'حجم بید/اسک درون هر کندل برای رفتار خرد قیمت.', ar: 'حجم العرض/الطلب داخل كل شمعة لسلوك السعر الدقيق.', en: 'Bid/ask volume inside each candle for micro price behavior.', es: 'Volumen bid/ask dentro de cada vela para el comportamiento micro del precio.' },
      {
        coreConcepts: ['bid/ask imbalance', 'footprint cluster', 'absorption'],
        recommendedFocusIds: ['imbalance_orderflow', 'absorption', 'delta', 'volume'],
        optionalFocusIds: ['cumulative_delta', 'key_levels'],
        requiredInputs: ['footprint_data'], supportedInputs: ['footprint_data'],
        relatedStyleIds: ['order_flow', 'delta_analysis', 'tape_reading'],
        analysisPrinciples: ['A footprint imbalance cluster at a level is stronger evidence than price alone'],
        limitations: ['Requires footprint charting most platforms do not provide free of charge']
      }),
    s('volume_analysis', 'auction_volume_orderflow',
      { fa: 'تحلیل حجم', ar: 'تحليل الحجم', en: 'Volume Analysis', es: 'Análisis de volumen' },
      { fa: 'حجم معاملات به‌عنوان تأییدکننده یا رد‌کننده حرکت قیمت.', ar: 'حجم التداول كمؤكد أو مبطل لحركة السعر.', en: 'Trading volume as a confirming or invalidating signal for price movement.', es: 'El volumen como señal que confirma o invalida el movimiento del precio.' },
      {
        coreConcepts: ['volume spike', 'volume dry-up', 'volume-price confirmation'],
        recommendedFocusIds: ['volume', 'breakout', 'exhaustion'],
        optionalFocusIds: ['trend_strength', 'key_levels', 'divergence'],
        relatedStyleIds: ['volume_profile_analysis', 'market_profile_analysis', 'classical_ta'],
        analysisPrinciples: ['A breakout with rising volume is weighed more heavily than one on light volume'],
        limitations: ['Reported volume differs meaningfully across exchanges/brokers for the same instrument']
      }),
    s('volume_profile_analysis', 'auction_volume_orderflow',
      { fa: 'پروفایل حجم', ar: 'بروفايل الحجم', en: 'Volume Profile', es: 'Perfil de volumen' },
      { fa: 'توزیع حجم در سطوح قیمتی برای یافتن نواحی پرمعامله.', ar: 'توزيع الحجم على المستويات السعرية لإيجاد المناطق الأكثر تداولاً.', en: 'Volume distribution across price levels to find heavily-traded zones.', es: 'Distribución del volumen por niveles de precio para hallar zonas muy negociadas.' },
      {
        coreConcepts: ['point of control', 'value area', 'high/low volume node'],
        recommendedFocusIds: ['volume_profile', 'poc', 'value_area', 'acceptance', 'rejection', 'key_levels'],
        optionalFocusIds: ['multi_timeframe', 'range'],
        requiredInputs: ['structured_volume_profile'], supportedInputs: ['structured_volume_profile', 'visible_volume_profile'],
        relatedStyleIds: ['market_profile_analysis', 'auction_market_theory', 'volume_analysis'],
        analysisPrinciples: ['Price accepted above/below the value area is treated differently from price rejected back into it'],
        limitations: ['Requires a real volume-profile view, not inferable from a plain candlestick chart'],
        futurePromptGuidance: ['Require a real profile input before making any POC/value-area claim - never estimate one from candles alone.']
      }),
    s('market_profile_analysis', 'auction_volume_orderflow',
      { fa: 'مارکت پروفایل', ar: 'ماركت بروفايل', en: 'Market Profile', es: 'Market Profile' },
      { fa: 'توزیع زمان/قیمت روزانه به سبک TPO برای فاز بازار.', ar: 'توزيع الوقت/السعر اليومي بأسلوب TPO لتحديد طور السوق.', en: 'TPO-style time/price distribution for reading the market phase.', es: 'Distribución tiempo/precio estilo TPO para leer la fase del mercado.' },
      {
        coreConcepts: ['TPO distribution', 'initial balance', 'balance vs. imbalance day'],
        recommendedFocusIds: ['market_phase', 'value_area', 'poc', 'range', 'market_profile'],
        optionalFocusIds: ['volume_profile', 'trend'],
        requiredInputs: ['structured_market_data'], supportedInputs: ['structured_market_data'],
        relatedStyleIds: ['volume_profile_analysis', 'auction_market_theory'],
        analysisPrinciples: ['A balanced day favors mean-reversion reads; an imbalanced day favors trend-continuation reads'],
        limitations: ['Requires session-based TPO data not shown on a standard candlestick chart']
      }),
    s('auction_market_theory', 'auction_volume_orderflow',
      { fa: 'نظریه بازار حراجی', ar: 'نظرية سوق المزاد', en: 'Auction Market Theory', es: 'Teoría del mercado de subasta' },
      { fa: 'بازار به‌عنوان یک حراج پیوسته برای یافتن ارزش منصفانه.', ar: 'السوق كمزاد مستمر لإيجاد القيمة العادلة.', en: 'The market as a continuous auction searching for fair value.', es: 'El mercado como una subasta continua en busca del valor justo.' },
      {
        coreConcepts: ['fair value', 'excess', 'two-way vs. one-way auction'],
        recommendedFocusIds: ['value_area', 'poc', 'acceptance', 'rejection'],
        optionalFocusIds: ['volume_profile', 'market_phase'],
        requiredInputs: ['structured_volume_profile'], supportedInputs: ['structured_volume_profile'],
        relatedStyleIds: ['market_profile_analysis', 'volume_profile_analysis'],
        analysisPrinciples: ['Excess at the edge of a range signals rejection of value beyond that point'],
        limitations: ['Conceptual framework - needs a real profile input to apply concretely']
      }),
    s('delta_analysis', 'auction_volume_orderflow',
      { fa: 'تحلیل دلتا', ar: 'تحليل الدلتا', en: 'Delta Analysis', es: 'Análisis de delta' },
      { fa: 'تفاوت حجم خرید و فروش تهاجمی در هر بازه.', ar: 'الفرق بين حجم الشراء والبيع العدواني لكل فترة.', en: 'The difference between aggressive buy and sell volume per interval.', es: 'La diferencia entre el volumen agresivo de compra y venta por intervalo.' },
      {
        coreConcepts: ['positive/negative delta', 'delta divergence'],
        recommendedFocusIds: ['delta', 'volume', 'divergence'],
        optionalFocusIds: ['absorption', 'key_levels'],
        requiredInputs: ['visible_orderflow_chart'], supportedInputs: ['visible_orderflow_chart'],
        relatedStyleIds: ['order_flow', 'cumulative_delta_analysis', 'footprint_analysis'],
        analysisPrinciples: ['A price move against the prevailing delta is treated as a warning, not ignored'],
        limitations: ['Requires order-flow data most retail platforms do not surface by default']
      }),
    s('cumulative_delta_analysis', 'auction_volume_orderflow',
      { fa: 'دلتای تجمعی', ar: 'الدلتا التراكمية', en: 'Cumulative Delta', es: 'Delta acumulado' },
      { fa: 'روند تجمعی دلتا در طول یک سشن یا بازه.', ar: 'الاتجاه التراكمي للدلتا خلال جلسة أو فترة.', en: 'The running trend of delta across a session or interval.', es: 'La tendencia acumulada del delta a lo largo de una sesión o intervalo.' },
      {
        coreConcepts: ['cumulative delta trend', 'CVD divergence'],
        recommendedFocusIds: ['cumulative_delta', 'delta', 'divergence'],
        optionalFocusIds: ['trend', 'exhaustion'],
        requiredInputs: ['visible_orderflow_chart'], supportedInputs: ['visible_orderflow_chart'],
        relatedStyleIds: ['delta_analysis', 'order_flow'],
        analysisPrinciples: ['A rising price against falling cumulative delta is treated as a genuine divergence warning'],
        limitations: ['Requires a continuous, correctly-scoped CVD feed to be meaningful']
      }),
    s('tape_reading', 'auction_volume_orderflow',
      { fa: 'خواندن تیپ / معاملات لحظه‌ای', ar: 'قراءة الشريط / الصفقات اللحظية', en: 'Tape / Time & Sales', es: 'Cinta / Time & Sales' },
      { fa: 'مشاهده مستقیم جریان معاملات لحظه‌به‌لحظه.', ar: 'مشاهدة تدفق الصفقات لحظة بلحظة مباشرة.', en: 'Direct, moment-to-moment observation of the trade flow.', es: 'Observación directa, momento a momento, del flujo de operaciones.' },
      {
        coreConcepts: ['print size', 'print speed', 'aggressor side'],
        recommendedFocusIds: ['absorption', 'delta', 'volume'],
        optionalFocusIds: ['exhaustion', 'key_levels'],
        requiredInputs: ['tick_data'], supportedInputs: ['tick_data'],
        relatedStyleIds: ['order_flow', 'footprint_analysis'],
        analysisPrinciples: ['Print size and speed at a level matter as much as the level itself'],
        limitations: ['Requires a live time-and-sales feed, not reconstructable from a static chart image']
      }),
    s('vwap_analysis', 'auction_volume_orderflow',
      { fa: 'تحلیل مبتنی بر VWAP', ar: 'تحليل مبني على VWAP', en: 'VWAP-based Analysis', es: 'Análisis basado en VWAP' },
      { fa: 'میانگین قیمت وزن‌شده با حجم به‌عنوان مرجع منصفانه روز.', ar: 'متوسط السعر المرجح بالحجم كمرجع عادل لليوم.', en: "Volume-weighted average price as the day's fair-value reference.", es: 'Precio medio ponderado por volumen como referencia justa del día.' },
      {
        coreConcepts: ['VWAP as mean', 'standard-deviation bands', 'above/below VWAP bias'],
        recommendedFocusIds: ['dynamic_levels', 'key_levels', 'trend'],
        optionalFocusIds: ['volume', 'volatility', 'multi_timeframe'],
        relatedStyleIds: ['volume_profile_analysis', 'auction_market_theory'],
        analysisPrinciples: ['Price sustained on one side of VWAP is read as directional bias for the session'],
        limitations: ['Resets per session by convention, so cross-session comparison needs care']
      }),

    // ---- PRICE PATTERN FAMILIES ------------------------------------------------------------
    s('classical_chart_patterns', 'pattern_families',
      { fa: 'الگوهای کلاسیک نمودار', ar: 'الأنماط الكلاسيكية للرسم البياني', en: 'Classical Chart Patterns', es: 'Patrones clásicos del gráfico' },
      { fa: 'الگوهای شناخته‌شده مانند سر و شانه، مثلث و پرچم.', ar: 'أنماط معروفة مثل الرأس والكتفين والمثلث والعلم.', en: 'Recognized shapes such as head-and-shoulders, triangles and flags.', es: 'Formaciones reconocidas como cabeza y hombros, triángulos y banderas.' },
      {
        coreConcepts: ['reversal patterns', 'continuation patterns', 'measured move'],
        recommendedFocusIds: ['chart_patterns', 'key_levels', 'breakout'],
        optionalFocusIds: ['volume', 'retest', 'trend'],
        relatedStyleIds: ['classical_ta', 'candlestick_analysis', 'harmonic_patterns'],
        analysisPrinciples: ['A pattern is only actionable once its breakout is confirmed, not while still forming'],
        limitations: ['Pattern recognition is subjective without a strict geometric rule set']
      }),
    s('candlestick_analysis', 'pattern_families',
      { fa: 'تحلیل کندل‌استیک', ar: 'تحليل الشموع اليابانية', en: 'Candlestick Analysis', es: 'Análisis de velas japonesas' },
      { fa: 'الگوهای کندلی به‌عنوان نشانه‌های چرخش یا تداوم.', ar: 'أنماط الشموع كإشارات انعكاس أو استمرار.', en: 'Candle formations as reversal or continuation signals.', es: 'Formaciones de velas como señales de giro o continuación.' },
      {
        coreConcepts: ['engulfing', 'pin bar', 'doji', 'candle context'],
        recommendedFocusIds: ['candlestick_behavior', 'rejection', 'key_levels'],
        optionalFocusIds: ['momentum', 'multi_timeframe'],
        relatedStyleIds: ['price_action', 'classical_chart_patterns'],
        analysisPrinciples: ['A candle signal is read together with the level it forms at, never in isolation'],
        limitations: ['A single-candle signal has a high false-positive rate on its own']
      }),
    s('harmonic_patterns', 'pattern_families',
      { fa: 'الگوهای هارمونیک', ar: 'الأنماط التوافقية', en: 'Harmonic Patterns', es: 'Patrones armónicos' },
      { fa: 'الگوهای هندسی مبتنی بر نسبت‌های فیبوناچی دقیق.', ar: 'أنماط هندسية مبنية على نسب فيبوناتشي دقيقة.', en: 'Geometric patterns built on precise Fibonacci ratios.', es: 'Patrones geométricos basados en ratios de Fibonacci precisos.' },
      {
        coreConcepts: ['Gartley/Bat/Butterfly/Crab', 'PRZ', 'ratio precision'],
        recommendedFocusIds: ['fibonacci_zone', 'harmonic_structure', 'key_levels'],
        optionalFocusIds: ['rejection', 'multi_timeframe', 'invalidation'],
        relatedStyleIds: ['fibonacci_analysis', 'elliott_wave'],
        analysisPrinciples: ['A harmonic pattern needs a completed structure at its potential reversal zone before acting on it'],
        limitations: ['Ratio tolerances differ across sources; strict precision is rarely met exactly']
      }),
    s('fibonacci_analysis', 'pattern_families',
      { fa: 'تحلیل فیبوناچی', ar: 'تحليل فيبوناتشي', en: 'Fibonacci-based Analysis', es: 'Análisis basado en Fibonacci' },
      { fa: 'سطوح بازگشتی و گسترشی فیبوناچی برای هدف و اصلاح.', ar: 'مستويات فيبوناتشي الارتدادية والامتدادية للهدف والتصحيح.', en: 'Fibonacci retracement/extension levels for targets and pullbacks.', es: 'Niveles de retroceso/extensión de Fibonacci para objetivos y pullbacks.' },
      {
        coreConcepts: ['retracement zones', 'extension targets', 'confluence'],
        recommendedFocusIds: ['fibonacci_zone', 'key_levels'],
        optionalFocusIds: ['retest', 'multi_timeframe', 'harmonic_structure'],
        relatedStyleIds: ['harmonic_patterns', 'elliott_wave'],
        analysisPrinciples: ['A Fibonacci level is weighed more heavily when it confluences with another form of support/resistance'],
        limitations: ['Swing-point selection for the Fibonacci grid is itself subjective']
      }),

    // ---- MARKET CYCLE / STRUCTURAL THEORIES ------------------------------------------------
    s('wyckoff', 'cycle_structural',
      { fa: 'وایکاف', ar: 'وايكوف', en: 'Wyckoff', es: 'Wyckoff' },
      { fa: 'فازهای انباشت/توزیع و رابطه تلاش-نتیجه.', ar: 'أطوار التجميع/التوزيع وعلاقة الجهد بالنتيجة.', en: 'Accumulation/distribution phases and the effort-vs-result relationship.', es: 'Fases de acumulación/distribución y la relación esfuerzo-resultado.' },
      {
        coreConcepts: ['accumulation/distribution', 'spring/upthrust', 'effort vs. result'],
        recommendedFocusIds: ['range', 'wyckoff_phase', 'accumulation_distribution', 'spring_upthrust', 'effort_vs_result', 'volume'],
        optionalFocusIds: ['key_levels', 'multi_timeframe'],
        relatedStyleIds: ['auction_market_theory', 'market_structure_analysis'],
        analysisPrinciples: ['A phase label is only assigned once its defining events (spring, test, sign of strength) are actually present'],
        limitations: ['Phase boundaries are read in hindsight more reliably than in real time'],
        futurePromptGuidance: ['Never assert a Wyckoff phase without naming the specific structural event (e.g. spring, SOS) that supports it.']
      }),
    s('elliott_wave', 'cycle_structural',
      { fa: 'امواج الیوت', ar: 'موجات إليوت', en: 'Elliott Wave', es: 'Ondas de Elliott' },
      { fa: 'شمارش موج ایمپالسیو و اصلاحی برای نقشه‌برداری چرخه قیمت.', ar: 'عد الموجات الدافعة والتصحيحية لرسم دورة السعر.', en: 'Impulse/corrective wave counting to map the price cycle.', es: 'Conteo de ondas impulsivas/correctivas para mapear el ciclo del precio.' },
      {
        coreConcepts: ['impulse wave', 'corrective wave', 'wave invalidation'],
        recommendedFocusIds: ['wave_structure', 'wave_count', 'impulse_correction', 'fibonacci_zone', 'wave_invalidation'],
        optionalFocusIds: ['multi_timeframe', 'trend'],
        relatedStyleIds: ['fibonacci_analysis', 'harmonic_patterns', 'gann', 'cycle_analysis'],
        analysisPrinciples: ['A wave count is discarded the moment its own invalidation level is breached'],
        limitations: ['Wave counts are frequently subjective and often relabeled after the fact'],
        futurePromptGuidance: ['Always state the invalidation level a proposed wave count depends on.']
      }),
    s('gann', 'cycle_structural',
      { fa: 'گن (Gann)', ar: 'غان (Gann)', en: 'Gann', es: 'Gann' },
      { fa: 'زاویه‌ها، سطوح و زمان‌بندی به سبک گن.', ar: 'الزوايا والمستويات والتوقيت بأسلوب غان.', en: 'Angles, levels and timing in the Gann tradition.', es: 'Ángulos, niveles y timing al estilo Gann.' },
      {
        coreConcepts: ['Gann angles', 'time-price squaring', 'cyclical timing'],
        recommendedFocusIds: ['key_levels', 'trend'],
        optionalFocusIds: ['fibonacci_zone', 'wave_invalidation', 'multi_timeframe'],
        relatedStyleIds: ['elliott_wave', 'cycle_analysis'],
        analysisPrinciples: ['Time-based turning points are considered alongside price levels, not instead of them'],
        limitations: ['Method construction is highly subjective and not consistently defined across sources']
      }),
    s('cycle_analysis', 'cycle_structural',
      { fa: 'تحلیل چرخه‌ای', ar: 'التحليل الدوري', en: 'Cycle Analysis', es: 'Análisis de ciclos' },
      { fa: 'الگوهای زمانی تکرارشونده در حرکت بازار.', ar: 'الأنماط الزمنية المتكررة في حركة السوق.', en: 'Repeating time-based patterns in market movement.', es: 'Patrones temporales recurrentes en el movimiento del mercado.' },
      {
        coreConcepts: ['cycle length', 'cycle top/bottom', 'phase timing'],
        recommendedFocusIds: ['market_phase', 'trend'],
        optionalFocusIds: ['exhaustion', 'multi_timeframe'],
        relatedStyleIds: ['gann', 'elliott_wave', 'wyckoff'],
        analysisPrinciples: ['A cyclical read is treated as probabilistic timing context, never a standalone signal'],
        limitations: ['Cycle length estimates drift and are frequently revised after the fact']
      }),

    // ---- INDICATOR / MATHEMATICAL ----------------------------------------------------------
    s('ichimoku', 'indicator_mathematical',
      { fa: 'ایچیموکو', ar: 'إيشيموكو', en: 'Ichimoku', es: 'Ichimoku' },
      { fa: 'ابر کومو، تنکان-کیجون و چیکو برای روند و تعادل.', ar: 'سحابة كومو وتينكان-كيجون وتشيكو للاتجاه والتوازن.', en: 'Kumo cloud, Tenkan-Kijun and Chikou for trend and equilibrium.', es: 'Nube Kumo, Tenkan-Kijun y Chikou para tendencia y equilibrio.' },
      {
        coreConcepts: ['kumo cloud', 'TK cross', 'chikou confirmation'],
        recommendedFocusIds: ['kumo_context', 'tenkan_kijun', 'tk_cross', 'chikou', 'multi_timeframe', 'trend'],
        optionalFocusIds: ['kumo_twist', 'key_levels'],
        relatedStyleIds: ['moving_average_analysis', 'trend_analysis'],
        analysisPrinciples: ['Price position relative to the kumo is the primary trend filter before any signal is weighed'],
        limitations: ['Lagging by construction on lower timeframes']
      }),
    s('moving_average_analysis', 'indicator_mathematical',
      { fa: 'تحلیل میانگین متحرک', ar: 'تحليل المتوسطات المتحركة', en: 'Moving Average Analysis', es: 'Análisis de medias móviles' },
      { fa: 'میانگین‌های متحرک برای روند، شیب و تقاطع.', ar: 'المتوسطات المتحركة للاتجاه والميل والتقاطع.', en: 'Moving averages for trend, slope and crossovers.', es: 'Medias móviles para tendencia, pendiente y cruces.' },
      {
        coreConcepts: ['MA slope', 'MA crossover', 'dynamic support/resistance'],
        recommendedFocusIds: ['moving_average_structure', 'trend', 'dynamic_levels'],
        optionalFocusIds: ['trend_strength', 'multi_timeframe'],
        relatedStyleIds: ['ichimoku', 'trend_following', 'trend_analysis'],
        analysisPrinciples: ['MA slope is weighed alongside price position relative to the average, not price position alone'],
        limitations: ['Inherently lagging; whipsaws frequently in ranging conditions']
      }),
    s('momentum_analysis', 'indicator_mathematical',
      { fa: 'تحلیل مومنتوم', ar: 'تحليل الزخم', en: 'Momentum Analysis', es: 'Análisis de momentum' },
      { fa: 'سرعت و شتاب حرکت قیمت.', ar: 'سرعة وتسارع حركة السعر.', en: 'The speed and acceleration of price movement.', es: 'La velocidad y aceleración del movimiento del precio.' },
      {
        coreConcepts: ['acceleration', 'deceleration', 'momentum divergence'],
        recommendedFocusIds: ['momentum', 'acceleration', 'deceleration', 'divergence'],
        optionalFocusIds: ['exhaustion', 'oscillator_state'],
        relatedStyleIds: ['oscillator_analysis', 'rsi_analysis', 'momentum_trading_analysis'],
        analysisPrinciples: ['A deceleration in momentum is treated as an early warning, not a reversal signal on its own'],
        limitations: ['Momentum readings can stay extended far longer than expected in a strong trend']
      }),
    s('oscillator_analysis', 'indicator_mathematical',
      { fa: 'تحلیل نوسان‌گر (اسیلاتور)', ar: 'تحليل المذبذبات', en: 'Oscillator-Based Analysis', es: 'Análisis con osciladores' },
      { fa: 'شرایط اشباع خرید/فروش و واگرایی نوسان‌گرها.', ar: 'ظروف التشبع الشرائي/البيعي وتباعد المذبذبات.', en: 'Overbought/oversold conditions and oscillator divergence.', es: 'Condiciones de sobrecompra/sobreventa y divergencia de osciladores.' },
      {
        coreConcepts: ['overbought/oversold', 'divergence', 'centerline cross'],
        recommendedFocusIds: ['oscillator_state', 'divergence'],
        optionalFocusIds: ['momentum', 'exhaustion'],
        relatedStyleIds: ['rsi_analysis', 'macd_analysis', 'momentum_analysis'],
        analysisPrinciples: ['A divergence is treated as a warning to watch for, not an automatic reversal signal'],
        limitations: ['Overbought/oversold readings can persist through a strong trend']
      }),
    s('rsi_analysis', 'indicator_mathematical',
      { fa: 'تحلیل مبتنی بر RSI', ar: 'تحليل مبني على RSI', en: 'RSI-based Analysis', es: 'Análisis basado en RSI' },
      { fa: 'شاخص قدرت نسبی برای مومنتوم و واگرایی.', ar: 'مؤشر القوة النسبية للزخم والتباعد.', en: 'Relative Strength Index for momentum and divergence reads.', es: 'Índice de fuerza relativa para momentum y divergencias.' },
      {
        coreConcepts: ['RSI level', 'RSI divergence', 'RSI trend range'],
        recommendedFocusIds: ['oscillator_state', 'divergence', 'momentum'],
        optionalFocusIds: ['multi_timeframe'],
        relatedStyleIds: ['oscillator_analysis', 'momentum_analysis'],
        analysisPrinciples: ['RSI divergence is read together with price structure, never as a standalone trigger'],
        limitations: ['A single-indicator read without structural context has a high false-signal rate']
      }),
    s('macd_analysis', 'indicator_mathematical',
      { fa: 'تحلیل مبتنی بر MACD', ar: 'تحليل مبني على MACD', en: 'MACD-based Analysis', es: 'Análisis basado en MACD' },
      { fa: 'تقاطع خطوط و هیستوگرام MACD برای مومنتوم روند.', ar: 'تقاطع خطوط ورسم بياني MACD لزخم الاتجاه.', en: 'MACD line/signal crossovers and histogram for trend momentum.', es: 'Cruces de líneas MACD e histograma para el momentum de tendencia.' },
      {
        coreConcepts: ['MACD crossover', 'histogram', 'MACD divergence'],
        recommendedFocusIds: ['momentum', 'divergence', 'oscillator_state'],
        optionalFocusIds: ['trend', 'multi_timeframe'],
        relatedStyleIds: ['oscillator_analysis', 'momentum_analysis'],
        analysisPrinciples: ['A MACD signal is weighed against the prevailing trend context, not used in isolation'],
        limitations: ['Lagging; crossovers can trigger late relative to the actual price turn']
      }),
    s('bollinger_volatility_analysis', 'indicator_mathematical',
      { fa: 'باند بولینگر / نوسان', ar: 'نطاق بولينجر / التقلب', en: 'Bollinger / Volatility Band Analysis', es: 'Bandas de Bollinger / volatilidad' },
      { fa: 'باندهای نوسان برای فشردگی، گسترش و بازگشت به میانگین.', ar: 'نطاقات التقلب للانضغاط والتوسع والعودة للمتوسط.', en: 'Volatility bands for squeeze, expansion and mean-reversion reads.', es: 'Bandas de volatilidad para compresión, expansión y reversión a la media.' },
      {
        coreConcepts: ['band squeeze', 'band walk', 'mean reversion'],
        recommendedFocusIds: ['compression', 'expansion', 'volatility'],
        optionalFocusIds: ['breakout', 'trend'],
        relatedStyleIds: ['volatility_analysis', 'mean_reversion', 'breakout_expansion'],
        analysisPrinciples: ['A band squeeze is read as a volatility-contraction warning, not a directional signal by itself'],
        limitations: ['Band width alone gives no directional information']
      }),
    s('volatility_analysis', 'indicator_mathematical',
      { fa: 'تحلیل نوسان', ar: 'تحليل التقلب', en: 'Volatility Analysis', es: 'Análisis de volatilidad' },
      { fa: 'اندازه‌گیری و تفسیر نوسان قیمت.', ar: 'قياس وتفسير تقلب السعر.', en: 'Measuring and interpreting price volatility.', es: 'Medición e interpretación de la volatilidad del precio.' },
      {
        coreConcepts: ['volatility contraction', 'volatility expansion', 'range compression'],
        recommendedFocusIds: ['volatility', 'compression', 'expansion'],
        optionalFocusIds: ['breakout', 'exhaustion'],
        relatedStyleIds: ['bollinger_volatility_analysis', 'breakout_expansion'],
        analysisPrinciples: ['A volatility contraction is treated as a precondition to watch, not a trade signal by itself'],
        limitations: ['Volatility regime shifts can happen abruptly without prior warning']
      }),

    // ---- SYSTEMATIC MARKET BEHAVIOR --------------------------------------------------------
    s('trend_following', 'systematic_behavior',
      { fa: 'روند-محور (Trend Following)', ar: 'تتبع الاتجاه', en: 'Trend Following', es: 'Seguimiento de tendencia' },
      { fa: 'حرکت در جهت روند غالب تا نشانه معتبر چرخش.', ar: 'التحرك مع الاتجاه السائد حتى ظهور إشارة انعكاس صحيحة.', en: 'Riding the dominant trend until a valid reversal signal appears.', es: 'Seguir la tendencia dominante hasta una señal válida de giro.' },
      {
        coreConcepts: ['trend continuation', 'pullback entry', 'trailing risk'],
        recommendedFocusIds: ['trend', 'trend_strength', 'retest'],
        optionalFocusIds: ['moving_average_structure', 'multi_timeframe'],
        relatedStyleIds: ['trend_analysis', 'moving_average_analysis', 'momentum_trading_analysis'],
        analysisPrinciples: ['Entries are favored in the direction of the dominant, higher-timeframe trend'],
        limitations: ['Underperforms in genuinely range-bound conditions']
      }),
    s('mean_reversion', 'systematic_behavior',
      { fa: 'بازگشت به میانگین', ar: 'العودة إلى المتوسط', en: 'Mean Reversion', es: 'Reversión a la media' },
      { fa: 'انتظار بازگشت قیمت پس از انحراف زیاد از میانگین.', ar: 'توقع عودة السعر بعد انحراف كبير عن المتوسط.', en: 'Expecting price to revert after an extended stretch from the mean.', es: 'Esperar que el precio regrese tras un estiramiento amplio desde la media.' },
      {
        coreConcepts: ['overextension', 'mean/anchor', 'reversion trigger'],
        recommendedFocusIds: ['range', 'exhaustion', 'key_levels'],
        optionalFocusIds: ['oscillator_state', 'volatility'],
        relatedStyleIds: ['range_trading_analysis', 'bollinger_volatility_analysis'],
        analysisPrinciples: ['A reversion trade is only favored once an actual overextension from a defined mean is confirmed'],
        limitations: ['Fails sharply if the market is genuinely trending rather than ranging']
      }),
    s('momentum_trading_analysis', 'systematic_behavior',
      { fa: 'تحلیل معامله‌گری مومنتومی', ar: 'تحليل التداول بالزخم', en: 'Momentum Trading Analysis', es: 'Análisis de trading por momentum' },
      { fa: 'ورود در جهت شتاب قوی و تازه قیمت.', ar: 'الدخول باتجاه تسارع قوي وحديث للسعر.', en: 'Entering in the direction of strong, fresh price acceleration.', es: 'Entrar en la dirección de una aceleración de precio fuerte y reciente.' },
      {
        coreConcepts: ['fresh acceleration', 'momentum continuation', 'momentum fade risk'],
        recommendedFocusIds: ['momentum', 'acceleration', 'displacement'],
        optionalFocusIds: ['exhaustion', 'volume'],
        relatedStyleIds: ['momentum_analysis', 'trend_following', 'breakout_expansion'],
        analysisPrinciples: ['A momentum entry is favored closer to the origin of acceleration, not after it has already extended'],
        limitations: ['Prone to chasing a move that is already exhausting']
      }),
    s('breakout_expansion', 'systematic_behavior',
      { fa: 'شکست و گسترش', ar: 'الاختراق والتوسع', en: 'Breakout / Expansion', es: 'Ruptura / expansión' },
      { fa: 'انتظار حرکت گسترشی پس از فشردگی نوسان.', ar: 'توقع حركة توسعية بعد انضغاط التقلب.', en: 'Expecting an expansion move after a volatility contraction.', es: 'Esperar un movimiento de expansión tras una contracción de volatilidad.' },
      {
        coreConcepts: ['compression', 'expansion trigger', 'false-break risk'],
        recommendedFocusIds: ['compression', 'expansion', 'breakout'],
        optionalFocusIds: ['volatility', 'failed_breakout', 'volume'],
        relatedStyleIds: ['breakout_analysis', 'volatility_analysis', 'bollinger_volatility_analysis'],
        analysisPrinciples: ['A compression phase is treated as a precondition, with confirmation still required at the actual break'],
        limitations: ['False breakouts after a compression are common']
      }),
    s('range_trading_analysis', 'systematic_behavior',
      { fa: 'تحلیل معامله در رنج', ar: 'تحليل التداول ضمن النطاق', en: 'Range Trading Analysis', es: 'Análisis de trading en rango' },
      { fa: 'معامله بین مرزهای یک رنج مشخص.', ar: 'التداول بين حدود نطاق محدد.', en: 'Trading between the defined boundaries of a range.', es: 'Operar entre los límites definidos de un rango.' },
      {
        coreConcepts: ['range boundary', 'range rejection', 'range breakout risk'],
        recommendedFocusIds: ['range', 'key_levels', 'rejection'],
        optionalFocusIds: ['breakout', 'failed_breakout'],
        relatedStyleIds: ['mean_reversion', 'market_structure_analysis', 'support_resistance_analysis'],
        analysisPrinciples: ['A range boundary needs a confirmed rejection before being traded against'],
        limitations: ['A genuine range breakout can happen at any time without prior warning']
      }),

    // ---- QUANT / STATISTICAL ---------------------------------------------------------------
    s('statistical_ta', 'quant_statistical',
      { fa: 'تحلیل تکنیکال آماری', ar: 'التحليل الفني الإحصائي', en: 'Statistical Technical Analysis', es: 'Análisis técnico estadístico' },
      { fa: 'قواعد کلاسیک همراه با اعتبارسنجی آماری.', ar: 'قواعد كلاسيكية مع تحقق إحصائي.', en: 'Classical rules validated with statistical rigor.', es: 'Reglas clásicas validadas con rigor estadístico.' },
      {
        coreConcepts: ['sample-based validation', 'base rate', 'statistical significance'],
        recommendedFocusIds: ['trend', 'key_levels'],
        optionalFocusIds: ['volatility', 'oscillator_state'],
        requiredInputs: ['structured_market_data'], supportedInputs: ['structured_market_data'],
        relatedStyleIds: ['quantitative_analysis', 'regression_trend_analysis'],
        analysisPrinciples: ['A claim is weighed by its historical sample size, not by how it looks on one chart'],
        limitations: ['Requires structured historical data no single chart screenshot can provide']
      }),
    s('quantitative_analysis', 'quant_statistical',
      { fa: 'تحلیل کمی بازار', ar: 'التحليل الكمي للسوق', en: 'Quantitative Market Analysis', es: 'Análisis cuantitativo de mercado' },
      { fa: 'تحلیل مبتنی بر داده‌های ساختاریافته و مدل‌های عددی.', ar: 'تحليل مبني على بيانات منظمة ونماذج رقمية.', en: 'Data-driven analysis built on structured data and numeric models.', es: 'Análisis basado en datos y modelos numéricos estructurados.' },
      {
        coreConcepts: ['factor model', 'signal backtesting', 'data-driven bias'],
        recommendedFocusIds: ['trend', 'volatility'],
        optionalFocusIds: ['momentum', 'divergence'],
        requiredInputs: ['structured_market_data'], supportedInputs: ['structured_market_data'],
        relatedStyleIds: ['statistical_ta', 'regression_trend_analysis', 'correlation_rs_analysis'],
        analysisPrinciples: ['A rule is only trusted once it has real, structured evidence behind it'],
        limitations: ['Not meaningfully applicable from a single chart screenshot alone']
      }),
    s('regression_trend_analysis', 'quant_statistical',
      { fa: 'رگرسیون / روند آماری', ar: 'الانحدار / الاتجاه الإحصائي', en: 'Regression / Statistical Trend Analysis', es: 'Regresión / tendencia estadística' },
      { fa: 'برازش خطی/آماری برای سنجش شیب و انحراف روند.', ar: 'ملاءمة خطية/إحصائية لقياس ميل وانحراف الاتجاه.', en: 'Linear/statistical fits to measure trend slope and deviation.', es: 'Ajustes lineales/estadísticos para medir pendiente y desviación de tendencia.' },
      {
        coreConcepts: ['regression channel', 'standard deviation band', 'slope significance'],
        recommendedFocusIds: ['trend', 'trend_strength', 'volatility'],
        optionalFocusIds: ['key_levels'],
        requiredInputs: ['structured_market_data'], supportedInputs: ['structured_market_data'],
        relatedStyleIds: ['statistical_ta', 'quantitative_analysis'],
        analysisPrinciples: ["A regression channel's edge is treated as statistical deviation, not a hard support/resistance line"],
        limitations: ['Sensitive to the chosen lookback window - results shift materially if it changes']
      }),
    s('correlation_rs_analysis', 'quant_statistical',
      { fa: 'همبستگی / قدرت نسبی', ar: 'الارتباط / القوة النسبية', en: 'Correlation / Relative Strength Analysis', es: 'Correlación / fuerza relativa' },
      { fa: 'مقایسه رفتار یک نماد نسبت به بازار یا دارایی‌های مرتبط.', ar: 'مقارنة سلوك أداة ما بالسوق أو الأصول المرتبطة.', en: "Comparing an instrument's behavior against the market or related assets.", es: 'Comparar el comportamiento de un instrumento frente al mercado o activos relacionados.' },
      {
        coreConcepts: ['relative strength', 'correlation shift', 'leader/laggard'],
        recommendedFocusIds: ['trend', 'trend_strength'],
        optionalFocusIds: ['divergence', 'multi_timeframe'],
        requiredInputs: ['structured_market_data'], supportedInputs: ['structured_market_data'],
        relatedStyleIds: ['quantitative_analysis', 'statistical_ta'],
        analysisPrinciples: ['A single-symbol move is weighed against its correlated peers before being called genuinely independent strength'],
        limitations: ["Requires comparison data beyond a single instrument's own chart"]
      }),

    // ---- SPECIAL / GENERIC ------------------------------------------------------------------
    s('general_analysis', 'special_generic',
      { fa: 'تحلیل عمومی / باز', ar: 'تحليل عام / مفتوح', en: 'General / Open Analysis', es: 'Análisis general / abierto' },
      { fa: 'بدون پایبندی به یک چارچوب تحلیلی خاص.', ar: 'دون التقيد بإطار تحليلي محدد.', en: 'No commitment to one specific formal framework.', es: 'Sin compromiso con un marco formal específico.' },
      {
        coreConcepts: ['broad market read', 'no fixed framework'],
        recommendedFocusIds: ['market_structure', 'trend', 'key_levels', 'momentum'],
        optionalFocusIds: ['volatility', 'support_resistance', 'candlestick_behavior', 'confirmation', 'conflicting_evidence'],
        relatedStyleIds: ['price_action', 'classical_ta'],
        analysisPrinciples: ['Broad, framework-agnostic reasoning rather than one named methodology'],
        limitations: ['Less precise than a committed framework by design'],
        futurePromptGuidance: ['Do not imply adherence to any single named framework for this style.']
      }),
    s('hybrid', 'special_generic',
      { fa: 'ترکیبی (هیبرید)', ar: 'هجين', en: 'Hybrid', es: 'Híbrido' },
      { fa: 'ترکیب یک لنز اصلی با حداکثر دو لنز مکمل.', ar: 'دمج عدسة أساسية مع عدستين مكملتين كحد أقصى.', en: 'Combining one primary lens with up to two complementary lenses.', es: 'Combinar un lente principal con hasta dos lentes complementarios.' },
      {
        // Recommended/optional focuses are deliberately empty here - a Hybrid profile's Step 2
        // options are computed at runtime from the real selected primary+secondary styles via
        // mergeFocusRecommendations(), never a static list (§20 of the brief).
        coreConcepts: ['primary lens', 'secondary lenses', 'merged focus set'],
        relatedStyleIds: [],
        analysisPrinciples: ["The primary style's own principles take precedence when two lenses would otherwise disagree"],
        limitations: ['Combining lenses adds interpretive complexity versus a single committed framework']
      }),
    s('custom_method', 'special_generic',
      { fa: 'روش سفارشی', ar: 'منهج مخصص', en: 'Custom Method', es: 'Método personalizado' },
      { fa: 'روش شخصی کاربر، شرح‌داده‌شده در یادداشت.', ar: 'منهج المستخدم الخاص، موصوف في ملاحظة.', en: "The trader's own personal method, described in a short note.", es: 'El método personal del trader, descrito en una nota breve.' },
      {
        // Same reasoning as 'hybrid' - Step 2 for Custom Method shows the full Focus Registry for
        // free selection rather than a curated recommended/optional split (§20).
        coreConcepts: ['user-authored method', 'free focus selection'],
        relatedStyleIds: [],
        analysisPrinciples: ["The trader's own written notes are the primary source of truth for this style"],
        limitations: ['Not a formal, independently verifiable framework by definition']
      })
  ];

  var byId = {};
  DEFS.forEach(function (d) { byId[d.id] = d; });

  function list() { return DEFS.slice(); }
  function get(id) { return byId[id] || null; }
  function categories() { return CATEGORIES.slice(); }
  function categoryLabel(id, lang) {
    var c = CATEGORIES.find(function (x) { return x.id === id; });
    return c ? (c.name[lang] || c.name.en) : id;
  }
  function isValidStyleId(id) { return Boolean(id) && Boolean(byId[id]); }

  // Hybrid dedup rule (§20): primary style's recommended focuses first, then each secondary's
  // (in the order given), optional lists appended the same way, de-duplicated throughout so a
  // focus recommended by two styles is only ever suggested once.
  function mergeFocusRecommendations(primaryStyleId, secondaryStyleIds) {
    var order = [primaryStyleId].concat((secondaryStyleIds || []).filter(Boolean));
    var recommended = [], optional = [], seenRec = {}, seenOpt = {};
    order.forEach(function (id) {
      var def = byId[id];
      if (!def) return;
      (def.recommendedFocusIds || []).forEach(function (f) { if (!seenRec[f]) { seenRec[f] = true; recommended.push(f); } });
    });
    order.forEach(function (id) {
      var def = byId[id];
      if (!def) return;
      (def.optionalFocusIds || []).forEach(function (f) { if (!seenOpt[f] && !seenRec[f]) { seenOpt[f] = true; optional.push(f); } });
    });
    return { recommended: recommended, optional: optional };
  }

  window.TradeJournalAnalysisStyleRegistry = {
    list: list,
    get: get,
    categories: categories,
    categoryLabel: categoryLabel,
    isValidStyleId: isValidStyleId,
    mergeFocusRecommendations: mergeFocusRecommendations,
    VERSION: VERSION
  };
}());
