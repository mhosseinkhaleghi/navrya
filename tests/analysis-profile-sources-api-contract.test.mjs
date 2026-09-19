import assert from 'node:assert/strict';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Analysis Profile knowledge sources (070_analysis_profile_sources.sql) - nested routes under
// /api/sync/analysis-profiles/:id/sources, through the real HTTP layer with the memory repository
// and a REAL temporary uploads directory (so the PDF bytes, their removal and the quota effect are
// all observable, not assumed). Same harness as analysis-profile-events-api-contract.test.mjs.
let server, baseUrl, repo, uploadsDir;

before(async () => {
  repo = createMemoryRepo();
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'ap-sources-'));
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});
beforeEach(() => invalidateCommercialConfigCache());

async function api(method, route, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + route, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
  return { status: response.status, body: json, headers: response.headers, text };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
function sampleProfile(id) { return { id, name: 'PA', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] }; }
async function profileFor(user, id) { await api('POST', '/api/sync/analysis-profiles', { userId: user.id, body: sampleProfile(id) }); return id; }
const pdfDataUrl = (text = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF') => 'data:application/pdf;base64,' + Buffer.from(text).toString('base64');
async function mediaFiles() { try { return await readdir(path.join(uploadsDir, 'media')); } catch (_) { return []; } }
async function usedBytes(user) { return (await api('GET', '/api/sync/storage', { userId: user.id })).body.usedBytes; }
const sources = (id) => `/api/sync/analysis-profiles/${id}/sources`;

test('a request with no authenticated session is rejected with AUTH_SESSION_REQUIRED', async () => {
  const result = await api('GET', sources('any-id'));
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'AUTH_SESSION_REQUIRED');
});

test('every sources route 404s for a profile that does not exist', async () => {
  const user = await createUser('Trader One');
  assert.equal((await api('GET', sources('nope'), { userId: user.id })).status, 404);
  assert.equal((await api('POST', sources('nope'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/a' } })).status, 404);
  assert.equal((await api('POST', sources('nope') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl() } })).status, 404);
  assert.equal((await api('PATCH', sources('nope') + '/x', { userId: user.id, body: { title: 't' } })).status, 404);
});

test('another user can never read, add, patch, delete or upload into a profile that is not theirs (403), and a refused upload writes nothing', async () => {
  const owner = await createUser('Owner');
  const intruder = await createUser('Intruder');
  await profileFor(owner, 'ap-src-private');
  const created = await api('POST', sources('ap-src-private'), { userId: owner.id, body: { kind: 'website', url: 'https://example.com/private' } });
  assert.equal(created.status, 201);
  const filesBefore = (await mediaFiles()).length;

  assert.equal((await api('GET', sources('ap-src-private'), { userId: intruder.id })).status, 403);
  assert.equal((await api('POST', sources('ap-src-private'), { userId: intruder.id, body: { kind: 'website', url: 'https://example.com/x' } })).status, 403);
  assert.equal((await api('PATCH', sources('ap-src-private') + '/' + created.body.id, { userId: intruder.id, body: { title: 'hacked' } })).status, 403);
  assert.equal((await api('DELETE', sources('ap-src-private') + '/' + created.body.id, { userId: intruder.id })).status, 403);
  const pdf = await api('POST', sources('ap-src-private') + '/pdf', { userId: intruder.id, body: { dataUrl: pdfDataUrl() } });
  assert.equal(pdf.status, 403);
  assert.equal((await mediaFiles()).length, filesBefore, 'a refused upload must not leave a file behind');
  assert.equal(await usedBytes(intruder), 0, 'nor a quota row');

  const still = await api('GET', sources('ap-src-private'), { userId: owner.id });
  assert.equal(still.body.sources.length, 1);
  assert.equal(still.body.sources[0].title, '');
});

test('POST records a URL source as queued and GET lists it back - newest first', async () => {
  const user = await createUser('Trader Two');
  await profileFor(user, 'ap-src-1');
  const first = await api('POST', sources('ap-src-1'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/one', title: '  First   page ' } });
  assert.equal(first.status, 201);
  assert.equal(first.body.status, 'queued');
  assert.equal(first.body.title, 'First page');
  assert.equal(first.body.kind, 'website');
  const second = await api('POST', sources('ap-src-1'), { userId: user.id, body: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', status: 'ready', digest: 'a transcript' } });
  assert.equal(second.status, 201);
  assert.equal(second.body.status, 'ready');
  const list = await api('GET', sources('ap-src-1'), { userId: user.id });
  assert.deepEqual(list.body.sources.map((s) => s.kind), ['youtube', 'website'], 'newest first');
  assert.equal(list.body.sources[0].digest, 'a transcript');
});

test('the same URL cannot be added twice to one profile (409), but a different profile may hold it', async () => {
  const user = await createUser('Trader Dup');
  await profileFor(user, 'ap-src-dup-a');
  await profileFor(user, 'ap-src-dup-b');
  const body = { kind: 'website', url: 'https://example.com/same' };
  assert.equal((await api('POST', sources('ap-src-dup-a'), { userId: user.id, body })).status, 201);
  const dup = await api('POST', sources('ap-src-dup-a'), { userId: user.id, body });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'ANALYSIS_PROFILE_SOURCE_DUPLICATE');
  assert.equal((await api('POST', sources('ap-src-dup-b'), { userId: user.id, body })).status, 201);
});

test('invalid sources are rejected with VALIDATION_FAILED: unknown kind, bad/non-http URL, a YouTube URL as a website, a non-YouTube URL as a video, and a PDF through the URL route', async () => {
  const user = await createUser('Trader Bad');
  await profileFor(user, 'ap-src-bad');
  const bad = [
    { kind: 'bogus', url: 'https://example.com/a' },
    { kind: 'website', url: 'not a url' },
    { kind: 'website', url: 'ftp://example.com/a' },
    { kind: 'website', url: 'javascript:alert(1)' },
    { kind: 'website', url: 'https://user:pass@example.com/a' },
    { kind: 'website', url: 'https://youtu.be/dQw4w9WgXcQ' },
    { kind: 'youtube', url: 'https://example.com/watch?v=abc' },
    { kind: 'pdf', url: 'https://example.com/a.pdf' },
    { kind: 'website' },
    {}
  ];
  for (const body of bad) {
    const result = await api('POST', sources('ap-src-bad'), { userId: user.id, body });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.error, 'VALIDATION_FAILED');
  }
  assert.equal((await api('GET', sources('ap-src-bad'), { userId: user.id })).body.sources.length, 0);
});

test('PATCH updates only the allowlisted fields: the URL and kind can never be re-pointed, and a taught source records when it was taught', async () => {
  const user = await createUser('Trader Patch');
  await profileFor(user, 'ap-src-patch');
  const created = (await api('POST', sources('ap-src-patch'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/orig' } })).body;
  const patched = await api('PATCH', sources('ap-src-patch') + '/' + created.id, {
    userId: user.id, body: { title: 'Read title', digest: 'the digest', status: 'ready', url: 'https://evil.example/', kind: 'youtube', userId: 'someone-else', profileId: 'other' }
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.title, 'Read title');
  assert.equal(patched.body.digest, 'the digest');
  assert.equal(patched.body.status, 'ready');
  assert.equal(patched.body.url, 'https://example.com/orig', 'the URL is fixed at creation');
  assert.equal(patched.body.kind, 'website', 'the kind is fixed at creation');
  assert.equal(patched.body.userId, user.id);
  assert.equal(patched.body.profileId, 'ap-src-patch');
  assert.equal(patched.body.taughtAt, null);

  const taught = await api('PATCH', sources('ap-src-patch') + '/' + created.id, { userId: user.id, body: { status: 'taught', taughtUnderstandingVersion: 4 } });
  assert.equal(taught.body.status, 'taught');
  assert.equal(taught.body.taughtUnderstandingVersion, 4);
  assert.ok(taught.body.taughtAt, 'teaching stamps taughtAt');
});

test('a failed read keeps the source with its reason, and a later success clears the reason', async () => {
  const user = await createUser('Trader Fail');
  await profileFor(user, 'ap-src-fail');
  const created = (await api('POST', sources('ap-src-fail'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/x' } })).body;
  const failed = await api('PATCH', sources('ap-src-fail') + '/' + created.id, { userId: user.id, body: { status: 'failed', errorCode: 'SOURCE_ADDRESS_BLOCKED' } });
  assert.equal(failed.body.status, 'failed');
  assert.equal(failed.body.errorCode, 'SOURCE_ADDRESS_BLOCKED');
  const recovered = await api('PATCH', sources('ap-src-fail') + '/' + created.id, { userId: user.id, body: { status: 'ready', digest: 'now readable' } });
  assert.equal(recovered.body.status, 'ready');
  assert.equal(recovered.body.errorCode, '', 'a source that is no longer failed must not keep showing the old failure');
  const junk = await api('PATCH', sources('ap-src-fail') + '/' + created.id, { userId: user.id, body: { status: 'failed', errorCode: 'not a code; DROP TABLE' } });
  assert.equal(junk.body.errorCode, '', 'an error code is only ever a short UPPER_SNAKE token');
});

test('PATCH rejects an unknown status, 404s an unknown source, and 404s a source that belongs to a different profile', async () => {
  const user = await createUser('Trader Patch2');
  await profileFor(user, 'ap-src-p2a');
  await profileFor(user, 'ap-src-p2b');
  const created = (await api('POST', sources('ap-src-p2a'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/a' } })).body;
  assert.equal((await api('PATCH', sources('ap-src-p2a') + '/' + created.id, { userId: user.id, body: { status: 'nonsense' } })).status, 400);
  assert.equal((await api('PATCH', sources('ap-src-p2a') + '/missing', { userId: user.id, body: { title: 'x' } })).status, 404);
  assert.equal((await api('PATCH', sources('ap-src-p2b') + '/' + created.id, { userId: user.id, body: { title: 'x' } })).status, 404, 'a source id is only valid under its own profile');
});

test('DELETE removes a source and is idempotent', async () => {
  const user = await createUser('Trader Delete');
  await profileFor(user, 'ap-src-del');
  const created = (await api('POST', sources('ap-src-del'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/d' } })).body;
  assert.equal((await api('DELETE', sources('ap-src-del') + '/' + created.id, { userId: user.id })).status, 204);
  assert.equal((await api('GET', sources('ap-src-del'), { userId: user.id })).body.sources.length, 0);
  assert.equal((await api('DELETE', sources('ap-src-del') + '/' + created.id, { userId: user.id })).status, 204);
});

test('a profile holds at most 40 sources (the 41st is refused with ANALYSIS_PROFILE_SOURCE_LIMIT)', async () => {
  const user = await createUser('Trader Limit');
  await profileFor(user, 'ap-src-limit');
  for (let i = 0; i < 40; i += 1) {
    const ok = await api('POST', sources('ap-src-limit'), { userId: user.id, body: { kind: 'website', url: `https://example.com/page-${i}` } });
    assert.equal(ok.status, 201, `source ${i}`);
  }
  const over = await api('POST', sources('ap-src-limit'), { userId: user.id, body: { kind: 'website', url: 'https://example.com/page-40' } });
  assert.equal(over.status, 400);
  assert.equal(over.body.error, 'ANALYSIS_PROFILE_SOURCE_LIMIT');
  const overPdf = await api('POST', sources('ap-src-limit') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl() } });
  assert.equal(overPdf.body.error, 'ANALYSIS_PROFILE_SOURCE_LIMIT');
  assert.equal(await usedBytes(user), 0, 'a PDF refused for the cap must not consume quota');
});

// ---- PDF sources: stored bytes, counted against the storage quota, private to the owner ----------------

test('a PDF upload is stored as a private file, counted against the storage quota, and listed as an available ready source', async () => {
  const user = await createUser('Trader Pdf');
  await profileFor(user, 'ap-pdf-1');
  const before = await usedBytes(user);
  const dataUrl = pdfDataUrl('%PDF-1.4\n' + 'x'.repeat(500) + '\n%%EOF');
  const filesBefore = (await mediaFiles()).length;
  const upload = await api('POST', sources('ap-pdf-1') + '/pdf', { userId: user.id, body: { dataUrl, filename: 'My Strategy.pdf' } });
  assert.equal(upload.status, 201);
  assert.equal(upload.body.kind, 'pdf');
  assert.equal(upload.body.status, 'ready');
  assert.equal(upload.body.title, 'My Strategy', 'the title defaults to the file name without its extension');
  assert.equal(upload.body.fileName, 'My Strategy.pdf');
  assert.equal(upload.body.fileAvailable, true);
  assert.match(upload.body.fileUrl, /^\/uploads\/media\/.+\.pdf$/);
  assert.equal(upload.body.url, '', 'a stored PDF has no URL');
  assert.ok(upload.body.fileSizeBytes > 500);

  assert.equal((await mediaFiles()).length, filesBefore + 1, 'the PDF is really on disk');
  assert.equal(await usedBytes(user), before + upload.body.fileSizeBytes, 'the quota counts exactly the stored bytes');

  const list = await api('GET', sources('ap-pdf-1'), { userId: user.id });
  assert.equal(list.body.sources[0].fileAvailable, true);
});

test('the stored PDF is private: an anonymous request and another user are refused, only the owner can fetch it', async () => {
  const owner = await createUser('Pdf Owner');
  const other = await createUser('Pdf Other');
  await profileFor(owner, 'ap-pdf-private');
  const upload = (await api('POST', sources('ap-pdf-private') + '/pdf', { userId: owner.id, body: { dataUrl: pdfDataUrl(), filename: 'p.pdf' } })).body;

  const anonymous = await api('GET', upload.fileUrl);
  assert.equal(anonymous.status, 401);
  const stranger = await api('GET', upload.fileUrl, { userId: other.id });
  assert.ok(stranger.status === 403 || stranger.status === 404, `a different user must not read it (got ${stranger.status})`);
  const mine = await api('GET', upload.fileUrl, { userId: owner.id });
  assert.equal(mine.status, 200);
  assert.match(mine.headers.get('content-type') || '', /application\/pdf/);
  assert.ok(mine.text.startsWith('%PDF-'));
});

test('a file that is not really a PDF is refused (wrong declared type, wrong bytes, not a data URL) and nothing is stored or counted', async () => {
  const user = await createUser('Trader NotPdf');
  await profileFor(user, 'ap-pdf-bad');
  const filesBefore = (await mediaFiles()).length;
  const bad = [
    'data:image/png;base64,' + Buffer.from('%PDF-1.4 disguised').toString('base64'),
    'data:application/pdf;base64,' + Buffer.from('<html><script>alert(1)</script></html>').toString('base64'),
    'data:text/html;base64,' + Buffer.from('%PDF-').toString('base64'),
    'not a data url'
  ];
  for (const dataUrl of bad) {
    const result = await api('POST', sources('ap-pdf-bad') + '/pdf', { userId: user.id, body: { dataUrl } });
    assert.equal(result.status, 400, dataUrl.slice(0, 40));
    assert.equal(result.body.error, 'INVALID_PDF_TYPE');
  }
  assert.equal((await api('POST', sources('ap-pdf-bad') + '/pdf', { userId: user.id, body: {} })).body.error, 'VALIDATION_FAILED');
  assert.equal((await mediaFiles()).length, filesBefore);
  assert.equal(await usedBytes(user), 0);
  assert.equal((await api('GET', sources('ap-pdf-bad'), { userId: user.id })).body.sources.length, 0);
});

test('a PDF that would exceed the storage quota is refused with STORAGE_QUOTA_EXCEEDED and leaves no file, row or usage behind', async () => {
  const user = await createUser('Trader Quota');
  await profileFor(user, 'ap-pdf-quota');
  await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: 10 }, {});
  invalidateCommercialConfigCache();
  try {
    const filesBefore = (await mediaFiles()).length;
    const result = await api('POST', sources('ap-pdf-quota') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl('%PDF-1.4\n' + 'y'.repeat(200)), filename: 'q.pdf' } });
    assert.equal(result.status, 403);
    assert.equal(result.body.error, 'STORAGE_QUOTA_EXCEEDED');
    assert.equal((await mediaFiles()).length, filesBefore);
    assert.equal(await usedBytes(user), 0);
    assert.equal((await api('GET', sources('ap-pdf-quota'), { userId: user.id })).body.sources.length, 0);
  } finally {
    await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: 104857600 }, {});
    invalidateCommercialConfigCache();
  }
});

test('deleting a PDF source removes the file from disk and frees exactly its quota', async () => {
  const user = await createUser('Trader PdfDelete');
  await profileFor(user, 'ap-pdf-del');
  const filesBefore = (await mediaFiles()).length;
  const upload = (await api('POST', sources('ap-pdf-del') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl('%PDF-1.4\n' + 'z'.repeat(300)), filename: 'd.pdf' } })).body;
  assert.ok(await usedBytes(user) > 0);
  assert.equal((await api('DELETE', sources('ap-pdf-del') + '/' + upload.id, { userId: user.id })).status, 204);
  assert.equal(await usedBytes(user), 0);
  assert.equal((await mediaFiles()).length, filesBefore, 'the file is gone, not just the row');
  await assert.rejects(() => access(path.join(uploadsDir, upload.fileUrl.replace(/^\/uploads\//, ''))));
});

test('deleting a whole profile also removes its PDFs from disk and from the quota (the child rows cascade, the files would not)', async () => {
  const user = await createUser('Trader ProfileDelete');
  await profileFor(user, 'ap-pdf-profile-del');
  const filesBefore = (await mediaFiles()).length;
  await api('POST', sources('ap-pdf-profile-del') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl('%PDF-1.4\n' + 'a'.repeat(200)), filename: 'a.pdf' } });
  await api('POST', sources('ap-pdf-profile-del') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl('%PDF-1.4\n' + 'b'.repeat(200)), filename: 'b.pdf' } });
  assert.equal((await mediaFiles()).length, filesBefore + 2);
  assert.ok(await usedBytes(user) > 0);
  assert.equal((await api('DELETE', '/api/sync/analysis-profiles/ap-pdf-profile-del', { userId: user.id })).status, 204);
  assert.equal((await mediaFiles()).length, filesBefore);
  assert.equal(await usedBytes(user), 0);
});

test('a PDF deleted from the Storage page is reported honestly as fileAvailable:false instead of breaking the list', async () => {
  const user = await createUser('Trader StoragePage');
  await profileFor(user, 'ap-pdf-gone');
  const upload = (await api('POST', sources('ap-pdf-gone') + '/pdf', { userId: user.id, body: { dataUrl: pdfDataUrl(), filename: 'g.pdf' } })).body;
  const objects = (await api('GET', '/api/sync/storage/objects', { userId: user.id })).body.objects;
  const stored = objects.find((o) => o.sourceDomain === 'analysis-profile-source' && o.sourceRecordId === 'ap-pdf-gone');
  assert.ok(stored, 'the PDF is recorded as a storage object tagged with its domain and profile');
  assert.equal((await api('DELETE', '/api/sync/storage/objects/' + stored.id, { userId: user.id })).status, 204);
  const list = await api('GET', sources('ap-pdf-gone'), { userId: user.id });
  assert.equal(list.status, 200);
  assert.equal(list.body.sources[0].id, upload.id, 'the row remains');
  assert.equal(list.body.sources[0].fileAvailable, false);
  // Removing the now file-less source must still succeed, not throw on the already-deleted object.
  assert.equal((await api('DELETE', sources('ap-pdf-gone') + '/' + upload.id, { userId: user.id })).status, 204);
});
