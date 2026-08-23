(function () {
  const character = window.TradeJournalPanelCharacter || 'hunter';
  // Matches navrya/tokens/characters.css's --char-accent per character exactly, so every
  // legacy (--ps-accent-driven) surface - the session workspace chief among them - reads as
  // the same brand hue as the NAVRYA header/sidebar instead of its own slightly-off green/blue/
  // red/purple. See ARCHITECTURE.md's NAVRYA design-system pilot section.
  const themes = {
    hunter: { accent: '#66C94E', rgb: '102,201,78', backdrop: 'assets/card-stag-v2.webp' },
    engineer: { accent: '#3A9AF8', rgb: '58,154,248', backdrop: 'assets/engineer-card-v1.webp' },
    commander: { accent: '#F04432', rgb: '240,68,50', backdrop: 'assets/commander-card-v1.webp' },
    sage: { accent: '#A965D8', rgb: '169,101,216', backdrop: 'assets/sage-card-v1.webp' }
  };
  const root = document.documentElement;
  const theme = themes[character] || themes.hunter;
  root.style.setProperty('--ps-accent', theme.accent);
  root.style.setProperty('--ps-accent-rgb', theme.rgb);
  root.style.setProperty('--ps-line', 'rgba(' + theme.rgb + ',.38)');
  root.style.setProperty('--ps-backdrop', 'url("' + theme.backdrop + '")');

  const content = document.querySelector('.content');
  if (!content) return;
  const legacyChildren = Array.from(content.children);
  let currentView = 'library';
  let panelPage = null;
  const labels = {
    fa: { sessions:'سشن‌ها', dashboard:'داشبورد', strategies:'استراتژی‌ها', settings:'تنظیمات', add:'افزودن پنل', manage:'مدیریت پنل‌ها', overview:'نمای کلی امروز', focus:'فوکوس و لوپ', watch:'واچ‌لیست بازار', strategy:'استراتژی‌های فعال', notes:'یادداشت سریع', insight:'بینش AI', hidden:'پنهان', active:'فعال', width:'عرض', shrink:'کوچک‌تر', expand:'بزرگ‌تر', show:'نمایش', hide:'پنهان‌کردن', noPanels:'پنلی در این بخش فعال نیست.', prompt:'توضیح بده چه پنلی می‌خواهی بسازی…', build:'ساخت پنل', local:'پیش‌نمایش محلی', secure:'کلید API در مرورگر ذخیره نمی‌شود؛ این بخش آمادهٔ اتصال امن به بک‌اند است.', dashboards:'همهٔ پنل‌ها از همین‌جا قابل مدیریت‌اند.', panelCreated:'پنل جدید اضافه شد.' },
    ar: { sessions:'الجلسات', dashboard:'لوحة التحكم', strategies:'الاستراتيجيات', settings:'الإعدادات', add:'إضافة لوحة', manage:'إدارة اللوحات', overview:'نظرة اليوم', focus:'التركيز والدورة', watch:'قائمة المتابعة', strategy:'الاستراتيجيات النشطة', notes:'ملاحظة سريعة', insight:'رؤية AI', hidden:'مخفي', active:'نشط', width:'العرض', shrink:'تصغير', expand:'توسيع', show:'إظهار', hide:'إخفاء', noPanels:'لا توجد لوحات نشطة في هذا القسم.', prompt:'صف اللوحة التي تريد إنشاءها…', build:'إنشاء لوحة', local:'معاينة محلية', secure:'لا يتم حفظ مفتاح API في المتصفح؛ هذه الواجهة جاهزة لاتصال خلفي آمن.', dashboards:'يمكن إدارة كل اللوحات من هنا.', panelCreated:'تمت إضافة اللوحة.' },
    en: { sessions:'Sessions', dashboard:'Dashboard', strategies:'Strategies', settings:'Settings', add:'Add panel', manage:'Manage panels', overview:'Today overview', focus:'Focus loop', watch:'Market watchlist', strategy:'Active strategies', notes:'Quick note', insight:'AI insight', hidden:'Hidden', active:'Active', width:'Width', shrink:'Shrink', expand:'Expand', show:'Show', hide:'Hide', noPanels:'No panels are active in this section.', prompt:'Describe the panel you want to create…', build:'Create panel', local:'Local preview', secure:'No API key is stored in the browser; this interface is ready for a secure backend connection.', dashboards:'All panels can be managed from this screen.', panelCreated:'New panel added.' },
    es: { sessions:'Sesiones', dashboard:'Panel', strategies:'Estrategias', settings:'Ajustes', add:'Añadir panel', manage:'Gestionar paneles', overview:'Resumen de hoy', focus:'Bucle de enfoque', watch:'Lista de mercados', strategy:'Estrategias activas', notes:'Nota rápida', insight:'Visión IA', hidden:'Oculto', active:'Activo', width:'Ancho', shrink:'Reducir', expand:'Ampliar', show:'Mostrar', hide:'Ocultar', noPanels:'No hay paneles activos en esta sección.', prompt:'Describe el panel que quieres crear…', build:'Crear panel', local:'Vista local', secure:'No se guarda ninguna clave API en el navegador; la interfaz está lista para una conexión segura al backend.', dashboards:'Todos los paneles se gestionan aquí.', panelCreated:'Panel nuevo añadido.' }
  };

  function locale() { return labels[root.lang] ? root.lang : 'fa'; }
  function copy() { return labels[locale()]; }
  function setActiveNav(view) { document.querySelectorAll('.sidebar nav a').forEach(function (link) { const map = { '#library':'library', '#dashboard':'dashboard', '#strategies':'strategies', '#settings':'settings' }; link.classList.toggle('active', map[link.getAttribute('href')] === view); }); }
  function showLegacy() { legacyChildren.forEach(function (child) { child.hidden=false; }); content.classList.remove('panel-mode'); if(panelPage) panelPage.hidden=true; }
  // Phase 8d of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section) removed the localStorage-backed 4-span panel-grid builder
  // (load/save/storeKey/presets/makeCanvas/makeSettings/updatePanel/managerRow/panelCard/bodyFor/
  // TradeJournalPanelLayer.register) that used to live here, rather than migrating it - confirmed
  // provably dead first, not assumed: window.TradeJournalNavryaCanvas (navrya-src/canvasApp.jsx)
  // is set unconditionally by every character page's own entry point
  // (navrya-src/entries/{character}.jsx -> mountCharacterApp(), before any user interaction is
  // possible), and render()'s only caller of those functions was its own now-removed
  // navrya-absent fallback branch - a branch canvasApp.jsx's own comment already documented as
  // retired ("There is no shared generic panel-grid renderer anymore"). A repo-wide grep (source
  // and every compiled bundle) found zero callers of register()/storeKey()/makeCanvas()/
  // makeSettings() anywhere outside this file. The REAL, live panel-layout persistence today is
  // navrya-src/dashboardView.jsx's own board (tradejournal:navrya-dashboard-board:v1:{character} -
  // drag-reorder/resize/hide/remove/AI-drafted panels, shared with settingsView.jsx's "Manage
  // panels" section) - that is what this same sub-phase migrates onto
  // window.TradeJournalUserPreferences instead; see dashboardView.jsx's own comment.
  //
  // What's left below (theming, routing, showLegacy/showCustom, syncRank/syncMarketClocks) was
  // never part of the dead panel-grid mechanism and needed no change: render()'s
  // dashboard/strategies/settings branch simply always defers to the NAVRYA hook now, with a
  // minimal empty-section fallback for the already-unreachable-in-practice case that hook is
  // somehow absent, rather than a full second DOM-building implementation nothing exercises.
  function render(view) { currentView=view; setActiveNav(view); document.querySelectorAll('[data-panel-label]').forEach(function(el){el.textContent=copy().settings;}); if(view==='library'){showLegacy();return;} legacyChildren.forEach(function(child){child.hidden=true;}); content.classList.add('panel-mode'); if(panelPage){if(panelPage._reactRoot&&panelPage._reactRoot.unmount){try{panelPage._reactRoot.unmount();}catch(e){}}panelPage.remove();} var navrya=window.TradeJournalNavryaCanvas; panelPage=(navrya&&navrya.render)?navrya.render(view):document.createElement('section');content.append(panelPage); }
  const routes={'#library':'library','#dashboard':'dashboard','#strategies':'strategies','#settings':'settings'};
  document.querySelectorAll('.sidebar nav a').forEach(function(link){link.addEventListener('click',function(event){const view=routes[link.getAttribute('href')];if(!view)return;event.preventDefault();render(view);});});
  const settingsButton=document.querySelector('.settings');if(settingsButton)settingsButton.addEventListener('click',function(){render('settings');});
  function syncMarketClocks() {
    const zones = { newYork:'America/New_York', london:'Europe/London', tokyo:'Asia/Tokyo', sydney:'Australia/Sydney' };
    const locales = { fa:'fa-IR', ar:'ar-EG', en:'en-GB', es:'es-ES' };
    document.querySelectorAll('[data-market-time]').forEach(function (element) {
      const city = element.parentElement.querySelector('[data-market-city]'); const zone = city && zones[city.dataset.marketCity];
      if (zone) element.textContent = new Intl.DateTimeFormat(locales[locale()], { timeZone:zone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date());
    });
  }
  function syncRank() {
    const ranks = {
      hunter:{ fa:['کارآموز شکارچی','ردیاب','شکارچی حرفه‌ای','شکارچی سایه','شکارچی نخبه','شکارچی افسانه‌ای','شکارچی اسطوره‌ای'], ar:['متدرّب الصيد','المتعقّب','الصياد المحترف','صياد الظلال','الصياد النخبة','الصياد الأسطوري','الصياد الخارق'], en:['Novice Hunter','Tracker','Professional Hunter','Shadow Hunter','Elite Hunter','Legendary Hunter','Mythic Hunter'], es:['Cazador novato','Rastreador','Cazador profesional','Cazador sombra','Cazador élite','Cazador legendario','Cazador mítico'] },
      engineer:{ fa:['کارآموز مهندسی','نقشه‌نگار بازار','تحلیل‌گر ساختار','معمار بازار','معمار ارشد','نابغه بازار','خالق بازار'], ar:['متدرّب هندسي','رسّام السوق','محلل الهيكل','معمار السوق','المهندس المعماري الأول','عبقري السوق','خالق السوق'], en:['Engineering Apprentice','Market Cartographer','Structure Analyst','Market Architect','Senior Architect','Market Genius','Market Creator'], es:['Aprendiz de ingeniería','Cartógrafo del mercado','Analista de estructura','Arquitecto del mercado','Arquitecto sénior','Genio del mercado','Creador del mercado'] },
      commander:{ fa:['سرباز','دیده‌بان','فرمانده گروه','فرمانده میدان','ژنرال','فرمانده عالی','فرمانده اعظم'], ar:['جندي','حارس','قائد الفصيلة','قائد الميدان','جنرال','القائد الأعلى','القائد الأعظم'], en:['Soldier','Sentinel','Squad Commander','Field Commander','General','Supreme Commander','Grand Commander'], es:['Soldado','Centinela','Comandante de escuadrón','Comandante de campo','General','Comandante supremo','Gran comandante'] },
      sage:{ fa:['مرید','پژوهشگر','تحلیلگر ارشد','استاد الگوها','استاد بازار','حکیم بازار','افسانه بازار'], ar:['مريد','باحث','محلل أول','سيد الأنماط','أستاذ السوق','حكيم السوق','أسطورة السوق'], en:['Disciple','Researcher','Senior Analyst','Master of Patterns','Market Master','Market Sage','Market Legend'], es:['Discípulo','Investigador','Analista sénior','Maestro de patrones','Maestro de mercado','Sabio del mercado','Leyenda del mercado'] }
    };
    const level = Math.max(1, Math.min(7, Number((document.querySelector('.level-ring b') || {}).textContent) || 1));
    const target = document.querySelector('.level-copy > span'); const value = ranks[character] && ranks[character][locale()] && ranks[character][locale()][level - 1];
    if (target && value) target.textContent = value;
  }
  function showCustom(page, activeView) { currentView='custom'; setActiveNav(activeView || 'library'); legacyChildren.forEach(function(child){child.hidden=true;}); content.classList.add('panel-mode'); if(panelPage)panelPage.remove(); panelPage=page; content.append(panelPage); }
  // Hotfix (found via real-browser testing, not a code trace): Phase 8d's "zero callers of
  // register() anywhere in the repo" claim was wrong - session-system.js, trade-open-positions.js,
  // trade-reports.js, pattern-registry.js, and strategy-education.js each still call
  // layer.register(...) unconditionally at their own module load time (two of them BEFORE their
  // own window.TradeJournal* export statement), because that grep evidently missed these plain
  // shared/*.js files, which are loaded directly via <script src> on every character page, never
  // bundled through Vite/dist. With register() gone, every one of those five scripts threw an
  // uncaught TypeError on every single page load - and for session-system.js/trade-reports.js
  // specifically, the crash landed BEFORE their own export line, so window.TradeJournalSessions
  // and window.TradeJournalTradeReports were never defined at all (breaking, among other things,
  // the Pattern/Strategy Report tabs that call into TradeJournalTradeReports.patternSummary()).
  // Restoring register() as a real, harmless no-op is safe, not a partial revert of the Phase 8d
  // deletion: render()'s panel-grid branch never reads registered panel data any more either way
  // (see its own comment above), so a no-op here is behaviorally identical to what these five
  // files already silently got the moment that branch was rewritten - it just no longer crashes.
  function register() {}
  const observer=new MutationObserver(function(){document.querySelectorAll('[data-panel-label]').forEach(function(el){el.textContent=copy().settings;});syncRank();syncMarketClocks();if(['dashboard','sessions','strategies','settings'].indexOf(currentView)>-1)render(currentView);});observer.observe(root,{attributes:true,attributeFilter:['lang']});
  document.querySelectorAll('[data-panel-label]').forEach(function(el){el.textContent=copy().settings;});
  syncRank(); syncMarketClocks(); window.setInterval(syncMarketClocks,30000);
  window.TradeJournalPanelLayer={character:character,theme:theme,show:showCustom,render:render,register:register};
}());
