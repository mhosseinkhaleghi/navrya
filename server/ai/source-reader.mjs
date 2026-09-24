// SSRF-hardened outbound URL fetcher for the Analysis Profile "Knowledge" domain (Phase 3,
// ARCHITECTURE.md §7.25) - the one place this codebase fetches a URL the TRADER supplies, rather
// than a known trusted destination (an LLM provider, or the internal Community API bridge). Every
// other outbound call in pattern-ai-server.mjs goes to a fixed, code-chosen host; this one's
// destination is attacker-influenced by construction, so it gets its own dedicated defense
// in depth rather than reusing the plain `fetch()` every other route uses.
//
// Threat model this defends against: a trader (or anyone who can get a URL in front of this
// route) pointing it at localhost, an internal service, a cloud metadata endpoint
// (169.254.169.254), or a URL that redirects to one of those AFTER the initial hostname looked
// innocent (DNS rebinding). The defense:
//   - http/https only, default ports only (never http://host:6379/, etc.)
//   - the hostname is resolved ONCE, every resolved address is checked against the private/
//     reserved-range blocklist below, and the socket is then PINNED to that exact, already-
//     vetted address (via the http/https `lookup` option) - never re-resolved at connect time,
//     which is what closes the DNS-rebinding gap a naive "check then connect by hostname" misses.
//   - every redirect hop is followed manually and re-validated from scratch (never trusts a
//     validated first hop to imply a validated tenth one), capped at 3 hops.
//   - a 10s per-hop timeout and a 2MB response cap (the connection is destroyed the instant more
//     arrives - never buffered past the cap "just to check").
//   - no cookies, no credentials, no additional headers beyond a fixed User-Agent/Accept.
//   - only a plain-text-shaped Content-Type is accepted for a website read.
//
// This module never calls an LLM and never persists anything - it only fetches and returns
// bounded, pre-sanitized text for a caller (server/pattern-ai-server.mjs's
// /api/analysis-profiles/read-source) to hand back to the browser.

import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

export const READ_SOURCE_TIMEOUT_MS = 10000;
export const READ_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const READ_SOURCE_MAX_REDIRECTS = 3;
export const WEBSITE_DIGEST_MAX_LENGTH = 6000;

class SourceReadError extends Error {
  constructor(code) { super(code); this.name = 'SourceReadError'; this.code = code; }
}

// ---- private/reserved address range checks (defense against SSRF, never delegated to a library
// this project doesn't already depend on) ---------------------------------------------------------

function ipv4Octets(address) {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return octets;
}

// Loopback, RFC1918 private, link-local (covers the 169.254.169.254 cloud metadata address),
// CGNAT (100.64.0.0/10), the documentation/TEST-NET ranges, multicast, reserved, and the 0.0.0.0/8
// "this network" block - every IPv4 range that should never be treated as "the public internet".
function isPrivateIpv4(address) {
  const octets = ipv4Octets(address);
  if (!octets) return true; // not a well-formed IPv4 literal - fail closed, never treated as public
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && octets[2] === 0) return true;
  if (a === 192 && b === 0 && octets[2] === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  if (a >= 224) return true; // multicast (224-239) + reserved/broadcast (240-255)
  return false;
}

// Expands any textual IPv6 form (`::` compression, a trailing dotted IPv4 part) to its eight
// 16-bit groups, or null when it isn't a well-formed IPv6 literal. A prefix regex is NOT enough
// here: the WHATWG URL parser serializes `::ffff:127.0.0.1` as `::ffff:7f00:1`, so any check that
// only recognizes the dotted spelling is bypassed by the same address written in hex.
function parseIpv6(address) {
  let text = address.toLowerCase();
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const octets = ipv4Octets(dotted[1]);
    if (!octets) return null;
    text = text.slice(0, dotted.index) + ((octets[0] << 8) | octets[1]).toString(16) + ':' + ((octets[2] << 8) | octets[3]).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}
function embeddedIpv4(hi, lo) { return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`; }

// Blocks IPv6 loopback/unspecified, link-local (fe80::/10), unique-local/ULA (fc00::/7 - covers
// several cloud providers' own metadata addresses), multicast (ff00::/8), the documentation
// (2001:db8::/32), discard (100::/64) and Teredo (2001::/32) ranges, AND every IPv6 form that merely
// WRAPS an IPv4 address - IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64
// (64:ff9b::/96) and 6to4 (2002::/16) - by unwrapping the embedded IPv4 and re-checking it against
// the IPv4 rules, so wrapping 127.0.0.1 in an IPv6 literal never earns a free pass. Anything that
// fails to parse fails closed.
function isPrivateIpv6(address) {
  const g = parseIpv6(address);
  if (!g) return true;
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateIpv4(embeddedIpv4(g[6], g[7])); // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return isPrivateIpv4(embeddedIpv4(g[6], g[7])); // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateIpv4(embeddedIpv4(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return isPrivateIpv4(embeddedIpv4(g[1], g[2])); // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x100 && g.slice(1, 4).every((x) => x === 0)) return true; // discard-only
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isPrivateAddress(address, family) {
  if (family === 6 || address.includes(':')) return isPrivateIpv6(address);
  return isPrivateIpv4(address);
}

// Resolves a hostname to every address it has (dns.lookup with all:true - the same underlying
// resolution Node itself would do to connect), rejects if ANY resolved address is private/
// reserved (a multi-homed name where even one address is internal is untrusted), and returns the
// first PUBLIC address to pin the real connection to. Injectable `resolver` for tests - never
// swapped in production, where it is always the real `dns.lookup`. `isPrivate` is likewise
// injectable, ONLY so the HTTP-mechanics test suite can run a real local server on loopback
// without that address itself tripping the guard - the actual blocking logic is proven directly,
// against the real `isPrivateAddress()`, by its own dedicated unit tests, never bypassed there.
function resolveAndVet(hostname, resolver, isPrivate) {
  return new Promise((resolve, reject) => {
    resolver(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error || !Array.isArray(addresses) || !addresses.length) { reject(new SourceReadError('SOURCE_DNS_FAILED')); return; }
      const blocked = addresses.find((entry) => isPrivate(entry.address, entry.family));
      if (blocked) { reject(new SourceReadError('SOURCE_ADDRESS_BLOCKED')); return; }
      resolve(addresses[0]);
    });
  });
}

// ---- the bounded, pinned-address HTTP fetch --------------------------------------------------

// The text-shaped Content-Type gate is a call-site concern, not a property of the low-level
// fetch primitive: a website read genuinely requires HTML/text (never a binary/image response
// treated as a document), while YouTube's own sub-fetches (JSON oEmbed, HTML watch page, XML
// timedtext) are already-known, trusted response shapes this module parses directly - forcing one
// blanket pattern onto all three would either reject the real oEmbed JSON or weaken the website
// gate. `contentTypePattern: null` (the default) means "accept anything the server returns".
const WEBSITE_CONTENT_TYPE_PATTERN = /^text\/|^application\/(xhtml\+xml|xml)$/;

function requestOnce(url, { resolver, maxBytes, timeoutMs, connectPort, isPrivate, contentTypePattern, transports }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (_) { reject(new SourceReadError('SOURCE_URL_INVALID')); return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') { reject(new SourceReadError('SOURCE_PROTOCOL_UNSUPPORTED')); return; }
    if (parsed.username || parsed.password) { reject(new SourceReadError('SOURCE_URL_INVALID')); return; }
    const defaultPort = parsed.protocol === 'https:' ? '443' : '80';
    if (parsed.port && parsed.port !== defaultPort) { reject(new SourceReadError('SOURCE_PORT_UNSUPPORTED')); return; }

    // `new URL()` keeps the brackets of an IPv6 literal in .hostname; the resolver and the vetting
    // both need the bare address (a bracketed name would just fail DNS - safe, but never vetted).
    const bareHost = parsed.hostname.replace(/^\[|\]$/g, '');
    resolveAndVet(bareHost, resolver, isPrivate).then((vetted) => {
      // `connectPort` and `transports` are test-only seams (never set by a real caller/route)
      // letting the test suite dial a real local plain-HTTP server without root access to bind
      // port 80/443 or a self-signed TLS certificate - the URL's OWN port is still fully validated
      // above (a URL naming a non-default port is rejected regardless of these options), so they
      // never weaken what a real caller is allowed to specify.
      const transport = parsed.protocol === 'https:' ? transports.https : transports.http;
      const request = transport.request({
        hostname: bareHost, port: connectPort || defaultPort, path: parsed.pathname + parsed.search,
        method: 'GET',
        // Pins the connection to the ALREADY-VETTED address - the real fix for DNS rebinding: a
        // second lookup at connect time (which is what happens if `lookup` is left to its
        // default) could legitimately return a different, unvetted address for the same name.
        // Node 20+ enables autoSelectFamily by default, which calls `lookup` with `all: true` and
        // expects an ARRAY of addresses back - answering with the single-address form there fails
        // the connection outright (ERR_INVALID_IP_ADDRESS), so both call shapes are handled.
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions && lookupOptions.all) callback(null, [{ address: vetted.address, family: vetted.family }]);
          else callback(null, vetted.address, vetted.family);
        },
        servername: parsed.protocol === 'https:' && !isIP(bareHost) ? bareHost : undefined, // real TLS SNI/cert validation against the real hostname, not the pinned IP
        headers: { 'User-Agent': 'NAVRYA-AnalysisProfile/1.0 (+https://navrya.com)', Accept: 'text/html,application/xhtml+xml,text/plain' },
        timeout: timeoutMs
      }, (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ redirectTo: new URL(response.headers.location, parsed).href });
          return;
        }
        if (status !== 200) { response.resume(); reject(new SourceReadError('SOURCE_FETCH_FAILED_' + status)); return; }
        const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (contentTypePattern && !contentTypePattern.test(contentType)) { response.resume(); reject(new SourceReadError('SOURCE_CONTENT_TYPE_UNSUPPORTED')); return; }
        const chunks = [];
        let received = 0;
        response.on('data', (chunk) => {
          received += chunk.length;
          if (received > maxBytes) { request.destroy(); reject(new SourceReadError('SOURCE_TOO_LARGE')); return; }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', () => reject(new SourceReadError('SOURCE_FETCH_FAILED')));
      });
      request.on('timeout', () => request.destroy(new SourceReadError('SOURCE_TIMEOUT')));
      request.on('error', (error) => reject(error instanceof SourceReadError ? error : new SourceReadError('SOURCE_FETCH_FAILED')));
      request.end();
    }).catch((error) => reject(error instanceof SourceReadError ? error : new SourceReadError('SOURCE_FETCH_FAILED')));
  });
}

// Follows redirects manually, re-validating EVERY hop from scratch (protocol/port/DNS/private-
// range) - a validated first hop must never be trusted to imply a validated second one.
export async function fetchSecurely(url, options = {}) {
  const resolver = options.resolver || dnsLookup;
  const maxBytes = options.maxBytes || READ_SOURCE_MAX_BYTES;
  const timeoutMs = options.timeoutMs || READ_SOURCE_TIMEOUT_MS;
  const isPrivate = options.isPrivateAddress || isPrivateAddress;
  let current = url;
  for (let hop = 0; hop <= READ_SOURCE_MAX_REDIRECTS; hop += 1) {
    const outcome = await requestOnce(current, { resolver, maxBytes, timeoutMs, connectPort: options.connectPort, isPrivate, contentTypePattern: options.contentTypePattern || null, transports: options.transports || { http, https } });
    if (outcome.body !== undefined) return { body: outcome.body, finalUrl: current };
    if (hop === READ_SOURCE_MAX_REDIRECTS) throw new SourceReadError('SOURCE_TOO_MANY_REDIRECTS');
    current = outcome.redirectTo;
  }
  throw new SourceReadError('SOURCE_TOO_MANY_REDIRECTS');
}

// ---- HTML -> bounded plain text (dependency-free - no cheerio/jsdom, matching this project's own
// "hand-roll it rather than add a parsing dependency" precedent elsewhere) --------------------------

function extractTitle(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1]).trim().slice(0, 200) : '';
}
function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}
// A line made of nothing but links is navigation (a menu entry, a "related posts" row), not the
// page's reading content. Marker characters (never present in real text) wrap every link's text so a
// line can be classified after the tags are gone.
const LINK_OPEN = '\u0001';
const LINK_CLOSE = '\u0002';
// Fewer consecutive link-only lines than this are kept: a couple of them is a sentence with a
// couple of links in it or a short "see also", which is content. A real menu is longer.
const MENU_RUN_MIN_LINES = 4;
const LINK_GROUP = new RegExp(`${LINK_OPEN}[^${LINK_CLOSE}]*${LINK_CLOSE}`, 'g');
const LINK_SEPARATORS = /^[\s|·•/>»›\-–—,:]*$/;

function isLinkOnlyLine(line) {
  return line.indexOf(LINK_OPEN) > -1 && LINK_SEPARATORS.test(line.replace(LINK_GROUP, ''));
}

// Drops runs of MENU_RUN_MIN_LINES+ consecutive link-only lines, then removes the link markers.
function dropNavigationRuns(lines) {
  const kept = [];
  let run = [];
  const flush = () => { if (run.length < MENU_RUN_MIN_LINES) kept.push(...run); run = []; };
  for (const line of lines) {
    if (isLinkOnlyLine(line)) run.push(line);
    else { flush(); kept.push(line); }
  }
  flush();
  return kept.map((line) => line.split(LINK_OPEN).join('').split(LINK_CLOSE).join('').replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
}

// Strips non-content elements first (script/style/nav/footer/header/aside/svg/form/... - none of these
// carry the article's own reading content), then every remaining tag, then collapses whitespace -
// a real HTML parser is not needed for "get the readable text out", only for perfect fidelity.
//
// Semantic elements alone are not enough. Many real sites (found on a live page a trader taught the
// engine from) build their header and menus out of plain <div>/<ul> with no <nav> or <header> at all,
// so the menu text - twice, once for the mobile menu and once for the desktop one - filled the first
// quarter of the 6000-character digest and the article did not start until character ~1500. Two more
// steps handle that: the digest starts at the page's first <h1> (everything before the main heading is
// header furniture on essentially every site), and runs of link-only lines are dropped as navigation.
// The <head> is dropped too: the title is captured separately, and it would otherwise be prepended to
// the digest a second time.
export function htmlToText(html) {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head[\s>][\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|noscript|nav|footer|header|aside|menu|svg|form|iframe|template|select|button)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const heading = cleaned.search(/<h1[\s>]/i);
  // Only trust the heading when it sits in the first part of the document; a stray <h1> near the
  // end (a footer logo) must not throw the whole article away.
  const scoped = heading > -1 && heading < cleaned.length * 0.6 ? cleaned.slice(heading) : cleaned;
  const stripped = scoped
    .replace(/<a(?:\s[^>]*)?>([\s\S]*?)<\/a>/gi, (_, inner) => LINK_OPEN + inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + LINK_CLOSE)
    .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|tr|section|article|table|blockquote|pre|dt|dd|figcaption)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = decodeEntities(stripped).replace(/[ \t]+/g, ' ').split('\n').map((line) => line.trim()).filter(Boolean);
  return dropNavigationRuns(lines).join('\n');
}

// The one caller-facing function for a website source: fetches, extracts a title and a BOUNDED
// plain-text digest - never the full page - so nothing beyond a small excerpt is ever persisted
// (ARCHITECTURE.md's own "only the digest + URL citation are stored, never the full text" rule).
export async function readWebsiteSource(url, options = {}) {
  const { body, finalUrl } = await fetchSecurely(url, { ...options, contentTypePattern: WEBSITE_CONTENT_TYPE_PATTERN });
  const title = extractTitle(body);
  const digest = htmlToText(body).slice(0, options.maxDigestLength || WEBSITE_DIGEST_MAX_LENGTH);
  return { type: 'website', url: finalUrl, title, digest };
}

// ---- YouTube (best-effort - see this function's own header) -----------------------------------

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;
export function extractYoutubeVideoId(url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return null; }
  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') id = parsed.pathname.slice(1);
  else if (host === 'youtube.com') id = parsed.searchParams.get('v') || (parsed.pathname.startsWith('/shorts/') ? parsed.pathname.split('/')[2] : null);
  return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
}

function parseTimedText(xml) {
  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1]).replace(/\s+/g, ' ').trim());
  return lines.filter(Boolean).join(' ');
}

// Best-effort: the oEmbed title is a stable, official, documented endpoint and always attempted;
// the transcript is scraped from the watch page's own embedded caption-track list, which YouTube
// can change at any time without notice - a caption-fetch failure degrades to
// `transcriptAvailable:false`, never a thrown error, so the UI can fall back to "paste the
// transcript yourself" (ARCHITECTURE.md's own documented fallback) rather than failing the whole
// read. This never bypasses any consent/authentication gate YouTube itself enforces - only a
// track already offered as a plain public URL in the page's own markup is ever read.
export async function readYoutubeSource(url, options = {}) {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new SourceReadError('SOURCE_NOT_A_YOUTUBE_URL');
  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let title = '';
  try {
    const oembed = await fetchSecurely(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`, options);
    title = (JSON.parse(oembed.body).title || '').slice(0, 200);
  } catch (_) { /* best-effort - a missing title never fails the whole read */ }

  let transcript = '';
  let transcriptAvailable = false;
  try {
    const watch = await fetchSecurely(canonicalUrl, options);
    const tracksMatch = /"captionTracks":(\[[\s\S]*?\])/.exec(watch.body);
    if (tracksMatch) {
      const tracks = JSON.parse(tracksMatch[1].replace(/\\u0026/g, '&'));
      const preferredLang = options.language || 'en';
      const track = tracks.find((t) => t.languageCode === preferredLang) || tracks.find((t) => t.languageCode && t.languageCode.startsWith(preferredLang.slice(0, 2))) || tracks[0];
      if (track && track.baseUrl) {
        const timedText = await fetchSecurely(track.baseUrl, options);
        transcript = parseTimedText(timedText.body).slice(0, options.maxDigestLength || WEBSITE_DIGEST_MAX_LENGTH);
        transcriptAvailable = Boolean(transcript);
      }
    }
  } catch (_) { /* best-effort - see this function's own header comment */ }

  return { type: 'youtube', url: canonicalUrl, videoId, title, digest: transcript, transcriptAvailable };
}

export { SourceReadError };
