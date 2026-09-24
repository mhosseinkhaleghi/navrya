(function(){
  'use strict';
  // The market-day routine a trader builds for themselves, and their day-by-day completion of it.
  //
  // Persistence is the same server-authoritative path psychology-store.js already uses - one
  // window.TradeJournalUserPreferences key holding the whole object, written back as an atomic
  // whole-object replace. No localStorage anywhere, and no new server table: the preferences
  // domain (server/community/routes.preferences.mjs, migration 019) is a generic
  // {user_id, pref_key -> value} store, so a routine is just another preference row that
  // replicates and syncs like every other migrated domain.
  //
  // Two separate concerns share the one key deliberately: the ROUTINE DEFINITIONS (rarely
  // written, small) and the DAILY COMPLETIONS (written several times a day, one small map per
  // date). Splitting them into two preference keys would mean two round-trips for the common
  // "tick a step" write and a torn read whenever one landed and the other did not; one key keeps
  // every write a single atomic replace, at the cost of resending the (small) definitions each
  // time. COMPLETION_RETENTION_DAYS bounds the growth so the value cannot creep upward forever.
  var PREF_KEY='tradingRoutines';
  var COMPLETION_RETENTION_DAYS=180;
  var WATCH_KEY='__watch';

  function nowIso(){return new Date().toISOString();}
  function uid(prefix){return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);}
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}

  // Local calendar date, not UTC - a routine day is the trader's own day. Matches the dayKey()
  // convention psychology-store.js already uses for streaks, but zero-padded so the string sorts.
  function dayKey(date){
    var d=date||new Date();
    var m=String(d.getMonth()+1),day=String(d.getDate());
    return d.getFullYear()+'-'+(m.length<2?'0'+m:m)+'-'+(day.length<2?'0'+day:day);
  }

  function defaultRules(){
    return{warn:true,streak:true,remind:false,watch:true,partial:false,carry:true};
  }

  // ---------------------------------------------------------------------------------------------
  // Catalogue: the routine TYPES the builder offers and the STEPS each one is made of.
  //
  // Content is authored once per language ([fa, en, ar, es]) and resolved at the moment a routine
  // or step is created, so a routine stores plain literal labels exactly like a step the trader
  // typed themselves. A step id is stable across every type that uses it: the same step added from
  // a library and from a template is one step, never a duplicate.
  var LANGS=['fa','en','ar','es'];
  function currentLang(){
    var i18n=window.TradeJournalTradeI18n;
    var lang=i18n&&typeof i18n.language==='function'?i18n.language():'fa';
    return LANGS.indexOf(lang)>-1?lang:'fa';
  }
  function pick(texts,lang){
    if(!texts)return'';
    var i=LANGS.indexOf(lang);
    return texts[i<0?0:i]||texts[0]||'';
  }

  var MAX_STEPS=30;
  var MAX_LABEL=80;
  var MAX_NOTE=140;

  // 'HH:MM' 24h, the exact string an <input type="time"> yields. '' means "no time", which is a
  // first-class, valid state: a step without a time simply never triggers a reminder.
  function sanitizeTime(value){
    var m=/^(\d{1,2}):(\d{2})$/.exec(String(value==null?'':value).trim());
    if(!m)return'';
    var h=Number(m[1]),min=Number(m[2]);
    if(h>23||min>59)return'';
    return(h<10?'0':'')+h+':'+m[2];
  }
  function minutesOf(time){
    var clean=sanitizeTime(time);
    return clean?Number(clean.slice(0,2))*60+Number(clean.slice(3)):null;
  }

  function step(id,label,time,phase,link,note){
    return{
      id:id,label:String(label||'').slice(0,MAX_LABEL),time:sanitizeTime(time),
      phase:phase||'pre',link:link||'',note:String(note||'').slice(0,MAX_NOTE)
    };
  }

  // A step is only valid inside a phase its routine family knows. "market" routines live around a
  // trading session; "life" routines (and the trader's own blank routine) live around the clock.
  var PHASE_FAMILIES={
    market:['pre','mind','during','post','weekly'],
    life:['morning','day','evening','weekly']
  };
  var PHASE_ORDER=['morning','pre','mind','day','during','evening','post','weekly'];

  var MARKET_DAYS=['sat','sun','mon','tue','wed'];
  var ALL_DAYS=['sat','sun','mon','tue','wed','thu','fri'];

  // id -> [phase, link, default time, label, note|null]
  var STEPS={
    // ---- trading day (the original catalogue, wording unchanged) ----
    plan:['pre','','07:40',['مرور پلن و قوانین دیروز','Review yesterday’s plan and rules','مراجعة خطة وقواعد الأمس','Repasar el plan y las reglas de ayer'],['دو دقیقه، فقط خواندن','Two minutes, read only','دقيقتان، قراءة فقط','Dos minutos, solo lectura']],
    news:['pre','app','07:50',['تقویم اقتصادی و اخبار سشن','Economic calendar and session news','التقويم الاقتصادي وأخبار الجلسة','Calendario económico y noticias de la sesión'],null],
    levels:['pre','','08:05',['علامت‌زدن سطوح کلیدی','Mark the key levels','تحديد المستويات الرئيسية','Marcar los niveles clave'],['حداکثر سه نماد','At most three symbols','ثلاثة رموز كحد أقصى','Como máximo tres símbolos']],
    risk:['pre','calculator','08:15',['تعیین سقف ریسک روز','Set the day’s risk cap','تحديد سقف المخاطرة لليوم','Fijar el tope de riesgo del día'],null],
    spread:['pre','','09:10',['چک اسپرد و نقدشوندگی','Check spread and liquidity','فحص السبريد والسيولة','Revisar el spread y la liquidez'],null],
    cap:['pre','','09:15',['سقف تعداد معاملهٔ امروز','Today’s trade-count cap','سقف عدد صفقات اليوم','Tope de operaciones de hoy'],['سقف پیش‌فرض: ۵','Default cap: 5','السقف الافتراضي: ٥','Tope por defecto: 5']],
    look:['pre','','08:00',['چک پوزیشن‌های باز، بدون دست‌زدن','Check open positions, hands off','فحص المراكز المفتوحة دون لمسها','Revisar posiciones abiertas sin tocarlas'],['قانون: فقط نگاه','Rule: look only','القاعدة: النظر فقط','Regla: solo mirar']],
    breath:['pre','calm','08:25',['چهار دقیقه تنفس','Four minutes of breathing','أربع دقائق من التنفس','Cuatro minutos de respiración'],null],
    checkin:['pre','tracking','08:30',['چک‌این پیش‌سشن','Pre-session check-in','فحص ما قبل الجلسة','Chequeo previo a la sesión'],['خواب، استرس، چیزی برای اثبات','Sleep, stress, anything to prove','النوم، التوتر، أي شيء لإثباته','Sueño, estrés, algo que demostrar']],
    card:['pre','library','',['خواندن یک کارت سوگیری','Read one bias card','قراءة بطاقة انحياز واحدة','Leer una tarjeta de sesgo'],null],
    mute:['pre','','',['خاموش‌کردن نوتیفیکیشن‌ها','Silence notifications','كتم الإشعارات','Silenciar las notificaciones'],null],
    mood:['pre','mood','08:10',['ثبت حال پوزیشن‌های باز','Log how open positions feel','تسجيل الحالة تجاه المراكز المفتوحة','Registrar cómo te sientes con las posiciones abiertas'],null],
    reflect:['during','reflection','',['بازتاب پس از هر معامله','Reflect after every trade','تأمل بعد كل صفقة','Reflexionar tras cada operación'],null],
    tilt:['during','tilt','16:00',['چک تیلت پیش از نیویورک','Tilt check before New York','فحص الميل قبل نيويورك','Revisar el tilt antes de Nueva York'],['ساعت اوج تنش تو','Your peak-tension hour','ساعة ذروة توترك','Tu hora de mayor tensión']],
    stop:['during','cooldown','',['توقف اجباری بعد از دو ضرر','Forced pause after two losses','توقف إجباري بعد خسارتين','Pausa obligatoria tras dos pérdidas'],null],
    close:['post','journal','22:30',['بستن روز و جملهٔ روز','Close the day and write the day’s sentence','إغلاق اليوم وجملة اليوم','Cerrar el día y la frase del día'],null],
    count:['post','journal','18:00',['شمردن تخلف‌های امروز','Count today’s rule breaks','عدّ مخالفات اليوم','Contar las infracciones de hoy'],null],
    note:['post','journal','21:00',['یادداشت یک‌خطی از روز','One-line note on the day','ملاحظة من سطر واحد عن اليوم','Nota de una línea sobre el día'],null],
    sentence:['post','journal','',['جملهٔ روز','Sentence of the day','جملة اليوم','Frase del día'],null],
    scan:['weekly','','',['اسکن هفتگی نمادها','Weekly symbol scan','مسح أسبوعي للرموز','Escaneo semanal de símbolos'],null],
    weekly:['weekly','tracking','',['چک‌این هفتگی','Weekly check-in','فحص أسبوعي','Chequeo semanal'],null],
    // ---- discipline ----
    rules:['pre','','07:30',['مرور قوانین معاملاتی من','Read my trading rules','مراجعة قواعد تداولي','Leer mis reglas de trading'],null],
    setups:['pre','','07:50',['فقط ستاپ‌های از پیش‌تعریف‌شده','Only pre-defined setups','فقط الإعدادات المحددة مسبقاً','Solo setups predefinidos'],null],
    stopplan:['during','','',['ثبت حد ضرر پیش از هر ورود','Set the stop-loss before every entry','تحديد وقف الخسارة قبل كل دخول','Fijar el stop-loss antes de cada entrada'],null],
    wait:['during','cooldown','',['بعد از ضرر، ده دقیقه صبر','Wait ten minutes after a loss','انتظر عشر دقائق بعد الخسارة','Espera diez minutos tras una pérdida'],null],
    noadd:['during','','',['بدون اضافه‌کردن به پوزیشن بازنده','Never add to a losing position','لا تضف إلى مركز خاسر','No añadir a una posición perdedora'],null],
    wkrules:['weekly','','',['بازبینی هفتگی قوانین','Weekly rules review','مراجعة أسبوعية للقواعد','Revisión semanal de las reglas'],null],
    // ---- analysis ----
    htf:['pre','','07:30',['تحلیل تایم‌فریم بالا','Higher-timeframe analysis','تحليل الإطار الزمني الأعلى','Análisis de temporalidad superior'],null],
    structure:['pre','','07:45',['تشخیص ساختار و روند بازار','Identify market structure and trend','تحديد بنية السوق والاتجاه','Identificar la estructura y la tendencia del mercado'],null],
    scenarios:['pre','','08:15',['نوشتن سناریوی صعودی و نزولی','Write the bullish and bearish scenarios','كتابة السيناريو الصاعد والهابط','Escribir el escenario alcista y el bajista'],null],
    invalid:['pre','','08:25',['تعیین نقطهٔ ابطال هر سناریو','Define each scenario’s invalidation point','تحديد نقطة إبطال كل سيناريو','Definir el punto de invalidación de cada escenario'],null],
    shot:['pre','app','08:35',['ذخیرهٔ اسکرین‌شات تحلیل','Save the analysis screenshot','حفظ لقطة شاشة التحليل','Guardar la captura del análisis'],null],
    update:['during','','13:00',['به‌روزرسانی سناریو با قیمت جدید','Update the scenario with new price action','تحديث السيناريو مع حركة السعر الجديدة','Actualizar el escenario con la nueva acción del precio'],null],
    compare:['post','journal','21:00',['مقایسهٔ تحلیل صبح با نتیجهٔ روز','Compare the morning analysis with the day’s outcome','مقارنة تحليل الصباح بنتيجة اليوم','Comparar el análisis de la mañana con el resultado del día'],null],
    lesson:['post','journal','21:15',['ثبت یک درس از تحلیل امروز','Log one lesson from today’s analysis','تسجيل درس من تحليل اليوم','Anotar una lección del análisis de hoy'],null],
    wkplan:['weekly','','',['نقشهٔ هفتگی بازار','Weekly market map','خريطة السوق الأسبوعية','Mapa semanal del mercado'],null],
    wkreview:['weekly','','',['مرور تحلیل‌های هفته و درصد درستی','Review the week’s analyses and hit rate','مراجعة تحليلات الأسبوع ونسبة الصحة','Revisar los análisis de la semana y su acierto'],null],
    // ---- hygiene ----
    brush_am:['morning','','07:00',['مسواک زدن صبح','Brush teeth (morning)','تنظيف الأسنان صباحاً','Cepillarse los dientes (mañana)'],null],
    face:['morning','','07:05',['شستن صورت و مراقبت از پوست','Wash face and skincare','غسل الوجه والعناية بالبشرة','Lavar la cara y cuidar la piel'],null],
    shower:['morning','','07:15',['دوش گرفتن','Take a shower','الاستحمام','Ducharse'],null],
    clothes:['morning','','07:30',['پوشیدن لباس تمیز','Put on clean clothes','ارتداء ملابس نظيفة','Ponerse ropa limpia'],null],
    hands:['day','','13:00',['شستن دست‌ها پیش از غذا','Wash hands before meals','غسل اليدين قبل الطعام','Lavarse las manos antes de comer'],null],
    floss:['evening','','21:50',['نخ دندان','Floss','خيط الأسنان','Usar hilo dental'],null],
    brush_pm:['evening','','22:00',['مسواک زدن شب','Brush teeth (night)','تنظيف الأسنان ليلاً','Cepillarse los dientes (noche)'],null],
    skin_pm:['evening','','22:05',['پاک‌کردن پوست پیش از خواب','Clean skin before bed','تنظيف البشرة قبل النوم','Limpiar la piel antes de dormir'],null],
    hamper:['evening','','22:10',['لباس‌های کثیف را در سبد بگذار','Put dirty clothes in the hamper','ضع الملابس المتسخة في السلة','Poner la ropa sucia en el cesto'],null],
    laundry:['weekly','','',['شستن لباس‌ها','Do the laundry','غسل الملابس','Lavar la ropa'],null],
    sheets:['weekly','','',['عوض‌کردن ملحفه و روبالشی','Change bed sheets and pillowcases','تغيير الملاءات وأغطية الوسائد','Cambiar sábanas y fundas de almohada'],null],
    nails:['weekly','','',['کوتاه‌کردن ناخن‌ها','Trim nails','قص الأظافر','Cortarse las uñas'],null],
    room:['weekly','','',['تمیزکردن و مرتب‌کردن اتاق','Clean and tidy the room','تنظيف الغرفة وترتيبها','Limpiar y ordenar la habitación'],null],
    desk:['weekly','','',['ضدعفونی میز کار و کیبورد','Wipe down desk and keyboard','تعقيم المكتب ولوحة المفاتيح','Desinfectar el escritorio y el teclado'],null],
    // ---- health and fitness ----
    stretch:['morning','','07:10',['کشش و گرم‌کردن بدن','Stretch and warm up','تمدد وإحماء الجسم','Estirar y calentar el cuerpo'],null],
    breakfast:['morning','','07:40',['صبحانهٔ سالم','Healthy breakfast','فطور صحي','Desayuno saludable'],null],
    vitamins:['morning','','07:45',['مصرف مکمل‌ها و داروها','Take supplements and medication','تناول المكملات والأدوية','Tomar suplementos y medicación'],null],
    water:['day','','',['نوشیدن آب کافی','Drink enough water','شرب كمية كافية من الماء','Beber suficiente agua'],null],
    walk:['day','','13:30',['پیاده‌روی ۲۰ دقیقه‌ای','20-minute walk','مشي ٢٠ دقيقة','Caminata de 20 minutos'],null],
    lunch:['day','','14:00',['ناهار سالم و بدون عجله','Healthy, unhurried lunch','غداء صحي دون استعجال','Almuerzo sano y sin prisa'],null],
    workout:['day','','18:00',['ورزش ۳۰ دقیقه‌ای','30-minute workout','تمرين ٣٠ دقيقة','Entrenamiento de 30 minutos'],null],
    eyes:['day','','',['استراحت چشم: هر ۲۰ دقیقه به دوردست نگاه کن','Eye break: look far away every 20 minutes','راحة العينين: انظر بعيداً كل ٢٠ دقيقة','Descanso visual: mira lejos cada 20 minutos'],null],
    posture:['day','','',['هر ساعت بلند شو و بدنت را بکش','Stand up and stretch every hour','قف وتمدد كل ساعة','Levántate y estírate cada hora'],null],
    dinner:['evening','','20:00',['شام سبک، دست‌کم دو ساعت پیش از خواب','Light dinner, at least two hours before bed','عشاء خفيف قبل النوم بساعتين على الأقل','Cena ligera, al menos dos horas antes de dormir'],null],
    weighin:['weekly','','',['ثبت وزن و اندازه‌ها','Log weight and measurements','تسجيل الوزن والقياسات','Registrar peso y medidas'],null],
    mealprep:['weekly','','',['برنامهٔ غذایی هفته','Plan the week’s meals','تخطيط وجبات الأسبوع','Planificar las comidas de la semana'],null],
    // ---- mind and calm ----
    meditate:['morning','calm','07:00',['مدیتیشن ۱۰ دقیقه‌ای','10-minute meditation','تأمل ١٠ دقائق','Meditación de 10 minutos'],null],
    gratitude:['morning','journal','07:15',['نوشتن سه چیز برای سپاسگزاری','Write three things you are grateful for','كتابة ثلاثة أشياء تشكر عليها','Escribir tres cosas por las que estás agradecido'],null],
    intent:['morning','','07:20',['تعیین یک نیت برای امروز','Set one intention for today','تحديد نية واحدة لليوم','Fijar una intención para hoy'],null],
    pause:['day','calm','15:00',['سه دقیقه مکث و تنفس آرام','Three-minute pause and slow breathing','ثلاث دقائق من التوقف والتنفس الهادئ','Tres minutos de pausa y respiración lenta'],null],
    detox:['day','','',['یک ساعت بدون گوشی و شبکه‌های اجتماعی','One hour without phone and social media','ساعة بدون هاتف ووسائل التواصل','Una hora sin móvil ni redes sociales'],null],
    nature:['day','','12:30',['ده دقیقه بیرون رفتن زیر نور روز','Ten minutes outside in daylight','عشر دقائق في الخارج تحت ضوء النهار','Diez minutos al aire libre con luz natural'],null],
    dump:['evening','journal','21:00',['نوشتن افکار و نگرانی‌ها روی کاغذ','Write worries and thoughts on paper','كتابة الهموم والأفكار على الورق','Escribir preocupaciones y pensamientos en papel'],null],
    winddown:['evening','calm','22:00',['ده دقیقه آرام‌سازی پیش از خواب','Ten-minute wind-down before bed','عشر دقائق استرخاء قبل النوم','Diez minutos de relajación antes de dormir'],null],
    moodlog:['evening','mood','21:30',['ثبت حال و هوای امروز','Log today’s mood','تسجيل مزاج اليوم','Registrar el ánimo de hoy'],null],
    wkreflect:['weekly','','',['بازتاب هفته: چه چیزی آرامم کرد؟','Weekly reflection: what calmed me?','تأمل أسبوعي: ما الذي هدّأني؟','Reflexión semanal: ¿qué me calmó?'],null],
    // ---- sleep ----
    wake:['morning','','06:30',['بیدارشدن سر ساعت ثابت','Wake up at a fixed time','الاستيقاظ في وقت ثابت','Despertar a una hora fija'],null],
    sunlight:['morning','','06:45',['نور آفتاب صبحگاهی','Get morning daylight','التعرض لضوء الصباح','Recibir luz natural por la mañana'],null],
    nocaf:['day','','14:00',['قطع کافئین بعد از ساعت ۱۴','No caffeine after 2 pm','لا كافيين بعد الثانية ظهراً','Sin cafeína después de las 14:00'],null],
    prep:['evening','','21:15',['آماده‌کردن وسایل فردا','Prepare tomorrow’s things','تجهيز أغراض الغد','Preparar las cosas de mañana'],null],
    screens:['evening','','21:30',['خاموش‌کردن صفحه‌نمایش‌ها نیم‌ساعت پیش از خواب','Screens off 30 minutes before bed','إطفاء الشاشات قبل النوم بنصف ساعة','Apagar pantallas 30 minutos antes de dormir'],null],
    dim:['evening','','21:45',['کم‌کردن نور و خنک‌کردن اتاق','Dim the lights and cool the room','خفض الإضاءة وتبريد الغرفة','Bajar la luz y refrescar la habitación'],null],
    bed:['evening','','22:30',['رفتن به رختخواب سر ساعت','Go to bed on time','الذهاب إلى الفراش في الوقت المحدد','Acostarse a la hora prevista'],null],
    sleeplog:['weekly','','',['مرور کیفیت خواب هفته','Review the week’s sleep quality','مراجعة جودة نوم الأسبوع','Revisar la calidad del sueño de la semana'],null],
    // ---- learning ----
    goal:['morning','','08:00',['تعیین هدف یادگیری امروز','Set today’s learning goal','تحديد هدف التعلّم لليوم','Fijar el objetivo de aprendizaje de hoy'],null],
    read:['day','','09:00',['مطالعهٔ ۲۰ دقیقه‌ای','20 minutes of reading','قراءة ٢٠ دقيقة','20 minutos de lectura'],null],
    course:['day','','10:00',['یک درس از دوره یا آموزش','One lesson from a course','درس واحد من دورة','Una lección de un curso'],null],
    practice:['day','','16:00',['تمرین عملی','Hands-on practice','تدريب عملي','Práctica real'],null],
    notes:['evening','','20:30',['مرور و خلاصه‌نویسی نکات امروز','Review and summarise today’s notes','مراجعة وتلخيص ملاحظات اليوم','Repasar y resumir las notas de hoy'],null],
    question:['evening','','20:45',['نوشتن یک سؤال برای فردا','Write one question for tomorrow','كتابة سؤال واحد للغد','Escribir una pregunta para mañana'],null],
    teach:['weekly','','',['توضیح‌دادن آموخته‌ها به یک نفر یا روی کاغذ','Explain what I learned to someone, or on paper','شرح ما تعلمته لشخص أو على الورق','Explicar lo aprendido a alguien o por escrito'],null],
    wkgoal:['weekly','','',['بازبینی پیشرفت هفتگی','Review weekly progress','مراجعة التقدم الأسبوعي','Revisar el progreso semanal'],null]
  };

  // A template step is an id, [id, time] (the time this template prefers), or an object that
  // also replaces the label (the original "minimal" template words its reflect step differently).
  function entryOf(e){return typeof e==='string'?{id:e}:Array.isArray(e)?{id:e[0],time:e[1]}:e;}
  function buildStep(entry,lang){
    var o=entryOf(entry),def=STEPS[o.id];
    if(!def)return null;
    return step(o.id,o.label?pick(o.label,lang):pick(def[3],lang),o.time!=null?o.time:def[2],def[0],def[1],o.label||!def[4]?'':pick(def[4],lang));
  }

  // The selectable routine types. `group` orders the picker (trading, life, custom); `library` names
  // the suggestion list the step builder shows for it - a routine's suggested steps follow its type.
  var TYPES={
    hunter:{group:'market',icon:'crosshair',minutes:45,library:'market',
      name:['روتین شکارچی','Hunter routine','روتين الصياد','Rutina del cazador'],
      desc:['ریتم کامل روز معاملاتی: پیش از بازار، حین و پس از آن','The full trading-day rhythm: before, during and after the market','إيقاع يوم التداول الكامل: قبل السوق وأثناءه وبعده','El ritmo completo del día de trading: antes, durante y después del mercado'],
      steps:['plan','news','levels','risk','breath','checkin','reflect','tilt','close']},
    scalper:{group:'market',icon:'zap',minutes:25,library:'market',
      name:['اسکالپ کوتاه','Short scalp','مضاربة قصيرة','Scalp corto'],
      desc:['کوتاه و دقیق برای اسکالپ‌های سریع','Short and sharp for fast scalps','قصير ودقيق للمضاربات السريعة','Corta y precisa para scalps rápidos'],
      steps:['spread','cap',['checkin','09:20'],'stop','count']},
    swing:{group:'market',icon:'waves',minutes:35,library:'market',
      name:['سوئینگ آرام','Calm swing','سوينغ هادئ','Swing tranquilo'],
      desc:['آرام و کم‌دخالت برای پوزیشن‌های چندروزه','Calm, low-touch routine for multi-day positions','هادئ وقليل التدخل للمراكز متعددة الأيام','Tranquila y poco intervencionista para posiciones de varios días'],
      steps:['scan','look','mood','note','weekly']},
    minimal:{group:'market',icon:'feather',minutes:10,library:'market',
      name:['حداقلی','Minimal','الحد الأدنى','Mínima'],
      desc:['فقط سه گام ضروری، برای روزهای شلوغ','Only the three essential steps, for busy days','ثلاث خطوات أساسية فقط، للأيام المزدحمة','Solo los tres pasos esenciales, para días ocupados'],
      steps:[['checkin',''],{id:'reflect',time:'',label:['یک جمله دربارهٔ اجرا','One sentence about execution','جملة واحدة عن التنفيذ','Una frase sobre la ejecución']},'sentence']},
    discipline:{group:'market',icon:'shield-check',minutes:30,library:'discipline',
      name:['روتین انضباطی','Discipline routine','روتين الانضباط','Rutina de disciplina'],
      desc:['قوانین، ریسک و کنترل رفتار — برای وفاداری به پلن','Rules, risk and behaviour control — to stay loyal to your plan','القواعد والمخاطرة وضبط السلوك — للبقاء وفياً لخطتك','Reglas, riesgo y control de conducta — para ser fiel a tu plan'],
      steps:['rules','setups',['risk','08:00'],'stopplan','wait','noadd','reflect','count','close','wkrules']},
    analysis:{group:'market',icon:'trending-up',minutes:40,library:'analysis',
      name:['روتین تحلیل','Analysis routine','روتين التحليل','Rutina de análisis'],
      desc:['از دید بالا تا سناریو — تحلیل منظم و مستند بازار','From the big picture to a scenario — structured, documented market analysis','من الصورة الكبيرة إلى السيناريو — تحليل منظم وموثق للسوق','De la visión global al escenario — análisis de mercado estructurado y documentado'],
      steps:['htf','structure','news',['levels','08:00'],'scenarios','invalid','compare','wkreview']},
    hygiene:{group:'life',icon:'droplets',minutes:35,library:'hygiene',
      name:['روتین بهداشتی','Hygiene routine','روتين النظافة','Rutina de higiene'],
      desc:['نظافت فردی و محیط، از مسواک تا شستن لباس','Personal and home cleanliness, from brushing teeth to laundry','النظافة الشخصية والمنزلية، من تنظيف الأسنان إلى غسل الملابس','Aseo personal y del hogar, del cepillado a la colada'],
      steps:['brush_am','face','shower','clothes','hands','brush_pm','laundry','room']},
    health:{group:'life',icon:'heart-pulse',minutes:60,library:'health',
      name:['روتین سلامت و ورزش','Health and fitness routine','روتين الصحة واللياقة','Rutina de salud y ejercicio'],
      desc:['حرکت، تغذیه و انرژی برای بدن و ذهن سرحال','Movement, food and energy for a sharp body and mind','الحركة والغذاء والطاقة لجسم وذهن نشيطين','Movimiento, comida y energía para un cuerpo y una mente despiertos'],
      steps:['stretch','breakfast','water','walk','workout','dinner','weighin']},
    mind:{group:'life',icon:'brain',minutes:30,library:'mind',
      name:['روتین ذهن و آرامش','Mind and calm routine','روتين الذهن والهدوء','Rutina de mente y calma'],
      desc:['تنفس، سپاسگزاری و نوشتن برای ذهنی آرام و متمرکز','Breathing, gratitude and writing for a calm, focused mind','التنفس والامتنان والكتابة لذهن هادئ ومركّز','Respiración, gratitud y escritura para una mente calmada y enfocada'],
      steps:['meditate','gratitude','intent','pause','detox','dump','winddown','wkreflect']},
    sleep:{group:'life',icon:'moon',minutes:20,library:'sleep',
      name:['روتین خواب','Sleep routine','روتين النوم','Rutina de sueño'],
      desc:['ریتم ثابت خواب برای انرژی و تصمیم‌های بهتر','A steady sleep rhythm for energy and better decisions','إيقاع نوم ثابت لطاقة وقرارات أفضل','Un ritmo de sueño estable para más energía y mejores decisiones'],
      steps:['wake','sunlight','nocaf','prep','screens','dim','bed','sleeplog']},
    learning:{group:'life',icon:'book-open',minutes:60,library:'learning',
      name:['روتین یادگیری','Learning routine','روتين التعلّم','Rutina de aprendizaje'],
      desc:['مطالعه و تمرین منظم برای رشد یک مهارت','Regular reading and practice to grow a skill','قراءة وتدريب منتظمان لتنمية مهارة','Lectura y práctica regulares para crecer en una habilidad'],
      steps:['goal','read','course','practice','notes','wkgoal']},
    blank:{group:'custom',icon:'pencil-line',minutes:0,library:'custom',
      name:['روتین من','My routine','روتيني','Mi rutina'],
      desc:['از صفر، هر روتینی که می‌خواهی — گام‌ها را خودت می‌سازی','From scratch, any routine you like — you write the steps','من الصفر، أي روتين تريده — تكتب الخطوات بنفسك','Desde cero, la rutina que quieras — tú escribes los pasos'],
      steps:[]}
  };

  // Suggestion lists, one per library key: [phase, [step ids]] groups, in display order.
  var LIBRARIES={
    market:[['pre',['plan','news','levels','risk','spread','cap','look']],['mind',['breath','checkin','card','mute','mood']],['during',['reflect','tilt','stop']],['post',['close','count','note','sentence']],['weekly',['weekly','scan']]],
    discipline:[['pre',['rules','plan','setups','risk','cap','checkin']],['mind',['breath','card','mute']],['during',['stopplan','wait','noadd','stop','reflect']],['post',['count','close','note']],['weekly',['wkrules','weekly']]],
    analysis:[['pre',['htf','structure','news','levels','scenarios','invalid','shot']],['during',['update','reflect']],['post',['compare','lesson','note']],['weekly',['scan','wkplan','wkreview']]],
    hygiene:[['morning',['brush_am','face','shower','clothes']],['day',['hands','water']],['evening',['floss','brush_pm','skin_pm','hamper']],['weekly',['laundry','sheets','nails','room','desk']]],
    health:[['morning',['stretch','breakfast','vitamins']],['day',['water','walk','lunch','workout','eyes','posture']],['evening',['dinner']],['weekly',['weighin','mealprep']]],
    mind:[['morning',['meditate','gratitude','intent']],['day',['pause','detox','nature']],['evening',['dump','winddown','moodlog']],['weekly',['wkreflect']]],
    sleep:[['morning',['wake','sunlight']],['day',['nocaf']],['evening',['prep','screens','dim','bed','dinner']],['weekly',['sleeplog']]],
    learning:[['morning',['goal']],['day',['read','course','practice']],['evening',['notes','question']],['weekly',['teach','wkgoal']]],
    custom:[['morning',['wake','stretch','intent','breakfast']],['day',['water','walk','read','pause']],['evening',['prep','dump','brush_pm','bed']],['weekly',['room','wkgoal','sleeplog']]]
  };

  function familyOf(typeKey){
    var t=TYPES[typeKey];
    return t&&t.group==='market'?'market':'life';
  }
  function defaultDays(typeKey){return(familyOf(typeKey)==='market'?MARKET_DAYS:ALL_DAYS).slice();}
  function phasesFor(typeKey){return PHASE_FAMILIES[familyOf(typeKey)].slice();}

  // The types the builder offers, keyed and ordered (trading, life, custom). `steps` is the routine
  // that type starts with - always fully editable afterwards. `lang` defaults to the UI language.
  function templates(lang){
    var l=lang||currentLang(),out={};
    Object.keys(TYPES).forEach(function(key){
      var t=TYPES[key];
      out[key]={
        name:pick(t.name,l),desc:pick(t.desc,l),group:t.group,icon:t.icon,minutes:t.minutes,
        days:defaultDays(key),phases:phasesFor(key),
        steps:t.steps.map(function(e){return buildStep(e,l);}).filter(Boolean)
      };
    });
    return out;
  }

  // The suggestions for one routine type, grouped by phase. Called with no type it returns the
  // trading-day library, exactly what it returned before types existed.
  function stepLibrary(typeKey,lang){
    var l=lang||currentLang(),t=TYPES[typeKey]||TYPES.hunter;
    return(LIBRARIES[t.library]||LIBRARIES.market).map(function(group){
      return{phase:group[0],items:group[1].map(function(id){return buildStep(id,l);}).filter(Boolean)};
    }).filter(function(group){return group.items.length;});
  }

  // A step the trader writes themselves. The id is deliberately short: every completed day stores
  // one `"<id>":true` per step, and the whole state must fit one preference value (16 KiB).
  function customStep(fields,takenIds){
    var f=fields||{},taken=takenIds||[],id;
    do{id='u'+Math.random().toString(36).slice(2,7);}while(taken.indexOf(id)>-1);
    return step(id,String(f.label||'').trim(),f.time,f.phase||'day',f.link,f.note);
  }

  function emptyState(){return{version:1,activeId:null,routines:[],completions:{}};}

  // Normalises whatever came back from the replica, so every reader downstream can assume the
  // full shape. A row written by an older build (or a hand-edited one) can be missing anything.
  function normalize(raw){
    var base=emptyState();
    if(!raw||typeof raw!=='object')return base;
    var routines=Array.isArray(raw.routines)?raw.routines.filter(function(r){return r&&r.id;}).map(function(r){
      return{
        id:String(r.id),
        name:String(r.name||'روتین من'),
        template:r.template||'blank',
        session:r.session||'london',
        days:Array.isArray(r.days)?r.days.slice():['sat','sun','mon','tue','wed'],
        steps:Array.isArray(r.steps)?r.steps.filter(function(s){return s&&s.id;}).map(function(s){
          return step(String(s.id),String(s.label||''),s.time,s.phase,s.link,s.note);
        }).slice(0,MAX_STEPS):[],
        rules:Object.assign(defaultRules(),r.rules||{}),
        archived:!!r.archived,
        createdAt:r.createdAt||nowIso(),
        updatedAt:r.updatedAt||r.createdAt||nowIso()
      };
    }):[];
    var completions={};
    if(raw.completions&&typeof raw.completions==='object'){
      Object.keys(raw.completions).forEach(function(key){
        var day=raw.completions[key];
        if(day&&typeof day==='object')completions[key]=clone(day);
      });
    }
    var activeId=raw.activeId&&routines.some(function(r){return r.id===raw.activeId&&!r.archived;})?raw.activeId:null;
    if(!activeId){
      var first=routines.filter(function(r){return !r.archived;})[0];
      activeId=first?first.id:null;
    }
    return{version:1,activeId:activeId,routines:routines,completions:completions};
  }

  function load(){
    var prefs=window.TradeJournalUserPreferences;
    return normalize(prefs?prefs.getPref(PREF_KEY,null):null);
  }

  // The server rejects a preference value over 16 KiB (server/community/routes.preferences.mjs), and
  // one day's completions cost roughly one `"<id>":true` per step - so a long-lived routine with
  // many steps could otherwise outgrow it and stop saving altogether. Count real UTF-8 bytes.
  var MAX_VALUE_BYTES=15000;
  function byteLength(value){
    var text=JSON.stringify(value),bytes=0;
    for(var i=0;i<text.length;i++){
      var c=text.charCodeAt(i);
      if(c<0x80)bytes+=1;
      else if(c<0x800)bytes+=2;
      else if(c>=0xd800&&c<=0xdbff){bytes+=4;i+=1;}
      else bytes+=3;
    }
    return bytes;
  }

  // Drops completion days past the retention window before writing, so the stored value stays
  // bounded however long the account lives; if it is still over the byte budget the oldest days go
  // first (the definitions and the recent streak are what the trader is looking at).
  function prune(state,now){
    var cutoff=new Date(now||new Date());
    cutoff.setDate(cutoff.getDate()-COMPLETION_RETENTION_DAYS);
    var floor=dayKey(cutoff),kept={};
    Object.keys(state.completions).forEach(function(key){
      if(key>=floor)kept[key]=state.completions[key];
    });
    state.completions=kept;
    var days=Object.keys(kept).sort();
    while(days.length&&byteLength(state)>MAX_VALUE_BYTES)delete kept[days.shift()];
    return state;
  }

  function save(next,now){
    var state=prune(normalize(next),now);
    var prefs=window.TradeJournalUserPreferences;
    if(prefs)prefs.setPref(PREF_KEY,state);
    window.dispatchEvent(new CustomEvent('tradejournal:routine-changed'));
    return state;
  }

  function list(state){return (state||load()).routines.filter(function(r){return !r.archived;});}
  function active(state){
    var s=state||load();
    return s.routines.filter(function(r){return r.id===s.activeId;})[0]||null;
  }
  function setActive(id){
    var s=load();
    if(!s.routines.some(function(r){return r.id===id;}))return s;
    s.activeId=id;
    return save(s);
  }

  // `draft` is whatever the builder has on screen; everything unset falls back to the chosen
  // template so a half-filled wizard still produces a usable routine.
  function create(draft){
    var d=draft||{};
    var preset=templates()[d.template]||templates().blank;
    var s=load();
    var routine={
      id:uid('routine'),
      name:(d.name||preset.name||'روتین من').trim()||'روتین من',
      template:d.template||'blank',
      session:d.session||'london',
      days:Array.isArray(d.days)&&d.days.length?d.days.slice():preset.days.slice(),
      steps:Array.isArray(d.steps)?d.steps.slice():clone(preset.steps),
      rules:Object.assign(defaultRules(),d.rules||{}),
      archived:false,
      createdAt:nowIso(),
      updatedAt:nowIso()
    };
    s.routines.push(routine);
    s.activeId=routine.id;
    save(s);
    return routine;
  }

  function update(id,patch){
    var s=load(),found=null;
    s.routines=s.routines.map(function(r){
      if(r.id!==id)return r;
      found=Object.assign({},r,patch||{},{id:r.id,createdAt:r.createdAt,updatedAt:nowIso()});
      return found;
    });
    if(!found)return s;
    return save(s);
  }

  // Archive rather than delete: the adherence history for past days stays meaningful, and a
  // routine the trader turns off can be turned back on without losing its shape.
  function archive(id){return update(id,{archived:true});}

  function dayMap(state,key){
    var s=state||load();
    return s.completions[key||dayKey()]||{};
  }

  function toggleStep(stepId,date){
    var s=load(),key=dayKey(date),day=Object.assign({},s.completions[key]||{});
    if(day[stepId])delete day[stepId];else day[stepId]=true;
    s.completions[key]=day;
    return save(s);
  }

  // A watch day ("امروز معامله نمی‌کنم") is a deliberate, successful day - not a failed one. It
  // is stored on the day itself so adherence() can score it without needing trade history.
  function setWatchDay(on,date){
    var s=load(),key=dayKey(date),day=Object.assign({},s.completions[key]||{});
    if(on)day[WATCH_KEY]=true;else delete day[WATCH_KEY];
    s.completions[key]=day;
    return save(s);
  }

  function isWatchDay(state,date){return !!dayMap(state,dayKey(date))[WATCH_KEY];}

  function stepsFor(routine){return routine&&Array.isArray(routine.steps)?routine.steps:[];}

  function dayProgress(state,date,routine){
    var s=state||load(),r=routine||active(s),steps=stepsFor(r);
    var key=dayKey(date),day=s.completions[key]||{};
    var done=steps.filter(function(x){return !!day[x.id];}).length;
    return{
      date:key,total:steps.length,done:done,
      pct:steps.length?Math.round(done/steps.length*100):0,
      watch:!!day[WATCH_KEY],
      complete:steps.length>0&&done===steps.length
    };
  }

  // One entry per calendar day for the trailing `days`, oldest first. A day with no routine row
  // at all is 'none' (an honest gap), never a zero - the same convention disciplineWeekly() uses.
  function adherence(days,now,state){
    days=days||28;
    var s=state||load(),r=active(s),total=stepsFor(r).length;
    var end=now||new Date(),out=[];
    for(var i=days-1;i>=0;i--){
      var d=new Date(end.getFullYear(),end.getMonth(),end.getDate()-i);
      var key=dayKey(d),day=s.completions[key];
      if(!day){out.push({date:key,state:'none',pct:0,done:0,total:total});continue;}
      if(day[WATCH_KEY]){out.push({date:key,state:'watch',pct:0,done:0,total:total});continue;}
      var done=Object.keys(day).filter(function(k){return k!==WATCH_KEY&&day[k];}).length;
      out.push({
        date:key,
        state:total&&done>=total?'complete':done>0?'partial':'none',
        pct:total?Math.round(Math.min(done,total)/total*100):0,
        done:done,total:total
      });
    }
    return out;
  }

  // Share of days that counted as a success. A watch day counts when the routine's own `watch`
  // rule is on (its whole point); `partial` credit is opt-in via the routine's `partial` rule.
  function adherenceRate(days,now,state){
    var s=state||load(),r=active(s),rows=adherence(days,now,s);
    var rules=(r&&r.rules)||defaultRules();
    var scored=rows.filter(function(x){return x.state!=='none'||false;});
    if(!scored.length)return null;
    var sum=scored.reduce(function(acc,x){
      if(x.state==='complete')return acc+1;
      if(x.state==='watch')return acc+(rules.watch?1:0);
      if(x.state==='partial')return acc+(rules.partial?x.pct/100:0);
      return acc;
    },0);
    return Math.round(sum/scored.length*100);
  }

  // Consecutive successful days ending today (or the given day). Mirrors disciplineStreak()'s
  // "walk backwards until a day fails" shape, including its "today with nothing logged yet ends
  // the streak" behaviour.
  function streak(now,state){
    var s=state||load(),r=active(s),total=stepsFor(r).length;
    if(!total)return 0;
    var rules=(r&&r.rules)||defaultRules();
    var cursor=new Date(now||new Date()),count=0;
    for(;;){
      var day=s.completions[dayKey(cursor)];
      if(!day)break;
      if(day[WATCH_KEY]){
        if(!rules.watch)break;
      }else{
        var done=Object.keys(day).filter(function(k){return k!==WATCH_KEY&&day[k];}).length;
        if(done<total)break;
      }
      count+=1;
      cursor.setDate(cursor.getDate()-1);
    }
    return count;
  }

  // The steps of the active routine that are due for a reminder right now: the routine has
  // reminders on (its own `remind` rule), today is one of its days, the step carries a time that
  // fell within the last `windowMinutes`, and it is not already ticked. Pure - the shell decides how
  // to show it and remembers what it already showed.
  var DAY_KEYS=['sun','mon','tue','wed','thu','fri','sat'];
  function dueReminders(now,state,windowMinutes){
    var s=state||load(),r=active(s);
    if(!r||!r.rules||!r.rules.remind)return[];
    var d=now||new Date();
    if(r.days.indexOf(DAY_KEYS[d.getDay()])===-1)return[];
    var nowMinutes=d.getHours()*60+d.getMinutes(),span=windowMinutes||5;
    var key=dayKey(d),done=s.completions[key]||{};
    return stepsFor(r).filter(function(x){
      var at=minutesOf(x.time);
      return at!==null&&nowMinutes>=at&&nowMinutes<at+span&&!done[x.id];
    }).map(function(x){
      return{routineId:r.id,routineName:r.name,stepId:x.id,label:x.label,time:x.time,dayKey:key};
    });
  }

  window.TradeJournalRoutineStore={
    PREF_KEY:PREF_KEY,
    MAX_STEPS:MAX_STEPS,
    MAX_LABEL:MAX_LABEL,
    PHASE_ORDER:PHASE_ORDER,
    dayKey:dayKey,
    templates:templates,
    stepLibrary:stepLibrary,
    phasesFor:phasesFor,
    customStep:customStep,
    sanitizeTime:sanitizeTime,
    dueReminders:dueReminders,
    defaultRules:defaultRules,
    load:load,
    save:save,
    list:list,
    active:active,
    setActive:setActive,
    create:create,
    update:update,
    archive:archive,
    toggleStep:toggleStep,
    setWatchDay:setWatchDay,
    isWatchDay:isWatchDay,
    dayProgress:dayProgress,
    adherence:adherence,
    adherenceRate:adherenceRate,
    streak:streak
  };
}());
