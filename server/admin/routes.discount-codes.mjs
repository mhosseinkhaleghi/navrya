import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { requireRecentReauth } from './auth-admin.mjs';
import { parseDiscountCodeInput, toCodeDto } from '../commercial/discount-codes.mjs';

// Admin discount-code management (server/db/migrations/064_discount_codes.sql). Mounted at
// /api/admin/commercial/discount-codes from server/admin/routes.commercial.mjs, so it inherits
// requireAuth+csrfProtection+requireAdmin from the /api/admin mount point.
//
// Every MUTATION (create, update, activate, deactivate) requires a recent admin re-authentication - always, not
// only for a code that could produce a $0 price - and is written to the admin audit log. Reads need admin
// authorization only. Codes are never deleted: deactivating one stops NEW reservations but never voids a checkout
// that already holds a price, and editing one changes future redemptions only (a redemption snapshots the terms it
// was made under).
export function router(repo) {
  const app = express.Router();

  async function audit(req, action, targetId, details) {
    await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType: 'discountCode', targetId, details: details || {} });
  }
  async function dtoFor(code) {
    return toCodeDto(code, await repo.discountCodes.stats(code.id));
  }
  async function requireCode(id) {
    const code = await repo.discountCodes.get(id);
    if (!code) throw new ApiError(404, 'DISCOUNT_CODE_NOT_FOUND');
    return code;
  }

  app.get('/', asyncHandler(async (req, res) => {
    const codes = await repo.discountCodes.list();
    res.json({ codes: await Promise.all(codes.map(dtoFor)) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const code = await requireCode(req.params.id);
    res.json({ code: await dtoFor(code), redemptions: await repo.discountRedemptions.listForCode(code.id, { limit: 200 }) });
  }));

  app.post('/', requireRecentReauth(), asyncHandler(async (req, res) => {
    const value = parseDiscountCodeInput(req.body || {});
    const created = await repo.discountCodes.create({ ...value, createdBy: req.currentUser.id });
    const dto = await dtoFor(created);
    await audit(req, 'commercial.discountCode.create', created.id, { after: dto });
    res.status(201).json(dto);
  }));

  app.patch('/:id', requireRecentReauth(), asyncHandler(async (req, res) => {
    const existing = await requireCode(req.params.id);
    const patch = parseDiscountCodeInput(req.body || {}, { partial: true, existing });
    const keys = Object.keys(patch);
    if (!keys.length) throw new ApiError(400, 'VALIDATION_FAILED');
    const before = await dtoFor(existing);
    const updated = await repo.discountCodes.update(existing.id, patch, { updatedBy: req.currentUser.id });
    const after = await dtoFor(updated);
    const action = keys.length === 1 && keys[0] === 'active' ? (patch.active ? 'activate' : 'deactivate') : 'update';
    await audit(req, 'commercial.discountCode.' + action, existing.id, { before, after });
    res.json(after);
  }));

  return app;
}
