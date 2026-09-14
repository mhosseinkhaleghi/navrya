import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// NAVRYA Media Drive, cross-domain wiring pass - connects the SAME reusable MediaPicker/
// mediaDriveClient (navrya-src/liveSessionView.jsx's own earlier integration) to Trade
// screenshots, the Trade Calculator's screenshot import, Pattern reference screenshots (both live
// UI surfaces), and Strategy Education attachments - everywhere a trader can upload an image
// EXCEPT Support Tickets (explicitly excluded by product decision).
//
// navrya-src/*.jsx has no JSX/ESM transform wired into this project's plain `node --test` runner,
// so this is static source-assertion coverage of the real files, matching this project's own
// established convention (see tests/live-session-market-chart.test.mjs's own header comment).
// The classic-script stores (trade-store.js/pattern-registry-store.js/strategy-education-store.js)
// have no window/fetch test harness anywhere in this repo either (confirmed: none of their
// existing higher-level test files load them with a real DOM/fetch shim) - same static-source
// approach is used for their new methods too.

const root = process.cwd();

async function read(relPath) { return readFile(path.join(root, relPath), 'utf8'); }

let tradeStoreSrc, patternStoreSrc, strategyStoreSrc;
let tradeLogSrc, tradeCalcSrc, patternRegistrySrc, strategiesHubSrc, strategyEducationSrc;
let supportViewSrc;

test.before(async () => {
  [tradeStoreSrc, patternStoreSrc, strategyStoreSrc, tradeLogSrc, tradeCalcSrc, patternRegistrySrc, strategiesHubSrc, strategyEducationSrc, supportViewSrc] = await Promise.all([
    read('public/pages/shared/trade-store.js'),
    read('public/pages/shared/pattern-registry-store.js'),
    read('public/pages/shared/strategy-education-store.js'),
    read('navrya-src/tradeLogModal.jsx'),
    read('navrya-src/tradeCalculatorModal.jsx'),
    read('navrya-src/patternRegistryView.jsx'),
    read('navrya-src/strategiesHubView.jsx'),
    read('navrya-src/strategyEducationView.jsx'),
    read('navrya-src/supportView.jsx')
  ]);
});

test('trade-store.js: addScreenshotFromAsset attaches a reference (never re-uploads) and links it against domain "trade"', () => {
  assert.match(tradeStoreSrc, /function addScreenshotFromAsset\(id,asset\)/);
  assert.match(tradeStoreSrc, /addScreenshotFromAsset:addScreenshotFromAsset/, 'must be exported on window.TradeJournalTradeStore');
  assert.match(tradeStoreSrc, /domain:'trade'/);
  assert.match(tradeStoreSrc, /\/api\/sync\/media\/assets\/'\+encodeURIComponent\(mediaAssetId\)\+'\/links'/);
  // Never re-uploads bytes - the new method must not call the existing uploadScreenshot()/
  // /api/sync/trades/images upload path at all.
  const fn = tradeStoreSrc.slice(tradeStoreSrc.indexOf('function addScreenshotFromAsset'), tradeStoreSrc.indexOf('function addScreenshotFromAsset') + 700);
  assert.doesNotMatch(fn, /uploadScreenshot\(/);
});

test('pattern-registry-store.js: addScreenshotFromAsset attaches a reference and links it against domain "pattern"', () => {
  assert.match(patternStoreSrc, /async function addScreenshotFromAsset\(patternId, asset\)/);
  assert.match(patternStoreSrc, /addScreenshotFromAsset: addScreenshotFromAsset,/);
  assert.match(patternStoreSrc, /domain: 'pattern'/);
  assert.doesNotMatch(
    patternStoreSrc.slice(patternStoreSrc.indexOf('async function addScreenshotFromAsset'), patternStoreSrc.indexOf('async function removeScreenshot')),
    /uploadScreenshot\(/
  );
});

test('strategy-education-store.js: addAttachmentFromAsset attaches a reference and links it against domain "strategy"', () => {
  assert.match(strategyStoreSrc, /async function addAttachmentFromAsset\(strategyId, category, asset\)/);
  assert.match(strategyStoreSrc, /addAttachmentFromAsset: addAttachmentFromAsset,/);
  assert.match(strategyStoreSrc, /domain: 'strategy'/);
  assert.doesNotMatch(
    strategyStoreSrc.slice(strategyStoreSrc.indexOf('async function addAttachmentFromAsset'), strategyStoreSrc.indexOf('async function removeAttachment')),
    /uploadAttachmentImage\(/
  );
});

test('Trade Log wizard (tradeLogModal.jsx): StepScreenshots gets a Media Drive trigger; finish() attaches picked Drive assets via addScreenshotFromAsset, in addition to (never instead of) the existing device-upload path', () => {
  assert.match(tradeLogSrc, /import \{ MediaPicker \} from '\.\.\/public\/pages\/shared\/navrya\/components\/media\/MediaPicker\.jsx';/);
  assert.match(tradeLogSrc, /function StepScreenshots\(\{ t, lang, shots, onRemoveShot, onAddDriveAsset, review \}\)/);
  assert.match(tradeLogSrc, /intent="generic"/);
  assert.match(tradeLogSrc, /onAddDriveAsset=\{\(asset\) => setShots\(\(prev\) => prev\.concat\(\[\{ asset, url: asset\.url, name: asset\.originalFilename \|\| '' \}\]\)\)\}/);
  assert.match(tradeLogSrc, /const filesToUpload = shots\.filter\(\(s\) => s\.file\)\.map\(\(s\) => s\.file\);/);
  assert.match(tradeLogSrc, /const driveAssets = shots\.filter\(\(s\) => s\.asset\)\.map\(\(s\) => s\.asset\);/);
  assert.match(tradeLogSrc, /tradeStore\.addScreenshotFromAsset\(v\.id, asset\)/);
  // The existing device-upload path is unchanged - still calls addScreenshots for real Files.
  assert.match(tradeLogSrc, /tradeStore\.addScreenshots\(saved\.id, filesToUpload\)/);
});

test('Trade Calculator (tradeCalculatorModal.jsx): a Media Drive trigger reuses the SAME one-shot vision extraction as a device upload, never persisting the image as a real attachment', () => {
  assert.match(tradeCalcSrc, /import \{ MediaPicker \} from '\.\.\/public\/pages\/shared\/navrya\/components\/media\/MediaPicker\.jsx';/);
  assert.match(tradeCalcSrc, /async function runExtraction\(dataUrl, fileName, token\)/);
  assert.match(tradeCalcSrc, /async function handleDriveAsset\(asset\)/);
  assert.match(tradeCalcSrc, /const \[drivePickerOpen, setDrivePickerOpen\] = React\.useState\(false\);/);
  assert.match(tradeCalcSrc, /onConfirm=\{\(asset\) => \{ setDrivePickerOpen\(false\); if \(asset\) handleDriveAsset\(asset\); \}\}/);
  // The one real vision call (core.analyzeScreenshot) happens inside the shared runExtraction()
  // helper only - handleFiles() and handleDriveAsset() both delegate to it rather than each
  // calling the provider separately, so there is still exactly one extraction path.
  const coreCalls = (tradeCalcSrc.match(/core\.analyzeScreenshot\(/g) || []).length;
  assert.equal(coreCalls, 1, 'analyzeScreenshot must be called from exactly one place (runExtraction), never duplicated per import source');
  // Ephemeral only - this file must never call the Media Asset creation/store endpoints (it is
  // explicitly NOT a persistence flow, unlike the wizard/pattern/strategy surfaces).
  assert.doesNotMatch(tradeCalcSrc, /createAsset\(|\/api\/sync\/media\/assets'/);
});

test('Trade Calculator: the screenshot control is Media Drive ONLY (no separate device-upload button/hidden file input beside it) - the dashed-border design is preserved on the idle state', () => {
  const screenshotImport = tradeCalcSrc.slice(tradeCalcSrc.indexOf('function ScreenshotImport'), tradeCalcSrc.indexOf('function TakeProfitRow'));
  assert.doesNotMatch(screenshotImport, /type="file"/);
  assert.match(screenshotImport, /border: '1px dashed var\(--border-gold\)'/, 'the idle state must keep the shared dashed-border upload-area design');
  assert.match(screenshotImport, /t\('calcMediaDriveButton'\)/);
  // Only one control renders ScreenshotImport - no separate small Drive-only icon button beside it.
  assert.equal((tradeCalcSrc.match(/<ScreenshotImport /g) || []).length, 1);
  assert.doesNotMatch(tradeCalcSrc, /type="file" accept="image\/png,image\/jpeg,image\/webp" ref=\{fileInputRef\}/);
});

test('Trade Log wizard: the screenshot step is Media Drive ONLY (no separate device-dropzone box beside it), still dashed-border, and never re-adds the hidden multi-file input the explicit browse button used to trigger', () => {
  const stepStart = tradeLogSrc.indexOf('function StepScreenshots');
  const stepEnd = tradeLogSrc.indexOf('function TradeLogModal({ seed, options, onClose }) {');
  assert.ok(stepStart > -1 && stepEnd > stepStart, 'could not bound the real StepScreenshots function in tradeLogModal.jsx');
  const stepScreenshots = tradeLogSrc.slice(stepStart, stepEnd);
  assert.doesNotMatch(stepScreenshots, /type="file"/);
  assert.match(stepScreenshots, /border: '1px dashed var\(--border-gold\)'/);
  assert.match(stepScreenshots, /t\('logMediaDriveButton'\)/);
  // Exactly one Media Drive trigger box - the ONLY other button left in this step is the
  // pre-existing per-shot remove ("trash") button, never a second upload/browse control.
  assert.equal((stepScreenshots.match(/type="button" onClick=\{\(\) => setPickerOpen\(true\)\}/g) || []).length, 1);
  assert.equal((stepScreenshots.match(/type="button" onClick=/g) || []).length, 2);
  assert.doesNotMatch(tradeLogSrc, /type="file" accept="image\/png,image\/jpeg,image\/webp" multiple ref=\{fileInputRef\}/);
});

test('Pattern reference screenshots: BOTH live UI surfaces (PatternEditor and PatternDetailsTab) get a Media Drive trigger wired to addScreenshotFromAsset', () => {
  assert.match(patternRegistrySrc, /import \{ MediaPicker \} from '\.\.\/public\/pages\/shared\/navrya\/components\/media\/MediaPicker\.jsx';/);
  assert.match(patternRegistrySrc, /store\.addScreenshotFromAsset\(pattern\.id, asset\)/);
  assert.match(patternRegistrySrc, /intent="generic"/);

  assert.match(strategiesHubSrc, /import \{ MediaPicker \} from '\.\.\/public\/pages\/shared\/navrya\/components\/media\/MediaPicker\.jsx';/);
  assert.match(strategiesHubSrc, /window\.TradeJournalPatternStore\.addScreenshotFromAsset\(pattern\.id, asset\)/);
  assert.match(strategiesHubSrc, /intent="generic"/);
});

test('Strategy Education: the ONE shared AttachmentSection (reused for positionManagement/riskManagement/overallFramework) gets a Media Drive trigger wired to addAttachmentFromAsset - covering all three categories with a single change', () => {
  assert.match(strategyEducationSrc, /import \{ MediaPicker \} from '\.\.\/public\/pages\/shared\/navrya\/components\/media\/MediaPicker\.jsx';/);
  const section = strategyEducationSrc.slice(strategyEducationSrc.indexOf('function AttachmentSection'), strategyEducationSrc.indexOf('function DetailsView'));
  assert.match(section, /store\.addAttachmentFromAsset\(strategy\.id, category, asset\)/);
  assert.match(section, /intent="generic"/);
  // Confirms the single AttachmentSection definition is really reused 3x (one component, three
  // categories) rather than a change needing to be repeated per category.
  const usages = (strategyEducationSrc.match(/<AttachmentSection strategy=\{strategy\} category="(positionManagement|riskManagement|overallFramework)"/g) || []);
  assert.equal(usages.length, 3);
});

test('all four i18n dictionaries declare the new Media Drive button label for every touched domain', () => {
  const files = [
    ['public/pages/shared/trade-i18n.js', 'logMediaDriveButton'],
    ['public/pages/shared/trade-i18n.js', 'calcMediaDriveButton'],
    ['public/pages/shared/pattern-registry-i18n.js', 'mediaDriveButton'],
    ['public/pages/shared/strategy-education-i18n.js', 'mediaDriveButton']
  ];
  return Promise.all(files.map(async ([file, key]) => {
    const content = await read(file);
    const matches = (content.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(matches, 4, `${file} must declare ${key} exactly once per language (fa/ar/en/es = 4 total), found ${matches}`);
  }));
});

test('Support Tickets is explicitly excluded - supportView.jsx never imports MediaPicker or the Media Drive client', () => {
  assert.doesNotMatch(supportViewSrc, /MediaPicker/);
  assert.doesNotMatch(supportViewSrc, /mediaDriveClient/);
});
