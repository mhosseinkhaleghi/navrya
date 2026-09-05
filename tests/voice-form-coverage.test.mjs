import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = (...parts) => readFile(path.join(root, ...parts), 'utf8');

const [characterSrc, weeklySrc, reflectionSrc, moodSrc, routineSrc, therapistSrc, profileOnboardingSrc, profilesViewSrc, strategiesHubSrc, processRegistrySrc, workflowEngineSrc, chatDockSrc] = await Promise.all([
  source('navrya-src', 'character-app.jsx'),
  source('navrya-src', 'weeklyCheckInModal.jsx'),
  source('navrya-src', 'postTradeReflectionModal.jsx'),
  source('navrya-src', 'moodTab.jsx'),
  source('navrya-src', 'routineTab.jsx'),
  source('navrya-src', 'therapistTab.jsx'),
  source('navrya-src', 'analysisProfileOnboarding.jsx'),
  source('navrya-src', 'analysisProfilesView.jsx'),
  source('navrya-src', 'strategiesHubView.jsx'),
  source('public', 'pages', 'shared', 'ai-process-registry.js'),
  source('public', 'pages', 'shared', 'ai-workflow-engine.js'),
  source('public', 'pages', 'shared', 'chat-dock-core.js')
]);

function actionBlock(id) {
  const start = characterSrc.indexOf("id: '" + id + "'");
  assert.notEqual(start, -1, `missing Action Registry entry ${id}`);
  const next = characterSrc.indexOf('window.TradeJournalAIActionRegistry.registerAction({', start + 1);
  return characterSrc.slice(start, next === -1 ? characterSrc.length : next);
}

test('Weekly Check-In is action-startable through its existing openWeeklyCheckIn() path and submits through its real save handler', () => {
  const action = actionBlock('psychology.weeklyCheckIn.fill');
  assert.match(action, /openWeeklyCheckIn\(\)/);
  assert.match(action, /processId: 'mh-weekly-checkin'/);
  assert.match(action, /submit\('mh-weekly-checkin'\)/);
  assert.match(weeklySrc, /layer: 'foreground', actionId: 'psychology\.weeklyCheckIn\.fill'/);
  assert.match(weeklySrc, /allowlist: \['disciplineRating', 'biggestWin', 'biggestLesson'\]/);
  assert.match(weeklySrc, /submit: \(\) => saveRef\.current && saveRef\.current\(\)/);
});

test('Post-Trade Reflection resolves only an explicit recent/active closed trade, opens the real modal, and declares its real wizard map', () => {
  const action = actionBlock('psychology.postTradeReflection.fill');
  assert.match(action, /resolutionOnlyFields: \['tradeReference'\]/);
  assert.match(action, /resolvePostTradeReflectionTrade\(context, initialFields\)/);
  assert.match(action, /openPostTradeReflection\(trade\)/);
  assert.match(action, /processId: 'mh-post-trade-reflection'/);
  assert.match(reflectionSrc, /layer: 'foreground', actionId: 'psychology\.postTradeReflection\.fill'/);
  assert.match(reflectionSrc, /stepForPath: \(path\) =>/);
  assert.match(reflectionSrc, /path === 'deviationReason'\) return 'plan'/);
  assert.match(reflectionSrc, /path === 'sentenceOfTheDay'\) return 'sentence'/);
  assert.match(reflectionSrc, /goToStep,/);
  assert.match(reflectionSrc, /submit: \(\) => finishRef\.current && finishRef\.current\(\)/);
});

test('Psychology Mood, Routine, and Therapist tabs each expose only their actual settable state through the Process Registry', () => {
  assert.match(moodSrc, /registry\.register\('psychology-mood-log', \{/);
  assert.match(moodSrc, /allowlist: \['mood', 'sleepQuality', 'somethingToProveToday', 'significantPersonalEvent'\]/);
  assert.match(moodSrc, /submit: \(\) => \{\s*const moodId = pickedRef\.current;/);
  assert.match(actionBlock('psychology.mood.log'), /openPsychologyProcess\('mood', 'psychology-mood-log'\)/);

  assert.match(routineSrc, /registry\.register\('psychology-routine-editor', \{/);
  assert.match(routineSrc, /allowlist: \['template', 'name', 'days', 'rules\.warn', 'rules\.streak', 'rules\.remind', 'rules\.watch', 'rules\.partial', 'rules\.carry'\]/);
  assert.match(routineSrc, /stepForPath: \(path\) =>/);
  assert.match(routineSrc, /window\.TradeJournalNavryaRoutineHub = \{/);
  assert.match(actionBlock('psychology.routine.create'), /openRoutineEditor\('create'\)/);
  assert.match(actionBlock('psychology.routine.edit'), /openRoutineEditor\('editActive'\)/);

  assert.match(therapistSrc, /registry\.register\('psychology-therapist-review', \{/);
  assert.match(therapistSrc, /allowlist: \['queueView'\]/);
  assert.match(actionBlock('psychology.therapist.review'), /Never approve, reject, or bulk-apply a suggestion by voice/);
  assert.match(actionBlock('psychology.therapist.review'), /openPsychologyProcess\('therapist', 'psychology-therapist-review'\)/);
});

test('Analysis Profile create/edit actions open the existing Strategies tab editor and use its real two-step controlled state', () => {
  const create = actionBlock('profile.analysis.create');
  const edit = actionBlock('profile.analysis.edit');
  assert.match(create, /requiredFields: \['primaryStyleId', 'focusIds', 'name'\]/);
  assert.match(create, /openAnalysisProfileEditor\('create'\)/);
  assert.match(edit, /requiredFields: \['profileName'\]/);
  assert.match(edit, /resolutionOnlyFields: \['profileName'\]/);
  assert.match(edit, /openAnalysisProfileEditor\('edit', matches\[0\]\.id\)/);
  assert.match(profileOnboardingSrc, /registry\.register\('analysis-profile-editor', \{/);
  assert.match(profileOnboardingSrc, /allowlist: \['primaryStyleId', 'secondaryStyleIds', 'customMethodNotes', 'focusIds', 'name'\]/);
  assert.match(profileOnboardingSrc, /stepForPath: \(path\) =>/);
  assert.match(profileOnboardingSrc, /submit: \(\) => completeRef\.current\(\)/);
  assert.match(profilesViewSrc, /window\.TradeJournalNavryaAnalysisProfilesHub = \{/);
  assert.match(strategiesHubSrc, /window\.TradeJournalNavryaAnalysisProfilesShellHub = \{ open: openAnalysisProfiles \}/);
});

test('resolution-only references remain workflow state without being misapplied to a real form allowlist', () => {
  assert.match(workflowEngineSrc, /function isResolutionOnlyField\(action, path\)/);
  assert.match(workflowEngineSrc, /if \(isResolutionOnlyField\(action, field\.path\)\) \{/);
  assert.match(workflowEngineSrc, /resolutionOnlyFields\.forEach/);
});

test('every stepped voice workflow prepares the real next step and waits for a visual frame before the reply/TTS dispatch can continue', () => {
  assert.match(processRegistrySrc, /function moveToPathStep\(entry, path\)/);
  assert.match(processRegistrySrc, /function prepareForPath\(processId, path\)/);
  assert.match(processRegistrySrc, /var stepTransition = moveToPathStep\(entry, path\);/);
  assert.match(workflowEngineSrc, /function waitForVisualStep\(\)/);
  assert.match(workflowEngineSrc, /async function prepareNextQuestion\(workflow, action\)/);
  assert.match(workflowEngineSrc, /registry\.prepareForPath\(workflow\.processId, nextPath\)/);
  assert.match(workflowEngineSrc, /await waitForVisualStep\(\);/);
  assert.match(workflowEngineSrc, /var nextQuestion = await prepareNextQuestion\(workflow, action\);/);

  const applyAt = chatDockSrc.indexOf('workflowResult = await workflowEngine.applyKnownFields');
  const replyAt = chatDockSrc.indexOf("var result = { kind: 'workflow', reply: payload.reply", applyAt);
  assert.ok(applyAt !== -1 && replyAt > applyAt, 'the workflow (including next-step preparation) completes before its reply can reach chat or Voice playback');
});

test('payment-only forms stay outside conversational action coverage', () => {
  for (const id of ['crypto.invoice', 'subscription.purchase', 'subscription.create']) {
    assert.equal(characterSrc.includes("id: '" + id + "'"), false, `${id} must not be an Action Registry entry`);
  }
  assert.doesNotMatch(characterSrc, /openCryptoInvoice|openSubscriptionPurchase/);
});
