// Shared, backend-agnostic normalization for the Analysis Profile authoring fields added by
// 066_analysis_profile_authoring.sql (customMethodLinks, customFocuses) and the engine-memory
// fields added by 067_analysis_profile_memory.sql (concepts, understanding). Imported by both
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

// ---- engine memory (concepts / understanding, 067_analysis_profile_memory.sql) -----------------
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
