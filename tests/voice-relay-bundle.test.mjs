import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// fix/voice-mode-hosted-connection: the four tracked, pre-built NAVRYA bundles
// (public/pages/shared/navrya-{character}-sessions-app.js) are what production Caddy actually
// serves - a source fix in navrya-src/aiVoiceRealtime.js that was never rebuilt into these files
// would leave production running the old, broken behavior indefinitely (this project has a real,
// documented prior incident of exactly that shape - see docs/ai/realtime-deployment.md's
// "Production Repair postmortem" mention). This is a real content check against the actual
// shipped artifacts, not a proxy for them.
//
// Note: the installed @openai/agents-realtime SDK's own OpenAIRealtimeWebRTC constructor embeds
// the literal string "https://api.openai.com/v1/realtime/calls" as its own hardcoded fallback
// default (`options.baseUrl ?? 'https://api.openai.com/v1/realtime/calls'`) - that string is
// therefore expected to still appear in every bundle as dead/unreachable code, since our own
// `baseUrl` override is always supplied and always wins. The real, meaningful assertion is that
// OUR override is present and is what the transport is actually constructed with - not that the
// SDK's own inert fallback text is absent, which would be a false claim.

const bundlePaths = [
  'navrya-hunter-sessions-app.js', 'navrya-engineer-sessions-app.js',
  'navrya-commander-sessions-app.js', 'navrya-sage-sessions-app.js'
].map((name) => path.join(process.cwd(), 'public', 'pages', 'shared', name));

for (const bundlePath of bundlePaths) {
  const name = path.basename(bundlePath);
  test(`${name}: the built bundle constructs OpenAIRealtimeWebRTC with the same-origin relay baseUrl, not left to the SDK's own OpenAI-direct default`, async () => {
    const bundleSrc = await readFile(bundlePath, 'utf8');
    assert.match(bundleSrc, /baseUrl:new URL\("\/api\/ai\/realtime\/call"/, `${name} must contain the same-origin baseUrl override actually being passed to OpenAIRealtimeWebRTC`);
  });
}
