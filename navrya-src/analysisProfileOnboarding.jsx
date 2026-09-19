import React from 'react';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). The exact TWO-step questionnaire the
// brief specifies - Step 1 "how do you read the market" (style), Step 2 "what do your eyes look
// for first" (focus) - and nothing else. There is deliberately NO third question anywhere in this
// file about AI freedom/strictness/creativity; that belongs to a future per-analysis-request
// feature, never to the Analysis Profile itself (see analysis-context.js's header comment).
//
// Reused for two real call sites, both real data flows through window.TradeJournalAnalysisProfile
// Store / the two registries, never a local mock:
//   - mode:'first-run'  - character-app.jsx mounts this once, gated on the user having zero
//     profiles yet (see that file's own mount() addition).
//   - mode:'create'/'edit' - analysisProfilesView.jsx's own "New profile"/"Edit" actions.

const FEATURED_STYLE_IDS = ['price_action', 'classical_ta', 'smc', 'liquidity_analysis', 'ichimoku', 'wyckoff', 'elliott_wave', 'order_flow'];
// Exported: analysisProfilesView.jsx's inline Setup tab filters the same three special ids out of its
// secondary-style dropdown, and must never keep a second, driftable copy of this list.
export const SPECIAL_STYLE_IDS = ['general_analysis', 'hybrid', 'custom_method'];

const copy = {
  fa: {
    step: 'مرحله {n} از ۲',
    step1Title: 'تو بازار را چطور می‌خوانی؟', step1Subtitle: 'لنزی را انتخاب کن که معمولاً با آن چارت را بررسی می‌کنی.',
    step2Title: 'وقتی چارت را باز می‌کنی، چشمت اول دنبال چیست؟', step2Subtitle: 'حوزه‌های تمرکزی را انتخاب کن که معمولاً اول بررسی می‌کنی (معمولاً ۳ تا ۶ مورد کافی است).',
    viewAll: 'مشاهده همه سبک‌های تحلیل', hideAll: 'بستن فهرست کامل',
    moreWays: 'راه‌های دیگر برای شروع',
    hybridPrimary: 'لنز اصلی را انتخاب کن', hybridSecondary: 'حداکثر دو لنز مکمل (اختیاری)',
    backToStyles: 'بازگشت به سبک‌ها',
    customNotesLabel: 'روش خودت را کوتاه توضیح بده', customNotesPlaceholder: 'روش تحلیل خودت را در چند جمله بنویس…', customNotesHint: 'برای «روش سفارشی» نوشتن چند جمله لازم است.',
    recommended: 'پیشنهادی برای سبک تو', more: 'حوزه‌های تمرکز بیشتر',
    selectedCount: '{n} مورد انتخاب شده',
    dnaLabel: 'دی‌ان‌ای تحلیلی شما', dnaPrimary: 'لنز اصلی', dnaSecondary: 'لنزهای مکمل', dnaFocus: 'تمرکز اصلی', dnaEmpty: 'با انتخاب یک سبک، پیش‌نمایش اینجا ساخته می‌شود.',
    nameLabel: 'نام پروفایل',
    back: 'بازگشت', next: 'بعدی', create: 'ایجاد پروفایل تحلیل', setUpLater: 'بعداً تنظیم می‌کنم', cancel: 'انصراف',
    customModePrimaryLabel: 'روش سفارشی',
    titleFirstRun: 'پروفایل تحلیلی خودت را بساز', titleCreate: 'پروفایل تحلیل جدید', titleEdit: 'ویرایش پروفایل تحلیل',
    styleSearchPlaceholder: 'جستجوی سبک تحلیل…', styleSearchEmpty: 'سبکی با این نام پیدا نشد.',
    customLinksLabel: 'مواد آموزشی (اختیاری)', customLinksHint: 'اگر پر نکنی مشکلی نیست — بعداً هم می‌توانی اضافه کنی.',
    customLinksYoutube: 'لینک ویدیوی یوتیوب', customLinksWebsite: 'لینک وب‌سایت آموزشی', customLinksReference: 'لینک مرجع دیگر',
    customLinksInvalid: 'این یک لینک معتبر نیست.', customLinksNotYoutube: 'این یک لینک یوتیوب معتبر نیست.',
    addOwnFocusLabel: 'حوزه تمرکز خودت را اضافه کن', addOwnFocusNamePlaceholder: 'مثلاً: سطح‌های سوییپ‌شده',
    addOwnFocusDescriptionPlaceholder: 'توضیح کوتاه (اختیاری)', addOwnFocusButton: 'افزودن', yourOwnFocuses: 'حوزه‌های تمرکز خودت',
    aiSuggestButton: 'پیشنهاد بیشتر با هوش مصنوعی', aiSuggestLoading: 'در حال ساخت پیشنهاد…', aiSuggestBadge: 'AI',
    aiSuggestAdd: 'افزودن', aiSuggestErrorBalance: 'موجودی کافی نیست.', aiSuggestErrorGeneric: 'ساخت پیشنهاد ممکن نشد. دوباره تلاش کن.',
    aiSuggestHint: 'این کار از توکن هوش مصنوعی استفاده می‌کند — با کلید API خودت رایگان است.'
  },
  ar: {
    step: 'الخطوة {n} من ٢',
    step1Title: 'كيف تقرأ السوق؟', step1Subtitle: 'اختر العدسة التي تستخدمها عادة لقراءة الرسم البياني.',
    step2Title: 'عندما تفتح الرسم البياني، ما أول ما تبحث عنه عينك؟', step2Subtitle: 'اختر مجالات التركيز التي تبحث عنها عادة أولاً (٣ إلى ٦ عناصر عادة كافية).',
    viewAll: 'عرض كل أنماط التحليل', hideAll: 'إغلاق القائمة الكاملة',
    moreWays: 'طرق أخرى للبدء',
    hybridPrimary: 'اختر العدسة الأساسية', hybridSecondary: 'حتى عدستين إضافيتين (اختياري)',
    backToStyles: 'العودة إلى الأنماط',
    customNotesLabel: 'اشرح منهجك باختصار', customNotesPlaceholder: 'اكتب منهجك التحليلي في بضع جمل…', customNotesHint: '"المنهج المخصص" يحتاج بضع جمل هنا.',
    recommended: 'موصى به لنمطك', more: 'مجالات تركيز إضافية',
    selectedCount: '{n} محدد',
    dnaLabel: 'الحمض النووي التحليلي الخاص بك', dnaPrimary: 'العدسة الأساسية', dnaSecondary: 'العدسات المكملة', dnaFocus: 'التركيز الأساسي', dnaEmpty: 'سيظهر المعاينة هنا بعد اختيار نمط.',
    nameLabel: 'اسم الملف',
    back: 'رجوع', next: 'التالي', create: 'إنشاء ملف تحليل', setUpLater: 'سأقوم بذلك لاحقاً', cancel: 'إلغاء',
    customModePrimaryLabel: 'منهج مخصص',
    titleFirstRun: 'أنشئ ملفك التحليلي', titleCreate: 'ملف تحليل جديد', titleEdit: 'تعديل ملف التحليل',
    styleSearchPlaceholder: 'ابحث عن نمط تحليل…', styleSearchEmpty: 'لم يُعثر على نمط بهذا الاسم.',
    customLinksLabel: 'مواد تعليمية (اختياري)', customLinksHint: 'لا بأس إن تركتها فارغة - يمكنك إضافتها لاحقاً.',
    customLinksYoutube: 'رابط فيديو يوتيوب', customLinksWebsite: 'رابط موقع تعليمي', customLinksReference: 'رابط مرجعي آخر',
    customLinksInvalid: 'هذا الرابط غير صالح.', customLinksNotYoutube: 'هذا ليس رابط يوتيوب صالحاً.',
    addOwnFocusLabel: 'أضف مجال تركيز خاص بك', addOwnFocusNamePlaceholder: 'مثال: مستويات تم اكتساحها',
    addOwnFocusDescriptionPlaceholder: 'وصف قصير (اختياري)', addOwnFocusButton: 'إضافة', yourOwnFocuses: 'مجالات تركيزك الخاصة',
    aiSuggestButton: 'اقتراح المزيد بالذكاء الاصطناعي', aiSuggestLoading: 'جارٍ إنشاء الاقتراحات…', aiSuggestBadge: 'AI',
    aiSuggestAdd: 'إضافة', aiSuggestErrorBalance: 'الرصيد غير كافٍ.', aiSuggestErrorGeneric: 'تعذّر إنشاء الاقتراحات. حاول مجدداً.',
    aiSuggestHint: 'يستخدم هذا رموز الذكاء الاصطناعي - مجاني إذا استخدمت مفتاح API الخاص بك.'
  },
  en: {
    step: 'Step {n} of 2',
    step1Title: 'How do you read the market?', step1Subtitle: 'Pick the lens you usually use to read a chart.',
    step2Title: 'What do your eyes look for first?', step2Subtitle: 'Pick the focus areas you usually check first (about 3-6 is plenty).',
    viewAll: 'View all analysis styles', hideAll: 'Hide full list',
    moreWays: 'Other ways to start',
    hybridPrimary: 'Pick your primary lens', hybridSecondary: 'Up to two secondary lenses (optional)',
    backToStyles: 'Back to styles',
    customNotesLabel: 'Briefly describe your method', customNotesPlaceholder: 'Describe your own analysis method in a few sentences…', customNotesHint: 'Custom Method needs a short note here.',
    recommended: 'Recommended for your style', more: 'More focus areas',
    selectedCount: '{n} selected',
    dnaLabel: 'YOUR ANALYSIS DNA', dnaPrimary: 'Primary Lens', dnaSecondary: 'Secondary Lens', dnaFocus: 'Core Focus', dnaEmpty: 'Pick a style to build the preview here.',
    nameLabel: 'Profile name',
    back: 'Back', next: 'Next', create: 'Create Analysis Profile', setUpLater: 'Set up later', cancel: 'Cancel',
    customModePrimaryLabel: 'Custom Method',
    titleFirstRun: 'Set up your Analysis Profile', titleCreate: 'New Analysis Profile', titleEdit: 'Edit Analysis Profile',
    styleSearchPlaceholder: 'Search analysis styles…', styleSearchEmpty: 'No style matched that search.',
    customLinksLabel: 'Teaching material (optional)', customLinksHint: "It's fine to leave these empty - you can add them later.",
    customLinksYoutube: 'YouTube video link', customLinksWebsite: 'Educational website link', customLinksReference: 'Another reference link',
    customLinksInvalid: 'That is not a valid link.', customLinksNotYoutube: 'That is not a valid YouTube link.',
    addOwnFocusLabel: 'Add your own focus area', addOwnFocusNamePlaceholder: 'e.g. Swept liquidity levels',
    addOwnFocusDescriptionPlaceholder: 'Short description (optional)', addOwnFocusButton: 'Add', yourOwnFocuses: 'Your own focus areas',
    aiSuggestButton: 'Suggest more with AI', aiSuggestLoading: 'Generating suggestions…', aiSuggestBadge: 'AI',
    aiSuggestAdd: 'Add', aiSuggestErrorBalance: 'Insufficient balance.', aiSuggestErrorGeneric: "Couldn't generate suggestions. Try again.",
    aiSuggestHint: 'This uses AI tokens - free if you use your own API key.'
  },
  es: {
    step: 'Paso {n} de 2',
    step1Title: '¿Cómo lees el mercado?', step1Subtitle: 'Elige el lente que sueles usar para leer un gráfico.',
    step2Title: '¿Qué buscan primero tus ojos al abrir el gráfico?', step2Subtitle: 'Elige las áreas de enfoque que sueles revisar primero (3-6 suele ser suficiente).',
    viewAll: 'Ver todos los estilos de análisis', hideAll: 'Ocultar lista completa',
    moreWays: 'Otras formas de empezar',
    hybridPrimary: 'Elige tu lente principal', hybridSecondary: 'Hasta dos lentes secundarios (opcional)',
    backToStyles: 'Volver a los estilos',
    customNotesLabel: 'Describe brevemente tu método', customNotesPlaceholder: 'Describe tu propio método de análisis en unas frases…', customNotesHint: 'El método personalizado necesita una breve nota aquí.',
    recommended: 'Recomendado para tu estilo', more: 'Más áreas de enfoque',
    selectedCount: '{n} seleccionados',
    dnaLabel: 'TU ADN DE ANÁLISIS', dnaPrimary: 'Lente principal', dnaSecondary: 'Lente secundario', dnaFocus: 'Enfoque principal', dnaEmpty: 'Elige un estilo para construir la vista previa aquí.',
    nameLabel: 'Nombre del perfil',
    back: 'Atrás', next: 'Siguiente', create: 'Crear perfil de análisis', setUpLater: 'Configurar más tarde', cancel: 'Cancelar',
    customModePrimaryLabel: 'Método personalizado',
    titleFirstRun: 'Configura tu perfil de análisis', titleCreate: 'Nuevo perfil de análisis', titleEdit: 'Editar perfil de análisis',
    styleSearchPlaceholder: 'Buscar estilos de análisis…', styleSearchEmpty: 'Ningún estilo coincide con esa búsqueda.',
    customLinksLabel: 'Material educativo (opcional)', customLinksHint: 'Puedes dejarlo vacío y añadirlo más tarde.',
    customLinksYoutube: 'Enlace de vídeo de YouTube', customLinksWebsite: 'Enlace de sitio web educativo', customLinksReference: 'Otro enlace de referencia',
    customLinksInvalid: 'Ese enlace no es válido.', customLinksNotYoutube: 'Ese no es un enlace válido de YouTube.',
    addOwnFocusLabel: 'Añade tu propia área de enfoque', addOwnFocusNamePlaceholder: 'p. ej.: Niveles de liquidez barridos',
    addOwnFocusDescriptionPlaceholder: 'Descripción breve (opcional)', addOwnFocusButton: 'Añadir', yourOwnFocuses: 'Tus propias áreas de enfoque',
    aiSuggestButton: 'Sugerir más con IA', aiSuggestLoading: 'Generando sugerencias…', aiSuggestBadge: 'IA',
    aiSuggestAdd: 'Añadir', aiSuggestErrorBalance: 'Saldo insuficiente.', aiSuggestErrorGeneric: 'No se pudieron generar sugerencias. Inténtalo de nuevo.',
    aiSuggestHint: 'Esto usa tokens de IA - gratis si usas tu propia clave API.'
  }
};

function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}

function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }
function focusRegistry() { return window.TradeJournalAnalysisFocusRegistry; }

function SelectableCard({ selected, onClick, title, subtitle, icon }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={selected} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'start', padding: '14px 16px', borderRadius: 10,
        cursor: 'pointer', width: '100%', boxSizing: 'border-box',
        border: '2px solid ' + (selected ? 'var(--char-accent)' : 'var(--border-hairline)'),
        background: selected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)',
        boxShadow: selected ? '0 0 14px var(--char-glow)' : 'none',
        transition: 'border-color var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out)'
      }}
    >
      {icon && (
        <span style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', color: selected ? 'var(--char-accent)' : 'var(--text-muted)', background: 'rgba(3,8,7,.5)' }}>
          <Icon name={icon} size={16} />
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: selected ? 'var(--char-accent)' : 'var(--text-primary)' }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--text-dim)' }}>{subtitle}</span>}
      </span>
      {selected && <span style={{ marginInlineStart: 'auto', color: 'var(--char-accent)', flex: 'none' }}><Icon name="check" size={16} /></span>}
    </button>
  );
}

function FocusChip({ selected, onClick, label }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={selected} onClick={onClick}
      style={{
        height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 12.5,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        border: '1px solid ' + (selected ? 'var(--char-accent)' : 'var(--border-gold)'),
        background: selected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.6)',
        color: selected ? 'var(--char-accent)' : 'var(--text-muted)', fontWeight: selected ? 600 : 500
      }}
    >
      {selected && <Icon name="check" size={13} />}
      {label}
    </button>
  );
}

function SectionLabel({ children }) {
  return <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>{children}</span>;
}

function DnaPreview({ lang, primaryStyleId, secondaryStyleIds, focusIds, customFocuses, name }) {
  const styles = styleRegistry(), focuses = focusRegistry();
  const primary = styles ? styles.get(primaryStyleId) : null;
  const secondaries = (secondaryStyleIds || []).map((id) => (styles ? styles.get(id) : null)).filter(Boolean);
  const focusList = (focusIds || []).map((id) => (focuses ? focuses.get(id) : null)).filter(Boolean);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 12,
      border: '1px solid var(--border-gold)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)'
    }}>
      <SectionLabel>{tr(lang, 'dnaLabel')}</SectionLabel>
      {!primary ? (
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'dnaEmpty')}</span>
      ) : (
        <React.Fragment>
          <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--parchment)' }}>{name || (primary.name[lang] || primary.name.en)}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SectionLabel>{tr(lang, 'dnaPrimary')}</SectionLabel>
              <span style={{ fontSize: 13, color: 'var(--char-accent)', fontWeight: 600 }}>{primary.name[lang] || primary.name.en}</span>
            </div>
            {secondaries.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <SectionLabel>{tr(lang, 'dnaSecondary')}</SectionLabel>
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{secondaries.map((s) => s.name[lang] || s.name.en).join(' + ')}</span>
              </div>
            )}
          </div>
          {(focusList.length > 0 || (customFocuses || []).length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <SectionLabel>{tr(lang, 'dnaFocus')}</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {focusList.map((f) => (
                  <span key={f.id} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, background: 'rgba(3,8,7,.4)', border: '1px solid var(--border-hairline)', color: 'var(--text-primary)' }}>
                    {f.name[lang] || f.name.en}
                  </span>
                ))}
                {(customFocuses || []).map((f) => (
                  <span key={f.id} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, background: 'rgba(3,8,7,.4)', border: '1px solid var(--char-accent)', color: 'var(--char-accent)' }}>
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

function StepDots({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {[1, 2].map((n) => (
        <span key={n} style={{
          width: n === step ? 22 : 8, height: 8, borderRadius: 999, transition: 'width var(--dur-hover) var(--ease-out)',
          background: n <= step ? 'var(--char-accent)' : 'var(--border-hairline)'
        }} />
      ))}
    </div>
  );
}

export function AnalysisProfileOnboarding({ mode = 'first-run', existingProfile, lang, onComplete, onSkip, onCancel }) {
  const activeLang = lang || (typeof document !== 'undefined' ? document.documentElement.lang : 'en') || 'en';
  const rtl = activeLang === 'fa' || activeLang === 'ar';
  const styles = styleRegistry(), focuses = focusRegistry();

  const seed = existingProfile || null;
  const [step, setStep] = React.useState(1);
  const [primaryStyleId, setPrimaryStyleId] = React.useState(seed ? seed.primaryStyleId : '');
  const [secondaryStyleIds, setSecondaryStyleIds] = React.useState(seed ? seed.secondaryStyleIds || [] : []);
  const [hybridMode, setHybridMode] = React.useState(Boolean(seed && (seed.secondaryStyleIds || []).length));
  const [showAllStyles, setShowAllStyles] = React.useState(false);
  const [customMethodNotes, setCustomMethodNotes] = React.useState(seed ? seed.customMethodNotes || '' : '');
  const [focusIds, setFocusIds] = React.useState(seed ? seed.focusIds || [] : []);
  const [name, setName] = React.useState(seed ? seed.name || '' : '');
  const [nameTouched, setNameTouched] = React.useState(Boolean(seed && seed.name));
  const [styleQuery, setStyleQuery] = React.useState('');
  const seedLinks = seed && seed.customMethodLinks;
  const [youtubeUrl, setYoutubeUrl] = React.useState(seedLinks ? seedLinks.youtubeUrl || '' : '');
  const [websiteUrl, setWebsiteUrl] = React.useState(seedLinks ? seedLinks.websiteUrl || '' : '');
  const [referenceUrl, setReferenceUrl] = React.useState(seedLinks ? seedLinks.referenceUrl || '' : '');
  const [customFocuses, setCustomFocuses] = React.useState(seed ? seed.customFocuses || [] : []);
  const [newFocusName, setNewFocusName] = React.useState('');
  const [newFocusDescription, setNewFocusDescription] = React.useState('');
  const [aiSuggestions, setAiSuggestions] = React.useState([]);
  const [aiSuggestLoading, setAiSuggestLoading] = React.useState(false);
  const [aiSuggestError, setAiSuggestError] = React.useState('');
  const stepRef = React.useRef(step);
  const completeRef = React.useRef(null);
  stepRef.current = step;

  React.useEffect(() => {
    if (nameTouched) return;
    const suggested = window.TradeJournalAnalysisProfileStore ? window.TradeJournalAnalysisProfileStore.suggestedName(primaryStyleId, focusIds, activeLang) : '';
    if (suggested) setName(suggested);
  }, [primaryStyleId, focusIds, activeLang, nameTouched]);

  const allStyles = styles ? styles.list() : [];
  const browsableStyles = allStyles.filter((s) => SPECIAL_STYLE_IDS.indexOf(s.id) === -1);
  const featured = FEATURED_STYLE_IDS.map((id) => styles && styles.get(id)).filter(Boolean);
  const special = SPECIAL_STYLE_IDS.map((id) => styles && styles.get(id)).filter(Boolean);
  const trimmedStyleQuery = styleQuery.trim();
  // A non-empty search flattens featured/full-list/special into one ranked result set (the
  // registry's own search() already orders a name match ahead of a description-only one) - see
  // analysis-style-registry.js's own header comment for the ranking rule.
  const styleSearchResults = trimmedStyleQuery && styles ? styles.search(trimmedStyleQuery) : null;

  function pickPrimary(id) {
    if (id === 'hybrid') { setHybridMode(true); setPrimaryStyleId(''); setSecondaryStyleIds([]); return; }
    setHybridMode(false);
    setPrimaryStyleId(id);
    setSecondaryStyleIds([]);
    if (id !== 'custom_method') setCustomMethodNotes('');
  }
  function pickHybridPrimary(id) {
    setPrimaryStyleId(id);
    setSecondaryStyleIds((prev) => prev.filter((sid) => sid !== id));
  }
  function toggleSecondary(id) {
    setSecondaryStyleIds((prev) => {
      if (prev.indexOf(id) > -1) return prev.filter((sid) => sid !== id);
      if (prev.length >= 2) return prev;
      return prev.concat(id);
    });
  }
  function toggleFocus(id) {
    setFocusIds((prev) => (prev.indexOf(id) > -1 ? prev.filter((fid) => fid !== id) : prev.concat(id)));
  }

  // Custom focus areas (071_analysis_profile_authoring.sql) - a trader's own wording, kept in a
  // SEPARATE list from focusIds (which only ever hold Focus Registry ids). Both the manual
  // "+ Add your own" form and an accepted AI suggestion go through this one function, so the two
  // paths can never diverge on validation.
  const helpers = window.TradeJournalAnalysisProfileStore && window.TradeJournalAnalysisProfileStore.helpers;
  function addCustomFocus(nameValue, descriptionValue, origin) {
    if (!helpers) return;
    const made = helpers.makeCustomFocus({ name: nameValue, description: descriptionValue, origin: origin || 'user' });
    if (!made) return;
    setCustomFocuses((prev) => (prev.some((f) => helpers.foldFocusName(f.name) === helpers.foldFocusName(made.name)) ? prev : prev.concat(made)));
  }
  function submitNewCustomFocus() {
    if (!newFocusName.trim()) return;
    addCustomFocus(newFocusName, newFocusDescription, 'user');
    setNewFocusName(''); setNewFocusDescription('');
  }
  function removeCustomFocus(id) {
    setCustomFocuses((prev) => prev.filter((f) => f.id !== id));
  }

  // "Suggest more with AI" (regenerate) - a real, billed AI call (server/pattern-ai-server.mjs's
  // suggestAnalysisProfile(), see AI_BILLED_ROUTES). Never falls back to a fake local suggestion on
  // failure (analysis-profile-ai.js's own header comment) - a real error (e.g. insufficient wallet
  // balance) is shown honestly instead. Suggestions are proposals only: nothing is added to the
  // profile until the trader explicitly clicks "Add" on one.
  const alreadyFocusNames = React.useMemo(() => {
    const registryNames = focusIds.map((id) => { const f = focuses ? focuses.get(id) : null; return f ? (f.name[activeLang] || f.name.en) : null; }).filter(Boolean);
    return registryNames.concat(customFocuses.map((f) => f.name));
  }, [focusIds, customFocuses, focuses, activeLang]);
  async function regenerateFocusSuggestions() {
    const client = window.TradeJournalAnalysisProfileAI;
    if (!client || aiSuggestLoading) return;
    setAiSuggestLoading(true);
    setAiSuggestError('');
    try {
      const result = await client.suggestFocuses({
        primaryStyleId, secondaryStyleIds, customMethodNotes, language: activeLang,
        alreadySelected: alreadyFocusNames, alreadySuggested: aiSuggestions.map((s) => s.name)
      });
      setAiSuggestions((prev) => prev.concat(result.suggestions));
    } catch (error) {
      setAiSuggestError(error && error.code === 'WALLET_INSUFFICIENT_BALANCE' ? tr(activeLang, 'aiSuggestErrorBalance') : tr(activeLang, 'aiSuggestErrorGeneric'));
    } finally {
      setAiSuggestLoading(false);
    }
  }
  function acceptAiSuggestion(suggestion) {
    addCustomFocus(suggestion.name, suggestion.description, 'ai');
    setAiSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  const isCustom = primaryStyleId === 'custom_method';
  const customNotesOk = !isCustom || customMethodNotes.trim().length >= 8;
  const step1Valid = Boolean(primaryStyleId) && customNotesOk;

  const focusGroups = React.useMemo(() => {
    if (!primaryStyleId) return { recommended: [], optional: [] };
    if (isCustom) {
      const all = focuses ? focuses.list() : [];
      return { recommended: [], optional: all };
    }
    if (!styles) return { recommended: [], optional: [] };
    const merged = styles.mergeFocusRecommendations(primaryStyleId, secondaryStyleIds);
    return {
      recommended: merged.recommended.map((id) => focuses.get(id)).filter(Boolean),
      optional: merged.optional.map((id) => focuses.get(id)).filter(Boolean)
    };
  }, [primaryStyleId, secondaryStyleIds, isCustom, styles, focuses]);

  function buildDraft() {
    return {
      id: seed ? seed.id : undefined,
      name: name.trim() || (window.TradeJournalAnalysisProfileStore ? window.TradeJournalAnalysisProfileStore.suggestedName(primaryStyleId, focusIds, activeLang) : ''),
      primaryStyleId, secondaryStyleIds, focusIds, customMethodNotes,
      customMethodLinks: { youtubeUrl, websiteUrl, referenceUrl }, customFocuses,
      isDefault: seed ? seed.isDefault : undefined
    };
  }

  // The real primary button and AI submit share this exact completion handler. The registration
  // below only writes the controlled state this component already owns; persistence remains in
  // AnalysisProfilesTab's existing onComplete path.
  function complete() { return onComplete(buildDraft()); }
  completeRef.current = complete;

  // Voice/Chat form-interview workflow upgrade: read fresh on every render (the same established
  // stale-closure fix as accountsView.jsx's manRef) so the registration effect's own interview
  // visibleWhen closures - built once and never re-created (see the effect's own [] deps) - always
  // see the CURRENT hybridMode/primaryStyleId, not whatever they were when this effect last ran.
  const uiStateRef = React.useRef({ hybridMode, primaryStyleId });
  uiStateRef.current = { hybridMode, primaryStyleId };

  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    // Voice/Chat form-interview workflow upgrade: the canonical interview field list, in the
    // form's own real two-step order (Step 1: primary style -> secondary lenses [hybrid only] ->
    // custom-method notes [custom method only]; Step 2: focus areas -> profile name), matching
    // profile.analysis.create's own requiredFields (primaryStyleId/focusIds/name) plus its
    // optionalFields (secondaryStyleIds/customMethodNotes) exactly - see character-app.jsx. `order`
    // follows stepForPath's own step*100 scheme below so it can never contradict the real step map.
    // primaryStyleId/secondaryStyleIds/focusIds options are read from the same real
    // allStyles/browsableStyles/focuses catalogs the cards/chips themselves render from - never a
    // second, invented list. There is no `gate` field here: profile.analysis.create/edit have no
    // gateField (character-app.jsx) - the workflow engine's own submit() is reached once the
    // required fields are known, not through a synthetic confirmation field.
    const analysisProfileInterviewFields = [
      { path: 'primaryStyleId', order: 101, label: tr(activeLang, 'step1Title'), type: 'choice', options: allStyles.map((st) => ({ value: st.id, label: st.name[activeLang] || st.name.en })), role: 'editable' },
      {
        path: 'secondaryStyleIds', order: 102, label: tr(activeLang, 'hybridSecondary'), type: 'choice',
        options: browsableStyles.map((st) => ({ value: st.id, label: st.name[activeLang] || st.name.en })), role: 'editable',
        visibleWhen: () => uiStateRef.current.hybridMode && !!uiStateRef.current.primaryStyleId
      },
      {
        path: 'customMethodNotes', order: 103, label: tr(activeLang, 'customNotesLabel'), help: tr(activeLang, 'customNotesHint'), type: 'text', role: 'editable',
        visibleWhen: () => uiStateRef.current.primaryStyleId === 'custom_method'
      },
      { path: 'focusIds', order: 201, label: tr(activeLang, 'step2Title'), type: 'choice', options: (focuses ? focuses.list() : []).map((f) => ({ value: f.id, label: f.name[activeLang] || f.name.en })), role: 'editable' },
      { path: 'name', order: 202, label: tr(activeLang, 'nameLabel'), type: 'text', role: 'editable' }
    ];
    registry.register('analysis-profile-editor', {
      layer: 'foreground', actionId: mode === 'edit' ? 'profile.analysis.edit' : 'profile.analysis.create',
      allowlist: ['primaryStyleId', 'secondaryStyleIds', 'customMethodNotes', 'focusIds', 'name'],
      isOpen: () => mounted,
      activeStep: () => stepRef.current,
      stepForPath: (path) => {
        if (path === 'primaryStyleId' || path === 'secondaryStyleIds' || path === 'customMethodNotes') return 1;
        if (path === 'focusIds' || path === 'name') return 2;
        return null;
      },
      goToStep: (nextStep) => setStep(Number(nextStep) === 2 ? 2 : 1),
      interview: { fields: analysisProfileInterviewFields },
      validateValue: (path, value) => {
        const hasStyle = (id) => !!(styles && styles.get && styles.get(id));
        const hasFocus = (id) => !!(focuses && focuses.get && focuses.get(id));
        if (path === 'primaryStyleId') return hasStyle(value);
        if (path === 'secondaryStyleIds') return Array.isArray(value) && value.length <= 2 && value.every(hasStyle);
        if (path === 'focusIds') return Array.isArray(value) && value.every(hasFocus);
        return true;
      },
      applyValue: (path, value) => {
        if (path === 'primaryStyleId') { pickPrimary(value); return; }
        if (path === 'secondaryStyleIds') {
          setHybridMode(value.length > 0);
          setSecondaryStyleIds(value.slice(0, 2));
          return;
        }
        if (path === 'customMethodNotes') { setCustomMethodNotes(String(value || '')); return; }
        if (path === 'focusIds') { setFocusIds(value.slice()); return; }
        if (path === 'name') { setName(String(value || '')); setNameTouched(true); }
      },
      submit: () => completeRef.current()
    });
    return () => { mounted = false; };
    // style/focus registries are stable page-level catalogs; state setters are React-stable.
  }, []);

  function handleClose() {
    if (mode === 'first-run') { if (onSkip) onSkip(); }
    else if (onCancel) onCancel();
  }

  const body = (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(activeLang, 'step', { n: step })}</span>
        <StepDots step={step} />
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--parchment)' }}>{tr(activeLang, 'step1Title')}</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{tr(activeLang, 'step1Subtitle')}</p>
          </div>

          {!hybridMode ? (
            <React.Fragment>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', maxWidth: 420 }}>
                <Icon name="search" size={16} style={{ color: 'var(--text-dim)' }} />
                <input type="text" value={styleQuery} onChange={(e) => setStyleQuery(e.target.value)} placeholder={tr(activeLang, 'styleSearchPlaceholder')} dir="auto"
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
              </label>

              {styleSearchResults ? (
                styleSearchResults.length ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                    {styleSearchResults.map((st) => (
                      <SelectableCard key={st.id} selected={primaryStyleId === st.id} onClick={() => pickPrimary(st.id)}
                        title={st.name[activeLang] || st.name.en} subtitle={st.shortDescription[activeLang] || st.shortDescription.en}
                        icon={st.id === 'hybrid' ? 'sparkle' : st.id === 'custom_method' ? 'edit' : st.id === 'general_analysis' ? 'globe' : undefined} />
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'styleSearchEmpty')}</span>
                )
              ) : (
                <React.Fragment>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                    {featured.map((st) => (
                      <SelectableCard key={st.id} selected={primaryStyleId === st.id} onClick={() => pickPrimary(st.id)}
                        title={st.name[activeLang] || st.name.en} subtitle={st.shortDescription[activeLang] || st.shortDescription.en} icon="execution" />
                    ))}
                  </div>

                  <button type="button" onClick={() => setShowAllStyles((v) => !v)} style={{
                    alignSelf: 'flex-start', background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--char-accent)', font: 'inherit'
                  }}>
                    <Icon name={showAllStyles ? 'collapse' : 'expand'} size={14} />
                    {tr(activeLang, showAllStyles ? 'hideAll' : 'viewAll')}
                  </button>

                  {showAllStyles && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 260, overflowY: 'auto', padding: '2px 2px 2px 0' }} className="navrya-scroll">
                      {styles.categories().map((cat) => {
                        const items = browsableStyles.filter((s) => s.category === cat.id);
                        if (!items.length) return null;
                        return (
                          <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <SectionLabel>{cat.name[activeLang] || cat.name.en}</SectionLabel>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                              {items.map((st) => (
                                <SelectableCard key={st.id} selected={primaryStyleId === st.id} onClick={() => pickPrimary(st.id)}
                                  title={st.name[activeLang] || st.name.en} subtitle={st.shortDescription[activeLang] || st.shortDescription.en} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SectionLabel>{tr(activeLang, 'moreWays')}</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
                      {special.map((st) => (
                        <SelectableCard key={st.id} selected={primaryStyleId === st.id || (st.id === 'hybrid' && hybridMode)} onClick={() => pickPrimary(st.id)}
                          title={st.name[activeLang] || st.name.en} subtitle={st.shortDescription[activeLang] || st.shortDescription.en}
                          icon={st.id === 'hybrid' ? 'sparkle' : st.id === 'custom_method' ? 'edit' : 'globe'} />
                      ))}
                    </div>
                  </div>
                </React.Fragment>
              )}

              {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(activeLang, 'customNotesLabel')}</label>
                  <textarea
                    value={customMethodNotes} onChange={(e) => setCustomMethodNotes(e.target.value)}
                    placeholder={tr(activeLang, 'customNotesPlaceholder')} dir="auto" rows={3}
                    style={{
                      resize: 'vertical', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-gold)',
                      background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13
                    }}
                  />
                  {!customNotesOk && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(activeLang, 'customNotesHint')}</span>}
                </div>
              )}

              {isCustom && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SectionLabel>{tr(activeLang, 'customLinksLabel')}</SectionLabel>
                  {[
                    ['customLinksYoutube', youtubeUrl, setYoutubeUrl],
                    ['customLinksWebsite', websiteUrl, setWebsiteUrl],
                    ['customLinksReference', referenceUrl, setReferenceUrl]
                  ].map(([labelKey, value, setValue]) => {
                    const invalid = value.trim() && !(helpers && helpers.normalizeHttpUrl(value));
                    const notYoutube = labelKey === 'customLinksYoutube' && value.trim() && !invalid && helpers && !helpers.isYoutubeUrl(value);
                    return (
                      <div key={labelKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(activeLang, labelKey)}</label>
                        <input type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" dir="ltr"
                          style={{
                            height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid ' + (invalid || notYoutube ? 'var(--danger)' : 'var(--border-gold)'),
                            background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5
                          }} />
                        {invalid && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(activeLang, 'customLinksInvalid')}</span>}
                        {notYoutube && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(activeLang, 'customLinksNotYoutube')}</span>}
                      </div>
                    );
                  })}
                  <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'customLinksHint')}</span>
                </div>
              )}
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button type="button" onClick={() => { setHybridMode(false); setPrimaryStyleId(''); setSecondaryStyleIds([]); }} style={{
                alignSelf: 'flex-start', background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)', font: 'inherit'
              }}>
                <Icon name="active-arrow" size={14} style={{ transform: rtl ? 'none' : 'rotate(180deg)' }} />
                {tr(activeLang, 'backToStyles')}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SectionLabel>{tr(activeLang, 'hybridPrimary')}</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                  {browsableStyles.map((st) => (
                    <SelectableCard key={st.id} selected={primaryStyleId === st.id} onClick={() => pickHybridPrimary(st.id)}
                      title={st.name[activeLang] || st.name.en} subtitle={st.shortDescription[activeLang] || st.shortDescription.en} />
                  ))}
                </div>
              </div>
              {primaryStyleId && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <SectionLabel>{tr(activeLang, 'hybridSecondary')}</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
                    {browsableStyles.filter((st) => st.id !== primaryStyleId).map((st) => (
                      <SelectableCard key={st.id} selected={secondaryStyleIds.indexOf(st.id) > -1} onClick={() => toggleSecondary(st.id)}
                        title={st.name[activeLang] || st.name.en} subtitle={st.shortDescription[activeLang] || st.shortDescription.en} />
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          )}
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--parchment)' }}>{tr(activeLang, 'step2Title')}</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{tr(activeLang, 'step2Subtitle')}</p>
          </div>

          {focusGroups.recommended.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SectionLabel>{tr(activeLang, 'recommended')}</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {focusGroups.recommended.map((f) => (
                  <FocusChip key={f.id} selected={focusIds.indexOf(f.id) > -1} onClick={() => toggleFocus(f.id)} label={f.name[activeLang] || f.name.en} />
                ))}
              </div>
            </div>
          )}
          {focusGroups.optional.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SectionLabel>{tr(activeLang, 'more')}</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 168, overflowY: 'auto' }} className="navrya-scroll">
                {focusGroups.optional.map((f) => (
                  <FocusChip key={f.id} selected={focusIds.indexOf(f.id) > -1} onClick={() => toggleFocus(f.id)} label={f.name[activeLang] || f.name.en} />
                ))}
              </div>
            </div>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'selectedCount', { n: focusIds.length + customFocuses.length })}</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SectionLabel>{tr(activeLang, 'addOwnFocusLabel')}</SectionLabel>
            {customFocuses.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {customFocuses.map((f) => (
                  <span key={f.id} title={f.description || ''} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 6px 0 14px', borderRadius: 999,
                    fontSize: 12.5, fontWeight: 600, color: 'var(--char-accent)', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)'
                  }}>
                    {f.origin === 'ai' && <span style={{ fontSize: 9.5, letterSpacing: '.06em', padding: '2px 5px', borderRadius: 5, background: 'rgba(3,8,7,.5)' }}>{tr(activeLang, 'aiSuggestBadge')}</span>}
                    {f.name}
                    <button type="button" onClick={() => removeCustomFocus(f.id)} aria-label={tr(activeLang, 'cancel')} style={{
                      width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: '50%', cursor: 'pointer', border: 0, background: 'transparent', color: 'inherit'
                    }}><Icon name="close" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="text" value={newFocusName} onChange={(e) => setNewFocusName(e.target.value)} dir="auto"
                placeholder={tr(activeLang, 'addOwnFocusNamePlaceholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewCustomFocus(); } }}
                style={{ flex: '1 1 200px', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
              <input type="text" value={newFocusDescription} onChange={(e) => setNewFocusDescription(e.target.value)} dir="auto"
                placeholder={tr(activeLang, 'addOwnFocusDescriptionPlaceholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewCustomFocus(); } }}
                style={{ flex: '1 1 200px', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
              <Button variant="secondary" size="sm" icon="plus" disabled={!newFocusName.trim()} onClick={submitNewCustomFocus}>{tr(activeLang, 'addOwnFocusButton')}</Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <Button variant="ghost" size="sm" icon="sparkle" disabled={!primaryStyleId || aiSuggestLoading} onClick={regenerateFocusSuggestions}>
                {aiSuggestLoading ? tr(activeLang, 'aiSuggestLoading') : tr(activeLang, 'aiSuggestButton')}
              </Button>
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'aiSuggestHint')}</span>
            </div>
            {aiSuggestError && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{aiSuggestError}</span>}
            {aiSuggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {aiSuggestions.map((s) => (
                  <span key={s.name} title={s.description || ''} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 6px 0 12px', borderRadius: 999,
                    fontSize: 12.5, color: 'var(--text-muted)', border: '1px dashed var(--divider-gold)', background: 'rgba(183,138,74,.06)'
                  }}>
                    <span style={{ fontSize: 9.5, letterSpacing: '.06em', padding: '2px 5px', borderRadius: 5, background: 'rgba(3,8,7,.4)', color: 'var(--gold-warm)' }}>{tr(activeLang, 'aiSuggestBadge')}</span>
                    {s.name}
                    <button type="button" onClick={() => acceptAiSuggestion(s)} style={{
                      height: 22, padding: '0 8px', borderRadius: 999, cursor: 'pointer', border: 0, fontSize: 10.5, fontWeight: 600,
                      background: 'var(--char-accent)', color: 'var(--ink-950)'
                    }}>{tr(activeLang, 'aiSuggestAdd')}</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(activeLang, 'nameLabel')}</label>
            <input
              type="text" value={name} dir="auto"
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              style={{
                height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-gold)',
                background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13
              }}
            />
          </div>

          <DnaPreview lang={activeLang} primaryStyleId={primaryStyleId} secondaryStyleIds={secondaryStyleIds} focusIds={focusIds} customFocuses={customFocuses} name={name} />
        </div>
      )}
    </div>
  );

  const footer = (
    <React.Fragment>
      {step === 1 ? (
        <React.Fragment>
          {mode === 'first-run' && <Button variant="ghost" onClick={onSkip}>{tr(activeLang, 'setUpLater')}</Button>}
          {mode !== 'first-run' && <Button variant="ghost" onClick={onCancel}>{tr(activeLang, 'cancel')}</Button>}
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="primary" iconAfter="active-arrow" disabled={!step1Valid} onClick={() => setStep(2)}>{tr(activeLang, 'next')}</Button>
          </span>
        </React.Fragment>
      ) : (
        <React.Fragment>
          <Button variant="ghost" onClick={() => setStep(1)}>{tr(activeLang, 'back')}</Button>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="primary" icon="check" onClick={complete}>{tr(activeLang, 'create')}</Button>
          </span>
        </React.Fragment>
      )}
    </React.Fragment>
  );

  const titleKey = mode === 'first-run' ? 'titleFirstRun' : mode === 'edit' ? 'titleEdit' : 'titleCreate';
  return (
    <Modal
      open title={tr(activeLang, titleKey)} icon="strategies"
      onClose={handleClose} footer={footer} width={860}
      eyebrow={{ left: 'NAVRYA · ANALYSIS PROFILE', right: tr(activeLang, 'step', { n: step }) }}
    >
      {body}
    </Modal>
  );
}
