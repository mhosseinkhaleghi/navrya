import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { saveVideo } from '../server/storage/storage.mjs';

const root = process.cwd();

// A real, minimal, well-formed 1x1 transparent PNG - decodable by sharp, so it exercises the
// same real decode+re-encode path every other image upload in this app goes through.
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
// A synthetic-but-real ISO-BMFF ('ftyp' box) container, matching saveVideo()'s real
// signature check - never a full valid MP4, but genuinely shaped like one at the byte level.
function fakeMp4DataUrl() {
  const buffer = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypisom'), Buffer.alloc(24)]);
  return 'data:video/mp4;base64,' + buffer.toString('base64');
}
function fakeWebmDataUrl() {
  const buffer = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(16)]);
  return 'data:video/webm;base64,' + buffer.toString('base64');
}

test('058_support_tickets.sql extended by 059_support_ticket_attachments.sql - additive, no DROP/edit of 058', async () => {
  const sql = await readFile(path.join(root, 'server', 'db', 'migrations', '059_support_ticket_attachments.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '\[\]'::jsonb;/);
  assert.doesNotMatch(sql, /DROP (TABLE|COLUMN|INDEX)/i);
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const numbers = files.map((f) => Number(f.slice(0, 3))).filter(Number.isFinite);
  assert.equal(Math.max(...numbers), 59, '059 must be the current latest migration number');
  assert.equal(files.filter((f) => f.startsWith('059_')).length, 1);
});

test('storage.mjs saveVideo: real container-signature check, mime allowlist, and size cap - mirrors saveImage()\'s "never trust the declared type alone" rule', async (t) => {
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-video-'));
  t.after(() => rm(uploadsDir, { recursive: true, force: true }));

  const mp4 = await saveVideo(fakeMp4DataUrl(), { uploadsDir, category: 'ticket' });
  assert.match(mp4.url, /^\/uploads\/ticket\/vid-.*\.mp4$/);
  assert.equal(mp4.mimeType, 'video/mp4');

  const webm = await saveVideo(fakeWebmDataUrl(), { uploadsDir, category: 'ticket' });
  assert.match(webm.url, /^\/uploads\/ticket\/vid-.*\.webm$/);

  // Declares itself a video but the bytes are not a real container - real content-sniffing must
  // reject this regardless of the claimed MIME.
  const fakeBuffer = Buffer.from('this is not a real video file at all');
  await assert.rejects(
    () => saveVideo('data:video/mp4;base64,' + fakeBuffer.toString('base64'), { uploadsDir, category: 'ticket' }),
    (e) => e.code === 'INVALID_VIDEO_TYPE' && e.status === 400
  );

  await assert.rejects(
    () => saveVideo('data:video/x-flv;base64,' + fakeBuffer.toString('base64'), { uploadsDir, category: 'ticket' }),
    (e) => e.code === 'INVALID_VIDEO_TYPE' && e.status === 400,
    'a MIME outside the allowlist must be rejected even before the signature check'
  );

  const oversized = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypisom'), Buffer.alloc(51 * 1024 * 1024)]);
  await assert.rejects(
    () => saveVideo('data:video/mp4;base64,' + oversized.toString('base64'), { uploadsDir, category: 'ticket' }),
    (e) => e.code === 'VIDEO_TOO_LARGE' && e.status === 400
  );
});

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-ticket-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, urlPath, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + urlPath, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('a ticket created with an image + video attachment stores both, private, and reports them back on the detail view', async () => {
  const user = await createUser('AttachUser');
  const created = await api('POST', '/api/sync/support-tickets', {
    userId: user.id,
    body: { subject: 'Screenshot attached', category: 'technical', message: 'See attached.', images: [PNG_DATA_URL], videos: [fakeMp4DataUrl()] }
  });
  assert.equal(created.status, 201);

  const detail = await api('GET', `/api/sync/support-tickets/${created.body.id}`, { userId: user.id });
  const attachments = detail.body.messages[0].attachments;
  assert.equal(attachments.length, 2);
  assert.ok(attachments.some((a) => a.type === 'image' && a.url.startsWith('/uploads/ticket/')));
  assert.ok(attachments.some((a) => a.type === 'video' && a.url.startsWith('/uploads/ticket/')));

  const imageUrl = attachments.find((a) => a.type === 'image').url;

  // Anonymous request: no session at all.
  const anon = await fetch(baseUrl + imageUrl);
  assert.equal(anon.status, 401);

  // A different authenticated user: real 404 (uniform not-found, never a 403 that would confirm existence).
  const stranger = await createUser('AttachStranger');
  const strangerHeaders = await authHeadersFor(repo, stranger.id);
  const deniedRes = await fetch(baseUrl + imageUrl, { headers: strangerHeaders });
  assert.equal(deniedRes.status, 404);

  // The owner can load their own attachment.
  const ownerHeaders = await authHeadersFor(repo, user.id);
  const ownRes = await fetch(baseUrl + imageUrl, { headers: ownerHeaders });
  assert.equal(ownRes.status, 200);

  // An admin can load it too (admin already sees this ticket's subject/messages/owner via the
  // admin API - attachment files get the same visibility, scoped to this one category only).
  const admin = await createAdmin('AttachAdmin');
  const adminHeaders = await authHeadersFor(repo, admin.id);
  const adminRes = await fetch(baseUrl + imageUrl, { headers: adminHeaders });
  assert.equal(adminRes.status, 200);
});

test('a reply can also carry attachments, and an invalid image data URL is rejected server-side', async () => {
  const user = await createUser('ReplyAttachUser');
  const created = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'x', category: 'other', message: 'hi' } });

  const reply = await api('POST', `/api/sync/support-tickets/${created.body.id}/messages`, {
    userId: user.id, body: { message: 'here is a screenshot', images: [PNG_DATA_URL] }
  });
  assert.equal(reply.status, 201);
  assert.equal(reply.body.message.attachments.length, 1);
  assert.equal(reply.body.message.attachments[0].type, 'image');

  const invalid = await api('POST', `/api/sync/support-tickets/${created.body.id}/messages`, {
    userId: user.id, body: { message: 'bad image', images: ['not-a-data-url'] }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, 'INVALID_IMAGE_TYPE');
});

test('an admin can see a ticket owner\'s attachments through the admin ticket detail endpoint', async () => {
  const user = await createUser('AdminViewUser');
  const admin = await createAdmin('AdminViewAdmin');
  const created = await api('POST', '/api/sync/support-tickets', { userId: user.id, body: { subject: 'x', category: 'other', message: 'hi', images: [PNG_DATA_URL] } });

  const detail = await api('GET', `/api/admin/support-tickets/${created.body.id}`, { userId: admin.id });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.messages[0].attachments.length, 1);
});
