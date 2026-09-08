import React from 'react';
import { BRIDGE_VERSION } from './analysisWorkspaceBridgeDoc.js';

// ============================================================================
// Sandboxed runtime for AI-authored Analysis Workspace panels (Phase 2).
//
// The whole security model in one place, because this is the file that decides how much damage a
// generated panel can do:
//
//  1. The panel runs in an <iframe sandbox="allow-scripts"> with NO allow-same-origin. That gives
//     it an opaque origin: it cannot touch this document, its DOM, its cookies, its localStorage,
//     or any auth token. Generated code is NEVER evaluated in the app's own realm - there is no
//     eval()/new Function()/dangerouslySetInnerHTML path for it anywhere in this app.
//  2. The document it runs in carries a strict CSP that blocks ALL network access
//     (default-src 'none', no connect-src). A panel is handed real session data, so it must not be
//     able to send that data anywhere. No fetch, no XHR, no WebSocket, no beacon, no remote image,
//     no third-party script. This is also why a generated panel can never pull a chart library or
//     a live price feed off a CDN - a deliberate, documented trade-off, not an oversight.
//  3. The only channel is postMessage, and it is READ-ONLY by construction: the parent answers a
//     fixed list of getter methods and nothing else. There is no write/mutate method in the
//     protocol, so a panel cannot log a trade, edit a scenario, or change a session.
//  4. The parent authenticates messages by object identity (event.source === the iframe's own
//     contentWindow), not by origin - a sandboxed opaque origin reports itself as "null", so the
//     origin string is worthless here and the window reference is the real check.
//
// Protocol version is explicit so a stored panel written against v1 keeps working when a later
// version adds methods. It lives in analysisWorkspaceBridgeDoc.js because the prompt builder needs
// the same number, and that file has to stay plain JS for the unit tests.
// ============================================================================
export { BRIDGE_VERSION };

// Every method a panel may call. Adding to this list widens what generated code can see, so it is
// deliberately a short, reviewed allowlist - and every one of them is a getter.
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
    // The chart the session is actually on. A panel can render its own TradingView embed from
    // this - but only by asking the HOST to do it (see 'chart' below): the sandbox's own CSP
    // blocks every remote script, including TradingView's, by design.
    chart: {
      symbol: session.instrument || null, interval: session.timeframe || null,
      embeddable: false,
      note: 'The sandbox blocks all network access, so a panel cannot embed a live chart itself.'
    }
  };
}

// The document a generated panel runs inside. The generated fragment is inserted as real HTML
// (not as a JS string), so its own <style>/<script> tags work exactly like a normal page and there
// is no "</script> breaks out of the wrapper" escaping hazard to get wrong.
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
  ' getContext:function(){return call("context")},',
  ' getEntries:function(){return call("entries")},',
  ' getScenarios:function(){return call("scenarios")},',
  ' getPositions:function(){return call("positions")},',
  ' getChart:function(){return call("chart")},',
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
// the CURRENT session state without this component having to re-render (and therefore reload the
// iframe, which would throw away whatever the panel had drawn) on every 1s session tick.
export function SandboxedPanel({ source, snapshotRef, title, lang, pulse, onError }) {
  const frameRef = React.useRef(null);
  const [height, setHeight] = React.useState(160);
  const [failure, setFailure] = React.useState('');

  // navrya.onUpdate(): pushed only when `pulse` says something a panel could care about actually
  // changed (an entry/scenario added, the selection moved) - never on the host's own 1s clock tick,
  // which would wake every panel once a second for nothing.
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
  // drawn state across the session's own 1s re-render tick. The theme is part of the key rather
  // than read inside the memo: computed once and ignored afterwards, a panel built under one
  // character's accent kept that accent after a character/theme change until its source happened
  // to be edited.
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
