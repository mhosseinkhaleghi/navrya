// Shared fixtures for the two independent normalizers of the Analysis Profile engine-memory
// fields (concepts / understanding, 067_analysis_profile_memory.sql): server/db/
// analysis-profile-normalize.mjs (Node ESM) and its classic-script twin inside
// public/pages/shared/analysis-profile-store.js (loaded via vm by
// tests/analysis-profile-memory-fields.test.mjs). Running the SAME cases against both is what
// keeps them from silently drifting apart.

export const CONCEPT_CASES = [
  {
    name: 'a real, fully-specified concept is kept as-is',
    input: [{ id: 'cpt-1', title: 'Swept liquidity levels', description: 'stops already grabbed above/below a level', priority: 'mandatory', origin: 'user', enabled: true, createdAt: '2026-01-01T00:00:00.000Z' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-1', title: 'Swept liquidity levels', description: 'stops already grabbed above/below a level', priority: 'mandatory', origin: 'user', enabled: true, createdAt: '2026-01-01T00:00:00.000Z' }
  },
  {
    name: 'an AI-suggested concept keeps origin "ai" and defaults priority to "preferred"',
    input: [{ id: 'cpt-2', title: 'Elliott impulse count', origin: 'ai' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-2', title: 'Elliott impulse count', priority: 'preferred', origin: 'ai', enabled: true }
  },
  { name: 'a missing/blank title is dropped', input: [{ id: 'cpt-3', title: '   ' }], expectLength: 0 },
  { name: 'a missing/invalid id is dropped', input: [{ id: '', title: 'Real title' }, { id: 'not valid!', title: 'Also real' }], expectLength: 0 },
  {
    name: 'an unrecognized priority falls back to "preferred"',
    input: [{ id: 'cpt-4', title: 'Something', priority: 'urgent' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-4', title: 'Something', priority: 'preferred' }
  },
  {
    name: 'a built-in starter concept keeps origin "starter" (distinct from "source", which is reserved for external material)',
    input: [{ id: 'cpt-5b', title: 'Impulse wave', origin: 'starter' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-5b', title: 'Impulse wave', origin: 'starter' }
  },
  {
    name: 'an unrecognized origin falls back to "user"',
    input: [{ id: 'cpt-5', title: 'Something else', origin: 'unknown' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-5', title: 'Something else', origin: 'user' }
  },
  {
    name: 'enabled:false is preserved (a disabled concept is not silently re-enabled)',
    input: [{ id: 'cpt-6', title: 'Disabled one', enabled: false }],
    expectLength: 1,
    expectFirst: { id: 'cpt-6', title: 'Disabled one', enabled: false }
  },
  {
    name: 'omitting enabled defaults to true',
    input: [{ id: 'cpt-7', title: 'Enabled by default' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-7', title: 'Enabled by default', enabled: true }
  },
  {
    name: 'a duplicate id is dropped, first occurrence wins',
    input: [{ id: 'cpt-8', title: 'First' }, { id: 'cpt-8', title: 'Second' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-8', title: 'First' }
  },
  {
    name: 'a duplicate title (case/space-insensitive) is dropped even with a different id',
    input: [{ id: 'cpt-9', title: 'Order block mitigation' }, { id: 'cpt-10', title: '  order   block  mitigation ' }],
    expectLength: 1,
    expectFirst: { id: 'cpt-9', title: 'Order block mitigation' }
  },
  {
    name: 'Arabic/Persian keyboard forms of the same title are treated as the same duplicate',
    input: [{ id: 'cpt-11', title: 'شمارش ایلیوت' }, { id: 'cpt-12', title: 'شمارش ايليوت' }],
    expectLength: 1
  },
  { name: 'not an array yields an empty list', input: 'nope', expectLength: 0 },
  { name: 'null yields an empty list', input: null, expectLength: 0 },
  {
    name: 'title/description are truncated to their max lengths, never crash on an oversized value',
    input: [{ id: 'cpt-13', title: 'x'.repeat(500), description: 'y'.repeat(500) }],
    expectLength: 1,
    expectLengths: { title: 100, description: 300 }
  },
  {
    name: 'more than the cap is truncated to the max count, earliest entries kept',
    input: Array.from({ length: 130 }, (_, i) => ({ id: 'cpt-many-' + i, title: 'Concept ' + i })),
    expectLength: 120
  }
];

export const UNDERSTANDING_CASES = [
  {
    name: 'a real understanding document is kept, version/updatedAt preserved',
    input: { summary: 'This trader reads price action first, checks liquidity second.', version: 3, updatedAt: '2026-01-01T00:00:00.000Z' },
    expected: { summary: 'This trader reads price action first, checks liquidity second.', version: 3, updatedAt: '2026-01-01T00:00:00.000Z' }
  },
  { name: 'a negative version is clamped to 0', input: { summary: 'x', version: -5 }, expected: { summary: 'x', version: 0, updatedAt: null } },
  { name: 'a non-numeric version defaults to 0', input: { summary: 'x', version: 'many' }, expected: { summary: 'x', version: 0, updatedAt: null } },
  { name: 'an invalid updatedAt is dropped to null', input: { summary: 'x', version: 1, updatedAt: 'not a date' }, expected: { summary: 'x', version: 1, updatedAt: null } },
  { name: 'a fractional version is truncated', input: { summary: 'x', version: 2.9 }, expected: { summary: 'x', version: 2, updatedAt: null } },
  { name: 'a non-object input never throws and yields the empty document', input: 'nope', expected: { summary: '', version: 0, updatedAt: null } },
  { name: 'null input never throws', input: null, expected: { summary: '', version: 0, updatedAt: null } },
  { name: 'a null summary normalizes to an empty string, never the literal "null"', input: { summary: null, version: 1 }, expected: { summary: '', version: 1, updatedAt: null } }
];

export function oversizedUnderstandingSummary() { return 'z'.repeat(5000); }
