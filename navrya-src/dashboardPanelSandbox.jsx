import React from 'react';
import { BRIDGE_VERSION } from './dashboardPanelBridgeDoc.js';

// ============================================================================
// Sandboxed runtime for AI-authored Dashboard panels (Vibe Coding Panel Studio, target
// `dashboard.panel`).
//
// This is an INDEPENDENT module from navrya-src/analysisWorkspacePanelRuntime.jsx - deliberately
// not refactored to share file-level source with it. That file's own security test
// (tests/analysis-workspace-panel.test.mjs) asserts exact literal substrings of ITS OWN source
// text (the sandbox attribute, the CSP string, the identity check, the bridge method list, the
// snapshot builder), so extracting shared code out of it would break those assertions without
// making either sandbox less secure. Re-implementing the identical architecture here, verified by
// its own parallel test (tests/dashboard-panel-studio-sandbox.test.mjs), keeps both targets
// independently auditable.
//
// The whole security model, in one place:
//
//  1. The panel runs in an <iframe sandbox="allow-scripts"> with NO allow-same-origin. That gives
//     it an opaque origin: it cannot touch this document, its DOM, its cookies, its localStorage,
//     or any auth token. Generated code is NEVER evaluated in the app's own realm - there is no
//     eval()/new Function()/dangerouslySetInnerHTML path for it anywhere in this app.
//  2. The document it runs in carries a strict CSP that blocks ALL network access
//     (default-src 'none', no connect-src). A panel is handed real trading-activity data, so it
//     must not be able to send that data anywhere. No fetch, no XHR, no WebSocket, no beacon, no
//     remote image, no third-party script, no CDN.
//  3. The only channel is postMessage, and it is READ-ONLY by construction: the parent answers a
//     fixed list of getter methods and nothing else. There is no write/mutate method in the
//     protocol, so a panel cannot log a trade, change a setting, or touch anything on the real
//     dashboard.
//  4. The parent authenticates messages by object identity (event.source === the iframe's own
//     contentWindow), not by origin - a sandboxed opaque origin reports itself as "null", so the
//     origin string is worthless here and the window reference is the real check.
//
// Protocol version is explicit so a stored panel written against v1 keeps working when a later
// version adds methods. It lives in dashboardPanelBridgeDoc.js because the prompt builder
// (navrya-src/dashboardPanelBuilder.js) needs the same number and has to stay plain JS.
// ============================================================================
export { BRIDGE_VERSION };

// Every method a panel may call. Adding to this list widens what generated code can see, so it is
// deliberately a short, reviewed allowlist - and every one of them is a getter.
export const BRIDGE_METHODS = ['tradeSummary', 'openPositions', 'patternStats', 'psychologyMirror'];

// Builds the plain, serializable snapshot handed across the bridge, sourced from the SAME global
// stores the existing Dashboard catalog panels already read synchronously
// (navrya-src/dashboardView.jsx's own PsychPanel/RewardPanel). Deliberately narrow: aggregate,
// already-visibly-rendered trading-activity facts only - never internal object references, never
// user identity/email, never API keys/sessions/tokens, never wallet balances, never raw
// images/blobs. Must stay synchronous (no await) - the caller re-computes it on demand, never
// caches a stale copy across a real state change.
export function buildDashboardBridgeSnapshot(character) {
  const tradeStore = typeof window !== 'undefined' ? window.TradeJournalTradeStore : null;
  const patternStore = typeof window !== 'undefined' ? window.TradeJournalPatternStore : null;
  const psychStore = typeof window !== 'undefined' ? window.TradeJournalPsychologyStore : null;

  const trades = tradeStore && typeof tradeStore.listSync === 'function' ? tradeStore.listSync() : [];
  const isOpen = (t) => t && (t.status === 'open' || t.status === 'hunting');
  const openTrades = trades.filter(isOpen);

  const patterns = patternStore && typeof patternStore.listSync === 'function' ? patternStore.listSync() : [];
  const tagMirror = psychStore && typeof psychStore.tagMirror === 'function' && tradeStore
    ? psychStore.tagMirror(trades, 3).filter((row) => !row.insufficient)
    : null;

  return {
    version: BRIDGE_VERSION,
    tradeSummary: { totalTrades: trades.length, openCount: openTrades.length },
    openPositions: openTrades.map((t) => ({
      id: t.id, instrument: t.instrument || null, side: t.side || null, status: t.status || null,
      entry: t.entryPrice != null ? t.entryPrice : null, stop: t.stopPrice != null ? t.stopPrice : null,
      target: t.targetPrice != null ? t.targetPrice : null
    })),
    patternStats: patterns.map((p) => ({
      id: p.id, title: p.title || '', occurrenceRate: p.occurrenceRate != null ? p.occurrenceRate : null,
      detectionCount: p.detectionCount != null ? p.detectionCount : null
    })),
    psychologyMirror: tagMirror ? { tags: tagMirror.map((row) => ({ tag: row.tag, sampleSize: row.sampleSize, winRate: row.winRate != null ? row.winRate : null })) } : null
  };
}

// The document a generated panel runs inside. The generated fragment is inserted as real HTML
// (not as a JS string), so its own <style>/<script> tags work exactly like a normal page.
//
// The CSP below cannot be loosened by anything the fragment adds: additional policies can only
// ever intersect, never widen, an existing one.
function panelDocument(source, theme) {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; font-src data:;">'
    + '<style>'
    + ':root{color-scheme:dark;' + theme + '}'
    + '*{box-sizing:border-box}'
    + 'html,body{margin:0;padding:0;background:transparent;color:var(--text-primary);'
    + 'font:12px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    + '#navrya-panel-root{padding:12px}'
    + 'a{color:var(--char-accent)}'
    + '</style></head><body><div id="navrya-panel-root"></div>'
    + '<script>' + BRIDGE_CLIENT + '</script>'
    + '<div id="navrya-panel-body">' + source + '</div>'
    + '</body></html>';
}

// Injected into every panel document, before the generated code, as the `navrya` global. Promise
// based, one in-flight map, and it reports its own height and any uncaught error back to the host
// so a broken generated panel shows an honest error strip instead of a blank box.
const BRIDGE_CLIENT = [
  '(function(){',
  'var seq=0,pending={};',
  'function call(method){return new Promise(function(resolve,reject){',
  ' var id=++seq;pending[id]={resolve:resolve,reject:reject};',
  ' parent.postMessage({__navryaPanel:1,type:"request",id:id,method:method},"*");',
  ' setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error("navrya bridge timeout"))}},8000);',
  '})}',
  'var listeners=[];',
  'window.addEventListener("message",function(ev){',
  ' var d=ev.data;if(!d||d.__navryaPanel!==1)return;',
  ' if(d.type==="response"&&pending[d.id]){var p=pending[d.id];delete pending[d.id];',
  '  if(d.ok)p.resolve(d.data);else p.reject(new Error(d.error||"navrya bridge error"))}',
  ' if(d.type==="update"){listeners.forEach(function(fn){try{fn(d.data)}catch(e){}})}',
  '});',
  'window.navrya={version:' + BRIDGE_VERSION + ',',
  ' getTradeSummary:function(){return call("tradeSummary")},',
  ' getOpenPositions:function(){return call("openPositions")},',
  ' getPatternStats:function(){return call("patternStats")},',
  ' getPsychologyMirror:function(){return call("psychologyMirror")},',
  ' onUpdate:function(fn){if(typeof fn==="function")listeners.push(fn)},',
  ' root:function(){return document.getElementById("navrya-panel-root")}',
  '};',
  'var lastH=0;',
  'function reportHeight(){var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);',
  ' if(Math.abs(h-lastH)<2)return;lastH=h;',
  ' parent.postMessage({__navryaPanel:1,type:"height",value:h},"*")}',
  'window.addEventListener("load",reportHeight);',
  'if(typeof ResizeObserver==="function"){try{new ResizeObserver(reportHeight).observe(document.documentElement)}catch(e){}}',
  'setInterval(reportHeight,2000);',
  'window.addEventListener("error",function(e){',
  ' parent.postMessage({__navryaPanel:1,type:"panel-error",message:String(e&&e.message||"error")},"*")});',
  'window.addEventListener("unhandledrejection",function(e){',
  ' parent.postMessage({__navryaPanel:1,type:"panel-error",message:String((e&&e.reason&&e.reason.message)||"rejection")},"*")});',
  '}());'
].join('');

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

// One sandboxed panel. `snapshotRef` is a ref, not a prop value, so the bridge always answers with
// the CURRENT dashboard state without this component having to re-render (and therefore reload
// the iframe, which would throw away whatever the panel had drawn).
export function SandboxedDashboardPanel({ source, snapshotRef, title, pulse, onError }) {
  const frameRef = React.useRef(null);
  const [height, setHeight] = React.useState(160);
  const [failure, setFailure] = React.useState('');

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ __navryaPanel: 1, type: 'update', data: snapshotRef.current || {} }, '*');
  }, [pulse, snapshotRef]);

  React.useEffect(() => {
    function onMessage(event) {
      const frame = frameRef.current;
      // Identity check, not origin: a sandboxed opaque origin always reports "null".
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || data.__navryaPanel !== 1) return;
      if (data.type === 'height') {
        const next = Math.max(80, Math.min(900, Number(data.value) || 160));
        setHeight((prev) => (Math.abs(prev - next) > 2 ? next : prev));
        return;
      }
      if (data.type === 'panel-error') {
        setFailure(String(data.message || '').slice(0, 200));
        if (onError) onError(String(data.message || ''));
        return;
      }
      if (data.type === 'request') {
        const method = String(data.method || '');
        const snapshot = snapshotRef.current || {};
        const ok = BRIDGE_METHODS.indexOf(method) > -1;
        frame.contentWindow.postMessage({
          __navryaPanel: 1, type: 'response', id: data.id, ok: ok,
          data: ok ? snapshot[method] : undefined,
          error: ok ? undefined : 'UNKNOWN_METHOD'
        }, '*');
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onError, snapshotRef]);

  // The document is built once per source change - never per render - so a panel keeps its own
  // drawn state across unrelated re-renders.
  const theme = themeVars();
  const doc = React.useMemo(() => panelDocument(source || '', theme), [source, theme]);

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border-gold)', background: 'var(--surface-800, rgba(11,20,21,.6))', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--char-accent)', flex: 'none' }} />
        <span dir="auto" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: 9, letterSpacing: '.08em', color: 'var(--text-dim)', flex: 'none' }}>AI · SANDBOX</span>
      </div>
      {failure && (
        <div dir="auto" style={{ padding: '8px 12px', fontSize: 11, color: 'var(--danger)', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(231,76,60,.08)' }}>
          {failure}
        </div>
      )}
      <iframe
        ref={frameRef} title={title || 'panel'} srcDoc={doc} sandbox="allow-scripts"
        referrerPolicy="no-referrer" loading="lazy"
        style={{ display: 'block', width: '100%', height: height, border: 0, background: 'transparent' }}
      />
    </div>
  );
}
