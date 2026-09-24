import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { trt, trDigits, trDate } from './analysisProfileTrainingCopy.js';
import {
  NODE_KINDS, LAYERS, CONCEPT_PRIORITY_COLOR,
  buildLaidOutGraph, degreeMap, graphInputSignature, nodeRadius, nodeVolume, nodeColor, linkColor, boundingBox
} from './analysisProfileBrainGraph.js';

/**
 * Analysis Profile "Memory Graph" (ARCHITECTURE.md §7.25) — the Memory tab's graph block and its
 * full-screen 3D workspace, built to the reference graph app (github.com/richardholliday/graph-app,
 * live at driftforge.cloud): a real 3d-force-graph, sphere volume that grows with the square of a
 * node's connections, half-opacity links each carrying one directional particle, neighbourhood
 * dimming on hover, a blurred toolbar with a search pill and filter pills, a legend, a centred
 * stats pill and a detail panel that slides in from the inline-end edge (a bottom sheet on phones).
 *
 * This is a DERIVED VIEW. It reads the profile it is handed and nothing else; every mutation the
 * workspace offers ("Manage concepts") hands control back to the Concepts tab's own existing
 * applyLearning()/update() paths rather than growing a second editor.
 *
 * Loading strategy, and why it is not `react-force-graph-3d`: the NAVRYA bundle is built as a
 * single IIFE per character (vite.navrya.config.mjs), a format Rollup cannot code-split. A bundled
 * import of the 3D engine would therefore ship ~1.3MB into every character's bundle and parse it on
 * every page load, for a view most visits never open - the opposite of "lazy-load the workspace
 * only after click". So the engine is vendored as a UMD build
 * (public/pages/shared/vendor/3d-force-graph.min.js, the same convention lucide.min.js already
 * uses) and injected as a <script> the first time a trader actually opens the workspace.
 * `react-force-graph-3d` is only a React wrapper over this same engine, so the rendering is
 * identical.
 */

const VENDOR_SRC = '../shared/vendor/3d-force-graph.min.js';

/* One WebGL canvas, ever. A second live instance would keep its own context, its own animation
   loop and its own listeners alive behind the overlay that appears to have replaced it. */
let ACTIVE_GRAPH = null;
function releaseActiveGraph() {
  if (!ACTIVE_GRAPH) return;
  try { ACTIVE_GRAPH._destructor(); } catch (e) { /* already gone */ }
  ACTIVE_GRAPH = null;
}

let vendorPromise = null;
function loadGraphEngine() {
  if (typeof window !== 'undefined' && typeof window.ForceGraph3D === 'function') return Promise.resolve(window.ForceGraph3D);
  if (vendorPromise) return vendorPromise;
  vendorPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VENDOR_SRC;
    script.async = true;
    script.onload = () => {
      if (typeof window.ForceGraph3D === 'function') resolve(window.ForceGraph3D);
      else reject(new Error('ENGINE_MISSING'));
    };
    script.onerror = () => { vendorPromise = null; reject(new Error('ENGINE_LOAD_FAILED')); };
    document.head.appendChild(script);
  });
  return vendorPromise;
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) { return false; }
}

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* WebGL takes real colour values, never a CSS custom property, so every token this view draws with
   is resolved against the live theme before it reaches the engine. */
function resolveToken(element, name, fallback) {
  try {
    const value = window.getComputedStyle(element).getPropertyValue(name).trim();
    return value || fallback;
  } catch (e) { return fallback; }
}

function directionFor(lang) { return lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr'; }

/* --------------------------------------------------------------- labels --- */

function kindLabel(lang, kind) {
  return trt(lang, {
    profile: 'graphKindProfile', 'primary-style': 'graphKindPrimaryStyle', 'secondary-style': 'graphKindSecondaryStyle',
    focus: 'graphKindFocus', 'custom-focus': 'graphKindCustomFocus', concept: 'graphKindConcept', understanding: 'graphKindUnderstanding'
  }[kind] || 'graphKindConcept');
}
function linkKindLabel(lang, kind) {
  return trt(lang, {
    'primary-lens': 'graphLinkPrimaryLens', 'secondary-lens': 'graphLinkSecondaryLens', focus: 'graphLinkFocus',
    'custom-focus': 'graphLinkCustomFocus', 'active-concept': 'graphLinkActiveConcept',
    understanding: 'graphLinkUnderstanding', 'style-focus': 'graphLinkStyleFocus'
  }[kind] || 'graphLinkFocus');
}
function layerLabel(lang, layer) {
  return trt(lang, { lens: 'graphLayerLens', learned: 'graphLayerLearned', structural: 'graphLayerStructural' }[layer]);
}
function originLabel(lang, origin) {
  return trt(lang, { user: 'originUser', ai: 'originAi', source: 'originSource', chat: 'originChat', starter: 'originStarter' }[origin] || 'originUser');
}
function priorityLabel(lang, priority) {
  return trt(lang, { mandatory: 'priorityMandatory', preferred: 'priorityPreferred', reference: 'priorityReference' }[priority] || 'priorityPreferred');
}

/** A node's display label. The understanding node has no user-authored title of its own, so it
 *  takes a localized one; everything else shows exactly what the store holds. */
function displayLabel(node, lang) {
  if (node.kind === 'understanding') {
    return node.version
      ? trt(lang, 'understandingTitle') + ' — ' + trt(lang, 'understandingVersion', { n: trDigits(lang, node.version) })
      : trt(lang, 'understandingTitle');
  }
  return node.label || trt(lang, 'graphUnnamed');
}

/* -------------------------------------------------------- shared model --- */

function useMemoryGraph(profile, lang) {
  // Memoised on a signature of exactly the fields the graph is built from. Counting concepts and
  // reading the understanding version is not enough: renaming a concept changes neither.
  const signature = graphInputSignature(profile);
  return React.useMemo(() => {
    const graph = buildLaidOutGraph(profile, {
      styles: window.TradeJournalAnalysisStyleRegistry,
      focuses: window.TradeJournalAnalysisFocusRegistry,
      // Only ever consulted to confirm what genuinely reached the engine - never for structure.
      context: window.TradeJournalAnalysisContext
        ? window.TradeJournalAnalysisContext.getAnalysisContext(profile.id)
        : null,
      lang
    });
    graph.degree = degreeMap(graph.nodes, graph.links);
    graph.byId = graph.nodes.reduce((map, node) => { map[node.id] = node; return map; }, Object.create(null));
    graph.adjacency = graph.nodes.reduce((map, node) => { map[node.id] = Object.create(null); return map; }, Object.create(null));
    graph.links.forEach((link) => {
      graph.adjacency[link.source][link.target] = true;
      graph.adjacency[link.target][link.source] = true;
    });
    return graph;
  }, [signature, lang]);
}

/* ------------------------------------------------------- SVG preview --- */

const PREVIEW_W = 400;
const PREVIEW_H = 300;
const PREVIEW_FOCAL = 780;
const PREVIEW_TURN_MS = 28000;   // one full revolution; calm, but visibly alive

/**
 * The Memory tab's own preview: the same deterministic layout the workspace starts from,
 * projected to plain SVG. No WebGL, no engine download - so the Memory tab costs nothing until the
 * trader asks for the real thing.
 */
function GraphPreview({ graph, lang, height }) {
  const wrapRef = React.useRef(null);
  const svgRef = React.useRef(null);

  React.useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || !graph.nodes.length) return undefined;

    const NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const gLinks = document.createElementNS(NS, 'g');
    const gNodes = document.createElementNS(NS, 'g');
    svg.appendChild(gLinks);
    svg.appendChild(gNodes);

    const index = graph.nodes.reduce((map, node, i) => { map[node.id] = i; return map; }, Object.create(null));
    const lineEls = graph.links.map((link) => {
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('stroke-width', '1');
      el.setAttribute('stroke-opacity', '.5');
      el.setAttribute('stroke', linkColor(link, false));
      gLinks.appendChild(el);
      return el;
    });
    // Only the hubs carry a label here; a 400px-wide preview cannot hold thirty of them.
    const labelled = (node) => node.kind === 'profile' || node.kind === 'primary-style'
      || node.kind === 'secondary-style' || node.kind === 'understanding' || (graph.degree[node.id] || 0) >= 3;
    const nodeEls = graph.nodes.map((node) => {
      const group = document.createElementNS(NS, 'g');
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('fill-opacity', '.9');
      circle.setAttribute('fill', nodeColor(node, false));
      group.appendChild(circle);
      let text = null;
      if (labelled(node)) {
        text = document.createElementNS(NS, 'text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#cccccc');
        text.setAttribute('font-family', 'Vazirmatn, Tahoma, Arial, sans-serif');
        // textContent, never innerHTML: these labels are the trader's own words.
        text.textContent = displayLabel(node, lang);
        group.appendChild(text);
      }
      gNodes.appendChild(group);
      return { group, circle, text, node };
    });

    /* Fit to the bounding box, and measure the radius in the ROTATION PLANE so the graph keeps
       filling the frame at every angle instead of swinging in and out of it. */
    const box = boundingBox(graph.nodes);
    let rxz = 1;
    let maxR = 1;
    graph.nodes.forEach((node) => {
      const dx = node.x - box.cx, dz = node.z - box.cz;
      rxz = Math.max(rxz, Math.sqrt(dx * dx + dz * dz));
      maxR = Math.max(maxR, nodeRadius(node, graph.degree));
    });
    const ry = Math.max(1, (box.maxY - box.minY) / 2);
    const scale = Math.min((PREVIEW_W / 2 - 6) / (rxz + maxR), (PREVIEW_H / 2 - 10) / (ry + maxR));
    const LABEL_ROOM = 8;

    const edgeIdx = graph.links.map((link) => [index[link.source], index[link.target]]);
    const order = graph.nodes.map((_, i) => i);
    const proj = graph.nodes.map(() => ({ x: 0, y: 0, k: 1, z: 0 }));

    function draw(angle) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (let i = 0; i < graph.nodes.length; i += 1) {
        const node = graph.nodes[i];
        const dx = node.x - box.cx, dz = node.z - box.cz;
        const x = dx * cos - dz * sin;
        const z = dx * sin + dz * cos;
        const k = PREVIEW_FOCAL / (PREVIEW_FOCAL + z * scale);
        proj[i].x = PREVIEW_W / 2 + x * scale * k;
        proj[i].y = PREVIEW_H / 2 + LABEL_ROOM + (node.y - box.cy) * scale * k;
        proj[i].k = k;
        proj[i].z = z;
      }
      for (let e = 0; e < edgeIdx.length; e += 1) {
        const a = proj[edgeIdx[e][0]], b = proj[edgeIdx[e][1]], el = lineEls[e];
        if (!a || !b) continue;
        el.setAttribute('x1', a.x.toFixed(1)); el.setAttribute('y1', a.y.toFixed(1));
        el.setAttribute('x2', b.x.toFixed(1)); el.setAttribute('y2', b.y.toFixed(1));
      }
      order.sort((p, q) => proj[q].z - proj[p].z);
      order.forEach((i) => {
        const el = nodeEls[i], p = proj[i];
        const r = Math.max(1.4, nodeRadius(el.node, graph.degree) * scale * p.k);
        gNodes.appendChild(el.group);           // painter's algorithm: far first
        el.circle.setAttribute('cx', p.x.toFixed(1));
        el.circle.setAttribute('cy', p.y.toFixed(1));
        el.circle.setAttribute('r', r.toFixed(2));
        if (el.text) {
          el.text.setAttribute('x', p.x.toFixed(1));
          el.text.setAttribute('y', (p.y - r - 4).toFixed(1));
          el.text.setAttribute('font-size', (7.6 * p.k).toFixed(2));
          el.text.setAttribute('fill-opacity', Math.max(0.18, Math.min(0.85, 0.35 + 0.8 * (p.k - 0.78))).toFixed(2));
        }
      });
    }

    let angle = 0.4;
    let last = 0;
    let frame = 0;
    const reduced = prefersReducedMotion();
    const paused = () => reduced || document.hidden
      || wrap.matches(':hover') || wrap.contains(document.activeElement);

    function tick(now) {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      if (!paused()) angle += (dt / PREVIEW_TURN_MS) * Math.PI * 2;
      draw(angle);
      frame = window.requestAnimationFrame(tick);
    }
    draw(angle);
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [graph, lang]);

  return (
    <div
      ref={wrapRef} tabIndex={0} role="img"
      aria-label={trt(lang, 'graphPreviewAlt', { n: trDigits(lang, graph.nodes.length) })}
      style={{
        position: 'relative', height, borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--border-hairline)', background: 'var(--ink-950)'
      }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}

/* ------------------------------------------------- the Memory tab block --- */

export function MemoryGraphPanel({ profile, lang, onOpen }) {
  const graph = useMemoryGraph(profile, lang);
  const empty = graph.nodes.length <= 1;
  const focusCount = graph.counts.focus + graph.counts['custom-focus'];

  return (
    <Panel variant="prestige" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ color: 'var(--char-accent)', display: 'inline-flex' }}><Icon name="share-2" size={15} /></span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--text-primary)' }}>{trt(lang, 'graphTitle')}</span>
        <span style={{ marginInlineStart: 'auto' }}>
          <Chip tone="accent" dot>{trt(lang, 'graphNodesActive', { n: trDigits(lang, graph.nodes.length) })}</Chip>
        </span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
        {empty ? (
          <div style={{
            minHeight: 252, borderRadius: 8, border: '1px dashed rgba(214,175,107,.42)', background: 'rgba(3,8,7,.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18, textAlign: 'center'
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'graphEmptyTitle')}</span>
            <span style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--text-dim)', maxWidth: 260 }}>{trt(lang, 'graphEmptyBody')}</span>
          </div>
        ) : (
          /* The viewport needs a real height: it is a flex child in a grid row whose height is
             auto, so without one it collapses to whatever the neighbouring column happens to be
             and the graph renders into a sliver. */
          <GraphPreview graph={graph} lang={lang} height={252} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid var(--border-hairline)', borderRadius: 8, overflow: 'hidden', flex: 'none' }}>
          {[
            [focusCount, trt(lang, 'graphStatFocus')],
            [graph.counts.concept, trt(lang, 'graphStatConcepts')],
            [profile.understanding.version || 0, trt(lang, 'graphStatVersion')]
          ].map(([value, label], i) => (
            <div key={label} style={{ padding: '9px 10px', textAlign: 'center', borderInlineEnd: i < 2 ? '1px solid var(--border-hairline)' : undefined }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)', fontVariantNumeric: 'tabular-nums' }}>{trDigits(lang, value)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Button variant="secondary" size="sm" icon="maximize" onClick={onOpen} disabled={empty}>{trt(lang, 'graphOpen')}</Button>
          {profile.understanding.updatedAt && (
            <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
              {trt(lang, 'graphLastLearned', { date: trDate(lang, profile.understanding.updatedAt) })}
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------ full-screen workspace --- */

const FILTER_KINDS = Object.keys(NODE_KINDS);
// Always labelled, whatever their degree: the profile itself, its styles, and what the engine learned.
const ALWAYS_LABELLED = { profile: true, 'primary-style': true, 'secondary-style': true, understanding: true };
const LABEL_NEAR = 380;       // a leaf node only earns a label once the camera is this close
const LABEL_FADE = 1100;      // labels dim with distance, the way the reference's sprites shrink
const SEARCH_RESULT_LIMIT = 8;

export function MemoryGraphWorkspace({ profile, lang, onClose, onManageConcepts }) {
  const graph = useMemoryGraph(profile, lang);
  const rootRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const labelLayerRef = React.useRef(null);
  const tooltipRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const graphRef = React.useRef(null);
  const liveRef = React.useRef(null);
  const stateRef = React.useRef({
    hovered: null, selected: null, hiddenKinds: Object.create(null), query: '', byLayer: false, labels: true, cameraMs: 900
  });

  const [status, setStatus] = React.useState('loading');   // loading | ready | no-webgl | failed
  const [selectedId, setSelectedId] = React.useState(null);
  const [hoverId, setHoverId] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [hidden, setHidden] = React.useState({});
  const [byLayer, setByLayer] = React.useState(false);
  const [labels, setLabels] = React.useState(!prefersReducedMotion());
  const [motion, setMotion] = React.useState(!prefersReducedMotion());

  const refresh = React.useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    g.nodeColor(g.nodeColor());
    g.linkColor(g.linkColor());
    g.linkDirectionalParticleColor(g.linkDirectionalParticleColor());
    g.nodeVisibility(g.nodeVisibility());
    g.linkVisibility(g.linkVisibility());
  }, []);

  React.useEffect(() => { stateRef.current.hiddenKinds = hidden; refresh(); }, [hidden, refresh]);
  React.useEffect(() => { stateRef.current.query = query.trim().toLowerCase(); refresh(); }, [query, refresh]);
  React.useEffect(() => { stateRef.current.byLayer = byLayer; refresh(); }, [byLayer, refresh]);
  React.useEffect(() => { stateRef.current.labels = labels; }, [labels]);
  React.useEffect(() => { stateRef.current.selected = selectedId; }, [selectedId]);

  const selected = selectedId ? graph.byId[selectedId] : null;
  const hovered = hoverId ? graph.byId[hoverId] : null;

  /* ---- being a dialog: focus in, Escape out, Tab kept inside, page scroll locked ---- */
  React.useEffect(() => {
    const previous = document.activeElement;
    if (closeRef.current) closeRef.current.focus();
    document.documentElement.classList.add('nv-gx-open');
    return () => {
      document.documentElement.classList.remove('nv-gx-open');
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  function onRootKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !rootRef.current) return;
    const focusable = Array.prototype.filter.call(
      rootRef.current.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'),
      (node) => !node.disabled && node.offsetParent !== null && window.getComputedStyle(node).visibility !== 'hidden'
    );
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /* ---- mount the engine, once, lazily ---- */
  React.useEffect(() => {
    let cancelled = false;
    if (!webglAvailable()) { setStatus('no-webgl'); return undefined; }

    loadGraphEngine().then((ForceGraph3D) => {
      if (cancelled || !canvasRef.current) return;
      releaseActiveGraph();

      const host = canvasRef.current;
      const background = resolveToken(rootRef.current || host, '--gx-bg', '#0f1117');
      const dimNode = 'rgba(30,32,42,0.30)';
      const dimLink = 'rgba(30,32,42,0.15)';
      const nodeId = (value) => (value && value.id) || value;
      const visibleNode = (node) => !stateRef.current.hiddenKinds[node.kind];

      // The engine mutates the objects it is given, so it gets copies; the deterministic layout
      // rides along as each node's starting x/y/z and the simulation settles from there.
      const data = {
        nodes: graph.nodes.map((node) => Object.assign({}, node)),
        links: graph.links.map((link) => ({ id: link.id, source: link.source, target: link.target, kind: link.kind }))
      };
      liveRef.current = new Map(data.nodes.map((node) => [node.id, node]));

      const reduced = prefersReducedMotion();
      let fitted = false;

      const g = ForceGraph3D()(host)
        .backgroundColor(background)
        .showNavInfo(false)
        .graphData(data)
        .nodeVal((node) => nodeVolume(node, graph.degree))
        .nodeOpacity(0.9)
        .nodeResolution(12)                       // low poly: a few dozen spheres, never a hero render
        .nodeColor((node) => {
          const s = stateRef.current;
          if (s.hovered && node.id !== s.hovered && !graph.adjacency[s.hovered][node.id]) return dimNode;
          if (s.query && displayLabel(node, lang).toLowerCase().indexOf(s.query) === -1) return dimNode;
          return nodeColor(node, s.byLayer);
        })
        .linkColor((link) => {
          const s = stateRef.current;
          if (s.hovered && nodeId(link.source) !== s.hovered && nodeId(link.target) !== s.hovered) return dimLink;
          return linkColor(link, s.byLayer);
        })
        .linkOpacity(0.5)
        .linkWidth(1)
        .linkDirectionalParticles(reduced ? 0 : 1)
        .linkDirectionalParticleWidth(1.5)
        .linkDirectionalParticleColor((link) => linkColor(link, stateRef.current.byLayer))
        .nodeVisibility(visibleNode)
        .linkVisibility((link) => visibleNode(graph.byId[nodeId(link.source)]) && visibleNode(graph.byId[nodeId(link.target)]))
        .onNodeHover((node) => {
          stateRef.current.hovered = node ? node.id : null;
          host.style.cursor = node ? 'pointer' : 'default';
          setHoverId(node ? node.id : null);
          refresh();
        })
        .onNodeClick((node) => setSelectedId(node.id))
        .onBackgroundClick(() => setSelectedId(null))
        .onEngineStop(() => {
          // Fit the settled graph to the frame once, unless the trader has already gone somewhere.
          if (fitted || stateRef.current.selected) return;
          fitted = true;
          g.zoomToFit(stateRef.current.cameraMs ? 600 : 0, 70);
        });

      g.d3Force('charge').strength(-400);
      g.d3Force('link').distance(80);
      // Bounded: the layout settles and the simulation stops, so the graph holds still while it is
      // being read instead of drifting under the cursor forever.
      g.cooldownTicks(220);
      g.width(host.clientWidth);
      g.height(host.clientHeight);

      // Start framed on the seed layout so the first painted frame is never an empty canvas.
      const box = boundingBox(graph.nodes);
      const reach = Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ, 120);
      g.cameraPosition({ x: 0, y: 0, z: Math.max(320, reach * 1.6) }, { x: 0, y: 0, z: 0 }, 0);

      graphRef.current = g;
      ACTIVE_GRAPH = g;
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('failed'); });

    return () => {
      cancelled = true;
      graphRef.current = null;
      liveRef.current = null;
      releaseActiveGraph();
    };
  }, [graph, lang, refresh]);

  /* ---- keep the canvas sized to its box ---- */
  React.useEffect(() => {
    const host = canvasRef.current;
    if (!host || !window.ResizeObserver) return undefined;
    const ro = new window.ResizeObserver(() => {
      const g = graphRef.current;
      if (g) { g.width(host.clientWidth); g.height(host.clientHeight); }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [status]);

  /* ---- the tooltip follows the pointer: pure geometry, so it bypasses React state ---- */
  React.useEffect(() => {
    const host = canvasRef.current;
    const tip = tooltipRef.current;
    if (!host || !tip) return undefined;
    function onMove(event) {
      const r = host.getBoundingClientRect();
      const x = Math.max(8, Math.min(r.width - 288, event.clientX - r.left + 14));
      const y = Math.max(8, Math.min(r.height - 120, event.clientY - r.top + 14));
      tip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    }
    host.addEventListener('mousemove', onMove);
    return () => host.removeEventListener('mousemove', onMove);
  }, [status]);

  /* ---- HTML label overlay: plain text, RTL-aware, and free of a second font stack in WebGL ---- */
  React.useEffect(() => {
    const layer = labelLayerRef.current;
    if (status !== 'ready' || !layer) return undefined;
    while (layer.firstChild) layer.removeChild(layer.firstChild);

    const els = graph.nodes.map((node) => {
      const el = document.createElement('span');
      el.textContent = displayLabel(node, lang);    // never innerHTML - this is the trader's text
      el.dir = 'auto';
      el.className = 'nv-gx-label';
      layer.appendChild(el);
      return {
        el, node, lower: displayLabel(node, lang).toLowerCase(),
        important: !!ALWAYS_LABELLED[node.kind] || (graph.degree[node.id] || 0) >= 3
      };
    });

    let frame = 0;
    function place() {
      const g = graphRef.current;
      const live = liveRef.current;
      const s = stateRef.current;
      if (g && live) {
        const cam = g.camera().position;
        els.forEach((entry) => {
          const n = live.get(entry.node.id);
          const usable = s.labels && n && Number.isFinite(n.x) && !s.hiddenKinds[entry.node.kind];
          let show = false;
          if (usable) {
            const dx = cam.x - n.x, dy = cam.y - n.y, dz = cam.z - n.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const spotlight = entry.node.id === s.hovered || entry.node.id === s.selected
              || (s.query && entry.lower.indexOf(s.query) > -1);
            show = spotlight || entry.important || dist < LABEL_NEAR;
            if (show) {
              const p = g.graph2ScreenCoords(n.x, n.y, n.z);
              entry.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-135%)';
              entry.el.style.opacity = spotlight ? '1' : Math.max(0.3, Math.min(1, 1.2 - dist / LABEL_FADE)).toFixed(2);
            }
          }
          entry.el.classList.toggle('is-off', !show);
          entry.el.classList.toggle('is-selected', entry.node.id === s.selected);
        });
      }
      frame = window.requestAnimationFrame(place);
    }
    frame = window.requestAnimationFrame(place);
    return () => {
      window.cancelAnimationFrame(frame);
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };
  }, [status, graph, lang]);

  /* ---- motion: the toggle and reduced-motion stop the particles and the camera easing; a hidden
          tab stops the render loop. The loop is NOT paused for the toggle - pausing it would also
          freeze the camera controls, and a paused graph you cannot rotate is a broken graph. ---- */
  React.useEffect(() => {
    function apply() {
      const g = graphRef.current;
      if (!g) return;
      const on = motion && !prefersReducedMotion();
      stateRef.current.cameraMs = on ? 900 : 0;
      g.linkDirectionalParticles(on ? 1 : 0);
      if (document.hidden) g.pauseAnimation(); else g.resumeAnimation();
    }
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [motion, status]);

  /* ---- fly the camera to a selection, wherever the selection came from ---- */
  React.useEffect(() => {
    const g = graphRef.current;
    const live = liveRef.current;
    if (!g || !live || !selectedId || status !== 'ready') return;
    const n = live.get(selectedId);
    if (!n || !Number.isFinite(n.x)) return;
    const distance = 130;
    const r = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
    // A node sitting on the origin has no direction to back away along; look straight at it.
    const position = r < 1e-3
      ? { x: 0, y: 0, z: distance }
      : { x: n.x * (1 + distance / r), y: n.y * (1 + distance / r), z: n.z * (1 + distance / r) };
    g.cameraPosition(position, n, stateRef.current.cameraMs);
  }, [selectedId, status]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return graph.nodes
      .filter((node) => !hidden[node.kind])
      .filter((node) => !q || displayLabel(node, lang).toLowerCase().indexOf(q) > -1)
      .sort((a, b) => (graph.degree[b.id] || 0) - (graph.degree[a.id] || 0));
  }, [graph, query, hidden, lang]);

  /* ---- zoom-to-match, debounced: otherwise every keystroke restarts the camera animation ---- */
  React.useEffect(() => {
    if (!query.trim()) return undefined;
    const timer = window.setTimeout(() => { if (matches[0]) setSelectedId(matches[0].id); }, 320);
    return () => window.clearTimeout(timer);
    // Deliberately keyed on the query alone: matches is recomputed from it.
  }, [query]);

  const visibleLinkCount = graph.links.filter(
    (l) => !hidden[graph.byId[l.source].kind] && !hidden[graph.byId[l.target].kind]
  ).length;

  const connections = selected
    ? graph.links
      .filter((l) => l.source === selected.id || l.target === selected.id)
      .map((l) => ({ link: l, other: graph.byId[l.source === selected.id ? l.target : l.source] }))
    : [];

  const dir = directionFor(lang);
  const showFallback = status === 'no-webgl' || status === 'failed';

  return (
    <div
      ref={rootRef} className="nv-gx" dir={dir} role="dialog" aria-modal="true"
      aria-label={trt(lang, 'graphWorkspaceTitle')} data-status={status}
      onKeyDown={onRootKeyDown}
    >
      {/* toolbar */}
      <div className="nv-gx-toolbar">
        <div className="nv-gx-top">
          <span className="nv-gx-title">{trt(lang, 'graphWorkspaceTitle')}</span>
          <span className="nv-gx-subtitle">
            {profile.name && <span dir="auto" className="nv-gx-profile">{profile.name}</span>}
            {profile.name ? ' · ' : ''}{trt(lang, 'graphSubtitle')}
          </span>
          <button ref={closeRef} type="button" className="nv-gx-close" onClick={onClose} aria-label={trt(lang, 'graphClose')}>
            <Icon name="close" size={14} />
            <span>{trt(lang, 'graphClose')}</span>
          </button>
        </div>

        <div className="nv-gx-controls">
          <div
            className="nv-gx-search"
            onFocus={() => setSearchOpen(true)}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}
          >
            <span className="nv-gx-search-icon"><Icon name="search" size={14} /></span>
            <input
              type="search" value={query} dir="auto" autoComplete="off"
              placeholder={trt(lang, 'graphSearch')} aria-label={trt(lang, 'graphSearch')}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery(''); }
                if (e.key === 'Enter' && matches[0]) { e.preventDefault(); setSelectedId(matches[0].id); setSearchOpen(false); }
              }}
            />
            {query && (
              <button type="button" className="nv-gx-search-clear" aria-label={trt(lang, 'graphSearchClear')} onClick={() => setQuery('')}>×</button>
            )}
            {searchOpen && query.trim() && (
              <div className="nv-gx-results" role="group" aria-label={trt(lang, 'graphSearchResults')}>
                {matches.length === 0 && <span className="nv-gx-results-empty">{trt(lang, 'graphNoMatch')}</span>}
                {matches.slice(0, SEARCH_RESULT_LIMIT).map((node) => (
                  <button
                    key={node.id} type="button" className="nv-gx-result"
                    onClick={() => { setSelectedId(node.id); setSearchOpen(false); }}
                  >
                    <span className="nv-gx-dot" style={{ background: nodeColor(node, byLayer) }} />
                    <span dir="auto" className="nv-gx-result-text">{displayLabel(node, lang)}</span>
                    <span className="nv-gx-result-kind">{kindLabel(lang, node.kind)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="nv-gx-filters">
            {FILTER_KINDS.map((kind) => {
              const on = !hidden[kind];
              const color = byLayer ? LAYERS[NODE_KINDS[kind].layer].color : NODE_KINDS[kind].color;
              return (
                <button
                  key={kind} type="button" aria-pressed={on}
                  className={on ? 'nv-gx-filter is-on' : 'nv-gx-filter'}
                  style={{ '--pill': color }}
                  onClick={() => setHidden((prev) => Object.assign({}, prev, { [kind]: on ? true : undefined }))}
                >{kindLabel(lang, kind)}</button>
              );
            })}
          </div>

          <div className="nv-gx-toggles">
            <ToggleButton on={byLayer} onClick={() => setByLayer((v) => !v)}>{trt(lang, byLayer ? 'graphColorByKind' : 'graphColorByLayer')}</ToggleButton>
            <ToggleButton on={labels} onClick={() => setLabels((v) => !v)}>{trt(lang, 'graphLabels')}</ToggleButton>
            <ToggleButton on={!motion} onClick={() => setMotion((v) => !v)}>{trt(lang, motion ? 'graphPauseMotion' : 'graphResumeMotion')}</ToggleButton>
            <ToggleButton on={false} onClick={() => {
              const g = graphRef.current;
              if (g) g.zoomToFit(stateRef.current.cameraMs ? 600 : 0, 70);
              setSelectedId(null);
            }}>{trt(lang, 'graphResetView')}</ToggleButton>
          </div>
        </div>
      </div>

      {/* body: canvas, overlays and the detail panel */}
      <div className="nv-gx-body">
        <div ref={canvasRef} className="nv-gx-canvas" />
        <div ref={labelLayerRef} className="nv-gx-labels" aria-hidden="true" />

        {/* pointer-following geometry is physical, not logical: it is positioned by translate(x, y) */}
        <div ref={tooltipRef} className={hovered && !selected ? 'nv-gx-tooltip visible' : 'nv-gx-tooltip'} role="status">
          {hovered && (
            <React.Fragment>
              <div dir="auto" className="nv-gx-tooltip-label">{displayLabel(hovered, lang)}</div>
              <div className="nv-gx-tooltip-kind">{kindLabel(lang, hovered.kind)}</div>
              {hovered.description && <div dir="auto" className="nv-gx-tooltip-desc">{hovered.description.length > 140 ? hovered.description.slice(0, 140) + '…' : hovered.description}</div>}
            </React.Fragment>
          )}
        </div>

        <div className="nv-gx-stats">
          {trt(lang, 'graphStats', { n: trDigits(lang, matches.length), m: trDigits(lang, visibleLinkCount) })}
        </div>

        <div className="nv-gx-legend">
          <h3>{trt(lang, byLayer ? 'graphLegendLayers' : 'graphLegendNodes')}</h3>
          {(byLayer ? Object.keys(LAYERS) : FILTER_KINDS).map((key) => (
            <div key={key} className="nv-gx-legend-row">
              <span className="nv-gx-dot" style={{ background: byLayer ? LAYERS[key].color : (key === 'concept' ? CONCEPT_PRIORITY_COLOR.preferred : NODE_KINDS[key].color) }} />
              {byLayer ? layerLabel(lang, key) : kindLabel(lang, key)}
            </div>
          ))}
          {!byLayer && (
            <div className="nv-gx-legend-row is-note">
              <span className="nv-gx-dot" style={{ background: CONCEPT_PRIORITY_COLOR.mandatory }} />
              {trt(lang, 'graphLegendMandatory')}
            </div>
          )}
          <div className="nv-gx-legend-split">
            {byLayer ? (
              <React.Fragment>
                <h3>{trt(lang, 'graphLegendLinks')}</h3>
                {Object.keys(LAYERS).map((key) => (
                  <div key={key} className="nv-gx-legend-row">
                    <span className="nv-gx-line" style={{ background: LAYERS[key].color }} />
                    {layerLabel(lang, key)}
                  </div>
                ))}
              </React.Fragment>
            ) : (
              <div className="nv-gx-legend-row is-note">{trt(lang, 'graphLinkColorHint')}</div>
            )}
          </div>
        </div>

        {/* loading, and the honest fallback when there is no WebGL: the node list still works */}
        {status !== 'ready' && (
          <div className="nv-gx-overlay">
            <div className="nv-gx-overlay-card">
              {status === 'loading' && <span className="nv-gx-spinner" aria-hidden="true" />}
              <span className="nv-gx-overlay-title">
                {trt(lang, status === 'loading' ? 'graphLoading' : status === 'no-webgl' ? 'graphWebglUnavailable' : 'graphLoadFailed')}
              </span>
              {showFallback && <span className="nv-gx-overlay-body">{trt(lang, 'graphFallbackBody')}</span>}
              {showFallback && (
                <div className="nv-gx-nodelist" role="group" aria-label={trt(lang, 'graphNodeList')}>
                  {matches.map((node) => (
                    <button
                      key={node.id} type="button" className="nv-gx-result"
                      aria-current={selectedId === node.id ? 'true' : undefined}
                      onClick={() => setSelectedId(node.id)}
                    >
                      <span className="nv-gx-dot" style={{ background: nodeColor(node, byLayer) }} />
                      <span dir="auto" className="nv-gx-result-text">{displayLabel(node, lang)}</span>
                      <span className="nv-gx-result-kind">{kindLabel(lang, node.kind)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* detail panel: slides in from the inline-end edge, a bottom sheet on phones */}
        <aside className={selected ? 'nv-gx-panel open' : 'nv-gx-panel'} aria-live="polite" aria-hidden={selected ? undefined : 'true'}>
          {selected && (
            <React.Fragment>
              <div className="nv-gx-panel-head">
                <div>
                  <div dir="auto" className="nv-gx-panel-label">{displayLabel(selected, lang)}</div>
                  <div className="nv-gx-panel-type">{kindLabel(lang, selected.kind)}</div>
                </div>
                <button type="button" className="nv-gx-panel-close" aria-label={trt(lang, 'graphClose')} onClick={() => setSelectedId(null)}>×</button>
              </div>
              <div className="nv-gx-panel-body">
                <div className="nv-gx-meta">
                  <Chip tone={selected.activeInEngine ? 'success' : 'neutral'} dot>
                    {trt(lang, selected.activeInEngine ? 'graphActiveYes' : 'graphActiveNo')}
                  </Chip>
                  {selected.priority && (
                    <Chip tone={selected.priority === 'mandatory' ? 'accent' : 'neutral'}>{priorityLabel(lang, selected.priority)}</Chip>
                  )}
                  {selected.origin && <Chip tone="neutral">{trt(lang, 'graphFieldOrigin')}: {originLabel(lang, selected.origin)}</Chip>}
                  {selected.registryId && <Chip tone={selected.resolved ? 'gold' : 'warning'}>{trt(lang, selected.resolved ? 'graphFromRegistry' : 'graphUnresolved')}</Chip>}
                </div>
                {selected.description && <p dir="auto" className="nv-gx-desc">{selected.description}</p>}
                <div className="nv-gx-section">
                  <h3>{trt(lang, 'graphConnections')} ({trDigits(lang, connections.length)})</h3>
                  {connections.map(({ link, other }) => (
                    <div key={link.id} className="nv-gx-conn">
                      <span className="nv-gx-conn-verb">{linkKindLabel(lang, link.kind)}</span>
                      <button type="button" className="nv-gx-conn-node" onClick={() => setSelectedId(other.id)}>
                        <span className="nv-gx-dot" style={{ background: nodeColor(other, byLayer) }} />
                        <span dir="auto">{displayLabel(other, lang)}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="nv-gx-panel-foot">
                {/* Hands editing back to the Concepts tab's own store paths - this view never grows a
                    second concept form or a parallel copy of that state. */}
                <Button variant="secondary" size="sm" icon="list" fullWidth onClick={() => { onClose(); onManageConcepts(); }}>
                  {trt(lang, 'graphManageConcepts')}
                </Button>
              </div>
            </React.Fragment>
          )}
        </aside>
      </div>
    </div>
  );
}

function ToggleButton({ on, onClick, children }) {
  return (
    <button type="button" className={on ? 'nv-gx-toggle is-on' : 'nv-gx-toggle'} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
