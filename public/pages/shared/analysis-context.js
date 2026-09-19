/**
 * Analysis Context — the one documented future-AI boundary for the Analysis Profiles domain
 * (see ARCHITECTURE.md §7.25, brief §28/§35.14).
 *
 * `window.TradeJournalAnalysisContext.getAnalysisContext(profileId)` composes a normalized,
 * read-only bundle describing a user's analytical lens: the profile itself, its resolved primary
 * and secondary style definitions, its resolved focus definitions, and each style's declared
 * input requirements. This is pure data assembly over the Analysis Profile Store and the two
 * registries - nothing in this file calls an LLM, builds a prompt, chooses a provider, generates a
 * scenario, or scores a pattern. A future Session AI Analysis feature is the intended caller.
 *
 * IMPORTANT non-goal boundary, restated here on purpose: no AI "freedom/strictness/creativity"
 * preference is read, stored, or defaulted anywhere in this file or the rest of this domain. That
 * belongs to a future per-analysis-request feature (selected when a user presses "Generate AI
 * Analysis" inside a Session), never to the Analysis Profile itself.
 */
(function () {
  'use strict';

  function profileStore() { return window.TradeJournalAnalysisProfileStore; }
  function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }
  function focusRegistry() { return window.TradeJournalAnalysisFocusRegistry; }

  function resolveStyle(id) {
    var styles = styleRegistry();
    return styles ? styles.get(id) : null;
  }
  function resolveFocus(id) {
    var focuses = focusRegistry();
    return focuses ? focuses.get(id) : null;
  }

  // Union of the primary style's own requiredInputs, every secondary style's, and every selected
  // Focus's own requiredInputs (Session / Analysis Desk AI upgrade, section 4: "Read required
  // inputs from the existing analysis style/focus registry" - the Focus Registry declares real
  // requirements too, e.g. poc/value_area -> structured_volume_profile, delta/absorption ->
  // visible_orderflow_chart), de-duplicated. A future/present consumer (the Session AI Analysis
  // indicator preflight) compares this against what a Session actually has attached without
  // duplicating this requirement-merging logic itself.
  function mergedRequiredInputs(primary, secondaries, focuses) {
    var seen = {}, out = [];
    (primary ? primary.requiredInputs || [] : []).forEach(function (input) { if (!seen[input]) { seen[input] = true; out.push(input); } });
    secondaries.forEach(function (style) {
      (style.requiredInputs || []).forEach(function (input) { if (!seen[input]) { seen[input] = true; out.push(input); } });
    });
    (focuses || []).forEach(function (focus) {
      (focus.requiredInputs || []).forEach(function (input) { if (!seen[input]) { seen[input] = true; out.push(input); } });
    });
    return out;
  }

  // Deterministic content hash of everything about a profile that reaches the model. Session
  // analysis folds it into its cache fingerprint (session-analysis-client.js), because the style
  // registry's own VERSION - what `registryVersion` carries - never changes when a trader edits
  // their profile: without this, re-analyzing an unchanged chart after editing the profile's focus
  // areas would silently return the OLD cached analysis with zero model calls.
  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stableStringify(value[key]); }).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  }
  function hashString(text) {
    var hash = 0x811c9dc5; // FNV-1a, 32-bit
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    return hash.toString(36);
  }
  function computeProfileRevision(profile) {
    return hashString(stableStringify({
      primary: profile.primaryStyleId || '',
      secondary: profile.secondaryStyleIds || [],
      focuses: profile.focusIds || [],
      customFocuses: (profile.customFocuses || []).map(function (focus) { return [focus.id, focus.name, focus.description]; }),
      notes: profile.customMethodNotes || '',
      // Engine memory (Phase 2): a disabled concept is excluded, matching what enabledConcepts()
      // below actually sends to the model - toggling one on/off must invalidate the cache exactly
      // like adding/removing one does.
      concepts: (profile.concepts || []).filter(function (c) { return c.enabled; }).map(function (c) { return [c.id, c.title, c.description, c.priority]; }),
      understanding: (profile.understanding && profile.understanding.summary) || ''
    }));
  }

  // Only concepts the trader has left enabled ever reach the model - a disabled one keeps its
  // history/origin in the store but is excluded here, same convention as customFocuses/focusIds.
  function enabledConcepts(profile) {
    return (profile.concepts || []).filter(function (c) { return c.enabled; })
      .map(function (c) { return { id: c.id, title: c.title, description: c.description, priority: c.priority }; });
  }

  function getAnalysisContext(profileId) {
    var store = profileStore();
    var profile = store ? store.get(profileId) : null;
    if (!profile) return null;

    var primaryStyle = resolveStyle(profile.primaryStyleId);
    var secondaryStyles = (profile.secondaryStyleIds || []).map(resolveStyle).filter(Boolean);
    var focuses = (profile.focusIds || []).map(resolveFocus).filter(Boolean);

    return {
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        isDefault: profile.isDefault,
        registryVersion: profile.registryVersion,
        revision: computeProfileRevision(profile)
      },
      primaryStyle: primaryStyle,
      secondaryStyles: secondaryStyles,
      focuses: focuses,
      // The trader's own (or accepted-AI) focus areas - their own wording, no registry entry.
      customFocuses: (profile.customFocuses || []).map(function (focus) { return { name: focus.name, description: focus.description }; }),
      customMethodNotes: profile.customMethodNotes,
      // Engine memory (Phase 2): specific, checkable things this trader has taught the engine to
      // look for under this profile - see analysis-profile-normalize.mjs's own header for what
      // `priority` means (never AI freedom/strictness, which stays a per-request choice).
      concepts: enabledConcepts(profile),
      understanding: profile.understanding ? profile.understanding.summary : '',
      requiredInputs: mergedRequiredInputs(primaryStyle, secondaryStyles, focuses),
      // analysisPrinciples/futurePromptGuidance are carried through unmodified from the registry
      // definitions above (primaryStyle.analysisPrinciples, primaryStyle.futurePromptGuidance,
      // etc.) - this function does not duplicate or rewrite them, only assembles the bundle.
      generatedAt: new Date().toISOString()
    };
  }

  window.TradeJournalAnalysisContext = { getAnalysisContext: getAnalysisContext };
}());
