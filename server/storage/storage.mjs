import { mkdir, writeFile, rm } from 'node:fs/promises';
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
// Commercial System Slice 2: returns { url, sizeBytes, mimeType } instead of a bare url string -
// sizeBytes is the REAL final re-encoded buffer length actually written to disk (never a
// client-supplied number, see server/commercial/storage-service.mjs), the one authoritative
// number storage-quota enforcement is built on. Every accepted image is DECODED AND RE-ENCODED through sharp before it ever touches disk -
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
  return { url: `/uploads/${category}/${fileName}`, sizeBytes: reencoded.byteLength, mimeType: `image/${detectedFormat}` };
}

// Commercial System Slice 2 - the same raw-decoded-byte measurement saveImage() itself uses for
// MAX_IMAGE_BYTES, exposed for server/commercial/storage-service.mjs's pre-upload quota check
// (which must run BEFORE the real saveImage() call, so it needs its own cheap size estimate
// rather than waiting for the final re-encoded size). Returns 0 for anything that isn't a
// well-formed data URL - saveImage() itself is what actually rejects a malformed one.
export function decodedByteLength(dataUrl) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_PATTERN) : null;
  if (!match) return 0;
  return Buffer.byteLength(match[2], 'base64');
}

async function reencode(buffer, format) {
  const image = sharp(buffer, { animated: format === 'gif' });
  if (format === 'png') return image.png().toBuffer();
  if (format === 'jpeg') return image.jpeg({ quality: 90 }).toBuffer();
  if (format === 'webp') return image.webp().toBuffer();
  if (format === 'gif') return image.gif().toBuffer();
  throw new ApiError(400, 'INVALID_IMAGE_TYPE');
}

// Validation Gate (spec section 15/18) - the one place a stored file is ever removed from disk.
// `objectKey` is normally server-generated (`<category>/<fileName>`, never client-controlled - see
// object-storage-provider.mjs's own comment on why the real route never lets a client supply
// one), but this function validates it defensively regardless of caller trust level, since it's
// the last line of defense against path traversal for ANY future caller. `path.resolve` collapses
// '../' segments and treats a supplied absolute path as itself (ignoring uploadsDir) - checking
// the resolved result starts with the resolved uploadsDir catches both cases; a regex blacklist
// of '../' would not (URL-encoded or platform-specific separator variants bypass it).
export async function deleteFile(uploadsDir, objectKey) {
  if (typeof objectKey !== 'string' || !objectKey.trim()) throw new ApiError(400, 'INVALID_OBJECT_KEY');
  const resolvedRoot = path.resolve(uploadsDir);
  const resolvedTarget = path.resolve(resolvedRoot, objectKey);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) throw new ApiError(400, 'INVALID_OBJECT_KEY');
  // force:true makes deleting an already-missing file a safe no-op (spec section 15: "if the
  // physical object is already absent but the metadata is valid, handle idempotently").
  await rm(resolvedTarget, { force: true });
}

export async function saveImages(dataUrls, options) {
  const list = Array.isArray(dataUrls) ? dataUrls.slice(0, 6) : [];
  const results = [];
  for (const dataUrl of list) results.push(await saveImage(dataUrl, options));
  return results;
}

// Video attachments (Support Tickets) - honestly narrower validation than saveImage()'s: this
// project has no video decode/transcode dependency (the sharp-based "decode and re-encode every
// upload" defense images get has no video equivalent here), so a video is real-content-sniffed
// via its container's own magic bytes (never the declared MIME alone) and stored byte-for-byte,
// not re-encoded. That still rejects anything that isn't actually shaped like a real video
// container, regardless of what it claims to be - the same "never trust the declared type alone"
// principle, just without the re-encode step images additionally get.
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // a short screen recording comfortably fits; keeps one attachment well inside app.mjs's per-route JSON body limit
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const EBML_SIGNATURE = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]); // Matroska/WebM container header

function detectVideoContainer(buffer) {
  // ISO-BMFF family (MP4 and QuickTime/.mov both use it) - a 4-byte box size, then the literal
  // ASCII tag 'ftyp' at offset 4. Real container structure, not a filename/MIME string.
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(EBML_SIGNATURE)) return 'webm';
  return null;
}

export async function saveVideo(dataUrl, { uploadsDir, category }) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_PATTERN) : null;
  if (!match) throw new ApiError(400, 'INVALID_VIDEO_TYPE');
  const [, declaredMime, base64] = match;
  const mime = declaredMime.toLowerCase();
  if (!ALLOWED_VIDEO_MIME.has(mime)) throw new ApiError(400, 'INVALID_VIDEO_TYPE');
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength > MAX_VIDEO_BYTES) throw new ApiError(400, 'VIDEO_TOO_LARGE');
  const container = detectVideoContainer(buffer);
  if (!container) throw new ApiError(400, 'INVALID_VIDEO_TYPE');
  // The declared mime is trusted for the mp4-vs-mov split ONLY after the real container check
  // above already confirmed the bytes are genuinely ISO-BMFF-shaped.
  const extension = container === 'webm' ? 'webm' : mime === 'video/quicktime' ? 'mov' : 'mp4';
  const fileName = `${newId('vid')}.${extension}`;
  const dir = path.join(uploadsDir, category);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buffer);
  return { url: `/uploads/${category}/${fileName}`, sizeBytes: buffer.byteLength, mimeType: mime };
}

export async function saveVideos(dataUrls, options) {
  const list = Array.isArray(dataUrls) ? dataUrls.slice(0, 2) : []; // videos are large; a hard cap per message keeps abuse/cost bounded
  const results = [];
  for (const dataUrl of list) results.push(await saveVideo(dataUrl, options));
  return results;
}
