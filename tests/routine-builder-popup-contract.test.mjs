import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Static wiring contracts for the Routine builder popup. What the popup renders is covered by
// routine-builder-render.test.mjs and what it stores by routine-store.test.mjs; these pin the
// structural promises that a render alone cannot show: it is a real dialog portaled out of the
// board panel, both hosts (dashboard panel, Psychology tab) reach it through the same component,
// and the Voice/Chat contract the wizard already had is intact.

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');
const [tab, psychology, dashboard, i18nSrc, voice] = await Promise.all([
  read('navrya-src', 'routineTab.jsx'),
  read('navrya-src', 'psychologyView.jsx'),
  read('navrya-src', 'dashboardView.jsx'),
  read('public', 'pages', 'shared', 'trade-i18n.js'),
  read('navrya-src', 'character-app.jsx')
]);

test('the wizard is a Modal portaled to document.body, never rendered inline in its host panel', () => {
  assert.match(tab, /import \{ createPortal \} from 'react-dom';/);
  assert.match(tab, /import \{ Modal \} from '.*feedback\/Modal\.jsx';/);
  assert.match(tab, /return createPortal\(\s*<div data-character=\{currentNavryaCharacter\(\)\}[\s\S]*?<Modal[\s\S]*?<\/Modal>\s*<\/div>,\s*document\.body\s*\);/);
  // the old behaviour - swapping the whole tab for the wizard - must be gone
  assert.doesNotMatch(tab, /if \(mode === 'build'\) \{\s*return <BuildView/);
  assert.doesNotMatch(tab, /if \(!routine && mode !== 'build'\)/);
});

test('the popup opens over the checklist (or the empty state) instead of replacing it', () => {
  const tabFn = tab.slice(tab.indexOf('export function RoutineTab'));
  assert.match(tabFn, /const builder = mode === 'build' && draft/);
  assert.match(tabFn, /<TodayView[^>]*\/>\s*\{builder\}/);
  assert.match(tabFn, /\{builder\}\s*<\/>/);
});

test('both hosts reach the popup through the one RoutineTab component', () => {
  assert.match(dashboard, /case 'routine': return <RoutineTab i18n=\{window\.TradeJournalTradeI18n\} \/>;/);
  assert.match(psychology, /<RoutineTab i18n=\{i18n\} intent=\{routineIntent\}/);
});

test('the Psychology overview buttons open the popup directly instead of just switching tabs', () => {
  assert.match(psychology, /onClick=\{\(\) => onEdit\('new'\)\}/);
  assert.match(psychology, /onClick=\{\(\) => onEdit\('edit'\)\}/);
  assert.match(psychology, /function openRoutine\(intent\) \{ setRoutineIntent\(intent\); setPsyTab\('routine'\); \}/);
  assert.match(psychology, /onOpenRoutine=\{openRoutine\}/);
  // the tab consumes the intent once, then clears it so a later visit does not reopen the popup
  assert.match(tab, /if \(intent === 'edit'\) hub\.startEdit\(\); else hub\.startNew\(\);/);
  assert.match(tab, /if \(onIntentHandled\) onIntentHandled\(\);/);
});

test('closing an edited draft asks first, and saving asks the browser about notifications from the click', () => {
  assert.match(tab, /JSON\.stringify\(draft\) !== openedWith\.current && !window\.confirm\(i18n\.t\('routineDiscardConfirm'\)\)/);
  assert.match(tab, /onCancel=\{requestClose\}/);
  assert.match(tab, /if \(draft\.rules\.remind\) requestReminderPermission\(\);/);
});

test('changing the routine type never silently throws away steps the trader built', () => {
  assert.match(tab, /if \(draft\.stepsTouched && draft\.steps\.length && !window\.confirm\(i18n\.t\('routineChangeTypeConfirm'\)\)\) return;/);
  // editing an existing routine treats its steps as already-touched
  assert.match(tab, /stepsTouched: true, remindTouched: true/);
  // Voice applies a template through the un-confirmed path: it has no hand-built steps to lose
  assert.match(tab, /if \(path === 'template'\) \{ applyTemplate\(String\(value\)\); return; \}/);
});

test('setting a step time turns reminders on unless the trader has already decided about them', () => {
  assert.match(tab, /timeSet && !d\.remindTouched && !d\.rules\.remind \? \{ \.\.\.d\.rules, remind: true \} : d\.rules/);
  assert.match(tab, /remindTouched: key === 'remind' \? true : d\.remindTouched/);
});

test('the Voice/Chat contract of the wizard is unchanged: same process id, allowlist, steps and Hub', () => {
  assert.match(tab, /registry\.register\('psychology-routine-editor', \{/);
  assert.match(tab, /allowlist: \['template', 'name', 'days', 'rules\.warn', 'rules\.streak', 'rules\.remind', 'rules\.watch', 'rules\.partial', 'rules\.carry'\]/);
  assert.match(tab, /stepForPath: \(path\) =>/);
  assert.match(tab, /goToStep: \(nextStep\) => setStep\(/);
  assert.match(tab, /submit: \(\) => onSaveRef\.current\(\)/);
  assert.match(tab, /window\.TradeJournalNavryaRoutineHub = \{/);
  assert.match(voice, /openRoutineEditor\('create'\)/);
  assert.match(voice, /openRoutineEditor\('editActive'\)/);
});

test('every new routine string exists in all four languages', () => {
  const keys = [
    'routineBuildTitle', 'routineAnyHint', 'routineGroup_market', 'routineGroup_life', 'routineGroup_custom',
    'routinePhase_morning', 'routinePhase_day', 'routinePhase_evening', 'routineAddOwn', 'routineStepName',
    'routineStepNamePh', 'routineStepTime', 'routineStepPhase', 'routineAddStep', 'routineTimeHint',
    'routineStepTimeLabel', 'routineClearTime', 'routineRenameStep', 'routineReminderText', 'routineSuggestionsFor',
    'routineDiscardConfirm', 'routineChangeTypeConfirm', 'routineMaxSteps', 'routineNotifyNote'
  ];
  for (const key of keys) {
    const count = (i18nSrc.match(new RegExp('[{,]' + key + ':', 'g')) || []).length;
    assert.equal(count, 4, `${key} must appear exactly 4 times (fa/ar/en/es) - found ${count}`);
  }
});

test('every i18n key the popup source asks for exists in all four languages', () => {
  const used = new Set();
  for (const match of tab.matchAll(/i18n\.t\('([A-Za-z0-9_]+)'/g)) if (!match[1].endsWith('_')) used.add(match[1]);
  // keys built from a prefix in the source
  for (const group of ['market', 'life', 'custom']) used.add('routineGroup_' + group);
  for (const phase of ['pre', 'mind', 'during', 'post', 'weekly', 'morning', 'day', 'evening']) used.add('routinePhase_' + phase);
  const missing = [];
  for (const key of used) {
    const count = (i18nSrc.match(new RegExp('[{,]' + key + ':', 'g')) || []).length;
    if (count < 4 && !['delete', 'cancel'].includes(key)) missing.push(key + ' (' + count + ')');
  }
  assert.deepEqual(missing, []);
});
