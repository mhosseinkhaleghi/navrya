import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static-source contract for the Level 1 "Start of the Path" + AI Analysis Discipline UI wiring
// and its four-language strings - the same static-source-test convention this repo already uses
// for JSX/DOM-heavy files with no jsdom/RTL harness (see HANDOFF.md's fix/trade-log-wizard-ux
// entry). This does not render the component; it proves the required wiring/strings exist
// verbatim in source, which is what a missing i18n key or an unwired prop would actually break.

const root = process.cwd();
const NEW_ACHIEVEMENT_KEYS = [
  'first_session_ai_analysis', 'first_chart_instrument_added',
  'session_ai_discipline_3d', 'session_ai_discipline_7d', 'session_ai_discipline_14d',
  'session_ai_discipline_30d', 'session_ai_discipline_90d', 'session_ai_discipline_180d', 'session_ai_discipline_365d',
  'session_analysis_follow_through'
];
const NEW_LABEL_KEYS = [
  'FirstSessionAiAnalysis', 'FirstChartInstrumentAdded',
  'SessionAiDiscipline3d', 'SessionAiDiscipline7d', 'SessionAiDiscipline14d',
  'SessionAiDiscipline30d', 'SessionAiDiscipline90d', 'SessionAiDiscipline180d', 'SessionAiDiscipline365d',
  'SessionAnalysisFollowThrough'
];

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

let profileAchievementsSrc, xpConfigSrc, i18nSrc, viewSrc, storeSrc;

test.before(async () => {
  profileAchievementsSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'profile-achievements.js'), 'utf8');
  xpConfigSrc = await readFile(path.join(root, 'server', 'community', 'xp-config.mjs'), 'utf8');
  i18nSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'account-profile-i18n.js'), 'utf8');
  viewSrc = await readFile(path.join(root, 'navrya-src', 'accountProfileView.jsx'), 'utf8');
  storeSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'account-profile-store.js'), 'utf8');
});

test('profile-achievements.js declares all 10 new achievements as serverOnly (never client-submittable evidence)', () => {
  NEW_ACHIEVEMENT_KEYS.forEach((key) => {
    const re = new RegExp("key: '" + key + "'[^}]*serverOnly: true");
    assert.match(profileAchievementsSrc, re, key + ' must be present and serverOnly');
  });
});

test('the 10 new achievements are never added to the client-submittable achievement-rules.mjs table', async () => {
  const achievementRulesSrc = await readFile(path.join(root, 'server', 'community', 'achievement-rules.mjs'), 'utf8');
  NEW_ACHIEVEMENT_KEYS.forEach((key) => {
    assert.doesNotMatch(achievementRulesSrc, new RegExp(key + ':'), key + ' must not be client-submittable via POST /me/achievements/:key/unlock');
  });
});

test('xp-config.mjs exposes admin-configurable XP for all 10 new achievements with the suggested defaults', () => {
  const expected = {
    first_session_ai_analysis: 10, first_chart_instrument_added: 5,
    session_ai_discipline_3d: 10, session_ai_discipline_7d: 20, session_ai_discipline_14d: 30,
    session_ai_discipline_30d: 60, session_ai_discipline_90d: 100, session_ai_discipline_180d: 150, session_ai_discipline_365d: 250,
    session_analysis_follow_through: 15
  };
  Object.entries(expected).forEach(([key, points]) => {
    assert.match(xpConfigSrc, new RegExp(key + ':\\s*' + points + '\\b'), key + ' must default to ' + points + ' XP');
  });
});

test('account-profile-i18n.js has a Title and Desc string for all 10 new achievements in each of fa/en/ar/es (4 occurrences each)', () => {
  NEW_LABEL_KEYS.forEach((labelKey) => {
    assert.equal(countOccurrences(i18nSrc, 'ach' + labelKey + 'Title:'), 4, 'ach' + labelKey + 'Title must appear once per language');
    assert.equal(countOccurrences(i18nSrc, 'ach' + labelKey + 'Desc:'), 4, 'ach' + labelKey + 'Desc must appear once per language');
  });
});

test('accountProfileView.jsx assigns a tier and icon to every one of the 10 new achievement keys', () => {
  NEW_ACHIEVEMENT_KEYS.forEach((key) => {
    assert.match(viewSrc, new RegExp(key + ":\\s*'(bronze|silver|gold|legend)'"), key + ' must have an ACH_TIER entry');
    assert.match(viewSrc, new RegExp(key + ":\\s*'[a-z-]+'"), key + ' must have an ACH_ICON entry');
  });
});

test('accountProfileView.jsx defines the Start of the Path and AI Analysis Discipline panels and wires their required UI strings in all 4 languages', () => {
  assert.match(viewSrc, /function StartOfPathPanel/);
  assert.match(viewSrc, /function AiDisciplinePanel/);
  assert.match(viewSrc, /const START_OF_PATH_KEYS = \['first_session_ai_analysis', 'first_chart_instrument_added'\];/);
  ['startOfPathTitle', 'disciplineTitle', 'disciplineNextMilestone', 'disciplineActionToday', 'disciplineActionStart', 'disciplineTimezoneNote'].forEach((key) => {
    assert.equal(countOccurrences(viewSrc, key + ':'), 4, key + ' must be translated in all 4 languages');
  });
});

test('the Level and Achievements tabs are wired with unlockedByKey/aiDiscipline props at their real render call sites', () => {
  assert.match(viewSrc, /<LevelTab lang=\{lang\} i18n=\{i18n\} profile=\{profile\} mastery=\{mastery\} xpEvents=\{xpEvents\} unlockedByKey=\{unlockedByKey\} aiDiscipline=\{aiDiscipline\} \/>/);
  assert.match(viewSrc, /<AchievementsTab lang=\{lang\} i18n=\{i18n\} profile=\{profile\} unlockedByKey=\{unlockedByKey\} openId=\{openAch\} setOpenId=\{setOpenAch\} aiDiscipline=\{aiDiscipline\} \/>/);
  assert.match(viewSrc, /getAiDisciplineStatus/, 'the top-level view must fetch AI discipline status');
});

test('AchievementsTab computes real (non-misleading) progress for discipline milestones from server data, not the local snapshot', () => {
  assert.match(viewSrc, /disciplineProgressFor\(def\.key, aiDiscipline\)/);
});

test('accountProfileView.jsx defines the discipline heatmap, weekly consistency, and analysis-debt UI, translated in all 4 languages', () => {
  assert.match(viewSrc, /function DisciplineHeatmapPanel/);
  assert.match(viewSrc, /<DisciplineHeatmapPanel lang=\{lang\} aiDiscipline=\{aiDiscipline\} \/>/);
  assert.match(viewSrc, /aiDiscipline\.weeklyConsistency/);
  assert.match(viewSrc, /aiDiscipline\.analysisDebt/);
  ['disciplineWeeklyLabel', 'disciplineDebtNotice', 'disciplineHeatmapTitle'].forEach((key) => {
    assert.equal(countOccurrences(viewSrc, key + ':'), 4, key + ' must be translated in all 4 languages');
  });
});

test('account-profile-store.js exposes getAiDisciplineStatus and sends the browser timezone with the achievements/discipline requests', () => {
  assert.match(storeSrc, /function getAiDisciplineStatus/);
  assert.match(storeSrc, /getAiDisciplineStatus:\s*getAiDisciplineStatus/);
  assert.match(storeSrc, /\/api\/users\/me\/achievements\?timezone=/);
  assert.match(storeSrc, /\/api\/users\/me\/ai-discipline\?timezone=/);
});
