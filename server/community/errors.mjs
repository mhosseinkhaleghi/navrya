// Shared {error:'CODE'} JSON error shape, mirroring server/pattern-ai-server.mjs's existing
// convention. Both repo.pg.mjs and repo.memory.mjs throw ApiError for business-rule
// violations (already purchased, purchase required to rate, etc.) so route handlers behave
// identically regardless of which repository backend is injected.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundMiddleware(req, res) {
  res.status(404).json({ error: 'NOT_FOUND' });
}

export function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.code });
  if (err && (err.type === 'entity.too.large' || err.status === 413)) return res.status(413).json({ error: 'REQUEST_TOO_LARGE' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'INVALID_JSON' });
  console.error(err); // eslint-disable-line no-console
  res.status(500).json({ error: 'COMMUNITY_API_FAILED' });
}
