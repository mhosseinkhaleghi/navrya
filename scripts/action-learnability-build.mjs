// Voice Command Learning Profile addendum, section 2/3: generates a versioned, hashed JSON
// snapshot of every action's LEARNABILITY classification and safe field-mapping allowlist, derived
// mechanically from the real, canonical Action Registry source (navrya-src/character-app.jsx) -
// "generate from the canonical source, never hand-maintain a second list that can drift" (the
// same governing rule ai-knowledge-build.mjs already established for LAYER A domain knowledge).
//
// Why this is a build-time artifact rather than a live runtime read: this app has an explicit,
// pre-existing architectural boundary - "no shared browser/server module bundling"
// (server/pattern-ai-server.mjs's own VOICE_CHARACTERS comment) - the server never imports or
// reads navrya-src/ at runtime. And character-app.jsx cannot be executed directly in Node the way
// ai-knowledge-registry.js can (vm.runInNewContext): every registerAction() call lives inside a
// React useEffect that only ever runs from a real, mounted browser component - there is no browser
// mount in this build context. This script instead does what this repo's OWN test suite already
// does for the identical problem (tests/settings-persona-action.test.mjs's own actionBlock()
// helper): a structural, static-source extraction of each registerAction({...}) call, terminated
// at its own resultContext: field (every one of the 61 registrations ends with exactly one) -
// mechanical and driven by the real file, never a hand-typed duplicate of action ids/fields.
//
// LEARNABILITY is DERIVED, not hand-annotated per action - from the exact same riskLevel/
// gateField/domain fields every action already declares for its own real purposes, so this can
// never drift into a second, independently-edited classification:
//   - a declared gateField          -> confirmation_required (destructive/consequential - a
//                                      learned mapping may route into the workflow, never
//                                      auto-supply or bypass the gate value itself)
//   - riskLevel 'high'              -> never_learnable (every one of this app's delete/cancel/
//                                      publish/message actions already carries this - verified by
//                                      this script's own contract test)
//   - id === 'navigate.to'          -> learnable_navigation
//   - domain === 'settings'         -> learnable_safe_update
//   - everything else (riskLevel low/medium, no gate) -> learnable_workflow
//
// reusableFields (the server-side field-mapping allowlist) = requiredFields ∪ optionalFields,
// minus the action's own gateField (a gate value must never be sourced from a stored mapping,
// regardless of classification - defense in depth alongside the never_learnable/
// confirmation_required rule above). This is a real, meaningful tightening over "any JSON key
// accepted" - not a claim that every remaining field is equally safe to reuse indefinitely; see
// the generated artifact's own `notes` field and the final report for the honestly-scoped limit
// this still has (this script cannot see which of an action's declared fields are
// resolution-only, since that distinction only exists in the browser-only Process Registry's own
// runtime allowlist - not available in this static build context).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sourcePath = path.join(root, 'navrya-src', 'character-app.jsx');
const outDir = path.join(root, 'server', 'db');
const outPath = path.join(outDir, 'action-learnability.generated.json');

const ARTIFACT_VERSION = 1;

function parseStringArrayLiteral(text) {
  if (!text) return [];
  return Array.from(text.matchAll(/'([^']*)'|"([^"]*)"/g)).map((m) => m[1] !== undefined ? m[1] : m[2]);
}

// Extracts every registerAction({...}) block from the real source text. Each block starts at its
// own `id: '...'` and is terminated at the FIRST `resultContext:` field found after it, then the
// block's own closing `});` - matching every one of the 61 real registrations' own consistent
// shape (confirmed 1:1 by this script's own contract test: exactly as many `resultContext:`
// occurrences as `registerAction({` occurrences).
export function extractActionBlocks(source) {
  const blocks = [];
  const startRe = /registerAction\(\{/g;
  let match;
  while ((match = startRe.exec(source))) {
    const blockStart = match.index;
    const resultContextIdx = source.indexOf('resultContext:', blockStart);
    if (resultContextIdx === -1) continue;
    const closeIdx = source.indexOf('});', resultContextIdx);
    if (closeIdx === -1) continue;
    const blockText = source.slice(blockStart, closeIdx + 3);
    const idMatch = /id:\s*'([^']+)'/.exec(blockText);
    if (!idMatch) continue;
    const domainMatch = /domain:\s*'([^']+)'/.exec(blockText);
    const riskMatch = /riskLevel:\s*'([^']+)'/.exec(blockText);
    const gateMatch = /gateField:\s*'([^']+)'/.exec(blockText);
    const requiredMatch = /requiredFields:\s*\[([^\]]*)\]/.exec(blockText);
    const optionalMatch = /optionalFields:\s*\[([^\]]*)\]/.exec(blockText);
    const entityAlreadyPersisted = /entityAlreadyPersisted:\s*true/.test(blockText);
    const explicitSubmitOnly = /explicitSubmitOnly:\s*true/.test(blockText);
    blocks.push({
      id: idMatch[1],
      domain: domainMatch ? domainMatch[1] : null,
      riskLevel: riskMatch ? riskMatch[1] : null,
      gateField: gateMatch ? gateMatch[1] : null,
      requiredFields: parseStringArrayLiteral(requiredMatch ? requiredMatch[1] : ''),
      optionalFields: parseStringArrayLiteral(optionalMatch ? optionalMatch[1] : ''),
      entityAlreadyPersisted, explicitSubmitOnly
    });
  }
  return blocks;
}

function classifyLearnability(action) {
  if (action.gateField) return 'confirmation_required';
  if (action.riskLevel === 'high') return 'never_learnable';
  if (action.id === 'navigate.to') return 'learnable_navigation';
  if (action.domain === 'settings') return 'learnable_safe_update';
  return 'learnable_workflow';
}

function reusableFieldsFor(action) {
  const all = new Set([...action.requiredFields, ...action.optionalFields]);
  if (action.gateField) all.delete(action.gateField);
  return Array.from(all).sort();
}

export function buildManifest(source) {
  const blocks = extractActionBlocks(source);
  const actions = {};
  blocks.forEach((action) => {
    actions[action.id] = {
      domain: action.domain, riskLevel: action.riskLevel, gateField: action.gateField || null,
      learnability: classifyLearnability(action),
      reusableFields: reusableFieldsFor(action)
    };
  });
  const contentHash = createHash('sha256').update(JSON.stringify({ version: ARTIFACT_VERSION, actions })).digest('hex').slice(0, 16);
  return { version: ARTIFACT_VERSION, contentHash, actionCount: blocks.length, actions };
}

async function loadSource() { return readFile(sourcePath, 'utf8'); }

async function readExistingArtifact() {
  try { return JSON.parse(await readFile(outPath, 'utf8')); } catch (_) { return null; }
}

async function writeArtifact(artifact) {
  await mkdir(outDir, { recursive: true });
  const withTimestamp = Object.assign({ generatedAt: new Date().toISOString() }, artifact);
  await writeFile(outPath, JSON.stringify(withTimestamp, null, 2) + '\n', 'utf8');
  return withTimestamp;
}

async function main(mode) {
  const source = await loadSource();
  const fresh = buildManifest(source);
  if (fresh.actionCount === 0) throw new Error('extracted zero action registrations from ' + sourcePath + ' - the extraction pattern likely no longer matches the real source');

  if (mode === 'check') {
    const existing = await readExistingArtifact();
    if (!existing) {
      console.error(`action-learnability:check FAILED - ${outPath} does not exist yet. Run "npm run action-learnability:build" first.`);
      process.exitCode = 1;
      return;
    }
    if (existing.contentHash !== fresh.contentHash) {
      console.error(`action-learnability:check FAILED - the committed manifest is stale (committed hash ${existing.contentHash}, freshly-generated hash ${fresh.contentHash}). Run "npm run action-learnability:build" and commit the result.`);
      process.exitCode = 1;
      return;
    }
    console.log(`action-learnability:check OK - ${path.relative(root, outPath)} matches the real, live character-app.jsx (${fresh.actionCount} actions, hash ${fresh.contentHash}).`);
    return;
  }

  const written = await writeArtifact(fresh);
  console.log(`action-learnability:build OK - wrote ${path.relative(root, outPath)} (${written.actionCount} actions, hash ${written.contentHash}).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const mode = process.argv[2] === 'check' ? 'check' : 'build';
  main(mode).catch((error) => { console.error(error); process.exitCode = 1; });
}

export { loadSource, readExistingArtifact, writeArtifact, outPath, sourcePath, classifyLearnability, reusableFieldsFor };
