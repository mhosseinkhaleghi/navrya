import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// NAVRYA — Hunter Character Interaction Policy (public/pages/shared/character-interaction-policy.js).
// Covers the character-interaction-policy brief's own test matrix (section 37/38): event->gear
// mapping, the absolute safety/gate override, "only Hunter is active in this gate", and a Persian
// quality pass over every FA string this module actually owns.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function policySandbox(layerCharacter) {
  const sandbox = { window: {} };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalPanelLayer: layerCharacter === undefined ? undefined : { character: layerCharacter }
  });
  vm.runInNewContext(await source('character-interaction-policy.js'), sandbox, { filename: 'character-interaction-policy.js' });
  return sandbox.window.TradeJournalCharacterPolicy;
}

// ---- active character / default ----

test('activeCharacter() defaults to hunter when window.TradeJournalPanelLayer is absent (matches currentCharacter.js\'s own default)', async () => {
  const policy = await policySandbox(undefined);
  assert.equal(policy.activeCharacter(), 'hunter');
  assert.equal(policy.isHunterActive(), true);
});

test('activeCharacter() reads the real per-page character when set, for every character', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const policy = await policySandbox(character);
    assert.equal(policy.activeCharacter(), character);
    assert.equal(policy.isHunterActive(), character === 'hunter');
  }
});

// ---- resolve(): only Hunter is active in this gate ----

test('resolve() is inactive (no gear, "none" allowances) for every non-Hunter character - this gate implements ONLY Hunter', async () => {
  const policy = await policySandbox('commander');
  const result = policy.resolve({ event: policy.EVENTS.GENERAL_QA });
  assert.equal(result.active, false);
  assert.equal(result.gear, null);
  assert.equal(result.addressAllowance, 'none');
  assert.equal(result.metaphorAllowance, 'none');
});

test('resolve() is active for Hunter and reports the character/event back unchanged', async () => {
  const policy = await policySandbox('hunter');
  const result = policy.resolve({ event: policy.EVENTS.GENERAL_QA });
  assert.equal(result.active, true);
  assert.equal(result.character, 'hunter');
  assert.equal(result.event, policy.EVENTS.GENERAL_QA);
});

test('resolve() accepts an explicit character override, ignoring window.TradeJournalPanelLayer', async () => {
  const policy = await policySandbox('hunter');
  const result = policy.resolve({ event: policy.EVENTS.GENERAL_QA, character: 'sage' });
  assert.equal(result.active, false);
});

// ---- event -> gear mapping (section 7: three voice gears + the structural NEUTRAL override) ----

test('NORMAL-gear events: welcome/general conversation/ordinary Q&A/navigation-shaped events', async () => {
  const policy = await policySandbox('hunter');
  for (const event of [policy.EVENTS.VOICE_START, policy.EVENTS.CONTEXTUAL_OPENING, policy.EVENTS.GENERAL_QA, policy.EVENTS.PRODUCT_EXPLANATION, policy.EVENTS.DATA_ANSWER, policy.EVENTS.PROACTIVE_NUDGE, policy.EVENTS.LOW_CONFIDENCE, policy.EVENTS.PRAISE, policy.EVENTS.ERROR_RECOVERY, policy.EVENTS.LEARNED_COMMAND_FEEDBACK]) {
    assert.equal(policy.resolve({ event }).gear, policy.GEARS.NORMAL, event + ' should resolve to NORMAL');
  }
});

test('FOCUSED-gear events: form interview / Trade / Session / Strategy / Risk / analysis / correction', async () => {
  const policy = await policySandbox('hunter');
  for (const event of [policy.EVENTS.FORM_NEXT_FIELD, policy.EVENTS.FORM_FIELD_ACCEPTED, policy.EVENTS.FORM_CORRECTION, policy.EVENTS.FORM_CLARIFICATION, policy.EVENTS.FORM_STEP_TRANSITION, policy.EVENTS.FORM_COMPLETE, policy.EVENTS.WORKFLOW_CANCEL, policy.EVENTS.RISK_WARNING, policy.EVENTS.ANALYSIS_HEADLINE, policy.EVENTS.ANALYSIS_FULL]) {
    assert.equal(policy.resolve({ event }).gear, policy.GEARS.FOCUSED, event + ' should resolve to FOCUSED');
  }
});

test('HUMAN_MOMENT gear: post-trade reflection / loss / psychology', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.resolve({ event: policy.EVENTS.POST_TRADE_REFLECTION }).gear, policy.GEARS.HUMAN_MOMENT);
});

test('an unknown/unmapped event falls back to the safest default, NORMAL - never NEUTRAL (which would silently suppress Hunter) or an assumed sensitive gear', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.resolve({ event: 'SOME_FUTURE_EVENT_NOT_YET_CLASSIFIED' }).gear, policy.GEARS.NORMAL);
  assert.equal(policy.resolve({}).gear, policy.GEARS.NORMAL);
});

// ---- NEUTRAL override: safety and gate/destructive confirmations always win (section 8/24) ----

test('DESTRUCTIVE_CONFIRMATION and RISK_OVERRIDE_CONFIRMATION always resolve to NEUTRAL - character flavor becomes minimal', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.resolve({ event: policy.EVENTS.DESTRUCTIVE_CONFIRMATION }).gear, policy.GEARS.NEUTRAL);
  assert.equal(policy.resolve({ event: policy.EVENTS.RISK_OVERRIDE_CONFIRMATION }).gear, policy.GEARS.NEUTRAL);
});

test('an explicit sensitivity:"gate" forces NEUTRAL even for an otherwise NORMAL/FOCUSED event - safety/confirmation semantics outrank the event\'s own default gear', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.resolve({ event: policy.EVENTS.GENERAL_QA, sensitivity: 'gate' }).gear, policy.GEARS.NEUTRAL);
  assert.equal(policy.resolve({ event: policy.EVENTS.FORM_NEXT_FIELD, sensitivity: 'gate' }).gear, policy.GEARS.NEUTRAL);
});

test('an explicit sensitivity:"safety", or the SAFETY event itself, always forces NEUTRAL regardless of what else is passed (section 8: safety outranks character, absolutely)', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.resolve({ event: policy.EVENTS.SAFETY }).gear, policy.GEARS.NEUTRAL);
  assert.equal(policy.resolve({ event: policy.EVENTS.POST_TRADE_REFLECTION, sensitivity: 'safety' }).gear, policy.GEARS.NEUTRAL);
});

test('NEUTRAL gear carries "none" address/metaphor allowance - no character flavor at all in a confirmation step', async () => {
  const policy = await policySandbox('hunter');
  const result = policy.resolve({ event: policy.EVENTS.DESTRUCTIVE_CONFIRMATION });
  assert.equal(result.addressAllowance, 'none');
  assert.equal(result.metaphorAllowance, 'none');
});

test('HUMAN_MOMENT gear never allows metaphor, matching "Hunter must NOT become slow/mystical" even in a softer moment', async () => {
  const policy = await policySandbox('hunter');
  const result = policy.resolve({ event: policy.EVENTS.POST_TRADE_REFLECTION });
  assert.equal(result.metaphorAllowance, 'none');
});

// ---- phrase tables: language coverage and content quality ----

test('proactiveOpener()/proactiveOverrideQuestion()/analysisHeadlineLeadIn() cover all four languages and fall back to English for an unknown one', async () => {
  const policy = await policySandbox('hunter');
  for (const language of ['en', 'fa', 'ar', 'es']) {
    assert.equal(typeof policy.proactiveOpener(language), 'string');
    assert.equal(typeof policy.proactiveOverrideQuestion(language), 'string');
    assert.equal(typeof policy.analysisHeadlineLeadIn(language), 'string');
  }
  assert.equal(policy.proactiveOpener('xx'), policy.proactiveOpener('en'));
  assert.equal(policy.proactiveOverrideQuestion('xx'), policy.proactiveOverrideQuestion('en'));
  assert.equal(policy.analysisHeadlineLeadIn('xx'), policy.analysisHeadlineLeadIn('en'));
});

test('Persian quality: the proactive opener uses "رفیق" naturally (not on every string) and never a formal/bureaucratic register', async () => {
  const policy = await policySandbox('hunter');
  assert.match(policy.proactiveOpener('fa'), /رفیق/);
  // The override question itself is compact and conversational, not padded with the address term
  // on every single line (brief section 4: "Use naturally, not on every turn").
  assert.doesNotMatch(policy.proactiveOverrideQuestion('fa'), /رفیق/);
});

test('Persian quality: no violent hunting metaphor or mystical language anywhere in this module\'s own FA strings (section 6/31 anti-patterns)', async () => {
  const policy = await policySandbox('hunter');
  const faStrings = [policy.proactiveOpener('fa'), policy.proactiveOverrideQuestion('fa'), policy.analysisHeadlineLeadIn('fa')];
  const forbidden = ['شکار کن', 'طعمه', 'بزنش', 'نابود'];
  faStrings.forEach((text) => {
    forbidden.forEach((word) => assert.ok(!text.includes(word), `"${text}" must not contain the forbidden word "${word}"`));
  });
});

test('the analysis headline lead-in is a short label, never the analysis content itself - callers always prepend it to the real headline, never substitute it', async () => {
  const policy = await policySandbox('hunter');
  for (const language of ['en', 'fa', 'ar', 'es']) {
    assert.ok(policy.analysisHeadlineLeadIn(language).length < 40, language + ' lead-in should be a short label, not a sentence');
  }
});
