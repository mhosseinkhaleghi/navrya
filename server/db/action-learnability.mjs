// Voice Command Learning Profile addendum, section 2/3: the server's own authoritative view of
// which actions may ever be stored as a learned_commands.action_id, and which of that action's own
// declared fields a mapping may reuse. Reads the generated manifest
// (scripts/action-learnability-build.mjs -> action-learnability.generated.json) - never a second,
// hand-typed list. See that script's own header comment for why this is a build-time artifact
// (mechanically derived from navrya-src/character-app.jsx's real registrations) rather than a live
// runtime read - this app's own established "no shared browser/server module bundling" boundary.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(here, 'action-learnability.generated.json');

let cached = null;
function manifest() {
  if (!cached) cached = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return cached;
}

// Only these three classifications may ever be learned - a declared gateField
// (confirmation_required) or riskLevel 'high' (never_learnable, this script's own classifier
// folds a handful of ungated-but-still-high-risk actions like trade.close in here too) are both
// rejected identically at this boundary: "route into the workflow, never auto-complete/auto-
// repeat" is not a mode this app's learned-command auto-apply path implements, so an action that
// needs it is simply not a valid learned-command target at all, full stop - never a second,
// weaker execution mode.
const LEARNABLE_CLASSIFICATIONS = ['learnable_workflow', 'learnable_navigation', 'learnable_safe_update'];

export function getActionMetadata(actionId) {
  const actions = manifest().actions || {};
  return Object.prototype.hasOwnProperty.call(actions, actionId) ? actions[actionId] : null;
}

export function isLearnableAction(actionId) {
  const meta = getActionMetadata(actionId);
  return !!meta && LEARNABLE_CLASSIFICATIONS.indexOf(meta.learnability) > -1;
}

export function reusableFieldsFor(actionId) {
  const meta = getActionMetadata(actionId);
  return (meta && meta.reusableFields) || [];
}

export function manifestActionIds() { return Object.keys(manifest().actions || {}); }
export function manifestVersion() { return manifest().version; }

// Test-only escape hatch - lets a contract test point at a hand-built fixture manifest (e.g. one
// declaring a since-removed action) without touching the real, committed generated artifact.
export function __setManifestForTests(fixture) { cached = fixture; }
export function __resetManifestForTests() { cached = null; }
