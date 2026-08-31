import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Adaptive AI Session Analysis, brief §5 "IMAGE COST CONTROL" - only the pure, DOM-free
// targetDimensions() arithmetic is testable in plain Node; prepareForTransport() itself needs a
// real browser canvas and rejects with BROWSER_ONLY outside one (verified below), matching the
// no-Playwright-available limitation this repo's own memory already documents for canvas-heavy
// paths.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadImagePrep() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-image-prep.js'), sandbox, { filename: 'analysis-image-prep.js' });
  return sandbox.window.TradeJournalAnalysisImagePrep;
}

test('registers window.TradeJournalAnalysisImagePrep', async () => {
  const prep = await loadImagePrep();
  assert.ok(prep);
  assert.equal(typeof prep.targetDimensions, 'function');
});

test('targetDimensions never upscales an image already smaller than the max dimension (brief §5)', async () => {
  const prep = await loadImagePrep();
  const result = prep.targetDimensions(800, 600, 1600);
  assert.equal(result.width, 800);
  assert.equal(result.height, 600);
});

test('targetDimensions downscales the long edge to the max while preserving aspect ratio exactly', async () => {
  const prep = await loadImagePrep();
  const result = prep.targetDimensions(3200, 1600, 1600);
  assert.equal(result.width, 1600);
  assert.equal(result.height, 800);
});

test('targetDimensions handles a portrait image by scaling on height', async () => {
  const prep = await loadImagePrep();
  const result = prep.targetDimensions(1000, 4000, 1600);
  assert.equal(result.height, 1600);
  assert.equal(result.width, 400);
});

test('targetDimensions never returns a zero/negative dimension for a valid non-zero source', async () => {
  const prep = await loadImagePrep();
  const result = prep.targetDimensions(1, 10000, 1600);
  assert.ok(result.width >= 1);
  assert.ok(result.height >= 1);
});

test('prepareForTransport rejects with BROWSER_ONLY outside a real DOM, rather than silently no-op-ing', async () => {
  const prep = await loadImagePrep();
  await assert.rejects(() => prep.prepareForTransport('data:image/png;base64,AAAA'), /BROWSER_ONLY/);
});
