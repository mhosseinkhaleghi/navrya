import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// NAVRYA - Market Engineer Character Interaction Policy: extends the existing shared
// architecture (public/pages/shared/character-interaction-policy.js) to a third character,
// reusing the exact same EVENTS/GEARS enum (no second event model, no second gear enum). Mirrors
// tests/commander-character-policy.test.mjs's conventions; also asserts Hunter/Commander/Sage are
// unchanged by this gate.
const root = process.cwd();
const source = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');

async function policySandbox(layerCharacter) {
  const sandbox = { window: {} };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalPanelLayer: layerCharacter === undefined ? undefined : { character: layerCharacter }
  });
  vm.runInNewContext(await source('character-interaction-policy.js'), sandbox, { filename: 'character-interaction-policy.js' });
  return sandbox.window.TradeJournalCharacterPolicy;
}

const LANGUAGES = ['en', 'fa', 'ar', 'es'];
const ADDRESS_TERMS = ['رفیق', 'قربان', 'سيدي', 'Señor', 'compa', ' sir', 'Sir,', 'Sir.'];
const MILITARY_OR_HUNTING = ['دشمن', 'حمله', 'نابود', 'شکار', 'طعمه', 'ردپا', 'مأموریت', 'battlefield', 'enemy', 'hunt', 'track '];
const BUREAUCRATIC = ['لطفاً', 'نمایید', 'می‌گردد', 'گردد', 'مقتضی', 'ناسازگاری پارامتریک'];

function engineerStrings(policy) {
  const out = [];
  for (const language of LANGUAGES) {
    out.push(policy.proactiveOpener(language, 'engineer'));
    out.push(policy.proactiveOverrideQuestion(language, 'engineer'));
    out.push(policy.analysisHeadlineLeadIn(language, 'engineer'));
  }
  return out;
}

// ---- 1. registered as an implemented character; shared enum/gear model reused ----

test('Market Engineer is registered as an implemented character with the same shared EVENTS/GEARS model - no third architecture', async () => {
  const policy = await policySandbox('engineer');
  const result = policy.resolve({ event: policy.EVENTS.GENERAL_QA });
  assert.equal(result.active, true);
  assert.equal(result.character, 'engineer');
  assert.equal(result.gear, policy.GEARS.NORMAL);
  assert.deepEqual(Object.keys(policy.GEARS).sort(), ['FOCUSED', 'HUMAN_MOMENT', 'NEUTRAL', 'NORMAL']);
});

test('isEngineerActive()/isHunterActive()/isCommanderActive() are mutually exclusive and hasCharacterPolicy() covers all three implemented characters but not Sage', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const policy = await policySandbox(character);
    assert.equal(policy.isEngineerActive(), character === 'engineer', character);
    assert.equal(policy.isHunterActive(), character === 'hunter', character);
    assert.equal(policy.isCommanderActive(), character === 'commander', character);
    assert.equal(policy.hasCharacterPolicy(), character !== 'sage', character);
  }
});

// ---- event -> gear: the mapping is character-agnostic, so Engineer resolves exactly like Hunter ----

test('Engineer resolves every implemented event to the same gear Hunter and Commander do (shared mapping, no per-character drift)', async () => {
  const policy = await policySandbox('engineer');
  for (const event of Object.keys(policy.EVENTS)) {
    const engineer = policy.resolve({ event, character: 'engineer' }).gear;
    assert.equal(engineer, policy.resolve({ event, character: 'hunter' }).gear, event);
    assert.equal(engineer, policy.resolve({ event, character: 'commander' }).gear, event);
  }
});

test('Engineer gear interpretation: SYSTEMS (voice start/QA/data/opening), DEBUG (forms, risk, analysis, correction), POST-MORTEM (reflection), NEUTRAL (destructive/override/safety)', async () => {
  const policy = await policySandbox('engineer');
  const gear = (event, extra) => policy.resolve(Object.assign({ event, character: 'engineer' }, extra)).gear;
  const E = policy.EVENTS;
  for (const event of [E.VOICE_START, E.CONTEXTUAL_OPENING, E.GENERAL_QA, E.PRODUCT_EXPLANATION, E.DATA_ANSWER, E.PROACTIVE_NUDGE, E.LOW_CONFIDENCE, E.PRAISE, E.ERROR_RECOVERY]) assert.equal(gear(event), policy.GEARS.NORMAL, event);
  for (const event of [E.FORM_NEXT_FIELD, E.FORM_FIELD_ACCEPTED, E.FORM_CORRECTION, E.FORM_STEP_TRANSITION, E.FORM_COMPLETE, E.RISK_WARNING, E.ANALYSIS_HEADLINE, E.ANALYSIS_FULL]) assert.equal(gear(event), policy.GEARS.FOCUSED, event);
  assert.equal(gear(E.POST_TRADE_REFLECTION), policy.GEARS.HUMAN_MOMENT);
  for (const event of [E.DESTRUCTIVE_CONFIRMATION, E.RISK_OVERRIDE_CONFIRMATION, E.SAFETY]) assert.equal(gear(event), policy.GEARS.NEUTRAL, event);
});

test('Safety and gate sensitivity force NEUTRAL for Engineer whatever the event, with no address/metaphor allowance', async () => {
  const policy = await policySandbox('engineer');
  for (const event of Object.keys(policy.EVENTS)) {
    for (const sensitivity of ['safety', 'gate']) {
      const result = policy.resolve({ event, character: 'engineer', sensitivity });
      assert.equal(result.gear, policy.GEARS.NEUTRAL, `${event}/${sensitivity}`);
      assert.equal(result.addressAllowance, 'none');
      assert.equal(result.metaphorAllowance, 'none');
    }
  }
});

test('Engineer post-mortem gear allows no metaphor - human experience is never a debug metaphor', async () => {
  const policy = await policySandbox('engineer');
  assert.equal(policy.resolve({ event: policy.EVENTS.POST_TRADE_REFLECTION, character: 'engineer' }).metaphorAllowance, 'none');
});

// ---- Hunter / Commander / Sage unchanged by this gate ----

test('Hunter phrases and Commander phrases are byte-for-byte unchanged by the Engineer gate', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.proactiveOpener('fa'), 'یه لحظه رفیق.');
  assert.equal(policy.proactiveOpener('fa', 'hunter'), 'یه لحظه رفیق.');
  assert.equal(policy.proactiveOverrideQuestion('en', 'hunter'), 'Want to stick with the plan, or knowingly push past it?');
  assert.equal(policy.analysisHeadlineLeadIn('fa', 'hunter'), 'ردپای اصلی اینه:');
  assert.equal(policy.proactiveOpener('fa', 'commander'), 'قربان، یه تضاد داریم.');
  assert.equal(policy.proactiveOverrideQuestion('fa', 'commander'), 'دو انتخاب داریم: برگردیم روی سقف، یا این استثنا رو آگاهانه تأیید کنید.');
  assert.equal(policy.analysisHeadlineLeadIn('fa', 'commander'), 'قربان، گزارش کوتاه:');
});

test('Sage stays inactive (no gear) and an unknown/omitted character still resolves phrases to Hunter\'s original defaults', async () => {
  const policy = await policySandbox('sage');
  const result = policy.resolve({ event: policy.EVENTS.RISK_WARNING });
  assert.equal(result.active, false);
  assert.equal(result.gear, null);
  assert.equal(policy.proactiveOpener('en', 'sage'), policy.proactiveOpener('en', 'hunter'));
  assert.equal(policy.proactiveOpener('en'), policy.proactiveOpener('en', 'hunter'));
});

test('the difference line and the engineer phrases exist ONLY for Engineer - Hunter/Commander/Sage never get a difference line', async () => {
  const policy = await policySandbox('hunter');
  const findings = [{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: 4, strategyMaxRiskPercent: 1 } }];
  for (const character of ['hunter', 'commander', 'sage', undefined]) assert.equal(policy.proactiveDifferenceLine(findings, 'en', character), '', String(character));
  assert.notEqual(policy.proactiveDifferenceLine(findings, 'en', 'engineer'), '');
  for (const language of LANGUAGES) {
    assert.notEqual(policy.proactiveOpener(language, 'engineer'), policy.proactiveOpener(language, 'hunter'), language);
    assert.notEqual(policy.proactiveOpener(language, 'engineer'), policy.proactiveOpener(language, 'commander'), language);
    assert.notEqual(policy.analysisHeadlineLeadIn(language, 'engineer'), policy.analysisHeadlineLeadIn(language, 'commander'), language);
  }
});

// ---- Risk: FACT -> CONSTRAINT -> DIFFERENCE -> OPTIONS, only when mathematically true ----

test('difference line is exact arithmetic over the finding\'s own evidence numbers (4 vs 1 -> 3, 2.5 vs 1 -> 1.5, no float noise)', async () => {
  const policy = await policySandbox('engineer');
  const line = (requested, cap, language) => policy.proactiveDifferenceLine([{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: requested, strategyMaxRiskPercent: cap } }], language || 'en', 'engineer');
  assert.equal(line(4, 1), 'That is 3 points above the limit.');
  assert.equal(line(2, 1), 'That is 1 point above the limit.');
  assert.equal(line(2.5, 1), 'That is 1.5 points above the limit.');
  assert.equal(line(0.3, 0.1), 'That is 0.2 points above the limit.', 'float noise (0.3 - 0.1) must never leak into the spoken number');
  assert.match(line(4, 1, 'fa'), /3/);
  assert.match(line(4, 1, 'ar'), /3/);
  assert.match(line(4, 1, 'es'), /3/);
});

test('difference line is empty - never fabricated - for any finding without real requested-vs-cap evidence, or where requested is not above the cap', async () => {
  const policy = await policySandbox('engineer');
  const diff = (findings) => policy.proactiveDifferenceLine(findings, 'en', 'engineer');
  assert.equal(diff([]), '');
  assert.equal(diff(null), '');
  assert.equal(diff([{ id: 'missing-stop-loss', evidence: {} }]), '');
  assert.equal(diff([{ id: 'strategy-max-concurrent-trades', evidence: { activeTradeCount: 3, strategyMaxConcurrentTrades: 2 } }]), '');
  assert.equal(diff([{ id: 'strategy-risk-limit', evidence: {} }]), '');
  assert.equal(diff([{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: '4', strategyMaxRiskPercent: '1' } }]), '', 'string evidence is not trusted as a number');
  assert.equal(diff([{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: 1, strategyMaxRiskPercent: 1 } }]), '');
  assert.equal(diff([{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: 0.5, strategyMaxRiskPercent: 1 } }]), '');
  assert.equal(diff([{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: Infinity, strategyMaxRiskPercent: 1 } }]), '');
  assert.equal(diff([{ id: 'strategy-risk-limit', evidence: { requestedRiskPercent: NaN, strategyMaxRiskPercent: 1 } }]), '');
});

// ---- Persian / cross-language character quality ----

test('Persian quality: no "رفیق" or "قربان" signature anywhere in Engineer\'s strings, in any language', async () => {
  const policy = await policySandbox('engineer');
  for (const text of engineerStrings(policy)) {
    for (const term of ADDRESS_TERMS) assert.ok(!text.includes(term), `"${text}" must not contain address term "${term}"`);
  }
});

test('Persian quality: no military vocabulary, no hunting metaphor, and no bureaucratic Persian in Engineer\'s strings', async () => {
  const policy = await policySandbox('engineer');
  for (const text of engineerStrings(policy)) {
    for (const word of MILITARY_OR_HUNTING) assert.ok(!text.toLowerCase().includes(word.toLowerCase()), `"${text}" must not contain "${word}"`);
    for (const word of BUREAUCRATIC) assert.ok(!text.includes(word), `"${text}" must not contain "${word}"`);
  }
});

test('Persian quality: spoken, compact, natural technical code-switching ("mismatch") - fast short lines, never a lecture', async () => {
  const policy = await policySandbox('engineer');
  assert.match(policy.proactiveOpener('fa', 'engineer'), /mismatch/);
  for (const language of LANGUAGES) {
    assert.ok(policy.proactiveOpener(language, 'engineer').length <= 30, `${language} opener stays short`);
    assert.ok(policy.proactiveOverrideQuestion(language, 'engineer').length <= 80, `${language} question stays short`);
    assert.ok(policy.analysisHeadlineLeadIn(language, 'engineer').length < 40, `${language} lead-in is a label, not a sentence`);
  }
});

test('Persian quality: the override question offers a choice and keeps the user in control - it never assumes consent or commands', async () => {
  const policy = await policySandbox('engineer');
  const fa = policy.proactiveOverrideQuestion('fa', 'engineer');
  assert.match(fa, /اصلاح/);
  assert.match(fa, /آگاهانه/);
  assert.match(fa, /؟$/);
  assert.doesNotMatch(fa, /باید|مجبور/);
});

test('humor is off in risk/override strings: no joke lines in any Engineer risk phrase (dry humor is reserved for safe contexts)', async () => {
  const policy = await policySandbox('engineer');
  for (const language of LANGUAGES) {
    for (const text of [policy.proactiveOpener(language, 'engineer'), policy.proactiveOverrideQuestion(language, 'engineer')]) {
      assert.doesNotMatch(text, /دوست شدن|friends|😀|😄|haha/i, text);
    }
  }
});
