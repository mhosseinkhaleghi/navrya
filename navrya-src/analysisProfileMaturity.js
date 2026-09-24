import { summarizeLedger, summarizeSources } from './analysisProfileMemoryProjection.js';

// Analysis Profile "Learning / Knowledge maturity" (ARCHITECTURE.md §7.25) - the pure model behind the Report's maturity panel.
//
// It DESCRIBES how much a profile has been taught and how much of that has been exercised; it does not score the trader or the engine.
// There is deliberately no percentage "maturity score" and no level name: a made-up weighting would look like a measurement. Instead it
// reports plain counts and a short checklist of milestones, each either reached, not reached, or null when the data behind it could not
// be read ("not recorded" - never assumed to be "no").
//
// Inputs are plain data, all already loaded elsewhere:
//   profile   - the canonical Analysis Profile (concepts, understanding)
//   sources   - the knowledge sources list, or null/undefined when it could not be read
//   events    - the learning-ledger events, or null/undefined when they could not be read
//   report    - the object from window.TradeJournalAnalysisProfileUsage.compute() (runs, coverage, resolved scenarios), or null
// The ledger and source classification is the Memory Sync projection's own (summarizeLedger / summarizeSources), so "taught" means the
// same thing in the Memory tab and in the Report.

function list(value) { return Array.isArray(value) ? value : []; }
function count(items, predicate) { let n = 0; items.forEach((item) => { if (predicate(item)) n += 1; }); return n; }

// A concept only reaches the engine while it is enabled (analysis-context.js), so only enabled concepts count as taught knowledge.
export function summarizeConcepts(concepts) {
  const all = list(concepts).filter(Boolean);
  const enabled = all.filter((c) => c.enabled);
  const byPriority = { mandatory: 0, preferred: 0, reference: 0 };
  const byOrigin = { user: 0, ai: 0, source: 0, chat: 0 };
  enabled.forEach((c) => {
    if (byPriority[c.priority] != null) byPriority[c.priority] += 1;
    if (byOrigin[c.origin] != null) byOrigin[c.origin] += 1;
  });
  return { total: all.length, enabled: enabled.length, disabled: all.length - enabled.length, ...byPriority, byOrigin };
}

export const MILESTONES = ['concepts', 'mandatory', 'understanding', 'source', 'lesson', 'analysis', 'coverage', 'resolved'];

export function buildMaturity(input) {
  const o = input || {};
  const profile = o.profile || {};
  const report = o.report || null;
  const concepts = summarizeConcepts(profile.concepts);
  const understanding = profile.understanding || {};
  const sources = summarizeSources(o.sources);
  const lessons = summarizeLedger(o.events);
  const has = Boolean(String(understanding.summary || '').trim());

  // true / false when the answer is known, null when the data behind the question could not be read.
  const known = (available, done) => (available ? done : null);
  const done = {
    concepts: concepts.enabled > 0,
    mandatory: concepts.mandatory > 0,
    understanding: has,
    source: known(sources.available, sources.taught > 0),
    lesson: known(lessons.available, lessons.taught > 0),
    analysis: known(Boolean(report), Boolean(report) && report.analyses.total > 0),
    coverage: known(Boolean(report), Boolean(report) && report.adherence.runsWithCoverage > 0),
    resolved: known(Boolean(report), Boolean(report) && report.scenarios.resolved > 0)
  };
  const milestones = MILESTONES.map((key) => ({ key, done: done[key] }));
  const reached = count(milestones, (m) => m.done === true);
  const unknown = count(milestones, (m) => m.done === null);

  return {
    concepts,
    understanding: { has, version: Number(understanding.version) || 0, updatedAt: understanding.updatedAt || null },
    sources,
    lessons,
    milestones, reached, unknown, of: milestones.length,
    // Known to be untaught: no concepts, no understanding, and a source list AND a ledger that were readable and hold nothing taught. The panel
    // then shows its empty state (and the next step) instead of a wall of zeros. If either could not be read, "nothing taught" is not known,
    // so the panel keeps its figures - with "not recorded" where the data is missing - rather than claim an emptiness it cannot verify.
    untaught: concepts.enabled === 0 && !has && sources.available && sources.taught === 0 && lessons.available && lessons.taught === 0
  };
}
