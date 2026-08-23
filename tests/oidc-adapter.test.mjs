import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockOidcIssuer } from './support/mock-oidc-issuer.mjs';
import {
  startAuthorization, completeAuthorization, isOidcConfigured, __resetOidcConfigCacheForTests
} from '../server/community/security/oidc.mjs';

const REDIRECT_URI = 'https://app.example.test/api/auth/oidc/callback';

async function withIssuer(t, run) {
  const issuer = await createMockOidcIssuer();
  process.env.OIDC_ISSUER_URL = issuer.url;
  process.env.OIDC_CLIENT_ID = 'test-client';
  process.env.OIDC_CLIENT_SECRET = 'test-secret';
  process.env.OIDC_ALLOW_INSECURE_ISSUER = 'true';
  __resetOidcConfigCacheForTests();
  t.after(async () => {
    await issuer.close();
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_ALLOW_INSECURE_ISSUER;
    __resetOidcConfigCacheForTests();
  });
  return run(issuer);
}

// Simulates the browser's GET to the authorization_endpoint (our mock auto-approves and
// redirects, since a real login UI is not what's under test here) and returns the final
// callback URL the browser would have landed on.
async function simulateBrowserAuthorize(authorizationUrl) {
  const response = await fetch(authorizationUrl, { redirect: 'manual' });
  assert.equal(response.status, 302);
  return new URL(response.headers.get('location'));
}

test('isOidcConfigured is false with no env vars set, true once issuer+clientId are present', async () => {
  const before = { ...process.env };
  delete process.env.OIDC_ISSUER_URL;
  delete process.env.OIDC_CLIENT_ID;
  assert.equal(isOidcConfigured(), false);
  process.env.OIDC_ISSUER_URL = 'https://example.test';
  process.env.OIDC_CLIENT_ID = 'x';
  assert.equal(isOidcConfigured(), true);
  process.env = before;
});

test('full authorization-code + PKCE + state + nonce round trip against a real (mock) OIDC issuer resolves real verified claims', async (t) => {
  await withIssuer(t, async (issuer) => {
    issuer.setNextUser({ sub: 'user-42', email: 'trader42@example.com', email_verified: true, name: 'Trader Forty Two' });

    const { authorizationUrl, state, nonce, codeVerifier } = await startAuthorization({ redirectUri: REDIRECT_URI });
    assert.match(authorizationUrl, /code_challenge=/);
    assert.match(authorizationUrl, /code_challenge_method=S256/);
    assert.match(authorizationUrl, new RegExp(`state=${state}`));

    const callbackUrl = await simulateBrowserAuthorize(authorizationUrl);
    assert.equal(callbackUrl.searchParams.get('state'), state);
    assert.ok(callbackUrl.searchParams.get('code'));

    const { claims, issuer: issuerUsed } = await completeAuthorization({
      currentUrl: callbackUrl, expectedState: state, expectedNonce: nonce, codeVerifier
    });

    assert.equal(claims.sub, 'user-42');
    assert.equal(claims.email, 'trader42@example.com');
    assert.equal(claims.email_verified, true);
    assert.equal(issuerUsed, issuer.url);
  });
});

test('a tampered PKCE code_verifier is rejected by the real token exchange (never silently accepted)', async (t) => {
  await withIssuer(t, async () => {
    const { authorizationUrl, state, nonce } = await startAuthorization({ redirectUri: REDIRECT_URI });
    const callbackUrl = await simulateBrowserAuthorize(authorizationUrl);
    await assert.rejects(
      completeAuthorization({ currentUrl: callbackUrl, expectedState: state, expectedNonce: nonce, codeVerifier: 'wrong-verifier-entirely' })
    );
  });
});

test('a mismatched state is rejected (protects the OAuth flow itself from CSRF)', async (t) => {
  await withIssuer(t, async () => {
    const { authorizationUrl, nonce, codeVerifier } = await startAuthorization({ redirectUri: REDIRECT_URI });
    const callbackUrl = await simulateBrowserAuthorize(authorizationUrl);
    await assert.rejects(
      completeAuthorization({ currentUrl: callbackUrl, expectedState: 'some-other-state-the-attacker-controls', expectedNonce: nonce, codeVerifier })
    );
  });
});

test('a mismatched nonce is rejected (protects against ID token replay)', async (t) => {
  await withIssuer(t, async () => {
    const { authorizationUrl, state, codeVerifier } = await startAuthorization({ redirectUri: REDIRECT_URI });
    const callbackUrl = await simulateBrowserAuthorize(authorizationUrl);
    await assert.rejects(
      completeAuthorization({ currentUrl: callbackUrl, expectedState: state, expectedNonce: 'wrong-nonce', codeVerifier })
    );
  });
});

test('an authorization code cannot be redeemed twice (single-use, replay-resistant)', async (t) => {
  await withIssuer(t, async () => {
    const { authorizationUrl, state, nonce, codeVerifier } = await startAuthorization({ redirectUri: REDIRECT_URI });
    const callbackUrl = await simulateBrowserAuthorize(authorizationUrl);
    await completeAuthorization({ currentUrl: callbackUrl, expectedState: state, expectedNonce: nonce, codeVerifier });
    await assert.rejects(
      completeAuthorization({ currentUrl: callbackUrl, expectedState: state, expectedNonce: nonce, codeVerifier })
    );
  });
});
