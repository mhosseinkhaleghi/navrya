// Shared, backend-agnostic normalization for the Analysis Profile authoring fields added by
// 066_analysis_profile_authoring.sql (customMethodLinks, customFocuses). Imported by both
// repo.pg.mjs and repo.memory.mjs so the two backends can never disagree about what a stored
// profile looks like - the same shared-pure-module precedent as support-ticket-normalize.mjs and
// learned-command-normalize.mjs. The browser store (public/pages/shared/analysis-profile-store.js)
// carries its own classic-script copy of the same rules; tests/analysis-profile-authoring-fields
// .test.mjs runs both against one fixture set so the two implementations cannot drift apart.
//
// Never throws: a profile save must not fail because one optional link is malformed. Anything that
// does not validate is dropped to its empty value, exactly like the client store does.

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

// Case/space/ZWNJ-insensitive key used only to drop duplicate custom focuses - the stored `name`
// keeps whatever the trader typed.
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
