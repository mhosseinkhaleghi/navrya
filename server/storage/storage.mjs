import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../db/id.mjs';
import { ApiError } from '../community/errors.mjs';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // mirrors session-entry-flow.js's existing client-side cap
const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

// Generalized from the Community-only server/community/storage.mjs (moved here so every
// module's images - not just Community's - land in one place) for the local-first-to-server
// migration (see ARCHITECTURE.md's Global Data Sync section). `category` replaces the old
// `subdir` name 1:1 (same behavior, just named for what it now spans: 'posts'/'listings'
// for Community, 'session'/'pattern'/'strategy'/'trade' for the newly migrated modules).
// Continues this app's existing convention (images sent as base64 data URLs in JSON bodies,
// never multipart/FormData) rather than introducing multer as a new pattern. Local disk under
// UPLOADS_DIR, served statically at /uploads - kept behind this one small module so swapping
// to S3-compatible storage later only touches this file.
export async function saveImage(dataUrl, { uploadsDir, category }) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_PATTERN) : null;
  if (!match) throw new ApiError(400, 'INVALID_IMAGE_TYPE');
  const [, mimeType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new ApiError(400, 'IMAGE_TOO_LARGE');
  const extension = mimeType.split('/')[1].split('+')[0].slice(0, 10);
  const fileName = `${newId('img')}.${extension}`;
  const dir = path.join(uploadsDir, category);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buffer);
  return `/uploads/${category}/${fileName}`;
}

export async function saveImages(dataUrls, options) {
  const list = Array.isArray(dataUrls) ? dataUrls.slice(0, 6) : [];
  const urls = [];
  for (const dataUrl of list) urls.push(await saveImage(dataUrl, options));
  return urls;
}
