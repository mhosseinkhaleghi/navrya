// "My songs" for the Calm Room: audio files the trader adds stay on this device only, in
// IndexedDB, one database per signed-in user. Nothing is uploaded. When IndexedDB is not
// available (a private window, a blocked origin) the songs live for this page visit only.

const STORE = 'tracks';
export const MAX_TRACKS = 30;
export const MAX_TRACK_BYTES = 60 * 1024 * 1024;
const AUDIO_NAME = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;

const memory = new Map();
let opening = null;

function dbName() {
  const auth = typeof window !== 'undefined' && window.__NAVRYA_AUTH__;
  const id = auth && (auth.userId || (auth.user && auth.user.id));
  return 'navrya-calm-room-music' + (id ? ':' + id : '');
}

function open() {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const request = indexedDB.open(dbName(), 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
  return opening;
}

function run(db, mode, work) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const result = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result && 'result' in result ? result.result : true);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

function summary(row) {
  return { id: row.id, name: row.name, addedAt: row.addedAt };
}

export function isAudioFile(file) {
  return !!file && (/^audio\//.test(file.type || '') || AUDIO_NAME.test(file.name || ''));
}

export async function listTracks() {
  const db = await open();
  const stored = db ? (await run(db, 'readonly', (store) => store.getAll())) || [] : [];
  return stored.concat(Array.from(memory.values())).map(summary).sort((a, b) => a.addedAt - b.addedAt);
}

// Adds audio files (others are ignored). Returns { added, tooBig } - files over the size cap are
// not stored and are counted so the room can say so.
export async function addTracks(files) {
  const list = Array.from(files || []).filter(isAudioFile);
  const existing = await listTracks();
  const room = Math.max(0, MAX_TRACKS - existing.length);
  const added = [];
  let tooBig = 0;
  const db = await open();
  for (const file of list) {
    if (added.length >= room) break;
    if (file.size > MAX_TRACK_BYTES) { tooBig += 1; continue; }
    const row = {
      id: 'trk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      name: String(file.name || '').replace(/\.[^.]+$/, '').slice(0, 120) || 'track',
      addedAt: Date.now() + added.length,
      blob: file
    };
    if (db) {
      const ok = await run(db, 'readwrite', (store) => store.put(row));
      if (!ok) { memory.set(row.id, row); }
    } else memory.set(row.id, row);
    added.push(summary(row));
  }
  return { added, tooBig };
}

export async function trackBlob(id) {
  if (memory.has(id)) return memory.get(id).blob;
  const db = await open();
  if (!db) return null;
  const row = await run(db, 'readonly', (store) => store.get(id));
  return row && row.blob ? row.blob : null;
}

export async function removeTrack(id) {
  memory.delete(id);
  const db = await open();
  if (db) await run(db, 'readwrite', (store) => store.delete(id));
}
