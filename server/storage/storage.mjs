import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { newId } from '../db/id.mjs';
import { ApiError } from '../community/errors.mjs';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // mirrors session-entry-flow.js's existing client-side cap
const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+\/-]+);base64,(.+)$/;

// Raster formats only, decided by what sharp/libvips can actually decode and re-encode - NEVER
// svg, html, xml, or any other active-content format, regardless of what the data URL's own
// declared MIME type claims. This is enforced twice: once against the declared MIME prefix
// (cheap, rejects an obviously-wrong declaration before any decode work), and once against
// sharp's own real, decoded-byte format detection (metadata().format) - the actual "magic byte"
// check, since a declared image/png MIME with a completely different payload behind it must
// still be rejected, not trusted from the Content-Type-like prefix alone.
const ALLOWED_DECLARED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const ALLOWED_DETECTED_FORMAT = new Set(['png', 'jpeg', 'webp', 'gif']);

// Generalized from the Community-only server/community/storage.mjs (moved here so every
// module's images - not just Community's - land in one place) for the local-first-to-server
// migration (see ARCHITECTURE.md's Global Data Sync section). `category` replaces the old
// `subdir` name 1:1 (same behavior, just named for what it now spans: 'posts'/'listings'
// for Community, 'session'/'pattern'/'strategy'/'trade' for the newly migrated modules).
// Continues this app's existing convention (images sent as base64 data URLs in JSON bodies,
// never multipart/FormData) rather than introducing multer as a new pattern. Local disk under
// UPLOADS_DIR, served statically at /uploads - kept behind this one small module so swapping
// to S3-compatible storage later only touches this file.
//
// Every accepted image is DECODED AND RE-ENCODED through sharp before it ever touches disk -
// this is what actually neutralizes a polyglot upload (a file crafted to be simultaneously valid
// as an image AND as some other active format when sniffed differently by a downstream
// consumer): re-encoding rebuilds the file from decoded pixel data alone, so no byte range from
// the original upload survives verbatim into the stored file. It also strips embedded metadata
// (EXIF, ICC profiles beyond what's needed for correct color, comments) that could otherwise
// carry attacker-controlled bytes into a file this app then serves back to other users.
export async function saveImage(dataUrl, { uploadsDir, category }) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_PATTERN) : null;
  if (!match) throw new ApiError(400, 'INVALID_IMAGE_TYPE');
  const [, declaredMime, base64] = match;
  if (!ALLOWED_DECLARED_MIME.has(declaredMime.toLowerCase())) throw new ApiError(400, 'INVALID_IMAGE_TYPE');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new ApiError(400, 'IMAGE_TOO_LARGE');

  let detectedFormat;
  try {
    const metadata = await sharp(buffer, { animated: true }).metadata();
    detectedFormat = metadata.format;
  } catch (_) {
    throw new ApiError(400, 'IMAGE_DECODE_FAILED'); // not a real, decodable raster image, whatever it claimed to be
  }
  if (!ALLOWED_DETECTED_FORMAT.has(detectedFormat)) throw new ApiError(400, 'INVALID_IMAGE_TYPE');

  const reencoded = await reencode(buffer, detectedFormat);
  const extension = detectedFormat === 'jpeg' ? 'jpg' : detectedFormat;
  const fileName = `${newId('img')}.${extension}`;
  const dir = path.join(uploadsDir, category);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), reencoded);
  return `/uploads/${category}/${fileName}`;
}

async function reencode(buffer, format) {
  const image = sharp(buffer, { animated: format === 'gif' });
  if (format === 'png') return image.png().toBuffer();
  if (format === 'jpeg') return image.jpeg({ quality: 90 }).toBuffer();
  if (format === 'webp') return image.webp().toBuffer();
  if (format === 'gif') return image.gif().toBuffer();
  throw new ApiError(400, 'INVALID_IMAGE_TYPE');
}

export async function saveImages(dataUrls, options) {
  const list = Array.isArray(dataUrls) ? dataUrls.slice(0, 6) : [];
  const urls = [];
  for (const dataUrl of list) urls.push(await saveImage(dataUrl, options));
  return urls;
}
