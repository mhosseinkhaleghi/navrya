// Shared, backend-agnostic normalization for the Analysis Profile authoring fields added by
// 068_analysis_profile_authoring.sql (customMethodLinks, customFocuses) and the engine-memory
// fields added by 069_analysis_profile_memory.sql (concepts, understanding). Imported by both
// repo.pg.mjs and repo.memory.mjs so the two backends can never disagree about what a stored
// profile looks like - the same shared-pure-module precedent as support-ticket-normalize.mjs and
// learned-command-normalize.mjs. The browser store (public/pages/shared/analysis-profile-store.js)
// carries its own classic-script copy of the same rules; tests/analysis-profile-authoring-fields
// .test.mjs and tests/analysis-profile-memory-fields.test.mjs run both against one shared fixture
// set so the two implementations cannot drift apart.
//
// Never throws: a profile save must not fail because one optional link/concept is malformed.
// Anything that does not validate is dropped to its empty value, exactly like the client store.

export const CUSTOM_LINK_KEYS = ['youtubeUrl', 'websiteUrl', 'referenceUrl'];
export const CUSTOM_LINK_MAX_LENGTH = 2048;
export const CUSTOM_FOCUS_MAX = 30;
export const CUSTOM_FOCUS_NAME_MAX = 80;
export const CUSTOM_FOCUS_DESCRIPTION_MAX = 240;
const CUSTOM_FOCUS_ORIGINS = ['user', 'ai'];
const CUSTOM_FOCUS_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const YOUTUBE_HOST_PATTERN = /^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/;

// A public web URL a trader typed or pasted: http/https only, a real dotted host, no embedded
// credentials. Returns the canonical href, or '' when the value is not one. This validates SHAPE
// only - whether a host is safe to actually fetch (private ranges, redirects, ...) is the source
// reader's own SSRF guard, never assumed from a stored value.
export function normalizeHttpUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > CUSTOM_LINK_MAX_LENGTH) return '';
  let url;
  try { url = new URL(text); } catch (_) { return ''; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password) return '';
  if (!url.hostname || url.hostname.indexOf('.') < 0) return '';
  return url.href;
}

export function isYoutubeUrl(value) {
  const href = normalizeHttpUrl(value);
  if (!href) return false;
  return YOUTUBE_HOST_PATTERN.test(new URL(href).hostname.toLowerCase());
}

export function normalizeCustomMethodLinks(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  CUSTOM_LINK_KEYS.forEach((key) => {
    const href = normalizeHttpUrl(source[key]);
    out[key] = key === 'youtubeUrl' ? (href && isYoutubeUrl(href) ? href : '') : href;
  });
  return out;
}

// Case/space/ZWNJ-insensitive key used to drop duplicates (custom focuses AND concepts) - the
// stored text keeps whatever the trader/model actually wrote.
export function foldFocusName(name) {
  return String(name == null ? '' : name).toLowerCase()
    .replace(/[‌‍]/g, '')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ').trim();
}

// A trader-defined (or AI-suggested and accepted) focus area. Deliberately a SEPARATE list from the
// registry-validated `focusIds`: a custom focus has no registry entry to validate against, so mixing
// them would either weaken the registry check or drop every custom focus on normalize.
export function normalizeCustomFocuses(value, now = () => new Date().toISOString()) {
  const list = Array.isArray(value) ? value : [];
  const seenIds = new Set();
  const seenNames = new Set();
  const out = [];
  for (const item of list) {
    if (out.length >= CUSTOM_FOCUS_MAX) break;
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = String(item.name == null ? '' : item.name).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_FOCUS_NAME_MAX);
    if (!CUSTOM_FOCUS_ID_PATTERN.test(id) || !name) continue;
    const nameKey = foldFocusName(name);
    if (seenIds.has(id) || seenNames.has(nameKey)) continue;
    seenIds.add(id);
    seenNames.add(nameKey);
    const createdAt = typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : now();
    out.push({
      id, name,
      description: String(item.description == null ? '' : item.description).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_FOCUS_DESCRIPTION_MAX),
      origin: CUSTOM_FOCUS_ORIGINS.includes(item.origin) ? item.origin : 'user',
      createdAt
    });
  }
  return out;
}

// ---- engine memory (concepts / understanding, 069_analysis_profile_memory.sql) -----------------
//
// A Concept is a specific, checkable thing the engine should look for when reading a chart under
// this profile - "Elliott impulse count", "swept liquidity levels", "order block mitigation".
// `priority` is the honesty lever ARCHITECTURE.md's Analysis Profile boundary always insisted on
// keeping separate from AI freedom/strictness: 'mandatory' means the trader wants this specifically
// addressed in every chart analysis under this profile; 'preferred'/'reference' are lighter-weight
// signals, never forced. `origin` records where a concept came from (a real audit trail, not
// decoration) - 'source' is reserved for a future Phase 3 (website/YouTube/PDF ingestion), 'chat'
// for a future Phase 4 teaching conversation; both are accepted here now so those phases need no
// further schema change. 'starter' marks a concept seeded from the built-in style registry's own
// coreConcepts ("Add starter concepts") - deliberately NOT 'source', so a report can always tell
// "built in" apart from "the trader taught this" or "came from their own material".
export const CONCEPT_MAX = 120;
export const CONCEPT_TITLE_MAX = 100;
export const CONCEPT_DESCRIPTION_MAX = 300;
export const CONCEPT_PRIORITIES = ['mandatory', 'preferred', 'reference'];
export const CONCEPT_ORIGINS = ['user', 'ai', 'source', 'chat', 'starter'];
const CONCEPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeConcepts(value, now = () => new Date().toISOString()) {
  const list = Array.isArray(value) ? value : [];
  const seenIds = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const item of list) {
    if (out.length >= CONCEPT_MAX) break;
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = String(item.title == null ? '' : item.title).replace(/\s+/g, ' ').trim().slice(0, CONCEPT_TITLE_MAX);
    if (!CONCEPT_ID_PATTERN.test(id) || !title) continue;
    const titleKey = foldFocusName(title);
    if (seenIds.has(id) || seenTitles.has(titleKey)) continue;
    seenIds.add(id);
    seenTitles.add(titleKey);
    const createdAt = typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : now();
    out.push({
      id, title,
      description: String(item.description == null ? '' : item.description).replace(/\s+/g, ' ').trim().slice(0, CONCEPT_DESCRIPTION_MAX),
      priority: CONCEPT_PRIORITIES.includes(item.priority) ? item.priority : 'preferred',
      origin: CONCEPT_ORIGINS.includes(item.origin) ? item.origin : 'user',
      // Disabling a concept keeps its history/origin without deleting it - it simply stops
      // reaching the engine brief and the mandatory-coverage check.
      enabled: item.enabled !== false,
      createdAt
    });
  }
  return out;
}

export const UNDERSTANDING_SUMMARY_MAX = 4000;

// The engine's own compact, evolving "what I currently understand about how this trader reads a
// chart under this profile" - a free-text summary a learning event (Phase 2's /ingest) proposes
// and the trader approves, or the trader edits directly. `version` bumps on every real change so
// the Memory tab can show a real history and the profile's content revision (analysis-context.js)
// can tell an edited understanding apart from an unedited one.
export function normalizeUnderstanding(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const version = Number.isFinite(Number(source.version)) ? Math.max(0, Math.trunc(Number(source.version))) : 0;
  const updatedAt = typeof source.updatedAt === 'string' && !Number.isNaN(Date.parse(source.updatedAt)) ? source.updatedAt : null;
  return {
    summary: String(source.summary == null ? '' : source.summary).trim().slice(0, UNDERSTANDING_SUMMARY_MAX),
    version, updatedAt
  };
}

// ---- knowledge sources (070_analysis_profile_sources.sql) ---------------------------------------

export const SOURCE_KINDS = ['youtube', 'website', 'pdf'];
export const SOURCE_STATUSES = ['queued', 'ready', 'taught', 'failed'];
export const SOURCE_TITLE_MAX = 200;
export const SOURCE_DIGEST_MAX = 8000;
export const SOURCES_PER_PROFILE_MAX = 40;
const SOURCE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;

// Validates the fields a trader/the reader may set on a source. Returns the clean fields, or null
// when the input cannot describe a source at all (unknown kind, a URL kind without a valid URL, a
// YouTube source whose URL is not YouTube) - the caller turns null into a 400. A `partial` call
// (PATCH) only returns keys that were actually supplied AND valid, so an omitted field is never
// silently reset to its default. The digest is capped here even though the reader already caps it:
// this is the last stop before the database and never trusts the caller.
export function sanitizeSourceFields(input, { partial = false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);

  if (!partial || has('kind')) {
    if (!SOURCE_KINDS.includes(source.kind)) return null;
    out.kind = source.kind;
  }
  if (!partial || has('url')) {
    const href = normalizeHttpUrl(source.url);
    // A stored PDF has no URL; every other kind must carry a real one.
    if (!href && (partial ? has('url') && source.url : out.kind !== 'pdf')) return null;
    out.url = out.kind === 'pdf' ? '' : href;
  }
  if (out.kind === 'youtube' && !isYoutubeUrl(out.url)) return null;
  if (out.kind === 'website' && isYoutubeUrl(out.url)) return null; // a YouTube link is a youtube source, never a scraped web page

  if (!partial || has('title')) out.title = String(source.title == null ? '' : source.title).replace(/\s+/g, ' ').trim().slice(0, SOURCE_TITLE_MAX);
  if (!partial || has('digest')) out.digest = String(source.digest == null ? '' : source.digest).trim().slice(0, SOURCE_DIGEST_MAX);
  if (has('status')) {
    if (!SOURCE_STATUSES.includes(source.status)) return null;
    out.status = source.status;
  } else if (!partial) {
    out.status = 'queued';
  }
  if (!partial || has('errorCode')) {
    const code = String(source.errorCode == null ? '' : source.errorCode).trim();
    out.errorCode = SOURCE_ERROR_CODE_PATTERN.test(code) ? code : '';
  }
  if (has('taughtUnderstandingVersion')) {
    const version = Number(source.taughtUnderstandingVersion);
    if (Number.isFinite(version) && version >= 0) out.taughtUnderstandingVersion = Math.trunc(version);
  }
  return out;
}

// ---- teaching chat (071_analysis_profile_messages.sql) -----------------------------------------------

export const MESSAGE_ROLES = ['user', 'assistant'];
export const MESSAGE_CONTENT_MAX = 8000;
export const MESSAGES_PER_PROFILE_MAX = 200;
export const MESSAGE_BATCH_MAX = 2;
export const PROPOSAL_KINDS = ['concept', 'understanding'];
export const PROPOSAL_STATUSES = ['pending', 'applied', 'dismissed'];
export const PROPOSALS_PER_MESSAGE_MAX = 8;
const PROPOSAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// What the engine PROPOSED to learn from one chat turn. Each proposal is either a concept
// ({ title, description, priority }) or a rewritten understanding ({ text }), with a status that only
// ever moves pending -> applied | dismissed. Never throws; anything malformed is dropped.
export function normalizeMessageProposals(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    if (out.length >= PROPOSALS_PER_MESSAGE_MAX) break;
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' && PROPOSAL_ID_PATTERN.test(item.id) ? item.id : '';
    if (!id || seen.has(id)) continue;
    const status = PROPOSAL_STATUSES.includes(item.status) ? item.status : 'pending';
    if (item.kind === 'concept') {
      const title = String(item.title == null ? '' : item.title).replace(/\s+/g, ' ').trim().slice(0, CONCEPT_TITLE_MAX);
      if (!title) continue;
      seen.add(id);
      out.push({
        id, kind: 'concept', title,
        description: String(item.description == null ? '' : item.description).replace(/\s+/g, ' ').trim().slice(0, CONCEPT_DESCRIPTION_MAX),
        priority: CONCEPT_PRIORITIES.includes(item.priority) ? item.priority : 'preferred', status
      });
    } else if (item.kind === 'understanding') {
      const text = String(item.text == null ? '' : item.text).trim().slice(0, UNDERSTANDING_SUMMARY_MAX);
      if (!text) continue;
      seen.add(id);
      out.push({ id, kind: 'understanding', text, status });
    }
  }
  return out;
}

// Only the two numbers the history and the ledger actually use, as non-negative whole numbers - or
// null. Never trusts a client-supplied object to carry anything else into the database.
export function normalizeTokenUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const whole = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.trunc(Number(n)) : 0);
  const promptTokens = whole(value.promptTokens);
  const completionTokens = whole(value.completionTokens);
  return promptTokens || completionTokens ? { promptTokens, completionTokens } : null;
}

// Validates one chat message. Returns { role, content, proposals, tokenUsage } or null when it cannot
// describe a message (unknown role, or nothing to say). A user message must have text and never carries
// proposals or usage; an assistant message needs text or at least one proposal.
export function sanitizeMessageFields(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (!MESSAGE_ROLES.includes(source.role)) return null;
  const content = String(source.content == null ? '' : source.content).trim().slice(0, MESSAGE_CONTENT_MAX);
  if (source.role === 'user') return content ? { role: 'user', content, proposals: [], tokenUsage: null } : null;
  const proposals = normalizeMessageProposals(source.proposals);
  if (!content && !proposals.length) return null;
  return { role: 'assistant', content, proposals, tokenUsage: normalizeTokenUsage(source.tokenUsage) };
}

// Applies { [proposalId]: 'applied' | 'dismissed' } to a message's proposals. A proposal can only be
// resolved once (pending -> applied|dismissed): an already-resolved one is left alone, so a stale or
// repeated request can never flip an applied proposal back or apply it twice. Returns null when the
// statuses object is not usable at all.
export function mergeProposalStatuses(proposals, statuses) {
  if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) return null;
  const changes = Object.entries(statuses).filter(([, status]) => status === 'applied' || status === 'dismissed');
  if (!changes.length) return null;
  const lookup = Object.fromEntries(changes);
  return (Array.isArray(proposals) ? proposals : []).map((proposal) => (
    proposal.status === 'pending' && Object.prototype.hasOwnProperty.call(lookup, proposal.id) ? { ...proposal, status: lookup[proposal.id] } : proposal
  ));
}

// ---- completions-ledger attribution (072_session_analysis_profile_attribution.sql) ---------------------

export const COMPLETION_COVERAGE_STATUSES = ['applied', 'not_visible', 'not_applicable', 'unaddressed'];
const COMPLETION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const COMPLETION_MARKET_SESSIONS = ['London', 'New York', 'Tokyo', 'Sydney'];

// Normalizes the attribution facts recorded on one AI Session Analysis completion. A FORMAT check only -
// that the profile id really belongs to the verified user is the internal route's job (it needs the
// repository), and the market session is the server's own clock, never a client label. Never throws:
// anything unusable becomes null / '' rather than failing a completion that already happened.
export function sanitizeCompletionAttribution(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const id = typeof source.analysisProfileId === 'string' && COMPLETION_ID_PATTERN.test(source.analysisProfileId) ? source.analysisProfileId : null;
  const coverage = Array.isArray(source.conceptCoverage)
    ? source.conceptCoverage
      .filter((row) => row && typeof row === 'object' && COMPLETION_ID_PATTERN.test(String(row.conceptId || '')) && COMPLETION_COVERAGE_STATUSES.includes(row.status))
      .slice(0, 40).map((row) => ({ conceptId: String(row.conceptId), status: row.status }))
    : null;
  return {
    analysisProfileId: id,
    // A revision only means something alongside a profile id.
    analysisProfileRevision: id ? String(source.analysisProfileRevision == null ? '' : source.analysisProfileRevision).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40) : '',
    activeMarketSession: COMPLETION_MARKET_SESSIONS.includes(source.activeMarketSession) ? source.activeMarketSession : '',
    conceptCoverage: coverage && coverage.length ? coverage : null
  };
}
