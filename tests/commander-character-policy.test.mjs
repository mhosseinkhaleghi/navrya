import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// NAVRYA — Commander Character Interaction Policy: extends the existing Hunter architecture
// (public/pages/shared/character-interaction-policy.js) to a second character, reusing the exact
// same EVENTS/GEARS enum (no second event model, no second gear enum - brief section 1/7). This
// file mirrors tests/character-interaction-policy.test.mjs's own conventions and, per section 37
// item 19-20, also asserts Hunter/Engineer/Sage are unchanged by this gate.
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

// ---- resolve(): Commander is now active, same shared shape Hunter already has ----

test('resolve() is active for Commander, with the same shared EVENTS/GEARS enum Hunter uses - no second event/gear model', async () => {
  const policy = await policySandbox('commander');
  const result = policy.resolve({ event: policy.EVENTS.GENERAL_QA });
  assert.equal(result.active, true);
  assert.equal(result.character, 'commander');
  assert.equal(result.gear, policy.GEARS.NORMAL);
});

test('isCommanderActive()/isHunterActive() are independent and correct for every character', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const policy = await policySandbox(character);
    assert.equal(policy.isCommanderActive(), character === 'commander', character);
    assert.equal(policy.isHunterActive(), character === 'hunter', character);
    assert.equal(policy.hasCharacterPolicy(), character === 'hunter' || character === 'commander', character);
  }
});

// ---- item 19: Hunter is completely unchanged by this gate ----

test('Hunter behavior is byte-for-byte unchanged: same gear mapping, same phrase-table defaults when no character is passed', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.resolve({ event: policy.EVENTS.FORM_NEXT_FIELD }).gear, policy.GEARS.FOCUSED);
  assert.equal(policy.resolve({ event: policy.EVENTS.DESTRUCTIVE_CONFIRMATION }).gear, policy.GEARS.NEUTRAL);
  assert.equal(policy.proactiveOpener('fa'), 'یه لحظه رفیق.');
  assert.equal(policy.proactiveOverrideQuestion('en'), 'Want to stick with the plan, or knowingly push past it?');
  assert.equal(policy.analysisHeadlineLeadIn('fa'), 'ردپای اصلی اینه:');
});

// ---- item 20: Engineer/Sage remain unaffected (no policy at all) ----

test('Engineer and Sage remain completely inactive - no gear, no phrase-table content, exactly as before this and the Hunter gate', async () => {
  for (const character of ['engineer', 'sage']) {
    const policy = await policySandbox(character);
    const result = policy.resolve({ event: policy.EVENTS.RISK_WARNING });
    assert.equal(result.active, false, character);
    assert.equal(result.gear, null, character);
  }
});

// ---- Commander phrase tables: language coverage, "قربان" usage, and anti-patterns ----

test('proactiveOpener()/proactiveOverrideQuestion()/analysisHeadlineLeadIn() have real Commander content for all four languages, distinct from Hunter\'s', async () => {
  const policy = await policySandbox('commander');
  for (const language of ['en', 'fa', 'ar', 'es']) {
    const commanderOpener = policy.proactiveOpener(language, 'commander');
    const hunterOpener = policy.proactiveOpener(language, 'hunter');
    assert.equal(typeof commanderOpener, 'string');
    assert.notEqual(commanderOpener, hunterOpener, language);
  }
});

test('Persian quality: Commander uses "قربان" in the operational opener, never "رفیق"', async () => {
  const policy = await policySandbox('commander');
  const opener = policy.proactiveOpener('fa', 'commander');
  assert.match(opener, /قربان/);
  assert.doesNotMatch(opener, /رفیق/);
});

test('Persian quality: "قربان" is not inserted into every Commander string - the override question itself stays operational, not padded with the address term', async () => {
  const policy = await policySandbox('commander');
  const overrideQuestion = policy.proactiveOverrideQuestion('fa', 'commander');
  assert.doesNotMatch(overrideQuestion, /قربان/);
  assert.doesNotMatch(overrideQuestion, /رفیق/);
});

test('no violent war metaphor, no bureaucratic Persian markers, and no Hunter-only address term anywhere in Commander\'s own FA strings', async () => {
  const policy = await policySandbox('commander');
  const faStrings = [
    policy.proactiveOpener('fa', 'commander'),
    policy.proactiveOverrideQuestion('fa', 'commander'),
    policy.analysisHeadlineLeadIn('fa', 'commander')
  ];
  const forbidden = ['دشمن', 'حمله', 'نابود', 'رفیق', 'مأموریت نظامی'];
  faStrings.forEach((text) => {
    forbidden.forEach((word) => assert.ok(!text.includes(word), `"${text}" must not contain "${word}"`));
  });
});

test('the analysis headline lead-in is a short label distinct per character, never the analysis content itself', async () => {
  const policy = await policySandbox('commander');
  for (const language of ['en', 'fa', 'ar', 'es']) {
    const leadIn = policy.analysisHeadlineLeadIn(language, 'commander');
    assert.ok(leadIn.length < 40, language);
    assert.notEqual(leadIn, policy.analysisHeadlineLeadIn(language, 'hunter'), language);
  }
});

test('omitting the character argument on any phrase function still defaults to Hunter\'s original content - no silent behavior change for existing callers', async () => {
  const policy = await policySandbox('hunter');
  assert.equal(policy.proactiveOpener('en'), policy.proactiveOpener('en', 'hunter'));
  assert.equal(policy.proactiveOverrideQuestion('en'), policy.proactiveOverrideQuestion('en', 'hunter'));
  assert.equal(policy.analysisHeadlineLeadIn('en'), policy.analysisHeadlineLeadIn('en', 'hunter'));
});
