import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { createWithQuota } from '../commercial/quota.mjs';

// NAVRYA Accounts domain (021_accounts.sql). Mounted at /api/sync/accounts, behind the same
// requireAuth()+csrfProtection() chain every other /api/sync/* route sits behind in app.mjs -
// see routes.trades.mjs's comment for why /api/sync/* is its own prefix.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ accounts: await repo.accounts.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.accounts.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'ACCOUNT_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id, same convention as every other
  // list-shaped sync domain (trades/patterns/strategies).
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const existing = await repo.accounts.get(req.currentUser.id, record.id);
    const saved = existing
      ? await repo.accounts.upsert(req.currentUser.id, record)
      : await createWithQuota('accounts', req.currentUser.id, repo, () => repo.accounts.upsert(req.currentUser.id, record));
    res.status(200).json(saved);
  }));

  // Archiving (not deleting) is the only supported removal - see repo.*.accounts.remove()'s own
  // comment for why an account is never hard-deleted even when this DELETE is called: it always
  // sets status='archived' rather than removing the row, so trades referencing it never dangle
  // and their history is never silently lost.
  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.accounts.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
