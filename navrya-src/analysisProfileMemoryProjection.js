import { buildLaidOutGraph, degreeMap, graphInputSignature } from './analysisProfileBrainGraph.js';

// Analysis Profile "Memory Sync" projection (ARCHITECTURE.md §7.25) - the pure model behind the Memory tab's "Sync memory" action.
//
// It is a DERIVED VIEW of what the engine currently knows for one profile, never a second memory: it is computed from
//   - the canonical profile and TradeJournalAnalysisContext.getAnalysisContext(profile.id) - the SAME bundle the Session prompt is
//     built from, so what the graph shows is what the engine reads (only enabled concepts reach it);
//   - the profile's learning ledger (events) and its knowledge-source state, read only to describe them.
// Nothing here reads a store, touches the network, writes anything, calls a model or spends a token; it has no DOM dependency, so
// it is plain data in, data out.
//
// THE APPROVAL BOUNDARY (the point of this module): an uploaded PDF or a link that has not been taught, a raw note saved without
// teaching, and an AI proposal nobody accepted are NOT engine memory yet. They are listed apart as "awaiting teaching / review",
// never as graph nodes and never counted as memory. Content becomes memory only when it goes through applyLearning() (or a manual
// edit) - which changes the profile, and therefore its revision - and the next sync then includes it.
//
// SYNCHRONISATION IDENTITY = the profile revision (analysis-context.js computeProfileRevision: a hash of exactly what reaches the
// model - lens, focus areas, custom focus areas, notes, enabled concepts, understanding). Two syncs with the same revision describe
// the same engine memory; a live revision that differs from the synced one means the projection is STALE.

// Events that mean "this note / correction was actually taught" (so the raw note it came from is no longer awaiting teaching).
const NOTE_TAUGHT_EVENT_KINDS = ['ai_analyzed_note', 'ai_analyzed_correction', 'taught_note', 'taught_correction'];
// Events that mean the engine's memory really changed through the approval funnel.
const TAUGHT_EVENT_KIND = /^taught_/;
const TAUGHT_EXTRA_KINDS = ['concepts_ai_accepted', 'starter_concepts_added'];

export const AWAITING_TEACHING = 'awaiting_teaching';
export const AWAITING_REVIEW = 'awaiting_review';

function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value == null ? '' : value).trim(); }
function tokensOf(usage) { return usage ? (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0) : 0; }

/* -------------------------------------------------------------- revision --- */

// The synchronisation identity. Prefer the context's own revision (the hash the Session cache already keys on); if the context is
// unavailable, fall back to a signature of the same profile fields, so a projection is never left without an identity.
export function revisionOf(profile, context) {
  const fromContext = context && context.profile && context.profile.revision;
  if (fromContext) return String(fromContext);
  return 'sig:' + graphInputSignature(profile);
}

/* ------------------------------------------------------------ the ledger --- */

// What the learning ledger says, as counts. `events` null/undefined means the ledger could not be read: every figure is then null
// ("not recorded"), never a made-up zero.
export function summarizeLedger(events) {
  if (!Array.isArray(events)) return { available: false, total: null, aiAssisted: null, taught: null, tokens: null, lastAt: null };
  let aiAssisted = 0;
  let taught = 0;
  let tokens = 0;
  let lastAt = null;
  events.forEach((event) => {
    if (!event) return;
    const spent = tokensOf(event.tokenUsage);
    if (spent > 0) { aiAssisted += 1; tokens += spent; }
    if (TAUGHT_EVENT_KIND.test(String(event.kind || '')) || TAUGHT_EXTRA_KINDS.indexOf(event.kind) > -1) taught += 1;
    const at = event.createdAt ? new Date(event.createdAt).getTime() : NaN;
    if (Number.isFinite(at) && (lastAt === null || at > lastAt)) lastAt = at;
  });
  return { available: true, total: events.length, aiAssisted, taught, tokens, lastAt: lastAt === null ? null : new Date(lastAt).toISOString() };
}

/* ---------------------------------------------------- knowledge sources --- */

// A source is memory-relevant only once TAUGHT. queued / ready = recorded (and maybe read) but never taught; failed = could not be read.
export function summarizeSources(sources) {
  if (!Array.isArray(sources)) return { available: false, total: null, taught: null, awaiting: null, failed: null, byKind: null };
  const byKind = { pdf: 0, website: 0, youtube: 0 };
  let taught = 0;
  let awaiting = 0;
  let failed = 0;
  sources.forEach((source) => {
    if (!source) return;
    if (byKind[source.kind] != null) byKind[source.kind] += 1;
    if (source.status === 'taught') taught += 1;
    else if (source.status === 'failed') failed += 1;
    else awaiting += 1;
  });
  return { available: true, total: sources.length, taught, awaiting, failed, byKind };
}

/* ----------------------------------------------------- awaiting review --- */

// Everything the trader has put in front of the engine that is NOT memory yet, each with the reason:
//   - a source that was added / read but never taught  -> awaiting_teaching   (a PDF whose file was removed can never be taught: `blocked`)
//   - a note saved "without teaching"                   -> awaiting_teaching   (unless the same text was later taught)
//   - an AI proposal from the teaching chat still `pending`, or one open in a review panel right now -> awaiting_review
export function pendingReview(input) {
  const o = input || {};
  const items = [];

  list(o.sources).forEach((source) => {
    if (!source || source.status === 'taught' || source.status === 'failed') return;
    items.push({
      id: 'source:' + source.id, kind: 'source', sourceKind: source.kind, status: AWAITING_TEACHING,
      title: text(source.title) || text(source.fileName) || text(source.url), blocked: source.kind === 'pdf' && source.fileAvailable === false
    });
  });

  const events = list(o.events);
  const taughtDetails = new Set();
  events.forEach((event) => {
    if (event && NOTE_TAUGHT_EVENT_KINDS.indexOf(event.kind) > -1) taughtDetails.add(text(event.detail || event.title));
  });
  events.forEach((event) => {
    if (!event || event.kind !== 'note') return;
    const body = text(event.detail || event.title);
    if (!body || taughtDetails.has(body)) return;
    items.push({ id: 'note:' + event.id, kind: 'note', status: AWAITING_TEACHING, title: body.slice(0, 80) });
  });

  list(o.messages).forEach((message) => {
    if (!message || message.role !== 'assistant') return;
    list(message.proposals).forEach((proposal) => {
      if (!proposal || proposal.status !== 'pending') return;
      items.push({ id: 'proposal:' + message.id + ':' + proposal.id, kind: 'proposal', status: AWAITING_REVIEW, title: text(proposal.title) || text(proposal.text).slice(0, 80) });
    });
  });

  const reviewing = Number(o.reviewingCount) || 0;
  if (reviewing > 0) items.push({ id: 'proposal:open-review', kind: 'proposal', status: AWAITING_REVIEW, title: '', open: true, count: reviewing });

  return items;
}

/* --------------------------------------------------------- the projection --- */

export function nodeSignature(node) {
  return JSON.stringify([node.kind, node.label, node.description, node.priority || '', node.origin || '', node.version || 0]);
}

/**
 * @param {object} input
 * @param {object} input.profile   the canonical profile, as the store returns it
 * @param {object} [input.context] getAnalysisContext(profile.id) - the engine-visible bundle (enabled concepts only)
 * @param {object[]} [input.events]    the learning ledger, or null when it could not be read
 * @param {object[]} [input.sources]   the knowledge sources, or null when they could not be read
 * @param {object[]} [input.messages]  the teaching-chat messages (for pending proposals), or null
 * @param {number} [input.reviewingCount]  AI proposals open in a review panel right now
 * @param {object} [input.styles] [input.focuses]  the two registries;  [input.lang]
 */
export function buildMemoryProjection(input) {
  const o = input || {};
  const profile = o.profile || null;
  const context = o.context || null;

  // The engine's memory: the graph the existing model builds from the profile, with the context as the authority on which concepts
  // genuinely reached the engine. No context -> the same rule the context itself applies (enabled concepts only).
  const fallbackContext = { concepts: list(profile && profile.concepts).filter((c) => c && c.enabled).map((c) => ({ id: c.id })) };
  const graph = buildLaidOutGraph(profile, { styles: o.styles, focuses: o.focuses, context: context || fallbackContext, lang: o.lang });
  graph.degree = degreeMap(graph.nodes, graph.links);
  graph.byId = graph.nodes.reduce((map, node) => { map[node.id] = node; return map; }, Object.create(null));
  graph.adjacency = graph.nodes.reduce((map, node) => { map[node.id] = Object.create(null); return map; }, Object.create(null));
  graph.links.forEach((link) => { graph.adjacency[link.source][link.target] = true; graph.adjacency[link.target][link.source] = true; });

  const pending = pendingReview(o);
  const concepts = graph.nodes.filter((node) => node.kind === 'concept');
  const understanding = (profile && profile.understanding) || {};

  return {
    profileId: profile ? profile.id : '',
    revision: revisionOf(profile, context),
    graph,
    signatures: graph.nodes.reduce((map, node) => { map[node.id] = nodeSignature(node); return map; }, Object.create(null)),
    engine: {
      lensCount: graph.counts['primary-style'] + graph.counts['secondary-style'],
      focusCount: graph.counts.focus + graph.counts['custom-focus'],
      concepts: {
        enabled: concepts.length,
        mandatory: concepts.filter((n) => n.priority === 'mandatory').length,
        preferred: concepts.filter((n) => n.priority === 'preferred').length,
        reference: concepts.filter((n) => n.priority === 'reference').length
      },
      understanding: { has: Boolean(understanding.summary), version: understanding.version || 0, updatedAt: understanding.updatedAt || null }
    },
    ledger: summarizeLedger(o.events),
    sources: summarizeSources(o.sources),
    pending,
    counts: {
      awaitingTeaching: pending.filter((p) => p.status === AWAITING_TEACHING).length,
      awaitingReview: pending.filter((p) => p.status === AWAITING_REVIEW).length
    }
  };
}

/**
 * Where a (possibly out-of-date) projection stands against the live one. `status` is 'stale' exactly when the profile revision - the
 * synchronisation identity - differs; `changes` says how the engine-visible graph differs, node by node (added = in the live memory but
 * not yet synced, removed = synced but gone from the live memory, changed = same node, different content).
 */
export function compareProjection(synced, live) {
  if (!synced || !live) return { status: 'current', revisionChanged: false, changes: { added: [], removed: [], changed: [] }, nodeStatus: {} };
  const revisionChanged = synced.revision !== live.revision;
  const added = Object.keys(live.signatures).filter((id) => !(id in synced.signatures));
  const removed = Object.keys(synced.signatures).filter((id) => !(id in live.signatures));
  const changed = Object.keys(synced.signatures).filter((id) => id in live.signatures && synced.signatures[id] !== live.signatures[id]);
  const nodeStatus = {};
  Object.keys(synced.signatures).forEach((id) => { nodeStatus[id] = removed.indexOf(id) > -1 || changed.indexOf(id) > -1 ? 'stale' : 'current'; });
  added.forEach((id) => { nodeStatus[id] = 'new'; });
  return { status: revisionChanged ? 'stale' : 'current', revisionChanged, changes: { added, removed, changed }, nodeStatus };
}
