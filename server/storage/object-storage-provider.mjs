// ObjectStorageProvider abstraction (spec section 11). Business/domain code should depend on
// THIS interface, never on server/storage/storage.mjs or `fs`/`path` directly, so a future
// Cloudflare R2/S3-compatible adapter is a second implementation of `put()`, not a rewrite of
// every call site. `LocalDiskObjectStorageProvider` is the only implementation this slice ships -
// it wraps the existing, unmodified storage.mjs (still real local disk, still the same
// validation/re-encoding pipeline).
import { saveImage, deleteFile } from './storage.mjs';

/**
 * @typedef {{ objectKey: string, url: string, sizeBytes: number, mimeType: string }} StoredObject
 */

export class ObjectStorageProvider {
  /**
   * @param {string} dataUrl
   * @param {{ category: string }} options
   * @returns {Promise<StoredObject>}
   */
  // eslint-disable-next-line no-unused-vars
  async put(dataUrl, options) { throw new Error('NOT_IMPLEMENTED'); }
  /**
   * @param {string} objectKey
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async delete(objectKey) { throw new Error('NOT_IMPLEMENTED'); }
}

export class LocalDiskObjectStorageProvider extends ObjectStorageProvider {
  constructor({ uploadsDir }) {
    super();
    this.uploadsDir = uploadsDir;
  }
  async put(dataUrl, { category }) {
    const { url, sizeBytes, mimeType } = await saveImage(dataUrl, { uploadsDir: this.uploadsDir, category });
    // objectKey mirrors what an S3 key would be (category/fileName) - derived from the URL
    // rather than duplicating storage.mjs's filename-generation logic here.
    const objectKey = url.replace(/^\/uploads\//, '');
    return { objectKey, url, sizeBytes, mimeType };
  }
  // Validation Gate (spec section 15) - real deletion, delegated to storage.mjs's own
  // path-traversal-safe deleteFile() (the one module that owns local-disk I/O). No commercial/
  // domain service needs to know this resolves to a local file at all.
  async delete(objectKey) {
    await deleteFile(this.uploadsDir, objectKey);
  }
}
