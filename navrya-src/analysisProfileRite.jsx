import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { BrandLockup } from '../public/pages/shared/navrya/components/brand/BrandLockup.jsx';
import { assetUrl } from '../public/pages/shared/navrya/components/core/AssetBase.jsx';
import { stringsFor } from './i18n.js';
import { CHARACTERS } from './characters.js';
import { SPECIAL_STYLE_IDS, FEATURED_STYLE_IDS, copy as baseCopy } from './analysisProfileOnboarding.jsx';
import { AiErrorNotice } from './analysisProfileAiStatus.jsx';
import { toAiError } from './analysisProfileAiErrors.js';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25 and character-app.jsx's own
// AnalysisProfileFirstRunGate comment). This is the full-screen, four-beat first-run "rite":
// Threshold (welcome) -> Lens (primary/secondary style, the exact same picking flow
// analysisProfileOnboarding.jsx's Step 1 uses) -> Focus (the exact same Focus-Registry chips as
// that file's Step 2) -> Seal (name + a live DNA-preview panel, then hands off to the dashboard
// that is already mounted underneath this root). The two real questions the brief specifies are
// UNCHANGED - this is a presentation layer over the same data/validation, not a third question.
//
// Deliberately reuses analysisProfileOnboarding.jsx's own `copy`/SPECIAL_STYLE_IDS/
// FEATURED_STYLE_IDS exports and the same window.TradeJournalAnalysisStyleRegistry /
// AnalysisFocusRegistry / AnalysisProfileStore calls that file's Modal makes - never a second,
// driftable copy of the style/focus catalogs or their validation.
//
// Honest scope note: unlike the Modal version, this rite does not register itself with
// window.TradeJournalAIProcessRegistry - voice/chat-driven form filling (ARCHITECTURE.md §7.14)
// is not wired into this full-screen flow yet. A trader can still fill it by hand exactly as
// before; only the "fill this open form by voice" shortcut is deferred.

const RITE_COPY = {
  fa: {
    stepThreshold: 'آستانه', stepLens: 'لنز', stepFocus: 'تمرکز', stepSeal: 'نشان',
    eyebrowThreshold: 'پیش از شروع', eyebrowLens: 'پرسش یکم', eyebrowFocus: 'پرسش دوم', eyebrowSeal: 'تکمیل',
    thresholdTitle: 'پیش از اولین چارت، بگذار بدانیم بازار را چطور می‌بینی.',
    thresholdHint: 'دو پرسش کوتاه تعیین می‌کند نوریا چطور چارت‌هایت را تحلیل کند — هر وقت خواستی از «پروفایل‌های تحلیل» می‌توانی تغییرش بدهی.',
    sealTitle: 'دی‌ان‌ای تحلیلی تو آماده است.',
    sealSubtitle: 'اسمی روی آن بگذار تا بعداً در سشن‌ها و تحلیل‌ها سریع پیدایش کنی.',
    beginButton: 'آغاز', createAndOpen: 'ایجاد پروفایل و باز کردن داشبورد',
    councilCaption: 'این پروفایل به حساب کاربری‌ات تعلق دارد، نه فقط به این کاراکتر — هر چهار مربی نوریا با همین لنز چارت‌هایت را می‌خوانند.',
    focusCountLabel: '{n} حوزه تمرکز', savingLabel: 'در حال ثبت…', sealedLabel: 'پروفایل تحلیلی ثبت شد'
  },
  ar: {
    stepThreshold: 'العتبة', stepLens: 'العدسة', stepFocus: 'التركيز', stepSeal: 'الختم',
    eyebrowThreshold: 'قبل البدء', eyebrowLens: 'السؤال الأول', eyebrowFocus: 'السؤال الثاني', eyebrowSeal: 'الإتمام',
    thresholdTitle: 'قبل أول رسم بياني، دعنا نعرف كيف تقرأ السوق.',
    thresholdHint: 'سؤالان قصيران يحددان كيف تحلل نوريا رسومك البيانية - يمكنك تغيير ذلك في أي وقت من «ملفات التحليل».',
    sealTitle: 'الحمض النووي التحليلي الخاص بك جاهز.',
    sealSubtitle: 'ضع اسماً عليه لتجده بسرعة لاحقاً في الجلسات والتحليلات.',
    beginButton: 'ابدأ', createAndOpen: 'إنشاء الملف وفتح لوحة التحكم',
    councilCaption: 'هذا الملف يخص حسابك، وليس هذه الشخصية فقط - كل المرشدين الأربعة في نوريا يقرؤون رسومك بنفس هذا العدسة.',
    focusCountLabel: '{n} مجال تركيز', savingLabel: 'جارٍ الحفظ…', sealedLabel: 'تم تسجيل ملف التحليل'
  },
  en: {
    stepThreshold: 'Threshold', stepLens: 'Lens', stepFocus: 'Focus', stepSeal: 'Seal',
    eyebrowThreshold: 'Before we begin', eyebrowLens: 'Question one', eyebrowFocus: 'Question two', eyebrowSeal: 'Finish',
    thresholdTitle: 'Before the first chart, let’s learn how you read the market.',
    thresholdHint: 'Two quick questions shape how NAVRYA analyzes your charts — change this anytime from Analysis Profiles.',
    sealTitle: 'Your analysis DNA is ready.',
    sealSubtitle: 'Give it a name so you can find it quickly later in Sessions and analyses.',
    beginButton: 'Begin', createAndOpen: 'Create profile and open dashboard',
    councilCaption: 'This profile belongs to your account, not just this character — all four NAVRYA mentors read your charts through this same lens.',
    focusCountLabel: '{n} focus areas', savingLabel: 'Saving…', sealedLabel: 'Analysis profile saved'
  },
  es: {
    stepThreshold: 'Umbral', stepLens: 'Lente', stepFocus: 'Enfoque', stepSeal: 'Sello',
    eyebrowThreshold: 'Antes de empezar', eyebrowLens: 'Primera pregunta', eyebrowFocus: 'Segunda pregunta', eyebrowSeal: 'Final',
    thresholdTitle: 'Antes del primer gráfico, veamos cómo lees el mercado.',
    thresholdHint: 'Dos preguntas rápidas determinan cómo NAVRYA analiza tus gráficos — puedes cambiarlo cuando quieras desde Perfiles de análisis.',
    sealTitle: 'Tu ADN de análisis está listo.',
    sealSubtitle: 'Ponle un nombre para encontrarlo rápido después en sesiones y análisis.',
    beginButton: 'Empezar', createAndOpen: 'Crear perfil y abrir el panel',
    councilCaption: 'Este perfil pertenece a tu cuenta, no solo a este personaje — los cuatro mentores de NAVRYA leen tus gráficos con el mismo lente.',
    focusCountLabel: '{n} áreas de enfoque', savingLabel: 'Guardando…', sealedLabel: 'Perfil de análisis guardado'
  }
};

const MERGED_COPY = {};
['fa', 'ar', 'en', 'es'].forEach((l) => { MERGED_COPY[l] = Object.assign({}, baseCopy[l], RITE_COPY[l]); });
function tr(lang, key, vars) {
  let value = (MERGED_COPY[lang] && MERGED_COPY[lang][key]) || MERGED_COPY.en[key] || key;
  if (vars) Object.keys(vars).forEach((name) => { value = value.replace('{' + name + '}', vars[name]); });
  return value;
}

function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }
function focusRegistry() { return window.TradeJournalAnalysisFocusRegistry; }

const MENTOR_IDS = ['hunter', 'commander', 'engineer', 'master'];
const CHARACTER_BY_NAVRYA_ID = Object.keys(CHARACTERS).reduce((acc, key) => {
  acc[CHARACTERS[key].navryaCharacter] = key;
  return acc;
}, {});

// ── one-time stylesheet injection ────────────────────────────────────────────────────────────
// This codebase has no CSS-in-JS layer; every other motion sheet in navrya-src/public/pages/shared
// (e.g. AiMagicFill.motion.js) injects one <style> tag once, guarded by an id check, for exactly
// the things inline React styles can't express - @keyframes, @container breakpoints and
// pseudo-elements. Every color here is a REAL design-system token (tokens/*.css), never a new
// hardcoded value, so the rite always matches whichever of the four characters mounted it.
let riteStylesInjected = false;
function ensureRiteStyles() {
  if (riteStylesInjected || typeof document === 'undefined') return;
  if (document.getElementById('nv-rite-styles')) { riteStylesInjected = true; return; }
  riteStylesInjected = true;
  const style = document.createElement('style');
  style.id = 'nv-rite-styles';
  style.textContent = `
.nv-rite{position:fixed;inset:0;z-index:100;overflow:hidden;background:var(--ink-900);color:var(--text-primary);
  font-family:var(--font-ui);container-type:inline-size;isolation:isolate;
  animation:nv-rite-mount 420ms var(--ease-out) both}
.nv-rite.nv-rite--sealed{animation:nv-rite-unmount 640ms var(--ease-standard) both}
@keyframes nv-rite-mount{from{opacity:0}to{opacity:1}}
@keyframes nv-rite-unmount{from{opacity:1;transform:none}to{opacity:0;transform:scale(1.015)}}

.nv-rite__atmos{position:absolute;inset:0;pointer-events:none;z-index:0}
.nv-rite__glow{position:absolute;inset:-10% -10% auto -10%;height:78%;
  background:radial-gradient(70% 90% at 50% 0%,var(--char-glow) 0%,transparent 72%);opacity:.9}
.nv-rite__grid{position:absolute;inset:0;opacity:.24;
  background-image:linear-gradient(var(--border-hairline) 1px,transparent 1px),linear-gradient(90deg,var(--border-hairline) 1px,transparent 1px);
  background-size:64px 64px;-webkit-mask-image:radial-gradient(85% 70% at 50% 26%,#000 0%,transparent 78%);
  mask-image:radial-gradient(85% 70% at 50% 26%,#000 0%,transparent 78%)}
.nv-rite__floor{position:absolute;inset:auto 0 0 0;height:34%;
  background:linear-gradient(to top,color-mix(in srgb,var(--char-atmosphere) 82%,transparent),transparent)}
.nv-rite__mote{position:absolute;width:2px;height:2px;border-radius:50%;background:var(--gold-warm);opacity:0;
  animation:nv-rite-drift linear infinite}
@keyframes nv-rite-drift{0%{opacity:0;transform:translateY(18px)}12%{opacity:.5}88%{opacity:.28}100%{opacity:0;transform:translateY(-170px)}}
.nv-rite__frameline{position:absolute;inset-inline:24px;z-index:1;height:1px;
  background:linear-gradient(90deg,transparent,var(--border-gold),transparent);
  transform:scaleX(0);animation:nv-rite-draw 900ms var(--ease-out) 160ms forwards}
.nv-rite__frameline--t{top:0}.nv-rite__frameline--b{bottom:0}
@keyframes nv-rite-draw{to{transform:scaleX(1)}}

.nv-rite__shell{position:relative;z-index:2;height:100%;display:grid;
  grid-template-columns:104px minmax(0,1fr) 184px;grid-template-rows:auto minmax(0,1fr) auto auto}
.nv-rite__top{grid-column:1/-1;grid-row:1;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:20px 30px 6px}
.nv-rite__topmeta{font:var(--type-caption);font-size:11px;color:var(--text-dim);margin-inline-start:14px;
  border-inline-start:1px solid var(--border-hairline);padding-inline-start:14px}
.nv-rite__skip{font-size:12px;color:var(--text-dim);padding:8px 13px;border-radius:999px;border:1px solid transparent;
  cursor:pointer;background:transparent;font:inherit;transition:color var(--dur-hover) var(--ease-out),border-color var(--dur-hover) var(--ease-out)}
.nv-rite__skip:hover{color:var(--text-primary);border-color:var(--border-hairline)}

.nv-rite__rail{grid-column:1;grid-row:2/5;position:relative;display:flex;flex-direction:column;padding:18px 0 30px}
.nv-rite__node{position:relative;flex:1;display:grid;place-items:center}
.nv-rite__node:not(:last-child)::after{content:"";position:absolute;left:calc(50% - .5px);width:1px;
  top:calc(50% + 17px);height:calc(100% - 34px);background:var(--border-hairline);transition:background 560ms var(--ease-out)}
.nv-rite__node--done:not(:last-child)::after{background:linear-gradient(to bottom,var(--char-accent),color-mix(in srgb,var(--char-accent) 30%,transparent))}
.nv-rite__dot{position:relative;width:29px;height:29px;border-radius:50%;display:grid;place-items:center;
  background:var(--ink-950);border:1px solid var(--border-hairline);color:var(--text-disabled);font-size:12px;font-weight:700;
  font-variant-numeric:tabular-nums;
  transition:border-color 320ms var(--ease-out),color 320ms var(--ease-out),transform 380ms cubic-bezier(.34,1.46,.44,1),background 320ms}
.nv-rite__node--done .nv-rite__dot{border-color:color-mix(in srgb,var(--char-accent) 55%,transparent);color:var(--char-accent);background:var(--char-active-surface)}
.nv-rite__node--now .nv-rite__dot{border-color:var(--char-accent);color:var(--parchment);background:var(--char-active-surface);transform:scale(1.18);
  box-shadow:var(--glow-active)}
.nv-rite__node--now .nv-rite__dot::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:1px solid var(--char-accent);
  animation:nv-rite-burst 1.7s var(--ease-out) infinite}
@keyframes nv-rite-burst{0%{transform:scale(.8);opacity:.65}70%,100%{transform:scale(1.85);opacity:0}}
.nv-rite__nodelabel{position:absolute;top:calc(50% + 20px);inset-inline:0;text-align:center;font-size:11px;color:var(--text-disabled);
  transition:color 320ms}
.nv-rite__node--now .nv-rite__nodelabel{color:var(--parchment);font-weight:600}
.nv-rite__node--done .nv-rite__nodelabel{color:var(--text-muted)}

.nv-rite__scene{grid-column:2;grid-row:2;display:grid;min-height:0;padding:4px 34px 0 22px}
.nv-rite__frame{grid-area:1/1;min-height:0;display:flex;flex-direction:column;gap:16px;overflow:auto;
  padding-block:4px 12px;justify-content:safe center;scrollbar-width:thin;scrollbar-color:var(--bronze) transparent}
.nv-rite__frame--in{animation:nv-rite-frame-in 520ms var(--ease-out) both}
.nv-rite__frame--out{animation:nv-rite-frame-out 300ms var(--ease-out) both;pointer-events:none}
@keyframes nv-rite-frame-in{from{opacity:0;transform:translateX(var(--nv-fx,-28px)) translateY(10px);filter:blur(6px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes nv-rite-frame-out{from{opacity:1;transform:none;filter:blur(0)}to{opacity:0;transform:translateX(calc(var(--nv-fx,-28px) * -1));filter:blur(6px)}}
.nv-rite__rise{animation:nv-rite-rise 560ms var(--ease-out) both;animation-delay:calc(var(--nv-i,0) * 55ms + 90ms)}
@keyframes nv-rite-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}

.nv-rite__eyebrow{display:flex;align-items:center;gap:10px;font-size:10.5px;letter-spacing:.22em;color:var(--char-accent);
  font-family:var(--font-display);font-weight:600;text-transform:uppercase}
.nv-rite__eyebrow::after{content:"";flex:1;height:1px;background:linear-gradient(to var(--nv-fade-dir,left),transparent,var(--divider-gold))}
.nv-rite__q{margin:0;font:var(--type-display-lg);font-size:clamp(20px,2.6cqw,30px);line-height:1.42;color:var(--parchment);
  text-wrap:balance;max-width:26ch}
.nv-rite__sub{margin:0;font-size:13.5px;line-height:1.85;color:var(--text-muted);max-width:58ch}

.nv-rite__grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(226px,100%),1fr));gap:9px}
.nv-rite__card{position:relative;display:flex;gap:11px;align-items:flex-start;text-align:start;padding:13px 14px;
  border-radius:11px;border:1px solid var(--border-hairline);width:100%;overflow:hidden;box-sizing:border-box;cursor:pointer;
  background:var(--surface-800);font:inherit;color:inherit;
  transition:border-color 180ms var(--ease-out),transform 220ms cubic-bezier(.34,1.46,.44,1),box-shadow 220ms var(--ease-out)}
.nv-rite__card:hover{transform:translateY(-2px);border-color:var(--divider-gold)}
.nv-rite__card.is-on{border-color:var(--char-accent);background:linear-gradient(160deg,var(--char-active-surface),var(--surface-800) 78%);
  box-shadow:var(--glow-soft)}
.nv-rite__card__ico{width:32px;height:32px;flex:none;border-radius:9px;display:grid;place-items:center;
  background:rgba(3,8,7,.55);border:1px solid var(--border-hairline);color:var(--text-muted);transition:color 200ms,border-color 200ms}
.nv-rite__card.is-on .nv-rite__card__ico{color:var(--char-accent);border-color:color-mix(in srgb,var(--char-accent) 45%,transparent)}
.nv-rite__card__t{display:block;font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px;padding-inline-end:18px}
.nv-rite__card.is-on .nv-rite__card__t{color:var(--char-accent)}
.nv-rite__card__d{display:block;font-size:11.5px;line-height:1.7;color:var(--text-dim)}
.nv-rite__card__k{position:absolute;inset-inline-end:11px;top:12px;color:var(--char-accent);opacity:0;transform:scale(.5);
  transition:opacity 180ms 60ms,transform 320ms cubic-bezier(.34,1.46,.44,1) 60ms}
.nv-rite__card.is-on .nv-rite__card__k{opacity:1;transform:none}

.nv-rite__searchbox{display:flex;align-items:center;gap:9px;height:41px;padding:0 13px;border-radius:9px;
  border:1px solid var(--border-hairline);background:rgba(11,20,21,.6);max-width:420px}
.nv-rite__searchbox input{flex:1;min-width:0;background:transparent;border:0;outline:none;color:var(--text-primary);
  font:inherit;font-size:12.5px}
.nv-rite__link{align-self:flex-start;background:transparent;border:0;cursor:pointer;padding:0;display:flex;
  align-items:center;gap:6px;font-size:12.5px;color:var(--char-accent);font:inherit}
.nv-rite__label{font-size:10.5px;letter-spacing:.1em;color:var(--text-disabled);font-weight:700}
.nv-rite__chips{display:flex;flex-wrap:wrap;gap:7px}
.nv-rite__chip{display:inline-flex;align-items:center;gap:6px;height:33px;padding:0 12px;border-radius:999px;font-size:12px;
  border:1px solid var(--divider-gold);background:rgba(11,20,21,.6);color:var(--text-muted);cursor:pointer;font:inherit;
  transition:transform 200ms cubic-bezier(.34,1.46,.44,1),border-color 160ms,color 160ms}
.nv-rite__chip:hover{transform:translateY(-1px);color:var(--text-primary)}
.nv-rite__chip.is-on{border-color:var(--char-accent);background:var(--char-active-surface);color:var(--char-accent);font-weight:600}
.nv-rite__input{height:41px;width:100%;box-sizing:border-box;border-radius:9px;border:1px solid var(--border-gold);
  background:rgba(11,20,21,.72);color:var(--text-primary);padding:0 12px;font:inherit;font-size:12.5px}
.nv-rite__input:focus{outline:none;border-color:var(--char-accent);box-shadow:0 0 0 3px var(--char-active-surface)}
textarea.nv-rite__input{height:auto;min-height:84px;padding:11px 12px;line-height:1.8;resize:vertical}

.nv-rite__seal{grid-column:3;grid-row:2;align-self:start;justify-self:center;padding-top:8px;position:relative;z-index:3;
  display:flex;flex-direction:column;align-items:center;pointer-events:none}
.nv-rite__portrait{position:relative;width:122px;height:122px;display:grid;place-items:center}
.nv-rite__ring{position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(var(--char-accent) calc(var(--nv-p,0) * 1%),rgba(244,234,215,.09) 0);
  transition:background 620ms var(--ease-out);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));
  mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))}
.nv-rite__orbit{position:absolute;inset:-8px;border-radius:50%;border:1px dashed color-mix(in srgb,var(--char-accent) 45%,transparent);
  animation:nv-rite-spin 32s linear infinite}
.nv-rite__halo{position:absolute;inset:-20px;border-radius:50%;animation:nv-rite-breathe 4.6s ease-in-out infinite;
  background:radial-gradient(closest-side,var(--char-glow),transparent)}
.nv-rite__face{width:96px;height:96px;border-radius:50%;object-fit:cover;display:block;
  border:1px solid color-mix(in srgb,var(--char-accent) 50%,transparent);animation:nv-rite-bob 6.2s ease-in-out infinite}
.nv-rite__pct{position:absolute;bottom:-6px;background:var(--ink-950);border-radius:999px;padding:2px 9px;
  border:1px solid color-mix(in srgb,var(--char-accent) 45%,transparent);font-size:10.5px;font-weight:700;color:var(--char-accent);
  font-variant-numeric:tabular-nums}
@keyframes nv-rite-spin{to{transform:rotate(360deg)}}
@keyframes nv-rite-breathe{0%,100%{opacity:.85}50%{opacity:1}}
@keyframes nv-rite-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.nv-rite__sealmeta{text-align:center;margin-top:14px;display:flex;flex-direction:column;gap:3px}
.nv-rite__sealmeta b{font-size:13px;color:var(--parchment);font-weight:600}
.nv-rite__sealmeta span{font-size:9px;letter-spacing:.2em;font-family:var(--font-display);color:var(--char-accent);text-transform:uppercase}

.nv-rite__council{grid-column:2/4;grid-row:3;display:flex;align-items:center;gap:16px;padding:12px 34px 0 22px;
  border-top:1px solid var(--border-hairline);margin-top:8px}
.nv-rite__councilcap{margin:0;font-size:11px;color:var(--text-dim);line-height:1.8;max-width:36ch}
.nv-rite__mentors{display:flex;gap:10px;margin-inline-start:auto}
.nv-rite__mentor{position:relative;width:38px;height:38px;border-radius:50%;flex:none;transition:transform 320ms cubic-bezier(.34,1.46,.44,1),filter 480ms}
.nv-rite__mentor img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;border:1px solid var(--border-hairline)}
.nv-rite__mentor[data-active="0"]{filter:grayscale(1) brightness(.5)}
.nv-rite__mentor[data-active="1"]{filter:none;transform:translateY(-2px)}
.nv-rite__mentor[data-active="1"] img{border-color:color-mix(in srgb,var(--char-accent) 70%,transparent);box-shadow:var(--glow-active)}

.nv-rite__actions{grid-column:1/-1;grid-row:4;display:flex;align-items:center;gap:12px;
  padding:16px 34px calc(22px + env(safe-area-inset-bottom,0px) + var(--navrya-chat-dock-reserved,0px)) 22px}
.nv-rite__spacer{margin-inline-start:auto}

.nv-rite__dna{border:1px solid var(--divider-gold);border-radius:12px;padding:16px;max-width:600px;
  background:linear-gradient(160deg,var(--char-active-surface),var(--surface-800) 82%);display:flex;flex-direction:column;gap:11px}
.nv-rite__dnahead{display:flex;align-items:center;justify-content:space-between;gap:10px}
.nv-rite__dnabar{height:6px;border-radius:3px;background:rgba(244,234,215,.08);overflow:hidden}
.nv-rite__dnabar i{display:block;height:100%;background:linear-gradient(90deg,var(--char-accent),var(--char-accent-strong));
  box-shadow:0 0 10px var(--char-accent);transition:width 560ms var(--ease-out)}
.nv-rite__dnarow{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
.nv-rite__dnakey{font-size:10.5px;letter-spacing:.1em;color:var(--text-disabled);font-weight:700}
.nv-rite__dnaval{font-size:13px;color:var(--char-accent);font-weight:600}
.nv-rite__mini{font-size:11px;padding:4px 9px;border-radius:999px;border:1px solid var(--border-hairline);color:var(--text-muted);
  background:rgba(3,8,7,.4)}

.nv-rite__helixwrap{position:relative;flex:1;min-width:120px;min-height:220px;align-self:stretch}
.nv-dna{position:relative;width:100%;height:100%;perspective:640px;pointer-events:none;opacity:.9}
.nv-dna__row{position:absolute;left:50%;top:0;width:0;height:0}
.nv-dna__spin{position:absolute;left:-52px;top:-5px;width:104px;height:10px;transform-style:preserve-3d;
  animation:nv-dna-turn var(--nv-dna-speed,20s) linear infinite}
.nv-dna__node{position:absolute;top:1px;width:8px;height:8px;margin-top:-4px;border-radius:50%}
.nv-dna__node--a{left:0;transform:translateZ(50px);background:var(--char-accent);box-shadow:0 0 8px var(--char-accent)}
.nv-dna__node--b{right:0;transform:translateZ(-50px);background:var(--char-accent-strong);opacity:.55}
.nv-dna__bridge{position:absolute;left:7px;right:7px;top:3px;height:1px;
  background:linear-gradient(90deg,var(--char-accent),transparent 46%,transparent 54%,var(--char-accent-strong));opacity:.3}
@keyframes nv-dna-turn{to{transform:rotateY(360deg)}}

.nv-rite__sealbody{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}

.nv-rite__stamp{position:absolute;inset:0;z-index:6;display:grid;place-items:center;text-align:center;gap:10px;
  background:radial-gradient(60% 60% at 50% 45%,var(--char-glow),var(--ink-900) 74%);animation:nv-rite-fade 320ms var(--ease-out) both}
.nv-rite__stampin{display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px}
.nv-rite__stampin h2{margin:0;font-size:clamp(18px,2.6cqw,25px);color:var(--parchment);font-weight:700;text-wrap:balance}
@keyframes nv-rite-fade{from{opacity:0}to{opacity:1}}

@container (max-width:1060px){
  .nv-rite__shell{grid-template-columns:92px minmax(0,1fr) 148px}
  .nv-rite__portrait{width:100px;height:100px}
  .nv-rite__face{width:80px;height:80px}
}
@container (max-width:860px){
  .nv-rite__shell{grid-template-columns:82px minmax(0,1fr)}
  .nv-rite__council{grid-column:2}
  .nv-rite__actions{grid-column:2}
  .nv-rite__seal{grid-column:2;grid-row:2;justify-self:end;align-self:start;padding-top:0}
  .nv-rite__sealmeta{display:none}
  .nv-rite__portrait{width:72px;height:72px}
  .nv-rite__face{width:56px;height:56px}
  .nv-rite__orbit{inset:-6px}
  .nv-rite__eyebrow,.nv-rite__q{padding-inline-end:88px}
  .nv-rite__scene{padding-inline:26px 20px}
  .nv-rite__helixwrap{display:none}
}
@container (max-width:720px){
  .nv-rite__shell{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr) auto auto}
  .nv-rite__top{grid-column:1;padding:14px 18px 2px}
  .nv-rite__topmeta{display:none}
  .nv-rite__rail{grid-column:1;grid-row:2;flex-direction:row;padding:10px 18px 26px}
  .nv-rite__node:not(:last-child)::after{left:auto;inset-inline-end:calc(50% + 17px);width:calc(100% - 34px);
    top:calc(50% - .5px);height:1px}
  .nv-rite__nodelabel{font-size:9.5px;top:calc(50% + 18px)}
  .nv-rite__scene{grid-column:1;grid-row:3;padding:2px 18px 0}
  .nv-rite__seal{grid-column:1;grid-row:3;justify-self:end;align-self:start;margin-top:-2px}
  .nv-rite__portrait{width:58px;height:58px}
  .nv-rite__face{width:44px;height:44px}
  .nv-rite__orbit{inset:-4px}.nv-rite__halo{inset:-10px}
  .nv-rite__pct{font-size:9px;padding:1px 6px;bottom:-7px}
  .nv-rite__eyebrow,.nv-rite__q{padding-inline-end:74px}
  .nv-rite__q{font-size:19px;max-width:none}
  .nv-rite__sub{font-size:12.5px}
  .nv-rite__grid2{grid-template-columns:minmax(0,1fr)}
  .nv-rite__council{grid-column:1;grid-row:4;flex-direction:column;align-items:stretch;gap:9px;padding:10px 18px 0}
  .nv-rite__councilcap{max-width:none;text-align:center}
  .nv-rite__mentors{margin-inline-start:0;justify-content:space-between}
  .nv-rite__actions{grid-column:1;grid-row:5;flex-wrap:wrap;padding:12px 18px calc(16px + env(safe-area-inset-bottom,0px) + var(--navrya-chat-dock-reserved,0px))}
  .nv-rite__actions .nv-rite-btn{flex:1 1 130px}
  .nv-rite__spacer{display:none}
  .nv-rite__sealbody{flex-direction:column}
}
@media (prefers-reduced-motion:reduce){
  .nv-rite,.nv-rite *{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important}
}
`;
  document.head.appendChild(style);
}

// ── decorative DNA helix (desktop only; hidden by @container above on narrow viewports) ───────
// A pure-CSS rotating double helix in the empty space beside the DNA panel on the Seal step -
// each "row" is a pair of nodes held apart in 3D via translateZ and spun with a per-row negative
// animation-delay, which staggers their phase and reads as a single continuous helical twist down
// the strand. Colors are the mounted character's own --char-accent/--char-accent-strong, so it is
// never a fixed brand color. One slow (20s/turn - deliberately unhurried), continuous rotation;
// frozen outright under prefers-reduced-motion (see the injected stylesheet above).
function DnaHelix({ rows = 26, gap = 12 }) {
  const items = React.useMemo(() => Array.from({ length: rows }, (_, i) => i), [rows]);
  return (
    <div className="nv-dna" aria-hidden="true">
      {items.map((i) => (
        <span key={i} className="nv-dna__row" style={{ top: i * gap }}>
          <span className="nv-dna__spin" style={{ animationDelay: (i * -0.72) + 's' }}>
            <i className="nv-dna__node nv-dna__node--a" />
            <i className="nv-dna__bridge" />
            <i className="nv-dna__node nv-dna__node--b" />
          </span>
        </span>
      ))}
    </div>
  );
}

const CHECK_D = 'M20 6L9 17l-5-5';
const BACK_D = 'M19 12H5M11 18l-6-6 6-6';

function useFrames(value) {
  const [frames, setFrames] = React.useState([{ v: value, id: 0, out: false, dir: 1 }]);
  const idRef = React.useRef(0);
  const prevRef = React.useRef(value);
  React.useEffect(() => {
    if (prevRef.current === value) return undefined;
    const prev = prevRef.current;
    prevRef.current = value;
    idRef.current += 1;
    const id = idRef.current;
    const dir = value > prev ? 1 : -1;
    setFrames([{ v: prev, id: id - 1, out: true, dir }, { v: value, id, out: false, dir }]);
    const t = setTimeout(() => setFrames([{ v: value, id, out: false, dir }]), 310);
    return () => clearTimeout(t);
  }, [value]);
  return frames;
}

function Motes() {
  const motes = React.useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    left: (i * 7.1 + (i % 5) * 3.4) % 96, top: 30 + ((i * 17) % 58),
    dur: 12 + (i % 6) * 2.3, delay: -(i * 1.9)
  })), []);
  return motes.map((m, i) => (
    <span key={i} className="nv-rite__mote" style={{ left: m.left + '%', top: m.top + '%', animationDuration: m.dur + 's', animationDelay: m.delay + 's' }} />
  ));
}

function Rail({ step, steps }) {
  return (
    <nav className="nv-rite__rail" aria-label="مراحل ساخت پروفایل تحلیلی">
      {steps.map((s, i) => (
        <div key={s.key} className={'nv-rite__node' + (i === step ? ' nv-rite__node--now' : i < step ? ' nv-rite__node--done' : '')}
          aria-current={i === step ? 'step' : undefined}>
          <span className="nv-rite__dot">{i < step ? <Icon name="check" size={13} /> : i + 1}</span>
          <span className="nv-rite__nodelabel">{s.label}</span>
        </div>
      ))}
    </nav>
  );
}

function StyleCard({ st, lang, selected, onClick, icon }) {
  return (
    <button type="button" className={'nv-rite__card' + (selected ? ' is-on' : '')} onClick={onClick} role="checkbox" aria-checked={selected}>
      {icon && <span className="nv-rite__card__ico"><Icon name={icon} size={17} /></span>}
      <span style={{ minWidth: 0 }}>
        <span className="nv-rite__card__t">{st.name[lang] || st.name.en}</span>
        <span className="nv-rite__card__d">{st.shortDescription[lang] || st.shortDescription.en}</span>
      </span>
      <span className="nv-rite__card__k"><Icon name="check" size={15} /></span>
    </button>
  );
}

function SectionLabel({ children }) { return <span className="nv-rite__label">{children}</span>; }

export function AnalysisProfileRite({ lang, character, navryaCharacter, onComplete, onSkip }) {
  React.useEffect(() => { ensureRiteStyles(); }, []);

  const activeLang = lang || (typeof document !== 'undefined' ? document.documentElement.lang : 'en') || 'en';
  const rtl = activeLang === 'fa' || activeLang === 'ar';
  const styles = styleRegistry();
  const focuses = focusRegistry();
  const strings = stringsFor(activeLang);
  const charConfig = CHARACTERS[character] || CHARACTERS.hunter;
  const navId = navryaCharacter || charConfig.navryaCharacter;

  const steps = [
    { key: 'threshold', label: tr(activeLang, 'stepThreshold') },
    { key: 'lens', label: tr(activeLang, 'stepLens') },
    { key: 'focus', label: tr(activeLang, 'stepFocus') },
    { key: 'seal', label: tr(activeLang, 'stepSeal') }
  ];

  const [step, setStep] = React.useState(0);
  const [primaryStyleId, setPrimaryStyleId] = React.useState('');
  const [secondaryStyleIds, setSecondaryStyleIds] = React.useState([]);
  const [hybridMode, setHybridMode] = React.useState(false);
  const [showAllStyles, setShowAllStyles] = React.useState(false);
  const [styleQuery, setStyleQuery] = React.useState('');
  const [customMethodNotes, setCustomMethodNotes] = React.useState('');
  const [youtubeUrl, setYoutubeUrl] = React.useState('');
  const [websiteUrl, setWebsiteUrl] = React.useState('');
  const [referenceUrl, setReferenceUrl] = React.useState('');
  const [focusIds, setFocusIds] = React.useState([]);
  const [customFocuses, setCustomFocuses] = React.useState([]);
  const [newFocusName, setNewFocusName] = React.useState('');
  const [newFocusDescription, setNewFocusDescription] = React.useState('');
  const [aiSuggestions, setAiSuggestions] = React.useState([]);
  const [aiSuggestLoading, setAiSuggestLoading] = React.useState(false);
  const [aiSuggestError, setAiSuggestError] = React.useState(null); // { code, status? } of the last failed suggestion request
  const [name, setName] = React.useState('');
  const [nameTouched, setNameTouched] = React.useState(false);
  const [sealing, setSealing] = React.useState(false);

  React.useEffect(() => {
    if (nameTouched) return;
    const suggested = window.TradeJournalAnalysisProfileStore ? window.TradeJournalAnalysisProfileStore.suggestedName(primaryStyleId, focusIds, activeLang) : '';
    if (suggested) setName(suggested);
  }, [primaryStyleId, focusIds, activeLang, nameTouched]);

  const frames = useFrames(step);

  const allStyles = styles ? styles.list() : [];
  const browsableStyles = allStyles.filter((s) => SPECIAL_STYLE_IDS.indexOf(s.id) === -1);
  const featured = FEATURED_STYLE_IDS.map((id) => styles && styles.get(id)).filter(Boolean);
  const special = SPECIAL_STYLE_IDS.map((id) => styles && styles.get(id)).filter(Boolean);
  const trimmedQuery = styleQuery.trim();
  // Search is scoped to analysis STYLES only, through the style registry's own search() - never
  // a mixed styles+focuses search. It never remounts the Lens step's own subtree (the crossfade in
  // useFrames only fires when `step` itself changes), so typing here keeps focus and the field
  // never "loses" what was typed when the trader later returns to this step.
  const styleSearchResults = trimmedQuery && styles ? styles.search(trimmedQuery) : null;

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
  function removeCustomFocus(id) { setCustomFocuses((prev) => prev.filter((f) => f.id !== id)); }

  const alreadyFocusNames = React.useMemo(() => {
    const registryNames = focusIds.map((id) => { const f = focuses ? focuses.get(id) : null; return f ? (f.name[activeLang] || f.name.en) : null; }).filter(Boolean);
    return registryNames.concat(customFocuses.map((f) => f.name));
  }, [focusIds, customFocuses, focuses, activeLang]);
  async function regenerateFocusSuggestions() {
    const client = window.TradeJournalAnalysisProfileAI;
    if (!client || aiSuggestLoading) return;
    setAiSuggestLoading(true);
    setAiSuggestError(null);
    try {
      const result = await client.suggestFocuses({
        primaryStyleId, secondaryStyleIds, customMethodNotes, language: activeLang,
        alreadySelected: alreadyFocusNames, alreadySuggested: aiSuggestions.map((s) => s.name)
      });
      setAiSuggestions((prev) => prev.concat(result.suggestions));
    } catch (error) {
      setAiSuggestError(toAiError(error));
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
  const lensValid = Boolean(primaryStyleId) && customNotesOk;
  const focusValid = focusIds.length > 0 || customFocuses.length > 0;

  const focusGroups = React.useMemo(() => {
    if (!primaryStyleId) return { recommended: [], optional: [] };
    if (isCustom) return { recommended: [], optional: focuses ? focuses.list() : [] };
    if (!styles) return { recommended: [], optional: [] };
    const merged = styles.mergeFocusRecommendations(primaryStyleId, secondaryStyleIds);
    return {
      recommended: merged.recommended.map((id) => focuses.get(id)).filter(Boolean),
      optional: merged.optional.map((id) => focuses.get(id)).filter(Boolean)
    };
  }, [primaryStyleId, secondaryStyleIds, isCustom, styles, focuses]);

  const primaryDef = styles ? styles.get(primaryStyleId) : null;
  const secondaryDefs = secondaryStyleIds.map((id) => styles && styles.get(id)).filter(Boolean);
  const focusDefs = focusIds.map((id) => focuses && focuses.get(id)).filter(Boolean);
  const sealPct = Math.min(100, 16 + (primaryStyleId ? 34 : 0) + Math.min(focusIds.length + customFocuses.length, 6) * 7 + (name ? 8 : 0));

  function buildDraft() {
    return {
      name: name.trim() || (window.TradeJournalAnalysisProfileStore ? window.TradeJournalAnalysisProfileStore.suggestedName(primaryStyleId, focusIds, activeLang) : ''),
      primaryStyleId, secondaryStyleIds, focusIds, customMethodNotes,
      customMethodLinks: { youtubeUrl, websiteUrl, referenceUrl }, customFocuses
    };
  }
  function submit() {
    if (sealing) return;
    setSealing(true);
    // A short, honest "sealed" beat before the dashboard (already mounted behind this full-screen
    // root) is revealed by this component unmounting - never a fabricated dashboard mock.
    setTimeout(() => onComplete(buildDraft()), 620);
  }

  const canAdvance = step === 0 ? true : step === 1 ? lensValid : step === 2 ? focusValid : Boolean(name.trim() || primaryStyleId);

  return (
    <div className={'nv-rite' + (sealing ? ' nv-rite--sealed' : '')} dir={rtl ? 'rtl' : 'ltr'} data-character={navId} lang={activeLang}>
      <div className="nv-rite__atmos" aria-hidden="true">
        <span className="nv-rite__glow" /><span className="nv-rite__grid" /><span className="nv-rite__floor" />
        <Motes />
      </div>
      <span className="nv-rite__frameline nv-rite__frameline--t" />
      <span className="nv-rite__frameline nv-rite__frameline--b" />

      <div className="nv-rite__shell">
        <header className="nv-rite__top">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <BrandLockup character={navId} orientation="horizontal" markSize={26} wordmarkSize={13} showEdition={false} />
            <span className="nv-rite__topmeta">{tr(activeLang, 'titleFirstRun')}</span>
          </div>
          <button type="button" className="nv-rite__skip" onClick={onSkip}>{tr(activeLang, 'setUpLater')}</button>
        </header>

        <Rail step={step} steps={steps} />

        <div className="nv-rite__scene">
          {frames.map((f) => (
            <div key={f.id} className={'nv-rite__frame ' + (f.out ? 'nv-rite__frame--out' : 'nv-rite__frame--in')}
              style={{ '--nv-fx': (f.dir > 0 ? -30 : 30) + 'px', '--nv-fade-dir': rtl ? 'right' : 'left' }} aria-hidden={f.out || undefined}>
              {f.v === 0 && (
                <React.Fragment>
                  <span className="nv-rite__eyebrow nv-rite__rise" style={{ '--nv-i': 0 }}>{tr(activeLang, 'eyebrowThreshold')}</span>
                  <h1 className="nv-rite__q nv-rite__rise" style={{ '--nv-i': 1 }}>{tr(activeLang, 'thresholdTitle')}</h1>
                  <p className="nv-rite__sub nv-rite__rise" style={{ '--nv-i': 2 }}>{charConfig.voiceOpening[activeLang] || charConfig.voiceOpening.en}</p>
                  <p className="nv-rite__sub nv-rite__rise" style={{ '--nv-i': 3, fontStyle: 'italic', color: 'var(--char-accent)', borderInlineStart: '2px solid var(--divider-gold)', paddingInlineStart: 14, whiteSpace: 'pre-line' }}>
                    {'“' + (charConfig.quotes[activeLang] || charConfig.quotes.en) + '”'}
                  </p>
                  <p className="nv-rite__sub nv-rite__rise" style={{ '--nv-i': 4, fontSize: 12 }}>{tr(activeLang, 'thresholdHint')}</p>
                </React.Fragment>
              )}

              {f.v === 1 && (
                <React.Fragment>
                  <span className="nv-rite__eyebrow nv-rite__rise" style={{ '--nv-i': 0 }}>{tr(activeLang, 'eyebrowLens')}</span>
                  <h2 className="nv-rite__q nv-rite__rise" style={{ '--nv-i': 1 }}>{tr(activeLang, 'step1Title')}</h2>
                  <p className="nv-rite__sub nv-rite__rise" style={{ '--nv-i': 2 }}>{tr(activeLang, 'step1Subtitle')}</p>

                  {!hybridMode ? (
                    <React.Fragment>
                      <label className="nv-rite__searchbox nv-rite__rise" style={{ '--nv-i': 3 }}>
                        <Icon name="search" size={16} style={{ color: 'var(--text-dim)' }} />
                        <input type="text" value={styleQuery} onChange={(e) => setStyleQuery(e.target.value)}
                          placeholder={tr(activeLang, 'styleSearchPlaceholder')} dir="auto" />
                      </label>

                      {styleSearchResults ? (
                        styleSearchResults.length ? (
                          <div className="nv-rite__grid2 nv-rite__rise" style={{ '--nv-i': 4 }}>
                            {styleSearchResults.map((st) => (
                              <StyleCard key={st.id} st={st} lang={activeLang} selected={primaryStyleId === st.id} onClick={() => pickPrimary(st.id)}
                                icon={st.id === 'hybrid' ? 'sparkle' : st.id === 'custom_method' ? 'edit' : st.id === 'general_analysis' ? 'globe' : 'execution'} />
                            ))}
                          </div>
                        ) : (
                          <span className="nv-rite__rise" style={{ '--nv-i': 4, fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'styleSearchEmpty')}</span>
                        )
                      ) : (
                        <React.Fragment>
                          <div className="nv-rite__grid2 nv-rite__rise" style={{ '--nv-i': 4 }}>
                            {featured.map((st) => (
                              <StyleCard key={st.id} st={st} lang={activeLang} selected={primaryStyleId === st.id} onClick={() => pickPrimary(st.id)} icon="execution" />
                            ))}
                          </div>

                          <button type="button" className="nv-rite__link nv-rite__rise" style={{ '--nv-i': 5 }} onClick={() => setShowAllStyles((v) => !v)}>
                            <Icon name={showAllStyles ? 'collapse' : 'expand'} size={14} />
                            {tr(activeLang, showAllStyles ? 'hideAll' : 'viewAll')}
                          </button>

                          {showAllStyles && (
                            <div className="nv-rite__rise navrya-scroll" style={{ '--nv-i': 6, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 260, overflowY: 'auto', paddingInlineEnd: 2 }}>
                              {styles.categories().map((cat) => {
                                const items = browsableStyles.filter((s) => s.category === cat.id);
                                if (!items.length) return null;
                                return (
                                  <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <SectionLabel>{cat.name[activeLang] || cat.name.en}</SectionLabel>
                                    <div className="nv-rite__grid2">
                                      {items.map((st) => (
                                        <StyleCard key={st.id} st={st} lang={activeLang} selected={primaryStyleId === st.id} onClick={() => pickPrimary(st.id)} />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="nv-rite__rise" style={{ '--nv-i': 7, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <SectionLabel>{tr(activeLang, 'moreWays')}</SectionLabel>
                            <div className="nv-rite__grid2">
                              {special.map((st) => (
                                <StyleCard key={st.id} st={st} lang={activeLang} selected={primaryStyleId === st.id || (st.id === 'hybrid' && hybridMode)} onClick={() => pickPrimary(st.id)}
                                  icon={st.id === 'hybrid' ? 'sparkle' : st.id === 'custom_method' ? 'edit' : 'globe'} />
                              ))}
                            </div>
                          </div>
                        </React.Fragment>
                      )}

                      {isCustom && (
                        <div className="nv-rite__rise" style={{ '--nv-i': 8, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 460 }}>
                          <SectionLabel>{tr(activeLang, 'customNotesLabel')}</SectionLabel>
                          <textarea className="nv-rite__input" value={customMethodNotes} onChange={(e) => setCustomMethodNotes(e.target.value)}
                            placeholder={tr(activeLang, 'customNotesPlaceholder')} dir="auto" rows={3} />
                          {!customNotesOk && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(activeLang, 'customNotesHint')}</span>}
                        </div>
                      )}

                      {isCustom && (
                        <div className="nv-rite__rise" style={{ '--nv-i': 9, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
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
                                <input type="url" className="nv-rite__input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" dir="ltr"
                                  style={{ borderColor: invalid || notYoutube ? 'var(--danger)' : undefined }} />
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
                      <button type="button" className="nv-rite__link nv-rite__rise" style={{ '--nv-i': 3, color: 'var(--text-muted)' }}
                        onClick={() => { setHybridMode(false); setPrimaryStyleId(''); setSecondaryStyleIds([]); }}>
                        <Icon name="active-arrow" size={14} style={{ transform: rtl ? 'none' : 'rotate(180deg)' }} />
                        {tr(activeLang, 'backToStyles')}
                      </button>
                      <div className="nv-rite__rise" style={{ '--nv-i': 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <SectionLabel>{tr(activeLang, 'hybridPrimary')}</SectionLabel>
                        <div className="nv-rite__grid2">
                          {browsableStyles.map((st) => (
                            <StyleCard key={st.id} st={st} lang={activeLang} selected={primaryStyleId === st.id} onClick={() => pickHybridPrimary(st.id)} />
                          ))}
                        </div>
                      </div>
                      {primaryStyleId && (
                        <div className="nv-rite__rise" style={{ '--nv-i': 5, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <SectionLabel>{tr(activeLang, 'hybridSecondary')}</SectionLabel>
                          <div className="nv-rite__grid2">
                            {browsableStyles.filter((st) => st.id !== primaryStyleId).map((st) => (
                              <StyleCard key={st.id} st={st} lang={activeLang} selected={secondaryStyleIds.indexOf(st.id) > -1} onClick={() => toggleSecondary(st.id)} />
                            ))}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  )}
                </React.Fragment>
              )}

              {f.v === 2 && (
                <React.Fragment>
                  <span className="nv-rite__eyebrow nv-rite__rise" style={{ '--nv-i': 0 }}>{tr(activeLang, 'eyebrowFocus')}</span>
                  <h2 className="nv-rite__q nv-rite__rise" style={{ '--nv-i': 1 }}>{tr(activeLang, 'step2Title')}</h2>
                  <p className="nv-rite__sub nv-rite__rise" style={{ '--nv-i': 2 }}>{tr(activeLang, 'step2Subtitle')}</p>

                  {focusGroups.recommended.length > 0 && (
                    <div className="nv-rite__rise" style={{ '--nv-i': 3, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <SectionLabel>{tr(activeLang, 'recommended')}</SectionLabel>
                      <div className="nv-rite__chips">
                        {focusGroups.recommended.map((f2) => (
                          <button key={f2.id} type="button" className={'nv-rite__chip' + (focusIds.indexOf(f2.id) > -1 ? ' is-on' : '')} onClick={() => toggleFocus(f2.id)}>
                            {focusIds.indexOf(f2.id) > -1 && <Icon name="check" size={12} />}{f2.name[activeLang] || f2.name.en}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {focusGroups.optional.length > 0 && (
                    <div className="nv-rite__rise" style={{ '--nv-i': 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <SectionLabel>{tr(activeLang, 'more')}</SectionLabel>
                      <div className="nv-rite__chips navrya-scroll" style={{ maxHeight: 160, overflowY: 'auto' }}>
                        {focusGroups.optional.map((f2) => (
                          <button key={f2.id} type="button" className={'nv-rite__chip' + (focusIds.indexOf(f2.id) > -1 ? ' is-on' : '')} onClick={() => toggleFocus(f2.id)}>
                            {focusIds.indexOf(f2.id) > -1 && <Icon name="check" size={12} />}{f2.name[activeLang] || f2.name.en}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <span className="nv-rite__rise" style={{ '--nv-i': 5, fontSize: 11.5, color: 'var(--text-dim)' }}>
                    {tr(activeLang, 'selectedCount', { n: focusIds.length + customFocuses.length })}
                  </span>

                  <div className="nv-rite__rise" style={{ '--nv-i': 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SectionLabel>{tr(activeLang, 'addOwnFocusLabel')}</SectionLabel>
                    {customFocuses.length > 0 && (
                      <div className="nv-rite__chips">
                        {customFocuses.map((f2) => (
                          <span key={f2.id} title={f2.description || ''} className="nv-rite__chip is-on" style={{ paddingInlineEnd: 6, cursor: 'default' }}>
                            {f2.origin === 'ai' && <span style={{ fontSize: 9, letterSpacing: '.06em', padding: '2px 5px', borderRadius: 5, background: 'rgba(3,8,7,.5)' }}>{tr(activeLang, 'aiSuggestBadge')}</span>}
                            {f2.name}
                            <button type="button" onClick={() => removeCustomFocus(f2.id)} aria-label={tr(activeLang, 'cancel')}
                              style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', borderRadius: '50%', cursor: 'pointer', border: 0, background: 'transparent', color: 'inherit' }}>
                              <Icon name="close" size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input type="text" className="nv-rite__input" value={newFocusName} onChange={(e) => setNewFocusName(e.target.value)} dir="auto"
                        placeholder={tr(activeLang, 'addOwnFocusNamePlaceholder')}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewCustomFocus(); } }}
                        style={{ flex: '1 1 200px' }} />
                      <input type="text" className="nv-rite__input" value={newFocusDescription} onChange={(e) => setNewFocusDescription(e.target.value)} dir="auto"
                        placeholder={tr(activeLang, 'addOwnFocusDescriptionPlaceholder')}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewCustomFocus(); } }}
                        style={{ flex: '1 1 200px' }} />
                      <Button variant="secondary" size="sm" icon="plus" disabled={!newFocusName.trim()} onClick={submitNewCustomFocus}>{tr(activeLang, 'addOwnFocusButton')}</Button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 2 }}>
                      <Button variant="ghost" size="sm" icon="sparkle" disabled={!primaryStyleId || aiSuggestLoading} onClick={regenerateFocusSuggestions}>
                        {aiSuggestLoading ? tr(activeLang, 'aiSuggestLoading') : tr(activeLang, 'aiSuggestButton')}
                      </Button>
                      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'aiSuggestHint')}</span>
                    </div>
                    <AiErrorNotice lang={activeLang} error={aiSuggestError} onRetry={regenerateFocusSuggestions} busy={aiSuggestLoading} />
                    {aiSuggestions.length > 0 && (
                      <div className="nv-rite__chips">
                        {aiSuggestions.map((s) => (
                          <span key={s.name} title={s.description || ''} className="nv-rite__chip" style={{ paddingInlineEnd: 6, cursor: 'default', borderStyle: 'dashed' }}>
                            <span style={{ fontSize: 9, letterSpacing: '.06em', padding: '2px 5px', borderRadius: 5, background: 'rgba(3,8,7,.4)', color: 'var(--gold-warm)' }}>{tr(activeLang, 'aiSuggestBadge')}</span>
                            {s.name}
                            <button type="button" onClick={() => acceptAiSuggestion(s)} style={{ height: 21, padding: '0 8px', borderRadius: 999, cursor: 'pointer', border: 0, fontSize: 10.5, fontWeight: 600, background: 'var(--char-accent)', color: 'var(--ink-950)' }}>
                              {tr(activeLang, 'aiSuggestAdd')}
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )}

              {f.v === 3 && (
                <React.Fragment>
                  <span className="nv-rite__eyebrow nv-rite__rise" style={{ '--nv-i': 0 }}>{tr(activeLang, 'eyebrowSeal')}</span>
                  <h2 className="nv-rite__q nv-rite__rise" style={{ '--nv-i': 1 }}>{tr(activeLang, 'sealTitle')}</h2>
                  <p className="nv-rite__sub nv-rite__rise" style={{ '--nv-i': 2 }}>{tr(activeLang, 'sealSubtitle')}</p>

                  <div className="nv-rite__sealbody nv-rite__rise" style={{ '--nv-i': 3 }}>
                    <div className="nv-rite__dna" style={{ flex: '1 1 380px' }}>
                      <div className="nv-rite__dnahead">
                        <SectionLabel>{tr(activeLang, 'dnaLabel')}</SectionLabel>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tr(activeLang, 'focusCountLabel', { n: focusIds.length + customFocuses.length })}</span>
                      </div>
                      <div className="nv-rite__dnabar"><i style={{ width: Math.min(100, (focusIds.length + customFocuses.length) * 14) + '%' }} /></div>
                      {!primaryDef ? (
                        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{tr(activeLang, 'dnaEmpty')}</span>
                      ) : (
                        <React.Fragment>
                          <div className="nv-rite__dnarow"><span className="nv-rite__dnakey">{tr(activeLang, 'dnaPrimary')}</span><span className="nv-rite__dnaval">{primaryDef.name[activeLang] || primaryDef.name.en}</span></div>
                          {secondaryDefs.length > 0 && (
                            <div className="nv-rite__dnarow"><span className="nv-rite__dnakey">{tr(activeLang, 'dnaSecondary')}</span>
                              <span className="nv-rite__dnaval">{secondaryDefs.map((s) => s.name[activeLang] || s.name.en).join(' + ')}</span></div>
                          )}
                          <div className="nv-rite__dnarow"><span className="nv-rite__dnakey">{tr(activeLang, 'dnaFocus')}</span></div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {focusDefs.map((f2) => <span key={f2.id} className="nv-rite__mini">{f2.name[activeLang] || f2.name.en}</span>)}
                            {customFocuses.map((f2) => <span key={f2.id} className="nv-rite__mini" style={{ borderColor: 'var(--char-accent)', color: 'var(--char-accent)' }}>{f2.name}</span>)}
                          </div>
                        </React.Fragment>
                      )}
                    </div>
                    <div className="nv-rite__helixwrap"><DnaHelix /></div>
                  </div>

                  <div className="nv-rite__rise" style={{ '--nv-i': 4, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 440 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>{tr(activeLang, 'nameLabel')}</label>
                    <input type="text" className="nv-rite__input" value={name} dir="auto"
                      onChange={(e) => { setName(e.target.value); setNameTouched(true); }} style={{ height: 41 }} />
                  </div>
                </React.Fragment>
              )}
            </div>
          ))}
        </div>

        <div className="nv-rite__seal">
          <div className="nv-rite__portrait" style={{ '--nv-p': sealPct }}>
            <span className="nv-rite__halo" /><span className="nv-rite__orbit" /><span className="nv-rite__ring" />
            <img className="nv-rite__face" src={assetUrl('assets/portraits/portrait-' + navId + '.webp')} alt="" />
            <span className="nv-rite__pct">{sealPct}٪</span>
          </div>
          <div className="nv-rite__sealmeta">
            <b>{strings.charTitle ? strings.charTitle[navId] : ''}</b>
          </div>
        </div>

        <div className="nv-rite__council">
          <p className="nv-rite__councilcap">{tr(activeLang, 'councilCaption')}</p>
          <div className="nv-rite__mentors">
            {MENTOR_IDS.map((id) => (
              <span key={id} className="nv-rite__mentor" data-active={id === navId ? 1 : 0} title={strings.charTitle ? strings.charTitle[id] : id}>
                <img src={assetUrl('assets/portraits/portrait-' + id + '.webp')} alt={strings.charTitle ? strings.charTitle[id] : id} />
              </span>
            ))}
          </div>
        </div>

        <div className="nv-rite__actions">
          {step > 0 && (
            <Button className="nv-rite-btn" variant="ghost" onClick={() => setStep((v) => v - 1)}>{tr(activeLang, 'back')}</Button>
          )}
          <span className="nv-rite__spacer" />
          {step < 3 ? (
            <Button className="nv-rite-btn" variant="primary" iconAfter="active-arrow" disabled={!canAdvance} onClick={() => setStep((v) => v + 1)}>
              {step === 0 ? tr(activeLang, 'beginButton') : tr(activeLang, 'next')}
            </Button>
          ) : (
            <Button className="nv-rite-btn" variant="primary" icon="check" loading={sealing} disabled={!canAdvance} onClick={submit}>
              {sealing ? tr(activeLang, 'savingLabel') : tr(activeLang, 'createAndOpen')}
            </Button>
          )}
        </div>
      </div>

      {sealing && (
        <div className="nv-rite__stamp">
          <div className="nv-rite__stampin">
            <Icon name="check" size={46} style={{ color: 'var(--char-accent)' }} />
            <h2>{tr(activeLang, 'sealedLabel')}</h2>
          </div>
        </div>
      )}
    </div>
  );
}
