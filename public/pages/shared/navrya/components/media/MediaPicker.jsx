import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Button } from '../forms/Button.jsx';
import { AnalyzingImageIcon } from '../feedback/AnalyzingImageIcon.jsx';
import {
  listRecentAssets, listMyDriveAssets, getAsset, createAsset, deleteAsset, downloadAsset, fetchStorageUsage, fileToDataUrl
} from './mediaDriveClient.js';

// NAVRYA Media Drive - the ONE reusable chart/image picker behind every personal-media attachment
// flow (Live Session chart entries/movement images today; Trade/Pattern/Strategy Education
// attachments are designed for but not yet wired to this component - see HANDOFF.md). Interaction
// order follows the supplied reference screenshot (Recent -> My Drive -> Upload), never its
// styling - this uses NAVRYA's own dark ink/gold/character-accent tokens and the shared
// Button/Icon components throughout.
//
// `intent` ('chartEntry' | 'movementEntry' | 'generic') only changes the confirm CTA's label and
// whether an Upload-tab file becomes a 'chart' (triggers AI extraction) or a plain 'image' (never
// analyzed) - selection/upload/quota/ownership behavior is identical for every intent, by design
// (one picker, one capture coordinator per caller - never a parallel implementation per flow).
//
// `initialAsset` (optional) is the asset the caller's OWN capture-first flow just created and
// already started analyzing (see navrya-src/liveSessionView.jsx's MarketChartView) - shown first
// and selected by default, exactly like the supplied reference screenshot's own "just captured"
// affordance. While that asset's metadataStatus is still 'processing', this component polls it
// (bounded, ~24 tries / ~60s) so the card can flip from "Analyzing..." to its real result without
// the trader having to do anything - confirming before that finishes is still always allowed
// (the extraction contract explicitly never blocks registration on a still-processing result).

const copy = {
  fa: {
    tabRecent: 'اخیر', tabMine: 'درایو من', tabUpload: 'آپلود',
    confirmChartEntry: 'ادامه به ثبت چارت', confirmMovementEntry: 'ثبت حرکت', confirmGeneric: 'انتخاب',
    cancel: 'انصراف', searchPlaceholder: 'جست‌وجو در درایو...', empty: 'هنوز تصویری اینجا نیست.',
    emptyMine: 'در درایو شما تصویری پیدا نشد.', dropHint: 'کلیک کنید یا تصویری را اینجا رها کنید',
    uploading: 'در حال آپلود...', uploadFailed: 'آپلود ناموفق بود.', loadMore: 'بیشتر',
    analyzing: 'در حال تحلیل چارت...', analysisReady: 'شناسایی شد', analysisFailed: 'تحلیل ناموفق بود',
    analysisUnavailable: 'تحلیل در دسترس نیست', analysisProcessing: 'در حال تحلیل',
    unknownSymbol: 'نماد نامشخص', unknownTimeframe: 'تایم‌فریم نامشخص', usedOfQuota: '{used} از {quota}',
    justCaptured: 'به‌تازگی گرفته‌شد', title: 'مدیا درایو NAVRYA',
    download: 'دانلود', delete: 'حذف', deleteConfirm: 'این تصویر حذف شود؟',
    deleteConfirmLinked: 'این تصویر در {count} مورد دیگر استفاده شده است. حذف کامل شود؟',
    deleteFailed: 'حذف ناموفق بود.'
  },
  ar: {
    tabRecent: 'الأخيرة', tabMine: 'درايفي', tabUpload: 'رفع',
    confirmChartEntry: 'المتابعة لتسجيل الرسم', confirmMovementEntry: 'تسجيل الحركة', confirmGeneric: 'اختيار',
    cancel: 'إلغاء', searchPlaceholder: 'ابحث في الدرايف...', empty: 'لا توجد صور هنا بعد.',
    emptyMine: 'لم يتم العثور على صور في درايفك.', dropHint: 'انقر أو اسحب صورة إلى هنا',
    uploading: 'جارٍ الرفع...', uploadFailed: 'فشل الرفع.', loadMore: 'المزيد',
    analyzing: 'جارٍ تحليل الرسم...', analysisReady: 'تم التعرف عليه', analysisFailed: 'فشل التحليل',
    analysisUnavailable: 'التحليل غير متاح', analysisProcessing: 'جارٍ التحليل',
    unknownSymbol: 'رمز غير معروف', unknownTimeframe: 'إطار زمني غير معروف', usedOfQuota: '{used} من {quota}',
    justCaptured: 'التُقطت للتو', title: 'درايف الوسائط NAVRYA',
    download: 'تنزيل', delete: 'حذف', deleteConfirm: 'هل تريد حذف هذه الصورة؟',
    deleteConfirmLinked: 'هذه الصورة مستخدمة في {count} مكان آخر. هل تريد حذفها نهائيًا؟',
    deleteFailed: 'فشل الحذف.'
  },
  en: {
    tabRecent: 'Recent', tabMine: 'My Drive', tabUpload: 'Upload',
    confirmChartEntry: 'Continue to chart registration', confirmMovementEntry: 'Register movement', confirmGeneric: 'Select',
    cancel: 'Cancel', searchPlaceholder: 'Search your Drive...', empty: 'No media here yet.',
    emptyMine: 'No media found in your Drive.', dropHint: 'Click or drop an image here',
    uploading: 'Uploading...', uploadFailed: 'Upload failed.', loadMore: 'Load more',
    analyzing: 'Analyzing chart metadata...', analysisReady: 'Detected', analysisFailed: 'Analysis failed',
    analysisUnavailable: 'Analysis unavailable', analysisProcessing: 'Analyzing',
    unknownSymbol: 'Unknown symbol', unknownTimeframe: 'Unknown timeframe', usedOfQuota: '{used} of {quota}',
    justCaptured: 'Just captured', title: 'NAVRYA Media Drive',
    download: 'Download', delete: 'Delete', deleteConfirm: 'Delete this image?',
    deleteConfirmLinked: 'This image is used in {count} other place(s). Delete it anyway?',
    deleteFailed: 'Delete failed.'
  },
  es: {
    tabRecent: 'Recientes', tabMine: 'Mi unidad', tabUpload: 'Subir',
    confirmChartEntry: 'Continuar al registro del gráfico', confirmMovementEntry: 'Registrar movimiento', confirmGeneric: 'Seleccionar',
    cancel: 'Cancelar', searchPlaceholder: 'Buscar en tu unidad...', empty: 'Aún no hay archivos aquí.',
    emptyMine: 'No se encontraron archivos en tu unidad.', dropHint: 'Haz clic o suelta una imagen aquí',
    uploading: 'Subiendo...', uploadFailed: 'Error al subir.', loadMore: 'Cargar más',
    analyzing: 'Analizando el gráfico...', analysisReady: 'Detectado', analysisFailed: 'Análisis fallido',
    analysisUnavailable: 'Análisis no disponible', analysisProcessing: 'Analizando',
    unknownSymbol: 'Símbolo desconocido', unknownTimeframe: 'Temporalidad desconocida', usedOfQuota: '{used} de {quota}',
    justCaptured: 'Recién capturado', title: 'NAVRYA Media Drive',
    download: 'Descargar', delete: 'Eliminar', deleteConfirm: '¿Eliminar esta imagen?',
    deleteConfirmLinked: 'Esta imagen se usa en {count} otro(s) lugar(es). ¿Eliminarla de todas formas?',
    deleteFailed: 'Error al eliminar.'
  }
};
function tr(lang, key, vars) {
  let value = (copy[lang] && copy[lang][key]) || copy.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}

function humanizeBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes; let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return (i === 0 ? Math.round(value) : value.toFixed(1)) + ' ' + units[i];
}

function statusMeta(lang, asset) {
  if (asset.kind !== 'chart') return null;
  if (asset.metadataStatus === 'ready') return { icon: 'Check', color: 'var(--char-accent)', label: tr(lang, 'analysisReady') };
  if (asset.metadataStatus === 'failed') return { icon: 'CircleAlert', color: 'var(--danger)', label: tr(lang, 'analysisFailed') };
  if (asset.metadataStatus === 'unavailable') return { icon: 'CircleAlert', color: 'var(--text-dim)', label: tr(lang, 'analysisUnavailable') };
  return { icon: 'LoaderCircle', color: 'var(--text-muted)', label: tr(lang, 'analysisProcessing') };
}

const cardIconButtonStyle = {
  width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer',
  border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.75)', color: 'var(--text-primary)'
};

function AssetCard({ asset, lang, selected, onSelect, onDelete, onDownload }) {
  const meta = statusMeta(lang, asset);
  const registeredLabel = asset.registeredAt ? new Date(asset.registeredAt).toLocaleString(lang === 'fa' ? 'fa-IR' : lang) : '';
  const chartInfoLine = [asset.symbol || tr(lang, 'unknownSymbol'), asset.timeframe || tr(lang, 'unknownTimeframe'), asset.exchange].filter(Boolean).join(' · ');
  return (
    <div
      role="button" tabIndex={0} onClick={() => onSelect(asset)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(asset); } }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 10, cursor: 'pointer', textAlign: 'start',
        border: '1px solid ' + (selected ? 'var(--char-accent)' : 'var(--border-hairline)'),
        background: selected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)',
        boxShadow: selected ? 'var(--glow-active)' : 'none'
      }}
    >
      <span style={{ position: 'relative', display: 'block', width: '100%', height: 96, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
        <img src={asset.url} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        {selected && (
          <span style={{ position: 'absolute', top: 6, insetInlineEnd: 6, width: 20, height: 20, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--char-accent)', color: 'var(--ink-950)' }}>
            <Icon name="Check" size={13} />
          </span>
        )}
        <span style={{ position: 'absolute', top: 6, insetInlineStart: 6, display: 'flex', gap: 4 }}>
          <button type="button" title={tr(lang, 'download')} aria-label={tr(lang, 'download')} onClick={(e) => { e.stopPropagation(); onDownload(asset); }} style={cardIconButtonStyle}>
            <Icon name="Download" size={12} />
          </button>
          <button type="button" title={tr(lang, 'delete')} aria-label={tr(lang, 'delete')} onClick={(e) => { e.stopPropagation(); onDelete(asset); }} style={cardIconButtonStyle}>
            <Icon name="trash" size={12} />
          </button>
        </span>
      </span>
      {asset.kind === 'chart' ? (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span dir="ltr" className="navrya-tabular" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chartInfoLine}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{[asset.activeMarketSession, registeredLabel].filter(Boolean).join(' · ')}</span>
          {meta && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: meta.color }}>
              {meta.icon === 'LoaderCircle' ? <AnalyzingImageIcon size={12} /> : <Icon name={meta.icon} size={12} />}
              {meta.label}
            </span>
          )}
        </span>
      ) : (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.originalFilename || asset.mimeType || ''}</span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{registeredLabel}</span>
        </span>
      )}
    </div>
  );
}

export function MediaPicker({ open, lang = 'en', intent = 'generic', initialAsset = null, sessionId = null, onClose, onConfirm }) {
  const rtl = lang === 'fa' || lang === 'ar';
  const [tab, setTab] = React.useState('recent');
  const [recent, setRecent] = React.useState([]);
  const [mine, setMine] = React.useState([]);
  const [mineCursor, setMineCursor] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState(initialAsset);
  const [storageUsage, setStorageUsage] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState('');
  const [uploadPreviewUrl, setUploadPreviewUrl] = React.useState('');
  const fileRef = React.useRef(null);
  const pollRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    setSelected(initialAsset);
    fetchStorageUsage().then((usage) => { if (usage) setStorageUsage(usage); }).catch(() => {});
    let cancelled = false;
    setLoading(true);
    listRecentAssets().then((res) => { if (!cancelled) setRecent(res.assets); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live "Analyzing..." -> real result, bounded (~24 x 2.5s = 60s) so a stuck server-side job
  // never spins this forever - the asset itself stays a valid, honest 'processing' state client
  // side if the bound is reached; the trader can still confirm or retry later either way.
  React.useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!open || !selected || selected.kind !== 'chart' || selected.metadataStatus !== 'processing') return undefined;
    let tries = 0;
    pollRef.current = setInterval(async () => {
      tries += 1;
      const fresh = await getAsset(selected.id);
      if (fresh) setSelected((prev) => (prev && prev.id === fresh.id ? fresh : prev));
      if (!fresh || fresh.metadataStatus !== 'processing' || tries >= 24) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 2500);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [open, selected && selected.id, selected && selected.metadataStatus]);

  React.useEffect(() => () => { if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl); }, [uploadPreviewUrl]);

  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && open) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  function loadMineTab(reset) {
    setLoading(true);
    listMyDriveAssets({ q: query, cursor: reset ? null : mineCursor }).then((res) => {
      setMine((prev) => (reset ? res.assets : prev.concat(res.assets)));
      setMineCursor(res.nextCursor);
    }).finally(() => setLoading(false));
  }
  function switchTab(next) {
    setTab(next);
    if (next === 'mine' && !mine.length) loadMineTab(true);
  }

  async function handleFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    setUploadError('');
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const kind = intent === 'generic' ? 'image' : 'chart';
      // NAVRYA Media Drive: chart-metadata detection is fully local OCR now, run synchronously
      // server-side inside this very call (server/community/media-chart-ocr.mjs) - the response
      // already carries the final symbol/timeframe/metadataStatus, no separate analyze step.
      const result = await createAsset({ dataUrl, filename: file.name, mimeType: file.type, kind, source: 'upload', sessionId });
      if (!result.ok) { setUploadError(tr(lang, 'uploadFailed')); setUploading(false); return; }
      setSelected(result.asset);
      setRecent((prev) => [result.asset].concat(prev));
      fetchStorageUsage().then((usage) => { if (usage) setStorageUsage(usage); }).catch(() => {});
    } catch (_) {
      setUploadError(tr(lang, 'uploadFailed'));
    } finally {
      setUploading(false);
    }
  }

  function removeAssetFromLists(id) {
    setRecent((prev) => prev.filter((a) => a.id !== id));
    setMine((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev) => (prev && prev.id === id ? null : prev));
  }

  // Deletion mirrors the server's own two-step contract (routes.media.mjs): a linked asset is
  // refused (409, MEDIA_ASSET_LINKED) unless the caller explicitly confirms detaching every link
  // first - so a second, more specific confirmation is only ever shown once the server has
  // actually told us this asset is shared elsewhere, never guessed upfront.
  async function handleDelete(asset) {
    if (!window.confirm(tr(lang, 'deleteConfirm'))) return;
    const result = await deleteAsset(asset.id);
    if (result.ok) { removeAssetFromLists(asset.id); fetchStorageUsage().then((usage) => { if (usage) setStorageUsage(usage); }).catch(() => {}); return; }
    if (result.error === 'MEDIA_ASSET_LINKED') {
      if (!window.confirm(tr(lang, 'deleteConfirmLinked', { count: result.linkCount || '' }))) return;
      const forced = await deleteAsset(asset.id, { detach: true });
      if (forced.ok) { removeAssetFromLists(asset.id); fetchStorageUsage().then((usage) => { if (usage) setStorageUsage(usage); }).catch(() => {}); return; }
    }
    window.alert(tr(lang, 'deleteFailed'));
  }

  const confirmLabel = intent === 'chartEntry' ? tr(lang, 'confirmChartEntry') : intent === 'movementEntry' ? tr(lang, 'confirmMovementEntry') : tr(lang, 'confirmGeneric');
  const list = tab === 'recent' ? recent : tab === 'mine' ? mine : [];

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={tr(lang, 'title')} style={{ position: 'relative', width: '100%', maxWidth: 780, maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--ink-900)', boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          <span style={{ width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
            <Icon name="FolderOpen" size={20} />
          </span>
          <span style={{ flex: 1, font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{tr(lang, 'title')}</span>
          <button type="button" onClick={onClose} aria-label="close" style={{ width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        {storageUsage && Number.isFinite(storageUsage.quotaBytes) && storageUsage.quotaBytes > 0 && (() => {
          const pct = Math.max(0, Math.min(100, (storageUsage.usedBytes / storageUsage.quotaBytes) * 100));
          const barColor = pct >= 95 ? 'var(--danger)' : pct >= 80 ? 'var(--gold-warm)' : 'var(--char-accent)';
          return (
            <div style={{ padding: '0 20px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: 6 }}>
                <span dir="ltr" className="navrya-tabular" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {tr(lang, 'usedOfQuota', { used: humanizeBytes(storageUsage.usedBytes), quota: humanizeBytes(storageUsage.quotaBytes) })}
                  {storageUsage.plan ? ' · ' + storageUsage.plan : ''}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(244,234,215,.12)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: barColor, transition: 'width .3s ease' }} />
              </div>
            </div>
          );
        })()}

        <div style={{ display: 'flex', gap: 6, padding: '0 20px' }}>
          {[['recent', 'FolderClock'], ['mine', 'HardDrive'], ['upload', 'Upload']].map(([key, icon]) => (
            <button
              key={key} type="button" onClick={() => switchTab(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                border: '1px solid var(--border-hairline)', borderBottom: tab === key ? '2px solid var(--char-accent)' : '1px solid var(--border-hairline)',
                background: tab === key ? 'rgba(244,234,215,.06)' : 'transparent', color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 12
              }}
            >
              <Icon name={icon} size={14} />{tr(lang, key === 'recent' ? 'tabRecent' : key === 'mine' ? 'tabMine' : 'tabUpload')}
            </button>
          ))}
        </div>

        <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1, minHeight: 260 }}>
          {tab === 'mine' && (
            <div style={{ display: 'flex', gap: 8, marginBlockEnd: 10 }}>
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadMineTab(true); }}
                placeholder={tr(lang, 'searchPlaceholder')}
                style={{ flex: 1, height: 36, borderRadius: 8, padding: '0 12px', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', color: 'var(--text-primary)', fontSize: 12 }}
              />
              <Button variant="secondary" size="sm" icon="Search" onClick={() => loadMineTab(true)} />

            </div>
          )}

          {tab !== 'upload' && (
            <>
              {!loading && !list.length && (
                <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '30px 0' }}>{tr(lang, tab === 'mine' ? 'emptyMine' : 'empty')}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {list.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} lang={lang} selected={selected && selected.id === asset.id} onSelect={setSelected} onDelete={handleDelete} onDownload={downloadAsset} />
                ))}
              </div>
              {tab === 'mine' && mineCursor && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBlockStart: 12 }}>
                  <Button variant="secondary" size="sm" onClick={() => loadMineTab(false)} loading={loading}>{tr(lang, 'loadMore')}</Button>
                </div>
              )}
            </>
          )}

          {tab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selected && uploadPreviewUrl ? (
                <span style={{ position: 'relative', display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-gold)', background: '#000' }}>
                  <img src={selected.url || uploadPreviewUrl} alt="" style={{ display: 'block', width: '100%', height: 220, objectFit: 'cover' }} />
                </span>
              ) : (
                <button
                  type="button" onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={uploading}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, height: 190, borderRadius: 10, cursor: uploading ? 'wait' : 'pointer', border: '1px dashed var(--border-gold)', background: 'rgba(3,8,7,.5)' }}
                  onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
                >
                  {uploading ? <AnalyzingImageIcon size={26} /> : <Icon name="ImagePlus" size={26} style={{ color: 'rgba(244,234,215,.2)' }} />}
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{uploading ? tr(lang, 'uploading') : tr(lang, 'dropHint')}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
              {uploadError && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{uploadError}</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-hairline)' }}>
          {selected && selected.kind === 'chart' && selected.metadataStatus === 'processing' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              <AnalyzingImageIcon size={14} />{tr(lang, 'analyzing')}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>{tr(lang, 'cancel')}</Button>
          <Button variant="primary" icon="Check" disabled={!selected} onClick={() => onConfirm(selected)}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
