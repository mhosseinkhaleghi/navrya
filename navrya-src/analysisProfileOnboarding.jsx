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
const SPECIAL_STYLE_IDS = ['general_analysis', 'hybrid', 'custom_method'];

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
    titleFirstRun: 'پروفایل تحلیلی خودت را بساز', titleCreate: 'پروفایل تحلیل جدید', titleEdit: 'ویرایش پروفایل تحلیل'
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
    titleFirstRun: 'أنشئ ملفك التحليلي', titleCreate: 'ملف تحليل جديد', titleEdit: 'تعديل ملف التحليل'
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
    titleFirstRun: 'Set up your Analysis Profile', titleCreate: 'New Analysis Profile', titleEdit: 'Edit Analysis Profile'
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
    titleFirstRun: 'Configura tu perfil de análisis', titleCreate: 'Nuevo perfil de análisis', titleEdit: 'Editar perfil de análisis'
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

function DnaPreview({ lang, primaryStyleId, secondaryStyleIds, focusIds, name }) {
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
          {focusList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <SectionLabel>{tr(lang, 'dnaFocus')}</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {focusList.map((f) => (
                  <span key={f.id} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 999, background: 'rgba(3,8,7,.4)', border: '1px solid var(--border-hairline)', color: 'var(--text-primary)' }}>
                    {f.name[lang] || f.name.en}
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
      isDefault: seed ? seed.isDefault : undefined
    };
  }

  // The real primary button and AI submit share this exact completion handler. The registration
  // below only writes the controlled state this component already owns; persistence remains in
  // AnalysisProfilesTab's existing onComplete path.
  function complete() { return onComplete(buildDraft()); }
  completeRef.current = complete;

  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
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
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'selectedCount', { n: focusIds.length })}</span>

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

          <DnaPreview lang={activeLang} primaryStyleId={primaryStyleId} secondaryStyleIds={secondaryStyleIds} focusIds={focusIds} name={name} />
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
