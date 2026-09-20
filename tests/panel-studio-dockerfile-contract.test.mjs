import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Same real-production-incident precedent tests/dockerfile-app-image-contract.test.mjs already
// established for ai-conversation-matcher.js: the `app` Docker stage never copies navrya-src/ at
// all (that directory is browser source, compiled into the `web` stage's bundles), so the three
// pure, dependency-free ESM modules server/pattern-ai-server.mjs imports directly from navrya-src/
// (codingEngine.js, panelStudioTargets.js, dashboardPanelBuilder.js, plus its own
// dashboardPanelBridgeDoc.js dependency) must each be copied individually, at the exact relative
// path they resolve against from server/pattern-ai-server.mjs. dashboardPanelSandbox.jsx is
// client-only and must never be copied here.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_STAGE_FILES = ['codingEngine.js', 'panelStudioTargets.js', 'dashboardPanelBuilder.js', 'dashboardPanelBridgeDoc.js'];

test('the app Docker stage copies each Panel Studio navrya-src module the gateway imports, at the exact relative path it resolves against', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
  const appStage = dockerfile.slice(dockerfile.indexOf('FROM node:22-alpine AS app'));
  APP_STAGE_FILES.forEach((file) => {
    const pattern = new RegExp('COPY navrya-src/' + file.replace('.', '\\.') + ' \\./navrya-src/' + file.replace('.', '\\.'));
    assert.match(appStage, pattern, 'missing exact COPY line for navrya-src/' + file);
  });
  const serverCopyIdx = appStage.indexOf('COPY server ./server');
  const userNodeIdx = appStage.indexOf('USER node');
  APP_STAGE_FILES.forEach((file) => {
    const idx = appStage.indexOf('COPY navrya-src/' + file);
    assert.ok(idx > serverCopyIdx && idx < userNodeIdx, file + ' must be copied after server/ and before the USER node privilege drop');
  });
});

test('dashboardPanelSandbox.jsx (client-only) is never copied into the app image, and the stage never blanket-copies navrya-src/', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
  const appStage = dockerfile.slice(dockerfile.indexOf('FROM node:22-alpine AS app'));
  assert.doesNotMatch(appStage, /COPY[^\n]*dashboardPanelSandbox/, 'the server never touches the JSX sandbox runtime - it must not ship in the API image');
  assert.doesNotMatch(appStage, /COPY navrya-src \.\/navrya-src/, 'must not blanket-copy all of navrya-src/ - only the specific pure modules the gateway actually imports');
});

// Real, executable proof (same technique as tests/dockerfile-app-image-contract.test.mjs): reproduces
// a tree containing ONLY what the fixed Docker app stage copies for these four files, then
// dynamically imports each from that exact layout and proves their real exports work - confirming
// they are genuinely self-contained (no other file dependency the Docker stage would need to
// also ship) and resolve at the exact path server/pattern-ai-server.mjs's own relative imports use.
test('every Panel Studio navrya-src module server/pattern-ai-server.mjs imports actually loads and works from a tree containing ONLY what the fixed app stage copies', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'navrya-panel-studio-app-image-'));
  try {
    await mkdir(path.join(tmpRoot, 'navrya-src'), { recursive: true });
    for (const file of APP_STAGE_FILES) {
      await cp(path.join(root, 'navrya-src', file), path.join(tmpRoot, 'navrya-src', file));
    }
    const codingEngineUrl = pathToFileURL(path.join(tmpRoot, 'navrya-src', 'codingEngine.js')).href;
    const { resolveCodingEngine } = await import(codingEngineUrl);
    assert.deepEqual(resolveCodingEngine('openai'), { codingEngineId: 'codex', codingEngineLabel: 'Codex' });

    const targetsUrl = pathToFileURL(path.join(tmpRoot, 'navrya-src', 'panelStudioTargets.js')).href;
    const { isSupportedTarget } = await import(targetsUrl);
    assert.equal(isSupportedTarget('dashboard.panel'), true);

    const builderUrl = pathToFileURL(path.join(tmpRoot, 'navrya-src', 'dashboardPanelBuilder.js')).href;
    const { parseGeneration, UNAVAILABLE_MARKER } = await import(builderUrl);
    assert.equal(parseGeneration(UNAVAILABLE_MARKER + ' x').reason, 'unavailable');
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
