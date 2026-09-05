import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = (...parts) => readFile(path.join(root, ...parts), 'utf8');

const [characterSrc, weeklySrc, reflectionSrc, moodSrc, routineSrc, therapistSrc, profileOnboardingSrc, profilesViewSrc, strategiesHubSrc, processRegistrySrc] = await Promise.all([
  source('navrya-src', 'character-app.jsx'),
  source('navrya-src', 'weeklyCheckInModal.jsx'),
  source('navrya-src', 'postTradeReflectionModal.jsx'),
  source('navrya-src', 'moodTab.jsx'),
  source('navrya-src', 'routineTab.jsx'),
  source('navrya-src', 'therapistTab.jsx'),
  source('navrya-src', 'analysisProfileOnboarding.jsx'),
  source('navrya-src', 'analysisProfilesView.jsx'),
  source('navrya-src', 'strategiesHubView.jsx'),
  source('public', 'pages', 'shared', 'ai-process-registry.js')
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

// Release-scope note (2026-09-05): an earlier pass of this work also added a proactive
// "prepare and wait for a rendered frame before the reply reaches chat/TTS" mechanism
// (prepareNextQuestion/waitForVisualStep in ai-workflow-engine.js, prepareForPath/moveToPathStep in
// ai-process-registry.js) plus a resolutionOnlyFields concept for fields like tradeReference/
// profileName that identify an entity without ever being a real form control. That work shipped
// alongside real, unrelated regressions in the same shared engine files (a submit-retry bug, and a
// stricter allowlist-confirmation rule that silently broke several already-shipped high-risk
// actions - trade.cancel among them - whose gate fields target a process registered with an
// intentionally empty allowlist). Both concerns lived in the same files, so this release keeps the
// battle-tested engine (public/pages/shared/ai-process-registry.js / ai-workflow-engine.js,
// unchanged) and ships only the six new forms below on top of it - every one of them still fully
// voice/chat-fillable, live-applying, and correctable, through the SAME allowlist/applyValue/
// entityAlreadyPersisted path every existing action already uses. The three genuinely multi-step
// forms among them (Post-Trade Reflection, Routine builder, Analysis Profile) still declare real
// stepForPath/goToStep - the engine's own existing, already-proven per-registration mechanism
// (trade-wizard/mh-intake have used it for months) - so Voice still drives the visible wizard step
// in lockstep with whichever field it just supplied; only the newer, proactive "wait for a browser
// paint before the reply can be spoken" refinement is deferred to a later, isolated pass once the
// engine rewrite above is finished and its own regressions are resolved.
test('the three new multi-step forms (Post-Trade Reflection, Routine builder, Analysis Profile) declare stepForPath/goToStep, the engine\'s existing per-registration step-follow mechanism - not a second, parallel navigation path', () => {
  for (const src of [reflectionSrc, routineSrc, profileOnboardingSrc]) {
    assert.match(src, /stepForPath: \(path\) =>/);
    assert.match(src, /goToStep[,:]/, 'goToStep must be declared, either as the bare shorthand or an inline function');
  }
  assert.match(processRegistrySrc, /if \(typeof entry\.stepForPath === 'function' && typeof entry\.goToStep === 'function'\) \{/);
});

test('resolution-only reference fields (tradeReference, profileName) never reach the real form allowlist - they resolve which entity to open, then sit harmlessly in workflow state, exactly like every other field the target registry does not recognize', () => {
  // The kept engine has no dedicated resolutionOnlyFields concept - the SAME real protection
  // already exists structurally: applyValue() only ever accepts a path in the target's own
  // allowlist, and neither 'mh-post-trade-reflection' nor 'analysis-profile-editor' lists
  // tradeReference/profileName in theirs, so the real modal can never receive either as a value.
  assert.doesNotMatch(reflectionSrc, /allowlist:[^\]]*tradeReference/);
  assert.doesNotMatch(profileOnboardingSrc, /allowlist:[^\]]*profileName/);
});

test('payment-only forms stay outside conversational action coverage', () => {
  for (const id of ['crypto.invoice', 'subscription.purchase', 'subscription.create']) {
    assert.equal(characterSrc.includes("id: '" + id + "'"), false, `${id} must not be an Action Registry entry`);
  }
  assert.doesNotMatch(characterSrc, /openCryptoInvoice|openSubscriptionPurchase/);
});
