import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Media Drive chart-metadata extraction - server/pattern-ai-server.mjs's analyzeMediaChart().
// Same "import once, stub globalThis.fetch" convention tests/session-analysis-server.test.mjs
// already uses for analyzeSession() - analyzeMediaChart() calls the SAME callProvider() internally
// (never a second provider-dispatch path), and persists its outcome through the same
// internalWalletCallWithRetry() bridge every other write this DB-free process makes goes through,
// just against a new path (/internal/media/assets/:id/analysis). This never boots the real
// Community API - the bridge call is stubbed here the same way wallet reserve/settle already is
// elsewhere in this suite (see tests/wallet-reservation-recovery.test.mjs).
const serverModule = await import('../server/pattern-ai-server.mjs');
const { analyzeMediaChart, AI_BILLED_ROUTES, SESSION_ANALYSIS_VISION_SUPPORT } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };

function stubFetch({ modelOutput, onPersist } = {}) {
  return async (url, init) => {
    const href = String(url);
    if (href.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (href.includes('/internal/media/assets/') && href.endsWith('/analysis')) {
      const body = init && init.body ? JSON.parse(init.body) : {};
      if (onPersist) onPersist(body);
      return { ok: true, json: async () => ({ ok: true, asset: { id: 'media-1', metadataStatus: body.status, symbol: body.symbol, timeframe: body.timeframe } }) };
    }
    if (!modelOutput) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ output_text: JSON.stringify(modelOutput), usage: { promptTokens: 10, completionTokens: 5 } }) };
  };
}

const validBody = () => ({ mediaAssetId: 'media-1', imageDataUrl: 'data:image/png;base64,abc', provider: 'openai', apiKey: 'k', model: 'gpt-5.6-luna' });

test('the new Media Drive route is registered as a billed feature, and shares the SAME vision-capability map analyzeSession already uses', () => {
  assert.equal(AI_BILLED_ROUTES['/api/media/analyze-chart'], 'mediaChartAnalyze');
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.openai, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.deepseek, false);
});

test('rejects MEDIA_IMAGE_REQUIRED for a missing/malformed image, before ever calling a provider or persisting anything', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => { calls += 1; return neutralHealthEventResponse; };
  await assert.rejects(() => analyzeMediaChart({ ...validBody(), imageDataUrl: undefined }), /MEDIA_IMAGE_REQUIRED/);
  await assert.rejects(() => analyzeMediaChart({ ...validBody(), imageDataUrl: 'not-a-data-url' }), /MEDIA_IMAGE_REQUIRED/);
  assert.equal(calls, 0, 'a request with no real image must never reach the provider or the persist bridge');
});

test('a non-vision provider is rejected with MODEL_VISION_UNSUPPORTED, and the asset is persisted as an honest "unavailable" state - never left stuck processing, never charged', async () => {
  let persisted = null;
  globalThis.fetch = stubFetch({ onPersist: (body) => { persisted = body; } });
  await assert.rejects(() => analyzeMediaChart({ ...validBody(), provider: 'deepseek' }), /MODEL_VISION_UNSUPPORTED/);
  assert.ok(persisted, 'the unavailable status must be persisted even though the call itself throws');
  assert.equal(persisted.status, 'unavailable');
  assert.equal(persisted.errorCode, 'MODEL_VISION_UNSUPPORTED');
});

test('a real provider/extraction failure is persisted as an honest "failed" state (never invented) and still rethrows so the caller/dispatcher never charges it', async () => {
  let persisted = null;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (href.includes('/internal/media/assets/') && href.endsWith('/analysis')) {
      persisted = JSON.parse(init.body);
      return { ok: true, json: async () => ({ ok: true, asset: { id: 'media-1', metadataStatus: persisted.status } }) };
    }
    return { ok: false, status: 500, json: async () => ({}) }; // the provider call itself fails
  };
  await assert.rejects(() => analyzeMediaChart(validBody()));
  assert.ok(persisted);
  assert.equal(persisted.status, 'failed');
  assert.ok(persisted.errorCode, 'a failure must carry a real error code, never a blank one');
});

test('a successful extraction only ever writes isTradingChart/symbol/timeframe/confidence - never a fabricated price/level, and null-safes a malformed model field instead of guessing', async () => {
  let persisted = null;
  globalThis.fetch = stubFetch({
    modelOutput: { isTradingChart: true, symbol: 'BTCUSDT', timeframe: '15m', confidence: 'very confident' }, // confidence is the WRONG type on purpose
    onPersist: (body) => { persisted = body; }
  });
  const result = await analyzeMediaChart(validBody());
  assert.equal(persisted.status, 'ready');
  assert.equal(persisted.isTradingChart, true);
  assert.equal(persisted.symbol, 'BTCUSDT');
  assert.equal(persisted.timeframe, '15m');
  assert.equal(persisted.confidence, null, 'a non-numeric confidence from the model must never be coerced into a fake number');
  assert.equal(result.provider, 'openai');
  assert.ok(result.usage, 'usage must be reported for authoritative billing/usage recording');
});

test('an image the model reports as not a real trading chart is stored as a real, honest result - never silently dropped', async () => {
  let persisted = null;
  globalThis.fetch = stubFetch({
    modelOutput: { isTradingChart: false, symbol: '', timeframe: '', confidence: 0.92 },
    onPersist: (body) => { persisted = body; }
  });
  await analyzeMediaChart(validBody());
  assert.equal(persisted.status, 'ready');
  assert.equal(persisted.isTradingChart, false);
  assert.equal(persisted.symbol, '', 'an unreadable symbol stays an honest empty string here - server-side normalization (not this function) turns it into null');
});

test('exactly one provider call happens per invocation, matching this app\'s one-extraction-call-per-user-action rule', async () => {
  let providerCalls = 0;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (href.includes('/internal/media/assets/') && href.endsWith('/analysis')) return { ok: true, json: async () => ({ ok: true, asset: {} }) };
    providerCalls += 1;
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ isTradingChart: true, symbol: 'EURUSD', timeframe: '5m', confidence: 0.5 }), usage: null }) };
  };
  await analyzeMediaChart(validBody());
  assert.equal(providerCalls, 1);
});
