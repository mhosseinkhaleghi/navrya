import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Vibe Coding Panel Studio: every new i18n key this feature introduces must exist in all four
// supported languages (fa/ar/en/es) - the same real per-locale-block parity check
// tests/ai-i18n-utf8-integrity.test.mjs already established for a previous addendum, applied here
// to this feature's own key set. The whole-file UTF-8 byte integrity check itself is NOT
// duplicated here - that repo-wide check already covers every byte in this file, including these
// new keys.

const root = process.cwd();
const i18nPath = path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js');

const PANEL_STUDIO_KEYS = [
  'aiBuilderTitle',
  'panelStudioCreatedPanels', 'panelStudioNewPanel', 'panelStudioSearch', 'panelStudioLoading', 'panelStudioEmptyList',
  'panelStudioStatus_draft', 'panelStudioStatus_ready', 'panelStudioStatus_applied', 'panelStudioStatus_archived',
  'panelStudioArchive', 'panelStudioUnarchive', 'panelStudioArchiveConfirmTitle', 'panelStudioArchiveConfirmBody',
  'panelStudioPromptPlaceholder', 'panelStudioPromptCounter', 'panelStudioGenerate', 'panelStudioCancel', 'panelStudioValidating',
  'panelStudioTab_request', 'panelStudioTab_code', 'panelStudioTab_diff',
  'panelStudioEditSource', 'panelStudioPreviewChanges', 'panelStudioSaveRevision', 'panelStudioCancelEdit',
  'panelStudioConflictNotice', 'panelStudioReload', 'panelStudioNoCodeYet', 'panelStudioNoPromptsYet',
  'panelStudioDiffPick', 'panelStudioRevisionN', 'panelStudioPreview', 'panelStudioNoPreviewYet',
  'panelStudioApplyToDashboard', 'panelStudioApplied', 'panelStudioRevisionHistory', 'panelStudioRestore',
  'panelStudioSourceKind_generated', 'panelStudioSourceKind_manual_edit', 'panelStudioSourceKind_restore',
  'panelStudioNotEntitledTitle', 'panelStudioNotEntitledBody', 'panelStudioUpgrade', 'panelStudioNotEntitled',
  'panelStudioErrorGeneric', 'panelStudioErrorProviderUnsupported', 'panelStudioErrorPromptRequired',
  'panelStudioErrorProvider', 'panelStudioErrorUnavailable', 'panelStudioErrorEmpty',
  'panelStudioErrorTooLarge', 'panelStudioErrorPersistFailed', 'panelStudioErrorWallet'
];

test('every Panel Studio i18n key exists in all four supported languages (fa/ar/en/es)', async () => {
  const source = await readFile(i18nPath, 'utf8');
  const blockBounds = [
    { lang: 'fa', start: source.indexOf('fa: {'), end: source.indexOf('ar: {') },
    { lang: 'ar', start: source.indexOf('ar: {'), end: source.indexOf('en: {') },
    { lang: 'en', start: source.indexOf('en: {'), end: source.indexOf('es: {') },
    { lang: 'es', start: source.indexOf('es: {'), end: source.length }
  ];
  blockBounds.forEach(({ lang, start, end }) => {
    assert.ok(start > -1, lang + ' block not found');
    const block = source.slice(start, end);
    PANEL_STUDIO_KEYS.forEach((key) => assert.match(block, new RegExp('\\b' + key + ':'), lang + ' is missing key ' + key));
  });
});

test('no dead prose-draft-era key survives in any locale block (removed alongside the old PanelBuilderTab)', async () => {
  const source = await readFile(i18nPath, 'utf8');
  const removed = [
    'aiPanelMovedNotice', 'perGenerationCost', 'aiBuilderPromptPlaceholder', 'hintBusy', 'hintTyped', 'installsOnBoard',
    'speakIt', 'generatePanel', 'draftsLabel', 'draftsCount', 'draftPreviewLabel', 'addToBoard', 'editDraftText',
    'discardDraft', 'aiPanelLivePreviewTitle', 'aiPanelLivePreviewBody', 'draftedNote', 'aiBuilderErrorGeneric',
    'quickPromptRevenge', 'quickPromptRiskUsed', 'quickPromptEmotionHeatmap', 'quickPromptMissedPatterns', 'aiNotConfigured'
  ];
  removed.forEach((key) => assert.doesNotMatch(source, new RegExp('\\b' + key + ':'), 'dead key must be fully removed: ' + key));
});

test('the Arabic and Spanish Panel Studio strings decode to real script code points, never mojibake', async () => {
  const source = await readFile(i18nPath, 'utf8');
  assert.ok(source.includes('استوديو البرمجة بالذكاء الاصطناعي'));
  assert.match('استوديو البرمجة بالذكاء الاصطناعي', /[؀-ۿﭐ-﷿ﹰ-﻿]/);
  assert.ok(source.includes('Estudio de Codificación con IA'));
});
