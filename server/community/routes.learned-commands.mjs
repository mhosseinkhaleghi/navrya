import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { manifestActionIds, getActionMetadata } from '../db/action-learnability.mjs';
import { SAFE_TARGET_STRATEGIES } from '../db/learned-command-normalize.mjs';

// Learned Command Record domain (055_learned_commands.sql). Voice Command Learning Profile
// addendum. Mounted at /api/sync/learned-commands, behind the same requireAuth()+csrfProtection()
// chain every other /api/sync/* route sits behind - see routes.accounts.mjs's comment for why
// /api/sync/* is its own prefix. Same idempotent-upsert-by-client-id shape as instrument-catalog,
// plus two narrow, additive actions (outcome/enabled) that only ever move the trust counters or
// the on/off switch - never redefine what a mapping does (that is upsert's own, separate job).
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ learnedCommands: await repo.learnedCommands.listByUser(req.currentUser.id) });
  }));

  // Section 7 (dashboard): the exact, currently-learnable action catalog and the fixed target-
  // strategy enum, straight from the same generated manifest the server's own write-path
  // validates against - so the dashboard's action/target-strategy selectors can never drift into
  // offering something the server would then reject. Mounted before '/:id' - see that route's own
  // ordering note.
  app.get('/actions', asyncHandler(async (req, res) => {
    const actions = manifestActionIds()
      .map((id) => Object.assign({ id }, getActionMetadata(id)))
      .filter((a) => a.learnability === 'learnable_workflow' || a.learnability === 'learnable_navigation' || a.learnability === 'learnable_safe_update')
      .map((a) => ({ id: a.id, learnability: a.learnability, reusableFields: a.reusableFields }));
    res.json({ actions, targetStrategies: SAFE_TARGET_STRATEGIES });
  }));

  // Resolution-time lookup ("does the user already have an enabled mapping for what they just
  // said") - a query param, not a body, since this is a read. Returns {match: null} rather than
  // 404 when nothing matches - "no learned mapping yet" is the ordinary, expected case, not an
  // error.
  app.get('/match', asyncHandler(async (req, res) => {
    const phrase = typeof req.query.phrase === 'string' ? req.query.phrase : '';
    const language = typeof req.query.language === 'string' ? req.query.language : null;
    const match = await repo.learnedCommands.findByPhrase(req.currentUser.id, phrase, language);
    res.json({ match });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.learnedCommands.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'LEARNED_COMMAND_NOT_FOUND');
    res.json(record);
  }));

  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.learnedCommands.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.learnedCommands.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  // Section 7 (dashboard): "Reset all" - deletes only the authenticated user's own mappings, never
  // touches Persona settings or AI conversation history (a completely separate domain/table). The
  // client-side confirmation prompt is the dashboard's own responsibility (matching this app's
  // established window.confirm() convention for a human-driven destructive click); this endpoint
  // itself still re-scopes to req.currentUser.id exactly like every other write here, so a
  // crafted request can never delete another user's mappings.
  app.delete('/', asyncHandler(async (req, res) => {
    const count = await repo.learnedCommands.removeAllForUser(req.currentUser.id);
    res.json({ removed: count });
  }));

  // outcome must be exactly 'success' or 'correction' - the same closed, deterministic vocabulary
  // learned-command-normalize.mjs's applyLearnedCommandOutcome() itself only understands; anything
  // else is a validation error, never silently ignored.
  app.post('/:id/outcome', asyncHandler(async (req, res) => {
    const outcome = req.body && req.body.outcome;
    if (outcome !== 'success' && outcome !== 'correction') throw new ApiError(400, 'VALIDATION_FAILED');
    const updated = await repo.learnedCommands.recordOutcome(req.currentUser.id, req.params.id, outcome);
    if (!updated) throw new ApiError(404, 'LEARNED_COMMAND_NOT_FOUND');
    res.json(updated);
  }));

  app.post('/:id/enabled', asyncHandler(async (req, res) => {
    const updated = await repo.learnedCommands.setEnabled(req.currentUser.id, req.params.id, !!(req.body && req.body.enabled));
    if (!updated) throw new ApiError(404, 'LEARNED_COMMAND_NOT_FOUND');
    res.json(updated);
  }));

  return app;
}
