/**
 * Analysis Profile Store — Analysis Profiles domain (see ARCHITECTURE.md §7.25).
 *
 * `window.TradeJournalAnalysisProfileStore` - the same server-replica.js-backed, classic-script
 * `window.TradeJournal...` convention every sibling domain (Patterns, Strategy Education) already
 * uses (see that file's own header). No localStorage, no IndexedDB, no offline outbox - reads are
 * synchronous against the in-memory replica, writes apply optimistically then push in the
 * background with rollback-on-failure (server-replica.js's own contract).
 *
 * Every public mutation funnels through `save()` (create/update/duplicate/setDefault all build a
 * value and call it) or `remove()` - the same "single mutation funnel" convention
 * mental-health-store.js's `write()` already established, so there is exactly one place that
 * enforces "exactly one default profile" and dispatches the domain's change event.
 */
(function () {
  'use strict';

  var DOMAIN = 'analysisProfiles';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }
  function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }
  function focusRegistry() { return window.TradeJournalAnalysisFocusRegistry; }

  function uid(prefix) { return (prefix || 'analysis-profile') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }

  // ---- authoring fields (customMethodLinks / customFocuses) --------------------------------------
  // Classic-script twin of server/db/analysis-profile-normalize.mjs - the server re-normalizes on
  // every write, so these only need to agree with it, and tests/analysis-profile-authoring-fields
  // .test.mjs runs both against one fixture set to keep them from drifting. Never throws: an
  // optional link that does not validate is dropped to '' rather than failing a profile save.
  var LINK_KEYS = ['youtubeUrl', 'websiteUrl', 'referenceUrl'];
  var LINK_MAX_LENGTH = 2048;
  var CUSTOM_FOCUS_MAX = 30, CUSTOM_FOCUS_NAME_MAX = 80, CUSTOM_FOCUS_DESCRIPTION_MAX = 240;
  var CUSTOM_FOCUS_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  var YOUTUBE_HOST_PATTERN = /^(www\.|m\.|music\.)?youtube\.com$|^youtu\.be$/;

  function normalizeHttpUrl(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > LINK_MAX_LENGTH) return '';
    var url;
    try { url = new URL(text); } catch (_) { return ''; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (!url.hostname || url.hostname.indexOf('.') < 0) return '';
    return url.href;
  }
  function isYoutubeUrl(value) {
    var href = normalizeHttpUrl(value);
    return Boolean(href) && YOUTUBE_HOST_PATTERN.test(new URL(href).hostname.toLowerCase());
  }
  function normalizeCustomMethodLinks(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var out = {};
    LINK_KEYS.forEach(function (key) {
      var href = normalizeHttpUrl(source[key]);
      out[key] = key === 'youtubeUrl' ? (href && isYoutubeUrl(href) ? href : '') : href;
    });
    return out;
  }
  function foldFocusName(name) {
    return String(name == null ? '' : name).toLowerCase()
      .replace(/[‌‍]/g, '')
      .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
      .replace(/\s+/g, ' ').trim();
  }
  function normalizeCustomFocuses(value) {
    var list = Array.isArray(value) ? value : [];
    var seenIds = {}, seenNames = {}, out = [];
    for (var i = 0; i < list.length && out.length < CUSTOM_FOCUS_MAX; i += 1) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;
      var id = typeof item.id === 'string' ? item.id.trim() : '';
      var name = String(item.name == null ? '' : item.name).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_FOCUS_NAME_MAX);
      if (!CUSTOM_FOCUS_ID_PATTERN.test(id) || !name) continue;
      var nameKey = foldFocusName(name);
      if (seenIds[id] || seenNames[nameKey]) continue;
      seenIds[id] = true; seenNames[nameKey] = true;
      out.push({
        id: id, name: name,
        description: String(item.description == null ? '' : item.description).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_FOCUS_DESCRIPTION_MAX),
        origin: item.origin === 'ai' ? 'ai' : 'user',
        createdAt: typeof item.createdAt === 'string' && !isNaN(Date.parse(item.createdAt)) ? item.createdAt : now()
      });
    }
    return out;
  }
  // A brand-new custom focus with a fresh stable id - what the wizard's "+ Add your own" and an
  // accepted AI suggestion both create. Returns null for an empty name.
  function makeCustomFocus(seed) {
    var value = seed || {};
    var made = normalizeCustomFocuses([{ id: uid('cf'), name: value.name, description: value.description, origin: value.origin, createdAt: now() }]);
    return made[0] || null;
  }

  // ---- engine memory (concepts / understanding) -------------------------------------------------
  // Classic-script twin of server/db/analysis-profile-normalize.mjs's own concept/understanding
  // rules - tests/analysis-profile-memory-fields.test.mjs runs both against one fixture set.
  var CONCEPT_MAX = 120, CONCEPT_TITLE_MAX = 100, CONCEPT_DESCRIPTION_MAX = 300;
  var CONCEPT_PRIORITIES = ['mandatory', 'preferred', 'reference'];
  var CONCEPT_ORIGINS = ['user', 'ai', 'source', 'chat', 'starter'];
  var CONCEPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
  var UNDERSTANDING_SUMMARY_MAX = 4000;

  function normalizeConcepts(value) {
    var list = Array.isArray(value) ? value : [];
    var seenIds = {}, seenTitles = {}, out = [];
    for (var i = 0; i < list.length && out.length < CONCEPT_MAX; i += 1) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;
      var id = typeof item.id === 'string' ? item.id.trim() : '';
      var title = String(item.title == null ? '' : item.title).replace(/\s+/g, ' ').trim().slice(0, CONCEPT_TITLE_MAX);
      if (!CONCEPT_ID_PATTERN.test(id) || !title) continue;
      var titleKey = foldFocusName(title);
      if (seenIds[id] || seenTitles[titleKey]) continue;
      seenIds[id] = true; seenTitles[titleKey] = true;
      out.push({
        id: id, title: title,
        description: String(item.description == null ? '' : item.description).replace(/\s+/g, ' ').trim().slice(0, CONCEPT_DESCRIPTION_MAX),
        priority: CONCEPT_PRIORITIES.indexOf(item.priority) > -1 ? item.priority : 'preferred',
        origin: CONCEPT_ORIGINS.indexOf(item.origin) > -1 ? item.origin : 'user',
        enabled: item.enabled !== false,
        createdAt: typeof item.createdAt === 'string' && !isNaN(Date.parse(item.createdAt)) ? item.createdAt : now()
      });
    }
    return out;
  }
  function normalizeUnderstanding(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var version = isFinite(Number(source.version)) ? Math.max(0, Math.trunc(Number(source.version))) : 0;
    var updatedAt = typeof source.updatedAt === 'string' && !isNaN(Date.parse(source.updatedAt)) ? source.updatedAt : null;
    return { summary: String(source.summary == null ? '' : source.summary).trim().slice(0, UNDERSTANDING_SUMMARY_MAX), version: version, updatedAt: updatedAt };
  }
  // A brand-new concept with a fresh stable id - what the Concepts tab's manual add, "Add starter
  // concepts", and an accepted AI suggestion all create. Returns null for an empty title.
  function makeConcept(seed) {
    var value = seed || {};
    var made = normalizeConcepts([{ id: uid('cpt'), title: value.title, description: value.description, priority: value.priority, origin: value.origin, enabled: true, createdAt: now() }]);
    return made[0] || null;
  }

  function empty(seed) {
    var stamp = now(), value = seed || {};
    return {
      id: value.id || uid('analysis-profile'),
      userId: value.userId || '',
      name: String(value.name || ''),
      description: String(value.description || ''),
      primaryStyleId: value.primaryStyleId || 'general_analysis',
      secondaryStyleIds: Array.isArray(value.secondaryStyleIds) ? value.secondaryStyleIds : [],
      focusIds: Array.isArray(value.focusIds) ? value.focusIds : [],
      customMethodNotes: String(value.customMethodNotes || ''),
      customMethodLinks: normalizeCustomMethodLinks(value.customMethodLinks),
      customFocuses: normalizeCustomFocuses(value.customFocuses),
      concepts: normalizeConcepts(value.concepts),
      understanding: normalizeUnderstanding(value.understanding),
      isDefault: Boolean(value.isDefault),
      isActive: value.isActive !== false,
      registryVersion: Number.isFinite(Number(value.registryVersion)) ? Number(value.registryVersion) : ((styleRegistry() && styleRegistry().VERSION) || 1),
      createdAt: stamp,
      updatedAt: stamp
    };
  }

  // Never silently invents an id: an invalid primaryStyleId falls back to the real
  // 'general_analysis' registry entry (a legitimate catalog style, not an invented one);
  // secondaryStyleIds/focusIds are filtered down to ids that actually resolve, duplicates and a
  // secondary equal to the primary are dropped, and secondaries are capped at 2 (§2/§20 of the
  // brief - Hybrid supports up to two additional styles).
  function normalize(value) {
    var source = value && typeof value === 'object' ? value : {};
    var base = empty(source);
    Object.assign(base, source);
    base.id = source.id ? String(source.id) : base.id;
    base.name = String(source.name || '');
    base.description = String(source.description || '');
    base.customMethodNotes = String(source.customMethodNotes || '');
    base.customMethodLinks = normalizeCustomMethodLinks(source.customMethodLinks);
    base.customFocuses = normalizeCustomFocuses(source.customFocuses);
    base.concepts = normalizeConcepts(source.concepts);
    base.understanding = normalizeUnderstanding(source.understanding);
    base.isDefault = Boolean(source.isDefault);
    base.isActive = source.isActive !== false;

    var styles = styleRegistry();
    base.primaryStyleId = (styles && styles.isValidStyleId(source.primaryStyleId)) ? source.primaryStyleId : 'general_analysis';

    var secondary = Array.isArray(source.secondaryStyleIds) ? source.secondaryStyleIds : [];
    var seenStyle = {};
    base.secondaryStyleIds = secondary
      .filter(function (id) { return styles && styles.isValidStyleId(id) && id !== base.primaryStyleId; })
      .filter(function (id) { if (seenStyle[id]) return false; seenStyle[id] = true; return true; })
      .slice(0, 2);

    var focuses = focusRegistry();
    var focusIds = Array.isArray(source.focusIds) ? source.focusIds : [];
    var seenFocus = {};
    base.focusIds = focusIds
      .filter(function (id) { return focuses && focuses.isValidFocusId(id); })
      .filter(function (id) { if (seenFocus[id]) return false; seenFocus[id] = true; return true; });

    base.registryVersion = Number.isFinite(Number(source.registryVersion)) ? Number(source.registryVersion) : ((styles && styles.VERSION) || 1);
    base.createdAt = source.createdAt || base.createdAt;
    base.updatedAt = source.updatedAt || base.createdAt;
    return base;
  }

  function read() {
    var domain = replica();
    return domain ? domain.list().map(normalize) : [];
  }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/analysis-profiles',
      writeUrl: '/api/sync/analysis-profiles',
      deleteUrlFor: function (id) { return '/api/sync/analysis-profiles/' + encodeURIComponent(id); },
      extractList: function (body) { return body.analysisProfiles || []; }
    });
    replica().hydrate();
  }());

  function listSync() { return read().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }); }
  function list() { return listSync(); }
  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }
  function get(id) { return find(id); }
  function getDefault() { var all = listSync(); return all.find(function (item) { return item.isDefault; }) || all[0] || null; }

  function notifyChanged() {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tradejournal:analysis-profiles-changed'));
    }
  }

  // The one real mutation funnel every public write below goes through - enforces "exactly one
  // default profile" (unsetting any other profile that was previously the default, best-effort,
  // same optimistic-apply-then-background-write pattern as the value being saved itself) and
  // dispatches the domain's change event exactly once per real mutation.
  function save(value) {
    var record = normalize(value);
    record.updatedAt = now();
    if (record.isDefault) {
      listSync().forEach(function (other) {
        if (other.id !== record.id && other.isDefault) {
          var cleared = normalize(Object.assign({}, other, { isDefault: false }));
          if (replica()) replica().upsert(cleared).catch(function () {});
        }
      });
    }
    if (replica()) replica().upsert(record).catch(function () {});
    notifyChanged();
    return record;
  }

  // ---- engine-memory learning ledger (append-only, lazily fetched per profile) --------------------
  // NOT a server-replica list domain (never part of the boot-time hydrate) - nested under its
  // owning profile, fetched only when a profile's Memory tab actually opens. Plain fetch() is
  // enough here: csrf-fetch-patch.js already attaches the CSRF header to every same-origin,
  // state-changing call, the same way it does for server-replica.js's own writes.
  function eventsUrl(profileId) { return '/api/sync/analysis-profiles/' + encodeURIComponent(profileId) + '/events'; }
  async function listEvents(profileId) {
    var response = await fetch(eventsUrl(profileId));
    if (!response.ok) return [];
    var body = await response.json().catch(function () { return {}; });
    return body.events || [];
  }
  // Every ledger write is tracked while in flight so a screen that just triggered one (a teach
  // action, an accepted suggestion) can wait for it to LAND before re-reading the history - the
  // write itself stays fire-and-forget for the caller that does not care.
  var inflightEvents = [];
  function recordEvent(profileId, event) {
    var pending = (async function () {
      var response = await fetch(eventsUrl(profileId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event || {}) });
      if (!response.ok) throw new Error('ANALYSIS_PROFILE_EVENT_FAILED');
      return response.json();
    }());
    var settled = pending.catch(function () { return null; });
    inflightEvents.push(settled);
    settled.then(function () { inflightEvents = inflightEvents.filter(function (item) { return item !== settled; }); });
    return pending;
  }
  // Resolves (never rejects) once every ledger write started so far has finished, success or not.
  function settleEvents() { return Promise.all(inflightEvents.slice()).then(function () {}); }

  // A plain diary entry: zero tokens, no concept/understanding change, no profile save at all - the
  // "Save without teaching" action. Best-effort like every ledger write (resolves null on any
  // failure, an empty note, or an unknown profile).
  function recordNote(profileId, text) {
    var clean = String(text == null ? '' : text).trim();
    var existing = find(profileId);
    if (!clean || !existing) return Promise.resolve(null);
    return recordEvent(profileId, {
      kind: 'note', title: clean.slice(0, 80), detail: clean,
      understandingVersion: existing.understanding.version, tokenUsage: null
    }).catch(function () { return null; });
  }

  // The ONE mutation funnel every "teach the engine" action goes through - a manually added
  // concept, "Add starter concepts", an accepted AI concept/understanding suggestion (Phase 2's
  // /ingest), a source ingested (Phase 3), or a chat lesson (Phase 4) all call this rather than
  // hand-rolling their own concepts/understanding merge. `conceptsToAdd` is deduplicated against
  // what the profile already has by folded title (never a second, silently-differently-worded
  // copy of the same concept); `understandingSummary`, when it genuinely differs from the current
  // one, bumps `understanding.version` - the profile's own single source of "has learning actually
  // happened here" the Memory tab's version timeline reads. Exactly ONE save() (never per-concept),
  // then ONE best-effort learning-ledger event - a lost event never blocks the real save that
  // already succeeded.
  function applyLearning(id, patch) {
    var existing = find(id);
    if (!existing) return null;
    var value = patch || {};
    var concepts = existing.concepts.slice();
    (Array.isArray(value.conceptsToAdd) ? value.conceptsToAdd : []).forEach(function (proposed) {
      var made = makeConcept(proposed);
      if (!made) return;
      var already = concepts.some(function (c) { return foldFocusName(c.title) === foldFocusName(made.title); });
      if (!already) concepts.push(made);
    });
    var understanding = existing.understanding;
    var proposedSummary = typeof value.understandingSummary === 'string' ? value.understandingSummary.trim() : '';
    if (proposedSummary && proposedSummary !== existing.understanding.summary) {
      understanding = { summary: proposedSummary.slice(0, UNDERSTANDING_SUMMARY_MAX), version: existing.understanding.version + 1, updatedAt: now() };
    }
    var saved = save(Object.assign({}, existing, { id: id, concepts: concepts, understanding: understanding }));
    recordEvent(id, {
      kind: value.eventKind || 'learning_applied',
      title: value.eventTitle || '',
      detail: value.eventDetail || '',
      understandingVersion: understanding.version,
      tokenUsage: value.tokenUsage || null
    }).catch(function () { /* best-effort - the real save above already succeeded */ });
    return saved;
  }

  function create(seed) {
    var draft = empty(seed || {});
    // The very first profile a user ever creates always becomes their default - never leaves a
    // brand-new account with zero default profiles (§2/§27 of the brief).
    if (!listSync().length) draft.isDefault = true;
    return save(draft);
  }

  function update(id, patch) {
    var existing = find(id);
    if (!existing) return null;
    return save(Object.assign({}, existing, patch || {}, { id: id }));
  }

  function duplicate(id) {
    var existing = find(id);
    if (!existing) return null;
    var copy = Object.assign({}, existing, {
      id: uid('analysis-profile'),
      name: existing.name ? existing.name + ' (copy)' : '',
      isDefault: false
    });
    delete copy.createdAt;
    return save(copy);
  }

  function setDefault(id) {
    var existing = find(id);
    if (!existing) return null;
    return save(Object.assign({}, existing, { isDefault: true }));
  }

  // Thrown (not returned) so the UI's own try/catch shows a clear, translated message rather
  // than silently no-op'ing - matches this file's "never leave the user with an invalid default
  // state" requirement (§27 of the brief) without inventing a bespoke result-object convention.
  function AnalysisProfileError(code) { this.name = 'AnalysisProfileError'; this.code = code; this.message = code; }
  AnalysisProfileError.prototype = Object.create(Error.prototype);

  // Deletion safety (§27): never leaves a user with zero profiles or an invalid default state,
  // and clears (never dangles) any Strategy that pointed at this profile - mirrors
  // strategy-education-store.js's own orphanLinkedTrades() exactly, looked up live so load order
  // between the two stores never matters.
  async function remove(id) {
    var all = listSync();
    var existing = all.find(function (item) { return item.id === id; });
    if (!existing) return;
    if (all.length <= 1) throw new AnalysisProfileError('ANALYSIS_PROFILE_LAST_REMAINING');

    if (existing.isDefault) {
      var remaining = all.filter(function (item) { return item.id !== id; });
      remaining.sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
      var next = remaining[0];
      if (next) save(Object.assign({}, next, { isDefault: true }));
    }

    if (replica()) await replica().remove(id);
    orphanLinkedStrategies(id);
    notifyChanged();
  }

  function orphanLinkedStrategies(profileId) {
    var strategyStore = window.TradeJournalStrategyEducationStore;
    if (!strategyStore) return;
    try {
      strategyStore.listSync().forEach(function (strategy) {
        if (strategy && strategy.linkedAnalysisProfileId === profileId) {
          strategyStore.save(Object.assign({}, strategy, { linkedAnalysisProfileId: null }));
        }
      });
    } catch (_) { /* Preserve profile deletion even if strategy data is malformed. */ }
  }

  // Auto-generated default name (§21): "<Primary style> — <Focus> & <Focus>", falls back to just
  // the style name if there are no focuses yet. Never regenerated once a user has typed their own
  // name - callers only invoke this while a name field is still empty.
  function suggestedName(primaryStyleId, focusIds, lang) {
    var styles = styleRegistry(), focuses = focusRegistry();
    var style = styles ? styles.get(primaryStyleId) : null;
    var styleName = style ? (style.name[lang] || style.name.en) : '';
    var focusNames = (focusIds || []).slice(0, 2).map(function (id) {
      var focus = focuses ? focuses.get(id) : null;
      return focus ? (focus.name[lang] || focus.name.en) : null;
    }).filter(Boolean);
    if (!styleName) return '';
    if (!focusNames.length) return styleName;
    return styleName + ' — ' + focusNames.join(' & ');
  }

  // The future-Session-ready snapshot (§16 of the brief) - a normalized, self-contained record of
  // the analytical lens as it exists right now, safe to embed in a future Session record so a
  // later edit to the live Profile never rewrites history. Resolves style/focus names as full
  // {fa,ar,en,es} maps (not one picked language) since a Session may be viewed in any language
  // later - see analysis-profile.types.js's own note on this.
  function snapshot(id) {
    var profile = find(id);
    if (!profile) return null;
    var styles = styleRegistry(), focuses = focusRegistry();
    var primary = styles ? styles.get(profile.primaryStyleId) : null;
    return {
      profileId: profile.id,
      profileName: profile.name,
      primaryStyle: primary ? { id: primary.id, name: primary.name, registryVersion: primary.version } : null,
      secondaryStyles: (profile.secondaryStyleIds || []).map(function (sid) {
        var style = styles ? styles.get(sid) : null;
        return style ? { id: style.id, name: style.name, registryVersion: style.version } : null;
      }).filter(Boolean),
      focuses: (profile.focusIds || []).map(function (fid) {
        var focus = focuses ? focuses.get(fid) : null;
        return focus ? { id: focus.id, name: focus.name } : null;
      }).filter(Boolean),
      // A custom focus has no registry entry to resolve a localized name from - it is the trader's
      // own wording, captured verbatim.
      customFocuses: (profile.customFocuses || []).map(function (focus) { return { id: focus.id, name: focus.name, description: focus.description }; }),
      customMethodNotes: profile.customMethodNotes,
      customMethodLinks: normalizeCustomMethodLinks(profile.customMethodLinks),
      // Only ENABLED concepts - a disabled one is deliberately excluded from what the engine
      // sees, so a snapshot must honor that too, never silently including it.
      concepts: (profile.concepts || []).filter(function (c) { return c.enabled; }).map(function (c) { return { id: c.id, title: c.title, description: c.description, priority: c.priority }; }),
      understanding: normalizeUnderstanding(profile.understanding),
      capturedAt: now()
    };
  }

  window.TradeJournalAnalysisProfileStore = {
    list: list,
    listSync: listSync,
    get: get,
    find: find,
    create: create,
    update: update,
    save: save,
    remove: remove,
    duplicate: duplicate,
    setDefault: setDefault,
    getDefault: getDefault,
    snapshot: snapshot,
    suggestedName: suggestedName,
    applyLearning: applyLearning,
    recordNote: recordNote,
    recordEvent: recordEvent,
    settleEvents: settleEvents,
    listEvents: listEvents,
    AnalysisProfileError: AnalysisProfileError,
    // Pure authoring helpers the wizard/inline editor share so validation never forks per screen.
    helpers: {
      normalizeHttpUrl: normalizeHttpUrl,
      isYoutubeUrl: isYoutubeUrl,
      normalizeCustomMethodLinks: normalizeCustomMethodLinks,
      normalizeCustomFocuses: normalizeCustomFocuses,
      makeCustomFocus: makeCustomFocus,
      normalizeConcepts: normalizeConcepts,
      normalizeUnderstanding: normalizeUnderstanding,
      makeConcept: makeConcept,
      foldFocusName: foldFocusName,
      LIMITS: {
        customFocusMax: CUSTOM_FOCUS_MAX, customFocusNameMax: CUSTOM_FOCUS_NAME_MAX, customFocusDescriptionMax: CUSTOM_FOCUS_DESCRIPTION_MAX,
        conceptMax: CONCEPT_MAX, conceptTitleMax: CONCEPT_TITLE_MAX, conceptDescriptionMax: CONCEPT_DESCRIPTION_MAX
      }
    }
  };
}());
