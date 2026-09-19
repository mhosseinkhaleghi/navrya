// Shared fixture profiles for tests/analysis-profile-brief.test.mjs (the real server module) and
// tests/analysis-profile-brief-browser-twin.test.mjs (server module vs. the classic-script browser
// twin, public/pages/shared/analysis-profile-brief.js) - one list, run against both, so the two
// implementations can never quietly drift apart.

const style = (id, extra) => ({ id, name: { en: id.toUpperCase() }, coreConcepts: ['c1'], analysisPrinciples: ['p1'], limitations: ['l1'], futurePromptGuidance: ['g1'], ...extra });

export const BRIEF_FIXTURES = [
  { name: 'full profile', profile: {
    primaryStyle: style('smc'), secondaryStyles: [style('wyckoff'), style('elliott_wave')],
    focuses: [{ id: 'trend', name: { en: 'Trend' } }, { id: 'key_levels', name: { en: 'Key levels' } }],
    customFocuses: [{ name: 'Session opens', description: 'where Asia/London open' }, { name: 'News gaps' }],
    customMethodNotes: 'I trade the London sweep.',
    concepts: [
      { title: 'Swept liquidity levels', description: 'stops already taken', priority: 'mandatory' },
      { title: 'Order block mitigation', priority: 'preferred' },
      { title: 'Weekly open', priority: 'reference' }
    ],
    understanding: 'Confirms breakouts only after a sweep.', requiredInputs: ['ohlc_chart', 'volume']
  } },
  { name: 'no primary style', profile: { primaryStyle: null, concepts: [{ title: 'x', priority: 'mandatory' }] } },
  { name: 'null profile', profile: null },
  { name: 'empty object', profile: {} },
  { name: 'primary style only, no name.en (falls back to first value)', profile: { primaryStyle: { id: 'x', name: { fa: 'فارسی' } } } },
  { name: 'malformed secondary/custom-focus/concept entries', profile: {
    primaryStyle: style('smc'), secondaryStyles: [null, {}, { id: '' }], focuses: [],
    customFocuses: [null, 7, { name: '   ' }, { name: 'ok' }],
    concepts: [null, 'x', { title: '' }, { title: 'kept', priority: 'mandatory' }],
    understanding: '   '
  } },
  { name: 'oversized fields are capped the same way on both sides', profile: {
    primaryStyle: style('smc'),
    customFocuses: Array.from({ length: 50 }, (_, i) => ({ name: 'focus-' + i })),
    concepts: Array.from({ length: 200 }, (_, i) => ({ title: 'concept-' + i, priority: i < 130 ? 'mandatory' : 'preferred' })),
    understanding: 'u'.repeat(9000)
  } },
  { name: 'only mandatory concepts, no other/understanding/requiredInputs', profile: {
    primaryStyle: style('price_action'), concepts: [{ title: 'Break of structure', priority: 'mandatory' }]
  } },
  { name: 'a style entry with an id but no name falls back to the id itself', profile: { primaryStyle: { id: 'general_analysis' } } }
];
