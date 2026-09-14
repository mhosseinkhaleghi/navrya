// NAVRYA Media Drive - the ONE client-side API surface for the server-canonical Media Asset
// domain (server/community/routes.media.mjs + server/pattern-ai-server.mjs's /api/media/
// analyze-chart). Every caller (MediaPicker.jsx, liveSessionView.jsx's capture flows, and any
// future Trade/Pattern/Strategy attachment flow) goes through these functions rather than calling
// fetch() directly, so there is exactly one request/response shape for this domain. Plain relative
// fetch() paths - /api/sync/* is same-origin proxied to the Community API, /api/media/* is
// same-origin proxied to the AI gateway (same convention session-analysis-client.js already uses
// for /api/sessions/*). CSRF/session cookies are attached automatically by
// public/pages/shared/csrf-fetch-patch.js - no header wiring needed here.

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function listRecentAssets() {
  const response = await fetch('/api/sync/media/assets?scope=recent');
  if (!response.ok) return { ok: false, assets: [] };
  const body = await readJson(response);
  return { ok: true, assets: body.assets || [] };
}

export async function listMyDriveAssets({ q, cursor } = {}) {
  const params = new URLSearchParams({ scope: 'mine' });
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  const response = await fetch('/api/sync/media/assets?' + params.toString());
  if (!response.ok) return { ok: false, assets: [], nextCursor: null };
  const body = await readJson(response);
  return { ok: true, assets: body.assets || [], nextCursor: body.nextCursor || null };
}

export async function getAsset(id) {
  const response = await fetch('/api/sync/media/assets/' + encodeURIComponent(id));
  if (!response.ok) return null;
  return readJson(response);
}

// Stores a NEW chart/image (capture or manual upload). `sessionId` is optional - when this is
// called from inside a real Live Session, the server itself verifies ownership and derives the
// active market session; a foreign/invalid sessionId is silently ignored server-side, never
// trusted blindly.
export async function createAsset({ dataUrl, filename, mimeType, kind, source, sessionId }) {
  const response = await fetch('/api/sync/media/assets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, filename, mimeType, kind, source, sessionId: sessionId || undefined })
  });
  const body = await readJson(response);
  if (!response.ok) return { ok: false, error: body.error || 'MEDIA_UPLOAD_FAILED' };
  return { ok: true, asset: body };
}

// Fire-and-awaited by the caller right after createAsset() for a 'chart' kind asset - the AI
// gateway persists the result server-side itself (server/pattern-ai-server.mjs ->
// /internal/media/assets/:id/analysis); this function's own return value is only used to update
// the picker's UI immediately, never as the source of truth for a later reload.
export async function analyzeChart({ mediaAssetId, imageDataUrl, sessionId, provider, model, apiKey }) {
  let response;
  try {
    response = await fetch('/api/media/analyze-chart', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaAssetId, imageDataUrl, sessionId: sessionId || undefined, provider, model, apiKey: apiKey || undefined })
    });
  } catch (_) {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
  const body = await readJson(response);
  if (!response.ok) return { ok: false, error: body.error || 'MEDIA_ANALYSIS_FAILED', status: response.status };
  return { ok: true, asset: body.data, provider: body.provider, model: body.model, usage: body.usage };
}

export async function retryAnalysis(id) {
  const response = await fetch('/api/sync/media/assets/' + encodeURIComponent(id) + '/retry-analysis', { method: 'POST' });
  const body = await readJson(response);
  if (!response.ok) return { ok: false, error: body.error || 'RETRY_FAILED' };
  return { ok: true, asset: body };
}

// Creates a reference only - never re-uploads bytes or re-charges storage quota.
export async function linkAsset(id, { domain, recordId }) {
  const response = await fetch('/api/sync/media/assets/' + encodeURIComponent(id) + '/links', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, recordId })
  });
  if (!response.ok) return { ok: false };
  return { ok: true, link: await readJson(response) };
}

export async function deleteAsset(id, { detach } = {}) {
  const response = await fetch('/api/sync/media/assets/' + encodeURIComponent(id) + (detach ? '?detach=true' : ''), { method: 'DELETE' });
  if (response.status === 204) return { ok: true };
  const body = await readJson(response);
  return { ok: false, error: body.error || 'DELETE_FAILED', linkCount: body.linkCount };
}

export async function fetchStorageUsage() {
  const response = await fetch('/api/sync/storage');
  if (!response.ok) return null;
  return readJson(response);
}

// A captured File/Blob -> data URL, the same transport shape every existing upload endpoint in
// this app already expects (see server/storage/storage.mjs's saveImage()).
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
