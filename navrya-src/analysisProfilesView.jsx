import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { AnalysisProfileOnboarding } from './analysisProfileOnboarding.jsx';

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
    usage: 'استفاده', sessionUsageUnavailable: 'اتصال به جلسات هنوز فعال نیست — این آمار در فاز بعدی اضافه می‌شود.',
    reportCreated: 'تاریخ ایجاد', reportUpdated: 'آخرین بروزرسانی', reportDefault: 'وضعیت پیش‌فرض', reportPrimary: 'سبک اصلی',
    reportSecondary: 'سبک‌های مکمل', reportFocusCount: 'تعداد حوزه‌های تمرکز', reportLinkedStrategies: 'استراتژی‌های لینک‌شده',
    reportSessionUsage: 'استفاده در جلسات', reportMarkets: 'پرکاربردترین بازارها', reportTimeframes: 'پرکاربردترین تایم‌فریم‌ها', reportHistory: 'تاریخچه تغییرات',
    insufficientData: 'داده کافی نیست.', yes: 'بله', no: 'خیر',
    deleteConfirmTitle: 'حذف این پروفایل؟', deleteConfirmBody: 'این پروفایل به‌طور کامل حذف می‌شود. استراتژی‌های لینک‌شده لینک خود را از دست می‌دهند اما حذف نمی‌شوند.',
    cancel: 'انصراف', confirmDelete: 'حذف پروفایل', lastProfileError: 'نمی‌توان تنها پروفایل تحلیل را حذف کرد. ابتدا یک پروفایل دیگر بساز.',
    activeToggleHelp: 'می‌توانی این پروفایل را بدون حذف کردن غیرفعال کنی.', description: 'توضیحات'
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
    usage: 'الاستخدام', sessionUsageUnavailable: 'الربط بالجلسات غير مفعّل بعد — ستضاف هذه الإحصائية في مرحلة لاحقة.',
    reportCreated: 'تاريخ الإنشاء', reportUpdated: 'آخر تحديث', reportDefault: 'الحالة الافتراضية', reportPrimary: 'النمط الأساسي',
    reportSecondary: 'الأنماط المكملة', reportFocusCount: 'عدد مجالات التركيز', reportLinkedStrategies: 'الاستراتيجيات المرتبطة',
    reportSessionUsage: 'الاستخدام في الجلسات', reportMarkets: 'الأسواق الأكثر استخداماً', reportTimeframes: 'الأطر الزمنية الأكثر استخداماً', reportHistory: 'سجل التغييرات',
    insufficientData: 'بيانات غير كافية.', yes: 'نعم', no: 'لا',
    deleteConfirmTitle: 'حذف هذا الملف؟', deleteConfirmBody: 'سيُحذف هذا الملف نهائياً. الاستراتيجيات المرتبطة تفقد ارتباطها لكن لا تُحذف.',
    cancel: 'إلغاء', confirmDelete: 'حذف الملف', lastProfileError: 'لا يمكن حذف ملف التحليل الوحيد. أنشئ ملفاً آخر أولاً.',
    activeToggleHelp: 'يمكنك تعطيل هذا الملف دون حذفه.', description: 'الوصف'
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
    usage: 'Usage', sessionUsageUnavailable: 'Session linkage isn’t wired up yet — this metric arrives in a future phase.',
    reportCreated: 'Created', reportUpdated: 'Last updated', reportDefault: 'Default status', reportPrimary: 'Primary Style',
    reportSecondary: 'Secondary Styles', reportFocusCount: 'Focus count', reportLinkedStrategies: 'Linked Strategies',
    reportSessionUsage: 'Session usage', reportMarkets: 'Most-used markets', reportTimeframes: 'Most-used timeframes', reportHistory: 'Configuration history',
    insufficientData: 'Insufficient data.', yes: 'Yes', no: 'No',
    deleteConfirmTitle: 'Delete this profile?', deleteConfirmBody: 'This profile will be permanently deleted. Linked Strategies keep their own data but lose the link.',
    cancel: 'Cancel', confirmDelete: 'Delete profile', lastProfileError: 'You can’t delete your only Analysis Profile. Create another one first.',
    activeToggleHelp: 'You can deactivate this profile without deleting it.', description: 'Description'
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
    usage: 'Uso', sessionUsageUnavailable: 'La vinculación con sesiones aún no está disponible: esta métrica llegará en una fase futura.',
    reportCreated: 'Creado', reportUpdated: 'Última actualización', reportDefault: 'Estado predeterminado', reportPrimary: 'Estilo principal',
    reportSecondary: 'Estilos secundarios', reportFocusCount: 'Número de enfoques', reportLinkedStrategies: 'Estrategias vinculadas',
    reportSessionUsage: 'Uso en sesiones', reportMarkets: 'Mercados más usados', reportTimeframes: 'Timeframes más usados', reportHistory: 'Historial de configuración',
    insufficientData: 'Datos insuficientes.', yes: 'Sí', no: 'No',
    deleteConfirmTitle: '¿Eliminar este perfil?', deleteConfirmBody: 'Este perfil se eliminará permanentemente. Las estrategias vinculadas conservan sus datos pero pierden el vínculo.',
    cancel: 'Cancelar', confirmDelete: 'Eliminar perfil', lastProfileError: 'No puedes eliminar tu único perfil de análisis. Crea otro primero.',
    activeToggleHelp: 'Puedes desactivar este perfil sin eliminarlo.', description: 'Descripción'
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

function linkedStrategiesFor(profileId) {
  const store = strategyStore();
  if (!store) return [];
  return store.listSync().filter((s) => s.linkedAnalysisProfileId === profileId);
}

function ProfileCard({ profile, lang, onOpen, onEdit, onDuplicate, onSetDefault, onReport, onDelete }) {
  const linked = linkedStrategiesFor(profile.id);
  return (
    <Panel padding="0">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name || styleName(profile.primaryStyleId, lang)}</span>
            <span style={{ fontSize: 12, color: 'var(--char-accent)' }}>
              {styleName(profile.primaryStyleId, lang)}
              {profile.secondaryStyleIds.length > 0 && ' + ' + profile.secondaryStyleIds.map((id) => styleName(id, lang)).join(' + ')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
            {profile.isDefault && <Chip tone="accent" dot>{tr(lang, 'defaultBadge')}</Chip>}
            {!profile.isActive && <Chip tone="neutral">{tr(lang, 'inactiveBadge')}</Chip>}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {profile.focusIds.slice(0, 4).map((id) => (
            <span key={id} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 999, background: 'rgba(3,8,7,.4)', border: '1px solid var(--border-hairline)', color: 'var(--text-primary)' }}>{focusName(id, lang)}</span>
          ))}
          {profile.focusIds.length > 4 && <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>+{digits(lang, profile.focusIds.length - 4)}</span>}
        </div>

        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: 'var(--text-dim)' }}>
          <span>{tr(lang, 'strategyCount', { n: digits(lang, linked.length) })}</span>
          <span>{tr(lang, 'focusCount', { n: digits(lang, profile.focusIds.length) })}</span>
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
    </Panel>
  );
}

function InsufficientData({ lang }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', color: 'var(--text-dim)', fontSize: 12.5 }}>
      <Icon name="scenarios" size={15} />{tr(lang, 'insufficientData')}
    </div>
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

function ProfileDetail({ profile, lang, dtab, setDtab, onBack, onEdit, onToggleActive, onDelete }) {
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 22, borderRadius: 14, border: '1px solid var(--border-gold)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)' }}>
        <span style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--char-accent)' }}>{tr(lang, 'dnaLabel')}</span>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--parchment)' }}>{profile.name}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'primaryLens')}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--char-accent)' }}>{primary ? (primary.name[lang] || primary.name.en) : profile.primaryStyleId}</span>
          </div>
          {profile.secondaryStyleIds.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'secondaryLens')}</span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{profile.secondaryStyleIds.map((id) => styleName(id, lang)).join(' + ')}</span>
            </div>
          )}
        </div>
        {profile.focusIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'coreFocus')}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {profile.focusIds.map((id) => <Chip key={id}>{focusName(id, lang)}</Chip>)}
            </div>
          </div>
        )}
        {profile.description && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>{profile.description}</p>}
        {profile.customMethodNotes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(lang, 'customNotes')}</span>
            <p dir="auto" style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{profile.customMethodNotes}</p>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: 'var(--text-dim)' }}>
          <input type="checkbox" checked={profile.isActive} onChange={(e) => onToggleActive(e.target.checked)} />
          {profile.isActive ? tr(lang, 'activeBadge') : tr(lang, 'inactiveBadge')}
          <span style={{ color: 'var(--text-dim)' }}>— {tr(lang, 'activeToggleHelp')}</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: 6, border: '1px solid var(--border-gold)', borderRadius: 10, background: 'var(--surface-card)', width: 'fit-content' }}>
        {[['overview', tr(lang, 'tabOverview')], ['report', tr(lang, 'tabReport')]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setDtab(id)} style={{
            height: 38, padding: '0 16px', borderRadius: 7, cursor: 'pointer', border: 0, font: 'inherit', fontSize: 12.5,
            background: dtab === id ? 'var(--char-active-surface)' : 'transparent', color: dtab === id ? 'var(--char-accent)' : 'var(--text-muted)', fontWeight: dtab === id ? 600 : 500
          }}>{label}</button>
        ))}
      </div>

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
            <InsufficientDataText lang={lang} text={tr(lang, 'sessionUsageUnavailable')} />
          </div>
        </Panel>
      )}

      {dtab === 'report' && (
        <Panel padding="18px 20px">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <ReportRow label={tr(lang, 'reportCreated')} value={formatDate(lang, profile.createdAt)} />
            <ReportRow label={tr(lang, 'reportUpdated')} value={formatDate(lang, profile.updatedAt)} />
            <ReportRow label={tr(lang, 'reportDefault')} value={profile.isDefault ? tr(lang, 'yes') : tr(lang, 'no')} />
            <ReportRow label={tr(lang, 'reportPrimary')} value={primary ? (primary.name[lang] || primary.name.en) : profile.primaryStyleId} />
            <ReportRow label={tr(lang, 'reportSecondary')} value={profile.secondaryStyleIds.length ? profile.secondaryStyleIds.map((id) => styleName(id, lang)).join(' + ') : '—'} />
            <ReportRow label={tr(lang, 'reportFocusCount')} value={digits(lang, profile.focusIds.length)} />
            <ReportRow label={tr(lang, 'reportLinkedStrategies')} value={digits(lang, linked.length)} />
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'reportSessionUsage')}</span>
              <InsufficientData lang={lang} />
            </div>
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'reportMarkets')}</span>
              <InsufficientData lang={lang} />
            </div>
            <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'reportTimeframes')}</span>
              <InsufficientData lang={lang} />
            </div>
            <div style={{ padding: '10px 0' }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(lang, 'reportHistory')}</span>
              <InsufficientData lang={lang} />
            </div>
          </div>
        </Panel>
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

export function AnalysisProfilesTab({ lang }) {
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
    if (wizard && wizard.mode === 'edit' && wizard.existingProfile) store.update(wizard.existingProfile.id, draft);
    else store.create(draft);
    setWizard(null);
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
          profile={openProfile} lang={lang} dtab={dtab} setDtab={setDtab}
          onBack={() => setOpenId(null)} onEdit={() => setWizard({ mode: 'edit', existingProfile: openProfile })}
          onToggleActive={(active) => store.update(openProfile.id, { isActive: active })}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16, alignItems: 'start' }}>
          {filtered.map((profile) => (
            <ProfileCard
              key={profile.id} profile={profile} lang={lang}
              onOpen={() => { setOpenId(profile.id); setDtab('overview'); }}
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
