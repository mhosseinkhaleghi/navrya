// Verifiable enforcement of MANDATORY Analysis Profile concepts inside a Session AI analysis
// (ARCHITECTURE.md §7.25, Phase 5). Telling the model to "directly address each mandatory concept"
// (the brief's own instruction) is only a request; this module is what makes it CHECKABLE: the
// response schema gains an additive `conceptCoverage` array, and after the model answers the server
// rebuilds that array so it contains EXACTLY one row per mandatory concept the request carried - in
// the same order, keyed by the request's own concept ids, with a status the model actually chose or
// the honest `unaddressed` when it omitted the concept, garbled its status, or invented one.
//
// Everything here is pure and dependency-free (importable by the DB-free AI gateway, like the brief
// module). Nothing here calls a model.
//
// Deliberately additive and conditional: a request with no mandatory concepts gets the ORIGINAL
// response schema object back untouched (same reference), so a trader who never used this feature
// sees byte-identical provider traffic - this schema has had three prior production incidents.

export const COVERAGE_STATUSES = ['applied', 'not_visible', 'not_applicable'];
export const COVERAGE_UNADDRESSED = 'unaddressed';
// The schema bounds the array so a runaway profile cannot inflate every analysis; the brief still
// lists ALL of a profile's mandatory concepts as instructions, but verifiable coverage covers the
// first COVERAGE_MAX_CONCEPTS of them (a trader with more than 40 mandatory concepts has stopped
// using "mandatory" to mean anything).
export const COVERAGE_MAX_CONCEPTS = 40;
export const COVERAGE_EVIDENCE_MAX = 400;
// Extra output tokens each covered concept can need (title echo + status + evidence sentence) - added
// to the analysis' own output budget so enabling coverage can never be what truncates a response.
export const COVERAGE_TOKENS_PER_CONCEPT = 90;

const CONCEPT_LIMIT = 120;       // same ceiling the brief reads
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function fold(value) {
  return String(value == null ? '' : value).toLowerCase()
    .replace(/[‌‍]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    // Trim BEFORE stripping trailing punctuation: "levels. " must lose its dot, which a `$`-anchored strip cannot
    // reach while the trailing space is still there.
    .replace(/\s+/g, ' ').trim().replace(/[.:;,!?"'»«)]+$/g, '').trim();
}

// The mandatory concepts of a request's profile, as [{ id, title }]. Mirrors the brief's own
// selection (first 120 concepts, priority === 'mandatory', a real title trimmed to 100) so the
// coverage list can never contain a concept the brief did not present as mandatory. A concept with
// no usable id gets a positional one, so coverage rows are always individually addressable.
export function mandatoryConceptsOf(profile) {
  const list = profile && Array.isArray(profile.concepts) ? profile.concepts.slice(0, CONCEPT_LIMIT) : [];
  const out = [];
  list.forEach((concept, index) => {
    if (!concept || concept.priority !== 'mandatory') return;
    const title = typeof concept.title === 'string' ? concept.title.trim().slice(0, 100) : '';
    if (!title) return;
    out.push({ id: typeof concept.id === 'string' && ID_PATTERN.test(concept.id) ? concept.id : `m${index}`, title });
  });
  return out.slice(0, COVERAGE_MAX_CONCEPTS);
}

// The additive response-schema property. Same conventions as the rest of sessionAnalysisFormat:
// every field a concretely-typed, always-required value (no nullable unions), additionalProperties
// false. Gemini's compaction strips enum/maxItems from it exactly as it does everywhere else; the
// sanitizer below re-imposes both, so safety never depends on the provider enforcing them.
export function conceptCoverageSchemaProperty(count) {
  return {
    type: 'array', maxItems: Math.max(1, Math.min(count, COVERAGE_MAX_CONCEPTS)),
    items: {
      type: 'object', additionalProperties: false,
      properties: {
        conceptTitle: { type: 'string' },
        status: { type: 'string', enum: COVERAGE_STATUSES },
        evidence: { type: 'string' }
      },
      required: ['conceptTitle', 'status', 'evidence']
    }
  };
}

// Returns the ORIGINAL format object (same reference) when there is nothing to cover.
export function sessionAnalysisFormatWithCoverage(baseFormat, mandatoryConcepts) {
  if (!mandatoryConcepts || !mandatoryConcepts.length) return baseFormat;
  return {
    ...baseFormat,
    schema: {
      ...baseFormat.schema,
      properties: { ...baseFormat.schema.properties, conceptCoverage: conceptCoverageSchemaProperty(mandatoryConcepts.length) },
      required: [...baseFormat.schema.required, 'conceptCoverage']
    }
  };
}

export function coverageOutputBudget(mandatoryConcepts) {
  return mandatoryConcepts && mandatoryConcepts.length ? Math.min(mandatoryConcepts.length, COVERAGE_MAX_CONCEPTS) * COVERAGE_TOKENS_PER_CONCEPT : 0;
}

// The response-format instruction (the brief carries WHAT to address; this carries HOW to report it).
// It spells out the exact entry keys because Kimi/DeepSeek run in plain json_object mode with no
// schema - for them this sentence is the only description of the array's shape.
export function buildConceptCoverageInstruction(mandatoryConcepts) {
  return [
    'Concept coverage: your JSON response MUST include a `conceptCoverage` array with EXACTLY one entry for each MANDATORY concept listed above, in the same order.',
    'Each entry has three string fields: `conceptTitle` (the concept\'s title copied exactly as listed, without any parenthesized description), `status`, and `evidence`.',
    '`status` is `applied` when you actually addressed the concept in THIS analysis and can name the visible evidence (state it in `evidence`); `not_visible` when the chart does not show what is needed to assess it (say what is missing in `evidence`); `not_applicable` when it does not apply to this chart or timeframe (say why in `evidence`).',
    'Never claim `applied` without visible evidence, never omit a mandatory concept, and never add an entry for a concept that is not in the MANDATORY list.'
  ].join(' ');
}

function matches(rawTitle, concept) {
  const raw = fold(rawTitle);
  const wanted = fold(concept.title);
  if (!raw || !wanted) return false;
  return raw === wanted || raw.startsWith(wanted + ' (') || raw.startsWith(wanted + ' - ');
}

// Rebuilds the coverage from what the model returned. Output: one row per mandatory concept, in the
// request's order, `{ conceptId, title, status, evidence }`. A concept the model omitted, listed
// under an unrecognisable title, or gave a status outside the enum for is `unaddressed` - the honest
// "the engine did not verify this", never silently promoted to applied. Rows the model added for
// concepts that are NOT mandatory are dropped. Each returned entry can satisfy at most one concept.
export function sanitizeConceptCoverage(raw, mandatoryConcepts) {
  const returned = Array.isArray(raw) ? raw.filter((entry) => entry && typeof entry === 'object') : [];
  const used = new Set();
  return (mandatoryConcepts || []).map((concept) => {
    const index = returned.findIndex((entry, i) => !used.has(i) && matches(entry.conceptTitle, concept));
    if (index < 0) return { conceptId: concept.id, title: concept.title, status: COVERAGE_UNADDRESSED, evidence: '' };
    used.add(index);
    const entry = returned[index];
    const status = COVERAGE_STATUSES.includes(entry.status) ? entry.status : COVERAGE_UNADDRESSED;
    // Only real text counts as evidence - an object/number would otherwise be stringified into junk like "[object Object]".
    const evidence = typeof entry.evidence === 'string' ? entry.evidence.replace(/\s+/g, ' ').trim().slice(0, COVERAGE_EVIDENCE_MAX) : '';
    return { conceptId: concept.id, title: concept.title, status, evidence };
  });
}

// Counts for the Report tab and the ledger: how many mandatory concepts were verifiably handled.
export function summarizeCoverage(rows) {
  const summary = { total: 0, applied: 0, notVisible: 0, notApplicable: 0, unaddressed: 0 };
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    summary.total += 1;
    if (row.status === 'applied') summary.applied += 1;
    else if (row.status === 'not_visible') summary.notVisible += 1;
    else if (row.status === 'not_applicable') summary.notApplicable += 1;
    else summary.unaddressed += 1;
  });
  return summary;
}

// The compact, durable form the completions ledger stores (ids + statuses only - the evidence prose
// lives on the analysis result itself, not in an analytics table).
export function coverageForLedger(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ conceptId: String(row.conceptId), status: String(row.status) })).slice(0, COVERAGE_MAX_CONCEPTS);
}
