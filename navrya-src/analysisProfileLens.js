// Lens / focus reconciliation for Analysis Profiles (ARCHITECTURE.md §7.25) - ONE pure function every surface that edits
// or shows a profile's lens goes through: the first-run rite, the create/edit wizard, the inline Setup tab, the profile
// detail's Analysis DNA and the DNA preview. Before this each surface kept its own idea of "which focus areas belong to
// this lens": changing the primary lens left it in the secondary list, and a focus area that only fit the OLD lens stayed
// selected (and saved) after its chip had disappeared from the picker - a hidden focus the trader could not see or undo.
//
// The rules (registry-driven, never a second list):
//   - the primary lens is never also a secondary lens; special styles (general / hybrid / custom method) are never
//     secondary; unknown ids are dropped; at most two secondary lenses; a custom-method profile has none
//   - the focus areas offered are the registry's own mergeFocusRecommendations(primary, secondaries) - recommended first,
//     then optional; a custom method offers every registry focus area
//   - a selected registry focus that is not offered is STALE: it is removed from the selection (never left hidden) and
//     reported, so the UI can say what was removed before anything is saved
//   - custom focus areas (the trader's own wording) are not registry ids and are never touched here

export const SPECIAL_STYLE_IDS = ['general_analysis', 'hybrid', 'custom_method'];
export const MAX_SECONDARY_LENSES = 2;

function ids(value) { return Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id) : []; }
function unique(list) { return list.filter((id, index) => list.indexOf(id) === index); }

/**
 * @param {object} input
 * @param {object} input.styles   the Style Registry (needs .get(id) and .mergeFocusRecommendations())
 * @param {object} input.focuses  the Focus Registry (needs .get(id) and .list())
 * @param {string} input.primaryStyleId
 * @param {string[]} input.secondaryStyleIds
 * @param {string[]} input.focusIds   the CURRENT selection, possibly containing stale registry ids
 * @returns {{primaryStyleId: string, secondaryStyleIds: string[], removedSecondaryIds: string[],
 *            groups: {recommended: object[], optional: object[]}, offeredFocusIds: string[],
 *            focusIds: string[], staleFocusIds: string[]}}
 */
export function reconcileLens(input) {
  const o = input || {};
  const styles = o.styles || null;
  const focuses = o.focuses || null;
  const primaryStyleId = typeof o.primaryStyleId === 'string' ? o.primaryStyleId : '';
  const isCustom = primaryStyleId === 'custom_method';

  const requestedSecondary = unique(ids(o.secondaryStyleIds));
  const secondaryStyleIds = [];
  const removedSecondaryIds = [];
  requestedSecondary.forEach((id) => {
    const valid = Boolean(primaryStyleId) && !isCustom && id !== primaryStyleId && SPECIAL_STYLE_IDS.indexOf(id) === -1
      && Boolean(styles && styles.get(id)) && secondaryStyleIds.length < MAX_SECONDARY_LENSES;
    if (valid) secondaryStyleIds.push(id); else removedSecondaryIds.push(id);
  });

  // The offered focus areas, as definitions (what a picker renders) and as ids (what a selection is checked against).
  let recommended = [];
  let optional = [];
  if (primaryStyleId && focuses) {
    if (isCustom) {
      optional = Array.from(focuses.list());
    } else if (styles) {
      const merged = styles.mergeFocusRecommendations(primaryStyleId, secondaryStyleIds);
      recommended = Array.from(merged.recommended, (id) => focuses.get(id)).filter(Boolean);
      optional = Array.from(merged.optional, (id) => focuses.get(id)).filter(Boolean);
    }
  }
  const offeredFocusIds = recommended.concat(optional).map((focus) => focus.id);

  const selected = unique(ids(o.focusIds));
  const focusIds = selected.filter((id) => offeredFocusIds.indexOf(id) > -1);
  const staleFocusIds = selected.filter((id) => offeredFocusIds.indexOf(id) === -1);

  return { primaryStyleId, secondaryStyleIds, removedSecondaryIds, groups: { recommended, optional }, offeredFocusIds, focusIds, staleFocusIds };
}

// A lens change as one pure step: what the primary / secondary lenses become, what the focus selection becomes, and which
// focus areas that removed (so the UI can name them). `change` is any of { primaryStyleId, secondaryStyleIds, focusIds }; whatever
// it omits keeps its current value. (`focusIds` covers an assistant filling the selection: it too is held to what the lens offers.)
export function applyLensChange(registries, current, change) {
  const c = current || {};
  const next = {
    primaryStyleId: change && 'primaryStyleId' in change ? change.primaryStyleId : c.primaryStyleId,
    secondaryStyleIds: change && 'secondaryStyleIds' in change ? change.secondaryStyleIds : c.secondaryStyleIds,
    focusIds: change && 'focusIds' in change ? change.focusIds : c.focusIds
  };
  const reconciled = reconcileLens({ styles: registries && registries.styles, focuses: registries && registries.focuses, ...next });
  return { ...reconciled, removedFocusIds: reconciled.staleFocusIds };
}

// The secondary list after the trader toggles one lens chip: the same rule the chips already followed (a second click removes it,
// a third selection is refused), kept here so every surface toggles identically.
export function toggleSecondaryLens(current, id) {
  const list = ids(current);
  if (list.indexOf(id) > -1) return list.filter((sid) => sid !== id);
  if (list.length >= MAX_SECONDARY_LENSES) return list;
  return list.concat(id);
}

// Display names for a set of registry focus ids ("Order blocks, Liquidity pools"), in the trader's language.
export function focusNames(focuses, focusIds, lang) {
  return ids(focusIds).map((id) => {
    const definition = focuses ? focuses.get(id) : null;
    return definition && definition.name ? (definition.name[lang] || definition.name.en || id) : id;
  });
}

// Shorthand for a stored profile: the focus areas that actually belong to its lens, and the ones that no longer do.
export function lensOfProfile(registries, profile) {
  const p = profile || {};
  return reconcileLens({
    styles: registries && registries.styles, focuses: registries && registries.focuses,
    primaryStyleId: p.primaryStyleId, secondaryStyleIds: p.secondaryStyleIds, focusIds: p.focusIds
  });
}
