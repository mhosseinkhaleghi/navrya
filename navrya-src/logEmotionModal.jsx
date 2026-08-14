import React from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// Redesign of trade-ui.js's openEmotion()/emotionEditor() modal against the design handoff
// code-codex/dashboard/LogEmotion.dc.html. Same real save path (TradeJournalTradeStore.addEmotion),
// same 10-emotion list, same breathing-card trigger, same content-safety gate on the note field -
// the design simplifies the editor to "pick emotions, one stress slider, one note" (no per-emotion
// intensity/tag cards), so emotionDetails is saved empty here, exactly as the simpler flow implies.

const EMOTION_ICONS = {
  excited: 'zap', anxious: 'activity', calm: 'leaf', revenge: 'rotate-ccw', angry: 'flame',
  afraid: 'shield', confident: 'check', fatigued: 'moon', restless: 'wind', overconfident: 'triangle-alert'
};
const SESSION_CITY_LABEL = { london: 'London', newyork: 'New York', tokyo: 'Tokyo', sydney: 'Sydney' };

const copy = {
  fa: {
    kicker: 'ژورنال معاملاتی · وضعیت ذهنی', title: 'ثبت احساس در حین معامله',
    openFor: 'باز از', dominantEmotions: 'احساسات غالب', chosenOf3: '{n} / ۳ انتخاب‌شده',
    stressLevel: 'میزان استرس', stressSteady: 'پایدار', stressElevated: 'بالارفته', stressCritical: 'بحرانی',
    notePrompt: 'چه اتفاقی افتاد؟ به چی فکر می‌کردی؟', notePlaceholder: 'یک جمله صادقانه کافیه.',
    stateReadout: 'وضعیت لحظه‌ای', riskAdvice: 'توصیه ریسک', logsThisTrade: 'ثبت‌های این معامله',
    breathingMoment: 'یک لحظه تنفس',
    readoutRevenge: 'انتقام توی لیستته — این پرهزینه‌ترین الگوئه. قبل از دست‌زدن به حجم، اون ضرری که دنبالشی رو اسم ببر.',
    readoutHot: 'استرس داره پوزیشن رو اداره می‌کنه، نه پلن. هیچ‌چی اینجا نیاز نداره همین یک دقیقه تصمیم بگیری.',
    readoutWarm: 'قابل کار هست، ولی از حالت عادی تنگ‌تره. روی همون ورودی که نوشتی بمون.',
    readoutSteady: 'پایدار. شرایط با پلنی که موقع باز کردن ثبت کردی هم‌خوانی داره.',
    adviceNoNew: 'بدون ورود جدید', adviceHalf: 'نصف حجم', advicePlan: 'حجم برنامه‌ریزی‌شده',
    breathHot: 'چهار نفس تو، هفت نگه‌دار، هشت بیرون. سه دور، بعد تصمیم بگیر — می‌تونی همین الان هم ثبت و ادامه بدی.',
    breathCalm: 'اختیاری. یک دور دست‌ها رو قبل از تصمیم بعدی آروم می‌کنه.',
    footerNote: 'این ثبت روی همین پوزیشن ذخیره می‌شود · زمان به‌صورت خودکار ثبت می‌شود.',
    cancel: 'انصراف', logEmotion: 'ثبت احساس', maxThree: 'حداکثر سه احساس قابل انتخاب است.'
  },
  ar: {
    kicker: 'سجل التداول · الحالة النفسية', title: 'تسجيل الشعور أثناء الصفقة',
    openFor: 'مفتوحة منذ', dominantEmotions: 'المشاعر الغالبة', chosenOf3: '{n} / ٣ مختارة',
    stressLevel: 'مستوى التوتر', stressSteady: 'مستقر', stressElevated: 'مرتفع', stressCritical: 'حرج',
    notePrompt: 'ماذا حدث؟ فيم كنت تفكر؟', notePlaceholder: 'جملة صادقة واحدة كافية.',
    stateReadout: 'قراءة الحالة', riskAdvice: 'نصيحة المخاطرة', logsThisTrade: 'تسجيلات هذه الصفقة',
    breathingMoment: 'لحظة تنفس',
    readoutRevenge: 'الانتقام مدرج ضمن مشاعرك — هذا النمط الأعلى تكلفة. سمِّ الخسارة التي تطاردها قبل أن تلمس الحجم.',
    readoutHot: 'التوتر يدير الصفقة، لا الخطة. لا شيء هنا يحتاج قراراً في الدقيقة القادمة.',
    readoutWarm: 'قابلة للعمل، لكنها أضيق من المعتاد. التزم بالدخول الذي كتبته.',
    readoutSteady: 'مستقرة. الظروف تطابق الخطة التي سجلتها عند الفتح.',
    adviceNoNew: 'لا دخول جديد', adviceHalf: 'نصف الحجم', advicePlan: 'الحجم المخطط',
    breathHot: 'أربعة شهيق، سبعة حبس، ثمانية زفير. ثلاث دورات ثم قرر — يمكنك التسجيل والمتابعة الآن أيضاً.',
    breathCalm: 'اختياري. دورة واحدة تهدئ اليدين قبل القرار التالي.',
    footerNote: 'يُحفظ هذا التسجيل على هذه الصفقة · الوقت يُسجَّل تلقائياً.',
    cancel: 'إلغاء', logEmotion: 'تسجيل الشعور', maxThree: 'يمكن اختيار ثلاثة مشاعر فقط.'
  },
  en: {
    kicker: 'Trade journal · mental state', title: 'Log Emotion During Trade',
    openFor: 'Open for', dominantEmotions: 'Dominant emotions', chosenOf3: '{n} / 3 chosen',
    stressLevel: 'Stress level', stressSteady: 'steady', stressElevated: 'elevated', stressCritical: 'critical',
    notePrompt: 'What happened? What were you thinking?', notePlaceholder: 'One honest sentence is enough.',
    stateReadout: 'State readout', riskAdvice: 'Risk advice', logsThisTrade: 'Logs this trade',
    breathingMoment: 'A breathing moment',
    readoutRevenge: 'Revenge is on the list — this is the pattern that costs the most. Name the loss you are chasing before you touch size.',
    readoutHot: 'Stress is running the position, not the plan. Nothing here needs to be decided in the next minute.',
    readoutWarm: 'Workable, but tighter than usual. Stay with the entry you wrote down.',
    readoutSteady: 'Steady. Conditions match the plan you logged at the open.',
    adviceNoNew: 'No new entries', adviceHalf: 'Half size', advicePlan: 'Plan size',
    breathHot: 'Four in, seven hold, eight out. Three rounds, then decide — you can also log and continue.',
    breathCalm: 'Optional. One round settles the hands before the next decision.',
    footerNote: 'Logged against this position · timestamped automatically.',
    cancel: 'Cancel', logEmotion: 'Log emotion', maxThree: 'Select up to three emotions.'
  },
  es: {
    kicker: 'Diario de trading · estado mental', title: 'Registrar emoción durante la operación',
    openFor: 'Abierta hace', dominantEmotions: 'Emociones dominantes', chosenOf3: '{n} / 3 elegidas',
    stressLevel: 'Nivel de estrés', stressSteady: 'estable', stressElevated: 'elevado', stressCritical: 'crítico',
    notePrompt: '¿Qué pasó? ¿Qué pensabas?', notePlaceholder: 'Una frase honesta es suficiente.',
    stateReadout: 'Lectura de estado', riskAdvice: 'Consejo de riesgo', logsThisTrade: 'Registros de esta operación',
    breathingMoment: 'Un momento para respirar',
    readoutRevenge: 'La venganza está en la lista — es el patrón más costoso. Nombra la pérdida que persigues antes de tocar el tamaño.',
    readoutHot: 'El estrés está manejando la posición, no el plan. Nada aquí necesita decidirse en el próximo minuto.',
    readoutWarm: 'Manejable, pero más ajustado de lo normal. Quédate con la entrada que anotaste.',
    readoutSteady: 'Estable. Las condiciones coinciden con el plan que registraste al abrir.',
    adviceNoNew: 'Sin entradas nuevas', adviceHalf: 'Mitad del tamaño', advicePlan: 'Tamaño planeado',
    breathHot: 'Cuatro inhala, siete mantén, ocho exhala. Tres rondas y decide — también puedes registrar y continuar.',
    breathCalm: 'Opcional. Una ronda calma las manos antes de la siguiente decisión.',
    footerNote: 'Se registra contra esta posición · con marca de tiempo automática.',
    cancel: 'Cancelar', logEmotion: 'Registrar emoción', maxThree: 'Selecciona hasta tres emociones.'
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
function elapsedClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// mental-health-safety.js's renderSafetyCard() is a real DOM node (not JSX) - same host pattern
// tradeLogModal.jsx already uses for the identical safety gate.
function SafetyCardHost({ node }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host || !node) return undefined;
    host.appendChild(node);
    return () => { if (host.contains(node)) host.removeChild(node); };
  }, [node]);
  return <div ref={ref} />;
}

function LogEmotionModal({ trade, stage, seed, onClose }) {
  const lang = window.TradeJournalTradeI18n ? window.TradeJournalTradeI18n.language() : (document.documentElement.lang || 'fa');
  const rtl = lang === 'fa' || lang === 'ar';
  const t = (key, vars) => tr(lang, key, vars);
  const ti = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const types = window.TradeJournalTradeTypes;
  const emotionList = (types && types.emotions) || Object.keys(EMOTION_ICONS);

  const [selected, setSelected] = React.useState((seed && seed.dominantEmotions) || []);
  const [stress, setStress] = React.useState((seed && seed.stressLevel) || 5);
  const [note, setNote] = React.useState((seed && seed.note) || '');
  const [breathDismissed, setBreathDismissed] = React.useState(false);
  const [safetyNode, setSafetyNode] = React.useState(null);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // AI process registry - the global assistant dock can suggest the note field into this open
  // editor, same allowlist/applyValue contract trade-ui.js's own openEmotion() registered.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('trade-emotion-log', {
      allowlist: ['note'],
      isOpen: () => mountedRef.current,
      activeStep: () => stage || 'mid_trade',
      applyValue: (path, value) => { if (path === 'note') setNote(String(value || '')); }
    });
    return () => { mountedRef.current = false; };
  }, [stage]);

  function toggle(id) {
    setSelected((list) => {
      if (list.indexOf(id) > -1) return list.filter((x) => x !== id);
      if (list.length >= 3) { if (window.TradeJournalTradeUI) window.TradeJournalTradeUI.toast(t('maxThree'), 'warning'); return list; }
      return list.concat([id]);
    });
  }

  const hot = stress >= 7, warm = stress >= 4;
  const stressTone = hot ? 'var(--danger)' : warm ? 'var(--warning)' : 'var(--success)';
  const revenge = selected.indexOf('revenge') > -1;
  const psyStore = window.TradeJournalPsychologyStore;
  const breathing = psyStore ? psyStore.settings().breathing : null;
  const breathOpen = !!(breathing && breathing.enabled && !breathDismissed && stress >= breathing.stressThreshold);

  function submit() {
    const value = {
      dominantEmotions: selected, emotionDetails: [], stressLevel: stress, focusQuality: 5, planCommitment: 5,
      wouldTakeIfNotForced: null, note, stage: stage || 'mid_trade'
    };
    const mhSafety = window.TradeJournalMentalHealthSafety;
    if (mhSafety && note && mhSafety.checkText(note).flagged) {
      setSafetyNode(mhSafety.renderSafetyCard(() => setSafetyNode(null)));
      return;
    }
    tradeStore.addEmotion(trade.id, value);
    if (window.TradeJournalTradeUI) window.TradeJournalTradeUI.toast(ti.t('emotionSaved'), 'success');
    onClose();
  }

  const sessionCity = SESSION_CITY_LABEL[trade.session] || trade.session;
  const openedAt = trade.openedAt || trade.createdAt;
  const elapsed = openedAt ? elapsedClock(now.getTime() - new Date(openedAt).getTime()) : '—';
  const logsCount = (trade.emotionLog || []).length;

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{'@keyframes nv-log-breath{0%{transform:scale(.62);opacity:.55}21%{transform:scale(1);opacity:1}58%{transform:scale(1);opacity:1}100%{transform:scale(.62);opacity:.55}}'}</style>
      <div role="dialog" aria-modal="true" aria-label={t('title')} style={{ position: 'relative', width: 'min(1080px,100%)', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--ink-900)', boxShadow: '0 12px 30px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
            <Icon name="psychology" size={22} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('kicker')}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('title')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label={t('cancel')} style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: trade.status === 'open' ? 'var(--success)' : 'var(--gold-warm)' }} />
          <span dir="auto" style={{ font: 'var(--type-username)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--char-accent)' }}>{sessionCity}</span>
          <span style={{ width: 1, height: 16, background: 'var(--divider-gold)' }} />
          <span dir="ltr" style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {(ti ? ti.t(trade.direction) : trade.direction) + ' · ' + ti.t('entryPrice') + ' ' + (trade.entryPrice ?? '—') + ' · ' + ti.t('stopLoss') + ' ' + (trade.stopLoss ?? '—')}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('openFor')}</span>
          <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-countdown)', fontSize: 15, color: 'var(--gold-warm)' }}>{elapsed}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 20, padding: '18px 20px', background: 'var(--ink-950)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('dominantEmotions')}</span>
                <span style={{ flex: 1 }} />
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: selected.length >= 3 ? 'var(--gold-warm)' : 'var(--text-muted)' }}>{t('chosenOf3', { n: digits(lang, selected.length) })}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                {emotionList.map((name) => {
                  const on = selected.indexOf(name) > -1;
                  return (
                    <button
                      key={name} type="button" onClick={() => toggle(name)}
                      style={{ height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 8, cursor: 'pointer', border: on ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)', color: on ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    >
                      <Icon name={EMOTION_ICONS[name] || 'circle'} size={18} />
                      <span dir="auto" style={{ font: 'var(--type-section-label)', letterSpacing: '.08em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ti ? ti.t(name) : name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('stressLevel')}</span>
                <span style={{ flex: 1 }} />
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: stressTone }}>{digits(lang, stress)}</span>
                <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{hot ? t('stressCritical') : warm ? t('stressElevated') : t('stressSteady')}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, direction: 'ltr' }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const on = n <= stress;
                  return (
                    <button
                      key={n} type="button" onClick={() => setStress(n)} aria-label={'Stress ' + n}
                      style={{ flex: 1, height: 38, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (on ? stressTone : 'var(--divider-gold)'), background: on ? (hot ? 'rgba(255,56,48,.16)' : warm ? 'rgba(255,176,32,.14)' : 'var(--char-active-surface)') : 'rgba(11,20,21,.5)', color: on ? 'var(--text-primary)' : 'var(--text-disabled)', font: 'var(--type-caption)' }}
                    >{digits(lang, n)}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('notePrompt')}</span>
              <textarea
                dir="auto" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')}
                style={{ resize: 'vertical', boxSizing: 'border-box', padding: 12, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
              />
              {safetyNode && <SafetyCardHost node={safetyNode} />}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--surface-800)', overflow: 'hidden' }}>
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'var(--char-texture)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: .06 }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', color: 'var(--gold-warm)' }}><Icon name={hot ? 'cloud-lightning' : warm ? 'cloud' : 'sun'} size={18} /></span>
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('stateReadout')}</span>
              </div>
              <span style={{ position: 'relative', font: 'var(--type-body)', color: 'var(--text-muted)' }}>
                {revenge ? t('readoutRevenge') : hot ? t('readoutHot') : warm ? t('readoutWarm') : t('readoutSteady')}
              </span>
              <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
                  <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('riskAdvice')}</span>
                  <span dir="auto" style={{ font: 'var(--type-username)', color: stressTone }}>{hot ? t('adviceNoNew') : warm ? t('adviceHalf') : t('advicePlan')}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
                  <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('logsThisTrade')}</span>
                  <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{digits(lang, String(logsCount).padStart(2, '0'))}</span>
                </div>
              </div>
            </div>

            {breathOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{t('breathingMoment')}</span>
                  <span style={{ flex: 1 }} />
                  <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>4 · 7 · 8</span>
                  <button type="button" onClick={() => setBreathDismissed(true)} aria-label={ti ? ti.t('psyBreathingDismiss') : 'Dismiss'} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="close" size={15} /></button>
                </div>
                <div style={{ display: 'grid', placeItems: 'center', height: 150 }}>
                  <span aria-hidden="true" style={{ width: 104, height: 104, borderRadius: '50%', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', boxShadow: '0 0 18px var(--char-glow)', animation: 'nv-log-breath 19s ease-in-out infinite', display: 'block' }} />
                </div>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textAlign: 'center' }}>{hot ? t('breathHot') : t('breathCalm')}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-hairline)', background: 'var(--ink-900)' }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('footerNote')}</span>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" icon="check" onClick={submit}>{t('logEmotion')}</Button>
        </div>
      </div>
    </div>
  );
}

export function openEmotion(tradeId, stage, seed) {
  const tradeStore = window.TradeJournalTradeStore;
  const ti = window.TradeJournalTradeI18n;
  if (!tradeStore || !ti) return;
  const trade = tradeStore.find(tradeId);
  if (!trade) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<LogEmotionModal trade={trade} stage={stage} seed={seed} onClose={close} />);
  return close;
}
