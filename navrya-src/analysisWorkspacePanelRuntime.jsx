import React from 'react';
import { BRIDGE_VERSION, ANALYSIS_WORKSPACE_BIND_SCHEMA } from './analysisWorkspaceBridgeDoc.js';
import { renderPanelSafely, sanitizePanelFragment } from './panelSafeRender.js';

// ============================================================================
// Render surface for AI-authored Analysis Workspace panels (Phase 2).
//
// SECURITY REDESIGN (v2) - read this before touching anything below.
//
// The original (v1) design let a generated panel run real <script> inside a
// sandbox="allow-scripts" iframe and call a live `navrya.getX()` bridge API for real session data
// from that script - hardened, across two review passes, with an opaque origin, a strict CSP, a
// MessageChannel-based transport (instead of bare postMessage), and a navigation guard that
// stopped a panel the instant it self-navigated a second time.
//
// A further security review found that hardening was still not sufficient, and could not be made
// sufficient by hardening the TRANSPORT any further. The problem is not how the bridge answers a
// request - it is that a sandbox="allow-scripts" browsing context can ALWAYS navigate itself to an
// arbitrary URL. The `sandbox` attribute only ever restricts navigating OTHER browsing contexts;
// self-navigation is permitted by design, and no shipped CSP directive blocks it (the draft
// `navigate-to` has no real browser implementation to rely on). Once a panel has real data in its
// own script scope - however it got there, including by reading it back out of its own DOM after
// the parent wrote it there, which no transport hardening touches at all - nothing on the client
// can prove it will never carry that data along its own outbound navigation (in the URL, in a form
// POST, ...). This is a structural limitation of running attacker-influenced script in a browser at
// all, not a gap in any one implementation detail, and it cannot be closed by a better transport.
//
// The fix actually applied: a generated panel never receives BOTH script execution AND real data,
// ever, full stop.
//
//   1. The model's raw HTML fragment is parsed and rebuilt from an explicit tag/attribute
//      allowlist by navrya-src/panelSafeRender.js - <script>, <meta>, <form>, <iframe>, <object>,
//      <embed>, <link>, every `on*` handler, every `javascript:`/`vbscript:` URL, and every
//      non-`data:` image source are simply not in the allowlist, so they never reach the output.
//   2. Real data is never interpolated as HTML or into an attribute. The only way a panel displays
//      a live value is a `data-navrya-bind="<allowed.path>"` attribute, resolved against
//      ANALYSIS_WORKSPACE_BIND_SCHEMA (an explicit, fixed list of legal paths - never a generic
//      object walk) and written ONLY as escaped text content, discarding whatever the model's own
//      markup put there.
//   3. The resulting, already-safe document is rendered in an iframe with `sandbox="allow-same-
//      origin"` and deliberately NO `allow-scripts` - a hard platform guarantee, independent of
//      panelSafeRender.js's own correctness, that nothing in the document can execute code at all.
//      (allow-same-origin without allow-scripts is safe: same-origin access is only exploitable by
//      script, and there is none. It is also what lets this component read the frame's real
//      content height directly, with no postMessage bridge needed for that either.)
//
// With no script capability, self-navigation is not discouraged, it is impossible - there is no
// code left in the document able to call `location.href`/`location.replace`/`window.open`. Static,
// script-free navigation primitives (`<meta http-equiv="refresh">`, `<form action>`) are separately
// removed by the allowlist above too, as defense in depth, independent of whatever the `sandbox`
// attribute does or does not do to them on its own - see panelSafeRender.js's header comment and
// tests/panel-safe-render.test.mjs's hostile-input suite (location.href, location.replace, meta
// refresh, form submission, image/CSS beacons, and a request-then-navigate sequence proven
// structurally impossible, not merely slow) for the actual, dynamic proof this holds.
//
// Honest trade-off: a panel can no longer run its own script - no custom interactivity, no
// client-computed values, no `navrya.onUpdate()` callback. It is a live, reactively re-rendered
// data DISPLAY, not a live program. See docs/ai/panel-studio.md for the full writeup of why this,
// and not a harder-to-bypass sandbox, is the only architecture that keeps real live data in a
// generated panel while actually closing the exfiltration path - not merely reducing it.
//
// The identical redesign was applied, at the same time, to the newer Dashboard Panel Studio
// sandbox (navrya-src/dashboardPanelSandbox.jsx) - both share panelSafeRender.js's sanitizer/binder
// (new, generic, security-critical infrastructure with no per-target behavior of its own - one
// well-tested implementation, not two that could quietly drift apart) while keeping their own React
// runtime components independent, per the pre-existing precedent (this file's own test,
// tests/analysis-workspace-panel.test.mjs, still asserts literal properties of THIS file's source).
// ============================================================================
export { BRIDGE_VERSION };

// The data categories an Analysis Workspace fragment may bind to - the root paths
// ANALYSIS_WORKSPACE_BIND_SCHEMA actually allows, kept here too as a short, reviewed,
// human-readable list (mirrors the pre-v2 callable-getter names, now bind-path roots instead).
export const BRIDGE_METHODS = ['context', 'entries', 'scenarios', 'positions', 'chart'];

// Builds the plain, serializable snapshot handed across the bridge. Deliberately narrow: real
// session facts only, no internal object references, no user identity, no account/wallet data, no
// image blobs. Everything here is data the trader is already looking at on this same screen.
export function buildSnapshot(ws) {
  const session = ws.session || {};
  const entries = (ws.entries || []).map((e, i) => ({
    id: e.id, index: i + 1, type: e.type, createdAt: e.createdAt, timeframe: e.timeframe || null,
    note: e.note || e.movementNote || '', hasImage: !!e.hasImage,
    scenarioCount: (e.scenarios || []).length
  }));
  const scenarios = [];
  (ws.entries || []).forEach((e) => {
    (e.scenarios || []).forEach((sc) => {
      const history = sc.probabilityHistory || [];
      const stages = (sc.pattern && sc.pattern.stages) || [];
      const done = (sc.pattern && sc.pattern.completedStageIds) || [];
      scenarios.push({
        id: sc.id, entryId: e.id, title: sc.title || '', side: sc.side || null,
        probability: history.length ? history[history.length - 1].value : null,
        occurred: !!sc.occurred,
        patternTitle: (sc.pattern && sc.pattern.title) || null,
        completionPercent: stages.length ? Math.round((done.length / stages.length) * 100) : null
      });
    });
  });
  const positions = (ws.openPositions || []).map((t) => ({
    id: t.id, instrument: t.instrument || null, side: t.side || null, status: t.status || null,
    entry: t.entryPrice != null ? t.entryPrice : null, stop: t.stopPrice != null ? t.stopPrice : null,
    target: t.targetPrice != null ? t.targetPrice : null
  }));
  return {
    version: BRIDGE_VERSION,
    context: {
      instrument: session.instrument || null, timeframe: session.timeframe || null,
      market: session.market || null, status: session.status || null,
      startedAt: session.startedAt || null,
      elapsedMinutes: session.startedAt ? Math.max(0, Math.round((Date.now() - Number(session.startedAt)) / 60000)) : null,
      loopMinutes: Number(session.updateIntervalMinutes) || null,
      language: ws.lang, direction: ws.rtl ? 'rtl' : 'ltr',
      entryCount: entries.length, scenarioCount: scenarios.length, openPositionCount: positions.length
    },
    entries: entries,
    scenarios: scenarios,
    positions: positions,
    // The chart the session is actually on. A panel can only ever display these facts as text - it
    // has no way to embed a live chart itself (no script, no network access either way).
    chart: {
      symbol: session.instrument || null, interval: session.timeframe || null,
      embeddable: false,
      note: 'This panel has no script execution and no network access, so it cannot embed a live chart itself.'
    }
  };
}

// The document a generated panel renders inside. `safeBody` is already fully sanitized AND
// data-bound HTML by the time it reaches this function (see buildSafeBody below) - this function
// only ever wraps it, never touches its own content. No <script> tag exists anywhere in this
// document; there is nothing left in it capable of executing code, by construction.
function panelDocument(safeBody, theme) {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; form-action \'none\'; base-uri \'none\'; script-src \'none\';">'
    + '<style>'
    + ':root{color-scheme:dark;' + theme + '}'
    + '*{box-sizing:border-box}'
    + 'html,body{margin:0;padding:0;background:transparent;color:var(--text-primary);'
    + 'font:12px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    + '#navrya-panel-root{padding:12px}'
    + '</style></head><body><div id="navrya-panel-root">'
    + safeBody
    + '</div></body></html>';
}

// Sanitizes (and, when a real snapshot is available, binds) the model's raw fragment. Wrapped in a
// try/catch purely as a defensive last resort - panelSafeRender.js is designed to fail closed on
// its own (a rejected element/attribute/path renders as nothing, never throws), so `failed` should
// never actually come back true, but a generated-content pipeline must never let any single
// malformed input crash the whole Analysis Workspace render.
function buildSafeBody(source, snapshot) {
  try {
    const html = snapshot
      ? renderPanelSafely(source || '', snapshot, ANALYSIS_WORKSPACE_BIND_SCHEMA)
      : sanitizePanelFragment(source || '');
    return { html, failed: false };
  } catch (_) {
    return { html: '', failed: true };
  }
}

// CSS custom properties forwarded into the sandbox so a generated panel can look native without
// being able to read anything else about the host page.
function themeVars() {
  const styles = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const pick = (name, fallback) => {
    const value = styles ? styles.getPropertyValue(name).trim() : '';
    return name + ':' + (value || fallback) + ';';
  };
  return [
    pick('--char-accent', '#8b5cf6'), pick('--text-primary', '#f4ead7'), pick('--text-muted', '#a89f8f'),
    pick('--text-dim', '#6f6a60'), pick('--border-gold', 'rgba(212,175,55,.35)'),
    pick('--border-hairline', 'rgba(244,234,215,.12)'), pick('--success', '#2ecc71'), pick('--danger', '#e74c3c')
  ].join('');
}

// One sandboxed panel. `snapshotRef` is a ref, not a prop value, so an unrelated re-render (the
// session's own 1s tick) never rebuilds the document by itself - only a real `source`/`pulse`
// change does.
export function SandboxedPanel({ source, snapshotRef, title, lang, pulse, onError }) {
  const frameRef = React.useRef(null);
  const [height, setHeight] = React.useState(160);
  const [failure, setFailure] = React.useState('');

  const theme = themeVars();
  const { html: safeBody, failed: safeBodyFailed } = React.useMemo(
    () => buildSafeBody(source, snapshotRef ? snapshotRef.current : null),
    [source, snapshotRef, pulse] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const doc = React.useMemo(() => panelDocument(safeBody, theme), [safeBody, theme]);

  React.useEffect(() => {
    if (!safeBodyFailed) return;
    setFailure('panel could not be rendered safely');
    if (onError) onError('render-failed');
  }, [safeBodyFailed, onError]);

  // No script runs inside this document, so there is no live postMessage telemetry to listen for -
  // the parent measures the frame directly instead. `allow-same-origin` (with NO allow-scripts) is
  // what makes this legal: same-origin DOM access is only a risk when paired with script execution
  // inside the frame, and there is none.
  function measure() {
    const frame = frameRef.current;
    try {
      const cdoc = frame && frame.contentDocument;
      if (!cdoc || !cdoc.documentElement) return;
      const raw = Math.max(cdoc.documentElement.scrollHeight || 0, cdoc.body ? cdoc.body.scrollHeight : 0);
      const next = Math.max(80, Math.min(900, raw || 160));
      setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    } catch (_) {
      // Cross-origin or not-yet-attached - the next load/resize pass retries.
    }
  }

  const resizeObserverRef = React.useRef(null);
  function handleFrameLoad() {
    if (!safeBodyFailed) setFailure('');
    measure();
    if (resizeObserverRef.current) { resizeObserverRef.current.disconnect(); resizeObserverRef.current = null; }
    try {
      const cdoc = frameRef.current && frameRef.current.contentDocument;
      if (cdoc && cdoc.documentElement && typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(measure);
        observer.observe(cdoc.documentElement);
        resizeObserverRef.current = observer;
      }
    } catch (_) {
      // Best-effort only - a missing ResizeObserver never blocks the panel from rendering.
    }
  }
  React.useEffect(() => () => { if (resizeObserverRef.current) resizeObserverRef.current.disconnect(); }, []);

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border-gold)', background: 'var(--surface-800, rgba(11,20,21,.6))', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--char-accent)', flex: 'none' }} />
        <span dir="auto" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: 9, letterSpacing: '.08em', color: 'var(--text-dim)', flex: 'none' }}>AI · SAFE RENDER</span>
      </div>
      {failure && (
        <div dir="auto" style={{ padding: '8px 12px', fontSize: 11, color: 'var(--danger)', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(231,76,60,.08)' }}>
          {failure}
        </div>
      )}
      <iframe
        ref={frameRef} title={title || 'panel'} srcDoc={doc} sandbox="allow-same-origin"
        referrerPolicy="no-referrer" loading="lazy" onLoad={handleFrameLoad}
        style={{ display: 'block', width: '100%', height: height, border: 0, background: 'transparent' }}
      />
    </div>
  );
}
