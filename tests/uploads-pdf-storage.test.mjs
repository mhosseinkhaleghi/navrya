import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { savePdf } from '../server/storage/storage.mjs';
import { LocalDiskObjectStorageProvider } from '../server/storage/object-storage-provider.mjs';

// savePdf(): the storage primitive behind Analysis Profile knowledge-source PDFs. There is no
// decode/re-encode defense for a PDF, so the contract is the same two-part one saveVideo() has:
// a declared application/pdf type AND real PDF bytes.
let dir;
before(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'save-pdf-')); });
after(() => rm(dir, { recursive: true, force: true }));
const url = (text, mime = 'application/pdf') => `data:${mime};base64,` + Buffer.from(text).toString('base64');

test('stores a real PDF byte-for-byte under the category and returns its real size and a .pdf url', async () => {
  const bytes = '%PDF-1.7\nhello\n%%EOF';
  const stored = await savePdf(url(bytes), { uploadsDir: dir, category: 'media' });
  assert.match(stored.url, /^\/uploads\/media\/.+\.pdf$/);
  assert.equal(stored.mimeType, 'application/pdf');
  assert.equal(stored.sizeBytes, Buffer.byteLength(bytes));
  assert.equal(await readFile(path.join(dir, stored.url.replace(/^\/uploads\//, '')), 'utf8'), bytes);
});

test('accepts the header up to 1024 bytes in (the PDF spec allows leading junk), but not beyond', async () => {
  await savePdf(url('x'.repeat(1000) + '%PDF-1.4'), { uploadsDir: dir, category: 'media' });
  await assert.rejects(() => savePdf(url('x'.repeat(1100) + '%PDF-1.4'), { uploadsDir: dir, category: 'media' }), /INVALID_PDF_TYPE/);
});

test('refuses anything that is not really a PDF - wrong declared type, wrong bytes, not a data URL - and writes nothing', async () => {
  await savePdf(url('%PDF-1.4\nseed'), { uploadsDir: dir, category: 'media' }); // guarantees the directory exists
  const before = (await readdir(path.join(dir, 'media'))).length;
  for (const bad of [url('%PDF-1.4', 'image/png'), url('<html></html>'), url('%PDF-1.4', 'text/html'), 'plain text', undefined, null, 42]) {
    await assert.rejects(() => savePdf(bad, { uploadsDir: dir, category: 'media' }), /INVALID_PDF_TYPE/);
  }
  assert.equal((await readdir(path.join(dir, 'media'))).length, before);
});

test('refuses a PDF over the 15 MB ceiling', async () => {
  const big = '%PDF-1.4\n' + 'a'.repeat(15 * 1024 * 1024 + 1);
  await assert.rejects(() => savePdf(url(big), { uploadsDir: dir, category: 'media' }), /PDF_TOO_LARGE/);
});

test('the storage provider exposes putDocument() with the same object shape as put(), and delete() removes the file', async () => {
  const provider = new LocalDiskObjectStorageProvider({ uploadsDir: dir });
  const stored = await provider.putDocument(url('%PDF-1.4\nprovider'), { category: 'media' });
  assert.equal(stored.objectKey, stored.url.replace(/^\/uploads\//, ''));
  assert.equal(stored.mimeType, 'application/pdf');
  await provider.delete(stored.objectKey);
  const remaining = await readdir(path.join(dir, 'media'));
  assert.ok(!remaining.includes(path.basename(stored.objectKey)));
});
