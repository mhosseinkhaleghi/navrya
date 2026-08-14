import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import { openLogWizard } from './tradeLogModal.jsx';
import { openClosePosition } from './closePositionModal.jsx';

// Redesign of trade-ui.js's details() modal (plus its screenshots/journey-chart extensions)
// against the design handoff code-codex/dashboard/TradeDetails.dc.html. Same real fields, same
// real actions (edit -> openLogWizard, delete -> TradeStore.remove, close -> the redesigned
// Close Position modal). "Open P&L" and the ladder's live "now" marker from the mock assume a
// live price feed this app doesn't have anywhere - closed trades show their real realized P&L,
// open/hunting trades show an honest "—" instead of a fabricated unrealized figure.

const SESSION_CITY_LABEL = { london: 'London', newyork: 'New York', tokyo: 'Tokyo', sydney: 'Sydney' };
const STAGE_KEY = { entry: 'entryStage', mid_trade: 'midTrade', exit: 'exitStage' };

const copy = {
  fa: {
    kicker: 'ژورنال معاملاتی', title: 'جزئیات معامله', priceLadder: 'نردبان قیمت',
    stop: 'حد ضرر', entry: 'ورود', target: 'هدف', rr: 'RR', leverage: 'اهرم', risk: 'ریسک', pnlLabel: 'سود/زیان',
    tradeContext: 'زمینه معامله', session: 'سشن', strategy: 'استراتژی', timeframe: 'تایم‌فریم', thesis: 'تحلیل',
    screenshots: 'اسکرین‌شات‌ها', emotionalJourney: 'مسیر احساسی', stressAxis: 'استرس ۰ تا ۱۰',
    emotionHistory: 'تاریخچه احساسات', logsCount: '{n} ثبت', noEmotionLogs: 'هنوز احساسی ثبت نشده است.',
    deleteNote: 'حذف معامله، ثبت‌های احساسی آن را هم حذف می‌کند', deleteTrade: 'حذف معامله', deleteConfirm: 'این معامله حذف شود؟',
    edit: 'ویرایش', closePosition: 'بستن پوزیشن', noPatterns: '—', noStrategy: '—', noThesis: '—'
  },
  ar: {
    kicker: 'سجل التداول', title: 'تفاصيل الصفقة', priceLadder: 'سلم الأسعار',
    stop: 'وقف الخسارة', entry: 'الدخول', target: 'الهدف', rr: 'RR', leverage: 'الرافعة', risk: 'المخاطرة', pnlLabel: 'الربح/الخسارة',
    tradeContext: 'سياق الصفقة', session: 'الجلسة', strategy: 'الاستراتيجية', timeframe: 'الإطار الزمني', thesis: 'التحليل',
    screenshots: 'لقطات الشاشة', emotionalJourney: 'المسار الشعوري', stressAxis: 'التوتر ٠ إلى ١٠',
    emotionHistory: 'سجل المشاعر', logsCount: '{n} تسجيل', noEmotionLogs: 'لا توجد مشاعر مسجلة بعد.',
    deleteNote: 'حذف الصفقة يحذف سجلات مشاعرها أيضاً', deleteTrade: 'حذف الصفقة', deleteConfirm: 'حذف هذه الصفقة؟',
    edit: 'تعديل', closePosition: 'إغلاق الصفقة', noPatterns: '—', noStrategy: '—', noThesis: '—'
  },
  en: {
    kicker: 'Trade journal', title: 'Trade Details', priceLadder: 'Price ladder',
    stop: 'Stop', entry: 'Entry', target: 'Target', rr: 'R : R', leverage: 'Leverage', risk: 'Risk', pnlLabel: 'P&L',
    tradeContext: 'Trade context', session: 'Session', strategy: 'Strategy', timeframe: 'Timeframe', thesis: 'Thesis',
    screenshots: 'Screenshots', emotionalJourney: 'Emotional journey', stressAxis: 'Stress 0–10',
    emotionHistory: 'Emotion history', logsCount: '{n} logs', noEmotionLogs: 'No emotions logged yet.',
    deleteNote: 'Deleting a trade removes its emotion logs too', deleteTrade: 'Delete trade', deleteConfirm: 'Delete this trade?',
    edit: 'Edit', closePosition: 'Close position', noPatterns: '—', noStrategy: '—', noThesis: '—'
  },
  es: {
    kicker: 'Diario de trading', title: 'Detalles de la operación', priceLadder: 'Escala de precios',
    stop: 'Stop', entry: 'Entrada', target: 'Objetivo', rr: 'R : R', leverage: 'Apalancamiento', risk: 'Riesgo', pnlLabel: 'P&L',
    tradeContext: 'Contexto', session: 'Sesión', strategy: 'Estrategia', timeframe: 'Marco temporal', thesis: 'Tesis',
    screenshots: 'Capturas', emotionalJourney: 'Recorrido emocional', stressAxis: 'Estrés 0–10',
    emotionHistory: 'Historial emocional', logsCount: '{n} registros', noEmotionLogs: 'Aún no hay emociones registradas.',
    deleteNote: 'Eliminar la operación también elimina sus registros emocionales', deleteTrade: 'Eliminar operación', deleteConfirm: '¿Eliminar esta operación?',
    edit: 'Editar', closePosition: 'Cerrar posición', noPatterns: '—', noStrategy: '—', noThesis: '—'
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
function stressTone(v) { return v >= 7 ? 'var(--danger)' : v >= 4 ? 'var(--warning)' : 'var(--success)'; }

function ladderPct(trade) {
  const tp = trade.takeProfits && trade.takeProfits[0] ? trade.takeProfits[0].price : null;
  const vals = [trade.stopLoss, trade.entryPrice, tp].filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo;
  if (!range) return null;
  const pct = (v) => ((v - lo) / range) * 100;
  return {
    stopPct: trade.stopLoss != null ? pct(trade.stopLoss) : null,
    entryPct: trade.entryPrice != null ? pct(trade.entryPrice) : null,
    targetPct: tp != null ? pct(tp) : null
  };
}

function ScreenshotThumb({ item }) {
  const [url, setUrl] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    const tradeStore = window.TradeJournalTradeStore;
    if (tradeStore) tradeStore.screenshotUrl(item).then((value) => { if (!cancelled) setUrl(value); });
    return () => { cancelled = true; };
  }, [item]);
  if (!url) return null;
  return (
    <button type="button" onClick={() => window.open(url, '_blank', 'noopener')} style={{ padding: 0, border: '1px solid var(--border-hairline)', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', background: 'transparent', width: 76, height: 56, flex: 'none' }}>
      <img src={url} alt={item.fileName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </button>
  );
}

function TradeDetailsModal({ trade, onClose, onChanged }) {
  const lang = window.TradeJournalTradeI18n ? window.TradeJournalTradeI18n.language() : (document.documentElement.lang || 'fa');
  const rtl = lang === 'fa' || lang === 'ar';
  const t = (key, vars) => tr(lang, key, vars);
  const ti = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const tradeUi = window.TradeJournalTradeUI;
  const patternStore = window.TradeJournalPatternStore;
  const strategyStore = window.TradeJournalStrategyEducationStore;

  const tp = trade.takeProfits && trade.takeProfits[0] ? trade.takeProfits[0].price : null;
  const closed = trade.status === 'closed';
  const canClose = trade.status === 'open' || trade.status === 'hunting';
  const statusTone = trade.status === 'open' ? 'success' : trade.status === 'hunting' ? 'accent' : trade.status === 'cancelled' ? 'danger' : 'neutral';

  const facts = [
    { label: ti.t('status'), value: tradeUi ? tradeUi.statusLabel(trade.status) : trade.status, tone: 'var(--text-primary)' },
    { label: ti.t('direction'), value: ti.t(trade.direction), tone: 'var(--char-accent)' },
    { label: t('entry'), value: trade.entryPrice ?? '—', tone: 'var(--text-primary)' },
    { label: t('stop'), value: trade.stopLoss ?? '—', tone: 'var(--danger)' },
    { label: t('target'), value: tp ?? '—', tone: 'var(--success)' },
    { label: t('rr'), value: trade.rr ? '1:' + trade.rr : '—', tone: 'var(--gold-warm)' },
    { label: t('leverage'), value: trade.leverage ? trade.leverage + '×' : '—', tone: 'var(--text-primary)' },
    { label: t('risk'), value: trade.riskPercent != null ? trade.riskPercent + '%' : '—', tone: 'var(--text-primary)' },
    { label: t('pnlLabel'), value: closed ? ti.money(trade.pnl) : '—', tone: closed ? (trade.pnl >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)' }
  ];

  const ladder = ladderPct(trade);
  const patterns = (patternStore ? patternStore.listSync() : []).filter((p) => (trade.linkedPatternIds || []).indexOf(p.id) > -1);
  const strategy = trade.linkedStrategyId && strategyStore ? strategyStore.find(trade.linkedStrategyId) : null;
  const sessionCity = SESSION_CITY_LABEL[trade.session] || trade.session;
  const context = [
    { label: t('session'), value: sessionCity + (trade.createdAt ? ' · ' + ti.date(trade.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') },
    { label: t('strategy'), value: strategy ? strategy.name : t('noStrategy') },
    { label: t('timeframe'), value: trade.primaryTimeframe || '—' },
    { label: t('thesis'), value: trade.chartNote || t('noThesis') }
  ];

  const journey = (trade.emotionLog || []).map((entry) => ({
    label: ti.t(STAGE_KEY[entry.stage] || 'midTrade'),
    value: entry.stressLevel,
    tone: stressTone(entry.stressLevel)
  }));

  function del() {
    if (!window.confirm(t('deleteConfirm'))) return;
    tradeStore.remove(trade.id);
    onClose();
    if (onChanged) onChanged();
  }
  function edit() { onClose(); openLogWizard(trade); }
  function closePos() { onClose(); openClosePosition(trade.id, onChanged); }

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={t('title')} style={{ position: 'relative', width: 'min(1240px,100%)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--ink-900)', boxShadow: '0 12px 30px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
            <Icon name="execution" size={22} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span dir="auto" style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('kicker') + ' · ' + sessionCity}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('title')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <Chip tone="accent">{(ti.t(trade.direction) || '').toUpperCase()}</Chip>
          <Chip tone={statusTone} dot>{(tradeUi ? tradeUi.statusLabel(trade.status) : trade.status).toUpperCase()}</Chip>
          <button type="button" onClick={onClose} aria-label="close" style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, padding: '18px 20px', borderTop: '1px solid var(--border-hairline)', background: 'var(--ink-950)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
              {facts.map((f) => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'var(--surface-800)' }}>
                  <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{f.label}</span>
                  <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: f.tone }}>{f.value}</span>
                </div>
              ))}
            </div>

            {ladder && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--surface-800)' }}>
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('priceLadder')}</span>
                <div dir="ltr" style={{ position: 'relative', height: 38, borderRadius: 6, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', overflow: 'hidden' }}>
                  {ladder.stopPct !== null && ladder.entryPct !== null && (
                    <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: Math.min(ladder.stopPct, ladder.entryPct) + '%', width: Math.abs(ladder.entryPct - ladder.stopPct) + '%', background: 'rgba(255,56,48,.16)' }} />
                  )}
                  {ladder.entryPct !== null && ladder.targetPct !== null && (
                    <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: Math.min(ladder.entryPct, ladder.targetPct) + '%', width: Math.abs(ladder.targetPct - ladder.entryPct) + '%', background: 'rgba(46,204,113,.14)' }} />
                  )}
                  {ladder.entryPct !== null && (
                    <span aria-hidden="true" style={{ position: 'absolute', left: ladder.entryPct + '%', top: 0, bottom: 0, width: 2, background: 'var(--gold-warm)' }} />
                  )}
                </div>
                <div dir="ltr" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--danger)' }}>{t('stop') + ' ' + (trade.stopLoss ?? '—')}</span>
                  <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--gold-warm)' }}>{t('entry') + ' ' + (trade.entryPrice ?? '—')}</span>
                  <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--success)' }}>{t('target') + ' ' + (tp ?? '—')}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--surface-800)' }}>
              <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('tradeContext')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {context.map((c) => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', width: 104, flex: 'none' }}>{c.label}</span>
                    <span dir="auto" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{c.value}</span>
                  </div>
                ))}
              </div>
              {!!patterns.length && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {patterns.map((p) => <Chip key={p.id} tone="neutral">{p.name}</Chip>)}
                </div>
              )}
            </div>

            {!!(trade.screenshots || []).length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--surface-800)' }}>
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('screenshots')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {trade.screenshots.map((item) => <ScreenshotThumb key={item.id} item={item} />)}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {!!journey.length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--surface-800)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('emotionalJourney')}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('stressAxis')}</span>
                </div>
                <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, paddingTop: 6 }}>
                  {journey.map((j, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: j.tone }}>{digits(lang, j.value)}</span>
                      <span style={{ display: 'block', width: '100%', borderRadius: '4px 4px 0 0', background: j.tone, height: Math.round((j.value / 10) * 96) + 8 + 'px' }} />
                      <span style={{ height: 1, width: '100%', background: 'var(--divider-gold)', display: 'block' }} />
                      <span dir="auto" style={{ font: 'var(--type-caption)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{j.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--surface-800)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('emotionHistory')}</span>
                <span style={{ flex: 1 }} />
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{t('logsCount', { n: digits(lang, (trade.emotionLog || []).length) })}</span>
              </div>
              {!(trade.emotionLog || []).length ? (
                <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t('noEmotionLogs')}</span>
              ) : trade.emotionLog.slice().reverse().map((entry) => {
                const tone = stressTone(entry.stressLevel);
                return (
                  <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: tone }} />
                      <span dir="auto" style={{ font: 'var(--type-username)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(entry.dominantEmotions || []).map((name) => ti.t(name)).join(' · ') || '—'}</span>
                      <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{ti.date(entry.timestamp, { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ flex: 1, display: 'block', height: 6, borderRadius: 4, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
                        <span style={{ display: 'block', height: '100%', borderRadius: 4, background: tone, width: (entry.stressLevel * 10) + '%' }} />
                      </span>
                      <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: tone }}>{ti.t('stressLevel') + ' ' + digits(lang, entry.stressLevel)}</span>
                    </div>
                    {entry.note && <span dir="auto" style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{entry.note}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-hairline)', background: 'var(--ink-900)' }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('deleteNote')}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={del} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,56,48,.55)', background: 'rgba(255,56,48,.08)', color: 'var(--danger)', font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
            <Icon name="trash" size={17} />{t('deleteTrade')}
          </button>
          <Button variant="secondary" icon="edit" onClick={edit}>{t('edit')}</Button>
          {canClose && <Button variant="primary" icon="execution" onClick={closePos}>{t('closePosition')}</Button>}
        </div>
      </div>
    </div>
  );
}

export function openTradeDetails(id) {
  const tradeStore = window.TradeJournalTradeStore;
  const ti = window.TradeJournalTradeI18n;
  if (!tradeStore || !ti) return;
  const trade = tradeStore.find(id);
  if (!trade) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<TradeDetailsModal trade={trade} onClose={close} onChanged={() => window.dispatchEvent(new CustomEvent('tradejournal:trades-changed'))} />);
  return close;
}
