import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { AnalysisProfileOnboarding, FocusChip } from './analysisProfileOnboarding.jsx';
import { AnalysisDna, LensNotice } from './analysisProfileDna.jsx';
import { SPECIAL_STYLE_IDS, applyLensChange, lensOfProfile, reconcileLens, toggleSecondaryLens } from './analysisProfileLens.js';
import { ConceptsTab } from './analysisProfileConcepts.jsx';
import { MemoryTab } from './analysisProfileMemory.jsx';
import { KnowledgeTab } from './analysisProfileKnowledge.jsx';
import { ChatTab as AnalysisProfileChatTab } from './analysisProfileChat.jsx';
import { PreviewTab } from './analysisProfilePreview.jsx';
import { ProfileReport, UsageSummary } from './analysisProfileReport.jsx';
import { AiReadinessBar } from './analysisProfileAiStatus.jsx';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). List + detail (Overview / Report) for
// the "Analysis Profiles" tab inside strategiesHubView.jsx. Deliberately self-contained: every
// real read/write goes through window.TradeJournalAnalysisProfileStore and the two registries,
// the exact same real stores analysisProfileOnboarding.jsx uses - this file owns no business
// logic of its own beyond presentation, so the whole domain stays movable to a future
// #ai/analysis-profiles route without a rewrite (brief §11/§14 of the "before writing code" plan).
//
// Honesty rule this file follows throughout (brief §12/§17): Sessions carry no
// analysisProfileId yet (deliberately out of scope for this phase - see analysis-context.js's
// header), so a per-profile Session-usage count cannot be truthfully derived. Every place that
// count would appear shows an honest "not available yet" state instead of a fabricated number -
// never a silently-zero placeholder that could be misread as "zero real sessions".

const copy = {
  fa: {
    title: 'پروفایل‌های تحلیل', subtitle: 'هویت تحلیلی تو — این که چطور چارت را می‌خوانی، مستقل از استراتژی و الگو.',
    newProfile: 'پروفایل جدید', searchPlaceholder: 'جستجو در نام یا توضیحات…',
    emptyTitle: 'هنوز پروفایلی ساخته نشده', emptyBody: 'یک پروفایل تحلیل بساز تا NAVRYA بداند معمولاً چطور چارت را می‌خوانی.',
    defaultBadge: 'پیش‌فرض', activeBadge: 'فعال', inactiveBadge: 'غیرفعال',
    focusCount: '{n} حوزه تمرکز', strategyCount: '{n} استراتژی لینک‌شده',
    open: 'باز کردن', edit: 'ویرایش', duplicate: 'کپی', setDefault: 'تنظیم به‌عنوان پیش‌فرض', report: 'گزارش', delete: 'حذف',
    backToList: 'بازگشت به فهرست', tabOverview: 'مرور کلی', tabReport: 'گزارش',
    dnaLabel: 'دی‌ان‌ای تحلیلی', primaryLens: 'لنز اصلی', secondaryLens: 'لنزهای مکمل', coreFocus: 'تمرکز اصلی', customNotes: 'یادداشت روش سفارشی',
    linkedStrategies: 'استراتژی‌های لینک‌شده', noLinkedStrategies: 'هنوز استراتژی‌ای به این پروفایل لینک نشده است.',
    usage: 'استفاده',
    reportCreated: 'تاریخ ایجاد', reportUpdated: 'آخرین بروزرسانی', reportDefault: 'وضعیت پیش‌فرض', reportPrimary: 'سبک اصلی',
    reportSecondary: 'سبک‌های مکمل', reportFocusCount: 'تعداد حوزه‌های تمرکز', reportLinkedStrategies: 'استراتژی‌های لینک‌شده',
    yes: 'بله', no: 'خیر',
    deleteConfirmTitle: 'حذف این پروفایل؟', deleteConfirmBody: 'این پروفایل به‌طور کامل حذف می‌شود. استراتژی‌های لینک‌شده لینک خود را از دست می‌دهند اما حذف نمی‌شوند.',
    cancel: 'انصراف', confirmDelete: 'حذف پروفایل', lastProfileError: 'نمی‌توان تنها پروفایل تحلیل را حذف کرد. ابتدا یک پروفایل دیگر بساز.',
    activeToggleHelp: 'می‌توانی این پروفایل را بدون حذف کردن غیرفعال کنی.', description: 'توضیحات',
    tabConcepts: 'مفاهیم', tabMemory: 'حافظه', tabChat: 'گفتگو', tabPreview: 'پیش‌نمایش', tabKnowledge: 'دانش', tabSetup: 'تنظیمات', setupPrimaryLabel: 'لنز اصلی', setupSecondaryLabel: 'لنزهای مکمل (حداکثر دو مورد)',
    setupFocusLabel: 'حوزه‌های تمرکز', setupCustomFocusLabel: 'حوزه‌های تمرکز خودت',
    setupAddFocusPlaceholder: 'مثلاً: سطح‌های سوییپ‌شده', setupAddFocusDescPlaceholder: 'توضیح کوتاه (اختیاری)', setupAddFocusButton: 'افزودن',
    setupLinksLabel: 'مواد آموزشی', setupYoutubeLabel: 'لینک ویدیوی یوتیوب', setupWebsiteLabel: 'لینک وب‌سایت آموزشی', setupReferenceLabel: 'لینک مرجع دیگر',
    setupLinksHint: 'اگر پر نکنی مشکلی نیست.', setupLinksInvalid: 'این یک لینک معتبر نیست.', setupLinksNotYoutube: 'این یک لینک یوتیوب معتبر نیست.',
    setupNotesLabel: 'یادداشت روش سفارشی', setupSaveButton: 'ذخیره تغییرات', setupSaved: 'تغییرات ذخیره شد.'
  },
  ar: {
    title: 'ملفات التحليل', subtitle: 'هويتك التحليلية — كيف تقرأ الرسم البياني عادةً، بمعزل عن الاستراتيجية والنمط.',
    newProfile: 'ملف جديد', searchPlaceholder: 'ابحث بالاسم أو الوصف…',
    emptyTitle: 'لا يوجد ملف بعد', emptyBody: 'أنشئ ملف تحليل ليعرف NAVRYA كيف تقرأ الرسم البياني عادةً.',
    defaultBadge: 'افتراضي', activeBadge: 'نشط', inactiveBadge: 'غير نشط',
    focusCount: '{n} مجال تركيز', strategyCount: '{n} استراتيجية مرتبطة',
    open: 'فتح', edit: 'تعديل', duplicate: 'نسخ', setDefault: 'تعيين كافتراضي', report: 'تقرير', delete: 'حذف',
    backToList: 'العودة إلى القائمة', tabOverview: 'نظرة عامة', tabReport: 'التقرير',
    dnaLabel: 'الحمض النووي التحليلي', primaryLens: 'العدسة الأساسية', secondaryLens: 'العدسات المكملة', coreFocus: 'التركيز الأساسي', customNotes: 'ملاحظة المنهج المخصص',
    linkedStrategies: 'الاستراتيجيات المرتبطة', noLinkedStrategies: 'لا توجد استراتيجية مرتبطة بهذا الملف بعد.',
    usage: 'الاستخدام',
    reportCreated: 'تاريخ الإنشاء', reportUpdated: 'آخر تحديث', reportDefault: 'الحالة الافتراضية', reportPrimary: 'النمط الأساسي',
    reportSecondary: 'الأنماط المكملة', reportFocusCount: 'عدد مجالات التركيز', reportLinkedStrategies: 'الاستراتيجيات المرتبطة',
    yes: 'نعم', no: 'لا',
    deleteConfirmTitle: 'حذف هذا الملف؟', deleteConfirmBody: 'سيُحذف هذا الملف نهائياً. الاستراتيجيات المرتبطة تفقد ارتباطها لكن لا تُحذف.',
    cancel: 'إلغاء', confirmDelete: 'حذف الملف', lastProfileError: 'لا يمكن حذف ملف التحليل الوحيد. أنشئ ملفاً آخر أولاً.',
    activeToggleHelp: 'يمكنك تعطيل هذا الملف دون حذفه.', description: 'الوصف',
    tabConcepts: 'المفاهيم', tabMemory: 'الذاكرة', tabChat: 'المحادثة', tabPreview: 'المعاينة', tabKnowledge: 'المعرفة', tabSetup: 'الإعدادات', setupPrimaryLabel: 'العدسة الأساسية', setupSecondaryLabel: 'العدسات المكملة (حتى عدستين)',
    setupFocusLabel: 'مجالات التركيز', setupCustomFocusLabel: 'مجالات تركيزك الخاصة',
    setupAddFocusPlaceholder: 'مثال: مستويات تم اكتساحها', setupAddFocusDescPlaceholder: 'وصف قصير (اختياري)', setupAddFocusButton: 'إضافة',
    setupLinksLabel: 'مواد تعليمية', setupYoutubeLabel: 'رابط فيديو يوتيوب', setupWebsiteLabel: 'رابط موقع تعليمي', setupReferenceLabel: 'رابط مرجعي آخر',
    setupLinksHint: 'لا بأس إن تركتها فارغة.', setupLinksInvalid: 'هذا الرابط غير صالح.', setupLinksNotYoutube: 'هذا ليس رابط يوتيوب صالحاً.',
    setupNotesLabel: 'ملاحظة المنهج المخصص', setupSaveButton: 'حفظ التغييرات', setupSaved: 'تم حفظ التغييرات.'
  },
  en: {
    title: 'Analysis Profiles', subtitle: 'Your analytical identity — how you usually read a chart, independent of Strategy and Pattern.',
    newProfile: 'New profile', searchPlaceholder: 'Search by name or description…',
    emptyTitle: 'Nothing registered yet', emptyBody: 'Create an Analysis Profile so NAVRYA knows how you usually read a chart.',
    defaultBadge: 'DEFAULT', activeBadge: 'Active', inactiveBadge: 'Inactive',
    focusCount: '{n} focus areas', strategyCount: '{n} linked strategies',
    open: 'Open', edit: 'Edit', duplicate: 'Duplicate', setDefault: 'Set as default', report: 'Report', delete: 'Delete',
    backToList: 'Back to list', tabOverview: 'Overview', tabReport: 'Report',
    dnaLabel: 'Analysis DNA', primaryLens: 'Primary Lens', secondaryLens: 'Secondary Lenses', coreFocus: 'Core Focus', customNotes: 'Custom method notes',
    linkedStrategies: 'Linked Strategies', noLinkedStrategies: 'No Strategy is linked to this profile yet.',
    usage: 'Usage',
    reportCreated: 'Created', reportUpdated: 'Last updated', reportDefault: 'Default status', reportPrimary: 'Primary Style',
    reportSecondary: 'Secondary Styles', reportFocusCount: 'Focus count', reportLinkedStrategies: 'Linked Strategies',
    yes: 'Yes', no: 'No',
    deleteConfirmTitle: 'Delete this profile?', deleteConfirmBody: 'This profile will be permanently deleted. Linked Strategies keep their own data but lose the link.',
    cancel: 'Cancel', confirmDelete: 'Delete profile', lastProfileError: 'You can’t delete your only Analysis Profile. Create another one first.',
    activeToggleHelp: 'You can deactivate this profile without deleting it.', description: 'Description',
    tabConcepts: 'Concepts', tabMemory: 'Memory', tabChat: 'Chat', tabPreview: 'Preview', tabKnowledge: 'Knowledge', tabSetup: 'Setup', setupPrimaryLabel: 'Primary lens', setupSecondaryLabel: 'Secondary lenses (up to two)',
    setupFocusLabel: 'Focus areas', setupCustomFocusLabel: 'Your own focus areas',
    setupAddFocusPlaceholder: 'e.g. Swept liquidity levels', setupAddFocusDescPlaceholder: 'Short description (optional)', setupAddFocusButton: 'Add',
    setupLinksLabel: 'Teaching material', setupYoutubeLabel: 'YouTube video link', setupWebsiteLabel: 'Educational website link', setupReferenceLabel: 'Another reference link',
    setupLinksHint: "It's fine to leave these empty.", setupLinksInvalid: 'That is not a valid link.', setupLinksNotYoutube: 'That is not a valid YouTube link.',
    setupNotesLabel: 'Custom-method notes', setupSaveButton: 'Save changes', setupSaved: 'Changes saved.'
  },
  es: {
    title: 'Perfiles de análisis', subtitle: 'Tu identidad analítica: cómo sueles leer un gráfico, independiente de la Estrategia y el Patrón.',
    newProfile: 'Nuevo perfil', searchPlaceholder: 'Buscar por nombre o descripción…',
    emptyTitle: 'Aún no hay nada registrado', emptyBody: 'Crea un perfil de análisis para que NAVRYA sepa cómo sueles leer un gráfico.',
    defaultBadge: 'PREDETERMINADO', activeBadge: 'Activo', inactiveBadge: 'Inactivo',
    focusCount: '{n} áreas de enfoque', strategyCount: '{n} estrategias vinculadas',
    open: 'Abrir', edit: 'Editar', duplicate: 'Duplicar', setDefault: 'Marcar como predeterminado', report: 'Informe', delete: 'Eliminar',
    backToList: 'Volver a la lista', tabOverview: 'Resumen', tabReport: 'Informe',
    dnaLabel: 'ADN de análisis', primaryLens: 'Lente principal', secondaryLens: 'Lentes secundarios', coreFocus: 'Enfoque principal', customNotes: 'Notas del método personalizado',
    linkedStrategies: 'Estrategias vinculadas', noLinkedStrategies: 'Aún no hay ninguna estrategia vinculada a este perfil.',
    usage: 'Uso',
    reportCreated: 'Creado', reportUpdated: 'Última actualización', reportDefault: 'Estado predeterminado', reportPrimary: 'Estilo principal',
    reportSecondary: 'Estilos secundarios', reportFocusCount: 'Número de enfoques', reportLinkedStrategies: 'Estrategias vinculadas',
    yes: 'Sí', no: 'No',
    deleteConfirmTitle: '¿Eliminar este perfil?', deleteConfirmBody: 'Este perfil se eliminará permanentemente. Las estrategias vinculadas conservan sus datos pero pierden el vínculo.',
    cancel: 'Cancelar', confirmDelete: 'Eliminar perfil', lastProfileError: 'No puedes eliminar tu único perfil de análisis. Crea otro primero.',
    activeToggleHelp: 'Puedes desactivar este perfil sin eliminarlo.', description: 'Descripción',
    tabConcepts: 'Conceptos', tabMemory: 'Memoria', tabChat: 'Chat', tabPreview: 'Vista previa', tabKnowledge: 'Conocimiento', tabSetup: 'Configuración', setupPrimaryLabel: 'Lente principal', setupSecondaryLabel: 'Lentes secundarios (hasta dos)',
    setupFocusLabel: 'Áreas de enfoque', setupCustomFocusLabel: 'Tus propias áreas de enfoque',
    setupAddFocusPlaceholder: 'p. ej.: Niveles de liquidez barridos', setupAddFocusDescPlaceholder: 'Descripción breve (opcional)', setupAddFocusButton: 'Añadir',
    setupLinksLabel: 'Material educativo', setupYoutubeLabel: 'Enlace de vídeo de YouTube', setupWebsiteLabel: 'Enlace de sitio web educativo', setupReferenceLabel: 'Otro enlace de referencia',
    setupLinksHint: 'Puedes dejarlo vacío.', setupLinksInvalid: 'Ese enlace no es válido.', setupLinksNotYoutube: 'Ese no es un enlace válido de YouTube.',
    setupNotesLabel: 'Notas del método personalizado', setupSaveButton: 'Guardar cambios', setupSaved: 'Cambios guardados.'
  }
};

function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}
function digits(lang, value) {
  const s = String(value);
  if (lang !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}
function localeCode(lang) { return { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' }[lang] || 'en-GB'; }
function formatDate(lang, iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(localeCode(lang), { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch (_) { return iso; }
}

function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }
function focusRegistry() { return window.TradeJournalAnalysisFocusRegistry; }
function profileStore() { return window.TradeJournalAnalysisProfileStore; }
function strategyStore() { return window.TradeJournalStrategyEducationStore; }

function styleName(id, lang) { const st = styleRegistry() && styleRegistry().get(id); return st ? (st.name[lang] || st.name.en) : id; }
function focusName(id, lang) { const f = focusRegistry() && focusRegistry().get(id); return f ? (f.name[lang] || f.name.en) : id; }

const AI_TABS = ['concepts', 'knowledge', 'memory', 'chat', 'preview'];

function linkedStrategiesFor(profileId) {
  const store = strategyStore();
  if (!store) return [];
  return store.listSync().filter((s) => s.linkedAnalysisProfileId === profileId);
}

// Exported for the structural tests (tests/analysis-profile-card-alignment.test.mjs). A card is a column: the head (name, lens,
// badges) at the top, the focus chips taking whatever room is left, and the counts + actions pinned to the bottom - so in a
// grid row of cards with different amounts of data (one focus chip or eight, a one-line lens or a three-lens hybrid) the
// titles, the counts and the buttons still line up. The focus chips are the ones that belong to the profile's lens
// (analysisProfileLens.js): a stale registry focus is never shown on a card as if it were active.
export function ProfileCard({ profile, lang, onOpen, onEdit, onDuplicate, onSetDefault, onReport, onDelete }) {
  const linked = linkedStrategiesFor(profile.id);
  const lens = lensOfProfile({ styles: styleRegistry(), focuses: focusRegistry() }, profile);
  const shownFocus = lens.focusIds.slice(0, 4);
  return (
    <Panel padding="0" fill style={{ display: 'flex', flexDirection: 'column' }} data-profile-card="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, flex: 1, minHeight: 0, boxSizing: 'border-box' }}>
        <div data-card-section="head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span title={profile.name || ''} style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name || styleName(profile.primaryStyleId, lang)}</span>
            <span data-card-lens="true" style={{ fontSize: 12, lineHeight: '16px', minHeight: 32, color: 'var(--char-accent)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {styleName(profile.primaryStyleId, lang)}
              {lens.secondaryStyleIds.length > 0 && ' + ' + lens.secondaryStyleIds.map((id) => styleName(id, lang)).join(' + ')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            {profile.isDefault && <Chip tone="accent" dot>{tr(lang, 'defaultBadge')}</Chip>}
            {!profile.isActive && <Chip tone="neutral">{tr(lang, 'inactiveBadge')}</Chip>}
          </div>
        </div>

        <div data-card-section="focus" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start', flex: 1 }}>
          {shownFocus.map((id) => (
            <span key={id} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 999, background: 'rgba(3,8,7,.4)', border: '1px solid var(--border-hairline)', color: 'var(--text-primary)' }}>{focusName(id, lang)}</span>
          ))}
          {lens.focusIds.length > shownFocus.length && <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>+{digits(lang, lens.focusIds.length - shownFocus.length)}</span>}
        </div>

        <div data-card-section="footer" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-dim)' }}>
            <span>{tr(lang, 'strategyCount', { n: digits(lang, linked.length) })}</span>
            <span>{tr(lang, 'focusCount', { n: digits(lang, lens.focusIds.length) })}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" icon="open" onClick={onOpen}>{tr(lang, 'open')}</Button>
            <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>{tr(lang, 'edit')}</Button>
            <Button variant="secondary" size="sm" icon="copy" onClick={onDuplicate}>{tr(lang, 'duplicate')}</Button>
            {!profile.isDefault && <Button variant="secondary" size="sm" icon="honour" onClick={onSetDefault}>{tr(lang, 'setDefault')}</Button>}
            <Button variant="secondary" size="sm" icon="report" onClick={onReport}>{tr(lang, 'report')}</Button>
            <span style={{ marginInlineStart: 'auto' }}>
              <Button variant="ghost" size="sm" icon="trash" onClick={onDelete}> </Button>
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ReportRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-hairline)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, textAlign: 'end' }}>{value}</span>
    </div>
  );
}

// Setup tab: everything the two-step wizard popup captures, inline-editable here too - so a
// trader who already created a profile can revisit and change any of it without reopening the
// wizard. Built on the exact same real registries/store helpers the wizard uses
// (window.TradeJournalAnalysisProfileStore.helpers), never a second validation copy. Every save
// is one explicit store.update() call (this file's own "single mutation funnel" convention),
// never an autosave-per-keystroke.
function SetupTab({ profile, lang, onUpdate }) {
  const styles = styleRegistry(), focuses = focusRegistry();
  const registries = { styles, focuses };
  const helpers = profileStore() && profileStore().helpers;
  // A stored profile may still carry focus areas that no longer fit its lens (or a duplicated lens) from before lens changes were
  // reconciled. They are not left selected-but-invisible: the tab opens with them already taken out of the selection and says so,
  // and saving persists the reconciled selection.
  const seed = React.useMemo(() => lensOfProfile(registries, profile), []);
  const [secondaryStyleIds, setSecondaryStyleIds] = React.useState(seed.secondaryStyleIds);
  const [focusIds, setFocusIds] = React.useState(seed.focusIds);
  const [lensNotice, setLensNotice] = React.useState(seed.staleFocusIds.length || seed.removedSecondaryIds.length
    ? { removedFocusIds: seed.staleFocusIds, secondaryRemoved: seed.removedSecondaryIds.length > 0, mode: 'stale' } : null);
  const [customFocuses, setCustomFocuses] = React.useState(profile.customFocuses || []);
  const [customMethodNotes, setCustomMethodNotes] = React.useState(profile.customMethodNotes || '');
  const seedLinks = profile.customMethodLinks || {};
  const [youtubeUrl, setYoutubeUrl] = React.useState(seedLinks.youtubeUrl || '');
  const [websiteUrl, setWebsiteUrl] = React.useState(seedLinks.websiteUrl || '');
  const [referenceUrl, setReferenceUrl] = React.useState(seedLinks.referenceUrl || '');
  const [newFocusName, setNewFocusName] = React.useState('');
  const [newFocusDescription, setNewFocusDescription] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  // primaryStyleId is its own field (not re-derived from profile every render) so switching it in
  // the Select below doesn't require re-mounting this whole tab.
  const [primaryStyleId, setPrimaryStyleId] = React.useState(profile.primaryStyleId);

  const allStyles = styles ? styles.list() : [];
  const styleOptions = allStyles.map((st) => ({ value: st.id, label: st.name[lang] || st.name.en }));
  const secondaryOptions = allStyles.filter((st) => st.id !== primaryStyleId && SPECIAL_STYLE_IDS.indexOf(st.id) === -1);
  const isCustom = primaryStyleId === 'custom_method';
  const focusGroups = reconcileLens({ styles, focuses, primaryStyleId, secondaryStyleIds, focusIds }).groups;

  function toggleFocus(id) { setFocusIds((prev) => (prev.indexOf(id) > -1 ? prev.filter((fid) => fid !== id) : prev.concat(id))); }
  // Every lens change - the primary Select, a complementary chip - is ONE reconciled step: the primary is taken out of the complementary
  // lenses, and the focus areas that no longer fit the new lens are removed from the selection (and named in the notice) instead of
  // staying selected behind chips that are no longer shown.
  function applyLens(change) {
    const next = applyLensChange(registries, { primaryStyleId, secondaryStyleIds, focusIds }, change);
    setPrimaryStyleId(next.primaryStyleId);
    setSecondaryStyleIds(next.secondaryStyleIds);
    setFocusIds(next.focusIds);
    setLensNotice({ removedFocusIds: next.removedFocusIds, secondaryRemoved: 'primaryStyleId' in change && secondaryStyleIds.indexOf(change.primaryStyleId) > -1, mode: 'removed' });
  }
  function changePrimary(id) { applyLens({ primaryStyleId: id }); }
  function toggleSecondary(id) { applyLens({ secondaryStyleIds: toggleSecondaryLens(secondaryStyleIds, id) }); }
  function addFocus() {
    if (!helpers || !newFocusName.trim()) return;
    const made = helpers.makeCustomFocus({ name: newFocusName, description: newFocusDescription, origin: 'user' });
    if (!made) return;
    setCustomFocuses((prev) => (prev.some((f) => helpers.foldFocusName(f.name) === helpers.foldFocusName(made.name)) ? prev : prev.concat(made)));
    setNewFocusName(''); setNewFocusDescription('');
  }
  function removeFocus(id) { setCustomFocuses((prev) => prev.filter((f) => f.id !== id)); }

  function save() {
    // Reconciled once more at the door: what is persisted is always a lens and a focus selection that belong together.
    const lens = reconcileLens({ styles, focuses, primaryStyleId, secondaryStyleIds, focusIds });
    onUpdate({
      primaryStyleId: lens.primaryStyleId, secondaryStyleIds: lens.secondaryStyleIds, focusIds: lens.focusIds, customFocuses,
      customMethodNotes, customMethodLinks: { youtubeUrl, websiteUrl, referenceUrl }
    });
    setLensNotice(null);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2400);
  }

  return (
    <Panel padding="18px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupPrimaryLabel')}</span>
          <Select value={primaryStyleId} onChange={changePrimary} options={styleOptions} icon="strategies" width={280} />
        </div>

        {lensNotice && <LensNotice lang={lang} removedFocusIds={lensNotice.removedFocusIds} secondaryRemoved={lensNotice.secondaryRemoved} mode={lensNotice.mode} />}

        {!isCustom && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupSecondaryLabel')}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {secondaryOptions.map((st) => (
                <FocusChip key={st.id} selected={secondaryStyleIds.indexOf(st.id) > -1} onClick={() => toggleSecondary(st.id)} label={st.name[lang] || st.name.en} />
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupFocusLabel')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {focusGroups.recommended.concat(focusGroups.optional).map((f) => (
              <FocusChip key={f.id} selected={focusIds.indexOf(f.id) > -1} onClick={() => toggleFocus(f.id)} label={f.name[lang] || f.name.en} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupCustomFocusLabel')}</span>
          {customFocuses.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {customFocuses.map((f) => (
                <span key={f.id} title={f.description || ''} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 6px 0 14px', borderRadius: 999,
                  fontSize: 12.5, fontWeight: 600, color: 'var(--char-accent)', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)'
                }}>
                  {f.name}
                  <button type="button" onClick={() => removeFocus(f.id)} style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: '50%', cursor: 'pointer', border: 0, background: 'transparent', color: 'inherit' }}>
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="text" value={newFocusName} onChange={(e) => setNewFocusName(e.target.value)} dir="auto" placeholder={tr(lang, 'setupAddFocusPlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFocus(); } }}
              style={{ flex: '1 1 200px', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
            <input type="text" value={newFocusDescription} onChange={(e) => setNewFocusDescription(e.target.value)} dir="auto" placeholder={tr(lang, 'setupAddFocusDescPlaceholder')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFocus(); } }}
              style={{ flex: '1 1 200px', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
            <Button variant="secondary" size="sm" icon="plus" disabled={!newFocusName.trim()} onClick={addFocus}>{tr(lang, 'setupAddFocusButton')}</Button>
          </div>
        </div>

        {isCustom && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupNotesLabel')}</span>
            <textarea value={customMethodNotes} onChange={(e) => setCustomMethodNotes(e.target.value)} dir="auto" rows={3}
              style={{ resize: 'vertical', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13 }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupLinksLabel')}</span>
          {[
            ['setupYoutubeLabel', youtubeUrl, setYoutubeUrl, true],
            ['setupWebsiteLabel', websiteUrl, setWebsiteUrl, false],
            ['setupReferenceLabel', referenceUrl, setReferenceUrl, false]
          ].map(([labelKey, value, setValue, isYoutubeField]) => {
            const invalid = value.trim() && !(helpers && helpers.normalizeHttpUrl(value));
            const notYoutube = isYoutubeField && value.trim() && !invalid && helpers && !helpers.isYoutubeUrl(value);
            return (
              <div key={labelKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, labelKey)}</label>
                <input type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" dir="ltr"
                  style={{ height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid ' + (invalid || notYoutube ? 'var(--danger)' : 'var(--border-hairline)'), background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, maxWidth: 420 }} />
                {invalid && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(lang, 'setupLinksInvalid')}</span>}
                {notYoutube && <span style={{ fontSize: 10.5, color: 'var(--danger)' }}>{tr(lang, 'setupLinksNotYoutube')}</span>}
              </div>
            );
          })}
          <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'setupLinksHint')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="primary" size="sm" icon="check" onClick={save}>{tr(lang, 'setupSaveButton')}</Button>
          {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>{tr(lang, 'setupSaved')}</span>}
        </div>
      </div>
    </Panel>
  );
}

function ProfileDetail({ profile, lang, dtab, setDtab, queuedLinks, onBack, onEdit, onToggleActive, onUpdateProfile, onDelete }) {
  const primary = styleRegistry() && styleRegistry().get(profile.primaryStyleId);
  const linked = linkedStrategiesFor(profile.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" icon="collapse" onClick={onBack}>{tr(lang, 'backToList')}</Button>
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon="edit" onClick={onEdit}>{tr(lang, 'edit')}</Button>
          <Button variant="ghost" size="sm" icon="trash" onClick={onDelete}>{tr(lang, 'delete')}</Button>
        </span>
      </div>

      <AnalysisDna lang={lang} profile={profile} showName />

      {(profile.description || profile.customMethodNotes) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profile.description && <p dir="auto" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)' }}>{profile.description}</p>}
          {profile.customMethodNotes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'customNotes')}</span>
              <p dir="auto" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{profile.customMethodNotes}</p>
            </div>
          )}
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={profile.isActive} onChange={(e) => onToggleActive(e.target.checked)} />
        {profile.isActive ? tr(lang, 'activeBadge') : tr(lang, 'inactiveBadge')}
        <span style={{ color: 'var(--text-dim)' }}>— {tr(lang, 'activeToggleHelp')}</span>
      </label>

      <div style={{ display: 'flex', gap: 6, padding: 6, border: '1px solid var(--border-gold)', borderRadius: 10, background: 'var(--surface-card)', width: 'fit-content' }}>
        {[['overview', tr(lang, 'tabOverview')], ['setup', tr(lang, 'tabSetup')], ['concepts', tr(lang, 'tabConcepts')], ['knowledge', tr(lang, 'tabKnowledge')], ['memory', tr(lang, 'tabMemory')], ['chat', tr(lang, 'tabChat')], ['preview', tr(lang, 'tabPreview')], ['report', tr(lang, 'tabReport')]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setDtab(id)} style={{
            height: 38, padding: '0 16px', borderRadius: 7, cursor: 'pointer', border: 0, font: 'inherit', fontSize: 12.5,
            background: dtab === id ? 'var(--char-active-surface)' : 'transparent', color: dtab === id ? 'var(--char-accent)' : 'var(--text-muted)', fontWeight: dtab === id ? 600 : 500
          }}>{label}</button>
        ))}
      </div>

      {/* The tabs that make a billed AI call say, once, how that call will be served (own key vs platform) - never the key itself. */}
      {AI_TABS.indexOf(dtab) > -1 && <AiReadinessBar lang={lang} />}

      {dtab === 'setup' && <SetupTab key={profile.id} profile={profile} lang={lang} onUpdate={(patch) => onUpdateProfile(patch)} />}
      {dtab === 'concepts' && <ConceptsTab key={profile.id} profile={profile} lang={lang} />}
      {dtab === 'knowledge' && <KnowledgeTab key={profile.id} profile={profile} lang={lang} queued={queuedLinks} />}
      {dtab === 'memory' && <MemoryTab key={profile.id} profile={profile} lang={lang} onManageConcepts={() => setDtab('concepts')} />}
      {dtab === 'chat' && <AnalysisProfileChatTab key={profile.id} profile={profile} lang={lang} />}
      {dtab === 'preview' && <PreviewTab key={profile.id} profile={profile} lang={lang} />}

      {dtab === 'overview' && (
        <Panel padding="18px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'linkedStrategies')}</span>
            {!linked.length ? <InsufficientDataText lang={lang} text={tr(lang, 'noLinkedStrategies')} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {linked.map((s) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, background: 'rgba(3,8,7,.34)' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{s.name}</span>
                    <Chip tone={s.active ? 'success' : 'neutral'}>{s.active ? tr(lang, 'activeBadge') : tr(lang, 'inactiveBadge')}</Chip>
                  </div>
                ))}
              </div>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)', marginTop: 8 }}>{tr(lang, 'usage')}</span>
            <UsageSummary key={profile.id} profile={profile} lang={lang} onOpenReport={() => setDtab('report')} />
          </div>
        </Panel>
      )}

      {dtab === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ProfileReport key={profile.id} profile={profile} lang={lang} />
          <Panel padding="18px 20px">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)', marginBottom: 6 }}>{trt(lang, 'rptConfigTitle')}</span>
              <ReportRow label={tr(lang, 'reportCreated')} value={formatDate(lang, profile.createdAt)} />
              <ReportRow label={tr(lang, 'reportUpdated')} value={formatDate(lang, profile.updatedAt)} />
              <ReportRow label={tr(lang, 'reportDefault')} value={profile.isDefault ? tr(lang, 'yes') : tr(lang, 'no')} />
              <ReportRow label={tr(lang, 'reportPrimary')} value={primary ? (primary.name[lang] || primary.name.en) : profile.primaryStyleId} />
              <ReportRow label={tr(lang, 'reportSecondary')} value={profile.secondaryStyleIds.length ? profile.secondaryStyleIds.map((id) => styleName(id, lang)).join(' + ') : '—'} />
              <ReportRow label={tr(lang, 'reportFocusCount')} value={digits(lang, profile.focusIds.length)} />
              <ReportRow label={tr(lang, 'reportLinkedStrategies')} value={digits(lang, linked.length)} />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function InsufficientDataText({ lang, text }) {
  return <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{text}</span>;
}

function DeleteConfirmModal({ target, error, lang, onCancel, onConfirm }) {
  if (!target) return null;
  return (
    <Modal
      title={tr(lang, 'deleteConfirmTitle')} icon="trash" onClose={onCancel}
      footer={(
        <React.Fragment>
          <Button variant="ghost" onClick={onCancel}>{tr(lang, 'cancel')}</Button>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="danger" onClick={() => onConfirm(target.id)}>{tr(lang, 'confirmDelete')}</Button>
          </span>
        </React.Fragment>
      )}
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{tr(lang, 'deleteConfirmBody')}</p>
      {error && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--danger)' }}>{error}</p>}
    </Modal>
  );
}

// `header` is an optional, opaque node the hosting hub renders above the LIST screen only (its hero
// + the Patterns/Strategies/Positions/Analysis Profiles pill bar) - this file stays unaware of the
// hub's own tab model, so the domain remains movable to a future #ai/analysis-profiles route.
export function AnalysisProfilesTab({ lang, header }) {
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const onChange = () => forceRerender();
    window.addEventListener('tradejournal:analysis-profiles-changed', onChange);
    window.addEventListener('tradejournal:replica-analysisProfiles-changed', onChange);
    window.addEventListener('tradejournal:strategies-changed', onChange);
    return () => {
      window.removeEventListener('tradejournal:analysis-profiles-changed', onChange);
      window.removeEventListener('tradejournal:replica-analysisProfiles-changed', onChange);
      window.removeEventListener('tradejournal:strategies-changed', onChange);
    };
  }, []);

  const [query, setQuery] = React.useState('');
  const [openId, setOpenId] = React.useState(null);
  const [dtab, setDtab] = React.useState('overview');
  // True only right after a wizard-created profile had its links queued as sources - shows the one-line
  // "your links were saved" note on the Knowledge tab it opens on, and never again.
  const [queuedLinks, setQueuedLinks] = React.useState(false);
  const [wizard, setWizard] = React.useState(null); // null | {mode:'create'|'edit', existingProfile}
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleteError, setDeleteError] = React.useState('');

  const store = profileStore();
  const profiles = store ? store.listSync() : [];
  const openProfile = openId ? profiles.find((p) => p.id === openId) : null;
  React.useEffect(() => { if (openId && !openProfile) setOpenId(null); }, [openId, openProfile]);

  const q = query.trim().toLowerCase();
  const filtered = profiles.filter((p) => !q || (p.name + ' ' + p.description).toLowerCase().indexOf(q) > -1);

  function handleWizardComplete(draft) {
    if (!store) return;
    if (wizard && wizard.mode === 'edit' && wizard.existingProfile) { store.update(wizard.existingProfile.id, draft); setWizard(null); return; }
    const created = store.create(draft);
    setWizard(null);
    // Custom Method links captured in the wizard become QUEUED knowledge sources (recorded only - never
    // read or billed here) and the new profile opens on the Knowledge tab, where reading and teaching
    // are the trader's own explicit clicks. A profile with no links behaves exactly as before.
    const links = created && created.customMethodLinks;
    if (links && (links.youtubeUrl || links.websiteUrl || links.referenceUrl)) {
      store.queueLinkSources(created.id, links).then((count) => {
        if (count > 0) { setOpenId(created.id); setDtab('knowledge'); setQueuedLinks(true); }
      });
    }
  }

  async function handleDelete(id) {
    setDeleteError('');
    try {
      await store.remove(id);
      setDeleteTarget(null);
      if (openId === id) setOpenId(null);
    } catch (error) {
      setDeleteError(error && error.code === 'ANALYSIS_PROFILE_LAST_REMAINING' ? tr(lang, 'lastProfileError') : String((error && error.message) || error));
    }
  }

  // These are the same two state transitions as the visible New profile/Edit controls. The
  // parent Strategies hub uses this narrow public handoff only after it has switched to this
  // already-mounted real tab; it never creates a second profile editor or persistence path.
  const profileHubRef = React.useRef(null);
  profileHubRef.current = {
    create: () => { setOpenId(null); setWizard({ mode: 'create' }); },
    editExisting: (id) => {
      const target = profiles.find((profile) => profile.id === id);
      if (!target) return false;
      setOpenId(target.id);
      setDtab('overview');
      setWizard({ mode: 'edit', existingProfile: target });
      return true;
    }
  };
  React.useEffect(() => {
    window.TradeJournalNavryaAnalysisProfilesHub = {
      create: () => profileHubRef.current.create(),
      editExisting: (id) => profileHubRef.current.editExisting(id)
    };
    return () => { delete window.TradeJournalNavryaAnalysisProfilesHub; };
  }, []);

  if (openProfile) {
    return (
      <React.Fragment>
        <ProfileDetail
          profile={openProfile} lang={lang} dtab={dtab} setDtab={setDtab} queuedLinks={queuedLinks}
          onBack={() => setOpenId(null)} onEdit={() => setWizard({ mode: 'edit', existingProfile: openProfile })}
          onToggleActive={(active) => store.update(openProfile.id, { isActive: active })}
          onUpdateProfile={(patch) => store.update(openProfile.id, patch)}
          onDelete={() => { setDeleteTarget(openProfile); setDeleteError(''); }}
        />
        {wizard && (
          <AnalysisProfileOnboarding
            mode={wizard.mode} existingProfile={wizard.existingProfile} lang={lang}
            onComplete={handleWizardComplete} onCancel={() => setWizard(null)}
          />
        )}
        <DeleteConfirmModal target={deleteTarget} error={deleteError} lang={lang} onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      </React.Fragment>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {header}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 620 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--parchment)' }}>{tr(lang, 'title')}</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>{tr(lang, 'subtitle')}</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setWizard({ mode: 'create' })}>{tr(lang, 'newProfile')}</Button>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', maxWidth: 360 }}>
        <Icon name="search" size={16} style={{ color: 'var(--text-dim)' }} />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr(lang, 'searchPlaceholder')} dir="auto"
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5 }} />
      </label>

      {!filtered.length ? (
        <Panel variant="quiet" padding="34px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{tr(lang, 'emptyTitle')}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(lang, 'emptyBody')}</span>
          </div>
        </Panel>
      ) : (
        <div data-profile-grid="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,340px),1fr))', gap: 16, alignItems: 'stretch' }}>
          {filtered.map((profile) => (
            <ProfileCard
              key={profile.id} profile={profile} lang={lang}
              onOpen={() => { setOpenId(profile.id); setDtab('overview'); setQueuedLinks(false); }}
              onEdit={() => setWizard({ mode: 'edit', existingProfile: profile })}
              onDuplicate={() => store.duplicate(profile.id)}
              onSetDefault={() => store.setDefault(profile.id)}
              onReport={() => { setOpenId(profile.id); setDtab('report'); }}
              onDelete={() => { setDeleteTarget(profile); setDeleteError(''); }}
            />
          ))}
        </div>
      )}

      {wizard && (
        <AnalysisProfileOnboarding
          mode={wizard.mode} existingProfile={wizard.existingProfile} lang={lang}
          onComplete={handleWizardComplete} onCancel={() => setWizard(null)}
        />
      )}

      <DeleteConfirmModal target={deleteTarget} error={deleteError} lang={lang} onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}
