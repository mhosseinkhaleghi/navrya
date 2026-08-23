import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import sharp from 'sharp';
import { saveImage, saveImages } from '../server/storage/storage.mjs';

let uploadsDir;
before(async () => { uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-')); });
after(async () => { await rm(uploadsDir, { recursive: true, force: true }); });

const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('a valid image data URL is decoded, re-encoded (never stored byte-for-byte verbatim), and written to disk under the given category', async () => {
  const url = await saveImage(`data:image/png;base64,${tinyPngBase64}`, { uploadsDir, category: 'posts' });
  assert.match(url, /^\/uploads\/posts\/img-.+\.png$/);
  const written = await readFile(path.join(uploadsDir, 'posts', path.basename(url)));
  // Deliberately NOT a byte-for-byte comparison against the input - every accepted image is
  // decoded and re-encoded through sharp (see storage.mjs's own comment on why), so the stored
  // bytes are expected to differ from the upload even for an already-valid PNG. What must be
  // true instead: the stored file is itself a real, valid PNG with the same pixel content.
  const metadata = await sharp(written).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 1);
});

test('an SVG is rejected outright, even with a claimed image/svg+xml MIME type - active content is never accepted as an "image"', async () => {
  const maliciousSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  await assert.rejects(
    () => saveImage(`data:image/svg+xml;base64,${maliciousSvg}`, { uploadsDir, category: 'posts' }),
    (error) => error.code === 'INVALID_IMAGE_TYPE' && error.status === 400
  );
});

test('a file claiming to be a PNG but whose decoded bytes are not a real image is rejected (MIME-declaration spoofing / polyglot attempt)', async () => {
  const notReallyAnImage = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>').toString('base64');
  await assert.rejects(
    () => saveImage(`data:image/png;base64,${notReallyAnImage}`, { uploadsDir, category: 'posts' }),
    (error) => error.code === 'IMAGE_DECODE_FAILED' && error.status === 400
  );
});

test('a non-image / non-data-URL value is rejected with INVALID_IMAGE_TYPE, not silently skipped', async () => {
  await assert.rejects(
    () => saveImage('not-a-data-url', { uploadsDir, category: 'posts' }),
    (error) => error.code === 'INVALID_IMAGE_TYPE' && error.status === 400
  );
  await assert.rejects(
    () => saveImage('data:text/plain;base64,aGVsbG8=', { uploadsDir, category: 'posts' }),
    (error) => error.code === 'INVALID_IMAGE_TYPE'
  );
});

test('an oversized image is rejected with IMAGE_TOO_LARGE', async () => {
  const oversized = Buffer.alloc(15 * 1024 * 1024 + 1, 1).toString('base64');
  await assert.rejects(
    () => saveImage(`data:image/png;base64,${oversized}`, { uploadsDir, category: 'posts' }),
    (error) => error.code === 'IMAGE_TOO_LARGE' && error.status === 400
  );
});

test('saveImages caps the batch at 6 images and ignores anything beyond that, rather than failing the whole request', async () => {
  const urls = await saveImages(new Array(9).fill(`data:image/png;base64,${tinyPngBase64}`), { uploadsDir, category: 'listings' });
  assert.equal(urls.length, 6);
  urls.forEach((url) => assert.match(url, /^\/uploads\/listings\//));
});

test('saveImages returns an empty array for a missing/non-array input rather than throwing', async () => {
  assert.deepEqual(await saveImages(undefined, { uploadsDir, category: 'posts' }), []);
  assert.deepEqual(await saveImages(null, { uploadsDir, category: 'posts' }), []);
});
