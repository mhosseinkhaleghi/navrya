// Shared fixtures for the two independent normalizers of the Analysis Profile authoring fields
// (customMethodLinks / customFocuses): server/db/analysis-profile-normalize.mjs (Node ESM, used by
// both repo.pg.mjs and repo.memory.mjs) and its classic-script twin inside
// public/pages/shared/analysis-profile-store.js (loaded via vm by
// tests/analysis-profile-authoring-fields.test.mjs). Running the SAME cases against both is what
// keeps them from silently drifting apart over time.

export const CUSTOM_METHOD_LINKS_CASES = [
  {
    name: 'every link valid',
    input: { youtubeUrl: 'https://www.youtube.com/watch?v=abc123', websiteUrl: 'https://school.example.com/lesson', referenceUrl: 'http://notes.example.com/x' },
    expected: { youtubeUrl: 'https://www.youtube.com/watch?v=abc123', websiteUrl: 'https://school.example.com/lesson', referenceUrl: 'http://notes.example.com/x' }
  },
  {
    name: 'youtu.be short link is a valid YouTube URL',
    input: { youtubeUrl: 'https://youtu.be/abc123' },
    expected: { youtubeUrl: 'https://youtu.be/abc123', websiteUrl: '', referenceUrl: '' }
  },
  {
    name: 'a non-YouTube URL in youtubeUrl is dropped, never silently reclassified',
    input: { youtubeUrl: 'https://example.com/video' },
    expected: { youtubeUrl: '', websiteUrl: '', referenceUrl: '' }
  },
  {
    name: 'ftp/javascript/relative values are all dropped',
    input: { websiteUrl: 'javascript:alert(1)', referenceUrl: 'ftp://example.com/file', youtubeUrl: '/relative/path' },
    expected: { youtubeUrl: '', websiteUrl: '', referenceUrl: '' }
  },
  {
    name: 'a URL carrying embedded credentials is dropped',
    input: { websiteUrl: 'https://user:pass@example.com/' },
    expected: { youtubeUrl: '', websiteUrl: '', referenceUrl: '' }
  },
  { name: 'empty object yields every field empty', input: {}, expected: { youtubeUrl: '', websiteUrl: '', referenceUrl: '' } },
  { name: 'non-object input never throws', input: 'not-an-object', expected: { youtubeUrl: '', websiteUrl: '', referenceUrl: '' } },
  { name: 'null input never throws', input: null, expected: { youtubeUrl: '', websiteUrl: '', referenceUrl: '' } },
  {
    name: 'an unrelated extra key is dropped, not carried through',
    input: { websiteUrl: 'https://example.com/', extra: 'https://evil.example.com/' },
    expected: { youtubeUrl: '', websiteUrl: 'https://example.com/', referenceUrl: '' }
  }
];

export const CUSTOM_FOCUS_CASES = [
  {
    name: 'a real user-added focus is kept, id/name/description trimmed',
    input: [{ id: 'cf-1', name: '  Swept liquidity levels  ', description: '  where price already grabbed stops  ', origin: 'user', createdAt: '2026-01-01T00:00:00.000Z' }],
    expectLength: 1,
    expectFirst: { id: 'cf-1', name: 'Swept liquidity levels', description: 'where price already grabbed stops', origin: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
  },
  {
    name: 'an AI-accepted focus keeps origin "ai"',
    input: [{ id: 'cf-2', name: 'Order block mitigation', origin: 'ai' }],
    expectLength: 1,
    expectFirst: { id: 'cf-2', name: 'Order block mitigation', origin: 'ai' }
  },
  { name: 'a missing/blank name is dropped', input: [{ id: 'cf-3', name: '   ' }], expectLength: 0 },
  { name: 'a missing/invalid id is dropped', input: [{ id: '', name: 'Real name' }, { id: 'not valid id!', name: 'Also real' }], expectLength: 0 },
  {
    name: 'an unrecognized origin falls back to "user"',
    input: [{ id: 'cf-4', name: 'Something', origin: 'system' }],
    expectLength: 1,
    expectFirst: { id: 'cf-4', name: 'Something', origin: 'user' }
  },
  {
    name: 'a duplicate id is dropped, first occurrence wins',
    input: [{ id: 'cf-5', name: 'First' }, { id: 'cf-5', name: 'Second' }],
    expectLength: 1,
    expectFirst: { id: 'cf-5', name: 'First' }
  },
  {
    name: 'a duplicate name (case/space-insensitive) is dropped even with a different id',
    input: [{ id: 'cf-6', name: 'Elliott impulse count' }, { id: 'cf-7', name: '  elliott   impulse  count ' }],
    expectLength: 1,
    expectFirst: { id: 'cf-6', name: 'Elliott impulse count' }
  },
  {
    name: 'Arabic/Persian keyboard forms of the same name are treated as the same duplicate',
    input: [{ id: 'cf-8', name: 'شمارش ایلیوت' }, { id: 'cf-9', name: 'شمارش ايليوت' }],
    expectLength: 1
  },
  { name: 'not an array yields an empty list', input: 'nope', expectLength: 0 },
  { name: 'null yields an empty list', input: null, expectLength: 0 },
  {
    name: 'name/description are truncated to their max lengths, never crash on an oversized value',
    input: [{ id: 'cf-10', name: 'x'.repeat(500), description: 'y'.repeat(500) }],
    expectLength: 1,
    expectLengths: { name: 80, description: 240 }
  },
  {
    name: 'more than the cap is truncated to the max count, earliest entries kept',
    input: Array.from({ length: 40 }, (_, i) => ({ id: 'cf-many-' + i, name: 'Focus ' + i })),
    expectLength: 30
  }
];
