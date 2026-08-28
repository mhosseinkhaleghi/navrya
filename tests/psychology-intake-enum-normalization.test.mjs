import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// 2026-08-28 bug report: real production testing found that saying "متاهل هستم" ("I'm married")
// during Psychology Intake never selected the "Married" tile - the write itself always
// succeeded (the raw spoken text landed in the store), but mentalHealthIntakeModal.jsx's own
// TileGrid only visibly selects a tile on an EXACT value === key match, and
// activeProcess.allowlist sends the model only field PATHS, never valid-option info
// (chat-dock-core.js's modelFacingAllowlist()), so a spoken/localized answer had no way to land
// on the exact internal key. character-app.jsx's psychology.intake.start now declares a real
// normalizeField mapping every enum-shaped intake field onto its real internal key, reusing
// mental-health-i18n.js's own already-shown labels across every supported language (fa/ar/en/es)
// - never a second, hand-duplicated translation table.
//
// navrya-src/*.jsx has no dynamic test harness in this project (see tests/session-actions.test.mjs's
// own comment) - EXCEPT this file extracts the real, pure normalizer functions (brace-matched out
// of the real source text, not hand-copied) and evaluates them for real, exactly like the shared
// public/pages/shared/*.js files' own vm.runInNewContext convention - this logic (multi-language
// matching, a real-speech substring fallback) is exactly the kind of thing a bare regex-presence
// check would never actually verify.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');

// Extracts `function <name>(...) { ... }` from the real source by counting braces from the
// function's own opening `{` - regex alone can't balance nested braces reliably.
function extractFunctionSource(src, name) {
  const startMatch = new RegExp(`function ${name}\\(`).exec(src);
  assert.ok(startMatch, `could not find the real function ${name} in character-app.jsx`);
  const braceOpen = src.indexOf('{', startMatch.index);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `unbalanced braces extracting ${name}`);
  return src.slice(startMatch.index, i + 1);
}

const fnSources = [
  extractFunctionSource(characterAppSrc, 'normalizeIntakeChoice'),
  extractFunctionSource(characterAppSrc, 'normalizeIntakeBoolean'),
  extractFunctionSource(characterAppSrc, 'normalizeIntakeMarket')
].join('\n');

// The same real messages dictionary shape mental-health-i18n.js actually exports (a small,
// representative subset - only the keys these tests exercise), so `window.TradeJournalMentalHealthI18n.messages`
// behaves exactly like the real one for every path these functions read.
const FAKE_MESSAGES = {
  fa: {
    mhMaritalStatus_single: 'مجرد', mhMaritalStatus_married: 'متأهل', mhMaritalStatus_divorced: 'مطلقه/مطلق', mhMaritalStatus_widowed: 'همسر از دست‌رفته', mhMaritalStatus_prefer_not_to_say: 'ترجیح می‌دهم نگویم',
    mhGender_male: 'مرد', mhGender_female: 'زن', mhGender_prefer_not_to_say: 'ترجیح می‌دهم نگویم',
    mhOccupationType_full_time_trader: 'معامله‌گر تمام‌وقت', mhOccupationType_part_time_trader: 'معامله‌گر پاره‌وقت',
    mhCapitalType_surplus: 'سرمایه مازاد', mhCapitalType_essential: 'سرمایه ضروری/موردنیاز', mhCapitalType_mixed: 'ترکیبی از هر دو',
    mhMotivation_quick_money: 'پول سریع', mhMotivation_freedom: 'آزادی',
    mhLossReaction_revenge_same_day: 'انتقام همان روز', mhLossReaction_analytical_review: 'بررسی تحلیلی',
    mhMarketsPreset_forex: 'فارکس', mhMarketsPreset_crypto: 'کریپتو',
    mhYes: 'بله', mhNo: 'خیر'
  },
  en: {
    mhMaritalStatus_single: 'Single', mhMaritalStatus_married: 'Married', mhMaritalStatus_divorced: 'Divorced', mhMaritalStatus_widowed: 'Widowed', mhMaritalStatus_prefer_not_to_say: 'Prefer not to say',
    mhGender_male: 'Male', mhGender_female: 'Female', mhGender_prefer_not_to_say: 'Prefer not to say',
    mhOccupationType_full_time_trader: 'Full-time trader', mhOccupationType_part_time_trader: 'Part-time trader',
    mhCapitalType_surplus: 'Surplus capital', mhCapitalType_essential: 'Essential/needed capital', mhCapitalType_mixed: 'A mix of both',
    mhMotivation_quick_money: 'Quick money', mhMotivation_freedom: 'Freedom',
    mhLossReaction_revenge_same_day: 'Revenge same day', mhLossReaction_analytical_review: 'Analytical review',
    mhMarketsPreset_forex: 'Forex', mhMarketsPreset_crypto: 'Crypto',
    mhYes: 'Yes', mhNo: 'No'
  }
};

const MARITAL_STATUSES = [['single', 'x'], ['married', 'x'], ['divorced', 'x'], ['widowed', 'x'], ['prefer_not_to_say', 'x']];
const GENDERS = [['male', 'x'], ['female', 'x'], ['prefer_not_to_say', 'x']];
const CAPITAL_TYPES = [['surplus', 'x'], ['essential', 'x'], ['mixed', 'x']];
const MOTIVATIONS = [['quick_money', 'x'], ['freedom', 'x']];
const LOSS_REACTIONS = [['revenge_same_day', 'x'], ['analytical_review', 'x']];

function sandbox() {
  const ctx = {
    window: { TradeJournalMentalHealthI18n: { messages: FAKE_MESSAGES } },
    INTAKE_ENUM_OPTIONS: { MARKET_PRESETS: ['forex', 'crypto'] }
  };
  vm.runInNewContext(fnSources + '\nthis.normalizeIntakeChoice = normalizeIntakeChoice; this.normalizeIntakeBoolean = normalizeIntakeBoolean; this.normalizeIntakeMarket = normalizeIntakeMarket;', ctx);
  return ctx;
}

test('normalizeIntakeChoice() returns the exact internal key unchanged (the model already got it right)', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'married'), 'married');
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'Married'), 'married', 'case-insensitive');
});

test('normalizeIntakeChoice() maps the real, already-shown Persian label onto the internal key - the exact bug report scenario', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'متأهل'), 'married');
  assert.equal(ctx.normalizeIntakeChoice(GENDERS, 'mhGender_', 'زن'), 'female');
  assert.equal(ctx.normalizeIntakeChoice(CAPITAL_TYPES, 'mhCapitalType_', 'سرمایه مازاد'), 'surplus');
});

test('normalizeIntakeChoice() maps a full sentence wrapping the real label ("متأهل هستم" - "I am married") - real speech is rarely just the bare label', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'متأهل هستم'), 'married');
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'من متأهل هستم'), 'married');
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'I am married'), 'married');
});

test('normalizeIntakeChoice() matches every supported language, not just the current UI language', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'Single'), 'single');
  assert.equal(ctx.normalizeIntakeChoice(MOTIVATIONS, 'mhMotivation_', 'آزادی'), 'freedom');
  assert.equal(ctx.normalizeIntakeChoice(LOSS_REACTIONS, 'mhLossReaction_', 'Analytical review'), 'analytical_review');
});

test('normalizeIntakeChoice() prefers the longer, more specific label over a shorter one that also matches', () => {
  const ctx = sandbox();
  // "مطلقه/مطلق" (divorced, combined feminine/masculine label) sharing a prefix with nothing else
  // here - the real regression risk is a SHORT label shadowing a longer, more specific match.
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'مطلق'), 'divorced');
});

test('normalizeIntakeChoice() returns null (leaves the field missing) for text matching no real option in any language - never a guess', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', 'purple elephant'), null);
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', ''), null);
  assert.equal(ctx.normalizeIntakeChoice(MARITAL_STATUSES, 'mhMaritalStatus_', null), null);
});

test('normalizeIntakeBoolean() passes a real boolean through unchanged, maps "true"/"false" strings, and maps every language\'s real Yes/No label (bare or inside a sentence)', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeBoolean(true), true);
  assert.equal(ctx.normalizeIntakeBoolean(false), false);
  assert.equal(ctx.normalizeIntakeBoolean('true'), true);
  assert.equal(ctx.normalizeIntakeBoolean('بله'), true);
  assert.equal(ctx.normalizeIntakeBoolean('خیر'), false);
  assert.equal(ctx.normalizeIntakeBoolean('Yes'), true);
  assert.equal(ctx.normalizeIntakeBoolean('بله حتما'), true, 'a real sentence wrapping the bare "بله" label');
});

test('normalizeIntakeBoolean() returns null for an ambiguous answer containing both a yes AND a no label, or neither - never guesses', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeBoolean('maybe'), null);
  assert.equal(ctx.normalizeIntakeBoolean('yes no'), null, 'contradictory - refuses to pick a side');
});

test('normalizeIntakeMarket() maps a real preset label onto its internal key, in any language', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeMarket('فارکس'), 'forex');
  assert.equal(ctx.normalizeIntakeMarket('Crypto'), 'crypto');
  assert.equal(ctx.normalizeIntakeMarket('forex'), 'forex');
});

test('normalizeIntakeMarket() passes an unrecognized market name through as-is (a real custom entry, unlike the strict-choice fields) rather than rejecting it', () => {
  const ctx = sandbox();
  assert.equal(ctx.normalizeIntakeMarket('Options on Palladium Futures'), 'Options on Palladium Futures');
  assert.equal(ctx.normalizeIntakeMarket(''), null);
});

test('psychology.intake.start declares the real normalizeField, dispatching every enum-shaped intake path to the right normalizer', () => {
  const re = /id: 'psychology\.intake\.start'[\s\S]*?normalizeField: \(path, value\) => \{[\s\S]*?\},\s*\n\s*open:/;
  const match = re.exec(characterAppSrc);
  assert.ok(match, 'could not find psychology.intake.start\'s own normalizeField block');
  const block = match[0];
  assert.match(block, /path === 'intake\.demographics\.gender'/);
  assert.match(block, /path === 'intake\.demographics\.maritalStatus'/);
  assert.match(block, /path === 'intake\.demographics\.primaryOccupation'/);
  assert.match(block, /path === 'intake\.financialContext\.capitalType'/);
  assert.match(block, /path === 'intake\.motivationForTrading'/);
  assert.match(block, /path === 'intake\.firstBigLossReaction'/);
  assert.match(block, /path === 'intake\.tradingHistory\.marketsTraded'/);
  assert.match(block, /INTAKE_BOOLEAN_PATHS\[path\]/);
});

test('character-app.jsx imports INTAKE_ENUM_OPTIONS from mentalHealthIntakeModal.jsx directly - never a second, hand-duplicated option list', () => {
  assert.match(characterAppSrc, /import \{ openIntake, INTAKE_ENUM_OPTIONS \} from '\.\/mentalHealthIntakeModal\.jsx'/);
});
