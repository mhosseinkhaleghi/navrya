import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { newId } from '../db/id.mjs';
import { ApiError } from '../community/errors.mjs';

// Journey H2, Gate 3: a narrow, audio-only sibling of server/storage/storage.mjs - deliberately
// NOT bent into that module, which is genuinely image-only (sharp-based decode/re-encode, an
// image/* MIME allowlist). Audio bytes here always come from a real, already-trusted server-to-
// server call (server/community/elevenlabs-client.mjs's synthesize()), never a client-supplied
// data URL, so there is no re-encode step the way saveImage() re-encodes through sharp to
// neutralize a polyglot upload - the caller already IS the only source of these bytes.
//
// Reuses server/storage/storage.mjs's exact deleteFile() directly (it's already generic, keyed by
// a server-generated "<category>/<fileName>" path, not image-specific) rather than duplicating
// the path-traversal-safety logic here.

const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // a short spoken FAQ/surface-help clip; generous headroom over a typical ~30s mp3
const ALLOWED_MIME_EXTENSION = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3' };

// `buffer` is a real, already-decoded Buffer (e.g. elevenlabs-client.mjs's synthesize() ->
// {buffer, contentType}) - never a base64 data URL from the browser. `declaredMimeType` is
// whatever the provider itself reported (contentType); validated against a small, closed
// allowlist before anything touches disk.
export async function saveAudio(buffer, { uploadsDir, category, declaredMimeType }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ApiError(400, 'INVALID_AUDIO_DATA');
  if (buffer.byteLength > MAX_AUDIO_BYTES) throw new ApiError(400, 'AUDIO_TOO_LARGE');
  const mime = String(declaredMimeType || '').toLowerCase().split(';')[0].trim();
  const extension = ALLOWED_MIME_EXTENSION[mime];
  if (!extension) throw new ApiError(400, 'INVALID_AUDIO_TYPE');

  const fileName = `${newId('audio')}.${extension}`;
  const dir = path.join(uploadsDir, category);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), buffer);
  return { url: `/uploads/${category}/${fileName}`, sizeBytes: buffer.byteLength, mimeType: mime };
}

export { MAX_AUDIO_BYTES };
