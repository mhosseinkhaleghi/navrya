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

  // Union of the primary style's own requiredInputs plus every secondary style's, de-duplicated -
  // a future consumer can compare this against what a Session actually has attached (e.g. "your
  // profile requires Order Flow data, but this Session only contains a standard candlestick
  // screenshot", brief §10) without duplicating that requirement-merging logic itself.
  function mergedRequiredInputs(primary, secondaries) {
    var seen = {}, out = [];
    (primary ? primary.requiredInputs || [] : []).forEach(function (input) { if (!seen[input]) { seen[input] = true; out.push(input); } });
    secondaries.forEach(function (style) {
      (style.requiredInputs || []).forEach(function (input) { if (!seen[input]) { seen[input] = true; out.push(input); } });
    });
    return out;
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
        registryVersion: profile.registryVersion
      },
      primaryStyle: primaryStyle,
      secondaryStyles: secondaryStyles,
      focuses: focuses,
      customMethodNotes: profile.customMethodNotes,
      requiredInputs: mergedRequiredInputs(primaryStyle, secondaryStyles),
      // analysisPrinciples/futurePromptGuidance are carried through unmodified from the registry
      // definitions above (primaryStyle.analysisPrinciples, primaryStyle.futurePromptGuidance,
      // etc.) - this function does not duplicate or rewrite them, only assembles the bundle.
      generatedAt: new Date().toISOString()
    };
  }

  window.TradeJournalAnalysisContext = { getAnalysisContext: getAnalysisContext };
}());
