import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { build } from 'esbuild';

// ChatDock capsule design conformance (artbook plates III and XIV-XVIII: Forms.dc.html, VoiceForms,
// VoiceSession, VoiceScenario, VoiceAccount, VoicePsychology). The real components are bundled and
// rendered to static markup, and every number below is the value the plate draws - colours, radii,
// sizes, paddings, the card recipe - so a surface can never drift from the design by a hand-typed
// literal. Real-browser pixel comparison stays the user's own pass; this proves the values.

const root = process.cwd();
const assistantDir = path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant').replace(/\\/g, '/');
const tmp = await mkdtemp(path.join(os.tmpdir(), 'navrya-plates-'));
after(() => rm(tmp, { recursive: true, force: true }));

const bundled = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { ChatDock } from '${assistantDir}/ChatDock.jsx';
      import { ChatResponsePopover } from '${assistantDir}/ChatResponsePopover.jsx';
      import { VoiceConsole } from '${assistantDir}/VoiceConsole.jsx';
      export { React, renderToStaticMarkup, ChatDock, ChatResponsePopover, VoiceConsole };
    `,
    resolveDir: root, loader: 'jsx'
  },
  bundle: true, format: 'esm', platform: 'node', write: false, jsx: 'transform', logLevel: 'error',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }
});
const bundlePath = path.join(tmp, 'plates.mjs');
await writeFile(bundlePath, bundled.outputFiles[0].text);
const { React, renderToStaticMarkup, ChatDock, ChatResponsePopover, VoiceConsole } = await import(pathToFileURL(bundlePath).href);
const h = React.createElement;

const companion = { name: 'استاد', portrait: '/portrait.webp' };
const models = [{ id: 'openai', label: 'ChatGPT', knockout: true }, { id: 'anthropic', label: 'Claude' }];
const dockBase = {
  companion, placeholder: 'از استاد بپرس…', inputLabel: 'پیام به استاد', dir: 'rtl', models, model: 'openai', onModelChange() {},
  onVoiceToggle() {}, voiceLabels: { start: 'گفتگوی صوتی' }, sendLabel: 'ارسال', onAdd() {}, addLabel: 'پیوست', toolsLabel: 'پیوست و ابزارها',
  onHistory() {}, historyLabel: 'گفتگوهای قبلی', openConversationLabel: 'باز کردن گفتگو'
};
const flat = (html) => html.replace(/></g, '>\n<');
function expectAll(name, html, fragments) {
  for (const fragment of fragments) assert.ok(html.includes(fragment), name + ' is missing: ' + fragment);
}
function orderOf(html, fragments) {
  let at = -1;
  for (const fragment of fragments) {
    const next = html.indexOf(fragment, at + 1);
    assert.ok(next > at, 'order broken at: ' + fragment);
    at = next;
  }
}

// The card recipe every surface shares (plate III, "capsule" / "peek" / "scroll").
const CARD_EDGE = 'border:1px solid rgba(183,138,74,.45)';
const CARD_GRADIENT = 'background:linear-gradient(180deg,color-mix(in srgb,var(--char-accent) 11%,transparent) 0%,#0B0E14 38%,#0A0D12 100%),#07090D';
const CARD_SHADOW = 'box-shadow:0 26px 64px rgba(0,0,0,.6),0 0 40px color-mix(in srgb,var(--char-accent) 10%,transparent),inset 0 1px 0 rgba(244,234,215,.06)';
const GRABBER = 'position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:4px;background:rgba(244,234,215,.16)';
const TICK = 'position:absolute;top:9px;';

test('plate III "capsule": 600px card with the .45 gold edge, the accent gradient over the stage colour, the grabber and both corner ticks', () => {
  const html = renderToStaticMarkup(h(ChatDock, dockBase));
  expectAll('capsule', html, [
    'max-width:600px', CARD_EDGE, CARD_GRADIENT, CARD_SHADOW, GRABBER,
    'padding:12px;min-height:68px', 'gap:8px', 'border-radius:20px 20px 20px 20px',
    TICK + 'inset-inline-end:9px;width:9px;height:9px;pointer-events:none;border-top:1px solid rgba(214,175,107,.55);border-inline-end:1px solid rgba(214,175,107,.55)',
    TICK + 'inset-inline-start:9px;width:9px;height:9px;pointer-events:none;border-top:1px solid rgba(214,175,107,.55);border-inline-start:1px solid rgba(214,175,107,.55)'
  ]);
});

test('plate III "capsule": portrait (40, ring .6, green dot), the input, "+", the engine and the one primary - in that order, with the design\'s sizes and colours', () => {
  const html = renderToStaticMarkup(h(ChatDock, dockBase));
  expectAll('composer', html, [
    // portrait: 40px, 1.5px ring at 60% of the accent, the image inset 3px, a 9px green dot with a 2px stage ring
    'width:40px;height:40px;flex:none', 'border:1.5px solid color-mix(in srgb,var(--char-accent) 60%,transparent)',
    'top:3px;left:3px;width:34px;height:34px;border-radius:999px', 'width:9px;height:9px;border-radius:999px;background:#2ECC71;box-shadow:0 0 0 2px #0A0D12',
    // input: 44px tall, 14.5px, #F4EAD7, the accent caret
    'height:44px', 'font-size:14.5px;color:#F4EAD7;caret-color:var(--char-accent)',
    // "+" : 40 x 40, radius 13, no edge, #ACA994
    'width:40px;height:40px;flex:none;display:grid;place-items:center;padding:0;cursor:pointer;border-radius:13px;border:1px solid transparent;background:transparent;color:#ACA994',
    // engine: the same with the .10 hairline
    'border-radius:13px;border:1px solid rgba(244,234,215,.10)',
    // primary: 44 x 44, radius 14, accent fill and edge, the character's on-accent ink
    'width:44px;height:44px', 'border-radius:14px', 'border:1px solid var(--char-accent);background:var(--char-accent);color:var(--char-on-accent)'
  ]);
  orderOf(html, ['navrya-dock-mascot', '<input', 'navrya-dock-tools', 'navrya-dock-engine', 'navrya-dock-primary-action']);
  assert.doesNotMatch(html, /navrya-dock-mic/, 'one primary: the second voice button only exists while there is typed text');
  assert.match(html, /placeholder="از استاد بپرس…"/);
  assert.match(html, /aria-label="پیام به استاد"/);
});

test('plate III "seed": 64px portrait in the corner with a status ring; the 56px variant with the "reply ready" pill and a badge', () => {
  const plain = renderToStaticMarkup(h(ChatDock, { ...dockBase, shape: 'seed', seedLabel: 'باز کردن استاد' }));
  expectAll('seed', plain, [
    'width:64px;height:64px;border-radius:50%', 'border:1px solid rgba(183,138,74,.6);background:#0B0E14',
    'box-shadow:0 14px 34px rgba(0,0,0,.55),0 0 26px color-mix(in srgb,var(--char-accent) 22%,transparent)',
    'width:54px;height:54px;border-radius:50%;border:2px solid var(--char-accent)', 'width:46px;height:46px;border-radius:50%;object-fit:cover',
    'aria-label="باز کردن استاد"'
  ]);
  assert.doesNotMatch(plain, /min-width:22px/, 'no badge without an unseen reply');
  const badged = renderToStaticMarkup(h(ChatDock, { ...dockBase, shape: 'seed', unseenCount: 1, seedLabel: 'باز کردن استاد', seedPillLabel: 'پاسخ آماده است · دیدن' }));
  expectAll('seed+pill', badged, [
    'width:56px;height:56px;border-radius:50%', 'width:46px;height:46px;border-radius:50%;border:2px solid var(--char-accent)', 'width:38px;height:38px',
    'min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:var(--char-accent);color:var(--char-on-accent);font-size:12px;font-weight:700',
    'box-shadow:0 0 0 2px #07090D',
    'height:44px;padding:0 14px;border-radius:999px', 'border:1px solid rgba(183,138,74,.45);background:#0B0E14;font-size:13px;color:#EDE4D3', 'box-shadow:0 10px 26px rgba(0,0,0,.5)',
    'پاسخ آماده است · دیدن'
  ]);
});

test('plate III "peek": two lines inside the frame, the receipt pill, quick choices, expand and close', () => {
  const html = renderToStaticMarkup(h(ChatResponsePopover, {
    open: true, shape: 'peek', joined: true, companion, justNowLabel: 'استاد · همین حالا',
    messages: [{ role: 'assistant', content: 'فرم ایجاد حساب را باز کردم. اول بگو: حساب شخصی است یا حساب فرم؟' }],
    meta: ['فرم باز شد'], choices: [{ label: 'حساب فرم', value: 'prop' }, { label: 'حساب شخصی', value: 'personal' }],
    peekLabels: { expand: 'باز کردن گفتگو', close: 'بستن پیش‌نمایش' }, onExpand() {}, onClose() {}
  }));
  expectAll('peek', html, [
    CARD_EDGE, CARD_GRADIENT, CARD_SHADOW, GRABBER, 'border-radius:20px 20px 0px 0px', 'border-bottom:0',
    'padding:18px 14px 12px 12px', 'font-size:11.5px;color:#9A968A', 'width:6px;height:6px;border-radius:50%;background:var(--char-accent)',
    // the receipt pill: 20px, green on a 10% green
    'height:20px;padding:0 8px;border-radius:999px;font-size:11px', 'background:rgba(46,204,113,.10);color:#2ECC71',
    // the text: 14px, 1.85, #EDE4D3, clamped to two lines
    'font-size:14px;line-height:1.85;color:#EDE4D3', '-webkit-line-clamp:2',
    // quick choices: 32px pills at 45% / 10% of the accent, soft accent text
    'height:32px;padding:0 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--char-accent) 45%,transparent);background:color-mix(in srgb,var(--char-accent) 10%,transparent);color:var(--char-accent-soft);font-size:12.5px;font-weight:500',
    // expand + close: 34px, radius 11, #ACA994
    'width:34px;height:34px;flex:none;border-radius:11px', 'color:#ACA994', 'aria-label="باز کردن گفتگو"', 'aria-label="بستن پیش‌نمایش"'
  ]);
  orderOf(html, ['استاد · همین حالا', 'فرم ایجاد حساب', 'حساب فرم', 'باز کردن گفتگو', 'بستن پیش‌نمایش']);
});

test('plate III "scroll": header (36 portrait, name 15/700, engine chip, status), history / pin / collapse / close, the divider, and the body\'s messages, receipt with undo, feedback row', () => {
  const html = renderToStaticMarkup(h(ChatResponsePopover, {
    open: true, shape: 'scroll', joined: true, companion, statusLabel: 'آماده · روی داشبورد', model: models[0],
    engineMenu: { items: [{ key: 'openai', label: 'ChatGPT', role: 'menuitemradio', active: true }], switchLabel: 'تعویض موتور — الان ChatGPT' },
    onHistory() {}, historyLabel: 'گفتگوهای قبلی', onPinToggle() {}, pinLabel: 'چسباندن به کنار', onFold() {}, onClose() {},
    sizeLabels: { fold: 'جمع کردن', close: 'بستن' }, todayLabel: 'امروز', locale: 'fa',
    messages: [
      { role: 'user', content: 'برو به قسمت حساب‌ها', at: Date.now() },
      { role: 'assistant', content: 'فرم ایجاد حساب را باز کردم.', at: Date.now(), latencyMs: 4600 }
    ],
    meta: ['به داشبورد رفتم'], undo: { label: 'بازگشت', run() {} }, feedback: { receiptId: 'r' },
    feedbackLabels: { prompt: 'درست انجام شد؟', correct: 'درست بود', rememberThis: 'دفعهٔ بعد همین را انجام بده', wrong: 'اشتباه بود', wrongAction: 'کار اشتباه', wrongTarget: 'مقدار اشتباه' },
    onFeedbackCorrect() {}, onFeedbackRemember() {}, onFeedbackWrongAction() {},
    messageActionLabels: { copy: 'کپی', copied: 'کپی شد', regenerate: 'پاسخ دیگر' }, onRegenerate() {}
  }));
  expectAll('scroll', html, [
    CARD_EDGE, CARD_GRADIENT, CARD_SHADOW, GRABBER,
    // header
    'padding:18px 12px 12px 12px', 'font-size:15px;font-weight:700;color:#F4EAD7', 'dir="ltr"', 'height:26px;padding:0 6px 0 8px;border-radius:999px',
    'font-size:11.5px;color:#ACA994', 'font-size:12px;color:#ACA994', 'background:#2ECC71',
    'aria-label="گفتگوهای قبلی"', 'aria-label="چسباندن به کنار"', 'aria-label="جمع کردن"', 'aria-label="بستن"',
    'width:36px;height:36px;flex:none;border-radius:12px',
    // the divider and the body
    'height:1px;background:rgba(244,234,215,.07);margin:0 14px', 'padding:14px 16px 16px;display:flex;flex-direction:column;gap:16px',
    // user bubble: 80%, tinted 13% / 28%, 13.5 / 1.85, the tail corner 5
    'max-width:80%', 'border:1px solid color-mix(in srgb,var(--char-accent) 28%,transparent);background:color-mix(in srgb,var(--char-accent) 13%,transparent)',
    'font-size:13.5px;line-height:1.85;color:#F4EAD7', 'border-end-end-radius:5px',
    // assistant: 28 portrait, label 11.5 #9A968A, text 14 / 1.95 #EDE4D3
    'width:28px;height:28px', 'font-size:11.5px;color:#9A968A', 'font-size:14px;line-height:1.95;color:#EDE4D3',
    // receipt with undo
    'min-height:34px', 'border:1px solid rgba(183,138,74,.36);background:rgba(183,138,74,.07)', 'font-size:12.5px;color:#E9DFC9',
    'background:rgba(46,204,113,.14);color:#2ECC71', 'width:1px;height:14px', 'color:#D6AF6B;font-size:12px', 'بازگشت',
    // feedback row: 30px buttons, radius 10
    'width:30px;height:30px;flex:none;display:grid;place-items:center;padding:0;border-radius:10px', 'aria-label="درست بود"', 'aria-label="دفعهٔ بعد همین را انجام بده"', 'aria-label="اشتباه بود"', 'aria-label="کپی"', 'aria-label="پاسخ دیگر"'
  ]);
  orderOf(html, ['گفتگوهای قبلی', 'چسباندن به کنار', 'جمع کردن', 'برو به قسمت حساب‌ها', 'استاد · ۴٫۶', 'به داشبورد رفتم', 'بازگشت', 'درست انجام شد؟', 'کپی', 'پاسخ دیگر']);
});

test('plate III "scroll" composer: the tools button, the input and the voice button only - the portrait and the engine live in the header', () => {
  const html = renderToStaticMarkup(h(ChatDock, { ...dockBase, shape: 'scroll', surfaceJoined: true, replyAvailable: true }, h('div', null, 'reply')));
  assert.doesNotMatch(html, /navrya-dock-mascot/);
  assert.doesNotMatch(html, /navrya-dock-engine/);
  orderOf(html, ['navrya-dock-tools', '<input', 'navrya-dock-primary-action']);
  expectAll('slim composer', html, ['border-radius:0px 0px 20px 20px', 'border-top:0', 'background:#0A0D12', 'position:absolute;top:0;inset-inline-start:14px;inset-inline-end:14px;height:1px;background:rgba(244,234,215,.07)']);
});

// ---- voice in forms (plates XIV-XVIII) ----------------------------------------------------------

const voiceBase = {
  voiceState: 'listening', voiceMuted: false, elapsedSeconds: 21, dotColor: 'var(--char-accent)', phaseLabel: 'در حال گوش دادن', phaseCaption: 'بگو',
  strings: { mute: 'قطع میکروفون', unmute: 'وصل', type: 'برگشت به تایپ', close: 'پایان گفتگوی صوتی', stopReply: 'توقف', endMessage: 'پایان', minimize: 'جمع کردن', analysing: '…', heardLabel: 'شنیدم', replyLabel: 'پاسخ', listeningPlaceholder: 'می‌شنوم', captionsOn: 'زیرنویس', captionsOff: 'زیرنویس' },
  companion, voiceHeardText: 'هر نیم ساعت', voiceReplyCaption: 'هر چند دقیقه یک بار سشن را به‌روز کنم؟', dir: 'rtl', numberFormat: (n) => String(n)
};
const formVoice = {
  processId: 'session-create', title: 'سشن جدید', calm: false, index: 5, total: 6, current: { path: 'loop', label: 'لوپ / بازه به‌روزرسانی (دقیقه)' },
  fields: [
    { path: 'a', label: 'نوع حساب', state: 'done' }, { path: 'b', label: 'نام فرم و برنامه', state: 'done' }, { path: 'c', label: 'ضرر روزانه', state: 'pending' },
    { path: 'd', label: 'حداکثر افت', state: 'todo' }, { path: 'e', label: 'لوپ', state: 'current' }
  ],
  choices: [{ value: 15, label: '۱۵' }, { value: 30, label: '۳۰' }], said: [{ text: 'ضرر روزانه پنج درصده', time: '۱۵:۲۴' }],
  modeChips: [{ key: 'mode', tone: 'gold', icon: 'star', label: 'پروفایل من' }, { key: 'ask', tone: 'neutral', icon: 'check', label: 'هر فیلد را بپرس' }],
  canSkip: true, engaged: true, questionText: 'هر چند دقیقه یک بار سشن را به‌روز کنم؟'
};
const labels = { questionOf: 'سؤال {index} از {total}', progress: '{index} از {total}', skip: 'رد کردن', skipQuestion: 'رد کردن این سؤال', later: 'بعداً ادامه بده', calm: 'حالت آرام', voiceChatOn: 'گفتگوی صوتی · «{form}»', waitingConfirm: 'منتظر تأیید تو', voice: 'صوتی' };

// What was heard belongs to the current question: it shows while the user is answering, never left over under a new one.
test('plates XIV / XV "voice bar": welded to the dialog - 0 0 18 18 corners, the .55 edge with the lighter joint, the weld gradient, the question block, the choices, the progress and the row', () => {
  const html = renderToStaticMarkup(h(VoiceConsole, { ...voiceBase, voiceState: 'user_speaking', layout: 'weld', formVoice: { ...formVoice, fields: [], index: 5, total: 6 }, formVoiceLabels: labels, onFormVoiceSkip() {}, onFormVoiceChoice() {} }));
  expectAll('bar', html, [
    'border-radius:0 0 18px 18px;border:1px solid rgba(183,138,74,.55);border-top:1px solid rgba(214,175,107,.35)',
    'background:linear-gradient(180deg,color-mix(in srgb,var(--char-accent) 13%,transparent) 0%,#0B0E14 60%,#0A0D12 100%),#07090D',
    'box-shadow:0 26px 60px rgba(0,0,0,.6),0 0 40px color-mix(in srgb,var(--char-accent) 12%,transparent)',
    // the identity block: 44 portrait with the breathing ring and an 11px accent dot
    'padding:14px 16px 4px', 'gap:12px', 'width:44px;height:44px', 'inset:-5px', 'animation:navrya-cap-pulse 1400ms ease-in-out infinite', 'width:11px;height:11px;border-radius:999px;background:var(--char-accent)',
    // source line, question, heard (soft accent)
    'font-size:11.5px;color:#9A968A', 'سؤال 5 از 6', 'font-size:15.5px;font-weight:700;color:#F4EAD7', 'font-size:13px;color:var(--char-accent-soft)', '«هر نیم ساعت»',
    // quick choices at 34px, and the progress: 92 x 4 filling five sixths from the inline start
    'height:34px;padding:0 14px;border-radius:999px', 'width:92px;height:4px;border-radius:2px;background:linear-gradient(270deg,var(--char-accent) 83%,rgba(244,234,215,.1) 83%)', '5 از 6',
    // the row
    'padding-block:6px 12px;padding-inline-start:16px;padding-inline-end:12px', 'min-width:40px;text-align:center',
    'height:40px;padding:0 14px;border-radius:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;flex:none;white-space:nowrap;border:1px solid rgba(244,234,215,.12);background:transparent;color:#F4EAD7;font-size:12.5px',
    'width:40px;height:40px;flex:none;border-radius:13px;display:grid;place-items:center;padding:0;cursor:pointer;border:1px solid rgba(244,234,215,.12);background:transparent;color:#ACA994',
    'border:1px solid rgba(255,56,48,.5);color:#FF6B63'
  ]);
  orderOf(html, ['سؤال 5 از 6', 'هر چند دقیقه', '«هر نیم ساعت»', 'navrya-voice-console-meter', 'navrya-voice-console-timer', 'رد کردن', 'navrya-voice-console-mute', 'navrya-voice-console-type', 'navrya-voice-console-end']);
});

test('plate XVIII "calm mode": the quieter wave, the "calm" pill, "continue later" in gold and "skip this question"', () => {
  const html = renderToStaticMarkup(h(VoiceConsole, { ...voiceBase, layout: 'weld', formVoice: { ...formVoice, calm: true, fields: [] }, formVoiceLabels: labels, onFormVoiceSkip() {}, onFormVoiceLater() {} }));
  expectAll('calm', html, [
    'opacity:0.7', 'background:rgba(244,234,215,.07);color:#ACA994', 'حالت آرام',
    'border:1px solid rgba(214,175,107,.45);background:transparent;color:#D6AF6B;font-size:12.5px', 'بعداً ادامه بده', 'رد کردن این سؤال'
  ]);
  orderOf(html, ['بعداً ادامه بده', 'رد کردن این سؤال', 'navrya-voice-console-mute']);
});

test('plate XVII "sidecar": a 16px card with the header, the mode chips, the question, the checklist (done / waiting / to come), the last said and a 36px control row', () => {
  const html = renderToStaticMarkup(h(VoiceConsole, {
    ...voiceBase, layout: 'side', laneHeight: 732, formVoice, formVoiceLabels: labels, onFormVoiceSkip() {}, onMinimize() {},
    model: models[0], engineMenu: { items: [{ key: 'o', label: 'ChatGPT' }], glyph: null, label: 'ChatGPT', switchLabel: 'تعویض موتور' }
  }));
  expectAll('sidecar', html, [
    CARD_EDGE, CARD_GRADIENT, 'border-radius:16px', 'height:732px', GRABBER,
    'padding:18px 12px 12px', 'font-size:15px;font-weight:700;color:#F4EAD7', 'dir="ltr"',
    'padding:0 14px 10px', 'background:rgba(214,175,107,.14);color:#D6AF6B', 'background:rgba(244,234,215,.07);color:#ACA994',
    'padding:12px 14px 6px', 'font-size:15px;font-weight:700;color:#F4EAD7;line-height:1.7',
    // checklist rows: 30px, 12.5px
    'display:flex;align-items:center;gap:10px;height:30px;flex:none;font-size:12.5px;font-weight:500;color:#ACA994',
    'width:18px;height:18px;border-radius:50%;background:rgba(46,204,113,.14);color:#2ECC71',
    'width:18px;height:18px;border-radius:50%;border:1.5px dashed #D6AF6B', 'font-weight:700;color:#D6AF6B', 'منتظر تأیید تو',
    'width:18px;height:18px;border-radius:50%;border:1.5px solid rgba(244,234,215,.2)',
    // the last said and the control row
    'ضرر روزانه پنج درصده', 'صوتی · ۱۵:۲۴', 'padding:12px;min-height:68px',
    'width:36px;height:36px;flex:none;border-radius:12px'
  ]);
  orderOf(html, ['ChatGPT', 'پروفایل من', 'هر فیلد را بپرس', 'سؤال 5 از 6', 'نوع حساب', 'ضرر روزانه', 'منتظر تأیید تو', 'حداکثر افت', 'ضرر روزانه پنج درصده', 'navrya-voice-console-mute']);
});

test('plate XVI "anchor": the compact card - the question label, the heard quote, an expand button and the 36px row', () => {
  const html = renderToStaticMarkup(h(VoiceConsole, { ...voiceBase, voiceState: 'user_speaking', layout: 'anchor', formVoice, formVoiceLabels: { ...labels, expandConversation: 'باز کردن گفتگو' }, onMinimize() {} }));
  expectAll('anchor', html, [
    CARD_EDGE, CARD_GRADIENT, GRABBER, 'padding:18px 14px 6px 12px', 'font-size:14.5px;font-weight:700;color:#F4EAD7', 'font-size:12.5px;color:#ACA994',
    '«هر نیم ساعت»', 'aria-label="باز کردن گفتگو"', 'width:34px;height:34px', 'padding:12px;min-height:68px', 'width:36px;height:36px;flex:none;border-radius:12px'
  ]);
});

test('every accent value is the active character\'s own token: the surfaces carry no hard-coded purple', () => {
  const surfaces = [
    renderToStaticMarkup(h(ChatDock, dockBase)),
    renderToStaticMarkup(h(VoiceConsole, { ...voiceBase, layout: 'weld', formVoice, formVoiceLabels: labels })),
    renderToStaticMarkup(h(VoiceConsole, { ...voiceBase, layout: 'side', laneHeight: 700, formVoice, formVoiceLabels: labels }))
  ].join('\n');
  assert.doesNotMatch(surfaces, /#A965D8|#C98FF5|169,101,216/i, 'Master\'s purple never appears as a literal - it comes from --char-accent / --char-accent-soft');
  assert.match(surfaces, /var\(--char-accent-soft\)/);
  assert.match(surfaces, /var\(--char-on-accent\)/);
  void flat;
});

test('what was heard belongs to the current question: shown while the user answers, hidden under a new question while the reply caption is up', () => {
  const props = { ...voiceBase, layout: 'weld', formVoice: { ...formVoice, fields: [] }, formVoiceLabels: labels };
  assert.doesNotMatch(renderToStaticMarkup(h(VoiceConsole, { ...props, voiceState: 'listening' })), /«هر نیم ساعت»/, 'leftover from the previous turn');
  assert.match(renderToStaticMarkup(h(VoiceConsole, { ...props, voiceState: 'user_speaking' })), /«هر نیم ساعت»/);
  assert.match(renderToStaticMarkup(h(VoiceConsole, { ...props, voiceState: 'processing' })), /«هر نیم ساعت»/);
  assert.match(renderToStaticMarkup(h(VoiceConsole, { ...props, voiceState: 'listening', voiceReplyCaption: '' })), /«هر نیم ساعت»/, 'with no question up, what was heard is still shown');
});

test('the dock\'s own motion is a slide (220ms, --dur-expand, ease-out) - never a fade or a scale', () => {
  const html = renderToStaticMarkup(h(ChatResponsePopover, { open: true, shape: 'scroll', joined: true, companion, messages: [{ role: 'assistant', content: 'x' }] }));
  assert.match(html, /animation:navrya-dock-rise var\(--dur-expand\) var\(--ease-out\) both/);
  const bar = renderToStaticMarkup(h(VoiceConsole, { ...voiceBase, layout: 'weld' }));
  assert.match(bar, /animation:navrya-dock-rise var\(--dur-expand\) var\(--ease-out\) both/);
});
