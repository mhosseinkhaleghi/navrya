import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
void https;
import test, { after, before } from 'node:test';
import {
  isPrivateAddress, fetchSecurely, readWebsiteSource, readYoutubeSource, extractYoutubeVideoId,
  SourceReadError, READ_SOURCE_MAX_REDIRECTS
} from '../server/ai/source-reader.mjs';

// SSRF-hardened fetcher for the Analysis Profile Knowledge domain (Phase 3, ARCHITECTURE.md
// §7.25). Two layers of test:
//  1. Pure, no-network unit tests against the REAL isPrivateAddress()/DNS-vetting logic - this is
//     what actually proves the SSRF blocklist works, and is never bypassed.
//  2. HTTP-mechanics tests (redirects, size cap, timeout, content-type gate, digest extraction)
//     against a REAL local server this file starts, with `isPrivateAddress` and the DNS resolver
//     both injected (a real loopback server necessarily lives on a private address, and this
//     file's job here is to prove the request/response handling, not re-prove the blocklist).

// ---- isPrivateAddress(): the real SSRF blocklist, exercised directly -----------------------------

test('blocks every private/reserved IPv4 range: loopback, RFC1918, link-local (cloud metadata), CGNAT, TEST-NET, multicast/reserved, 0.0.0.0/8', () => {
  const blocked = [
    '127.0.0.1', '127.55.0.1', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
    '192.168.0.1', '192.168.255.255', '169.254.169.254', '169.254.0.1', '100.64.0.1', '100.100.0.1',
    '0.0.0.0', '0.1.2.3', '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255'
  ];
  for (const address of blocked) assert.equal(isPrivateAddress(address, 4), true, `${address} must be blocked`);
});

test('allows real public IPv4 addresses', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1', '11.0.0.1']) {
    assert.equal(isPrivateAddress(address, 4), false, `${address} must be allowed`);
  }
});

test('blocks IPv6 loopback, unspecified, link-local, and unique-local (ULA, covers several cloud metadata schemes)', () => {
  for (const address of ['::1', '::', 'fe80::1', 'fe80::abcd:1234', 'fc00::1', 'fd00::1', 'ff02::1']) {
    assert.equal(isPrivateAddress(address, 6), true, `${address} must be blocked`);
  }
});

test('unwraps an IPv4-mapped IPv6 address and re-checks it against the real IPv4 rules', () => {
  assert.equal(isPrivateAddress('::ffff:127.0.0.1', 6), true);
  assert.equal(isPrivateAddress('::ffff:169.254.169.254', 6), true);
  assert.equal(isPrivateAddress('::ffff:8.8.8.8', 6), false);
});

test('allows a real public IPv6 address', () => {
  assert.equal(isPrivateAddress('2001:4860:4860::8888', 6), false); // Google public DNS
});

test('a malformed IPv4 literal fails closed (treated as private, never allowed through)', () => {
  assert.equal(isPrivateAddress('not-an-ip', 4), true);
  assert.equal(isPrivateAddress('1.2.3', 4), true);
  assert.equal(isPrivateAddress('1.2.3.4.5', 4), true);
});

// Real bypasses found while reviewing this module: the WHATWG URL parser rewrites the SAME address
// into forms a prefix/regex check misses (::ffff:127.0.0.1 is serialized as ::ffff:7f00:1), and
// several IPv6 forms merely WRAP an IPv4 address (NAT64, 6to4, IPv4-compatible).
test('IPv6 forms that wrap an IPv4 address are unwrapped and re-checked - hex-mapped, NAT64, 6to4 and IPv4-compatible loopback are all blocked', () => {
  const wrapped = ['::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:a9fe:a9fe' /* 169.254.169.254 */, '64:ff9b::7f00:1', '2002:7f00:1::', '::7f00:1', '::ffff:a00:1' /* 10.0.0.1 */];
  for (const address of wrapped) assert.equal(isPrivateAddress(address, 6), true, `${address} wraps a private IPv4 and must be blocked`);
  // ...while the same wrapping of a PUBLIC IPv4 stays allowed - the check unwraps, it doesn't blanket-block IPv6.
  for (const address of ['::ffff:808:808', '64:ff9b::808:808', '2002:808:808::']) assert.equal(isPrivateAddress(address, 6), false, `${address} wraps a public IPv4 and must be allowed`);
});

test('documentation, Teredo, discard-only and AWS-style fd00:ec2::254 IPv6 ranges are blocked; an unparseable IPv6 literal fails closed', () => {
  for (const address of ['2001:db8::1', '2001:0:1::1', '100::1', 'fd00:ec2::254', 'not:an:ipv6', '1:2:3:4:5:6:7:8:9', ':::']) {
    assert.equal(isPrivateAddress(address, 6), true, `${address} must be blocked or fail closed`);
  }
});

test('the REAL resolver blocks every spelling of loopback/metadata a URL can carry (decimal, hex, bracketed IPv6, localhost) - no external network involved', async () => {
  const spellings = ['http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://0177.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://169.254.169.254/latest/meta-data/', 'http://localhost/', 'http://[fd00:ec2::254]/'];
  for (const url of spellings) {
    await assert.rejects(() => fetchSecurely(url, { timeoutMs: 500 }), (error) => error.code === 'SOURCE_ADDRESS_BLOCKED', `${url} must be blocked by the real dns.lookup + real blocklist`);
  }
});

// ---- fetchSecurely()'s own request-shape validation, no network at all --------------------------

test('rejects a non-http(s) protocol before any DNS lookup or network attempt', async () => {
  let resolverCalled = false;
  await assert.rejects(
    () => fetchSecurely('ftp://example.com/file', { resolver: (h, o, cb) => { resolverCalled = true; cb(null, [{ address: '1.2.3.4', family: 4 }]); } }),
    (error) => error instanceof SourceReadError && error.code === 'SOURCE_PROTOCOL_UNSUPPORTED'
  );
  assert.equal(resolverCalled, false, 'an unsupported protocol must be rejected before any DNS lookup');
});

test('rejects a URL naming a non-default port, even when the resolved address would be public', async () => {
  await assert.rejects(
    () => fetchSecurely('http://example.com:6379/', { resolver: (h, o, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]) }),
    (error) => error.code === 'SOURCE_PORT_UNSUPPORTED'
  );
});

test('rejects a URL carrying embedded credentials (user:pass@host)', async () => {
  await assert.rejects(
    () => fetchSecurely('http://user:pass@example.com/', { resolver: (h, o, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }]) }),
    (error) => error.code === 'SOURCE_URL_INVALID'
  );
});

test('a resolved private address is blocked, and the block happens BEFORE any TCP connection is attempted', async () => {
  await assert.rejects(
    () => fetchSecurely('http://internal.example/', { resolver: (h, o, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]), connectPort: 65535 /* nothing listens here - if the code tried to connect this would surface as a connection error, not SOURCE_ADDRESS_BLOCKED */ }),
    (error) => error.code === 'SOURCE_ADDRESS_BLOCKED'
  );
});

test('a hostname resolving to multiple addresses is blocked if EVEN ONE of them is private', async () => {
  await assert.rejects(
    () => fetchSecurely('http://multi-homed.example/', { resolver: (h, o, cb) => cb(null, [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]), connectPort: 65535 }),
    (error) => error.code === 'SOURCE_ADDRESS_BLOCKED'
  );
});

test('a DNS lookup failure surfaces as SOURCE_DNS_FAILED, never an unhandled exception', async () => {
  await assert.rejects(
    () => fetchSecurely('http://does-not-resolve.example/', { resolver: (h, o, cb) => cb(new Error('ENOTFOUND'), null) }),
    (error) => error.code === 'SOURCE_DNS_FAILED'
  );
});

// ---- HTTP mechanics against a real local server (isPrivateAddress/resolver injected, see header) --

let server, port;
let watchHasCaptions = true;
before(async () => {
  server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    if (pathname === '/ok') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<html><head><title>Real Title</title></head><body><script>evil()</script><h1>Hello</h1><p>World &amp; friends</p></body></html>'); return; }
    if (pathname === '/redirect-once') { res.writeHead(302, { Location: '/ok' }); res.end(); return; }
    if (pathname === '/redirect-loop') { res.writeHead(302, { Location: '/redirect-loop' }); res.end(); return; }
    if (pathname === '/too-large') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('x'.repeat(50)); return; }
    if (pathname === '/wrong-type') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); res.end('binary-ish'); return; }
    if (pathname === '/slow') { /* never responds - exercises the timeout path */ return; }
    if (pathname === '/not-found') { res.writeHead(404); res.end('nope'); return; }
    // A real oEmbed response is a plain JSON document, not text/html - matched exactly.
    if (pathname === '/oembed') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ title: 'A Great Talk' })); return; }
    if (pathname === '/watch') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      const body = watchHasCaptions
        ? `<html>var ytInitialPlayerResponse = {"captionTracks":[{"languageCode":"en","baseUrl":"https://www.youtube.com/api/timedtext?v=x\u0026lang=en"}]};</html>`
        : '<html>var ytInitialPlayerResponse = {"other":"stuff"};</html>';
      res.end(body);
      return;
    }
    if (pathname === '/api/timedtext') { res.writeHead(200, { 'Content-Type': 'text/xml' }); res.end('<transcript><text start="0" dur="1">Hello</text><text start="1" dur="1">world</text></transcript>'); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

// A fixed, public-looking hostname the fake resolver always maps to the local test server, so
// every test below exercises the exact same public-URL code path a real trader-supplied URL would.
const HOST = 'public.example.test';
function localOptions(extra) {
  // `transports` maps https to the plain-HTTP local server, so the real https://www.youtube.com URLs
  // the YouTube reader hardcodes can be exercised end to end without a TLS certificate.
  return { resolver: (h, o, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]), isPrivateAddress: () => false, connectPort: port, timeoutMs: 500, transports: { http, https: http }, ...extra };
}
function localUrl(pathname) { return `http://${HOST}${pathname}`; }

test('fetchSecurely returns the real body for a 200 text/html response', async () => {
  const result = await fetchSecurely(localUrl('/ok'), localOptions());
  assert.match(result.body, /Real Title/);
  assert.equal(result.finalUrl, localUrl('/ok'));
});

test('follows a redirect and re-validates the new hop, returning the final body and final URL', async () => {
  const result = await fetchSecurely(localUrl('/redirect-once'), localOptions());
  assert.match(result.body, /Real Title/);
  assert.equal(result.finalUrl, localUrl('/ok'));
});

test('a redirect loop is capped and rejected rather than looping forever', async () => {
  await assert.rejects(() => fetchSecurely(localUrl('/redirect-loop'), localOptions()), (error) => error.code === 'SOURCE_TOO_MANY_REDIRECTS');
});

test(`follows at most ${READ_SOURCE_MAX_REDIRECTS} redirects`, async () => {
  // /redirect-once is a single real hop within budget - already proven above; this asserts the
  // exported constant itself is the small, intentional bound the module's own header documents.
  assert.equal(READ_SOURCE_MAX_REDIRECTS, 3);
});

test('a response over the byte cap is aborted, never buffered past the limit', async () => {
  await assert.rejects(() => fetchSecurely(localUrl('/too-large'), localOptions({ maxBytes: 10 })), (error) => error.code === 'SOURCE_TOO_LARGE');
});

test('a website read rejects a non-text Content-Type (never treats a binary response as a document)', async () => {
  await assert.rejects(() => readWebsiteSource(localUrl('/wrong-type'), localOptions()), (error) => error.code === 'SOURCE_CONTENT_TYPE_UNSUPPORTED');
});

test('the low-level primitive itself does not force one Content-Type (YouTube JSON/HTML/XML sub-fetches share it)', async () => {
  const result = await fetchSecurely(localUrl('/oembed'), localOptions());
  assert.match(result.body, /A Great Talk/);
});

test('the hostname is resolved exactly once per hop and the socket is pinned to that vetted address - a never-resolvable .test name still connects', async () => {
  let lookups = 0;
  const result = await fetchSecurely(localUrl('/ok'), localOptions({ resolver: (h, o, cb) => { lookups += 1; cb(null, [{ address: '127.0.0.1', family: 4 }]); } }));
  assert.match(result.body, /Real Title/);
  assert.equal(lookups, 1, 'a second lookup at connect time is exactly the DNS-rebinding gap the pinned lookup closes');
});

test('a redirect to a private address is re-vetted on the NEW hop and blocked, even though the first hop was public', async () => {
  let call = 0;
  const resolver = (h, o, cb) => { call += 1; cb(null, [{ address: call === 1 ? '127.0.0.1' : '10.0.0.5', family: 4 }]); };
  // The first hop is allowed (predicate says only 10.x is private here); the redirect target
  // resolves to 10.0.0.5 and must be refused before any connection to it.
  await assert.rejects(
    () => fetchSecurely(localUrl('/redirect-once'), localOptions({ resolver, isPrivateAddress: (address) => address.startsWith('10.') })),
    (error) => error.code === 'SOURCE_ADDRESS_BLOCKED'
  );
  assert.equal(call, 2, 'every hop is resolved and vetted from scratch');
});

test('a non-200 status is rejected with the real status code embedded, never silently swallowed', async () => {
  await assert.rejects(() => fetchSecurely(localUrl('/not-found'), localOptions()), (error) => error.code === 'SOURCE_FETCH_FAILED_404');
});

test('a request that never responds is aborted at the timeout, never hangs the caller', async () => {
  await assert.rejects(() => fetchSecurely(localUrl('/slow'), localOptions({ timeoutMs: 200 })), (error) => error.code === 'SOURCE_TIMEOUT');
});

// ---- readWebsiteSource(): title + bounded, script-free plain-text digest -------------------------

test('readWebsiteSource extracts the real title and a script-free, entity-decoded plain-text digest', async () => {
  const result = await readWebsiteSource(localUrl('/ok'), localOptions());
  assert.equal(result.type, 'website');
  assert.equal(result.title, 'Real Title');
  assert.match(result.digest, /Hello/);
  assert.match(result.digest, /World & friends/, 'HTML entities must be decoded');
  assert.doesNotMatch(result.digest, /evil\(\)/, 'script content must never reach the digest');
});

test('readWebsiteSource caps the digest length, never returning the full page', async () => {
  const result = await readWebsiteSource(localUrl('/ok'), localOptions({ maxDigestLength: 5 }));
  assert.ok(result.digest.length <= 5);
});

// ---- readYoutubeSource(): oEmbed title (reliable) + best-effort transcript scrape ---------------

test('extractYoutubeVideoId recognizes watch/shorts/short-link URLs and rejects everything else', () => {
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYoutubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractYoutubeVideoId('not a url'), null);
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=' + '<script>'), null, 'an id-shaped injection attempt must be rejected');
});

test('readYoutubeSource throws immediately for a non-YouTube URL, never attempting a network call', async () => {
  await assert.rejects(() => readYoutubeSource('https://example.com/watch?v=abc123', localOptions()), (error) => error.code === 'SOURCE_NOT_A_YOUTUBE_URL');
});

test('readYoutubeSource returns the oEmbed title and the caption-track transcript when the watch page offers one', async () => {
  watchHasCaptions = true;
  const result = await readYoutubeSource('https://youtu.be/dQw4w9WgXcQ', localOptions());
  assert.equal(result.type, 'youtube');
  assert.equal(result.videoId, 'dQw4w9WgXcQ');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'always cites the canonical watch URL');
  assert.equal(result.title, 'A Great Talk');
  assert.equal(result.digest, 'Hello world');
  assert.equal(result.transcriptAvailable, true);
});

test('readYoutubeSource degrades to the title with transcriptAvailable:false (never throws) when the watch page has no caption tracks', async () => {
  watchHasCaptions = false;
  try {
    const result = await readYoutubeSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ', localOptions());
    assert.equal(result.title, 'A Great Talk');
    assert.equal(result.digest, '');
    assert.equal(result.transcriptAvailable, false, 'the UI uses this to offer the paste-a-transcript fallback');
  } finally { watchHasCaptions = true; }
});

test('readYoutubeSource still returns a result (empty title, no transcript) when every sub-fetch fails - best effort, never a thrown error for a valid video id', async () => {
  const result = await readYoutubeSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ', localOptions({ resolver: (h, o, cb) => cb(new Error('ENOTFOUND'), null) }));
  assert.equal(result.title, '');
  assert.equal(result.transcriptAvailable, false);
});
