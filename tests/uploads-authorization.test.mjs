import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  for (const category of ['session', 'pattern', 'strategy', 'trade', 'posts', 'listings']) {
    await mkdir(path.join(uploadsDir, category), { recursive: true });
    await writeFile(path.join(uploadsDir, category, 'img-test.png'), Buffer.from([137, 80, 78, 71]));
  }
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

for (const category of ['session', 'pattern', 'strategy', 'trade']) {
  test(`GET /uploads/${category}/... requires a real session - anonymous is rejected, never served publicly`, async () => {
    const response = await fetch(`${baseUrl}/uploads/${category}/img-test.png`);
    assert.equal(response.status, 401);
  });

  test(`GET /uploads/${category}/... is served once a real session is presented`, async () => {
    const user = await repo.users.create({ displayName: 'Media Viewer' });
    const headers = await authHeadersFor(repo, user.id);
    const response = await fetch(`${baseUrl}/uploads/${category}/img-test.png`, { headers });
    assert.equal(response.status, 200);
  });
}

for (const category of ['posts', 'listings']) {
  test(`GET /uploads/${category}/... stays PUBLIC (Community content is public by design) - anonymous access still works`, async () => {
    const response = await fetch(`${baseUrl}/uploads/${category}/img-test.png`);
    assert.equal(response.status, 200);
  });
}
