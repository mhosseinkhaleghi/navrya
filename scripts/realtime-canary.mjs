#!/usr/bin/env node
// Post-deploy canary for Realtime Voice (fix/voice-mode-hosted-connection, Phase 4/6).
//
// Proves the same-origin SDP-relay deployment is real and correctly wired WITHOUT spending a
// real OpenAI Realtime API call on every deploy: it verifies the full authenticated mint path
// (POST /api/ai/realtime/session returns a real, short-lived ek_ credential), and verifies the
// relay endpoint (POST /api/ai/realtime/call) exists, requires a real session, requires
// application/sdp, and correctly rejects a bearer it never minted (REALTIME_LEASE_INVALID) - it
// deliberately never forwards the REAL minted token to the real OpenAI upstream, so this can run
// safely and automatically on every deploy without burning real API quota/cost or depending on
// OpenAI being reachable from wherever this script runs.
//
// This is a bounded, targeted check - not a substitute for the real, authenticated,
// real-microphone browser acceptance walkthrough described in docs/ai/realtime-deployment.md's
// "Post-deploy Realtime canary" section. A PASS here proves the deployed relay route is live and
// enforces auth correctly; it does not prove ICE/media/LISTENING - only a real browser can prove
// that (see this repository's Known Constraints on why an automated environment cannot).
//
// Never logs a raw session cookie, ephemeral credential, or SDP body - only stage names and
// pass/fail booleans.

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (match) out[match[1]] = match[2] === undefined ? true : match[2];
  }
  return out;
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function extractSessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const sessionCookie = cookies.find((c) => /^(navrya_session|__Host-navrya_session)=/.test(c));
  return sessionCookie ? sessionCookie.split(';')[0] : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args['base-url'] || '').replace(/\/$/, '');
  const email = args.email;
  const password = args.password;
  const shouldRegister = Boolean(args.register);

  if (!baseUrl || !email || !password) {
    console.error('Usage: node scripts/realtime-canary.mjs --base-url=https://app.navrya.com --email=<address> --password=<password> [--register]');
    console.error('  --register   create the account first (POST /api/auth/register) instead of logging into an existing one - use a throwaway test account, never a real user\'s credentials');
    process.exitCode = 1;
    return;
  }

  console.log(`Realtime canary against ${baseUrl}`);
  let cookie;

  // 1) Real authentication - a real session cookie, never a forged one.
  try {
    const authPath = shouldRegister ? '/api/auth/register' : '/api/auth/login';
    const body = shouldRegister ? { email, password, displayName: 'Realtime Canary' } : { email, password };
    const response = await fetch(`${baseUrl}${authPath}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    cookie = extractSessionCookie(response);
    if (!response.ok || !cookie) { fail(`authentication did not return a session cookie (status ${response.status})`); return; }
    pass('authenticated and received a real session cookie');
  } catch (error) {
    fail(`authentication request failed: ${error.message}`);
    return;
  }

  // 2) Anonymous relay call is rejected - proves the relay never admits an unauthenticated caller.
  try {
    const response = await fetch(`${baseUrl}/api/ai/realtime/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ek_canary_probe' }, body: 'v=0'
    });
    if (response.status === 401) pass('anonymous SDP relay call correctly rejected with 401');
    else fail(`anonymous SDP relay call returned ${response.status}, expected 401`);
  } catch (error) {
    fail(`anonymous relay probe failed: ${error.message}`);
  }

  // 3) The real mint endpoint - proves the full ephemeral-credential path works end to end
  // (session auth -> quota check -> a real, short-lived ek_ value from OpenAI). Never logs the
  // value itself.
  let mintedOk = false;
  try {
    const response = await fetch(`${baseUrl}/api/ai/realtime/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ language: 'en' })
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && typeof body.value === 'string' && body.value.startsWith('ek_')) {
      mintedOk = true;
      pass(`minted a real ephemeral Realtime credential (model: ${body.model || 'unknown'})`);
    } else {
      fail(`session mint did not return a valid ek_ credential (status ${response.status}, error ${body.error || 'none'})`);
    }
  } catch (error) {
    fail(`session mint request failed: ${error.message}`);
  }

  // 4) Wrong content type is rejected.
  try {
    const response = await fetch(`${baseUrl}/api/ai/realtime/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ek_canary_probe', Cookie: cookie }, body: '{}'
    });
    if (response.status === 415) pass('non-SDP content type correctly rejected with 415');
    else fail(`wrong content type returned ${response.status}, expected 415`);
  } catch (error) {
    fail(`content-type probe failed: ${error.message}`);
  }

  // 5) A bearer this server never minted is rejected - proves the lease-binding check is live,
  // WITHOUT ever spending the real minted token from step 3 against the real OpenAI upstream.
  try {
    const response = await fetch(`${baseUrl}/api/ai/realtime/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ek_canary_never_minted_by_this_server', Cookie: cookie }, body: 'v=0'
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && body.error === 'REALTIME_LEASE_INVALID') pass('an unminted/unbound bearer is correctly rejected (REALTIME_LEASE_INVALID)');
    else fail(`unminted bearer probe returned status ${response.status} / error ${body.error || 'none'}, expected 401 REALTIME_LEASE_INVALID`);
  } catch (error) {
    fail(`lease-binding probe failed: ${error.message}`);
  }

  if (!mintedOk) fail('mint check did not pass - Voice Mode is not fully deployable from this environment');
  console.log(process.exitCode ? '\nRealtime canary: FAILED' : '\nRealtime canary: PASSED');
}

main();
