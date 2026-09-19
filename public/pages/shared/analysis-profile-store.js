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
    AnalysisProfileError: AnalysisProfileError,
    // Pure authoring helpers the wizard/inline editor share so validation never forks per screen.
    helpers: {
      normalizeHttpUrl: normalizeHttpUrl,
      isYoutubeUrl: isYoutubeUrl,
      normalizeCustomMethodLinks: normalizeCustomMethodLinks,
      normalizeCustomFocuses: normalizeCustomFocuses,
      makeCustomFocus: makeCustomFocus,
      foldFocusName: foldFocusName,
      LIMITS: { customFocusMax: CUSTOM_FOCUS_MAX, customFocusNameMax: CUSTOM_FOCUS_NAME_MAX, customFocusDescriptionMax: CUSTOM_FOCUS_DESCRIPTION_MAX }
    }
  };
}());
