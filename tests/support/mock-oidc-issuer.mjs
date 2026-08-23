import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

// A minimal, spec-shaped OIDC Provider used ONLY by this test suite (tests/oidc-adapter.test.mjs,
// tests/routes.auth-oidc.test.mjs) to exercise server/community/security/oidc.mjs's REAL
// discovery/PKCE/state/nonce/token-exchange/claims-verification logic against a real HTTP
// issuer - not a stubbed function. It is not a production dependency and is never imported
// outside tests/. Skips real user interaction (the /authorize endpoint auto-approves using
// whatever "next user" the test configured) since the property under test is NAVRYA's own RP
// adapter, not a login UI.
export async function createMockOidcIssuer({ port = 0 } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  const codes = new Map(); // code -> { clientId, redirectUri, codeChallenge, nonce, user }
  let nextUser = { sub: 'mock-sub-1', email: 'trader@example.com', email_verified: true, name: 'Mock Trader' };

  let baseUrl = '';

  function json(res, status, body) {
    const payload = Buffer.from(JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': payload.length });
    res.end(payload);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, baseUrl);
    if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return json(res, 200, {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        jwks_uri: `${baseUrl}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        scopes_supported: ['openid', 'email', 'profile'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
        code_challenge_methods_supported: ['S256']
      });
    }
    if (req.method === 'GET' && url.pathname === '/jwks') {
      return json(res, 200, { keys: [jwk] });
    }
    if (req.method === 'GET' && url.pathname === '/authorize') {
      const params = url.searchParams;
      const code = randomUUID();
      codes.set(code, {
        redirectUri: params.get('redirect_uri'),
        codeChallenge: params.get('code_challenge'),
        nonce: params.get('nonce'),
        user: nextUser
      });
      const redirect = new URL(params.get('redirect_uri'));
      redirect.searchParams.set('code', code);
      if (params.get('state')) redirect.searchParams.set('state', params.get('state'));
      res.writeHead(302, { Location: redirect.href });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyParams = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const code = bodyParams.get('code');
      const entry = codes.get(code);
      if (!entry) return json(res, 400, { error: 'invalid_grant' });
      codes.delete(code); // single-use, mirrors a real authorization code
      const verifier = bodyParams.get('code_verifier') || '';
      const computedChallenge = createHash('sha256').update(verifier).digest('base64url');
      if (computedChallenge !== entry.codeChallenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
      const idToken = await new SignJWT({
        email: entry.user.email,
        email_verified: entry.user.email_verified,
        name: entry.user.name,
        nonce: entry.nonce
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .setSubject(entry.user.sub)
        .setIssuer(baseUrl)
        .setAudience(bodyParams.get('client_id') || 'test-client')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      return json(res, 200, {
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken
      });
    }
    json(res, 404, { error: 'not_found' });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    url: baseUrl,
    setNextUser(user) { nextUser = { ...nextUser, ...user }; },
    close() { return new Promise((resolve) => server.close(resolve)); }
  };
}
