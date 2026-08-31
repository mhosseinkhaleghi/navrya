/**
 * Analysis Profile domain typedefs (see ARCHITECTURE.md §7.25). JSDoc-only reference file, same
 * convention as `pattern-registry.types.js` - the real shape lives in `analysis-profile-store.js`'s
 * `normalize()`, this file only documents it.
 *
 * An AnalysisProfile describes HOW a user reads a chart (their analytical lens/style + focus
 * areas). It is intentionally NOT: a Strategy (execution/risk rules - `strategy-education.types.js`),
 * a Pattern (a registered recognizable structure - `pattern-registry.types.js`), a Scenario
 * (a hypothesis about what happens next - lives inside a Session), or an AI generation request
 * (model choice / freedom-strictness preference - deliberately not modeled anywhere in this
 * domain; that belongs to a future per-analysis-request feature, see `analysis-context.js`'s
 * header comment).
 *
 * @typedef {Object} AnalysisProfile
 * @property {string} id
 * @property {string} userId
 * @property {string} name
 * @property {string} description
 * @property {string} primaryStyleId            - a valid id from analysis-style-registry.js
 * @property {string[]} secondaryStyleIds        - up to 2 for a Hybrid profile, else []
 * @property {string[]} focusIds                 - ids from analysis-focus-registry.js
 * @property {string} customMethodNotes          - user-authored explanation (Custom Method / free notes)
 * @property {boolean} isDefault                 - exactly one true per user, enforced by the store
 * @property {boolean} isActive                  - archived (false) profiles are hidden, never auto-deleted
 * @property {number} registryVersion            - style/focus registry version this profile was built against
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * A normalized, historical-snapshot view of one AnalysisProfile - see
 * `AnalysisProfileStore.snapshot(id)`. Captures the analytical lens as it existed at a point in
 * time, the same "snapshot philosophy" this codebase already uses for Pattern data attached to a
 * historical Scenario (§16 of the brief). Intentionally excludes isDefault/isActive/userId - those
 * are mutable account-state fields, not part of the analytical lens itself.
 *
 * `name` fields below store the full {fa,ar,en,es} localized map, not one picked language - a
 * Session referencing this snapshot may later be viewed in any of the four languages, so
 * capturing a single language at snapshot time would be lossy.
 *
 * @typedef {Object} AnalysisProfileSnapshot
 * @property {string} profileId
 * @property {string} profileName
 * @property {{id:string, name:Object<string,string>, registryVersion:number}} primaryStyle
 * @property {{id:string, name:Object<string,string>, registryVersion:number}[]} secondaryStyles
 * @property {{id:string, name:Object<string,string>}[]} focuses
 * @property {string} customMethodNotes
 * @property {string} capturedAt
 */
(function () {
  window.TradeJournalAnalysisProfileTypes = Object.freeze({
    AnalysisProfile: 'AnalysisProfile',
    AnalysisProfileSnapshot: 'AnalysisProfileSnapshot',
    // A4-style process-registry allowlist for future AI-assisted field edits, matching
    // pattern-registry.types.js's own patternStagePaths convention. Not wired to anything yet -
    // reserved here so a future integration doesn't need to touch this typedef file again.
    analysisProfilePaths: ['name', 'description', 'primaryStyleId', 'secondaryStyleIds', 'focusIds', 'customMethodNotes']
  });
}());
