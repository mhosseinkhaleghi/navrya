/**
 * Analysis Focus Registry — Analysis Profiles domain (see ARCHITECTURE.md §7.25).
 *
 * Reusable "what a trader's eyes look for first" definitions. A Focus is never redefined per
 * style - `analysis-style-registry.js` only ever references these ids (`recommendedFocusIds`/
 * `optionalFocusIds`); this file is the one place each Focus is actually described (§8/§9 of the
 * brief: "Styles reference Focus IDs. Focus definitions are not duplicated per style.").
 *
 * `name`/`shortDescription` are the localized display surface (§22). `requiredInputs` documents
 * what a Focus needs to be meaningfully evaluated (§10/§28) - product/domain metadata only, never
 * used to call an AI model in this phase. `compatibleStyleIds` is intentionally NOT stored here -
 * it is computed on demand from the Style Registry's own `recommendedFocusIds`/`optionalFocusIds`
 * (see `compatibleStyles()` below), so a style's own list stays the single source of truth instead
 * of two registries drifting out of sync with each other.
 */
(function () {
  'use strict';

  var VERSION = 1;

  var CATEGORIES = [
    { id: 'market_context', name: { fa: 'بافت بازار', ar: 'سياق السوق', en: 'Market Context', es: 'Contexto de mercado' } },
    { id: 'price_levels', name: { fa: 'سطوح قیمتی', ar: 'المستويات السعرية', en: 'Price Levels', es: 'Niveles de precio' } },
    { id: 'movement', name: { fa: 'حرکت قیمت', ar: 'حركة السعر', en: 'Movement', es: 'Movimiento' } },
    { id: 'reaction', name: { fa: 'واکنش قیمت', ar: 'رد فعل السعر', en: 'Reaction', es: 'Reacción' } },
    { id: 'liquidity', name: { fa: 'نقدینگی', ar: 'السيولة', en: 'Liquidity', es: 'Liquidez' } },
    { id: 'institutional', name: { fa: 'عدم تعادل / نهادی', ar: 'الاختلال / المؤسسي', en: 'Imbalance / Institutional', es: 'Desequilibrio / institucional' } },
    { id: 'pattern', name: { fa: 'کندل و الگو', ar: 'الشموع والأنماط', en: 'Candle / Pattern', es: 'Vela / patrón' } },
    { id: 'volume', name: { fa: 'حجم', ar: 'الحجم', en: 'Volume', es: 'Volumen' } },
    { id: 'ichimoku', name: { fa: 'ایچیموکو', ar: 'إيشيموكو', en: 'Ichimoku', es: 'Ichimoku' } },
    { id: 'wyckoff', name: { fa: 'وایکاف', ar: 'وايكوف', en: 'Wyckoff', es: 'Wyckoff' } },
    { id: 'elliott', name: { fa: 'امواج الیوت', ar: 'موجات إليوت', en: 'Elliott', es: 'Elliott' } },
    { id: 'indicators', name: { fa: 'اندیکاتورها', ar: 'المؤشرات', en: 'Indicators', es: 'Indicadores' } },
    { id: 'validation', name: { fa: 'اعتبارسنجی فرضیه', ar: 'التحقق من الفرضية', en: 'Risk to Thesis / Validation', es: 'Riesgo a la tesis / validación' } }
  ];

  function f(id, category, name, shortDescription, extra) {
    var base = {
      id: id, category: category, name: name, shortDescription: shortDescription,
      requiredInputs: ['chart_image'], version: VERSION
    };
    return Object.assign(base, extra || {});
  }

  var DEFS = [
    // MARKET CONTEXT
    f('market_structure', 'market_context', { fa: 'ساختار بازار', ar: 'بنية السوق', en: 'Market Structure', es: 'Estructura de mercado' }, { fa: 'نقشه سوئینگ‌ها و شکل کلی حرکت قیمت.', ar: 'خريطة التأرجحات والشكل العام لحركة السعر.', en: 'The map of swing points and the overall shape of price.', es: 'El mapa de los swings y la forma general del precio.' }),
    f('trend', 'market_context', { fa: 'روند', ar: 'الاتجاه', en: 'Trend', es: 'Tendencia' }, { fa: 'جهت غالب حرکت قیمت.', ar: 'الاتجاه السائد لحركة السعر.', en: 'The dominant direction of price movement.', es: 'La dirección dominante del movimiento del precio.' }),
    f('trend_strength', 'market_context', { fa: 'قدرت روند', ar: 'قوة الاتجاه', en: 'Trend Strength', es: 'Fuerza de la tendencia' }, { fa: 'میزان قدرت و پایداری روند فعلی.', ar: 'مدى قوة واستمرارية الاتجاه الحالي.', en: 'How strong and sustained the current trend is.', es: 'Cuán fuerte y sostenida está la tendencia actual.' }),
    f('multi_timeframe', 'market_context', { fa: 'چند تایم‌فریم', ar: 'أطر زمنية متعددة', en: 'Multi-Timeframe Context', es: 'Contexto multi-timeframe' }, { fa: 'هم‌راستایی تحلیل در چند تایم‌فریم.', ar: 'توافق التحليل عبر عدة أطر زمنية.', en: 'Aligning the read across more than one timeframe.', es: 'Alinear la lectura entre más de un timeframe.' }),
    f('market_phase', 'market_context', { fa: 'فاز بازار', ar: 'طور السوق', en: 'Market Phase', es: 'Fase de mercado' }, { fa: 'تعادل یا عدم‌تعادل کلی بازار.', ar: 'توازن السوق العام أو عدم توازنه.', en: "The market's overall balance or imbalance state.", es: 'El estado general de equilibrio o desequilibrio del mercado.' }),
    f('range', 'market_context', { fa: 'رنج', ar: 'النطاق', en: 'Range', es: 'Rango' }, { fa: 'حرکت محدود بین دو مرز مشخص.', ar: 'حركة محدودة بين حدين محددين.', en: 'Bounded movement between two defined edges.', es: 'Movimiento acotado entre dos límites definidos.' }),

    // PRICE LEVELS
    f('key_levels', 'price_levels', { fa: 'سطوح کلیدی', ar: 'المستويات الرئيسية', en: 'Key Levels', es: 'Niveles clave' }, { fa: 'قیمت‌های مهمی که واکنش تاریخی داشته‌اند.', ar: 'أسعار مهمة سجلت رد فعل تاريخياً.', en: 'Prices with a meaningful history of reaction.', es: 'Precios con historial relevante de reacción.' }),
    f('support_resistance', 'price_levels', { fa: 'حمایت و مقاومت', ar: 'الدعم والمقاومة', en: 'Support / Resistance', es: 'Soporte / resistencia' }, { fa: 'سطوح افقی نگه‌دارنده یا بازدارنده قیمت.', ar: 'مستويات أفقية تُمسك أو توقف السعر.', en: 'Horizontal levels that hold or repel price.', es: 'Niveles horizontales que sostienen o repelen el precio.' }),
    f('supply_demand', 'price_levels', { fa: 'عرضه و تقاضا', ar: 'العرض والطلب', en: 'Supply / Demand', es: 'Oferta / demanda' }, { fa: 'نواحی عدم تعادل عرضه و تقاضا.', ar: 'مناطق اختلال العرض والطلب.', en: 'Zones of supply/demand imbalance.', es: 'Zonas de desequilibrio de oferta/demanda.' }),
    f('dynamic_levels', 'price_levels', { fa: 'سطوح پویا', ar: 'مستويات ديناميكية', en: 'Dynamic Levels', es: 'Niveles dinámicos' }, { fa: 'سطوحی که همراه با قیمت جابه‌جا می‌شوند (مثل میانگین متحرک، VWAP).', ar: 'مستويات تتحرك مع السعر (كمتوسط متحرك، VWAP).', en: 'Levels that move with price (e.g. a moving average, VWAP).', es: 'Niveles que se mueven con el precio (p. ej. una media móvil, VWAP).' }),

    // MOVEMENT
    f('momentum', 'movement', { fa: 'مومنتوم', ar: 'الزخم', en: 'Momentum', es: 'Momentum' }, { fa: 'سرعت و شتاب حرکت قیمت.', ar: 'سرعة وتسارع حركة السعر.', en: 'The speed and force behind a price move.', es: 'La velocidad y fuerza detrás de un movimiento de precio.' }),
    f('acceleration', 'movement', { fa: 'شتاب‌گیری', ar: 'التسارع', en: 'Acceleration', es: 'Aceleración' }, { fa: 'افزایش سرعت حرکت قیمت.', ar: 'زيادة سرعة حركة السعر.', en: 'Price movement speeding up.', es: 'El movimiento del precio acelerándose.' }),
    f('deceleration', 'movement', { fa: 'کاهش شتاب', ar: 'التباطؤ', en: 'Deceleration', es: 'Desaceleración' }, { fa: 'کاهش سرعت حرکت قیمت.', ar: 'تباطؤ سرعة حركة السعر.', en: 'Price movement slowing down.', es: 'El movimiento del precio desacelerándose.' }),
    f('displacement', 'movement', { fa: 'دیسپلیسمنت', ar: 'الإزاحة', en: 'Displacement', es: 'Displacement' }, { fa: 'حرکت یک‌طرفه و قوی قیمت.', ar: 'حركة سعرية قوية أحادية الاتجاه.', en: 'A strong, one-directional price move.', es: 'Un movimiento de precio fuerte y unidireccional.' }),
    f('expansion', 'movement', { fa: 'گسترش', ar: 'التوسع', en: 'Expansion', es: 'Expansión' }, { fa: 'افزایش دامنه نوسان پس از فشردگی.', ar: 'اتساع مدى التقلب بعد الانضغاط.', en: 'Volatility widening after a contraction.', es: 'La volatilidad ampliándose tras una contracción.' }),
    f('compression', 'movement', { fa: 'فشردگی', ar: 'الانضغاط', en: 'Compression', es: 'Compresión' }, { fa: 'کاهش دامنه نوسان قیمت.', ar: 'تقلص مدى تقلب السعر.', en: 'Volatility narrowing.', es: 'La volatilidad estrechándose.' }),
    f('exhaustion', 'movement', { fa: 'خستگی حرکت', ar: 'إنهاك الحركة', en: 'Exhaustion', es: 'Agotamiento' }, { fa: 'نشانه‌های پایان‌یافتن یک حرکت.', ar: 'إشارات على انتهاء حركة ما.', en: 'Signs that a move is running out of force.', es: 'Señales de que un movimiento se está quedando sin fuerza.' }),
    f('volatility', 'movement', { fa: 'نوسان‌پذیری', ar: 'التقلب', en: 'Volatility', es: 'Volatilidad' }, { fa: 'میزان و سرعت تغییرات قیمت.', ar: 'مدى وسرعة تغيرات السعر.', en: 'The magnitude and pace of price change.', es: 'La magnitud y el ritmo del cambio de precio.' }),

    // REACTION
    f('rejection', 'reaction', { fa: 'ریجکشن (رد سطح)', ar: 'الرفض', en: 'Rejection', es: 'Rechazo' }, { fa: 'واکنش نفی‌کننده قیمت به یک سطح.', ar: 'رد فعل رافض للسعر عند مستوى ما.', en: 'Price being pushed back from a level.', es: 'El precio siendo rechazado desde un nivel.' }),
    f('acceptance', 'reaction', { fa: 'اکسپتنس (پذیرش سطح)', ar: 'القبول', en: 'Acceptance', es: 'Aceptación' }, { fa: 'ماندگاری قیمت پس از عبور از یک سطح.', ar: 'استقرار السعر بعد تجاوز مستوى ما.', en: 'Price holding beyond a level rather than snapping back.', es: 'El precio manteniéndose más allá de un nivel en vez de regresar.' }),
    f('retest', 'reaction', { fa: 'بازآزمایی سطح', ar: 'إعادة اختبار المستوى', en: 'Retest', es: 'Reprueba' }, { fa: 'بازگشت کوتاه قیمت به یک سطح شکسته‌شده.', ar: 'عودة قصيرة للسعر إلى مستوى تم اختراقه.', en: 'Price briefly returning to a broken level.', es: 'El precio volviendo brevemente a un nivel roto.' }),
    f('failed_breakout', 'reaction', { fa: 'شکست ناموفق', ar: 'اختراق فاشل', en: 'Failed Breakout / Trap', es: 'Ruptura fallida / trampa' }, { fa: 'شکستی که تداوم پیدا نکرد و برگشت.', ar: 'اختراق لم يستمر وعاد للخلف.', en: 'A break that did not continue and reversed instead.', es: 'Una ruptura que no continuó y se revirtió.' }),
    f('trap', 'reaction', { fa: 'تله قیمتی', ar: 'فخ سعري', en: 'Trap', es: 'Trampa de precio' }, { fa: 'حرکتی که معامله‌گران را در جهت اشتباه می‌کشاند.', ar: 'حركة تجذب المتداولين إلى الاتجاه الخاطئ.', en: 'A move that pulls traders into the wrong side.', es: 'Un movimiento que atrae a los traders hacia el lado equivocado.' }),
    f('breakout', 'reaction', { fa: 'شکست سطح', ar: 'الاختراق', en: 'Breakout', es: 'Ruptura' }, { fa: 'عبور معتبر قیمت از یک سطح کلیدی.', ar: 'تجاوز صحيح للسعر مستوى رئيسياً.', en: 'A valid move through a key level.', es: 'Un movimiento válido a través de un nivel clave.' }),

    // LIQUIDITY
    f('liquidity', 'liquidity', { fa: 'نقدینگی', ar: 'السيولة', en: 'Liquidity', es: 'Liquidez' }, { fa: 'نواحی تجمع سفارش‌های در انتظار.', ar: 'مناطق تجمع الأوامر المعلقة.', en: 'Zones where resting orders cluster.', es: 'Zonas donde se agrupan órdenes en espera.' }),
    f('liquidity_pool', 'liquidity', { fa: 'استخر نقدینگی', ar: 'بركة السيولة', en: 'Liquidity Pool', es: 'Pool de liquidez' }, { fa: 'خوشه‌ای مشخص از سفارش‌های در انتظار (مثل سقف‌ها/کف‌های مساوی).', ar: 'مجموعة محددة من الأوامر المعلقة (كالقمم/القيعان المتساوية).', en: 'A defined cluster of resting orders (e.g. equal highs/lows).', es: 'Un grupo definido de órdenes en espera (p. ej. máximos/mínimos iguales).' }),
    f('liquidity_sweep', 'liquidity', { fa: 'جاروب نقدینگی', ar: 'جرف السيولة', en: 'Liquidity Sweep', es: 'Barrido de liquidez' }, { fa: 'عبور کوتاه از یک سطح برای جمع‌آوری نقدینگی و بازگشت.', ar: 'تجاوز قصير لمستوى لجمع السيولة ثم العودة.', en: 'A brief move through a level to collect liquidity, then reverse.', es: 'Un movimiento breve a través de un nivel para recoger liquidez y luego revertir.' }),
    f('stop_run', 'liquidity', { fa: 'استاپ‌هانت', ar: 'صيد وقف الخسارة', en: 'Stop Run', es: 'Caza de stops' }, { fa: 'حرکتی که استاپ‌لاس‌های خوشه‌بندی‌شده را فعال می‌کند.', ar: 'حركة تُفعّل أوامر وقف الخسارة المتجمعة.', en: 'A move that triggers a cluster of stop-loss orders.', es: 'Un movimiento que activa un grupo de órdenes de stop-loss.' }),
    f('premium_discount', 'liquidity', { fa: 'پرمیوم/دیسکانت', ar: 'البريميوم/الخصم', en: 'Premium / Discount', es: 'Premium / descuento' }, { fa: 'موقعیت قیمت نسبت به میانه یک رنج.', ar: 'موقع السعر بالنسبة لمنتصف نطاق ما.', en: 'Where price sits relative to the midpoint of a range.', es: 'Dónde se ubica el precio respecto al punto medio de un rango.' }),

    // IMBALANCE / INSTITUTIONAL
    f('imbalance', 'institutional', { fa: 'عدم تعادل', ar: 'الاختلال', en: 'Imbalance', es: 'Desequilibrio' }, { fa: 'حرکت یک‌طرفه بدون معامله دوسویه کافی.', ar: 'حركة أحادية الاتجاه دون تداول ثنائي كافٍ.', en: 'A one-sided move without enough two-way trading.', es: 'Un movimiento unilateral sin suficiente negociación bidireccional.' }),
    f('fair_value_gap', 'institutional', { fa: 'شکاف ارزش منصفانه', ar: 'فجوة القيمة العادلة', en: 'Fair Value Gap', es: 'Fair Value Gap' }, { fa: 'ناحیه خالی از معامله ایجادشده در یک حرکت سریع.', ar: 'منطقة خالية من التداول نشأت خلال حركة سريعة.', en: 'A trading-void zone left behind by a fast move.', es: 'Una zona sin negociación dejada por un movimiento rápido.' }),
    f('order_block', 'institutional', { fa: 'اردر بلاک', ar: 'أوردر بلوك', en: 'Order Block', es: 'Order block' }, { fa: 'آخرین ناحیه مخالف قبل از یک حرکت قوی.', ar: 'آخر منطقة معاكسة قبل حركة قوية.', en: 'The last opposing-side candle(s) before a strong move.', es: 'La(s) última(s) vela(s) opuesta(s) antes de un movimiento fuerte.' }),
    f('structure_shift', 'institutional', { fa: 'تغییر ساختار', ar: 'تحول البنية', en: 'Structure Shift', es: 'Cambio de estructura' }, { fa: 'تغییر کلی جهت ساختار بازار.', ar: 'تغيّر عام في اتجاه بنية السوق.', en: "A broad change in the market's structural direction.", es: 'Un cambio amplio en la dirección estructural del mercado.' }),
    f('bos', 'institutional', { fa: 'شکست ساختار (BOS)', ar: 'كسر البنية (BOS)', en: 'Break of Structure (BOS)', es: 'Ruptura de estructura (BOS)' }, { fa: 'شکست یک سوئینگ در جهت روند موجود.', ar: 'كسر تأرجح باتجاه الاتجاه القائم.', en: 'A swing point broken in the direction of the existing trend.', es: 'Un swing roto en la dirección de la tendencia existente.' }),
    f('choch', 'institutional', { fa: 'تغییر خصلت (CHOCH)', ar: 'تغيّر الطابع (CHOCH)', en: 'Change of Character (CHOCH)', es: 'Cambio de carácter (CHOCH)' }, { fa: 'شکست یک سوئینگ در خلاف جهت روند موجود.', ar: 'كسر تأرجح بعكس اتجاه الاتجاه القائم.', en: 'A swing point broken against the existing trend.', es: 'Un swing roto en contra de la tendencia existente.' }),

    // CANDLE / PATTERN
    f('candlestick_behavior', 'pattern', { fa: 'رفتار کندلی', ar: 'سلوك الشموع', en: 'Candlestick Behavior', es: 'Comportamiento de velas' }, { fa: 'شکل و رفتار تک‌کندل‌ها.', ar: 'شكل وسلوك الشموع الفردية.', en: 'The shape and behavior of individual candles.', es: 'La forma y el comportamiento de velas individuales.' }),
    f('chart_patterns', 'pattern', { fa: 'الگوهای کلاسیک نمودار', ar: 'الأنماط الكلاسيكية', en: 'Chart Patterns', es: 'Patrones del gráfico' }, { fa: 'الگوهای هندسی شناخته‌شده در نمودار.', ar: 'أنماط هندسية معروفة على الرسم البياني.', en: 'Recognized geometric shapes on the chart.', es: 'Formas geométricas reconocidas en el gráfico.' }),
    f('harmonic_structure', 'pattern', { fa: 'ساختار هارمونیک', ar: 'البنية التوافقية', en: 'Harmonic Structure', es: 'Estructura armónica' }, { fa: 'الگوهای دقیق مبتنی بر نسبت فیبوناچی.', ar: 'أنماط دقيقة مبنية على نسب فيبوناتشي.', en: 'Precise, Fibonacci-ratio-based patterns.', es: 'Patrones precisos basados en ratios de Fibonacci.' }),

    // VOLUME
    f('volume', 'volume', { fa: 'حجم معاملات', ar: 'حجم التداول', en: 'Volume', es: 'Volumen' }, { fa: 'میزان معاملات انجام‌شده.', ar: 'مقدار التداول المنفذ.', en: 'The amount of trading that took place.', es: 'La cantidad de negociación realizada.' }),
    f('volume_profile', 'volume', { fa: 'پروفایل حجم', ar: 'بروفايل الحجم', en: 'Volume Profile', es: 'Perfil de volumen' }, { fa: 'توزیع حجم روی سطوح قیمتی.', ar: 'توزيع الحجم على المستويات السعرية.', en: 'The distribution of volume across price levels.', es: 'La distribución del volumen entre niveles de precio.' }, { requiredInputs: ['structured_volume_profile'] }),
    f('market_profile', 'volume', { fa: 'مارکت پروفایل', ar: 'ماركت بروفايل', en: 'Market Profile', es: 'Market Profile' }, { fa: 'توزیع زمان/قیمت روزانه (TPO).', ar: 'توزيع الوقت/السعر اليومي (TPO).', en: 'The daily time/price (TPO) distribution.', es: 'La distribución diaria de tiempo/precio (TPO).' }, { requiredInputs: ['structured_market_data'] }),
    f('poc', 'volume', { fa: 'نقطه کنترل (POC)', ar: 'نقطة التحكم (POC)', en: 'Point of Control (POC)', es: 'Punto de control (POC)' }, { fa: 'پرمعامله‌ترین سطح قیمتی در یک بازه.', ar: 'أكثر مستوى سعري تداولاً خلال فترة.', en: 'The most heavily-traded price level in a period.', es: 'El nivel de precio más negociado en un periodo.' }, { requiredInputs: ['structured_volume_profile'] }),
    f('value_area', 'volume', { fa: 'ناحیه ارزش', ar: 'منطقة القيمة', en: 'Value Area', es: 'Área de valor' }, { fa: 'ناحیه‌ای که بخش عمده حجم در آن رد و بدل شده.', ar: 'المنطقة التي جرى فيها معظم التداول.', en: 'The zone where most of the volume traded.', es: 'La zona donde se negoció la mayor parte del volumen.' }, { requiredInputs: ['structured_volume_profile'] }),
    f('delta', 'volume', { fa: 'دلتا', ar: 'الدلتا', en: 'Delta', es: 'Delta' }, { fa: 'تفاوت حجم خرید و فروش تهاجمی.', ar: 'الفرق بين حجم الشراء والبيع العدواني.', en: 'The difference between aggressive buy and sell volume.', es: 'La diferencia entre el volumen agresivo de compra y de venta.' }, { requiredInputs: ['visible_orderflow_chart'] }),
    f('cumulative_delta', 'volume', { fa: 'دلتای تجمعی', ar: 'الدلتا التراكمية', en: 'Cumulative Delta', es: 'Delta acumulado' }, { fa: 'روند تجمعی دلتا در طول زمان.', ar: 'الاتجاه التراكمي للدلتا عبر الزمن.', en: 'The running total of delta over time.', es: 'El total acumulado del delta a lo largo del tiempo.' }, { requiredInputs: ['visible_orderflow_chart'] }),
    f('absorption', 'volume', { fa: 'جذب (ابزوربشن)', ar: 'الامتصاص', en: 'Absorption', es: 'Absorción' }, { fa: 'جذب حجم بزرگ بدون حرکت متناسب قیمت.', ar: 'امتصاص حجم كبير دون حركة سعرية متناسبة.', en: 'A large volume absorbed without a proportional price move.', es: 'Un gran volumen absorbido sin un movimiento de precio proporcional.' }, { requiredInputs: ['visible_orderflow_chart'] }),
    f('imbalance_orderflow', 'volume', { fa: 'عدم تعادل جریان سفارش', ar: 'اختلال تدفق الأوامر', en: 'Order-Flow Imbalance', es: 'Desequilibrio de order flow' }, { fa: 'عدم تعادل حجم بید/اسک در پرینت‌های معاملاتی.', ar: 'اختلال حجم العرض/الطلب في طبعات التداول.', en: 'A bid/ask volume imbalance in the trade prints.', es: 'Un desequilibrio de volumen bid/ask en las impresiones de operaciones.' }, { requiredInputs: ['footprint_data'] }),

    // ICHIMOKU
    f('kumo_context', 'ichimoku', { fa: 'بافت ابر کومو', ar: 'سياق سحابة كومو', en: 'Kumo Context', es: 'Contexto de la nube Kumo' }, { fa: 'موقعیت و ضخامت ابر ایچیموکو.', ar: 'موقع وسماكة سحابة إيشيموكو.', en: 'The position and thickness of the Ichimoku cloud.', es: 'La posición y el grosor de la nube Ichimoku.' }),
    f('tenkan_kijun', 'ichimoku', { fa: 'تنکان-کیجون', ar: 'تينكان-كيجون', en: 'Tenkan-Kijun', es: 'Tenkan-Kijun' }, { fa: 'رابطه خط تبدیل و خط پایه.', ar: 'العلاقة بين خط التحويل وخط الأساس.', en: 'The relationship between the conversion and base lines.', es: 'La relación entre la línea de conversión y la línea base.' }),
    f('tk_cross', 'ichimoku', { fa: 'تقاطع تنکان-کیجون', ar: 'تقاطع تينكان-كيجون', en: 'TK Cross', es: 'Cruce TK' }, { fa: 'تقاطع خط تبدیل و خط پایه.', ar: 'تقاطع خط التحويل مع خط الأساس.', en: 'A crossover between the conversion and base lines.', es: 'Un cruce entre la línea de conversión y la línea base.' }),
    f('chikou', 'ichimoku', { fa: 'چیکو اسپن', ar: 'تشيكو سبان', en: 'Chikou Span', es: 'Chikou Span' }, { fa: 'خط تأخیری برای تأیید روند.', ar: 'الخط المتأخر لتأكيد الاتجاه.', en: 'The lagging line used to confirm trend.', es: 'La línea rezagada usada para confirmar la tendencia.' }),
    f('kumo_twist', 'ichimoku', { fa: 'پیچش ابر (کومو تویست)', ar: 'التواء السحابة', en: 'Kumo Twist', es: 'Giro de la nube' }, { fa: 'تغییر رنگ ابر که نشانه چرخش احتمالی است.', ar: 'تغيّر لون السحابة كإشارة انعكاس محتملة.', en: 'A cloud color flip signaling a possible turn ahead.', es: 'Un cambio de color de la nube que señala un posible giro.' }),

    // WYCKOFF
    f('accumulation_distribution', 'wyckoff', { fa: 'انباشت/توزیع', ar: 'التجميع/التوزيع', en: 'Accumulation / Distribution', es: 'Acumulación / distribución' }, { fa: 'فاز جمع‌آوری یا رهاسازی موقعیت توسط بازیگران بزرگ.', ar: 'طور تجميع أو تصريف المراكز من قبل كبار اللاعبين.', en: 'The phase where large players build or unload positions.', es: 'La fase en que los grandes jugadores construyen o liquidan posiciones.' }),
    f('wyckoff_phase', 'wyckoff', { fa: 'فاز وایکاف', ar: 'طور وايكوف', en: 'Wyckoff Phase', es: 'Fase de Wyckoff' }, { fa: 'برچسب فاز A تا E در ساختار وایکاف.', ar: 'تصنيف الطور من A إلى E في بنية وايكوف.', en: 'The A-through-E phase label inside a Wyckoff structure.', es: 'La etiqueta de fase A a E dentro de una estructura de Wyckoff.' }),
    f('spring_upthrust', 'wyckoff', { fa: 'اسپرینگ/آپتراست', ar: 'سبرينغ/أبثراست', en: 'Spring / Upthrust', es: 'Spring / Upthrust' }, { fa: 'شکست موقت زیر/بالای رنج پیش از چرخش.', ar: 'اختراق مؤقت أسفل/أعلى النطاق قبل الانعكاس.', en: 'A temporary break below/above the range before a turn.', es: 'Una ruptura temporal por debajo/encima del rango antes de un giro.' }),
    f('effort_vs_result', 'wyckoff', { fa: 'تلاش در برابر نتیجه', ar: 'الجهد مقابل النتيجة', en: 'Effort vs. Result', es: 'Esfuerzo vs. resultado' }, { fa: 'مقایسه حجم صرف‌شده با حرکت واقعی قیمت.', ar: 'مقارنة الحجم المبذول بحركة السعر الفعلية.', en: 'Comparing volume spent against the actual price move produced.', es: 'Comparar el volumen invertido con el movimiento de precio real producido.' }),

    // ELLIOTT
    f('wave_structure', 'elliott', { fa: 'ساختار موجی', ar: 'البنية الموجية', en: 'Wave Structure', es: 'Estructura de ondas' }, { fa: 'شکل کلی موج‌های ایمپالسیو و اصلاحی.', ar: 'الشكل العام للموجات الدافعة والتصحيحية.', en: 'The overall shape of impulse and corrective waves.', es: 'La forma general de las ondas impulsivas y correctivas.' }),
    f('wave_count', 'elliott', { fa: 'شمارش موج', ar: 'عد الموجات', en: 'Wave Count', es: 'Conteo de ondas' }, { fa: 'برچسب عددی/حرفی موج‌ها.', ar: 'ترقيم/تصنيف الموجات.', en: 'The numeric/lettered labeling of each wave.', es: 'El etiquetado numérico/alfabético de cada onda.' }),
    f('impulse_correction', 'elliott', { fa: 'ایمپالس/اصلاح', ar: 'الدافعة/التصحيحية', en: 'Impulse / Correction', es: 'Impulso / corrección' }, { fa: 'تمایز بین موج محرک و موج اصلاحی.', ar: 'التمييز بين الموجة الدافعة والتصحيحية.', en: 'Distinguishing a driving wave from a corrective one.', es: 'Distinguir una onda impulsiva de una correctiva.' }),
    f('fibonacci_zone', 'elliott', { fa: 'ناحیه فیبوناچی', ar: 'منطقة فيبوناتشي', en: 'Fibonacci Zone', es: 'Zona de Fibonacci' }, { fa: 'نواحی بازگشتی/گسترشی فیبوناچی.', ar: 'مناطق فيبوناتشي الارتدادية/الامتدادية.', en: 'Fibonacci retracement/extension zones.', es: 'Zonas de retroceso/extensión de Fibonacci.' }),
    f('wave_invalidation', 'elliott', { fa: 'نقطه ابطال موج', ar: 'نقطة إبطال الموجة', en: 'Wave Invalidation', es: 'Invalidación de onda' }, { fa: 'سطحی که با شکست آن، شمارش موج رد می‌شود.', ar: 'مستوى يؤدي كسره لإبطال عد الموجات.', en: 'The level whose break invalidates the current wave count.', es: 'El nivel cuya ruptura invalida el conteo de ondas actual.' }),

    // INDICATORS
    f('divergence', 'indicators', { fa: 'واگرایی', ar: 'التباعد', en: 'Divergence', es: 'Divergencia' }, { fa: 'ناهم‌خوانی جهت قیمت و اندیکاتور.', ar: 'تعارض بين اتجاه السعر والمؤشر.', en: "A mismatch between price direction and an indicator's direction.", es: 'Un desajuste entre la dirección del precio y la de un indicador.' }),
    f('oscillator_state', 'indicators', { fa: 'وضعیت نوسان‌گر', ar: 'حالة المذبذب', en: 'Oscillator State', es: 'Estado del oscilador' }, { fa: 'اشباع خرید/فروش یا وضعیت میانی نوسان‌گر.', ar: 'تشبع شرائي/بيعي أو حالة وسطية للمذبذب.', en: 'Overbought/oversold or mid-range oscillator reading.', es: 'Lectura de sobrecompra/sobreventa o rango medio del oscilador.' }),
    f('moving_average_structure', 'indicators', { fa: 'ساختار میانگین متحرک', ar: 'بنية المتوسط المتحرك', en: 'Moving Average Structure', es: 'Estructura de medias móviles' }, { fa: 'آرایش و شیب میانگین‌های متحرک.', ar: 'ترتيب وميل المتوسطات المتحركة.', en: 'The stacking and slope of moving averages.', es: 'El orden y la pendiente de las medias móviles.' }),

    // RISK TO THESIS / VALIDATION
    f('invalidation', 'validation', { fa: 'نقطه ابطال', ar: 'نقطة الإبطال', en: 'Invalidation', es: 'Invalidación' }, { fa: 'سطحی که با رسیدن قیمت به آن، فرضیه رد می‌شود.', ar: 'مستوى يؤدي بلوغه إلى إبطال الفرضية.', en: 'The level whose reach invalidates the current thesis.', es: 'El nivel cuyo alcance invalida la tesis actual.' }),
    f('confirmation', 'validation', { fa: 'تأیید فرضیه', ar: 'تأكيد الفرضية', en: 'Confirmation', es: 'Confirmación' }, { fa: 'شواهدی که فرضیه فعلی را تقویت می‌کنند.', ar: 'أدلة تعزز الفرضية الحالية.', en: 'Evidence that strengthens the current thesis.', es: 'Evidencia que refuerza la tesis actual.' }),
    f('conflicting_evidence', 'validation', { fa: 'شواهد متناقض', ar: 'أدلة متعارضة', en: 'Conflicting Evidence', es: 'Evidencia contradictoria' }, { fa: 'نشانه‌هایی که با فرضیه فعلی همسو نیستند.', ar: 'إشارات لا تتوافق مع الفرضية الحالية.', en: 'Signals that do not line up with the current thesis.', es: 'Señales que no se alinean con la tesis actual.' })
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
  function isValidFocusId(id) { return Boolean(id) && Boolean(byId[id]); }

  // Every style whose recommended/optional focus list includes this focus id - computed live
  // from the Style Registry rather than hand-maintained here, so the two registries can never
  // drift apart on which styles a focus "belongs to" (see this file's own header comment).
  function compatibleStyles(focusId) {
    var registry = window.TradeJournalAnalysisStyleRegistry;
    if (!registry) return [];
    return registry.list()
      .filter(function (style) {
        return (style.recommendedFocusIds || []).indexOf(focusId) > -1 || (style.optionalFocusIds || []).indexOf(focusId) > -1;
      })
      .map(function (style) { return style.id; });
  }

  // The real per-style recommended/optional focus ids, resolved to full Focus definitions - the
  // one place UI code should call rather than re-reading the Style Registry's raw id arrays
  // itself (§9's "styles reference focus ids" contract stays entirely inside these two files).
  function forStyle(styleId) {
    var registry = window.TradeJournalAnalysisStyleRegistry;
    var style = registry ? registry.get(styleId) : null;
    if (!style) return { recommended: [], optional: [] };
    return {
      recommended: (style.recommendedFocusIds || []).map(get).filter(Boolean),
      optional: (style.optionalFocusIds || []).map(get).filter(Boolean)
    };
  }

  window.TradeJournalAnalysisFocusRegistry = {
    list: list,
    get: get,
    categories: categories,
    categoryLabel: categoryLabel,
    isValidFocusId: isValidFocusId,
    compatibleStyles: compatibleStyles,
    forStyle: forStyle,
    VERSION: VERSION
  };
}());
