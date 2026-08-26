import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { deleteFile } from '../server/storage/storage.mjs';
import { LocalDiskObjectStorageProvider } from '../server/storage/object-storage-provider.mjs';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Validation Gate (spec section 15/16/17/18) - the real deletion lifecycle, including the
// path-traversal defense demanded explicitly by spec section 18.

let uploadsDir;
before(async () => { uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-del-')); });
after(async () => { await rm(uploadsDir, { recursive: true, force: true }); });

async function exists(p) {
  try { await access(p); return true; } catch (_) { return false; }
}

test('deleteFile rejects a ../ traversal attempt, never touching anything outside uploadsDir', async () => {
  await assert.rejects(
    () => deleteFile(uploadsDir, '../../../../etc/passwd'),
    (error) => error.code === 'INVALID_OBJECT_KEY' && error.status === 400
  );
});

test('deleteFile rejects a supplied absolute path outright', async () => {
  await assert.rejects(
    () => deleteFile(uploadsDir, process.platform === 'win32' ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/passwd'),
    (error) => error.code === 'INVALID_OBJECT_KEY'
  );
});

test('a percent-encoded "../" string is never itself decoded into a traversal - deleteFile only ever sees the literal characters, so it safely resolves to a harmless (non-existent) literal filename inside uploadsDir rather than escaping it', async () => {
  // Unlike a raw URL path segment (which Express/the router would decode before this ever runs),
  // objectKey here comes straight from a JSON body/DB field - `path.resolve` never interprets
  // "%2f" as "/", so this string can only ever resolve to a literal filename inside uploadsDir.
  // The real assertion is "this never throws AND never needs special-casing to stay safe".
  await deleteFile(uploadsDir, '..%2f..%2f..%2fetc%2fpasswd');
});

test('deleteFile actually removes a real file that legitimately lives under uploadsDir', async () => {
  const dir = path.join(uploadsDir, 'pattern');
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
  const filePath = path.join(dir, 'real-file.png');
  await writeFile(filePath, Buffer.from('fake-png-bytes'));
  assert.equal(await exists(filePath), true);
  await deleteFile(uploadsDir, 'pattern/real-file.png');
  assert.equal(await exists(filePath), false);
});

test('deleteFile is idempotent - deleting an already-missing file never throws', async () => {
  await deleteFile(uploadsDir, 'pattern/never-existed.png'); // must not reject
});

test('LocalDiskObjectStorageProvider.delete() rejects traversal the same way as deleteFile directly', async () => {
  const provider = new LocalDiskObjectStorageProvider({ uploadsDir });
  await assert.rejects(() => provider.delete('../../outside.png'), (error) => error.code === 'INVALID_OBJECT_KEY');
});

// --- Real HTTP flow: upload -> usage increases -> delete -> usage decreases -> file gone -> ownership enforced ---

let server, baseUrl, repo, httpUploadsDir;
before(async () => {
  httpUploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-http-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: httpUploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(httpUploadsDir, { recursive: true, force: true });
});

async function api(method, urlPath, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + urlPath, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const dataUrl = `data:image/png;base64,${tinyPngBase64}`;

test('a real upload-then-delete cycle: usage increases on upload, decreases exactly back down on delete, and the physical file is actually gone', async () => {
  const user = await repo.users.create({ displayName: 'Deleter' });
  const upload = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(upload.status, 201);

  const afterUpload = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.ok(afterUpload.body.usedBytes > 0);

  const objectsList = await api('GET', '/api/sync/storage/objects', { userId: user.id });
  assert.equal(objectsList.body.objects.length, 1);
  const objectId = objectsList.body.objects[0].id;
  const objectKey = objectsList.body.objects[0].objectKey;
  const physicalPath = path.join(httpUploadsDir, objectKey);
  assert.equal(await exists(physicalPath), true);

  const del = await api('DELETE', '/api/sync/storage/objects/' + objectId, { userId: user.id });
  assert.equal(del.status, 204);

  assert.equal(await exists(physicalPath), false);
  const afterDelete = await api('GET', '/api/sync/storage', { userId: user.id });
  assert.equal(afterDelete.body.usedBytes, 0);
  const objectsAfter = await api('GET', '/api/sync/storage/objects', { userId: user.id });
  assert.equal(objectsAfter.body.objects.length, 0);
});

test('deleting freed-up quota allows a new upload that would previously have been blocked', async () => {
  const user = await repo.users.create({ displayName: 'Reclaimer' });
  const { invalidateCommercialConfigCache } = await import('../server/commercial/commercial-config.mjs');

  // First upload happens under the default (huge) quota, purely to learn the REAL re-encoded
  // size of this fixture (never assume a byte count - PNG re-encoding overhead is
  // implementation-defined). The quota is then set just barely above that, so a SECOND
  // same-size upload cannot possibly fit.
  const first = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(first.status, 201);
  const usedAfterOne = (await api('GET', '/api/sync/storage', { userId: user.id })).body.usedBytes;
  await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: usedAfterOne + 1 }, {});
  invalidateCommercialConfigCache();

  const second = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(second.status, 403); // now over the deliberately tight quota

  const objectsList = await api('GET', '/api/sync/storage/objects', { userId: user.id });
  await api('DELETE', '/api/sync/storage/objects/' + objectsList.body.objects[0].id, { userId: user.id });

  const third = await api('POST', '/api/sync/patterns/images', { userId: user.id, body: { dataUrl } });
  assert.equal(third.status, 201); // quota freed up by the delete

  await repo.commercialConfig.publish('plan:free:storageBytes', { bytes: 104857600 }, {});
  invalidateCommercialConfigCache();
});

test('a user cannot delete another user\'s storage object', async () => {
  const owner = await repo.users.create({ displayName: 'Owner' });
  const attacker = await repo.users.create({ displayName: 'Attacker' });
  await api('POST', '/api/sync/patterns/images', { userId: owner.id, body: { dataUrl } });
  const objectsList = await api('GET', '/api/sync/storage/objects', { userId: owner.id });
  const objectId = objectsList.body.objects[0].id;

  const attackAttempt = await api('DELETE', '/api/sync/storage/objects/' + objectId, { userId: attacker.id });
  assert.equal(attackAttempt.status, 403);

  const stillThere = await api('GET', '/api/sync/storage/objects', { userId: owner.id });
  assert.equal(stillThere.body.objects.length, 1); // untouched
});

test('deleting a non-existent or already-deleted object id returns 404, not a silent success', async () => {
  const user = await repo.users.create({ displayName: 'Trader' });
  const result = await api('DELETE', '/api/sync/storage/objects/does-not-exist', { userId: user.id });
  assert.equal(result.status, 404);
});
