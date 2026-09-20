// Deterministic, dependency-free safe-HTML sanitizer + live-data binder for every AI-generated
// panel target (dashboard.panel today, the Analysis Workspace target alongside it). Shared by both
// runtimes on purpose - unlike the React runtime components themselves (which stay independent
// per-target files, see dashboardPanelSandbox.jsx's own header comment for why), this is new,
// generic, security-critical infrastructure with no per-target behavior of its own; one
// well-tested implementation is safer than two that could quietly drift apart.
//
// WHY THIS FILE EXISTS (read before touching the allowlists below):
//
// The original sandbox design (still visible in git history) let a generated panel run real
// <script> inside a sandbox="allow-scripts" iframe and call a live `navrya.getX()` bridge API from
// that script. A post-launch security review found that design cannot be made safe, no matter how
// the bridge transport itself is hardened (MessageChannel, identity checks, CSP): a browsing
// context with `allow-scripts` can ALWAYS navigate itself to an arbitrary URL - the `sandbox`
// attribute only ever restricts navigating OTHER browsing contexts, self-navigation is permitted by
// design, and there is no shipped CSP directive (the draft `navigate-to` has no real browser
// support) that blocks it. Once a panel has received real data into its own script scope - whether
// by calling the bridge itself, or simply by reading it back out of its own DOM after the parent
// wrote it there - nothing on the client can stop it from carrying that data along its own
// self-navigation (in the URL, in a form POST, etc). This is a structural property of the web
// platform, not a bug in any one implementation: a script-capable frame that has ever seen real
// data cannot be proven safe against exfiltration after the fact.
//
// The fix applied here is not a harder-to-bypass version of the old design - it removes the
// capability the attack depends on. A generated panel is never handed a document that can execute
// script AND ever contains real trader data:
//
//   1. This module parses the model's raw HTML fragment with its own tokenizer (no DOMParser
//      dependency, so it runs identically in Node tests and the browser) and REBUILDS the output
//      from an explicit tag/attribute allowlist - `<script>`, `<meta>`, `<form>`, `<iframe>`,
//      `<object>`, `<embed>`, `<link>`, every `on*` handler attribute, every `javascript:`/
//      `vbscript:` URL, and every non-`data:` image source are simply not in the allowlist, so they
//      never reach the output at all. This is a rebuild from validated structure, not a blacklist
//      applied to the original bytes - the classic source of sanitizer bypasses.
//   2. Real data is never interpolated as HTML or as an attribute. The only way a panel can display
//      a live value is `data-navrya-bind="<allowed.path>"` on an allowed element - resolved by this
//      module, against a fixed per-target schema (an explicit list of legal paths, not a generic
//      object walk), and written ONLY as escaped text content. The model's own markup for that
//      element is discarded, not merged with it.
//   3. The resulting document is rendered in an iframe with `sandbox="allow-same-origin"` and
//      deliberately NO `allow-scripts` - a hard platform guarantee, independent of this module's own
//      correctness, that nothing in that document can ever execute code at all. (allow-same-origin
//      without allow-scripts is safe: same-origin access is only exploitable by script, and there is
//      none. It is what lets the parent read the frame's real content height without a postMessage
//      bridge - seeSandboxedDashboardPanel/SandboxedPanel.)
//
// With no script, self-navigation is not merely discouraged, it is impossible - there is no code
// left in the document capable of calling `location.href`/`location.replace`/`window.open`. Static,
// script-free HTML navigation primitives (`<meta http-equiv="refresh">`, `<form action>`) are
// additionally stripped by the allowlist above as defense in depth, independent of whatever the
// `sandbox` attribute does or does not do to them - this module never relies on a single
// mitigation alone. See tests/panel-safe-render.test.mjs for the hostile-input regression suite
// (location.href, location.replace, meta refresh, form submission, image/CSS beacons, and a
// request-then-navigate sequence made structurally impossible by the absence of any bridge call at
// all).
//
// Honest scope reduction: this removes the ability for a generated panel to run its own JS at all -
// no custom interactivity, no client-side computed values, no `navrya.onUpdate()` callback. A panel
// is a live, reactively re-rendered data DISPLAY, not a live program. See docs/ai/panel-studio.md
// for the full writeup of what this trades away and why it is the only architecture that both
// keeps live real data and closes the exfiltration path completely.

// The full standard HTML void-element list - every element that is well-formed WITHOUT a closing
// tag, whether or not this sanitizer's own allowlist accepts it. This has to be complete
// regardless of ALLOWLIST membership: matchingCloseEnd() below decides how much content a
// disallowed tag "swallows" while being skipped too, and a void tag written by the model without a
// self-closing slash (e.g. a bare `<meta ...>`, extremely common real-world HTML) must never be
// mistaken for the start of an unclosed CONTAINER, which would otherwise silently drop every
// legitimate sibling that follows it for the rest of the document.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export const ALLOWED_TAGS = new Set([
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'strong', 'b', 'em', 'i', 'u', 'small', 'br', 'hr', 'code', 'pre', 'blockquote', 'label', 'img'
]);

// Deliberately excluded, on purpose, not by omission: script, meta, form, iframe, object, embed,
// link, style (block form), a (anchors - a data widget has no legitimate need to link anywhere,
// and dropping it removes a whole class of navigation-surface questions for zero real cost).

// HTML's own "raw text" / "escapable raw text" elements - real browsers do NOT parse their content
// as nested markup at all (a `<` inside a <script> body is just a character, e.g. `if (a<b)`).
// This tokenizer has no raw-text parsing mode, so any tag with that content model must be dropped
// WHOLESALE (tag and its entire body, never re-walked as if it were child markup) rather than
// "unwrapped" like an ordinary disallowed container below - retokenizing raw script/style bytes as
// HTML is exactly the kind of parser-differential bug that lets a payload survive sanitization.
const RAW_DROP_TAGS = new Set(['script', 'style', 'template', 'noscript', 'textarea', 'title', 'xmp']);

const GLOBAL_ATTRS = new Set(['class', 'style', 'title', 'data-navrya-bind', 'data-navrya-each']);
const TAG_ATTRS = {
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  img: new Set(['alt'])
};

const UNSAFE_STYLE_PATTERN = /url\s*\(|@import|expression\s*\(|behavior\s*:|javascript:|vbscript:/i;
const SAFE_IMG_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i;
const BIND_PATH_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]*$/;
const MAX_EACH_ITEMS = 25;

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function decodeEntities(s) {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
  return String(s).replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e) => map[e]);
}

// A small, deliberately conservative HTML tokenizer - not a spec-accurate HTML5 parser (no implied
// end tags, no foster parenting, no entity table beyond the five basics). For an allowlist
// sanitizer that rebuilds its output from scratch, that is a feature: anything this tokenizer
// cannot cleanly classify is treated as plain text (escaped, never executed), so any difference
// from how a real browser would have parsed the ORIGINAL input can only make the rebuilt OUTPUT
// more conservative, never less - the browser only ever sees bytes this module itself emitted.
function tokenize(html) {
  const tokens = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? n : end + 3;
      continue; // comments are dropped entirely, never re-emitted
    }
    if (html[i] === '<') {
      const isClose = html[i + 1] === '/';
      const nameStart = i + (isClose ? 2 : 1);
      let j = nameStart;
      while (j < n && /[a-zA-Z0-9]/.test(html[j])) j += 1;
      const tagName = html.slice(nameStart, j).toLowerCase();
      if (!tagName) { tokens.push({ type: 'text', value: '<' }); i += 1; continue; }
      // Scan to the matching, unquoted '>' - tracking quote state so a '>' inside an attribute
      // value never ends the tag early (a classic sanitizer-bypass trick).
      let k = j;
      let quote = null;
      while (k < n) {
        const c = html[k];
        if (quote) { if (c === quote) quote = null; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        k += 1;
      }
      if (k >= n) { tokens.push({ type: 'text', value: html.slice(i) }); break; }
      const rawAttrs = html.slice(j, k);
      const selfClose = /\/\s*$/.test(rawAttrs);
      if (isClose) tokens.push({ type: 'close', tag: tagName });
      else tokens.push({ type: 'open', tag: tagName, attrs: parseAttrs(rawAttrs), selfClose });
      i = k + 1;
      continue;
    }
    let j = i;
    while (j < n && html[j] !== '<') j += 1;
    tokens.push({ type: 'text', value: html.slice(i, j) });
    i = j;
  }
  return tokens;
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|[^\s"'>]+))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (name === '/') continue;
    const value = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : (m[2] || '');
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function isVoidLike(tok) {
  return tok.type === 'open' && (VOID_TAGS.has(tok.tag) || tok.selfClose);
}

// Finds the index just past the close token matching the open token at `openIndex`, using a
// generic balanced-nesting count (not same-tag counting) so arbitrarily nested, mixed-tag content
// is handled correctly. Void/self-closing opens never open a new nesting level. An unbalanced
// fragment (the model forgot a close tag) matches to the end - conservative, never under-skips.
function matchingCloseEnd(tokens, openIndex) {
  let depth = 0;
  for (let k = openIndex; k < tokens.length; k += 1) {
    const tok = tokens[k];
    if (tok.type === 'open' && !isVoidLike(tok)) depth += 1;
    else if (tok.type === 'close') {
      depth -= 1;
      if (depth === 0) return k + 1;
    }
  }
  return tokens.length;
}

function filterAttrs(tag, attrs) {
  const allowedForTag = TAG_ATTRS[tag] || new Set();
  const out = {};
  Object.keys(attrs || {}).forEach((name) => {
    if (!GLOBAL_ATTRS.has(name) && !allowedForTag.has(name)) return;
    let value = attrs[name];
    // Whitespace/control characters are stripped before matching, not just from the raw value - a
    // classic bypass for a naive scheme check is splitting the keyword with a tab/newline
    // (`jav\tascript:`), which a literal /javascript:/ test alone would miss.
    if (name === 'style' && UNSAFE_STYLE_PATTERN.test(value.replace(/[\s\u0000-\u001f]+/g, ''))) return;
    if ((name === 'data-navrya-bind' || name === 'data-navrya-each') && !BIND_PATH_PATTERN.test(value)) return;
    out[name] = value;
  });
  if (tag === 'img') {
    const src = (attrs || {}).src || '';
    if (SAFE_IMG_SRC.test(src)) out.src = src;
    // else: no src attribute at all - a bare, sourceless <img> requests nothing and renders nothing
  }
  return out;
}

function serializeOpenTag(tag, attrs) {
  let out = '<' + tag;
  Object.keys(attrs).forEach((name) => { out += ' ' + name + '="' + escapeAttr(attrs[name]) + '"'; });
  return out + '>';
}

// Rebuilds a safe, well-formed HTML string from an allowlisted walk of the tokens in
// [start, end) - the one function every entry point below funnels through. `resolveBind(path)` is
// called for a non-each element carrying `data-navrya-bind`; `resolveEach(path)` is called for an
// element carrying `data-navrya-each` and must return an array of per-item contexts (plain
// objects) or null. Leaving either resolver undefined disables THAT binding mechanism entirely -
// a bind/each element is then treated as an ordinary element and its own (sanitized) static
// content renders unchanged. Passing real resolvers that fail closed to an empty value for any
// unrecognized path (as buildResolvers below does) is what makes the live-data render below never
// show fabricated content for a path outside its schema.
function renderRange(tokens, start, end, resolveBind, resolveEach) {
  let out = '';
  let i = start;
  while (i < end) {
    const tok = tokens[i];
    if (tok.type === 'text') { out += escapeText(tok.value); i += 1; continue; }
    if (tok.type === 'close') { i += 1; continue; } // an unmatched stray close - drop silently
    if (tok.type !== 'open') { i += 1; continue; }
    if (!ALLOWED_TAGS.has(tok.tag)) {
      if (isVoidLike(tok)) { i += 1; continue; } // void/self-closing disallowed tag: nothing to preserve
      const closeAt = matchingCloseEnd(tokens, i);
      if (RAW_DROP_TAGS.has(tok.tag)) { i = closeAt; continue; } // script/style/etc: drop tag AND raw content wholesale, never re-walked as markup
      // Any other disallowed container (a made-up tag name, <article>, <a>, <form>, ...): unwrap -
      // drop the tag itself but keep walking its content through this SAME allowlist filter, so an
      // unsupported wrapper never silently deletes otherwise-safe content nested inside it. Nothing
      // unsafe can hide this way: every descendant still passes through the identical checks above.
      out += renderRange(tokens, i + 1, closeAt - 1, resolveBind, resolveEach);
      i = closeAt;
      continue;
    }
    const rawAttrs = tok.attrs || {};
    const bindPath = rawAttrs['data-navrya-bind'];
    const eachPath = rawAttrs['data-navrya-each'];
    const attrs = filterAttrs(tok.tag, rawAttrs);
    if (isVoidLike(tok)) { out += serializeOpenTag(tok.tag, attrs); i += 1; continue; }
    const closeAt = matchingCloseEnd(tokens, i);
    const contentStart = i + 1;
    const contentEnd = closeAt - 1; // exclude the trailing close token itself
    if (eachPath && typeof resolveEach === 'function') {
      const items = resolveEach(eachPath) || [];
      out += serializeOpenTag(tok.tag, attrs);
      items.slice(0, MAX_EACH_ITEMS).forEach((item) => {
        out += renderRange(tokens, contentStart, contentEnd, (p) => resolveItemField(item, p), undefined);
      });
      out += '</' + tok.tag + '>';
    } else if (bindPath && typeof resolveBind === 'function') {
      const value = resolveBind(bindPath);
      out += serializeOpenTag(tok.tag, attrs) + escapeText(formatScalar(value)) + '</' + tok.tag + '>';
    } else {
      out += serializeOpenTag(tok.tag, attrs);
      out += renderRange(tokens, contentStart, contentEnd, resolveBind, resolveEach);
      out += '</' + tok.tag + '>';
    }
    i = closeAt;
  }
  return out;
}

function formatScalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value;
  return ''; // object/array/anything else: fail closed, never stringified as [object Object]
}

// Only ever called with a field name already checked against a schema's fixed `itemFields` list
// (see resolveEachFor below) - never with attacker-controlled text used as a bare property lookup.
function resolveItemField(item, field) {
  return item && typeof item === 'object' ? item[field] : undefined;
}

// Sanitizes a raw model-generated fragment to the allowlist, with NO data binding at all - every
// data-navrya-bind/data-navrya-each element renders with empty content. Safe to call with
// completely untrusted input; the result contains no script and no navigation-capable markup by
// construction. Used for the Code pane's structural preview and as the first stage of
// renderPanelSafely below.
export function sanitizePanelFragment(html) {
  const tokens = tokenize(String(html || ''));
  return renderRange(tokens, 0, tokens.length, undefined, undefined);
}

// Resolves a fixed, explicit path against a snapshot object. `path` must already be a member of
// the caller's own schema-defined allowlist (see buildScalarResolver/buildEachResolver) - this
// function is never invoked with a raw, attacker-controlled string, so there is no dynamic
// property-name attack surface (no __proto__/constructor/prototype path is ever reachable, because
// the only paths ever passed in are the literal strings this repo's own schema files declare).
function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj);
}

// Builds the two resolver functions renderRange needs, scoped to one schema + one live snapshot.
// `schema` shape: { scalars: string[], lists: { [path]: { itemFields: string[], cap?: number } } }.
function buildResolvers(snapshot, schema) {
  const scalarPaths = new Set((schema && schema.scalars) || []);
  const lists = (schema && schema.lists) || {};
  const resolveBind = (path) => (scalarPaths.has(path) ? getPath(snapshot, path) : undefined);
  const resolveEach = (path) => {
    const entry = lists[path];
    if (!entry) return null;
    const value = getPath(snapshot, path);
    if (!Array.isArray(value)) return null;
    return value.slice(0, entry.cap || MAX_EACH_ITEMS).map((item) => {
      const row = {};
      (entry.itemFields || []).forEach((field) => { row[field] = resolveItemField(item, field); });
      return row;
    });
  };
  return { resolveBind, resolveEach };
}

// The full pipeline: sanitize to the allowlist, then substitute real data - only ever as escaped
// text content of an explicitly bound element, resolved against an explicit per-target schema.
// `schema` is required; passing an empty schema ({}) is equivalent to sanitizePanelFragment alone
// (every bind/each resolves to nothing).
export function renderPanelSafely(html, snapshot, schema) {
  const tokens = tokenize(String(html || ''));
  const { resolveBind, resolveEach } = buildResolvers(snapshot || {}, schema || {});
  return renderRange(tokens, 0, tokens.length, resolveBind, resolveEach);
}
