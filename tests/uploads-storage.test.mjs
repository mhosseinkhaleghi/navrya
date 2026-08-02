import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { saveImage, saveImages } from '../server/community/storage.mjs';

let uploadsDir;
before(async () => { uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-')); });
after(async () => { await rm(uploadsDir, { recursive: true, force: true }); });

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('a valid image data URL is written to disk under the given subdir and returns a /uploads/... URL', async () => {
  const url = await saveImage(`data:image/png;base64,${tinyPngBase64}`, { uploadsDir, subdir: 'posts' });
  assert.match(url, /^\/uploads\/posts\/img-.+\.png$/);
  const written = await readFile(path.join(uploadsDir, 'posts', path.basename(url)));
  assert.equal(written.toString('base64'), tinyPngBase64);
});

test('a non-image / non-data-URL value is rejected with INVALID_IMAGE_TYPE, not silently skipped', async () => {
  await assert.rejects(
    () => saveImage('not-a-data-url', { uploadsDir, subdir: 'posts' }),
    (error) => error.code === 'INVALID_IMAGE_TYPE' && error.status === 400
  );
  await assert.rejects(
    () => saveImage('data:text/plain;base64,aGVsbG8=', { uploadsDir, subdir: 'posts' }),
    (error) => error.code === 'INVALID_IMAGE_TYPE'
  );
});

test('an oversized image is rejected with IMAGE_TOO_LARGE', async () => {
  const oversized = Buffer.alloc(15 * 1024 * 1024 + 1, 1).toString('base64');
  await assert.rejects(
    () => saveImage(`data:image/png;base64,${oversized}`, { uploadsDir, subdir: 'posts' }),
    (error) => error.code === 'IMAGE_TOO_LARGE' && error.status === 400
  );
});

test('saveImages caps the batch at 6 images and ignores anything beyond that, rather than failing the whole request', async () => {
  const urls = await saveImages(new Array(9).fill(`data:image/png;base64,${tinyPngBase64}`), { uploadsDir, subdir: 'listings' });
  assert.equal(urls.length, 6);
  urls.forEach((url) => assert.match(url, /^\/uploads\/listings\//));
});

test('saveImages returns an empty array for a missing/non-array input rather than throwing', async () => {
  assert.deepEqual(await saveImages(undefined, { uploadsDir, subdir: 'posts' }), []);
  assert.deepEqual(await saveImages(null, { uploadsDir, subdir: 'posts' }), []);
});
