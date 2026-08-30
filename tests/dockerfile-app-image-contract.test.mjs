import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Regression guard for a real production incident: the `app` Docker stage (used by pattern-ai,
// community-api, and migrate in docker-compose.production.yml) only ever copied `server ./server`
// - it never copied anything under public/. server/community/conversation-matcher-bridge.mjs
// (Journey H2, Gate 2) loads public/pages/shared/ai-conversation-matcher.js at runtime via
// vm.runInNewContext, so every route that calls getConversationMatcher() (publish, the admin
// Trigger Lab's test/test-batch/collisions, and Conversation Studio's audio generation) threw a
// raw ENOENT in the deployed container, surfacing to the admin only as a generic
// COMMUNITY_API_FAILED 500 (server/community/errors.mjs's own catch-all). No automated test in
// this repo runs against the actual built image, so this was never caught until a real admin hit
// Publish against real staging/production.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the app Docker stage copies the one public/ file conversation-matcher-bridge.mjs needs at runtime, at the exact relative path it resolves against', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
  const appStage = dockerfile.slice(dockerfile.indexOf('FROM node:22-alpine AS app'));
  assert.match(appStage, /COPY public\/pages\/shared\/ai-conversation-matcher\.js \.\/public\/pages\/shared\/ai-conversation-matcher\.js/,
    'the app image must copy this exact file at this exact path - conversation-matcher-bridge.mjs resolves it relative to its own file location (../../public/pages/shared/ai-conversation-matcher.js from server/community/), never from the process CWD');
  // Must come after `COPY server ./server` and before the final `USER node` - copying it as root,
  // before the privilege drop, is what makes it actually readable by the `node` user afterward
  // (chown -R node:node /app already covers everything copied by that point).
  const serverCopyIdx = appStage.indexOf('COPY server ./server');
  const matcherCopyIdx = appStage.indexOf('COPY public/pages/shared/ai-conversation-matcher.js');
  const userNodeIdx = appStage.indexOf('USER node');
  assert.ok(serverCopyIdx > -1 && matcherCopyIdx > serverCopyIdx && matcherCopyIdx < userNodeIdx,
    'the matcher file must be copied after server/ and before the USER node privilege drop');
});

test('the app stage does not vendor the whole public/ tree - only this one file, keeping the API image from shipping browser-only bundles it never needs', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
  const appStage = dockerfile.slice(dockerfile.indexOf('FROM node:22-alpine AS app'));
  assert.doesNotMatch(appStage, /COPY public \.\/public/, 'must not blanket-copy all of public/ into the API image');
  assert.doesNotMatch(appStage, /COPY public\/pages\/shared \.\/public\/pages\/shared/, 'must not copy the whole shared/ directory either - only the one file the bridge actually reads');
});

// Real, executable proof this fix actually works - not just a text pattern on the Dockerfile.
// Reproduces, on a real isolated filesystem, EXACTLY the file set the fixed `app` stage's COPY
// commands produce (server/, plus this one public/ file, nothing else under public/), then
// dynamically imports the real conversation-matcher-bridge.mjs from that tree and proves
// getConversationMatcher() actually resolves - the original bug was a path-resolution/missing-file
// problem, which a purely textual assertion on the Dockerfile can never fully prove fixed.
test('conversation-matcher-bridge.mjs actually loads the matcher when run from a tree containing ONLY what the fixed Docker app stage copies (server/ + this one public/ file)', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'navrya-app-image-'));
  try {
    await mkdir(path.join(tmpRoot, 'server', 'community'), { recursive: true });
    await cp(
      path.join(root, 'server', 'community', 'conversation-matcher-bridge.mjs'),
      path.join(tmpRoot, 'server', 'community', 'conversation-matcher-bridge.mjs')
    );
    await mkdir(path.join(tmpRoot, 'public', 'pages', 'shared'), { recursive: true });
    await cp(
      path.join(root, 'public', 'pages', 'shared', 'ai-conversation-matcher.js'),
      path.join(tmpRoot, 'public', 'pages', 'shared', 'ai-conversation-matcher.js')
    );
    const bridgeUrl = pathToFileURL(path.join(tmpRoot, 'server', 'community', 'conversation-matcher-bridge.mjs')).href;
    const { getConversationMatcher } = await import(bridgeUrl);
    const matcher = await getConversationMatcher();
    assert.equal(typeof matcher.matchScenarios, 'function', 'the real matcher must load and expose its real API from this exact file set');
    assert.equal(typeof matcher.templateVariablesIn, 'function');
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

// The inverse case - proves this test suite would have caught the ORIGINAL bug: with only
// server/ present (the pre-fix Docker app stage's actual contents), the exact same call throws,
// reproducing the real ENOENT that surfaced to admins as a generic COMMUNITY_API_FAILED 500.
test('conversation-matcher-bridge.mjs throws (never silently returns something broken) when public/ is entirely absent - reproducing the exact pre-fix production bug', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'navrya-app-image-broken-'));
  try {
    await mkdir(path.join(tmpRoot, 'server', 'community'), { recursive: true });
    await cp(
      path.join(root, 'server', 'community', 'conversation-matcher-bridge.mjs'),
      path.join(tmpRoot, 'server', 'community', 'conversation-matcher-bridge.mjs')
    );
    // No public/ directory at all - the exact pre-fix `app` image layout.
    const bridgeUrl = pathToFileURL(path.join(tmpRoot, 'server', 'community', 'conversation-matcher-bridge.mjs')).href;
    const { getConversationMatcher } = await import(bridgeUrl);
    await assert.rejects(() => getConversationMatcher(), /ENOENT/, 'must throw ENOENT reading the missing file - this is the real, pre-fix production failure mode');
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('every admin conversation-scenarios route that calls getConversationMatcher() is accounted for - a future new call site should prompt re-checking this same Docker dependency', async () => {
  const routesSource = await readFile(path.join(root, 'server', 'admin', 'routes.conversation-scenarios.mjs'), 'utf8');
  const callCount = (routesSource.match(/getConversationMatcher\(\)/g) || []).length;
  // publish, /test, /test-batch, /collisions, the audio-generation route (Section 27's
  // template-variable check), the audio list/approve routes, and enhance-delivery (all added by
  // the expressive-dialogue/context-variant follow-up, re-verified against the same one Docker
  // dependency - no new file needed, every one of these only ever needs
  // ai-conversation-matcher.js) - 8 real call sites as of this fix. Not a hard ceiling forever, but
  // a deliberate tripwire: if this number changes, re-verify the Dockerfile still covers it (nothing
  // about the number itself matters other than "someone looked at this on purpose").
  assert.equal(callCount, 8, 'the number of getConversationMatcher() call sites changed - re-verify the Dockerfile app stage still ships public/pages/shared/ai-conversation-matcher.js for all of them');
});
