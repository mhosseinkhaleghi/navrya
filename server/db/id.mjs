import { randomUUID } from 'node:crypto';

// Same id shape regardless of backend (real pg or the in-memory test fake), and consistent
// with the browser-side `uid(prefix)` convention already used throughout this app
// (e.g. trade-store.js's `uid('trade')` -> "trade-<ts36>-<random>").
export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
