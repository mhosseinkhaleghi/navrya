import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

// The REAL Style and Focus registries (public/pages/shared/analysis-style-registry.js / analysis-focus-registry.js), evaluated in a
// vm sandbox the way a character page evaluates them - so a test asserts against the product's actual reference data, never a
// hand-written stand-in that could drift from it.

const root = process.cwd();

export async function loadRegistries() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  for (const file of ['analysis-style-registry.js', 'analysis-focus-registry.js']) {
    vm.runInContext(await readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8'), sandbox, { filename: file });
  }
  return { styles: sandbox.window.TradeJournalAnalysisStyleRegistry, focuses: sandbox.window.TradeJournalAnalysisFocusRegistry };
}

// The focus ids the registry offers for a lens (recommended first, then optional) - what a picker would show.
export function offeredFor(registries, primaryStyleId, secondaryStyleIds) {
  const merged = registries.styles.mergeFocusRecommendations(primaryStyleId, secondaryStyleIds || []);
  return Array.from(merged.recommended).concat(Array.from(merged.optional)).filter((id) => registries.focuses.get(id));
}

// Two real styles and a real focus id offered by the first but NOT by the second - the exact situation a lens change creates.
export function findDivergentLenses(registries) {
  const ids = Array.from(registries.styles.list(), (s) => s.id).filter((id) => ['general_analysis', 'hybrid', 'custom_method'].indexOf(id) === -1);
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const offeredB = offeredFor(registries, b, []);
      const only = offeredFor(registries, a, []).filter((id) => offeredB.indexOf(id) === -1);
      if (only.length >= 2) return { a, b, onlyInA: only };
    }
  }
  throw new Error('the registries no longer contain two styles whose focus areas differ');
}
